// SPDX-License-Identifier: AGPL-3.0-or-later
// Rendering and camera operations use the folded projection; graph facts live in Universe.
'use strict';
const TRACE_CLASSES='hovered trace-endpoint trace-anchor trace-outgoing trace-incoming trace-within trace-other trace-both trace-reciprocal';
const TRACE_SELECTOR=TRACE_CLASSES.split(' ').map(name=>'.'+name).join(',');

function nodeMetadata(id) {
  const entry = state.indexLookup ? state.indexLookup.get(id) : state.index && state.index.nodes.find(n => n.id === id);
  if (entry) return state.universe.nodes.get(id)?.attrs?.source_sections?
    {...entry,child_count:state.universe.childIds(id).length}:entry;
  const n = state.universe && state.universe.nodes.get(id);
  return n && { ...n, child_count: state.universe.childIds(id).length };
}

function analysisStatus(node) {
  return node?.status==='not-in-target'?'Outside analysed target':node?.status==='not-analysed'?'Not analysed':'';
}

function analysisHint(node) {
  const status=analysisStatus(node);
  return status?`${node.label}: ${status}. Internals were not analysed; only recorded structure is shown.`:'';
}

function nodeDescription(node) {
  const externalGroup=node.boundary&&node.level==='project';
  const entry = nodeMetadata(node.id), parts = [node.attrs?.source_file?'source file':node.attrs?.presentation_group?'source region':
    externalGroup?'external dependency group':node.attrs?.declaration_kind||node.level];
  if (node.parent === null && !node.boundary) parts.push('root');
  else if (entry && entry.child_count) parts.push(`${entry.child_count} inside`);
  if (node.boundary&&!externalGroup) parts.push('external');
  const status=analysisStatus(node);if(status)parts.push(node.status==='not-in-target'?'outside target':status.toLowerCase());
  return parts.join(' / ');
}

function mapNode(node, members, drill) {
  const entry = nodeMetadata(node.id), group = entry && entry.child_count > 0 &&
    !(node.parent === null && !node.boundary);
  const caption=node.attrs?.source_caption||node.label;
  return { group: 'nodes', data: { id: node.id, label: node.label, caption,iconKind:NodeIcons.kind(node),
    ...(caption!==node.label?{displayName:caption}:{}) },
    classes: [members.has(node.id) && 'member', group && 'group', Object.hasOwn(drill,node.id) && 'openable',
      node.attrs?.presentation_group && 'source-region',(node.attrs?.source_private||node.attrs?.source_partition?.collapsed)&&'implementation',
      node.attrs?.source_file&&'source-file',
      ['private','protected'].includes(node.attrs?.access)&&'restricted-member',node.attrs?.source_region&&'organizational',
      node.boundary && 'boundary', node.status].filter(Boolean).join(' ') };
}

function style() {
  return [
    { selector: 'node', style: { label: 'data(caption)', color: css('--fg'), 'font-family': 'Segoe UI, sans-serif',
      'font-size': 13, 'text-valign': 'bottom', 'text-margin-y': 7, 'text-wrap': 'wrap',
      'text-overflow-wrap': 'anywhere', 'text-max-width': 140,
      'text-events': 'yes', 'text-background-color': css('--bg'), 'text-background-opacity': 0.9,
      'text-background-padding': 3, 'background-color': css('--context'), width: 12, height: 12,
      'border-width': 1, 'border-color': css('--context'), 'overlay-padding': 9 } },
    { selector: 'node.member', style: { 'background-color': css('--accent'), 'border-color': css('--accent'),
      width: 16, height: 16, 'underlay-color': css('--accent'), 'underlay-opacity': 0.08, 'underlay-padding': 6 } },
    { selector: 'node.group', style: { 'background-opacity': 0.04, 'border-width': 2, 'border-opacity': 1 } },
    // Rounded diamonds keep native hit-testing reliable at axis-aligned centers.
    { selector: 'node.boundary', style: { shape: 'round-diamond', 'background-color': css('--external'),
      'border-color': css('--external') } },
    { selector: 'node.not-in-target', style: { 'background-opacity': 0.15, 'border-style': 'dashed' } },
    { selector: 'node.not-analysed', style: { 'border-style': 'dotted' } },
    { selector: 'node.configured', style: { 'outline-color':css('--configuration'),
      'outline-width':2,'outline-offset':4,'outline-opacity':0.85 } },
    { selector: 'node.focus, node.match', style: {'z-index':10} },
    { selector: 'node.hovered, node:selected', style: {'z-index':20} },
    { selector: 'node.expanded', style: { shape: 'roundrectangle', 'background-opacity': 0.025,
      'border-opacity': 0.35, 'border-width': 1, 'underlay-opacity': 0, padding: 28,
      'text-valign': 'top', 'text-halign': 'center', 'text-margin-y': -8, 'font-weight': 600,
      width:'data(spanX)',height:'data(spanY)','z-index':'data(layer)','z-compound-depth':'bottom' } },
    { selector: 'edge', style: { width: 1, 'line-color': 'data(color)', 'target-arrow-color': 'data(color)',
      'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'arrow-scale': 0.7, opacity: 0.3,
      'source-endpoint':'inside-to-node','target-endpoint':'inside-to-node' } },
    { selector: 'edge.derived', style: { 'curve-style':'straight','target-arrow-shape':'none','line-style':'solid', opacity: 0.15, width: 'mapData(weight, 1, 100, 1, 3)',
      label: '', color: css('--muted'), 'font-size': 11, 'text-background-color': css('--bg'),
      'text-background-opacity': 0.9, 'text-background-padding': 2 } },
    { selector: 'edge.derived.hovered, edge.derived:selected', style: { label: 'data(count)','target-arrow-shape':'triangle' } },
    // Direct owner references meet the named top boundary of an expanded container.
    {selector:'edge.source-expanded',style:{'source-endpoint':'0% -50%'}},
    {selector:'edge.target-expanded',style:{'target-endpoint':'0% -50%'}},
    { selector:'edge.loop',style:{'curve-style':'bezier','source-endpoint':'outside-to-node','target-endpoint':'outside-to-node',
      'control-point-step-size':'data(loopDistance)'} },
    { selector:'edge.arranging',style:{display:'none'} },
    { selector: '.faded', style: { opacity: 0.3 } },
    { selector: 'edge:selected', style: { opacity: 1,width:3,'line-color':css('--selection'),'target-arrow-color':css('--selection'), 'underlay-color': css('--selection'),
      'underlay-opacity': 0.15, 'underlay-padding': 3 } },
    { selector: 'edge.focus', style: { width: 2.5, opacity: 1, 'z-index': 5,'target-arrow-shape':'triangle' } },
    ...['outgoing','incoming','within'].map(role=>({selector:'edge.trace-'+role,style:{
      'line-color':css('--trace-'+role),'target-arrow-color':css('--trace-'+role),
      'target-arrow-shape':'triangle',opacity:1,width:2.5,label:''}})),
    {selector:'edge.trace-both, edge.trace-reciprocal',style:{'line-color':css('--context')}},
    {selector:'edge.trace-other',style:{'line-color':css('--context'),'target-arrow-color':css('--context'),opacity:0.45,width:1.5}},
    {selector:'node.trace-anchor',style:{'border-color':css('--fg'),'underlay-color':css('--fg'),
      'underlay-opacity':0.16,'font-weight':600}},
    {selector:'edge.pair-inspected',style:{label:''}},
    { selector: 'node.source-region', style: {shape:'roundrectangle','background-opacity':0.08} },
    { selector: 'node.implementation', style: {'border-color':css('--context'),'background-color':css('--context')} },
    { selector: 'node.restricted-member', style: {'border-color':css('--muted'),'background-color':css('--context')} },
    { selector: 'node.organizational', style: {'background-opacity':0.015,'border-opacity':0.18,'font-weight':400} },
    { selector: 'node.overlapping-context', style: {'text-background-opacity':1,'border-width':2,
      'border-color':css('--context'),'underlay-color':css('--bg'),'underlay-opacity':1,'underlay-padding':8} },
    { selector: 'node:selected', style: { 'border-color': css('--selection'), 'border-width': 3 } },
  ];
}

