# SPDX-License-Identifier: AGPL-3.0-or-later
"""Source previews are bounded reads of recorded evidence, never arbitrary file access."""

import hashlib
import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlencode

from support import ROOT, copy_sample, fake_engine, recorded_ubt


class SourcePreviewReader(unittest.TestCase):
    def setUp(self):
        scratch=ROOT/'workspace'/'tmp';scratch.mkdir(parents=True,exist_ok=True)
        temporary=tempfile.TemporaryDirectory(prefix='source-reader-',dir=scratch);self.addCleanup(temporary.cleanup)
        self.base=Path(temporary.name).resolve();self.root=self.base/'project';self.root.mkdir()
        self.file=self.root/'API.cpp';self.file.write_bytes(b'// sample\nint value = 1;\nreturn value;\n')
        self.location={'root':'project','path':'API.cpp','line':2,'column':1,'end_line':3,'end_column':14,
                       'sha256':hashlib.sha256(self.file.read_bytes()).hexdigest()}

    def read(self,**location):
        from laniakea.source_preview import read
        return read(str(self.root),{**self.location,**location})

    def test_matching_changed_missing_and_unreadable_states_remain_distinct(self):
        self.assertEqual(self.read()['status'],'matching')
        self.file.write_bytes(b'// edited\n')
        self.assertEqual(self.read()['status'],'changed')
        self.assertEqual(self.read()['lines'],[])
        self.file.unlink();self.assertEqual(self.read()['code'],'missing')
        with patch.object(Path,'open',side_effect=PermissionError('refused')):
            self.file.touch()
            self.assertEqual(self.read()['code'],'read_error')

    def test_logical_paths_and_the_opened_handle_must_remain_inside_the_recorded_root(self):
        from laniakea import source_preview
        for path in ('../outside.cpp','C:/outside.cpp','/outside.cpp','folder/../API.cpp','folder\\API.cpp'):
            with self.assertRaises(ValueError):self.read(path=path)
        with patch.object(source_preview,'_opened_path',return_value=self.base/'outside.cpp'):
            self.assertEqual(self.read()['code'],'boundary')
        from test_source_boundaries import directory_link
        outside=self.base/'external';outside.mkdir();(outside/'API.cpp').write_bytes(self.file.read_bytes())
        link=self.root/'linked';directory_link(link,outside)
        try:
            with patch.object(Path,'open',side_effect=AssertionError('external source was opened')):
                self.assertEqual(self.read(path='linked/API.cpp')['code'],'boundary')
        finally:link.rmdir()

    def test_file_line_and_text_limits_never_silently_claim_a_complete_range(self):
        from laniakea import source_preview
        raw=('int sample = 1;\n'*1000).encode();self.file.write_bytes(raw)
        value=self.read(line=2,end_line=800,sha256=hashlib.sha256(raw).hexdigest())
        self.assertEqual(value['status'],'matching');self.assertEqual(len(value['lines']),source_preview.MAX_LINES)
        self.assertTrue(value['truncated'])
        with patch.object(source_preview,'MAX_BYTES',20):self.assertEqual(self.read()['code'],'size_limit')
        with patch.object(source_preview,'MAX_TEXT',20):
            value=self.read(line=2,end_line=800,sha256=hashlib.sha256(raw).hexdigest())
            self.assertEqual(len(value['lines']),1);self.assertTrue(value['truncated'])

    def test_matching_text_with_unsupported_encoding_or_invalid_range_is_not_fabricated(self):
        for raw in (b'\xffinvalid',b'line\x00data\n'):
            self.file.write_bytes(raw)
            self.assertEqual(self.read(sha256=hashlib.sha256(raw).hexdigest())['code'],'encoding')
        raw='// Sample\r\nint value = 1;\r\nreturn value;\r\n'.encode('utf-16')
        self.file.write_bytes(raw);digest=hashlib.sha256(raw).hexdigest()
        self.assertEqual(self.read(sha256=digest)['lines'][1]['text'],'int value = 1;')
        self.assertEqual(self.read(end_line=20,sha256=digest)['code'],'range')


