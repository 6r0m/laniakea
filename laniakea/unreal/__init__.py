# SPDX-License-Identifier: AGPL-3.0-or-later
"""The Unreal profile: project, plugin and module levels from UBT and the descriptors.

Every Unreal-specific fact lives under this package; core and viewer only see the schema.
"""

from pathlib import Path
from time import perf_counter

from .. import LaniakeaError
from . import builds, descriptors, engine, graph, ubt, source_inputs

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


def inputs(target, manifest=None, *, symbols=False):
    native = symbols or any(source['id'] == 'compiler' for source in (manifest or {}).get('sources', []))
    return {**descriptors.build_inputs(Path(target["project_file"]).parent),
            **builds.fingerprints(target["project_file"]),
            **(source_inputs.fingerprints(target["project_file"], manifest) if native else {})}


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


def extract(target, run_dir, previous_manifest=None, tools_dir=None):
    """Export the target's module graph into run_dir/ubt and build schema v1 from it."""
    project = Path(target["project_file"])
    root = Path(target["engine_root"])
    out = Path(run_dir) / "ubt"
    out.mkdir(parents=True, exist_ok=True)
    inputs_before = inputs(target, symbols=tools_dir is not None)
    start = perf_counter()
    targets = ubt.query_targets(root, project, out)
    timings = {"query_targets": perf_counter() - start}
    start = perf_counter()
    chosen, limitations = builds.select(project, root, targets, target.get("target"), previous_manifest)
    if chosen is None:
        chosen = {**_choose(targets, target.get("target")), "configuration": CONFIGURATION,
                  "build_context": {"selection": "explicit" if target.get("target") else "editor-default"}}
    timings["build_context"] = perf_counter() - start
    platform = engine.PLATFORM
    configuration = chosen["configuration"]
    start = perf_counter()
    exported = ubt.export(root, project, chosen["name"], platform, configuration, out)
    timings["export"] = perf_counter() - start
    start = perf_counter()
    built, counts = graph.build(project, root, exported)
    timings["graph"] = perf_counter() - start
    compiler_result = {"enabled": False, "reason": "levels: namespace, class, function (not requested; pass --symbols)"}
    if tools_dir is not None:
        from . import compiler
        built, compiler_result = compiler.extract(target, run_dir, built, exported, chosen, tools_dir)
        timings.update({"symbols_" + name: seconds for name, seconds in compiler_result.get("timings", {}).items()})
        counts = graph._counts(built)
    engine_version = engine.version(root)
    skipped = [f"{t['name']} ({t['type']})" for t in targets if t["name"] != chosen["name"]]
    coverage = {
        "analysed": [
            f"module dependencies of {chosen['name']} {platform} {configuration} (current UBT JsonExport)",
            "plugin descriptors: .uproject and every project .uplugin",
            (f"build context: {chosen['build_context']['selection']}"
             + (f", receipt {chosen['build_context']['created_utc']}" if 'created_utc' in chosen['build_context'] else "")),
        ],
        "not_analysed": [
            *(["other targets: " + ", ".join(skipped)] if skipped else []),
            "dependencies of engine modules beyond the first hop",
            *([] if compiler_result["enabled"] else [compiler_result["reason"]]),
            *limitations,
        ],
        "counts": counts,
    }
    manifest = {
        "profile": NAME,
        "project": project.stem,
        "levels": graph.LEVELS + (["namespace", "class", "function"] if compiler_result["enabled"] else []),
        "edge_types": graph.EDGE_TYPES,
        "overview": {"anchor": graph.ENGINE_ID, "configuration_types": ["requires"]},
        "target": {**chosen, "platform": platform, "configuration": configuration},
        "timings_seconds": timings,
        "sources": [
            {"id": "ubt", "name": "UnrealBuildTool -Mode=JsonExport", "version": engine_version},
            {"id": "descriptors", "name": ".uproject and .uplugin", "version": engine_version},
        ],
        # Hashed before the export runs, so an edit made during it reads as stale instead of as current.
        "inputs": inputs_before,
        "coverage": coverage,
    }
    if compiler_result["enabled"]:
        from . import symbols, tools
        manifest["edge_types"] = [*graph.EDGE_TYPES, *symbols.EDGE_TYPES]
        manifest["sources"].append({"id": "compiler", "name": "LLVM libclang native semantic index", "version": tools.VERSION})
        manifest["inputs"].update(compiler_result["external_inputs"])
        manifest['roots'] = compiler_result.get('roots', {})
        coverage["analysed"].append(f"authored C++ namespace ownership, classes, functions and statically resolved references: {compiler_result['units']} native units")
        coverage["not_analysed"].extend(["Engine class/function internals and runtime/indirect dispatch",
                                         "generated-only declarations without an authored source owner",
                                         "individual fields, enumeration/value stars and exhaustive macro provenance; member summaries are observations"])
        unknown = compiler_result["unknown"]
        if any(unknown.values()):
            coverage["not_analysed"].append(f"unresolved compiler reference ownership: source={unknown['source']}, target={unknown['target']}")
    return built, manifest
