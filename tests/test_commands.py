# SPDX-License-Identifier: AGPL-3.0-or-later
"""The everyday build/up/down interface keeps analysis separate from viewing."""

import contextlib
import io
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from laniakea import cli
from support import ROOT


class Commands(unittest.TestCase):
    def test_up_never_extracts_or_changes_analysis_settings(self):
        with patch.object(cli,'_extract') as build,patch.object(cli,'_serve') as serve:
            self.assertEqual(cli.main(['up','--no-browser']),0)
        build.assert_not_called();serve.assert_called_once()

    def test_up_refuses_build_options_instead_of_silently_downgrading_a_map(self):
        for argv in (['up','--symbols'],['up','--health','duplication']):
            with self.subTest(argv=argv),contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit):cli.parser().parse_args(argv)

    def test_viewer_target_selection_and_monitoring_are_independent_of_build_options(self):
        args=cli.parser().parse_args(['up','sample','--watch'])
        self.assertEqual(args.target_id,'sample');self.assertTrue(args.watch)
        self.assertFalse(cli.parser().parse_args(['up','--no-watch']).watch)
        with contextlib.redirect_stderr(io.StringIO()),self.assertRaises(SystemExit):
            cli.parser().parse_args(['up','--watch','--no-watch'])

    def test_build_only_dispatches_analysis_and_forwards_explicit_options(self):
        with patch.object(cli,'_extract') as build,patch.object(cli,'_serve') as serve:
            self.assertEqual(cli.main(['build','sample','--symbols','--health','duplication','--health-scope','Source']),0)
        serve.assert_not_called();build.assert_called_once()
        args=build.call_args.args[0]
        self.assertEqual((args.project,args.symbols,args.health,args.health_scope),('sample',True,'duplication',['Source']))

    def test_existing_explicit_names_remain_direct_aliases(self):
        with patch.object(cli,'_extract') as build,patch.object(cli,'_serve') as serve:
            self.assertEqual(cli.main(['extract','sample']),0)
            self.assertEqual(cli.main(['serve','--no-browser']),0)
        build.assert_called_once();serve.assert_called_once()

    @unittest.skipUnless(shutil.which('make'),'Make is optional; Python commands remain available without it')
    def test_make_targets_forward_arguments_with_a_project_path_containing_spaces(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);probe=root/'probe.py';output=root/'argv.json'
            probe.write_text('import json,sys\nfrom pathlib import Path\nPath(sys.argv[1]).write_text(json.dumps(sys.argv[2:]))\n')
            python=f'PYTHON="{sys.executable}" "{probe}" "{output}"'
            common=['make','--no-print-directory','-f',str(ROOT/'makefile'),python]
            for goal,options,expected in (
                    ('build',['PROJECT=Source Tree/Sample.uproject','ARGS=--symbols'],
                     ['laniakea.py','build','Source Tree/Sample.uproject','--symbols']),
                    ('up',['ARGS=--no-browser'],['laniakea.py','up','--no-browser']),
                    ('down',[],['laniakea.py','down'])):
                result=subprocess.run([*common,goal,*options],cwd=ROOT,capture_output=True,text=True)
                self.assertEqual(result.returncode,0,result.stdout+result.stderr)
                self.assertEqual(json.loads(output.read_text()),expected)
            result=subprocess.run([*common,'up','PROJECT=sample'],cwd=ROOT,capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0)


if __name__=='__main__':unittest.main()
