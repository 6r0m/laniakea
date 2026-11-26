# SPDX-License-Identifier: AGPL-3.0-or-later
"""Open the recorded Unreal sample in a disposable, saved-only viewer."""

import argparse
import tempfile
import webbrowser

from support import ROOT, publish_recorded_sample

from laniakea import LaniakeaError
from laniakea.server import make_server


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--no-browser', action='store_true', help='print the local URL without opening a tab')
    options = parser.parse_args()
    scratch = ROOT / 'workspace' / 'tmp'
    scratch.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='relay-', dir=scratch) as temporary:
        try:
            workspace = publish_recorded_sample(temporary, demo_policy=True)
            server = make_server(workspace, scan=False, launch_target='sample')
        except LaniakeaError as error:
            parser.exit(2, f'Sample preview unavailable. {error}\n')
        with server:
            url = f'http://127.0.0.1:{server.server_address[1]}/'
            print(f'Unreal relay preview: serving {url} (Ctrl+C stops)', flush=True)
            if not options.no_browser:
                webbrowser.open(url)
            try:
                server.serve_forever()
            except KeyboardInterrupt:
                pass


if __name__ == '__main__':
    raise SystemExit(main())
