# SPDX-License-Identifier: AGPL-3.0-or-later
"""Source presentation follows recorded declarations, never symbol spelling or member access."""
import unittest
from laniakea.unreal.source_context import annotate


class SourceContext(unittest.TestCase):
    def test_public_headers_private_implementations_and_observed_subfolders(self):
        module={'id':'m','parent':None,'level':'module','source':{'root':'project','path':'Source/Sample/Sample.Build.cs'}}
        def symbol(identity,path,**attrs):
            return {'id':identity,'parent':'m','level':'class','source':{'root':'project','path':path},'attrs':attrs}
        public=symbol('public','Source/Sample/Private/Record.cpp',
                      declaration={'root':'project','path':'Source/Sample/Public/Record.h'})
        private=symbol('private','Source/Sample/Private/Tests/Fixture.h',access='public')
        generated=symbol('generated','Source/Sample/Public/Record.h',
                         declaration={'root':'project','path':'Intermediate/Inc/Sample.generated.h'})
        unknown=symbol('unknown','Other/Sample/Public/Unknown.h')
        nodes=[module,public,private,generated,unknown]
        annotate(nodes)
        self.assertTrue(module['attrs']['source_sections'])
        self.assertFalse(public['attrs']['source_partition']['collapsed'])
        self.assertEqual(public['attrs']['source_partition']['label'],'Public')
        self.assertEqual(private['attrs']['source_partition']['folders'],['Tests'])
        self.assertTrue(private['attrs']['source_partition']['collapsed'])
        self.assertFalse(generated['attrs']['source_partition']['collapsed'])
        self.assertNotIn('source_partition',unknown['attrs'])
        self.assertEqual(public['parent'],'m')
        self.assertEqual(public['attrs']['source_partition'].get('file'),{'root':'project','path':'Source/Sample/Public/Record.h'})
        self.assertEqual(generated['attrs']['source_partition'].get('file'),{'root':'project','path':'Source/Sample/Public/Record.h'})

    def test_namespace_and_shared_header_ownership_stay_canonical(self):
        nodes=[{'id':'m','parent':None,'level':'module','source':{'root':'project','path':'Source/A/A.Build.cs'}},
               {'id':'ns','parent':'m','level':'namespace'},
               {'id':'c','parent':'ns','level':'class','source':{'root':'project','path':'Source/A/Public/C.h'}},
               {'id':'method','parent':'c','level':'function','source':{'root':'project','path':'Source/A/Private/C.cpp'}}]
        annotate(nodes)
        self.assertTrue(nodes[1]['attrs']['source_sections'])
        self.assertEqual(nodes[2]['parent'],'ns')
        self.assertEqual(nodes[3]['parent'],'c')
        self.assertNotIn('source_sections',nodes[2]['attrs'])

    def test_mixed_namespaces_stay_exposed_and_private_namespaces_keep_real_folder_context(self):
        def node(identity,parent,level,path=None):
            value={'id':identity,'parent':parent,'level':level}
            if path:value['source']={'root':'project','path':'Source/A/'+path}
            return value
        nodes=[node('m',None,'module','A.Build.cs'),node('mixed','m','namespace'),
               node('api','mixed','class','Public/API.h'),node('helper','mixed','function','Private/Helper.cpp'),
               node('tests','m','namespace'),node('test','tests','class','Private/Tests/Fixture.h')]
        annotate(nodes)
        self.assertNotIn('source_partition',nodes[1]['attrs'])
        self.assertEqual(nodes[4]['attrs']['source_partition']['folders'],['Tests'])
        self.assertTrue(nodes[4]['attrs']['source_partition']['collapsed'])

    def test_header_identity_aggregates_only_uniform_scopes_and_distinguishes_equal_basenames(self):
        def node(identity,parent,level,path=None):
            value={'id':identity,'parent':parent,'level':level}
            if path:value['source']={'root':'project','path':'Source/A/'+path}
            return value
        nodes=[node('m',None,'module','A.Build.cs'),node('uniform','m','namespace'),
               node('a','uniform','class','Public/One/API.h'),node('b','uniform','class','Public/One/API.h'),
               node('mixed','m','namespace'),node('c','mixed','class','Public/One/API.h'),
               node('d','mixed','class','Public/Two/API.h'),node('internal','m','class','Private/Detail.h'),
               node('nested','internal','class','Private/Detail.h')]
        annotate(nodes)
        self.assertEqual(nodes[1]['attrs']['source_partition'].get('file'),{'root':'project','path':'Source/A/Public/One/API.h'})
        self.assertNotIn('file',nodes[4]['attrs']['source_partition'])
        self.assertNotEqual(nodes[5]['attrs']['source_partition'].get('file'),nodes[6]['attrs']['source_partition'].get('file'))
        self.assertEqual(nodes[7]['attrs']['source_partition'].get('file'),{'root':'project','path':'Source/A/Private/Detail.h'})
        self.assertEqual(nodes[8]['parent'],'internal')
