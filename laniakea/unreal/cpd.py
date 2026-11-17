# SPDX-License-Identifier: AGPL-3.0-or-later
"""Explicit strict source-clone observations over an isolated, bounded authored-source corpus."""

import hashlib
import os
import subprocess
from pathlib import Path
from time import perf_counter

from .. import LaniakeaError, health
from ..workspace import read_json, write_json
from . import cpd_tools, source_inputs

DEFAULT_MINIMUM=100


class Failure(LaniakeaError):
    def __init__(self, message, code, status='failed'):
        super().__init__(message)
        self.code,self.status=code,status


class Changed(LaniakeaError):
    """The observed corpus was superseded; never publish it as a provider failure."""


def options_for(options):
    try:scopes=health.prefixes(options.get('prefixes',[]))
    except ValueError as error:raise LaniakeaError(str(error)) from error
    minimum=options.get('minimum_tokens',DEFAULT_MINIMUM)
    if type(minimum) is not int or not 1<=minimum<=100000:raise LaniakeaError('invalid health collection threshold')
    return {**options,'prefixes':scopes,'minimum_tokens':minimum}


def prepare(options):
    options=options_for(options)
    return {**options,'installed':cpd_tools.load(options['tools'])}


def extract(target,run,graph,exported,options,previous=None):
    start=perf_counter();run=Path(run)
    if 'installed' not in options:options=prepare(options)
    scopes=options['prefixes'];minimum=options['minimum_tokens'];tool=options['installed']
    project=Path(target['project_file'])
    modules={n['label']:n['id'] for n in graph['nodes'] if n['level']=='module' and not n['boundary'] and n['status']=='in-target'}
    directories=sorted([(Path(m['Directory']).absolute(),modules[name]) for name,m in exported['Modules'].items()
                        if name in modules],key=lambda entry:len(entry[0].parts),reverse=True)
    selected={};paths={};total_bytes=0
    for relative,path in source_inputs.files(project,scopes,target.get('excludes',[])).items():
        owner=next((identity for directory,identity in directories if path.is_relative_to(directory)),None)
        if owner is None:continue
        size=path.stat().st_size;total_bytes+=size
        if size>16*1024*1024 or total_bytes>1024*1024*1024:raise Failure('CPD source size limit reached; narrow --health-scope','source_limit','incomplete')
        selected[relative]={'owner':owner,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()};paths[relative]=path
    if not selected or len(selected)>50000:raise Failure('CPD needs 1-50000 authored files in selected in-target project modules','corpus_limit','incomplete')
    data={'version':1,'provider':{'id':'pmd-cpd','version':cpd_tools.VERSION,'identity':tool['identity']},
          'minimum_tokens':minimum,'scope':{'prefixes':scopes,'modules':sorted({f['owner'] for f in selected.values()})},
          'files':selected,'groups':[]}
    reused=False
    if previous and 'health' in previous:
        previous_run=run.parent/previous['run']
        # The old artifact belongs to its old graph. Changed module membership is a cache miss, not corruption.
        try:old=health.load(previous_run,previous)
        except (OSError,ValueError,KeyError,TypeError) as error:
            raise LaniakeaError(f'Previous health artifact is invalid; inspect {previous_run}: {error}') from error
        if {k:v for k,v in old.items() if k!='groups'}=={k:v for k,v in data.items() if k!='groups'}:
            data=old;reused=True
    if not reused:
        folder=run/'health-cpd';copies=folder/'source';copies.mkdir(parents=True)
        mapping={}
        for relative,path in paths.items():
            raw=path.read_bytes()
            if hashlib.sha256(raw).hexdigest()!=selected[relative]['sha256']:
                raise Changed(f'CPD source changed during collection: {relative}; retry')
            # PMD's preprocessor lexer requires a terminating newline. Add it only to the isolated tool input;
            # original bytes still own freshness and evidence hashes, and existing token coordinates do not move.
            destination=copies/relative;destination.parent.mkdir(parents=True,exist_ok=True)
            destination.write_bytes(raw if not raw or raw.endswith(b'\n') else raw+b'\n')
            mapping[os.path.normcase(str(destination.resolve()))]=relative
        request=folder/'request.json';output=folder/'observations.json'
        write_json(request,{'files':list(mapping),'minimum_tokens':minimum})
        command=[str(tool['java']),'-Xmx1g','-Djava.io.tmpdir='+str(folder.resolve()),'-cp',
                 os.pathsep.join([str(tool['directory']/'classes'),str(tool['directory']/'lib/*')]),
                 'CpdBridge',str(request.resolve()),str(output.resolve())]
        log=folder/'cpd.log'
        try:
            with log.open('wb') as stream:
                result=subprocess.run(command,stdout=stream,stderr=subprocess.STDOUT,timeout=900,
                                      creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0),
                                      env={**os.environ,'TEMP':str(folder.resolve()),'TMP':str(folder.resolve())})
            if result.returncode:raise Failure(f'CPD failed ({result.returncode}); no partial report published; see {log}','provider_exit')
        except (OSError,subprocess.TimeoutExpired) as error:
            raise Failure(f'CPD could not finish: {error}; see {log}','timeout' if isinstance(error,subprocess.TimeoutExpired) else 'process_start') from error
        if output.stat().st_size>health.MAX_BYTES:raise Failure('CPD output limit reached; narrow --health-scope','output_limit','incomplete')
        result=read_json(output)
        if {os.path.normcase(str(Path(p).resolve())) for p in result['processed']}!=set(mapping):
            raise Failure(f'CPD did not process the complete requested corpus; see {log}','partial_corpus','incomplete')
        for group in result['groups']:
            for occurrence in group['occurrences']:
                key=os.path.normcase(str(Path(occurrence['path']).resolve()))
                if key not in mapping:raise LaniakeaError('CPD returned a source outside its requested snapshot')
                occurrence['path']=mapping[key]
            group['occurrences'].sort(key=lambda o:tuple(o[k] for k in ('path','line','column','end_line','end_column')))
        data['groups']=result['groups']
    # Recheck membership and content too: an edit during analysis must never be published as current.
    current=source_inputs.files(project,scopes,target.get('excludes',[]))
    current={p:path for p,path in current.items() if any(path.is_relative_to(d) for d,_ in directories)}
    if set(current)!=set(paths) or any(hashlib.sha256(p.read_bytes()).hexdigest()!=selected[k]['sha256'] for k,p in current.items()):
        raise Changed('CPD corpus changed during analysis; previous map retained, retry')
    marker=health.write(run,data,graph['nodes'])
    return marker,{'seconds':perf_counter()-start,'reused':reused,'files':len(selected),'groups':len(data['groups'])}
