# SPDX-License-Identifier: AGPL-3.0-or-later
"""Unreal acquisition choices and prerequisites; Review alone interprets architectural findings."""

import json
from pathlib import Path

from .. import LaniakeaError
from ..workspace import read_json,write_json
from . import builds,tools,source_health


CHECK_HELP = {
    'foundation': {
        'why': 'See what depends on what. Review can flag forbidden dependencies and module cycles.',
        'method': "Laniakea reads Unreal Build Tool's evaluated module rules for the selected target and uses plugin descriptors for project context.",
    },
    'native': {
        'why': 'Follow a call or type to its source. Review can flag calls with no recorded module-access path.',
        'method': 'Clang indexes C++ with the selected build context. Laniakea looks for a supporting module-access path for calls between modules.',
    },
    'duplication': {
        'why': 'Find copies of code that might need the same fix.',
        'method': 'PMD CPD compares exact sequences of C++ tokens in project source and records the line ranges when a match meets the length threshold.',
    },
}


def modes(recipe):
    return dict(recipe.get('checks') or {'native':'on' if recipe['symbols'] else 'off',
                'duplication':{'required':'on','auto':'auto','off':'off'}[recipe['health']['mode']]})


def configure(recipe,choices):
    if not isinstance(choices,dict) or set(choices)!={'native','duplication'} or any(
            value not in ('auto','on','off') for value in choices.values()):
        raise ValueError('choose Auto, On or Off for C++ usage and duplicated code only')
    return {**recipe,'checks':dict(choices),'symbols':choices['native']=='on',
            'health':{**recipe['health'],'mode':{'on':'required','auto':'auto','off':'off'}[choices['duplication']]}}


def rows(manifest,recipe):
    choices=modes(recipe)
    native=any(s['id']=='compiler' for s in manifest['sources'])
    acquired=manifest['coverage'].get('acquisition',{})
    result=[{'id':'foundation','label':'Module architecture','optional':False,'status':'completed','code':'recorded',
             'description':'The map foundation: modules, plugins and declared build dependencies.',
             'help':CHECK_HELP['foundation'].copy(),
             'detail':'Always collected for the selected build context.'}]
    for key,label,description,setup in [
        ('native','C++ usage and references','Records classes, functions and static calls. Does not prove runtime behavior.',
         'python laniakea.py setup-symbols --help'),
        ('duplication','Duplicated code','Finds strict repeated token sequences with exact source ranges. Matches may be intentional.',
         'python laniakea.py setup-health --help')]:
        outcome=acquired.get('native' if key=='native' else 'source-duplication',{})
        status='completed' if key=='native' and native else outcome.get('status','incomplete')
        if choices[key]=='off' and status!='completed':status='disabled'
        reason={
            'tool_missing':'Needs local PMD CPD and JDK setup. No Java process was started.',
            'tool_invalid':'Local CPD tool validation failed. Restore setup-health before retrying.',
            'resource_headroom':'Not run: insufficient memory headroom. Retry when resources are available.',
            'memory_probe':'Not run: available memory could not be verified. Check diagnostics, then Retry.',
            'provider_exit':"CPD failed. Inspect the run's analyzer log, then Retry.",
            'partial_corpus':'Incomplete: the analyzer did not process the whole requested corpus. Inspect diagnostics before retrying.',
        }.get(outcome.get('code')) if key=='duplication' else None
        result.append({'id':key,'label':label,'optional':True,'mode':choices[key],'description':description,
                       'help':CHECK_HELP[key].copy(),
                       'setup':setup,'status':status,'code':outcome.get('code','not_recorded'),
                       'detail': 'Recorded in this snapshot.' if status=='completed' else
                           'Off in the saved settings.' if status=='disabled' else reason or 'Not recorded in the displayed map.'})
    return result


def resolve(workspace,target,manifest,recipe):
    """Resolve Auto in an owned worker, never by launching a build or working on an HTTP thread."""
    recipe={**recipe,'health':dict(recipe['health'])}
    result=rows(manifest,recipe)
    if 'checks' not in recipe:return recipe,result
    choices=modes(recipe);recipe=configure(recipe,choices)
    native=result[1]
    if choices['native']=='off':return recipe,result
    eligible=False
    try:
        installed=tools.load(workspace.root/'tools/unreal')
        if installed is None:
            native.update(status='unavailable',code='tools_missing',detail='Needs local LLVM setup. No compiler was started.')
        else:
            selected=manifest['target']
            receipt,_=builds.select(target['project_file'],target['engine_root'],
                [{'name':selected['name'],'type':selected['type']}],selected['name'],manifest)
            if receipt is None:
                native.update(status='unavailable',code='build_required',
                              detail='Needs a successful project build receipt. Laniakea will not build the project automatically.')
            else:
                eligible=True
                if native['status']!='completed':native.update(status='pending',code='ready',detail='Ready for background C++ indexing.')
    except (LaniakeaError,OSError,ValueError) as error:
        native.update(status='failed',code='prerequisite_failed',detail='Native prerequisites could not be validated.',
                      diagnostic=str(error))
    # A required request stays required. An existing native map must never be silently downgraded.
    recipe['symbols']=choices['native']=='on' or eligible or recipe['symbols'] or any(s['id']=='compiler' for s in manifest['sources'])
    if choices['native']=='auto' and not eligible:
        recipe['symbols']=any(s['id']=='compiler' for s in manifest['sources'])
    # Establish useful source-health evidence first when upgrading a module-only map.
    outcome=manifest['coverage'].get('acquisition',{}).get('source-duplication',{})
    if choices['native']=='auto' and eligible and not any(s['id']=='compiler' for s in manifest['sources']) and \
            choices['duplication']!='off' and outcome.get('mode')!=recipe['health']['mode']:
        recipe['symbols']=False
        native.update(status='pending',code='after_base',detail='Queued after the module/duplication snapshot.')
    return recipe,result


