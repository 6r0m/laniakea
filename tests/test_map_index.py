# SPDX-License-Identifier: AGPL-3.0-or-later
"""The browser receives topology; exact, attributed references remain exhaustively pageable."""

import json
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

from laniakea import LaniakeaError, schema
from laniakea import map_index
from laniakea.workspace import Workspace, read_json, write_json


class MapIndex(unittest.TestCase):
    def test_file_provenance_splits_compact_groups_without_splitting_symbols(self):
        self.graph=read_json(Path(__file__).resolve().parent.parent/'fixtures/source-surface.graph.json')
        before=json.dumps(self.graph);index=self.build();topology=index.topology();files=topology['files']
        self.assertEqual(json.dumps(self.graph),before)
        calls=[r for r in topology['references'] if r['type']=='calls']
        self.assertEqual(len(calls),2,'call sites in different files must remain separately pageable groups')
        self.assertEqual({files[r['source_file']]['path'] for r in calls},
                         {'Source/Sample/Private/Producer.cpp','Source/Sample/Private/Other.cpp'})
        producer=next(f for f in files if f['path'].endswith('Producer.cpp'))
        public=next(f for f in files if f['path'].endswith('Public/API.h'))
        self.assertEqual(public['partition']['label'],'Public')
        self.assertEqual(producer['definitions'],[3]);self.assertEqual(producer['partition']['id'],'private')
        self.assertEqual(files[calls[0]['target_file']]['path'],'Source/Sample/Private/Helpers.cpp')
        self.assertNotIn('source_file',next(r for r in topology['references'] if r['type']=='depends.private'))
        self.assertEqual(sum(r['count'] for r in topology['references']),3)
        for group,row in enumerate(topology['references'],1):
            page=index.references({'groups':[group]})
            self.assertEqual(page['total'],row['count'])
            self.assertEqual(page['items'][0]['reference']['source'],'module' if row['type']=='depends.private' else 'method')

        for key,value in [('owner',100),('definitions',[100])]:
            broken=json.loads(json.dumps(topology));broken['files'][0][key]=value
            with self.assertRaisesRegex(LaniakeaError,'membership'):schema.validate(broken,'map')
        broken=json.loads(json.dumps(topology));broken['references'][0]['source_file']=-1
        with self.assertRaisesRegex(LaniakeaError,'file index'):schema.validate(broken,'map')

    def test_generated_declaration_falls_back_to_authored_file_without_inventing_build_file_targets(self):
        self.graph=read_json(Path(__file__).resolve().parent.parent/'fixtures/source-surface.graph.json')
        self.graph['nodes'][2]['attrs']['declaration']={'root':'project','path':'Intermediate/API.generated.h','line':1}
        self.graph['edges'][0]['target']='module'
        self.graph['edges'][0]['attrs']['target_declaration']['location']={'root':'project','path':'Intermediate/Generated.h','line':1}
        topology=self.build().topology()
        api=next(f for f in topology['files'] if f['path'].endswith('Public/API.h'))
        self.assertIn(2,api['declarations'])
        self.assertFalse(any(f['path'].endswith('.Build.cs') for f in topology['files']))
        self.assertNotIn('target_file',topology['references'][0])

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.graph = read_json(Path(__file__).resolve().parent.parent / 'fixtures/generic.graph.json')
        self.graph['edges'] += [
            {'id':f'call-{n}', 'source':'app.core.db', 'target':'app.web.views', 'type':'calls',
             'status':'resolved', 'origin':'compiler', 'attrs':{'location':{'root':'project','path':'Source/Sample.cpp','line':n+1},
                                                           'signature':'SampleCall(int value)'}}
            for n in range(1000)]

    def build(self):
        destination = self.root / 'index'
        map_index.build(self.graph, destination)
        return map_index.MapIndex(destination)

    def test_internal_and_explicit_self_references_keep_separate_groups_and_exact_metadata(self):
        base = {'id':'internal','source':'app.core.db','target':'app.core.db','type':'calls',
                'status':'resolved','origin':'compiler'}
        self.graph['edges'] = [{**base,'internal_to_owner':True}, {**base,'id':'explicit'}]
        index = self.build()
        rows = index.topology()['references']
        self.assertEqual(len(rows),2,'abstraction classification must survive compact grouping')
        self.assertEqual(sorted(bool(r.get('internal_to_owner')) for r in rows),[False,True])
        self.assertEqual([item['reference'] for item in index.references({'node':'app.core.db'})['items']],self.graph['edges'])
        self.graph['edges'][0]['target']='app.web.views'
        for value,definition in [(self.graph,None),(self.graph['edges'][0],'edge'),
                                 ({'source':0,'target':1,'type':'calls','count':1,'internal_to_owner':True},'referenceGroup')]:
            with self.subTest(definition=definition),self.assertRaisesRegex(LaniakeaError,'internal'):
                schema.validate(value,definition)

    def test_small_topology_preserves_counts_and_pages_every_exact_reference(self):
        before = json.dumps(self.graph)
        index = self.build()
        topology = index.topology()
        schema.validate(topology, 'map')
        self.assertEqual(sum(r['count'] for r in topology['references']), len(self.graph['edges']))
        self.assertLess(len(json.dumps(topology)),len(before)/4)
        cursor, found, groups = 0, [], set()
        while True:
            page = index.references({'node':'app.core', 'direction':'outgoing', 'types':['calls'], 'cursor':cursor, 'limit':17})
            schema.validate(page, 'referencePage')
            found += [item['reference'] for item in page['items']]
            groups.update(item['group'] for item in page['items'])
            self.assertEqual(page['total'],1000)
            cursor = page['next_cursor']
            if cursor is None:
                break
        self.assertEqual(found,self.graph['edges'][-1000:])
        self.assertEqual(len(groups),1)
        self.assertEqual(json.dumps(self.graph),before)

    def test_direction_exact_endpoints_filters_and_unknown_queries(self):
        index = self.build()
        outgoing = index.references({'node':'app.core.db','direction':'outgoing','types':['calls']})
        incoming = index.references({'node':'app.web','direction':'incoming','types':['calls']})
        within = index.references({'node':'app','direction':'within','types':['calls']})
        self.assertEqual([outgoing['total'],incoming['total'],within['total']],[1000]*3)
        self.assertEqual(index.references({'source':'app.core','target':'app.web','source_tree':True,
                                           'target_tree':True,'types':['calls']})['total'],1000)
        self.assertEqual(index.references({'source':'app.core','target':'app.web','types':['calls']})['total'],0)
        for query in ({'node':'missing'},{'node':'app','direction':'unknown'},{'node':'app','limit':100000},
                      {'node':'app','cursor':-1},{'node':'app','direction':[]},{'node':'app','cursor':2**64}):
            with self.subTest(query=query), self.assertRaises(ValueError):
                index.references(query)

    def test_selected_group_sets_are_pageable_without_writing_the_immutable_index(self):
        index = self.build()
        group = next(n+1 for n,row in enumerate(index.topology()['references']) if row['type']=='calls')
        before = map_index._digest(index.root / 'references.sqlite')
        page = index.references({'groups':[group],'limit':10})
        self.assertEqual(page['total'],1000)
        self.assertEqual(len(page['items']),10)
        self.assertEqual(map_index._digest(index.root / 'references.sqlite'),before)
        for groups in ([group,group],[0],[group+10000],['1']):
            with self.subTest(groups=groups),self.assertRaises(ValueError):
                index.references({'groups':groups})

    def test_distinct_external_declaration_identities_survive_one_compact_group(self):
        base = {'source':'app.core.db','target':'stdlib','type':'inherits','status':'resolved','origin':'compiler'}
        self.graph['edges'] = [{**base,'id':'base-'+str(n),'attrs':{'symbol':'SampleBase'+str(n),
            'target_declaration':{'id':'native-'+str(n),'location':{'root':'sample-sdk','path':'include/Base.h','line':n+1}}}}
            for n in range(2)]
        index = self.build(); topology = index.topology()
        self.assertEqual(len(topology['references']),1)
        self.assertEqual(topology['references'][0]['count'],2)
        page = index.references({'groups':[1]}); schema.validate(page,'referencePage')
        self.assertEqual([item['reference'] for item in page['items']],self.graph['edges'])

    def test_content_bound_cache_reuses_a_complete_index_and_failure_keeps_it(self):
        workspace = Workspace(self.root / 'workspace')
        run = workspace.target_dir('sample') / 'runs/one'
        write_json(run / 'graph.json',self.graph)
        first = map_index.ensure(workspace,'sample',run)
        again = map_index.ensure(workspace,'sample',run)
        self.assertEqual(first.root,again.root)
        original = first.topology()
        broken = {**self.graph,'edges':[*self.graph['edges'],{**self.graph['edges'][0],'id':'bad','target':'missing'}]}
        write_json(run / 'graph.json',broken)
        with self.assertRaises(LaniakeaError):
            map_index.ensure(workspace,'sample',run)
        self.assertEqual(first.topology(),original)
        self.assertFalse((workspace.target_dir('sample') / 'latest.json').exists())

    def test_invalid_containment_and_colliding_ids_are_refused(self):
        original = json.dumps(self.graph)
        for mutation in ('cycle','node','edge'):
            self.graph=json.loads(original)
            if mutation=='cycle':self.graph['nodes'][0]['parent']='app.core.db'
            if mutation=='node':self.graph['nodes'].append(self.graph['nodes'][0])
            if mutation=='edge':self.graph['edges'].append(self.graph['edges'][0])
            with self.subTest(mutation=mutation), self.assertRaises(LaniakeaError):
                map_index.build(self.graph,self.root / mutation)

    def test_cache_marker_cannot_make_validation_read_outside_its_index(self):
        index = self.build()
        marker = read_json(index.root / 'cache.json')
        outside = self.root / 'outside.txt'
        outside.write_text('synthetic data outside the cache')
        marker['files']['../outside.txt'] = map_index._digest(outside)
        write_json(index.root / 'cache.json',marker)
        with patch('laniakea.map_index._digest',wraps=map_index._digest) as digest:
            with self.assertRaises(LaniakeaError):
                map_index.MapIndex(index.root,verify=True)
            digest.assert_not_called()
