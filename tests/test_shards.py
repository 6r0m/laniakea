# SPDX-License-Identifier: AGPL-3.0-or-later
"""Drill-down scopes over the Unreal sample and over a hand-written graph with other levels."""

import json
import tempfile
import unittest

from laniakea import LaniakeaError, schema, shards
from laniakea.unreal import graph
from support import FIXTURES, SAMPLE, by_id, fake_engine, recorded


def edge_ids(shard):
    return {edge["id"] for edge in shard["edges"]}


class UnrealScopes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as temporary:
            engine = fake_engine(temporary)
            built, _ = graph.build(SAMPLE / "SampleProject.uproject", engine, recorded(SAMPLE, engine)["export"])
        cls.shards = shards.build(built)

    def scope(self, node_id):
        return self.shards[shards.file_name(node_id)]

    def test_every_shard_matches_the_schema(self):
        for shard in self.shards.values():
            schema.validate(shard, "shard")

    def test_project_scope_shows_folders_and_the_engine_as_one_node(self):
        entry = self.shards[shards.ENTRY]
        self.assertEqual(entry["members"], ["folder:Experimental", "folder:Sample", "module:SampleProject"])
        self.assertEqual({n["id"] for n in entry["nodes"]}, set(entry["members"]) | {"engine"})
        self.assertEqual(edge_ids(entry), {
            "depends.rollup:module:SampleProject->engine",
            "depends.rollup:module:SampleProject->folder:Sample",
            "depends.rollup:folder:Sample->engine",
            "requires.rollup:folder:Sample->engine",
        })

    def test_summary_names_what_it_stands_for(self):
        summary = by_id(self.shards[shards.ENTRY]["edges"])["depends.rollup:module:SampleProject->folder:Sample"]
        self.assertEqual((summary["status"], summary["origin"]), ("derived", "rollup"))
        self.assertEqual(summary["attrs"], {"edges": 1, "kinds": ["depends.private"],
                                            "between": ["SampleProject -> SampleGameplay"]})

    def test_folder_scope_keeps_declared_edges_and_shows_the_undeclared_use(self):
        folder = self.scope("folder:Sample")
        self.assertEqual(folder["members"], ["plugin:SampleCore", "plugin:SampleEditor", "plugin:SampleGameplay"])
        edges = edge_ids(folder)
        self.assertIn("requires:plugin:SampleGameplay->plugin:SampleCore", edges, "a declared edge is drawn as declared")
        self.assertIn("depends.rollup:plugin:SampleEditor->plugin:SampleCore", edges)
        self.assertNotIn("requires:plugin:SampleEditor->plugin:SampleCore", edges, "that use is not declared")
        self.assertIn("depends.rollup:module:SampleProject->plugin:SampleGameplay", edges, "outside, seen as a sibling")
        self.assertIn("requires.rollup:plugin:SampleEditor->engine", edges)
        self.assertEqual([c["file"] for c in folder["parents"]], [shards.ENTRY])

    def test_plugin_scope_sees_sibling_plugins_not_their_modules(self):
        scope = self.scope("plugin:SampleEditor")
        self.assertEqual(scope["members"], ["module:SampleEditor"])
        self.assertIn("depends.rollup:module:SampleEditor->plugin:SampleGameplay", edge_ids(scope))
        self.assertEqual(scope["drill"]["plugin:SampleGameplay"], shards.file_name("plugin:SampleGameplay"))
        self.assertEqual([c["title"] for c in scope["parents"]], ["SampleProject", "Sample"])

    def test_module_scope_shows_every_direct_neighbour_exactly(self):
        scope = self.scope("module:SampleCore")
        edges = edge_ids(scope)
        self.assertIn("depends.public:module:SampleGameplay->module:SampleCore", edges)
        self.assertIn("depends.private:module:SampleEditor->module:SampleCore", edges)
        self.assertIn("depends.public:module:SampleCore->module:Core", edges)

    def test_index_lists_every_scope_with_its_file(self):
        with tempfile.TemporaryDirectory() as temporary:
            engine = fake_engine(temporary)
            built, _ = graph.build(SAMPLE / "SampleProject.uproject", engine, recorded(SAMPLE, engine)["export"])
        found = shards.index(built)
        schema.validate(found, "index")
        files = {entry["id"]: entry["file"] for entry in found["nodes"]}
        self.assertEqual(set(files.values()), set(self.shards), "one entry per shard, and no other")
        self.assertEqual(files["project"], shards.ENTRY)
        self.assertNotIn("engine", files)

    def test_index_distinguishes_collapsed_containers_from_leaf_scopes(self):
        with tempfile.TemporaryDirectory() as temporary:
            engine = fake_engine(temporary)
            built, _ = graph.build(SAMPLE / "SampleProject.uproject", engine, recorded(SAMPLE, engine)["export"])
        found = by_id(shards.index(built)["nodes"])
        self.assertEqual(found["folder:Sample"]["child_count"], 3)
        self.assertEqual(found["plugin:SampleCore"]["child_count"], 1)
        self.assertEqual(found["module:SampleCore"]["child_count"], 0)
        schema.validate(shards.index(built), "index")

    def test_boundary_nodes_open_no_scope(self):
        for shard in self.shards.values():
            boundary = {n["id"] for n in shard["nodes"] if n["boundary"]}
            self.assertFalse(boundary & set(shard["drill"]))
        self.assertNotIn(shards.file_name("module:Core"), self.shards)
        self.assertNotIn(shards.file_name("engine"), self.shards)


