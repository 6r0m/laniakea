# SPDX-License-Identifier: AGPL-3.0-or-later
"""Argument preparation and the real adjacent-PCH failure in the pinned native indexer."""

import json
import os
import re
import subprocess
import tempfile
import unittest
from pathlib import Path

from laniakea import LaniakeaError
from laniakea.unreal.clangd import textual_includes


class TextualIncludes(unittest.TestCase):
    def test_joined_and_separated_headers_keep_their_order_and_other_flags(self):
        arguments = ["clang-cl.exe", "/FIShared.h", "/fp:precise", "/DVALUE=1", "/FI", "Module Definitions.h",
                     "/FiPreprocessed.txt", "/FpNative.pch", "Sample.cpp"]
        original = list(arguments)
        self.assertEqual(textual_includes(arguments), [
            "clang-cl.exe", "-Xclang", "-include", "-Xclang", "Shared.h", "/fp:precise", "/DVALUE=1",
            "-Xclang", "-include", "-Xclang", "Module Definitions.h", "/FiPreprocessed.txt", "/FpNative.pch",
            "Sample.cpp"])
        self.assertEqual(arguments, original)

    def test_driver_include_and_existing_frontend_arguments_are_idempotent(self):
        arguments = ["clang-cl.exe", "-include", "Shared.h", "-Xclang", "-include", "-Xclang", "Module.h",
                     "-Xclang", "-fno-spell-checking", "Sample.cpp"]
        prepared = textual_includes(arguments)
        self.assertEqual(prepared, textual_includes(prepared))
        self.assertEqual(prepared.count("-include"), 2)

    def test_missing_arguments_fail_instead_of_dropping_flags(self):
        for arguments in (["/FI"], ["-include"], ["/FI", ""], ["-Xclang"]):
            with self.subTest(arguments=arguments), self.assertRaises(LaniakeaError):
                textual_includes(arguments)


INDEXER = os.environ.get("LANIAKEA_TEST_CLANGD_INDEXER")


@unittest.skipUnless(INDEXER, "set LANIAKEA_TEST_CLANGD_INDEXER to the pinned clangd-indexer 21.1.8")
class NativeIndexer(unittest.TestCase):
    def test_neighboring_binary_pch_cannot_hide_forced_header_symbols_or_reference(self):
        tool = Path(INDEXER).resolve()
        version = subprocess.run([str(tool), "--version"], capture_output=True, text=True, timeout=10, check=True)
        self.assertIn("21.1.8", version.stdout + version.stderr, "the probe contract is pinned to clangd 21.1.8")
        resource = tool.parent.parent / "lib/clang/21"
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            header, source = root / "SampleTypes.h", root / "SampleCalls.cpp"
            header.write_text("struct SampleBase { int Target(); };\nstruct SamplePackage : SampleBase {};\n", encoding="utf-8")
            source.write_text("struct SamplePackage;\nint Caller(SamplePackage* p) { return p->Target(); }\n", encoding="utf-8")
            header.with_suffix(".h.pch").write_bytes(b"Synthetic native PCH, not a Clang AST.")
            original = ["clang-cl.exe", "/std:c++20", "/FI" + str(header), str(source)]

            def run(arguments):
                database = root / "compile_commands.json"
                database.write_text(json.dumps([{"directory": str(root), "file": str(source), "arguments": arguments}]),
                                    encoding="utf-8")
                result = subprocess.run([str(tool), "--executor=all-TUs", "--execute-concurrency=1", "--format=yaml",
                                         f"--extra-arg=-resource-dir={resource}", str(database)],
                                        cwd=root, capture_output=True, text=True, timeout=20,
                                        creationflags=subprocess.CREATE_NO_WINDOW)
                self.assertEqual(result.returncode, 0)
                return result.stdout, result.stderr

            broken, diagnostics = run(original)
            self.assertIn("incomplete type", diagnostics)
            self.assertIn("Failed to run action", diagnostics)
            self.assertNotIn("Name:            Target", broken)
            restored, diagnostics = run(textual_includes(original))
            self.assertNotIn("error:", diagnostics)
            self.assertNotIn("Failed to run action", diagnostics)
            symbols = restored.split("--- !Symbol")[1:]
            target = next(block for block in symbols if re.search(r"^Name:\s+Target$", block, re.M))
            target_id = re.search(r"^ID:\s+(\w+)$", target, re.M)[1]
            references = restored.split("--- !Refs")[1:]
            target_refs = next(block for block in references if re.search(r"^ID:\s+" + target_id + r"$", block, re.M))
            self.assertRegex(target_refs, r"Kind:\s+28", "the restored inherited-method reference must exist")
