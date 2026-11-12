# SPDX-License-Identifier: AGPL-3.0-or-later
"""Recorded source partitions for presentation, independent of compiler containment."""
from functools import lru_cache
from pathlib import PurePosixPath

_HEADERS={'.h','.hpp','.hh','.hxx','.inl','.ipp','.tpp'}

def annotate(nodes):
    by_id={node['id']:node for node in nodes}
    children={identity:[] for identity in by_id}
    for node in nodes:
        if node['parent'] in children:
            children[node['parent']].append(node)

    @lru_cache(maxsize=None)
    def module(identity):
        node=by_id[identity]
        return node if node['level']=='module' else module(node['parent']) if node['parent'] else None

    def relative(location,root):
        if not location or location.get('root')!='project' or not root:
            return None
        parts=PurePosixPath(location['path']).parts
        return parts[len(root):] if tuple(p.casefold() for p in parts[:len(root)])==root else None

    for node in nodes:
        owner=module(node['id'])
        if node.get('boundary') or not owner or owner.get('boundary'):
            continue
        attrs=node.setdefault('attrs',{})
        if node['level'] in {'module','namespace'}:
            attrs['source_sections']=True
        if node['level'] not in {'class','function'}:
            continue
        source=owner.get('source',{})
        root=tuple(p.casefold() for p in PurePosixPath(source['path']).parent.parts) if source.get('root')=='project' else ()
        observed=[(relative(location,root),location) for location in [attrs.get('declaration'),node.get('source')]]
        headers=[(parts,location) for parts,location in observed if parts and PurePosixPath(parts[-1]).suffix.lower() in _HEADERS]
        candidates=headers or [(parts,location) for parts,location in observed if parts]
        # A recorded public header wins over an out-of-line definition or a local forward declaration.
        selected=next((item for item in candidates if item[0][0].casefold()=='public'),next(iter(candidates),None))
        if not selected or selected[0][0].casefold() not in {'public','private'}:
            continue
        parts,location=selected
        private=parts[0].casefold()=='private'
        attrs['source_partition']={'id':'private' if private else 'public',
            'label':'Private implementation' if private else 'Public',
            'collapsed':private,'folders':list(parts[1:-1])}
        if PurePosixPath(parts[-1]).suffix.lower() in _HEADERS:
            attrs['source_partition']['file']={key:location[key] for key in ('root','path')}

    def aggregate(node):
        if node['level']!='namespace':
            return node.get('attrs',{}).get('source_partition')
        values=[aggregate(child) for child in children[node['id']]]
        if not values or any(not value for value in values):
            return None
        first=values[0]
        if any((value['id'],value['collapsed'])!=(first['id'],first['collapsed']) for value in values):
            return None
        folders=list(first['folders'])
        for value in values[1:]:
            folders=folders[:next((i for i,(a,b) in enumerate(zip(folders,value['folders'])) if a!=b),
                                 min(len(folders),len(value['folders'])))]
        result={**first,'folders':folders}
        if any(value.get('file')!=first.get('file') for value in values):
            result.pop('file',None)
        node.setdefault('attrs',{})['source_partition']=result
        return result
    for node in nodes:
        if node['level']=='namespace':
            aggregate(node)
