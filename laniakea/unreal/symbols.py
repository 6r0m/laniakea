# SPDX-License-Identifier: AGPL-3.0-or-later
"""Normalize native compiler identities and relationships without expanding Engine internals."""

import hashlib
import re
from functools import lru_cache
from pathlib import Path

from .. import LaniakeaError
from . import graph
from .external import SourceLocations
from .commands import remap

EDGE_TYPES = [
    {"id": "calls", "label": "calls (statically resolved)", "status": "resolved"},
    {"id": "uses.function", "label": "function reference", "status": "resolved"},
    {"id": "uses.type", "label": "type reference", "status": "resolved"},
    {"id": "inherits", "label": "inherits", "status": "resolved"},
    {"id": "overrides", "label": "overrides", "status": "resolved"},
]


def node_id(usr):
    return "symbol:" + hashlib.sha256(usr.encode("utf-8")).hexdigest()


def merge(built, batches, project, copy, engine, exported, generated_owners=None, *, locations=None):
    builder = graph._Builder(project, engine)
    builder.nodes = {n["id"]: n for n in built["nodes"]}
    builder.edges = {e["id"]: e for e in built["edges"]}
    project_root = Path(project).parent
    locations = locations or SourceLocations(project_root, engine)
    module_directories = {}
    for name, entry in exported["Modules"].items():
        module_directories.setdefault(graph._norm(entry["Directory"]), name)
    all_directories = {**module_directories, **{graph._norm(path): name for path, name in (generated_owners or {}).items()}}
    facts, references, relations = {}, [], []
    for batch in batches:
        locations.register(batch.get('providers', []))
        if any(d["severity"] >= 3 for d in batch["diagnostics"]):
            raise LaniakeaError("a translation unit with compiler errors cannot publish symbol facts")
        # Non-star helper USRs can repeat in unrelated local scopes; keep their reference provenance batch-local.
        contexts={s['usr']:(s['usr'],s['file'],s['parent']) for s in batch['symbols'] if s['level']=='other'}
        def contextual(item):
            changes={key:contexts[item[key]] for key in ('source','target') if item[key] in contexts}
            return {**item,**changes} if changes else item
        for original_symbol in batch["symbols"]:
            symbol=({**original_symbol,'usr':contexts[original_symbol['usr']],'original_usr':original_symbol['usr']}
                    if original_symbol['usr'] in contexts else original_symbol)
            old = facts.get(symbol["usr"])
            if old and old["level"] != symbol["level"]:
                raise LaniakeaError("compiler identity collision")
            if old and old['parent']!=symbol['parent']:
                raise LaniakeaError(f"compiler containment collision for {symbol['name']!r}: "
                                   f"{old['parent']!r} versus {symbol['parent']!r}")
            if old and old["name"] != symbol["name"]:
                same_declaration = (bool(old["file"]) and graph._norm(old["file"]) == graph._norm(symbol["file"]) and
                                    (old["line"], old["column"], old["parent"]) ==
                                    (symbol["line"], symbol["column"], symbol["parent"]))
                if not same_declaration:
                    raise LaniakeaError("compiler identity collision")
            chosen=dict(symbol if old is None or symbol['definition'] and not old['definition'] else old)
            if old:
                if 'declaration' not in chosen and 'declaration' in symbol:
                    chosen['declaration']=symbol['declaration']
                if 'declaration' not in chosen and 'declaration' in old:
                    chosen['declaration']=old['declaration']
                if symbol['level']=='namespace':
                    seen={(loc['file'],loc['line'],loc.get('column',1)):loc
                          for loc in [*old.get('locations',[]),*symbol.get('locations',[])]}
                    chosen['locations']=[seen[key] for key in sorted(seen)]
            facts[symbol['usr']]=chosen
        references.extend(contextual(item) for item in batch["references"])
        relations.extend(contextual(item) for item in batch["relations"])
    for node in list(builder.nodes.values()):
        if node['level']=='module' and node['boundary']:
            locations.module(builder, node['label'], exported)

    @lru_cache(maxsize=None)
    def original(file):
        return remap(file, copy, project_root) if file else None

    @lru_cache(maxsize=None)
    def owner(file, include_generated=True):
        path = original(file)
        if path is None:
            return None
        for folder in (path, *path.parents):
            name = (all_directories if include_generated else module_directories).get(graph._norm(folder))
            if name is not None:
                return name
        return None

    def authored(symbol):
        path = original(symbol["file"])
        module = owner(symbol["file"], False)
        return module and path and graph._relative(path, project_root) is not None

    ids = {}
    for usr, symbol in facts.items():
        if symbol["level"] not in {"class", "function"} or not authored(symbol):
            continue
        identity = node_id(usr)
        if identity in builder.nodes:
            raise LaniakeaError("compiler identity collides with a structural node")
        ids[usr] = identity
        path = original(symbol["file"])
        builder.node(identity, symbol["level"], symbol["name"] or "(anonymous)", "module:" + owner(symbol["file"]),
                     source={"root": "project", "path": graph._relative(path, project_root), "line": symbol["line"]},
                     attrs={"signature": symbol["signature"], "qualified": "::".join(filter(None, (symbol["scope"], symbol["name"]))),
                            "analysis": "resolved", "definition": symbol["definition"]})
        node=builder.nodes[identity]
        for name in ('declaration_kind','access','static','virtual','const','type_signature','declaration_origin'):
            if name in symbol:
                node['attrs'][name]=symbol[name]
        if symbol.get('declaration'):
            declared=symbol['declaration']
            location=locations.location(original(declared['file']),declared['line'])
            if location:
                node['attrs']['declaration']=location
        if symbol['definition']:
            node['attrs']['definition_location']=dict(node['source'])
        if symbol.get('declaration_kind')=='lambda':
            node['label']='lambda '+(symbol.get('lambda_name') or f"{path.name}:{symbol['line']}:{symbol['column']}")
            node['attrs']['signature']=node['label']

    aliases={facts[usr]['name']:builder.nodes[identity]['label'] for usr,identity in ids.items()
             if facts[usr].get('declaration_kind')=='lambda'}
    names=re.compile('|'.join(re.escape(name) for name in sorted(aliases,key=len,reverse=True))) if aliases else None
    roots={str(Path(copy)),Path(copy).as_posix(),str(project_root),project_root.as_posix(),str(Path(engine)),Path(engine).as_posix()}
    def display(text):
        if names:
            text=names.sub(lambda match:aliases[match[0]],text)
        for root in sorted(roots,key=len,reverse=True):
            text=text.replace(root,'<source>')
        return text
    for identity in ids.values():
        node=builder.nodes[identity]
        node['label']=display(node['label'])
        for key in ('signature','type_signature'):
            if key in node['attrs']:
                node['attrs'][key]=display(node['attrs'][key])

    scopes={}
    def namespace(usr,module,visiting=None):
        key=(usr,module)
        if key in scopes:
            return scopes[key]
        visiting=set() if visiting is None else visiting
        if usr in visiting:
            raise LaniakeaError('cyclic compiler namespace ownership')
        visiting.add(usr)
        fact=facts[usr]
        identity='namespace:'+hashlib.sha256(repr(key).encode()).hexdigest()
        if identity in builder.nodes:
            raise LaniakeaError('compiler namespace identity collision')
        parent=fact['parent']
        parent_id=namespace(parent,module,visiting) if parent in facts and facts[parent]['level']=='namespace' else 'module:'+module
        available=[loc for loc in fact.get('locations',[fact]) if owner(loc['file'],False)==module]
        available.sort(key=lambda loc:(graph._norm(original(loc['file'])),loc['line'],loc.get('column',1)))
        source=locations.location(original(available[0]['file']),available[0]['line']) if available else None
        label=fact['name']
        if not label:
            context=graph._relative(original(fact['file']),exported['Modules'][module]['Directory'])
            label='anonymous namespace ('+(context or Path(fact['file']).name)+')'
        builder.node(identity,'namespace',label,parent_id,source=source,
                     attrs={'analysis':'resolved','declaration_kind':'namespace'})
        scopes[key]=identity
        visiting.remove(usr)
        return identity

    for usr, identity in ids.items():
        parent = facts[usr]["parent"]
        if parent in ids and parent != usr:
            builder.nodes[identity]["parent"] = ids[parent]
        elif parent in facts and facts[parent]['level']=='namespace':
            builder.nodes[identity]['parent']=namespace(parent,owner(facts[usr]['file']))

    qualified={}
    def qualify(identity,visiting=None):
        if identity in qualified:
            return qualified[identity]
        visiting=set() if visiting is None else visiting
        if identity in visiting:
            raise LaniakeaError('cyclic compiler containment')
        visiting.add(identity)
        node=builder.nodes[identity];parent=node['parent']
        prefix=qualify(parent,visiting) if parent in containers else ''
        qualified[identity]='::'.join(filter(None,(prefix,node['label'])))
        node.setdefault('attrs',{})['qualified']=qualified[identity]
        visiting.remove(identity)
        return qualified[identity]
    containers=set(ids.values())|set(scopes.values())
    for identity in sorted(containers):
        qualify(identity)
    members={}
    for member in facts.values():
        members.setdefault(member['parent'],[]).append(member)
    for usr,identity in ids.items():
        node=builder.nodes[identity]
        if node['level']!='class' or not facts[usr]['definition']:
            continue
        counts={'fields':{},'callables':{}}
        for member in members.get(usr,[]):
            kind='fields' if member['level']=='member' else 'callables' if member['level']=='function' else None
            if kind:
                access=member.get('access','unknown')
                counts[kind][access]=counts[kind].get(access,0)+1
        node['attrs']['member_counts']=counts

    unknown = {"source": 0, "target": 0}

    @lru_cache(maxsize=None)
    def endpoint(usr, file=None):
        if usr in ids:
            return ids[usr]
        symbol = facts.get(usr, {})
        if symbol.get('level')=='namespace' and file:
            module=owner(file)
            return 'module:'+module if module else None
        module = None
        parent = symbol.get("parent")
        visited = set()
        while parent and parent not in visited:
            visited.add(parent)
            # Fields and macro-spelled methods retain their recorded semantic owner.
            if parent in ids:
                return ids[parent]
            enclosing = facts.get(parent, {})
            if module is None and enclosing.get('level')!='namespace':
                module = owner(enclosing.get("file"))
            parent = enclosing.get("parent")
        if module is None:
            module = owner(symbol.get("file") or file)
        if not module:
            if symbol.get("file") and graph._relative(original(symbol["file"]), engine) is not None:
                return builder.engine_third_party(original(symbol['file'])) or graph.ENGINE_ID
            if usr and symbol.get("file") and graph._relative(original(symbol["file"]), project_root) is None:
                return locations.endpoint(builder, original(symbol['file']))
            return None
        identity = "module:" + module
        if identity not in builder.nodes:
            locations.module(builder, module, exported)
        return identity

    @lru_cache(maxsize=None)
    def declaration(usr):
        symbol = facts.get(usr, {})
        result = {'id': node_id(symbol.get('original_usr',usr))}
        declared=symbol.get('declaration',symbol)
        location = locations.location(original(declared.get('file')), declared.get('line', 1))
        if location is not None:
            result['location'] = location
            result['column'] = declared.get('column', 1)
        return result

    seen_relations = set()
    for relation in relations:
        original_source, original_target = facts.get(relation['source'], {}), facts.get(relation['target'], {})
        key = (relation['type'], original_source.get('original_usr',relation['source']),
               original_target.get('original_usr',relation['target']))
        if key in seen_relations:
            continue
        seen_relations.add(key)
        source, target = endpoint(relation["source"]), endpoint(relation["target"])
        if source is None or target is None or builder.nodes[source]["boundary"]:
            continue
        identity = f"{relation['type']}:{source}->{target}"
        if relation['source'] not in ids or relation['target'] not in ids:
            identity += ':' + hashlib.sha256(repr(key).encode()).hexdigest()[:24]
        attrs = {'symbol': display('::'.join(filter(None, (original_target.get('scope'), original_target.get('signature'))))),
                 'target_declaration': declaration(relation['target'])}
        location = locations.location(original(original_source.get('file')), original_source.get('line', 1))
        if location is not None:
            attrs['location'] = location
        builder.edges[identity] = {'id': identity, 'type': relation['type'], 'source': source, 'target': target,
                                   'status': 'resolved', 'origin': 'compiler', 'attrs': attrs}
        if source == target and (relation["source"] not in ids or relation["target"] not in ids):
            builder.edges[identity]["internal_to_owner"] = True
    seen = set()
    for reference in references:
        if not reference["role"] & 4:
            continue
        if owner(reference["file"], False) is None:
            continue
        source = endpoint(reference["source"], reference["file"])
        if source is None or builder.nodes[source]["boundary"]:
            source = endpoint(None, reference["file"])
        target = endpoint(reference["target"])
        if source is None or target is None:
            unknown["source" if source is None else "target"] += 1
            continue
        if builder.nodes[source]["boundary"]:
            raise LaniakeaError("a compiler reference acquired an external source owner")
        symbol = facts.get(reference["target"], {})
        kind = ("calls" if reference["call_confirmed"] else
                "uses.function" if symbol.get("level") == "function" else "uses.type")
        location = {"root": "project", "path": graph._relative(original(reference["file"]), project_root),
                    "line": reference["line"]}
        key = (kind, source, target, location["path"], location["line"], reference["column"], symbol.get('original_usr',reference["target"]))
        if reference['source'] not in ids and reference['source'] in facts:
            origin=facts[reference['source']]
            key+=(origin.get('original_usr',reference['source']),)
        if key in seen:
            continue
        seen.add(key)
        suffix = hashlib.sha256(repr(key).encode()).hexdigest()[:24]
        identity = f"{kind}:{source}->{target}:{suffix}"
        builder.edges[identity] = {"id": identity, "type": kind, "source": source, "target": target,
                                   "status": "resolved", "origin": "compiler",
                                   "attrs": {"location": location, "column": reference["column"],
                                             "symbol": display("::".join(filter(None, (symbol.get("scope"), symbol.get("signature"))))),
                                             'target_declaration': declaration(reference['target']),
                                             "dispatch": "virtual target declaration" if reference["role"] & 64 else "static",
                                             "implicit": reference["implicit"]}}
        if source == target and (reference["source"] not in ids or reference["target"] not in ids
                                 or (kind == "uses.type" and symbol.get("level") == "class")):
            builder.edges[identity]["internal_to_owner"] = True
    if 'external:cpp' in builder.nodes and not any(n['parent']=='external:cpp' for n in builder.nodes.values()) and \
            not any('external:cpp' in (e['source'],e['target']) for e in builder.edges.values()):
        del builder.nodes['external:cpp']
    result = {"schema": built["schema"], "nodes": list(builder.nodes.values()), "edges": list(builder.edges.values())}
    from .source_context import annotate
    annotate(result['nodes'])
    _dependency_reviews(result, exported)
    return result, unknown


def _dependency_reviews(built, exported):
    from .dependency_access import annotate
    annotate(built, exported)
