// SPDX-License-Identifier: AGPL-3.0-or-later
// Levels, edge types and sources come from the manifest; Universe owns the continuing map.
'use strict';

const PALETTE = ['#4e79a7', '#f28e2b', '#59a14f', '#e15759', '#76b7b2', '#b07aa1', '#9c755f', '#edc948', '#ff9da7', '#bab0ac'];
const state = { targets: [], target: null, manifest: null, shard: null, file: null, cy: null,
  hidden: new Set(), boundary: true, configuration: {}, navigation: 0, selection: null };
const $ = (id) => document.getElementById(id);

function el(tag, text, attrs) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  for (const [key, value] of Object.entries(attrs || {})) node.setAttribute(key, value);
  return node;
}

function recall(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
function remember(key, value) { try { localStorage.setItem(key, value); } catch (_) { /* storage is optional */ } }

async function getJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw Object.assign(new Error(`${url}: HTTP ${response.status}`), { status: response.status });
  return response.json();
}

function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function connectionTypes(type, refs = []) {
  const types = state.manifest.edge_types;
  if (types.some(t => t.id === type) || !type.endsWith('.rollup')) return [type];
  const originals = [...new Set(refs.map(r => r.type))];
  return originals.length ? originals : types.filter(t => t.id.split('.')[0] === type.split('.')[0]).map(t => t.id);
}

function colorOf(type, refs) {
  const types = connectionTypes(type, refs);
  const index = types.length === 1 ? state.manifest.edge_types.findIndex(t => t.id === types[0]) : -1;
  return index < 0 ? '#888888' : PALETTE[index % PALETTE.length];
}