def failure_path(workspace,target_id):
    return workspace.target_dir(target_id)/'cache/analysis/native-failure.json'


def _cache_error(operation,error):
    return f'Native failure cache {operation} unavailable: {" ".join(str(error).split())[:400]}'


def previous_failure(workspace,target_id,identity,recipe=None,manifest=None,automatic=None):
    if recipe is not None and (recipe.get('checks',{}).get('native')!='auto' or not recipe['symbols']):return None
    # Publication is authoritative even when an older disposable refusal could not be deleted.
    if (automatic or {}).get('identity')==identity and any(s['id']=='compiler' for s in (manifest or {}).get('sources',[])):
        return None
    path=failure_path(workspace,target_id)
    try:
        with path.open('rb') as stream:raw=stream.read(8193)
    except FileNotFoundError:return None
    except OSError as error:return {'cache_error':_cache_error('read',error)+'; recomputing.'}
    if len(raw)>8192:return {'cache_error':'Native failure cache exceeds its size limit; recomputing.'}
    try:value=json.loads(raw)
    except (ValueError,UnicodeError):return {'cache_error':'Native failure cache is invalid; recomputing.'}
    if not isinstance(value,dict) or value.get('version')!=2 or value.get('kind')!='native-source-diagnostics' or not isinstance(value.get('error'),str) or \
            not isinstance(value.get('identity'),str):
        return {'cache_error':'Native failure cache is invalid; recomputing.'}
    return value if value['identity']==identity else None


def remember_failure(workspace,target_id,recipe,identity,error):
    if recipe.get('checks',{}).get('native')!='auto' or not recipe['symbols']:return
    from .compiler import NativeDiagnosticsError
    if not isinstance(error,NativeDiagnosticsError) or not error.inputs or error.copy_root is None:return
    from . import monitor,graph
    try:
        target=workspace.load(target_id)
        current=monitor.inspect(workspace,target,
                                read_json(workspace.latest(target_id)/'manifest.json'),recipe)
    except (OSError,LaniakeaError,ValueError) as refusal:
        return _cache_error('validation',refusal)
    if current['identity']!=identity:return
    # Unknown/new external inputs are not part of this identity and cannot justify persistent refusal.
    for name,value in error.inputs.items():
        relative=graph._relative(name,error.copy_root)
        key=relative if relative is not None else 'external:'+name
        if current['inputs'].get(key)!=value:return
    try:
        write_json(failure_path(workspace,target_id),{'version':2,'kind':'native-source-diagnostics',
                                                    'identity':identity,'error':str(error)[:1500]})
    except OSError as refusal:return _cache_error('write',refusal)


def clear_failure(workspace,target_id,recipe):
    if recipe.get('checks',{}).get('native')=='auto' and recipe['symbols']:
        try:failure_path(workspace,target_id).unlink(missing_ok=True)
        except OSError as error:return _cache_error('cleanup',error)


def snapshot_outcome(manifest,choices,enabled):
    if choices is None:return
    manifest['coverage'].setdefault('acquisition',{})['native']={
        'provider':'compiler','mode':{'auto':'auto','on':'required','off':'off'}[choices['native']],
        'status':'completed' if enabled else 'disabled' if choices['native']=='off' else 'incomplete',
        'code':'complete' if enabled else 'explicit_off' if choices['native']=='off' else 'not_recorded'}


def from_manifest(manifest):
    outcome=manifest['coverage'].get('acquisition',{}).get('source-duplication')
    if not outcome and 'health' in manifest:
        raise LaniakeaError('legacy health intent is ambiguous; choose checks explicitly before analysis')
    return {'symbols':any(s['id']=='compiler' for s in manifest['sources']),
            'health':{key:outcome[key] for key in ('mode','prefixes','minimum_tokens','heap_mib') if key in outcome}
                     if outcome else {'mode':'off'}}


def metadata(manifest,request=None):
    recipe=request['recipe'] if request else from_manifest(manifest)
    return {'recipe':recipe,'checks':rows(manifest,recipe)}
