// SPDX-License-Identifier: AGPL-3.0-or-later
// Canonical containment and references stay independent of the visible, folded map.
'use strict';
const SpatialIndex = typeof Flatbush !== 'undefined' ? Flatbush : require('./vendor/flatbush.js');
const Sections = typeof SourceSections !== 'undefined' ? SourceSections : require('./sections.js').SourceSections;

function referenceCount(edge) { return edge.count === undefined ? 1 : edge.count; }
function referenceTotal(edges) { return edges.reduce((sum,edge)=>sum+referenceCount(edge),0); }

class Universe {
  constructor(graph, manifest = {}) {
    this.paged = graph.schema === 'laniakea.map/1';
    if (this.paged) {
      const nodes = graph.nodes;
      const files=graph.files||[];
      graph = {schema:'laniakea.graph/1',nodes,files,edges:graph.references.map((row,index)=>{
        if (!Number.isInteger(row.source) || !Number.isInteger(row.target) || row.source<0 || row.target<0 ||
          !nodes[row.source] || !nodes[row.target] || !Number.isSafeInteger(row.count) || row.count<1 || typeof row.type!=='string') {
          throw new Error('Invalid map reference group');
        }
        for(const end of ['source','target'])if(row[end+'_file']!==undefined&&
          (!Number.isInteger(row[end+'_file'])||row[end+'_file']<0||!files[row[end+'_file']]))throw Error('Invalid reference file');
        return {id:'group:'+(index+1),group:index+1,source:nodes[row.source].id,target:nodes[row.target].id,
          type:row.type,count:row.count,status:'derived',origin:'rollup',
          sourceFile:row.source_file,targetFile:row.target_file,
          ...(row.internal_to_owner !== undefined ? {internal_to_owner:row.internal_to_owner} : {})};
      })};
    }
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
    this.overview = manifest.overview === undefined ? null : manifest.overview;
    this.configurationTypes = new Set();
    if (manifest.overview !== undefined) {
      const hint=this.overview;
      if (!hint || typeof hint!=='object' || Array.isArray(hint)) throw new Error('Invalid overview presentation hint');
      const anchor=this.nodes.get(hint.anchor),declared=new Set((manifest.edge_types||[]).map(t=>t.id));
      if (!anchor || !anchor.boundary || anchor.parent!==null || !Array.isArray(hint.configuration_types) ||
          new Set(hint.configuration_types).size!==hint.configuration_types.length ||
          hint.configuration_types.some(t=>typeof t!=='string'||!declared.has(t)||t.endsWith('.rollup'))) {
        throw new Error('Invalid overview presentation hint');
      }
      this.configurationTypes = new Set(hint.configuration_types);
    }
    this.configurationCount = 0;
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
    const sections=Sections.build(graph);
    this.canonicalPaths=this.paths;
    Object.assign(this,{nodes:sections.nodes,children:sections.children,paths:sections.paths,viewParents:sections.parents});
    this.fileIds=sections.fileIds;
    this.regions=new Set([...this.nodes.values()].filter(n=>n.attrs?.source_region).map(n=>n.id));
    this.viewNodes=[...this.nodes.values()];
    const edgeIds = new Set();
    this.typeCounts = new Map();
    this.referenceStats = new Map(this.viewNodes.map(n=>[n.id,{outgoing:0,incoming:0,within:0}]));
    this.configurationStats = new Map(this.viewNodes.map(n=>[n.id,{outgoing:0,incoming:0,within:0}]));
    this.configurationReferences = [];
    this.configurationTargets = new Set();
    this.directReferences = new Map(this.viewNodes.map(n=>[n.id,[]]));
    this.referenceIndex = new Map(this.viewNodes.map(n => [n.id, []]));
    for (const e of graph.edges) {
      if (!this.nodes.has(e.source) || !this.nodes.has(e.target)) throw new Error('Unknown reference endpoint');
      if (e.internal_to_owner !== undefined && (typeof e.internal_to_owner!=='boolean' || e.internal_to_owner && e.source!==e.target)) {
        throw new Error('Invalid internal reference classification');
      }
      if (edgeIds.has(e.id)) throw new Error('Duplicate reference id');
      edgeIds.add(e.id);
      const count = referenceCount(e), targetPath = this.referencePath(e,'target');
      const configuration = this.isConfiguration(e);
      if (configuration) {
        this.configurationCount += count;
        this.configurationReferences.push(e);
        this.configurationTargets.add(e.target);
      }
      this.typeCounts.set(e.type, (this.typeCounts.get(e.type) || 0) + count);
      for (const id of new Set([e.source,e.target])) this.directReferences.get(id).push(e);
      const sourcePath = this.referencePath(e,'source');
      for (const id of sourcePath) {
        this.referenceIndex.get(id).push(e);
        const direction=targetPath.includes(id)?'within':'outgoing';
        this.referenceStats.get(id)[direction] += count;
        if(configuration)this.configurationStats.get(id)[direction] += count;
      }
      for (const id of targetPath) {
        if (!sourcePath.includes(id)) {
          this.referenceIndex.get(id).push(e);this.referenceStats.get(id).incoming += count;
          if(configuration)this.configurationStats.get(id).incoming += count;
        }
      }
    }
    this.bundlePrefix = 'bundle:';
    while ([...edgeIds].some(id => id.startsWith(this.bundlePrefix))) this.bundlePrefix = '@' + this.bundlePrefix;
    this.renderPrefix = 'edge:';
    while ([...this.nodes.keys()].some(id => id.startsWith(this.renderPrefix))) this.renderPrefix = '@' + this.renderPrefix;
    this.expanded = new Set([this.root]);
    this.containmentOrder=this.viewNodes.slice().sort((a,b)=>this.paths.get(a.id).length-this.paths.get(b.id).length);
    this.filteredTotals = new Map();
  }

