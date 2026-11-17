# SPDX-License-Identifier: AGPL-3.0-or-later
"""Disposable background preparation. Only the controller holds the lock and publication authority."""

from pathlib import Path
import sys
import traceback

from . import AnalysisBusy,LaniakeaError,map_index,pipeline,profiles,schema
from .workspace import Workspace,read_json,write_json


def execute(workspace,target_id,operation,recipe=None):
    if operation=='cleanup':
        from .automatic_history import prune
        return prune(workspace,target_id,recipe)
    target=workspace.load(target_id)
    if not target:raise LaniakeaError('monitor target is not registered')
    run=workspace.latest(target_id);manifest=read_json(run/'manifest.json')
    profile=profiles.get(target['profile'])
    if operation=='discover':return profile.monitor_roots(workspace,target,manifest)
    if operation=='probe':
        recipe,result=profile.monitor_inputs(workspace,target,manifest,recipe)
        automatic=read_json(run/'automatic.json') if (run/'automatic.json').is_file() else {}
        return {**result,'recipe':recipe,
                'previous_identity':automatic.get('identity'),
                'needs_initial_refresh':not automatic.get('identity')}
    if operation=='prepare':
        schema.validate(manifest,'manifest')
        view,validation=map_index.validation(workspace,target_id,run)
        return {'run':run.name,'view':view.root.name,'validation':validation}
    if operation!='stage':raise ValueError('unknown monitor operation')
    recipe,before=profile.monitor_inputs(workspace,target,manifest,recipe)
    staged=None
    try:
        staged,candidate=pipeline.stage(workspace,target,symbols=recipe['symbols'],health_options=recipe['health'],automatic=True)
        view,validation=map_index.validation(workspace,target_id,staged)
        _,after=profile.monitor_inputs(workspace,target,candidate,recipe)
        _,settled=profile.monitor_inputs(workspace,target,manifest,recipe)
        if before['identity']!=settled['identity']:
            raise LaniakeaError('inputs changed during background analysis; candidate was not published')
        profile.validate_monitor_inputs(target,candidate)
        write_json(staged/'automatic.json',{'version':1,'identity':after['identity'],'view':view.root.name})
        return {**after,'recipe':recipe,'candidate':staged.name,'view':view.root.name,'validation':validation}
    except BaseException:
        if staged is not None and staged.exists():workspace.fail_run(staged)
        raise


def main(path):
    path=Path(path);request=read_json(path)
    workspace=Workspace(request['workspace']);result_path=path.with_name('result.json')
    try:
        recipe=request.get('recipe')
        if request['operation']=='cleanup':recipe={**recipe,'diagnostic':str(path.parent)}
        result=execute(workspace,request['target'],request['operation'],recipe)
    except BaseException as error:
        # Only the profile's typed contention result is retryable. Never classify arbitrary failure prose.
        traceback.print_exc()
        write_json(result_path,{'status':'busy' if isinstance(error,AnalysisBusy) else 'failed','error':str(error)})
        return 1
    write_json(result_path,{'status':'completed','result':result})
    return 0


if __name__=='__main__':sys.exit(main(sys.argv[1]))
