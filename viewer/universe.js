// SPDX-License-Identifier: AGPL-3.0-or-later
// Canonical containment and references stay independent of the visible, folded map.
'use strict';

class Universe {
  constructor(graph) {
    this.graph = graph;
    this.nodes = new Map(graph.nodes.map(n => [n.id, n]));
    this.children = new Map();
    this.paths = new Map();
    this.positions = new Map();
    this.radii = new Map();
    if (this.nodes.size !== graph.nodes.length) throw new Error('Duplicate graph node id');
    const roots = graph.nodes.filter(n => n.parent === null && !n.boundary);
    if (roots.length !== 1) throw new Error('Expected one project root');
    this.root = roots[0].id;
    for (const n of graph.nodes) {
      if (n.parent !== null && !this.nodes.has(n.parent)) throw new Error('Unknown containment parent');
      if (!this.children.has(n.parent)) this.children.set(n.parent, []);
      this.children.get(n.parent).push(n.id);
    }
    for (const children of this.children.values()) children.sort();
    for (const n of graph.nodes) {
      const path = [], seen = new Set();
      let id = n.id;
      while (id !== null) {
        if (seen.has(id)) throw new Error('Containment cycle');
        seen.add(id); path.push(id); id = this.nodes.get(id).parent;
      }
      this.paths.set(n.id, path.reverse());
    }
    const edgeIds = new Set();
    for (const e of graph.edges) {
      if (!this.nodes.has(e.source) || !this.nodes.has(e.target)) throw new Error('Unknown reference endpoint');
      if (edgeIds.has(e.id)) throw new Error('Duplicate reference id');
      edgeIds.add(e.id);
    }
    this.bundlePrefix = 'bundle:';
    while ([...edgeIds].some(id => id.startsWith(this.bundlePrefix))) this.bundlePrefix = '@' + this.bundlePrefix;
    this.renderPrefix = 'edge:';
    while ([...this.nodes.keys()].some(id => id.startsWith(this.renderPrefix))) this.renderPrefix = '@' + this.renderPrefix;
    this.expanded = new Set([this.root]);
  }

  childIds(id) { return this.children.get(id) || []; }
  isGroup(id) { return this.childIds(id).length > 0; }
  contains(parent, id) { return this.paths.get(id).includes(parent); }

  representative(id) {
    const path = this.paths.get(id);
    return path.find(a => a !== id && !this.expanded.has(a)) || id;
  }

  reveal(id) {
    for (const ancestor of this.paths.get(id).slice(0, -1)) this.expanded.add(ancestor);
  }

  references(id) {
    return this.graph.edges.filter(e => this.contains(id, e.source) || this.contains(id, e.target));
  }

  project(hiddenTypes = new Set(), boundary = true) {
    const internal = new Map(), bundles = new Map(), edges = [];
    let hidden = 0;
    for (const edge of this.graph.edges) {
      if (hiddenTypes.has(edge.type) || (!boundary &&
          (this.nodes.get(edge.source).boundary || this.nodes.get(edge.target).boundary))) { hidden++; continue; }
      const source = this.representative(edge.source), target = this.representative(edge.target);
      const exact = source === edge.source && target === edge.target;
      if (source === target && !exact) {
        if (!internal.has(source)) internal.set(source, []);
        internal.get(source).push(edge);
      } else if (exact) {
        edges.push({ ...edge, refs: [edge] });
      } else {
        const type = edge.type.split('.')[0] + '.rollup';
        const key = JSON.stringify([type, source, target]);
        if (!bundles.has(key)) bundles.set(key, { id: this.bundlePrefix + key, type, source, target,
          status: 'derived', origin: 'rollup', refs: [] });
        bundles.get(key).refs.push(edge);
      }
    }
    for (const edge of bundles.values()) edges.push({ ...edge, attrs: { edges: edge.refs.length,
      kinds: [...new Set(edge.refs.map(e => e.type))].sort() } });
    const endpoints = new Set(edges.flatMap(e => [e.source, e.target]));
    const nodes = this.graph.nodes.filter(n => (boundary || !n.boundary) && this.representative(n.id) === n.id &&
      (n.id !== this.root || !this.isGroup(n.id) || endpoints.has(n.id)));
    return { nodes, edges, internal, hidden };
  }