  childIds(id) { return this.children.get(id) || []; }
  isGroup(id) { return this.childIds(id).length > 0; }
  definitionTarget(id){
    const ids=this.nodes.get(id)?.attrs?.source_definitions||[];
    if(this.isGroup(id)||!ids.length)return null;
    if(ids.length===1)return ids[0];
    const parent=this.nodes.get(ids[0]).parent;
    return parent!==this.root&&!this.nodes.get(parent)?.attrs?.source_sections&&
      ids.every(id=>this.nodes.get(id).parent===parent)?parent:null;
  }
  contains(parent, id) { return this.paths.get(id).includes(parent); }

  referencePath(edge,end){
    const path=this.paths.get(edge[end]),file=this.fileIds[edge[end+'File']];
    if(!file)return path;
    return [...new Set([...path.filter(id=>!this.nodes.get(id).attrs?.presentation_group),...this.paths.get(file)])];
  }

  referenceInside(id,edge,end){
    const file=this.fileIds[edge[end+'File']];
    return this.nodes.get(id)?.attrs?.presentation_group&&file?this.contains(id,file):this.contains(id,edge[end]);
  }

  endpoint(edge,end,expanded){
    const base=this.representative(edge[end],expanded),file=this.fileIds[edge[end+'File']];
    if(!file)return base;
    const owner=this.nodes.get(file).attrs.source_owner;
    if(!this.nodes.get(base).attrs?.presentation_group&&base!==owner&&this.canonicalPaths.get(base)?.includes(owner))return base;
    return this.representative(file,expanded);
  }

  representative(id, expanded = this.expanded) {
    const path = this.paths.get(id);
    return path.find(a => a !== id && !this.regions.has(a) && !expanded.has(a)) || id;
  }

  reveal(id) {
    for (const ancestor of this.paths.get(id).slice(0, -1)) this.expanded.add(ancestor);
  }

  references(id) {
    return (this.referenceIndex.get(id) || []).slice();
  }

  isConfiguration(edge) { return edge.source===this.root && this.configurationTypes.has(edge.type); }

