# SPDX-License-Identifier: AGPL-3.0-or-later
"""CPD acquisition never rewrites native identities or conceals missing coverage."""

import copy
import contextlib
import io
import json
import os
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch, Mock

from laniakea import cli, health, pipeline, review, LaniakeaError
from laniakea.unreal import cpd, source_health, cpd_tools, cpd_budget
from support import recorded_ubt
import test_pipeline as fixture


class Identity(unittest.TestCase):
    def test_later_health_hash_cannot_replace_a_native_identity_even_in_auto_mode(self):
        manifest={'inputs':{'Source/Sample/API.h':'old'},'coverage':{'counts':{},'analysed':[],'not_analysed':[]},
                  'sources':[],'timings_seconds':{}}
        before=copy.deepcopy(manifest)
        prepared=({'mode':'auto','prefixes':[],'minimum_tokens':50,'installed':{'identity':'a'*64}},
                  {'status':'pending'})
        with patch.object(source_health,'_inputs',return_value={'Source/Sample/API.h':'new'}), \
                patch.object(cpd,'extract',return_value=({'sha256':'b'*64},
                    {'seconds':0,'files':1,'groups':0,'reused':False})) as collect:
            with self.assertRaises(cpd.Changed):
                source_health.collect({},None,None,None,manifest,prepared,None)
        collect.assert_not_called()
        self.assertEqual(manifest,before)

    def test_only_none_disables_at_the_profile_boundary(self):
        original=cpd.options_for
        def configured(options):return dict(original(options),tools='synthetic-tools')
        with patch.object(cpd,'options_for',side_effect=configured),patch.object(Path,'stat'), \
                patch.object(cpd,'prepare',side_effect=lambda o:o):
            self.assertEqual(source_health.prepare({})[0]['mode'],'required')
            self.assertEqual(source_health.prepare(None)[0]['mode'],'off')

    def test_review_preserves_each_acquisition_state(self):
        for status in ('incomplete','disabled','failed','unavailable'):
            with self.subTest(status=status):
                check={}
                review._duplication(None,{},set(),check,None,{'status':status,'code':'test'})
                self.assertEqual(check['status'],status)


class MemorySample(unittest.TestCase):
    def test_representative_hosts_admit_full_heap_without_consuming_host_headroom(self):
        gib=1024**3
        for total,available,allowed in [(16,8,True),(16,6,False),(32,10,True),(32,8,False),(64,12,True),(64,9,False)]:
            with self.subTest(total=total,available=available), \
                    patch.object(cpd_budget,'memory',return_value=(total*gib,available*gib,available*gib)):
                if allowed:cpd_budget.require_headroom(4096)
                else:
                    with self.assertRaises(MemoryError):cpd_budget.require_headroom(4096)

    def test_windows_sample_validates_api_failure_and_preserves_known_zero_capacity(self):
        def zero_capacity(pointer):
            sample=pointer._obj
            self.assertEqual(sample.length,64)
            sample.total=64*1024**3;sample.available=0;sample.commit_available=0
            return True
        api=Mock(side_effect=zero_capacity)
        with patch.object(cpd_budget.ctypes,'WinDLL',return_value=SimpleNamespace(GlobalMemoryStatusEx=api)):
            self.assertEqual(cpd_budget.memory(),(64*1024**3,0,0))
            with self.assertRaises(MemoryError):cpd_budget.require_headroom(4096)
            api.side_effect=None;api.return_value=False
            with self.assertRaises(OSError):cpd_budget.memory()


