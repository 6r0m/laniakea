# SPDX-License-Identifier: AGPL-3.0-or-later
"""Disposable file navigation and reference provenance derived from recorded graph facts."""

from pathlib import PurePosixPath


class SourceFiles:
    def __init__(self, graph):
        self.nodes = {n['id']: n for n in graph['nodes']}
        self.indices = {n['id']: i for i, n in enumerate(graph['nodes'])}
        self.owners, self.regions, self.files, self.lookup = {}, {}, [], {}
        for node in graph['nodes']:
            chain, current = [], node
            while current:
                chain.append(current)
                current = self.nodes.get(current['parent'])
            owner = next((n for n in reversed(chain) if n.get('attrs', {}).get('source_sections')), None)
            self.owners[node['id']] = owner
        for node in graph['nodes']:
            attrs = node.get('attrs', {})
            partition, owner = attrs.get('source_partition'), self.owners[node['id']]
            location = (partition or {}).get('file') or attrs.get('declaration') or node.get('source')
            relative = self.relative(location, owner)
            if partition and relative and len(relative) >= len(partition['folders']) + 2:
                prefix = relative[:len(relative)-len(partition['folders'])-1]
                if list(relative[len(prefix):-1]) == partition['folders']:
                    self.regions.setdefault(owner['id'], {})[prefix] = {
                        k: partition[k] for k in ('id', 'label', 'collapsed')}
                    if not partition['collapsed']:
                        self.regions[owner['id']][prefix]['label'] = prefix[-1]
        for node in graph['nodes']:
            owner, attrs = self.owners[node['id']], node.get('attrs', {})
            if not owner or node['id'] == owner['id']:
                continue
            declared = next((location for location in (attrs.get('declaration'), attrs.get('source_partition', {}).get('file'),
                                                       node.get('source')) if self.relative(location, owner)), None)
            defined = attrs.get('definition_location') or (node.get('source') if attrs.get('definition') else None)
            for key, location in (('declarations', declared), ('definitions', defined)):
                index = self.add(location, owner)
                if index is not None and self.indices[node['id']] not in self.files[index][key]:
                    self.files[index][key].append(self.indices[node['id']])
                    if key == 'definitions' and declared and (location['root'], location['path']) != \
                            (declared['root'], declared['path']) and 'partition' not in self.files[index]:
                        self.files[index]['partition'] = {'id':'implementation', 'label':'Implementation',
                                                         'collapsed':True, 'folders':[]}

    @staticmethod
    def relative(location, owner):
        source = owner.get('source') if owner else None
        if not location or not source or location.get('root') != source.get('root'):
            return None
        path, base = PurePosixPath(location['path']), PurePosixPath(source['path']).parent
        parts, prefix = path.parts, base.parts
        if path.is_absolute() or '..' in parts or tuple(p.casefold() for p in parts[:len(prefix)]) != \
                tuple(p.casefold() for p in prefix) or len(parts) <= len(prefix):
            return None
        return parts[len(prefix):]

    def add(self, location, owner):
        relative = self.relative(location, owner)
        if not relative:
            return None
        key = (owner['id'], location['root'], location['path'])
        if key not in self.lookup:
            record = {'owner': self.indices[owner['id']], 'root': location['root'], 'path': location['path'],
                      'declarations': [], 'definitions': []}
            regions = self.regions.get(owner['id'], {})
            prefix = next((p for p in sorted(regions, key=len, reverse=True) if relative[:len(p)] == p), None)
            if prefix:
                record['partition'] = {**regions[prefix], 'folders': list(relative[len(prefix):-1])}
            self.lookup[key] = len(self.files)
            self.files.append(record)
        return self.lookup[key]

    def endpoints(self, edge):
        attrs = edge.get('attrs', {})
        if not attrs.get('location'):
            return None, None
        source = self.add(attrs['location'], self.owners[edge['source']])
        node, owner = self.nodes[edge['target']], self.owners[edge['target']]
        facts = node.get('attrs', {})
        target = None
        for location in (attrs.get('target_declaration', {}).get('location'), facts.get('declaration'),
                         facts.get('source_partition', {}).get('file'), node.get('source') if node is not owner else None):
            target = self.add(location, owner)
            if target is not None:
                break
        return source, target
