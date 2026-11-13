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
                       'Native checks cover recorded compile access, not binary linkage or runtime behavior.']}


def native_note(edge):
    return native_availability(edge)=='unsupported'


def native_availability(edge):
    if edge['type']!='calls' or edge['origin']!='compiler' or edge['status']!='resolved':
        return None
    attrs=edge.get('attrs',{})
    state=attrs.get('dependency_access')
    if state in ('available','unsupported','unverified'):
        return state
    # Legacy missing-direct notes lack the evidence needed to claim unsupported compile access.
    return 'unverified' if 'dependency_review' in attrs or 'dependency_access' in attrs else None


def native_context(edge):
    # Alternative recorded paths are witnesses of the same reachability fact, not new concerns.
    attrs=edge.get('attrs', {})
    def observed(key):
        value=attrs.get(key)
        return bool(value) if isinstance(value,list) and all(isinstance(n,str) for n in value) else None
    return {'access':native_availability(edge), 'transitive':observed('transitive_path'),
            'public_exposure':observed('public_exposure_path'),
            'include_exposure':observed('include_exposure_path')}
