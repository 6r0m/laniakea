# SPDX-License-Identifier: AGPL-3.0-or-later
"""Drill-down scopes, one shard file each. Language-neutral: only parent, boundary and edges matter.

A container scope shows a node's children, and their edges to each other and to outside nodes no deeper than the
children. Deeper edges are left out, because a derived edge at the children's level summarises them. A leaf scope
shows one node and all its direct neighbours.
"""

import re

from . import LaniakeaError
from .workspace import write_json

ENTRY = "entry.json"


def file_name(node_id):
    """A reversible, URL-safe file name for a scope."""
    return re.sub(r"[^A-Za-z0-9_.-]", lambda m: "~%02X" % ord(m.group()), node_id) + ".json"


def _entry_root(nodes):
    roots = [n for n in nodes.values() if n["parent"] is None and not n["boundary"]]
    if len(roots) != 1:
        raise LaniakeaError(f"a graph needs exactly one non-boundary root node, found {len(roots)}")
    return roots[0]["id"]


def build(graph):
    """Return {file name: shard}."""
    nodes = {n["id"]: n for n in graph["nodes"]}
    children = {}
    for node in graph["nodes"]:
        children.setdefault(node["parent"], []).append(node["id"])

    def ancestors(node_id):
        chain = []
        while nodes[node_id]["parent"] is not None:
            node_id = nodes[node_id]["parent"]
            chain.append(node_id)
        return chain

    depth = {n: len(ancestors(n)) for n in nodes}
    root = _entry_root(nodes)
    openable = {n for n in nodes if not nodes[n]["boundary"] and (children.get(n) or n != root)}
    files = {n: (ENTRY if n == root else file_name(n)) for n in openable}

    shards = {}
    for scope in sorted(openable):
        container = bool(children.get(scope))
        members = sorted(children[scope]) if container else [scope]
        member_set = set(members)
        member_depth = depth[members[0]]
        hidden = {scope, *ancestors(scope)} if container else set(ancestors(scope))
        shown, edges = set(members), []
        for edge in graph["edges"]:
            ends = (edge["source"], edge["target"])
            if not (set(ends) & member_set) or set(ends) & hidden:
                continue
            if container and any(end not in member_set and depth[end] > member_depth for end in ends):
                continue
            edges.append(edge)
            shown.update(ends)
        parents = [{"title": nodes[a]["label"], "file": files[a]} for a in reversed(ancestors(scope)) if a in files]
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


def write(graph, directory):
    shards = build(graph)
    for name, shard in shards.items():
        write_json(directory / name, shard)
    return shards
