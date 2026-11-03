// SPDX-License-Identifier: AGPL-3.0-or-later
// The viewer renders shards and knows no language: levels, edge types and sources all come from the manifest.
'use strict';

const PALETTE = ['#4e79a7', '#f28e2b', '#59a14f', '#e15759', '#76b7b2', '#b07aa1', '#9c755f', '#edc948', '#ff9da7', '#bab0ac'];
const state = { targets: [], target: null, manifest: null, shard: null, cy: null, hidden: new Set(), boundary: true };
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
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function style() {
  return [
    { selector: 'node', style: { label: 'data(label)', color: css('--fg'), 'font-size': 11, 'text-valign': 'bottom',
      'text-margin-y': 4, 'background-color': '#6c8ebf', width: 20, height: 20 } },
    { selector: 'node.member', style: { 'background-color': css('--accent'), width: 28, height: 28, 'font-weight': 'bold' } },
    { selector: 'node.openable', style: { shape: 'round-rectangle' } },
    { selector: 'node.boundary', style: { 'background-color': '#9aa0a6', shape: 'diamond' } },
    { selector: 'node.not-in-target', style: { 'background-opacity': 0.2, 'border-width': 2, 'border-style': 'dashed',
      'border-color': '#d08770' } },
    { selector: 'node.not-analysed', style: { 'border-width': 2, 'border-style': 'dotted', 'border-color': '#9aa0a6' } },
    { selector: 'node:selected', style: { 'border-width': 3, 'border-color': '#f2b632', 'border-style': 'solid' } },
    { selector: 'edge', style: { width: 1.5, 'line-color': 'data(color)', 'target-arrow-color': 'data(color)',
      'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'arrow-scale': 0.8, opacity: 0.85 } },
    { selector: 'edge.derived', style: { 'line-style': 'dashed', width: 2.5 } },
    { selector: 'edge:selected', style: { width: 4, opacity: 1 } },
  ];
}

function colorOf(type) {
  const index = state.manifest.edge_types.findIndex((t) => t.id === type);
  return index < 0 ? '#888888' : PALETTE[index % PALETTE.length];
}

async function start() {
  state.targets = await getJson('/data/targets.json');
  if (!state.targets.length) {
    $('graph').append(el('p', 'No extracted project yet. Run: python laniakea.py up <path to .uproject>', { class: 'empty' }));
    return;
  }
  const select = $('target');
  for (const target of state.targets) select.add(new Option(`${target.project} (${target.id})`, target.id));
  const last = recall('target');
  select.value = state.targets.some((t) => t.id === last) ? last : state.targets[0].id;
  select.onchange = () => openTarget(select.value);
  $('layout').value = recall('layout') || 'auto';
  $('layout').onchange = () => { remember('layout', $('layout').value); layout(); };
  await openTarget(select.value);
}

async function openTarget(id) {
  remember('target', id);
  state.target = state.targets.find((t) => t.id === id);
  state.manifest = await getJson(`/data/${encodeURIComponent(id)}/manifest.json`);
  state.hidden = new Set();
  renderBanner();
  renderCoverage();
  await openScope(state.manifest.entry);
}

async function openScope(file) {
  state.shard = await getJson(`/data/${encodeURIComponent(state.target.id)}/scopes/${encodeURIComponent(file)}`);
  renderCrumbs();
  renderFilters();
  renderGraph();
  renderDetails(null);
}

function renderBanner() {
  const banner = $('banner');
  const t = state.target;
  banner.hidden = !t.stale;
  if (t.stale) {
    const more = t.changed_count > t.changed.length ? ` and ${t.changed_count - t.changed.length} more` : '';
    banner.textContent = `Stale: ${t.changed_count} build input(s) changed since run ${t.run} (${t.changed.join(', ')}${more}). ` +
      `Run: python laniakea.py extract ${t.id}`;
  }
}

function renderCrumbs() {
  const crumbs = $('crumbs');
  crumbs.replaceChildren();
  for (const parent of state.shard.parents) {
    const button = el('button', parent.title, { type: 'button' });
    button.onclick = () => openScope(parent.file);
    crumbs.append(button, el('span', '/'));
  }
  crumbs.append(el('strong', state.shard.title));
}

function renderFilters() {
  const panel = $('filters');
  panel.replaceChildren(el('h2', 'Edges'));
  const present = new Set(state.shard.edges.map((e) => e.type));
  for (const type of state.manifest.edge_types) {
    const count = state.shard.edges.filter((e) => e.type === type.id).length;
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
  panel.append(label, el('p', 'Square: double-click to open. Dashed: outside the analysed target.', { class: 'hint' }));
}

function renderGraph() {
  const shard = state.shard;
  const members = new Set(shard.members);
  const nodes = shard.nodes.map((n) => ({
    group: 'nodes',
    data: { id: n.id, label: n.label },
    classes: [members.has(n.id) && 'member', shard.drill[n.id] && 'openable', n.boundary && 'boundary', n.status]
      .filter(Boolean).join(' '),
  }));
  const edges = shard.edges.map((e) => ({
    group: 'edges', data: { id: e.id, source: e.source, target: e.target, type: e.type, color: colorOf(e.type) },
    classes: e.status,
  }));
  if (state.cy) state.cy.destroy();
  state.cy = cytoscape({ container: $('graph'), elements: [...nodes, ...edges], style: style(), minZoom: 0.05, maxZoom: 4 });
  state.cy.on('tap', 'node', (event) => renderDetails(shard.nodes.find((n) => n.id === event.target.id())));
  state.cy.on('tap', 'edge', (event) => renderDetails(shard.edges.find((e) => e.id === event.target.id())));
  state.cy.on('tap', (event) => { if (event.target === state.cy) renderDetails(null); });
  state.cy.on('dbltap', 'node', (event) => { const file = shard.drill[event.target.id()]; if (file) openScope(file); });
  applyFilters();
}

function applyFilters() {
  if (!state.cy) return;
  state.cy.batch(() => {
    state.cy.nodes().forEach((n) => n.style('display', !state.boundary && n.hasClass('boundary') ? 'none' : 'element'));
    state.cy.edges().forEach((e) => e.style('display', state.hidden.has(e.data('type')) ? 'none' : 'element'));
  });
  layout();
}

// A layered layout of a wide, shallow scope collapses into one unreadable row, so auto switches to force above this.
const LAYERED_LIMIT = 40;

function layout() {
  if (!state.cy) return;
  const visible = state.cy.elements(':visible');
  let name = $('layout').value;
  if (name === 'auto') name = visible.nodes().length > LAYERED_LIMIT ? 'cose' : 'breadthfirst';
  const options = { name, animate: false, padding: 30, nodeDimensionsIncludeLabels: true };
  if (name === 'breadthfirst') Object.assign(options, { directed: true, spacingFactor: 1.15 });
  if (name === 'concentric') Object.assign(options, { concentric: (n) => (n.hasClass('member') ? 2 : 1), levelWidth: () => 1 });
  if (name === 'cose') {
    // Seeded from a grid of the sorted input instead of random positions, so the same scope lays out the same way.
    visible.layout({ name: 'grid', animate: false }).run();
    Object.assign(options, { randomize: false, nodeRepulsion: () => 12000, idealEdgeLength: () => 90 });
  }
  visible.layout(options).run();
  state.cy.fit(visible, 30);
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

function renderDetails(item) {
  const panel = $('details');
  panel.replaceChildren();
  if (!item) {
    panel.append(el('h2', 'Details'), el('p', 'Select a node or an edge.'));
    return;
  }
  const list = el('dl');
  if (item.level !== undefined) {
    panel.append(el('h2', item.level), el('p', item.label));
    attributes(list, { status: item.status, boundary: item.boundary ? 'yes' : 'no' });
    if (item.source) {
      const link = sourceLink(item.source);
      if (link) { const dd = el('dd'); dd.append(link); list.append(el('dt', 'source'), dd); }
    }
    attributes(list, item.attrs);
    panel.append(list);
    const file = state.shard.drill[item.id];
    if (file) {
      const open = el('button', 'Open', { type: 'button' });
      open.onclick = () => openScope(file);
      panel.append(open);
    }
    return;
  }
  const type = state.manifest.edge_types.find((t) => t.id === item.type);
  const origin = state.manifest.sources.find((s) => s.id === item.origin);
  panel.append(el('h2', type ? type.label : item.type), el('p', `${label(item.source)} -> ${label(item.target)}`));
  attributes(list, { status: item.status, from: origin ? `${origin.name} ${origin.version}` : item.origin });
  attributes(list, item.attrs);
  panel.append(list);
}

function label(id) {
  const node = state.shard.nodes.find((n) => n.id === id);
  return node ? node.label : id;
}

function renderCoverage() {
  const m = state.manifest;
  const footer = $('coverage');
  footer.replaceChildren(el('div', `${m.project}: ${m.target.name} ${m.target.platform} ${m.target.configuration}, ` +
    `run ${m.run}, ${m.tool.name} ${m.tool.version}`));
  const missing = el('ul');
  for (const line of m.coverage.not_analysed) missing.append(el('li', `not analysed: ${line}`));
  footer.append(missing);
}

start().catch((error) => {
  $('graph').replaceChildren(el('p', `Could not load: ${error.message}`, { class: 'empty' }));
});