// The current scope lives in the URL hash, #/<target id>/<shard file>, so Back, Forward, reload and links all work.
function route() {
  const match = location.hash.match(/^#\/([^/]+)(?:\/([^/]+))?$/);
  try { return match ? { target: decodeURIComponent(match[1]), file: match[2] && decodeURIComponent(match[2]) } : {}; }
  catch (_) { return {}; }
}

function hashFor(id, file) { return `#/${encodeURIComponent(id)}/${encodeURIComponent(file)}`; }

async function start() {
  document.querySelector('.skip').onclick = event => { event.preventDefault(); $('map').focus(); };
  state.targets = await getJson('/data/targets.json');
  if (!state.targets.length) {
    $('graph').append(el('p', 'No extracted project yet. Run: python laniakea.py up <path to .uproject>', { class: 'empty' }));
    for (const id of ['target', 'layout', 'find', 'inspect-project']) $(id).disabled = true;
    document.querySelector('.scope-bar').hidden = true;
    $('coverage').textContent = 'No analysis loaded';
    return;
  }
  const select = $('target');
  for (const target of state.targets) select.add(new Option(`${target.project} (${target.id})`, target.id));
  select.onchange = () => show(select.value, null, 'push');
  const saved = recall('layout');
  $('layout').value = [...$('layout').options].some(option => option.value === saved) ? saved : 'auto';
  $('layout').onchange = () => { remember('layout', $('layout').value); layout(); };
  for (const name of ['filters', 'details']) {
    $(`toggle-${name}`).onclick = () => name==='details'&&!$('details').hidden ? renderDetails(null) : togglePanel(name);
  }
  $('fit').onclick = fitOverview;
  $('inspect-project').onclick = () => renderDetails({...state.universe.nodes.get(state.universe.root),projectContext:true});
  $('reset-layout').onclick = resetPositions;
  $('arrange-files').onclick = arrangeSourceFiles;
  $('toggle-configuration').onclick = () => { setConfiguration(!configurationVisible()); applyFilters(); };
  $('clear').onclick = () => { unfocus(true); renderDetails(null); };
  $('up').onclick = up;
  $('find').oninput = () => find().catch(reportError);
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('.find-controls'))closeFindResults();});
  $('find').onkeydown = (event) => {
    if (event.key === 'Escape') { $('find').value = ''; find(); $('find').blur(); }
    if (['ArrowDown','ArrowUp'].includes(event.key)&&state.findCandidates?.length) {
      event.preventDefault();
      state.findChoice=((state.findChoice||0)+(event.key==='ArrowDown'?1:-1)+state.findCandidates.length)%state.findCandidates.length;
      renderFindResults();
    }
    if (event.key === 'Enter') {
      const id = state.findCandidates?.[state.findChoice||0]?.id || state.elsewhere?.id;
      if (id) { closeFindResults();$('find').blur();flyToNode(id); }
    }
  };
  window.addEventListener('hashchange', () => { const r = route(); show(known(r.target), r.file, 'none'); });
  window.addEventListener('popstate', () => {
    const r = route();
    if (state.target && r.target === state.target.id && r.file === state.file) restoreView(history.state && history.state.scene);
  });
  window.addEventListener('beforeunload', event => {
    if (unsavedPositionCaches.size) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  new ResizeObserver(resizeMap).observe($('graph'));
  $('graph').addEventListener('wheel', zoomWithWheel, {capture:true,passive:false});
  $('graph').addEventListener('mousedown',grabConstellationLabel,{capture:true});
  window.addEventListener('mouseup',releaseConstellationLabel);
  $('graph').addEventListener('pointermove', event => {
    const box = $('graph').getBoundingClientRect();
    state.pointer = { x: event.clientX - box.left, y: event.clientY - box.top };
  });
  $('graph').addEventListener('pointerleave', () => { state.pointer = null; unfocus(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.cy) { state.cy.style(style()); readableLabels();renderIconKey(); }
  });
  document.addEventListener('keydown', onKey);
  const wanted = route();
  const id = known(wanted.target);
  await show(id, wanted.target === id ? wanted.file : null, 'replace');
}

function known(id) {
  if (state.targets.some((t) => t.id === id)) return id;
  const last = recall('target');
  return state.targets.some((t) => t.id === last) ? last : state.targets[0].id;
}

// Show a target's scope. mode: 'push' adds a history entry, 'replace' rewrites the current one, 'none' follows history.
async function show(id, file, mode) {
  const savedScene = mode === 'none' || !state.cy ? history.state && history.state.scene : null;
  const navigation = ++state.navigation;
  $('graph').setAttribute('aria-busy', 'true');
  try {
    const changed = !state.target || state.target.id !== id;
    const target = state.targets.find((t) => t.id === id);
    const manifest = changed ? await getJson(`/data/${encodeURIComponent(id)}/manifest.json`) : state.manifest;
    if (navigation !== state.navigation) return;
    const index = await projectIndex(target);
    if (navigation !== state.navigation) return;
    let wanted = file || manifest.entry;
    let shard, universe;
    if (target.map_url) {
      universe = changed || !state.universe ? new Universe(await getJson(target.map_url),manifest) : state.universe;
      if (navigation !== state.navigation) return;
      let entry = index.nodes.find(n=>n.file===wanted);
      if (!entry) {
        try { await getJson(`/data/${encodeURIComponent(id)}/scopes/${encodeURIComponent(wanted)}`); }
        catch(error) {
          if(error.status!==404||wanted===manifest.entry)throw error;
          wanted=manifest.entry;mode='replace';entry=index.nodes.find(n=>n.file===wanted);
        }
        if(!entry)throw new Error('Scope is missing from the canonical node index');
      }
      const byId=new Map(index.nodes.map(n=>[n.id,n]));
      shard={scope:entry.id,title:entry.label,nodes:[],edges:[],members:[],drill:{},
        parents:universe.paths.get(entry.id).slice(0,-1).map(id=>({id,title:universe.nodes.get(id).label,
          file:(byId.get(id)||byId.get(universe.nodes.get(id).attrs?.source_owner))?.file})).filter(p=>p.file)};
    } else {
      try {
        shard = await getJson(`/data/${encodeURIComponent(id)}/scopes/${encodeURIComponent(wanted)}`);
      } catch (error) {
        if (error.status !== 404 || wanted === manifest.entry) throw error;
        wanted = manifest.entry;
        shard = await getJson(`/data/${encodeURIComponent(id)}/scopes/${encodeURIComponent(wanted)}`);
        mode = 'replace';
      }
      if (navigation !== state.navigation) return;
      universe = changed || !state.universe ?
        new Universe(await getJson(`/data/${encodeURIComponent(id)}/graph.json`),manifest) : state.universe;
    }
    if (navigation !== state.navigation) return;
    const positionCache = changed || !state.positionCache ? await loadPositionCache(id, manifest.entry) : state.positionCache;
    if (navigation !== state.navigation) return;
    if (changed) { state.hidden = new Set(); state.configuration = {}; state.referencePages?.clear(); }
    const referencePages = universe.paged && (changed || !state.referencePages) ?
      new ReferencePages(target.references_url,{validate:page=>{
        for(const item of page.items) {
          const group=universe.graph.edges[item.group-1],edge=item.reference;
          if(!group||group.source!==edge.source||group.target!==edge.target||group.type!==edge.type||
            Boolean(group.internal_to_owner)!==Boolean(edge.internal_to_owner))throw new Error('Reference page does not match this map');
        }
      }}) : state.referencePages;
    const fresh = changed || !state.cy;
    Object.assign(state, { target, manifest, shard, scopeShard: shard, universe, file: wanted,
      elsewhere: null, selection: null, positionCache, index, referencePages,
      indexLookup:new Map(index.nodes.map(n=>[n.id,n])) });
    universe.reveal(shard.scope);
    if (shard.scope !== universe.root && universe.isGroup(shard.scope)) universe.expanded.add(shard.scope);
    remember('target', id);
    $('target').value = id;
    $('error').hidden = true;
    $('find').value = '';
    $('find-hint').textContent = '';
    const hash = hashFor(id, wanted);
    if (mode === 'push' && location.hash !== hash) history.pushState(null, '', hash);
    if (mode !== 'push' && location.hash !== hash) history.replaceState(null, '', hash);
    document.title = `${shard.title} - Laniakea`;
    renderBanner();
    renderCoverage();
    renderCrumbs();
    if (fresh) renderGraph();
    else refreshMap();
    if (!restoreView(savedScene) && shard.scope !== universe.root) frameNode(shard.scope);
    renderDetails(null);
    return true;
  } catch (error) {
    if (navigation === state.navigation) {
      reportError(error);
      if (state.target) $('target').value = state.target.id;
      if (state.file) history.replaceState(null, '', hashFor(state.target.id, state.file));
    }
  } finally {
    if (navigation === state.navigation) $('graph').setAttribute('aria-busy', 'false');
  }
}

function reportError(error) {
  $('error').hidden = false;
  $('error').textContent = `Could not load: ${error.message}. Check the local server, then try again.`;
}

function togglePanel(name, open = $(name).hidden) {
  $(name).hidden = !open;
  $(`toggle-${name}`).setAttribute('aria-expanded', String(open));
  if (open && innerWidth <= 1000) {
    const other = name === 'details' ? 'filters' : 'details';
    $(other).hidden = true;
    $(`toggle-${other}`).setAttribute('aria-expanded', 'false');
  }
}

function openScope(file) { return show(state.target.id, file, 'push'); }

async function up() {
  if (!state.shard) return;
  const universe = state.universe, scope = state.scopeShard.scope;
  const parents = state.shard.parents;
  const parent=parents[parents.length-1];
  if(parent?.id&&(universe.nodes.get(scope)?.attrs?.presentation_group||universe.nodes.get(parent.id)?.attrs?.presentation_group)){
    universe.expanded.delete(scope);flyToNode(parent.id,false);return;
  }
  if (parents.length && await openScope(parents[parents.length - 1].file) && state.universe === universe) {
    if (scope !== universe.root) universe.expanded.delete(scope);
    refreshMap();
  }
}

function onKey(event) {
  const typing = event.target.closest && event.target.closest('input, select, textarea');
  if (typing || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'Backspace') { event.preventDefault(); up(); }
  if (event.key === '/') { event.preventDefault(); $('find').focus(); }
  if (event.key === 'Escape') { $('type-key').open=false;unfocus(true); renderDetails(null); }
  if (event.target === $('graph') && state.cy && ['+', '=', '-'].includes(event.key)) {
    event.preventDefault();
    state.pointer = {x:state.cy.width()/2,y:state.cy.height()/2};
    zoomAt(worldZoom() * (event.key === '-' ? 0.8 : 1.25),state.pointer);
  }
  if (event.target === $('graph') && state.cy && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
    event.preventDefault();
    const nodes = state.cy.nodes(':visible').toArray();
    const index = nodes.findIndex(n => n.selected());
    const step = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
    const next = nodes[((index < 0 && step < 0 ? 0 : index) + step + nodes.length) % nodes.length];
    if (next) selectNode(next.id());
  }
  if (event.key === 'Enter' && state.cy && (event.target === $('graph') || event.target === document.body)) {
    const selected = state.cy.nodes(':selected').first();
    if (selected.length) toggleGroup(selected.id());
  }
}

function renderBanner() {
  const banner = $('banner');
  const t = state.target;
  banner.hidden = !t.stale;
  banner.replaceChildren();
  if (t.stale) {
    const details = el('details');
    details.append(el('summary', `Snapshot out of date: ${t.changed_count} inputs changed`),
      el('p', `Showing run ${t.run}. Run: python laniakea.py extract ${t.id}; restart the server to load the new run.`));
    const changed = el('ul');
    for (const path of t.changed) changed.append(el('li', path));
    details.append(changed);
    if (t.changed_count > t.changed.length) details.append(el('p', `${t.changed_count-t.changed.length} more changed inputs.`));
    banner.append(details);
  }
}

function renderCrumbs() {
  const crumbs = $('crumbs');
  crumbs.replaceChildren();
  const append=(container,parent)=>{
    const level = parent.id?state.universe.nodes.get(parent.id)?.level:(state.index.nodes.find(n => n.file === parent.file) || {}).level;
    const link = el('a', null, { href: hashFor(state.target.id, parent.file), title: `Open ${parent.title}` });
    link.append(el('span',parent.title,{class:'crumb-name'}));
    if(parent.id&&state.universe.nodes.get(parent.id)?.attrs?.presentation_group)link.onclick=event=>{
      if(!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){event.preventDefault();flyToNode(parent.id,false);}
    };
    if (level) link.append(el('small', level));
    container.append(link);
  };
  let parents=state.shard.parents;
  if(parents.length>3){
    const older=el('details',null,{class:'crumb-ancestors'}),links=el('div',null,{class:'crumb-links'});
    older.append(el('summary','...', {title:'Show earlier ancestors','aria-label':'Show earlier ancestors'}));
    for(const parent of parents.slice(0,-1))append(links,parent);
    older.append(links);crumbs.append(older,el('span','/',{'aria-hidden':'true'}));parents=parents.slice(-1);
  }
  for (const parent of parents) {
    append(crumbs,parent);crumbs.append(el('span', '/', { 'aria-hidden': 'true' }));
  }
  const current = el('strong', null, { 'aria-current': 'page',title:state.shard.title });
  current.append(el('span',state.shard.title,{class:'crumb-name'}));
  const scope = state.index.nodes.find(n => n.id === state.shard.scope);
  if (scope) current.append(el('small', scope.level));
  crumbs.append(current);
  $('up').disabled = !state.shard.parents.length;
}

function renderFilters() {
  const panel = $('filters');
  const focused = [...panel.querySelectorAll('input')].indexOf(document.activeElement);
  panel.replaceChildren(el('h2', 'Visible stars & constellations'));
  const members = el('div', null, { class: 'node-list' });
  for (const node of state.shard.nodes.filter(n => state.shard.members.includes(n.id))) {
    const button = el('button', node.label, { type: 'button', title: `Trace ${node.label}`, 'data-node': node.id });
    button.append(el('small', nodeDescription(node)));
    button.onclick = () => selectNode(node.id);
    members.append(button);
  }
  panel.append(members, el('h2', 'Connections'));
  const present = state.universe.typeCounts;
  for (const type of state.manifest.edge_types) {
    if (!present.has(type.id)) continue;
    const count = present.get(type.id);
    const box = el('input', null, { type: 'checkbox' });
    box.checked = !state.hidden.has(type.id);
    box.disabled = !present.has(type.id);
    box.onchange = () => { box.checked ? state.hidden.delete(type.id) : state.hidden.add(type.id); applyFilters(); };
    const swatch = el('span', null, { class: `swatch ${type.status}` });
    swatch.style.background = type.status === 'derived' ? '' : colorOf(type.id);
    swatch.style.color = colorOf(type.id);
    const label = el('label', null, { class: 'filter', title: `${type.status}` });
    label.append(box, swatch, el('span', `${type.label} (${count})`));
    panel.append(label);
  }
  panel.append(el('h2', 'Nodes'));
  const boundary = el('input', null, { type: 'checkbox' });
  boundary.checked = state.boundary;
  boundary.onchange = () => { state.boundary = boundary.checked; applyFilters(); };
  const label = el('label', null, { class: 'filter' });
  label.append(boundary, el('span', 'outside the project (boundary)'));
  panel.append(label, el('h2', 'Keys'));
  const keys = el('dl', null, { class: 'keys' });
  attributes(keys, {
    'hover': 'emphasize direct connections',
    'wheel': 'reveal or fold constellations around the pointer',
    'drag space': 'fly through the map, including inside open constellations',
    'drag a star or name': 'arrange it; an open constellation moves by its name',
    'click': 'inspect a star or connection',
    '/': 'find any recorded node; Enter flies to it',
    'double-click, Enter': 'expand or collapse a constellation',
    '+, -': 'zoom when the map has focus',
    'arrow keys': 'browse stars when the map has focus',
    'Backspace, Up': 'one level up',
    'Alt+Left': 'back, as in any page',
    'Esc': 'clear the highlight',
    'connection': 'references; hover for direction, type and count',
    'dashed star': 'outside the analysed target',
    'source box': 'recorded source grouping; compiler ownership is unchanged',
    'diamond': 'outside the project',
  });
  panel.append(keys);
  if (focused >= 0) panel.querySelectorAll('input')[focused]?.focus({preventScroll:true});
}

function configurationVisible() {
  return state.configuration?.[$('layout').value] ?? false;
}

function setConfiguration(visible) {
  state.configuration ||= {};
  state.configuration[$('layout').value] = visible;
}

function renderConfiguration() {
  const count=state.universe.configurationCount,button=$('toggle-configuration');
  button.hidden=!count;
  button.textContent=`Config marks ${configurationVisible()?'on':'off'} (${state.universe.configurationTargets.size} targets)`;
  button.setAttribute('aria-pressed',String(configurationVisible()));
  button.title=`${configurationVisible()?'Hide':'Show'} outlines for explicitly listed targets; configuration references stay in Project details`;
  $('configuration-legend').hidden=!count||!configurationVisible();
  $('layout-hint').hidden=$('layout').value!=='galaxy'||Boolean(state.universe.overview);
  $('layout-hint').textContent='No center hint in this run; using orbits. Extract again to get profile presentation hints.';
}

function findHits() {
  const query = $('find').value.trim().toLowerCase();
  if (!query || !state.cy) return state.cy ? state.cy.collection() : [];
  return state.cy.nodes(':visible').filter(n=>DeclarationContext.rank(state.universe.nodes.get(n.id()),query,state.manifest.levels||[])!==null);
}

// Search leaves the camera in place until Enter flies to the best canonical match.
async function find() {
  const hits = findHits();
  if (state.cy) state.cy.nodes().removeClass('match');
  state.elsewhere = null;
  $('find-hint').textContent = '';
  if (hits.length) hits.addClass('match');
  const query = $('find').value.trim().toLowerCase();
  if (!query) { state.findCandidates=[];state.findCount=0;closeFindResults();unfocus();return; }
  const matches=DeclarationContext.search(query,state.universe.nodes.values(),state.manifest.levels||[]);
  state.findCandidates=matches.items;state.findCount=matches.count;state.findChoice=0;
  const best = matches.items[0];
  state.elsewhere = best;
  renderFindResults();
  readableLabels();
}

function closeFindResults() {
  $('find-results').hidden=true;$('find').setAttribute('aria-expanded','false');
}

function renderFindResults() {
  const panel=$('find-results');panel.replaceChildren();
  const candidates=state.findCandidates||[],choice=state.findChoice||0;
  if(!$('find').value.trim()||!candidates.length){closeFindResults();$('find-hint').textContent=$('find').value.trim()?'no match':'';return;}
  $('find-hint').textContent=`${state.findCount} match${state.findCount===1?'':'es'}; Enter: ${candidates[choice].attrs?.qualified||candidates[choice].label}`;
  let active;
  for(const [i,node] of candidates.entries()){
    const context=DeclarationContext.describe(node,state.universe);
    const name=node.attrs?.qualified||[context.path,node.label].filter(Boolean).join(' / ');
    const button=el('button',name,{type:'button',class:i===choice?'active':'',title:context.signature||node.label});
    const source=node.source?node.source.path+(node.source.line?':'+node.source.line:''):'';
    button.append(el('small',[node.level,context.signature,source].filter(Boolean).join(' / ')));
    button.onclick=()=>{closeFindResults();$('find').blur();flyToNode(node.id);};panel.append(button);
    if(i===choice)active=button;
  }
  if(state.findCount>candidates.length)panel.append(el('small',`Showing ${candidates.length} of ${state.findCount}; refine the name or owner.`));
  panel.hidden=false;$('find').setAttribute('aria-expanded','true');
  active?.scrollIntoView({block:'nearest',inline:'nearest'});
}

async function projectIndex(target = state.target) {
  if (state.target === target && state.index) return state.index;
  const index = await getJson(`/data/${encodeURIComponent(target.id)}/scopes/index.json`);
  if (state.target === target) state.index = index;
  return index;
}

// Exact names first, then names that start with the text, then names that contain it; higher levels before lower.
function elsewhere(query, index) {
  return DeclarationContext.search(query,index.nodes,state.manifest.levels||[],1).items[0]||null;
}

function sourceLink(location) {
  const roots=state.target.roots||{};
  const root = Object.hasOwn(roots,location.root) && roots[location.root];
  if (typeof root!=='string'||!root) return null;
  const path = `${root.replace(/\\/g, '/').replace(/\/$/, '')}/${location.path}`;
  return el('a', `${location.path}:${location.line || 1}`, { href: `vscode://file/${encodeURI(path)}:${location.line || 1}` });
}

function attributes(list, attrs) {
  for (const [key, value] of Object.entries(attrs || {})) {
    const detail = el('dd');
    const location = value && typeof value === 'object' && typeof value.root === 'string' &&
      typeof value.path === 'string' && sourceLink(value);
    if (location) detail.append(location);
    else detail.textContent = Array.isArray(value) ? value.map(item => typeof item === 'object' ? JSON.stringify(item) : item).join(', ') || '-' :
      value && typeof value === 'object' ? JSON.stringify(value) : value == null || value === '' ? '-' : String(value);
    list.append(el('dt', key), detail);
  }
}

function typeLabel(type, refs) {
  const entry = state.manifest.edge_types.find(t => t.id === type);
  if (entry) return entry.label;
  const types = connectionTypes(type, refs);
  return type.endsWith('.rollup') && types.length ? types.map(id =>
    state.manifest.edge_types.find(t => t.id === id)?.label || id).join(' / ') + ' (summary)' : type;
}

function inspectPair(source,target) {
  const pair=ConnectionTrace.pair(state.shard,source,target);
  if(pair)renderDetails({...pair,signature:ConnectionTrace.signature(pair),pairInspection:true});
}

function inspectOverlap(trace) {
  renderDetails({...trace,signature:ConnectionTrace.signature(trace),overlapInspection:true});
}

function renderDetails(item) {
  clearTimeout(state.inspectTimer);
  const isNode = item && item.level !== undefined;
  const requested = item;
  const projectContext=requested?.projectContext && requested.id===state.universe.root;
  const configurationInspection=requested?.configurationInspection && state.universe.isConfiguration(requested) &&
    state.universe.configurationReferences.some(ref=>
      (requested.referenceGroup ? ref.group===requested.referenceGroup : ref.id===requested.id) &&
      ref.source===requested.source && ref.target===requested.target && ref.type===requested.type);
  const traceInspection=requested?.pairInspection||requested?.overlapInspection;
  const pair=requested?.overlapInspection?ConnectionTrace.overlap(state.shard,requested.pairs):
    requested?.pairInspection&&ConnectionTrace.pair(state.shard,requested.source,requested.target);
  const signature=pair&&ConnectionTrace.signature(pair);
  item = traceInspection ? pair&&signature===requested.signature&&pair.kind===requested.kind ?
    {...pair,signature,...(requested.overlapInspection?{overlapInspection:true}:{pairInspection:true})} : null :
    requested && (isNode ? state.shard.nodes : requested.referenceGroup ? [] : state.shard.edges)
    .find(current => current.id === requested.id) || null;
  if(projectContext)item={...state.universe.nodes.get(state.universe.root),projectContext:true};
  else if(configurationInspection)item=requested;
  let connection = item;
  if (!item && requested && !isNode && !traceInspection) {
    for (const projected of state.shard.edges) {
      const exact = projected.refs?.find(reference => reference.id === requested.id);
      if (!requested.referenceGroup && exact && projected.source === exact.source && projected.target === exact.target) {
        item = {...exact,refs:[exact]}; connection = projected; break;
      }
      if (requested.referenceGroup && projected.source === requested.source && projected.target === requested.target &&
          projected.refs?.some(group=>group.group===requested.referenceGroup)) {
        item = {...requested,refs:[requested]};connection=projected;break;
      }
    }
  }
  const contextual=projectContext||configurationInspection;
  const rendered = item && (contextual ? state.cy.collection() : traceInspection ? state.cy.edges().filter(edge=>item.roles.has(edge.data('referenceId'))) :
    state.cy.getElementById(isNode ? item.id : state.universe.renderPrefix + connection.id));
  if (item && !contextual && (!rendered.length || !rendered.visible())) item = null;
  state.selection = item;
  if (state.cy) {
    state.cy.elements().unselect();
    state.cy.edges('.pair-inspected').removeClass('pair-inspected');
    if (item) { rendered.select();if(traceInspection)rendered.addClass('pair-inspected'); }
    readableLabels();
  }
  const panel = $('details');
  const key = state.universe.paged && item ? JSON.stringify([traceInspection?item.key:item.id,item.signature||null,item.referenceGroup||null,
    Boolean(projectContext),Boolean(configurationInspection),[...state.hidden].sort(),state.boundary,item.refs?.map(r=>r.group)]) : null;
  if (key && key===state.detailsKey) {
    const control = panel.querySelector('[data-action="toggle-group"]');
    if (control) updateGroupControl(control, item.id);
    return;
  }
  state.detailsKey=key;
  state.referenceEpoch=(state.referenceEpoch||0)+1;
  state.referencePages?.cancel();
  for (const observer of state.referenceObservers || []) observer.disconnect();
  state.referenceObservers = [];
  panel.scrollTop=0;panel.scrollLeft=0;
  panel.replaceChildren();
  if (!item) {
    togglePanel('details', false);
    panel.append(el('h2', 'Details'), el('p', 'Hover to trace. Click a star or connection to inspect it.'));
    return;
  }
  togglePanel('details', true);
  if(projectContext) { renderProjectDetails(panel,item);return; }
  if(item.overlapInspection) { renderOverlapDetails(panel,item);return; }
  if(item.pairInspection) { renderPairDetails(panel,item);return; }
  const list = el('dl');
  if (item.level !== undefined) {
    panel.append(el('h2', item.label), el('p', nodeDescription(item), {class:'muted'}));
    const context=DeclarationContext.describe(item,state.universe);
    if(context.path)panel.append(el('p',context.path,{class:'declaration-owner'}));
    if(context.signature)panel.append(el('code',context.signature,{class:'declaration-signature'}));
    for(const note of context.context)panel.append(el('p',note,{class:'muted declaration-context'}));
    const hint=analysisHint(item);if(hint)panel.append(el('p',hint,{class:'muted'}));
    attributes(list, {status:item.status, parent:item.parent ? label(item.parent) : 'root'});
    if (item.boundary) panel.append(el('p', 'Only recorded references are shown. Further external dependencies were not analysed.', {class:'muted'}));
    if (item.source) {
      const link = sourceLink(item.source);
      if (link) { const dd = el('dd'); dd.append(link); list.append(el('dt', item.attrs?.definition_location?'definition':'source'), dd); }
    }
    if(item.attrs?.declaration)attributes(list,{declaration:item.attrs.declaration});
    const entries = Object.entries(item.attrs || {}), isAnalysis = ([name]) => name === 'analysis' || name === 'ownership' || name.endsWith('_analysis');
    attributes(list, Object.fromEntries(entries.filter(isAnalysis)));
    panel.append(list);
    if(item.attrs?.source_file)renderFileSymbols(panel,item);
    if ((state.universe.isGroup(item.id)||state.universe.navigationTarget(item.id)) && !item.attrs?.source_region && item.id !== state.universe.root) {
      const button = el('button', null, {type:'button','data-action':'toggle-group'});
      updateGroupControl(button, item.id);
      button.onclick = () => toggleGroup(item.id);
      panel.append(button);
    }
    const fly = el('button', 'Fly to star', {type:'button'});
    fly.onclick = () => flyToNode(item.id);
    panel.append(fly);
    const primary=new Set(['signature','type_signature','qualified','declaration','definition_location','declaration_kind',
      'access','static','virtual','const','member_counts','declaration_origin','source_partition','source_sections',
      'presentation_group','source_owner','source_context','source_file','source_private','source_region',
      'source_definitions','source_declarations','source_caption']);
    const secondary = Object.fromEntries(entries.filter(entry => !isAnalysis(entry)&&!primary.has(entry[0])));
    if (Object.keys(secondary).length) {
      const metadata = el('details', null, {class:'node-metadata'}), fields = el('dl');
      attributes(fields, secondary); metadata.append(el('summary', 'Metadata'), fields); panel.append(metadata);
    }
    renderConnections(panel, item);
    return;
  }
  panel.append(el('h2', typeLabel(item.type, item.refs)));
  if(configurationInspection)panel.append(el('p','Project configuration declaration; shown as context, not an architecture wire.',{class:'muted'}));
  const endpoints = el('p', null, {class:'endpoints'});
  for (const id of [item.source,item.target]) {
    const button = el('button', label(id), {type:'button'});
    button.onclick = () => flyToNode(id);
    if (id === item.target) endpoints.append(el('span', 'references', {class:'muted'}));
    endpoints.append(button);
  }
  panel.append(endpoints);
  if (item.status==='derived') panel.append(el('p','References of descendants, grouped for this view. The rows name the original owners.',{class:'muted'}));
  if (state.universe.paged && !item.referenceGroup) {
    appendReferencePage(panel,{groups:item.refs.map(r=>r.group)},referenceTotal(item.refs));
  } else appendReferences(panel, item.refs || [item]);
}

function renderFileSymbols(panel,item){
  const definitions=item.attrs.source_definitions||[],declarations=item.attrs.source_declarations||[];
  panel.append(el('p','Open a definition to explore its existing class or function.',{class:'muted'}));
  for(const [name,ids] of [['Definitions in this file',definitions],['Declarations in this file',declarations]]){
    if(!ids.length)continue;
    panel.append(el('h3',`${name} (${ids.length})`));
    const entries=el('div',null,{class:'file-symbols'});let offset=0;
    const more=el('button','Show more symbols',{type:'button'});
    const append=()=>{
      const limit=Math.min(ids.length,offset+40);
      for(;offset<limit;offset++){
        const id=ids[offset],node=state.universe.nodes.get(id);
        if(!node)continue;
        const qualified=node.attrs?.qualified||node.label,owner=state.universe.nodes.get(node.parent);
        const button=el('button',null,{type:'button','data-symbol':id,title:qualified,'aria-label':qualified});
        button.append(el('strong',node.label));if(owner)button.append(el('small',owner.label));
        button.onclick=()=>flyToNode(id);entries.append(button);
      }
      more.hidden=offset>=ids.length;
    };
    more.onclick=append;append();panel.append(entries,more);
  }
}

function renderProjectDetails(panel,node) {
  const map=state.universe,fields=el('dl');
  panel.append(el('h2',node.label),el('p','Project context',{class:'muted'}));
  if(node.source){const link=sourceLink(node.source);if(link)panel.append(link);}
  if(state.manifest.target){const {name,platform,configuration}=state.manifest.target;attributes(fields,{name,platform,configuration});}
  const statistics=el('details',null,{class:'node-metadata'});
  statistics.append(el('summary','Project/subtree statistics'),
    el('p','All recorded references, including descendants.',{class:'muted'}));
  panel.append(fields,statistics);
  const totals=map.referenceStats.get(node.id);
  for(const [heading,direction] of [['Outgoing','outgoing'],['Incoming','incoming'],['Within / self','within']]){
    statistics.append(el('p',`${heading} references recorded: ${totals[direction]}`));
    appendConfigurationSubset(statistics,node.id,direction);
  }
  if(node.attrs && Object.keys(node.attrs).length){
    const metadata=el('details',null,{class:'node-metadata'}),list=el('dl');
    attributes(list,node.attrs);metadata.append(el('summary','Metadata'),list);panel.append(metadata);
  }
  panel.append(el('h3',`Project configuration (${map.configurationCount} references / ${map.configurationTargets.size} listed targets)`),
    el('p',configurationMeaning(),{class:'muted'}));
  if(!map.configurationCount)panel.append(el('p','No project configuration declarations classified in this snapshot.',{class:'muted'}));
  else if(map.paged)appendReferencePage(panel,{groups:map.configurationReferences.map(ref=>ref.group)},map.configurationCount);
  else appendReferences(panel,map.configurationReferences);
}

function appendConfigurationSubset(panel,id,direction) {
  const count=state.universe.configurationStats.get(id)[direction];
  if(count)panel.append(el('p',`Of which: project configuration: ${count}. ${configurationMeaning()}`,{class:'muted'}));
}

function renderPairDetails(panel,trace) {
  panel.append(el('h2','Connections in this view'));
  const endpoints=el('p',null,{class:'endpoints'});
  for(const [key,id] of [['A',trace.source],['B',trace.target]]) {
    if(key==='B'&&trace.source===trace.target)continue;
    const button=el('button',`${key}: ${traceName(id)}`,{type:'button'});
    button.onclick=()=>flyToNode(id);endpoints.append(button);
  }
  panel.append(endpoints,el('p','Includes all shown reference types between these endpoints. Exact rows name their original owners.',{class:'muted'}));
  const summary=el('p',null,{class:'direction-summary'});panel.append(summary);
  for(const [role,heading] of trace.source===trace.target ? [['within','Within / self']] :
    [['outgoing','A -> B'],['incoming','B -> A']]) {
    const refs=trace.groups[role],count=trace.counts[role];
    const title=el('h3',`${heading} (${count} refs)`,{tabindex:'-1',class:'trace-'+role});
    const jump=el('button',`${heading}: ${count} refs`,{type:'button',class:'trace-'+role});
    jump.onclick=()=>{title.scrollIntoView({block:'start',behavior:'instant'});title.focus({preventScroll:true});};
    summary.append(jump);panel.append(title);
    if(!count)panel.append(el('p','No references in this direction in this view.',{class:'muted'}));
    else if(state.universe.paged)appendReferencePage(panel,{groups:refs.map(ref=>ref.group)},count);
    else appendReferences(panel,refs);
  }
}

function renderOverlapDetails(panel,trace) {
  panel.append(el('h2',`${trace.pairs.length} overlapping connections`),
    el('p',`${ConnectionTrace.total(trace.refs)} distinct references in this view. The crossing is visual, not an architectural junction.`,{class:'muted'}));
  const list=el('ul',null,{class:'connections'}),more=el('button','More connections',{type:'button'});
  let offset=0;
  const append=()=>{
    let first;
    for(const pair of trace.pairs.slice(offset,offset+50)){
      const row=el('li'),a=traceName(pair.source),b=traceName(pair.target);
      const button=el('button',pair.source===pair.target?a+' (within / self)':a+' <-> '+b,{type:'button'});
      if(!first)first=button;
      const emphasize=()=>{
        const id=pair.roles.keys().next().value,edge=state.cy.getElementById(state.universe.renderPrefix+id);
        if(edge.length)preview(edge,null,pair);
      };
      button.onmouseenter=emphasize;button.onfocus=emphasize;
      button.onclick=()=>inspectPair(pair.source,pair.target);
      row.append(button,...traceSummary(pair).rows.map(([name,count,role])=>el('small',`${name}: ${count} refs`,{class:'trace-'+role})),
        el('small',traceTypes(pair.refs)));
      list.append(row);
    }
    offset+=50;more.hidden=offset>=trace.pairs.length;
    if(document.activeElement===more&&first)first.focus();
  };
  more.onclick=append;panel.append(list,more);append();
}

function updateGroupControl(button, id) {
  const opened = state.universe.expanded.has(id);
  const target=state.universe.navigationTarget(id);
  button.textContent = target ? 'Open recorded scope' : opened ? 'Collapse constellation' : 'Expand constellation';
  if(!target)button.setAttribute('aria-expanded', String(opened));
}

function referenceRow(edge) {
  const row = el('li');
  const source=state.universe.nodes.get(edge.source),target=state.universe.nodes.get(edge.target);
  if(!source||!target)throw new Error('Unknown exact-reference endpoint');
  const button=el('button',`${source.label} (${source.level}) -> ${target.label} (${target.level})`,
    {type:'button',title:'Reveal this exact reference in the map'});
  button.onclick=()=>followReference(edge);
  const origin=state.manifest.sources.find(s=>s.id===edge.origin);
  row.append(button,el('small',`${typeLabel(edge.type)} / ${edge.status}`+
    ` / ${origin?origin.name+' '+origin.version:edge.origin}`+
    (edge.internal_to_owner?' / within owner':'')+
    (state.universe.isConfiguration(edge)?' / project configuration (context only)':
      state.hidden.has(edge.type)||!state.boundary&&(source.boundary||target.boundary)?' / hidden by filters':'')));
  const ownerPath=id=>state.universe.paths.get(id).map(label).join(' / ');
  row.append(el('small',`${ownerPath(edge.source)} -> ${ownerPath(edge.target)}`));
  const declaration=edge.attrs?.target_declaration;
  if(declaration) {
    const detail=el('div',null,{class:'target-declaration'}),location=declaration.location;
    detail.append(el('small',`Target declaration: ${edge.attrs.symbol||target.label}`));
    const link=location&&sourceLink(location);
    if(link)detail.append(link);
    else detail.append(el('small',location?`${location.path}:${location.line||1} (source root is unavailable)`:
      'Target declaration location was not recorded in this snapshot.'));
    row.append(detail);
  } else if(target.boundary&&!state.universe.isConfiguration(edge)) {
    row.append(el('small','Target declaration location was not recorded in this snapshot.'));
  }
  if(edge.attrs){
    const metadata=el('dl');
    attributes(metadata,Object.fromEntries(Object.entries(edge.attrs).filter(([name])=>name!=='target_declaration'&&(!declaration||name!=='symbol'))));
    row.append(metadata);
  }
  if(source.source){const link=sourceLink(source.source);if(link)row.append(link);}
  return row;
}

function appendReferencePage(panel, query, expectedTotal) {
  const epoch=state.referenceEpoch,cache=state.referencePages;
  const section=el('section'),controls=el('div',null,{class:'reference-pager'});
  const previous=el('button','Previous',{type:'button','aria-label':'Previous references'}),
    next=el('button','Next',{type:'button','aria-label':'Next references'});
  const retry=el('button','Retry references',{type:'button'}),status=el('small',null,{role:'status','aria-live':'polite',class:'muted'});
  const list=el('ul',null,{class:'connections'});
  controls.append(previous,next,retry,status);section.append(controls,list);panel.append(section);
  const cursors=[0];let number=0,nextCursor=null,busy=false,lastAttempt=0;
  const current=()=>epoch===state.referenceEpoch&&cache===state.referencePages&&section.isConnected;
  const load=async (page,navigate=false)=>{
    if(busy)return false;
    busy=true;lastAttempt=page;previous.disabled=number===0;next.disabled=nextCursor===null;
    previous.setAttribute('aria-disabled','true');next.setAttribute('aria-disabled','true');
    retry.hidden=true;status.textContent='Loading references...';
    try{
      const data=await cache.load({...query,cursor:cursors[page],limit:50});
      if(!current())return false;
      if(data.total!==expectedTotal)throw new Error('Reference count does not match this map');
      list.replaceChildren(...data.items.map(item=>referenceRow({...item.reference,referenceGroup:item.group})));
      number=page;nextCursor=data.next_cursor;
      if(nextCursor!==null)cursors[page+1]=nextCursor;
      status.textContent=`${data.total?page*50+1:0}-${page*50+data.items.length} of ${data.total} references`;
      if(navigate)section.scrollIntoView({block:'start',inline:'nearest',behavior:'instant'});
      return true;
    }catch(error){
      if(!current()||error.name==='AbortError')return false;
      status.textContent=`Could not load references: ${error.message}. Retry to continue.`;retry.hidden=false;
      return false;
    }finally{
      busy=false;
      if(current()){
        const focused=document.activeElement;
        previous.disabled=number===0;next.disabled=nextCursor===null;
        previous.setAttribute('aria-disabled',String(previous.disabled));next.setAttribute('aria-disabled',String(next.disabled));
        if((focused===previous||focused===next)&&focused.disabled)(focused===next?previous:next).focus({preventScroll:true});
      }
    }
  };
  previous.onclick=()=>load(number-1,true);next.onclick=()=>load(number+1,true);retry.onclick=()=>load(lastAttempt,true);
  return load(0);
}

function appendReferences(panel, references) {
  const list = el('ul', null, {class:'connections'});
  const more = el('li'), load = el('button', 'Load more references', {type:'button'});
  more.append(load); list.append(more);
  let offset = 0, observer = null;
  const appendBatch = () => {
    const end = Math.min(references.length, offset + 50);
    for (; offset < end; offset++) {
      const edge = references[offset];
      list.insertBefore(referenceRow(edge), more);
    }
    if (offset >= references.length) { more.remove(); if (observer) observer.disconnect(); }
    else load.textContent = `Load next ${Math.min(50, references.length - offset)} references`;
  };
  load.onclick = appendBatch;
  appendBatch();
  panel.append(list);
  if (offset < references.length && typeof IntersectionObserver !== 'undefined') {
    observer = new IntersectionObserver(entries => {
      if (!list.isConnected) { observer.disconnect(); return; }
      if (entries.some(entry => entry.isIntersecting)) appendBatch();
    }, {root:$('details'),rootMargin:'400px'});
    observer.observe(more);
    (state.referenceObservers ||= []).push(observer);
  }
}

function renderConnections(panel, node) {
  const map = state.universe;
  panel.append(el('p','All recorded references. Map filters and the viewport apply to the trace readout.',{class:'muted'}));
  if (map.isGroup(node.id)) panel.append(el('p','Includes references of descendants. Folder and constellation connections are summaries of their original owners.',{class:'muted'}));
  if(map.paged){
    const stats=map.referenceStats.get(node.id);
    for(const [heading,direction] of [['Outgoing','outgoing'],['Incoming','incoming'],['Within','within']]){
      const count=stats[direction];panel.append(el('h3',`${heading} references recorded (${count})`));
      appendConfigurationSubset(panel,node.id,direction);
      if(count){
        const query=node.attrs?.presentation_group?{groups:map.references(node.id).filter(ref=>{
          const source=map.referenceInside(node.id,ref,'source'),target=map.referenceInside(node.id,ref,'target');
          return direction==='within'?source&&target:direction==='outgoing'?source&&!target:target&&!source;
        }).map(ref=>ref.group)}:{node:node.id,direction};
        appendReferencePage(panel,query,count);
      }
      else panel.append(el('p',node.boundary?'No further references were analysed.':'No recorded references.',{class:'muted'}));
    }
    return;
  }
  const references = map.references(node.id);
  for (const [heading, match] of [
    ['Outgoing', e => map.referenceInside(node.id,e,'source') && !map.referenceInside(node.id,e,'target')],
    ['Incoming', e => map.referenceInside(node.id,e,'target') && !map.referenceInside(node.id,e,'source')],
    ['Within', e => map.referenceInside(node.id,e,'source') && map.referenceInside(node.id,e,'target')],
  ]) {
    const edges = references.filter(match);
    panel.append(el('h3', `${heading} references recorded (${referenceTotal(edges)})`));
    appendConfigurationSubset(panel,node.id,heading.toLowerCase());
    if (edges.length) appendReferences(panel, edges);
    else panel.append(el('p', node.boundary ? 'No further references were analysed.' : 'No recorded references.', {class:'muted'}));
  }
}

function label(id) {
  const node = state.universe.nodes.get(id);
  return node ? node.label : id;
}

function renderCoverage() {
  const m = state.manifest;
  const footer = $('coverage');
  footer.replaceChildren(el('span', `${m.project} / ${m.target.name} / ${m.target.platform} ${m.target.configuration}`));
  const coverage = el('details');
  coverage.append(el('summary', `Analysis coverage / ${m.coverage.not_analysed.length} limitations`),
    el('p', `Run ${m.run} / ${m.tool.name} ${m.tool.version}`));
  const missing = el('ul');
  for (const line of m.coverage.analysed) missing.append(el('li', `Analysed: ${line}`));
  for (const line of m.coverage.not_analysed) missing.append(el('li', `not analysed: ${line}`));
  coverage.append(missing);
  footer.append(coverage);
}

start().catch((error) => {
  reportError(error);
  $('graph').replaceChildren(el('p', 'Restart the local server, then reload this page.', { class: 'empty' }));
});
