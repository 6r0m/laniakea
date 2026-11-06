# SPDX-License-Identifier: AGPL-3.0-or-later
"""Normalize native compiler identities and relationships without expanding Engine internals."""

import hashlib
from functools import lru_cache
from pathlib import Path

from .. import LaniakeaError
from . import graph
from .commands import remap

EDGE_TYPES = [
    {"id": "calls", "label": "calls (statically resolved)", "status": "resolved"},
    {"id": "uses.function", "label": "function reference", "status": "resolved"},
    {"id": "uses.type", "label": "type reference", "status": "resolved"},
    {"id": "inherits", "label": "inherits", "status": "resolved"},
    {"id": "overrides", "label": "overrides", "status": "resolved"},
]


def node_id(usr):
    return "symbol:" + hashlib.sha256(usr.encode("utf-8")).hexdigest()


def merge(built, batches, project, copy, engine, exported, generated_owners=None):
    builder = graph._Builder(project, engine)
    builder.nodes = {n["id"]: n for n in built["nodes"]}
    builder.edges = {e["id"]: e for e in built["edges"]}
    project_root = Path(project).parent
    module_directories = {}
    for name, entry in exported["Modules"].items():
        module_directories.setdefault(graph._norm(entry["Directory"]), name)
    all_directories = {**module_directories, **{graph._norm(path): name for path, name in (generated_owners or {}).items()}}
    facts, references, relations = {}, [], []
    for batch in batches:
        if any(d["severity"] >= 3 for d in batch["diagnostics"]):
            raise LaniakeaError("a translation unit with compiler errors cannot publish symbol facts")
        for symbol in batch["symbols"]:
            old = facts.get(symbol["usr"])
            if old and old["level"] != symbol["level"]:
                raise LaniakeaError("compiler identity collision")
            if old and old["name"] != symbol["name"]:
                same_declaration = (bool(old["file"]) and graph._norm(old["file"]) == graph._norm(symbol["file"]) and
                                    (old["line"], old["column"], old["parent"]) ==
                                    (symbol["line"], symbol["column"], symbol["parent"]))
                if not same_declaration:
                    raise LaniakeaError("compiler identity collision")
            if old is None or symbol["definition"] and not old["definition"]:
                facts[symbol["usr"]] = symbol
        references.extend(batch["references"])
        relations.extend(batch["relations"])

    @lru_cache(maxsize=None)
    def original(file):
        return remap(file, copy, project_root) if file else None

    @lru_cache(maxsize=None)
    def owner(file, include_generated=True):
        path = original(file)
        if path is None:
            return None
        for folder in (path, *path.parents):
            name = (all_directories if include_generated else module_directories).get(graph._norm(folder))
            if name is not None:
                return name
        return None

    def authored(symbol):
        path = original(symbol["file"])
        module = owner(symbol["file"], False)
        return module and path and graph._relative(path, project_root) is not None

    ids = {}
    for usr, symbol in facts.items():
        if symbol["level"] not in {"class", "function"} or not authored(symbol):
            continue
        identity = node_id(usr)
        if identity in builder.nodes:
            raise LaniakeaError("compiler identity collides with a structural node")
        ids[usr] = identity
        path = original(symbol["file"])
        builder.node(identity, symbol["level"], symbol["name"] or "(anonymous)", "module:" + owner(symbol["file"]),
                     source={"root": "project", "path": graph._relative(path, project_root), "line": symbol["line"]},
                     attrs={"signature": symbol["signature"], "qualified": "::".join(filter(None, (symbol["scope"], symbol["name"]))),
                            "analysis": "resolved", "definition": symbol["definition"]})
    for usr, identity in ids.items():
        parent = facts[usr]["parent"]
        if parent in ids and parent != usr:
            builder.nodes[identity]["parent"] = ids[parent]

    unknown = {"source": 0, "target": 0}

    def endpoint(usr, file=None):
        if usr in ids:
            return ids[usr]
        symbol = facts.get(usr, {})
        module = None
        parent = symbol.get("parent")
        visited = set()
        while module is None and parent and parent not in visited:
            visited.add(parent)
            enclosing = facts.get(parent, {})
            module = owner(enclosing.get("file"))
            parent = enclosing.get("parent")
        if module is None:
            module = owner(symbol.get("file") or file)
        if not module:
            if symbol.get("file") and graph._relative(original(symbol["file"]), engine) is not None:
                return graph.ENGINE_ID
            if usr and symbol.get("file") and graph._relative(original(symbol["file"]), project_root) is None:
                builder.node("external:cpp", "project", "External C++ headers", None, boundary=True,
                             attrs={"analysis": "referenced declarations only"})
                return "external:cpp"
            return None
        identity = "module:" + module
        if identity not in builder.nodes:
            builder.boundary_module(module, exported)
        return identity

    for relation in relations:
        source, target = endpoint(relation["source"]), endpoint(relation["target"])
        if source is None or target is None or builder.nodes[source]["boundary"]:
            continue
        builder.edge(relation["type"], source, target, "resolved", "compiler")
        if source == target and (relation["source"] not in ids or relation["target"] not in ids):
            builder.edges[f"{relation['type']}:{source}->{target}"]["internal_to_owner"] = True
    seen = set()
    for reference in references:
        if not reference["role"] & 4:
            continue
        if owner(reference["file"], False) is None:
            continue
        source = endpoint(reference["source"], reference["file"])
        if source is None or builder.nodes[source]["boundary"]:
            source = endpoint(None, reference["file"])
        target = endpoint(reference["target"])
        if source is None or target is None:
            unknown["source" if source is None else "target"] += 1
            continue
        if builder.nodes[source]["boundary"]:
            raise LaniakeaError("a compiler reference acquired an external source owner")
        symbol = facts.get(reference["target"], {})
        kind = ("calls" if reference["call_confirmed"] else
                "uses.function" if symbol.get("level") == "function" else "uses.type")
        location = {"root": "project", "path": graph._relative(original(reference["file"]), project_root),
                    "line": reference["line"]}
        key = (kind, source, target, location["path"], location["line"], reference["column"], reference["target"])
        if key in seen:
            continue
        seen.add(key)
        suffix = hashlib.sha256(repr(key).encode()).hexdigest()[:24]
        identity = f"{kind}:{source}->{target}:{suffix}"
        builder.edges[identity] = {"id": identity, "type": kind, "source": source, "target": target,
                                   "status": "resolved", "origin": "compiler",
                                   "attrs": {"location": location, "column": reference["column"],
                                             "symbol": "::".join(filter(None, (symbol.get("scope"), symbol.get("signature")))),
                                             "dispatch": "virtual target declaration" if reference["role"] & 64 else "static",
                                             "implicit": reference["implicit"]}}
        if source == target and (reference["source"] not in ids or reference["target"] not in ids
                                 or (kind == "uses.type" and symbol.get("level") == "class")):
            builder.edges[identity]["internal_to_owner"] = True
    result = {"schema": built["schema"], "nodes": list(builder.nodes.values()), "edges": list(builder.edges.values())}
    _dependency_reviews(result, exported)
    return result, unknown


