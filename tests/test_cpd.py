# SPDX-License-Identifier: AGPL-3.0-or-later
"""The optional real CPD process proves exact ranges, drift, cache invalidation and refusal."""

import os
import json
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

from laniakea import LaniakeaError, health, pipeline
from laniakea.unreal import cpd_tools
from support import recorded_ubt
import test_pipeline as pipeline_fixture


def body(variable='value'):
    return 'int Compute(int '+variable+') {\n int result=0;\n'+''.join(
        f' result += {variable} * {i};\n' for i in range(1,35))+' return result;\n}\n'


class Isolation(unittest.TestCase):
    setUp=pipeline_fixture.Pipeline.setUp
    tearDown=pipeline_fixture.Pipeline.tearDown

    def test_optional_health_never_starts_implicitly_and_failure_retains_latest(self):
        with recorded_ubt(self.project,self.engine),patch('laniakea.unreal.cpd.extract',side_effect=AssertionError('must be explicit')):
            good,_=pipeline.extract(self.workspace,self.target)
            self.assertEqual(pipeline.freshness(self.workspace,self.target)[1],[])
        (self.workspace.root/'tools/health/cpd').mkdir(parents=True)
        with recorded_ubt(self.project,self.engine),patch('laniakea.unreal.cpd.prepare',side_effect=lambda o:o), \
                patch('laniakea.unreal.cpd.extract',side_effect=LaniakeaError('lexical failure')):
            with self.assertRaisesRegex(LaniakeaError,'lexical failure'):
                pipeline.extract(self.workspace,self.target,health_options={})
        self.assertEqual(self.workspace.latest('sample'),good)

    def test_missing_requested_tools_or_invalid_scope_refuse_before_ubt(self):
        for options in ({},{'prefixes':['../outside']},{'minimum_tokens':0}):
            with patch('laniakea.unreal.ubt.query_targets',side_effect=AssertionError('health preflight must run first')):
                with self.assertRaises(LaniakeaError):
                    pipeline.extract(self.workspace,self.target,health_options=options)


