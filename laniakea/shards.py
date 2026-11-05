# SPDX-License-Identifier: AGPL-3.0-or-later
"""Drill-down scopes, one shard file each. Language-neutral: only parent, boundary and edges matter.

A container scope shows a node's children. Everything outside it is seen as the siblings of the scope and of its
ancestors: an endpoint inside a child is drawn as that child, and an endpoint elsewhere as the topmost node that holds
it without holding the scope; a node in another tree, such as the engine, becomes that tree's root. Edges drawn this
way between collapsed endpoints are summarised as one derived `<family>.rollup` edge per pair, where the family is the
edge type before its first dot. A leaf scope shows one node and all its direct neighbours exactly.
"""

import re

from . import LaniakeaError
from .workspace import write_json

ENTRY = "entry.json"
INDEX = "index.json"
EXAMPLES = 12


def file_name(node_id):
    """A reversible, URL-safe file name for a scope."""
    encoded = re.sub(r"[^A-Za-z0-9_.-]", lambda m: "".join("~%02X" % b for b in m.group().encode("utf-8")), node_id)
    # Escape a character, rather than append a suffix that another valid id could already have.
    if encoded.lower() in ("entry", "index"):
        encoded = "~%02X" % ord(encoded[0]) + encoded[1:]
    return encoded + ".json"


def rollup_type(edge_type):
    return edge_type.split(".", 1)[0] + ".rollup"


def _entry_root(nodes):
    roots = [n for n in nodes.values() if n["parent"] is None and not n["boundary"]]
    if len(roots) != 1:
        raise LaniakeaError(f"a graph needs exactly one non-boundary root node, found {len(roots)}")
    return roots[0]["id"]


def _files(nodes, children):
    """Every non-boundary node has a scope, including the entry of a project without children."""
    root = _entry_root(nodes)
    openable = {n for n in nodes if not nodes[n]["boundary"]}
    return {n: (ENTRY if n == root else file_name(n)) for n in openable}


def _tree(graph):
    nodes = {n["id"]: n for n in graph["nodes"]}
    children = {}
    for node in graph["nodes"]:
        children.setdefault(node["parent"], []).append(node["id"])
    return nodes, children


def index(graph):
    """Every openable node with its file, so a viewer can find a node outside the scope it shows."""
    nodes, children = _tree(graph)
    files = _files(nodes, children)
    return {"schema": "laniakea.index/1", "nodes": [
        {"id": n, "label": nodes[n]["label"], "level": nodes[n]["level"], "file": files[n],
         "child_count": len(children.get(n, []))} for n in sorted(files)]}


def build(graph):
    """Return {file name: shard}."""
    nodes, children = _tree(graph)

    def chain(node_id):
        """The node and its ancestors, root first."""
        path = [node_id]
        while nodes[path[-1]]["parent"] is not None:
            path.append(nodes[path[-1]]["parent"])
        return path[::-1]

    chains = {n: chain(n) for n in nodes}
    files = _files(nodes, children)
    openable = set(files)
    incident = {n: [] for n in nodes}
    for edge in graph["edges"]:
        for endpoint in {edge["source"], edge["target"]}:
            incident[endpoint].append(edge)

    def container(scope):
        members = sorted(children[scope])
        scope_chain = chains[scope]
        depth = len(scope_chain)

        def shown_as(node_id):
            path = chains[node_id]
            if path[:depth] == scope_chain:
                return path[depth] if len(path) > depth else None
            if path[0] != scope_chain[0]:
                return path[0]
            for index, ancestor in enumerate(path):
                if index >= len(scope_chain) or ancestor != scope_chain[index]:
                    return ancestor
            return None

        drawn, summaries = [], {}
        for edge in graph["edges"]:
            source, target = shown_as(edge["source"]), shown_as(edge["target"])
            if source is None or target is None or source == target:
                continue
            if source not in members and target not in members:
                continue
            if (source, target) == (edge["source"], edge["target"]):
                drawn.append(edge)
                continue
            kind = rollup_type(edge["type"])
            summary = summaries.setdefault((kind, source, target), {"edges": 0, "kinds": set(), "between": set()})
            summary["edges"] += 1
            summary["kinds"].add(edge["type"])
            summary["between"].add(f"{nodes[edge['source']]['label']} -> {nodes[edge['target']]['label']}")
        for (kind, source, target), summary in sorted(summaries.items()):
            between = sorted(summary["between"])
            drawn.append({"id": f"{kind}:{source}->{target}", "type": kind, "source": source, "target": target,
                          "status": "derived", "origin": "rollup",
                          "attrs": {"edges": summary["edges"], "kinds": sorted(summary["kinds"]),
                                    "between": between[:EXAMPLES] + ([f"and {len(between) - EXAMPLES} more"]
                                                                     if len(between) > EXAMPLES else [])}})
        return members, drawn

    def leaf(scope):
        return [scope], incident[scope]

    shards = {}
    for scope in sorted(openable):
        members, edges = container(scope) if children.get(scope) else leaf(scope)
        shown = set(members) | {end for e in edges for end in (e["source"], e["target"])}
        parents = [{"title": nodes[a]["label"], "file": files[a]} for a in chains[scope][:-1] if a in files]
        shards[files[scope]] = {
            "schema": "laniakea.shard/1",
            "scope": scope,
            "title": nodes[scope]["label"],
            "parents": parents,
            "members": members,
            "nodes": [nodes[n] for n in sorted(shown)],
            "edges": edges,
            "drill": {n: files[n] for n in sorted(shown) if n in files and n != scope},
        }
    return shards


def edge_types(shards):
    """Every edge type the shards use, so the manifest can describe the summaries they added."""
    return sorted({edge["type"] for shard in shards.values() for edge in shard["edges"]})


def write(graph, directory):
    """Write every shard and the index; returns (shards, index)."""
    shards, found = build(graph), index(graph)
    for name, shard in shards.items():
        write_json(directory / name, shard)
    write_json(directory / INDEX, found)
    return shards, found
