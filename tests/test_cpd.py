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

    def extract(self):
        tool=cpd_tools.load(Path(os.environ['LANIAKEA_TEST_CPD']))
        with recorded_ubt(self.project,self.engine),patch('laniakea.unreal.cpd_tools.load',return_value=tool), \
                patch('laniakea.unreal.compiler.extract',side_effect=AssertionError('CPD must not load LLVM')):
            return pipeline.extract(self.workspace,self.target,health_options={'prefixes':['Source'],'minimum_tokens':100})

    def clones(self):
        first=self.project/'Source/SampleProject/First.cpp';second=first.with_name('Second.cpp')
        first.write_text(body());second.write_text(body())
        return first,second

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