  viewportCut(camera) {
    const expanded = new Set([this.root]);
    const endpoints = new Set(camera.force || []),forced = new Set(endpoints);
    for (const id of [...forced]) for (const parent of this.paths.get(id) || []) forced.add(parent);
    const near = new Set(this.spatial.search(camera.x1,camera.y1,camera.x2,camera.y2).map(i=>this.spatialIds[i]));
    for (const id of [...new Set([...this.expanded,...this.regions])].sort((a,b)=>this.paths.get(a).length-this.paths.get(b).length)) {
      const node=this.nodes.get(id);
      if ((this.viewParents.get(node.id)===null || expanded.has(this.viewParents.get(node.id))) &&
        (this.regions.has(id)||forced.has(node.id) || near.has(node.id) && this.radii.get(node.id)*camera.zoom>90)) expanded.add(node.id);
    }
    // Canonical input order is not a containment-order contract.
    for (const id of forced) if (this.expanded.has(id)) expanded.add(id);
    const inWindow=id=>{
      const p=this.positions.get(id),margin=50/camera.zoom;
      return p.x>=camera.x1-margin&&p.x<=camera.x2+margin&&p.y>=camera.y1-margin&&p.y<=camera.y2+margin;
    };
    const seeds = new Set([...near,...endpoints].filter(id=>this.representative(id,expanded)===id && (endpoints.has(id)||inWindow(id))));
    const references = new Set();
    for (const id of seeds) {
      if(!inWindow(id))continue;
      for (const edge of (expanded.has(id)?this.directReferences:this.referenceIndex).get(id) || []) references.add(edge);
    }
    return {expanded,seeds,references};
  }

  indexPositions() {
    this.spatialIds = [...this.positions.keys()];
    this.bounds=new Map(this.spatialIds.map(id=>{
      const p=this.positions.get(id),r=this.isGroup(id)||this.definitionTarget(id)?this.radii.get(id):0,area=this.areas?.get(id);
      const rx=area?area.width/2:r,ry=area?area.height/2:r;
      return [id,{x1:p.x-rx,y1:p.y-ry,x2:p.x+rx,y2:p.y+ry}];
    }));
    for(let i=this.containmentOrder.length-1;i>=0;i--){
      const node=this.containmentOrder[i],parent=this.bounds.get(this.viewParents.get(node.id)),box=this.bounds.get(node.id);
      if(parent){parent.x1=Math.min(parent.x1,box.x1);parent.y1=Math.min(parent.y1,box.y1);
        parent.x2=Math.max(parent.x2,box.x2);parent.y2=Math.max(parent.y2,box.y2);}
    }
    this.spatial = new SpatialIndex(this.spatialIds.length);
    for (const id of this.spatialIds) {
      const box=this.bounds.get(id);
      this.spatial.add(box.x1,box.y1,box.x2,box.y2);
    }
    this.spatial.finish();
  }

