# SPDX-License-Identifier: AGPL-3.0-or-later
"""Content fingerprints for authored source and previously observed external compiler inputs."""

import hashlib
import os
from pathlib import Path

from . import descriptors
from .project_copy import _private

EXTENSIONS = {".h", ".hpp", ".hxx", ".cpp", ".cxx", ".cc", ".c", ".inl", ".inc", ".tpp"}


def fingerprints(project, manifest=None):
    root = Path(project).parent
    tops = [root / "Source", *(p.parent / "Source" for p in descriptors.project_plugins(root))]
    result = {}
    visited = set()
    for top in tops:
        for directory, dirs, files in os.walk(top, followlinks=True):
            physical = Path(directory).resolve()
            if physical in visited:
                dirs[:] = []
                continue
            visited.add(physical)
            dirs[:] = sorted(d for d in dirs if d not in {".git", "node_modules", "__pycache__"} and not _private(d))
            for name in sorted(files):
                path = Path(directory) / name
                if path.suffix.lower() in EXTENSIONS and not _private(name):
                    result[path.relative_to(root).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    for key in (manifest or {}).get("inputs", {}):
        if key.startswith("external:"):
            path = Path(key[len("external:"):])
            result[key] = hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else "missing"
    return result