function renderGraph() {
  renderIconKey();
  clearTimeout(state.inspectTimer);
  clearTimeout(state.gestureTimer);state.gestureActive=false;
  for (const key of ['zoomFrame', 'wheelFrame','viewportFrame','hoverFrame']) {
    if (state[key]) cancelAnimationFrame(state[key]);
    state[key] = null;
  }
  state.pointer = null; state.wheelDelta = 0; state.drag = null;state.renderScale=1;
  releaseConstellationLabel();
  if (state.cy) state.cy.destroy();
  state.cy = cytoscape({ container: $('graph'), elements: [], style: style(),
    minZoom: 0.015, maxZoom: 20000, textureOnViewport:true });
  state.viewportCut=null;
  const cy = state.cy;
  state.mapSize = {width:cy.width(),height:cy.height()};
  cy.on('tap', 'node', event => {
    const trace=backgroundConnection(event);
    if(trace){if(trace.kind==='overlap')inspectOverlap(trace);else inspectPair(trace.source,trace.target);return;}
    clearTimeout(state.inspectTimer);
    const id = event.target.id();
    // Opening a panel on the first tap can move or cover the target before a double-tap completes.
    if (state.universe.isGroup(id)) state.inspectTimer = setTimeout(() => {
      if (state.cy === cy && cy.getElementById(id).length) selectNode(id);
    }, 270);
    else selectNode(id);
  });
  cy.on('tap', 'edge', event => {
    const edge=state.shard.edges.find(e=>e.id===event.target.data('referenceId'));
    const trace=edge&&connectionAt(event.renderedPosition,edge);
    if(trace?.kind==='overlap')inspectOverlap(trace);
    else if(trace)inspectPair(trace.source,trace.target);
    else if(edge)inspectPair(edge.source,edge.target);
  });
  cy.on('tap', event => { if (event.target === cy) {
    const trace=connectionAt(event.renderedPosition);
    if(trace?.kind==='overlap')inspectOverlap(trace);
    else if(trace)inspectPair(trace.source,trace.target);
    else {unfocus();renderDetails(null);}
  } });
  cy.on('dbltap', 'node', event => {
    clearTimeout(state.inspectTimer);
    const trace=backgroundConnection(event);
    if(trace?.kind==='overlap')inspectOverlap(trace);
    else if(trace)inspectPair(trace.source,trace.target);
    else toggleGroup(event.target.id());
  });
  cy.on('mouseover mousemove',event=>schedulePreview(event.target,event.renderedPosition));
  cy.on('mouseout','node, edge',event=>{
    if(state.hoverTarget?.element===event.target||event.target.hasClass('hovered'))schedulePreview(cy,event.renderedPosition);
  });
  $('graph').onmouseleave=()=>{cancelAnimationFrame(state.hoverFrame);state.hoverFrame=null;unfocus();};
  cy.on('zoom', () => {
    if (state.framing) return;
    const level = worldZoom(), direction = Math.sign(level - (state.lastZoom || level));
    setWorldViewport(level, cy.pan());
    if (direction && state.pointer) semanticZoom(direction);
  });
  cy.on('pan', () => { if (!state.framing) {beginViewportGesture();scheduleViewport();} });
  cy.on('grabon', 'node', event => {
    state.drag = { id: event.target.id(), start: { ...event.target.position() } };
    $('graph').classList.add('dragging');
  });
  cy.on('freeon', 'node', event => {
    const drag = state.drag, node = event.target;
    $('graph').classList.remove('dragging');
    state.drag = null;
    if (!drag || drag.id !== node.id()) return;
    const dx = (node.position('x') - drag.start.x) / (state.renderScale || 1);
    const dy = (node.position('y') - drag.start.y) / (state.renderScale || 1);
    if (!dx && !dy) return;
    const patch = state.universe.translate(node.id(), dx, dy, node.id() !== state.universe.root);
    state.positionCache.moveMany($('layout').value, patch);
    releaseConstellationLabel(false);
    refreshMap();
  });
  layout();
}

function viewportCamera(padding = 220) {
  const cy=state.cy,zoom=worldZoom(),pan=cy.pan();
  if(!cy.width() || !cy.height()) return null;
  const force=[];
  const scope=state.scopeShard?.scope;
  if(scope&&scope!==state.universe.root&&(state.universe.expanded.has(scope)||state.universe.fileCovers.has(scope)))force.push(scope);
  const inspection=state.selection;
  const exact=inspection?.referenceGroup || inspection?.refs?.length===1&&inspection.id===inspection.refs[0].id;
  const selected=state.pendingReference || (exact ? inspection : null);
  if(selected)for(const id of selected.configurationInspection?[selected.target]:selected.source?[selected.source,selected.target]:[selected.id])
    if(state.universe.nodes.has(id))force.push(id);
  return {x1:(-pan.x-padding)/zoom,y1:(-pan.y-padding)/zoom,
    x2:(cy.width()-pan.x+padding)/zoom,y2:(cy.height()-pan.y+padding)/zoom,zoom,force};
}

function scheduleViewport() {
  if(state.viewportFrame || state.drag)return;
  state.viewportFrame=requestAnimationFrame(()=>{
    state.viewportFrame=null;if(!state.cy || state.drag)return;
    const now=viewportCamera(60),cut=state.viewportCut;
    if(now && (!cut || now.x1<cut.x1 || now.y1<cut.y1 || now.x2>cut.x2 || now.y2>cut.y2 ||
      now.zoom/cut.zoom>1.5 || now.zoom/cut.zoom<0.67)) refreshMap();
    else readableLabels();
    rememberView();
  });
}

