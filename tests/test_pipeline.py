# SPDX-License-Identifier: AGPL-3.0-or-later
"""Extraction into runs, the latest pointer, and staleness, with the two UBT calls replaced by the recording."""

import tempfile
import unittest
from datetime import datetime, timezone
from unittest.mock import patch
from pathlib import Path

from laniakea import LaniakeaError, cli, pipeline, schema
from laniakea.unreal import target_fields
from laniakea.workspace import Workspace, read_json
from support import FIXTURES, copy_sample, fake_engine, publish_recorded_sample, recorded_ubt


class Pipeline(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        base = Path(self.temporary.name)
        self.project = copy_sample(base)
        self.engine = fake_engine(base)
        self.workspace = Workspace(base / "workspace")
        fields = target_fields(self.project / "SampleProject.uproject", str(self.engine))
        self.target = self.workspace.register("sample", fields)

    def tearDown(self):
        self.temporary.cleanup()

    def extract(self, symbols=False, **kwargs):
        with recorded_ubt(self.project, self.engine, **kwargs):
            return pipeline.extract(self.workspace, self.target, **({'symbols':True} if symbols else {}))

    def test_preview_replays_module_evidence_and_installs_the_sample_policy(self):
        from laniakea.server import make_server

        with patch('laniakea.unreal.ubt._run', side_effect=AssertionError('preview launched Unreal')):
            workspace = publish_recorded_sample(Path(self.temporary.name) / 'preview', demo_policy=True)
        manifest = read_json(workspace.latest('sample') / 'manifest.json')
        self.assertIn('module', manifest['levels'])
        self.assertNotIn('function', manifest['levels'])
        self.assertNotIn('health', manifest)
        recording = read_json(FIXTURES / 'sample.ubt.json')['recording']
        source = next(source for source in manifest['sources'] if source['id'] == 'ubt')
        self.assertIn('Recorded', source['name'])
        self.assertEqual(source['version'], recording['engine_version'])
        self.assertIn('Recorded module-only preview', ' '.join(manifest['coverage']['analysed']))
        self.assertNotIn('current UBT', ' '.join(manifest['coverage']['analysed']))
        with make_server(workspace, scan=False, launch_target='sample') as server:
            report = server.reviews['sample'].page({})
            self.assertEqual(report['total'], 2)
            self.assertEqual({(item['kind'], item['severity']) for item in report['items']},
                             {('cycles', 'violation'), ('forbidden', 'violation')})

    def test_preview_refuses_changed_build_inputs_before_publication(self):
        base = Path(self.temporary.name) / 'preview'
        rules = self.project / 'Source/SampleProject/SampleProject.Build.cs'
        descriptor = self.project / 'SampleProject.uproject'
        for path in (rules, descriptor):
            with self.subTest(path=path.name):
                original = path.read_bytes()
                try:
                    path.write_bytes(original + b'\n ')
                    with patch('support.copy_sample', return_value=self.project):
                        with self.assertRaisesRegex(LaniakeaError, path.name):
                            publish_recorded_sample(base, demo_policy=True)
                    self.assertIsNone(Workspace(base / 'analysis').latest('sample'))
                finally:
                    path.write_bytes(original)

    def test_module_extraction_ignores_installed_or_broken_symbol_tools_and_source_edits(self):
        tools = self.workspace.root / 'tools/unreal'
        tools.mkdir(parents=True)
        (tools / 'tools.json').write_text('{broken optional installation')
        with patch('laniakea.unreal.compiler.extract', side_effect=AssertionError('native analysis must be explicit')), \
                patch('laniakea.unreal.source_inputs.fingerprints', side_effect=AssertionError('M1 must not hash C++ sources')):
            run, manifest = self.extract()
        self.assertNotIn('class', manifest['levels'])
        source = self.project / 'Source/SampleProject/SampleProject.cpp'
        self.assertNotIn(source.relative_to(self.project).as_posix(), manifest['inputs'])
        source.write_bytes(source.read_bytes() + b'\n// not a build-rule change\n')
        self.assertEqual(pipeline.freshness(self.workspace, self.target)[1], [])
        self.assertEqual(self.workspace.latest('sample'), run)

    def test_cli_symbols_are_an_explicit_per_run_choice(self):
        self.assertFalse(cli.parser().parse_args(['extract', 'sample']).symbols)
        self.assertTrue(cli.parser().parse_args(['build', 'sample', '--symbols']).symbols)

    def test_run_is_complete_before_latest_moves(self):
        run, manifest = self.extract()
        self.assertEqual(self.workspace.latest("sample"), run)
        schema.validate(read_json(run / "manifest.json"), "manifest")
        schema.validate(read_json(run / "graph.json"))
        self.assertTrue((run / "scopes" / manifest["entry"]).is_file())
        self.assertIn("other targets: SampleProject (Game)", manifest["coverage"]["not_analysed"])
        self.assertEqual(manifest["target"]["name"], "SampleProjectEditor")
        self.assertEqual(manifest["levels"], ["project", "folder", "plugin", "module"])
        types = {t["id"] for t in manifest["edge_types"]}
        self.assertTrue({"depends.rollup", "requires.rollup"} <= types, "summary types are described")
        self.assertIn("rollup", {s["id"] for s in manifest["sources"]})

    def test_background_staging_cannot_publish_and_parent_can_commit_after_validation(self):
        good,_=self.extract()
        with self.workspace.extraction_lock('sample'),recorded_ubt(self.project,self.engine):
            staged,manifest=pipeline.stage(self.workspace,self.target)
            self.assertTrue(staged.name.endswith('.partial'))
            self.assertEqual(self.workspace.latest('sample'),good)
            self.assertEqual(read_json(staged/'manifest.json'),manifest)
            published=self.workspace.commit_run('sample',staged)
        self.assertEqual(self.workspace.latest('sample'),published)

    def test_typed_external_build_contention_survives_staging_cleanup(self):
        from laniakea.unreal.ubt import Busy
        good,_=self.extract()
        with recorded_ubt(self.project,self.engine,export_error=Busy('external build')):
            with self.assertRaises(Busy):pipeline.extract(self.workspace,self.target)
        self.assertEqual(self.workspace.latest('sample'),good)

    def test_overview_hints_are_profile_owned_and_invalid_hints_keep_the_previous_run(self):
        good, manifest = self.extract()
        self.assertEqual(manifest.get('overview'),{'anchor':'engine','configuration_types':['requires']})
        from laniakea import unreal
        original = unreal.extract
        for hint in ({'anchor':'missing','configuration_types':['requires']},
                     {'anchor':'project','configuration_types':['requires']},
                     {'anchor':'engine','configuration_types':['missing']}):
            def invalid(*args,**kwargs):
                built,fields=original(*args,**kwargs)
                fields['overview']=hint
                return built,fields
            with self.subTest(hint=hint),patch('laniakea.unreal.extract',side_effect=invalid):
                with self.assertRaisesRegex(LaniakeaError,'overview'):
                    self.extract()
            self.assertEqual(self.workspace.latest('sample'),good)

    def test_failed_run_keeps_the_last_good_one(self):
        good, _ = self.extract()
        with self.assertRaises(LaniakeaError):
            self.extract(export_error=LaniakeaError("export failed"))
        self.assertEqual(self.workspace.latest("sample"), good)
        failed = [p.name for p in (self.workspace.target_dir("sample") / "runs").iterdir() if p.name.endswith(".failed")]
        self.assertEqual(len(failed), 1)

    def test_symbol_failure_keeps_latest_and_source_edits_mark_it_stale(self):
        def indexed(_target, _run, built, *_args):
            return built, {'enabled':True,'units':1,'external_inputs':{},'unknown':{'source':0,'target':0}}
        with patch('laniakea.unreal.compiler.extract', side_effect=indexed):
            good, manifest = self.extract(symbols=True)
        self.assertIn('class', manifest['levels'])
        with patch("laniakea.unreal.compiler.extract", side_effect=LaniakeaError("native compiler failed")):
            with self.assertRaisesRegex(LaniakeaError, "native compiler failed"):
                self.extract(symbols=True)
        self.assertEqual(self.workspace.latest("sample"), good)
        source = self.project / "Source/SampleProject/SampleProject.cpp"
        source.write_bytes(source.read_bytes() + b"\n// source edit\n")
        self.assertIn("Source/SampleProject/SampleProject.cpp", pipeline.freshness(self.workspace, self.target)[1])

    def test_explicit_symbols_without_tools_refuses_without_replacing_latest(self):
        good, _ = self.extract()
        with self.assertRaisesRegex(LaniakeaError, 'without local LLVM tools'):
            self.extract(symbols=True)
        self.assertEqual(self.workspace.latest('sample'), good)

    def test_concurrent_extraction_refuses_before_changing_runs_or_copy(self):
        good,_=self.extract()
        copy=self.workspace.target_dir("sample") / "copy/protected.cpp"
        copy.parent.mkdir()
        copy.write_text("protected")
        runs=set(good.parent.iterdir())
        with self.workspace.extraction_lock("sample"):
            with self.assertRaisesRegex(LaniakeaError,"another extraction"):
                self.extract()
        self.assertEqual(self.workspace.latest("sample"),good)
        self.assertEqual(set(good.parent.iterdir()),runs)
        self.assertEqual(copy.read_text(),"protected")
        self.extract()

    def test_failed_run_diagnostics_name_the_retained_folder(self):
        self.extract()
        def fail(_target,run,*_args,**_kwargs):
            raise LaniakeaError(f"compiler failed; see {run / 'compiler/index.log'}")
        with patch("laniakea.unreal.compiler.extract",side_effect=fail):
            with self.assertRaises(LaniakeaError) as raised:
                self.extract(symbols=True)
        self.assertIn(".failed",str(raised.exception))
        self.assertNotIn(".partial",str(raised.exception))

    def test_edited_build_rules_make_the_run_stale(self):
        self.extract()
        self.assertEqual(pipeline.freshness(self.workspace, self.target)[1], [])
        rules = self.project / "Plugins/Sample/SampleEditor/Source/SampleEditor/SampleEditor.Build.cs"
        original = rules.read_bytes()
        rules.write_bytes(original + b"\n// edited\n")
        self.assertEqual(pipeline.freshness(self.workspace, self.target)[1],
                         ["Plugins/Sample/SampleEditor/Source/SampleEditor/SampleEditor.Build.cs"])
        rules.write_bytes(original)
        self.assertEqual(pipeline.freshness(self.workspace, self.target)[1], [])

    def test_new_descriptor_makes_the_run_stale(self):
        self.extract()
        extra = self.project / "Plugins/SampleExtra/SampleExtra.uplugin"
        extra.parent.mkdir(parents=True)
        extra.write_text('{"FileVersion": 3}', encoding="utf-8")
        self.assertEqual(pipeline.freshness(self.workspace, self.target)[1], ["Plugins/SampleExtra/SampleExtra.uplugin"])

    def test_no_project_means_the_newest_extracted_one(self):
        other = self.workspace.register("other", dict(self.target, project_file=str(self.project.parent / "O.uproject")))
        with patch('laniakea.workspace.datetime') as clock:
            clock.now.side_effect = [datetime(2026, 1, 1, second=second, tzinfo=timezone.utc) for second in (0, 1)]
            self.workspace.commit_run("other", self.workspace.begin_run("other"))
            self.workspace.commit_run("sample", self.workspace.begin_run("sample"))
        self.assertEqual(self.workspace.last()["id"], "sample")
        self.assertEqual(cli._target(self.workspace, None, None, None, None)["id"], "sample")
        self.assertEqual(other["id"], "other")

    def test_options_for_a_stored_id_update_it_and_keep_its_engine(self):
        updated = cli._target(self.workspace, "sample", None, None, "SampleProject")
        self.assertEqual((updated["target"], updated["engine_root"]), ("SampleProject", self.target["engine_root"]))

    def test_nothing_extracted_yet_is_reported(self):
        with self.assertRaisesRegex(LaniakeaError, "nothing extracted yet"):
            cli._target(Workspace(Path(self.temporary.name) / "empty"), None, None, None, None)

    def test_id_of_another_project_is_refused(self):
        other = dict(self.target, project_file=str(self.project.parent / "Other" / "Other.uproject"))
        with self.assertRaises(LaniakeaError):
            self.workspace.register("sample", other)


if __name__ == "__main__":
    unittest.main()
