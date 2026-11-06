// SPDX-License-Identifier: AGPL-3.0-or-later
// Levels, edge types and sources come from the manifest; Universe owns the continuing map.
'use strict';

const PALETTE = ['#4e79a7', '#f28e2b', '#59a14f', '#e15759', '#76b7b2', '#b07aa1', '#9c755f', '#edc948', '#ff9da7', '#bab0ac'];
const state = { targets: [], target: null, manifest: null, shard: null, file: null, cy: null,
  hidden: new Set(), boundary: true, navigation: 0, selection: null };
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
    for (const id of ['target', 'layout', 'find']) $(id).disabled = true;
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
    $(`toggle-${name}`).onclick = () => togglePanel(name);
  }
  $('fit').onclick = fitOverview;
  $('reset-layout').onclick = resetPositions;
  $('clear').onclick = () => { unfocus(); renderDetails(null); };
  $('up').onclick = up;
  $('find').oninput = () => find().catch(reportError);
  $('find').onkeydown = (event) => {
    if (event.key === 'Escape') { $('find').value = ''; find(); $('find').blur(); }
    if (event.key === 'Enter') {
      const id = state.elsewhere && state.elsewhere.id || (findHits().first() || {}).id?.();
      if (id) flyToNode(id);
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
    if (state.cy) { state.cy.style(style()); readableLabels(); }
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
      universe = changed || !state.universe ? new Universe(await getJson(target.map_url)) : state.universe;
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
        parents:universe.paths.get(entry.id).slice(0,-1).map(id=>({title:universe.nodes.get(id).label,file:byId.get(id)?.file})).filter(p=>p.file)};
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
        new Universe(await getJson(`/data/${encodeURIComponent(id)}/graph.json`)) : state.universe;
    }
    if (navigation !== state.navigation) return;
    const positionCache = changed || !state.positionCache ? await loadPositionCache(id, manifest.entry) : state.positionCache;
    if (navigation !== state.navigation) return;
    if (changed) { state.hidden = new Set(); state.referencePages?.clear(); }
    const referencePages = universe.paged && (changed || !state.referencePages) ?
      new ReferencePages(target.references_url,{validate:page=>{
        for(const item of page.items) {
          const group=universe.graph.edges[item.group-1],edge=item.reference;
          if(!group||group.source!==edge.source||group.target!==edge.target||group.type!==edge.type)throw new Error('Reference page does not match this map');
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
  if (event.key === 'Escape') { unfocus(); renderDetails(null); }
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
  for (const parent of state.shard.parents) {
    const level = (state.index.nodes.find(n => n.file === parent.file) || {}).level;
    const link = el('a', parent.title, { href: hashFor(state.target.id, parent.file), title: `Open ${parent.title}` });
    if (level) link.append(el('small', level));
    crumbs.append(link,
      el('span', '/', { 'aria-hidden': 'true' }));
  }
  const current = el('strong', state.shard.title, { 'aria-current': 'page' });
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
    'diamond': 'outside the project',
  });
  panel.append(keys);
  if (focused >= 0) panel.querySelectorAll('input')[focused]?.focus({preventScroll:true});
}

function findHits() {
  const query = $('find').value.trim().toLowerCase();
  if (!query || !state.cy) return state.cy ? state.cy.collection() : [];
  return state.cy.nodes(':visible').filter((n) => n.data('label').toLowerCase().includes(query));
}

// Search leaves the camera in place until Enter flies to the best canonical match.
async function find() {
  const hits = findHits();
  if (state.cy) state.cy.nodes().removeClass('match');
  state.elsewhere = null;
  $('find-hint').textContent = '';
  if (hits.length) hits.addClass('match');
  const query = $('find').value.trim().toLowerCase();
  if (!query) { unfocus(); return; }
  const index = {nodes:[...state.universe.nodes.values()]};
  const best = elsewhere(query, index);
  state.elsewhere = best;
  $('find-hint').textContent = best ? `Enter: fly to ${best.label} (${best.level})` : 'no match';
  readableLabels();
}

async function projectIndex(target = state.target) {
  if (state.target === target && state.index) return state.index;
  const index = await getJson(`/data/${encodeURIComponent(target.id)}/scopes/index.json`);
  if (state.target === target) state.index = index;
  return index;
}

// Exact names first, then names that start with the text, then names that contain it; higher levels before lower.
function elsewhere(query, index) {
  const levels = state.manifest.levels;
  const rank = (entry) => {
    const name = entry.label.toLowerCase();
    const fit = name === query ? 0 : name.startsWith(query) ? 1 : name.includes(query) ? 2 : -1;
    return fit < 0 ? null : [fit, levels.indexOf(entry.level), name.length];
  };
  const earlier = (a, b) => (a[0] - b[0] || a[1] - b[1] || a[2] - b[2]) < 0;
  let best = null;
  let bestRank = null;
  for (const entry of index.nodes) {
    const r = rank(entry);
    if (r && (!bestRank || earlier(r, bestRank))) { best = entry; bestRank = r; }
  }
  return best;
}

function sourceLink(location) {
  const root = state.target.roots[location.root];
  if (!root) return null;
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

function renderDetails(item) {
  const isNode = item && item.level !== undefined;
  const requested = item;
  item = requested && (isNode ? state.shard.nodes : requested.referenceGroup ? [] : state.shard.edges)
    .find(current => current.id === requested.id) || null;
  let connection = item;
  if (!item && requested && !isNode) {
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
  const rendered = item && state.cy.getElementById(isNode ? item.id : state.universe.renderPrefix + connection.id);
  if (item && (!rendered.length || !rendered.visible())) item = null;
  state.selection = item;
  if (state.cy) {
    state.cy.elements().unselect();
    if (item) rendered.select();
    readableLabels();
  }
  const panel = $('details');
  const key = state.universe.paged && item ? JSON.stringify([item.id,item.referenceGroup||null,
    [...state.hidden].sort(),state.boundary,item.refs?.map(r=>r.group)]) : null;
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
  const list = el('dl');
  if (item.level !== undefined) {
    panel.append(el('h2', item.label), el('p', nodeDescription(item), {class:'muted'}));
    attributes(list, {status:item.status, parent:item.parent ? label(item.parent) : 'root'});
    if (item.boundary) panel.append(el('p', 'Only recorded references are shown. Further external dependencies were not analysed.', {class:'muted'}));
    if (item.source) {
      const link = sourceLink(item.source);
      if (link) { const dd = el('dd'); dd.append(link); list.append(el('dt', 'source'), dd); }
    }
    const entries = Object.entries(item.attrs || {}), isAnalysis = ([name]) => name === 'analysis' || name.endsWith('_analysis');
    attributes(list, Object.fromEntries(entries.filter(isAnalysis)));
    panel.append(list);
    if (state.universe.isGroup(item.id) && item.id !== state.universe.root) {
      const button = el('button', null, {type:'button','data-action':'toggle-group'});
      updateGroupControl(button, item.id);
      button.onclick = () => toggleGroup(item.id);
      panel.append(button);
    }
    const fly = el('button', 'Fly to star', {type:'button'});
    fly.onclick = () => flyToNode(item.id);
    panel.append(fly);
    const secondary = Object.fromEntries(entries.filter(entry => !isAnalysis(entry)));
    if (Object.keys(secondary).length) {
      const metadata = el('details', null, {class:'node-metadata'}), fields = el('dl');
      attributes(fields, secondary); metadata.append(el('summary', 'Metadata'), fields); panel.append(metadata);
    }
    renderConnections(panel, item);
    return;
  }
  panel.append(el('h2', typeLabel(item.type, item.refs)));
  const endpoints = el('p', null, {class:'endpoints'});
  for (const id of [item.source,item.target]) {
    const button = el('button', label(id), {type:'button'});
    button.onclick = () => flyToNode(id);
    if (id === item.target) endpoints.append(el('span', 'references', {class:'muted'}));
    endpoints.append(button);
  }
  panel.append(endpoints);
  if (state.universe.paged && !item.referenceGroup) {
    appendReferencePage(panel,{groups:item.refs.map(r=>r.group)},referenceTotal(item.refs));
  } else appendReferences(panel, item.refs || [item]);
}

function updateGroupControl(button, id) {
  const opened = state.universe.expanded.has(id);
  button.textContent = opened ? 'Collapse constellation' : 'Expand constellation';
  button.setAttribute('aria-expanded', String(opened));
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
    (state.hidden.has(edge.type)||!state.boundary&&(source.boundary||target.boundary)?' / hidden by filters':'')));
  if(edge.attrs){const metadata=el('dl');attributes(metadata,edge.attrs);row.append(metadata);}
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
  if(map.paged){
    const stats=map.referenceStats.get(node.id);
    for(const [heading,direction] of [['Outgoing','outgoing'],['Incoming','incoming'],['Within','within']]){
      const count=stats[direction];panel.append(el('h3',`${heading} (${count})`));
      if(count)appendReferencePage(panel,{node:node.id,direction},count);
      else panel.append(el('p',node.boundary?'No further references were analysed.':'No recorded references.',{class:'muted'}));
    }
    return;
  }
  const references = map.references(node.id);
  for (const [heading, match] of [
    ['Outgoing', e => map.contains(node.id,e.source) && !map.contains(node.id,e.target)],
    ['Incoming', e => map.contains(node.id,e.target) && !map.contains(node.id,e.source)],
    ['Within', e => map.contains(node.id,e.source) && map.contains(node.id,e.target)],
  ]) {
    const edges = references.filter(match);
    panel.append(el('h3', `${heading} (${edges.length})`));
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
