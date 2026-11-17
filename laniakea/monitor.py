# SPDX-License-Identifier: AGPL-3.0-or-later
"""Session-local analysis scheduling. Workers stage; this single controller alone publishes."""

import json
import os
from pathlib import Path
import sys
import threading
import time
import uuid

from . import LaniakeaError
from .notifications import Notifications
from .owned_process import Process
from .workspace import WriterBusy,write_json


def relevant(spec,name):
    path=Path(name);lower=name.casefold();first=path.parts[0].casefold()
    return lower in spec['names'] or first in spec['names'] or any(lower.endswith(s) for s in spec['suffixes']) or \
        spec['directories'] and not path.suffix


class Task:
    def __init__(self,workspace,target,operation,recipe=None):
        self.root=workspace.root/'tmp/monitor'/target/uuid.uuid4().hex
        self.root.mkdir(parents=True)
        request=self.root/'request.json'
        write_json(request,{'workspace':str(workspace.root),'target':target,'operation':operation,'recipe':recipe})
        self.process=Process([sys.executable,'-m','laniakea.monitor_worker',str(request)],self.root/'worker.log',
                             cwd=Path(__file__).resolve().parent.parent)

    def poll(self):
        code=self.process.poll()
        if code is None:return None
        try:
            with (self.root/'result.json').open('rb') as stream:raw=stream.read(16*1024*1024+1)
            if len(raw)>16*1024*1024:raise ValueError('background result exceeded size limit')
            result=json.loads(raw)
            if result.get('status') not in {'completed','busy','failed'}:raise ValueError('invalid background result')
            if code and result['status']=='completed':raise ValueError('background worker failed after writing its result')
            return result
        except (OSError,ValueError) as error:
            return {'status':'failed','error':f'background worker exited {code}: {error}; see {self.root}'}

    def close(self):self.process.close()


