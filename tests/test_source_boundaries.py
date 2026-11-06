# SPDX-License-Identifier: AGPL-3.0-or-later
"""Physical traversal boundaries apply before source bytes enter the workspace."""

import os
import subprocess
import tempfile
import unittest
from pathlib import Path

from laniakea import LaniakeaError
from laniakea.unreal import descriptors, source_inputs
from laniakea.unreal.project_copy import sync


def directory_link(link, target):
    link.parent.mkdir(parents=True, exist_ok=True)
    if os.name == 'nt':
        subprocess.run(['cmd', '/c', 'mklink', '/J', str(link), str(target)], check=True, capture_output=True)
    else:
        link.symlink_to(target, target_is_directory=True)


class Boundaries(unittest.TestCase):
    def test_external_file_link_is_rejected_too(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            project = root / 'project/Sample.uproject'
            project.parent.mkdir()
            project.write_text('{}')
            outside = root / 'Unrelated.h'
            outside.write_text('struct Other {};')
            link = project.parent / 'Source/Linked.h'
            link.parent.mkdir()
            try:
                link.symlink_to(outside)
            except OSError as error:
                if getattr(error, 'winerror', None) == 1314:
                    self.skipTest('file symlink creation requires Windows symlink privilege')
                raise
            with self.assertRaisesRegex(LaniakeaError, 'external.*declared plugin'):
                source_inputs.fingerprints(project)
            with self.assertRaisesRegex(LaniakeaError, 'external.*declared plugin'):
                sync(project, root / 'workspace/copy', root / 'workspace')
            self.assertFalse((root / 'workspace/copy/Source/Linked.h').exists())

    def test_unrelated_external_source_link_is_rejected_before_hashing_or_copying(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            project = root / 'project/Sample.uproject'
            project.parent.mkdir()
            project.write_text('{}')
            outside = root / 'unrelated'
            outside.mkdir()
            (outside / 'Unrelated.h').write_text('struct SyntheticUnrelated {};')
            directory_link(project.parent / 'Source/Foreign', outside)
            with self.assertRaisesRegex(LaniakeaError, 'external.*declared plugin'):
                source_inputs.fingerprints(project)
            destination = root / 'workspace/copy'
            with self.assertRaisesRegex(LaniakeaError, 'external.*declared plugin'):
                sync(project, destination, root / 'workspace', [project.parent / 'Source'])
            self.assertFalse((destination / 'Source/Foreign/Unrelated.h').exists())
            self.assertEqual((outside / 'Unrelated.h').read_text(), 'struct SyntheticUnrelated {};')

    def test_declared_plugin_junction_keeps_logical_paths_and_build_freshness(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            project = root / 'project/Sample.uproject'
            project.parent.mkdir()
            project.write_text('{}')
            outside = root / 'shared/SamplePlugin'
            source = outside / 'Source/SamplePlugin'
            source.mkdir(parents=True)
            (outside / 'SamplePlugin.uplugin').write_text('{"Modules":[{"Name":"SamplePlugin"}]}')
            (source / 'SamplePlugin.Build.cs').write_text('// synthetic rules')
            (source / 'Types.h').write_text('struct SampleType {};')
            mount = project.parent / 'Plugins/Shared/SamplePlugin'
            directory_link(mount, outside)
            self.assertEqual(descriptors.project_plugins(project.parent), [mount / 'SamplePlugin.uplugin'])
            self.assertIn('Plugins/Shared/SamplePlugin/Source/SamplePlugin/Types.h', source_inputs.fingerprints(project))
            self.assertIn('Plugins/Shared/SamplePlugin/Source/SamplePlugin/SamplePlugin.Build.cs', descriptors.build_inputs(project.parent))
            copy, _, _ = sync(project, root / 'workspace/copy', root / 'workspace', [mount / 'Source'])
            self.assertEqual((copy.parent / 'Plugins/Shared/SamplePlugin/Source/SamplePlugin/Types.h').read_text(), 'struct SampleType {};')
            nested = root / 'unrelated'
            nested.mkdir()
            (nested / 'Other.h').write_text('struct Other {};')
            directory_link(source / 'Hidden', nested)
            with self.assertRaisesRegex(LaniakeaError, 'external.*declared plugin'):
                source_inputs.fingerprints(project)
            with self.assertRaisesRegex(LaniakeaError, 'external.*declared plugin'):
                sync(project, copy.parent, root / 'workspace', [mount / 'Source'])
            self.assertFalse((copy.parent / 'Plugins/Shared/SamplePlugin/Source/SamplePlugin/Hidden/Other.h').exists())