class ProviderFailures(unittest.TestCase):
    tearDown=fixture.Pipeline.tearDown

    def setUp(self):
        fixture.Pipeline.setUp(self)
        (self.workspace.root/'tools/health/cpd').mkdir(parents=True)
        self.tool={'identity':'a'*64,'java':Path('unused-java'),'directory':Path('unused-tools')}

    def invoke(self,mode='auto',memory=(64*1024**3,32*1024**3,32*1024**3)):
        with recorded_ubt(self.project,self.engine),patch.object(cpd_tools,'load',return_value=self.tool), \
                patch('laniakea.unreal.cpd_budget.memory',side_effect=memory if isinstance(memory,Exception) else None,
                      return_value=memory):
            return pipeline.extract(self.workspace,self.target,health_options={'mode':mode})

    @staticmethod
    def process(command,**kwargs):
        request=json.loads(Path(command[-2]).read_text())
        Path(command[-1]).write_text(json.dumps({'processed':request['files'],'groups':[]}))
        return __import__('subprocess').CompletedProcess(command,0)

    def test_provider_request_io_degrades_only_auto_and_required_retains_publication(self):
        with patch.object(cpd,'write_json',side_effect=PermissionError('provider snapshot is read-only')):
            good,manifest=self.invoke()
            self.assertEqual(manifest['coverage']['acquisition']['source-duplication']['status'],'failed')
            self.assertNotIn('health',manifest)
            with self.assertRaises(LaniakeaError):self.invoke('required')
        self.assertEqual(self.workspace.latest('sample'),good)

    def test_java_input_preserves_source_case_while_lookup_remains_case_insensitive(self):
        def check_names(command,**kwargs):
            files=json.loads(Path(command[-2]).read_text())['files']
            self.assertTrue(any('/Source/SampleProject/' in p.replace('\\','/') for p in files),
                            'Lowercased input paths change PMD file ordering and clone grouping')
            return self.process(command,**kwargs)
        with patch.object(cpd.subprocess,'run',side_effect=check_names):self.invoke()

    def test_previous_collection_revision_is_recollected_without_changing_provider_identity(self):
        with patch.object(cpd,'COLLECTION_VERSION',1),patch.object(cpd.subprocess,'run',side_effect=self.process):
            previous,manifest=self.invoke()
        identity=health.load(previous,manifest)['provider']['identity']
        with patch.object(cpd.subprocess,'run',side_effect=self.process) as launch:
            current,manifest=self.invoke()
            launch.assert_called_once()
        self.assertFalse(manifest['coverage']['acquisition']['source-duplication']['reused'])
        self.assertEqual(health.load(current,manifest)['provider']['identity'],identity)

    def test_provider_source_read_error_is_local(self):
        source=self.project/'Source/SampleProject/SampleProject.cpp'
        original=Path.read_bytes;seen=0
        def unreadable(path):
            nonlocal seen
            if path==source:
                seen+=1
                if seen==2:raise PermissionError('cannot read provider input')
            return original(path)
        with patch.object(Path,'read_bytes',unreadable):
            _,manifest=self.invoke()
        self.assertEqual(manifest['coverage']['acquisition']['source-duplication']['status'],'failed')

    def test_expected_artifact_limits_are_incomplete_not_zero_findings(self):
        for name,value in [('MAX_BYTES',1),('MAX_GROUPS',0),('MAX_OCCURRENCES',1)]:
            with self.subTest(limit=name),patch.object(health,name,value,create=True), \
                    patch.object(cpd,'extract',wraps=cpd.extract), \
                    patch.object(cpd.subprocess,'run',side_effect=self.process):
                # Use the real artifact writer so typed limit failures are distinguished from invalid evidence.
                write=health.write
                def limited(run,data,nodes):
                    path=next(iter(data['files']))
                    data['groups']=[{'fingerprint':'b'*64,'tokens':100,'occurrences':[
                        {'path':path,'line':1,'column':1,'end_line':1,'end_column':5},
                        {'path':path,'line':2,'column':1,'end_line':2,'end_column':5}]}]
                    return write(run,data,nodes)
                with patch.object(health,'write',side_effect=limited):
                    _,manifest=self.invoke()
                self.assertEqual(manifest['coverage']['acquisition']['source-duplication']['status'],'incomplete')
                self.assertNotIn('health',manifest)

    def test_unexpected_artifact_validation_and_physical_boundary_still_refuse(self):
        with patch.object(cpd.subprocess,'run',side_effect=self.process), \
                patch.object(health,'write',side_effect=ValueError('invalid source range')):
            with self.assertRaisesRegex(ValueError,'invalid source range'):self.invoke()
        with patch.object(source_health,'_inputs',side_effect=LaniakeaError('external source link')):
            with self.assertRaisesRegex(LaniakeaError,'external source link'):self.invoke()

    def test_memory_admission_refuses_without_java_and_valid_cache_needs_no_jvm_budget(self):
        for sample,code in [((64*1024**3,1024**3,32*1024**3),'resource_headroom'),
                            ((64*1024**3,32*1024**3,1024**3),'resource_headroom'),
                            (OSError('sample unavailable'),'memory_probe')]:
            with self.subTest(code=code),patch.object(cpd.subprocess,'run') as launch:
                good,manifest=self.invoke(memory=sample)
                outcome=manifest['coverage']['acquisition']['source-duplication']
                self.assertEqual((outcome['status'],outcome['code']),('unavailable',code))
                launch.assert_not_called()
                with self.assertRaises(LaniakeaError):self.invoke('required',memory=sample)
                self.assertEqual(self.workspace.latest('sample'),good)
        with patch.object(cpd.subprocess,'run',side_effect=self.process) as launch:
            _,manifest=self.invoke()
            self.assertIn('-Xmx4096m',launch.call_args.args[0])
            self.assertIn('-XX:ActiveProcessorCount=4',launch.call_args.args[0])
            self.assertEqual(manifest['coverage']['acquisition']['source-duplication']['minimum_tokens'],50)
        with patch.object(cpd.subprocess,'run',side_effect=AssertionError('cache must not launch Java')):
            _,cached=self.invoke(memory=OSError('no admission needed'))
        self.assertTrue(cached['coverage']['acquisition']['source-duplication']['reused'])

    def test_artifact_io_and_serialization_limits_degrade_but_superseded_inputs_reject(self):
        with patch.object(cpd.subprocess,'run',side_effect=self.process), \
                patch.object(health,'write',side_effect=PermissionError('artifact not writable')):
            _,manifest=self.invoke()
            self.assertEqual(manifest['coverage']['acquisition']['source-duplication']['code'],'artifact_io')
        original=health.write
        def bounded(*args):
            with patch.object(health,'MAX_BYTES',1):return original(*args)
        with patch.object(cpd.subprocess,'run',side_effect=self.process),patch.object(health,'write',side_effect=bounded):
            good,manifest=self.invoke()
        self.assertEqual(manifest['coverage']['acquisition']['source-duplication']['code'],'artifact_limit')
        source={'Source/SampleProject/SampleProject.cpp':'a'*64}
        with patch.object(source_health,'_inputs',side_effect=[source,dict(source,changed='b'*64)]), \
                patch.object(cpd.subprocess,'run',side_effect=self.process):
            with self.assertRaisesRegex(LaniakeaError,'inputs changed'):self.invoke()
        self.assertEqual(self.workspace.latest('sample'),good)

    def test_invalid_budget_and_threshold_refuse_before_ubt(self):
        with patch('laniakea.unreal.ubt.query_targets',side_effect=AssertionError('must preflight')):
            for heap in (0,True,8193):
                with self.subTest(heap=heap),self.assertRaises(LaniakeaError):
                    pipeline.extract(self.workspace,self.target,health_options={'heap_mib':heap})
        with contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(cli.main(['--workspace',str(self.workspace.root),'build','sample',
                                      '--health-minimum-tokens','0']),2)


