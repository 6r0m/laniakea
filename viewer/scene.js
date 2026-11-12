// SPDX-License-Identifier: AGPL-3.0-or-later
// Scene navigation changes detail and camera position without replacing the surrounding universe.
'use strict';

function zoomWithWheel(event) {
  if (!state.cy || state.drag) return;
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
    zoomAt(worldZoom()*factor,state.wheelPoint);
  });
}

function zoomAt(level, point) {
  if (state.drag) return;
  level = Math.max(state.cy.minZoom(),Math.min(state.cy.maxZoom(),level));
  const ratio = level/worldZoom(), pan = state.cy.pan();
  setWorldViewport(level,{x:point.x+(pan.x-point.x)*ratio,y:point.y+(pan.y-point.y)*ratio},true);
}

function fitOverview() {
  if (!state.cy) return;
  setSceneScope(state.universe.root);
  fitMap();
}

function rememberView() {
  if (!state.cy || !state.universe || state.framing) return;
  const scene = { target: state.target.id, run: state.target.run, expanded: [...state.universe.expanded],
    scope:state.scopeShard.scope,
    layout:$('layout').value,configuration:{...state.configuration},
    pan: { ...state.cy.pan() }, zoom: worldZoom(), size:{width:state.cy.width(),height:state.cy.height()} };
  history.replaceState({ scene }, '', hashFor(state.target.id, state.file));
}

function restoreView(scene) {
  const map = state.universe;
  if (!scene || scene.target !== state.target.id || scene.run !== state.target.run ||
      !Array.isArray(scene.expanded) || !scene.pan || !Number.isFinite(scene.pan.x) ||
      !Number.isFinite(scene.pan.y) || !Number.isFinite(scene.zoom)) return false;
  map.expanded = new Set(scene.expanded.filter(id => map.nodes.has(id) && map.isGroup(id)));
  map.expanded.add(map.root);
  if (scene.configuration && typeof scene.configuration==='object') {
    state.configuration=Object.fromEntries(Object.entries(scene.configuration).filter(([,value])=>typeof value==='boolean'));
  }
  if (scene.layout && [...($('layout').options||[])].some(option=>option.value===scene.layout) && $('layout').value!==scene.layout) {
    $('layout').value=scene.layout;layout();
  }
  refreshMap();
  if(scene.scope&&map.nodes.has(scene.scope))setSceneScope(scene.scope);
  const size = scene.size && Number.isFinite(scene.size.width) && Number.isFinite(scene.size.height) ? scene.size :
    {width:state.cy.width(),height:state.cy.height()};
  setWorldViewport(scene.zoom,{x:scene.pan.x+(state.cy.width()-size.width)/2,
    y:scene.pan.y+(state.cy.height()-size.height)/2});
  refreshMap();
  rememberView();
  return true;
}

function scopeFor(id) {
  const lookup=identity=>state.indexLookup ? state.indexLookup.get(identity) : state.index.nodes.find(n => n.id === identity);
  return lookup(id)||(state.universe.nodes.get(id)?.attrs?.presentation_group?
    lookup(state.universe.nodes.get(id).attrs.source_owner):null);
}

function setSceneScope(id) {
  const map = state.universe, entry = scopeFor(id);
  if (!entry) return;
  const n = map.nodes.get(id);
  state.file = entry.file;
  state.scopeShard = {scope:id,title:n.label,parents:map.paths.get(id).slice(0,-1).map(a => {
    const entry = scopeFor(a); return entry && {id:a,title:map.nodes.get(a).label,file:entry.file};
  }).filter(Boolean)};
  if (state.shard) Object.assign(state.shard, state.scopeShard);
  document.title = `${n.label} - Laniakea`;
  renderCrumbs(); rememberView();
}