class Monitor:
    QUIET=.75
    MAX_BATCH=5
    RECONCILE=60
    RETRIES=(2,5,10)

    def __init__(self,workspace,contexts,*,task_factory=Task,clock=time.monotonic,notifications=Notifications):
        self.workspace=workspace;self.contexts=contexts;self.task_factory=task_factory;self.clock=clock
        self.condition=threading.Condition(threading.RLock());self.states={};self.current=None
        self.stopping=False;self.error=None;self.cleanup_error=None;self.cursor=0
        self.watcher=notifications(self._event)
        self.thread=None

    def activate(self,target_id):
        with self.condition:
            if self.stopping:raise LaniakeaError('viewer is stopping')
            if not any(entry['id']==target_id for entry in self.contexts.index):
                raise ValueError('target is not a registered saved map')
            state=self.states.get(target_id)
            if state and state['active']:return
            self.states[target_id]={'active':True,'state':'checking','phase':'cleanup','generation':1,
                'due':self.clock(),'first':self.clock(),'reconcile':self.clock()+self.RECONCILE,
                'identity':None,'failure':None,'attempts':0,'watches':[],'recipe':None,
                'run':self.workspace.latest(target_id).name,'error':None,'degraded':None,'force':False,
                'after_cleanup':('discover','checking')}
            self.condition.notify_all()

    def pause(self,target_id):
        with self.condition:
            state=self.states.get(target_id)
            if state:
                state.update(active=False,state='paused',phase=None);state['generation']+=1
                self._watches();self.condition.notify_all()

    def retry(self,target_id):
        with self.condition:
            state=self.states.get(target_id)
            if not state or not state['active']:raise ValueError('target is not monitored')
            state.update(failure=None,attempts=0,error=None,phase='discover',due=self.clock(),state='checking',force=True)
            state['generation']+=1;self.condition.notify_all()

    def request_stop(self):
        with self.condition:
            self.stopping=True
            for state in self.states.values():state.update(active=False,state='stopping',phase=None)
            self.condition.notify_all()

    def _dirty(self,state,*,lost=None):
        now=self.clock();state['generation']+=1
        if state['phase'] is None:state['first']=now
        state.update(phase='discover',due=min(now+self.QUIET,state['first']+self.MAX_BATCH),state='pending')
        if lost:state['degraded']=lost
        self.condition.notify_all()

    def _event(self,spec,names,failure):
        with self.condition:
            if self.stopping:return
            for state in self.states.values():
                if not state['active']:continue
                matched=[s for s in state['watches'] if spec is None or
                         (os.path.normcase(s['path']),s['recursive'])==spec]
                if matched and (failure or any(relevant(s,name) for s in matched for name in names)):
                    self._dirty(state,lost=failure)

    def _watches(self):
        self.watcher.replace([(s['path'],s['recursive'],tuple(s.get('identity',()))) for state in self.states.values() if state['active']
                              for s in state['watches']])

    def status(self):
        with self.condition:
            result=[]
            for entry in self.contexts.index:
                state=self.states.get(entry['id'])
                watch_errors=[error for spec,error in getattr(self.watcher,'failures',{}).items() if state and
                              any((os.path.normcase(s['path']),s['recursive'])==spec for s in state['watches'])]
                result.append({'id':entry['id'],'active':bool(state and state['active']),
                    'state':state['state'] if state else 'saved','error':state['error'] if state else None,
                    'degraded':watch_errors[0] if watch_errors else state['degraded'] if state else None,
                    'source_bodies_monitored':state.get('source_bodies_monitored') if state else None,
                    'ready':self.contexts.latest(entry['id'])})
            return {'stopping':self.stopping,'targets':result,'error':self.error}

    def _start(self,target_id,state):
        phase=state['phase'];lease=None
        if phase in {'stage','cleanup'}:
            lease=self.workspace.extraction_lock(target_id)
            try:lease.__enter__()
            except WriterBusy:
                # Lock refusal is a known writer, not an analyzer failure. No child or tight retry is created.
                state.update(state='waiting for writer',due=self.clock()+2);return
        recipe=self.contexts.protected(target_id) if phase=='cleanup' else state['recipe']
        try:task=self.task_factory(self.workspace,target_id,phase,recipe)
        except BaseException:
            if lease:lease.__exit__(*sys.exc_info())
            raise
        self.current={'target':target_id,'phase':phase,'task':task,'generation':state['generation'],
                      'run':state['run'],'lease':lease}
        state.update(phase=None,state='updating' if phase=='stage' else 'checking')

    def _discard(self,target_id,result):
        candidate=result.get('candidate')
        if candidate and Path(candidate).name==candidate and candidate.endswith('.partial'):
            path=self.workspace.target_dir(target_id)/'runs'/candidate
            if path.exists():self.workspace.fail_run(path)

    def _close_current(self):
        job=self.current
        if job is None:return
        try:
            job['task'].close()
            if job['lease']:job['lease'].__exit__(None,None,None)
        except BaseException as error:
            self.cleanup_error=str(error)
            raise
        self.current=None

    def _finish(self,job,response):
        target_id=job['target'];state=self.states[target_id];now=self.clock()
        result=response.get('result',{})
        if self.stopping or not state['active']:
            self._discard(target_id,result);return
        changed=job['generation']!=state['generation'] or self.workspace.latest(target_id).name!=job['run']
        if changed and job['phase']!='discover':
            self._discard(target_id,result);self._dirty(state);return
        if response['status']=='busy':
            attempt=state['attempts'];state['attempts']+=1
            state.update(state='waiting for external build',error=response.get('error'))
            if attempt<len(self.RETRIES):state.update(phase='stage',due=now+self.RETRIES[attempt])
            else:state.update(state='retry required',failure=state['identity'],phase='cleanup',due=now,
                              after_cleanup=(None,'retry required'))
            return
        if response['status']!='completed':
            state.update(state='failed',error=response.get('error','background analysis failed'),failure=state['identity'])
            if job['phase']=='stage':state.update(phase='cleanup',due=now,after_cleanup=(None,'failed'))
            return
        if job['phase']!='cleanup':state['error']=None
        if job['phase']=='discover':
            state.update(recipe=result['recipe'],watches=result['watches'],phase='probe',due=now)
            self._watches()
        elif job['phase']=='prepare':
            self.contexts.admit(target_id,self.workspace.target_dir(target_id)/'runs'/result['run'],result['view'],
                                validation=result['validation'])
            state.update(run=result['run'],identity=None,failure=None,phase='discover',due=now)
        elif job['phase']=='probe':
            identity=result['identity'];previous=state['identity']
            state.update(watches=result['watches'],source_bodies_monitored=result['source_bodies_monitored'],degraded=None,
                         reconcile=now+self.RECONCILE)
            self._watches()
            force=state['force'];state['force']=False
            if not force and state['failure']==identity:
                state.update(state='retry required');return
            if not force and (identity==previous or previous is None and not result['needs_initial_refresh'] and \
                    result.get('previous_identity')==identity):
                state.update(identity=identity,state='fresh');return
            state.update(identity=identity,failure=None,attempts=0,phase='stage',due=now,state='pending')
        elif job['phase']=='stage':
            candidate=result['candidate']
            if Path(candidate).name!=candidate or not candidate.endswith('.partial'):
                raise LaniakeaError('worker returned an invalid candidate')
            partial=self.workspace.target_dir(target_id)/'runs'/candidate
            # Prepare the canonical context before the one authoritative commit; Review remains lazy and independent.
            prepared=self.contexts.prepare(target_id,partial,result['view'],result['validation'])
            run=self.workspace.commit_run(target_id,partial)
            self.contexts.admit(target_id,run,result['view'],prepared=prepared)
            state.update(run=run.name,identity=result['identity'],failure=None,attempts=0,state='fresh',
                         reconcile=now+self.RECONCILE,phase='cleanup',due=now,after_cleanup=(None,'fresh'))
        elif job['phase']=='cleanup':
            if result.get('deferred'):
                state.update(state='waiting for read index',phase='cleanup',due=now+2)
            else:
                phase,status=state['after_cleanup'];state.update(state=status,phase=phase,due=now)

    def step(self):
        """One bounded scheduler turn; all source/copy/compiler/index work lives in owned workers."""
        with self.condition:
            if self.current:
                job=self.current;state=self.states[job['target']]
                if self.stopping or not state['active']:
                    self._close_current()
                else:
                    response=job['task'].poll()
                    if response is not None:
                        try:self._finish(job,response)
                        finally:self._close_current()
            if self.stopping:return
            now=self.clock()
            for target_id,state in self.states.items():
                if not state['active']:continue
                latest=self.workspace.latest(target_id)
                if latest and latest.name!=state['run']:
                    state.update(phase='prepare',due=now)
                    if not self.current:state['run']=latest.name
                if not state['phase'] and now>=state['reconcile']:
                    state.update(phase='discover',due=now,reconcile=now+self.RECONCILE)
            if self.current:return
            eligible=[(key,s) for key,s in self.states.items() if s['active'] and s['phase'] and s['due']<=now]
            if eligible:
                eligible.sort(key=lambda item:item[0]);chosen=eligible[self.cursor%len(eligible)];self.cursor+=1
                self._start(*chosen)

    def start(self):
        def run():
            try:
                while True:
                    self.step()
                    with self.condition:
                        if self.stopping:break
                        self.condition.wait(.1)
            except BaseException as error:
                with self.condition:self.error=str(error);self.request_stop()
            finally:
                with self.condition:
                    try:self._close_current()
                    except BaseException as error:
                        self.error=f'{self.error or "monitor stopped"}; cleanup not confirmed: {error}'
                try:self.watcher.stop(3)
                except BaseException as error:
                    with self.condition:
                        self.cleanup_error=str(error)
                        self.error=f'{self.error or "monitor stopped"}; notification cleanup not confirmed: {error}'
        self.thread=threading.Thread(target=run,name='laniakea-monitor',daemon=True);self.thread.start()

    def stop(self,timeout=8):
        started=time.monotonic();self.request_stop()
        if self.thread:
            self.thread.join(max(0,timeout-(time.monotonic()-started)))
            if self.thread.is_alive():raise TimeoutError('background analysis did not stop')
        if self.current:self.step()
        self.watcher.stop(max(.1,timeout-(time.monotonic()-started)))
        if self.cleanup_error:raise TimeoutError(f'background cleanup was not confirmed: {self.cleanup_error}')
