# SPDX-License-Identifier: AGPL-3.0-or-later
"""The pinned libclang C indexing ABI. C++ parsing and semantic roles stay in LLVM."""

import ctypes as c

P, U, I, S = c.c_void_p, c.c_uint, c.c_int, c.c_char_p


class String(c.Structure):
    _fields_ = [("data", P), ("flags", U)]


class Cursor(c.Structure):
    _fields_ = [("kind", U), ("xdata", I), ("data", P * 3)]


class Location(c.Structure):
    _fields_ = [("data", P * 2), ("n", U)]


class Range(c.Structure):
    _fields_ = [("data", P * 2), ("begin", U), ("end", U)]


class Entity(c.Structure):
    _fields_ = [("kind", I), ("template", I), ("language", I), ("name", S), ("usr", S),
                ("cursor", Cursor), ("attributes", P), ("num_attributes", U)]


class Container(c.Structure):
    _fields_ = [("cursor", Cursor)]


class Declaration(c.Structure):
    _fields_ = [("entity", c.POINTER(Entity)), ("cursor", Cursor), ("location", Location),
                ("semantic", c.POINTER(Container)), ("lexical", c.POINTER(Container)),
                ("redeclaration", I), ("definition", I), ("is_container", I),
                ("container", c.POINTER(Container)), ("implicit", I), ("attributes", P),
                ("num_attributes", U), ("flags", U)]


class Reference(c.Structure):
    _fields_ = [("kind", I), ("cursor", Cursor), ("location", Location),
                ("target", c.POINTER(Entity)), ("parent", c.POINTER(Entity)),
                ("container", c.POINTER(Container)), ("role", U)]


class Base(c.Structure):
    _fields_ = [("entity", c.POINTER(Entity)), ("cursor", Cursor), ("location", Location)]


class Class(c.Structure):
    _fields_ = [("declaration", c.POINTER(Declaration)), ("bases", c.POINTER(c.POINTER(Base))), ("count", U)]


class Callbacks(c.Structure):
    _fields_ = [(name, P) for name in ("abort", "diagnostic", "main", "include", "imported", "start", "declaration", "reference")]


class Library:
    def __init__(self, path):
        self.library = c.CDLL(str(path))
        self._bind("getCString", S, [String])
        self._bind("disposeString", None, [String])
        self._bind("getClangVersion", String, [])
        self._bind("createIndex", P, [I, I])
        self._bind("disposeIndex", None, [P])
        self._bind("IndexAction_create", P, [P])
        self._bind("IndexAction_dispose", None, [P])
        self._bind("indexSourceFileFullArgv", I, [P, P, c.POINTER(Callbacks), U, U, S, c.POINTER(S), I, P, U, c.POINTER(P), U])
        self._bind("disposeTranslationUnit", None, [P])
        self._bind("getInclusions", None, [P, P, P])
        self._bind("getFileContents", P, [P, P, c.POINTER(c.c_size_t)])
        self._bind("indexLoc_getFileLocation", None, [Location, P, c.POINTER(P), c.POINTER(U), c.POINTER(U), c.POINTER(U)])
        self._bind("getSpellingLocation", None, [Location, c.POINTER(P), c.POINTER(U), c.POINTER(U), c.POINTER(U)])
        self._bind("getExpansionLocation", None, [Location, c.POINTER(P), c.POINTER(U), c.POINTER(U), c.POINTER(U)])
        self._bind("getFileName", String, [P])
        self._bind("getCursorUSR", String, [Cursor])
        self._bind("getCursorSpelling", String, [Cursor])
        self._bind("getCursorDisplayName", String, [Cursor])
        self._bind("getCursorLocation", Location, [Cursor])
        self._bind("getCursorSemanticParent", Cursor, [Cursor])
        self._bind("getCursorDefinition", Cursor, [Cursor])
        self._bind("Cursor_getVarDeclInitializer", Cursor, [Cursor])
        self._bind("getCursorExtent", Range, [Cursor])
        self._bind("getRangeStart", Location, [Range])
        self._bind("getRangeEnd", Location, [Range])
        self._bind("visitChildren", U, [Cursor, P, P])
        self._bind("getCursorKindSpelling", String, [U])
        self._bind("index_getCXXClassDeclInfo", c.POINTER(Class), [c.POINTER(Declaration)])
        self._bind("getOverriddenCursors", None, [Cursor, c.POINTER(c.POINTER(Cursor)), c.POINTER(U)])
        self._bind("disposeOverriddenCursors", None, [c.POINTER(Cursor)])
        self._bind("getNumDiagnostics", U, [P])
        self._bind("getDiagnostic", P, [P, U])
        self._bind("getDiagnosticSeverity", I, [P])
        self._bind("formatDiagnostic", String, [P, U])
        self._bind("disposeDiagnostic", None, [P])

    def _bind(self, name, result, arguments):
        function = getattr(self.library, "clang_" + name)
        function.restype, function.argtypes = result, arguments
        setattr(self, name, function)

    def string(self, value):
        try:
            return (self.getCString(value) or b"").decode("utf-8")
        finally:
            self.disposeString(value)
