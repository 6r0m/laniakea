# SPDX-License-Identifier: AGPL-3.0-or-later
"""The Unreal profile's graph, built from the recorded export of the sample."""

import json
import tempfile
import unittest
from pathlib import Path

from laniakea import LaniakeaError, map_index, schema, shards
from laniakea.review_store import Review
from laniakea.unreal import graph, ubt
from laniakea.workspace import Workspace, write_json
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

    def test_match_workflow_has_separate_rules_and_replay_with_a_telemetry_boundary(self):
        self.assertIn("plugin:SampleMatch", self.nodes, "The Match workflow is absent from the sample export.")
        self.assertEqual(self.nodes["plugin:SampleMatch"]["parent"], "folder:Match")
        self.assertEqual(self.nodes["plugin:SampleTelemetry"]["parent"], "folder:Telemetry")
        for module in ("SampleMatch", "SampleMatchRules", "SampleMatchReplay"):
            self.assertEqual(self.nodes[f"module:{module}"]["parent"], "plugin:SampleMatch")
        for source, target in (
                ("SampleProject", "SampleMatch"), ("SampleMatch", "SampleGameplay"),
                ("SampleMatch", "SampleMatchRules"), ("SampleMatch", "SampleMatchReplay"),
                ("SampleMatchReplay", "SampleTelemetry")):
            self.assertIn(f"depends.private:module:{source}->module:{target}", self.edges)
        self.assertIn("depends.public:module:SampleTelemetry->module:SampleCore", self.edges)

    def test_active_experiment_connects_experimental_without_including_disabled_code(self):
        self.assertEqual(self.nodes["folder:Experimental"]["status"], "in-target")
        self.assertEqual(self.nodes["folder:Experimental/Off"]["status"], "not-in-target")
        self.assertEqual(self.nodes["plugin:SampleExperiment"]["parent"], "folder:Experimental")
        overview = by_id(shards.build(self.graph)[shards.ENTRY]["edges"])
        for source, target, pair in (
            ("Experimental", "Match", "SampleExperiment -> SampleMatch"),
            ("Experimental", "Telemetry", "SampleExperiment -> SampleTelemetry"),
            ("Experimental", "Sample", "SampleExperiment -> SampleGameplay"),
            ("Sample", "Experimental", "SampleEditor -> SampleExperiment"),
        ):
            with self.subTest(pair=pair):
                wire = f"depends.rollup:folder:{source}->folder:{target}"
                self.assertIn(wire, overview)
                self.assertIn(pair, overview[wire]["attrs"]["between"])

    def test_results_tour_connects_the_overview_to_match_modules(self):
        scopes = shards.build(self.graph)
        overview = by_id(scopes[shards.ENTRY]["edges"])
        for source, target, pair in (
            ("module:SampleProject", "folder:Results", "SampleProject -> SampleResults"),
            ("folder:Results", "folder:Session", "SampleResults -> SampleSession"),
            ("folder:Results", "folder:Standings", "SampleResults -> SampleStandings"),
            ("folder:Session", "folder:Match", "SampleSession -> SampleMatch"),
            ("folder:Standings", "folder:Match", "SampleStandings -> SampleMatchResult"),
        ):
            with self.subTest(pair=pair):
                self.assertIn(pair, overview[f"depends.rollup:{source}->{target}"]["attrs"]["between"])

        match = scopes[shards.file_name("plugin:SampleMatch")]
        self.assertEqual(set(match["members"]), {
            "module:SampleMatch", "module:SampleMatchReplay", "module:SampleMatchResult",
            "module:SampleMatchRules", "module:SampleMatchValidation",
        })
        edges = by_id(match["edges"])
        self.assertIn("depends.private:module:SampleMatch->module:SampleMatchValidation", edges)
        self.assertIn("depends.public:module:SampleMatch->module:SampleMatchResult", edges)

    def test_include_path_edges_exclude_dependencies(self):
        self.assertIn("depends.include_private:module:SampleEditor->module:AssetTools", self.edges)
        self.assertFalse([e for e in self.edges if e.startswith("depends.include_public:")],
                         "UBT lists every public dependency as an include-path module too")

    def test_declared_plugin_dependency_keeps_its_filters(self):
        requires = self.edges["requires:plugin:SampleEditor->plugin:EditorScriptingUtilities"]
        self.assertEqual((requires["status"], requires["attrs"]["TargetAllowList"]), ("declared", ["Editor"]))

    def test_graph_holds_only_declared_edges(self):
        self.assertEqual({e["status"] for e in self.graph["edges"]}, {"declared"}, "summaries belong to the scopes")

    def test_showcase_reciprocity_and_policy_use_exact_module_witnesses(self):
        overview = by_id(shards.build(self.graph)[shards.ENTRY]["edges"])
        for source, target, pair in (
            ("Sample", "Presentation", "SampleGameplay -> SampleHUD"),
            ("Presentation", "Sample", "SampleHUD -> SampleCore"),
        ):
            with self.subTest(pair=pair):
                wire = f"depends.rollup:folder:{source}->folder:{target}"
                self.assertIn(wire, overview)
                self.assertEqual(overview[wire]["attrs"]["between"], [pair])

        with tempfile.TemporaryDirectory() as temporary:
            workspace = Workspace(Path(temporary))
            target_dir = workspace.target_dir("showcase")
            run = target_dir / "runs" / "one"
            manifest = {"profile": "unreal", "sources": [{"id": "ubt"}], "coverage": {}, "target": {
                "name": "SampleProjectEditor", "platform": "Win64", "configuration": "Development"}}
            write_json(run / "manifest.json", manifest)
            index = run / "index"
            map_index.build(self.graph, index)

            def findings():
                return Review(workspace, "showcase", run, map_index.MapIndex(index)).page({})["items"]

            default = findings()
            self.assertEqual([(f["kind"], f["severity"]) for f in default], [("cycles", "candidate")])
            policy = json.loads((SAMPLE / "review.rules.json").read_text(encoding="utf-8"))
            write_json(target_dir / "review" / "rules.json", policy)
            expected = {
                "forbidden": {"depends.private:module:SampleGameplay->module:SampleHUD"},
                "cycles": {"depends.private:module:SampleLegacySession->module:SampleLegacyStats",
                           "depends.private:module:SampleLegacyStats->module:SampleLegacySession"},
            }
            scoped = findings()
            self.assertCountEqual([(f["kind"], f["severity"]) for f in scoped],
                                  [("forbidden", "violation"), ("cycles", "violation")])
            for finding in scoped:
                self.assertEqual({w["id"] for w in finding["witnesses"]}, expected[finding["kind"]])

            cycle_rule = next(rule for rule in policy["rules"] if rule["id"] == "acyclic-legacy-modules")
            cycle_rule["acyclic"] = False
            write_json(target_dir / "review" / "rules.json", policy)
            warnings = findings()
            self.assertCountEqual([(f["kind"], f["severity"]) for f in warnings],
                                  [("forbidden", "violation"), ("cycles", "candidate")])
            for finding in warnings:
                self.assertEqual({w["id"] for w in finding["witnesses"]}, expected[finding["kind"]])

            cycle_rule["acyclic"] = True
            write_json(target_dir / "review" / "rules.json", policy)
            manifest["target"]["name"] = "SampleProject"
            write_json(run / "manifest.json", manifest)
            self.assertEqual(findings(), [], "Editor policy also matched the Game context")

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
