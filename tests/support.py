# SPDX-License-Identifier: AGPL-3.0-or-later
"""Shared test setup: the sample project, its recorded UBT fixture, and a stand-in engine tree."""

import hashlib
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


def recording_inputs(project):
    from laniakea.unreal.descriptors import build_inputs

    # Git checkouts can change line endings on either side of the recording.
    return {name: hashlib.sha256((project / name).read_bytes().replace(b'\r\n', b'\n')).hexdigest()
            for name in build_inputs(project)}


def publish_recorded_sample(base, *, graph=None, demo_policy=False):
    from laniakea import LaniakeaError, pipeline, unreal
    from laniakea.workspace import Workspace, read_json, write_json

    project = copy_sample(base)
    engine = fake_engine(base)
    extract = unreal.extract

    def verify_inputs():
        current = recording_inputs(project)
        expected = evidence.get('build_inputs') if isinstance(evidence, dict) else None
        if not isinstance(expected, dict) or not expected:
            raise LaniakeaError('Sample recording has no build input fingerprints. Run python tests/record_fixture.py.')
        changed = sorted(name for name in current.keys() | expected.keys() if current.get(name) != expected.get(name))
        if changed:
            raise LaniakeaError('Sample inputs differ from the UBT recording: ' + ', '.join(changed) +
                                '. Use the matching sample or run python tests/record_fixture.py with Unreal.')

    def extract_fixture(*args, **kwargs):
        recorded_graph, fields = extract(*args, **kwargs)
        if graph is None:
            verify_inputs()
            target_context = fields['target']
            if any(target_context[key] != data['export'][ubt_key] for key, ubt_key in
                   (('name', 'Name'), ('platform', 'Platform'), ('configuration', 'Configuration'))):
                raise LaniakeaError('Sample preview target differs from the UBT recording.')
            target_context['build_context'] = {'selection': 'recorded'}
            version = evidence.get('engine_version') or 'unknown'
            fields['sources'] = [
                {'id': 'ubt', 'name': 'Recorded UnrealBuildTool JsonExport', 'version': version},
                {'id': 'descriptors', 'name': 'Sample project and plugin descriptors', 'version': 'recording-matched'},
            ]
            fields['coverage']['analysed'] = [
                f"Recorded module-only preview for {target_context['name']} {target_context['platform']} "
                f"{target_context['configuration']} (Unreal Engine recording version: {version})",
                'Sample build rules and descriptors match the recording',
            ]
            fields['coverage']['not_analysed'] = [
                'Live project analysis and other build targets',
                'Engine module internals beyond the first hop',
                'Native C++ declarations and references',
                'Duplicated code',
            ]
            return recorded_graph, fields
        fields.pop('overview', None)
        fields['levels'] = sorted({node['level'] for node in graph['nodes']})
        extra = {edge['type'] for edge in graph['edges']} - {edge['id'] for edge in fields['edge_types']}
        fields['edge_types'].extend({'id': kind, 'label': kind, 'status': 'resolved'} for kind in sorted(extra))
        fields['sources'].append({'id': 'compiler', 'name': 'Synthetic compiler fixture', 'version': '1'})
        return graph, fields

    with recorded_ubt(project, engine) as data, mock.patch.object(unreal, 'extract', side_effect=extract_fixture):
        evidence = data.get('recording', {})
        if graph is None:
            verify_inputs()
        workspace = Workspace(Path(base) / 'analysis')
        target = workspace.register('sample', unreal.target_fields(project / 'SampleProject.uproject', engine,
                                                                    data['export']['Name']))
        pipeline.extract(workspace, target, health_options={'mode': 'off'})
    if demo_policy:
        write_json(workspace.target_dir('sample') / 'review' / 'rules.json', read_json(project / 'review.rules.json'))
    return workspace
