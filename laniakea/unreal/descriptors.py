# SPDX-License-Identifier: AGPL-3.0-or-later
"""Reading .uproject and .uplugin descriptors, and finding the files that define a build."""

import hashlib
import json
import os
from pathlib import Path

from .. import LaniakeaError

# Folders that never hold descriptors or build rules. Skipping them keeps a walk of a large project fast.
SKIP_DIRS = {"Binaries", "Intermediate", "Saved", "DerivedDataCache", "Content", ".git", "node_modules", "__pycache__"}
REFERENCE_FILTERS = ("PlatformAllowList", "PlatformDenyList", "TargetAllowList", "TargetDenyList",
                     "TargetConfigurationAllowList", "TargetConfigurationDenyList")


def read(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8-sig"))
    except (OSError, ValueError) as error:
        raise LaniakeaError(f"cannot read descriptor {path}: {error}") from error


def _walk(top):
    for current, dirs, files in os.walk(top):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
        yield Path(current), dirs, sorted(files)


def project_plugins(project_dir):
    """Every .uplugin under <project>/Plugins. A folder holding a descriptor is not searched deeper, as in the engine."""
    found = []
    plugins = Path(project_dir) / "Plugins"
    if not plugins.is_dir():
        return found
    for current, dirs, files in _walk(plugins):
        descriptors = [name for name in files if name.endswith(".uplugin")]
        if descriptors:
            found.extend(current / name for name in descriptors)
            dirs[:] = []
    return found


def build_inputs(project_dir):
    """sha256 of every file that defines the build: the .uproject, each .uplugin, *.Build.cs and *.Target.cs."""
    project_dir = Path(project_dir)
    inputs = {}
    for top in (project_dir, project_dir / "Source", project_dir / "Plugins"):
        if not top.is_dir():
            continue
        walker = _walk(top) if top != project_dir else [(project_dir, [], sorted(os.listdir(project_dir)))]
        for current, _, files in walker:
            for name in files:
                if name.endswith((".uproject", ".uplugin", ".Build.cs", ".Target.cs")):
                    path = current / name
                    inputs[path.relative_to(project_dir).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    return dict(sorted(inputs.items()))


def owning_plugin(directory, stop):
    """The .uplugin of the nearest folder at or above directory, without leaving stop."""
    directory, stop = Path(directory), Path(stop)
    for folder in [directory, *directory.parents]:
        if not _inside(folder, stop):
            return None
        try:
            names = sorted(name for name in os.listdir(folder) if name.endswith(".uplugin"))
        except OSError:
            continue
        if names:
            return folder / names[0]
    return None


def _inside(path, root):
    path, root = os.path.normcase(os.path.abspath(path)), os.path.normcase(os.path.abspath(root))
    return path == root or path.startswith(root.rstrip("\\/") + os.sep)


def reference_attrs(entry):
    """The attributes of one Plugins[] entry that decide when the dependency applies."""
    attrs = {"enabled": bool(entry.get("Enabled", False)), "optional": bool(entry.get("Optional", False))}
    attrs.update({key: list(entry[key]) for key in REFERENCE_FILTERS if entry.get(key)})
    return attrs
