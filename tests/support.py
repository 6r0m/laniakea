# SPDX-License-Identifier: AGPL-3.0-or-later
"""Shared test setup: the sample project, its recorded UBT fixture, and a stand-in engine tree."""

import json
import shutil
from contextlib import contextmanager
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
SAMPLE = ROOT / "sample" / "SampleProject"
FIXTURES = ROOT / "fixtures"


def fake_engine(base):
    """A minimal engine tree: enough for resolution, version, the .NET lookup, and one engine plugin descriptor."""
    root = Path(base) / "FakeEngine"
    for path, text in {
        "Engine/Binaries/DotNET/UnrealBuildTool/UnrealBuildTool.dll": "",
        "Engine/Build/Build.version": '{"MajorVersion": 5, "MinorVersion": 8, "PatchVersion": 0, "Changelist": 1}',
        "Engine/Plugins/Editor/EditorScriptingUtilities/EditorScriptingUtilities.uplugin":
            '{"FileVersion": 3, "Modules": [{"Name": "EditorScriptingUtilities", "Type": "Editor"}]}',
    }.items():
        (root / path).parent.mkdir(parents=True, exist_ok=True)
        (root / path).write_text(text, encoding="utf-8")
    return root


def copy_sample(base):
    copy = Path(base) / "SampleProject"
    shutil.copytree(SAMPLE, copy)
    return copy


def recorded(project_dir, engine_root):
    """fixtures/sample.ubt.json with its <project> and <engine> tokens bound to real folders."""
    text = (FIXTURES / "sample.ubt.json").read_text(encoding="utf-8")
    text = text.replace("<project>", Path(project_dir).as_posix()).replace("<engine>", Path(engine_root).as_posix())
    return json.loads(text)


@contextmanager
def recorded_ubt(project_dir, engine_root, export_error=None):
    """Replace the two UBT calls with the recording, so the rest of extraction runs for real."""
    data = recorded(project_dir, engine_root)

    def export(*_args, **_kwargs):
        if export_error:
            raise export_error
        return data["export"]

    with mock.patch("laniakea.unreal.ubt.query_targets", return_value=data["targets"]), \
            mock.patch("laniakea.unreal.ubt.export", side_effect=export):
        yield data


def by_id(items):
    return {item["id"]: item for item in items}
