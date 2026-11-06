# SPDX-License-Identifier: AGPL-3.0-or-later
"""Preprocessed validation must reject newly appearing headers and stale source coordinates."""

import hashlib
import os
import tempfile
import unittest
import gzip
import json
from pathlib import Path

from laniakea.unreal import symbol_cache
from laniakea.unreal import compiler, project_copy


class Facts(unittest.TestCase):
    def test_changed_buffers_failed_facts_and_corrupt_payloads_are_not_reused(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "Sample.cpp"
            source.write_text("int Sample();")
            entry = root / "facts.json.gz", "preprocessed"
            data = {"input_hashes": {str(source): hashlib.sha256(source.read_bytes()).hexdigest()}, "diagnostics": []}
            symbol_cache.save(entry, data)
            self.assertEqual(symbol_cache.load(entry), data)
            self.assertIsNone(symbol_cache.load((entry[0], "different preprocessing")))
            source.write_text("// coordinates changed\nint Sample();")
            self.assertIsNone(symbol_cache.load(entry))
            entry[0].unlink()
            symbol_cache.save(entry, {**data, "diagnostics": [{"severity": 3}]})
            self.assertFalse(entry[0].exists())
            entry[0].write_bytes(b"corrupt")
            self.assertIsNone(symbol_cache.load(entry))


@unittest.skipUnless(os.environ.get("LANIAKEA_TEST_CLANG_COMPILER"), "set LANIAKEA_TEST_CLANG_COMPILER for native preprocessing")
class NativePreprocessing(unittest.TestCase):
    @unittest.skipUnless(os.environ.get("LANIAKEA_TEST_LIBCLANG"), "set LANIAKEA_TEST_LIBCLANG too")
    def test_worker_reuses_only_clean_matching_facts_and_rechecks_negative_header_probes(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            original = root / "original/Sample.uproject"
            original.parent.mkdir()
            original.write_text("{}")
            source = original.parent / "Sample.cpp"
            optional = root / "external/Optional.h"
            source.write_text('#if __has_include("' + optional.as_posix() + '")\n#define SAMPLE_CALLEE SampleNew\n#else\n#define SAMPLE_CALLEE SampleOld\n#endif\nint SAMPLE_CALLEE(); int SampleCaller(){return SAMPLE_CALLEE();}\n')
            copy, _, _ = project_copy.sync(original, root / "workspace/copy", root / "workspace")
            unit = copy.parent / "Sample.cpp"
            command = {"file": str(unit), "directory": str(copy.parent), "arguments": ["clang-cl.exe", str(unit)]}
            outputs = root / "workspace/outputs"
            outputs.mkdir()
            def run(n):
                path = outputs / f"job{n}.json.gz"
                metrics = compiler._worker(os.environ["LANIAKEA_TEST_LIBCLANG"], command, str(copy.parent), str(path))
                with gzip.open(path, "rt", encoding="utf-8") as stream:
                    return metrics, json.load(stream)
            first, data = run(1)
            self.assertTrue(first["cache_enabled"])
            self.assertFalse(first["cache_hit"])
            second, repeated = run(2)
            self.assertTrue(second["cache_hit"])
            self.assertEqual(data, repeated)
            optional.parent.mkdir()
            optional.write_text("// newly present, not an old positive dependency\n")
            changed, new = run(3)
            self.assertFalse(changed["cache_hit"])
            self.assertIn("SampleNew", {s["name"] for s in new["symbols"]})
            self.assertNotIn("SampleOld", {s["name"] for s in new["symbols"]})

    def test_windows_command_limit_uses_a_response_file(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "Sample.cpp"
            source.write_text("int SampleConstant=SAMPLE_LONG_DEFINITION_1499;\n")
            command = {"file": str(source), "directory": str(root), "arguments": ["clang-cl.exe",
                       *(f"/DSAMPLE_LONG_DEFINITION_{n}=1" for n in range(1500)), str(source)]}
            installed = {"compiler": Path(os.environ["LANIAKEA_TEST_CLANG_COMPILER"])}
            self.assertIsNotNone(symbol_cache.fingerprint(installed, command, root / "long.log"))

    def test_new_absolute_header_probe_changes_fingerprint_and_volatile_macros_disable_it(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "Sample.cpp"
            external = root / "external/Optional.h"
            source.write_text('#if __has_include("' + external.as_posix() + '")\nint SampleNew();\n#else\nint SampleOld();\n#endif\n')
            command = {"file": str(source), "directory": str(root), "arguments": ["clang-cl.exe", str(source)]}
            installed = {"compiler": Path(os.environ["LANIAKEA_TEST_CLANG_COMPILER"])}
            first = symbol_cache.fingerprint(installed, command, root / "first.log")
            self.assertIsNotNone(first)
            external.parent.mkdir()
            external.write_text("// now present\n")
            second = symbol_cache.fingerprint(installed, command, root / "second.log")
            self.assertNotEqual(first, second)
            source.write_text('const char* SampleTime=__TIME__;\n')
            self.assertIsNone(symbol_cache.fingerprint(installed, command, root / "volatile.log"))
