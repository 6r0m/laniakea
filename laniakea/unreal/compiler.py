# SPDX-License-Identifier: AGPL-3.0-or-later
"""Own the workspace compiler lifecycle; publish only clean, attributable native facts."""

import concurrent.futures
import ctypes
import gzip
import json
import os
import subprocess
import sys
from pathlib import Path
from time import perf_counter

from .. import LaniakeaError
from ..workspace import read_json, write_json
from . import commands, graph, project_copy, symbols, tools, ubt


def _worker(library, command, copy, output):
    output = Path(output)
    request = output.with_suffix(".request.json")
    write_json(request, {"library": library, "command": command, "copy": copy, "output": str(output)})
    env = dict(os.environ, TEMP=str(output.parent), TMP=str(output.parent))
    package = str(Path(__file__).resolve().parents[2])
    env["PYTHONPATH"] = package + (os.pathsep + env["PYTHONPATH"] if env.get("PYTHONPATH") else "")
    with open(output.with_suffix(".log"), "wb") as log:
        try:
            result = subprocess.run([sys.executable, "-m", "laniakea.unreal.native_worker", str(request)],
                                    cwd=output.parent, env=env, stdout=log, stderr=subprocess.STDOUT,
                                    timeout=900, creationflags=subprocess.CREATE_NO_WINDOW)
        except subprocess.TimeoutExpired as error:
            raise LaniakeaError(f"native compiler exceeded 900 seconds; see {log.name}") from error
    if result.returncode:
        raise LaniakeaError(f"native compiler worker failed ({result.returncode}); see {output.with_suffix('.log')}")
    return read_json(output.with_suffix(".metrics.json"))


def run_jobs(installed, database, copy, out, workers=4):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    start, completed = perf_counter(), []
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(workers, len(database))) as executor:
            futures = {executor.submit(_worker, str(installed["library"]), command, str(copy),
                                       str(out / f"job-{n:04d}.json.gz")): n
                       for n, command in enumerate(database)}
            for future in concurrent.futures.as_completed(futures):
                try:
                    item = {"job": futures[future], **future.result()}
                except BaseException:
                    for pending in futures:
                        pending.cancel()
                    raise
                completed.append(item)
                print(f"laniakea: compiler {len(completed)}/{len(database)} units, {item['errors']} error(s)", flush=True)
                write_json(out / "progress.json", {"seconds": perf_counter() - start, "jobs": completed})
    except (OSError, RuntimeError) as error:
        raise LaniakeaError(f"native symbol worker failed: {error}; see {out}") from error
    if len(completed) != len(database) or any(job["errors"] for job in completed):
        raise LaniakeaError(f"native symbol analysis has compiler errors; prior published run retained; see {out}")
    return completed