function refreshMap() {
  clearTimeout(state.inspectTimer);
  state.drag = null;
  $('graph').classList.remove('dragging');
  const universe = state.universe, cy = state.cy;
  clearTrace();
  state.viewportCut=viewportCamera();
  const view = universe.project(state.hidden, state.boundary,state.viewportCut);
  const members = new Set(view.nodes.filter(n => !n.boundary).map(n => n.id));
  const enclosures=new Set(view.nodes.filter(n=>n.id!==universe.root&&view.expanded.has(n.id)&&universe.isGroup(n.id)).map(n=>n.id));
  const drill = Object.fromEntries(state.index.nodes.map(n => [n.id, n.file]));
  state.shard = { ...state.scopeShard, ...view, members: [...members], drill };
  const nodes = view.nodes.map(n => {
    const item = mapNode(n, members, drill);
    const p=universe.positions.get(n.id);
    if(!view.expanded.has(n.id)&&universe.spatial.search(p.x,p.y,p.x,p.y).some(i=>{
      const owner=universe.spatialIds[i];return enclosures.has(owner)&&!universe.contains(owner,n.id)&&!universe.contains(n.id,owner);
    })){
      const parent=universe.nodes.get(universe.viewParents.get(n.id));
      item.classes+=' overlapping-context';item.data.displayName=n.label+'\nFrom '+(parent?.label||'external context');
      item.data.caption=item.data.displayName;
    }
    if(n.attrs?.source_file&&!universe.childIds(n.id).length){item.grabbable=false;item.pannable=true;}
    if(configurationVisible()&&view.configurationMarks.has(n.id))item.classes+=' configured';
    const expanded = view.expanded.has(n.id) && n.id !== universe.root && universe.isGroup(n.id);
    const {position,...size}=nodeGeometry(n.id,expanded);
    if(item.pannable===undefined)item.pannable=expanded;
    if (expanded) {
      item.classes += ' expanded';
      Object.assign(item.data,size);
      item.data.layer=universe.paths.get(n.id).length+1;
    }
    item.position=position;
    return item;
  });
  const spans = new Map(nodes.map(n => [n.data.id, Math.max(n.data.spanX || 0,n.data.spanY || 0)]));
  const edges = view.edges.map(e => ({ group: 'edges', data: { id: universe.renderPrefix + e.id,
    referenceId: e.id, source: e.source, target: e.target,
    type: e.type, color: colorOf(e.type, e.refs), weight: referenceTotal(e.refs),
    count: referenceTotal(e.refs) > 1 ? String(referenceTotal(e.refs)) : '',
    ...(e.source===e.target?{loopDistance:Math.max(200/cy.zoom(),2*spans.get(e.source))}:{}) },
    classes: [e.status,e.source===e.target&&'loop',
      spans.get(e.source)>0&&'source-expanded',spans.get(e.target)>0&&'target-expanded'].filter(Boolean).join(' ') }));
  const elements = [...nodes, ...edges];
  const previous = state.renderedMap?.cy === cy ? state.renderedMap.elements : new Map();
  const definitions = new Map(elements.map(item => [item.data.id, JSON.stringify(item)]));
  const added = elements.filter(item => !previous.has(item.data.id));
  const updated = elements.filter(item => previous.has(item.data.id) && previous.get(item.data.id) !== definitions.get(item.data.id));
  const removed = cy.elements().filter(item => !definitions.has(item.id()));
  // Update only changed elements; a distant constellation keeps its native renderer geometry.
  if (added.length || updated.length || removed.length) {
    cy.batch(() => {
      removed.remove(); cy.add(added);
      for (const item of updated) {
        const value = {...item};
        cy.getElementById(item.data.id).json(value);
      }
    });
    state.labelGeometry = null;
    state.visibleLabels = null;
  }
  state.renderedMap = {cy, elements:definitions};
  state.review?.project();
  readableLabels();
  updateScopeSummary();
  renderFilters();
  if (state.selection) renderDetails(state.selection);
  rememberView();
}

function selectNode(id) {
  const n = state.universe.nodes.get(id);
  if (!n) return;
  renderDetails(n);
  const trace=ConnectionTrace.node(state.universe,state.shard,id);
  if(trace)showTraceReadout(trace);
}

function focus(elements) {
  state.cy.batch(() => {
    state.cy.elements('.focus').not(elements).removeClass('focus');
    elements.not('.focus').addClass('focus');
  });
}

function schedulePreview(element,pointer) {
  state.hoverTarget={cy:state.cy,element,pointer};
  if(state.hoverFrame)return;
  state.hoverFrame=requestAnimationFrame(()=>{
    state.hoverFrame=null;
    const target=state.hoverTarget;
    if(target?.cy===state.cy)preview(target.element,target.pointer);
  });
}

function segmentDistance(p,a,b) {
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
  const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}

function backgroundConnection(event) {
  if(!event.target.hasClass('expanded')||!event.renderedPosition)return null;
  const box=state.labelBoxes?.get(event.target.id()),p=event.renderedPosition;
  if(box&&p.x>=box.x1&&p.x<=box.x2&&p.y>=box.y1&&p.y<=box.y2)return null;
  return connectionAt(p);
}

function connectionAt(pointer,fallback=null) {
  if(!pointer||!Number.isFinite(pointer.x)||!Number.isFinite(pointer.y))
    return fallback&&ConnectionTrace.pair(state.shard,fallback.source,fallback.target);
  const cy=state.cy,pan=cy.pan(),key=[cy.zoom(),pan.x,pan.y].join();
  let cache=state.connectionHits;
  if(!cache||cache.cy!==cy||cache.view!==state.shard||cache.key!==key){
    const records=[],positions=new Map(),mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
    const position=id=>{
      if(!positions.has(id))positions.set(id,cy.getElementById(id).renderedPosition());
      return positions.get(id);
    };
    const curve=(points,a,c,b,depth=0)=>{
      if(depth>=10||segmentDistance(c,a,b)<=1){points.push(b);return;}
      const ac=mid(a,c),cb=mid(c,b),m=mid(ac,cb);
      curve(points,a,ac,m,depth+1);curve(points,m,cb,b,depth+1);
    };
    for(const edge of cy.edges()){
      if(!edge.visible())continue;
      // Folded summary endpoints reuse node positions; boundary anchors and curves use native geometry.
      const straight=edge.hasClass('derived')&&!edge.hasClass('loop');
      const a=straight&&!edge.hasClass('source-expanded')?position(edge.data('source')):edge.renderedSourceEndpoint(),
        b=straight&&!edge.hasClass('target-expanded')?position(edge.data('target')):edge.renderedTargetEndpoint();
      if(!a||!b||![a.x,a.y,b.x,b.y].every(Number.isFinite))continue;
      const controls=straight?[]:(edge.controlPoints()||[]).map(p=>({x:p.x*cy.zoom()+pan.x,y:p.y*cy.zoom()+pan.y})),points=[a];
      for(let i=0;i<controls.length;i++)curve(points,points[points.length-1],controls[i],
        i+1<controls.length?mid(controls[i],controls[i+1]):b);
      if(!controls.length)points.push(b);
      let x1=a.x,y1=a.y,x2=a.x,y2=a.y;
      for(const p of points){x1=Math.min(x1,p.x);y1=Math.min(y1,p.y);x2=Math.max(x2,p.x);y2=Math.max(y2,p.y);}
      records.push({source:edge.data('source'),target:edge.data('target'),points,x1,y1,x2,y2});
    }
    const index=records.length?new SpatialIndex(records.length):null;
    for(const record of records)index.add(record.x1,record.y1,record.x2,record.y2);
    if(index)index.finish();
    cache=state.connectionHits={cy,view:state.shard,key,records,index};
  }
  const radius=6,candidates=(cache.index?.search(pointer.x-radius,pointer.y-radius,pointer.x+radius,pointer.y+radius)||[])
    .map(i=>cache.records[i]).filter(({points})=>points.some((p,i)=>i&&segmentDistance(pointer,points[i-1],p)<=radius));
  const candidateKey=JSON.stringify([...new Set(candidates.map(pair=>ConnectionTrace.key(pair.source,pair.target)))].sort());
  if(cache.candidateKey!==candidateKey){
    cache.candidateKey=candidateKey;cache.trace=ConnectionTrace.overlap(state.shard,candidates);
  }
  return cache.trace;
}

