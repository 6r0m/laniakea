# SPDX-License-Identifier: AGPL-3.0-or-later
"""The ignored workspace: the only place data about an analysed project is written."""

import json
import hashlib
import os
import re
import shutil
from contextlib import contextmanager
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


@contextmanager
def writer_lock(path, message):
    """One local writer; Windows releases the byte lock when its owning process exits."""
    import msvcrt
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('a+b') as stream:
        stream.seek(0)
        try:
            msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError as error:
            raise LaniakeaError(message) from error
        try:
            yield
        finally:
            stream.seek(0)
            msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)


class Workspace:
    def __init__(self, root=DEFAULT_ROOT):
        # Absolute, because Unreal Build Tool changes its working directory before it writes our outputs.
        self.root = Path(root).resolve()

    def target_dir(self, target_id):
        return self.root / "targets" / target_id

    def load(self, target_id):
        request = self.request(target_id)
        if request is not None:
            return request['target']
        path = self.target_dir(target_id) / "target.json"
        return read_json(path) if path.is_file() else None

    def request(self, target_id):
        """The request selected by the publication pointer; legacy registrations have no request."""
        run = self.latest(target_id)
        if run is None or not (run / 'manifest.json').is_file():
            return None
        marker = read_json(run / 'manifest.json').get('request')
        if marker is None:
            return None
        from . import schema
        schema.validate(marker, 'requestMarker')
        raw = (run / 'request.json').read_bytes()
        if len(raw) > 65536 or hashlib.sha256(raw).hexdigest() != marker['sha256']:
            raise LaniakeaError('committed extraction request is invalid')
        request = json.loads(raw)
        schema.validate(request, 'extractionRequest')
        if request['target']['id'] != target_id:
            raise LaniakeaError('committed request belongs to another target')
        return request

    def targets(self):
        base = self.root / "targets"
        if not base.is_dir():
            return []
        found = (self.load(entry.name) for entry in sorted(base.iterdir()) if entry.is_dir())
        return [target for target in found if target]

    def last(self):
        """The target whose latest run is newest, or None when nothing was extracted yet."""
        runs = [(read_json(self.target_dir(t["id"]) / "latest.json")["run"], t) for t in self.targets()
                if (self.target_dir(t["id"]) / "latest.json").is_file()]
        return max(runs, key=lambda pair: pair[0])[1] if runs else None

    def find_project(self, project_file):
        return next((t for t in self.targets() if same_file(t["project_file"], project_file)), None)

    def register(self, target_id, fields):
        """Store a new target. An id already bound to another project file is refused."""
        target = self.propose(target_id, fields)
        write_json(self.target_dir(target_id) / "target.json", target)
        return target

    def propose(self, target_id, fields):
        """Validate an extraction request without changing committed registration or settings."""
        if not _ID.fullmatch(target_id):
            raise LaniakeaError(f"target id {target_id!r} must be lower case letters, digits, '.', '_' or '-'")
        existing = self.load(target_id)
        if existing and not same_file(existing["project_file"], fields["project_file"]):
            raise LaniakeaError(
                f"target id {target_id!r} already belongs to {existing['project_file']}; pick another with --name")
        return {**(existing or {}), **fields, "id": target_id}

    def stage_request(self, run, target, recipe):
        from . import schema
        self.propose(target['id'], target)
        request = {'version': 1, 'target': target, 'recipe': recipe}
        schema.validate(request, 'extractionRequest')
        path = Path(run) / 'request.json'
        write_json(path, request)
        return {'version': 1, 'path': 'request.json', 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}

    def begin_run(self, target_id):
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        run = self.target_dir(target_id) / "runs" / (stamp + ".partial")
        run.mkdir(parents=True)
        return run

    @contextmanager
    def extraction_lock(self, target_id):
        """One writer per mutable target copy; the operating system releases a dead owner's lock."""
        with writer_lock(self.target_dir(target_id) / 'extraction.lock',
                         f'another extraction of {target_id} is running; its copy is protected'):
            yield

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