def worker_count():
    class Memory(ctypes.Structure):
        _fields_ = [("size", ctypes.c_ulong), ("load", ctypes.c_ulong),
                    *[(name, ctypes.c_ulonglong) for name in ("total", "available", "total_page", "available_page",
                                                            "total_virtual", "available_virtual", "extended")]]
    memory = Memory()
    memory.size = ctypes.sizeof(memory)
    if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(memory)):
        return 1
    return max(1, min(4, (os.cpu_count() or 1), memory.available // (3 * 1024 ** 3)))


def batches(out, count):
    for n in range(count):
        with gzip.open(Path(out) / f"job-{n:04d}.json.gz", "rt", encoding="utf-8") as stream:
            yield json.load(stream)


def extract(target, run_dir, built, exported, chosen, tools_dir):
    installed = tools.load(tools_dir)
    if installed is None:
        raise LaniakeaError('symbol analysis requested without local LLVM tools; run setup-symbols first')
    if chosen["build_context"]["selection"] not in {"receipt", "retained-receipt"}:
        raise LaniakeaError('symbol analysis requires usable successful-build context; omit --symbols for module exploration')
    run_dir = Path(run_dir)
    # run is <workspace>/targets/<id>/runs/<run>; mutable preparation belongs to the target, not a published run.
    target_dir = run_dir.parent.parent
    workspace = target_dir.parent.parent
    project = Path(target["project_file"])
    out = run_dir / "compiler"
    out.mkdir(exist_ok=True)
    directories = [m["Directory"] for m in exported["Modules"].values()
                   if graph._relative(m["Directory"], project.parent) is not None]
    start = perf_counter()
    copy, digest, files = project_copy.sync(project, target_dir / "copy", workspace, directories, target.get("excludes", []))
    timings = {"copy": perf_counter() - start}
    start = perf_counter()
    copied_export = ubt.export(target["engine_root"], copy, chosen["name"], "Win64", chosen["configuration"], out)
    _check_exports(exported, copied_export, project.parent, copy.parent)
    timings["copy_fidelity"] = perf_counter() - start
    start = perf_counter()
    actions = ubt.build_actions(target["engine_root"], copy, chosen["name"], chosen["configuration"], out, workspace)
    database = commands.from_actions(actions, copy.parent, installed["resources"])
    write_json(out / "compile_commands.json", database)
    write_json(out / "provenance.json", {"copy_input_digest": digest, "copied_inputs": files,
                                       "tools": installed["manifest"], "context": chosen})
    timings["native_actions"] = perf_counter() - start
    start = perf_counter()
    jobs = run_jobs(installed, database, copy.parent, out, worker_count())
    timings["native_index"] = perf_counter() - start
    start = perf_counter()
    external = {}
    def recorded_batches():
        for batch in batches(out, len(database)):
            for name, value in batch["input_hashes"].items():
                if graph._relative(name, copy.parent) is None:
                    key = "external:" + name
                    if key in external and external[key] != value:
                        raise LaniakeaError("an external compiler input changed during analysis")
                    external[key] = value
            yield batch
    generated = generated_owners(copy, project, chosen["name"], exported)
    result, unknown = symbols.merge(built, recorded_batches(), project, copy.parent,
                                    target["engine_root"], exported, generated)
    timings["normalize_symbols"] = perf_counter() - start
    nodes = {node["id"]: node for node in result["nodes"]}
    counts = {}
    units = {}
    for command in database:
        source = commands.remap(command["file"], copy.parent, project.parent)
        module = next((name for name, entry in exported["Modules"].items()
                       if graph._relative(source, entry["Directory"]) is not None), None)
        if module is None and Path(command["file"]).parent.name in exported["Modules"]:
            module = Path(command["file"]).parent.name
        if module:
            units["module:" + module] = units.get("module:" + module, 0) + 1
    for node in result["nodes"]:
        if node["level"] not in {"class", "function"}:
            continue
        parent = node["parent"]
        while parent and nodes[parent]["level"] != "module":
            parent = nodes[parent]["parent"]
        if parent:
            values = counts.setdefault(parent, {"class": 0, "function": 0})
            values[node["level"]] += 1
    for node in result["nodes"]:
        if node["level"] == "module" and not node["boundary"]:
            attrs = node.setdefault("attrs", {})
            values = counts.get(node["id"], {})
            attrs["indexed_classes"] = values.get("class", 0)
            attrs["indexed_functions"] = values.get("function", 0)
            attrs["compiler_units"] = units.get(node["id"], 0)
            attrs["compiler_analysis"] = ("outside current target" if node["status"] != "in-target" else
                "declarations reached by native target compilation" if attrs["compiler_units"] else
                "declarations reached through other compiled modules" if values else
                "not analysed: no native unit or authored declaration observed")
    return result, {"enabled": True, "timings": timings, "unknown": unknown, "units": len(jobs), "external_inputs": external}


def generated_owners(copy, original, target, exported):
    paths = list((Path(copy).parent / "Intermediate").rglob(target + ".uhtmanifest"))
    if not paths:
        return {}
    if len(paths) != 1:
        raise LaniakeaError("ambiguous native header-tool manifests")
    manifest = read_json(paths[0])
    if manifest.get("TargetName") != target:
        raise LaniakeaError("header-tool manifest names a different target")
    result = {}
    for module in manifest["Modules"]:
        name = module["Name"]
        if name not in exported["Modules"]:
            continue
        base = commands.remap(module["BaseDirectory"], Path(copy).parent, Path(original).parent)
        if graph._norm(base) != graph._norm(exported["Modules"][name]["Directory"]):
            raise LaniakeaError("header-tool module ownership disagrees with JsonExport")
        directory = commands.remap(module["OutputDirectory"], Path(copy).parent, Path(original).parent)
        result[str(directory)] = name
    return result


def _check_exports(original, copied, original_root, copy_root):
    def context(exported, root):
        result = {}
        for name, module in exported["Modules"].items():
            value = {}
            for key, item in module.items():
                if key in graph.DEPENDENCY_FIELDS or "PCH" in key or "Definitions" in key or key == "ForceIncludeModules":
                    value[key] = json.loads(json.dumps(item).replace(str(root).replace("\\", "\\\\"), "<project>")
                                                  .replace(Path(root).as_posix(), "<project>"))
            result[name] = value
        return result
    if context(original, original_root) != context(copied, copy_root):
        raise LaniakeaError("workspace copy changes evaluated definitions, dependencies or PCH settings")
