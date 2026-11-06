# SPDX-License-Identifier: AGPL-3.0-or-later
"""Native target receipts select build context without confusing partial output with success."""

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from laniakea import LaniakeaError, pipeline
from laniakea.unreal import target_fields
from laniakea.workspace import Workspace, read_json
from support import copy_sample, fake_engine, recorded


class BuildContext(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        base = Path(self.temporary.name)
        self.project = copy_sample(base)
        self.engine = fake_engine(base)
        self.workspace = Workspace(base / "workspace")
        self.target = self.workspace.register("sample", target_fields(
            self.project / "SampleProject.uproject", str(self.engine)))
        self.calls = []

    def tearDown(self):
        self.temporary.cleanup()

    def receipt(self, name="SampleProject", configuration="Shipping", timestamp=10, **changes):
        product = self.project / "Binaries/Win64" / (name + ".dll")
        product.parent.mkdir(parents=True, exist_ok=True)
        product.write_bytes(b"synthetic linked product")
        value = {"TargetName": name, "TargetType": "Editor" if name.endswith("Editor") else "Game",
                 "Platform": "Win64", "Configuration": configuration, "Project": "../../SampleProject.uproject",
                 "Version": {"MajorVersion": 5, "MinorVersion": 8, "PatchVersion": 0, "Changelist": 1},
                 "BuildProducts": [{"Path": "$(ProjectDir)/Binaries/Win64/" + product.name,
                                    "Type": "DynamicLibrary"}]}
        value.update(changes)
        path = product.with_name(name + "-" + configuration + ".target")
        path.write_text(json.dumps(value), encoding="utf-8")
        os.utime(product, ns=((timestamp - 1) * 1_000_000_000, (timestamp - 1) * 1_000_000_000))
        os.utime(path, ns=(timestamp * 1_000_000_000, timestamp * 1_000_000_000))
        return path

    def extract(self):
        data = recorded(self.project, self.engine)

        def export(_engine, _project, name, platform, configuration, _out):
            self.calls.append((name, platform, configuration))
            result = dict(data["export"], Name=name, Configuration=configuration)
            return result

        with mock.patch("laniakea.unreal.ubt.query_targets", return_value=data["targets"]), \
                mock.patch("laniakea.unreal.ubt.export", side_effect=export):
            return pipeline.extract(self.workspace, self.target)

    def test_latest_complete_receipt_selects_target_and_configuration(self):
        self.receipt("SampleProjectEditor", "Development", timestamp=10)
        self.receipt(timestamp=20)
        _, manifest = self.extract()
        self.assertEqual(self.calls[-1], ("SampleProject", "Win64", "Shipping"))
        self.assertEqual(manifest["target"]["build_context"]["selection"], "receipt")
        self.assertIn("Binaries/Win64/SampleProject-Shipping.target", manifest["inputs"])
        self.assertTrue(all(value >= 0 for value in manifest["timings_seconds"].values()))

    def test_partial_receipt_cannot_replace_retained_context(self):
        path = self.receipt()
        self.extract()
        value = json.loads(path.read_text())
        value["BuildProducts"] = []
        path.write_text(json.dumps(value), encoding="utf-8")
        _, manifest = self.extract()
        self.assertEqual(self.calls[-1], ("SampleProject", "Win64", "Shipping"))
        self.assertEqual(manifest["target"]["build_context"]["selection"], "retained-receipt")
        self.assertTrue(any("partial" in line for line in manifest["coverage"]["not_analysed"]))

    def test_unreadable_receipt_is_diagnosed_not_silently_absent(self):
        path = self.receipt()
        path.write_text("{broken", encoding="utf-8")
        _, manifest = self.extract()
        self.assertEqual(manifest["target"]["build_context"]["selection"], "editor-default")
        self.assertTrue(any("unreadable" in line for line in manifest["coverage"]["not_analysed"]))

    def test_invalid_evidence_never_selects_a_built_context(self):
        for changes in ({"Project": "../../Foreign.uproject"}, {"BuildProducts": []},
                        {"Version": {"MajorVersion": 4}}, {"TargetType": "Client"},
                        {"Platform": "Linux"}, {"Configuration": "Unknown"},
                        {"BuildProducts": [{"Path": "$(ProjectDir)/missing.dll", "Type": "DynamicLibrary"}]}):
            with self.subTest(changes=changes):
                self.receipt(**changes)
                _, manifest = self.extract()
                self.assertEqual(manifest["target"]["build_context"]["selection"], "editor-default")

    def test_explicit_target_is_not_overridden_by_newer_build(self):
        self.receipt("SampleProjectEditor", "DebugGame", timestamp=10)
        self.receipt(timestamp=20)
        self.target["target"] = "SampleProjectEditor"
        self.extract()
        self.assertEqual(self.calls[-1], ("SampleProjectEditor", "Win64", "DebugGame"))

    def test_equal_timestamps_are_ambiguous_instead_of_arbitrary(self):
        self.receipt("SampleProjectEditor", "Development")
        self.receipt()
        with self.assertRaisesRegex(LaniakeaError, "ambiguous"):
            self.extract()
        self.assertIsNone(self.workspace.latest("sample"))

    def test_receipt_change_marks_run_stale(self):
        path = self.receipt()
        self.extract()
        self.assertEqual(pipeline.freshness(self.workspace, self.target)[1], [])
        path.write_text(path.read_text() + "\n", encoding="utf-8")
        self.assertIn(path.relative_to(self.project).as_posix(), pipeline.freshness(self.workspace, self.target)[1])

    def test_timestamp_only_change_affects_build_selection_and_freshness(self):
        path = self.receipt("SampleProjectEditor", "Development", timestamp=10)
        self.receipt(timestamp=20)
        self.extract()
        os.utime(path, ns=(30_000_000_000, 30_000_000_000))
        self.assertIn(path.relative_to(self.project).as_posix(), pipeline.freshness(self.workspace, self.target)[1])
        self.extract()
        self.assertEqual(self.calls[-1], ("SampleProjectEditor", "Win64", "Development"))

    def test_changed_binary_invalidates_retained_context(self):
        path = self.receipt()
        self.extract()
        path.unlink()
        (path.parent / "SampleProject.dll").write_bytes(b"different build")
        _, manifest = self.extract()
        self.assertEqual(manifest["target"]["build_context"]["selection"], "editor-default")
        self.assertTrue(any("retained" in line for line in manifest["coverage"]["not_analysed"]))

    def test_binary_newer_than_receipt_is_not_the_recorded_build(self):
        path = self.receipt()
        product = path.parent / "SampleProject.dll"
        os.utime(product, ns=(30_000_000_000, 30_000_000_000))
        _, manifest = self.extract()
        self.assertEqual(manifest["target"]["build_context"]["selection"], "editor-default")

    def test_failed_export_preserves_latest_context(self):
        self.receipt()
        good, _ = self.extract()
        with mock.patch("laniakea.unreal.ubt.export", side_effect=LaniakeaError("failed")), \
                mock.patch("laniakea.unreal.ubt.query_targets", return_value=recorded(self.project, self.engine)["targets"]):
            with self.assertRaises(LaniakeaError):
                pipeline.extract(self.workspace, self.target)
        self.assertEqual(self.workspace.latest("sample"), good)
        self.assertEqual(read_json(good / "manifest.json")["target"]["name"], "SampleProject")
