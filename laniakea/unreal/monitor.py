# SPDX-License-Identifier: AGPL-3.0-or-later
"""Unreal monitoring inputs and watch boundaries; notifications never authorize new source roots."""

import hashlib
import json
import os
from pathlib import Path

from .. import LaniakeaError
from . import builds,descriptors, source_inputs, tools, source_health, checks
from .source_tree import SourceTree


def digest_or_missing(path):
    try:Path(path).stat()
    except FileNotFoundError:return 'missing'
    return tools.digest(path)


def engine_inputs(target,manifest):
    engine=Path(target['engine_root'])
    result={f'engine:{name}':digest_or_missing(engine/name) for name in
            ('Engine/Build/Build.version','Engine/Binaries/DotNET/UnrealBuildTool/UnrealBuildTool.dll')}
    roots={'project':Path(target['project_file']).parent,'engine':engine}
    for product in manifest.get('target',{}).get('build_context',{}).get('products',[]):
        location={key:product[key] for key in ('root','path')}
        try:value=builds._product(location,roots)
        except FileNotFoundError:value='missing'
        result['product:'+json.dumps(location,sort_keys=True)]=value
    return result


def recipe(workspace,target,manifest):
    committed=workspace.request(target['id'])
    if committed:return committed['recipe']
    return checks.from_manifest(manifest)


def inspect(workspace,target,manifest,request):
    from . import inputs
    root=Path(target['project_file']).parent
    plugins=descriptors.project_plugins(root);tree=SourceTree(root,plugins)
    health=source_health.prepare({**request['health'],'tools':workspace.root/'tools/health/cpd'})
    code=request['symbols'] or health[1]['status']=='pending'
    values=inputs(target,manifest if request['symbols'] else None,symbols=request['symbols'])
    if code and not request['symbols']:
        values.update(source_inputs.fingerprints(target['project_file'],prefixes=health[0]['prefixes'],
                                                excludes=target.get('excludes',[])))
    changed=values!=manifest['inputs']
    for directory,dirs,files in tree.walk(root/'Config'):
        dirs[:]=[name for name in dirs if name not in descriptors.SKIP_DIRS]
        for name in files:
            if name.lower().endswith('.ini'):
                path=directory/name;tree.require(path)
                values[path.relative_to(root).as_posix()]=tools.digest(path)
    tool_state={'health':health[1]}
    if request['symbols']:
        from .symbol_cache import environment
        installed=tools.load(workspace.root/'tools/unreal')
        if installed is None:raise LaniakeaError('native tools missing; restore setup-symbols or explicitly rebuild without symbols')
        tool_state['native']=installed['manifest']
        tool_state['native_environment']=environment()
    if health[1]['status']=='pending':tool_state['health']=health[0]['installed']['identity']
    # Include the installation marker even on refusal, so repairing a broken installation permits a new attempt.
    for relative in ('tools/health/cpd/tools.json','tools/unreal/tools.json'):
        if 'unreal' in relative and not request['symbols'] and request.get('checks',{}).get('native','off')=='off':continue
        if 'health' in relative and request['health']['mode']=='off':continue
        path=workspace.root/relative
        tool_state[relative]=digest_or_missing(path)
    tool_state['engine']=engine_inputs(target,manifest)
    package=Path(__file__).resolve().parent.parent
    tool_state['adapter']={path.relative_to(package).as_posix():tools.digest(path)
                           for path in [*package.glob('*.py'),*package.joinpath('unreal').glob('*.py')]}
    identity=hashlib.sha256(json.dumps({'inputs':values,'request':request,'tools':tool_state},
                                     sort_keys=True,separators=(',',':')).encode()).hexdigest()
    scope={'prefixes':[] if request['symbols'] else health[0]['prefixes'],
           'excludes':[] if request['symbols'] else target.get('excludes',[])} if code else None
    return {'identity':identity,'inputs':values,'source_scope':scope,'changed':changed,'watches':watches(workspace,target,manifest,plugins,code,request),
            'source_bodies_monitored':bool(code)}


