# SPDX-License-Identifier: AGPL-3.0-or-later
"""Check fixture and sample text, and keep local workspace and generated sample files out of Git."""

import re
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from support import FIXTURES, ROOT, copy_sample, sample_files, tracked_ignored_files

MACHINE_PATH = re.compile(r"(?<![A-Za-z])[A-Za-z]:[\\/]|/Users/|/home/|AppData")


class Privacy(unittest.TestCase):
    def test_fixtures_and_sample_hold_no_machine_path(self):
        for path in [*FIXTURES.rglob("*"), *sample_files()]:
            if path.is_file() and path.suffix.lower() != ".png":
                match = MACHINE_PATH.search(path.read_text(encoding="utf-8", errors="replace"))
                self.assertIsNone(match, f"{path.relative_to(ROOT)} holds a machine path")

    def test_workspace_is_ignored(self):
        result = subprocess.run(["git", "check-ignore", "-q", "workspace/targets/x/target.json"], cwd=ROOT)
        self.assertEqual(result.returncode, 0)

    def test_generated_plugin_outputs_are_ignored_by_the_sample(self):
        paths = ["sample/SampleProject/Binaries/Win64/SampleProjectEditor.target",
                 "sample/SampleProject/Plugins/Match/SampleMatch/Binaries/Win64/UnrealEditor-SampleMatch.dll",
                 "sample/SampleProject/Plugins/Match/SampleMatch/Intermediate/Build/Module.SampleMatch.cpp",
                 "sample/SampleProject/Plugins/Experimental/SampleExperiment/Saved/Logs/analysis.log"]
        result = subprocess.run(["git", "check-ignore", "-v", "--no-index", "--", *paths], cwd=ROOT,
                                capture_output=True, text=True, check=True)
        self.assertEqual(len(result.stdout.splitlines()), len(paths))
        for line in result.stdout.splitlines():
            self.assertTrue(line.startswith("sample/SampleProject/.gitignore:"), line)

    def test_no_ignored_sample_outputs_are_tracked(self):
        self.assertEqual(tracked_ignored_files(), set())

    def test_sample_copy_includes_only_tracked_authored_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            (root / ".gitignore").write_text("disposable/\n", encoding="ascii")
            sample = root / "sample/SampleProject"
            generated = Path("Plugins/Match/Intermediate/Build.rules")
            authored = Path("Plugins/Match/Source/Match.Build.cs")
            untracked = Path("Plugins/Match/Source/LocalNotes.h")
            for relative, content in [(Path(".gitignore"), "Intermediate/\n"),
                                      (Path("SampleProject.uproject"), "{}\n"),
                                      (generated, "ignored generated artifact"), (authored, "authored rules"),
                                      (untracked, "untracked local file")]:
                path = sample / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content, encoding="ascii")
            subprocess.run(["git", "add", "--", "sample/SampleProject/.gitignore",
                            "sample/SampleProject/SampleProject.uproject",
                            (sample / authored).relative_to(root).as_posix()], cwd=root, check=True)
            (sample / authored).write_text("edited authored rules", encoding="ascii")
            with patch.multiple("sample.copy_sample", ROOT=root, SAMPLE=sample):
                copied = copy_sample(root / "disposable")
                self.assertFalse((copied / untracked).exists())
                with self.assertRaises(FileExistsError):
                    copy_sample(root / "disposable")
                with self.assertRaisesRegex(ValueError, "ignored directory"):
                    copy_sample(root / "visible")
            self.assertEqual((copied / authored).read_text(encoding="ascii"), "edited authored rules")
            self.assertFalse((copied / generated).exists())
            self.assertFalse((root / "visible").exists())


if __name__ == "__main__":
    unittest.main()
