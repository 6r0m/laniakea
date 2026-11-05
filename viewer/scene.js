// SPDX-License-Identifier: AGPL-3.0-or-later
// Scene navigation changes detail and camera position without replacing the surrounding universe.
'use strict';

function zoomWithWheel(event) {
  if (!state.cy) return;
  // Leave browser zoom available through Ctrl+wheel. Ordinary wheel input belongs to this canvas only.
  event.stopImmediatePropagation();
  if (event.ctrlKey || event.metaKey) return;
  event.preventDefault();
  const bounds = $('graph').getBoundingClientRect();
  state.pointer = {x:event.clientX-bounds.left,y:event.clientY-bounds.top};
  state.wheelPoint = state.pointer;
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? state.cy.height() : 1;
  state.wheelDelta = (state.wheelDelta || 0) + event.deltaY * unit;
  if (state.wheelFrame) return;
  state.wheelFrame = requestAnimationFrame(() => {
    state.wheelFrame = null;
    const factor = Math.exp(Math.max(-0.7,Math.min(0.7,-state.wheelDelta*0.0018)));
    state.wheelDelta = 0;
    state.cy.zoom({level:state.cy.zoom()*factor,renderedPosition:state.wheelPoint});
  });
}

function rememberView() {
  if (!state.cy || !state.universe || state.framing) return;
  const scene = { target: state.target.id, run: state.target.run, expanded: [...state.universe.expanded],
    pan: { ...state.cy.pan() }, zoom: state.cy.zoom(), size:{width:state.cy.width(),height:state.cy.height()} };
  history.replaceState({ scene }, '', hashFor(state.target.id, state.file));
}

function restoreView(scene) {
  const map = state.universe;
  if (!scene || scene.target !== state.target.id || scene.run !== state.target.run ||
      !Array.isArray(scene.expanded) || !scene.pan || !Number.isFinite(scene.pan.x) ||
      !Number.isFinite(scene.pan.y) || !Number.isFinite(scene.zoom)) return false;
  map.expanded = new Set(scene.expanded.filter(id => map.nodes.has(id) && map.isGroup(id)));
  map.expanded.add(map.root);
  refreshMap();
  state.framing = true;
  const size = scene.size && Number.isFinite(scene.size.width) && Number.isFinite(scene.size.height) ? scene.size :
    {width:state.cy.width(),height:state.cy.height()};
  state.cy.viewport({zoom:scene.zoom,pan:{x:scene.pan.x+(state.cy.width()-size.width)/2,
    y:scene.pan.y+(state.cy.height()-size.height)/2}});
  state.lastZoom = state.cy.zoom();
  state.framing = false;
  readableLabels();
  rememberView();
  return true;
}

function scopeFor(id) {
  return state.index.nodes.find(n => n.id === id);
}

function setSceneScope(id) {
  const map = state.universe, entry = scopeFor(id);
  if (!entry) return;
  const n = map.nodes.get(id);
  state.file = entry.file;
  state.scopeShard = {scope:id,title:n.label,parents:map.paths.get(id).slice(0,-1).map(a => {
    const entry = scopeFor(a); return entry && {title:map.nodes.get(a).label,file:entry.file};
  }).filter(Boolean)};
  if (state.shard) Object.assign(state.shard, state.scopeShard);
  document.title = `${n.label} - Laniakea`;
  renderCrumbs(); rememberView();
}

function semanticZoom(direction) {
  if (state.zoomFrame) cancelAnimationFrame(state.zoomFrame);
  state.zoomFrame = requestAnimationFrame(() => {
    state.zoomFrame = null;
    if (!state.pointer || !state.cy || state.drag) return;
    const map = state.universe, cy = state.cy, zoom = cy.zoom(), pan = cy.pan();
    const point = {x:(state.pointer.x-pan.x)/zoom,y:(state.pointer.y-pan.y)/zoom};
    let change, changed = false;
    for (let i = 0; i < map.nodes.size; i++) {
      change = map.zoomStep(zoom, point, direction);
      if (!change) break;
      changed = true;
      if (change.action === 'expand') setSceneScope(change.id);
      else if (map.contains(change.id, state.scopeShard.scope)) {
        setSceneScope(map.nodes.get(change.id).parent || map.root);
      }
    }
    if (changed) { unfocus(); refreshMap(); }
    rememberView();
  });
}

function toggleGroup(id) {
  const map = state.universe;
  if (!map.isGroup(id)) { selectNode(id); return; }
  rememberView();
  if (map.expanded.has(id) && id !== map.root) {
    map.expanded.delete(id);
    setSceneScope(map.nodes.get(id).parent || map.root);
    refreshMap();
  } else {
    map.reveal(id); map.expanded.add(id);
    setSceneScope(id); refreshMap(); frameNode(id);
  }
}

function flyToNode(id, inspect = true) {
  const map = state.universe;
  if (!map.nodes.has(id)) return;
  rememberView();
  const entry = scopeFor(id);
  if (entry) history.pushState(null, '', hashFor(state.target.id, entry.file));
  map.reveal(id);
  setSceneScope(id);
  refreshMap(); frameNode(id);
  if (inspect) selectNode(id);
}

function followReference(edge) {
  const map = state.universe;
  rememberView();
  const entry = scopeFor(edge.target);
  if (entry) history.pushState(null, '', hashFor(state.target.id, entry.file));
  state.hidden.delete(edge.type);
  if (map.nodes.get(edge.source).boundary || map.nodes.get(edge.target).boundary) state.boundary = true;
  map.reveal(edge.source); map.reveal(edge.target);
  setSceneScope(edge.target);
  refreshMap(); frameNode(edge.target);
  renderDetails({...edge,refs:[edge]});
}

function resizeMap() {
  if (!state.cy) return;
  const cy = state.cy, before = state.mapSize, pan = {...cy.pan()};
  cy.resize();
  const size = {width:cy.width(),height:cy.height()};
  if (before) cy.pan({x:pan.x+(size.width-before.width)/2,y:pan.y+(size.height-before.height)/2});
  state.mapSize = size;
  readableLabels();
}
