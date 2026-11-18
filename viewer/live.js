// SPDX-License-Identifier: AGPL-3.0-or-later
// Stage immutable generations; scene, positions and Review retain ownership of user state.
'use strict';

function targetData(target,path) { return (target.data_url||`/data/${encodeURIComponent(target.id)}/`)+path; }
function liveGeneration(target) { return JSON.stringify([target?.id,target?.run,target?.map_identity]); }

function liveBlockReason() {
  if(state.drag||state.labelDrag||state.pointerDown||state.gestureActive||state.framing||state.wheelFrame||
    state.zoomFrame||state.viewportFrame)return 'Finish moving the map';
  if(unsavedPositionCaches.size)return 'Waiting for positions to save';
  if(state.review?.saving||[...document.querySelectorAll('[name="review-reason"]')]
    .some(input=>input.value!==input.defaultValue))return 'Finish or clear the decision draft';
  if($('graph').getAttribute?.('aria-busy')==='true')return 'Waiting for navigation';
  return '';
}

function liveScope(map,old,id) {
  while(id&&!map.nodes.has(id))id=old.viewParents.get(id)||old.nodes.get(id)?.parent;
  return id||map.root;
}

class LiveUpdates {
  constructor(){this.timer=null;this.running=false;this.prepared=null;this.failed=null;this.message='';this.client=crypto.randomUUID();}
  start(){
    this.stopped=false;this.tick();
  }
  positionControls(){
    if($('live-controls').open)$('live-controls').style.setProperty('--live-top',
      ($('live-summary').getBoundingClientRect().bottom+8)+'px');
  }
  stop(){this.stopped=true;clearTimeout(this.timer);this.controller?.abort();this.prepared=null;}
  async control(action){
    if(!state.startup.monitoring)return;
    this.failed=null;this.message='';
    try{
      const response=await fetch('/monitor/control',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action,target:state.target.id})});
      if(!response.ok)throw Error(await response.text());
      await this.tick();
    }catch(error){this.message=error.message;this.render();}
  }
  render(){
    const current=this.status?.targets.find(t=>t.id===state.target?.id),enabled=Boolean(state.startup?.monitoring);
    const ready=liveGeneration(current?.ready)!==liveGeneration(state.target);
    const blocked=ready?liveBlockReason():'';
    const acquisition=current?.ready?.acquisition||state.target?.acquisition||{};
    const missing=[...new Set(Object.values(acquisition).map(c=>c.status))]
      .filter(status=>['failed','incomplete','unavailable'].includes(status)).join(', ');
    const summary=(this.message?'Live: needs attention':!enabled?'Saved only':
      !current?.active?'Saved / not monitored':blocked?'Update waiting':`Live: ${current.state}`)+
      (missing?` / source ${missing}`:'');
    if($('live-summary').textContent!==summary)$('live-summary').textContent=summary;
    $('live-summary').setAttribute('data-attention',String(Boolean(missing||this.message)));
    const active=(this.status?.targets||[]).filter(t=>t.active).map(t=>t.id).join(', ');
    const description=[enabled?`Monitoring: ${active||'none'}`:'Monitoring off; open with --watch to enable.',
      blocked,this.message,current?.error,current?.degraded,
      ...Object.values(acquisition).map(c=>`Latest source analysis: ${c.status} (${c.code})`)].filter(Boolean).join('. ');
    if($('live-status').textContent!==description)$('live-status').textContent=description;
    $('live-toggle').disabled=!enabled;
    $('live-toggle').textContent=current?.active?'Pause this target':'Monitor this target';
    $('live-toggle').onclick=()=>this.control(current?.active?'pause':'activate');
    $('live-retry').disabled=!enabled||!current?.active;
    $('live-retry').onclick=()=>this.control('retry');
    if(current?.state==='fresh'&&current.ready?.run===state.target.run&&state.target.freshness!=='checked'){
      state.target.freshness='checked';renderCoverage();
    }
  }
  async stage(target,signal){
    const [manifest,index]=await Promise.all([getJson(targetData(target,'manifest.json'),{signal}),
      getJson(targetData(target,'scopes/index.json'),{signal})]);
    if(manifest.run!==target.run)throw Error('Ready snapshot does not match its manifest');
    const same=target.map_identity&&target.map_identity===state.target.map_identity&&
      JSON.stringify(manifest.overview)===JSON.stringify(state.manifest.overview)&&
      JSON.stringify(manifest.edge_types)===JSON.stringify(state.manifest.edge_types);
    const universe=same?state.universe:new Universe(await getJson(target.map_url,{signal}),manifest);
    const layouts=await getJson((target.layout_url||`/layout/${encodeURIComponent(target.id)}/`)+manifest.entry,{signal});
    return {target,manifest,index,universe,layouts};
  }
  adopt(prepared){
    const {target,manifest,index,universe,layouts}=prepared,old=state.universe;
    const sameGeometry=universe===old&&JSON.stringify(layouts)===JSON.stringify(state.positionCache.layouts);
    const pan={...state.cy.pan()},zoom=worldZoom(),scope=liveScope(universe,old,state.scopeShard.scope);
    const selection=state.selection,open=!$('details').hidden,tab=state.inspector?.active;
    const reviewOpen=!$('review').hidden,reviewEnabled=state.review?.enabled;
    const expanded=[...old.expanded];
    renderDetails(null);state.referencePages?.clear();state.referenceEpoch=(state.referenceEpoch||0)+1;
    state.navigation++;state.detailsKey=null;closeFindResults();state.findCandidates=[];state.elsewhere=null;
    Object.assign(state,{target,manifest,index,indexLookup:new Map(index.nodes.map(n=>[n.id,n])),universe,
      positionCache:new PositionCache((target.layout_url||`/layout/${encodeURIComponent(target.id)}/`)+manifest.entry,layouts),
      referencePages:referenceReader(target,universe)});
    state.targets=state.targets.map(t=>t.id===target.id?target:t);
    state.review?.reset(target);if(state.review){state.review.enabled=reviewEnabled;state.review.status();}
    universe.expanded=new Set(expanded.filter(id=>universe.nodes.has(id)&&universe.isGroup(id)));
    universe.expanded.add(universe.root);universe.reveal(scope);
    setSceneScope(scope);
    if(!sameGeometry){layout({fit:false});setWorldViewport(zoom,pan);}
    refreshMap();
    renderBanner();renderCoverage();renderCrumbs();
    if(selection){
      const item=selection.projectContext?{...universe.nodes.get(universe.root),projectContext:true}:
        selection.level?universe.nodes.get(selection.id):selection.source&&selection.target?
          ConnectionTrace.pair(state.shard,selection.source,selection.target):null;
      if(item){
        const requested=item.kind==='pair'?{...item,signature:ConnectionTrace.signature(item),pairInspection:true}:item;
        renderDetails(requested,{reopen:open});if(tab)state.inspector?.select(tab);
      }
    }
    if(!open)togglePanel('details',false);
    if(reviewOpen)state.review?.panel(true);
    if(state.review?.enabled)state.review.load();
    if($('find').value)find().catch(reportError);
    rememberView();
    this.message=scope===this.previousScope?'':'Previous focus was removed; showing its surviving parent';
  }
  async tick(){
    if(this.running||this.stopped||!state.target)return;
    clearTimeout(this.timer);this.running=true;
    const target=state.target,nav=state.navigation;
    this.controller=new AbortController();
    try{
      this.status=await getJson('/monitor/status?'+new URLSearchParams({target:target.id,run:target.run,client:this.client}),
        {signal:this.controller.signal});
      if(this.prepared?.target.id!==state.target.id)this.prepared=null;
      const current=this.status.targets.find(t=>t.id===state.target.id),ready=current?.ready;
      if(ready&&liveGeneration(ready)!==liveGeneration(state.target)&&this.failed!==liveGeneration(ready)&&
          !document.hidden&&!liveBlockReason()){
        if(liveGeneration(this.prepared?.target)!==liveGeneration(ready)){
          const cache=state.positionCache,revision=cache.revision;
          this.prepared={...await this.stage(ready,this.controller.signal),cache,revision};
        }
        if(this.prepared.cache!==state.positionCache||this.prepared.revision!==state.positionCache.revision){
          this.prepared=null;return;
        }
        if(state.target===target&&state.navigation===nav&&!liveBlockReason()){
          this.previousScope=state.scopeShard.scope;this.adopt(this.prepared);this.prepared=null;
        }
      }
    }catch(error){
      if(error.name!=='AbortError'&&state.target===target&&state.navigation===nav){
        this.message=`Update not applied: ${error.message}. Retry when ready.`;
        const ready=this.status?.targets.find(t=>t.id===state.target?.id)?.ready;
        if(ready)this.failed=liveGeneration(ready);
      }
    }finally{
      this.running=false;if(!this.stopped){this.render();this.timer=setTimeout(()=>this.tick(),document.hidden?10000:1500);}
    }
  }
}
