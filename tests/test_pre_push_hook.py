# SPDX-License-Identifier: AGPL-3.0-or-later
"""The pre-push hook refuses private data in new commits, and says where without repeating it."""

import os
import subprocess
import tempfile
import unittest
from pathlib import Path

HOOKS = Path(__file__).resolve().parent.parent / ".githooks"
MARKER = "fixture-forbidden-marker"
UTC = "2026-01-01T00:00:00+0000"


def git(*args, cwd=None, env=None, check=True):
    return subprocess.run(["git", *args], cwd=cwd, env=env, capture_output=True, text=True, check=check)


class PrePushHook(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        base = Path(self.temporary.name)
        self.remote = base / "remote.git"
        self.repo = base / "repo"
        git("init", "-q", "--bare", str(self.remote))
        git("init", "-q", "-b", "develop", str(self.repo))
        for key, value in (("user.name", "tester"), ("user.email", "tester@example.invalid"),
                           ("core.hooksPath", HOOKS.as_posix()), ("core.autocrlf", "false")):
            git("config", key, value, cwd=self.repo)
        git("remote", "add", "origin", str(self.remote), cwd=self.repo)
        self.patterns = base / "patterns.regex"
        self.patterns.write_bytes(f"# private identifiers\n{MARKER}\n".encode())
        git("config", "laniakea.forbiddenPatternsFile", self.patterns.as_posix(), cwd=self.repo)

    def tearDown(self):
        self.temporary.cleanup()

    def commit(self, files, message="change", date=UTC, author=None):
        for name, content in files.items():
            path = self.repo / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content if isinstance(content, bytes) else content.encode())
        git("add", "-A", cwd=self.repo)
        env = {**os.environ, "GIT_AUTHOR_DATE": date, "GIT_COMMITTER_DATE": date}
        if author:
            env.update({"GIT_AUTHOR_NAME": author, "GIT_COMMITTER_NAME": author})
        git("commit", "-q", "-m", message, cwd=self.repo, env=env)

    def push(self, *extra):
        result = git("push", *extra, "origin", "develop", cwd=self.repo, check=False)
        result.output = result.stdout + result.stderr
        return result

    def refused(self, where=None):
        result = self.push()
        self.assertNotEqual(result.returncode, 0, result.output)
        self.assertNotIn(MARKER, result.output.replace(f"{MARKER}.txt", ""), "the hook repeated the matched text")
        if where:
            self.assertRegex(result.output, where)
        self.assertEqual(git("ls-remote", str(self.remote)).stdout.strip(), "", "a refused push reached the remote")
        return result

    def test_clean_commit_is_pushed(self):
        self.commit({"README.md": "# sample\n"})
        result = self.push()
        self.assertEqual(result.returncode, 0, result.output)

    def test_marker_in_text_is_refused_at_path_and_line(self):
        self.commit({"README.md": f"# sample\nmade by {MARKER}\n"})
        self.refused(r"README\.md:2")

    def test_marker_in_message_is_refused(self):
        self.commit({"README.md": "# sample\n"}, message=f"subject\n\nfrom {MARKER}")
        self.refused(r"message line 3")

    def test_marker_in_path_is_refused(self):
        self.commit({f"{MARKER}.txt": "safe\n"})
        self.refused(r"changed path")

    def test_workspace_path_is_refused(self):
        self.commit({"workspace/targets/x/target.json": "{}\n"})
        self.refused(r"workspace/targets/x/target\.json")

    def test_binary_is_refused(self):
        self.commit({"image.png": b"\x89PNG\r\n\x1a\n\x00\x00binary"})
        self.refused(r"image\.png is binary")

    def test_local_timezone_is_refused(self):
        self.commit({"README.md": "# sample\n"}, date="2026-01-01T03:00:00+0300")
        self.refused(r"UTC")

    def test_other_identity_is_refused(self):
        self.commit({"README.md": "# sample\n"}, author="someone else")
        self.refused(r"user\.name")

    def test_unset_patterns_file_is_refused(self):
        git("config", "--unset", "laniakea.forbiddenPatternsFile", cwd=self.repo)
        self.commit({"README.md": "# sample\n"})
        self.refused(r"forbiddenPatternsFile is not set")

    def test_missing_patterns_file_is_refused(self):
        self.patterns.unlink()
        self.commit({"README.md": "# sample\n"})
        self.refused(r"not found")

    def test_comment_only_patterns_file_is_refused(self):
        self.patterns.write_bytes(b"# nothing active\n\n")
        self.commit({"README.md": "# sample\n"})
        self.refused(r"no active pattern")

    def test_crlf_patterns_file_still_matches(self):
        self.patterns.write_bytes(f"# private identifiers\r\n{MARKER}\r\n".encode())
        self.commit({"README.md": f"made by {MARKER}\n"})
        self.refused(r"README\.md:1")

    def test_commits_already_on_the_remote_are_not_rechecked(self):
        self.commit({"README.md": "# sample\n"}, date="2026-01-01T03:00:00+0300")
        self.assertEqual(self.push("--no-verify").returncode, 0)
        self.commit({"NOTES.md": "notes\n"})
        result = self.push()
        self.assertEqual(result.returncode, 0, result.output)


if __name__ == "__main__":
    unittest.main()
