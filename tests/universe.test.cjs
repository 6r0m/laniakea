// SPDX-License-Identifier: AGPL-3.0-or-later
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Universe}=require('../viewer/universe.js');
const fixture=()=>JSON.parse(fs.readFileSync(path.join(__dirname,'../fixtures/generic.graph.json'),'utf8'));

test('viewport cuts evict distant detail, retain crossing references and preserve pins on return',()=>{
  const map=new Universe(difficultGraph());map.place({},'auto');map.reveal('app.core.nested.leaf');map.reveal('app.web.views');
  const before=JSON.stringify([...map.positions]);
  const p=map.positions.get('app.core.nested.leaf'),zoom=20;
  const camera={x1:p.x-10,y1:p.y-10,x2:p.x+10,y2:p.y+10,zoom};
  const view=map.project(new Set(),true,camera);
  assert.ok(view.outside>0,'distant references are counted separately from absent references');
  assert.ok(!view.expanded.has('app.web'),'distant open branches release their detail');
  assert.ok(view.edges.some(e=>e.refs.some(r=>r.id==='nested')),'crossing references remain represented');
  const represented=[...view.edges.flatMap(e=>e.refs),...[...view.internal.values()].flat()];
  assert.equal(represented.length+view.outside+view.hidden,map.graph.edges.length);
  assert.equal(new Set(represented.map(e=>e.id)).size,represented.length);
  assert.equal(JSON.stringify([...map.positions]),before);
  assert.ok(map.expanded.has('app.web'),'requested expansion survives viewport eviction');
  const q=map.positions.get('app.web.views');
  assert.ok(map.project(new Set(),true,{x1:q.x-10,y1:q.y-10,x2:q.x+10,y2:q.y+10,zoom}).expanded.has('app.web'));
});

test('wheel expansion queries nearby constellation bounds instead of scanning every node',()=>{
  const map=new Universe(fixture());map.place({},'auto');
  let scans=0;const keys=map.nodes.keys.bind(map.nodes);map.nodes.keys=()=>{scans++;return keys();};
  const p=map.positions.get('app.core');
  assert.equal(map.zoomStep(10,p,1)?.id,'app.core');
  assert.equal(scans,0);
});

test('a manually moved descendant remains discoverable beyond its original ancestor radius',()=>{
  const map=new Universe(fixture());map.place({},'auto');map.reveal('app.core.db');
  map.translate('app.core.db',10000,10000);
  const p=map.positions.get('app.core.db');
  const view=map.project(new Set(),true,{x1:p.x-10,y1:p.y-10,x2:p.x+10,y2:p.y+10,zoom:50});
  assert.ok(view.nodes.some(n=>n.id==='app.core.db'),'viewport discovery must follow moved pins through ancestor bounds');
  assert.ok(view.expanded.has('app.core'));
  assert.ok(map.bounds.get('app.core').x2>=p.x&&map.bounds.get('app.core').y2>=p.y);
});

test('a forced remote endpoint retains its connection without loading its unrelated neighbours',()=>{
  const map=new Universe(difficultGraph());map.place({},'auto');map.reveal('app.core.db');map.reveal('app.web.views');
  const p=map.positions.get('app.web.views');
  const view=map.project(new Set(),true,{x1:p.x-5,y1:p.y-5,x2:p.x+5,y2:p.y+5,zoom:50,force:['app.core.db']});
  const ids=view.edges.flatMap(e=>e.refs.map(r=>r.id));
  assert.ok(ids.includes('cycle'),'the local-to-remote reference remains visible');
  assert.ok(view.nodes.some(n=>n.id==='app.core.db'));
  assert.ok(!ids.includes('self'),'a remote context star must not recursively expand its own references');
});

test('compact map groups preserve weighted counts without loading canonical call-site metadata',()=>{
  const nodes=fixture().nodes,source=nodes.findIndex(n=>n.id==='app.core.db'),target=nodes.findIndex(n=>n.id==='app.web.views');
  const topology={schema:'laniakea.map/1',nodes,references:[{source,target,type:'calls',count:1000}]};
  const map=new Universe(topology);
  assert.equal(map.paged,true);assert.equal(map.typeCounts.get('calls'),1000);
  assert.deepEqual(map.referenceStats.get('app.core'),{outgoing:1000,incoming:0,within:0});
  assert.deepEqual(map.referenceStats.get('app'),{outgoing:0,incoming:0,within:1000});
  assert.equal(map.project().edges[0].count,1000);
  assert.equal(map.graph.edges.length,1);
  for(const wrong of [{source:999999},{count:0},{count:1.5},{target:-1}]){
    assert.throws(()=>new Universe({...topology,references:[{...topology.references[0],...wrong}]}),/reference group/);
  }
});

