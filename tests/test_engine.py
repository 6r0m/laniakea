# SPDX-License-Identifier: AGPL-3.0-or-later
"""Finding the engine: --engine, EngineAssociation through launcher and source-build registrations, the tree."""

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from laniakea import LaniakeaError
from laniakea.unreal import engine
from support import fake_engine


class EngineResolution(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.base = Path(self.temporary.name)
        self.engine = fake_engine(self.base)

    def tearDown(self):
        self.temporary.cleanup()

    def project(self, association, folder=None):
        path = Path(folder or self.base / "Project") / "Project.uproject"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"FileVersion": 3, "EngineAssociation": association}), encoding="utf-8")
        return path

    def test_launcher_list_resolves_a_version(self):
        listing = self.base / "Epic" / "UnrealEngineLauncher" / "LauncherInstalled.dat"
        listing.parent.mkdir(parents=True)
        listing.write_text(json.dumps({"InstallationList": [
            {"AppName": "UE_5.8", "InstallLocation": str(self.engine)},
            {"AppName": "SomeGame", "InstallLocation": str(self.base)},
        ]}), encoding="utf-8")
        installs = engine.launcher_installations(self.base / "Epic")
        self.assertEqual(installs, {"5.8": self.engine})
        self.assertEqual(engine.resolve(self.project("5.8"), launcher=installs, sources={}), self.engine)

    def test_source_build_ini_resolves_an_identifier(self):
        ini = self.base / "Epic" / "UnrealEngine" / "Install.ini"
        ini.parent.mkdir(parents=True)
        ini.write_text(f"[Installations]\n{{ABC-123}}={self.engine}\n", encoding="utf-8")
        builds = engine.source_builds(self.base / "Epic")
        self.assertEqual(builds, {"{ABC-123}": self.engine})
        self.assertEqual(engine.resolve(self.project("{ABC-123}"), launcher={}, sources=builds), self.engine)

    def test_unknown_association_asks_for_engine(self):
        with self.assertRaisesRegex(LaniakeaError, "--engine"):
            engine.resolve(self.project("9.9"), launcher={}, sources={})

    def test_override_must_be_an_engine(self):
        self.assertEqual(engine.resolve(self.project("9.9"), str(self.engine)), self.engine.resolve())
        with self.assertRaisesRegex(LaniakeaError, "not an engine root"):
            engine.resolve(self.project("9.9"), str(self.base))

    def test_empty_association_uses_the_enclosing_engine(self):
        inside = self.project("", self.engine / "Samples" / "Game")
        self.assertEqual(engine.resolve(inside, launcher={}, sources={}), self.engine)

    def test_bundled_dotnet_prefers_the_newest_version(self):
        host = {"win32": "win", "darwin": "osx"}.get(sys.platform, "linux")
        executable = "dotnet.exe" if host == "win" else "dotnet"
        for version in ("8.0", "10.0"):
            path = self.engine / "Engine/Binaries/ThirdParty/DotNet" / version / f"{host}-x64" / executable
            path.parent.mkdir(parents=True)
            path.write_text("")
        with mock.patch("platform.machine", return_value="AMD64"):
            command, env = engine.dotnet(self.engine)
        self.assertEqual(Path(command[0]).parent.parent.name, "10.0")
        self.assertEqual(env["DOTNET_MULTILEVEL_LOOKUP"], "0")
        self.assertTrue(command[1].endswith("UnrealBuildTool.dll"))


if __name__ == "__main__":
    unittest.main()
