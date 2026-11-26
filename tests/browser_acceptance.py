# SPDX-License-Identifier: AGPL-3.0-or-later
"""Run browser acceptance against fresh synthetic fixtures on loopback."""

import argparse
import subprocess
import tempfile
from pathlib import Path
from threading import Thread

from support import FIXTURES, ROOT, publish_recorded_sample
from test_review import fixture as review_fixture
from test_source_preview import browser_fixture as source_fixture

from laniakea.server import make_server
from laniakea.workspace import read_json


SAMPLE_CASES = ('viewer', 'traces', 'icons', 'motion')
SOURCE_CASES = ('health', 'source-preview', 'source-match-navigation')
REVIEW_CASES = ('review', 'inspector')
CASES = (*SAMPLE_CASES, 'wheel', *REVIEW_CASES, *SOURCE_CASES)


def fixture(case, base):
    if case in SOURCE_CASES:
        occurrences = {'health': 54, 'source-match-navigation': 4}.get(case, 51)
        server, project, data = source_fixture(base, occurrences=occurrences)
        first_source = project / data['groups'][0]['occurrences'][0]['path']
        return server, str(first_source) if case == 'source-preview' else ''
    graph = None
    if case == 'wheel':
        graph = read_json(FIXTURES / 'source-surface.graph.json')
    elif case in REVIEW_CASES:
        graph, _ = review_fixture()
    workspace = publish_recorded_sample(base, graph=graph)
    return make_server(workspace, scan=False, launch_target='sample'), ''


def run(case, base, channel):
    server, source = fixture(case, base)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        url = f'http://127.0.0.1:{server.server_address[1]}/'
        result = subprocess.run(['node', str(ROOT / 'tests' / 'browser_acceptance.cjs'), case, url, channel, source],
                                cwd=ROOT, timeout=150)
        return result.returncode
    finally:
        server.shutdown()
        thread.join()
        server.server_close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('cases', nargs='*', metavar='CASE', help=', '.join(CASES) + ' (default: all)')
    parser.add_argument('--channel', choices=('msedge', 'chrome'), default='msedge')
    options = parser.parse_args()
    if set(options.cases) - set(CASES):
        parser.error('select cases from: ' + ', '.join(CASES))
    scratch = ROOT / 'workspace' / 'tmp'
    scratch.mkdir(parents=True, exist_ok=True)
    failures = []
    for case in options.cases or CASES:
        with tempfile.TemporaryDirectory(prefix='browser-', dir=scratch) as temporary:
            if run(case, Path(temporary), options.channel):
                failures.append(case)
    if failures:
        print('Failed browser cases: ' + ', '.join(failures), flush=True)
    return bool(failures)


if __name__ == '__main__':
    raise SystemExit(main())
