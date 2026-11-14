# SPDX-License-Identifier: AGPL-3.0-or-later
"""Deterministic Review interpretation of recorded relationships and optional source observations."""

import hashlib
import json
from collections import defaultdict, deque

from . import health, review_policy

VERSION = 1
NATIVE_FINGERPRINT_VERSION = 3
MAX_FINDINGS = 20000
WITNESSES = 8


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def components(adjacency):
    # Iterative Kosaraju avoids recursion limits and enumerating elementary cycles.
    seen, order = set(), []
    for start in sorted(adjacency):
        stack=[(start, False)]
        while stack:
            node, done=stack.pop()
            if done:
                order.append(node)
            elif node not in seen:
                seen.add(node); stack.append((node, True))
                stack.extend((n, False) for n in sorted(adjacency[node], reverse=True) if n not in seen)
    reverse={n:set() for n in adjacency}
    for a, neighbors in adjacency.items():
        for b in neighbors:
            reverse[b].add(a)
    seen=set()
    for start in reversed(order):
        if start in seen:
            continue
        members=[]; stack=[start]; seen.add(start)
        while stack:
            node=stack.pop(); members.append(node)
            for other in reverse[node]:
                if other not in seen:
                    seen.add(other); stack.append(other)
        yield sorted(members)


def loop(members, adjacency):
    allowed=set(members); start=members[0]
    pending=deque([start]); parents={start:None}
    while pending:
        a=pending.popleft()
        for b in sorted(adjacency[a]&allowed):
            if b==start:
                chain=[a]
                while parents[chain[-1]] is not None:
                    chain.append(parents[chain[-1]])
                chain.reverse(); chain.append(start)
                return list(zip(chain, chain[1:]))
            if b not in parents:
                parents[b]=a; pending.append(b)
    return []


