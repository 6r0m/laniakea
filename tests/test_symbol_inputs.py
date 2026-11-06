# SPDX-License-Identifier: AGPL-3.0-or-later
"""Copy safety must hold before any compiler preparation."""

import tempfile
import unittest
import hashlib
import json
from pathlib import Path

from laniakea import LaniakeaError
from laniakea.unreal.project_copy import check, sync
from laniakea.unreal import commands, tools


class Copies(unittest.TestCase):
    def test_changed_or_escaping_tools_are_refused_before_native_loading(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            library = root / 'libclang.dll'
            library.write_bytes(b'synthetic library identity')
            manifest = {'version': tools.VERSION, 'files': {'libclang.dll': tools.digest(library)}}
            (root / 'tools.json').write_text(json.dumps(manifest))
            self.assertEqual(tools.load(root)['library'], library)
            library.write_bytes(b'changed')
            with self.assertRaisesRegex(LaniakeaError, 'identity changed'):
                tools.load(root)
            outside = root.parent / (root.name + '-not-created.dll')
            manifest['files'] = {'libclang.dll': hashlib.sha256(b'changed').hexdigest(),
                                 '../' + outside.name: 'invalid'}
            (root / 'tools.json').write_text(json.dumps(manifest))
            with self.assertRaisesRegex(LaniakeaError, 'identity changed'):
                tools.load(root)

    def test_native_response_lines_keep_float_flags_and_text_pch_search_paths(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / 'Sample.cpp'
            source.write_text('int Sample;')
            response = root / 'Sample.rsp'
            response.write_text('/fp:precise\n/FI"Sample Definitions.h"\n/FpSample.pch\n/YuSample.h\n/FoSample.obj\n"' + str(source) + '"')
            actions = {'Actions': [
                {'Type': 'Compile', 'WorkingDirectory': str(root),
                 'CommandArguments': '/YcSample.h /FpSample.pch /I"pch includes"'},
                {'Type': 'Compile', 'WorkingDirectory': str(root),
                 'CommandArguments': '@"' + str(response) + '"'}]}
            [entry] = commands.from_actions(actions, root, root / 'resources')
            args = entry['arguments']
            self.assertIn('/fp:precise', args)
            self.assertNotIn('/FoSample.obj', args)
            self.assertNotIn('/FpSample.pch', args)
            self.assertNotIn('/YuSample.h', args)
            self.assertIn(str(root / 'pch includes'), args)
            start = args.index('-Xclang')
            self.assertEqual(args[start:start+4], ['-Xclang', '-include', '-Xclang', 'Sample Definitions.h'])
            self.assertEqual(entry['file'], str(source))
            response.write_text('@"' + str(response) + '"')
            with self.assertRaisesRegex(LaniakeaError, 'cyclic'):
                commands.from_actions(actions, root, root / 'resources')

    def test_copy_protects_source_names_and_removes_only_previously_copied_inputs(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            original, workspace = root / "original", root / "workspace"
            original.mkdir()
            project = original / "Sample.uproject"
            project.write_text("{}")
            files = {"Source/Content/Types.h": "struct Sample {};", "Content/Large.uasset": "asset",
                     "tmp/probe.txt": "scratch", ".env": "do not copy", "Data/schema.json": "{}"}
            for name, text in files.items():
                path = original / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(text)
            copy, digest, _ = sync(project, workspace / "copy", workspace, [original / "Source"])
            self.assertTrue((copy.parent / "Source/Content/Types.h").is_file())
            self.assertFalse((copy.parent / "Content").exists())
            self.assertFalse((copy.parent / ".env").exists())
            self.assertFalse((copy.parent / "tmp").exists())
            generated = copy.parent / "Intermediate/kept.txt"
            generated.parent.mkdir()
            generated.write_text("UBT output")
            (original / "Data/schema.json").unlink()
            _, changed, _ = sync(project, copy.parent, workspace, [original / "Source"])
            self.assertNotEqual(digest, changed)
            self.assertFalse((copy.parent / "Data/schema.json").exists())
            self.assertTrue(generated.is_file())
            check(copy, workspace)
            with self.assertRaises(LaniakeaError):
                check(project, workspace)

    def test_unmarked_and_outside_workspace_copies_are_refused(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            project = root / "original/Sample.uproject"
            project.parent.mkdir()
            project.write_text("{}")
            destination = root / "workspace/copy"
            destination.mkdir(parents=True)
            (destination / "user.txt").write_text("keep")
            with self.assertRaises(LaniakeaError):
                sync(project, destination, root / "workspace")
            self.assertEqual((destination / "user.txt").read_text(), "keep")
            with self.assertRaises(LaniakeaError):
                sync(project, root / "elsewhere", root / "workspace")

