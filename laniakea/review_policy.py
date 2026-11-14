# SPDX-License-Identifier: AGPL-3.0-or-later
"""The local review policy contract. Selectors match recorded modules, never source files on disk."""

import fnmatch
import re
from pathlib import PurePosixPath

DEFAULT = {'version': 1, 'rules': [{'id': 'module-cycles', 'kind': 'cycles'},
                                    {'id': 'native-direct-dependency', 'kind': 'native'},
                                    {'id':'source-duplication','kind':'duplication','minimum_tokens':100}]}


def fields(value, allowed):
    if not isinstance(value, dict) or set(value)-set(allowed):
        raise ValueError('unknown or invalid review field')


def strings(value, maximum=256):
    if not isinstance(value, list) or not value or len(value)>maximum or \
            any(not isinstance(s, str) or not s or len(s)>512 for s in value):
        raise ValueError('expected a bounded list of review strings')


def selector(value):
    fields(value, {'ids', 'label_glob', 'root', 'path_prefix', 'exclude'})
    if 'ids' in value:
        strings(value['ids'])
        if 'label_glob' in value:
            raise ValueError('use ids or label_glob, not both')
    for key in ('label_glob', 'root', 'path_prefix'):
        if key in value and (not isinstance(value[key], str) or not value[key] or len(value[key])>512):
            raise ValueError('invalid review selector text')
    if 'path_prefix' in value:
        path=value['path_prefix']
        if '\\' in path or ':' in path or path.startswith('/') or '..' in PurePosixPath(path).parts:
            raise ValueError('review paths must be root-relative forward-slash prefixes')
    if 'exclude' in value:
        strings(value['exclude'])


def validate(policy):
    fields(policy, {'version', 'rules'})
    if type(policy.get('version')) is not int or policy['version'] != 1 or \
            not isinstance(policy.get('rules'), list) or len(policy['rules'])>64:
        raise ValueError('invalid review policy version or rules')
    seen=set()
    for rule in policy['rules']:
        fields(rule, {'id', 'kind', 'enabled', 'reason', 'source', 'target', 'scope', 'types', 'context', 'acyclic','minimum_tokens'})
        identity=rule.get('id')
        if not isinstance(identity, str) or not re.fullmatch(r'[a-z0-9][a-z0-9_.-]{0,79}', identity) or identity in seen:
            raise ValueError('invalid or duplicate review rule id')
        seen.add(identity)
        kind=rule.get('kind')
        if not isinstance(kind,str) or kind not in {'forbidden', 'cycles', 'native', 'duplication'}:
            raise ValueError('unknown review rule kind')
        for flag in ('enabled', 'acyclic'):
            if flag in rule and type(rule[flag]) is not bool:
                raise ValueError('invalid review rule flag')
        if 'reason' in rule and (not isinstance(rule['reason'], str) or len(rule['reason'])>2000):
            raise ValueError('invalid review reason')
        allowed={'forbidden': {'source', 'target', 'types', 'context'},
                 'cycles': {'scope', 'types', 'context', 'acyclic'}, 'native': {'scope', 'context'},
                 'duplication': {'scope', 'context', 'minimum_tokens'}}[kind]
        if set(rule)-{'id', 'kind', 'enabled', 'reason'}-allowed:
            raise ValueError('unknown field for review rule kind')
        if kind=='forbidden' and not {'source', 'target'}<=rule.keys():
            raise ValueError('forbidden rule requires source and target selectors')
        if 'minimum_tokens' in rule and (type(rule['minimum_tokens']) is not int or not 1<=rule['minimum_tokens']<=100000):
            raise ValueError('invalid duplication threshold')
        for key in ('source', 'target', 'scope'):
            if key in rule:
                selector(rule[key])
        if 'types' in rule:
            strings(rule['types'], 16)
        if 'context' in rule:
            fields(rule['context'], {'name', 'platform', 'configuration'})
            if any(not isinstance(v, str) or not v or len(v)>256 for v in rule['context'].values()):
                raise ValueError('invalid review context')
    return policy


def match(nodes, spec):
    found=[]
    for identity, node in nodes.items():
        source=node.get('source', {})
        if 'ids' in spec and identity not in spec['ids']:
            continue
        if 'label_glob' in spec and not fnmatch.fnmatchcase(node['label'], spec['label_glob']):
            continue
        if 'root' in spec and source.get('root')!=spec['root']:
            continue
        if 'path_prefix' in spec:
            prefix=spec['path_prefix'].rstrip('/')
            path=source.get('path', '')
            if path!=prefix and not path.startswith(prefix+'/'):
                continue
        if identity not in spec.get('exclude', []):
            found.append(identity)
    return sorted(found)