function preview(element, pointer = state.pointer, explicitTrace = null) {
  if (state.drag || state.labelDrag || state.gestureActive&&!explicitTrace) return;
  if(element!==state.cy&&element.isNode() && element.hasClass('expanded')) {
    const box=state.labelBoxes?.get(element.id()),p=pointer;
    if(!box||!p||p.x<box.x1||p.x>box.x2||p.y<box.y1||p.y>box.y2){
      element=state.cy;
    }
  }
  const background=element===state.cy;
  const edge=!background&&element.isEdge()&&state.shard.edges.find(e=>e.id===element.data('referenceId'));
  if(!background&&element.isEdge()&&!edge)return;
  let trace=explicitTrace||(edge||background?connectionAt(pointer,edge):ConnectionTrace.node(state.universe,state.shard,element.id()));
  if(!trace){unfocus();return;}
  if(trace.kind!=='node')trace=relativeTrace(trace,pointer);
  const key=trace.key;
  if(state.trace?.key===key&&state.trace.focus?.id===trace.focus?.id) {
    if(!background){state.cy.elements('.hovered').not(element).removeClass('hovered');element.addClass('hovered');}return;
  }
  const cy = state.cy;
  // Native node and edge hover events can overlap; an old target must not clear a newer trace.
  state.trace=trace;
  if(!state.trace)return;
  cy.batch(()=>{
    cy.elements(TRACE_SELECTOR).removeClass(TRACE_CLASSES);
    if(!background)element.addClass('hovered');
    if (trace.kind==='node') {
      const family = cy.nodes().filter(n => state.universe.contains(element.id(), n.id()));
      const edges = family.connectedEdges().union(cy.edges().filter(e=>trace.roles.has(e.data('referenceId'))));
      focus(family.union(edges).union(edges.connectedNodes()));
    } else {
      const family=cy.edges().filter(e=>state.trace.roles.has(e.data('referenceId')));
      family.connectedNodes().addClass('trace-endpoint');
      focus(family.union(family.connectedNodes()));
      if(trace.focus)cy.getElementById(trace.focus.id).addClass('trace-anchor');
    }
    for(const [id,role] of state.trace.roles) {
      const wire=cy.getElementById(state.universe.renderPrefix+id);wire.addClass('trace-'+role);
      if(wire.source().id()!==wire.target().id()&&wire.parallelEdges().some(other=>
        other.source().id()===wire.target().id()&&other.target().id()===wire.source().id()))wire.addClass('trace-reciprocal');
    }
  });
  readableLabels();
  showTraceReadout(state.trace,pointer);
}

function relativeTrace(trace,pointer) {
  const pairs=trace.kind==='overlap'?trace.pairs:[trace];
  const ids=[...new Set(pairs.flatMap(pair=>[pair.source,pair.target]))].sort();
  const previous=state.trace?.focus?.id||(state.trace?.kind==='node'?state.trace.source:null);
  let id=ids.includes(previous)?previous:ids[0];
  if(pointer&&Number.isFinite(pointer.x)&&Number.isFinite(pointer.y)){
    const distances=ids.map(id=>{
      const p=state.cy.getElementById(id).renderedPosition();
      return{id,distance:Math.hypot(pointer.x-p.x,pointer.y-p.y)};
    }).sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id));
    const current=distances.find(item=>item.id===previous),best=distances[0];
    // A screen-space dead band keeps titles and directional colors steady around a midpoint.
    id=current&&current.distance-best.distance<=Math.max(24,current.distance*.15)?current.id:best.id;
  }
  if(state.trace?.key===trace.key&&state.trace.focus?.id===id)return state.trace;
  return ConnectionTrace.relative(trace,id);
}

function traceName(id) {
  const node=state.universe.nodes.get(id);
  const names=state.universe.paths.get(id).map(label).join(' / ');
  return `${names} (${node.level})`;
}

function traceTypes(refs) {
  const counts=new Map();for(const ref of refs)counts.set(ref.type,(counts.get(ref.type)||0)+ConnectionTrace.total([ref]));
  const rows=[...counts].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
  return rows.slice(0,3).map(([type,count])=>`${count} ${typeLabel(type)}`).join(', ')+
    (rows.length>3?`, +${rows.length-3} types`:'');
}

function tracePeerName(focus,peer) {
  const duplicate=focus.peers.some(other=>other.id!==peer.id&&label(other.id)===label(peer.id))||label(peer.id)===label(focus.id);
  return duplicate?traceName(peer.id):label(peer.id);
}

function traceSummary(trace) {
  if(trace.focus){
    const f=trace.focus,columns=['incoming','outgoing'].map(role=>({role,
      title:role==='incoming'?'Incoming':'Outgoing',rows:f.peers.filter(peer=>peer[role]).slice(0,3).map(peer=>{
        return[tracePeerName(f,peer),peer[role]];
      })}));
    const more=columns.some(column=>f.peers.filter(peer=>peer[column.role]).length>column.rows.length);
    const total=ConnectionTrace.total(f.refs);
    return{title:label(f.id),description:`${total} ${total===1?'ref':'refs'} in hovered connections`,columns,rows:[],
      within:f.counts.within,notes:[more&&'More in Details.',f.others&&
        `${f.others} other overlapping connection${f.others===1?'':'s'}.`,'Click to inspect.'].filter(Boolean)};
  }
  if(trace.kind==='overlap')return {
    title:`${trace.pairs.length} connections here`,description:`${ConnectionTrace.total(trace.refs)} distinct references`,
    scope:'In this view / directions belong to each named pair',
    rows:trace.pairs.slice(0,3).flatMap(pair=>{
      const rows=traceSummary(pair).rows;
      return rows.map((row,i)=>[...row,undefined,i===rows.length-1?traceTypes(pair.refs):null]);
    }),
    notes:[trace.pairs.length>3&&`+${trace.pairs.length-3} more connections in Details.`,
      'Lines overlap on screen; this is not an architectural junction.','Click to choose a connection.'].filter(Boolean)};
  if(trace.kind==='node') {
    const node=state.universe.nodes.get(trace.source),totals=state.universe.referenceStats.get(node.id);
    const context=DeclarationContext.describe(node,state.universe),structure=[];
    for(const [type,name] of [['inherits','inheritance'],['overrides','override']])for(const role of ['outgoing','incoming','within']){
      const count=ConnectionTrace.total((trace.groups[role]||[]).filter(ref=>ref.type===type));
      if(count)structure.push(`${count} ${role} ${name} refs`);
    }
    return {title:node.label,description:nodeDescription(node),path:context.path||traceName(node.id),signature:context.signature,
      structure:structure.length?'In this view: '+structure.join(' / '):'',source:context.source,context:context.context,
      scope:node.id===state.universe.root?'Project/subtree statistics: all recorded references':'All recorded references in this snapshot',
      rows:[['Outgoing references recorded',totals.outgoing,'outgoing'],['Incoming references recorded',totals.incoming,'incoming'],
        ['Within / self references recorded',totals.within,'within']].map(row=>[...row,state.universe.configurationStats.get(node.id)[row[2]]]),
      notes:[!totals.incoming&&'No incoming references recorded in this snapshot.',analysisHint(node),
        node.boundary&&node.attrs?.ownership,
        node.boundary&&node.attrs?.analysis,
        node.boundary&&!node.source&&!node.attrs?.ownership&&'Provider ownership was not recorded in this snapshot.',
        trace.refs.length&&`Shown types: ${traceTypes(trace.refs)}.`,
        configurationMarkLabel(node.id),
        Object.values(state.universe.configurationStats.get(node.id)).some(Boolean)&&configurationMeaning(),
        node.boundary&&'External boundary; further dependencies were not analysed.',
        `In this view: ${trace.counts.outgoing} outgoing / ${trace.counts.incoming} incoming / ${trace.counts.within} within.`,
        'Click for exact references.'].filter(Boolean)};
  }
  const self=trace.source===trace.target,duplicate=!self&&label(trace.source)===label(trace.target);
  const a=duplicate?traceName(trace.source):label(trace.source),b=duplicate?traceName(trace.target):label(trace.target);
  return {title:self?a:'Connection',description:self?'Within / self':'Both directions',scope:'In this view / all shown reference types',
    rows:self?[['Within / self',trace.counts.within,'within']]:
      [[`${a} -> ${b}`,trace.counts.outgoing,'outgoing'],[`${b} -> ${a}`,trace.counts.incoming,'incoming']],
    notes:[traceTypes(trace.refs),'Click for exact references.']};
}

