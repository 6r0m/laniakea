# SPDX-License-Identifier: AGPL-3.0-or-later
"""The pinned CPD inventory covers everything on its installed classpath."""

import tempfile
import os
import shutil
import unittest
import zipfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from laniakea import LaniakeaError
from laniakea.unreal import cpd_tools
from test_source_boundaries import directory_link


class ToolIntegrity(unittest.TestCase):
    def setUp(self):
        temporary=tempfile.TemporaryDirectory();self.addCleanup(temporary.cleanup)
        self.root=Path(temporary.name);self.distribution=self.root/'distribution'
        (self.distribution/'lib').mkdir(parents=True)
        (self.distribution/f'lib/pmd-cpp-{cpd_tools.VERSION}.jar').write_bytes(b'synthetic analyzer')
        (self.distribution/'LICENSE').write_text('Synthetic license notice')
        self.java=self.root/'jdk/java.exe';self.java.parent.mkdir()
        self.java.write_bytes(b'synthetic runtime');self.java.with_name('javac.exe').write_bytes(b'synthetic compiler')
        self.directory=self.root/'installed';self.extra_class=False

    def compile(self,command,**_kwargs):
        classes=Path(command[command.index('-d')+1])
        (classes/'CpdBridge.class').write_bytes(b'synthetic compiled adapter')
        if self.extra_class:(classes/'OldHelper.class').write_bytes(b'synthetic obsolete helper')
        return SimpleNamespace(returncode=0,stderr=b'')

    def install(self,directory=None):
        with patch.object(cpd_tools.subprocess,'run',side_effect=self.compile):
            return cpd_tools.install(directory or self.directory,self.distribution,self.java)

    def test_extra_libraries_classes_and_other_files_are_rejected_without_mutation(self):
        installed=self.install();marker=(self.directory/'tools.json').read_bytes()
        for relative in ('lib/rogue-lib.jar','classes/extra/Provider.class','untracked.txt','lib/nested/tools.json'):
            with self.subTest(relative=relative):
                extra=self.directory/relative;extra.parent.mkdir(parents=True,exist_ok=True);extra.write_bytes(b'unrecorded')
                with self.assertRaisesRegex(LaniakeaError,'inventory'):
                    cpd_tools.load(self.directory)
                self.assertEqual(extra.read_bytes(),b'unrecorded')
                self.assertEqual((self.directory/'tools.json').read_bytes(),marker)
                extra.unlink()
                self.assertEqual(cpd_tools.load(self.directory)['identity'],installed['identity'])

    def test_reinstall_removes_obsolete_libraries_and_generated_classes(self):
        obsolete=self.distribution/'lib/obsolete.jar';obsolete.write_bytes(b'obsolete supplied library')
        self.extra_class=True;self.install()
        obsolete.unlink();self.extra_class=False
        (self.directory/'lib/rogue-lib.jar').write_bytes(b'unrecorded library')
        installed=self.install();reference=self.install(self.root/'clean-install')
        for relative in ('lib/obsolete.jar','lib/rogue-lib.jar','classes/OldHelper.class'):
            self.assertFalse((self.directory/relative).exists(),relative)
        self.assertEqual(installed['identity'],reference['identity'])
        self.assertEqual((self.directory/'LICENSE').read_text(),'Synthetic license notice')

    def test_changed_or_missing_recorded_files_remain_invalid(self):
        self.install();library=self.directory/f'lib/pmd-cpp-{cpd_tools.VERSION}.jar'
        library.write_bytes(b'changed')
        with self.assertRaises(LaniakeaError):cpd_tools.load(self.directory)
        library.unlink()
        with self.assertRaises(LaniakeaError):cpd_tools.load(self.directory)

    def test_reinstall_refuses_overlapping_distribution_before_removing_anything(self):
        self.install();protected={p.relative_to(self.directory):p.read_bytes()
                                  for p in self.directory.rglob('*') if p.is_file()}
        with self.assertRaisesRegex(LaniakeaError,'separate'):
            cpd_tools.install(self.directory,self.directory,self.java)
        self.assertEqual({p.relative_to(self.directory):p.read_bytes()
                          for p in self.directory.rglob('*') if p.is_file()},protected)

    def test_reinstall_cannot_remove_its_supplied_jdk(self):
        self.install();java=self.directory/'lib/java.exe';java.write_bytes(b'synthetic runtime')
        java.with_name('javac.exe').write_bytes(b'synthetic compiler')
        protected={p.relative_to(self.directory):p.read_bytes() for p in self.directory.rglob('*') if p.is_file()}
        with self.assertRaisesRegex(LaniakeaError,'separate'):
            cpd_tools.install(self.directory,self.distribution,java)
        self.assertEqual({p.relative_to(self.directory):p.read_bytes()
                          for p in self.directory.rglob('*') if p.is_file()},protected)

    def test_failed_compilation_does_not_bless_an_incomplete_reinstall(self):
        self.install();marker=(self.directory/'tools.json').read_bytes()
        with patch.object(cpd_tools.subprocess,'run',return_value=SimpleNamespace(returncode=1,stderr=b'compile failed')):
            with self.assertRaisesRegex(LaniakeaError,'compilation failed'):
                cpd_tools.install(self.directory,self.distribution,self.java)
        self.assertEqual((self.directory/'tools.json').read_bytes(),marker)
        with self.assertRaises(LaniakeaError):cpd_tools.load(self.directory)

    def test_linked_classpath_directory_is_refused_before_reinstall_mutation(self):
        self.install()
        outside = self.root / 'foreign-classes'
        outside.mkdir()
        directory_link(self.directory / 'classes/linked', outside)
        protected=(self.directory/'classes/CpdBridge.class').read_bytes()
        with self.assertRaisesRegex(LaniakeaError,'linked entries'):cpd_tools.load(self.directory)
        with self.assertRaisesRegex(LaniakeaError,'linked entries'):self.install()
        self.assertEqual((self.directory/'classes/CpdBridge.class').read_bytes(),protected)


@unittest.skipUnless(os.environ.get('LANIAKEA_TEST_CPD'),'optional pinned CPD installation not supplied')
class RealToolSetup(unittest.TestCase):
    def test_real_offline_reinstall_discards_obsolete_jar_and_preserves_clean_identity(self):
        source=Path(os.environ['LANIAKEA_TEST_CPD']);installed=cpd_tools.load(source)
        if not installed['java'].with_name('javac.exe').is_file():
            self.skipTest('offline reinstall needs the registered JDK compiler')
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);distribution=root/'distribution';distribution.mkdir()
            shutil.copytree(source/'lib',distribution/'lib');shutil.copy2(source/'LICENSE',distribution/'LICENSE')
            obsolete=distribution/'lib/obsolete.jar'
            with zipfile.ZipFile(obsolete,'w') as archive:archive.writestr('synthetic.txt','obsolete resource')
            destination=root/'installed'
            cpd_tools.install(destination,distribution,installed['java'])
            obsolete.unlink()
            extra=destination/'lib/rogue-lib.jar'
            with zipfile.ZipFile(extra,'w') as archive:archive.writestr('synthetic.txt','unrecorded resource')
            with self.assertRaisesRegex(LaniakeaError,'inventory'):cpd_tools.load(destination)
            clean=cpd_tools.install(destination,distribution,installed['java'])
            self.assertFalse(extra.exists());self.assertFalse((destination/'lib/obsolete.jar').exists())
            self.assertEqual(clean['identity'],installed['identity'])


if __name__=='__main__':unittest.main()
