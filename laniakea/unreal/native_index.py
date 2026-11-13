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
CONTAINERS = CLASSES | FUNCTIONS | {22}
KINDS = {2:"struct",3:"union",4:"class",8:"function",21:"method",22:"namespace",
         24:"constructor",25:"destructor",26:"conversion function",30:"function template",
         31:"class template",32:"class template specialization",6:"field",9:"variable"}
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
    declared_types = {}

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

    def logical(file):
        return os.path.normcase(os.path.relpath(file, project) if is_project(file) else file).replace("\\", "/")

    def cursor_identity(cursor, file):
        usr = api.string(api.getCursorUSR(cursor))
        if not usr:
            return None
        # Clang's file-local USRs can contain only a basename. Keep equal basenames in different files distinct.
        if usr.startswith("c:") and not usr.startswith("c:@"):
            usr = logical(file) + "|" + usr
        if cursor.kind == 22:
            current=cursor
            for _ in range(64):
                if current.kind==22 and not api.string(api.getCursorSpelling(current)):
                    usr="scope:"+logical(file)+"|"+usr
                    break
                current=api.getCursorSemanticParent(current)
                if not current.kind or current.kind==350:
                    break
        return usr

    def metadata(cursor, definition=None):
        file, line, column, _ = location(api.getCursorLocation(cursor))
        usr=cursor_identity(cursor,file)
        if not usr:
            return None
        old=symbols.get(usr)
        if cursor.kind in CLASSES and not definition and usr not in declared_types:
            declared_types[usr]=Cursor.from_buffer_copy(cursor)
        here={"file":file,"line":line,"column":column}
        if old is not None and cursor.kind==22:
            if here not in old['locations']:
                old['locations'].append(here)
        if old is not None and definition is False:
            old.setdefault('declaration',here)
        if old is not None and not definition:
            return usr
        level = "class" if cursor.kind in CLASSES else "function" if cursor.kind in FUNCTIONS else "namespace" if cursor.kind==22 else "other"
        parent = api.getCursorSemanticParent(cursor)
        qualified = []
        immediate = None
        for _ in range(64):
            if not parent.kind or parent.kind == 350:
                break
            name = api.string(api.getCursorSpelling(parent))
            if name:
                qualified.append(name)
            if immediate is None and parent.kind in CONTAINERS:
                immediate = metadata(parent)
            next_parent = api.getCursorSemanticParent(parent)
            if next_parent.kind == parent.kind and tuple(next_parent.data) == tuple(parent.data):
                break
            parent = next_parent
        value = {"usr": usr, "name": api.string(api.getCursorSpelling(cursor)), "level": level,
                 "signature": api.string(api.getCursorDisplayName(cursor)), "parent": immediate,
                 "scope": "::".join(reversed(qualified)), "file": file, "line": line,
                 "column": column, "definition": bool(definition)}
        value['declaration_kind']=KINDS.get(cursor.kind,'declaration')
        access=api.getCXXAccessSpecifier(cursor)
        if access in {1,2,3}:
            value['access']={1:'public',2:'protected',3:'private'}[access]
        if cursor.kind in {21,30}:
            for name,method in [('static',api.CXXMethod_isStatic),('virtual',api.CXXMethod_isVirtual),('const',api.CXXMethod_isConst)]:
                value[name]=bool(method(cursor))
        if cursor.kind in FUNCTIONS:
            result=api.string(api.getTypeSpelling(api.getCursorResultType(cursor))) if cursor.kind not in {24,25} else ''
            value['type_signature']=((result+' ') if result else '')+value['signature']+(' const' if value.get('const') else '')
        loc=api.getCursorLocation(cursor)
        value['declaration_origin']='macro expansion' if location(loc)!=location_expansion(loc) else 'unknown'
        if definition is False:
            value['declaration']=here
        if cursor.kind in CLASSES and definition:
            value['declaration']=here
        if cursor.kind==22:
            value['locations']=old['locations'] if old else [here]
        if old:
            for name in ('declaration','lambda_name'):
                if name=='declaration' and cursor.kind in CLASSES and definition:
                    continue
                if name in old:
                    value[name]=old[name]
            if old.get('declaration_kind')=='lambda':
                value['declaration_kind']='lambda'
        if old is None or definition or not old.get("file"):
            symbols[usr] = value
        return usr

    def callable_identities(cursor):
        identities=set()
        for _ in range(64):
            if cursor.kind not in FUNCTIONS:
                break
            identity=cursor_identity(cursor,location(api.getCursorLocation(cursor))[0])
            if not identity or identity in identities:
                break
            identities.add(identity)
            cursor=api.getSpecializedCursorTemplate(cursor)
        return identities

    def location_expansion(loc):
        file,line,column,offset=P(),U(),U(),U()
        api.getExpansionLocation(loc,c.byref(file),c.byref(line),c.byref(column),c.byref(offset))
        return (api.string(api.getFileName(file)) if file else '',line.value,column.value,offset.value)

    @VISITOR
    def unevaluated(cursor, _parent, _data):
        try:
            if cursor.kind==144:
                closure=api.getTypeDeclaration(api.getCursorType(cursor))
                identity=metadata(closure)
                if identity:
                    symbols[identity]['declaration_kind']='lambda'
                    if _parent.kind in {6,9}:
                        symbols[identity]['lambda_name']=api.string(api.getCursorSpelling(_parent))
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
            if item.cursor.kind in {6,9}:
                initializer = api.Cursor_getVarDeclInitializer(item.cursor)
                if initializer.kind:
                    unevaluated(initializer, item.cursor, None)
                    api.visitChildren(initializer, c.cast(unevaluated, P), None)
            member=item.cursor.kind in {6,9} and api.getCursorSemanticParent(item.cursor).kind in CLASSES
            if item.cursor.kind not in CONTAINERS and not member:
                return
            identity = metadata(item.cursor, bool(item.definition))
            if not identity:
                return
            if member:
                symbols[identity]['level']='member'
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
            while source and symbols[source]["level"] in {"other","member","namespace"}:
                source = symbols[source]["parent"]
            if not source and item.container:
                source = metadata(item.container.contents.cursor)
            refs.append({"source": source, "target": target, "role": item.role, "file": file,
                         "line": line, "column": column, "offset": offset,
                         "callee_selected": bool(item.role & 32) and target in callable_identities(api.getCursorReferenced(item.cursor)),
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
        # Definitions may appear after an observed forward declaration, including outside the project.
        for usr,cursor in list(declared_types.items()):
            if symbols[usr]['definition']:
                continue
            definition=api.getCursorDefinition(cursor)
            if definition.kind in CLASSES and metadata(definition,True)!=usr:
                raise LaniakeaError('compiler definition changed an observed type identity')
    finally:
        if translation_unit:
            api.disposeTranslationUnit(translation_unit)
        api.IndexAction_dispose(action)
        api.disposeIndex(index)
    for ref in refs:
        ref["unevaluated"] = any(begin <= ref["offset"] < end for begin, end in excluded.get(ref["file"], []))
        ref["call_confirmed"] = (bool(ref["role"] & 32) and ref['callee_selected'] and not ref["unevaluated"] and
                                 any(begin <= ref["offset"] < end for begin, end in evaluated_calls.get(ref["file"], [])))
    return {"symbols": list(symbols.values()), "references": refs, "relations": relations,
            "diagnostics": diagnostics, "files": sorted(set(filter(None, files.values()))),
            "input_hashes": input_hashes,
            "seconds": perf_counter() - start}
