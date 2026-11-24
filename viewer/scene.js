// SPDX-License-Identifier: AGPL-3.0-or-later
// Scene navigation changes detail and camera position without replacing the surrounding universe.
'use strict';

// One cancellable camera flight owns explicit navigation; wheel and drag stay immediate.
function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function easeFlight(value) {
  return value * value * (3 - 2 * value);
}

function cancelPendingFlightFrames() {
  for (const key of ['wheelFrame', 'zoomFrame', 'viewportFrame']) {
    if (state[key] != null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(state[key]);
    state[key] = null;
  }
  state.wheelDelta = 0;
}

function releaseNavigationFlight(flight, remember = false, completed = false) {
  if (!flight || state.flight !== flight) return false;
  if (flight.frame != null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(flight.frame);
  flight.frame = null;
  if (state.viewportFrame != null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(state.viewportFrame);
    state.viewportFrame = null;
  }
  state.flight = null;
  state.framing = flight.previousFraming;
  if (!completed) state.pendingReference = null;
  if (remember && state.cy && state.universe) rememberView();
  return true;
}

function cancelNavigationFlight(options = {}) {
  return releaseNavigationFlight(state.flight, Boolean(options.remember));
}

function startNavigationFlight(target, options = {}) {
  const complete = typeof options.complete === 'function' ? options.complete : null;
  if (!state.cy || !target || !Number.isFinite(target.level) ||
      !target.pan || !Number.isFinite(target.pan.x) || !Number.isFinite(target.pan.y)) return false;
  cancelNavigationFlight();
  cancelPendingFlightFrames();
  const cy = state.cy;
  const destination = {
    level: Math.max(cy.minZoom(), Math.min(cy.maxZoom(), target.level)),
    pan: { x: target.pan.x, y: target.pan.y },
  };
  const start = { level: worldZoom(), pan: { ...cy.pan() } };
  const commit = options.commit !== false;

  if (prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
    const previous = state.framing;
    state.framing = true;
    try {
      setWorldViewport(destination.level, destination.pan, false);
      refreshMap();
    } finally {
      state.framing = previous;
    }
    if (commit) rememberView();
    if (complete) complete();
    return false;
  }

  const distance = Math.hypot(destination.pan.x - start.pan.x, destination.pan.y - start.pan.y);
  const zoomDistance = Math.abs(Math.log(Math.max(destination.level, Number.EPSILON) /
    Math.max(start.level, Number.EPSILON)));
  const duration = Math.max(180, Math.min(300, 180 + distance / 80 + zoomDistance * 40));
  const flight = {
    cy,
    generation: (state.flightGeneration || 0) + 1,
    frame: null,
    previousFraming: state.framing,
    start,
    target: destination,
    started: null,
    duration,
  };
  state.flightGeneration = flight.generation;
  state.flight = flight;
  state.framing = true;
  try {
    const projection=flightProjectionCut(destination,Array.isArray(options.force)?options.force:[]);
    if(projection)refreshMap(projection);
  } catch (error) {
    releaseNavigationFlight(flight, false, false);
    throw error;
  }

  const tick = time => {
    try {
      if (state.flight !== flight || flight.generation !== state.flightGeneration) return;
      if (state.cy !== cy || cy.destroyed()) {
        releaseNavigationFlight(flight, false);
        return;
      }
      if (flight.started === null) flight.started = time;
      const progress = flight.duration ? Math.min(1, Math.max(0, (time - flight.started) / flight.duration)) : 1;
      const eased = easeFlight(progress);
      const level = Math.exp(Math.log(start.level) +
        (Math.log(destination.level) - Math.log(start.level)) * eased);
      const pan = {
        x: start.pan.x + (destination.pan.x - start.pan.x) * eased,
        y: start.pan.y + (destination.pan.y - start.pan.y) * eased,
      };
      setWorldViewport(level, pan, false);
      if (progress < 1) {
        flight.frame = requestAnimationFrame(tick);
        return;
      }
      setWorldViewport(destination.level, destination.pan, false);
      if (state.viewportFrame != null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(state.viewportFrame);
        state.viewportFrame = null;
      }
      refreshMap();
      if (state.selection) renderDetails(state.selection,{reopen:false});
      releaseNavigationFlight(flight, commit, true);
      if (complete) complete();
    } catch (error) {
      releaseNavigationFlight(flight, false, false);
      throw error;
    }
  };
  try {
    flight.frame = requestAnimationFrame(tick);
  } catch (error) {
    releaseNavigationFlight(flight, false, false);
    throw error;
  }
  return true;
}

function zoomWithWheel(event) {
  if (!state.cy || state.drag) return;
  // Leave browser zoom available through Ctrl+wheel. Ordinary wheel input belongs to this canvas only.
  event.stopImmediatePropagation();
  if (event.ctrlKey || event.metaKey) return;
  cancelNavigationFlight();
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
  cancelNavigationFlight();
  level = Math.max(state.cy.minZoom(),Math.min(state.cy.maxZoom(),level));
  const ratio = level/worldZoom(), pan = state.cy.pan();
  setWorldViewport(level,{x:point.x+(pan.x-point.x)*ratio,y:point.y+(pan.y-point.y)*ratio},true);
}

function fitOverview() {
  if (!state.cy) return;
  cancelNavigationFlight();
  setSceneScope(state.universe.root);
  const camera=overviewCamera();
  if(camera) startNavigationFlight(camera,{force:[state.universe.root]});
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
  cancelNavigationFlight();
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
  cancelNavigationFlight();
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
  cancelNavigationFlight();
  const map = state.universe;
  if(map.regions.has(id)){selectNode(id);return;}
  const target=map.navigationTarget(id);
  if(target){
    map.reveal(target);if(map.isGroup(target))map.expanded.add(target);
    setSceneScope(target);unfocus();refreshMap();
    const camera=nodeFrameCamera(target);if(camera)startNavigationFlight(camera,{force:[target]});
    return;
  }
  if (!map.isGroup(id)) { selectNode(id); return; }
  rememberView();
  if (map.expanded.has(id) && id !== map.root) {
    map.expanded.delete(id);
    setSceneScope(map.viewParents.get(id) || map.root);
    refreshMap();
  } else {
    map.reveal(id); map.expanded.add(id);
    setSceneScope(id); refreshMap();
    const camera=nodeFrameCamera(id);if(camera)startNavigationFlight(camera,{force:[id]});
  }
}

function flyToNode(id, inspect = true) {
  cancelNavigationFlight();
  state.review?.closeComparison?.();
  const map = state.universe;
  if (!map.nodes.has(id)) return;
  rememberView();
  const entry = scopeFor(id);
  if (entry) history.pushState(null, '', hashFor(state.target.id, entry.file));
  state.selection=null;
  map.reveal(id);
  setSceneScope(id);
  refreshMap();
  const inspectTarget=()=>{
    if (inspect && id===map.root) renderDetails({...map.nodes.get(id),projectContext:true});
    else if (inspect) selectNode(id);
    else renderDetails(null);
  };
  const camera=nodeFrameCamera(id);
  if(camera)startNavigationFlight(camera,{force:[id],complete:inspectTarget});
  else inspectTarget();
}

function followReference(edge) {
  cancelNavigationFlight();
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
  refreshMap();
  const inspectReference=()=>{
    try{
      renderDetails(configuration?{...edge,refs:[edge],configurationInspection:true}:
        edge.internal_to_owner?map.nodes.get(edge.source):{...edge,refs:[edge]});
    }finally{
      state.pendingReference=null;
    }
  };
  const camera=nodeFrameCamera(edge.target);
  if(camera)startNavigationFlight(camera,{force:[edge.source,edge.target],complete:inspectReference});
  else inspectReference();
}

function resizeMap() {
  if (!state.cy) return;
  const cy = state.cy, before = state.mapSize, pan = {...cy.pan()};
  cy.resize();
  const size = {width:cy.width(),height:cy.height()};
  if (before) {
    const dx=(size.width-before.width)/2, dy=(size.height-before.height)/2;
    cy.pan({x:pan.x+dx,y:pan.y+dy});
    if (state.flight) {
      state.flight.start.pan.x += dx;
      state.flight.start.pan.y += dy;
      state.flight.target.pan.x += dx;
      state.flight.target.pan.y += dy;
    }
  }
  state.mapSize = size;
  readableLabels();
}
