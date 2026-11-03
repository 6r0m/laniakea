# SPDX-License-Identifier: AGPL-3.0-or-later
"""Turning a UBT export and the descriptors into the language-neutral graph."""

import os
from pathlib import Path

from . import descriptors

LEVELS = ["project", "plugin", "module"]
DEPENDENCY_FIELDS = {
    "PublicDependencyModules": "depends.public",
    "PrivateDependencyModules": "depends.private",
    "PublicIncludePathModules": "depends.include_public",
    "PrivateIncludePathModules": "depends.include_private",
    "DynamicallyLoadedModules": "depends.dynamic",
}
EDGE_TYPES = [
    {"id": "requires", "label": "requires (descriptor)", "status": "declared"},
    {"id": "depends.public", "label": "public dependency", "status": "declared"},
    {"id": "depends.private", "label": "private dependency", "status": "declared"},
    {"id": "depends.include_public", "label": "public include path", "status": "declared"},
    {"id": "depends.include_private", "label": "private include path", "status": "declared"},
    {"id": "depends.dynamic", "label": "dynamically loaded", "status": "declared"},
    {"id": "depends.rollup", "label": "plugin rollup", "status": "derived"},
]
PROJECT_ID = "project"
ENGINE_ID = "engine"


def _norm(path):
    return os.path.normcase(os.path.abspath(Path(path)))


def _relative(path, root):
    """path relative to root with forward slashes and its own case, or None when it lies outside root."""
    if _norm(path) != _norm(root) and not _norm(path).startswith(_norm(root).rstrip("\\/") + os.sep):
        return None
    return Path(os.path.relpath(os.path.abspath(path), os.path.abspath(root))).as_posix()


class _Builder:
    def __init__(self, project_file, engine_root):
        self.project_file = Path(project_file)
        self.project_dir = self.project_file.parent
        self.engine_root = Path(engine_root)
        self.nodes = {}
        self.edges = {}

    def location(self, path):
        for root_name, root in (("project", self.project_dir), ("engine", self.engine_root)):
            relative = _relative(path, root)
            if relative is not None:
                return {"root": root_name, "path": relative, "line": 1}
        return None

    def node(self, node_id, level, label, parent, *, boundary=False, status="in-target", source=None, attrs=None):
        node = {"id": node_id, "level": level, "label": label, "parent": parent, "boundary": boundary, "status": status}
        if source:
            node["source"] = source
        if attrs:
            node["attrs"] = attrs
        self.nodes.setdefault(node_id, node)
        return self.nodes[node_id]

    def edge(self, kind, source, target, status, origin, attrs=None):
        edge_id = f"{kind}:{source}->{target}"
        edge = {"id": edge_id, "type": kind, "source": source, "target": target, "status": status, "origin": origin}
        if attrs:
            edge["attrs"] = attrs
        self.edges.setdefault(edge_id, edge)

    def boundary_module(self, name, exported):
        """An engine or third-party module a project module uses, placed under its engine plugin when it has one."""
        node_id = f"module:{name}"
        if node_id in self.nodes:
            return node_id
        entry = exported["Modules"].get(name, {})
        parent = ENGINE_ID
        descriptor = descriptors.owning_plugin(entry["Directory"], self.engine_root) if entry.get("Directory") else None
        if descriptor:
            parent = self.boundary_plugin(descriptor.stem, source=self.location(descriptor))
        self.node(node_id, "module", name, parent, boundary=True,
                  source=self.location(entry["Rules"]) if entry.get("Rules") else None,
                  attrs={"type": entry["Type"]} if entry.get("Type") else None)
        return node_id

    def boundary_plugin(self, name, source=None):
        node_id = f"plugin:{name}"
        if node_id not in self.nodes:
            self.node(node_id, "plugin", name, ENGINE_ID, boundary=True, source=source)
        return node_id


