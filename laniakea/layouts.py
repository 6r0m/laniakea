# SPDX-License-Identifier: AGPL-3.0-or-later
"""User-dragged positions, separate from immutable extraction runs.

HTTP owns target/scope authorization; this store validates and merges position patches. One server serializes
read/merge/atomic replacement across its request threads, so separate tabs can move different pins safely.
"""

import math
import re
import threading

from . import LaniakeaError
from .workspace import read_json, write_json

_LOCK = threading.Lock()
_MODE = re.compile(r"[a-z][a-z0-9_-]{0,31}\Z")


def _positions(value, allowed=None):
    if not isinstance(value, dict):
        raise ValueError("positions must be an object")
    for node, point in value.items():
        if allowed is not None and node not in allowed:
            raise ValueError("position names a node outside this scope")
        if not isinstance(point, dict) or set(point) != {"x", "y"}:
            raise ValueError("each position needs x and y")
        if any(isinstance(v, bool) or not isinstance(v, (int, float)) or abs(v) > 1e7 or not math.isfinite(v)
               for v in point.values()):
            raise ValueError("coordinates must be finite numbers within the map range")
    return value


class LayoutStore:
    def __init__(self, workspace):
        self.workspace = workspace

    def _path(self, target, scope):
        return self.workspace.target_dir(target) / "layouts" / scope

    def _read(self, target, scope, allowed):
        path = self._path(target, scope)
        try:
            try:
                data = read_json(path)
            except FileNotFoundError:
                return {}
            if not isinstance(data, dict) or data.get("version") != 1 or not isinstance(data.get("layouts"), dict):
                raise ValueError("unknown layout cache format")
            result = {}
            for mode, positions in data["layouts"].items():
                if not _MODE.fullmatch(mode):
                    raise ValueError("invalid saved layout name")
                result[mode] = {node: point for node, point in _positions(positions).items() if node in allowed}
            return result
        except (OSError, ValueError) as error:
            raise LaniakeaError(f"could not read saved positions: {error}") from error

    def read(self, target, scope, allowed):
        with _LOCK:
            return self._read(target, scope, allowed)

    def update(self, target, scope, patch, allowed):
        if not isinstance(patch, dict) or set(patch) != {"layout", "positions"}:
            raise ValueError("expected layout and positions")
        mode, positions = patch["layout"], patch["positions"]
        if not isinstance(mode, str) or not _MODE.fullmatch(mode):
            raise ValueError("invalid layout name")
        if positions is not None:
            _positions(positions, allowed)
        with _LOCK:
            layouts = self._read(target, scope, allowed)
            if positions is None:
                layouts.pop(mode, None)
            else:
                layouts.setdefault(mode, {}).update(positions)
            write_json(self._path(target, scope), {"version": 1, "layouts": layouts})
            return layouts