function configurationMeaning() {
  return 'Configuration means explicitly listed, not necessarily compiled or used at runtime.';
}

function configurationMarkLabel(id) {
  const targets=state.shard.configurationMarks?.get(id);
  if(!targets)return '';
  return targets.size===1&&targets.has(id)?'Listed by project configuration':`${targets.size} listed targets inside`;
}

function showHoverCard(trace,point) {
  if(!state.cy.container())return;
  const card=$('hover-card'),summary=traceSummary(trace),rows=el('div',null,{class:'hover-rows'});
  for(const [name,count,role,configuration,types] of summary.rows) {
    const row=el('div',null,{class:'hover-row trace-'+role});
    row.append(el('span',name),el('strong',`${count} ${count===1?'ref':'refs'}`,{class:'hover-count'}));rows.append(row);
    if(types)rows.append(el('small',types,{class:'hover-context'}));
    if(configuration){
      const subset=el('div',null,{class:'hover-row configuration-subset'});
      subset.append(el('span','Of which: project configuration'),el('span',configuration));rows.append(subset);
    }
  }
  if(summary.columns){
    rows.className='hover-directions';
    for(const column of summary.columns){
      const section=el('section',null,{class:'hover-direction trace-'+column.role});
      section.append(el('h3',column.title));
      if(!column.rows.length)section.append(el('span','None',{class:'hover-none'}));
      for(const [name,count] of column.rows){
        const row=el('div',null,{class:'hover-peer'});
        row.append(el('span',name),el('strong',String(count)));section.append(row);
      }
      rows.append(section);
    }
    if(summary.within)rows.append(el('small',`Within/self: ${summary.within}`,{class:'hover-within trace-within'}));
  }
  card.replaceChildren(el('strong',summary.title,{class:'hover-name'}),el('small',summary.description,{class:'hover-context'}));
  if(summary.path)card.append(el('small',summary.path,{class:'hover-context hover-path'}));
  if(summary.signature)card.append(el('code',summary.signature,{class:'declaration-signature'}));
  for(const note of summary.context||[])card.append(el('small',note,{class:'hover-context'}));
  if(summary.source)card.append(el('small',summary.source,{class:'hover-context'}));
  if(summary.structure)card.append(el('small',summary.structure,{class:'hover-context'}));
  if(summary.scope)card.append(el('small',summary.scope,{class:'hover-context'}));
  card.append(rows,...(summary.columns?[el('small',summary.notes.join(' '),{class:'hover-context'})]:
    summary.notes.map(note=>el('small',note,{class:'hover-context'}))));
  const cy=state.cy,node=cy.getElementById(trace.source||trace.pairs[0].source),anchor=trace.kind==='node'&&!node.hasClass('expanded')?
    node.renderedPosition():point||node.renderedPosition();
  const graph=$('graph').getBoundingClientRect(),map=$('map').getBoundingClientRect();
  card.hidden=false;
  const box=card.getBoundingClientRect(),gap=18;
  let x=anchor.x+gap;if(x+box.width>graph.width-12)x=anchor.x-box.width-gap;
  card.style.left=graph.left-map.left+Math.max(12,Math.min(graph.width-box.width-12,x))+'px';
  card.style.top=graph.top-map.top+Math.max(8,Math.min(graph.height-box.height-8,anchor.y-12))+'px';
}

function showTraceReadout(trace,point) {
  const counts=trace.counts;
  if(trace.focus){
    const f=trace.focus;
    showTooltip(`Focus: ${traceName(f.id)} / hovered connections`,
      `Incoming: ${f.counts.incoming} / Outgoing: ${f.counts.outgoing}`+(f.counts.within?` / Within/self: ${f.counts.within}`:'')+
      (f.others?` / ${f.others} other overlapping connection${f.others===1?'':'s'}`:'')+' / '+f.peers.slice(0,6).map(peer=>
        `${tracePeerName(f,peer)}: ${peer.incoming} incoming, ${peer.outgoing} outgoing`).join(' / '));
  } else if(trace.kind==='overlap'){
    const summary=traceSummary(trace);
    showTooltip(summary.title+' / '+summary.description,
      summary.rows.map(([name,count,,,types])=>`${name}: ${count} refs`+(types?' ('+types+')':'')).join(' / ')+
      (trace.pairs.length>3?` / +${trace.pairs.length-3} more; click to inspect`:''));
  } else if(trace.kind==='node') {
    const summary=traceSummary(trace);
    showTooltip(`In this view / Focus: ${traceName(trace.source)}`,
      `Outgoing: ${counts.outgoing} / Incoming: ${counts.incoming} / Within: ${counts.within}`+
      ' / All recorded: '+summary.rows.map(([name,count,,configuration])=>`${name}: ${count}`+
        (configuration?` (Of which: project configuration: ${configuration})`:'')).join(' / ')+
      ' / '+summary.notes.join(' / '));
  }
  else if(trace.source===trace.target)showTooltip(`In this view / Self: ${traceName(trace.source)}`,
    `Within/self: ${counts.within} refs (${traceTypes(trace.groups.within)})`);
  else showTooltip(`In this view / A: ${traceName(trace.source)} / B: ${traceName(trace.target)}`,
    `A -> B: ${counts.outgoing} refs${counts.outgoing?' ('+traceTypes(trace.groups.outgoing)+')':''} / `+
    `B -> A: ${counts.incoming} refs${counts.incoming?' ('+traceTypes(trace.groups.incoming)+')':''}`);
  showHoverCard(trace,point);
}

function showTooltip(title, text) {
  const tip = $('map-tooltip');
  if(tip.firstElementChild?.textContent!==title||tip.lastElementChild?.textContent!==text)
    tip.replaceChildren(el('strong', title), el('span', text));
  tip.hidden = false;
}

function clearTrace() {
  if(state.hoverFrame)cancelAnimationFrame(state.hoverFrame);
  state.hoverFrame=null;
  state.hoverTarget=null;
  state.connectionHits=null;
  $('hover-card').hidden=true;
  if(state.cy)state.cy.elements('.faded,.focus,'+TRACE_SELECTOR).removeClass('faded focus '+TRACE_CLASSES);
  state.trace=null;
  $('map-tooltip').hidden=false;
  $('map-tooltip').textContent=analysisHint(state.universe?.nodes.get(state.scopeShard?.scope))||
    'Hover a star or connection to trace references in this view.';
}