def build(project_file, engine_root, exported):
    """Return (graph, coverage counts). Project nodes come from descriptors and the export; engine nodes only where
    a project node touches them."""
    b = _Builder(project_file, engine_root)
    project = descriptors.read(b.project_file)
    b.node(PROJECT_ID, "project", b.project_file.stem, None, source=b.location(b.project_file))
    b.node(ENGINE_ID, "project", "Unreal Engine", None, boundary=True, source={"root": "engine", "path": "Engine"})
    exported_modules = exported["Modules"]

    # Module owners come from the descriptors that list them: .uplugin Modules[] and .uproject Modules[].
    owner = {entry["Name"]: PROJECT_ID for entry in project.get("Modules", [])}
    declared = {entry["Name"]: entry for entry in project.get("Modules", [])}
    plugin_descriptors = {}
    for path in descriptors.project_plugins(b.project_dir):
        plugin = descriptors.read(path)
        plugin_descriptors[path.stem] = (path, plugin)
        for entry in plugin.get("Modules", []):
            owner[entry["Name"]] = f"plugin:{path.stem}"
            declared[entry["Name"]] = entry

    for name, (path, plugin) in sorted(plugin_descriptors.items()):
        modules = [entry["Name"] for entry in plugin.get("Modules", [])]
        if not modules:
            status = "not-analysed"
        elif any(module in exported_modules for module in modules):
            status = "in-target"
        else:
            status = "not-in-target"
        attrs = {"modules": modules}
        if "EnabledByDefault" in plugin:
            attrs["enabled_by_default"] = bool(plugin["EnabledByDefault"])
        b.node(f"plugin:{name}", "plugin", name, PROJECT_ID, status=status, source=b.location(path), attrs=attrs)

    for name in sorted(set(owner) | {n for n, m in exported_modules.items() if _relative(m["Directory"], b.project_dir)}):
        entry = exported_modules.get(name)
        parent = owner.get(name)
        if parent is None:
            plugin_file = descriptors.owning_plugin(entry["Directory"], b.project_dir)
            parent = f"plugin:{plugin_file.stem}" if plugin_file else PROJECT_ID
        attrs = {}
        if name in declared and declared[name].get("Type"):
            attrs["kind"] = declared[name]["Type"]
        if entry:
            attrs["type"] = entry.get("Type", "")
            attrs["pch"] = entry.get("PCHUsage", "")
            if entry.get("CircularlyReferencedModules"):
                attrs["circular"] = sorted(entry["CircularlyReferencedModules"])
            source = b.location(entry["Rules"])
        else:
            source = _conventional_rules(b, parent, name)
        b.node(f"module:{name}", "module", name, parent, status="in-target" if entry else "not-in-target",
               source=source, attrs=attrs)

    project_module_ids = {node_id for node_id, node in b.nodes.items() if node["level"] == "module"}
    for name in sorted(n for n in exported_modules if f"module:{n}" in project_module_ids):
        entry = exported_modules[name]
        # UBT adds every public dependency to PublicIncludePathModules (UEBuildModule.RecursivelyCreateModules),
        # so an include-path edge is drawn only where no dependency edge already exists.
        linked = set(entry.get("PublicDependencyModules", [])) | set(entry.get("PrivateDependencyModules", []))
        for field, kind in DEPENDENCY_FIELDS.items():
            for dependency in sorted(set(entry.get(field, []))):
                if dependency == name or (kind.startswith("depends.include_") and dependency in linked):
                    continue
                target = f"module:{dependency}"
                if target not in project_module_ids:
                    target = b.boundary_module(dependency, exported)
                b.edge(kind, f"module:{name}", target, "declared", "ubt")

    # Plugins[] of the .uproject and of each project .uplugin. An entry with Enabled false switches a plugin off
    # rather than requiring it, so it is recorded on the descriptor's node instead of drawn as an edge.
    references = [(PROJECT_ID, project)] + [(f"plugin:{n}", d) for n, (_, d) in sorted(plugin_descriptors.items())]
    for source_id, descriptor in references:
        for entry in descriptor.get("Plugins", []):
            if not entry.get("Enabled", False):
                b.nodes[source_id].setdefault("attrs", {}).setdefault("disables", []).append(entry["Name"])
                continue
            target = f"plugin:{entry['Name']}"
            if target not in b.nodes:
                target = b.boundary_plugin(entry["Name"])
            if target != source_id:
                b.edge("requires", source_id, target, "declared", "descriptors", descriptors.reference_attrs(entry))

    _rollup(b)
    graph = {
        "schema": "laniakea.graph/1",
        "nodes": [b.nodes[key] for key in sorted(b.nodes)],
        "edges": [b.edges[key] for key in sorted(b.edges)],
    }
    return graph, _counts(graph)


def _conventional_rules(b, parent, name):
    """For a module the export lacks, its Build.cs at the conventional place, when it is there."""
    base = b.project_dir if parent == PROJECT_ID else b.project_dir / Path(b.nodes[parent]["source"]["path"]).parent
    rules = base / "Source" / name / f"{name}.Build.cs"
    return b.location(rules) if rules.is_file() else None


def _rollup(b):
    """depends.rollup between units: a plugin, a module directly under the project, or the engine core."""
    def unit(node_id):
        parent = b.nodes[node_id]["parent"]
        if parent == PROJECT_ID:
            return node_id
        return ENGINE_ID if parent == ENGINE_ID else parent

    roots = (PROJECT_ID, ENGINE_ID)
    totals = {}
    for edge in list(b.edges.values()):
        if not edge["type"].startswith("depends.") or edge["type"] == "depends.rollup":
            continue
        # An edge between two modules directly under a root is already visible at the top scope.
        if b.nodes[edge["source"]]["parent"] in roots and b.nodes[edge["target"]]["parent"] in roots:
            continue
        source, target = unit(edge["source"]), unit(edge["target"])
        if source == target:
            continue
        entry = totals.setdefault((source, target), {"modules": 0, "kinds": set()})
        entry["modules"] += 1
        entry["kinds"].add(edge["type"])
    for (source, target), entry in totals.items():
        b.edge("depends.rollup", source, target, "derived", "rollup",
               {"module_edges": entry["modules"], "kinds": sorted(entry["kinds"])})


def _counts(graph):
    counts = {}
    for node in graph["nodes"]:
        key = f"nodes.{node['level']}.{'boundary' if node['boundary'] else node['status']}"
        counts[key] = counts.get(key, 0) + 1
    for edge in graph["edges"]:
        counts[f"edges.{edge['type']}"] = counts.get(f"edges.{edge['type']}", 0) + 1
    return dict(sorted(counts.items()))
