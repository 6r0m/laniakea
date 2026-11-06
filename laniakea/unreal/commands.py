# SPDX-License-Identifier: AGPL-3.0-or-later
"""Windows compiler database expansion and text-PCH context for native analysis."""

import ctypes
from pathlib import Path

from .. import LaniakeaError
from .clangd import textual_includes


def split(command):
    count = ctypes.c_int()
    parse = ctypes.windll.shell32.CommandLineToArgvW
    parse.argtypes = (ctypes.c_wchar_p, ctypes.POINTER(ctypes.c_int))
    parse.restype = ctypes.POINTER(ctypes.c_wchar_p)
    pointer = parse(command, ctypes.byref(count))
    if not pointer:
        raise LaniakeaError("cannot tokenize compiler command")
    try:
        return [pointer[i] for i in range(count.value)]
    finally:
        free = ctypes.windll.kernel32.LocalFree
        free.argtypes = (ctypes.c_void_p,)
        free(pointer)


def expand(arguments, directory, stack=()):
    result = []
    for argument in arguments:
        if not argument.startswith("@"):
            result.append(argument)
            continue
        path = Path(argument[1:])
        if not path.is_absolute():
            path = Path(directory) / path
        path = path.resolve()
        if path in stack or len(stack) > 16:
            raise LaniakeaError("cyclic or excessively nested compiler response file")
        raw = path.read_bytes()
        text = raw.decode("utf-16" if raw.startswith((b"\xff\xfe", b"\xfe\xff")) else "utf-8-sig")
        # A dummy executable makes CommandLineToArgvW apply ordinary argument quoting to the first token too.
        result.extend(expand(split("compiler " + text.replace("\r", " ").replace("\n", " "))[1:], directory, (*stack, path)))
    return result


def analysis_arguments(arguments):
    result, index = [], 0
    paired = {"/Fo", "/Fd", "/Fe", "/Fa", "/Fi", "/Fp", "/Yu", "/Yc",
              "/sourceDependencies", "/experimental:log"}
    while index < len(arguments):
        arg = arguments[index]
        index += 1
        if arg in paired:
            if index == len(arguments):
                raise LaniakeaError(f"compiler option {arg} is missing its value")
            index += 1
        elif any(arg.startswith(flag) and len(arg) > len(flag) for flag in paired):
            continue
        elif arg in {"/c", "/d2ExtendedWarningInfo", "/dximplicitlyinstantiatevirtualfunction-"} or arg.startswith("/errorReport:"):
            continue
        else:
            result.append(arg)
    return result


def include_paths(arguments, directory):
    paths, index = [], 0
    while index < len(arguments):
        arg = arguments[index]
        index += 1
        if arg in {"/I", "-I", "/external:I", "-isystem"}:
            if index == len(arguments):
                raise LaniakeaError("missing compiler include path")
            value = arguments[index]
            index += 1
        elif arg.startswith(("/I", "-I")):
            value = arg[2:]
        elif arg.startswith("/external:I"):
            value = arg[len("/external:I"):]
        else:
            continue
        path = Path(value)
        paths.append(path if path.is_absolute() else Path(directory) / path)
    return paths


def absolute_includes(arguments, directory):
    result, index = [], 0
    while index < len(arguments):
        arg = arguments[index]
        index += 1
        prefix = next((p for p in ("/external:I", "-isystem", "/I", "-I") if arg.startswith(p)), None)
        if prefix is None:
            result.append(arg)
            continue
        value = arg[len(prefix):]
        if not value:
            if index == len(arguments):
                raise LaniakeaError("missing compiler include path")
            value = arguments[index]
            index += 1
        path = Path(value)
        result.extend((prefix, str(path.absolute() if path.is_absolute() else (Path(directory) / path).absolute())))
    return result


def remap(path, source, destination):
    path, source = Path(path).absolute(), Path(source).absolute()
    return Path(destination) / path.relative_to(source) if path.is_relative_to(source) else path


def from_actions(actions, copy_root, resources):
    """Keep native unity/PCH membership from the current copy's exported build actions."""
    root = Path(copy_root).absolute()
    result = []
    pch_paths = {}
    expanded = []
    for action in actions["Actions"]:
        if action["Type"] != "Compile":
            continue
        directory = action["WorkingDirectory"]
        original = expand(split("compiler " + action["CommandArguments"])[1:], directory)
        expanded.append((action, original))
        for option in original:
            if option.startswith("/Fp") and any(a.startswith("/Yc") for a in original):
                pch_paths[option[3:].replace("\\", "/").lower()] = include_paths(original, directory)
    for action, original in expanded:
        directory = action["WorkingDirectory"]
        if any(a.startswith("/Yc") for a in original):
            continue
        source = next((Path(a).absolute() for a in original if a.lower().endswith((".cpp", ".cc", ".cxx", ".c")) and Path(a).is_file()), None)
        if source is None or not source.is_relative_to(root):
            continue
        inherited = []
        for option in original:
            if option.startswith("/Fp"):
                key = option[3:].replace("\\", "/").lower()
                if key not in pch_paths:
                    raise LaniakeaError("native PCH compilation context is missing from the action export")
                inherited = pch_paths[key]
        args = textual_includes(absolute_includes(analysis_arguments(original), directory))
        args += [value for path in inherited for value in ("/I", str(path))]
        args += ["-resource-dir=" + str(resources), "/clang:-ferror-limit=0"]
        result.append({"file": str(source), "directory": directory, "arguments": ["clang-cl.exe", *args]})
    if not result:
        raise LaniakeaError("native action export contains no project translation units")
    return result
