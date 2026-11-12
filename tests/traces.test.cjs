// SPDX-License-Identifier: AGPL-3.0-or-later
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {viewer,inspectionViewer,treeElements}=require('./viewer-support.cjs');
const {ConnectionTrace}=require('../viewer/traces.js');
const {Universe}=require('../viewer/universe.js');

function pointerScene(t){
  const instance=viewer();t.after(()=>instance.run('state.cy.destroy();clearTimeout(state.inspectTimer);'));
  instance.run(`globalThis.css=()=>'#888';globalThis.readableLabels=()=>{};globalThis.layout=()=>{};
    const create=cytoscape;globalThis.cytoscape=options=>create({...options,container:undefined,headless:true});
    realRenderGraph();
    state.shard={nodes:fixture.nodes,edges:[{id:'native',source:'app.core.db',target:'app.web.views'},
      {id:'geometric',source:'app.core.models',target:'app.core.db'}]};
    state.cy.add(fixture.nodes.map(n=>({data:{id:n.id}})));
    state.cy.add(state.shard.edges.map(e=>({data:{...e,referenceId:e.id}})));
    state.cy.getElementById('app.core').addClass('expanded');
    state.labelBoxes=new Map([['app.core',{x1:0,y1:0,x2:80,y2:20}]]);
    globalThis.calls=[];globalThis.folds=[];globalThis.hit={kind:'pair',source:'app.core.models',target:'app.core.db'};
    globalThis.connectionAt=()=>hit;
    globalThis.inspectPair=(source,target)=>calls.push([source,target]);
    globalThis.inspectOverlap=trace=>calls.push(trace.kind);globalThis.toggleGroup=id=>folds.push(id);`);
  return instance;
}

test('edge taps inspect the geometric pair even when the native hit names a different edge',t=>{
  const {run}=pointerScene(t);
  run("state.cy.getElementById('native').emit({type:'tap',renderedPosition:{x:100,y:100}});");
  assert.deepEqual(Array.from(run('calls[0]')),['app.core.models','app.core.db']);
  run("hit=null;state.cy.getElementById('native').emit({type:'tap',renderedPosition:{x:100,y:100}});");
  assert.deepEqual(Array.from(run('calls[1]')),['app.core.db','app.web.views'],'missing geometry retains the native fallback');
});

test('double taps on wires beneath expanded backgrounds keep the group open while labels still fold',t=>{
  const {run}=pointerScene(t);
  run("state.cy.getElementById('app.core').emit({type:'dbltap',renderedPosition:{x:100,y:100}});");
  assert.equal(run('folds.length'),0,'a wire hit must not fold its background constellation');
  assert.deepEqual(Array.from(run('calls[0]')),['app.core.models','app.core.db']);
  run("state.cy.getElementById('app.core').emit({type:'dbltap',renderedPosition:{x:10,y:10}});");
  assert.equal(run('folds.length'),1,'constellation labels retain double-tap folding');
  run("hit=null;state.cy.getElementById('app.core').emit({type:'dbltap',renderedPosition:{x:100,y:100}});");
  assert.equal(run('folds.length'),2,'empty expanded backgrounds retain double-tap folding');
});

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

test('wire viewpoint follows the nearby endpoint and stays steady through midpoint jitter',t=>{
  const {run}=scene(t);
  run(`state.cy.getElementById('app.core.db').position({x:0,y:0});
    state.cy.getElementById('app.web.views').position({x:200,y:0});state.cy.zoom(1);state.cy.pan({x:0,y:0});
    for(const e of state.cy.edges()){
      e.renderedSourceEndpoint=()=>e.source().id()===e.target().id()?{x:1000,y:0}:e.source().renderedPosition();
      e.renderedTargetEndpoint=()=>e.source().id()===e.target().id()?{x:1100,y:0}:e.target().renderedPosition();
      e.controlPoints=()=>undefined;
    }
    globalThis.wire=state.cy.edges().filter(e=>e.source().id()==='app.core.db'&&e.target().id()==='app.web.views')[0];
    preview(wire,{x:180,y:0});`);
  assert.equal(run('state.trace.focus?.id'),'app.web.views');
  assert.equal(run('state.trace.focus.counts.incoming'),7);
  assert.equal(run('state.trace.focus.counts.outgoing'),2);
  assert.equal(run('state.cy.getElementById("app.web.views").hasClass("trace-anchor")'),true);
  run('preview(wire,{x:99,y:0});preview(wire,{x:101,y:0});preview(wire,{x:95,y:0});');
  assert.equal(run('state.trace.focus.id'),'app.web.views');
  run('preview(wire,{x:60,y:0});');
  assert.equal(run('state.trace.focus.id'),'app.core.db');
  assert.equal(run('state.trace.focus.counts.outgoing'),7);
  assert.equal(run('state.trace.focus.counts.incoming'),2);
});

