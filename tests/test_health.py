# SPDX-License-Identifier: AGPL-3.0-or-later
"""Source observations never masquerade as dependency references or complete design analysis."""

import copy
import json
import unittest
from pathlib import Path
from unittest.mock import patch

import test_review as review_fixture
from laniakea import LaniakeaError
from laniakea.workspace import write_json


def observations():
    paths=['Source/SampleA/First.cpp','Source/SampleC/Second.cpp']
    return {'version':1,'provider':{'id':'pmd-cpd','version':'7.29.0','identity':'1'*64},
            'minimum_tokens':100,'scope':{'prefixes':[],'modules':['A','C']},
            'files':{p:{'sha256':'a'*64,'owner':owner} for p,owner in zip(paths,['A','C'])},
            'groups':[{'fingerprint':'b'*64,'tokens':120,'occurrences':[
                {'path':p,'line':10,'column':1,'end_line':30,'end_column':2} for p in paths]}]}


def browser_fixture():
    graph=json.loads((Path(__file__).resolve().parent.parent/'fixtures/source-surface.graph.json').read_text())
    data=observations();paths=['Source/Sample/Public/API.h','Source/Sample/Private/Producer.cpp']
    data['scope']['modules']=['module']
    data['files']={p:{'sha256':'a'*64,'owner':'module'} for p in paths}
    data['groups'][0]['occurrences']=[{'path':paths[i%2],'line':1+i*40,'column':1,
                                     'end_line':20+i*40,'end_column':2} for i in range(54)]
    return graph,data


class SourceHealth(unittest.TestCase):
    setUp=review_fixture.ReviewTests.setUp
    service=review_fixture.ReviewTests.service
    policy=review_fixture.ReviewTests.policy

    def install(self,data=None):
        from laniakea import health
        self.data=observations() if data is None else data
        self.manifest['health']=health.write(self.run,self.data,self.graph['nodes'])
        write_json(self.run/'manifest.json',self.manifest)

    def test_clones_are_candidates_with_paged_source_evidence_and_no_fake_edges(self):
        self.install();before=copy.deepcopy(self.graph)
        service=self.service();page=service.page({})
        finding=next(f for f in page['items'] if f['kind']=='duplication')
        self.assertEqual(finding['severity'],'candidate');self.assertEqual(finding['groups'],[])
        self.assertEqual(finding['witnesses'],[]);self.assertNotIn('source_evidence',finding)
        self.assertEqual(finding['evidence_type'],'source');self.assertEqual(finding['evidence_total'],2)
        first=service.page({'finding':finding['id'],'evidence':True,'report':page['report'],'limit':1})
        self.assertEqual(first['total'],2);self.assertEqual(first['next_cursor'],1)
        self.assertEqual(first['items'][0]['path'],'Source/SampleA/First.cpp')
        self.assertEqual(first['items'][0]['root'],'project')
        self.assertEqual(self.graph,before)
        with self.assertRaises(ValueError):service.page({'evidence':True})
        with self.assertRaises(ValueError):service.page({'finding':finding['id'],'evidence':'true'})

    def test_line_drift_preserves_triage_and_new_participant_reopens(self):
        self.install();service=self.service();page=service.page({})
        finding=next(f for f in page['items'] if f['kind']=='duplication')
        service.update({'action':'triage','report':page['report'],'revision':0,'finding':finding['id'],
                        'state':'accepted','reason':'Intentional boundary'})
        protected=service.triage.path.read_bytes()
        for occ in self.data['groups'][0]['occurrences']:occ['line']+=5;occ['end_line']+=5
        for entry in self.data['files'].values():entry['sha256']='d'*64
        self.install(self.data);page=self.service().page({'ack':True})
        same=next(f for f in page['items'] if f['kind']=='duplication')
        self.assertEqual(same['id'],finding['id']);self.assertEqual(same['triage'],'accepted')
        self.assertEqual(service.triage.path.read_bytes(),protected)
        occurrence=copy.deepcopy(self.data['groups'][0]['occurrences'][0]);occurrence.update(line=50,end_line=70)
        self.data['groups'][0]['occurrences'].append(occurrence);self.install(self.data)
        changed=next(f for f in self.service().page({})['items'] if f['kind']=='duplication')
        self.assertEqual(changed['id'],finding['id']);self.assertEqual(changed['triage'],'active')

    def test_missing_coverage_and_unsupported_threshold_are_not_clean_proofs(self):
        page=self.service().page({})
        self.assertEqual(next(c for c in page['checks'] if c['kind']=='duplication')['status'],'unavailable')
        self.install();self.policy([{'id':'clones','kind':'duplication','minimum_tokens':50}])
        page=self.service().page({});self.assertEqual(page['total'],0)
        self.assertEqual(page['checks'][0]['status'],'unavailable')

    def test_corrupt_artifact_and_invalid_source_ranges_are_refused(self):
        from laniakea import health
        for mutate in (lambda d:d['groups'][0]['occurrences'][0].update(path='../outside.cpp'),
                       lambda d:d['groups'][0]['occurrences'][0].update(line=0),
                       lambda d:d['files']['Source/SampleA/First.cpp'].update(owner='missing'),
                       lambda d:d['groups'][0].update(tokens=99)):
            data=observations();mutate(data)
            with self.assertRaises((ValueError,LaniakeaError)):health.write(self.run,data,self.graph['nodes'])
        self.install();(self.run/'health.json').write_text('{}')
        with self.assertRaises((ValueError,LaniakeaError)):self.service().page({})

    def test_previous_observations_can_be_validated_without_rebinding_to_a_new_graph(self):
        from laniakea import health
        self.install()
        current=[n for n in self.graph['nodes'] if n['id']!='C']
        with self.assertRaises(ValueError):health.load(self.run,self.manifest,current)
        self.assertEqual(health.load(self.run,self.manifest),self.data)

    def test_overlapping_source_groups_keep_distinct_identities_without_new_relationships(self):
        data=observations();other=copy.deepcopy(data['groups'][0]);other.update(fingerprint='c'*64,tokens=110)
        for occurrence in other['occurrences']:occurrence.update(line=12,end_line=28)
        data['groups'].append(other);self.install(data)
        service=self.service();page=service.page({})
        groups=[f for f in page['items'] if f['kind']=='duplication']
        self.assertEqual(len({f['id'] for f in groups}),2)
        self.assertTrue(all(not f['groups'] and f['evidence_total']==2 for f in groups))

    def test_actual_serialized_size_is_bounded_before_replacing_evidence(self):
        from laniakea import health
        self.install();protected=(self.run/'health.json').read_bytes()
        with patch.object(health,'MAX_BYTES',len(json.dumps(self.data,separators=(',',':')).encode())):
            with self.assertRaises(LaniakeaError):health.write(self.run,self.data,self.graph['nodes'])
        self.assertEqual((self.run/'health.json').read_bytes(),protected)


if __name__=='__main__':
    unittest.main()
