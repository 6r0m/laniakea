// SPDX-License-Identifier: AGPL-3.0-or-later
// Stage immutable generations; scene, positions and Review retain ownership of user state.
'use strict';

function targetData(target,path) { return (target.data_url||`/data/${encodeURIComponent(target.id)}/`)+path; }
function liveGeneration(target) { return JSON.stringify([target?.id,target?.run,target?.map_identity]); }

function liveBlockReason() {
  if(state.drag||state.labelDrag||state.pointerDown||state.gestureActive||state.framing||state.wheelFrame||
    state.zoomFrame||state.viewportFrame)return 'Finish moving the map';
  if(unsavedPositionCaches.size)return 'Waiting for positions to save';
  if(state.analysis?.dirty())return 'Finish or reload the check choices';
  if(state.review?.saving||[...document.querySelectorAll('[name="review-reason"]')]
    .some(input=>input.value!==input.defaultValue))return 'Finish or clear the decision draft';
  if($('graph').getAttribute?.('aria-busy')==='true')return 'Waiting for navigation';
  return '';
}

function liveScope(map,old,id) {
  while(id&&!map.nodes.has(id))id=old.viewParents.get(id)||old.nodes.get(id)?.parent;
  return id||map.root;
}

function renderedOverrides(cy) {
  // Element JSON omits bypass styles. Preserve only overrides, leaving stylesheet rules reactive.
  // The pinned renderer's parsed properties retain mappings; the native regression covers this boundary.
  return cy.elements().map(element=>{
    const overrides={};
    for(const name of Object.keys(element.style())){
      const property=element.pstyle(name);
      if(property?.bypass)overrides[property.name]=property.mapping?
        typeof property.mapping.value==='function'?property.mapping.value:property.mapping.strValue:property.strValue;
    }
    return [element.id(),overrides];
  });
}

// Keep the previous native scene and DOM nodes until the synchronous render commits.
// Recovery deliberately does not call layout or refreshMap: either may be the failing operation.
function adoptionCheckpoint() {
  const previous={...state},scene=state.cy.json(),overrides=renderedOverrides(state.cy);
  const url=location.href,entry=history.state,title=document.title;
  const focus=document.activeElement;
  const roots=['details','review','filters','analysis','toggle-analysis','banner','coverage','crumbs','find-results','find-hint','scope-summary',
    'position-status','source-layout-status','layout-hint','map-tooltip','map-empty','hover-card','icon-key','review-legend',
    'toggle-review','toggle-details','toggle-configuration','configuration-legend','up','arrange-files','find','graph'];
  const dom=roots.map(id=>{
    const node=$(id);
    return {node,children:id==='graph'?null:[...node.childNodes],attrs:[...node.attributes].map(a=>[a.name,a.value]),
      scroll:[node.scrollLeft,node.scrollTop],onclick:node.onclick};
  });
  return {
    previous,
    begin(){
      // Review's fixed controls belong to its generation; retain the old handlers on detached nodes.
      $('review').replaceChildren(...[...$('review').childNodes].map(node=>node.cloneNode(true)));
      for(const id of ['review-items','review-pager','review-checks'])$(id).replaceChildren();
    },
    restore(){
      for(const key of Object.keys(state))if(!(key in previous))delete state[key];
      Object.assign(state,previous);state.framing=true;
      try{state.cy.batch(()=>{
        state.cy.elements().removeData().removeStyle();state.cy.json(scene);
        for(const [id,style] of overrides)state.cy.getElementById(id).style(style);
      });}
      finally{state.framing=previous.framing;}
      for(const {node,children,attrs,scroll,onclick} of dom){
        if(children)node.replaceChildren(...children);
        for(const attr of [...node.attributes])node.removeAttribute(attr.name);
        for(const [name,value] of attrs)node.setAttribute(name,value);
        node.scrollLeft=scroll[0];node.scrollTop=scroll[1];node.onclick=onclick;
      }
      document.title=title;history.replaceState(entry,'',url);
      if(focus?.isConnected)focus.focus({preventScroll:true});
      // Native elements removed by a failed projection may have been re-created during recovery.
      const hover=previous.hoverTarget;
      state.hoverFrame=null;state.connectionHits=null;
      state.hoverTarget=hover?{...hover,element:hover.element===state.cy?state.cy:state.cy.getElementById(hover.element.id())}:null;
      if(previous.hoverFrame&&state.hoverTarget)schedulePreview(state.hoverTarget.element,hover.pointer);
    }
  };
}

