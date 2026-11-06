# SPDX-License-Identifier: AGPL-3.0-or-later
"""Compiler-preprocessed reuse of clean facts, with exact parsed-buffer and payload validation."""

import gzip
import hashlib
import json
import os
import subprocess
import threading
import zlib
from pathlib import Path

from ..workspace import read_json
from . import project_copy, tools


def fingerprint(installed, command, log):
    """Hash compiler output without retaining the expanded project/SDK source."""
    digest = hashlib.sha256()
    stopped = threading.Event()
    response = Path(log).resolve().with_suffix(".rsp")
    response.write_text(subprocess.list2cmdline([*command["arguments"][1:], "/E", "/clang:-Wdate-time"]), encoding="utf-8")
    with open(log, "wb") as errors:
        process = subprocess.Popen([str(installed["compiler"]), "@" + str(response)], cwd=command["directory"],
                                   stdout=subprocess.PIPE, stderr=errors,
                                   creationflags=subprocess.CREATE_NO_WINDOW)
        def terminate():
            stopped.set()
            if process.poll() is None:
                process.kill()
        timer = threading.Timer(180, terminate)
        timer.daemon = True
        timer.start()
        try:
            for block in iter(lambda: process.stdout.read(1024 * 1024), b""):
                digest.update(block)
            code = process.wait(timeout=10)
        finally:
            timer.cancel()
            if process.poll() is None:
                process.kill()
                process.wait(timeout=10)
            process.stdout.close()
    diagnostics = Path(log).read_bytes()
    if stopped.is_set() or code or b"[-Wdate-time]" in diagnostics:
        return None
    return digest.hexdigest()


def prepare(library, command, copy, output):
    copy, output = Path(copy), Path(output)
    marker = copy / project_copy.MARKER
    if not marker.is_file():
        return None
    marker_data = read_json(marker)
    project_copy.check(copy / Path(marker_data["source"]).name, marker_data["workspace"])
    installed = tools.load(Path(library).parent)
    if not installed or not installed["compiler"]:
        return None
    native_code = {name: tools.digest(Path(__file__).with_name(name))
                   for name in ("native_api.py", "native_index.py", "native_worker.py", "symbol_cache.py")}
    context = {"command": command, "tools": installed["manifest"], "native_code": native_code,
               "environment": {key: os.environ.get(key) for key in ("CL", "_CL_", "INCLUDE")}}
    key = hashlib.sha256(json.dumps(context, sort_keys=True).encode()).hexdigest()
    preprocessed = fingerprint(installed, command, output.with_suffix(".preprocess.log"))
    if preprocessed is None:
        return None
    root = copy.parent / "compiler-cache"
    root.mkdir(exist_ok=True)
    return root / (key + ".json.gz"), preprocessed


def load(entry):
    if entry is None:
        return None
    path, preprocessed = entry
    try:
        record = json.loads(gzip.decompress(path.read_bytes()))
        payload = record["payload"]
        data = json.loads(payload)
        if record["preprocessed"] != preprocessed or hashlib.sha256(payload.encode()).hexdigest() != record["sha256"]:
            return None
        if not data.get("input_hashes") or any(d["severity"] >= 3 for d in data["diagnostics"]):
            return None
        for name, expected in data["input_hashes"].items():
            if tools.digest(name) != expected:
                return None
        return data
    except (OSError, ValueError, KeyError, EOFError, zlib.error):
        return None


def save(entry, data):
    if entry is None or any(d["severity"] >= 3 for d in data["diagnostics"]):
        return
    path, preprocessed = entry
    payload = json.dumps(data)
    record = {"preprocessed": preprocessed, "payload": payload,
              "sha256": hashlib.sha256(payload.encode()).hexdigest()}
    temporary = path.with_name(path.name + f".{os.getpid()}.tmp")
    temporary.write_bytes(gzip.compress(json.dumps(record).encode(), compresslevel=1, mtime=0))
    os.replace(temporary, path)