test('overlapping different pairs are traced together without double counting direction families',t=>{
  const {run}=scene(t);
  run(`fixture.nodes.push({id:'second',label:'Second consumer',level:'function',parent:'app',boundary:false,status:'in-target'});
    fixture.edges.push({id:'second-link',source:'second',target:'app.web.views',type:'calls',count:33,status:'resolved',origin:'synthetic'});
    state.universe=new Universe(fixture);state.universe.place({},'auto');
    state.universe.reveal('app.core.db');state.universe.reveal('app.web.views');refreshMap();
    state.cy.zoom(1);state.cy.pan({x:0,y:0});
    state.cy.getElementById('app.core.db').position({x:0,y:0});state.cy.getElementById('second').position({x:0,y:0});
    state.cy.getElementById('app.web.views').position({x:200,y:0});
    for(const e of state.cy.edges()){
      e.renderedSourceEndpoint=()=>({x:e.source().id()===e.target().id()?1000:0,y:0});
      e.renderedTargetEndpoint=()=>({x:e.source().id()===e.target().id()?1100:200,y:0});
      e.controlPoints=()=>undefined;
    }
    const first=state.shard.edges.find(e=>e.source==='app.core.db'&&e.target==='app.web.views');
    preview(state.cy.getElementById(state.universe.renderPrefix+first.id),{x:180,y:0});`);
  assert.equal(run('state.trace.kind'),'overlap');
  assert.equal(run('state.trace.pairs.length'),2);
  assert.equal(run('ConnectionTrace.total(state.trace.refs)'),42);
  assert.match(run('tooltip.text'),/Second consumer/);
  assert.equal(run("state.trace.refs.some(ref=>ref.type==='uses.type')"),true);
  assert.equal(run('state.cy.edges(".focus").length'),4);
  run(`globalThis.before=state.trace.key;
    preview(state.cy.getElementById(state.universe.renderPrefix+state.shard.edges.find(e=>e.id==='second-link').id),{x:181,y:0});`);
  assert.equal(run('state.trace.key'),run('before'),'native edge order must not flip the candidate list');
});

test('external root containers have a presentation label distinct from analysed projects',t=>{
  const {run}=scene(t);
  assert.match(run("nodeDescription(state.universe.nodes.get('stdlib'))"),/^external dependency group/);
  assert.match(run("nodeDescription(state.universe.nodes.get('app'))"),/^project/);
});

test('curve hit testing follows the visible path and keeps a fixed screen tolerance',t=>{
  const {run}=scene(t);
  run(`const first=state.cy.edges().filter(e=>e.source().id()!==e.target().id())[0];
    state.cy.edges().not(first).style('display','none');first.removeClass('derived');first.style('curve-style','bezier');
    state.cy.zoom(1);state.cy.pan({x:0,y:0});
    first.renderedSourceEndpoint=()=>({x:0,y:0});first.renderedTargetEndpoint=()=>({x:200,y:0});
    first.controlPoints=()=>[{x:100,y:200}];`);
  assert.equal(run('connectionAt({x:100,y:100}).kind'),'pair');
  assert.equal(run('connectionAt({x:100,y:104}).kind'),'pair');
  assert.equal(run('connectionAt({x:100,y:109})'),null);
  assert.equal(run('connectionAt({x:100,y:0})'),null,'the chord is not the visible curve');
});

test('straight summary hits reuse rendered endpoint positions without querying native curve geometry',t=>{
  const {run}=scene(t);
  run(`state.cy.edges('.loop').style('display','none');
    state.cy.zoom(1);state.cy.pan({x:0,y:0});
    state.cy.getElementById('app.core.db').position({x:0,y:0});
    state.cy.getElementById('app.web.views').position({x:200,y:0});
    for(const edge of state.cy.edges('.derived').not('.loop')){
      edge.renderedSourceEndpoint=edge.renderedTargetEndpoint=edge.controlPoints=()=>{throw Error('redundant native geometry query');};
    }
    globalThis.hit=connectionAt({x:100,y:0});`);
  assert.equal(run('hit.kind'),'pair');
  assert.equal(run('ConnectionTrace.total(hit.refs)'),9);
});

test('overlap lookup does not serialize keys for unrelated projected wires',()=>{
  let keys=0;
  const trace={...ConnectionTrace,key(...args){keys++;return ConnectionTrace.key(...args);}};
  const edges=[{id:'a-b',source:'a',target:'b',type:'calls'},{id:'c-d',source:'c',target:'d',type:'calls'},
    ...Array.from({length:5000},(_,i)=>({id:'unrelated-'+i,source:'other-'+i,target:'elsewhere',type:'calls'}))];
  const result=trace.overlap({edges},edges.slice(0,2));
  assert.equal(result.pairs.length,2);
  assert.equal(result.refs.length,2);
  assert.ok(keys<=8,'endpoint keys should be constructed for candidates, not every visible wire');
});

