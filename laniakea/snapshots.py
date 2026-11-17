# SPDX-License-Identifier: AGPL-3.0-or-later
"""Immutable HTTP read contexts. Exact-reference URLs never change meaning after publication."""

from contextlib import contextmanager
import copy
from pathlib import Path
import threading

from . import LaniakeaError,map_index
from .review_store import Review
from .workspace import read_json


class LazyReview:
    def __init__(self,workspace,target,run,view):
        self.args=(workspace,target,run,view);self.owner=None;self.lock=threading.Lock()

    def get(self):
        with self.lock:
            if self.owner is None:self.owner=Review(*self.args)
            return self.owner

    @property
    def current(self):return self.owner.current if self.owner else None

    def page(self,query):return self.get().page(query)
    def update(self,request):return self.get().update(request)
    def __getattr__(self,name):return getattr(self.get(),name)


class Context:
    def __init__(self,workspace,target,run,view,entry):
        self.run=run;self.view=view;self.entry=entry;self.readers=0
        self.review=LazyReview(workspace,target,run,view)
        self.node_ids=None;self.lock=threading.Lock()


class Snapshots:
    def __init__(self,workspace,index,views):
        self.workspace=workspace;self.index=index;self.lock=threading.RLock()
        self.contexts={};self.baseline={};self.newest={}
        for entry in index:
            target=entry['id'];run=workspace.target_dir(target)/'runs'/entry['run']
            context=Context(workspace,target,run,views[target],copy.deepcopy(entry))
            self.contexts[target,run.name]=context;self.baseline[target]=run.name;self.newest[target]=run.name

    def prepare(self,target,run,view_name,validation=None):
        if Path(view_name).name!=view_name:raise LaniakeaError('invalid read-index context')
        if validation is None:
            _,validation=map_index.validation(self.workspace,target,run)
        view=map_index.from_validation(self.workspace,target,run,view_name,validation)
        manifest=read_json(run/'manifest.json')
        entry=next(item for item in self.index if item['id']==target)
        request=self.workspace.request_at(target,run)
        roots=request['target'].get('roots',{}) if request else entry['roots']
        return Context(self.workspace,target,run,view,{**entry,'run':manifest['run'],
                        'acquisition':manifest['coverage'].get('acquisition',{}),
                        'roots':{**roots,**manifest.get('roots',{})}})

    def admit(self,target,run,view_name,prepared=None,validation=None):
        with self.lock:
            context=prepared or self.prepare(target,run,view_name,validation)
            context.run=run;context.review.args=(self.workspace,target,run,context.view)
            base=f'/snapshot/{target}/{run.name}'
            context.entry.update(data_url=base+'/data/',layout_url=base+'/layout/',
                map_url=base+'/map/topology.json',references_url=base+'/map/references',review_url=base+'/map/review',
                stale=False,changed=[],changed_count=0,freshness='checked' if prepared is not None else 'unknown')
            self.contexts[target,run.name]=context;self.newest[target]=run.name
            self._trim(target)
            return copy.deepcopy(context.entry)

    def _trim(self,target):
        keys=sorted((key for key in self.contexts if key[0]==target),key=lambda key:key[1])
        protected={self.baseline[target],self.newest[target],*(key[1] for key in keys[-2:])}
        for key in keys:
            if key[1] not in protected and not self.contexts[key].readers:del self.contexts[key]

    def latest(self,target):
        with self.lock:
            context=self.contexts[target,self.newest[target]]
            return copy.deepcopy(context.entry)

    def protected(self,target):
        with self.lock:
            return {'runs':[key[1] for key in self.contexts if key[0]==target],
                    'views':[value.view.root.name for key,value in self.contexts.items() if key[0]==target]}

    @contextmanager
    def route(self,path):
        parts=path.split('/',5)
        if len(parts)!=6 or parts[1]!='snapshot':
            yield None,path;return
        _,_,target,run,kind,rest=parts
        with self.lock:
            context=self.contexts.get((target,run))
            if context is not None:context.readers+=1
        try:
            if context is None or kind not in {'data','map','layout'}:
                yield False,path
            else:
                prefix=f'/map/{target}/{context.view.root.name}/' if kind=='map' else f'/{kind}/{target}/'
                yield context,prefix+rest
        finally:
            if context is not None:
                with self.lock:context.readers-=1;self._trim(target)
