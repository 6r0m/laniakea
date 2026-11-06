# SPDX-License-Identifier: AGPL-3.0-or-later
"""Incremental, guarded analysis copies; the analysed checkout is always read-only."""

import hashlib
import json
import shutil
from pathlib import Path

from .. import LaniakeaError
from ..workspace import write_json
from . import descriptors
from .source_tree import SourceTree

MARKER = ".laniakea-copy.json"
ROOT_EXCLUDES = {".git", "tmp", "workspace", ".venv", "venv", "node_modules", "DerivedDataCache", "Saved", "Binaries", "Intermediate", "Content"}
ASSETS = {".uasset", ".umap", ".ubulk", ".uexp", ".pak", ".ucas", ".utoc"}


def _private(name):
    device = name.split(".", 1)[0].upper()
    reserved = device in {"CON", "PRN", "AUX", "NUL"} or device in {
        f"{prefix}{number}" for prefix in ("COM", "LPT") for number in range(1, 10)}
    return reserved or name.lower() in {"secrets", ".ssh", ".credentials", "auth.json", ".mcp.json", ".env"} or name.lower().startswith(".env.")


def sync(project, destination, workspace, source_directories=(), excludes=()):
    project, destination, workspace = Path(project).resolve(), Path(destination).resolve(), Path(workspace).resolve()
    if not destination.is_relative_to(workspace) or destination == workspace:
        raise LaniakeaError("analysis copy must be inside its workspace")
    source = project.parent
    if destination.is_relative_to(source) or source.is_relative_to(destination):
        raise LaniakeaError("analysis copy and analysed project must be separate trees")
    marker = destination / MARKER
    if destination.exists() and any(destination.iterdir()) and not marker.is_file():
        raise LaniakeaError("refusing to reuse an unmarked analysis copy")
    if marker.exists():
        recorded = json.loads(marker.read_text(encoding="utf-8"))
        if recorded.get("source") != str(project):
            raise LaniakeaError("analysis copy belongs to a different project")
    protected = [Path(p).absolute() for p in source_directories]
    files, digest = set(), hashlib.sha256()
    destination.mkdir(parents=True, exist_ok=True)
    write_json(marker, {"source": str(project), "workspace": str(workspace)})
    tree = SourceTree(source, descriptors.project_plugins(source))
    for directory, dirs, names in tree.walk(source):
        folder = Path(directory)
        relative = folder.relative_to(source)
        in_source = any(folder == p or folder.is_relative_to(p) for p in protected)
        plugin = any(name.endswith(".uplugin") for name in names)
        kept = []
        for name in dirs:
            if _private(name):
                continue
            child = (relative / name).as_posix()
            if child in excludes:
                continue
            contains_source = any(p == folder / name or p.is_relative_to(folder / name) for p in protected)
            if not in_source and not contains_source and (name in {".git", "node_modules", ".venv", "DerivedDataCache"}
                                  or (relative == Path(".") and name in ROOT_EXCLUDES)
                                  or (plugin and name in {"Content", "Binaries", "Intermediate", "Saved"})
                                  or (name == "target" and (folder / "Cargo.toml").is_file())):
                continue
            kept.append(name)
        dirs[:] = kept
        for name in names:
            if _private(name):
                continue
            original = folder / name
            if original.suffix.lower() in ASSETS:
                continue
            rel = (relative / name).as_posix()
            if rel in excludes or rel == MARKER:
                continue
            tree.require(original)
            data = original.read_bytes()
            file_hash = hashlib.sha256(data).hexdigest()
            files.add(rel)
            digest.update(rel.encode("utf-8") + b"\0" + file_hash.encode("ascii") + b"\n")
            target = destination / relative / name
            if not target.resolve().is_relative_to(destination):
                raise LaniakeaError("analysis-copy output escapes its workspace")
            if not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest() != file_hash:
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(original, target)
    # Remove only files recorded by our previous sync, never UBT's generated outputs or arbitrary workspace files.
    state = destination / ".laniakea-inputs.json"
    previous = json.loads(state.read_text()) if state.exists() else []
    for rel in set(previous) - files:
        path = (destination / rel).resolve()
        if not path.is_relative_to(destination):
            raise LaniakeaError("invalid path in the analysis-copy inventory")
        if path.is_file():
            path.unlink()
    write_json(state, sorted(files))
    return destination / project.name, digest.hexdigest(), sorted(files)


def check(project, workspace):
    project, workspace = Path(project).resolve(), Path(workspace).resolve()
    marker = project.parent / MARKER
    if not project.is_relative_to(workspace) or not marker.is_file():
        raise LaniakeaError("compiler database generation requires a marked workspace copy")
    data = json.loads(marker.read_text())
    if Path(data.get("workspace", "")).resolve() != workspace or Path(data.get("source", "")).resolve() == project:
        raise LaniakeaError("invalid analysis-copy marker")