@unittest.skipUnless(os.environ.get('LANIAKEA_TEST_CPD'),'optional pinned CPD installation not supplied')
class CpdProcess(unittest.TestCase):
    setUp=pipeline_fixture.Pipeline.setUp
    tearDown=pipeline_fixture.Pipeline.tearDown

    def test_failed_automatic_coverage_survives_restart_until_changed_or_explicit_retry(self):
        from laniakea import map_index
        from laniakea.monitor import Monitor
        from laniakea.monitor_worker import execute
        from laniakea.server import target_index
        from laniakea.snapshots import Snapshots
        from laniakea.unreal import cpd
        from test_monitor import Watcher
        from laniakea.workspace import read_json
        source,_=self.clones();source.write_text('const char* text = "unterminated\n')
        installed=cpd_tools.load(Path(os.environ['LANIAKEA_TEST_CPD']))
        (self.workspace.root/'tools/health/cpd').mkdir(parents=True)
        with recorded_ubt(self.project,self.engine),patch.object(cpd_tools,'load',return_value=installed):
            pipeline.extract(self.workspace,self.target,health_options={'mode':'auto','heap_mib':512})
            with self.workspace.extraction_lock('sample'):
                candidate=execute(self.workspace,'sample','stage')
                original=self.workspace.commit_run('sample',self.workspace.target_dir('sample')/'runs'/candidate['candidate'])
            coverage=read_json(original/'manifest.json')['coverage']['acquisition']['source-duplication']
            self.assertEqual((coverage['status'],coverage['code']),('failed','provider_exit'))
            contexts=Snapshots(self.workspace,target_index(self.workspace,scan=False),
                               {'sample':map_index.ensure(self.workspace,'sample',original)})
            class Task:
                def __init__(_self,workspace,target,operation,recipe):
                    _self.result={'status':'completed','result':execute(workspace,target,operation,recipe)}
                def poll(_self):return _self.result
                def close(_self):pass
            owner=Monitor(self.workspace,contexts,task_factory=Task,notifications=Watcher)
            def settle():
                for _ in range(15):
                    owner.step()
                    if not owner.current and not owner.states['sample']['phase']:return
                self.fail('scheduler failed to settle')
            try:
                with patch.object(pipeline,'stage',wraps=pipeline.stage) as stages, \
                        patch.object(cpd.subprocess,'run',side_effect=AssertionError('unchanged failure must not launch Java')):
                    owner.activate('sample');settle()
                    stages.assert_not_called()
                self.assertEqual(self.workspace.latest('sample'),original)
                self.assertEqual(contexts.latest('sample')['acquisition']['source-duplication'],coverage)
                with patch.object(cpd.subprocess,'run',wraps=subprocess.run) as java:
                    owner.retry('sample');settle();java.assert_called_once()
                retried=self.workspace.latest('sample');self.assertNotEqual(retried,original)
                source.write_text(source.read_text()+'// changed source\n')
                with patch.object(cpd.subprocess,'run',wraps=subprocess.run) as java:
                    with owner.condition:owner._dirty(owner.states['sample'])
                    owner.states['sample']['due']=0;settle();java.assert_called_once()
                self.assertNotEqual(self.workspace.latest('sample'),retried)
                self.assertEqual(read_json(self.workspace.latest('sample')/'manifest.json')['coverage']['acquisition']
                                 ['source-duplication']['status'],'failed')
            finally:owner.stop()

    def test_watch_startup_reconciles_changed_config_even_with_completed_cpd(self):
        from laniakea.monitor import Monitor
        from laniakea.monitor_worker import execute
        from laniakea.server import target_index
        from laniakea.snapshots import Snapshots
        from laniakea import map_index
        from test_monitor import Watcher
        self.clones()
        config=self.project/'Config/DefaultEngine.ini';config.parent.mkdir(exist_ok=True)
        config.write_text('[Synthetic]\nValue=before\n')
        original,manifest=self.extract()
        self.assertEqual(manifest['coverage']['acquisition']['source-duplication']['status'],'completed')
        self.assertNotIn('compiler',{source['id'] for source in manifest['sources']})
        config.write_text('[Synthetic]\nValue=after\n')
        contexts=Snapshots(self.workspace,target_index(self.workspace,scan=False),
                           {'sample':map_index.ensure(self.workspace,'sample',original)})
        class Task:
            def __init__(_self,workspace,target,operation,recipe):
                _self.result={'status':'completed','result':execute(workspace,target,operation,recipe)}
            def poll(_self):return _self.result
            def close(_self):pass
        owner=Monitor(self.workspace,contexts,task_factory=Task,notifications=Watcher)
        installed=cpd_tools.load(Path(os.environ['LANIAKEA_TEST_CPD']))
        try:
            with recorded_ubt(self.project,self.engine),patch.object(cpd_tools,'load',return_value=installed):
                owner.activate('sample')
                for _ in range(12):
                    owner.step()
                    if owner.states['sample']['state']=='fresh':break
                self.assertEqual(owner.states['sample']['state'],'fresh')
                self.assertNotEqual(self.workspace.latest('sample'),original)
                probe=execute(self.workspace,'sample','probe')
                self.assertFalse(probe['needs_initial_refresh'])
                self.assertEqual(probe['previous_identity'],probe['identity'])
                self.assertEqual(probe['comparison']['scope']['source']['status'],'compared')
                self.assertEqual(probe['comparison']['total'],0)
                config.write_text('[Synthetic]\nValue=next-stopped-session\n')
                changed=execute(self.workspace,'sample','probe')
                self.assertNotEqual(changed['previous_identity'],changed['identity'])
                self.assertEqual(changed['comparison']['context'],'changed')
                self.assertEqual(changed['comparison']['total'],0,'Unrecorded Config was invented as a source edit')
                source=self.project/'Source/SampleProject/First.cpp';source.write_bytes(source.read_bytes()+b'\n// edit\n')
                with patch('laniakea.unreal.cpd.subprocess.run',side_effect=AssertionError('probe launched CPD')):
                    observed=execute(self.workspace,'sample','probe')['comparison']
                self.assertEqual(observed['total'],1)
                self.assertEqual(observed['rows'][0]['category'],'Implementation files')
        finally:owner.stop()

    def extract(self):
        tool=cpd_tools.load(Path(os.environ['LANIAKEA_TEST_CPD']))
        (self.workspace.root/'tools/health/cpd').mkdir(parents=True,exist_ok=True)
        with recorded_ubt(self.project,self.engine),patch('laniakea.unreal.cpd_tools.load',return_value=tool), \
                patch('laniakea.unreal.compiler.extract',side_effect=AssertionError('CPD must not load LLVM')):
            return pipeline.extract(self.workspace,self.target,health_options={'prefixes':['Source'],'minimum_tokens':100,'heap_mib':512})

    def clones(self):
        first=self.project/'Source/SampleProject/First.cpp';second=first.with_name('Second.cpp')
        first.write_text(body());second.write_text(body())
        return first,second

    def test_final_preprocessor_directive_without_newline_keeps_exact_evidence(self):
        first,second=self.clones()
        first.write_bytes(first.read_bytes()+b'\n#undef SAMPLE_TOKEN')
        second.write_bytes(second.read_bytes()+b'\n#undef SAMPLE_TOKEN\n')
        before={p:p.read_bytes() for p in (first,second)}
        run,manifest=self.extract()
        data=health.load(run,manifest)
        self.assertEqual(len(data['groups']),1)
        self.assertTrue(all(o['end_line']==38 for o in data['groups'][0]['occurrences']))
        self.assertEqual(before,{p:p.read_bytes() for p in (first,second)})
        self.assertEqual(data['files'][first.relative_to(self.project).as_posix()]['sha256'],
                         __import__('hashlib').sha256(before[first]).hexdigest())

    def test_exact_matches_and_comment_drift_use_provider_tokens_and_complete_ranges(self):
        first,second=self.clones();before={p:p.read_bytes() for p in (first,second)}
        with recorded_ubt(self.project,self.engine):ordinary,_=pipeline.extract(self.workspace,self.target)
        run,manifest=self.extract();data=health.load(run,manifest,json.loads((run/'graph.json').read_text())['nodes'])
        self.assertEqual((ordinary/'graph.json').read_bytes(),(run/'graph.json').read_bytes())
        self.assertEqual(len(data['groups']),1);group=data['groups'][0]
        self.assertGreaterEqual(group['tokens'],100);self.assertEqual(len(group['occurrences']),2)
        self.assertTrue(all(o['line']==1 and o['end_line']==38 for o in group['occurrences']))
        self.assertEqual(before,{p:p.read_bytes() for p in (first,second)})
        _,cached=self.extract();self.assertEqual(cached['coverage']['counts']['health.reused'],1)
        first.write_text('// a harmless comment\n'+body())
        self.assertIn(first.relative_to(self.project).as_posix(),pipeline.freshness(self.workspace,self.target)[1])
        run,manifest=self.extract();self.assertEqual(manifest['coverage']['counts']['health.reused'],0)
        changed=json.loads((run/'health.json').read_text())['groups'][0]
        self.assertEqual(changed['fingerprint'],group['fingerprint'])
        self.assertEqual(changed['occurrences'][0]['line'],2)
        second.unlink();run,manifest=self.extract()
        self.assertEqual(manifest['coverage']['counts']['health.reused'],0)
        self.assertEqual(json.loads((run/'health.json').read_text())['groups'],[])

    def test_lexical_failure_never_publishes_partial_findings(self):
        first,_=self.clones();good,_=self.extract()
        first.write_text('const char* text = "unterminated\n')
        with self.assertRaisesRegex(LaniakeaError,'CPD failed'):
            self.extract()
        self.assertEqual(self.workspace.latest('sample'),good)

    def test_corpus_edit_during_scan_and_timeout_refuse_publication(self):
        first,_=self.clones();good,_=self.extract();original=subprocess.run
        first.write_text(first.read_text()+'\n// force a fresh corpus scan\n')
        def edit(*args,**kwargs):
            result=original(*args,**kwargs)
            first.write_text(first.read_text()+'\n// changed during scan\n')
            return result
        with patch('laniakea.unreal.cpd.subprocess.run',side_effect=edit):
            with self.assertRaisesRegex(LaniakeaError,'corpus changed'):
                self.extract()
        self.assertEqual(self.workspace.latest('sample'),good)
        with patch('laniakea.unreal.cpd.subprocess.run',side_effect=subprocess.TimeoutExpired('java',900)):
            with self.assertRaisesRegex(LaniakeaError,'could not finish'):
                self.extract()
        self.assertEqual(self.workspace.latest('sample'),good)

    def test_strict_identity_does_not_normalize_renamed_tokens_and_added_files_invalidate_cache(self):
        first=self.project/'Source/SampleProject/First.cpp';first.write_text(body())
        renamed=first.with_name('Renamed.cpp');renamed.write_text(body('other').replace('result','answer'))
        empty=first.with_name('Empty.cpp');empty.write_text('')
        run,manifest=self.extract();data=json.loads((run/'health.json').read_text())
        self.assertEqual(data['groups'],[])
        self.assertIn(empty.relative_to(self.project).as_posix(),data['files'])
        second=first.with_name('Second.cpp');second.write_text(body())
        run,manifest=self.extract();self.assertEqual(manifest['coverage']['counts']['health.reused'],0)
        self.assertEqual(len(json.loads((run/'health.json').read_text())['groups']),1)

    def test_explicit_prefix_bounds_corpus_and_changes_outside_it_do_not_stale_health(self):
        self.clones();run,manifest=self.extract()
        self.assertTrue(all(p.startswith('Source/') for p in json.loads((run/'health.json').read_text())['files']))
        outside=self.project/'Plugins/SampleExtra/Source/SampleExtra/Other.cpp'
        outside.parent.mkdir(parents=True,exist_ok=True)
        outside.write_text(body())
        self.assertEqual(pipeline.freshness(self.workspace,self.target)[1],[])


if __name__=='__main__':unittest.main()
