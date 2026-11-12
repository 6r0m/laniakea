# SPDX-License-Identifier: AGPL-3.0-or-later
"""A disposable, indexed presentation copy of an immutable canonical graph."""

import hashlib
import json
import os
import sqlite3
import uuid
from contextlib import closing
from pathlib import Path

from . import LaniakeaError, schema
from .workspace import read_json, write_json, writer_lock
from .source_files import SourceFiles


def _digest(path):
    result = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def _tree(graph):
    nodes = {n['id']: n for n in graph['nodes']}
    if len(nodes) != len(graph['nodes']):
        raise LaniakeaError('duplicate map node id')
    if len([n for n in nodes.values() if n['parent'] is None and not n['boundary']]) != 1:
        raise LaniakeaError('map requires one project root')
    children = {}
    for node in nodes.values():
        if node['parent'] is not None and node['parent'] not in nodes:
            raise LaniakeaError('unknown map parent')
        children.setdefault(node['parent'], []).append(node['id'])
    bounds = {}
    for root in children.get(None, []):
        stack = [(root, False)]
        while stack:
            identity, closing_node = stack.pop()
            if closing_node:
                bounds[identity][1] = len(bounds)-1
            else:
                if identity in bounds:
                    raise LaniakeaError('cyclic map containment')
                bounds[identity] = [len(bounds), None]
                stack.append((identity, True))
                stack.extend((child, False) for child in reversed(children.get(identity, [])))
    if len(bounds) != len(nodes):
        raise LaniakeaError('cyclic map containment')
    return nodes, bounds


def build(graph, destination, source_hash=None, generator_hash=None):
    schema.validate(graph)
    nodes, bounds = _tree(graph)
    indices = {node['id']: n for n, node in enumerate(graph['nodes'])}
    edge_ids = set()
    for edge in graph['edges']:
        if edge['id'] in edge_ids or edge['source'] not in nodes or edge['target'] not in nodes:
            raise LaniakeaError('colliding reference id or unknown map endpoint')
        edge_ids.add(edge['id'])
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=False)
    groups = {}
    files = SourceFiles(graph)
    topology = {'schema': 'laniakea.map/1', 'nodes': graph['nodes'], 'references': [], 'files': files.files}
    database = destination / 'references.sqlite'
    with closing(sqlite3.connect(database)) as db:
        db.execute('PRAGMA temp_store=MEMORY')
        db.executescript('''
            CREATE TABLE nodes (id TEXT PRIMARY KEY, first INTEGER NOT NULL, last INTEGER NOT NULL);
            CREATE TABLE refs (seq INTEGER PRIMARY KEY, group_id INTEGER NOT NULL,
                source_pre INTEGER NOT NULL, target_pre INTEGER NOT NULL,
                source_boundary INTEGER NOT NULL, target_boundary INTEGER NOT NULL,
                type TEXT NOT NULL, payload TEXT NOT NULL);
        ''')
        db.executemany('INSERT INTO nodes VALUES (?,?,?)', ((identity, *interval) for identity, interval in bounds.items()))
        def rows():
            for number, edge in enumerate(graph['edges'], 1):
                source_file, target_file = files.endpoints(edge)
                key = (indices[edge['source']], indices[edge['target']], edge['type'], bool(edge.get('internal_to_owner')),
                       source_file, target_file)
                if key not in groups:
                    groups[key] = len(groups)+1
                    topology['references'].append({'source': key[0], 'target': key[1], 'type': key[2], 'count': 0})
                    if key[3]:
                        topology['references'][-1]['internal_to_owner'] = True
                    for name, value in (('source_file', source_file), ('target_file', target_file)):
                        if value is not None:
                            topology['references'][-1][name] = value
                group = groups[key]
                topology['references'][group-1]['count'] += 1
                yield (number, group, bounds[edge['source']][0], bounds[edge['target']][0],
                       int(nodes[edge['source']]['boundary']), int(nodes[edge['target']]['boundary']), edge['type'],
                       json.dumps(edge, separators=(',', ':')))
        db.executemany('INSERT INTO refs VALUES (?,?,?,?,?,?,?,?)', rows())
        db.executescript('''
            CREATE INDEX source_refs ON refs(source_pre,seq);
            CREATE INDEX target_refs ON refs(target_pre,seq);
            CREATE INDEX group_refs ON refs(group_id,seq);
        ''')
        db.commit()
        if db.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
            raise LaniakeaError('generated map index failed integrity validation')
        if db.execute('SELECT COUNT(*) FROM refs').fetchone()[0] != len(graph['edges']):
            raise LaniakeaError('generated reference count mismatch')
    schema.validate(topology, 'map')
    if sum(r['count'] for r in topology['references']) != len(graph['edges']):
        raise LaniakeaError('generated reference group count mismatch')
    path = destination / 'topology.json'
    path.write_text(json.dumps(topology, separators=(',', ':')), encoding='utf-8')
    write_json(destination / 'cache.json', {
        'format': 1, 'source': source_hash, 'generator': generator_hash,
        'files': {'topology.json': _digest(path), 'references.sqlite': _digest(database)}})


