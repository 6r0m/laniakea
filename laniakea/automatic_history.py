# SPDX-License-Identifier: AGPL-3.0-or-later
"""Reclaim only tagged, disposable background runs; manual history and user stores have no cleanup owner here."""

from pathlib import Path
import shutil
import re

from .workspace import WriterBusy,read_json,writer_lock


def prune(workspace,target,protected):
    try:
        with writer_lock(workspace.target_dir(target)/'views/writer.lock','map index is being prepared'):
            return _prune(workspace,target,protected)
    except WriterBusy:return {'deferred':'map index is being prepared'}


def _prune(workspace,target,protected):
    base=workspace.target_dir(target)/'runs';root=base.resolve();tagged=[]
    for path in base.iterdir():
        if path.resolve().parent!=root or not path.is_dir():continue
        marker=path/'automatic.json'
        if not marker.is_file():continue
        value=read_json(marker)
        if value.get('version')==1:tagged.append((path,value))
    latest=workspace.latest(target)
    keep=set(protected['runs'])|{path.name for path,_ in sorted(tagged,key=lambda item:item[0].name)[-2:]}
    if latest:keep.add(latest.name)
    views=set(protected['views'])|{value.get('view') for path,value in tagged if path.name in keep}
    removed=[]
    for path,value in tagged:
        if path.name in keep:continue
        view=value.get('view')
        if view and Path(view).name==view and view not in views:
            cache=workspace.target_dir(target)/'views'/view
            if cache.is_dir() and cache.resolve().parent==(workspace.target_dir(target)/'views').resolve():
                shutil.rmtree(cache)
        shutil.rmtree(path);removed.append(path.name)
    cache_root=workspace.target_dir(target)/'views'
    for path in cache_root.iterdir():
        if re.fullmatch(r'[0-9a-f]{64}-[0-9a-f]{16}\.auto-(partial|failed)-[0-9a-f]{32}',path.name) and \
                path.is_dir() and path.resolve().parent==cache_root.resolve():
            shutil.rmtree(path)
    diagnostics=workspace.root/'tmp/monitor'/target
    if diagnostics.is_dir():
        folders=sorted((path for path in diagnostics.iterdir() if path.is_dir()),key=lambda path:path.stat().st_mtime_ns)
        for path in folders[:-4]:
            if path.resolve().parent==diagnostics.resolve() and str(path)!=protected.get('diagnostic'):shutil.rmtree(path)
    return {'removed':removed}
