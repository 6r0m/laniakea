# SPDX-License-Identifier: AGPL-3.0-or-later
"""Review concerns survive location drift; evidence and operator decisions have separate owners."""

import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from laniakea import map_index
from laniakea.workspace import Workspace, read_json, write_json, writer_lock


def fixture(native=True):
    nodes = [{'id': 'project', 'level': 'project', 'label': 'Sample', 'parent': None,
              'boundary': False, 'status': 'in-target'}]
    for name in 'ABC':
        nodes.append({'id': name, 'level': 'module', 'label': 'Sample'+name, 'parent': 'project',
                      'boundary': False, 'status': 'in-target'})
    nodes += [{'id': 'function'+name, 'level': 'function', 'label': 'Run', 'parent': name,
               'boundary': False, 'status': 'in-target'} for name in 'AC']
    edges = [{'id': a+b, 'source': a, 'target': b, 'type': 'depends.private', 'status': 'declared',
              'origin': 'ubt'} for a, b in [('A', 'B'), ('B', 'A')]]
    if native:
        edges.append({'id': 'call-at-10', 'source': 'functionA', 'target': 'functionC', 'type': 'calls',
                      'status': 'resolved', 'origin': 'compiler', 'attrs': {
                          'dependency_review': 'No direct build dependency; review usage (not a violation)',
                          'transitive_path': [], 'public_exposure_path': [],
                          'location': {'root': 'project', 'path': 'Source/Sample.cpp', 'line': 10}, 'column': 3}})
    manifest = {'profile': 'unreal', 'target': {'name': 'SampleEditor', 'platform': 'Win64',
                                             'configuration': 'Development'},
                'sources': [{'id': 'ubt'}, *([{'id': 'compiler'}] if native else [])],
                'coverage': {'analysed': [], 'not_analysed': ['Engine internals']}}
    return {'schema': 'laniakea.graph/1', 'nodes': nodes, 'edges': edges}, manifest


class ReviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.workspace = Workspace(Path(self.temp.name))
        self.graph, self.manifest = fixture()
        self.run = self.workspace.target_dir('sample')/'runs'/'one'
        self.run.mkdir(parents=True)
        write_json(self.run/'manifest.json', self.manifest)
        self.serial = 0

    def service(self):
        from laniakea.review_store import Review
        self.serial += 1
        destination = Path(self.temp.name)/('index'+str(self.serial))
        map_index.build(self.graph, destination)
        return Review(self.workspace, 'sample', self.run, map_index.MapIndex(destination))

    def policy(self, rules):
        write_json(self.workspace.target_dir('sample')/'review'/'rules.json', {'version': 1, 'rules': rules})

    def test_candidate_cycle_and_native_note_have_current_exact_witnesses(self):
        service = self.service()
        report = service.page({})
        self.assertEqual(len(report['items']), 2)
        cycle = next(f for f in report['items'] if f['kind'] == 'cycles')
        self.assertEqual(cycle['subjects'], ['A', 'B'])
        self.assertEqual(cycle['severity'], 'candidate')
        self.assertEqual({w['id'] for w in cycle['witnesses']}, {'AB', 'BA'})
        native = next(f for f in report['items'] if f['kind'] == 'native')
        self.assertEqual(native['subjects'], ['A', 'C'])
        for finding in report['items']:
            for witness in finding['witnesses']:
                row = service.index.references(witness['query'])['items'][0]['reference']
                self.assertEqual(row['id'], witness['id'])
        self.assertTrue(any(c['status'] == 'partial' for c in report['checks']))

    def test_explicit_policy_is_required_for_red_and_resolves_scope(self):
        self.policy([{'id': 'domain-no-ui', 'kind': 'forbidden', 'source': {'ids': ['A']},
                      'target': {'ids': ['B']}, 'reason': 'Keep the sample boundary',
                      'types': ['depends.private']}])
        page = self.service().page({})
        self.assertEqual(len(page['items']), 1)
        finding = page['items'][0]
        self.assertEqual(finding['severity'], 'violation')
        self.assertEqual(finding['subjects'], ['A', 'B'])
        self.assertEqual(page['checks'][0]['matched']['source'], ['A'])
        self.policy([{'id': 'acyclic', 'kind': 'cycles', 'scope': {'ids': ['A', 'B']}, 'acyclic': True}])
        self.assertEqual(self.service().page({})['items'][0]['severity'], 'violation')

    def test_hub_diamond_descriptors_calls_and_partial_edges_are_not_build_cycles(self):
        self.graph['edges'] = [dict(self.graph['edges'][0], id=a+b, source=a, target=b)
                               for a,b in [('A','B'), ('A','C'), ('B','C')]]
        self.assertFalse(self.service().page({})['items'])
        for kind, status in [('requires','declared'), ('calls','resolved'), ('depends.private','partial')]:
            graph = copy.deepcopy(self.graph)
            self.graph['edges'].append(dict(self.graph['edges'][0], id='reverse', source='C', target='A',
                                            type=kind, status=status))
            self.assertFalse(self.service().page({})['items'])
            self.graph = graph

    def test_acknowledgement_counts_reopen_revision_and_refusal(self):
        service = self.service(); page = service.page({}); finding = page['items'][0]
        patch_value = {'action': 'triage', 'report': page['report'], 'revision': page['revision'],
                       'finding': finding['id'], 'state': 'accepted', 'reason': 'Intentional sample'}
        service.update(patch_value)
        active = service.page({})
        self.assertEqual(active['total'], 1)
        self.assertEqual(active['counts']['acknowledged'], 1)
        all_items = service.page({'ack': True})
        self.assertEqual(len(all_items['items']), 2)
        before = service.triage.path.read_bytes()
        with self.assertRaisesRegex(ValueError, 'revision'):
            service.update(patch_value)
        self.assertEqual(service.triage.path.read_bytes(), before)
        service.update({**patch_value, 'revision': active['revision'], 'state': 'active'})
        self.assertEqual(service.page({})['total'], 2)

    def test_location_raw_ids_and_extra_calls_preserve_triage_but_dependency_change_reopens(self):
        service = self.service(); page = service.page({})
        finding = next(f for f in page['items'] if f['kind'] == 'native')
        service.update({'action': 'triage', 'report': page['report'], 'revision': page['revision'],
                        'finding': finding['id'], 'state': 'not-relevant', 'reason': ''})
        call = self.graph['edges'][-1]
        call['id'] = 'call-at-11'; call['attrs']['location']['line'] = 11; call['attrs']['column'] = 8
        self.graph['nodes'][-2]['id']='lambda-at-11'
        call['source']='lambda-at-11'
        self.graph['edges'].append({**copy.deepcopy(call), 'id': 'second-call'})
        self.graph['edges'].reverse(); self.graph['nodes'].reverse()
        moved_service=self.service();moved=moved_service.page({'ack': True})
        current = next(f for f in moved['items'] if f['kind'] == 'native')
        self.assertEqual(current['id'], finding['id'])
        self.assertEqual(current['triage'], 'not-relevant')
        self.assertEqual(current['count'], 2)
        self.assertNotEqual(current['witnesses'][0]['id'], 'call-at-10')
        for witness in current['witnesses']:
            self.assertEqual(moved_service.index.references(witness['query'])['items'][0]['reference']['source'],
                             'lambda-at-11')
        self.graph['edges'].append({'id': 'new-context', 'source': 'A', 'target': 'B',
                                    'type': 'depends.public', 'status': 'declared', 'origin': 'ubt'})
        changed = next(f for f in self.service().page({})['items'] if f['kind'] == 'native')
        self.assertEqual(changed['triage'], 'active')
        self.assertIn('changed', changed['reopened'])

    def test_module_only_unavailable_and_invalid_policy_do_not_become_clean(self):
        self.graph, self.manifest = fixture(False)
        write_json(self.run/'manifest.json', self.manifest)
        self.assertTrue(any(c['status'] == 'unavailable' for c in self.service().page({})['checks']))
        self.policy([{'id': 'bad', 'kind': 'forbidden', 'source': {'ids': ['missing']},
                      'target': {'ids': ['B']}}])
        report = self.service().page({})
        self.assertEqual(report['checks'][0]['status'], 'unavailable')
        self.policy([{'id': 'bad', 'kind': 'cycles', 'surprise': True}])
        with self.assertRaisesRegex(ValueError, 'unknown'):
            self.service().page({})

    def test_cache_reuse_corruption_and_policy_recheck(self):
        service = self.service(); initial = service.page({})
        with patch.object(service.index, 'iter_references', side_effect=AssertionError('repeated scan')):
            self.assertEqual(service.page({})['report'], initial['report'])
        service.cache_path.write_text('{broken', encoding='utf-8')
        service.current = None
        self.assertEqual(service.page({})['report'], initial['report'])
        self.policy([])
        service.update({'action': 'recheck'})
        self.assertEqual(service.page({})['total'], 0)

    def test_corrupt_triage_is_not_silently_empty_or_replaced(self):
        service = self.service(); service.page({})
        service.triage.path.write_text('{broken', encoding='utf-8')
        before = service.triage.path.read_bytes()
        with self.assertRaises((ValueError, OSError)):
            service.page({})
        self.assertEqual(service.triage.path.read_bytes(), before)

    def test_large_cycle_has_one_bounded_witness_and_no_recursion_limit(self):
        from laniakea import review
        nodes=[{'id':str(n),'level':'module','label':'Sample'+str(n),'parent':None,
                'boundary':False,'status':'in-target'} for n in range(1500)]
        rows=({'seq':n+1,'reference':{'id':str(n),'source':str(n),'target':str((n+1)%1500),
                                    'type':'imports','status':'declared','origin':'test'}} for n in range(1500))
        result=review.evaluate(nodes,rows,{'profile':'generic','target':{},'edge_types':[{'id':'imports'}]},
                               {'version':1,'rules':[{'id':'cycle','kind':'cycles','types':['imports']}]})
        [finding]=result['findings']
        self.assertEqual(len(finding['subjects']),1500)
        self.assertEqual(finding['count'],1500)
        self.assertEqual(finding['witness_total'],1500)
        self.assertEqual(len(finding['witnesses']),8)

    def test_duplicate_observations_preserve_counts_without_creating_more_findings(self):
        self.graph['edges'].append({**self.graph['edges'][0], 'id':'another-declaration'})
        cycle=next(f for f in self.service().page({})['items'] if f['kind']=='cycles')
        self.assertEqual(cycle['count'],3)

    def test_rejected_atomic_write_preserves_decisions_and_unknown_actions_refuse(self):
        service=self.service(); page=service.page({}); finding=page['items'][0]
        request={'action':'triage','report':page['report'],'revision':page['revision'],
                 'finding':finding['id'],'state':'accepted','reason':''}
        service.update(request); before=service.triage.path.read_bytes()
        request['revision']=service.page({})['revision']
        with patch('laniakea.workspace.os.replace',side_effect=PermissionError('Synthetic refusal')):
            with self.assertRaises(PermissionError):service.update({**request,'state':'active'})
        self.assertEqual(service.triage.path.read_bytes(),before)
        for changes in ({'state':[]},{'action':'unknown'},{'finding':'unknown'},{'reason':'x'*2001}):
            with self.assertRaises(ValueError):service.update({**request,**changes})

    def test_collapsed_ancestor_pages_findings_and_unknown_edge_family_is_unavailable(self):
        service=self.service(); page=service.page({'node':'project'})
        self.assertEqual(page['total'],2)
        self.assertEqual(page['affected'],{})
        self.policy([{'id':'unsupported','kind':'cycles','types':['not-recorded']}])
        self.assertEqual(self.service().page({})['checks'][0]['status'],'unavailable')

    def test_equivalent_policy_order_and_explicit_defaults_preserve_acknowledgement(self):
        self.policy([{'id':'ordered','kind':'cycles','scope':{'ids':['A','B']}}])
        service=self.service();page=service.page({});finding=page['items'][0]
        service.update({'action':'triage','report':page['report'],'revision':0,'finding':finding['id'],
                        'state':'accepted','reason':''})
        self.policy([{'id':'ordered','kind':'cycles','scope':{'ids':['B','A']},'acyclic':False,
                      'types':['depends.private','depends.public'],'enabled':True,'reason':'Clarified wording'}])
        self.assertEqual(self.service().page({'ack':True})['items'][0]['triage'],'accepted')

    def test_explicit_unanalysed_modules_disclose_partial_applicability(self):
        self.graph['nodes'][1]['status']='not-in-target'
        self.policy([{'id':'scope','kind':'cycles','scope':{'ids':['A','B']}}])
        self.assertEqual(self.service().page({})['checks'][0]['status'],'partial')

    def test_sample_policy_example_matches_the_executable_contract(self):
        from laniakea.review_policy import validate
        validate(read_json(Path(__file__).resolve().parent.parent/'fixtures/review.rules.json'))

    def test_forbidden_direction_exclusions_and_disabled_rules_preserve_decisions(self):
        rule={'id':'boundary','kind':'forbidden','source':{'ids':['A']},'target':{'ids':['C']}}
        self.policy([rule]);self.assertEqual(self.service().page({})['total'],0)
        rule['target']={'ids':['B']};self.policy([rule])
        service=self.service();page=service.page({});finding=page['items'][0]
        service.update({'action':'triage','report':page['report'],'revision':0,'finding':finding['id'],
                        'state':'accepted','reason':''})
        before=service.triage.path.read_bytes()
        self.policy([{**rule,'source':{'label_glob':'Sample*','exclude':['A','B','C']}}])
        excluded=self.service().page({})
        self.assertEqual(excluded['total'],0);self.assertEqual(excluded['checks'][0]['status'],'unavailable')
        self.policy([{**rule,'enabled':False}]);self.assertEqual(self.service().page({})['total'],0)
        self.assertEqual(service.triage.path.read_bytes(),before)
        self.policy([rule]);self.assertEqual(self.service().page({'ack':True})['items'][0]['triage'],'accepted')

    def test_native_path_existence_is_semantic_but_selected_path_is_not(self):
        attrs=self.graph['edges'][-1]['attrs'];attrs['transitive_path']=['SampleA','SampleB','SampleC']
        service=self.service();page=service.page({});finding=next(f for f in page['items'] if f['kind']=='native')
        service.update({'action':'triage','report':page['report'],'revision':0,'finding':finding['id'],
                        'state':'accepted','reason':''})
        attrs['transitive_path']=['SampleA','SampleOther','SampleC']
        current=next(f for f in self.service().page({'ack':True})['items'] if f['kind']=='native')
        self.assertEqual(current['triage'],'accepted')
        attrs['transitive_path']=[]
        current=next(f for f in self.service().page({'ack':True})['items'] if f['kind']=='native')
        self.assertEqual(current['triage'],'active')

    def test_report_identity_binds_loaded_code_not_later_worktree_edits(self):
        service=self.service();before=service.page({})['report'];service.current=None
        original=Path.read_text
        def edited(path,*args,**kwargs):
            return 'Different code on disk, not loaded by this server' if path.suffix=='.py' else original(path,*args,**kwargs)
        with patch.object(Path,'read_text',edited):
            self.assertEqual(service.page({})['report'],before)

    def test_another_process_cannot_overwrite_a_locked_decision_store(self):
        service=self.service();page=service.page({});finding=page['items'][0]
        request={'revision':0,'state':'accepted','reason':'Synthetic cross-process control'}
        program='import sys,json; from laniakea.review_store import Triage; Triage(sys.argv[1]).update(json.loads(sys.argv[2]),json.loads(sys.argv[3]))'
        command=[sys.executable,'-c',program,str(service.root),json.dumps(request),json.dumps(finding)]
        with writer_lock(service.triage.path.with_suffix('.lock'),'Synthetic lock'):
            rejected=subprocess.run(command,capture_output=True,text=True,timeout=15,creationflags=subprocess.CREATE_NO_WINDOW)
        self.assertNotEqual(rejected.returncode,0)
        self.assertIn('Review decisions are being updated',rejected.stderr)
        self.assertFalse(service.triage.path.exists())
        accepted=subprocess.run(command,capture_output=True,text=True,timeout=15,creationflags=subprocess.CREATE_NO_WINDOW)
        self.assertEqual(accepted.returncode,0,accepted.stderr)
        self.assertEqual(service.triage.read()['revision'],1)

    def test_valid_disk_cache_is_reused_without_rescanning_references(self):
        service=self.service();before=service.page({})['report'];service.current=None
        with patch.object(service.index,'iter_references',side_effect=AssertionError('Unexpected scan')):
            self.assertEqual(service.page({})['report'],before)
