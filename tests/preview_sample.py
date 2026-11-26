# SPDX-License-Identifier: AGPL-3.0-or-later
"""Open the recorded Unreal sample in a disposable, saved-only viewer."""

import argparse
import tempfile

from support import ROOT, publish_recorded_sample

from laniakea import cli


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--no-browser', action='store_true', help='print the local URL without opening a tab')
    options = parser.parse_args()
    scratch = ROOT / 'workspace' / 'tmp'
    scratch.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='relay-', dir=scratch) as temporary:
        workspace = publish_recorded_sample(temporary, demo_policy=True)
        print('Unreal relay preview: recorded module evidence from the synthetic sample.', flush=True)
        arguments = ['--workspace', str(workspace.root), 'up', 'sample', '--no-watch', '--port', '0']
        if options.no_browser:
            arguments.append('--no-browser')
        return cli.main(arguments)


if __name__ == '__main__':
    raise SystemExit(main())
