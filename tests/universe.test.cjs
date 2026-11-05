// SPDX-License-Identifier: AGPL-3.0-or-later
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Universe}=require('../viewer/universe.js');
const fixture=()=>JSON.parse(fs.readFileSync(path.join(__dirname,'../fixtures/generic.graph.json'),'utf8'));

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
