# SPDX-License-Identifier: AGPL-3.0-or-later
"""Against a real engine: extraction leaves the project untouched apart from UBT's own caches.

Runs when the sample's EngineAssociation resolves, or LANIAKEA_TEST_ENGINE names an engine root, and skips otherwise.
Each run copies the sample first, so the tracked sample never changes.
"""

import hashlib
import io
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from laniakea import LaniakeaError, cli, pipeline, shards
from laniakea.unreal import engine
from laniakea.workspace import Workspace, read_json
from support import SAMPLE, by_id, copy_sample, fake_engine, recorded

# Files any UBT call with -Project writes into the project (RulesCompiler.cs, XmlConfig.cs), measured on 5.8.3.
UBT_CACHES = ("Intermediate/Build/BuildRules/", "Intermediate/Build/XmlConfigCache.bin",
              "Saved/UnrealBuildTool/BuildConfiguration.xml")


def snapshot(folder):
    state = {}
    for path in Path(folder).rglob("*"):
        if path.is_file():
            stat = path.stat()
            state[path.relative_to(folder).as_posix()] = (stat.st_size, stat.st_mtime_ns,
                                                          hashlib.sha256(path.read_bytes()).hexdigest())
    return state


def changes(before, after):
    return sorted(p for p in before.keys() | after.keys() if before.get(p) != after.get(p))


def engine_root():
    override = os.environ.get("LANIAKEA_TEST_ENGINE")
    try:
        return engine.resolve(SAMPLE / "SampleProject.uproject", override)
    except LaniakeaError:
        return None


@unittest.skipUnless(engine_root(), "no engine resolves for the sample; set LANIAKEA_TEST_ENGINE to run")
class RealEngine(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        base = Path(self.temporary.name)
        self.project = copy_sample(base)
        self.workspace = Workspace(base / "workspace")

    def tearDown(self):
        self.temporary.cleanup()

    def extract(self):
        arguments = ["--workspace", str(self.workspace.root), "extract", str(self.project), "--engine", str(engine_root())]
        with redirect_stdout(io.StringIO()):
            self.assertEqual(cli.main(arguments), 0)
        target = self.workspace.load("sampleproject")
        return target, read_json(self.workspace.latest("sampleproject") / "graph.json")

    def test_only_ubt_caches_change_in_the_project(self):
        before = snapshot(self.project)
        self.extract()
        first = changes(before, snapshot(self.project))
        self.assertTrue(first, "UBT wrote none of its caches; the check would prove nothing")
        self.assertEqual([p for p in first if not p.startswith(UBT_CACHES)], [])
        settled = snapshot(self.project)
        self.extract()
        self.assertEqual([p for p in changes(settled, snapshot(self.project)) if not p.startswith(UBT_CACHES)], [])

    def test_real_export_matches_the_recorded_fixture(self):
        _, real = self.extract()
        with tempfile.TemporaryDirectory() as temporary:
            from laniakea.unreal import graph
            engine_stub = fake_engine(temporary)
            recorded_graph, _ = graph.build(SAMPLE / "SampleProject.uproject", engine_stub,
                                            recorded(SAMPLE, engine_stub)["export"])
        self.assertEqual(set(by_id(real["edges"])), set(by_id(recorded_graph["edges"])),
                         "fixtures/sample.ubt.json is out of date; run python tests/record_fixture.py")

    def test_removed_dependency_disappears_after_regeneration(self):
        target, first = self.extract()
        self.assertIn("depends.private:module:SampleEditor->module:SampleCore", by_id(first["edges"]))
        rules = self.project / "Plugins/Sample/SampleEditor/Source/SampleEditor/SampleEditor.Build.cs"
        rules.write_text(rules.read_text(encoding="utf-8").replace(', "SampleCore" }', " }"), encoding="utf-8")
        self.assertEqual(pipeline.freshness(self.workspace, target)[1],
                         ["Plugins/Sample/SampleEditor/Source/SampleEditor/SampleEditor.Build.cs"])
        _, second = self.extract()
        self.assertNotIn("depends.private:module:SampleEditor->module:SampleCore", by_id(second["edges"]))
        folder = shards.build(second)[shards.file_name("folder:Sample")]
        self.assertNotIn("depends.rollup:plugin:SampleEditor->plugin:SampleCore", by_id(folder["edges"]))


if __name__ == "__main__":
    unittest.main()
