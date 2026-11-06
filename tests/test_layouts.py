# SPDX-License-Identifier: AGPL-3.0-or-later
"""Saved positions belong to the workspace, independently of extraction runs."""

import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from laniakea import LaniakeaError
from laniakea.layouts import LayoutStore
from laniakea.workspace import Workspace


class Layouts(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.workspace = Workspace(self.temporary.name)
        self.store = LayoutStore(self.workspace)
        self.ids = {"a", "b"}

    def tearDown(self):
        self.temporary.cleanup()

    def update(self, positions, mode="auto", scope="entry.json", target="sample"):
        return self.store.update(target, scope, {"layout": mode, "positions": positions}, self.ids)

    def read(self, scope="entry.json", target="sample"):
        return self.store.read(target, scope, self.ids)

    def test_positions_survive_a_new_store_and_stay_separate_by_scope_project_and_layout(self):
        self.update({"a": {"x": 40, "y": -70}})
        self.update({"a": {"x": 2, "y": 3}}, mode="grid")
        fresh = LayoutStore(Workspace(self.workspace.root))
        self.assertEqual(fresh.read("sample", "entry.json", self.ids)["auto"]["a"], {"x": 40, "y": -70})
        self.assertEqual(self.read()["grid"]["a"], {"x": 2, "y": 3})
        self.assertEqual(self.read(scope="other.json"), {})
        self.assertEqual(self.read(target="other"), {})

    def test_updates_merge_pins_and_reset_only_the_current_layout(self):
        self.update({"a": {"x": 1, "y": 2}})
        self.update({"b": {"x": 3, "y": 4}})
        self.update({"a": {"x": 5, "y": 6}}, mode="grid")
        self.assertEqual(set(self.read()["auto"]), self.ids)
        self.update(None)
        self.assertNotIn("auto", self.read())
        self.assertIn("grid", self.read())

    def test_invalid_coordinates_and_unknown_nodes_do_not_change_the_cache(self):
        self.update({"a": {"x": 1, "y": 2}})
        before = self.read()
        for positions in ({"a": {"x": float("nan"), "y": 1}}, {"a": {"x": True, "y": 1}},
                          {"a": {"x": 1, "y": float("inf")}}, {"a": {"x": 1e20, "y": 1}},
                          {"a": {"x": 10 ** 400, "y": 1}},
                          {"missing": {"x": 1, "y": 2}}):
            with self.subTest(positions=positions), self.assertRaises(ValueError):
                self.update(positions)
            self.assertEqual(self.read(), before)

    def test_removed_nodes_are_ignored_after_regeneration(self):
        self.update({"a": {"x": 1, "y": 2}, "b": {"x": 3, "y": 4}})
        self.assertEqual(self.store.read("sample", "entry.json", {"a"})["auto"], {"a": {"x": 1, "y": 2}})

    def test_module_only_moves_and_reset_preserve_temporarily_unavailable_symbol_pins(self):
        self.update({'a':{'x':1,'y':2},'b':{'x':3,'y':4}})
        self.update({'b':{'x':5,'y':6}}, mode='grid')
        self.store.update('sample','entry.json',{'layout':'auto','positions':{'a':{'x':7,'y':8}}},{'a'})
        self.assertEqual(self.read()['auto']['b'], {'x':3,'y':4})
        self.assertEqual(self.read()['grid']['b'], {'x':5,'y':6})
        self.assertNotIn('b', self.store.read('sample','entry.json',{'a'})['auto'])
        before = self.read()
        with self.assertRaises(ValueError):
            self.store.update('sample','entry.json',{'layout':'auto','positions':{'b':{'x':9,'y':10}}},{'a'})
        self.assertEqual(self.read(), before)
        self.store.update('sample','entry.json',{'layout':'auto','positions':None},{'a'})
        self.assertNotIn('a', self.read()['auto'])
        self.assertEqual(self.read()['auto']['b'], {'x':3,'y':4})
        self.assertEqual(self.read()['grid']['b'], {'x':5,'y':6})

    def test_parallel_tabs_do_not_drop_each_others_pin_updates(self):
        with ThreadPoolExecutor(max_workers=2) as pool:
            list(pool.map(self.update, [{"a": {"x": 1, "y": 2}}, {"b": {"x": 3, "y": 4}}]))
        self.assertEqual(set(self.read()["auto"]), self.ids)

    def test_unreadable_cache_is_reported_and_not_overwritten(self):
        self.update({"a": {"x": 1, "y": 2}})
        path = self.workspace.target_dir("sample") / "layouts" / "entry.json"
        path.write_text("broken", encoding="utf-8")
        with self.assertRaises(LaniakeaError):
            self.update({"b": {"x": 3, "y": 4}})
        self.assertEqual(path.read_text(encoding="utf-8"), "broken")


if __name__ == "__main__":
    unittest.main()
