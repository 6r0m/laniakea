// SPDX-License-Identifier: AGPL-3.0-or-later
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {inspectionViewer,treeElements}=require('./viewer-support.cjs');
const {ConnectionTrace}=require('../viewer/traces.js');
const {Universe}=require('../viewer/universe.js');

function scene(t){
  const instance=inspectionViewer(true);
  t.after(()=>instance.run('state.cy.destroy()'));
  instance.run(`
    fixture.nodes.push({id:'recur',label:'SampleRecur',level:'function',parent:'app.core.db',boundary:false,status:'in-target'});
    const a='app.core.db',b='app.web.views';
    const edge=(id,source,target,type='calls',extra={})=>({id,source,target,type,status:'resolved',origin:'synthetic',...extra});
    fixture.edges=[...Array.from({length:3},(_,i)=>edge('call'+i,a,b)),
      ...Array.from({length:4},(_,i)=>edge('type'+i,a,b,'uses.type')),
      ...Array.from({length:2},(_,i)=>edge('back'+i,b,a)),
      edge('owner',a,a,'uses.type',{internal_to_owner:true}),edge('recursive','recur','recur')];
    state.universe=new Universe(fixture);state.universe.place({},'auto');
    state.universe.reveal(a);state.universe.reveal(b);
    state.manifest={edge_types:[{id:'calls',label:'calls'},{id:'uses.type',label:'type refs'}],sources:[]};
    globalThis.showTooltip=(title,text)=>{globalThis.tooltip={title,text};};
    state.cy.renderer().getEdgeMidpoint=()=>({x:0,y:0});refreshMap();
  `);
  return instance;
}

test('node tracing reports outgoing, incoming and within without double counting',t=>{
  const {run}=scene(t);
  run("preview(state.cy.getElementById('app.core.db'))");
  assert.match(run('tooltip.text'),/Outgoing: 7.*Incoming: 2.*Within: 2/);
  run('state.cy.destroy()');
});

test('opposite directions and mixed families share one stable pair readout',t=>{
  const {run}=scene(t);
  run(`const first=state.shard.edges.find(e=>e.source==='app.core.db'&&e.target==='app.web.views');
    const reverse=state.shard.edges.find(e=>e.source==='app.web.views'&&e.target==='app.core.db');
    preview(state.cy.getElementById(state.universe.renderPrefix+first.id));
    globalThis.forwardTip={...tooltip};unfocus();
    preview(state.cy.getElementById(state.universe.renderPrefix+reverse.id));`);
  assert.equal(run('tooltip.title'),run('forwardTip.title'),'the focus endpoint must not flip');
  assert.equal(run('tooltip.text'),run('forwardTip.text'));
  assert.match(run('tooltip.text'),/A -> B: 7.*B -> A: 2/);
  assert.match(run('tooltip.text'),/calls/);
  assert.match(run('tooltip.text'),/type refs/);
  run('state.cy.destroy()');
});

test('node hover leaves renderer element count and world positions unchanged',t=>{
  const {run}=scene(t);
  run(`globalThis.edgeCount=state.cy.edges().length;globalThis.pins=JSON.stringify([...state.universe.positions]);
    preview(state.cy.getElementById('app.core.db'));`);
  assert.equal(run('state.cy.edges().length'),run('edgeCount'));
  assert.equal(run('JSON.stringify([...state.universe.positions])'),run('pins'));
  run('state.cy.destroy()');
});

test('map titles contain only names while coverage remains available in inspection',t=>{
  const {run}=scene(t);
  run(`fixture.nodes.find(n=>n.id==='app.core.db').status='not-in-target';refreshMap();`);
  assert.equal(run("state.cy.getElementById('app.core.db').data('caption')"),'db');
  assert.equal(run("state.cy.getElementById('app.core').data('caption')"),'core');
  assert.match(run("nodeDescription(state.universe.nodes.get('app.core.db'))"),/outside target/);
});

test('node readout distinguishes no recorded users from references hidden by filters',t=>{
  const {run}=scene(t);
  run(`state.hidden.add('calls');refreshMap();preview(state.cy.getElementById('app.core.db'));`);
  assert.match(run('tooltip.text'),/Incoming references recorded: 2/);
  assert.match(run('tooltip.text'),/Incoming: 0/);
  assert.doesNotMatch(run('tooltip.text'),/No incoming references recorded/);
  run(`fixture.edges=fixture.edges.filter(e=>e.source==='app.core.db'&&e.target==='app.web.views');
    state.universe=new Universe(fixture);state.universe.place({},'auto');state.universe.reveal('app.core.db');
    refreshMap();preview(state.cy.getElementById('app.core.db'));`);
  assert.match(run('tooltip.text'),/No incoming references recorded/);
  assert.match(run('tooltip.text'),/Outgoing references recorded: 7/);
});

test('pair cards disambiguate equal endpoint names with their ownership paths',t=>{
  const {run}=scene(t);
  run(`state.universe.nodes.get('app.web.views').label='db';
    globalThis.summary=traceSummary(ConnectionTrace.pair(state.shard,'app.core.db','app.web.views'));`);
  assert.match(run('summary.rows[0][0]'),/core.*db.*web.*db/);
  assert.match(run('summary.rows[1][0]'),/web.*db.*core.*db/);
});

