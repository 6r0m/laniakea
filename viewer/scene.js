// SPDX-License-Identifier: AGPL-3.0-or-later
// Scene navigation changes detail and camera position without replacing the surrounding universe.
'use strict';

function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function easeFlight(value) {
  return value * value * (3 - 2 * value);
}

function cancelQueuedViewportWork() {
  for (const key of ['zoomFrame', 'viewportFrame']) {
    if (state[key] != null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(state[key]);
    state[key] = null;
  }
}

function releaseNavigationFlight(flight, remember = false, completed = false, restoreProjection = true) {
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
  // The flight owns an enlarged pre-projection. Settle it against the actual
  // interrupted camera through the ordinary projection owner. Renderer replacement
  // and completion deliberately skip this refresh.
  if (restoreProjection && !completed && state.cy === flight.cy && state.cy && !state.cy.destroyed() && state.universe) {
    refreshMap();
  }
  if (remember && state.cy && state.universe) rememberView();
  return true;
}

function cancelNavigationFlight(options = {}) {
  return releaseNavigationFlight(state.flight, Boolean(options.remember), false, options.restore !== false);
}

function startNavigationFlight(target, options = {}) {
  const complete = typeof options.complete === 'function' ? options.complete : null;
  if (!state.cy || !target || !Number.isFinite(target.level) ||
      !target.pan || !Number.isFinite(target.pan.x) || !Number.isFinite(target.pan.y)) return false;
  cancelNavigationFlight({restore:false});
  cancelWheelMotion(false);
  cancelQueuedViewportWork();
  const cy = state.cy;
  const destination = {
    level: Math.max(cy.minZoom(), Math.min(cy.maxZoom(), target.level)),
    pan: { x: target.pan.x, y: target.pan.y },
  };
  const start = { level: worldZoom(), pan: { ...cy.pan() } };
  const startCenter = cameraCenter(start.level, start.pan, cy.width(), cy.height());
  const targetCenter = cameraCenter(destination.level, destination.pan, cy.width(), cy.height());
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
    startCenter,
    target: destination,
    targetCenter,
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
      const center = {
        x: flight.startCenter.x + (flight.targetCenter.x - flight.startCenter.x) * eased,
        y: flight.startCenter.y + (flight.targetCenter.y - flight.startCenter.y) * eased,
      };
      const pan = cameraPanAt(center, level, cy.width(), cy.height());
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
  event.preventDefault();
  const bounds = $('graph').getBoundingClientRect();
  state.pointer = {x:event.clientX-bounds.left,y:event.clientY-bounds.top};
  const cy = state.cy, unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? cy.height() : 1;
  const delta = -event.deltaY * unit * 0.0018;
  if (!Number.isFinite(delta) || !delta) return;
  cancelNavigationFlight();
  if (prefersReducedMotion()) {
    zoomAt(worldZoom()*Math.exp(delta),state.pointer);
    return;
  }
  if (!state.wheel) {
    cancelQueuedViewportWork();
    state.wheel = {cy, map:state.universe, target:Math.log(worldZoom()), frame:null, time:null, portal:null, detail:true};
  }
  const wheel = state.wheel;
  if (delta < 0 && wheel.portal) {
    abandonWheelPortal(wheel);
    refreshMap();
  }
  wheel.point = state.pointer;
  wheel.client = {x:event.clientX,y:event.clientY};
  wheel.detail = true;
  wheel.target = clampWheelLog(cy,wheel.target+delta);
  queueWheelFrame(wheel);
}

function clampWheelLog(cy, level) {
  return Math.max(Math.log(cy.minZoom()),Math.min(Math.log(cy.maxZoom()),level));
}

function cancelWheelMotion(restore = true) {
  const wheel = state.wheel;
  if (!wheel) return;
  state.wheel = null;
  if (wheel.frame !== null) cancelAnimationFrame(wheel.frame);
  if (!wheel.cy.destroyed()) wheel.frontier?.nodes.removeStyle('opacity');
  const staged = abandonWheelPortal(wheel);
  if (restore && wheel.cy === state.cy && wheel.map === state.universe && !wheel.cy.destroyed()) {
    if (staged) refreshMap();
    else rememberView();
  }
}

function abandonWheelPortal(wheel) {
  if (!wheel.portal) return false;
  wheel.map.expanded = wheel.portal.expanded;
  wheel.portal = null;
  return true;
}

function queueWheelFrame(wheel) {
  if (wheel.frame !== null) return;
  try {
    wheel.frame = requestAnimationFrame(time => advanceWheel(wheel,time));
  } catch (error) {
    cancelWheelMotion();
    throw error;
  }
}

function advanceWheel(wheel, time) {
  if (state.wheel !== wheel) return;
  wheel.frame = null;
  if (state.cy !== wheel.cy || state.universe !== wheel.map || wheel.cy.destroyed() || state.drag) {
    cancelWheelMotion(false);
    return;
  }
  try {
    const elapsed = wheel.time === null ? 7 : time-wheel.time;
    // Keep the target accumulating between paints on high-refresh displays.
    if (elapsed < 5) {
      queueWheelFrame(wheel);
      return;
    }
    const before = worldZoom(), from = Math.log(before), point = state.pointer || wheel.point;
    const dt = Math.min(20,elapsed);
    const fraction = 1-Math.exp(-dt/43);
    wheel.time = time;
    if (wheel.frontier) {
      const frontier = wheel.frontier;
      frontier.elapsed += dt;
      if (frontier.elapsed>=105) {
        frontier.nodes.removeStyle('opacity');
        wheel.frontier = null;
      } else frontier.nodes.style('opacity',0.25+0.75*easeFlight(frontier.elapsed/105));
    }
    const distance = wheel.target-from;
    const remaining = Math.abs(distance);
    const easedStep = remaining < 0.001 ? remaining : remaining*fraction;
    const step = Math.sign(distance)*Math.min(easedStep,0.045,dt*0.0034);
    const pan = wheel.cy.pan(), anchor = {x:(point.x-pan.x)/before,y:(point.y-pan.y)/before};
    const portal = wheel.portal;
    let adjustment = 0;
    if (portal) {
      portal.elapsed = Math.min(portal.duration,portal.elapsed+dt);
      const progress = easeFlight(portal.elapsed/portal.duration);
      const travel = progress-portal.progress;
      portal.progress = progress;
      adjustment = portal.log*travel;
      anchor.x += portal.x*travel;
      anchor.y += portal.y*travel;
      wheel.target = clampWheelLog(wheel.cy,wheel.target+adjustment);
      if (progress===1) wheel.portal = null;
    }
    const level = Math.exp(clampWheelLog(wheel.cy,from+step+adjustment));
    if (step || portal) setWorldViewport(level,{x:point.x-anchor.x*level,y:point.y-anchor.y*level},true);
    if (!portal && step && wheel.detail && applySemanticZoom(Math.sign(step),point,wheel)) wheel.detail=false;
    if (portal && !wheel.portal) {
      setSceneScope(portal.id);
      refreshMap();
    }
    if (!wheel.portal) scheduleViewport();
    if (wheel.portal || wheel.frontier || step!==distance) queueWheelFrame(wheel);
    else cancelWheelMotion(false);
  } catch (error) {
    cancelWheelMotion();
    throw error;
  }
}

function zoomAt(level, point) {
  if (state.drag) return;
  cancelWheelMotion();
  cancelNavigationFlight();
  level = Math.max(state.cy.minZoom(),Math.min(state.cy.maxZoom(),level));
  const ratio = level/worldZoom(), pan = state.cy.pan();
  setWorldViewport(level,{x:point.x+(pan.x-point.x)*ratio,y:point.y+(pan.y-point.y)*ratio},true);
}

function fitOverview() {
  if (!state.cy) return;
  cancelNavigationFlight();
  cancelWheelMotion();
  setSceneScope(state.universe.root);
  const camera=overviewCamera();
  if(camera) startNavigationFlight(camera,{force:[state.universe.root]});
}

function rememberView() {
  if (!state.cy || !state.universe || state.framing || state.wheel) return;
  const scene = { target: state.target.id, run: state.target.run, expanded: [...state.universe.expanded],
    scope:state.scopeShard.scope,
    layout:$('layout').value,configuration:{...state.configuration},
    pan: { ...state.cy.pan() }, zoom: worldZoom(), size:{width:state.cy.width(),height:state.cy.height()} };
  history.replaceState({ scene }, '', hashFor(state.target.id, state.file));
}

function restoreView(scene) {
  cancelNavigationFlight();
  cancelWheelMotion();
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

function rememberDepartedGroup(next) {
  const map = state.universe;
  const from = map?.paths.get(state.scopeShard?.scope), to = map?.paths.get(next);
  if (!from || !to) return;
  const departed = from.find(id => id!==map.root && !to.includes(id) && map.isGroup(id));
  if (departed) state.lastVisitedGroup = departed;
}

function setSceneScope(id) {
  const map = state.universe, entry = scopeFor(id);
  if (!entry) return;
  rememberDepartedGroup(id);
  const n = map.nodes.get(id);
  state.file = entry.file;
  state.scopeShard = {scope:id,title:n.label,parents:map.paths.get(id).slice(0,-1).map(a => {
    const entry = scopeFor(a); return entry && {id:a,title:map.nodes.get(a).label,file:entry.file};
  }).filter(Boolean)};
  if (state.shard) Object.assign(state.shard, state.scopeShard);
  document.title = `${n.label} - Laniakea`;
  renderCrumbs(); rememberView();
}

function enterWheelScope(id, from=id, wheel=null, point=null) {
  const map=state.universe;
  let projection=null;
  if(from!==id){
    const source=map.positions.get(from),bounds=map.bounds.get(id),p=map.positions.get(id),pan=state.cy.pan(),zoom=worldZoom();
    const center=map.isGroup(id)?{x:(bounds.x1+bounds.x2)/2,y:(bounds.y1+bounds.y2)/2}:p;
    const span=Math.max(bounds.x2-bounds.x1,bounds.y2-bounds.y1,2*map.radii.get(id));
    const level=Math.max(state.cy.minZoom(),Math.min(state.cy.maxZoom(),zoom*2*map.radii.get(from)/span));
    const destination={level,pan:{x:source.x*zoom+pan.x-center.x*level,y:source.y*zoom+pan.y-center.y*level}};
    if (wheel) {
      // The same point in the source and destination footprints remains under the cursor at handoff.
      wheel.portal={id,expanded:new Set(map.expanded),log:Math.log(level/zoom),
        x:(point.x-destination.pan.x)/level-(point.x-pan.x)/zoom,
        y:(point.y-destination.pan.y)/level-(point.y-pan.y)/zoom};
      Object.assign(wheel.portal,{elapsed:0,progress:0,
        duration:Math.min(340,210+Math.hypot(wheel.portal.x,wheel.portal.y)*zoom/16)});
      const target=Math.exp(clampWheelLog(wheel.cy,wheel.target+wheel.portal.log));
      const finalPan={x:point.x-(point.x-destination.pan.x)*target/level,
        y:point.y-(point.y-destination.pan.y)*target/level};
      projection=flightProjectionCut({level:target,pan:finalPan},[from,id]);
    } else setWorldViewport(destination.level,destination.pan);
  }
  map.reveal(id);if(map.isGroup(id))map.expanded.add(id);
  if (!wheel?.portal) setSceneScope(id);
  unfocus();refreshWheelProjection(wheel,projection);
}

function refreshWheelProjection(wheel, cut=null) {
  const added = refreshMap(cut);
  if (!wheel || !added?.length) return;
  wheel.frontier?.nodes.removeStyle('opacity');
  const nodes=added.nodes();
  wheel.frontier={nodes,elapsed:0};
  nodes.style('opacity',0.25);
}

function semanticZoom(direction) {
  cancelNavigationFlight();
  if (state.zoomFrame) cancelAnimationFrame(state.zoomFrame);
  state.zoomFrame = requestAnimationFrame(() => {
    state.zoomFrame = null;
    applySemanticZoom(direction,state.pointer);
    rememberView();
  });
}

function applySemanticZoom(direction, pointer, wheel=null) {
  if (!pointer || !state.cy || state.drag) return false;
  const map = state.universe, zoom = worldZoom(), pan = state.cy.pan();
  const detail = direction>0 && detailAtPointer(pointer);
  if (detail) {
    enterWheelScope(map.navigationTarget(detail)||detail,detail,wheel,pointer);
    return true;
  }
  const point = {x:(pointer.x-pan.x)/zoom,y:(pointer.y-pan.y)/zoom};
  const change = map.zoomStep(zoom,point,direction);
  if (!change) return false;
  if (change.action==='definition') {
    if (wheel) map.expanded.delete(change.from);
    enterWheelScope(change.id,change.from,wheel,pointer);
  }
  else {
    if (change.action==='expand') setSceneScope(change.id);
    else if (map.contains(change.id,state.scopeShard.scope)) setSceneScope(map.viewParents.get(change.id)||map.root);
    unfocus();refreshWheelProjection(wheel);
  }
  return true;
}

function toggleGroup(id) {
  cancelNavigationFlight();
  cancelWheelMotion();
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
  cancelWheelMotion();
  state.review?.closeComparison?.();
  const map = state.universe;
  if (!map.nodes.has(id)) return;
  rememberView();
  const entry = scopeFor(id);
  if (entry) history.pushState(null, '', hashFor(state.target.id, entry.file));
  state.selection=null;
  map.reveal(id);
  setSceneScope(id);
  const inspectTarget=()=>{
    if (inspect && id===map.root) renderDetails({...map.nodes.get(id),projectContext:true});
    else if (inspect) selectNode(id);
    else renderDetails(null);
  };
  const camera=nodeFrameCamera(id);
  if(camera)startNavigationFlight(camera,{force:[id],complete:inspectTarget});
  else {refreshMap();inspectTarget();}
}

function followReference(edge) {
  cancelNavigationFlight();
  cancelWheelMotion();
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
  if (state.wheel) {
    const {left,top}=$('graph').getBoundingClientRect(),{x,y}=state.wheel.client;
    state.wheel.point={x:x-left,y:y-top};
    if (state.pointer) state.pointer=state.wheel.point;
  }
  readableLabels();
}
