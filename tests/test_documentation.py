# SPDX-License-Identifier: AGPL-3.0-or-later
"""Local documentation targets and lifetime boundaries remain valid without network access."""

import re
import tempfile
import unittest
from pathlib import Path
from urllib.parse import unquote, urlsplit

from support import ROOT


def _prose(path):
    lines, fence = [], None
    for line in path.read_text(encoding="utf-8").splitlines():
        marker = re.match(r"^\s*(`{3,}|~{3,})", line)
        if marker:
            if fence is None:
                fence = marker[1][0]
            elif marker[1][0] == fence:
                fence = None
        elif fence is None:
            lines.append(line)
    return "\n".join(lines)


def _links(text):
    for match in re.finditer(r"\]\(", text):
        start, depth = match.end(), 1
        end = start
        while end < len(text) and depth:
            char = text[end]
            if char == "\\":
                end += 2
                continue
            if char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
            end += 1
        if depth:
            continue
        destination = text[start:end - 1].strip()
        if destination.startswith("<") and ">" in destination:
            destination = destination[1:destination.index(">")]
        elif destination:
            destination = destination.split()[0]
        if destination:
            yield destination
    for match in re.finditer(r"^\s*\[[^\]]+\]:\s*(\S+)", text, re.MULTILINE):
        yield match[1].strip("<>")


def _anchors(path):
    result, seen = set(), {}
    for line in _prose(path).splitlines():
        heading = re.match(r"^#{1,6}\s+(.+?)\s*#*$", line)
        if heading:
            base = re.sub(r"\s", "-", re.sub(r"[^\w\s-]", "", heading[1].lower()))
            number = seen.get(base, 0)
            seen[base] = number + 1
            result.add(base + ("-" + str(number) if number else ""))
    return result


def _issues(root):
    root = root.resolve()
    files = sorted([*root.glob("*.md"), *(root / "docs").rglob("*.md"), *(root / "todo").rglob("*.md")])
    issues = []
    for path in files:
        source = path.relative_to(root)
        durable = source.parts[0] != "todo" or source == Path("todo/README.md")
        for link in _links(_prose(path)):
            parsed = urlsplit(link)
            if parsed.scheme or parsed.netloc:
                continue
            target = (path.parent / unquote(parsed.path)).resolve() if parsed.path else path
            try:
                relative = target.relative_to(root)
            except ValueError:
                issues.append((source.as_posix(), link, "outside repository"))
                continue
            if durable and relative.parts and relative.parts[0].casefold() == "todo" and target != path:
                issues.append((source.as_posix(), link, "temporary dependency"))
            if not target.exists():
                issues.append((source.as_posix(), link, "missing target"))
            elif parsed.fragment and target.suffix == ".md" and unquote(parsed.fragment) not in _anchors(target):
                issues.append((source.as_posix(), link, "missing anchor"))
    return issues


class Documentation(unittest.TestCase):
    def test_local_links_resolve_without_durable_dependencies_on_todos(self):
        self.assertEqual(_issues(ROOT), [])

    def test_checker_rejects_invalid_links_and_allows_tasks_to_disappear(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "docs").mkdir()
            (root / "todo").mkdir()
            (root / "docs/guide.md").write_text("# Guide\n## Details\n## Details\n", encoding="utf-8")
            (root / "todo/task.md").write_text("[guide](../docs/guide.md#details)\n", encoding="utf-8")
            readme = root / "README.md"
            valid = "[guide](docs/guide.md#details-1)\n"
            readme.write_text(valid + "[task](todo/task.md)\n[missing](docs/missing.md)\n"
                              "[fragment](docs/guide.md#missing)\n", encoding="utf-8")
            self.assertEqual({issue[2] for issue in _issues(root)},
                             {"temporary dependency", "missing target", "missing anchor"})
            readme.write_text(valid + "[work][pending]\n[pending]: todo/task.md\n", encoding="utf-8")
            self.assertEqual([issue[2] for issue in _issues(root)], ["temporary dependency"])
            readme.write_text(valid + "[work](TODO/task.md)\n", encoding="utf-8")
            self.assertIn("temporary dependency", {issue[2] for issue in _issues(root)})
            readme.write_text(valid, encoding="utf-8")
            self.assertEqual(_issues(root), [])
            task_readme = root / "todo/README.md"
            task_readme.write_text("[task](task.md)\n", encoding="utf-8")
            self.assertEqual([issue[2] for issue in _issues(root)], ["temporary dependency"])
            task_readme.unlink()
            (root / "todo/task.md").unlink()
            (root / "todo").rmdir()
            self.assertEqual(_issues(root), [])


if __name__ == "__main__":
    unittest.main()
