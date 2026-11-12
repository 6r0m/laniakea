# SPDX-License-Identifier: AGPL-3.0-or-later
"""Validation against schema/graph.v1.schema.json, the one owner of the data shapes.

Only the JSON Schema keywords that file uses are implemented. An unknown keyword raises, so the
schema can never silently say more than this validator checks.
"""

import json
from pathlib import Path

from . import LaniakeaError

SCHEMA_FILE = Path(__file__).resolve().parent.parent / "schema" / "graph.v1.schema.json"
_ANNOTATIONS = {"$schema", "$id", "$defs", "title", "description"}
_CHECKS = {"$ref", "const", "enum", "type", "required", "properties", "additionalProperties", "items"}
_TYPES = {
    "string": str,
    "integer": int,
    "number": (int, float),
    "boolean": bool,
    "object": dict,
    "array": list,
    "null": type(None),
}


def load():
    return json.loads(SCHEMA_FILE.read_text(encoding="utf-8"))


def _is_type(value, name):
    if name in ("integer", "number") and isinstance(value, bool):
        return False
    return isinstance(value, _TYPES[name])


def _errors(value, rule, root, path):
    for key in rule:
        if key not in _ANNOTATIONS and key not in _CHECKS:
            raise LaniakeaError(f"schema keyword {key!r} at {path} is not supported by laniakea.schema")
    if "$ref" in rule:
        name = rule["$ref"].removeprefix("#/$defs/")
        yield from _errors(value, root["$defs"][name], root, path)
    if "const" in rule and value != rule["const"]:
        yield f"{path}: expected {rule['const']!r}"
    if "enum" in rule and value not in rule["enum"]:
        yield f"{path}: {value!r} is not one of {rule['enum']}"
    if "type" in rule:
        names = rule["type"] if isinstance(rule["type"], list) else [rule["type"]]
        if not any(_is_type(value, name) for name in names):
            yield f"{path}: expected {' or '.join(names)}"
            return
    if isinstance(value, dict):
        for name in rule.get("required", []):
            if name not in value:
                yield f"{path}: missing {name!r}"
        properties = rule.get("properties", {})
        extra = rule.get("additionalProperties", True)
        for name, item in value.items():
            if name in properties:
                yield from _errors(item, properties[name], root, f"{path}.{name}")
            elif extra is False:
                yield f"{path}: unexpected {name!r}"
            elif isinstance(extra, dict):
                yield from _errors(item, extra, root, f"{path}.{name}")
    if isinstance(value, list) and "items" in rule:
        for index, item in enumerate(value):
            yield from _errors(item, rule["items"], root, f"{path}[{index}]")


def validate(value, definition=None):
    """Raise LaniakeaError listing the first problems, or return None when value conforms."""
    root = load()
    rule = root if definition is None else root["$defs"][definition]
    problems = list(_errors(value, rule, root, "$"))
    if problems:
        shown = "; ".join(problems[:5])
        more = f" (+{len(problems) - 5} more)" if len(problems) > 5 else ""
        raise LaniakeaError(f"{definition or 'graph'} does not match the schema: {shown}{more}")
    if definition == 'map':
        files, nodes = value.get('files', []), value['nodes']
        for file in files:
            memberships = [file['owner'], *file['declarations'], *file['definitions']]
            if not file['root'] or not file['path'] or any(not 0 <= index < len(nodes) for index in memberships):
                raise LaniakeaError('invalid source file catalog membership')
        for row in value['references']:
            for end in ('source_file', 'target_file'):
                if end in row and not 0 <= row[end] < len(files):
                    raise LaniakeaError('invalid reference file index')
    if definition in {"edge", "referenceGroup"}:
        edges = [value]
    elif definition == "map":
        edges = value["references"]
    elif definition == "referencePage":
        edges = (item["reference"] for item in value["items"])
    else:
        edges = value.get("edges", [])
    for edge in edges:
        if edge.get("internal_to_owner") and edge["source"] != edge["target"]:
            raise LaniakeaError("internal_to_owner reference must have identical endpoints")


def validate_overview(manifest, graph):
    """Check cross-document presentation references before a run can be published."""
    hint = manifest.get("overview")
    if hint is None:
        return
    nodes = {node["id"]: node for node in graph["nodes"]}
    anchor = nodes.get(hint["anchor"])
    types = hint["configuration_types"]
    declared = {entry["id"] for entry in manifest["edge_types"]}
    if not anchor or not anchor["boundary"] or anchor["parent"] is not None:
        raise LaniakeaError("overview anchor must name an existing boundary root")
    if len(set(types)) != len(types) or any(kind not in declared or kind.endswith(".rollup") for kind in types):
        raise LaniakeaError("overview configuration types must be unique declared exact types")
