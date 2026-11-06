# SPDX-License-Identifier: AGPL-3.0-or-later
"""Explicit offline installation and identity checks for the pinned native symbol tools."""

import hashlib
import shutil
import subprocess
from pathlib import Path

from .. import LaniakeaError
from ..workspace import read_json, write_json
from .native_api import Library

VERSION = "21.1.8"


def digest(path):
    with open(path, "rb") as stream:
        result = hashlib.sha256()
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def install(directory, library, resources, compiler=None):
    directory, library, resources = Path(directory), Path(library).resolve(), Path(resources).resolve()
    if not library.is_file() or not (resources / "include/stddef.h").is_file():
        raise LaniakeaError("setup requires libclang.dll and its clang 21 resource directory")
    api = Library(library)
    if VERSION not in api.string(api.getClangVersion()):
        raise LaniakeaError(f"libclang must be version {VERSION}")
    directory.mkdir(parents=True, exist_ok=True)
    if library != (directory / "libclang.dll").resolve():
        if not (directory / "libclang.dll").is_file() or digest(library) != digest(directory / "libclang.dll"):
            shutil.copy2(library, directory / "libclang.dll")
    if resources != (directory / "lib/clang/21").resolve():
        shutil.copytree(resources, directory / "lib/clang/21", dirs_exist_ok=True)
    paths = [directory / "libclang.dll", *(directory / "lib").rglob("*")]
    if compiler:
        compiler = Path(compiler).resolve()
        result = subprocess.run([str(compiler), "--version"], capture_output=True, timeout=20,
                                creationflags=subprocess.CREATE_NO_WINDOW)
        if result.returncode or VERSION not in (result.stdout + result.stderr).decode("utf-8", errors="replace"):
            raise LaniakeaError(f"the preprocessing compiler must be LLVM {VERSION}")
        if compiler != (directory / "clang-cl.exe").resolve():
            shutil.copy2(compiler, directory / "clang-cl.exe")
        paths.append(directory / "clang-cl.exe")
    manifest = {"version": VERSION, "files": {path.relative_to(directory).as_posix(): digest(path)
                                               for path in sorted(paths) if path.is_file()}}
    write_json(directory / "tools.json", manifest)
    return load(directory)


def load(directory):
    directory = Path(directory)
    marker = directory / "tools.json"
    if not marker.is_file():
        return None
    manifest = read_json(marker)
    if manifest.get("version") != VERSION or "libclang.dll" not in manifest.get("files", {}):
        raise LaniakeaError("invalid symbol-tool installation; run setup-symbols again")
    for relative, expected in manifest["files"].items():
        path = (directory / relative).resolve()
        if not path.is_relative_to(directory.resolve()) or not path.is_file() or digest(path) != expected:
            raise LaniakeaError(f"symbol tool identity changed: {relative}; run setup-symbols again")
    return {"library": directory / "libclang.dll", "resources": directory / "lib/clang/21", "manifest": manifest,
            "compiler": directory / "clang-cl.exe" if "clang-cl.exe" in manifest["files"] else None}