def ensure(workspace, target, run):
    source = Path(run) / 'graph.json'
    raw = source.read_bytes()
    source_hash = hashlib.sha256(raw).hexdigest()
    generator_hash = hashlib.sha256(Path(__file__).read_bytes()+schema.SCHEMA_FILE.read_bytes()+
                                    Path(__file__).with_name('source_files.py').read_bytes()).hexdigest()
    root = workspace.target_dir(target) / 'views'
    final = root / (source_hash+'-'+generator_hash[:16])
    if final.is_dir():
        return MapIndex(final, source_hash, generator_hash, verify=True)
    with writer_lock(root / 'writer.lock', 'another process is preparing this target map index'):
        if final.is_dir():
            return MapIndex(final, source_hash, generator_hash, verify=True)
        partial = root / (final.name+'.partial-'+uuid.uuid4().hex)
        try:
            build(json.loads(raw), partial, source_hash, generator_hash)
            os.replace(partial, final)
        except BaseException:
            if partial.is_dir():
                os.replace(partial, partial.with_name(partial.name.replace('.partial-', '.failed-')))
            raise
    return MapIndex(final, source_hash, generator_hash)


class MapIndex:
    def __init__(self, root, source_hash=None, generator_hash=None, verify=False):
        self.root = Path(root)
        try:
            marker = read_json(self.root / 'cache.json')
            if set(marker.get('files', {})) != {'topology.json', 'references.sqlite'}:
                raise ValueError('unknown map cache files')
            if marker['format'] != 1 or source_hash is not None and marker['source'] != source_hash or \
                    generator_hash is not None and marker['generator'] != generator_hash:
                raise ValueError('map cache identity mismatch')
            if verify and any(_digest(self.root / name) != digest for name, digest in marker['files'].items()):
                raise ValueError('map cache content mismatch')
        except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
            raise LaniakeaError(f'could not load map index: {error}') from error

    def topology(self):
        return read_json(self.root / 'topology.json')

    def node_ids(self):
        uri = (self.root / 'references.sqlite').resolve().as_uri()+'?mode=ro'
        with closing(sqlite3.connect(uri, uri=True)) as db:
            return frozenset(row[0] for row in db.execute('SELECT id FROM nodes'))

    def iter_references(self):
        """Stream canonical payloads with run-bound locators; no full reference graph in memory."""
        uri = (self.root / 'references.sqlite').resolve().as_uri()+'?mode=ro'
        try:
            with closing(sqlite3.connect(uri, uri=True)) as db:
                for seq, group, payload in db.execute('SELECT seq,group_id,payload FROM refs ORDER BY seq'):
                    yield {'seq':seq, 'group':group, 'reference':json.loads(payload)}
        except sqlite3.Error as error:
            raise LaniakeaError(f'could not stream reference index: {error}') from error

    def references(self, query):
        try:
            return self._reference_page(query)
        except sqlite3.Error as error:
            raise LaniakeaError(f'could not query reference index: {error}') from error

    def _reference_page(self, query):
        if not isinstance(query, dict):
            raise ValueError('reference query must be an object')
        def integer(name, default, maximum=2**63-1):
            value = query.get(name, default)
            if isinstance(value, str) and value.isdecimal():
                value = int(value)
            if type(value) is not int or value < 0 or maximum is not None and value > maximum:
                raise ValueError('invalid reference '+name)
            return value
        cursor, limit = integer('cursor', 0), integer('limit', 50, 100)
        if not limit:
            raise ValueError('reference limit must be positive')
        clauses, parameters = [], []
        uri = (self.root / 'references.sqlite').resolve().as_uri()+'?mode=ro'
        with closing(sqlite3.connect(uri, uri=True)) as db:
            db.execute('PRAGMA temp_store=MEMORY')
            def interval(identity):
                if not isinstance(identity, str):
                    raise ValueError('reference query requires a node id')
                found = db.execute('SELECT first,last FROM nodes WHERE id=?', (identity,)).fetchone()
                if found is None:
                    raise ValueError('unknown reference node')
                return found
            if 'groups' in query:
                groups = query['groups']
                maximum = db.execute('SELECT MAX(group_id) FROM refs').fetchone()[0] or 0
                if not isinstance(groups,list) or not groups or len(groups)>100000 or \
                    any(type(group) is not int or not 1<=group<=maximum for group in groups) or len(set(groups))!=len(groups):
                    raise ValueError('invalid reference group set')
                db.execute('CREATE TEMP TABLE wanted_groups (id INTEGER PRIMARY KEY)')
                db.executemany('INSERT INTO wanted_groups VALUES (?)',((group,) for group in groups))
                clauses.append('group_id IN (SELECT id FROM wanted_groups)')
            elif 'node' in query:
                first, last = interval(query['node'])
                direction = query.get('direction', 'incident')
                if not isinstance(direction,str) or direction not in {'outgoing', 'incoming', 'within', 'incident'}:
                    raise ValueError('unknown reference direction')
                a, b = 'source_pre BETWEEN ? AND ?', 'target_pre BETWEEN ? AND ?'
                clauses.append({'outgoing':f'({a}) AND NOT ({b})', 'incoming':f'({b}) AND NOT ({a})',
                                'within':f'({a}) AND ({b})', 'incident':f'({a}) OR ({b})'}[direction])
                parameters.extend((first, last, first, last))
            elif 'source' in query and 'target' in query:
                for name in ('source','target'):
                    first, last = interval(query[name])
                    if query.get(name+'_tree', False):
                        clauses.append(f'{name}_pre BETWEEN ? AND ?'); parameters.extend((first,last))
                    else:
                        clauses.append(f'{name}_pre=?'); parameters.append(first)
            elif 'group' in query:
                group = integer('group', 0)
                if not group:
                    raise ValueError('reference group must be positive')
                clauses.append('group_id=?'); parameters.append(group)
            else:
                raise ValueError('reference query requires a node, pair or group')
            types = query.get('types')
            if types is not None:
                if not isinstance(types, list) or not types or len(types)>64 or any(not isinstance(t,str) for t in types):
                    raise ValueError('invalid reference types')
                clauses.append('type IN ('+','.join('?' for _ in types)+')'); parameters.extend(types)
            if query.get('boundary') is False:
                clauses.append('source_boundary=0 AND target_boundary=0')
            where = ' AND '.join('('+part+')' for part in clauses)
            total = db.execute('SELECT COUNT(*) FROM refs WHERE '+where, parameters).fetchone()[0]
            rows = db.execute('SELECT seq,group_id,payload FROM refs WHERE '+where+
                              ' AND seq>? ORDER BY seq LIMIT ?', (*parameters,cursor,limit+1)).fetchall()
        more = len(rows)>limit
        included = rows[:limit]
        return {'items':[{'reference':json.loads(payload),'group':group} for _,group,payload in included],
                'total':total,'next_cursor':included[-1][0] if more else None}
