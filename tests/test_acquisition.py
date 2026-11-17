# SPDX-License-Identifier: AGPL-3.0-or-later
"""A requested extraction cannot commit settings before its facts are valid."""

import contextlib
import io
import copy
import unittest
from unittest.mock import patch

from laniakea import cli, pipeline, review, review_policy, LaniakeaError
from laniakea.workspace import Workspace, write_json
from laniakea.unreal import cpd
from support import recorded_ubt
import test_pipeline as fixture


class Requests(unittest.TestCase):
    setUp=fixture.Pipeline.setUp
    tearDown=fixture.Pipeline.tearDown

    def invoke(self,*args):
        with recorded_ubt(self.project,self.engine),contextlib.redirect_stdout(io.StringIO()), \
                contextlib.redirect_stderr(io.StringIO()):
            return cli.main(['--workspace',str(self.workspace.root),'build',str(self.project/'SampleProject.uproject'),
                             '--engine',str(self.engine),*args])

    def test_invalid_request_does_not_register_a_new_target(self):
        self.assertEqual(self.invoke('--name','invalid','--health-minimum-tokens','0'),2)
        self.assertIsNone(self.workspace.load('invalid'))

    def test_default_build_reports_missing_tools_and_explicit_off_avoids_health_scans(self):
        for args,status in [((),'unavailable'),(('--health','off'),'disabled')]:
            with self.subTest(args=args), \
                    patch('laniakea.unreal.cpd_tools.load',side_effect=AssertionError('no tool should be loaded')), \
                    patch('laniakea.unreal.source_inputs.fingerprints',side_effect=AssertionError('no C++ scan')), \
                    patch('laniakea.unreal.compiler.extract',side_effect=AssertionError('native must remain explicit')):
                self.assertEqual(self.invoke(*args),0)
                run=self.workspace.latest('sample')
                manifest=__import__('json').loads((run/'manifest.json').read_text())
                outcome=manifest['coverage']['acquisition']['source-duplication']
                self.assertEqual(outcome['status'],status)
                self.assertNotIn('health',manifest)
        self.assertEqual(self.workspace.request('sample')['recipe']['health']['mode'],'off')

    def test_failed_target_selection_preserves_committed_settings_and_map(self):
        with recorded_ubt(self.project,self.engine):
            from laniakea import pipeline
            good,_=pipeline.extract(self.workspace,self.target)
        before=self.workspace.load('sample')
        self.assertEqual(self.invoke('--target','MissingTarget'),2)
        self.assertEqual(self.workspace.load('sample'),before)
        self.assertEqual(self.workspace.latest('sample'),good)

    def test_pointer_failure_leaves_settings_recipe_and_map_on_the_previous_run(self):
        with recorded_ubt(self.project,self.engine):
            good,_=pipeline.extract(self.workspace,self.target)
            before=self.workspace.request('sample')
            original=__import__('os').replace
            def fail_pointer(source,destination):
                if __import__('pathlib').Path(destination).name=='latest.json':raise OSError('publication interrupted')
                return original(source,destination)
            with patch('laniakea.workspace.os.replace',side_effect=fail_pointer):
                with self.assertRaisesRegex(OSError,'interrupted'):
                    pipeline.extract(self.workspace,dict(self.target,target='SampleProjectEditor'))
        reopened=Workspace(self.workspace.root)
        self.assertEqual(reopened.latest('sample'),good)
        self.assertEqual(reopened.request('sample'),before)
        write_json(reopened.target_dir('sample')/'target.json',dict(self.target,target='obsolete'))
        self.assertEqual(reopened.load('sample'),before['target'])


class DisplayFloor(unittest.TestCase):
    def test_omitted_floor_uses_recorded_coverage_but_explicit_policy_remains_authoritative(self):
        from test_health import observations
        data=observations();data['minimum_tokens']=50;data['groups'][0]['tokens']=50
        rule=next(copy.deepcopy(r) for r in review_policy.DEFAULT['rules'] if r['kind']=='duplication')
        emitted=[]
        review._duplication(data,rule,{'A','C'},{},lambda *a,**kw:emitted.append(a))
        self.assertEqual(len(emitted),1)
        emitted.clear();rule['minimum_tokens']=100
        review._duplication(data,rule,{'A','C'},{},lambda *a,**kw:emitted.append(a))
        self.assertEqual(emitted,[])


class Outcomes(unittest.TestCase):
    setUp=fixture.Pipeline.setUp
    tearDown=fixture.Pipeline.tearDown

    def extract(self,mode):
        with recorded_ubt(self.project,self.engine):
            return pipeline.extract(self.workspace,self.target,health_options={'mode':mode})

    def test_missing_auto_tool_publishes_unavailable_without_source_scan(self):
        with patch('laniakea.unreal.source_inputs.fingerprints',side_effect=AssertionError('no source scan')):
            run,manifest=self.extract('auto')
        self.assertEqual(manifest['coverage']['acquisition']['source-duplication']['status'],'unavailable')
        self.assertNotIn('health',manifest)
        self.assertEqual(self.workspace.latest('sample'),run)

    def test_provider_failure_is_optional_only_in_auto_mode(self):
        prepared=lambda options:(dict(options,minimum_tokens=100,prefixes=[],heap_mib=4096),
            {'provider':'pmd-cpd','mode':options['mode'],'minimum_tokens':100,'prefixes':[],
             'status':'pending','code':'prepared'})
        with patch('laniakea.unreal.source_health.prepare',side_effect=prepared), \
                patch('laniakea.unreal.cpd.extract',side_effect=cpd.Failure('lexical failure','provider_exit')):
            good,manifest=self.extract('auto')
            self.assertEqual(manifest['coverage']['acquisition']['source-duplication']['status'],'failed')
            self.assertNotIn('health',manifest)
            before=self.workspace.request('sample')
            with self.assertRaisesRegex(LaniakeaError,'lexical failure'):self.extract('required')
            self.assertEqual(self.workspace.latest('sample'),good)
            self.assertEqual(self.workspace.request('sample'),before)

    def test_unknown_failure_and_changed_corpus_never_become_optional_success(self):
        prepared=({'mode':'auto','prefixes':[],'minimum_tokens':100,'heap_mib':4096},
            {'provider':'pmd-cpd','mode':'auto','minimum_tokens':100,'prefixes':[],'status':'pending','code':'prepared'})
        for error in (LaniakeaError('unknown failure'),cpd.Changed('superseded inputs')):
            with self.subTest(error=type(error).__name__),patch('laniakea.unreal.source_health.prepare',return_value=prepared), \
                    patch('laniakea.unreal.cpd.extract',side_effect=error):
                with self.assertRaises(LaniakeaError):self.extract('auto')
                self.assertIsNone(self.workspace.latest('sample'))


if __name__=='__main__':unittest.main()
