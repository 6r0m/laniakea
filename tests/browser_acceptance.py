# SPDX-License-Identifier: AGPL-3.0-or-later
"""Run browser acceptance against fresh synthetic fixtures on loopback."""

import argparse
import json
import subprocess
import tempfile
from pathlib import Path
from threading import Thread
from time import perf_counter

from support import FIXTURES, ROOT, publish_recorded_sample
from test_review import fixture as review_fixture
from test_source_preview import browser_fixture as source_fixture

from laniakea.map_index import ensure
from laniakea.server import make_server
from laniakea.workspace import read_json


SAMPLE_CASES = ('viewer', 'traces', 'icons', 'motion')
SOURCE_CASES = ('health', 'source-preview', 'source-match-navigation')
REVIEW_CASES = ('review', 'inspector')
CASES = (*SAMPLE_CASES, 'wheel', *REVIEW_CASES, *SOURCE_CASES)
MEASUREMENTS = ('relay', 'stress')


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


def stress_graph():
    module_count, functions_per_module = 32, 128
    nodes, edges = [], []

    def add_node(identity, level, parent):
        nodes.append({'id': identity, 'label': identity, 'level': level, 'parent': parent,
                      'boundary': False, 'status': 'in-target'})

    add_node('Stress', 'project', None)
    for module in range(module_count):
        owner = f'Module{module}'
        add_node(owner, 'module', 'Stress')
        for function in range(functions_per_module):
            source = f'{owner}.Function{function}'
            add_node(source, 'function', owner)
            for offset in (1, 2, 7):
                target = f'Module{(module + offset) % module_count}.Function{function}'
                edges.append({'id': f'{source}->{target}', 'source': source, 'target': target,
                              'type': 'calls', 'status': 'resolved', 'origin': 'compiler'})
    return {'schema': 'laniakea.graph/1', 'nodes': nodes, 'edges': edges}


def measurement_fixture(case, base):
    synthetic_graph = stress_graph() if case == 'stress' else None
    start = perf_counter()
    workspace = publish_recorded_sample(base, graph=synthetic_graph)
    publication_ms = round((perf_counter() - start) * 1000, 1)
    run = workspace.latest('sample')
    start = perf_counter()
    index = ensure(workspace, 'sample', run)
    index_ms = round((perf_counter() - start) * 1000, 1)
    graph = read_json(run / 'graph.json')
    print(json.dumps({'workload': case, 'nodes': len(graph['nodes']), 'references': len(graph['edges']),
                      'fixturePublicationMs': publication_ms, 'coldIndexMs': index_ms,
                      'indexBytes': sum((index.root / name).stat().st_size
                                        for name in ('topology.json', 'references.sqlite'))}), flush=True)
    return make_server(workspace, scan=False, launch_target='sample')


def run(case, base, channel, *, measure=False):
    if measure:
        server, source = measurement_fixture(case, base), ''
    else:
        server, source = fixture(case, base)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        url = f'http://127.0.0.1:{server.server_address[1]}/'
        command = ['node', str(ROOT / 'tests' / 'browser_acceptance.cjs'), case, url, channel, source]
        if measure:
            command.append('--measure')
        result = subprocess.run(command, cwd=ROOT, timeout=150)
        return result.returncode
    finally:
        server.shutdown()
        thread.join()
        server.server_close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('cases', nargs='*', metavar='CASE', help=', '.join(CASES) + ' (default: all)')
    parser.add_argument('--channel', choices=('msedge', 'chrome'), default='msedge')
    parser.add_argument('--measure', action='store_true', help='run performance probes on relay and stress workloads')
    options = parser.parse_args()
    choices = MEASUREMENTS if options.measure else CASES
    if set(options.cases) - set(choices):
        parser.error('select cases from: ' + ', '.join(choices))
    scratch = ROOT / 'workspace' / 'tmp'
    scratch.mkdir(parents=True, exist_ok=True)
    failures = []
    for case in options.cases or choices:
        with tempfile.TemporaryDirectory(prefix='browser-', dir=scratch) as temporary:
            if run(case, Path(temporary), options.channel, measure=options.measure):
                failures.append(case)
    if failures:
        print('Failed browser cases: ' + ', '.join(failures), flush=True)
    return bool(failures)


if __name__ == '__main__':
    raise SystemExit(main())
