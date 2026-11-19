# SPDX-License-Identifier: AGPL-3.0-or-later
"""Only authorized, consumed inputs affect a target's automatic generation."""

from pathlib import Path
import os
import tempfile
import unittest
from unittest.mock import patch

from laniakea import pipeline
from laniakea.monitor_worker import execute
from laniakea.unreal import monitor,target_fields
from laniakea.workspace import Workspace,read_json,write_json
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

    def receipt_update(self):
        from test_build_context import BuildContext
        BuildContext.receipt(self,'SampleProjectEditor','Development',timestamp=10)
        with recorded_ubt(self.project,self.engine):
            self.run,self.manifest=pipeline.extract(self.workspace,self.target,health_options={'mode':'off'})
        extra=self.project/'Binaries/Win64/SampleAdditional.dll';extra.write_bytes(b'new linked product')
        os.utime(extra,ns=(19_000_000_000,19_000_000_000))
        BuildContext.receipt(self,'SampleProjectEditor','DebugGame',timestamp=20,BuildProducts=[
            {'Path':'$(ProjectDir)/Binaries/Win64/SampleProjectEditor.dll','Type':'DynamicLibrary'},
            {'Path':'$(ProjectDir)/Binaries/Win64/SampleAdditional.dll','Type':'DynamicLibrary'}])
        return extra

    def test_settled_receipt_and_linked_product_change_is_a_valid_new_contract(self):
        self.receipt_update()
        with self.workspace.extraction_lock('sample'),recorded_ubt(self.project,self.engine):
            result=execute(self.workspace,'sample','stage')
        candidate=self.workspace.target_dir('sample')/'runs'/result['candidate']
        manifest=read_json(candidate/'manifest.json')
        self.assertEqual(manifest['target']['configuration'],'DebugGame')
        self.assertEqual(len(manifest['target']['build_context']['products']),2)
        self.assertEqual(self.workspace.latest('sample'),self.run)
        self.assertEqual(read_json(candidate/'automatic.json')['identity'],result['identity'])

    def test_newly_recorded_linked_product_must_still_match_its_capture(self):
        extra=self.receipt_update();original=pipeline.stage
        def changed(*args,**kwargs):
            result=original(*args,**kwargs);extra.write_bytes(extra.read_bytes()+b' changed after capture');return result
        with self.workspace.extraction_lock('sample'),recorded_ubt(self.project,self.engine),patch.object(pipeline,'stage',side_effect=changed):
            with self.assertRaisesRegex(Exception,'linked product'):execute(self.workspace,'sample','stage')
        self.assertEqual(self.workspace.latest('sample'),self.run)

    def test_manual_snapshot_has_no_complete_monitoring_baseline_after_config_changes(self):
        config=self.project/'Config/DefaultEngine.ini';config.parent.mkdir(exist_ok=True)
        config.write_text('[Synthetic]\nValue=before\n')
        with recorded_ubt(self.project,self.engine):
            self.run,_=pipeline.extract(self.workspace,self.target,health_options={'mode':'off'})
        config.write_text('[Synthetic]\nValue=after\n')
        self.assertTrue(execute(self.workspace,'sample','probe')['needs_initial_refresh'])

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

    def native_baseline(self):
        from test_build_context import BuildContext
        BuildContext.receipt(self,'SampleProjectEditor','Development')
        def indexed(_target,_run,graph,*_):
            return graph,{'enabled':True,'external_inputs':{},'units':1,'unknown':{'source':0,'target':0}}
        with recorded_ubt(self.project,self.engine),patch('laniakea.unreal.compiler.extract',side_effect=indexed):
            self.run,self.manifest=pipeline.extract(self.workspace,self.target,symbols=True,health_options={'mode':'off'})

    def comparison_probe(self,recipe=None):
        with patch('laniakea.unreal.tools.load',return_value={'manifest':{}}):
            result=execute(self.workspace,'sample','probe',recipe)
        value=result.get('comparison')
        self.assertIsInstance(value,dict,'probe has no advisory change comparison')
        self.assertNotIn('error',value)
        return result,value

    def test_recorded_source_changes_are_categorized_without_another_fingerprint_pass(self):
        self.native_baseline()
        source=self.project/'Source/SampleProject/SampleProject.cpp';source.write_bytes(source.read_bytes()+b'\n// edit\n')
        header=self.project/'Source/SampleProject/New.h';header.write_text('// added\n')
        removed=self.project/'Plugins/Sample/SampleCore/Source/SampleCore/SampleCore.Build.cs';removed.unlink()
        from laniakea.unreal import source_inputs
        with patch.object(source_inputs,'fingerprints',wraps=source_inputs.fingerprints) as reads:
            _,value=self.comparison_probe()
        self.assertEqual(reads.call_count,1)
        changes={row['path']:row for row in value['rows']}
        self.assertEqual(changes[source.relative_to(self.project).as_posix()]['change'],'modified')
        self.assertEqual(changes[header.relative_to(self.project).as_posix()]['category'],'Headers')
        self.assertEqual(changes[removed.relative_to(self.project).as_posix()]['change'],'removed')
        self.assertNotIn('source',changes[removed.relative_to(self.project).as_posix()])
        self.assertEqual(value['baseline'],self.run.name)

    def test_off_scope_and_unrecorded_configuration_are_not_false_file_changes(self):
        first,initial=self.comparison_probe()
        write_json(self.run/'automatic.json',{'version':1,'identity':first['identity']})
        source=self.project/'Source/SampleProject/SampleProject.cpp';source.write_bytes(source.read_bytes()+b'\n// edit\n')
        cfg=self.project/'Config/DefaultEngine.ini';cfg.parent.mkdir(exist_ok=True);cfg.write_text('[Sample]\nKey=1\n')
        result,value=self.comparison_probe()
        self.assertNotEqual(result['identity'],first['identity'])
        self.assertEqual(value['context'],'changed')
        self.assertEqual(value['total'],0)
        self.assertEqual(value['scope']['source']['status'],'not-monitored')
        self.assertFalse(any(row['path'].startswith('Config/') for row in value['rows']))

    def test_native_to_off_scope_does_not_report_recorded_sources_as_deleted(self):
        self.native_baseline()
        recipe={'symbols':False,'health':{'mode':'off'}}
        _,value=self.comparison_probe(recipe)
        self.assertEqual(value['total'],0)
        self.assertEqual(value['scope']['source']['status'],'not-monitored')

    def test_receipt_timestamp_change_is_build_evidence_not_source_content(self):
        from test_build_context import BuildContext
        path=BuildContext.receipt(self,'SampleProjectEditor','Development',timestamp=10)
        with recorded_ubt(self.project,self.engine):self.run,self.manifest=pipeline.extract(self.workspace,self.target,health_options={'mode':'off'})
        raw=path.read_bytes();os.utime(path,ns=(20_000_000_000,20_000_000_000))
        _,value=self.comparison_probe()
        self.assertEqual(path.read_bytes(),raw)
        row=next(row for row in value['rows'] if row['path'].endswith('.target'))
        self.assertEqual(row['category'],'Build evidence')

    def test_recorded_external_permission_failure_is_not_reported_as_removed(self):
        from laniakea.unreal import source_inputs
        external=Path(self.temporary.name)/'SDK.h';external.write_text('// sdk\n')
        original=Path.read_bytes
        def locked(path):
            if path==external:raise PermissionError('external input locked')
            return original(path)
        manifest={'inputs':{'external:'+str(external):'a'*64}}
        with patch.object(Path,'read_bytes',locked):
            with self.assertRaises(PermissionError):source_inputs.fingerprints(self.project/'SampleProject.uproject',manifest)

    def test_source_comparison_requires_equal_recorded_corpus_and_roots(self):
        from copy import deepcopy
        from laniakea.unreal.source_inputs import fingerprints
        baseline=deepcopy(self.manifest)
        baseline['inputs'].update(fingerprints(self.project/'SampleProject.uproject'))
        baseline['coverage']['acquisition']={'source-duplication':{'status':'completed'}}
        baseline['health']={'prefixes':['Source/']}
        request={'symbols':False,'health':{'mode':'auto'}}
        current={'inputs':dict(baseline['inputs']),'source_scope':{'prefixes':['Source/'],'excludes':[]}}
        key='Source/SampleProject/SampleProject.cpp';current['inputs'][key]='changed'
        value=monitor.compare_inputs(self.workspace,self.target,baseline,request,current,self.run)
        self.assertEqual(value['scope']['source']['status'],'compared')
        self.assertEqual([row['path'] for row in value['rows']],[key])
        for scope,status in [(None,'not-monitored'),({'prefixes':[],'excludes':[]},'scope-changed'),
                             ({'prefixes':['Source/'],'excludes':['Source/Test/']},'scope-changed')]:
            value=monitor.compare_inputs(self.workspace,self.target,baseline,request,{**current,'source_scope':scope},self.run)
            self.assertEqual(value['scope']['source']['status'],status);self.assertEqual(value['total'],0)
        value=monitor.compare_inputs(self.workspace,{**self.target,'engine_root':str(self.engine/'changed')},
                                     baseline,request,current,self.run)
        self.assertTrue(all(item['status']=='unavailable' for item in value['scope'].values()))
        self.assertEqual(value['rows'],[])
        baseline.pop('health');baseline['coverage']['acquisition']={}
        value=monitor.compare_inputs(self.workspace,self.target,baseline,request,current,self.run)
        self.assertEqual(value['scope']['source']['status'],'not-recorded');self.assertEqual(value['total'],0)

    def test_projection_failure_does_not_break_probe_or_valid_staging(self):
        with patch('laniakea.unreal.input_comparison',side_effect=PermissionError('comparison metadata locked')):
            result=execute(self.workspace,'sample','probe')
            self.assertIn('locked',result['comparison']['error']);self.assertTrue(result['identity'])
            with self.workspace.extraction_lock('sample'),recorded_ubt(self.project,self.engine):
                result=execute(self.workspace,'sample','stage')
            self.assertTrue((self.workspace.target_dir('sample')/'runs'/result['candidate']).exists())
            self.assertIn('locked',result['comparison']['error'])

    def test_recorded_external_absence_is_removed_without_a_source_link(self):
        from copy import deepcopy
        baseline=deepcopy(self.manifest);baseline['sources'].append({'id':'compiler'})
        external='external:'+str(self.engine/'Engine/Source/SDK.h')
        baseline['inputs'][external]='recorded'
        current={'inputs':{**baseline['inputs'],external:'missing'},'source_scope':{'prefixes':[],'excludes':[]}}
        value=monitor.compare_inputs(self.workspace,self.target,baseline,{'symbols':True},current,self.run)
        self.assertEqual(value['total'],1);self.assertEqual(value['rows'][0]['change'],'removed')
        self.assertNotIn('source',value['rows'][0])


if __name__=='__main__':unittest.main()