function unfocus(clearReadout = false) {
  $('hover-card').hidden=true;
  if (state.cy) {
    const marked=state.cy.elements('.faded,.focus,'+TRACE_SELECTOR);
    if(marked.length){marked.removeClass('faded focus '+TRACE_CLASSES);readableLabels();}
  }
  state.trace=null;
  if(clearReadout)clearTrace();
  else {
    const title=$('map-tooltip').firstElementChild;
    if(title&&!title.textContent.startsWith('Last traced: '))title.textContent='Last traced: '+title.textContent;
  }
}

function applyFilters() {
  if (state.cy) { unfocus(); refreshMap(); }
}

function readableLabels(geometryOnly = false) {
  if (!state.cy || state.styling || state.gestureActive && !geometryOnly) return;
  state.styling = true;
  const cy = state.cy, zoom = cy.zoom(), leaves = cy.nodes().not('.expanded');
  const styleZoom=2**(Math.round(Math.log2(zoom)*2)/2);
  const changed = !state.labelGeometry || state.labelGeometry.cy !== cy || state.labelGeometry.zoom !== styleZoom;
  const border = n => (n.selected() ? 3 : n.hasClass('expanded') ? 1 : n.hasClass('group') ? 2 : 1) / zoom;
  const alignments = leaves.map(n => {
    const x = n.renderedPosition('x');
    return [n, x < 155 ? 'right' : x > cy.width() - 155 ? 'left' : 'center'];
  });
  cy.batch(() => {
    if (changed) {
      cy.nodes().style({ 'font-size': 13 / zoom, 'text-max-width': n=>(n.hasClass('source-file')?180:150)/zoom,
        'text-background-padding': 3 / zoom, 'border-width': border,
        'outline-width':n=>n.hasClass('configured')?2/zoom:0,'outline-offset':4/zoom });
      const diameter = n => n.hasClass('group') ?
        Math.max(27, Math.min(100, 2 * state.universe.radii.get(n.id()) * worldZoom() * 0.3)) : n.hasClass('member') ? 15 : 11;
      leaves.style({ width: n => diameter(n) / zoom, height: n => diameter(n) / zoom,
        'underlay-padding': 6 / zoom, 'text-valign': 'bottom', 'text-margin-y': 8 / zoom });
      cy.nodes('.expanded').style({width:n=>n.data('spanX'),height:n=>n.data('spanY'),
        padding: 26 / zoom, 'text-margin-y': -8 / zoom,'text-valign':'top','text-halign':'center' });
      cy.edges('.loop').forEach(edge => edge.data('loopDistance',
        2*Math.max(edge.source().outerWidth(),edge.source().outerHeight())+20/zoom));
      state.labelAlign = new Map();
    }
    for (const [n, align] of alignments) {
      if (state.labelAlign.get(n.id()) !== align) {
        n.style('text-halign', align); state.labelAlign.set(n.id(), align);
      }
    }
    NodeIcons.update(cy,state.universe,state.scopeShard.scope,worldZoom(),zoom,{fg:css('--fg'),bg:css('--bg')});
  });
  state.labelGeometry = {cy, zoom:styleZoom};
  if (!geometryOnly) declutterLabels();
  state.styling = false;
}

function labelObstacles(glyphs) {
  const obstacles = glyphs.length ? new SpatialIndex(glyphs.length) : null;
  for (const {box:b} of glyphs) obstacles.add(b.x1,b.y1,b.x2,b.y2);
  if (obstacles) obstacles.finish();
  return obstacles;
}

function labelFits(item, kept, glyphs, obstacles) {
  const a=item.box;
  if (obstacles && item.priority<5 && obstacles.search(a.x1,a.y1,a.x2,a.y2).some(i=>glyphs[i].id!==item.id)) return false;
  for(const other of kept) {
    const b=other.box;
    if(other.id!==item.id && a.x1<b.x2+4 && a.x2+4>b.x1 && a.y1<b.y2+4 && a.y2+4>b.y1) return false;
  }
  return true;
}

function nonOverlappingLabels(candidates, glyphs = []) {
  const kept = [], ids = new Set(),obstacles=labelObstacles(glyphs);
  for (const item of candidates.sort((a, b) => b.priority - a.priority)) {
    if (!labelFits(item,kept,glyphs,obstacles))continue;
    kept.push(item); ids.add(item.id);
  }
  return ids;
}

// Native-node lifetime and four measured variants bound this derived font-metric cache.
const labelMetrics = new WeakMap();

function measureLabelVariants(items, textOf) {
  const groups=new Map(),zoom=state.cy.zoom();
  const properties=['font-family','font-size','font-weight','font-style','text-max-width','text-wrap',
    'text-overflow-wrap','text-halign','text-valign','text-margin-x','text-margin-y','text-background-padding'];
  const boxAt=(item,offset)=>{
    const p=item.node.renderedPosition();
    const b={x1:p.x+offset.x1*zoom,y1:p.y+offset.y1*zoom,x2:p.x+offset.x2*zoom,y2:p.y+offset.y2*zoom};
    return {...b,w:b.x2-b.x1,h:b.y2-b.y1};
  };
  for(const item of items){
    const n=item.node;
    if(!item.metrics){
      const signature=JSON.stringify([n.outerWidth(),n.outerHeight(),...properties.map(key=>n.style(key))]);
      let cached=labelMetrics.get(n);
      if(!cached||cached.signature!==signature){cached={signature,variants:new Map()};labelMetrics.set(n,cached);}
      item.metrics=cached;
    }
    item.text=textOf(item);
    const variants=item.metrics.variants,offset=variants.get(item.text);
    const key=JSON.stringify([item.metrics.signature,item.text]);
    if(!groups.has(key))groups.set(key,{items:[],offset:null});
    const group=groups.get(key);group.items.push(item);
    if(offset)group.offset=offset;
  }
  state.cy.batch(()=>groups.forEach(group=>{
    const item=group.items[0];
    if(!group.offset&&item.node.style('label')!==item.text)item.node.style('label',item.text);
  }));
  for(const group of groups.values()){
    if(!group.offset){
      const n=group.items[0].node,p=n.renderedPosition(),b=n.renderedBoundingBox({includeNodes:false,includeEdges:false,
        includeLabels:true,includeOverlays:false,includeUnderlays:false});
      group.offset={x1:(b.x1-p.x)/zoom,y1:(b.y1-p.y)/zoom,x2:(b.x2-p.x)/zoom,y2:(b.y2-p.y)/zoom};
    }
    for(const item of group.items){
      const variants=item.metrics.variants;variants.delete(item.text);variants.set(item.text,group.offset);
      if(variants.size>4)variants.delete(variants.keys().next().value);
      item.textBox=boxAt(item,group.offset);item.box=NodeIcons.titleBox(item.node,item.textBox);
    }
  }
}

