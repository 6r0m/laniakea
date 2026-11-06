# SPDX-License-Identifier: AGPL-3.0-or-later
"""Native compiler facts from one translation unit; invoked in an isolated worker process."""

import ctypes as c
import hashlib
import os
from pathlib import Path
from time import perf_counter

from .. import LaniakeaError
from .native_api import Callbacks, Cursor, Declaration, I, Library, Location, P, Reference, S, U

CLASSES = {2, 3, 4, 31, 32}
FUNCTIONS = {8, 21, 24, 25, 26, 30}
DECL_CALLBACK = c.CFUNCTYPE(None, P, c.POINTER(Declaration))
REF_CALLBACK = c.CFUNCTYPE(None, P, c.POINTER(Reference))
ABORT_CALLBACK = c.CFUNCTYPE(I, P, P)
VISITOR = c.CFUNCTYPE(U, Cursor, Cursor, P)
INCLUSION = c.CFUNCTYPE(None, P, c.POINTER(Location), U, P)


def extract(library, command, project):
    api = Library(library)
    start = perf_counter()
    project = os.path.normcase(os.path.abspath(project)).rstrip("\\/") + os.sep
    symbols, refs, relations, files, exceptions, excluded, evaluated_calls = {}, [], [], {}, [], {}, {}

    def location(loc, indexed=False):
        file, line, column, offset = P(), U(), U(), U()
        if indexed:
            api.indexLoc_getFileLocation(loc, None, c.byref(file), c.byref(line), c.byref(column), c.byref(offset))
        else:
            api.getSpellingLocation(loc, c.byref(file), c.byref(line), c.byref(column), c.byref(offset))
            if not file:
                api.getExpansionLocation(loc, c.byref(file), c.byref(line), c.byref(column), c.byref(offset))
        if file.value not in files:
            files[file.value] = api.string(api.getFileName(file)) if file else ""
        return files[file.value], line.value, column.value, offset.value

    def is_project(file):
        return file and os.path.normcase(os.path.abspath(file)).startswith(project)

    def metadata(cursor, definition=False):
        usr = api.string(api.getCursorUSR(cursor))
        if not usr:
            return None
        file, line, column, _ = location(api.getCursorLocation(cursor))
        # Clang's file-local USRs can contain only a basename. Keep equal basenames in different files distinct.
        if usr.startswith("c:") and not usr.startswith("c:@"):
            logical = os.path.relpath(file, project) if is_project(file) else os.path.abspath(file) if file else ""
            usr = os.path.normcase(logical).replace("\\", "/") + "|" + usr
        if usr in symbols and not definition:
            return usr
        level = "class" if cursor.kind in CLASSES else "function" if cursor.kind in FUNCTIONS else "other"
        parent = api.getCursorSemanticParent(cursor)
        # Namespaces remain qualified metadata; they do not create an invented containment level.
        qualified = []
        immediate = None
        for _ in range(64):
            if not parent.kind or parent.kind == 350:
                break
            name = api.string(api.getCursorSpelling(parent))
            if name:
                qualified.append(name)
            if immediate is None and parent.kind in CLASSES | FUNCTIONS:
                immediate = metadata(parent)
            next_parent = api.getCursorSemanticParent(parent)
            if next_parent.kind == parent.kind and tuple(next_parent.data) == tuple(parent.data):
                break
            parent = next_parent
        value = {"usr": usr, "name": api.string(api.getCursorSpelling(cursor)), "level": level,
                 "signature": api.string(api.getCursorDisplayName(cursor)), "parent": immediate,
                 "scope": "::".join(reversed(qualified)), "file": file, "line": line,
                 "column": column, "definition": bool(definition)}
        old = symbols.get(usr)
        if old is None or definition or not old.get("file"):
            symbols[usr] = value
        return usr

    @VISITOR
    def unevaluated(cursor, _parent, _data):
        try:
            if cursor.kind in {20, 36, 136, 154}:  # Type declarations, sizeof/alignof/noexcept, requires.
                extent = api.getCursorExtent(cursor)
                file, _, _, begin = location(api.getRangeStart(extent))
                end_file, _, _, end = location(api.getRangeEnd(extent))
                if file == end_file and file:
                    excluded.setdefault(file, []).append((begin, end))
                return 1
            if cursor.kind == 103:
                extent = api.getCursorExtent(cursor)
                file, _, _, begin = location(api.getRangeStart(extent))
                end_file, _, _, end = location(api.getRangeEnd(extent))
                if file and file == end_file:
                    evaluated_calls.setdefault(file, []).append((begin, end))
            return 2
        except Exception as error:
            exceptions.append(str(error))
            return 0

    @VISITOR
    def function_body(cursor, _parent, _data):
        try:
            if cursor.kind == 202:  # CompoundStmt excludes return/parameter type expressions.
                api.visitChildren(cursor, c.cast(unevaluated, P), None)
                return 1
            return 2
        except Exception as error:
            exceptions.append(str(error))
            return 0

    @DECL_CALLBACK
    def declaration(_data, pointer):
        try:
            item = pointer.contents
            file, _, _, _ = location(item.location, indexed=True)
            if not is_project(file) or item.implicit:
                return
            if item.cursor.kind == 9:
                initializer = api.Cursor_getVarDeclInitializer(item.cursor)
                if initializer.kind:
                    unevaluated(initializer, item.cursor, None)
                    api.visitChildren(initializer, c.cast(unevaluated, P), None)
            if item.cursor.kind not in CLASSES | FUNCTIONS:
                return
            identity = metadata(item.cursor, item.definition)
            if not identity:
                return
            if item.definition and item.cursor.kind in FUNCTIONS:
                api.visitChildren(item.cursor, c.cast(function_body, P), None)
            info = api.index_getCXXClassDeclInfo(pointer)
            if info:
                for n in range(info.contents.count):
                    base = info.contents.bases[n].contents
                    target = metadata(base.entity.contents.cursor)
                    if target:
                        relations.append({"type": "inherits", "source": identity, "target": target})
            if item.cursor.kind == 21:
                cursors, count = c.POINTER(Cursor)(), U()
                api.getOverriddenCursors(item.cursor, c.byref(cursors), c.byref(count))
                try:
                    for n in range(count.value):
                        target = metadata(cursors[n])
                        if target:
                            relations.append({"type": "overrides", "source": identity, "target": target})
                finally:
                    if cursors:
                        api.disposeOverriddenCursors(cursors)
        except Exception as error:
            exceptions.append(str(error))

    @REF_CALLBACK
    def reference(_data, pointer):
        try:
            item = pointer.contents
            if not item.target or item.target.contents.cursor.kind not in CLASSES | FUNCTIONS:
                return
            file, line, column, offset = location(item.location, indexed=True)
            if not is_project(file):
                return
            target = metadata(item.target.contents.cursor)
            source = metadata(item.parent.contents.cursor) if item.parent else None
            if source and symbols[source]["level"] == "other":
                source = symbols[source]["parent"]
            if not source and item.container:
                source = metadata(item.container.contents.cursor)
            refs.append({"source": source, "target": target, "role": item.role, "file": file,
                         "line": line, "column": column, "offset": offset,
                         "implicit": item.kind == 2})
        except Exception as error:
            exceptions.append(str(error))

    @ABORT_CALLBACK
    def abort(_data, _reserved):
        return bool(exceptions)

    @INCLUSION
    def inclusion(file, _stack, _length, _data):
        try:
            if file not in files:
                files[file] = api.string(api.getFileName(file))
        except Exception as error:
            exceptions.append(str(error))

    callbacks = Callbacks()
    callbacks.abort = c.cast(abort, P)
    callbacks.declaration = c.cast(declaration, P)
    callbacks.reference = c.cast(reference, P)
    index = api.createIndex(0, 0)
    action = api.IndexAction_create(index)
    translation_unit = P()
    diagnostics = []
    input_hashes = {}
    args = [*command["arguments"], "-working-directory=" + command["directory"]]
    argv = (S * len(args))(*(arg.encode("utf-8") for arg in args))
    try:
        code = api.indexSourceFileFullArgv(action, None, c.byref(callbacks), c.sizeof(callbacks), 2 | 4,
                                         None, argv, len(args), None, 0, c.byref(translation_unit), 0)
        if translation_unit:
            api.getInclusions(translation_unit, c.cast(inclusion, P), None)
            for file, name in files.items():
                if not file or not name:
                    continue
                size = c.c_size_t()
                buffer = api.getFileContents(translation_unit, file, c.byref(size))
                if not buffer and (size.value or Path(name).stat().st_size):
                    raise LaniakeaError("native compiler did not expose an input buffer")
                input_hashes[name] = hashlib.sha256(c.string_at(buffer, size.value) if buffer else b"").hexdigest()
            for n in range(api.getNumDiagnostics(translation_unit)):
                diagnostic = api.getDiagnostic(translation_unit, n)
                try:
                    diagnostics.append({"severity": api.getDiagnosticSeverity(diagnostic),
                                        "text": api.string(api.formatDiagnostic(diagnostic, 3))})
                finally:
                    api.disposeDiagnostic(diagnostic)
        if exceptions:
            raise LaniakeaError("native index callback failed: " + exceptions[0])
        if code or not translation_unit:
            raise LaniakeaError(f"native compiler could not index the translation unit (code {code})")
    finally:
        if translation_unit:
            api.disposeTranslationUnit(translation_unit)
        api.IndexAction_dispose(action)
        api.disposeIndex(index)
    for ref in refs:
        ref["unevaluated"] = any(begin <= ref["offset"] < end for begin, end in excluded.get(ref["file"], []))
        ref["call_confirmed"] = (bool(ref["role"] & 32) and not ref["unevaluated"] and
                                 any(begin <= ref["offset"] < end for begin, end in evaluated_calls.get(ref["file"], [])))
    return {"symbols": list(symbols.values()), "references": refs, "relations": relations,
            "diagnostics": diagnostics, "files": sorted(set(filter(None, files.values()))),
            "input_hashes": input_hashes,
            "seconds": perf_counter() - start}
