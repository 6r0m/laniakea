// SPDX-License-Identifier: AGPL-3.0-or-later
// User positions are presentation state in the ignored workspace, never extraction inputs.
'use strict';

const unsavedPositionCaches = new Set();

function positionBodies(mode, positions) {
  if (positions === null) return [JSON.stringify({layout:mode,positions:null})];
  const encoder = new TextEncoder(), limit = 48 * 1024;
  const overhead = encoder.encode(JSON.stringify({layout:mode,positions:{}})).byteLength;
  const bodies = [];
  let entries = [], bytes = overhead;
  const body = () => JSON.stringify({layout:mode,positions:Object.fromEntries(entries)});
  for (const entry of Object.entries(positions)) {
    const size = encoder.encode(JSON.stringify(Object.fromEntries([entry]))).byteLength - 2;
    if (entries.length && bytes + size + 1 > limit) {
      bodies.push(body()); entries = []; bytes = overhead;
    }
    if (bytes + size > limit) throw new Error('A position identifier exceeds the save request limit');
    bytes += size + (entries.length ? 1 : 0); entries.push(entry);
  }
  if (entries.length || !bodies.length) bodies.push(body());
  return bodies;
}

class PositionCache {
  constructor(url, layouts) {
    this.url = url;
    this.layouts = layouts;
    this.tail = Promise.resolve();
    this.pending = 0;
    this.errors = new Set();
  }

  async write(mode, positions) {
    const keys = positions === null ? [`${mode}/reset`] : Object.keys(positions).map(id => `${mode}/${id}`);
    this.pending++;
    unsavedPositionCaches.add(this);
    this.status();
    const operation = this.tail.then(async () => {
      try {
        for (const body of positionBodies(mode, positions)) {
          const response = await fetch(this.url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body, keepalive: true });
          const message = await response.text?.();
          if (!response.ok) throw new Error(`HTTP ${response.status}: ${message}`);
        }
        if (positions === null) {
          delete this.layouts[mode];
          for (const key of this.errors) if (key.startsWith(`${mode}/`)) this.errors.delete(key);
        }
        for (const key of keys) this.errors.delete(key);
        return true;
      } catch (error) {
        for (const key of keys) this.errors.add(key);
        this.lastError = error.message;
        return false;
      } finally {
        this.pending--;
        if (!this.pending && !this.errors.size) unsavedPositionCaches.delete(this);
        this.status();
      }
    });
    this.tail = operation;
    return operation;
  }

  move(mode, node) {
    const point = { x: node.position('x'), y: node.position('y') };
    return this.moveMany(mode, Object.fromEntries([[node.id(), point]]));
  }

  moveMany(mode, positions) {
    this.layouts[mode] = { ...this.layouts[mode], ...positions };
    return this.write(mode, positions);
  }

  status() {
    if (state.positionCache !== this) return;
    const mode = $('layout').value;
    const failed = [...this.errors].some(key => key.startsWith(`${mode}/`));
    const status = $('position-status');
    status.textContent = this.pending ? 'Saving positions...' : failed ? 'Positions not saved. Drag again or reset to retry.' :
      Object.keys(this.layouts[mode] || {}).length ? 'Positions saved' : 'Drag stars to arrange';
    status.title = failed ? this.lastError : '';
  }
}

async function loadPositionCache(target, file) {
  const url = `/layout/${encodeURIComponent(target)}/${encodeURIComponent(file)}`;
  for (const cache of unsavedPositionCaches) {
    if (cache.url !== url) continue;
    await cache.tail;
    // Retain failed moves so opening the scope cannot silently discard them.
    if (cache.errors.size) return cache;
  }
  return new PositionCache(url, await getJson(url));
}

async function resetPositions() {
  const cache = state.positionCache, cy = state.cy, mode = $('layout').value;
  if (!cache || !cy) return;
  const count = Object.keys(cache.layouts[mode] || {}).length;
  const name = $('layout').selectedOptions?.[0]?.textContent || mode;
  if (count && !confirm(`Reset ${count} saved position${count === 1 ? '' : 's'} for ${state.target.project} (${name})?`)) return;
  $('reset-layout').disabled = true;
  cy.autoungrabify(true);
  try {
    const saved = await cache.write(mode, null);
    if (saved && state.cy === cy && $('layout').value === mode) layout();
  } finally {
    cy.autoungrabify(false);
    $('reset-layout').disabled = false;
  }
}