class GenericScopes(unittest.TestCase):
    def setUp(self):
        self.graph = json.loads((FIXTURES / "generic.graph.json").read_text(encoding="utf-8"))

    def test_container_keeps_explicit_recursion_but_not_abstracted_internal_loops(self):
        edge={'id':'recursive','source':'app.core.db','target':'app.core.db','type':'calls',
              'status':'resolved','origin':'synthetic'}
        self.graph['edges']=[edge,{**edge,'id':'abstracted','internal_to_owner':True}]
        built=shards.build(self.graph)
        self.assertEqual(edge_ids(built[shards.file_name('app.core')]),{'recursive'})
        leaf=built[shards.file_name('app.core.db')]
        self.assertEqual(edge_ids(leaf),{'recursive','abstracted'})
        self.assertTrue(next(e for e in leaf['edges'] if e['id']=='abstracted')['internal_to_owner'])

    def test_index_requires_the_direct_child_count(self):
        found = shards.index(self.graph)
        del found["nodes"][0]["child_count"]
        with self.assertRaisesRegex(LaniakeaError, "missing 'child_count'"):
            schema.validate(found, "index")

    def test_leaf_scopes_do_not_rescan_all_references(self):
        class CountedEdges(list):
            scans = 0

            def __iter__(self):
                self.scans += 1
                return super().__iter__()

        root = self.graph["nodes"][0]
        nodes = [root] + [dict(root, id=f"leaf{i}", label=f"Leaf {i}", parent=root["id"])
                          for i in range(200)]
        edge = {"id": "self", "source": "leaf0", "target": "leaf0",
                "type": "imports", "status": "declared", "origin": "synthetic"}
        edges = CountedEdges([edge, dict(edge, id="ancestor", target=root["id"])] +
                             [dict(edge, id=f"edge{i}", source=f"leaf{i}", target=f"leaf{i+1}")
                              for i in range(199)])
        built = shards.build({"nodes": nodes, "edges": edges})
        self.assertLessEqual(edges.scans, 2, "leaf scopes must reuse the graph's reference index")
        self.assertEqual(len(built[shards.file_name("leaf0")]["edges"]), 3, "self-references appear once")
        self.assertEqual(edge_ids(built[shards.file_name("leaf0")]), {"self", "ancestor", "edge0"})
        self.assertEqual(edge_ids(built[shards.file_name("leaf199")]), {"edge198"})

    def test_other_levels_and_edge_types_work_unchanged(self):
        schema.validate(self.graph)
        built = shards.build(self.graph)
        entry = built[shards.ENTRY]
        self.assertEqual(entry["members"], ["app.core", "app.web"])
        self.assertEqual(edge_ids(entry), {"imports.rollup:app.core->stdlib", "imports.rollup:app.web->app.core"})
        package = built[shards.file_name("app.web")]
        self.assertEqual(edge_ids(package), {"imports.rollup:app.web.views->app.core"})
        self.assertEqual(shards.edge_types(built), ["imports", "imports.rollup"])

    def test_container_scopes_reuse_incident_edges_and_preserve_rollups(self):
        class CountedEdges(list):
            scans = 0
            def __iter__(self):
                self.scans += 1
                return super().__iter__()
        root = self.graph["nodes"][0]
        nodes = [root]
        for n in range(40):
            nodes.extend([dict(root, id=f"group{n}", parent=root["id"]),
                          dict(root, id=f"leaf{n}", parent=f"group{n}")])
        edge = {"id": "reference", "source": "leaf0", "target": "leaf1", "type": "calls",
                "status": "resolved", "origin": "compiler"}
        edges = CountedEdges([edge])
        built = shards.build({"nodes": nodes, "edges": edges})
        self.assertLessEqual(edges.scans, 1, "containers must not rescan the entire graph")
        rolled = built[shards.file_name("group0")]["edges"]
        self.assertEqual([(e["source"], e["target"], e["attrs"]["edges"]) for e in rolled],
                         [("leaf0", "group1", 1)])
        self.assertEqual(built[shards.file_name("leaf0")]["edges"], [edge])

    def test_leaf_keeps_references_to_its_ancestors(self):
        edge = {"id": "ancestor", "source": "app.core.db", "target": "app.core",
                "type": "imports", "status": "declared", "origin": "imports"}
        self.graph["edges"].append(edge)
        scope = shards.build(self.graph)[shards.file_name("app.core.db")]
        self.assertIn(edge, scope["edges"])

    def test_a_graph_needs_one_root(self):
        self.graph["nodes"].append({"id": "second", "level": "project", "label": "second", "parent": None,
                                    "boundary": False, "status": "in-target"})
        with self.assertRaises(LaniakeaError):
            shards.build(self.graph)

    def test_a_project_without_children_still_has_an_entry(self):
        root = next(n for n in self.graph["nodes"] if n["parent"] is None and not n["boundary"])
        built = shards.build({"nodes": [root], "edges": []})
        self.assertEqual(built[shards.ENTRY]["scope"], root["id"])

    def test_scope_files_cannot_overwrite_entry_or_index(self):
        root = next(n for n in self.graph["nodes"] if n["parent"] is None and not n["boundary"])
        nodes = [root] + [dict(root, id=name, label=name, parent=root["id"]) for name in ("entry", "index")]
        built = shards.build({"nodes": nodes, "edges": []})
        self.assertEqual(len(built), 3)
        self.assertEqual(built[shards.ENTRY]["scope"], root["id"])
        self.assertNotIn(shards.INDEX, built)

    def test_unicode_ids_have_distinct_scope_files(self):
        self.assertNotEqual(shards.file_name(chr(256)), shards.file_name(chr(16) + "0"))


if __name__ == "__main__":
    unittest.main()
