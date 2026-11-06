# SPDX-License-Identifier: AGPL-3.0-or-later
"""One disposable native compiler process; the parent owns its timeout and all output paths."""

import ctypes
import gzip
import json
import sys
from time import perf_counter
from pathlib import Path

from ..workspace import read_json, write_json
from .native_index import extract
from . import symbol_cache


def peak_memory():
    class Counters(ctypes.Structure):
        _fields_ = [("size", ctypes.c_ulong), ("faults", ctypes.c_ulong),
                    *[(name, ctypes.c_size_t) for name in ("peak", "working", "quota_peak_paged", "quota_paged",
                                                         "quota_peak_nonpaged", "quota_nonpaged", "pagefile", "peak_pagefile")]]
    value = Counters()
    value.size = ctypes.sizeof(value)
    current = ctypes.windll.kernel32.GetCurrentProcess
    current.restype = ctypes.c_void_p
    query = ctypes.windll.psapi.GetProcessMemoryInfo
    query.argtypes = (ctypes.c_void_p, ctypes.POINTER(Counters), ctypes.c_ulong)
    if not query(current(), ctypes.byref(value), value.size):
        return None
    return value.peak


def main():
    request = read_json(sys.argv[1])
    start = perf_counter()
    cache_warning = None
    try:
        cache = symbol_cache.prepare(request["library"], request["command"], request["copy"], request["output"])
    except OSError as error:
        cache, cache_warning = None, str(error)
    data = symbol_cache.load(cache)
    reused = data is not None
    if data is None:
        data = extract(request["library"], request["command"], request["copy"])
        try:
            symbol_cache.save(cache, data)
        except OSError as error:
            cache_warning = str(error)
    with gzip.open(request["output"], "wt", encoding="utf-8", compresslevel=1) as stream:
        json.dump(data, stream)
    write_json(Path(request["output"]).with_suffix(".metrics.json"), {
        "file": request["command"]["file"], "seconds": perf_counter() - start, "cache_hit": reused,
        "cache_enabled": cache is not None,
        "cache_warning": cache_warning,
        "errors": sum(d["severity"] >= 3 for d in data["diagnostics"]),
        "symbols": len(data["symbols"]), "references": len(data["references"]),
        "peak_working_set_bytes": peak_memory()})


if __name__ == "__main__":
    main()
