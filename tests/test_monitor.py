# SPDX-License-Identifier: AGPL-3.0-or-later
"""Deterministic scheduling and publication checks with the actual profile and read contexts."""

from pathlib import Path
import tempfile
import unittest

from laniakea import map_index,pipeline
from laniakea.monitor import Monitor,relevant
from laniakea.monitor_worker import execute
from laniakea.server import target_index
from laniakea.snapshots import Snapshots
from laniakea.unreal import target_fields
from laniakea.workspace import Workspace
from support import copy_sample,fake_engine,recorded_ubt


class Watcher:
    def __init__(self,callback):self.callback=callback;self.specs=[]
    def replace(self,specs):self.specs=set(specs)
    def stop(self,_timeout):pass


class Scheduler(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory();self.addCleanup(self.temporary.cleanup)
        base=Path(self.temporary.name);self.project=copy_sample(base);self.engine=fake_engine(base)
        self.workspace=Workspace(base/'workspace')
        target=self.workspace.register('sample',target_fields(self.project/'SampleProject.uproject',self.engine))
        self.recording=recorded_ubt(self.project,self.engine);self.recording.__enter__()
        self.addCleanup(lambda:self.recording.__exit__(None,None,None))
        self.manual,_=pipeline.extract(self.workspace,target,health_options={'mode':'off'})
        with self.workspace.extraction_lock('sample'):
            candidate=execute(self.workspace,'sample','stage')
            self.run=self.workspace.commit_run('sample',self.workspace.target_dir('sample')/'runs'/candidate['candidate'])
        index=target_index(self.workspace,scan=False)
        views={'sample':map_index.ensure(self.workspace,'sample',self.run)}
        self.contexts=Snapshots(self.workspace,index,views);self.now=0;self.started=[];self.targets_started=[];self.responses=[];self.hold=False
        owner=self
        class Task:
            def __init__(self,workspace,target,operation,recipe):
                owner.started.append(operation);self.closed=False
                owner.targets_started.append(target)
                if owner.responses:self.result=owner.responses.pop(0)
                else:
                    try:self.result={'status':'completed','result':execute(workspace,target,operation,recipe)}
                    except Exception as error:self.result={'status':'failed','error':str(error)}
            def poll(self):return None if owner.hold else self.result
            def close(self):self.closed=True
        self.monitor=Monitor(self.workspace,self.contexts,task_factory=Task,clock=lambda:self.now,notifications=Watcher)
        self.addCleanup(self.monitor.stop)

    def settle(self):
        for _ in range(15):
            self.monitor.step()
            if not self.monitor.current and not self.monitor.states['sample']['phase']:return
        self.fail('scheduler failed to settle')

    def dirty(self):
        state=self.monitor.states['sample']
        with self.monitor.condition:self.monitor._dirty(state)
        self.now+=2

    def test_baseline_noops_touch_filtering_and_coalesced_change_publish_once(self):
        self.monitor.activate('sample');self.settle()
        self.assertEqual(self.started,['cleanup','discover','probe']);self.assertEqual(self.monitor.status()['targets'][0]['state'],'fresh')
        source_spec=next(s for s in self.monitor.states['sample']['watches'] if Path(s['path']).name.casefold()=='source')
        self.assertFalse(relevant(source_spec,'Body.cpp'));self.assertTrue(relevant(source_spec,'Module.Build.cs'))
        self.dirty();self.settle();self.assertNotIn('stage',self.started)
        rule=self.project/'Source/SampleProject/SampleProject.Build.cs'
        rule.write_bytes(rule.read_bytes()+b'\n// changed\n')
        for _ in range(20):self.dirty()
        self.settle();self.assertEqual(self.started.count('stage'),1)
        self.assertNotEqual(self.workspace.latest('sample'),self.run)
        self.assertEqual(self.contexts.latest('sample')['run'],self.workspace.latest('sample').name)
        self.assertEqual(len(self.monitor.watcher.specs),len(set(self.monitor.watcher.specs)))

    def test_superseded_candidate_and_pause_never_publish(self):
        self.monitor.activate('sample');self.settle()
        rule=self.project/'Source/SampleProject/SampleProject.Build.cs';rule.write_bytes(rule.read_bytes()+b'\n// changed\n')
        self.dirty();self.monitor.step();self.monitor.step();self.monitor.step()
        self.assertEqual(self.monitor.current['phase'],'stage')
        self.dirty();self.monitor.step()
        self.assertEqual(self.workspace.latest('sample'),self.run)
        self.monitor.pause('sample');self.monitor.step()
        self.assertEqual(self.workspace.latest('sample'),self.run)
        self.assertEqual(self.monitor.status()['targets'][0]['state'],'paused')

    def test_contention_retries_are_bounded_and_polling_does_not_restart_failures(self):
        self.monitor.activate('sample');self.settle()
        state=self.monitor.states['sample'];state.update(phase='stage',due=self.now,identity='same')
        self.responses=[{'status':'busy','error':'external build'} for _ in range(4)]
        self.monitor.step()
        for delay in self.monitor.RETRIES:
            self.monitor.step();self.assertEqual(state['state'],'waiting for external build')
            self.now+=delay;self.monitor.step()
        self.monitor.step();self.monitor.step();self.assertEqual(state['state'],'retry required')
        self.assertIsNone(state['phase']);self.assertEqual(self.started.count('stage'),4)
        self.assertEqual(self.workspace.latest('sample'),self.run)
        self.monitor.retry('sample');self.assertEqual(state['attempts'],0)
        self.settle();self.assertEqual(self.started.count('stage'),5)

    def test_repeated_edits_bound_automatic_history_and_preserve_manual_run_and_user_stores(self):
        self.monitor.activate('sample');self.settle()
        target_dir=self.workspace.target_dir('sample')
        from laniakea.workspace import write_json
        user=target_dir/'layouts/entry.json';write_json(user,{'protected':'positions'})
        protected=user.read_bytes()
        rule=self.project/'Source/SampleProject/SampleProject.Build.cs'
        for number in range(7):
            rule.write_bytes(rule.read_bytes()+f'\n// edit {number}\n'.encode())
            self.dirty();self.settle()
        self.assertTrue(self.run.is_dir());self.assertTrue(self.manual.is_dir());self.assertEqual(user.read_bytes(),protected)
        automatic=[path for path in (target_dir/'runs').iterdir() if (path/'automatic.json').is_file()]
        self.assertLessEqual(len(automatic),3)
        self.assertLessEqual(len(self.contexts.contexts),3)

    def test_event_loss_marks_unknown_and_manual_publication_prepares_new_pinned_context(self):
        self.monitor.activate('sample');self.settle()
        self.monitor._event(None,[],'overflow')
        self.assertEqual(self.monitor.status()['targets'][0]['degraded'],'overflow')
        self.now+=2;self.settle()
        target=self.workspace.load('sample');run,_=pipeline.extract(self.workspace,target,health_options={'mode':'off'})
        self.monitor.step();self.assertEqual(self.monitor.current['phase'],'prepare')
        self.monitor.step();self.assertEqual(self.contexts.latest('sample')['run'],run.name)
        self.settle();self.assertEqual(self.contexts.latest('sample')['run'],self.workspace.latest('sample').name)
        self.assertTrue(run.is_dir())
        self.assertIn(self.contexts.baseline['sample'],self.contexts.contexts)

    def test_history_is_inactive_until_requested_and_multiple_active_targets_make_progress(self):
        target=self.workspace.register('other',{**self.workspace.load('sample'),'id':'other'})
        run,_=pipeline.extract(self.workspace,target,health_options={'mode':'off'})
        index=target_index(self.workspace,scan=False)
        views={entry['id']:map_index.ensure(self.workspace,entry['id'],self.workspace.latest(entry['id'])) for entry in index}
        contexts=Snapshots(self.workspace,index,views)
        self.monitor.stop();self.monitor=Monitor(self.workspace,contexts,task_factory=self.monitor.task_factory,
            clock=lambda:self.now,notifications=Watcher);self.addCleanup(self.monitor.stop)
        self.monitor.activate('sample');self.settle()
        self.assertNotIn('other',self.targets_started)
        self.monitor.activate('other')
        for _ in range(20):
            self.dirty();self.monitor.step()
            if self.monitor.states['other']['state']=='fresh':break
        self.assertEqual(self.monitor.states['other']['state'],'fresh')
        self.assertIn('other',self.targets_started)

    def test_active_context_survives_cleanup_and_expires_only_after_its_reader_finishes(self):
        self.monitor.activate('sample');self.settle()
        rule=self.project/'Source/SampleProject/SampleProject.Build.cs'
        def changed():
            rule.write_bytes(rule.read_bytes()+b'\n// next generation\n');self.dirty();self.settle()
        changed();entry=self.contexts.latest('sample');address=entry['data_url']+'manifest.json'
        with self.contexts.route(address) as (context,path):
            run=context.run
            for _ in range(4):changed()
            self.assertTrue(run.is_dir());self.assertEqual(context.readers,1)
            self.assertEqual(context.entry['run'],run.name)
        with self.contexts.route(address) as (expired,path):self.assertIs(expired,False)
        changed();self.assertFalse(run.exists());self.assertTrue(self.run.is_dir())

    def test_cleanup_reclaims_cancelled_automatic_index_work_but_preserves_manual_work(self):
        from laniakea.automatic_history import prune
        from laniakea.workspace import writer_lock
        views=self.workspace.target_dir('sample')/'views'
        key='a'*64+'-'+'b'*16
        abandoned=views/(key+'.auto-partial-'+'c'*32);abandoned.mkdir()
        manual=views/(key+'.partial-'+'d'*32);manual.mkdir()
        protected=self.contexts.protected('sample')
        with writer_lock(views/'writer.lock','busy'):
            result=prune(self.workspace,'sample',protected)
            self.assertTrue(result.get('deferred'));self.assertTrue(abandoned.is_dir())
        prune(self.workspace,'sample',protected)
        self.assertFalse(abandoned.exists());self.assertTrue(manual.is_dir())

    def test_browser_deferred_context_is_retained_until_its_heartbeat_expires(self):
        from unittest.mock import patch
        import time
        self.monitor.activate('sample');self.settle()
        rule=self.project/'Source/SampleProject/SampleProject.Build.cs'
        def change():
            rule.write_bytes(rule.read_bytes()+b'\n// next\n');self.dirty();self.settle()
        change();run=self.workspace.latest('sample');identity=self.contexts.latest('sample')['map_identity']
        self.assertTrue(self.contexts.touch('sample',run.name,'browser',identity))
        for _ in range(4):change()
        self.assertTrue(run.exists());self.assertIn(('sample',run.name,identity),self.contexts.contexts)
        with patch('laniakea.snapshots.time.monotonic',return_value=time.monotonic()+121):
            self.contexts.protected('sample')
        self.assertNotIn(('sample',run.name,identity),self.contexts.contexts)

    def test_each_tab_releases_its_old_context_without_releasing_another_tab(self):
        self.monitor.activate('sample');self.settle()
        rule=self.project/'Source/SampleProject/SampleProject.Build.cs'
        def change():
            rule.write_bytes(rule.read_bytes()+b'\n// next\n');self.dirty();self.settle()
        change();run=self.workspace.latest('sample');identity=self.contexts.latest('sample')['map_identity']
        self.contexts.touch('sample',run.name,'one',identity);self.contexts.touch('sample',run.name,'two',identity)
        for _ in range(4):change()
        latest=self.workspace.latest('sample');new_identity=self.contexts.latest('sample')['map_identity']
        self.contexts.touch('sample',latest.name,'one',new_identity);self.assertIn(('sample',run.name,identity),self.contexts.contexts)
        self.contexts.touch('sample',latest.name,'two',new_identity);self.assertNotIn(('sample',run.name,identity),self.contexts.contexts)


if __name__=='__main__':unittest.main()
