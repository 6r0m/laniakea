# SPDX-License-Identifier: AGPL-3.0-or-later
"""Real LLVM workers and CPD share one publication; only Unreal build inputs are synthetic."""

import contextlib
import io
import json
import os
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

from laniakea import cli, health, map_index, LaniakeaError
from laniakea.review_store import Review
from laniakea.unreal import cpd_tools, tools, project_copy, source_health
from support import recorded
import test_pipeline as fixture
import test_build_context as build_fixture


@unittest.skipUnless(os.environ.get('LANIAKEA_TEST_LIBCLANG') and os.environ.get('LANIAKEA_TEST_CPD'),
                     'requires registered LLVM and CPD tools')
class NativeHealth(unittest.TestCase):
    tearDown=fixture.Pipeline.tearDown

    def setUp(self):
        fixture.Pipeline.setUp(self)
        self.native=tools.load(Path(os.environ['LANIAKEA_TEST_LIBCLANG']).parent)
        self.cpd=cpd_tools.load(Path(os.environ['LANIAKEA_TEST_CPD']))
        (self.workspace.root/'tools/health/cpd').mkdir(parents=True)
        build_fixture.BuildContext.receipt(self,'SampleProjectEditor','Development')
        folder=self.project/'Source/SampleProject'
        (folder/'SampleTypes.h').write_text('struct SampleRecord {int value;};\n')
        for name in ('First','Second'):
            (folder/(name+'.cpp')).write_text('#include "SampleTypes.h"\nint Read'+name+'(int value) { int total=0;'+
                ''.join(f'total+=value*{i};' for i in range(1,9))+'return total;}\n')

    def invoke(self,expected=0):
        def exported(_engine,project,*_):return recorded(Path(project).parent,self.engine)['export']
        def actions(_engine,project,_target,_configuration,_out,workspace):
            project_copy.check(project,workspace)
            folder=Path(project).parent/'Source/SampleProject'
            return {'Actions':[{'Type':'Compile','WorkingDirectory':str(folder),
                'CommandArguments':subprocess.list2cmdline(['/std:c++20',str(folder/(name+'.cpp'))])}
                for name in ('First','Second')]}
        errors=io.StringIO()
        with patch('laniakea.unreal.ubt.query_targets',return_value=recorded(self.project,self.engine)['targets']), \
                patch('laniakea.unreal.ubt.export',side_effect=exported), \
                patch('laniakea.unreal.ubt.build_actions',side_effect=actions), \
                patch.object(tools,'load',return_value=self.native),patch.object(cpd_tools,'load',return_value=self.cpd), \
                contextlib.redirect_stdout(io.StringIO()),contextlib.redirect_stderr(errors):
            self.assertEqual(cli.main(['--workspace',str(self.workspace.root),'build',
                str(self.project/'SampleProject.uproject'),'--engine',str(self.engine),'--name','sample','--symbols']),expected)
        if expected:return None,errors.getvalue()
        run=self.workspace.latest('sample')
        return run,json.loads((run/'manifest.json').read_text())

    def test_native_and_automatic_health_publish_reuse_and_reject_superseded_native_inputs(self):
        first,manifest=self.invoke()
        graph=json.loads((first/'graph.json').read_text())
        self.assertTrue(any(n['level']=='class' and n['label']=='SampleRecord' for n in graph['nodes']))
        self.assertTrue(any(n['level']=='function' and n['label']=='ReadFirst' for n in graph['nodes']))
        data=health.load(first,manifest,graph['nodes']);self.assertEqual(data['minimum_tokens'],50)
        self.assertTrue(data['groups'])
        self.assertEqual(manifest['coverage']['acquisition']['source-duplication']['mode'],'auto')
        native=json.loads((first/'compiler/progress.json').read_text())['jobs']
        self.assertTrue(native);self.assertTrue(all(job['errors']==0 for job in native))
        destination=first/'map-index';map_index.build(graph,destination)
        self.assertTrue(any(f['kind']=='duplication' for f in
            Review(self.workspace,'sample',first,map_index.MapIndex(destination)).page({})['items']))
        second,again=self.invoke()
        self.assertEqual((first/'graph.json').read_bytes(),(second/'graph.json').read_bytes())
        self.assertEqual(health.load(second,again),data)
        self.assertTrue(again['coverage']['acquisition']['source-duplication']['reused'])
        self.assertTrue(all(job['cache_hit'] for job in json.loads((second/'compiler/progress.json').read_text())['jobs']))
        before=self.workspace.request('sample');collect=source_health.collect
        def edit(*args,**kwargs):
            path=self.project/'Source/SampleProject/First.cpp'
            path.write_text(path.read_text()+'\n// changed after indexing\n')
            return collect(*args,**kwargs)
        with patch.object(source_health,'collect',side_effect=edit):
            _,error=self.invoke(expected=2)
            self.assertIn('Mandatory inputs changed',error)
        self.assertEqual(self.workspace.latest('sample'),second)
        self.assertEqual(self.workspace.request('sample'),before)


if __name__=='__main__':unittest.main()
