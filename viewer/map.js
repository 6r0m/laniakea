// SPDX-License-Identifier: AGPL-3.0-or-later
// Rendering and camera operations use the folded projection; graph facts live in Universe.
'use strict';

function nodeMetadata(id) {
  const entry = state.index && state.index.nodes.find(n => n.id === id);
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
  const caption = compact && !members.has(node.id) && !group ? node.label : `${node.label}\n${nodeDescription(node)}`;
  return { group: 'nodes', data: { id: node.id, label: node.label, caption },
    classes: [members.has(node.id) && 'member', group && 'group', drill[node.id] && 'openable',
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
    { selector: 'node.boundary', style: { shape: 'diamond', 'background-color': css('--external'),
      'border-color': css('--external') } },
    { selector: 'node.not-in-target', style: { 'background-opacity': 0.15, 'border-style': 'dashed' } },
    { selector: 'node.not-analysed', style: { 'border-style': 'dotted' } },
    { selector: 'node.expanded', style: { shape: 'roundrectangle', 'background-opacity': 0.025,
      'border-opacity': 0.35, 'border-width': 1, 'underlay-opacity': 0, padding: 28,
      'text-valign': 'top', 'text-halign': 'center', 'text-margin-y': -8, 'font-weight': 600,
      'compound-sizing-wrt-labels': 'exclude', 'z-compound-depth': 'bottom' } },
    { selector: 'edge', style: { width: 1, 'line-color': 'data(color)', 'target-arrow-color': 'data(color)',
      'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'arrow-scale': 0.7, opacity: 0.3 } },
    { selector: 'edge.derived', style: { 'line-style': 'dashed', width: 'mapData(weight, 1, 100, 1, 3)',
      label: 'data(count)', color: css('--muted'), 'font-size': 11, 'text-background-color': css('--bg'),
      'text-background-opacity': 0.9, 'text-background-padding': 2 } },
    { selector: '.faded', style: { opacity: 0.3 } },
    { selector: 'edge:selected', style: { opacity: 0.7, 'underlay-color': css('--selection'),
      'underlay-opacity': 0.15, 'underlay-padding': 3 } },
    { selector: 'edge.focus', style: { width: 2.5, opacity: 1, 'z-index': 5 } },
    { selector: 'node:selected', style: { 'border-color': css('--selection'), 'border-width': 3 } },
  ];
}

function renderGraph() {
  clearTimeout(state.inspectTimer);
  for (const key of ['zoomFrame', 'wheelFrame']) {
    if (state[key]) cancelAnimationFrame(state[key]);
    state[key] = null;
  }
  state.pointer = null; state.wheelDelta = 0; state.drag = null;
  if (state.cy) state.cy.destroy();
  state.cy = cytoscape({ container: $('graph'), elements: [], style: style(),
    minZoom: 0.015, maxZoom: 20000 });
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
  cy.on('mouseover', 'node, edge', event => preview(event.target));
  cy.on('mouseout', 'node, edge', () => unfocus());
  cy.on('zoom', () => {
    readableLabels();
    const zoom = cy.zoom(), direction = Math.sign(zoom - (state.lastZoom || zoom));
    state.lastZoom = zoom;
    if (!state.framing && direction && state.pointer) semanticZoom(direction);
  });
  cy.on('pan', () => { unfocus(); rememberView(); });
  cy.on('grabon', 'node', event => {
    state.drag = { id: event.target.id(), start: { ...event.target.position() } };
    $('graph').classList.add('dragging');
  });
  cy.on('freeon', 'node', event => {
    const drag = state.drag, node = event.target;
    $('graph').classList.remove('dragging');
    state.drag = null;
    if (!drag || drag.id !== node.id()) return;
    const dx = node.position('x') - drag.start.x, dy = node.position('y') - drag.start.y;
    if (!dx && !dy) return;
    const patch = state.universe.translate(node.id(), dx, dy, node.id() !== state.universe.root);
    state.positionCache.moveMany($('layout').value, patch);
    readableLabels();
  });
  layout();
}

function refreshMap() {
  clearTimeout(state.inspectTimer);
  state.drag = null;
  $('graph').classList.remove('dragging');
  const universe = state.universe, cy = state.cy;
  const view = universe.project(state.hidden, state.boundary);
  const ids = new Set(view.nodes.map(n => n.id));
  const members = new Set(view.nodes.filter(n => !n.boundary).map(n => n.id));
  const drill = Object.fromEntries(state.index.nodes.map(n => [n.id, n.file]));
  state.shard = { ...state.scopeShard, ...view, members: [...members], drill };
  const nodes = view.nodes.map(n => {
    const item = mapNode(n, members, drill);
    const expanded = universe.expanded.has(n.id) && n.id !== universe.root && universe.isGroup(n.id);
    if (expanded) {
      item.classes += ' expanded'; item.data.caption = `${n.label}\n${n.level}`;
    } else {
      const internal = view.internal.get(n.id);
      if (internal && internal.length) item.data.caption += `\n${internal.length} refs within`;
    }
    if (n.parent !== universe.root && ids.has(n.parent) && universe.expanded.has(n.parent)) item.data.parent = n.parent;
    item.position = { ...universe.positions.get(n.id) };
    return item;
  });
  const edges = view.edges.map(e => ({ group: 'edges', data: { id: universe.renderPrefix + e.id,
    referenceId: e.id, source: e.source, target: e.target,
    type: e.type, color: colorOf(e.type), weight: e.refs.length, count: e.refs.length > 1 ? String(e.refs.length) : '' },
    classes: e.status }));
  // Rebuild only rendered elements. The camera and every world coordinate belong to the continuing scene.
  cy.batch(() => { cy.elements().remove(); cy.add([...nodes, ...edges]); });
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
    state.cy.elements().removeClass('focus').addClass('faded');
    elements.removeClass('faded').addClass('focus');
  });
  readableLabels();
}

function preview(element) {
  if (state.drag) return;
  const cy = state.cy;
  if (element.isNode()) {
    const family = cy.nodes().filter(n => state.universe.contains(element.id(), n.id()));
    const edges = family.connectedEdges();
    focus(family.union(edges).union(edges.connectedNodes()));
    element.addClass('hovered');
    const node = state.universe.nodes.get(element.id()), refs = state.universe.references(node.id);
    const outgoing = refs.filter(e => state.universe.contains(node.id, e.source)).length;
    const incoming = refs.filter(e => state.universe.contains(node.id, e.target)).length;
    showTooltip(`${node.label} (${node.level})`, `${outgoing} outgoing / ${incoming} incoming` +
      (node.boundary ? ' / further external dependencies not analysed' : ''), element.renderedPosition());
  } else {
    focus(element.union(element.connectedNodes()));
    const edge = state.shard.edges.find(e => e.id === element.data('referenceId'));
    showTooltip(`${label(edge.source)} -> ${label(edge.target)}`, `${edge.refs.length} exact reference(s) / ` +
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
  if (state.cy) { state.cy.elements().removeClass('faded focus hovered'); readableLabels(); }
  $('map-tooltip').hidden = true;
}

function applyFilters() {
  if (state.cy) { unfocus(); refreshMap(); }
}

function readableLabels() {
  if (!state.cy || state.styling) return;
  state.styling = true;
  const cy = state.cy, zoom = cy.zoom(), leaves = cy.nodes().not('.expanded');
  cy.batch(() => {
    cy.nodes().style({ 'font-size': 13 / zoom, 'text-max-width': 150 / zoom, 'text-background-padding': 3 / zoom,
      'border-width': n => (n.selected() ? 3 : n.hasClass('expanded') ? 1 : n.hasClass('group') ? 2 : 1) / zoom });
    const diameter = n => n.hasClass('group') ?
      Math.max(27, Math.min(100, 2 * state.universe.radii.get(n.id()) * zoom * 0.3)) : n.hasClass('member') ? 15 : 11;
    leaves.style({ width: n => diameter(n) / zoom,
      height: n => diameter(n) / zoom,
      'underlay-padding': 6 / zoom,
      'text-halign': n => n.renderedPosition('x') < 155 ? 'right' : n.renderedPosition('x') > cy.width() - 155 ? 'left' : 'center',
      'text-valign': 'bottom', 'text-margin-y': 8 / zoom });
    cy.nodes('.expanded').style({ padding: 26 / zoom, 'text-margin-y': -8 / zoom });
    cy.edges().style({ 'font-size': 11 / zoom, 'underlay-padding': 3 / zoom });
    cy.edges().style({ width: e => (e.hasClass('focus') ? 2.5 : Math.min(2.5, 1 + Math.log10(e.data('weight')) * 0.6)) / zoom,
      'arrow-scale': 0.7 / zoom, 'line-dash-pattern': [6 / zoom, 4 / zoom] });
  });
  declutterLabels();
  state.styling = false;
}

function nonOverlappingLabels(candidates) {
  const kept = [], ids = new Set();
  for (const item of candidates.sort((a, b) => b.priority - a.priority)) {
    const a = item.box;
    if (kept.some(b => a.x1 < b.x2 + 4 && a.x2 + 4 > b.x1 && a.y1 < b.y2 + 4 && a.y2 + 4 > b.y1)) continue;
    kept.push(a); ids.add(item.id);
  }
  return ids;
}

function declutterLabels() {
  if (!state.cy) return;
  const cy = state.cy;
  const candidates = cy.nodes().map(n => {
    const lines = n.data('caption').split('\n'), width = Math.min(150, Math.max(...lines.map(s => s.length)) * 7);
    const height = lines.reduce((sum, s) => sum + Math.max(1, Math.ceil(s.length * 7 / 150)) * 15, 0);
    const p = n.renderedPosition(), expanded = n.hasClass('expanded');
    const x = expanded || n.style('text-halign') === 'center' ? p.x - width / 2 :
      n.style('text-halign') === 'right' ? p.x + n.renderedWidth()/2 : p.x - n.renderedWidth()/2 - width;
    const y = expanded ? n.renderedBoundingBox({includeLabels:false,includeOverlays:false,includeUnderlays:false}).y1 - height - 8 :
      p.y + n.renderedHeight()/2 + 8;
    return { id: n.id(), box: { x1:x, y1:y, x2:x+width, y2:y+height },
      priority: n.hasClass('hovered') || n.selected() ? 5 : n.hasClass('match') || n.id() === state.scopeShard.scope ? 4 : expanded ? 2 : 1 };
  });
  const names = nonOverlappingLabels(candidates.filter(n => n.box.x1 >= 0 && n.box.y1 >= 0 &&
    n.box.x2 <= cy.width() && n.box.y2 <= cy.height()));
  cy.batch(() => cy.nodes().forEach(n => n.style({ 'text-opacity': names.has(n.id()) ? 1 : 0,
    'text-events': names.has(n.id()) ? 'yes' : 'no' })));
}

function galaxyPositions(nodes, width, height) {
  const members = nodes.filter(n => n.hasClass('member')), context = nodes.filter(n => !n.hasClass('member'));
  const positions = new Map(), aspect = Math.max(0.75, Math.min(1.6, width / Math.max(height, 1)));
  const radius = members.length === 1 ? 0 : Math.max(170, Math.min(24, members.length) * 18);
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
  return positions;
}

function updateScopeSummary() {
  const view = state.shard;
  const exact = view.edges.reduce((sum, e) => sum + e.refs.length, 0);
  const internal = [...view.internal.values()].reduce((sum, refs) => sum + refs.length, 0);
  $('scope-summary').textContent = `${view.nodes.length} stars & constellations / ${exact} references / ` +
    `${internal} inside collapsed groups${view.hidden ? ` / ${view.hidden} filtered` : ''}`;
  $('map-empty').hidden = view.nodes.length > 0;
  $('map-empty').textContent = 'No stars are visible. Change the filters to reveal the map.';
}

function frame(bounds, padding = 75, maxZoom = 1.2) {
  state.framing = true;
  const cy = state.cy;
  const zoom = Math.max(cy.minZoom(), Math.min(maxZoom, cy.maxZoom(),
    Math.max(10, cy.width() - 2 * padding) / Math.max(1, bounds.x2 - bounds.x1),
    Math.max(10, cy.height() - 2 * padding) / Math.max(1, bounds.y2 - bounds.y1)));
  cy.viewport({zoom, pan:{x:cy.width()/2-(bounds.x1+bounds.x2)*zoom/2,
    y:cy.height()/2-(bounds.y1+bounds.y2)*zoom/2}});
  state.lastZoom = state.cy.zoom();
  state.framing = false;
  readableLabels(); rememberView();
}

function fitMap() {
  if (!state.cy || !state.cy.nodes().length) return;
  frame(state.cy.elements().boundingBox({includeLabels:false,includeOverlays:false,includeUnderlays:false}));
}

function frameNode(id) {
  if (id === state.universe.root) { fitMap(); return; }
  const map = state.universe, p = map.positions.get(id), r = map.isGroup(id) ? map.radii.get(id) :
    Math.max(8, (map.radii.get(map.nodes.get(id).parent) || 80) * 0.5);
  frame({ x1:p.x-r, y1:p.y-r, x2:p.x+r, y2:p.y+r, w:r*2, h:r*2 }, 110, 160 / r);
}

function layout() {
  if (!state.cy) return;
  const map = state.universe, mode = $('layout').value;
  const top = [...map.childIds(map.root), ...map.childIds(null).filter(id => id !== map.root)];
  const fake = top.map(id => ({id:()=>id,hasClass:()=>!map.nodes.get(id).boundary}));
  let positions = galaxyPositions(fake, state.cy.width(), state.cy.height());
  if (mode !== 'auto') {
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
