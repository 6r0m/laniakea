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

function colorOf(type) {
  const index = state.manifest.edge_types.findIndex((t) => t.id === type);
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
  $('fit').onclick = () => fitMap();
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
    let wanted = file || manifest.entry;
    let shard;
    try {
      shard = await getJson(`/data/${encodeURIComponent(id)}/scopes/${encodeURIComponent(wanted)}`);
    } catch (error) {
      if (error.status !== 404 || wanted === manifest.entry) throw error;
      wanted = manifest.entry;
      shard = await getJson(`/data/${encodeURIComponent(id)}/scopes/${encodeURIComponent(wanted)}`);
      mode = 'replace';
    }
    if (navigation !== state.navigation) return;
    const index = await projectIndex(target);
    if (navigation !== state.navigation) return;
    const universe = changed || !state.universe ?
      new Universe(await getJson(`/data/${encodeURIComponent(id)}/graph.json`)) : state.universe;
    if (navigation !== state.navigation) return;
    const positionCache = changed || !state.positionCache ? await loadPositionCache(id, manifest.entry) : state.positionCache;
    if (navigation !== state.navigation) return;
    if (changed) state.hidden = new Set();
    const fresh = changed || !state.cy;
    Object.assign(state, { target, manifest, shard, scopeShard: shard, universe, file: wanted,
      elsewhere: null, selection: null, positionCache, index });
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
    renderFilters();
    if (fresh) renderGraph();
    else refreshMap();
    if (!restoreView(savedScene) && shard.scope !== universe.root) frameNode(shard.scope);
    renderDetails(null);
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

function up() {
  if (!state.shard) return;
  if (state.scopeShard.scope !== state.universe.root) state.universe.expanded.delete(state.scopeShard.scope);
  const parents = state.shard.parents;
  if (parents.length) openScope(parents[parents.length - 1].file);
}

function onKey(event) {
  const typing = event.target.closest && event.target.closest('input, select, textarea');
  if (typing || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'Backspace') { event.preventDefault(); up(); }
  if (event.key === '/') { event.preventDefault(); $('find').focus(); }
  if (event.key === 'Escape') { unfocus(); renderDetails(null); }
  if (event.target === $('graph') && ['+', '=', '-'].includes(event.key)) {
    event.preventDefault();
    state.pointer = {x:state.cy.width()/2,y:state.cy.height()/2};
    state.cy.zoom({level:state.cy.zoom() * (event.key === '-' ? 0.8 : 1.25),renderedPosition:state.pointer});
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
  if (t.stale) {
    const more = t.changed_count > t.changed.length ? ` and ${t.changed_count - t.changed.length} more` : '';
    banner.textContent = `Stale: ${t.changed_count} build input(s) changed since run ${t.run} (${t.changed.join(', ')}${more}). ` +
      `Run: python laniakea.py extract ${t.id}; restart the server to load the new run.`;
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
  panel.replaceChildren(el('h2', 'Visible stars & constellations'));
  const members = el('div', null, { class: 'node-list' });
  for (const node of state.shard.nodes.filter(n => state.shard.members.includes(n.id))) {
    const button = el('button', node.label, { type: 'button', title: `Trace ${node.label}`, 'data-node': node.id });
    button.append(el('small', nodeDescription(node)));
    button.onclick = () => selectNode(node.id);
    members.append(button);
  }
  panel.append(members, el('h2', 'Connections'));
  const present = new Set(state.universe.graph.edges.map(e => e.type));
  for (const type of state.manifest.edge_types) {
    if (!present.has(type.id)) continue;
    const count = state.universe.graph.edges.filter(e => e.type === type.id).length;
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
    'drag space': 'fly through the map',
    'click': 'inspect a star or connection',
    '/': 'find any recorded node; Enter flies to it',
    'double-click, Enter': 'expand or collapse a constellation',
    '+, -': 'zoom when the map has focus',
    'arrow keys': 'browse stars when the map has focus',
    'Backspace, Up': 'one level up',
    'Alt+Left': 'back, as in any page',
    'Esc': 'clear the highlight',
    'dashed line': 'summary of several relationships',
    'dashed star': 'outside the analysed target',
    'diamond': 'outside the project',
  });
  panel.append(keys);
}

function findHits() {
  const query = $('find').value.trim().toLowerCase();
  if (!query || !state.cy) return state.cy ? state.cy.collection() : [];
  return state.cy.nodes(':visible').filter((n) => n.data('label').toLowerCase().includes(query));
}

// Light the matches in this view and bring them into view. With none here, name the best match elsewhere in the
// project, which Enter opens.
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
  return el('a', location.path, { href: `vscode://file/${encodeURI(path)}:${location.line || 1}` });
}

function attributes(list, attrs) {
  for (const [key, value] of Object.entries(attrs || {})) {
    list.append(el('dt', key), el('dd', Array.isArray(value) ? value.join(', ') || '-' : value));
  }
}

function typeLabel(type) {
  const entry = state.manifest.edge_types.find(t => t.id === type);
  return entry ? entry.label : type;
}

function renderDetails(item) {
  state.selection = item;
  const panel = $('details');
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
    attributes(list, item.attrs);
    panel.append(list);
    if (state.universe.isGroup(item.id) && item.id !== state.universe.root) {
      const opened = state.universe.expanded.has(item.id);
      const button = el('button', opened ? 'Collapse constellation' : 'Expand constellation', {type:'button'});
      button.onclick = () => toggleGroup(item.id);
      panel.append(button);
    }
    const fly = el('button', 'Fly to star', {type:'button'});
    fly.onclick = () => flyToNode(item.id);
    panel.append(fly);
    renderConnections(panel, item);
    return;
  }
  panel.append(el('h2', typeLabel(item.type)));
  const endpoints = el('p', null, {class:'endpoints'});
  for (const id of [item.source,item.target]) {
    const button = el('button', label(id), {type:'button'});
    button.onclick = () => flyToNode(id);
    if (id === item.target) endpoints.append(el('span', 'references', {class:'muted'}));
    endpoints.append(button);
  }
  panel.append(endpoints);
  appendReferences(panel, item.refs || [item]);
}

function appendReferences(panel, references) {
  const list = el('ul', null, {class:'connections'});
  for (const edge of references) {
    const row = el('li');
    const source = state.universe.nodes.get(edge.source), target = state.universe.nodes.get(edge.target);
    const button = el('button', `${source.label} (${source.level}) -> ${target.label} (${target.level})`,
      {type:'button',title:'Reveal this exact reference in the map'});
    button.onclick = () => followReference(edge);
    row.append(button, el('small', `${typeLabel(edge.type)} / ${edge.status}` +
      (state.hidden.has(edge.type) || !state.boundary && (source.boundary || target.boundary) ? ' / hidden by filters' : '')));
    if (source.source) {
      const link = sourceLink(source.source);
      if (link) row.append(link);
    }
    list.append(row);
  }
  panel.append(list);
}

function renderConnections(panel, node) {
  const map = state.universe;
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