  // Coordinates are world positions. Only the new group's contents are placed; outer stars do not move.
  place(layouts, mode, topPositions = null) {
    const saved = Object.hasOwn(layouts, mode) ? layouts[mode] : {};
    const savedPoint = id => Object.hasOwn(saved, id) ? saved[id] : null;
    const top = [...this.childIds(this.root), ...this.childIds(null).filter(id => id !== this.root)];
    if (!top.length) top.push(this.root);
    const radius = Math.max(240, top.length * 34);
    top.forEach((id, i) => {
      const angle = -Math.PI / 2 + i * 2 * Math.PI / top.length;
      const p = savedPoint(id) || (topPositions && topPositions.get(id)) ||
        { x: Math.cos(angle) * radius * 1.3, y: Math.sin(angle) * radius };
      this.positions.set(id, { ...p });
    });
    this.positions.set(this.root, { ...savedPoint(this.root) || topPositions && topPositions.get(this.root) ||
      { x: -radius * 1.1, y: -radius * 0.85 } });
    const placeChildren = (id, r) => {
      this.radii.set(id, r);
      const children = this.childIds(id), p = this.positions.get(id);
      const columns = Math.ceil(Math.sqrt(children.length));
      const rows = Math.ceil(children.length / columns);
      const spacing = 2 * r / Math.max(columns, rows, 2);
      children.forEach((child, i) => {
        const row = Math.floor(i / columns), col = i % columns;
        const count = Math.min(columns, children.length - row * columns);
        this.positions.set(child, { ...savedPoint(child) || { x: p.x + (col - (count - 1) / 2) * spacing,
          y: p.y + (row - (rows - 1) / 2) * spacing } });
        placeChildren(child, children.length === 1 ? r * 0.7 : Math.min(r * 0.4, spacing * 0.3));
      });
    };
    for (const id of top) {
      const p = this.positions.get(id);
      const distance = Math.min(...top.filter(other => other !== id).map(other => {
        const q = this.positions.get(other); return Math.hypot(q.x - p.x, q.y - p.y);
      }));
      placeChildren(id, Math.max(30, Math.min(130, distance * 0.34)));
    }
    this.radii.set(this.root, radius);
  }

  translate(id, dx, dy, descendants = true) {
    const patch = Object.create(null);
    for (const [child, p] of this.positions) {
      if (descendants ? !this.contains(id, child) : child !== id) continue;
      const point = { x: p.x + dx, y: p.y + dy };
      this.positions.set(child, point); patch[child] = point;
    }
    return patch;
  }

  zoomStep(zoom, point, direction) {
    if (direction > 0) {
      const candidates = [...this.nodes.keys()].filter(id => id !== this.root && this.isGroup(id) &&
        !this.expanded.has(id) && this.representative(id) === id && 2 * this.radii.get(id) * zoom >= 300 &&
        Math.hypot(point.x - this.positions.get(id).x, point.y - this.positions.get(id).y) <= this.radii.get(id));
      candidates.sort((a, b) => Math.hypot(point.x - this.positions.get(a).x, point.y - this.positions.get(a).y) -
        Math.hypot(point.x - this.positions.get(b).x, point.y - this.positions.get(b).y));
      if (candidates.length) {
        this.expanded.add(candidates[0]); return { action: 'expand', id: candidates[0] };
      }
    } else if (direction < 0) {
      const closing = [...this.expanded].filter(id => id !== this.root && 2 * this.radii.get(id) * zoom < 190);
      closing.sort((a, b) => this.paths.get(b).length - this.paths.get(a).length);
      if (closing.length) {
        this.expanded.delete(closing[0]); return { action: 'collapse', id: closing[0] };
      }
    }
    return null;
  }
}

if (typeof module !== 'undefined') module.exports = { Universe };