  project(hiddenTypes = new Set(), boundary = true, camera = null) {
    const internal = new Map(), bundles = new Map(), edges = [];
    const cut = camera && this.spatial ? this.viewportCut(camera) : null;
    const expanded = cut ? cut.expanded : new Set([...this.expanded,...this.regions]);
    const shown = new Map(), representative = id => {
      if (!shown.has(id)) shown.set(id,this.representative(id,expanded));
      return shown.get(id);
    };
    let hidden = 0;
    const excluded=e=>hiddenTypes.has(e.type) || this.isConfiguration(e) ||
      !boundary&&(this.nodes.get(e.source).boundary||this.nodes.get(e.target).boundary);
    const filterKey=JSON.stringify([boundary,[...hiddenTypes].sort()]);
    if (!this.filteredTotals.has(filterKey)) {
      this.filteredTotals.clear();
      this.filteredTotals.set(filterKey,this.graph.edges.reduce((sum,e)=>sum+(excluded(e)?referenceCount(e):0),0));
    }
    hidden=this.filteredTotals.get(filterKey);
    let represented=0;
    for (const edge of cut ? cut.references : this.graph.edges) {
      if (excluded(edge)) continue;
      represented+=referenceCount(edge);
      const source = this.endpoint(edge,'source',expanded), target = this.endpoint(edge,'target',expanded);
      const exact = source === edge.source && target === edge.target;
      if (source === target && (!exact || edge.internal_to_owner)) {
        if (!internal.has(source)) internal.set(source, []);
        internal.get(source).push(edge);
      } else {
        const type = edge.type.split('.')[0] + '.rollup';
        const key = JSON.stringify([type, source, target]);
        if (!bundles.has(key)) bundles.set(key, { id: this.bundlePrefix + key, type, source, target,
          status: 'derived', origin: 'rollup', refs: [] });
        const bundle = bundles.get(key);
        bundle.refs.push(edge);
        if (exact && bundle.refs.length === 1) bundle.exact = edge;
        else bundle.exact = null;
      }
    }
    for (const edge of bundles.values()) {
      if (edge.exact) edges.push({ ...edge.exact, refs: edge.refs });
      else {
        const {exact, ...bundle} = edge;
        edges.push({ ...bundle, count:referenceTotal(edge.refs), attrs: { edges: referenceTotal(edge.refs),
          kinds: [...new Set(edge.refs.map(e => e.type))].sort() } });
      }
    }
    const endpoints = new Set(edges.flatMap(e => [e.source, e.target]));
    const admitted = cut && new Set([...cut.seeds,...endpoints,...internal.keys()]);
    if (admitted) for (const id of [...admitted]) for (const parent of this.paths.get(id)) if(expanded.has(parent)) admitted.add(parent);
    const nodes = this.viewNodes.filter(n => (boundary || !n.boundary) && (!admitted || admitted.has(n.id)) && representative(n.id) === n.id &&
      (n.id !== this.root || !this.isGroup(n.id) || endpoints.has(n.id) || internal.has(n.id)));
    const total=[...this.typeCounts.values()].reduce((a,b)=>a+b,0);
    const visible=new Set(nodes.map(n=>n.id)),configurationMarks=new Map();
    for(const target of this.configurationTargets) {
      const id=representative(target);
      if(!visible.has(id))continue;
      if(!configurationMarks.has(id))configurationMarks.set(id,new Set());
      configurationMarks.get(id).add(target);
    }
    return { nodes, edges, internal, hidden, expanded, configurationMarks, outside:total-hidden-represented };
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
    this.zoomLimit=20000;
    this.areas=new Map();
    const pinned=new Set();
    for (const id of top) {
      const p = this.positions.get(id);
      const distance = Math.min(...top.filter(other => other !== id).map(other => {
        const q = this.positions.get(other); return Math.hypot(q.x - p.x, q.y - p.y);
      }));
      this.placeBranch(id, Math.max(30, Math.min(130, distance * 0.34)),savedPoint,pinned);
    }
    this.radii.set(this.root, radius);
    this.indexPositions();
  }

