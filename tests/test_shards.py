# SPDX-License-Identifier: AGPL-3.0-or-later
"""Drill-down scopes over the Unreal sample and over a hand-written graph with other levels."""

import json
import tempfile
import unittest

from laniakea import LaniakeaError, schema, shards
from laniakea.unreal import graph
from support import FIXTURES, SAMPLE, fake_engine, recorded


def edge_ids(shard):
    return {edge["id"] for edge in shard["edges"]}


class UnrealScopes(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with tempfile.TemporaryDirectory() as temporary:
            engine = fake_engine(temporary)
            built, _ = graph.build(SAMPLE / "SampleProject.uproject", engine, recorded(SAMPLE, engine)["export"])
        cls.shards = shards.build(built)

    def test_every_shard_matches_the_schema(self):
        for shard in self.shards.values():
            schema.validate(shard, "shard")

    def test_project_scope_shows_plugins_and_their_summaries(self):
        entry = self.shards[shards.ENTRY]
        self.assertEqual(entry["members"], ["module:SampleProject", "plugin:SampleCore", "plugin:SampleDisabled",
                                            "plugin:SampleEditor", "plugin:SampleGameplay"])
        edges = edge_ids(entry)
        self.assertIn("requires:plugin:SampleEditor->plugin:EditorScriptingUtilities", edges)
        self.assertIn("depends.rollup:plugin:SampleEditor->plugin:SampleCore", edges)
        self.assertIn("depends.rollup:plugin:SampleCore->engine", edges)
        self.assertNotIn("depends.private:module:SampleEditor->module:SampleGameplay", edges, "summarised by rollup")
        self.assertFalse([e for e in edges if e.startswith("requires:project->")], "the scope's own node is not drawn")

    def test_plugin_scope_shows_module_edges_with_outside_context(self):
        scope = self.shards[shards.file_name("plugin:SampleEditor")]
        self.assertEqual(scope["members"], ["module:SampleEditor"])
        self.assertIn("depends.private:module:SampleEditor->module:SampleGameplay", edge_ids(scope))
        self.assertFalse([e for e in edge_ids(scope) if e.startswith(("requires:", "depends.rollup:"))])
        self.assertEqual(scope["drill"]["module:SampleGameplay"], shards.file_name("module:SampleGameplay"))
        self.assertEqual([crumb["file"] for crumb in scope["parents"]], [shards.ENTRY])

    def test_module_scope_shows_every_direct_neighbour(self):
        scope = self.shards[shards.file_name("module:SampleCore")]
        self.assertIn("depends.public:module:SampleGameplay->module:SampleCore", edge_ids(scope))
        self.assertIn("depends.private:module:SampleEditor->module:SampleCore", edge_ids(scope))

    def test_boundary_nodes_open_no_scope(self):
        for shard in self.shards.values():
            boundary = {n["id"] for n in shard["nodes"] if n["boundary"]}
            self.assertFalse(boundary & set(shard["drill"]))
        self.assertNotIn(shards.file_name("module:Core"), self.shards)


class GenericScopes(unittest.TestCase):
    def setUp(self):
        self.graph = json.loads((FIXTURES / "generic.graph.json").read_text(encoding="utf-8"))

    def test_other_levels_and_edge_types_work_unchanged(self):
        schema.validate(self.graph)
        built = shards.build(self.graph)
        entry = built[shards.ENTRY]
        self.assertEqual(entry["members"], ["app.core", "app.web"])
        self.assertEqual(edge_ids(entry), {"imports.rollup:app.core->stdlib", "imports.rollup:app.web->app.core"})
        package = built[shards.file_name("app.web")]
        self.assertEqual(edge_ids(package), {"imports:app.web.views->app.core.models"})

    def test_a_graph_needs_one_root(self):
        self.graph["nodes"].append({"id": "second", "level": "project", "label": "second", "parent": None,
                                    "boundary": False, "status": "in-target"})
        with self.assertRaises(LaniakeaError):
            shards.build(self.graph)


if __name__ == "__main__":
    unittest.main()