def _dependency_reviews(built, exported):
    nodes = {n["id"]: n for n in built["nodes"]}
    def module(identity):
        while identity and nodes[identity]["level"] != "module":
            identity = nodes[identity]["parent"]
        return nodes[identity]["label"] if identity else None

    def path(source, target, public_only=False):
        pending, visited = [[source]], {source}
        for chain in pending:
            entry = exported["Modules"].get(chain[-1], {})
            following = entry.get("PublicDependencyModules", [])
            if not public_only or len(chain) == 1:
                following = [*following, *entry.get("PrivateDependencyModules", [])]
            for name in following:
                if name == target:
                    return [*chain, name]
                if name not in visited:
                    visited.add(name)
                    pending.append([*chain, name])
        return []

    checked = {}
    for edge in built["edges"]:
        if edge["type"] != "calls":
            continue
        source, target = module(edge["source"]), module(edge["target"])
        if not source or not target or source == target:
            continue
        pair = (source, target)
        if pair not in checked:
            entry = exported["Modules"].get(source, {})
            direct = target in entry.get("PublicDependencyModules", []) + entry.get("PrivateDependencyModules", [])
            checked[pair] = None if direct else {
                "dependency_review": "No direct build dependency; review usage (not a violation)",
                "transitive_path": path(source, target), "public_exposure_path": path(source, target, True)}
        if checked[pair]:
            edge["attrs"].update(checked[pair])