function enterWheelScope(id, from=id) {
  const map=state.universe;
  if(from!==id){
    // A catalog portal changes world context, not its apparent footprint or screen location.
    const source=map.positions.get(from),bounds=map.bounds.get(id),p=map.positions.get(id),pan=state.cy.pan(),zoom=worldZoom();
    const center=map.isGroup(id)?{x:(bounds.x1+bounds.x2)/2,y:(bounds.y1+bounds.y2)/2}:p;
    const span=Math.max(bounds.x2-bounds.x1,bounds.y2-bounds.y1,2*map.radii.get(id));
    const level=Math.max(state.cy.minZoom(),Math.min(state.cy.maxZoom(),zoom*2*map.radii.get(from)/span));
    setWorldViewport(level,{x:source.x*zoom+pan.x-center.x*level,y:source.y*zoom+pan.y-center.y*level});
  }
  map.reveal(id);if(map.isGroup(id))map.expanded.add(id);
  setSceneScope(id);unfocus();refreshMap();
}

function semanticZoom(direction) {
  if (state.zoomFrame) cancelAnimationFrame(state.zoomFrame);
  state.zoomFrame = requestAnimationFrame(() => {
    state.zoomFrame = null;
    if (!state.pointer || !state.cy || state.drag) return;
    const map = state.universe, cy = state.cy, zoom = worldZoom(), pan = cy.pan();
    const detail=direction>0&&detailAtPointer(state.pointer);
    if(detail){
      const id=map.navigationTarget(detail)||detail;
      enterWheelScope(id,detail);rememberView();return;
    }
    const point = {x:(state.pointer.x-pan.x)/zoom,y:(state.pointer.y-pan.y)/zoom};
    let change, changed = false;
    for (let i = 0; i < map.nodes.size; i++) {
      change = map.zoomStep(zoom, point, direction);
      if (!change) break;
      changed = true;
      if(change.action==='definition'){
        enterWheelScope(change.id,change.from);break;
      }
      if (change.action === 'expand') {setSceneScope(change.id);break;}
      if (change.action === 'collapse') {
        if (map.contains(change.id, state.scopeShard.scope)) {
          setSceneScope(map.viewParents.get(change.id) || map.root);
        }
        break;
      }
    }
    if (changed) { unfocus(); refreshMap(); }
    rememberView();
  });
}

function toggleGroup(id) {
  const map = state.universe;
  if(map.regions.has(id)){selectNode(id);return;}
  const target=map.navigationTarget(id);
  if(target){
    map.reveal(target);if(map.isGroup(target))map.expanded.add(target);
    setSceneScope(target);unfocus();refreshMap();frameNode(target);rememberView();return;
  }
  if (!map.isGroup(id)) { selectNode(id); return; }
  rememberView();
  if (map.expanded.has(id) && id !== map.root) {
    map.expanded.delete(id);
    setSceneScope(map.viewParents.get(id) || map.root);
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
  state.selection=null;
  map.reveal(id);
  setSceneScope(id);
  refreshMap(); frameNode(id);
  if (inspect && id===map.root) renderDetails({...map.nodes.get(id),projectContext:true});
  else if (inspect) selectNode(id);
  else renderDetails(null);
}

function followReference(edge) {
  const map = state.universe;
  rememberView();
  const entry = scopeFor(edge.target);
  if (entry) history.pushState(null, '', hashFor(state.target.id, entry.file));
  const configuration=map.isConfiguration(edge);
  if(!configuration)state.hidden.delete(edge.type);
  state.pendingReference=configuration?{...edge,configurationInspection:true}:edge;
  if (map.nodes.get(edge.source).boundary || map.nodes.get(edge.target).boundary) state.boundary = true;
  map.reveal(edge.source); map.reveal(edge.target);
  setSceneScope(edge.target);
  refreshMap(); frameNode(edge.target);
  renderDetails(configuration?{...edge,refs:[edge],configurationInspection:true}:
    edge.internal_to_owner?map.nodes.get(edge.source):{...edge,refs:[edge]});
  state.pendingReference=null;
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
