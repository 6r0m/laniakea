# SPDX-License-Identifier: AGPL-3.0-or-later
"""The Unreal profile: project, plugin and module levels from UBT and the descriptors.

Every Unreal-specific fact lives under this package; core and viewer only see the schema.
"""

from pathlib import Path

from .. import LaniakeaError, __version__
from . import descriptors, engine, graph, ubt

NAME = "unreal"
CONFIGURATION = "Development"


def project_file(reference):
    """The .uproject a path names: the file itself, or the only one in a folder. None when it names none."""
    path = Path(reference)
    if path.is_file() and path.suffix == ".uproject":
        return path.resolve()
    if path.is_dir():
        found = sorted(path.glob("*.uproject"))
        if len(found) > 1:
            raise LaniakeaError(f"{path} holds several .uproject files; name one")
        return found[0].resolve() if found else None
    return None


def target_fields(project, engine_override=None, target=None):
    """What the workspace stores for a project: its file, engine root, and an optional fixed target."""
    root = engine.resolve(project, engine_override)
    fields = {"profile": NAME, "project_file": str(project), "engine_root": str(root),
              "roots": {"project": str(Path(project).parent), "engine": str(root)}}
    if target:
        fields["target"] = target
    return fields


def default_id(project):
    return Path(project).stem.lower()


def inputs(target):
    return descriptors.build_inputs(Path(target["project_file"]).parent)


def _choose(targets, wanted):
    if wanted:
        match = next((t for t in targets if t["name"] == wanted), None)
        if not match:
            raise LaniakeaError(f"target {wanted!r} not found; the project has {', '.join(t['name'] for t in targets)}")
        return match
    editors = [t for t in targets if t["type"] == "Editor"]
    if not editors:
        raise LaniakeaError("the project has no Editor target; pass --target")
    return next((t for t in editors if t["default"]), editors[0])


def extract(target, run_dir):
    """Export the target's module graph into run_dir/ubt and build schema v1 from it."""
    project = Path(target["project_file"])
    root = Path(target["engine_root"])
    out = Path(run_dir) / "ubt"
    out.mkdir(parents=True, exist_ok=True)
    inputs_before = inputs(target)
    targets = ubt.query_targets(root, project, out)
    chosen = _choose(targets, target.get("target"))
    platform = engine.PLATFORM
    exported = ubt.export(root, project, chosen["name"], platform, CONFIGURATION, out)
    built, counts = graph.build(project, root, exported)
    engine_version = engine.version(root)
    skipped = [f"{t['name']} ({t['type']})" for t in targets if t["name"] != chosen["name"]]
    coverage = {
        "analysed": [
            f"module dependencies of {chosen['name']} {platform} {CONFIGURATION} (UBT JsonExport)",
            "plugin descriptors: .uproject and every project .uplugin",
        ],
        "not_analysed": [
            *(["other targets: " + ", ".join(skipped)] if skipped else []),
            "dependencies of engine modules beyond the first hop",
            "levels: class, function",
        ],
        "counts": counts,
    }
    manifest = {
        "profile": NAME,
        "project": project.stem,
        "levels": graph.LEVELS,
        "edge_types": graph.EDGE_TYPES,
        "target": {**chosen, "platform": platform, "configuration": CONFIGURATION},
        "sources": [
            {"id": "ubt", "name": "UnrealBuildTool -Mode=JsonExport", "version": engine_version},
            {"id": "descriptors", "name": ".uproject and .uplugin", "version": engine_version},
            {"id": "rollup", "name": "laniakea rollup", "version": __version__},
        ],
        # Hashed before the export runs, so an edit made during it reads as stale instead of as current.
        "inputs": inputs_before,
        "coverage": coverage,
    }
    return built, manifest
