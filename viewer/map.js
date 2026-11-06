// SPDX-License-Identifier: AGPL-3.0-or-later
// Rendering and camera operations use the folded projection; graph facts live in Universe.
'use strict';

function nodeMetadata(id) {
  const entry = state.indexLookup ? state.indexLookup.get(id) : state.index && state.index.nodes.find(n => n.id === id);
  if (entry) return entry;
  const n = state.universe && state.universe.nodes.get(id);
  return n && { ...n, child_count: state.universe.childIds(id).length };
}

function nodeDescription(node) {
  const entry = nodeMetadata(node.id), parts = [node.level];
  if (node.parent === null && !node.boundary) parts.push('root');
  else if (entry && entry.child_count) parts.push(`${entry.child_count} inside`);
  if (node.boundary) parts.push('external');
  return parts.join(' / ');
}

function mapNode(node, members, drill, compact = false) {
  const entry = nodeMetadata(node.id), group = entry && entry.child_count > 0 &&
    !(node.parent === null && !node.boundary);
  const description = node.boundary && group ? nodeDescription(node).replace(' / external', '\nexternal') : nodeDescription(node);
  const caption = compact && !members.has(node.id) && !group ? node.label : `${node.label}\n${description}`;
  return { group: 'nodes', data: { id: node.id, label: node.label, caption },
    classes: [members.has(node.id) && 'member', group && 'group', Object.hasOwn(drill,node.id) && 'openable',
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
    { selector:'edge.loop',style:{'curve-style':'bezier','source-endpoint':'outside-to-node','target-endpoint':'outside-to-node',
      'control-point-step-size':'data(loopDistance)'} },
    { selector:'edge.arranging',style:{display:'none'} },
    { selector: '.faded', style: { opacity: 0.3 } },
    { selector: 'edge:selected', style: { opacity: 1,width:3,'line-color':css('--selection'),'target-arrow-color':css('--selection'), 'underlay-color': css('--selection'),
      'underlay-opacity': 0.15, 'underlay-padding': 3 } },
    { selector: 'edge.focus', style: { width: 2.5, opacity: 1, 'z-index': 5,'target-arrow-shape':'triangle' } },
    { selector: 'node:selected', style: { 'border-color': css('--selection'), 'border-width': 3 } },
  ];
}

function renderGraph() {
  clearTimeout(state.inspectTimer);
  clearTimeout(state.gestureTimer);state.gestureActive=false;
  for (const key of ['zoomFrame', 'wheelFrame','viewportFrame']) {
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
    clearTimeout(state.inspectTimer);
    const id = event.target.id();
    // Opening a panel on the first tap can move or cover the target before a double-tap completes.
    if (state.universe.isGroup(id)) state.inspectTimer = setTimeout(() => {
      if (state.cy === cy && cy.getElementById(id).length) selectNode(id);
    }, 270);
    else selectNode(id);
  });
  cy.on('tap', 'edge', event => renderDetails(state.shard.edges.find(e => e.id === event.target.data('referenceId'))));
  cy.on('tap', event => { if (event.target === cy) { unfocus(); renderDetails(null); } });
  cy.on('dbltap', 'node', event => { clearTimeout(state.inspectTimer); toggleGroup(event.target.id()); });
  cy.on('mouseover', 'node, edge', event => preview(event.target,event.renderedPosition));
  cy.on('mousemove','node, edge',event=>preview(event.target,event.renderedPosition));
  cy.on('mouseout', 'node, edge', event => { if (event.target.hasClass('hovered')) unfocus(); });
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
  const selected=state.pendingReference || (state.selection?.referenceGroup ? state.selection : null);
  if(selected)for(const id of selected.source?[selected.source,selected.target]:[selected.id]) if(state.universe.nodes.has(id))force.push(id);
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
  cy.elements().removeClass('faded focus hovered');
  $('map-tooltip').hidden = true;
  state.viewportCut=viewportCamera();
  const view = universe.project(state.hidden, state.boundary,state.viewportCut,configurationVisible());
  const members = new Set(view.nodes.filter(n => !n.boundary).map(n => n.id));
  const drill = Object.fromEntries(state.index.nodes.map(n => [n.id, n.file]));
  state.shard = { ...state.scopeShard, ...view, members: [...members], drill };
  const nodes = view.nodes.map(n => {
    const item = mapNode(n, members, drill);
    const expanded = view.expanded.has(n.id) && n.id !== universe.root && universe.isGroup(n.id);
    const {position,...size}=nodeGeometry(n.id,expanded);
    item.pannable=expanded;
    if (expanded) {
      item.classes += ' expanded'; item.data.caption = `${n.label}\n${n.level}`;
      Object.assign(item.data,size);
      item.data.layer=universe.paths.get(n.id).length+1;
    } else {
      const internal = view.internal.get(n.id);
      if (internal && internal.length) item.data.caption += `\n${referenceTotal(internal)} refs within`;
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
    classes: e.status+(e.source===e.target?' loop':'') }));
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
}

function focus(elements) {
  state.cy.batch(() => {
    state.cy.elements('.focus').not(elements).removeClass('focus');
    elements.not('.focus').addClass('focus');
  });
  readableLabels();
}

