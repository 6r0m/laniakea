# SPDX-License-Identifier: AGPL-3.0-or-later
"""Tracked fixtures and the sample carry no machine path; the ignore rule covers the workspace."""

import re
import subprocess
import unittest

from support import FIXTURES, ROOT, SAMPLE

MACHINE_PATH = re.compile(r"(?<![A-Za-z])[A-Za-z]:[\\/]|/Users/|/home/|AppData")


class Privacy(unittest.TestCase):
    def test_fixtures_and_sample_hold_no_machine_path(self):
        for folder in (FIXTURES, SAMPLE):
            for path in folder.rglob("*"):
                if path.is_file():
                    match = MACHINE_PATH.search(path.read_text(encoding="utf-8", errors="replace"))
                    self.assertIsNone(match, f"{path.relative_to(ROOT)} holds a machine path")

    def test_workspace_is_ignored(self):
        result = subprocess.run(["git", "check-ignore", "-q", "workspace/targets/x/target.json"], cwd=ROOT)
        self.assertEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