class LiveUpdates {
  constructor(){this.timer=null;this.running=false;this.prepared=null;this.failed=null;this.message='';this.client=crypto.randomUUID();}
  start(){
    this.stopped=false;this.tick();
  }
  stop(){this.stopped=true;clearTimeout(this.timer);this.controller?.abort();this.prepared=null;}
  async control(action){
    if(!state.startup.monitoring)return;
    this.failed=null;this.message='';
    try{
      await this.request({action,target:state.target.id});
      await this.tick();
    }catch(error){this.message=error.message;this.render();}
  }
  async request(body){
    const response=await fetch('/monitor/control',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!response.ok)throw Error(await response.text());
    return response.json();
  }
  render(){
    const current=this.status?.targets.find(t=>t.id===state.target?.id);
    state.analysis?.render(this.status,this.message);
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
    const {target,manifest,index,layouts}=prepared,old=state.universe;
    let universe=prepared.universe;
    const sameGeometry=universe===old&&JSON.stringify(layouts)===JSON.stringify(state.positionCache.layouts);
    if(universe===old&&!sameGeometry){universe=new Universe(old.graph,manifest);universe.paged=old.paged;}
    const pan={...state.cy.pan()},zoom=worldZoom(),scope=liveScope(universe,old,state.scopeShard.scope);
    const selection=state.selection,open=!$('details').hidden,tab=state.inspector?.active;
    const reviewOpen=!$('review').hidden,reviewEnabled=state.review?.enabled;
    const expanded=[...old.expanded];
    const checkpoint=adoptionCheckpoint();
    try{
      checkpoint.begin();
      Object.assign(state,{referenceObservers:[],selection:null,inspector:null,shard:{...state.shard},
        referenceEpoch:(state.referenceEpoch||0)+1});
      state.navigation++;state.detailsKey=null;closeFindResults();state.findCandidates=[];state.elsewhere=null;
      Object.assign(state,{target,manifest,index,indexLookup:new Map(index.nodes.map(n=>[n.id,n])),universe,
        positionCache:new PositionCache((target.layout_url||`/layout/${encodeURIComponent(target.id)}/`)+manifest.entry,layouts),
        referencePages:referenceReader(target,universe)});
      state.targets=state.targets.map(t=>t.id===target.id?target:t);
      state.review=new ArchitectureReview();state.review.reset(target);state.review.enabled=reviewEnabled;
      state.review.ack=checkpoint.previous.review?.ack||false;$('review-ack').checked=state.review.ack;state.review.status();
      if(!sameGeometry){
        universe.expanded=new Set(expanded.filter(id=>universe.nodes.has(id)&&universe.isGroup(id)));
        universe.expanded.add(universe.root);universe.reveal(scope);
      }
      setSceneScope(scope);
      if(!sameGeometry){layout({fit:false});setWorldViewport(zoom,pan);}
      refreshMap();
      renderDetails(null);
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
      rememberView();
      this.message=scope===this.previousScope?'':'Previous focus was removed; showing its surviving parent';
    }catch(error){
      if(state.referencePages!==checkpoint.previous.referencePages)state.referencePages?.clear();
      if(state.review!==checkpoint.previous.review)state.review?.cancel();
      for(const observer of state.referenceObservers||[])observer.disconnect();
      try{checkpoint.restore();}catch(recovery){
        throw Object.assign(Error(`${error.message}; recovery failed: ${recovery.message}. Reload the map`),{recoveryFailed:true});
      }
      throw error;
    }
    checkpoint.previous.referencePages?.clear();checkpoint.previous.review?.cancel();
    for(const observer of checkpoint.previous.referenceObservers||[])observer.disconnect();
    if(state.review?.enabled)state.review.load();
    if($('find').value)find().catch(reportError);
  }
  async tick(){
    if(this.running||this.stopped||!state.target)return;
    clearTimeout(this.timer);this.running=true;
    const target=state.target,nav=state.navigation;
    this.controller=new AbortController();
    try{
      this.status=await getJson('/monitor/status?'+new URLSearchParams({target:target.id,run:target.run,
        index:target.map_identity,client:this.client}),
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
      this.prepared=null;
      if(error.name!=='AbortError'&&(error.recoveryFailed||state.target===target&&state.navigation===nav)){
        this.message=error.recoveryFailed?error.message:`Update not applied: ${error.message}. Retry when ready.`;
        const ready=this.status?.targets.find(t=>t.id===state.target?.id)?.ready;
        if(ready)this.failed=liveGeneration(ready);
      }
    }finally{
      this.running=false;if(!this.stopped){this.render();this.timer=setTimeout(()=>this.tick(),document.hidden?10000:1500);}
    }
  }
}