def compare_inputs(workspace,target,manifest,request,current,run):
    """Describe only domains whose recorded and observed inventories are comparable."""
    baseline=workspace.request_at(target['id'],run)
    prior=baseline['target'] if baseline else None
    roots_match=bool(prior) and all(os.path.normcase(os.path.abspath(prior[key]))==
        os.path.normcase(os.path.abspath(target[key])) for key in ('project_file','engine_root'))
    native=any(s['id']=='compiler' for s in manifest['sources'])
    acquired=manifest['coverage'].get('acquisition',{}).get('source-duplication',{})
    old_scope=({'prefixes':[],'excludes':[]} if native else
        {'prefixes':manifest['health']['prefixes'],'excludes':prior.get('excludes',[]) if prior else []}
        if 'health' in manifest and acquired.get('status')=='completed' else None)
    new_scope=current.get('source_scope')
    equal_scope=old_scope is not None and new_scope is not None and all(
        sorted(old_scope[k])==sorted(new_scope[k]) for k in ('prefixes','excludes'))
    source_status='not-monitored' if new_scope is None else 'not-recorded' if old_scope is None else \
                  'compared' if equal_scope else 'scope-changed'
    scope={'build':{'label':'Build rules and descriptors','status':'compared'},
           'source':{'label':'C++ source content','status':source_status},
           'external':{'label':'Recorded external inputs','status':'compared' if native and request['symbols'] else
                       'not-monitored' if not request['symbols'] else 'not-recorded'}}
    if not roots_match:
        for item in scope.values():item['status']='unavailable'
    before=manifest['inputs'];after=current['inputs'];rows=[];counts={};total=0
    def category(key):
        if key.startswith('external:'):return 'external','Recorded external inputs'
        lower=key.casefold()
        if lower.endswith(('.build.cs','.target.cs')):return 'build','Build rules'
        if lower.endswith(('.uproject','.uplugin')):return 'build','Project descriptors'
        if lower.endswith('.target'):return 'build','Build evidence'
        if Path(key).suffix.lower() in source_inputs.EXTENSIONS:
            return 'source','Implementation files' if lower.endswith(('.c','.cc','.cpp','.cxx')) else 'Headers'
        return 'other','Other recorded inputs'
    roots={**target.get('roots',{}),**manifest.get('roots',{})}
    def location(key):
        if not key.startswith('external:'):return {'root':'project','path':key}
        path=Path(os.path.abspath(key[len('external:'):]))
        for name,root in roots.items():
            if not isinstance(root,str):continue
            try:return {'root':name,'path':path.relative_to(Path(os.path.abspath(root))).as_posix()}
            except ValueError:pass
        return None
    for key in sorted(before.keys()|after.keys()):
        domain,label=category(key)
        if not roots_match or domain!='other' and scope[domain]['status']!='compared':continue
        if domain=='other' and key not in before:continue
        previous=before.get(key);observed=after.get(key)
        if previous==observed:continue
        change='added' if previous is None else 'removed' if observed in (None,'missing') else 'modified'
        item={'path':key,'category':label,'change':change}
        loc=location(key)
        if loc:
            if key.startswith('external:'):item['path']=loc['root']+': '+loc['path']
            if change!='removed':item['source']=loc
        total+=1;counts[label]=counts.get(label,0)+1
        if len(rows)<10000 and len(item['path'])<=4096:rows.append(item)
    guidance=[]
    if total:
        if any(label in counts for label in ('Build rules','Project descriptors','Build evidence','Other recorded inputs')):
            guidance.append('Recorded module architecture may need rechecking.')
        if native:guidance.append('Recorded C++ references may be outdated.')
        if acquired.get('status')=='completed':guidance.append('Recorded duplication evidence may be outdated.')
    return {'baseline':manifest['run'],'scope':scope,'rows':rows,'total':total,'counts':counts,'complete':len(rows)==total,
            'limits':['Only recorded, currently monitored input domains are compared.',
                      'Configuration and tool/environment details have no per-input comparison baseline.'],
            'guidance':guidance}


def validate(target,manifest):
    from . import inputs
    if inputs(target,manifest)!=manifest['inputs']:
        raise LaniakeaError('recorded inputs changed during background analysis; candidate was not published')
    roots={'project':Path(target['project_file']).parent,'engine':Path(target['engine_root'])}
    for product in manifest.get('target',{}).get('build_context',{}).get('products',[]):
        if builds._product({key:product[key] for key in ('root','path')},roots)!=product:
            raise LaniakeaError('recorded linked product changed during background analysis; candidate was not published')


def watches(workspace,target,manifest,plugins,code,request):
    root=Path(target['project_file']).parent;tree=SourceTree(root,plugins);found={}
    def add(path,recursive=False,suffixes=(),names=(),directories=False):
        path=Path(path)
        # Missing roots are recovered by a bounded parent watch and periodic rediscovery.
        while not path.is_dir():
            if path==path.parent:raise LaniakeaError('no accessible parent for source watch')
            names=(path.name,);path=path.parent;recursive=False
        key=(str(path.resolve()),recursive)
        stat=path.stat()
        entry=found.setdefault(key,{'path':key[0],'recursive':recursive,'suffixes':[],'names':[],'directories':False,
                                    'identity':[stat.st_dev,stat.st_ino]})
        entry['suffixes']=sorted(set(entry['suffixes'])|set(suffixes))
        entry['names']=sorted(set(entry['names'])|{name.casefold() for name in names})
        entry['directories']|=directories
    add(root,suffixes=('.uproject',),names=('Source','Plugins','Config','Binaries'))
    add(root.parent,names=(root.name,))
    # Descriptor/category directories get non-recursive watches; Content and intermediates are never recursively watched.
    for current,dirs,files in tree.walk(root/'Plugins'):
        dirs[:]=[d for d in dirs if d not in descriptors.SKIP_DIRS]
        add(current,suffixes=('.uplugin',),directories=True)
        if any(name.endswith('.uplugin') for name in files):dirs[:]=[]
    for top in [root/'Source',*(plugin.parent/'Source' for plugin in plugins)]:
        tree.require(top)
        add(top,True,tuple(source_inputs.EXTENSIONS) + ('.build.cs','.target.cs') if code else ('.build.cs','.target.cs'),
            directories=True)
        add(top.parent,names=(top.name,))
    add(root/'Config',True,('.ini',),directories=True)
    add(root/'Binaries/Win64',suffixes=('.target',))
    engine=Path(target['engine_root'])
    for name in ('Engine/Build/Build.version','Engine/Binaries/DotNET/UnrealBuildTool/UnrealBuildTool.dll'):
        path=engine/name;add(path.parent,names=(path.name,))
    roots={'project':root,'engine':engine}
    for product in manifest.get('target',{}).get('build_context',{}).get('products',[]):
        path=roots[product['root']]/product['path'];add(path.parent,names=(path.name,))
    for key in manifest['inputs']:
        if key.startswith('external:'):
            path=Path(key[len('external:'):]);add(path.parent,names=(path.name,))
    if request['health']['mode']!='off':add(workspace.root/'tools/health/cpd',True,('.json','.jar','.class','.exe'))
    if request['symbols'] or request.get('checks',{}).get('native','off')!='off':
        add(workspace.root/'tools/unreal',True,('.json','.dll','.exe','.h'))
    return list(found.values())