test('parallel exact references share one connection without losing call sites or direction',()=>{
  const graph=fixture();
  graph.edges=Array.from({length:200},(_,i)=>({id:`call${i}`,source:'app.core.db',target:'app.core.models',
    type:'calls',status:'resolved',origin:'compiler',attrs:{line:i+1}}));
  graph.edges.push({...graph.edges[0],id:'reverse',source:'app.core.models',target:'app.core.db'});
  const map=new Universe(graph);map.reveal('app.core.db');map.reveal('app.core.models');
  const view=map.project();
  assert.equal(view.edges.length,2,'parallel call sites must not create overlapping renderer lines');
  const forward=view.edges.find(e=>e.source==='app.core.db');
  assert.equal(forward.refs.length,200);
  assert.deepEqual(forward.refs.map(e=>e.id),graph.edges.slice(0,200).map(e=>e.id));
  assert.equal(view.edges.find(e=>e.id==='reverse').status,'resolved');
});

test('hover reference queries reuse an index and keep self and ancestor references exactly once',()=>{
  const graph=difficultGraph();
  let scans=0;
  const source=graph.edges;
  graph.edges=new Proxy(source,{get(target,key,receiver){
    if(key===Symbol.iterator){scans++;return target[Symbol.iterator].bind(target);}
    if(key==='filter'||typeof key==='string'&&/^\d+$/.test(key))scans++;
    return Reflect.get(target,key,receiver);
  }});
  const map=new Universe(graph);scans=0;
  for(const [type,count] of map.typeCounts)assert.equal(count,source.filter(e=>e.type===type).length);
  const expected=source.filter(e=>map.contains('app.core',e.source)||map.contains('app.core',e.target));
  assert.deepEqual(map.references('app.core'),expected);
  map.references('app.core.db');map.references('app.web.views');
  assert.equal(scans,0,'hover must not scan the entire graph');
  const returned=map.references('app.core');returned.length=0;
  assert.equal(map.references('app.core').length,expected.length,'callers cannot mutate the index');
});

function difficultGraph(){
  const graph=fixture();
  graph.nodes.push({id:'app.core.nested',label:'models',level:'package',parent:'app.core',boundary:false,status:'in-target'});
  graph.nodes.push({id:'app.core.nested.leaf',label:'models',level:'module',parent:'app.core.nested',boundary:false,status:'in-target'});
  for(const [id,source,target,type] of [
    ['ancestor','app.core.db','app.core','imports'],
    ['root-ref','app.core.models','app','imports'],
    ['self','app.core.db','app.core.db','imports'],
    ['cycle','app.core.db','app.web.views','imports'],
    ['nested','app.core.nested.leaf','app.web.views','imports'],
    ['other-type','app.web.views','app.core.models','calls'],
  ])graph.edges.push({id,source,target,type,status:'declared',origin:'synthetic'});
  return graph;
}

test('every original reference remains accounted for through all nested expansion states',()=>{
  const graph=difficultGraph(),groups=['app.core','app.core.nested','app.web','stdlib'];
  for(let mask=0;mask<16;mask++){
    const map=new Universe(graph);
    for(let i=0;i<groups.length;i++)if(mask&(1<<i))map.expanded.add(groups[i]);
    const view=map.project();
    const ids=[...view.edges.flatMap(e=>e.refs.map(r=>r.id)),...Array.from(view.internal.values()).flat().map(e=>e.id)];
    assert.deepEqual(ids.sort(),graph.edges.map(e=>e.id).sort(),`expansion mask ${mask}`);
    assert.equal(new Set(ids).size,graph.edges.length);
    assert.ok(view.edges.every(e=>view.nodes.some(n=>n.id===e.source)&&view.nodes.some(n=>n.id===e.target)));
  }
});

test('following an exact reference reveals both endpoints without closing other constellations',()=>{
  const map=new Universe(difficultGraph());
  map.reveal('app.core.nested.leaf');
  map.reveal('app.web.views');
  assert.ok(map.expanded.has('app.core.nested'));
  assert.ok(map.expanded.has('app.web'));
  assert.equal(map.representative('app.core.nested.leaf'),'app.core.nested.leaf');
  assert.equal(map.representative('app.web.views'),'app.web.views');
  assert.ok(map.project().edges.some(e=>e.refs.some(r=>r.id==='nested')));
});