function preview(element, pointer = state.pointer) {
  if (state.drag || state.gestureActive) return;
  if(element.isNode() && element.hasClass('expanded')) {
    const box=state.labelBoxes?.get(element.id()),p=pointer;
    if(!box||!p||p.x<box.x1||p.x>box.x2||p.y<box.y1||p.y>box.y2){
      if(element.hasClass('hovered'))unfocus();return;
    }
  }
  if(element.hasClass('hovered'))return;
  const cy = state.cy;
  // Native node and edge hover events can overlap; an old target must not clear a newer trace.
  cy.elements('.hovered').not(element).removeClass('hovered');
  if (element.isNode()) {
    const family = cy.nodes().filter(n => state.universe.contains(element.id(), n.id()));
    const edges = family.connectedEdges();
    element.addClass('hovered');
    focus(family.union(edges).union(edges.connectedNodes()));
    const node = state.universe.nodes.get(element.id()), stats = state.universe.referenceStats.get(node.id);
    const outgoing = stats.outgoing+stats.within, incoming = stats.incoming+stats.within;
    showTooltip(`${node.label} (${node.level})`, `${outgoing} outgoing / ${incoming} incoming` +
      (node.boundary ? ' / further external dependencies not analysed' : ''), element.renderedPosition());
  } else {
    element.addClass('hovered');
    focus(element.union(element.connectedNodes()));
    const edge = state.shard.edges.find(e => e.id === element.data('referenceId'));
    showTooltip(`${label(edge.source)} -> ${label(edge.target)}`, `${referenceTotal(edge.refs)} exact reference(s) / ` +
      [...new Set(edge.refs.map(e => typeLabel(e.type)))].join(', '), element.renderedMidpoint());
  }
}

function showTooltip(title, text, point) {
  const tip = $('map-tooltip');
  tip.replaceChildren(el('strong', title), el('span', text));
  tip.hidden = false;
  tip.style.left = Math.max(8, Math.min(state.cy.width() - 292, point.x + 18)) + 'px';
  tip.style.top = Math.max(8, Math.min(state.cy.height() - 90, point.y + 24)) + 'px';
}

function unfocus() {
  if (state.cy) {
    const marked=state.cy.elements('.faded,.focus,.hovered');
    if(marked.length){marked.removeClass('faded focus hovered');readableLabels();}
  }
  $('map-tooltip').hidden = true;
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
      cy.nodes().style({ 'font-size': 13 / zoom, 'text-max-width': 150 / zoom,
        'text-background-padding': 3 / zoom, 'border-width': border });
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
      item.box=boxAt(item,group.offset);
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
    return { id: n.id(), node:n, name:n.data('label') || (n.data('caption') || '').split('\n')[0],
      priority: n.hasClass('hovered') || n.selected() ? 8 : inspected.has(n.id()) ? 7 :
        n.hasClass('match') || n.id() === state.scopeShard.scope ? 6 : traced.has(n.id()) ? 5 : expanded ? 2 : 1 };
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
  for(const limit of [32,18]) {
    const shorter=candidates.filter(item=>!kept.has(item.id)&&item.name.length>limit);
    measureLabelVariants(shorter,item=>item.name.slice(0,limit-3)+'...');
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
      if (!state.visibleLabels || state.visibleLabels.has(n.id()) !== names.has(n.id())) {
        n.style({ 'text-opacity': names.has(n.id()) ? 1 : 0, 'text-events': names.has(n.id()) ? 'yes' : 'no' });
      }
    });
  });
  state.visibleLabels = names;
  state.labelBoxes=new Map([...kept.values()].map(n=>[n.id,n.box]));
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
    `${internal} within owners/groups${view.outside ? ` / ${view.outside} beyond view` : ''}${view.hidden ? ` / ${view.hidden} filtered` : ''}`;
  renderConfiguration();
  $('map-empty').hidden = view.nodes.length > 0;
  $('map-empty').textContent = 'No stars in this area. Use Fit map to return to the overview.';
}

function worldZoom() { return state.cy.zoom() * (state.renderScale || 1); }

function nodeGeometry(id,expanded,scale=state.renderScale||1) {
  const box=expanded&&state.universe.bounds.get(id);
  const p=box?{x:(box.x1+box.x2)/2,y:(box.y1+box.y2)/2}:state.universe.positions.get(id);
  return {position:{x:p.x*scale,y:p.y*scale},...(box?{spanX:(box.x2-box.x1)*scale,spanY:(box.y2-box.y1)*scale}:{})};
}

function beginViewportGesture() {
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
  if(gesture)beginViewportGesture();
  state.framing = true;
  cy.startBatch();
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
    (configurationVisible()||!map.isConfiguration(e))))top.push(map.root);
  const points=top.filter(id=>state.boundary||!map.nodes.get(id).boundary).map(id=>map.positions.get(id));
  if(!points.length)points.push(map.positions.get(map.root));
  frame({x1:Math.min(...points.map(p=>p.x)),y1:Math.min(...points.map(p=>p.y)),
    x2:Math.max(...points.map(p=>p.x)),y2:Math.max(...points.map(p=>p.y))});
  refreshMap();
}

function frameNode(id) {
  if (id === state.universe.root) { fitMap(); return; }
  const map = state.universe, p = map.positions.get(id), r = map.isGroup(id) ? map.radii.get(id) :
    (map.radii.get(map.nodes.get(id).parent) || 80) * 0.5;
  frame(map.isGroup(id)?map.bounds.get(id):{x1:p.x-r,y1:p.y-r,x2:p.x+r,y2:p.y+r},110,160/r);
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
  refreshMap(); fitMap(); state.positionCache.status();
}
