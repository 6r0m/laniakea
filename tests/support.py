# SPDX-License-Identifier: AGPL-3.0-or-later
"""Shared test setup: the sample project, its recorded UBT fixture, and a stand-in engine tree."""

import json
import sys
from contextlib import contextmanager
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sample.copy_sample import SAMPLE, copy_sample, sample_files, tracked_ignored_files  # noqa: E402

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


def publish_recorded_sample(base, *, graph=None, demo_policy=False):
    from laniakea import pipeline, unreal
    from laniakea.workspace import Workspace, read_json, write_json

    project = copy_sample(base)
    engine = fake_engine(base)
    workspace = Workspace(Path(base) / 'analysis')
    target = workspace.register('sample', unreal.target_fields(project / 'SampleProject.uproject', engine))
    extract = unreal.extract

    def extract_fixture(*args, **kwargs):
        recorded_graph, fields = extract(*args, **kwargs)
        if graph is None:
            return recorded_graph, fields
        fields.pop('overview', None)
        fields['levels'] = sorted({node['level'] for node in graph['nodes']})
        extra = {edge['type'] for edge in graph['edges']} - {edge['id'] for edge in fields['edge_types']}
        fields['edge_types'].extend({'id': kind, 'label': kind, 'status': 'resolved'} for kind in sorted(extra))
        fields['sources'].append({'id': 'compiler', 'name': 'Synthetic compiler fixture', 'version': '1'})
        return graph, fields

    with recorded_ubt(project, engine), mock.patch.object(unreal, 'extract', side_effect=extract_fixture):
        pipeline.extract(workspace, target, health_options={'mode': 'off'})
    if demo_policy:
        write_json(workspace.target_dir('sample') / 'review' / 'rules.json', read_json(project / 'review.rules.json'))
    return workspace
