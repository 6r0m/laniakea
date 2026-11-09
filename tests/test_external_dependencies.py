# SPDX-License-Identifier: AGPL-3.0-or-later
"""External ownership and exact declarations survive native endpoint abstraction."""

import json
import tempfile
import unittest
from pathlib import Path

from laniakea import LaniakeaError, schema
from laniakea.unreal import graph, symbols
from laniakea.unreal.external import SourceLocations, action_providers


class ExternalDependencies(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.project = self.base / 'project/Sample.uproject'
        self.source = self.project.parent / 'Source/Sample'
        self.source.mkdir(parents=True)
        self.project.write_text('{"Modules":[{"Name":"Sample"}]}')
        self.engine = self.base / 'EngineRoot'
        self.exported = {'Modules': {'Sample': {'Directory': str(self.source),
                                                'Rules': str(self.source / 'Sample.Build.cs')}}}

    def fact(self, identity, file, **extra):
        return {'usr': identity, 'name': identity, 'level': 'class', 'signature': identity,
                'file': str(file), 'line': 7, 'column': 3, 'parent': None, 'scope': '', 'definition': True, **extra}

    def merge(self, targets, references=None, providers=()):
        source = self.fact('SampleDerived', self.source / 'Sample.h')
        batch = {'symbols': [source, *targets], 'references': references or [], 'diagnostics': [],
                 'relations': [{'source': source['usr'], 'target': t['usr'], 'type': 'inherits'} for t in targets if t['level']=='class']}
        built, _ = graph.build(self.project, self.engine, self.exported)
        self.locations = SourceLocations(self.project.parent, self.engine, providers)
        result, unknown = symbols.merge(built, [batch, batch], self.project, self.project.parent, self.engine, self.exported,
                                        locations=self.locations)
        schema.validate(result)
        self.assertEqual(unknown, {'source': 0, 'target': 0})
        return result

    def test_distinct_external_bases_keep_identity_and_header_after_collapse(self):
        targets = [self.fact('SampleSdkBase', self.base / 'sdk/include/Base.h'),
                   self.fact('SampleOtherBase', self.base / 'other/include/Base.h')]
        result = self.merge(targets)
        inherits = [e for e in result['edges'] if e['type'] == 'inherits']
        self.assertEqual(len(inherits), 2, 'different external bases must not deduplicate by their collapsed endpoint')
        self.assertEqual({e['attrs']['symbol'] for e in inherits}, {'SampleSdkBase', 'SampleOtherBase'})
        self.assertEqual(len({e['attrs']['target_declaration']['id'] for e in inherits}), 2)
        for edge in inherits:
            self.assertEqual(edge['attrs']['target_declaration']['location']['line'], 7)
            self.assertTrue(edge['attrs']['target_declaration']['location']['path'].endswith('Base.h'))
            self.assertEqual(edge['attrs']['location']['path'], 'Source/Sample/Sample.h')

    def test_external_reference_retains_target_location_beside_its_project_call_site(self):
        target = self.fact('SampleApi', self.base / 'sdk/include/Api.h', level='function', signature='SampleApi()')
        ref = {'source': 'SampleDerived', 'target': 'SampleApi', 'role': 4, 'file': str(self.source / 'Sample.cpp'),
               'line': 29, 'column': 11, 'implicit': False, 'call_confirmed': True}
        result = self.merge([target], [ref])
        edge = next(e for e in result['edges'] if e['type'] == 'calls')
        self.assertEqual(edge['attrs']['location']['line'], 29)
        self.assertEqual(edge['attrs'].get('target_declaration', {}).get('location', {}).get('line'), 7)

    def test_engine_third_party_has_real_containment_without_indexing_its_internals(self):
        target = self.fact('SampleVendorBase', self.engine / 'Engine/Source/ThirdParty/SampleVendor/include/Base.h')
        result = self.merge([target]); nodes = {n['id']: n for n in result['nodes']}
        edge = next(e for e in result['edges'] if e['type'] == 'inherits')
        destination = nodes[edge['target']]
        self.assertEqual(destination['label'], 'SampleVendor')
        self.assertEqual(nodes[destination['parent']]['label'], 'ThirdParty')
        self.assertEqual(nodes[destination['parent']]['parent'], 'engine')
        self.assertTrue(destination['boundary'])
        self.assertFalse(any(n['boundary'] and n['level'] in {'class', 'function'} for n in result['nodes']))

    def test_engine_group_ids_cannot_alias_project_plugin_folders(self):
        plugin = self.project.parent / 'Plugins/engine/ThirdParty/SampleOwned/SampleOwned.uplugin'
        plugin.parent.mkdir(parents=True); plugin.write_text('{"Modules":[]}')
        result = self.merge([self.fact('SampleVendorBase', self.engine / 'Engine/Source/ThirdParty/SampleVendor/Base.h')])
        nodes = {n['id']: n for n in result['nodes']}
        target = next(e['target'] for e in result['edges'] if e['type']=='inherits')
        self.assertTrue(nodes[nodes[target]['parent']]['boundary'], 'Engine grouping cannot acquire a same-named project owner')

    def test_foreign_exported_module_is_not_implicitly_engine_owned(self):
        directory = self.base / 'vendor/SampleVendor'
        self.exported['Modules']['SampleVendor'] = {'Directory': str(directory), 'Rules': str(directory / 'SampleVendor.Build.cs')}
        result = self.merge([self.fact('SampleVendorBase', directory / 'Public/Base.h')])
        nodes = {n['id']: n for n in result['nodes']}
        target = next(e['target'] for e in result['edges'] if e['type'] == 'inherits')
        self.assertEqual(target, 'module:SampleVendor')
        parent = nodes[target]['parent']
        self.assertNotEqual(parent, 'engine', 'foreign module roots need provider evidence, not an Engine fallback')
        self.assertTrue(nodes[parent]['boundary'])

    def test_action_roots_evidence_groups_shared_compiler_and_sdk_targets(self):
        compiler, sdk = self.base / 'compiler', self.base / 'sdk'
        providers = action_providers({'Actions': [{'Type': 'Compile', 'RootPaths': {
            'Lookup': [{'Root': 'Compiler', 'Path': str(compiler)}, {'Root': 'WinSDK', 'Path': str(sdk)}],
            'Names': [{'Root': 'Compiler', 'Name': 'SampleCompiler'}]}}]}, self.base / 'llvm')
        targets = [self.fact('CompilerType', compiler / 'include/Types.h'),
                   self.fact('CompilerPeer', compiler / 'include/Peer.h'), self.fact('SdkType', sdk / 'include/Types.h')]
        result = self.merge(targets, providers=providers); nodes = {n['id']: n for n in result['nodes']}
        destinations = [nodes[e['target']] for e in result['edges']]
        self.assertEqual({n['label'] for n in destinations}, {'SampleCompiler toolchain', 'Windows SDK'})
        self.assertEqual(len({n['id'] for n in destinations}), 2, 'one provider must be shared by its references')
        self.assertTrue(all(nodes[n['parent']]['label'] == 'Toolchains & SDKs' for n in destinations))
        for edge in result['edges']:
            location = edge['attrs']['target_declaration']['location']
            self.assertIn(location['root'], self.locations.roots)
            self.assertEqual(location['path'], 'include/' + ('Peer.h' if edge['attrs']['symbol'] == 'CompilerPeer' else 'Types.h'))
        fallback = self.merge([targets[-1]])
        self.assertEqual(fallback['edges'][0]['target'], 'external:cpp', 'an SDK-looking filename alone proves no provider')

    def test_invalid_or_conflicting_provider_inputs_fail_explicitly(self):
        for provider in [{'root': 'relative', 'label': 'SDK', 'evidence': 'UBT'}, {'root': str(self.base)}]:
            with self.assertRaises(LaniakeaError):
                SourceLocations(self.project.parent, self.engine, [provider])
        provider = {'root': str(self.base / 'sdk'), 'label': 'SDK', 'evidence': 'UBT'}
        with self.assertRaisesRegex(LaniakeaError, 'conflicting'):
            SourceLocations(self.project.parent, self.engine, [provider, {**provider, 'label': 'Other owner'}])

    def test_foreign_module_under_a_recorded_provider_keeps_one_module_identity(self):
        sdk = self.base / 'sdk'; directory = sdk / 'SampleModule'
        self.exported['Modules']['SampleModule'] = {'Directory': str(directory), 'Rules': str(directory / 'SampleModule.Build.cs')}
        providers = [{'root': str(sdk), 'label': 'Sample SDK', 'evidence': 'recorded SDK root'}]
        result = self.merge([self.fact('SampleSdkBase', directory / 'Base.h')], providers=providers)
        nodes = {n['id']: n for n in result['nodes']}
        module = nodes['module:SampleModule']
        self.assertEqual(nodes[module['parent']]['label'], 'Sample SDK')
        self.assertEqual(nodes[nodes[module['parent']]['parent']]['label'], 'Toolchains & SDKs')
        self.assertIn(module['source']['root'], self.locations.roots)
        self.assertNotIn('external:cpp', nodes, 'provider enrichment cannot leave an empty unknown constellation')

    def test_compiler_facility_is_not_reported_as_a_missing_build_module_dependency(self):
        compiler = self.base / 'compiler'
        target = self.fact('SampleIntrinsic', compiler / 'include/Intrinsic.h', level='function', signature='SampleIntrinsic()')
        ref = {'source':'SampleDerived','target':'SampleIntrinsic','role':4,'file':str(self.source / 'Sample.cpp'),
               'line':29,'column':11,'implicit':False,'call_confirmed':True}
        result = self.merge([target],[ref],[{'root':str(compiler),'label':'Compiler','evidence':'UBT compiler root'}])
        self.assertNotIn('dependency_review',result['edges'][0]['attrs'])

    def test_exact_declaration_contract_rejects_invalid_metadata(self):
        result = self.merge([self.fact('SdkType', self.base / 'sdk/Types.h')])
        edge = result['edges'][0]
        for invalid in [{'id': 42}, {'id': 'sample', 'location': {'root': 'sdk'}},
                        {'id': 'sample', 'column': 'not-a-column'}]:
            broken = json.loads(json.dumps(edge)); broken['attrs']['target_declaration'] = invalid
            with self.assertRaises(LaniakeaError):
                schema.validate(broken, 'edge')


if __name__ == '__main__':
    unittest.main()