def browser_fixture(base,occurrences=51):
    from test_health import browser_fixture as health_fixture
    from laniakea import health, pipeline, unreal
    from laniakea.server import make_server
    from laniakea.workspace import Workspace
    project=copy_sample(base);engine=fake_engine(base);workspace=Workspace(Path(base)/'workspace')
    graph,data=health_fixture()
    data['groups'][0]['occurrences']=data['groups'][0]['occurrences'][:occurrences]
    text='\n'.join('// Sample source line '+str(i) for i in range(1,2201))+'\n'
    text=text.replace('// Sample source line 2\n','const char* sample = "<script>throw 1</script>";\n')
    for name,fields in data['files'].items():
        file=project/name;file.parent.mkdir(parents=True,exist_ok=True);file.write_bytes(text.encode())
        fields['sha256']=hashlib.sha256(file.read_bytes()).hexdigest()
    target=workspace.register('sample',unreal.target_fields(project/'SampleProject.uproject',engine))
    original=unreal.extract
    def extract(*args,**kwargs):
        _,fields=original(*args,**kwargs);fields.pop('overview',None)
        fields['levels']=sorted({n['level'] for n in graph['nodes']})
        known={t['id'] for t in fields['edge_types']}
        fields['edge_types'] += [{'id':kind,'label':kind,'status':'resolved'}
                                for kind in sorted({e['type'] for e in graph['edges']}-known)]
        fields['sources'].append({'id':'compiler','name':'Synthetic compiler fixture','version':'1'})
        fields['coverage']['acquisition']['native']={'provider':'compiler','mode':'auto','status':'completed','code':'fixture'}
        fields['health']=health.write(args[1],data,graph['nodes'])
        fields['coverage']['acquisition']['source-duplication'].update(status='completed',code='fixture',
            tool_identity=data['provider']['identity'],input_identity='a'*64,minimum_tokens=data['minimum_tokens'],
            artifact_sha256=fields['health']['sha256'])
        return graph,fields
    with recorded_ubt(project,engine),patch.object(unreal,'extract',side_effect=extract):pipeline.extract(workspace,target)
    return make_server(workspace,scan=False),project,data


class SourcePreviewServer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        scratch=ROOT/'workspace'/'tmp';scratch.mkdir(parents=True,exist_ok=True)
        cls.temporary=tempfile.TemporaryDirectory(prefix='source-preview-',dir=scratch)
        cls.server,cls.project,cls.data=browser_fixture(Path(cls.temporary.name))
        cls.port=cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever,daemon=True).start()
        cls.entry=cls.server.snapshots.latest('sample')
        cls.report=cls.server.reviews['sample'].page({})
        cls.finding=next(f for f in cls.report['items'] if f['kind']=='duplication')

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.temporary.cleanup()

    def address(self,**extra):
        return self.entry['review_url'].rsplit('/',1)[0]+'/source?'+urlencode({
            'report':self.report['report'],'finding':self.finding['id'],'occurrence':0,**extra})

    def get(self,address,headers=None):
        connection=http.client.HTTPConnection('127.0.0.1',self.port,timeout=10)
        connection.request('GET',address,headers=headers or {})
        response=connection.getresponse();result=response.status,response.read();connection.close();return result

    def test_preview_uses_recorded_occurrence_and_exposes_honest_source_text(self):
        status,raw=self.get(self.address())
        self.assertEqual(status,200,raw)
        value=json.loads(raw)
        self.assertEqual(value['status'],'matching')
        self.assertEqual(value['start_line'],1)
        self.assertIn('<script>throw 1</script>',value['lines'][1]['text'])
        self.assertTrue(value['lines'][0]['matched']);self.assertFalse(value['lines'][-1]['matched'])
        self.assertEqual(value['location']['end_line'],20)

    def test_changed_source_is_not_highlighted_as_recorded_evidence(self):
        name=self.finding['id']
        evidence=self.server.reviews['sample'].page({'finding':name,'evidence':True,'limit':1})['items'][0]
        file=self.project/evidence['path'];before=file.read_bytes()
        try:
            file.write_bytes(before+b'// later edit\n')
            status,raw=self.get(self.address())
            self.assertEqual(status,200)
            value=json.loads(raw);self.assertEqual(value['status'],'changed');self.assertEqual(value['lines'],[])
        finally:file.write_bytes(before)

    def test_query_cannot_choose_paths_or_other_reports_or_unrecorded_occurrences(self):
        for query,status in [({'path':'../../outside'},400),({'root':'engine'},400),({'occurrence':-1},400),
                             ({'occurrence':100000},400),({'finding':'unknown'},400),({'report':'old'},409)]:
            self.assertEqual(self.get(self.address(**query))[0],status,query)
        self.assertEqual(self.get(self.address()+'&occurrence=1')[0],400)

    def test_foreign_requests_and_expired_snapshot_are_refused(self):
        for headers in ({'Origin':'https://foreign.example'},{'Sec-Fetch-Site':'cross-site'},
                        {'Host':'foreign.example:'+str(self.port)}):
            self.assertEqual(self.get(self.address(),headers)[0],403)
        path='/snapshot/sample/expired/map/'+self.entry['map_identity']+'/source?'+self.address().split('?',1)[1]
        self.assertEqual(self.get(path)[0],410)


if __name__=='__main__':unittest.main()
