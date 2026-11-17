# SPDX-License-Identifier: AGPL-3.0-or-later
"""Optional acquisition policy; compiler/graph failures remain outside this boundary."""

import hashlib
import json
from pathlib import Path

from .. import LaniakeaError
from . import cpd, cpd_tools, source_inputs


def prepare(options):
    options=cpd.options_for({'mode':'off'} if options is None else options)
    mode=options.get('mode','required')
    if mode not in {'auto','off','required'}:
        raise LaniakeaError('invalid source-health acquisition mode')
    options['mode']=mode
    outcome={'provider':'pmd-cpd','mode':mode,'prefixes':options['prefixes'],
             'minimum_tokens':options['minimum_tokens'],'heap_mib':options['heap_mib'],'collection_version':cpd.COLLECTION_VERSION,
             'status':'disabled','code':'explicit_off'}
    if mode=='off':return options,outcome
    try:
        try:Path(options['tools']).stat()
        except FileNotFoundError:
            raise cpd.Failure('CPD installation missing; run setup-health','tool_missing','unavailable') from None
        except OSError as error:
            raise cpd.Failure('CPD installation could not be inspected','tool_io') from error
        options=cpd.prepare(options)
    except cpd_tools.ToolError as error:
        if mode=='required':raise
        outcome.update(status='failed',code='tool_invalid')
    except cpd.Failure as error:
        if mode=='required':raise
        outcome.update(status=error.status,code=error.code)
    else:
        outcome.update(status='pending',code='prepared')
    return options,outcome


def _inputs(target,options):
    try:
        return source_inputs.fingerprints(target['project_file'],prefixes=options['prefixes'],
                                         excludes=target.get('excludes',[]))
    except FileNotFoundError as error:
        raise cpd.Changed('CPD source disappeared during input verification; retry') from error
    except OSError as error:
        raise cpd.Failure('CPD source could not be read','source_io') from error


def collect(target,run,built,exported,manifest,prepared,previous):
    options,outcome=prepared
    try:
        if outcome['status']=='pending':
            before=_inputs(target,options)
            if any(manifest['inputs'][key]!=value for key,value in before.items() if key in manifest['inputs']):
                raise cpd.Changed('Mandatory inputs changed before CPD acquisition; retry the complete extraction')
            marker,result=cpd.extract(target,run,built,exported,options,previous)
            after=_inputs(target,options)
            if before!=after:raise cpd.Changed('CPD inputs changed during analysis; retry')
            manifest['health']=marker
            manifest['inputs'].update(before)
            manifest['sources'].append({'id':'source-health','name':'PMD CPD strict C++ token clones','version':cpd_tools.VERSION})
            manifest['timings_seconds']['health_cpd']=result['seconds']
            manifest['coverage']['counts'].update({'health.files':result['files'],'health.groups':result['groups'],
                                                   'health.reused':int(result['reused'])})
            outcome.update(status='completed',code='complete',reused=bool(result['reused']),
                           tool_identity=options['installed']['identity'],artifact_sha256=marker['sha256'],
                           input_identity=hashlib.sha256(json.dumps(before,sort_keys=True).encode()).hexdigest())
    except cpd.Failure as error:
        if options['mode']=='required':raise
        outcome.update(status=error.status,code=error.code)
    coverage=manifest['coverage']
    coverage['acquisition']={'source-duplication':outcome}
    if outcome['status']=='completed':
        coverage['analysed'].append('strict authored-source C++ token duplication in the recorded corpus')
        coverage['not_analysed'].append('source clones do not prove semantic equivalence or a SOLID violation')
    else:
        coverage['not_analysed'].append(f"source duplication: {outcome['status']} ({outcome['code']}); see source-health setup/coverage")
