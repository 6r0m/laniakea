# SPDX-License-Identifier: AGPL-3.0-or-later
"""Versioned source observations and their Review interpretation, separate from dependency edges."""

import hashlib
import json
import re
from collections import Counter
from pathlib import Path, PurePosixPath

from . import LaniakeaError, review_policy
from .workspace import write_json

MAX_BYTES=32*1024*1024
HEX=re.compile(r'[0-9a-f]{64}\Z')


def prefixes(values):
    if not isinstance(values,list) or len(values)>64:
        raise ValueError('expected bounded health source prefixes')
    for value in values:
        relative(value)
    return sorted({PurePosixPath(v).as_posix().rstrip('/') for v in values})


def relative(value):
    if not isinstance(value,str) or not value or value in {'.','/'} or '\\' in value or ':' in value or \
            PurePosixPath(value).is_absolute() or '..' in PurePosixPath(value).parts or any(ord(c)<32 for c in value):
        raise ValueError('health paths must be root-relative forward-slash paths')
    return value


def validate(data,nodes=None):
    review_policy.fields(data,{'version','provider','minimum_tokens','scope','files','groups'})
    if type(data.get('version')) is not int or data['version']!=1 or type(data.get('minimum_tokens')) is not int or not 1<=data['minimum_tokens']<=100000:
        raise ValueError('invalid health observation version or collection threshold')
    provider=data.get('provider');review_policy.fields(provider,{'id','version','identity'})
    if not isinstance(provider.get('id'),str) or not re.fullmatch(r'[a-z][a-z0-9_.-]{0,63}',provider['id']) or \
            not isinstance(provider.get('version'),str) or not 1<=len(provider['version'])<=128 or \
            not isinstance(provider.get('identity'),str) or not HEX.fullmatch(provider['identity']):
        raise ValueError('invalid health provider identity')
    scope=data.get('scope');review_policy.fields(scope,{'prefixes','modules'});prefixes(scope.get('prefixes'))
    modules=None if nodes is None else {n['id'] for n in nodes if n['level']=='module' and not n['boundary'] and n['status']=='in-target'}
    selected=scope.get('modules')
    if not isinstance(selected,list) or not 1<=len(selected)<=50000 or any(not isinstance(s,str) for s in selected) or \
            len(set(selected))!=len(selected) or modules is not None and not set(selected)<=modules:
        raise ValueError('health scope names an unrecorded module')
    files=data.get('files')
    if not isinstance(files,dict) or not 1<=len(files)<=50000:
        raise ValueError('invalid health source inventory')
    for path,entry in files.items():
        relative(path);review_policy.fields(entry,{'sha256','owner'})
        if not isinstance(entry.get('sha256'),str) or not HEX.fullmatch(entry['sha256']) or entry.get('owner') not in selected:
            raise ValueError('invalid health source ownership or digest')
    groups=data.get('groups')
    if not isinstance(groups,list) or len(groups)>20000:
        raise ValueError('health observation limit reached')
    identities=set();total=0
    for group in groups:
        review_policy.fields(group,{'fingerprint','tokens','occurrences'})
        identity=group.get('fingerprint');count=group.get('tokens');occurrences=group.get('occurrences')
        if not isinstance(identity,str) or not HEX.fullmatch(identity) or identity in identities or \
                type(count) is not int or count<data['minimum_tokens'] or not isinstance(occurrences,list) or len(occurrences)<2:
            raise ValueError('invalid duplicate observation')
        identities.add(identity);seen=set();total+=len(occurrences)
        if total>100000:raise ValueError('source occurrence limit reached')
        for occurrence in occurrences:
            review_policy.fields(occurrence,{'path','line','column','end_line','end_column'})
            if not isinstance(occurrence.get('path'),str) or occurrence['path'] not in files or \
                    any(type(occurrence.get(k)) is not int or not 1<=occurrence[k]<=2147483647
                    for k in ('line','column','end_line','end_column')) or \
                    (occurrence['end_line'],occurrence['end_column'])<(occurrence['line'],occurrence['column']):
                raise ValueError('invalid source occurrence range')
            key=tuple(occurrence.get(k) for k in ('path','line','column','end_line','end_column'))
            if key in seen:raise ValueError('repeated source occurrence')
            seen.add(key)
    return data


def write(run,data,nodes):
    validate(data,nodes)
    raw=(json.dumps(data,indent=1,sort_keys=True)+'\n').encode('utf-8')
    if len(raw)>MAX_BYTES:raise LaniakeaError('health observations exceed 32 MiB')
    path=Path(run)/'health.json';write_json(path,data)
    return {'version':1,'path':'health.json','sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
            'prefixes':data['scope']['prefixes']}


def load(run,manifest,nodes=None):
    marker=manifest.get('health')
    if marker is None:return None
    review_policy.fields(marker,{'version','path','sha256','prefixes'})
    if type(marker.get('version')) is not int or marker['version']!=1 or marker.get('path')!='health.json':
        raise ValueError('unsupported health artifact')
    path=Path(run)/'health.json'
    with path.open('rb') as stream:raw=stream.read(MAX_BYTES+1)
    if len(raw)>MAX_BYTES or hashlib.sha256(raw).hexdigest()!=marker.get('sha256'):
        raise ValueError('health artifact digest or size mismatch')
    data=validate(json.loads(raw),nodes)
    if marker.get('prefixes')!=data['scope']['prefixes']:raise ValueError('health scope mismatch')
    return data


def evaluate(data,rule,selected,check,emit):
    if data is None:
        check.update(status='unavailable',detail='Source duplication was not recorded; explicitly request --health duplication.')
        return
    minimum=rule.get('minimum_tokens',100)
    if minimum<data['minimum_tokens']:
        check.update(status='unavailable',detail='Threshold is below collected coverage; extract health again with a lower collection threshold.')
        return
    scope=', '.join(data['scope']['prefixes']) or 'all in-target project source'
    missing=len(selected-set(data['scope']['modules']))
    check.update(status='partial',detail=f"Strict raw-source matches, minimum {data['minimum_tokens']} tokens; "
                 f"{len(data['files'])} collected files in {scope}. {missing} selected modules have no collected files. "
                 'Semantic equivalence, active preprocessing branches and runtime use are not established.')
    check['recorded_modules']=data['scope']['modules']
    for group in data['groups']:
        if group['tokens']<minimum:continue
        occurrences=[o for o in group['occurrences'] if data['files'][o['path']]['owner'] in selected]
        if len(occurrences)<2:continue
        subjects=sorted({data['files'][o['path']]['owner'] for o in occurrences})
        counts=Counter(o['path'] for o in occurrences)
        relationships=[('file',path,count) for path,count in sorted(counts.items())]
        relationships.extend([('tokens',group['fingerprint'],group['tokens']),
                              ('provider',data['provider']['id'],data['provider']['version'],data['provider']['identity'])])
        evidence=[{'root':'project',**o,'sha256':data['files'][o['path']]['sha256'],
                   'owner':data['files'][o['path']]['owner']} for o in occurrences]
        emit(rule,subjects,relationships,[],len(occurrences),'candidate','Duplicated source tokens',
             'Inspect the matching ranges and intended ownership. The same tokens can be intentional; no automatic refactoring is implied.',[],
             identity=group['fingerprint'],extra={'category':'Duplication','evidence_type':'source',
             'evidence_total':len(evidence),'source_evidence':evidence,'token_count':group['tokens'],
             'limits':['Raw authored source; preprocessing branches may differ from the selected target.',
                       'Recorded snapshot ranges; current source edits may move these locations.']})
