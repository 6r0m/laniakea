# SPDX-License-Identifier: AGPL-3.0-or-later
"""The Unreal profile's graph, built from the recorded export of the sample."""

import json
import tempfile
import unittest

from laniakea import LaniakeaError, schema
from laniakea.unreal import graph, ubt
from support import SAMPLE, by_id, fake_engine, recorded


class SampleGraph(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory()
        cls.engine = fake_engine(cls.temporary.name)
        cls.export = recorded(SAMPLE, cls.engine)["export"]
        cls.graph, cls.counts = graph.build(SAMPLE / "SampleProject.uproject", cls.engine, cls.export)
        cls.nodes, cls.edges = by_id(cls.graph["nodes"]), by_id(cls.graph["edges"])

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def test_matches_the_schema(self):
        schema.validate(self.graph)

    def test_plugins_hold_their_modules(self):
        for plugin in ("SampleCore", "SampleGameplay", "SampleEditor", "SampleDisabled"):
            self.assertEqual(self.nodes[f"module:{plugin}"]["parent"], f"plugin:{plugin}")
        self.assertEqual(self.nodes["module:SampleProject"]["parent"], "project")

    def test_folders_under_plugins_hold_their_plugins(self):
        for plugin in ("SampleCore", "SampleGameplay", "SampleEditor"):
            self.assertEqual(self.nodes[f"plugin:{plugin}"]["parent"], "folder:Sample")
        self.assertEqual(self.nodes["plugin:SampleDisabled"]["parent"], "folder:Experimental/Off")
        nested = self.nodes["folder:Experimental/Off"]
        self.assertEqual((nested["parent"], nested["label"], nested["status"]), ("folder:Experimental", "Off", "not-in-target"))
        self.assertEqual((self.nodes["folder:Sample"]["parent"], self.nodes["folder:Sample"]["status"]), ("project", "in-target"))
        self.assertEqual(self.nodes["folder:Sample"]["source"]["path"], "Plugins/Sample")

    def test_private_dependency_is_typed(self):
        self.assertIn("depends.private:module:SampleEditor->module:SampleGameplay", self.edges)
        self.assertIn("depends.public:module:SampleGameplay->module:SampleCore", self.edges)
        self.assertIn("depends.dynamic:module:SampleEditor->module:Settings", self.edges)

    def test_include_path_edges_exclude_dependencies(self):
        self.assertIn("depends.include_private:module:SampleEditor->module:AssetTools", self.edges)
        self.assertFalse([e for e in self.edges if e.startswith("depends.include_public:")],
                         "UBT lists every public dependency as an include-path module too")

    def test_declared_plugin_dependency_keeps_its_filters(self):
        requires = self.edges["requires:plugin:SampleEditor->plugin:EditorScriptingUtilities"]
        self.assertEqual((requires["status"], requires["attrs"]["TargetAllowList"]), ("declared", ["Editor"]))

    def test_graph_holds_only_declared_edges(self):
        self.assertEqual({e["status"] for e in self.graph["edges"]}, {"declared"}, "summaries belong to the scopes")

    def test_plugin_outside_the_target_is_marked(self):
        self.assertEqual(self.nodes["plugin:SampleDisabled"]["status"], "not-in-target")
        self.assertEqual(self.nodes["module:SampleDisabled"]["status"], "not-in-target")
        self.assertEqual(self.nodes["module:SampleDisabled"]["source"]["path"],
                         "Plugins/Experimental/Off/SampleDisabled/Source/SampleDisabled/SampleDisabled.Build.cs")

    def test_engine_appears_only_as_first_hop_boundary(self):
        boundary = {n for n, node in self.nodes.items() if node["boundary"]}
        self.assertEqual(self.nodes["module:EditorScriptingUtilities"]["parent"], "plugin:EditorScriptingUtilities")
        self.assertEqual(self.nodes["module:Core"]["parent"], "engine")
        self.assertFalse([e for e in self.graph["edges"] if e["source"] in boundary], "boundary nodes have no edges out")

    def test_paths_are_relative_and_keep_their_case(self):
        text = json.dumps(self.graph)
        for root in (SAMPLE, self.engine):
            self.assertNotIn(root.as_posix(), text)
            self.assertNotIn(str(root).replace("\\", "\\\\"), text)
        self.assertEqual(self.nodes["module:Core"]["source"], {"root": "engine", "line": 1,
                                                              "path": "Engine/Source/Runtime/Core/Core.Build.cs"})

    def test_build_is_deterministic(self):
        again, _ = graph.build(SAMPLE / "SampleProject.uproject", self.engine, self.export)
        self.assertEqual(json.dumps(again, sort_keys=True), json.dumps(self.graph, sort_keys=True))

    def test_removed_dependency_disappears(self):
        export = json.loads(json.dumps(self.export))
        module = export["Modules"]["SampleGameplay"]
        for field in ("PublicDependencyModules", "PublicIncludePathModules"):
            module[field] = [m for m in module[field] if m != "SampleCore"]
        rebuilt, _ = graph.build(SAMPLE / "SampleProject.uproject", self.engine, export)
        edges = by_id(rebuilt["edges"])
        self.assertNotIn("depends.public:module:SampleGameplay->module:SampleCore", edges)
        self.assertIn("requires:plugin:SampleGameplay->plugin:SampleCore", edges, "the descriptor still declares it")

    def test_export_of_another_project_is_refused(self):
        with self.assertRaises(LaniakeaError):
            ubt.check_project(self.export, SAMPLE.parent / "Other" / "Other.uproject")
        ubt.check_project(self.export, SAMPLE / "SampleProject.uproject")


if __name__ == "__main__":
    unittest.main()