function declutterLabels() {
  if (!state.cy) return;
  const cy = state.cy;
  const inspected = new Set(cy.edges(':selected').connectedNodes().map(n => n.id()));
  const traced = new Set(cy.edges('.focus').connectedNodes().map(n => n.id()));
  const all = cy.nodes().map(n => {
    const expanded = n.hasClass('expanded');
    return { id: n.id(), node:n, name:n.data('displayName') || n.data('label') || (n.data('caption') || '').split('\n')[0],
      priority: n.hasClass('hovered') || n.selected() ? 8 : inspected.has(n.id()) ? 7 :
        n.hasClass('match') || n.id() === state.scopeShard.scope ? 6 : traced.has(n.id()) ? 5 :
          n.hasClass('overlapping-context')?4:expanded ? 2 : 1 };
  }).sort((a,b)=>b.priority-a.priority);
  const glyphs = cy.nodes().not('.expanded').map(n => ({id:n.id(),box:n.renderedBoundingBox({includeLabels:false,
    includeOverlays:false,includeUnderlays:false})}));
  let kept=new Map();
  const obstacles=labelObstacles(glyphs);
  const measure=item=>item.node.renderedBoundingBox({includeNodes:false,includeEdges:false,includeLabels:true,
    includeOverlays:false,includeUnderlays:false});
  const inside=b=>b.x1>=0&&b.y1>=0&&b.x2<=cy.width()&&b.y2<=cy.height();
  const caption=(item,text)=>{if(item.node.style('label')!==text)item.node.style('label',text);};
  const candidates=all.filter(item=>{
    const b=measure(item),margin=150;
    return b.x2>=-margin&&b.y2>=-margin&&b.x1<=cy.width()+margin&&b.y1<=cy.height()+margin;
  });
  const choose=()=>{
    const result=new Map();
    for(const item of candidates)if(inside(item.box)&&labelFits(item,result.values(),glyphs,obstacles))result.set(item.id,item);
    return result;
  };
  // Reserve readable primary names before allowing any secondary metadata to occupy space.
  measureLabelVariants(candidates,item=>item.name);
  kept=choose();
  for(const limit of [32,12]) {
    const shorter=candidates.filter(item=>!kept.has(item.id)&&item.name.length>limit);
    measureLabelVariants(shorter,item=>{
      const head=Math.ceil((limit-3)/3);
      return item.name.slice(0,head)+'...'+item.name.slice(-(limit-3-head));
    });
    if(shorter.length)kept=choose();
  }
  const fullCandidates=[...kept.values()].filter(item=>{
    const large=(state.universe?.radii.get(item.id)||0)*worldZoom()>75;
    return item.node.data('caption')&&item.node.data('caption')!==item.text&&(item.priority>=5||large);
  }).map(item=>({...item}));
  measureLabelVariants(fullCandidates,item=>item.node.data('caption'));
  for(const item of fullCandidates){
    if(inside(item.box)&&labelFits(item,kept.values(),glyphs,obstacles))kept.set(item.id,item);
  }
  const names=new Set(kept.keys());
  cy.batch(() => {
    kept.forEach(item=>caption(item,item.text));
    cy.nodes().forEach(n => {
      // Captions revealed by pair tracing must not take the connection's pointer hit.
      const hit=names.has(n.id())&&!n.hasClass('trace-endpoint')?'yes':'no';
      if (!state.visibleLabels || state.visibleLabels.has(n.id()) !== names.has(n.id()) || n.style('text-events')!==hit) {
        n.style({ 'text-opacity': names.has(n.id()) ? 1 : 0, 'text-events': hit });
      }
    });
  });
  state.visibleLabels = names;
  state.labelBoxes=new Map([...kept.values()].map(n=>[n.id,n.textBox||n.box]));
  const titled=cy.nodes('.expanded').filter(node=>node.data('iconKind'));
  if(titled.length){
    const palette={fg:css('--fg'),bg:css('--bg')};
    cy.batch(()=>titled.forEach(node=>NodeIcons.title(node,kept.get(node.id())?.textBox,cy.zoom(),palette)));
  }
}

function renderIconKey(){
  const entries=[['project','Project'],['plugin','Plugin'],['module','Module'],['namespace','Namespace'],
    ['class','Class'],['struct','Struct'],['union','Union'],['enum','Enum'],['interface','Interface'],
    ['function','Function / method'],['lambda','Lambda'],['field','Field'],['variable','Variable'],
    ['file','Source file'],['folder','Folder'],['section','Source section'],['entity','Other entity']];
  const ink=css('--fg');
  $('icon-key').replaceChildren(...entries.map(([kind,label])=>{
    const item=el('span');item.append(el('img',null,{src:NodeIcons.image(kind,ink),alt:'',width:20,height:20,'aria-hidden':'true'}),el('span',label));return item;
  }));
}

function grabConstellationLabel(event) {
  if(event.button!==0 || !state.cy)return;
  if(state.gestureActive){
    clearTimeout(state.gestureTimer);state.gestureActive=false;readableLabels();
  }
  const box=$('graph').getBoundingClientRect(),x=event.clientX-box.left,y=event.clientY-box.top;
  for(const [id,bounds] of state.labelBoxes || []) {
    const node=state.cy.getElementById(id);
    if(node.hasClass('expanded') && x>=bounds.x1 && x<=bounds.x2 && y>=bounds.y1 && y<=bounds.y2) {
      const cy=state.cy,family=cy.nodes().filter(n=>state.universe.contains(id,n.id()));
      const edges=family.connectedEdges().not(':selected');
      const hitEdges=cy.edges();
      state.labelDrag={cy,map:state.universe,selected:cy.nodes(':selected'),pannable:family.filter(n=>n.pannable()),edges,hitEdges};
      // Native selected-node dragging uses the renderer's drag layer for the entire visible constellation.
      // Crossing wires yield hit-testing until the label gesture finishes.
      cy.batch(()=>{cy.nodes(':selected').unselect();family.unpanify().select();edges.addClass('arranging');hitEdges.style('events','no');});
      return;
    }
  }
}

function releaseConstellationLabel(redraw=true) {
  const drag=state.labelDrag;
  if(!drag)return;
  state.labelDrag=null;
  drag.cy.batch(()=>{
    drag.edges.removeClass('arranging');drag.hitEdges.removeStyle('events');drag.pannable.panify();
    drag.cy.nodes(':selected').unselect();drag.selected.filter(e=>!e.removed()).select();
  });
  state.labelGeometry=null;
  if(redraw!==false && drag.cy===state.cy && drag.map===state.universe && !drag.cy.destroyed())readableLabels();
}

function galaxyPositions(nodes, width, height, anchor = null) {
  const members = nodes.filter(n => n.id()!==anchor&&n.hasClass('member')), context = nodes.filter(n => n.id()!==anchor&&!n.hasClass('member'));
  const positions = new Map(), aspect = Math.max(0.75, Math.min(1.6, width / Math.max(height, 1)));
  const radius = anchor ? Math.max(300, Math.min(24,members.length)*32) : members.length === 1 ? 0 : Math.max(170, Math.min(24, members.length) * 18);
  function orbit(group, start) {
    for (let offset = 0; offset < group.length; offset += 24) {
      const band = group.slice(offset, offset + 24), r = start + Math.floor(offset / 24) * 180;
      band.forEach((n, i) => {
        const angle = -Math.PI / 2 + i * Math.PI * 2 / band.length;
        positions.set(n.id(), { x: Math.cos(angle) * r * aspect, y: Math.sin(angle) * r });
      });
    }
  }
  orbit(members, radius);
  orbit(context, radius + Math.max(0, Math.ceil(members.length / 24) - 1) * 180 + 190);
  if (anchor) positions.set(anchor,{x:0,y:0});
  return positions;
}

