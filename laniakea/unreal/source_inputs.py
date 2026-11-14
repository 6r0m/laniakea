# SPDX-License-Identifier: AGPL-3.0-or-later
"""Content fingerprints for authored source and previously observed external compiler inputs."""

import hashlib
from pathlib import Path

from . import descriptors
from .project_copy import _private
from .source_tree import SourceTree

EXTENSIONS = {".h", ".hpp", ".hxx", ".cpp", ".cxx", ".cc", ".c", ".inl", ".inc", ".tpp"}


def files(project, prefixes=(), excludes=()):
    root = Path(project).parent
    plugins = descriptors.project_plugins(root)
    tree = SourceTree(root, plugins)
    tops = [root / "Source", *(p.parent / "Source" for p in plugins)]
    result = {}
    def excluded(path):
        return any(path==p or path.startswith(p+'/') for p in excludes)
    def relevant(path):
        return not prefixes or any(path==p or path.startswith(p+'/') or p.startswith(path+'/') for p in prefixes)
    for top in tops:
        if not relevant(top.relative_to(root).as_posix()) or excluded(top.relative_to(root).as_posix()):continue
        for directory, dirs, files in tree.walk(top):
            dirs[:] = sorted(d for d in dirs if d not in {".git", "node_modules", "__pycache__"}
                             and not _private(d) and relevant((directory/d).relative_to(root).as_posix())
                             and not excluded((directory/d).relative_to(root).as_posix()))
            for name in sorted(files):
                path = Path(directory) / name
                relative=path.relative_to(root).as_posix()
                if path.suffix.lower() in EXTENSIONS and not _private(name) and not excluded(relative) and \
                        (not prefixes or any(relative==p or relative.startswith(p+'/') for p in prefixes)):
                    tree.require(path)
                    result[relative] = path
    return result


def fingerprints(project, manifest=None, *, prefixes=(), excludes=()):
    result={key:hashlib.sha256(path.read_bytes()).hexdigest() for key,path in files(project,prefixes,excludes).items()}
    for key in (manifest or {}).get("inputs", {}):
        if key.startswith("external:"):
            path = Path(key[len("external:"):])
            result[key] = hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else "missing"
    return result
