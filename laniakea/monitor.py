# SPDX-License-Identifier: AGPL-3.0-or-later
"""Session-local analysis scheduling. Workers stage; this single controller alone publishes."""

import json
import copy
import hashlib
import math
import os
from pathlib import Path
import sys
import threading
import time
import uuid

from . import LaniakeaError,profiles
from .notifications import Notifications
from .owned_process import Process
from .workspace import WriterBusy,write_json


class ChecksConflict(ValueError):
    """The form describes different applied or pending settings; no work was changed."""


class ComparisonConflict(ValueError):
    """The requested live observation has been replaced; no page from another observation is returned."""


def comparison_data(value):
    """Bound advisory data before worker transport and again at controller admission."""
    if not isinstance(value,dict):raise ValueError('invalid input comparison')
    def text(item,limit=512):
        if not isinstance(item,str) or not item or len(item)>limit:raise ValueError('invalid comparison text')
        return item
    def count(item):
        if isinstance(item,bool) or not isinstance(item,int) or not 0<=item<=1000000:
            raise ValueError('invalid comparison count')
        return item
    total=count(value.get('total'));counts=value.get('counts');scope=value.get('scope');rows=value.get('rows')
    if not isinstance(counts,dict) or len(counts)>16 or sum(count(v) for v in counts.values())!=total:
        raise ValueError('invalid comparison totals')
    counts={text(k,80):v for k,v in counts.items()}
    if not isinstance(scope,dict) or not 1<=len(scope)<=8:raise ValueError('invalid comparison scope')
    domains={}
    for key,item in scope.items():
        if not isinstance(item,dict) or item.get('status') not in {
                'compared','not-monitored','not-recorded','scope-changed','unavailable'}:
            raise ValueError('invalid comparison domain')
        domains[text(key,64)]={'label':text(item.get('label'),100),'status':item['status']}
    if not isinstance(rows,list) or len(rows)>10000 or type(value.get('complete')) is not bool:
        raise ValueError('invalid comparison paths')
    clean=[];seen=set();observed={};size=0
    for item in rows:
        if not isinstance(item,dict):raise ValueError('invalid changed input')
        path=text(item.get('path'),4096);category=text(item.get('category'),80);change=item.get('change')
        if path in seen or category not in counts or change not in {'added','modified','removed'}:
            raise ValueError('invalid changed input identity')
        seen.add(path);observed[category]=observed.get(category,0)+1
        row={'path':path,'category':category,'change':change}
        if 'source' in item:
            location=item['source']
            if not isinstance(location,dict):raise ValueError('invalid input location')
            root=text(location.get('root'),80);relative=text(location.get('path'),4096)
            if Path(relative).is_absolute() or '..' in Path(relative).parts or ':' in relative or '\x00' in relative:
                raise ValueError('input location escapes its root')
            if change!='removed':row['source']={'root':root,'path':relative}
        size+=len(json.dumps(row,ensure_ascii=True,separators=(',',':')))
        if size<=2*1024*1024:clean.append(row)
    if len(rows)>total or any(observed[k]>counts[k] for k in observed):raise ValueError('comparison paths exceed totals')
    if value['complete'] and len(rows)!=total:raise ValueError('incomplete comparison claimed complete')
    lists={}
    for key in ('limits','guidance'):
        items=value.get(key,[])
        if not isinstance(items,list) or len(items)>8:raise ValueError('invalid comparison explanation')
        lists[key]=[text(item) for item in items]
    context=value.get('context','unknown')
    if context not in {'unknown','unchanged','changed'}:raise ValueError('invalid comparison context')
    return {'baseline':text(value.get('baseline'),100),'scope':domains,'rows':clean,'counts':counts,'total':total,
            'complete':value['complete'] and len(clean)==total,'context':context,**lists}


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
        self.started=time.monotonic();self.progress=None;self.progress_at=0

    def _progress(self):
        now=time.monotonic()
        if now-self.progress_at<.25:return
        self.progress_at=now
        try:
            with (self.root/'progress.json').open('rb') as stream:raw=stream.read(4097)
            if len(raw)>4096:raise ValueError('progress exceeded its size limit')
            value=json.loads(raw)
            if not isinstance(value,dict) or not isinstance(value.get('phase'),str) or len(value['phase'])>64 or \
                    not isinstance(value.get('label'),str) or len(value['label'])>160 or \
                    isinstance(value.get('seconds'),bool) or not isinstance(value.get('seconds'),(int,float)) or \
                    not math.isfinite(value['seconds']) or value['seconds']<0:
                raise ValueError('invalid progress summary')
            if ('completed' in value or 'total' in value) and (any(isinstance(value.get(k),bool) or
                    not isinstance(value.get(k),int) for k in ('completed','total')) or
                    not 0<=value['completed']<=value['total']<=1000000):raise ValueError('invalid progress counts')
            self.progress={k:value[k] for k in ('phase','label','seconds','completed','total') if k in value}
            self.progress['seconds']=round(now-self.started,2)
        except FileNotFoundError:pass
        except (OSError,ValueError) as error:self.progress={'phase':'status','label':'Progress unavailable','detail':str(error)}

    def poll(self):
        self._progress()
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
            if state:
                state.update(active=True,state='checking',phase='discover',due=self.clock(),
                             generation=state['generation']+1,error=None,failure=None,attempts=0)
                self.condition.notify_all();return
            self.states[target_id]={'active':True,'state':'checking','phase':'cleanup','generation':1,
                'due':self.clock(),'first':self.clock(),'reconcile':self.clock()+self.RECONCILE,
                'identity':None,'failure':None,'attempts':0,'watches':[],'recipe':None,
                'run':self.workspace.latest(target_id).name,'error':None,'degraded':None,'force':False,
                'after_cleanup':('discover','checking'),'requested':None,'revision':0,'checks':[],'replace':False}
            self.condition.notify_all()

    def pause(self,target_id):
        with self.condition:
            state=self.states.get(target_id)
            if state:
                state.update(active=False,state='paused',phase=None);state['generation']+=1
                self._watches();self.condition.notify_all()

    def configure(self,target_id,choices,run,revision):
        with self.condition:
            if self.stopping:raise LaniakeaError('viewer is stopping')
            entry=self.contexts.latest(target_id)
            profile=profiles.get(self.workspace.load(target_id)['profile'])
            proposed=profile.configure_checks(entry['recipe'],choices)
            state=self.states.get(target_id)
            latest=self.workspace.latest(target_id)
            if entry['run']!=run or not latest or latest.name!=run:
                raise ChecksConflict('The project changed. Reload the current check settings before applying.')
            if isinstance(revision,bool) or not isinstance(revision,int):raise ValueError('revision must be an integer')
            if state and state['requested']==proposed and state['active']:return
            if revision!=(state['revision'] if state else 0):
                raise ChecksConflict('Another tab changed check settings. Reload settings before applying.')
            self.activate(target_id);state=self.states[target_id]
            state.update(requested=proposed,recipe=None,revision=state['revision']+1,generation=state['generation']+1,
                         phase='discover',due=self.clock(),identity=None,failure=None,error=None,force=True,
                         replace=bool(self.current and self.current['target']==target_id))
            self.condition.notify_all()

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
                current=self.current if self.current and self.current['target']==entry['id'] else None
                progress=getattr(current['task'],'progress',None) if current and state and \
                    current['generation']==state['generation'] else None
                previous_work=None
                if current and state and state['active'] and not self.stopping and not state['replace'] and \
                        current['generation']!=state['generation']:
                    previous_work={'label':'Recheck queued; earlier checks are still running'}
                    started=getattr(current['task'],'started',None)
                    if type(started) in (int,float) and math.isfinite(started):
                        previous_work['seconds']=round(max(0,time.monotonic()-started),2)
                watch_errors=[error for spec,error in getattr(self.watcher,'failures',{}).items() if state and
                              any((os.path.normcase(s['path']),s['recursive'])==spec for s in state['watches'])]
                result.append({'id':entry['id'],'active':bool(state and state['active']),
                    'state':'stopping' if current and state and (not state['active'] or state['replace']) else
                            state['state'] if state else 'saved','error':state['error'] if state else None,
                    'degraded':watch_errors[0] if watch_errors else state['degraded'] if state else None,
                    'source_bodies_monitored':state.get('source_bodies_monitored') if state else None,
                    'ready':self.contexts.latest(entry['id']),
                    'requested':state['requested'] if state else None,'revision':state['revision'] if state else 0,
                    'checks':state['checks'] if state and state['checks'] else self.contexts.latest(entry['id']).get('checks',[]),
                    'progress':progress,'previous_work':previous_work,
                    'comparison':self._comparison_summary(state,watch_errors[0] if watch_errors else None)})
            return {'stopping':self.stopping,'targets':result,'error':self.error}

    def _accept_comparison(self,state,result,baseline,generation):
        value=result.get('comparison')
        try:
            if value is None:raise ValueError('No input comparison is available for this profile.')
            if isinstance(value,dict) and value.get('error'):raise ValueError(value['error'])
            value=comparison_data(value)
            if value['baseline']!=baseline:raise ValueError('Input comparison belongs to another run.')
            token=hashlib.sha256(json.dumps([result['identity'],value],sort_keys=True).encode()).hexdigest()
            state['comparison']={**value,'observation':token,'observed_at':time.time()}
            state['comparison_generation']=generation;state['comparison_error']=None
        except (ValueError,TypeError,KeyError) as error:
            if state.get('comparison',{}).get('baseline')!=baseline:state.pop('comparison',None)
            state['comparison_error']=str(error)[:512]

    def _comparison_summary(self,state,degraded=None):
        if state is None:return {'status':'unavailable','reason':'Change detection is not active for this target.'}
        if degraded is None:
            degraded=next((error for spec,error in getattr(self.watcher,'failures',{}).items()
                if any((os.path.normcase(s['path']),s['recursive'])==spec for s in state['watches'])),None)
        value=state.get('comparison')
        status='paused' if not state['active'] else 'unavailable' if state.get('comparison_error') or state.get('error') else \
               'degraded' if degraded or state.get('degraded') else 'checking' if not value or \
               state.get('comparison_generation')!=state['generation'] else 'current'
        reason=state.get('comparison_error') or state.get('error') or degraded or state.get('degraded')
        return {**copy.deepcopy({k:v for k,v in (value or {}).items() if k!='rows'}),
                'available':len(value['rows']) if value else 0,'status':status,**({'reason':reason} if reason else {})}

    def changes(self,query):
        if not isinstance(query,dict) or set(query)-{'target','run','observation','cursor','limit'} or \
                any(not isinstance(query.get(k),str) or not 0<len(query[k])<=100 for k in ('target','run','observation')):
            raise ValueError('expected target, run and input comparison identity')
        cursor=query.get('cursor',0);limit=query.get('limit',50)
        if type(cursor) is not int or not 0<=cursor<=1000000 or type(limit) is not int or not 1<=limit<=100:
            raise ValueError('invalid changed-input page')
        with self.condition:
            state=self.states.get(query['target']);value=state.get('comparison') if state else None
            if not value or value['baseline']!=query['run'] or value['observation']!=query['observation']:
                raise ComparisonConflict('Input comparison changed or is unavailable; refresh Checks.')
            if cursor>len(value['rows']):raise ValueError('changed-input cursor exceeds available paths')
            end=min(cursor+limit,len(value['rows']))
            return {**self._comparison_summary(state),'items':copy.deepcopy(value['rows'][cursor:end]),
                    'cursor':cursor,'next':end if end<len(value['rows']) else None}

    def _start(self,target_id,state):
        phase=state['phase'];lease=None
        if phase in {'stage','cleanup'}:
            lease=self.workspace.extraction_lock(target_id)
            try:lease.__enter__()
            except WriterBusy:
                # Lock refusal is a known writer, not an analyzer failure. No child or tight retry is created.
                state.update(state='waiting for writer',due=self.clock()+2);return
        recipe=self.contexts.protected(target_id) if phase=='cleanup' else \
            state['requested'] if phase=='discover' else state['recipe']
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
        target_id = job['target']
        state = self.states[target_id]
        now = self.clock()
        result = response.get('result', {})
        if self.stopping or not state['active']:
            self._discard(target_id, result)
            return
        changed = (job['generation'] != state['generation'] or
                   self.workspace.latest(target_id).name != job['run'])
        if changed and job['phase']!='discover':
            self._discard(target_id, result)
            self._dirty(state)
            return
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
            state.update(recipe=result['recipe'],watches=result['watches'],checks=result.get('checks',[]),phase='probe',due=now)
            self._watches()
        elif job['phase']=='prepare':
            self.contexts.admit(target_id,self.workspace.target_dir(target_id)/'runs'/result['run'],result['view'],
                                validation=result['validation'])
            state.update(run=result['run'],identity=None,failure=None,phase='discover',due=now)
        elif job['phase']=='probe':
            identity=result['identity'];previous=state['identity']
            state.update(watches=result['watches'],source_bodies_monitored=result['source_bodies_monitored'],degraded=result.get('cache_warning'),
                         reconcile=now+self.RECONCILE)
            self._accept_comparison(state,result,job['run'],job['generation'])
            self._watches()
            force=state['force'];state['force']=False
            if not force and result.get('previous_failure'):
                state.update(identity=identity,failure=identity,state='retry required',error=result['previous_failure']['error'])
                for row in state['checks']:
                    if row['id']=='native':row.update(status='failed',code='unchanged_failure',detail='Previous attempt failed; Retry to run again.')
                return
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
            followup=('discover','checking') if result.get('checks_pending') else (None,'fresh')
            state.update(run=run.name,identity=result['identity'],failure=None,attempts=0,state='fresh',requested=None,
                         checks=result.get('checks',state['checks']),revision=state['revision']+1,
                         degraded=result.get('cache_warning',state['degraded']),
                         reconcile=now+self.RECONCILE,phase='cleanup',due=now,after_cleanup=followup)
            self._accept_comparison(state,result,run.name,job['generation'])
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
                if self.stopping or not state['active'] or state['replace']:
                    self._close_current()
                    state['replace']=False
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
                    for key in ('comparison','comparison_generation','comparison_error'):state.pop(key,None)
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
