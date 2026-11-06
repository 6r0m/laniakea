# SPDX-License-Identifier: AGPL-3.0-or-later
"""Read target build evidence; a partial receipt must never replace retained usable context."""

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from .. import LaniakeaError
from ..workspace import same_file
from . import engine

CONFIGURATIONS = {"Debug", "DebugGame", "Development", "Shipping", "Test"}
LINKED = {"Executable", "DynamicLibrary"}


def receipts(project):
    return sorted((Path(project).parent / "Binaries" / "Win64").glob("*.target"))


def fingerprints(project):
    found = {}
    for path in receipts(project):
        try:
            before = path.stat()
            raw = path.read_bytes()
            after = path.stat()
        except OSError as error:
            raise LaniakeaError(f"cannot fingerprint build receipt {path.name}: {error}") from error
        if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
            raise LaniakeaError(f"build receipt {path.name} changed during extraction; retry after the build finishes")
        # Receipt time selects context even when its JSON bytes did not change.
        found[path.relative_to(Path(project).parent).as_posix()] = hashlib.sha256(
            raw + b"\0" + str(after.st_mtime_ns).encode("ascii")).hexdigest()
    return found


def _location(path, roots):
    # Keep project plugin junctions in their logical project namespace, like descriptor paths.
    path = Path(os.path.abspath(path))
    for name, root in roots.items():
        try:
            return {"root": name, "path": path.relative_to(root).as_posix()}
        except ValueError:
            continue
    raise ValueError("linked product is outside the project and selected engine")


def _product(location, roots):
    root = roots[location["root"]].resolve()
    path = Path(os.path.abspath(root / location["path"]))
    if not path.is_relative_to(root):
        raise ValueError("linked product escapes its root")
    stat = path.stat()
    if not path.is_file() or not stat.st_size:
        raise ValueError("linked product is missing or empty")
    return {**location, "size": stat.st_size, "mtime_ns": stat.st_mtime_ns}


def _read(path, project, roots, targets, version):
    before = path.stat()
    raw = path.read_bytes()
    value = json.loads(raw.decode("utf-8-sig"))
    if not isinstance(value, dict):
        raise ValueError("receipt must be an object")
    name = value.get("TargetName")
    if name not in targets:
        return None
    if not isinstance(value.get("Project"), str) or not same_file(path.parent / value["Project"], project):
        raise ValueError("receipt names a foreign project")
    if value.get("TargetType") != targets[name]["type"] or value.get("Platform") != "Win64":
        raise ValueError("receipt target type or platform does not match")
    configuration = value.get("Configuration")
    if configuration not in CONFIGURATIONS:
        raise ValueError("unsupported build configuration")
    if value.get("Version", {}) != version:
        # Additional receipt-only version fields need not match Build.version.
        if any(value.get("Version", {}).get(key) != version[key]
               for key in ("MajorVersion", "MinorVersion", "PatchVersion", "Changelist")):
            raise ValueError("receipt engine version does not match the selected engine")
    products = []
    for entry in value.get("BuildProducts", []):
        if entry["Type"] not in LINKED:
            continue
        expanded = entry["Path"].replace("$(ProjectDir)", str(roots["project"]))
        expanded = expanded.replace("$(EngineDir)", str(roots["engine"] / "Engine"))
        if "$(" in expanded:
            raise ValueError("unresolved variable in linked product")
        product = Path(expanded)
        if not product.is_absolute():
            raise ValueError("linked product path is not absolute")
        products.append(_product(_location(product, roots), roots))
    if not products or not any(p["root"] == "project" for p in products):
        raise ValueError("partial receipt: no project linked build products")
    after = path.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise ValueError("receipt changed while being read; retry after the build finishes")
    if any(product["mtime_ns"] > after.st_mtime_ns for product in products):
        raise ValueError("linked products are newer than the receipt; build attribution is unknown")
    return {"name": name, "type": targets[name]["type"], "platform": "Win64", "configuration": configuration,
            "build_context": {"selection": "receipt", "receipt": path.relative_to(roots["project"]).as_posix(),
                              "sha256": hashlib.sha256(raw).hexdigest(), "mtime_ns": after.st_mtime_ns,
                              "created_utc": datetime.fromtimestamp(after.st_mtime, timezone.utc).isoformat(),
                              "engine_version": engine.version(roots["engine"]), "products": products}}


def select(project, engine_root, targets, wanted=None, previous=None):
    """Return usable native/retained context, plus explicit limitations; None permits only M1's unbuilt default."""
    project = Path(project).resolve()
    roots = {"project": project.parent, "engine": Path(engine_root).resolve()}
    known = {target["name"]: target for target in targets}
    if wanted and wanted not in known:
        raise LaniakeaError(f"target {wanted!r} not found; the project has {', '.join(known)}")
    version = json.loads((roots["engine"] / "Engine/Build/Build.version").read_text(encoding="utf-8-sig"))
    found, limitations = [], []
    for path in receipts(project):
        try:
            context = _read(path, project, roots, known, version)
        except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
            limitations.append(f"unreadable or unusable receipt {path.name}: {error}")
            continue
        if context and (not wanted or context["name"] == wanted):
            found.append(context)
    retained = (previous or {}).get("target", {})
    evidence = retained.get("build_context", {})
    if evidence.get("selection") in ("receipt", "retained-receipt") and (not wanted or retained.get("name") == wanted):
        try:
            if (retained["name"] not in known or retained["type"] != known[retained["name"]]["type"]
                    or evidence["engine_version"] != engine.version(roots["engine"])):
                raise ValueError("target or engine changed")
            if not evidence["products"] or any(_product({k: p[k] for k in ("root", "path")}, roots) != p
                                               for p in evidence["products"]):
                raise ValueError("linked products changed")
            found.append({**retained, "build_context": {**evidence, "selection": "retained-receipt"}})
        except (OSError, ValueError, KeyError, TypeError) as error:
            limitations.append(f"retained build context unavailable: {error}")
    if not found:
        limitations.append("no usable completed target receipt; successful-build compiler context is not available")
        return None, limitations
    newest = max(item["build_context"]["mtime_ns"] for item in found)
    candidates = [item for item in found if item["build_context"]["mtime_ns"] == newest]
    if len({(item["name"], item["configuration"]) for item in candidates}) > 1:
        raise LaniakeaError("ambiguous latest build receipts have equal timestamps; pass --target")
    chosen = next((item for item in candidates if item["build_context"]["selection"] == "receipt"), candidates[0])
    limitations.append("receipt-backed configuration is not a source snapshot or proof that current sources compiled")
    return chosen, limitations