test('overlap inspection preserves its candidates and closes when represented references change',t=>{
  const {run}=scene(t);treeElements(run);
  run(`state.universe.reveal('recur');refreshMap();
    globalThis.overlap=ConnectionTrace.overlap(state.shard,[
    {source:'app.core.db',target:'app.web.views'},{source:'recur',target:'recur'}]);
    inspectOverlap(overlap);`);
  assert.equal(run('state.selection.overlapInspection'),true);
  assert.equal(run('state.selection.pairs.length'),2);
  run('refreshMap();');
  assert.equal(run('state.selection.overlapInspection'),true);
  run("state.hidden.add('uses.type');refreshMap();");
  assert.equal(run('state.selection'),null);
});

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
  assert.match(run('tooltip.text'),/Incoming: 2.*Outgoing: 7/);
  assert.equal(run("state.trace.refs.some(ref=>ref.type==='calls')&&state.trace.refs.some(ref=>ref.type==='uses.type')"),true);
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
  run(`state.cy.nodes().positions(()=>({x:200,y:0}));
    state.cy.getElementById('app.core.db').position({x:100,y:0});
    for(const e of state.cy.edges()){
      e.renderedSourceEndpoint=()=>({x:0,y:0});e.renderedTargetEndpoint=()=>({x:200,y:0});e.controlPoints=()=>undefined;
    }
    preview(state.cy.edges()[0],{x:100,y:0});globalThis.hitCache=state.connectionHits;
    globalThis.firstTrace=state.trace;preview(state.cy.edges()[1],{x:101,y:0});`);
  assert.equal(run('state.trace.pairs.length'),250);
  assert.equal(run('ConnectionTrace.total(state.trace.refs)'),250);
  assert.equal(run('traceSummary(state.trace).columns.flatMap(column=>column.rows).length'),3,
    'dense hover limits peer captions, not candidate accounting');
  assert.equal(run('state.trace===firstTrace&&state.connectionHits===hitCache'),true);
  assert.equal(run('state.cy.elements().length'),run('count'));
  treeElements(run);run('inspectOverlap(state.trace);');
  assert.equal(run("$('details').children.find(n=>n.tag==='ul').children.length"),50);
  run("$('details').children.find(n=>n.tag==='button'&&n.textContent==='More connections').onclick();");
  assert.equal(run("$('details').children.find(n=>n.tag==='ul').children.length"),100);
  run('unfocus(true);beginViewportGesture();');
  assert.equal(run('state.trace'),null);
  assert.equal(run('state.cy.edges(".focus,.hovered,.trace-outgoing").length'),0);
  assert.equal(run('state.cy.elements().length'),run('count'));
});

test('relative directions exclude unrelated pairs and keep recursion separate',()=>{
  const edge=(id,source,target,count)=>({id,source,target,count,type:'calls'});
  const view={edges:[edge('first','first','sdk',33),edge('second','second','sdk',62),
    edge('self','sdk','sdk',1),edge('other','outside','elsewhere',7)]};
  const raw=ConnectionTrace.overlap(view,view.edges);
  const sdk=ConnectionTrace.relative(raw,'sdk');
  assert.deepEqual(sdk.focus.counts,{incoming:95,outgoing:0,within:1});
  assert.equal(sdk.focus.others,1);
  assert.equal(sdk.roles.get('other'),'other');
  assert.equal(sdk.roles.get('first'),'incoming');
  const consumer=ConnectionTrace.relative(raw,'first');
  assert.deepEqual(consumer.focus.counts,{incoming:0,outgoing:33,within:0});
  assert.equal(consumer.focus.others,3);
  assert.equal(consumer.roles.get('first'),'outgoing');
  assert.equal(ConnectionTrace.total(consumer.refs),103,'the focused card must not discard other candidates');
});

test('compact columns disclose truncated directions even if each peer appears somewhere',t=>{
  const {run}=scene(t);
  run(`const sampleEdge=(id,source,target)=>({id,source,target,type:'calls'});
    const edges=[sampleEdge('d-in','D','app'),sampleEdge('e-in','E','app'),sampleEdge('f-in','F','app'),
      sampleEdge('a-out','app','A'),sampleEdge('b-out','app','B'),sampleEdge('c-out','app','C'),sampleEdge('d-out','app','D')];
    globalThis.summary=traceSummary(ConnectionTrace.relative(ConnectionTrace.overlap({edges},edges),'app'));`);
  assert.equal(run('summary.columns.every(column=>column.rows.length===3)'),true);
  assert.equal(run("summary.notes.includes('More in Details.')"),true);
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