test('collapse and reopen preserve inner expansion state and every exact reference',()=>{
  const map=new Universe(difficultGraph());
  map.reveal('app.core.nested.leaf');
  map.expanded.delete('app.core');
  assert.equal(map.representative('app.core.nested.leaf'),'app.core');
  map.expanded.add('app.core');
  assert.equal(map.representative('app.core.nested.leaf'),'app.core.nested.leaf');
  assert.equal(map.project().edges.flatMap(e=>e.refs).filter(e=>e.id==='nested').length,1);
});

test('filtering applies to original types without losing counts or mutating graph facts',()=>{
  const graph=difficultGraph(),before=JSON.stringify(graph),map=new Universe(graph);
  const view=map.project(new Set(['calls']),false);
  const refs=[...view.edges.flatMap(e=>e.refs),...Array.from(view.internal.values()).flat()];
  assert.ok(refs.every(e=>e.type!=='calls'&&e.target!=='stdlib.sqlite3'));
  assert.equal(view.hidden,2);
  assert.equal(JSON.stringify(graph),before);
});

test('group reference inspection includes exact internal, incoming and outgoing references',()=>{
  const graph=difficultGraph(),map=new Universe(graph);
  const ids=map.references('app.core').map(e=>e.id);
  assert.equal(ids.length,graph.edges.length);
  assert.ok(ids.includes('ancestor')&&ids.includes('self')&&ids.includes('root-ref'));
  const internal=map.project().internal.get('app.core').map(e=>e.id);
  assert.ok(internal.includes('ancestor')&&internal.includes('self'));
});

test('local placement preserves saved world pins and moving a group moves its complete subtree',()=>{
  const map=new Universe(difficultGraph());
  map.place({auto:{'app.core':{x:42,y:-17},'app.core.db':{x:55,y:9}}},'auto');
  assert.deepEqual(map.positions.get('app.core'),{x:42,y:-17});
  assert.deepEqual(map.positions.get('app.core.db'),{x:55,y:9});
  const before={...map.positions.get('app.core.nested.leaf')},other={...map.positions.get('app.web')};
  const patch=map.translate('app.core',10,-20);
  assert.deepEqual(map.positions.get('app.core.nested.leaf'),{x:before.x+10,y:before.y-20});
  assert.deepEqual(map.positions.get('app.web'),other);
  assert.ok(patch['app.core.db']&&patch['app.core.nested.leaf']);
});

test('semantic zoom opens the pointed constellation only and has a separate closing threshold',()=>{
  const map=new Universe(fixture());map.place({},'auto');
  const p=map.positions.get('app.core'),r=map.radii.get('app.core');
  assert.deepEqual(map.zoomStep(300/(2*r),p,1),{action:'expand',id:'app.core'});
  assert.ok(!map.expanded.has('app.web'));
  assert.equal(map.zoomStep(280/(2*r),p,-1),null,'small wheel reversals must not flicker');
  assert.deepEqual(map.zoomStep(140/(2*r),p,-1),{action:'collapse',id:'app.core'});
});

test('known external children can be revealed without claiming further external analysis',()=>{
  const map=new Universe(fixture());map.reveal('stdlib.sqlite3');
  const view=map.project();
  assert.ok(view.nodes.some(n=>n.id==='stdlib.sqlite3'&&n.boundary));
  assert.equal(map.references('stdlib.sqlite3').filter(e=>e.source==='stdlib.sqlite3').length,0);
});

test('invalid parent chains and dangling references fail before a scene is committed',()=>{
  const missing=fixture();missing.edges[0].target='missing';
  assert.throws(()=>new Universe(missing),/endpoint/);
  const cyclic=fixture();cyclic.nodes.find(n=>n.id==='app.core').parent='app.core.models';
  assert.throws(()=>new Universe(cyclic),/cycle/);
});

test('derived connection ids cannot collide with a recorded reference id',()=>{
  const graph=fixture(),bundle=new Universe(graph).project().edges.find(e=>e.status==='derived');
  graph.edges.push({id:bundle.id,source:'app.core',target:'app.web',type:'calls',status:'declared',origin:'synthetic'});
  const edges=new Universe(graph).project().edges;
  assert.equal(new Set(edges.map(e=>e.id)).size,edges.length);
});

test('canonical ids matching object properties still have finite positions and writable pins',()=>{
  const graph=fixture();
  for(const n of graph.nodes){if(n.id==='app.core')n.id='__proto__';if(n.parent==='app.core')n.parent='__proto__';}
  for(const e of graph.edges){if(e.source==='app.core')e.source='__proto__';if(e.target==='app.core')e.target='__proto__';}
  const map=new Universe(graph);map.place({},'auto');
  assert.ok([...map.positions.values()].every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
  assert.ok(Object.hasOwn(map.translate('__proto__',1,2),'__proto__'));
});