def evaluate(nodes, rows, manifest, policy, adapter=None, health_data=None):
    policy=review_policy.validate(policy)
    all_nodes={n['id']:n for n in nodes}
    modules={i:n for i,n in all_nodes.items() if n['level']=='module'}
    eligible={i:n for i,n in modules.items() if not n['boundary'] and n['status']=='in-target'}
    facts=adapter.inputs(manifest) if adapter else {'version': 1, 'types': (), 'native': False,
                                                 'limits': ['No profile review defaults; configure explicit edge types.']}
    supported_types=set(facts['types']) if adapter else {t['id'] for t in manifest.get('edge_types',[])}
    types=set(facts['types'])
    for rule in policy['rules']:
        types.update(set(rule.get('types', []))&supported_types)
    owners={}
    def owner(identity):
        if identity not in owners:
            current=identity
            while current in all_nodes and current not in modules:
                current=all_nodes[current]['parent']
            owners[identity]=current if current in modules else None
        return owners[identity]
    build={}; native={}; unverified=defaultdict(int); incomplete=set()
    for row in rows:
        edge=row['reference']; a,b=edge['source'],edge['target']; kind=edge['type']
        witness={'id': edge['id'], 'query': {'source': a, 'target': b, 'cursor': row['seq']-1, 'limit': 1}}
        if kind in types and a in modules and b in modules:
            if edge['status']!='declared' or edge.get('internal_to_owner'):
                incomplete.add(kind)
            else:
                key=(a,b,kind)
                entry=build.setdefault(key, {'count':0,'witnesses':[],'groups':set()})
                entry['count']+=1
                if 'group' in row:entry['groups'].add(row['group'])
                if len(entry['witnesses'])<WITNESSES:
                    entry['witnesses'].append(witness)
        if facts['native'] and adapter and adapter.native_availability(edge)=='unverified':
            a,b=owner(edge['source']),owner(edge['target'])
            if a in eligible and b in modules and a!=b:
                unverified[a]+=1
        if facts['native'] and adapter and adapter.native_note(edge):
            a,b=owner(a),owner(b)
            if a not in eligible or b not in modules or a==b:
                continue
            entry=native.setdefault((a,b), {'count':0, 'witnesses':[], 'contexts':set(),'groups':set()})
            entry['count']+=1
            if 'group' in row:entry['groups'].add(row['group'])
            entry['contexts'].add(digest(adapter.native_context(edge)))
            if len(entry['witnesses'])<WITNESSES:
                entry['witnesses'].append(witness)
    findings=[]; checks=[]
    context={'profile':manifest.get('profile'), 'target':manifest.get('target', {}),
             'adapter': facts['version']}
    # Receipt timestamps and paths are provenance, not a different architecture context.
    context['target']={k:context['target'].get(k) for k in ('name','platform','configuration')}
    def finding(rule, subjects, relationships, witnesses, count, severity, title, guidance, groups, *, identity=None, extra=None):
        key=[rule['id'],rule['kind'],subjects,context]
        if identity is not None:key.append(identity)
        identity=digest(key)
        semantic_rule={k:v for k,v in rule.items() if k not in {'reason','enabled','types','acyclic'}}
        semantic_rule.update(types=sorted(set(rule.get('types',facts['types']))),acyclic=rule.get('acyclic',False))
        for role in ('source','target','scope'):
            if role in semantic_rule:
                spec=dict(semantic_rule[role])
                for key in ('ids','exclude'):
                    if key in spec:spec[key]=sorted(set(spec[key]))
                if 'path_prefix' in spec:spec['path_prefix']=spec['path_prefix'].rstrip('/')
                semantic_rule[role]=spec
        version=NATIVE_FINGERPRINT_VERSION if rule['kind']=='native' else VERSION
        fingerprint=digest([version, semantic_rule, subjects, sorted(relationships), context])
        findings.append({'id':identity, 'fingerprint':fingerprint, 'rule':rule['id'], 'kind':rule['kind'],
                         'subjects':subjects, 'severity':severity, 'title':title, 'reason':rule.get('reason',''),
                         'guidance':guidance, 'count':count, 'witnesses':witnesses[:WITNESSES],
                         'witness_total':len(witnesses) if rule['kind']=='cycles' else count, 'limits':facts['limits'],
                         'groups':sorted(groups), **(extra or {})})
        if len(findings)>MAX_FINDINGS:
            raise ValueError('review finding limit reached; narrow the policy scope')
    for rule in policy['rules']:
        check={'id':rule['id'], 'kind':rule['kind'], 'status':'evaluated-on-recorded-scope',
               'matched':{}, 'limits':facts['limits']}
        checks.append(check)
        if not rule.get('enabled', True):
            check['status']='disabled'; continue
        if any(manifest.get('target',{}).get(k)!=v for k,v in rule.get('context',{}).items()):
            check.update(status='unavailable', detail='Policy context does not match this run.'); continue
        family=set(rule.get('types', facts['types']))
        if rule['kind']!='native' and family-supported_types:
            check.update(status='unavailable',detail='Unsupported module dependency edge family for this profile/run.');continue
        for name in ('source','target','scope'):
            if name in rule or name=='scope' and rule['kind']!='forbidden':
                spec=rule.get(name,{})
                pool=modules if 'ids' in spec else eligible
                selected=[] if rule['kind']=='forbidden' and not spec else review_policy.match(pool,spec)
                check['matched'][name]=selected
                missing=sorted(set(spec.get('ids',[]))-set(selected))
                if missing:
                    check['unmatched']=missing
                if not selected or missing:
                    check.update(status='unavailable', detail='No applicable modules or unmatched explicit module IDs.')
                elif check['status']!='unavailable' and any(i not in eligible for i in selected):
                    check.update(status='partial',detail='Selected scope includes external or unanalysed modules; only recorded relations can be checked.')
        if check['status']=='unavailable':
            continue
        if rule['kind']=='duplication':
            health.evaluate(health_data,rule,set(check['matched']['scope']),check,finding)
            continue
        if rule['kind']=='native':
            if not facts['native']:
                check.update(status='unavailable', detail='Native analysis was not recorded for this run.'); continue
            scope=set(check['matched']['scope'])
            unknown=sum(count for a,count in unverified.items() if a in scope)
            check.update(status='partial', unverified_relations=unknown,
                         detail=f'{unknown} recorded calls have unverified module access. '
                                'Binary linkage and runtime execution are not evaluated; absence is not a conformance proof.')
            for (a,b), entry in sorted(native.items()):
                if a not in scope:
                    continue
                relationships=[(a,b,kind) for kind in facts['types'] if (a,b,kind) in build]
                relationships.extend(('native-context',value) for value in sorted(entry['contexts']))
                finding(rule,[a,b],relationships,entry['witnesses'],entry['count'],'candidate',
                        'Native call without recorded module access',
                        'No dependency or include-only path was recorded. Inspect the call and other build inputs '
                        'before changing build rules; this is not a build-error diagnosis.',entry['groups'])
            continue
        if not family:
            check.update(status='unavailable', detail='No dependency edge family configured.'); continue
        if family&incomplete:
            check.update(status='partial', detail='Partial relations excluded; only declared witnesses are checked.')
        if rule['kind']=='forbidden':
            source=set(check['matched']['source']); target=set(check['matched']['target'])
            pairs=defaultdict(list)
            for key in sorted(build):
                if key[0] in source and key[1] in target and key[2] in family:
                    pairs[key[:2]].append(key)
            for pair, relationships in pairs.items():
                witnesses=[w for key in relationships for w in build[key]['witnesses']]
                finding(rule,list(pair),relationships,witnesses,sum(build[k]['count'] for k in relationships),'violation',
                        'Forbidden dependency direction',
                        'Inspect the declaration and intended boundary; consider moving the dependency behind a contract.',
                        {g for key in relationships for g in build[key]['groups']})
        else:
            scope=set(check['matched']['scope']); adjacency={n:set() for n in scope}
            for a,b,kind in build:
                if a in scope and b in scope and kind in family:
                    adjacency[a].add(b)
            groups=[members for members in components(adjacency)
                    if len(members)>1 or members[0] in adjacency[members[0]]]
            membership={n:i for i,members in enumerate(groups) for n in members}
            grouped=defaultdict(list)
            for key in sorted(build):
                a,b,kind=key; group=membership.get(a)
                if group is not None and membership.get(b)==group and kind in family:
                    grouped[group].append(key)
            for group,members in enumerate(groups):
                relationships=grouped[group]
                pair_witnesses={}
                for key in relationships:
                    pair_witnesses.setdefault(key[:2],build[key]['witnesses'][0])
                witnesses=[pair_witnesses[pair] for pair in loop(members, adjacency)]
                finding(rule,members,relationships,witnesses,sum(build[k]['count'] for k in relationships),
                        'violation' if rule.get('acyclic') else 'candidate','Module dependency cycle',
                        'Inspect the recorded loop and intended design; an interface boundary may break unwanted coupling.',
                        {g for key in relationships for g in build[key]['groups']})
    return {'findings':sorted(findings,key=lambda f:(f['severity']!='violation',f['rule'],f['subjects'])),
            'checks':checks, 'context':context}
