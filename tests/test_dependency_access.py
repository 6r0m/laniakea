# SPDX-License-Identifier: AGPL-3.0-or-later
"""Evaluated module paths distinguish access, include-only evidence and missing coverage."""

import copy
import unittest

from laniakea.unreal.symbols import _dependency_reviews
from laniakea.unreal import review


def entry(public=(), private=(), include=(), private_include=()):
    return dict(PublicDependencyModules=list(public), PrivateDependencyModules=list(private),
                PublicIncludePathModules=list(include), PrivateIncludePathModules=list(private_include))


class DependencyAccess(unittest.TestCase):
    def annotate(self, modules, dispatch='static'):
        graph={'nodes':[{'id':name, 'level':'module', 'label':name, 'parent':None} for name in ('A','C')],
               'edges':[{'id':'call','type':'calls','source':'A','target':'C','origin':'compiler',
                         'status':'resolved','attrs':{'dispatch':dispatch}}]}
        before=copy.deepcopy(graph['edges'][0])
        _dependency_reviews(graph, {'Modules':modules})
        edge=graph['edges'][0]
        self.assertEqual({k:v for k,v in edge.items() if k!='attrs'},
                         {k:v for k,v in before.items() if k!='attrs'})
        return edge

    def test_public_exposure_is_context_not_a_missing_direct_dependency(self):
        for first in ('public','private'):
            with self.subTest(first=first):
                edge=self.annotate({'A':entry(**{first:['B']}),'B':entry(public=['C']),'C':entry()})
                self.assertNotIn('dependency_review',edge['attrs'])
                self.assertEqual(edge['attrs']['dependency_access'],'available')
                self.assertEqual(edge['attrs']['public_exposure_path'],['A','B','C'])
                self.assertFalse(review.native_note(edge))
                self.assertIn('not evaluated',edge['attrs']['linkage'])

    def test_private_intermediate_is_not_public_exposure(self):
        edge=self.annotate({'A':entry(public=['B']),'B':entry(private=['C']),'C':entry()})
        self.assertEqual(edge['attrs']['dependency_access'],'unsupported')
        self.assertTrue(review.native_note(edge),'Keep a known unsupported-path positive control')
        self.assertEqual(edge['attrs']['public_exposure_path'],[])

    def test_unknown_boundary_or_missing_fields_are_unverified(self):
        for boundary in (None, {}, {'PublicDependencyModules':[]}):
            with self.subTest(boundary=boundary):
                modules={'A':entry(public=['B']),'C':entry()}
                if boundary is not None:modules['B']=boundary
                edge=self.annotate(modules)
                self.assertEqual(edge['attrs']['dependency_access'],'unverified')
                self.assertNotIn('dependency_review',edge['attrs'])
                self.assertFalse(review.native_note(edge))
                self.assertIn('B',edge['attrs']['dependency_context'])

    def test_incomplete_unrelated_branch_does_not_hide_a_positive_path(self):
        edge=self.annotate({'A':entry(public=['Unknown','B']),'B':entry(public=['C'])})
        self.assertEqual(edge['attrs']['dependency_access'],'available')

    def test_include_only_is_not_a_link_dependency(self):
        modules={'A':entry(private_include=['B']),'B':entry(include=['C']),'C':entry()}
        static=self.annotate(modules)
        self.assertEqual(static['attrs']['dependency_access'],'unverified')
        self.assertEqual(static['attrs']['include_exposure_path'],['A','B','C'])
        self.assertFalse(review.native_note(static),'Header-only static helpers may be valid')
        virtual=self.annotate(modules,'virtual target declaration')
        self.assertEqual(virtual['attrs']['dependency_access'],'available')
        self.assertFalse(review.native_note(virtual))
        modules['B']=entry(public=['C'])
        edge=self.annotate(modules)
        self.assertEqual(edge['attrs']['dependency_access'],'unsupported',
                         'Include-only traversal must not import public dependency modules')

    def test_cycles_and_direct_dependencies(self):
        modules={'A':entry(public=['B']),'B':entry(public=['A']),'C':entry()}
        self.assertEqual(self.annotate(modules)['attrs']['dependency_access'],'unsupported')
        modules['A']=entry(private=['C'])
        self.assertNotIn('dependency_review',self.annotate(modules)['attrs'])

    def test_legacy_notes_cannot_prove_unsupported_access(self):
        edge={'type':'calls','origin':'compiler','status':'resolved',
              'attrs':{'dependency_review':'No direct build dependency','public_exposure_path':[]}}
        self.assertFalse(review.native_note(edge))
        self.assertEqual(review.native_availability(edge),'unverified')


if __name__=='__main__':
    unittest.main()
