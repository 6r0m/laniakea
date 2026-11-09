# SPDX-License-Identifier: AGPL-3.0-or-later
"""Recorded provider roots and source locations, without indexing external implementations."""

import hashlib
from pathlib import Path

from .. import LaniakeaError
from . import graph


def action_providers(actions, resources):
    """UBT's action root table owns compiler/SDK attribution; include spelling does not."""
    result = []
    for action in actions.get('Actions', []):
        if action.get('Type') != 'Compile':
            continue
        roots = action.get('RootPaths', {})
        names = {item['Root']: item['Name'] for item in roots.get('Names', [])}
        for entry in roots.get('Lookup', []):
            role = entry.get('Root')
            if role not in {'Compiler', 'WinSDK'}:
                continue
            label = (names.get(role, 'C++') + ' toolchain') if role == 'Compiler' else 'Windows SDK'
            result.append({'root': entry.get('Path'), 'label': label, 'evidence': 'UBT action RootPaths.' + role})
    result.append({'root': str(resources), 'label': 'LLVM compiler headers', 'evidence': 'selected LLVM resource directory'})
    return result


class SourceLocations:
    def __init__(self, project, engine, providers=()):
        self.project, self.engine = Path(project), Path(engine)
        self.providers = {}
        self._provider_cache = {}
        self.roots = {}
        self.register(providers)

    def register(self, providers):
        for item in providers:
            if not isinstance(item, dict) or not all(isinstance(item.get(k), str) and item[k]
                                                    for k in ('root', 'label', 'evidence')):
                raise LaniakeaError('invalid recorded external provider')
            root = Path(item['root'])
            if not root.is_absolute():
                raise LaniakeaError('external provider root must be absolute')
            key = graph._norm(root)
            record = {**item, 'root': str(root), 'id': 'external:provider:' + hashlib.sha256(key.encode()).hexdigest()[:24]}
            if key in self.providers and self.providers[key] != record:
                raise LaniakeaError('conflicting recorded external provider roots')
            self.providers[key] = record
        self._provider_cache.clear()

    def provider(self, file):
        if not file:
            return None
        key = graph._norm(file)
        if key in self._provider_cache:
            return self._provider_cache[key]
        for folder in (Path(file), *Path(file).parents):
            if graph._norm(folder) in self.providers:
                self._provider_cache[key] = self.providers[graph._norm(folder)]
                return self._provider_cache[key]
        self._provider_cache[key] = None
        return None

    def location(self, file, line=1):
        if not file:
            return None
        file = Path(file)
        for alias, root in (('project', self.project), ('engine', self.engine)):
            relative = graph._relative(file, root)
            if relative is not None:
                return {'root': alias, 'path': relative, 'line': line}
        provider = self.provider(file)
        root = Path(provider['root']) if provider else Path(file.anchor)
        if not root.is_absolute():
            raise LaniakeaError('external declaration path must be absolute')
        alias = provider['id'] if provider else 'external:volume:' + hashlib.sha256(graph._norm(root).encode()).hexdigest()[:24]
        self.roots[alias] = str(root)
        return {'root': alias, 'path': graph._relative(file, root), 'line': line}

    def endpoint(self, builder, file):
        provider = self.provider(file)
        if provider is None:
            return builder.external_boundary()
        parent = 'external:toolchains'
        builder.node(parent, 'project', 'Toolchains & SDKs', None, boundary=True,
                     attrs={'analysis': 'Referenced declarations only; implementation internals were not indexed',
                            'ownership': 'Providers recorded by the selected compiler/build context'})
        builder.node(provider['id'], 'folder', provider['label'], parent, boundary=True,
                     attrs={'analysis': 'Referenced declarations only; implementation internals were not indexed',
                            'ownership': provider['evidence']})
        return provider['id']

    def module(self, builder, name, exported):
        identity = builder.boundary_module(name, exported)
        node, entry = builder.nodes[identity], exported['Modules'].get(name, {})
        directory = entry.get('Directory')
        if node['boundary'] and directory and graph._relative(directory, self.engine) is None:
            provider = self.provider(directory)
            if provider:
                node['parent'] = self.endpoint(builder, directory)
                node.setdefault('attrs', {})['ownership'] = 'UBT module directory within ' + provider['evidence']
            if entry.get('Rules'):
                node['source'] = self.location(entry['Rules'])
        return identity
