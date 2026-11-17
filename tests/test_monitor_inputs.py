# SPDX-License-Identifier: AGPL-3.0-or-later
"""Only authorized, consumed inputs affect a target's automatic generation."""

from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from laniakea import pipeline
from laniakea.monitor_worker import execute
from laniakea.unreal import monitor,target_fields
from laniakea.workspace import Workspace,read_json
from support import copy_sample,fake_engine,recorded_ubt


class Inputs(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory();self.addCleanup(self.temporary.cleanup)
        base=Path(self.temporary.name);self.project=copy_sample(base);self.engine=fake_engine(base)
        self.workspace=Workspace(base/'workspace')
        self.target=self.workspace.register('sample',target_fields(self.project/'SampleProject.uproject',self.engine))
        with recorded_ubt(self.project,self.engine):
            self.run,self.manifest=pipeline.extract(self.workspace,self.target,health_options={'mode':'off'})

    def test_off_recipe_does_not_scan_cpp_and_watch_roots_exclude_assets_and_engine(self):
        with patch('laniakea.unreal.source_inputs.fingerprints',side_effect=AssertionError('source scan')):
            result=execute(self.workspace,'sample','probe')
        roots=result['watches'];self.assertTrue(roots)
        for spec in roots:
            if str(self.engine).lower() in spec['path'].lower():self.assertFalse(spec['recursive'])
            if spec['recursive']:self.assertNotEqual(Path(spec['path']).name.casefold(),'plugins')
            self.assertFalse('.cpp' in spec['suffixes'])
        source=self.project/'Source/SampleProject/SampleProject.cpp'
        source.write_bytes(source.read_bytes()+b'\n// irrelevant body\n')
        self.assertEqual(execute(self.workspace,'sample','probe')['identity'],result['identity'])
        rule=source.with_name('SampleProject.Build.cs');rule.write_bytes(rule.read_bytes()+b'\n// rule\n')
        self.assertNotEqual(execute(self.workspace,'sample','probe')['identity'],result['identity'])

    def test_configuration_change_affects_identity_and_automatic_stage_remains_unpublished(self):
        before=execute(self.workspace,'sample','probe')
        config=self.project/'Config/DefaultEngine.ini';config.parent.mkdir(exist_ok=True)
        config.write_text('[Synthetic]\nValue=1\n')
        self.assertNotEqual(execute(self.workspace,'sample','probe')['identity'],before['identity'])
        with self.workspace.extraction_lock('sample'),recorded_ubt(self.project,self.engine):
            staged=execute(self.workspace,'sample','stage',before['recipe'])
        self.assertEqual(self.workspace.latest('sample'),self.run)
        candidate=self.workspace.target_dir('sample')/'runs'/staged['candidate']
        self.assertTrue(candidate.name.endswith('.partial'))
        self.assertEqual(read_json(candidate/'automatic.json')['identity'],staged['identity'])

    def test_missing_automatic_provider_does_not_scan_a_previously_recorded_cpp_corpus(self):
        manifest={**self.manifest,'inputs':{**self.manifest['inputs'],'Source/Old.cpp':'a'*64}}
        request={'symbols':False,'health':{'mode':'auto'}}
        with patch('laniakea.unreal.source_inputs.fingerprints',side_effect=AssertionError('unavailable provider source scan')):
            result=monitor.inspect(self.workspace,self.target,manifest,request)
        self.assertFalse(result['source_bodies_monitored']);self.assertTrue(result['changed'])

    def test_edits_during_staging_refuse_candidate_without_changing_latest(self):
        original=pipeline.stage
        def changed(*args,**kwargs):
            result=original(*args,**kwargs)
            rule=self.project/'Source/SampleProject/SampleProject.Build.cs'
            rule.write_bytes(rule.read_bytes()+b'\n// changed during analysis\n')
            return result
        with self.workspace.extraction_lock('sample'),recorded_ubt(self.project,self.engine),patch.object(pipeline,'stage',side_effect=changed):
            with self.assertRaisesRegex(Exception,'inputs changed'):execute(self.workspace,'sample','stage')
        self.assertEqual(self.workspace.latest('sample'),self.run)


if __name__=='__main__':unittest.main()
