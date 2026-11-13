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

function sourceGlyphOverlaps(glyphs,candidates=new Set(glyphs.map(g=>g.id)),obstacles=labelObstacles(glyphs)) {
  const overlaps=new Set();if(!obstacles)return overlaps;
  for(const glyph of glyphs){
    if(!candidates.has(glyph.id))continue;
    const a=glyph.box;
    for(const index of obstacles.search(a.x1-4,a.y1-4,a.x2+4,a.y2+4)){
      const other=glyphs[index],b=other.box;
      if(other.id!==glyph.id&&candidates.has(other.id)&&a.x1<b.x2+4&&b.x1<a.x2+4&&a.y1<b.y2+4&&b.y1<a.y2+4){
        overlaps.add(glyph.id);overlaps.add(other.id);
      }
    }
  }
  return overlaps;
}

function updateSourceOverlap(glyphs,obstacles) {
  const status=$('source-layout-status');
  if(!state.universe||!state.scopeShard){status.hidden=true;return;}
  const owner=sourceArrangementOwner(),map=state.universe;
  const button=$('arrange-files');
  if(!owner){if(!status.hidden)status.hidden=true;if(button.dataset?.overlap!=='false')button.setAttribute('data-overlap','false');return;}
  const local=new Set(glyphs.filter(g=>map.nodes.get(g.id)?.attrs?.source_file&&map.contains(owner,g.id)&&
    g.box.x2>=0&&g.box.y2>=0&&g.box.x1<=state.cy.width()&&g.box.y1<=state.cy.height()).map(g=>g.id));
  const count=sourceGlyphOverlaps(glyphs,local,obstacles).size;
  const text=count?`${count} file markers overlap`:'',mark=String(Boolean(count));
  if(status.hidden!==!count)status.hidden=!count;
  if(status.textContent!==text)status.textContent=text;
  if(button.dataset?.overlap!==mark)button.setAttribute('data-overlap',mark);
}

function sourceArrangementOwner(){
  const map=state.universe,scope=state.scopeShard?.scope;
  if(!map||!scope)return null;
  const owner=map.nodes.get(scope)?.attrs?.source_owner||scope;
  for(const id of map.contextFiles.keys())if(map.nodes.get(id).attrs.source_owner===owner)return owner;
  return null;
}

async function arrangeSourceFiles(){
  const id=sourceArrangementOwner(),map=state.universe,cache=state.positionCache,cy=state.cy,mode=$('layout').value;
  if(!id||!cache||!cy)return;
  if(!confirm(`Arrange source files in ${map.nodes.get(id).label}? Saved positions inside this scope will be replaced. Other scopes stay fixed.`))return;
  $('arrange-files').disabled=true;cy.autoungrabify(true);
  try{
    const patch=map.arrangeSource(id);
    cy.maxZoom(map.zoomLimit);refreshMap();frameNode(id);
    await cache.moveMany(mode,patch);
  }finally{cy.autoungrabify(false);$('arrange-files').disabled=false;}
}
