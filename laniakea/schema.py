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
