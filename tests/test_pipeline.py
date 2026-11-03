# SPDX-License-Identifier: AGPL-3.0-or-later
"""Extraction into runs, the latest pointer, and staleness, with the two UBT calls replaced by the recording."""

import tempfile
import unittest
from pathlib import Path

from laniakea import LaniakeaError, pipeline, schema
from laniakea.unreal import target_fields
from laniakea.workspace import Workspace, read_json
from support import copy_sample, fake_engine, recorded_ubt


class Pipeline(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        base = Path(self.temporary.name)
        self.project = copy_sample(base)
        self.engine = fake_engine(base)
        self.workspace = Workspace(base / "workspace")
        fields = target_fields(self.project / "SampleProject.uproject", str(self.engine))
        self.target = self.workspace.register("sample", fields)

    def tearDown(self):
        self.temporary.cleanup()

    def extract(self, **kwargs):
        with recorded_ubt(self.project, self.engine, **kwargs):
            return pipeline.extract(self.workspace, self.target)

    def test_run_is_complete_before_latest_moves(self):
        run, manifest = self.extract()
        self.assertEqual(self.workspace.latest("sample"), run)
        schema.validate(read_json(run / "manifest.json"), "manifest")
        schema.validate(read_json(run / "graph.json"))
        self.assertTrue((run / "scopes" / manifest["entry"]).is_file())
        self.assertIn("other targets: SampleProject (Game)", manifest["coverage"]["not_analysed"])
        self.assertEqual(manifest["target"]["name"], "SampleProjectEditor")

    def test_failed_run_keeps_the_last_good_one(self):
        good, _ = self.extract()
        with self.assertRaises(LaniakeaError):
            self.extract(export_error=LaniakeaError("export failed"))
        self.assertEqual(self.workspace.latest("sample"), good)
        failed = [p.name for p in (self.workspace.target_dir("sample") / "runs").iterdir() if p.name.endswith(".failed")]
        self.assertEqual(len(failed), 1)

    def test_edited_build_rules_make_the_run_stale(self):
        self.extract()
        self.assertEqual(pipeline.freshness(self.workspace, self.target)[1], [])
        rules = self.project / "Plugins/SampleEditor/Source/SampleEditor/SampleEditor.Build.cs"
        original = rules.read_bytes()
        rules.write_bytes(original + b"\n// edited\n")
        self.assertEqual(pipeline.freshness(self.workspace, self.target)[1],
                         ["Plugins/SampleEditor/Source/SampleEditor/SampleEditor.Build.cs"])
        rules.write_bytes(original)
        self.assertEqual(pipeline.freshness(self.workspace, self.target)[1], [])

    def test_new_descriptor_makes_the_run_stale(self):
        self.extract()
        extra = self.project / "Plugins/SampleExtra/SampleExtra.uplugin"
        extra.parent.mkdir(parents=True)
        extra.write_text('{"FileVersion": 3}', encoding="utf-8")
        self.assertEqual(pipeline.freshness(self.workspace, self.target)[1], ["Plugins/SampleExtra/SampleExtra.uplugin"])

    def test_id_of_another_project_is_refused(self):
        other = dict(self.target, project_file=str(self.project.parent / "Other" / "Other.uproject"))
        with self.assertRaises(LaniakeaError):
            self.workspace.register("sample", other)


if __name__ == "__main__":
    unittest.main()