  placeBranch(id,r,savedPoint,pinned,area=null){
    this.radii.set(id,r);
    if(area)this.areas.set(id,area);else this.areas.delete(id);
    const children=this.childIds(id),p=this.positions.get(id),attrs=this.nodes.get(id).attrs;
    if(children.length)this.zoomLimit=Math.max(this.zoomLimit,180/r);
    const bands=attrs?.source_sections&&children.length>0&&children.every(child=>this.regions.has(child));
    if(bands){
      const weights=children.map(child=>Math.max(1,Math.ceil(this.childIds(child).length/3))),sum=weights.reduce((a,b)=>a+b,0);
      const gap=Math.min(r*0.3,r*0.5/Math.max(1,children.length-1)),height=(1.7*r-gap*(children.length-1))/sum;
      let y=p.y-r*0.85;
      children.forEach((child,i)=>{
        const h=weights[i]*height;
        this.positions.set(child,{...savedPoint(child)||{x:p.x,y:y+h/2}});
        this.placeBranch(child,Math.min(r*0.9,h/2),savedPoint,pinned,{width:r*1.8,height:h});y+=h+gap;
      });
    }else{
      const width=area?.width||2*r,height=area?.height||2*r;
      const columns=Math.max(1,Math.min(children.length,Math.ceil(Math.sqrt(children.length*(area?width/height*0.3:1)))));
      const rows=Math.ceil(children.length/columns),dx=width/Math.max(columns,2),dy=height/Math.max(rows,2);
      children.forEach((child,i)=>{
        const row=Math.floor(i/columns),col=i%columns,count=Math.min(columns,children.length-row*columns);
        this.positions.set(child,{...savedPoint(child)||{x:p.x+(col-(count-1)/2)*dx,y:p.y+(row-(rows-1)/2)*dy}});
        this.placeBranch(child,children.length===1?r*0.7:Math.min(r*0.4,Math.min(dx,dy)*0.3),savedPoint,pinned);
      });
    }
    if(savedPoint(id))pinned.add(id);
    if(attrs?.presentation_group&&children.length&&children.every(child=>pinned.has(child))){
      const points=children.map(child=>this.positions.get(child));
      this.positions.set(id,{x:(Math.min(...points.map(p=>p.x))+Math.max(...points.map(p=>p.x)))/2,
        y:(Math.min(...points.map(p=>p.y))+Math.max(...points.map(p=>p.y)))/2});pinned.add(id);
    }
  }

  arrangeSource(id){
    if(!this.nodes.get(id)?.attrs?.source_sections)throw Error('Expected a source-section owner');
    this.placeBranch(id,this.radii.get(id),()=>null,new Set());this.indexPositions();
    return Object.fromEntries(this.graph.nodes.filter(n=>n.id!==id&&this.contains(id,n.id)).map(n=>[n.id,{...this.positions.get(n.id)}]));
  }

  translate(id, dx, dy, descendants = true) {
    const patch = Object.create(null);
    for (const [child, p] of this.positions) {
      if (descendants ? !this.contains(id, child) : child !== id) continue;
      const point = { x: p.x + dx, y: p.y + dy };
      this.positions.set(child, point);
      if(!this.nodes.get(child).attrs?.presentation_group)patch[child] = point;
    }
    this.indexPositions();
    return patch;
  }

  zoomStep(zoom, point, direction) {
    if (direction > 0) {
      const nearby=this.spatial?this.spatial.search(point.x,point.y,point.x,point.y).map(i=>this.spatialIds[i]):[...this.nodes.keys()];
      const candidates = nearby.filter(id => id !== this.root && (this.isGroup(id)||this.definitionTarget(id)) &&
        !this.regions.has(id) && !this.expanded.has(id) && this.representative(id) === id && 2 * this.radii.get(id) * zoom >= 300 &&
        Math.hypot(point.x - this.positions.get(id).x, point.y - this.positions.get(id).y) <= this.radii.get(id));
      candidates.sort((a, b) => Math.hypot(point.x - this.positions.get(a).x, point.y - this.positions.get(a).y) -
        Math.hypot(point.x - this.positions.get(b).x, point.y - this.positions.get(b).y));
      if (candidates.length) {
        const id=candidates[0],target=this.definitionTarget(id);
        this.expanded.add(id);return { action: target?'definition':'expand', id:target||id };
      }
    } else if (direction < 0) {
      const closing = [...this.expanded].filter(id => id !== this.root && !this.regions.has(id) && 2 * this.radii.get(id) * zoom < 190);
      closing.sort((a, b) => this.paths.get(b).length - this.paths.get(a).length);
      if (closing.length) {
        this.expanded.delete(closing[0]); return { action: 'collapse', id: closing[0] };
      }
    }
    return null;
  }
}

if (typeof module !== 'undefined') module.exports = { Universe };
