// SPDX-License-Identifier: AGPL-3.0-or-later
// Rendering and camera operations use the folded projection; graph facts live in Universe.
'use strict';

function nodeMetadata(id) {
  const entry = state.indexLookup ? state.indexLookup.get(id) : state.index && state.index.nodes.find(n => n.id === id);
  if (entry) return entry;
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
  const entry = nodeMetadata(node.id), parts = [node.level];
  if (node.parent === null && !node.boundary) parts.push('root');
  else if (entry && entry.child_count) parts.push(`${entry.child_count} inside`);
  if (node.boundary) parts.push('external');
  const status=analysisStatus(node);if(status)parts.push(node.status==='not-in-target'?'outside target':status.toLowerCase());
  return parts.join(' / ');
}

function mapNode(node, members, drill) {
  const entry = nodeMetadata(node.id), group = entry && entry.child_count > 0 &&
    !(node.parent === null && !node.boundary);
  return { group: 'nodes', data: { id: node.id, label: node.label, caption:node.label },
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
    {selector:'edge.pair-inspected',style:{label:''}},
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
  cy.on('tap', 'edge', event => {
    const edge=state.shard.edges.find(e=>e.id===event.target.data('referenceId'));
    if(edge)inspectPair(edge.source,edge.target);
  });
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
  const drill = Object.fromEntries(state.index.nodes.map(n => [n.id, n.file]));
  state.shard = { ...state.scopeShard, ...view, members: [...members], drill };
  const nodes = view.nodes.map(n => {
    const item = mapNode(n, members, drill);
    if(configurationVisible()&&view.configurationMarks.has(n.id))item.classes+=' configured';
    const expanded = view.expanded.has(n.id) && n.id !== universe.root && universe.isGroup(n.id);
    const {position,...size}=nodeGeometry(n.id,expanded);
    item.pannable=expanded;
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
  const trace=ConnectionTrace.node(state.universe,state.shard,id);
  if(trace)showTraceReadout(trace);
}

function focus(elements) {
  state.cy.batch(() => {
    state.cy.elements('.focus').not(elements).removeClass('focus');
    elements.not('.focus').addClass('focus');
  });
}

function preview(element, pointer = state.pointer) {
  if (state.drag || state.gestureActive) return;
  if(element.isNode() && element.hasClass('expanded')) {
    const box=state.labelBoxes?.get(element.id()),p=pointer;
    if(!box||!p||p.x<box.x1||p.x>box.x2||p.y<box.y1||p.y>box.y2){
      if(element.hasClass('hovered'))unfocus();return;
    }
  }
  const edge=element.isEdge()&&state.shard.edges.find(e=>e.id===element.data('referenceId'));
  if(element.isEdge()&&!edge)return;
  const key=edge?ConnectionTrace.key(edge.source,edge.target):JSON.stringify(['node',element.id()]);
  if(state.trace?.key===key) {
    state.cy.elements('.hovered').not(element).removeClass('hovered');element.addClass('hovered');return;
  }
  const cy = state.cy;
  // Native node and edge hover events can overlap; an old target must not clear a newer trace.
  state.trace=edge?ConnectionTrace.pair(state.shard,edge.source,edge.target):ConnectionTrace.node(state.universe,state.shard,element.id());
  if(!state.trace)return;
  cy.batch(()=>{
    cy.elements('.hovered,.trace-endpoint,.trace-outgoing,.trace-incoming,.trace-within,.trace-both,.trace-reciprocal')
      .removeClass('hovered trace-endpoint trace-outgoing trace-incoming trace-within trace-both trace-reciprocal');
    element.addClass('hovered');
    if (element.isNode()) {
      const family = cy.nodes().filter(n => state.universe.contains(element.id(), n.id()));
      const edges = family.connectedEdges();
      focus(family.union(edges).union(edges.connectedNodes()));
    } else {
      const family=cy.edges().filter(e=>state.trace.roles.has(e.data('referenceId')));
      family.connectedNodes().addClass('trace-endpoint');
      focus(family.union(family.connectedNodes()));
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

function traceSummary(trace) {
  if(trace.kind==='node') {
    const node=state.universe.nodes.get(trace.source),totals=state.universe.referenceStats.get(node.id);
    return {title:node.label,description:nodeDescription(node),path:traceName(node.id),
      scope:node.id===state.universe.root?'Project/subtree statistics: all recorded references':'All recorded references in this snapshot',
      rows:[['Outgoing references recorded',totals.outgoing,'outgoing'],['Incoming references recorded',totals.incoming,'incoming'],
        ['Within / self references recorded',totals.within,'within']].map(row=>[...row,state.universe.configurationStats.get(node.id)[row[2]]]),
      notes:[!totals.incoming&&'No incoming references recorded in this snapshot.',analysisHint(node),
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
  for(const [name,count,role,configuration] of summary.rows) {
    const row=el('div',null,{class:'hover-row trace-'+role});
    row.append(el('span',name),el('strong',`${count} ${count===1?'ref':'refs'}`,{class:'hover-count'}));rows.append(row);
    if(configuration){
      const subset=el('div',null,{class:'hover-row configuration-subset'});
      subset.append(el('span','Of which: project configuration'),el('span',configuration));rows.append(subset);
    }
  }
  card.replaceChildren(el('strong',summary.title,{class:'hover-name'}),el('small',summary.description,{class:'hover-context'}));
  if(summary.path)card.append(el('small',summary.path,{class:'hover-context hover-path'}));
  card.append(el('small',summary.scope,{class:'hover-context'}),rows,
    ...summary.notes.map(note=>el('small',note,{class:'hover-context'})));
  const cy=state.cy,node=cy.getElementById(trace.source),anchor=trace.kind==='node'&&!node.hasClass('expanded')?
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
  if(trace.kind==='node') {
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
  $('hover-card').hidden=true;
  if(state.cy)state.cy.elements('.faded,.focus,.hovered,.trace-endpoint,.trace-outgoing,.trace-incoming,.trace-within,.trace-both,.trace-reciprocal')
    .removeClass('faded focus hovered trace-endpoint trace-outgoing trace-incoming trace-within trace-both trace-reciprocal');
  state.trace=null;
  $('map-tooltip').hidden=false;
  $('map-tooltip').textContent=analysisHint(state.universe?.nodes.get(state.scopeShard?.scope))||
    'Hover a star or connection to trace references in this view.';
}

function unfocus(clearReadout = false) {
  $('hover-card').hidden=true;
  if (state.cy) {
    const marked=state.cy.elements('.faded,.focus,.hovered,.trace-endpoint,.trace-outgoing,.trace-incoming,.trace-within,.trace-both,.trace-reciprocal');
    if(marked.length){marked.removeClass('faded focus hovered trace-endpoint trace-outgoing trace-incoming trace-within trace-both trace-reciprocal');readableLabels();}
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
      cy.nodes().style({ 'font-size': 13 / zoom, 'text-max-width': 150 / zoom,
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
      // Captions revealed by pair tracing must not take the connection's pointer hit.
      const hit=names.has(n.id())&&!n.hasClass('trace-endpoint')?'yes':'no';
      if (!state.visibleLabels || state.visibleLabels.has(n.id()) !== names.has(n.id()) || n.style('text-events')!==hit) {
        n.style({ 'text-opacity': names.has(n.id()) ? 1 : 0, 'text-events': hit });
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
    `${internal} within owners/groups${view.outside ? ` / ${view.outside} beyond view` : ''}`+
    (state.universe.configurationCount?` / ${state.universe.configurationCount} project configuration`:'')+
    (view.hidden>state.universe.configurationCount?` / ${view.hidden-state.universe.configurationCount} filtered`:'');
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