test('pair inspection shows both directions and invalidates changed represented groups',t=>{
  const {run}=scene(t);treeElements(run);
  run(`globalThis.rows=[];globalThis.appendReferences=(panel,refs)=>rows.push(refs.map(r=>r.id));
    inspectPair('app.web.views','app.core.db');`);
  assert.equal(run('state.selection.pairInspection'),true);
  assert.deepEqual(Array.from(run('rows.map(group=>group.length)')),[7,2]);
  assert.equal(run('state.cy.edges(":selected").length'),3);
  run('refreshMap();');
  assert.equal(run('state.selection.pairInspection'),true,'unchanged groups retain inspection');
  run(`state.hidden.add('uses.type');refreshMap();`);
  assert.equal(run('state.selection'),null,'a changed pair must not inspect an arbitrary remaining edge');
});

test('compact trace weights and page queries retain every represented group in each direction',t=>{
  const {run}=scene(t);treeElements(run);
  run(`const nodes=fixture.nodes,at=id=>nodes.findIndex(n=>n.id===id);
    state.universe=new Universe({schema:'laniakea.map/1',nodes,references:[
      {source:at('app.core.db'),target:at('app.web.views'),type:'calls',count:71},
      {source:at('app.core.db'),target:at('app.web.views'),type:'uses.type',count:13},
      {source:at('app.web.views'),target:at('app.core.db'),type:'calls',count:6},
      {source:at('app.core.db'),target:at('app.core.db'),type:'uses.type',count:11,internal_to_owner:true}]});
    state.universe.place({},'auto');state.universe.reveal('app.core.db');state.universe.reveal('app.web.views');refreshMap();
    globalThis.queries=[];globalThis.appendReferencePage=(panel,query,total)=>queries.push({query,total});
    inspectPair('app.core.db','app.web.views');`);
  assert.deepEqual(Array.from(run('queries.map(q=>q.total)')),[84,6]);
  assert.deepEqual(Array.from(run('queries.map(q=>q.query.groups.length)')),[2,1]);
  assert.equal(run("ConnectionTrace.node(state.universe,state.shard,'app.core.db').counts.within"),11);
  run("state.hidden.add('uses.type');refreshMap();preview(state.cy.getElementById('app.core.db'));");
  assert.match(run('tooltip.text'),/Outgoing: 71.*Incoming: 6.*Within: 0/);
  run('globalThis.viewportCamera=()=>({x1:1e7,y1:1e7,x2:1e7+1,y2:1e7+1,zoom:1});refreshMap();');
  assert.equal(run("ConnectionTrace.node(state.universe,state.shard,'app.core.db')"),null);
});

test('high-degree trace derives from shown facts only and allocates no renderer decorations',t=>{
  const {run}=scene(t);
  run(`fixture.nodes.push(...Array.from({length:250},(_,i)=>({id:'neighbor'+i,label:'Neighbor '+i,
    level:'module',parent:'app',boundary:false,status:'in-target'})));
    fixture.edges=Array.from({length:250},(_,i)=>({id:'link'+i,source:'app.core.db',target:'neighbor'+i,
      type:'calls',status:'resolved',origin:'synthetic'}));
    state.universe=new Universe(fixture);state.universe.place({},'auto');state.universe.reveal('app.core.db');refreshMap();
    globalThis.count=state.cy.elements().length;
    Object.defineProperty(state.universe.graph,'edges',{get(){throw new Error('canonical scan during hover');}});
    preview(state.cy.getElementById('app.core.db'));`);
  assert.match(run('tooltip.text'),/Outgoing: 250.*Incoming: 0.*Within: 0/);
  assert.equal(run('state.cy.elements().length'),run('count'));
  run('unfocus(true);beginViewportGesture();');
  assert.equal(run('state.trace'),null);
  assert.equal(run('state.cy.edges(".focus,.hovered,.trace-outgoing").length'),0);
  assert.equal(run('state.cy.elements().length'),run('count'));
});

test('trace classification respects excluded configuration and external references',()=>{
  const nodes=[['root',null],['focus','root'],['child','focus'],['external',null]].map(([id,parent])=>
    ({id,parent,label:id,level:'project',boundary:id==='external',status:'in-target'}));
  const map=new Universe({schema:'laniakea.map/1',nodes,references:[
    {source:1,target:3,type:'calls',count:9},{source:0,target:1,type:'config',count:7},
    {source:1,target:2,type:'calls',count:5}]},
    {overview:{anchor:'external',configuration_types:['config']},edge_types:[{id:'config'},{id:'calls'}]});
  const trace=boundary=>ConnectionTrace.node(map,map.project(new Set(),boundary),'focus').counts;
  assert.deepEqual(trace(true),{outgoing:9,incoming:0,within:5});
  assert.deepEqual(trace(false),{outgoing:0,incoming:0,within:5});
  assert.equal(map.referenceStats.get('focus').incoming,7,'all-recorded declarations stay available outside the architecture trace');
});
