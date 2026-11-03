# SPDX-License-Identifier: AGPL-3.0-or-later
"""The ignored workspace: the only place data about an analysed project is written."""

import json
import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

from . import LaniakeaError

DEFAULT_ROOT = Path(__file__).resolve().parent.parent / "workspace"
_ID = re.compile(r"^[a-z0-9][a-z0-9_.-]*$")


def write_json(path, value):
    """Write atomically, so a reader never sees half a file."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(value, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def same_file(a, b):
    return os.path.normcase(os.path.abspath(a)) == os.path.normcase(os.path.abspath(b))


class Workspace:
    def __init__(self, root=DEFAULT_ROOT):
        # Absolute, because Unreal Build Tool changes its working directory before it writes our outputs.
        self.root = Path(root).resolve()

    def target_dir(self, target_id):
        return self.root / "targets" / target_id

    def load(self, target_id):
        path = self.target_dir(target_id) / "target.json"
        return read_json(path) if path.is_file() else None

    def targets(self):
        base = self.root / "targets"
        if not base.is_dir():
            return []
        found = (self.load(entry.name) for entry in sorted(base.iterdir()) if entry.is_dir())
        return [target for target in found if target]

    def find_project(self, project_file):
        return next((t for t in self.targets() if same_file(t["project_file"], project_file)), None)

    def register(self, target_id, fields):
        """Store a new target. An id already bound to another project file is refused."""
        if not _ID.match(target_id):
            raise LaniakeaError(f"target id {target_id!r} must be lower case letters, digits, '.', '_' or '-'")
        existing = self.load(target_id)
        if existing and not same_file(existing["project_file"], fields["project_file"]):
            raise LaniakeaError(
                f"target id {target_id!r} already belongs to {existing['project_file']}; pick another with --name")
        target = {**(existing or {}), **fields, "id": target_id}
        write_json(self.target_dir(target_id) / "target.json", target)
        return target

    def begin_run(self, target_id):
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        run = self.target_dir(target_id) / "runs" / (stamp + ".partial")
        run.mkdir(parents=True)
        return run

    def commit_run(self, target_id, partial):
        """Publish a complete run, then point latest.json at it."""
        final = partial.with_name(partial.name.removesuffix(".partial"))
        os.replace(partial, final)
        write_json(self.target_dir(target_id) / "latest.json", {"run": final.name})
        return final

    def fail_run(self, partial):
        """Keep a failed run for diagnosis; latest.json still names the last good run."""
        failed = partial.with_name(partial.name.removesuffix(".partial") + ".failed")
        if failed.exists():
            shutil.rmtree(failed)
        os.replace(partial, failed)
        return failed

    def latest(self, target_id):
        pointer = self.target_dir(target_id) / "latest.json"
        if not pointer.is_file():
            return None
        run = self.target_dir(target_id) / "runs" / read_json(pointer)["run"]
        return run if run.is_dir() else None
