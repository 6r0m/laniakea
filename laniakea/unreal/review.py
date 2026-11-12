# SPDX-License-Identifier: AGPL-3.0-or-later
"""Interpret already published Unreal facts; review never invokes UBT or a compiler."""

import hashlib
from pathlib import Path

VERSION = 1
CODE_DIGEST = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
BUILD_TYPES = ('depends.public', 'depends.private')


def inputs(manifest):
    return {'version': VERSION, 'types': BUILD_TYPES,
            'native': any(source.get('id')=='compiler' for source in manifest.get('sources', [])),
            'limits': ['Selected target only; Engine dependencies beyond recorded boundary hops are unavailable.',
                       'Native notes cover recorded calls, not exhaustive call-graph or runtime behavior.']}


def native_note(edge):
    attrs=edge.get('attrs', {})
    return edge['type']=='calls' and edge['origin']=='compiler' and edge['status']=='resolved' and \
        isinstance(attrs.get('dependency_review'), str) and bool(attrs['dependency_review'])


def native_context(edge):
    # Alternative recorded paths are witnesses of the same reachability fact, not new concerns.
    attrs=edge.get('attrs', {})
    def observed(key):
        value=attrs.get(key)
        return bool(value) if isinstance(value,list) and all(isinstance(n,str) for n in value) else None
    return {'transitive':observed('transitive_path'), 'public_exposure':observed('public_exposure_path')}
