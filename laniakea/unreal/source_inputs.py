# SPDX-License-Identifier: AGPL-3.0-or-later
"""Content fingerprints for authored source and previously observed external compiler inputs."""

import hashlib
from pathlib import Path

from . import descriptors
from .project_copy import _private
from .source_tree import SourceTree

EXTENSIONS = {".h", ".hpp", ".hxx", ".cpp", ".cxx", ".cc", ".c", ".inl", ".inc", ".tpp"}


def fingerprints(project, manifest=None):
    root = Path(project).parent
    plugins = descriptors.project_plugins(root)
    tree = SourceTree(root, plugins)
    tops = [root / "Source", *(p.parent / "Source" for p in plugins)]
    result = {}
    for top in tops:
        for directory, dirs, files in tree.walk(top):
            dirs[:] = sorted(d for d in dirs if d not in {".git", "node_modules", "__pycache__"} and not _private(d))
            for name in sorted(files):
                path = Path(directory) / name
                if path.suffix.lower() in EXTENSIONS and not _private(name):
                    tree.require(path)
                    result[path.relative_to(root).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    for key in (manifest or {}).get("inputs", {}):
        if key.startswith("external:"):
            path = Path(key[len("external:"):])
            result[key] = hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else "missing"
    return result
