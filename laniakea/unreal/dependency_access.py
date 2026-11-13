# SPDX-License-Identifier: AGPL-3.0-or-later
"""Interpret recorded UBT compile access without inferring binary linkage or a direct-dependency policy."""

from collections import deque
from functools import lru_cache


def annotate(built, exported):
    nodes={n['id']:n for n in built['nodes']}
    modules=exported['Modules']

    @lru_cache(maxsize=None)
    def owner(identity):
        while identity and nodes[identity]['level']!='module':
            identity=nodes[identity]['parent']
        return nodes[identity]['label'] if identity else None

    @lru_cache(maxsize=None)
    def access(source):
        # UBT's private compile environment permits a private first hop, then only public exposure.
        paths={source:[source]}; includes={}; missing=set(); seen=set()
        pending=deque([(source,False,[source])])
        while pending:
            name,include_only,chain=pending.popleft()
            if (name,include_only) in seen:
                continue
            seen.add((name,include_only))
            (includes if include_only else paths).setdefault(name,chain)
            fields=['PublicIncludePathModules']
            if not include_only:fields.append('PublicDependencyModules')
            if len(chain)==1:
                fields.extend(('PrivateDependencyModules','PrivateIncludePathModules'))
            entry=modules.get(name,{})
            for field in fields:
                values=entry.get(field)
                if not isinstance(values,list) or not all(isinstance(v,str) and v for v in values):
                    missing.add(name)
                    continue
                for target in values:
                    pending.append((target,include_only or 'IncludePath' in field,[*chain,target]))
        return paths,includes,sorted(missing)

    for edge in built['edges']:
        if edge['type']!='calls':
            continue
        origin=nodes[edge['source']]
        # Consumer-supplied template arguments are not reverse dependencies of the generic owner.
        if origin['level']=='function' and origin.get('attrs',{}).get('definition') is False:
            continue
        source,target=owner(edge['source']),owner(edge['target'])
        if not source or not target or source==target:
            continue
        entry=modules.get(source,{})
        if any(isinstance(entry.get(field),list) and target in entry[field]
               for field in ('PublicDependencyModules','PrivateDependencyModules')):
            continue
        paths,includes,missing=access(source)
        path=paths.get(target,[]); include=includes.get(target,[])
        attrs=edge.setdefault('attrs',{})
        attrs.update(public_exposure_path=path,include_exposure_path=include,
                     linkage='Binary linkage not evaluated; compile access is not a link proof.')
        attrs.pop('dependency_review',None)
        if path:
            state='available'
            detail='Module compile access: '+' -> '.join(path)
        elif include and attrs.get('dispatch')=='virtual target declaration':
            state='available'
            detail='Include-only interface access: '+' -> '.join(include)
        elif include:
            state='unverified'
            detail='Include-only access: '+' -> '.join(include)+'; static call linkage is unverified.'
        elif missing:
            state='unverified'
            detail='Module access unverified; dependency metadata unavailable for: '+', '.join(missing)
        else:
            state='unsupported'
            detail='No dependency or include-only path recorded in the evaluated module compile environment.'
            attrs['dependency_review']=detail+' Review other build inputs; not a violation.'
        attrs.update(dependency_access=state,dependency_context=detail)