function updateScopeSummary() {
  const view = state.shard;
  const exact = view.edges.reduce((sum, e) => sum + referenceTotal(e.refs), 0);
  const internal = [...view.internal.values()].reduce((sum, refs) => sum + referenceTotal(refs), 0);
  $('scope-summary').textContent = `${view.nodes.length} stars & constellations / ${exact} references / ` +
    `${internal} within owners/groups${view.outside ? ` / ${view.outside} beyond view` : ''}`+
    (state.universe.configurationCount?` / ${state.universe.configurationCount} project configuration`:'')+
    (view.hidden>state.universe.configurationCount?` / ${view.hidden-state.universe.configurationCount} filtered`:'');
  renderConfiguration();
  $('arrange-files').hidden=!sourceArrangementOwner();
  $('map-empty').hidden = view.nodes.length > 0;
  $('map-empty').textContent = 'No stars in this area. Use Fit map to return to the overview.';
}

function worldZoom() { return state.cy.zoom() * (state.renderScale || 1); }

function detailAtPointer(pointer){
  const map=state.universe;
  const scope=map.nodes.get(state.scopeShard?.scope),local=scope&&(scope.attrs?.source_sections||scope.attrs?.presentation_group||
    ['class','namespace','function'].includes(scope.level));
  let nearest=null,distance=Infinity;
  for(const node of state.cy.nodes().not('.expanded')){
    if(!node.hasClass('source-file')&&(!local||!map.contains(scope.id,node.id())))continue;
    if(map.regions.has(node.id())||map.expanded.has(node.id())||!map.isGroup(node.id())&&!map.navigationTarget(node.id()))continue;
    if(!map.zoomReady(node.id(),worldZoom()))continue;
    const p=node.renderedPosition(),dx=pointer.x-p.x,dy=pointer.y-p.y,box=state.labelBoxes?.get(node.id());
    const glyph=Math.abs(dx)<=node.renderedWidth()/2+4&&Math.abs(dy)<=node.renderedHeight()/2+4;
    const caption=box&&pointer.x>=box.x1&&pointer.x<=box.x2&&pointer.y>=box.y1&&pointer.y<=box.y2;
    const d=dx*dx+dy*dy;
    if((glyph||caption)&&d<distance){nearest=node.id();distance=d;}
  }
  return nearest;
}

function nodeGeometry(id,expanded,scale=state.renderScale||1) {
  const box=expanded&&state.universe.bounds.get(id);
  const p=box?{x:(box.x1+box.x2)/2,y:(box.y1+box.y2)/2}:state.universe.positions.get(id);
  return {position:{x:p.x*scale,y:p.y*scale},...(box?{spanX:(box.x2-box.x1)*scale,spanY:(box.y2-box.y1)*scale}:{})};
}

function beginViewportGesture() {
  if(!state.gestureActive)clearTrace();
  state.gestureActive=true;
  clearTimeout(state.gestureTimer);
  const cy=state.cy;
  state.gestureTimer=setTimeout(()=>{
    state.gestureActive=false;
    if(state.cy===cy&&!cy.destroyed())readableLabels();
  },120);
}

function setWorldViewport(level, pan, gesture = false) {
  const cy = state.cy, before = worldZoom(), framing = state.framing;
  level = Math.max(cy.minZoom(), Math.min(cy.maxZoom(), level));
  const scale = level > 2 ? 2 ** Math.ceil(Math.log2(level)) : 1;
  const rescaled = scale !== (state.renderScale || 1);
  state.framing = true;
  cy.startBatch();
  if(gesture)beginViewportGesture();
  if (rescaled) {
    state.renderScale = scale;
    cy.nodes().positions(n => {
      const {position,...size}=nodeGeometry(n.id(),n.hasClass('expanded'),scale);
      if(n.hasClass('expanded'))n.data(size);
      return position;
    });
    state.labelGeometry = null;
  }
  cy.viewport({zoom:level/scale,pan});
  // Pixel-sized styles must change units with positions before the renderer can paint.
  if (rescaled) readableLabels(true);
  cy.endBatch();
  state.lastZoom = level;
  state.framing = framing;
  readableLabels();
  if(gesture) scheduleViewport();
  if (gesture && !framing && state.pointer && level !== before) semanticZoom(Math.sign(level-before));
}

function frame(bounds, padding = 75, maxZoom = 1.2) {
  const cy = state.cy;
  const zoom = Math.max(cy.minZoom(), Math.min(maxZoom, cy.maxZoom(),
    Math.max(10, cy.width() - 2 * padding) / Math.max(Number.EPSILON, bounds.x2 - bounds.x1),
    Math.max(10, cy.height() - 2 * padding) / Math.max(Number.EPSILON, bounds.y2 - bounds.y1)));
  setWorldViewport(zoom,{x:cy.width()/2-(bounds.x1+bounds.x2)*zoom/2,
    y:cy.height()/2-(bounds.y1+bounds.y2)*zoom/2});
  rememberView();
}

function fitMap() {
  if (!state.cy) return;
  const map=state.universe,top=[...map.childIds(map.root),...map.childIds(null).filter(id=>id!==map.root)];
  if(!top.length || map.directReferences.get(map.root).some(e=>!state.hidden.has(e.type)&&
    !map.isConfiguration(e)))top.push(map.root);
  const points=top.filter(id=>state.boundary||!map.nodes.get(id).boundary).map(id=>map.positions.get(id));
  if(!points.length)points.push(map.positions.get(map.root));
  frame({x1:Math.min(...points.map(p=>p.x)),y1:Math.min(...points.map(p=>p.y)),
    x2:Math.max(...points.map(p=>p.x)),y2:Math.max(...points.map(p=>p.y))});
  refreshMap();
}

function frameNode(id) {
  if (id === state.universe.root) { fitMap(); return; }
  const map = state.universe, p = map.positions.get(id), r = map.isGroup(id) ? map.radii.get(id) :
    (map.radii.get(map.viewParents.get(id)) || 80) * 0.5;
  const sourceSurface=Boolean(map.nodes.get(id).attrs?.source_sections||map.nodes.get(id).attrs?.source_file);
  const screenRadius=Math.max(sourceSurface?300:160,
    50*Math.ceil(Math.sqrt(map.childIds(id).length)));
  frame(map.isGroup(id)?map.bounds.get(id):{x1:p.x-r,y1:p.y-r,x2:p.x+r,y2:p.y+r},sourceSurface?40:75,screenRadius/r);
  if(state.cy)refreshMap();
}

function layout() {
  if (!state.cy) return;
  const map = state.universe, mode = $('layout').value;
  const top = [...map.childIds(map.root), ...map.childIds(null).filter(id => id !== map.root)];
  const fake = top.map(id => ({id:()=>id,hasClass:()=>!map.nodes.get(id).boundary}));
  let positions = galaxyPositions(fake, state.cy.width(), state.cy.height(),mode==='galaxy'?map.overview?.anchor:null);
  if (mode !== 'auto' && mode !== 'galaxy') {
    const expanded = map.expanded;
    map.expanded = new Set([map.root]);
    const rootView = map.project();
    map.expanded = expanded;
    const temp = cytoscape({headless:true,elements:[...rootView.nodes.map(n=>({data:{id:n.id}})),
      ...rootView.edges.map(e=>({data:{id:map.renderPrefix+e.id,source:e.source,target:e.target}}))]});
    temp.layout({name:mode,animate:false,randomize:false,spacingFactor:5}).run();
    positions = new Map(temp.nodes().map(n=>[n.id(),{...n.position()}])); temp.destroy();
  }
  map.place(state.positionCache.layouts, mode, positions);
  state.cy.maxZoom(map.zoomLimit);
  refreshMap(); fitMap(); state.positionCache.status();
}
