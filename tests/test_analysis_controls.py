# SPDX-License-Identifier: AGPL-3.0-or-later
"""Requested checks, resolved acquisition and published evidence have independent meanings."""

import contextlib
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from laniakea import cli,pipeline,schema,LaniakeaError
from laniakea.monitor_worker import execute
from laniakea.unreal import target_fields
from laniakea.workspace import Workspace,read_json,write_json
from support import copy_sample,fake_engine,recorded_ubt


class AnalysisControls(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory();self.addCleanup(self.temporary.cleanup)
        base=Path(self.temporary.name);self.project=copy_sample(base);self.engine=fake_engine(base)
        self.workspace=Workspace(base/'workspace')
        self.target=self.workspace.propose('sample',target_fields(self.project/'SampleProject.uproject',self.engine))

    def build(self,*options):
        with recorded_ubt(self.project,self.engine),contextlib.redirect_stdout(io.StringIO()):
            result=cli.main(['--workspace',str(self.workspace.root),'build',str(self.project/'SampleProject.uproject'),
                             '--engine',str(self.engine),'--name','sample',*options])
        self.assertEqual(result,0)
        return self.workspace.request('sample')['recipe']

    def test_first_build_records_recommended_intent_without_claiming_native_evidence(self):
        recipe=self.build()
        self.assertEqual(recipe.get('checks'),{'native':'auto','duplication':'auto'})
        self.assertFalse(recipe['symbols'])

    def test_historical_off_request_is_preserved_without_manufacturing_new_consent(self):
        with recorded_ubt(self.project,self.engine):pipeline.extract(self.workspace,self.target,health_options={'mode':'off'})
        recipe=self.workspace.request('sample')['recipe']
        result=execute(self.workspace,'sample','discover')
        self.assertEqual(result['recipe'],recipe)
        self.assertEqual(self.build(),recipe)

    def test_normal_build_keeps_legacy_required_native_intent(self):
        self.build('--health','off')
        recipe=self.workspace.request('sample')['recipe'];recipe.pop('checks');recipe['symbols']=True
        arguments=cli.parser().parse_args(['build','sample'])
        with patch.object(cli,'_target',return_value=self.target),patch.object(self.workspace,'request',return_value={'recipe':recipe}), \
                patch.object(pipeline,'extract',side_effect=RuntimeError('capture options')) as extract, \
                contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(RuntimeError,'capture options'):cli._extract(arguments,self.workspace)
        self.assertTrue(extract.call_args.kwargs['symbols']);self.assertIsNone(extract.call_args.kwargs['checks'])

    def test_build_preserves_saved_health_scope_threshold_and_budget_when_not_overridden(self):
        self.build('--health','off','--health-scope','Source','--health-minimum-tokens','75','--health-heap-mib','2048')
        previous=self.workspace.request('sample')['recipe']['health']
        recipe=self.build()
        self.assertEqual(recipe['health'],previous)

    def test_progress_remains_live_during_indeterminate_phases_and_rejects_unbounded_or_false_counts(self):
        from laniakea.monitor import Task
        task=Task.__new__(Task);task.root=self.workspace.root;task.started=10;task.progress=None;task.progress_at=0
        path=task.root/'progress.json'
        write_json(path,{'phase':'duplication','label':'Checking duplicated code','seconds':1})
        with patch('laniakea.monitor.time.monotonic',return_value=50):task._progress()
        self.assertEqual(task.progress['seconds'],40)
        for data in ({'phase':'native','label':'Compiling','seconds':1,'completed':3,'total':2},'x'*4097):
            if isinstance(data,dict):write_json(path,data)
            else:path.write_text(data)
            task.progress_at=0
            with patch('laniakea.monitor.time.monotonic',return_value=60):task._progress()
            self.assertEqual(task.progress['label'],'Progress unavailable')

    def test_new_native_auto_explains_missing_tools_without_starting_compiler_work(self):
        self.build('--health','off')
        with patch('laniakea.unreal.compiler.extract',side_effect=AssertionError('native extraction in discovery')):
            result=execute(self.workspace,'sample','discover')
        native=next((row for row in result.get('checks',[]) if row['id']=='native'),{})
        self.assertEqual(native.get('status'),'unavailable')
        self.assertEqual(native.get('code'),'tools_missing')
        self.assertFalse(result['recipe']['symbols'])

    def test_coverage_rejects_unproved_completion_and_explains_resource_refusal(self):
        from laniakea.unreal import checks
        self.build('--health','off');manifest=read_json(self.workspace.latest('sample')/'manifest.json')
        manifest['coverage']['acquisition']['native'].update(status='completed',code='complete')
        with self.assertRaisesRegex(LaniakeaError,'native acquisition'):schema.validate(manifest,'manifest')
        manifest['coverage']['acquisition'].pop('native')
        outcome=manifest['coverage']['acquisition']['source-duplication']
        outcome.update(status='unavailable',code='resource_headroom')
        recipe=checks.configure(self.workspace.request('sample')['recipe'],{'native':'off','duplication':'auto'})
        row=checks.rows(manifest,recipe)[2]
        self.assertEqual(row['status'],'unavailable');self.assertIn('insufficient memory',row['detail'])
        outcome.pop('prefixes')
        with self.assertRaisesRegex(LaniakeaError,'collection scope'):schema.validate(manifest,'manifest')

    def test_native_auto_requires_a_usable_successful_receipt_without_building(self):
        self.build('--health','off')
        with patch('laniakea.unreal.tools.load',return_value={'manifest':{}}), \
                patch('laniakea.unreal.ubt.query_targets',side_effect=AssertionError('build/query in eligibility')):
            result=execute(self.workspace,'sample','discover')
            self.assertFalse(result['recipe']['symbols']);self.assertEqual(result['checks'][1]['code'],'build_required')
            from test_build_context import BuildContext
            BuildContext.receipt(self,'SampleProjectEditor','Development')
            result=execute(self.workspace,'sample','discover')
        self.assertTrue(result['recipe']['symbols']);self.assertEqual(result['checks'][1]['code'],'ready')

    def test_explicit_native_on_stays_required_and_failed_probe_does_not_apply_choices(self):
        self.build('--health','off');previous=self.workspace.latest('sample')
        from laniakea.unreal import checks
        proposed=checks.configure(self.workspace.request('sample')['recipe'],{'native':'on','duplication':'off'})
        with patch('laniakea.unreal.tools.load',return_value=None):
            result=execute(self.workspace,'sample','discover',proposed)
            self.assertTrue(result['recipe']['symbols'])
            with self.assertRaisesRegex(LaniakeaError,'native tools missing'):
                execute(self.workspace,'sample','probe',result['recipe'])
        self.assertEqual(self.workspace.latest('sample'),previous)
        self.assertEqual(self.workspace.request('sample')['recipe']['checks']['native'],'auto')

    def test_unavailable_auto_cannot_downgrade_previously_recorded_native_map(self):
        self.build('--health','off');run=self.workspace.latest('sample')
        from laniakea.unreal import checks
        manifest=read_json(run/'manifest.json');manifest['sources'].append({'id':'compiler'})
        with patch('laniakea.unreal.tools.load',return_value=None):
            recipe,_=checks.resolve(self.workspace,self.target,manifest,self.workspace.request('sample')['recipe'])
        self.assertTrue(recipe['symbols'])

    def test_auto_failure_is_reused_after_restart_but_source_edits_and_explicit_retry_can_run(self):
        from test_build_context import BuildContext
        from laniakea import AnalysisBusy
        from laniakea.unreal.compiler import NativeDiagnosticsError
        self.build('--health','off');BuildContext.receipt(self,'SampleProjectEditor','Development')
        published=self.workspace.latest('sample')
        source=self.project/'Source/SampleProject/SampleProject.cpp'
        from laniakea.unreal.tools import digest
        with patch('laniakea.unreal.tools.load',return_value={'manifest':{}}):
            recipe=execute(self.workspace,'sample','discover')['recipe']
            before=execute(self.workspace,'sample','probe',recipe)
            failure=NativeDiagnosticsError('native failed',{str(source):digest(source)},self.project)
            with self.workspace.extraction_lock('sample'),patch.object(pipeline,'stage',side_effect=failure):
                with self.assertRaisesRegex(LaniakeaError,'native failed'):execute(self.workspace,'sample','stage',recipe)
            self.assertEqual(self.workspace.latest('sample'),published)
            restarted=execute(Workspace(self.workspace.root),'sample','probe',recipe)
            self.assertEqual(restarted['previous_failure']['error'],'native failed')
            with patch.dict(os.environ,{'CL':'/DSAMPLE_CHANGED_CONTEXT=1'}):
                self.assertIsNone(execute(self.workspace,'sample','probe',recipe)['previous_failure'])
            source=self.project/'Source/SampleProject/SampleProject.cpp'
            source.write_bytes(source.read_bytes()+b'\n// changed input\n')
            changed=execute(self.workspace,'sample','probe',recipe)
            self.assertNotEqual(changed['identity'],before['identity']);self.assertIsNone(changed['previous_failure'])
            with self.workspace.extraction_lock('sample'),patch.object(pipeline,'stage',side_effect=AnalysisBusy('external build')):
                with self.assertRaises(AnalysisBusy):execute(self.workspace,'sample','stage',recipe)
            self.assertIsNone(execute(self.workspace,'sample','probe',recipe)['previous_failure'])

    def test_unclassified_failures_and_superseded_diagnostics_are_not_reused(self):
        from test_build_context import BuildContext
        from laniakea.unreal import checks
        from laniakea.unreal.compiler import NativeDiagnosticsError
        self.build('--health','off');BuildContext.receipt(self,'SampleProjectEditor','Development')
        with patch('laniakea.unreal.tools.load',return_value={'manifest':{}}):
            recipe=execute(self.workspace,'sample','discover')['recipe']
            identity=execute(self.workspace,'sample','probe',recipe)['identity']
            for error in (LaniakeaError('UBT failed'),PermissionError('source unreadable'),MemoryError('resource failure')):
                checks.remember_failure(self.workspace,'sample',recipe,identity,error)
                self.assertFalse(checks.failure_path(self.workspace,'sample').exists())
            source=self.project/'Source/SampleProject/SampleProject.cpp'
            from laniakea.unreal.tools import digest
            observed={str(source):digest(source)}
            external=Path(self.temporary.name)/'External.h';external.write_text('// observed external header\n')
            checks.remember_failure(self.workspace,'sample',recipe,identity,
                NativeDiagnosticsError('native failed',{**observed,str(external):digest(external)},self.project))
            self.assertFalse(checks.failure_path(self.workspace,'sample').exists())
            source.write_bytes(source.read_bytes()+b'\n// superseded\n')
            checks.remember_failure(self.workspace,'sample',recipe,identity,NativeDiagnosticsError('native failed',observed,self.project))
            self.assertFalse(checks.failure_path(self.workspace,'sample').exists())
            write_json(checks.failure_path(self.workspace,'sample'),{'version':1,'identity':identity,'error':'old broad failure'})
            self.assertIn('cache_error',checks.previous_failure(self.workspace,'sample',identity,recipe))

    def test_required_cpd_failure_does_not_poison_native_failure_reuse(self):
        from test_build_context import BuildContext
        from laniakea.unreal import cpd,checks
        self.build('--health','off');BuildContext.receipt(self,'SampleProjectEditor','Development')
        published=self.workspace.latest('sample')
        with patch('laniakea.unreal.tools.load',return_value={'manifest':{}}):
            recipe=execute(self.workspace,'sample','discover')['recipe']
            recipe['health']['mode']='required';recipe['checks']['duplication']='on'
            def prepared(options):return {**options,'prefixes':[],'installed':{'identity':'synthetic-health'}},{'status':'pending'}
            with patch('laniakea.unreal.source_health.prepare',side_effect=prepared),self.workspace.extraction_lock('sample'), \
                    patch.object(pipeline,'stage',side_effect=cpd.Failure('required CPD failed','provider_exit')):
                with self.assertRaisesRegex(cpd.Failure,'required CPD failed'):execute(self.workspace,'sample','stage',recipe)
            self.assertFalse(checks.failure_path(self.workspace,'sample').exists())
        self.assertEqual(self.workspace.latest('sample'),published)

    def test_progress_permission_failure_cannot_abort_a_valid_extraction(self):
        from laniakea import progress
        diagnostics=io.StringIO()
        with recorded_ubt(self.project,self.engine),progress.reporting(self.workspace.root/'progress.json'), \
                patch.object(progress,'write_json',side_effect=PermissionError('progress locked')) as publish, \
                contextlib.redirect_stderr(diagnostics):
            run,_=pipeline.extract(self.workspace,self.target,health_options={'mode':'off'})
        self.assertEqual(self.workspace.latest('sample'),run)
        self.assertEqual(publish.call_count,1)
        self.assertEqual(diagnostics.getvalue().count('progress locked'),1)
        path=self.workspace.root/'next-progress.json'
        with progress.reporting(path):progress.emit('next','Next attempt')
        self.assertEqual(read_json(path)['label'],'Next attempt')
        with progress.reporting(path),patch.object(progress,'write_json',side_effect=PermissionError('progress locked')), \
                contextlib.redirect_stderr(io.StringIO()),self.assertRaisesRegex(LaniakeaError,'actual analyzer failure'):
            progress.emit('native','Running');raise LaniakeaError('actual analyzer failure')

    def test_unreadable_native_failure_cache_does_not_refuse_a_probe(self):
        from test_build_context import BuildContext
        from laniakea.unreal import checks
        self.build('--health','off');BuildContext.receipt(self,'SampleProjectEditor','Development')
        with patch('laniakea.unreal.tools.load',return_value={'manifest':{}}):
            recipe=execute(self.workspace,'sample','discover')['recipe']
            with patch.object(checks,'failure_path') as path:
                path.return_value.open.side_effect=PermissionError('cache read locked\n'+'x'*2000)
                result=execute(self.workspace,'sample','probe',recipe)
        self.assertIsNone(result['previous_failure'])
        self.assertIn('cache read locked',result['cache_warning'])
        self.assertLess(len(result['cache_warning']),512);self.assertNotIn('\n',result['cache_warning'])
        self.assertTrue(result['needs_initial_refresh'])

    def test_native_failure_cache_write_cannot_replace_the_compiler_error(self):
        from test_build_context import BuildContext
        from laniakea.unreal import checks
        from laniakea.unreal.compiler import NativeDiagnosticsError
        from laniakea.unreal.tools import digest
        self.build('--health','off');BuildContext.receipt(self,'SampleProjectEditor','Development')
        published=self.workspace.latest('sample');source=self.project/'Source/SampleProject/SampleProject.cpp'
        failure=NativeDiagnosticsError('primary compiler diagnostic',{str(source):digest(source)},self.project)
        with patch('laniakea.unreal.tools.load',return_value={'manifest':{}}):
            recipe=execute(self.workspace,'sample','discover')['recipe']
            with self.workspace.extraction_lock('sample'),patch.object(pipeline,'stage',side_effect=failure), \
                    patch.object(checks,'write_json',side_effect=PermissionError('cache write locked')):
                with self.assertRaises(NativeDiagnosticsError) as caught:execute(self.workspace,'sample','stage',recipe)
        self.assertIs(caught.exception,failure)
        self.assertTrue(str(failure).startswith('primary compiler diagnostic'))
        self.assertIn('cache write locked',str(failure))
        self.assertEqual(self.workspace.latest('sample'),published)

    def test_failed_cache_cleanup_cannot_reject_success_or_override_its_published_identity(self):
        from test_build_context import BuildContext
        from laniakea.unreal import checks
        self.build('--health','off');BuildContext.receipt(self,'SampleProjectEditor','Development')
        published=self.workspace.latest('sample')
        def indexed(_target,_run,graph,*_):
            return graph,{'enabled':True,'external_inputs':{},'units':1,'unknown':{'source':0,'target':0}}
        with patch('laniakea.unreal.tools.load',return_value={'manifest':{}}):
            recipe=execute(self.workspace,'sample','discover')['recipe']
            before=execute(self.workspace,'sample','probe',recipe)
            cache=checks.failure_path(self.workspace,'sample')
            write_json(cache,{'version':2,'kind':'native-source-diagnostics','identity':before['identity'],'error':'old diagnostic'})
            self.assertIsNotNone(execute(self.workspace,'sample','probe',recipe)['previous_failure'])
            self.assertIsNotNone(checks.previous_failure(self.workspace,'sample',before['identity'],recipe,
                read_json(published/'manifest.json'),{'identity':before['identity']}))
            unlink=Path.unlink
            def locked(path,*args,**kwargs):
                if path==cache:raise PermissionError('cache delete locked')
                return unlink(path,*args,**kwargs)
            with self.workspace.extraction_lock('sample'),recorded_ubt(self.project,self.engine), \
                    patch('laniakea.unreal.compiler.extract',side_effect=indexed),patch.object(Path,'unlink',locked):
                result=execute(self.workspace,'sample','stage',recipe)
            self.assertIn('cache delete locked',result['cache_warning'])
            self.assertEqual(self.workspace.latest('sample'),published)
            candidate=self.workspace.target_dir('sample')/'runs'/result['candidate']
            self.assertTrue(candidate.is_dir());self.assertTrue(cache.is_file())
            # The negative record must not win after the successful candidate is actually published.
            stale={'version':2,'kind':'native-source-diagnostics','identity':result['identity'],'error':'old diagnostic'}
            write_json(cache,stale)
            with self.workspace.extraction_lock('sample'):self.workspace.commit_run('sample',candidate)
            with patch.object(checks,'failure_path',side_effect=AssertionError('published success must precede cache I/O')):
                restarted=execute(Workspace(self.workspace.root),'sample','probe',recipe)
            self.assertIsNone(restarted['previous_failure'])
            self.assertEqual(restarted['previous_identity'],restarted['identity'])
            self.assertFalse(restarted['needs_initial_refresh'])
            self.assertEqual(read_json(cache),stale)
            source=self.project/'Source/SampleProject/SampleProject.cpp'
            source.write_bytes(source.read_bytes()+b'\n// changed since native success\n')
            changed=execute(self.workspace,'sample','probe',recipe)
            write_json(cache,{**stale,'identity':changed['identity']})
            self.assertIsNotNone(execute(self.workspace,'sample','probe',recipe)['previous_failure'])



if __name__=='__main__':unittest.main()