@unittest.skipUnless(os.environ.get('LANIAKEA_TEST_CPD'),'optional real pinned CPD installation')
class CliThreshold(unittest.TestCase):
    setUp=fixture.Pipeline.setUp
    tearDown=fixture.Pipeline.tearDown

    def snippet_groups(self,data,names):
        return [g for g in data['groups'] if any(Path(o['path']).name in names for o in g['occurrences'])]

    def test_ordinary_build_collects_and_reviews_short_clones_without_health_flags(self):
        from laniakea import map_index
        from laniakea.review_store import Review
        tool=cpd_tools.load(Path(os.environ['LANIAKEA_TEST_CPD']))
        (self.workspace.root/'tools/health/cpd').mkdir(parents=True)
        folder=self.project/'Source/SampleProject'
        body='''bool ReaderA(const ResourceList& resources) {
    if (resources.empty()) return false;
    for (const auto* resource : resources) {
        if (!resource || !resource->IsReady()) {
            return false;
        }
    }
    return true;
}
'''
        other=self.project/'Plugins/Sample/SampleGameplay/Source/SampleGameplay'
        (folder/'First.cpp').write_text(body)
        (other/'Second.cpp').write_text(body.replace('ReaderA','ReaderB'))
        (folder/'Renamed.cpp').write_text(body.replace('ReaderA','ReaderC').replace('resources','entries').replace('resource','entry'))
        (folder/'Different.cpp').write_text('int ReaderD(int value,int divisor) {int steps=0;while(divisor!=0) {'
            'const int remainder=value%divisor;value=divisor;divisor=remainder;++steps;}return steps+value;}\n')
        with recorded_ubt(self.project,self.engine),patch.object(cpd_tools,'load',return_value=tool), \
                contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(cli.main(['--workspace',str(self.workspace.root),'build',
                str(self.project/'SampleProject.uproject'),'--engine',str(self.engine),'--name','sample']),0)
        run=self.workspace.latest('sample');manifest=json.loads((run/'manifest.json').read_text())
        data=health.load(run,manifest)
        self.assertIsNotNone(data,'Ordinary build did not collect installed CPD evidence')
        self.assertEqual(data['minimum_tokens'],50)
        groups=self.snippet_groups(data,{'First.cpp','Second.cpp','Renamed.cpp','Different.cpp'})
        self.assertEqual(len(groups),1)
        self.assertEqual(groups[0]['tokens'],50)
        self.assertEqual({Path(o['path']).name for o in groups[0]['occurrences']},{'First.cpp','Second.cpp'})
        self.assertEqual(len({data['files'][o['path']]['owner'] for o in groups[0]['occurrences']}),2)
        graph=json.loads((run/'graph.json').read_text())
        destination=run/'map-index';map_index.build(graph,destination)
        report=Review(self.workspace,'sample',run,map_index.MapIndex(destination)).page({})
        self.assertTrue(any(f['kind']=='duplication' and f['subjects']==['module:SampleGameplay','module:SampleProject']
                            for f in report['items']))
        with recorded_ubt(self.project,self.engine),patch.object(cpd_tools,'load',return_value=tool), \
                patch.object(cpd.subprocess,'run',side_effect=AssertionError('unchanged ordinary build launched Java')), \
                contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(cli.main(['--workspace',str(self.workspace.root),'build','sample']),0)
        again=json.loads((self.workspace.latest('sample')/'manifest.json').read_text())
        self.assertTrue(again['coverage']['acquisition']['source-duplication']['reused'])

    def test_cli_resolves_omitted_floor_once_and_preserves_explicit_override(self):
        tool=cpd_tools.load(Path(os.environ['LANIAKEA_TEST_CPD']))
        (self.workspace.root/'tools/health/cpd').mkdir(parents=True)
        # An exact short-clone pair, with no identifier normalization.
        # A match between 50 and 99 tokens exercises both the omitted floor and explicit override.
        body='int Read(int value) { int total=0;'+''.join(f'total+=value*{i};' for i in range(1,9))+'return total;}\n'
        folder=self.project/'Source/SampleProject'
        (folder/'First.cpp').write_text(body);(folder/'Second.cpp').write_text(body)
        for explicit,expected in [(None,50),(100,100)]:
            args=['--workspace',str(self.workspace.root),'build',str(self.project/'SampleProject.uproject'),
                  '--engine',str(self.engine),'--name','sample','--health-heap-mib','512']
            if explicit is None:args+=['--health','auto']
            if explicit is not None:args+=['--health-minimum-tokens',str(explicit)]
            with recorded_ubt(self.project,self.engine),patch.object(cpd_tools,'load',return_value=tool), \
                    contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(cli.main(args),0)
            run=self.workspace.latest('sample');manifest=json.loads((run/'manifest.json').read_text())
            data=health.load(run,manifest)
            self.assertEqual(data['minimum_tokens'],expected)
            self.assertEqual(bool(self.snippet_groups(data,{'First.cpp','Second.cpp'})),explicit is None)
            recipe=self.workspace.request('sample')['recipe']['health']
            self.assertEqual((recipe['minimum_tokens'],recipe['heap_mib']),(expected,512))


if __name__=='__main__':unittest.main()
