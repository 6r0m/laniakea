// SPDX-License-Identifier: AGPL-3.0-or-later
// Run with node --test tests/viewer.test.cjs; no npm packages required.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {viewer,inspectionViewer,treeElements}=require('./viewer-support.cjs');

test('header search distinguishes recorded file paths without losing equal-basename choices',()=>{
  const {run}=viewer();
  run(`globalThis.files=['One','Two'].map(name=>({id:name,label:'API.h',level:'source-group',attrs:{source_file:true},
    source:{root:'project',path:'Source/Sample/Public/'+name+'/API.h'}}));`);
  assert.equal(run("DeclarationContext.search('API.h',files).count"),2);
  assert.equal(run("DeclarationContext.search('One/API.h',files).items[0].id"),'One');
});

test('a file under the wheel pointer enters its next layer without a large world-radius threshold',()=>{
  const {run,context}=inspectionViewer(true);
  context.surface=JSON.parse(require('node:fs').readFileSync(require.resolve('../fixtures/source-surface.graph.json'),'utf8'));
  try{
    run(`state.universe=new Universe(surface);state.universe.place({},'auto');
      globalThis.file=[...state.universe.nodes.values()].find(n=>n.attrs?.source_file&&n.label==='API.h').id;
      state.universe.reveal(file);refreshMap();
      const p=state.cy.getElementById(file).renderedPosition();state.pointer={x:p.x+3,y:p.y+3};
      globalThis.requestAnimationFrame=fn=>{fn();return 1;};globalThis.cancelAnimationFrame=()=>{};
      globalThis.setSceneScope=id=>state.scopeShard.scope=id;globalThis.frameNode=id=>globalThis.framed=id;
      globalThis.rememberView=()=>{};globalThis.unfocus=()=>{};semanticZoom(1);`);
    assert.equal(run('state.universe.expanded.has(file)'),true);
    assert.equal(run('state.scopeShard.scope'),run('file'));assert.equal(run('framed'),run('file'));
    run(`{const p=state.cy.getElementById('class').renderedPosition();state.pointer={x:p.x+3,y:p.y+3};semanticZoom(1);}`);
    assert.equal(run("state.universe.expanded.has('class')"),true);
    assert.equal(run('state.scopeShard.scope'),'class');
  }finally{run('state.cy.destroy()');}
});

test('the active expanded navigation scope survives a fit around spread-out saved children',()=>{
  const {run,context}=viewer();
  context.surface=JSON.parse(require('node:fs').readFileSync(require.resolve('../fixtures/source-surface.graph.json'),'utf8'));
  run(`state.universe=new Universe(surface);state.universe.place({},'auto');
    globalThis.file=[...state.universe.nodes.values()].find(n=>n.attrs?.source_file&&n.label==='API.h').id;
    state.universe.reveal('class');state.universe.expanded.add(file);state.universe.translate('class',1000,500);
    state.scopeShard={scope:file};state.cy=cytoscape({headless:true,elements:[]});`);
  try{
    assert.ok(run('viewportCamera(0).force.includes(file)'));
    run('state.universe.expanded.delete(file)');
    assert.ok(!run('viewportCamera(0).force.includes(file)'),'closed scopes must still release their details');
  }finally{run('state.cy.destroy()');}
});

test('qualified search resolves recorded owners and signatures without guessing from labels',()=>{
  const {run}=viewer();
  run(`globalThis.index={nodes:[
    {id:'a',label:'Run',level:'function',attrs:{qualified:'Sample::First::Run',signature:'Run(int)'}},
    {id:'b',label:'Run',level:'function',attrs:{qualified:'Sample::Second::Run',signature:'Run(float)'}}]};
    state.manifest.levels=['module','class','function'];`);
  assert.equal(run("elsewhere('sample::second::run',index)?.id"),'b');
  assert.equal(run("elsewhere('Run(float)',index)?.id"),'b');
  assert.equal(run("elsewhere('not present',index)"),null);
});

test('ambiguous search offers bounded owner-qualified choices rather than one silent global winner',async t=>{
  const {run}=inspectionViewer();treeElements(run);t.after(()=>run('state.cy.destroy()'));
  run(`state.manifest.levels=['project','folder','module','class','function'];
    state.universe.nodes.get('app.core.db').label='Run';state.universe.nodes.get('app.core.db').attrs={qualified:'Sample::First::Run',signature:'Run(int)'};
    state.universe.nodes.get('app.web.views').label='Run';state.universe.nodes.get('app.web.views').attrs={qualified:'Sample::Second::Run',signature:'Run(float)'};
    $('find').value='Run';`);
  await run('find()');
  assert.equal(run("$('find-results').hidden"),false);
  assert.equal(run("$('find-results').children.filter(n=>n.tag==='button').length"),2);
  assert.match(run("$('find-results').children.map(n=>n.textContent).join(' ')"),/First.*Second/);
});

test('search choices retain the matched name when qualified metadata is absent',async t=>{
  const {run}=inspectionViewer();treeElements(run);t.after(()=>run('state.cy.destroy()'));
  run(`state.universe.nodes.get('app.core.db').label='SampleLegacy';$('find').value='SampleLegacy';`);
  await run('find()');
  assert.match(run("$('find-results').children.find(n=>n.tag==='button').textContent"),/SampleLegacy/);
});

test('equal qualified names and source basenames remain distinguishable in search',async t=>{
  const {run}=inspectionViewer();treeElements(run);t.after(()=>run('state.cy.destroy()'));
  run(`for(const [id,path] of [['app.core.db','one/Unit.cpp'],['app.web.views','two/Unit.cpp']]){
    const node=state.universe.nodes.get(id);node.label='Run';node.attrs={qualified:'Sample::Run',signature:'Run()'};
    node.source={root:'project',path,line:1};
  }$('find').value='Sample::Run';`);
  await run('find()');
  assert.match(run("$('find-results').children.map(n=>n.children.map(c=>c.textContent).join(' ')).join(' ')"),/one\/Unit.cpp.*two\/Unit.cpp/);
});

test('recorded signatures and nearest owner context appear in hover and primary inspection without fetching',t=>{
  const {run,context}=inspectionViewer();treeElements(run);t.after(()=>run('state.cy.destroy()'));
  context.fetch=()=>{throw new Error('hover must not fetch exact pages');};
  run(`const node=state.universe.nodes.get('app.core.db');node.attrs={signature:'Run(int value)',qualified:'Sample::Owner::Run'};
    state.universe.reveal(node.id);refreshMap();globalThis.summary=traceSummary(ConnectionTrace.node(state.universe,state.shard,node.id));
    globalThis.renderConnections=()=>{};renderDetails(node);`);
  assert.equal(run('summary.signature'),'Run(int value)');
  assert.match(run('summary.path'),/Sample::Owner::Run/);
  assert.equal(run("$('details').children.some(n=>n.tag==='code'&&n.textContent==='Run(int value)')"),true);
});

test('inheritance readout counts filtered projected references without inventing base names',t=>{
  const {run}=inspectionViewer();t.after(()=>run('state.cy.destroy()'));
  run(`fixture.edges=[{id:'base',source:'app.core.db',target:'stdlib.sqlite3',type:'inherits',count:2,status:'resolved',origin:'compiler'},
    {id:'override',source:'app.web.views',target:'app.core.db',type:'overrides',count:3,status:'resolved',origin:'compiler'}];
    state.universe=new Universe(fixture);state.universe.place({},'auto');refreshMap();
    globalThis.summary=traceSummary(ConnectionTrace.node(state.universe,state.shard,'app.core'));`);
  assert.match(run('summary.structure'),/2.*outgoing.*inheritance.*3.*incoming.*override/i);
  run("state.hidden.add('inherits');refreshMap();summary=traceSummary(ConnectionTrace.node(state.universe,state.shard,'app.core'));");
  assert.doesNotMatch(run('summary.structure'),/inheritance/i);
});

test('deep breadcrumbs fold older ancestors while retaining real links and the immediate parent',t=>{
  const {run}=inspectionViewer();treeElements(run);t.after(()=>run('state.cy.destroy()'));
  run(`state.target.id='sample';state.shard.parents=Array.from({length:8},(_,i)=>({title:'Owner'+i,file:'owner'+i+'.json'}));
    state.index.nodes=state.shard.parents.map((p,i)=>({id:'owner'+i,label:p.title,level:'scope',file:p.file}));
    state.shard.title='Current';realRenderCrumbs();
    globalThis.walk=n=>[n,...(n.children||[]).flatMap(walk)];`);
  assert.equal(run("$('crumbs').children.filter(n=>n.tag==='details').length"),1);
  assert.equal(run("walk($('crumbs')).filter(n=>n.tag==='a').length"),8);
  assert.equal(run("$('crumbs').children.some(n=>n.tag==='a'&&n.attrs.title==='Open Owner7')"),true);
  assert.equal(run("$('crumbs').children.find(n=>n.tag==='strong').attrs['aria-current']"),'page');
});

test('framing a wide recorded scope reserves readable cell spacing rather than a tiny grid',()=>{
  const {run}=viewer();
  run(`state.universe.place({},'auto');
    const children=state.universe.childIds.bind(state.universe);
    state.universe.childIds=id=>id==='app.core'?Array.from({length:81},(_,i)=>'child'+i):children(id);
    globalThis.frame=(bounds,padding,maxZoom)=>globalThis.camera={bounds,padding,maxZoom};frameNode('app.core');`);
  assert.ok(run('camera.maxZoom*state.universe.radii.get("app.core")')>=350,'wide scopes need room for names');
  assert.ok(run('(700-2*camera.padding)/9')>=60,'desktop framing must leave a glyph-and-caption gap between rows');
});

test('a compact public surface reserves room for complete declaration names',()=>{
  const {run}=viewer();
  run(`state.universe.nodes.get('app.core').attrs={source_sections:true};state.universe.place({},'auto');
    globalThis.frame=(bounds,padding,maxZoom)=>globalThis.camera={maxZoom};frameNode('app.core');`);
  assert.ok(run('camera.maxZoom*state.universe.radii.get("app.core")')>=300,'public names still collide in a tiny frame');
});

test('compiler declaration context exposes kind access qualifiers and honest data-only coverage',t=>{
  const {run}=inspectionViewer();treeElements(run);t.after(()=>run('state.cy.destroy()'));
  run(`const node=state.universe.nodes.get('app.core.db');node.level='function';node.attrs={signature:'Read()',type_signature:'int Read() const',
    declaration_kind:'method',access:'private',const:true,virtual:true,declaration_origin:'unknown'};
    state.universe.reveal(node.id);refreshMap();globalThis.renderConnections=()=>{};
    globalThis.summary=traceSummary(ConnectionTrace.node(state.universe,state.shard,node.id));renderDetails(node);`);
  assert.match(run('summary.description'),/^method/);
  assert.match(run('summary.context.join(" ")'),/private.*virtual.*const/i);
  assert.match(run('summary.context.join(" ")'),/origin.*unknown/i);
  run(`node.attrs={declaration_kind:'struct',member_counts:{fields:{public:9},callables:{}},declaration_origin:'macro expansion'};
    summary=traceSummary(ConnectionTrace.node(state.universe,state.shard,node.id));`);
  assert.match(run('summary.context.join(" ")'),/9 observed fields/);
  assert.match(run('summary.context.join(" ")'),/fields.*not.*stars/i);
  run('delete node.attrs.member_counts;summary=traceSummary(ConnectionTrace.node(state.universe,state.shard,node.id));');
  assert.doesNotMatch(run('summary.context.join(" ")'),/0 observed fields/);
  run('node.attrs.definition=false;summary=traceSummary(ConnectionTrace.node(state.universe,state.shard,node.id));');
  assert.match(run('summary.context.join(" ")'),/declaration only.*definition.*not recorded/i);
});

test('canonical exact inspection retains both remote endpoints after pending navigation clears',t=>{
  const {run}=viewer();t.after(()=>run('state.cy.destroy()'));
  run(`state.cy=cytoscape({headless:true});state.universe.place({},'auto');
    const exact=state.universe.graph.edges[0];state.selection={...exact,refs:[exact]};
    state.pendingReference=null;globalThis.camera=viewportCamera();`);
  assert.deepEqual(Array.from(run('camera.force')).sort(),Array.from(run('[state.selection.source,state.selection.target]')).sort());
});

test('external hover explains recorded provider ownership and the shown reference types',t=>{
  const {run}=inspectionViewer();treeElements(run);t.after(()=>run('state.cy.destroy()'));
  run(`state.universe.nodes.get('stdlib').attrs={ownership:'UBT selected SDK root',analysis:'Referenced declarations only'};
    globalThis.summary=traceSummary(ConnectionTrace.node(state.universe,state.shard,'stdlib'));`);
  assert.match(run('summary.notes.join(" ")'),/UBT selected SDK root/);
  assert.match(run('summary.notes.join(" ")'),/Referenced declarations only/);
  assert.match(run('summary.notes.join(" ")'),/Shown types:/);
});

test('exact external rows link the declaring header and explain missing or unregistered provenance',t=>{
  const {run}=inspectionViewer();treeElements(run);t.after(()=>run('state.cy.destroy()'));
  run(`state.target.roots={'sample-sdk':'C:/SampleSDK'};
    globalThis.edge={id:'exact',source:'app.core.db',target:'stdlib.sqlite3',type:'calls',status:'resolved',origin:'compiler',
      attrs:{symbol:'SampleApi()',target_declaration:{id:'sample-decl',location:{root:'sample-sdk',path:'include/Api.h',line:7}}}};
    globalThis.walk=n=>[n,...(n.children||[]).flatMap(walk)];
    globalThis.row=referenceRow(edge);`);
  assert.equal(run("walk(row).filter(n=>n.tag==='a'&&n.attrs.href==='vscode://file/C:/SampleSDK/include/Api.h:7').length"),1);
  assert.equal(run("walk(row).some(n=>n.textContent==='Target declaration: SampleApi()')"),true);
  run(`state.target.roots={};row=referenceRow(edge);`);
  assert.equal(run("walk(row).some(n=>String(n.textContent).includes('source root is unavailable'))"),true);
  run(`delete edge.attrs.target_declaration;row=referenceRow(edge);`);
  assert.equal(run("walk(row).some(n=>String(n.textContent).includes('not recorded in this snapshot'))"),true);
});

test('project inspection is explicit and survives refresh without reopening after clear',t=>{
  const {run}=inspectionViewer();treeElements(run);t.after(()=>run('state.cy.destroy()'));
  run(`state.universe.paged=true;globalThis.queries=[];
    globalThis.appendReferencePage=(panel,query,total)=>queries.push({query,total});
    const root=state.universe.nodes.get(state.universe.root);
    renderDetails({...root,projectContext:true});`);
  assert.equal(run('state.selection?.projectContext'),true,'project context must not require a rendered root marker');
  assert.equal(run("$('details').hidden"),false);
  run('refreshMap()');assert.equal(run('state.selection?.projectContext'),true);
  run("selectNode('app.core')");assert.equal(run('state.selection.id'),'app.core');
  run("onKey({key:'Escape',target:{closest:()=>null}});refreshMap()");
  assert.equal(run('state.selection'),null);assert.equal(run("$('details').hidden"),true);
});

test('configuration toggles only native marks and never wires, positions or all-recorded totals',t=>{
  const {run}=inspectionViewer(true);treeElements(run);t.after(()=>run('state.cy.destroy()'));
  run(`fixture.edges=[{id:'configured',source:'app',target:'app.core.db',type:'imports',status:'declared',origin:'synthetic'},
      {id:'usage',source:'app.web.views',target:'app.core.db',type:'imports',status:'declared',origin:'synthetic'}];
    state.universe=new Universe(fixture,{overview:{anchor:'stdlib',configuration_types:['imports']},edge_types:[{id:'imports'}]});
    state.universe.place({},'auto');state.configuration={};$('layout').value='auto';refreshMap();
    globalThis.before=JSON.stringify([...state.universe.positions]);
    globalThis.edges=state.cy.edges().map(e=>e.id()).join();`);
  assert.equal(run('configurationVisible()'),false,'all layout modes start with marks off');
  run('setConfiguration(true);refreshMap()');
  assert.equal(run('state.cy.getElementById("app").length'),0);
  assert.equal(run('state.cy.getElementById("app.core").hasClass("configured")'),true);
  assert.equal(run('state.cy.edges().map(e=>e.id()).join()'),run('edges'));
  assert.equal(run('JSON.stringify([...state.universe.positions])'),run('before'));
  const summary=run("traceSummary(ConnectionTrace.node(state.universe,state.shard,'app.core'))");
  assert.match(summary.rows.find(row=>row[2]==='incoming')[0],/Incoming references recorded/);
  assert.equal(summary.rows.find(row=>row[2]==='incoming')[1],2);
  assert.equal(summary.rows.find(row=>row[2]==='incoming')[3],1);
  assert.match(summary.notes.join(' '),/explicitly listed.*not necessarily compiled/i);
});

test('following configuration retains exact provenance without enabling wires or changing dependency filters',t=>{
  const {run}=inspectionViewer();treeElements(run);t.after(()=>run('state.cy.destroy()'));
  run(`fixture.edges=[{id:'configured',source:'app',target:'app.core.db',type:'imports',status:'declared',origin:'synthetic',attrs:{line:42}}];
    state.universe=new Universe(fixture,{overview:{anchor:'stdlib',configuration_types:['imports']},edge_types:[{id:'imports'}]});
    state.universe.place({},'auto');state.indexLookup=new Map(fixture.nodes.map(n=>[n.id,{id:n.id,file:n.id+'.json'}]));
    state.hidden.add('imports');globalThis.frameNode=()=>{};globalThis.appendReferences=()=>{};
    followReference(state.universe.graph.edges[0]);`);
  assert.equal(run('state.hidden.has("imports")'),true);
  assert.equal(run('state.cy.edges().length'),0);
  assert.equal(run('state.selection?.configurationInspection'),true);
  assert.equal(run('state.selection?.attrs.line'),42);
  run('refreshMap()');assert.equal(run('state.selection?.configurationInspection'),true);
  run('renderDetails(null);refreshMap()');assert.equal(run('state.selection'),null);
});

test('a late project declaration page cannot reopen closed inspection or replace a new star',async t=>{
  const {run}=inspectionViewer();treeElements(run);t.after(()=>run('state.cy.destroy()'));
  run(`const nodes=fixture.nodes,at=id=>nodes.findIndex(n=>n.id===id);
    state.universe=new Universe({schema:'laniakea.map/1',nodes,references:[
      {source:at('app'),target:at('app.core.db'),type:'imports',count:1}]},
      {overview:{anchor:'stdlib',configuration_types:['imports']},edge_types:[{id:'imports'}]});
    state.universe.place({},'auto');refreshMap();
    globalThis.requests=[];globalThis.cancelled=0;
    state.referencePages={cancel(){cancelled++;},load:()=>new Promise(resolve=>requests.push(resolve))};
    renderDetails({...state.universe.nodes.get('app'),projectContext:true});
    globalThis.oldEpoch=state.referenceEpoch;
    renderDetails(null);refreshMap();
    requests[0]({total:1,items:[],next_cursor:null});`);
  await new Promise(setImmediate);
  assert.equal(run('state.selection'),null);assert.equal(run("$('details').hidden"),true);
  assert.ok(run('state.referenceEpoch>oldEpoch&&cancelled>=2'));
  run(`renderDetails({...state.universe.nodes.get('app'),projectContext:true});
    selectNode('app.core');requests[1]({total:1,items:[],next_cursor:null});`);
  await new Promise(setImmediate);
  assert.equal(run('state.selection.id'),'app.core');
  assert.equal(run("$('details').children[0].textContent"),'core');
});

test('zoom context explains unavailable internals and clears the hint on returning to an analysed scope',()=>{
  const {run}=viewer();
  run(`state.universe.nodes.get('app.core').status='not-in-target';
    state.scopeShard={scope:'app.core'};clearTrace();`);
  assert.match(run("$('map-tooltip').textContent"),/core: Outside.*target/);
  assert.match(run("$('map-tooltip').textContent"),/internals.*not analysed/i);
  assert.doesNotMatch(run("$('map-tooltip').textContent"),/disabled/i,'absence from a target does not prove disabled configuration');
  run(`state.scopeShard={scope:'app'};clearTrace();`);
  assert.doesNotMatch(run("$('map-tooltip').textContent"),/Outside.*target/);
  run(`state.scopeShard={scope:'app.core'};state.universe.nodes.get('app.core').status='not-analysed';clearTrace();`);
  assert.match(run("$('map-tooltip').textContent"),/Not analysed/);
  assert.doesNotMatch(run("$('map-tooltip').textContent"),/Outside.*target/);
});

test('unavailable nodes expose coverage in hover readout and details while their canvas names stay clean',t=>{
  const {run}=inspectionViewer(true);treeElements(run);t.after(()=>run('state.cy.destroy()'));
  run(`const node=state.universe.nodes.get('app.core.db');node.status='not-in-target';
    state.universe.reveal(node.id);refreshMap();
    globalThis.showTooltip=(title,text)=>{globalThis.tip=text;};
    globalThis.renderConnections=()=>{};
    showTraceReadout(ConnectionTrace.node(state.universe,state.shard,node.id));
    renderDetails(node);`);
  assert.match(run("nodeDescription(state.universe.nodes.get('app.core.db'))"),/outside.*target/i);
  assert.equal(run("state.cy.getElementById('app.core.db').data('caption')"),'db');
  assert.match(run('tip'),/internals.*not analysed/i);
  assert.equal(run("$('details').children.some(n=>/internals.*not analysed/i.test(n.textContent))"),true);
});

test('centered positions use the named boundary rather than guessing from names or weights',()=>{
  const {run}=viewer();
  run(`globalThis.top=['one','two','stdlib','another-boundary'].map(id=>({id:()=>id,hasClass:()=>id==='one'||id==='two'}));
    globalThis.centered=galaxyPositions(top,1440,1000,'stdlib');`);
  assert.ok(run("Math.hypot(centered.get('stdlib').x,centered.get('stdlib').y)<0.000001"));
  assert.ok(run("Math.hypot(centered.get('another-boundary').x,centered.get('another-boundary').y)>0"));
});

test('a name survives when secondary caption text cannot fit the viewport',t=>{
  const {run}=viewer();
  run(`globalThis.css=()=>'#888888';state.cy=cytoscape({headless:true,styleEnabled:true,style:style(),elements:[
    {data:{id:'a',label:'Useful name',caption:'Useful name\\nmodule / many inside\\nreferences within'}}]});
    state.cy.width=()=>400;state.cy.height=()=>200;state.scopeShard={scope:'a'};
    state.cy.nodes()[0].renderedBoundingBox=options=>options.includeLabels===false?{x1:190,y1:155,x2:210,y2:175}:
      {x1:150,y1:180,x2:250,y2:state.cy.nodes()[0].style('label').includes('\\n')?250:198};
    declutterLabels();`);
  t.after(()=>run('state.cy.destroy()'));
  assert.equal(run("state.cy.nodes()[0].style('text-opacity')"),'1');
  assert.equal(run("state.cy.nodes()[0].style('label')"),'Useful name');
  assert.equal(run("state.labelBoxes.get('a').y2"),198);
});

test('label fitting builds its glyph index once per settled scene rather than once per name',t=>{
  const {run}=viewer();
  run(`state.cy=cytoscape({headless:true,styleEnabled:true,elements:[
    {data:{id:'a',label:'First',caption:'First'}},{data:{id:'b',label:'Second',caption:'Second'}}]});
    state.cy.width=()=>800;state.cy.height=()=>600;state.scopeShard={scope:'root'};
    state.cy.nodes().forEach((n,i)=>n.renderedBoundingBox=()=>({x1:50+i*250,y1:50,x2:150+i*250,y2:75}));
    globalThis.indexBuilds=0;const finish=SpatialIndex.prototype.finish;
    SpatialIndex.prototype.finish=function(){indexBuilds++;return finish.call(this);};
    declutterLabels();`);
  t.after(()=>run('state.cy.destroy()'));
  assert.equal(run('state.visibleLabels.size'),2);
  assert.equal(run('indexBuilds'),1);
});

test('caption fallback batches style writes instead of invalidating native geometry once per star',t=>{
  const {run}=viewer();
  run(`state.cy=cytoscape({headless:true,styleEnabled:true,elements:[
    {data:{id:'a',label:'First',caption:'First\\nmetadata'}},{data:{id:'b',label:'Second',caption:'Second\\nmetadata'}}]});
    state.cy.width=()=>800;state.cy.height=()=>600;state.scopeShard={scope:'root'};
    globalThis.unbatched=0;
    state.cy.nodes().forEach((n,i)=>{
      n.renderedBoundingBox=()=>({x1:50+i*250,y1:50,x2:150+i*250,y2:75});
      const style=n.style;n.style=function(name,...args){
        if((args.length||typeof name==='object')&&!state.cy.batching())unbatched++;
        return style.call(this,name,...args);
      };
    });declutterLabels();`);
  t.after(()=>run('state.cy.destroy()'));
  assert.equal(run('state.visibleLabels.size'),2);
  assert.equal(run('unbatched'),0);
});

test('settled captions reuse measured variants and translate their real hit boxes with the star',t=>{
  const {run}=viewer();
  run(`state.cy=cytoscape({headless:true,styleEnabled:true,layout:{name:'preset',fit:false},elements:[
    {data:{id:'a',label:'First',caption:'First\\nmetadata'},position:{x:100,y:100}}]});
    state.cy.width=()=>800;state.cy.height=()=>600;state.scopeShard={scope:'a'};
    const n=state.cy.nodes()[0],baseStyle=n.style;globalThis.captionWrites=0;
    n.style=function(name,...args){if(name==='label'&&args.length)captionWrites++;return baseStyle.call(this,name,...args);};
    n.renderedBoundingBox=()=>{const p=n.renderedPosition(),w=80*parseFloat(n.style('font-size'))/16;
      return{x1:p.x-w/2,y1:p.y+10,x2:p.x+w/2,y2:p.y+40,w,h:30};};
    declutterLabels();captionWrites=0;declutterLabels();`);
  t.after(()=>run('state.cy.destroy()'));
  assert.equal(run('captionWrites'),0,'unchanged labels must not repeatedly switch between primary and full captions');
  run("state.cy.nodes()[0].position({x:180,y:140});declutterLabels();");
  assert.equal(run("state.labelBoxes.get('a').x1"),140);
  assert.equal(run("state.labelBoxes.get('a').y1"),150);
  run("state.cy.nodes()[0].style('font-size',32);declutterLabels();");
  assert.equal(run("state.labelBoxes.get('a').x1"),100,'a font change must invalidate cached metrics');
  run("for(let i=0;i<20;i++)measureLabelVariants([{node:state.cy.nodes()[0]}],()=>'Variant'+i);");
  assert.equal(run('labelMetrics.get(state.cy.nodes()[0]).variants.size'),4);
});

test('identical text and geometry share one native measurement without sharing positions',t=>{
  const {run}=viewer();
  run(`state.cy=cytoscape({headless:true,styleEnabled:true,layout:{name:'preset',fit:false},elements:[
    {data:{id:'a',label:'Shared',caption:'Shared'},position:{x:100,y:100}},
    {data:{id:'b',label:'Shared',caption:'Shared'},position:{x:400,y:100}}]});
    state.cy.width=()=>800;state.cy.height=()=>600;state.scopeShard={scope:'root'};
    globalThis.measurements=0;state.cy.nodes().forEach(n=>n.renderedBoundingBox=options=>{
      if(options.includeLabels)measurements++;
      const p=n.renderedPosition();return{x1:p.x-40,y1:p.y+10,x2:p.x+40,y2:p.y+40,w:80,h:30};
    });declutterLabels();`);
  t.after(()=>run('state.cy.destroy()'));
  assert.equal(run('measurements'),3,'two visibility probes plus one shared native text measurement');
  assert.equal(run("state.labelBoxes.get('a').x1"),60);
  assert.equal(run("state.labelBoxes.get('b').x1"),360);
});

test('stale warnings disclose complete diagnostics without filling the collapsed banner',()=>{
  const {run}=viewer();treeElements(run);
  run(`state.target={id:'sample',project:'SampleProject',stale:true,run:'synthetic-run',changed_count:30,
    changed:Array.from({length:20},(_,i)=>'Plugins/Sample/Source/VeryLongChangedHeader'+i+'.h')};realRenderBanner();`);
  assert.equal(run("$('banner').hidden"),false);
  assert.equal(run("$('banner').children[0].tag"),'details');
  assert.equal(run("$('banner').children[0].open"),undefined);
  assert.match(run("$('banner').children[0].children[0].textContent"),/30 inputs changed/);
  assert.ok(!run("$('banner').children[0].children[0].textContent").includes('VeryLongChangedHeader'));
  assert.equal(run("$('banner').children[0].children.find(n=>n.tag==='ul').children.length"),20);
  run('state.target.stale=false;realRenderBanner();');
  assert.equal(run("$('banner').hidden"),true);
});

test('grouped compiler references keep manifest names and colors without exposing generated type ids',()=>{
  const {run}=viewer();
  run(`state.manifest.edge_types=[{id:'calls',label:'calls (statically resolved)'},
    {id:'uses.function',label:'function reference'},{id:'uses.type',label:'type reference'}];`);
  assert.equal(run("colorOf('calls.rollup')"),run("colorOf('calls')"));
  assert.match(run("typeLabel('calls.rollup')"),/calls.*summary/);
  assert.match(run("typeLabel('uses.rollup')"),/function reference.*type reference.*summary/);
  assert.equal(run("colorOf('uses.rollup',[{type:'uses.type'}])"),run("colorOf('uses.type')"));
  assert.equal(run("typeLabel('uses.rollup',[{type:'uses.type'}])"),'type reference (summary)');
  assert.notEqual(run("colorOf('uses.rollup',[{type:'uses.type'},{type:'uses.function'}])"),run("colorOf('uses.function')"));
  assert.equal(run("typeLabel('unknown')"),'unknown');
});

test('secondary node metadata stays disclosed while references and analysis state remain visible',()=>{
  const {run}=inspectionViewer();treeElements(run);
  run(`globalThis.attributes=(node,values)=>{for(const[key,value]of Object.entries(values||{}))node.append(el('dt',key),el('dd',value));};
    globalThis.renderConnections=panel=>panel.append(el('h3','Outgoing'));
    const n=state.universe.nodes.get('app.core');n.attrs={analysis:'partial',
      compiler_analysis:'not analysed: no native unit observed',disables:'many unrelated project options'};
    selectNode(n.id);`);
  assert.equal(run("$('details').children.find(n=>n.tag==='details').children[0].textContent"),'Metadata');
  assert.equal(run("$('details').children.find(n=>n.tag==='details').open"),undefined);
  assert.ok(run("$('details').children.find(n=>n.tag==='dl').children.some(n=>n.textContent==='partial')"));
  assert.ok(run("$('details').children.find(n=>n.tag==='dl').children.some(n=>n.textContent==='not analysed: no native unit observed')"));
  assert.ok(!run("$('details').children.find(n=>n.tag==='dl').children.some(n=>n.textContent==='many unrelated project options')"));
  assert.ok(run("$('details').children.some(n=>n.tag==='h3'&&n.textContent==='Outgoing')"));
  run('state.cy.destroy()');
});

test('semantic expansion updates inspection controls without replacing paged reference state',()=>{
  const {run}=inspectionViewer();treeElements(run);
  run(`state.universe.paged=true;state.universe.graph.nodes.find(n=>n.id==='app.core').attrs={};
    globalThis.renderConnections=()=>{};selectNode('app.core');
    globalThis.control=$('details').querySelector('[data-action="toggle-group"]');
    globalThis.epoch=state.referenceEpoch;state.universe.expanded.add('app.core');refreshMap();`);
  assert.equal(run('control.textContent'),'Collapse constellation');
  assert.equal(run("control.attrs['aria-expanded']"),'true');
  assert.equal(run('state.referenceEpoch'),run('epoch'),'reference pages and scroll must survive semantic zoom');
  run('state.cy.destroy()');
});

test('Fit overview restores root navigation without moving saved pins',()=>{
  const {run}=inspectionViewer();
  run(`state.target.run='test';state.manifest.entry='entry.json';state.indexLookup=new Map([
    ['app',{id:'app',file:'entry.json'}],['app.core',{id:'app.core',file:'core.json'}]]);
    setSceneScope('app.core');globalThis.pins=JSON.stringify([...state.universe.positions]);fitOverview();`);
  assert.equal(run('state.scopeShard.scope'),'app');
  assert.equal(run('state.file'),'entry.json');
  assert.equal(run('JSON.stringify([...state.universe.positions])'),run('pins'));
  run('state.cy.destroy()');
});

test('reset cancellation preserves user pins and sends no write',async()=>{
  const {run,context}=viewer();const requests=[];context.fetch=async(url,options)=>{requests.push(options);return{ok:true};};
  run(`globalThis.prompts=[];globalThis.confirm=message=>{prompts.push(message);return false;};
    $('layout').value='auto';$('layout').selectedOptions=[{textContent:'orbits'}];
    state.positionCache=new PositionCache('/layout/sample/entry.json',{auto:{a:{x:1,y:2}}});
    state.cy=cytoscape({headless:true});globalThis.layout=()=>{};`);
  await run('resetPositions()');
  assert.equal(requests.length,0);assert.equal(run('state.positionCache.layouts.auto.a.x'),1);
  assert.match(run('prompts[0]'),/1 saved position/);
  assert.match(run('prompts[0]'),/SampleProject \(orbits\)/);
  run('confirm=()=>true');await run('resetPositions()');
  assert.equal(requests.length,1);assert.equal(run('state.positionCache.layouts.auto'),undefined);
  run('confirm=()=>{throw Error("Empty layouts need no confirmation")};');await run('resetPositions()');
  run('state.cy.destroy()');
});

test('ordinary labels avoid other star glyphs while a traced name remains available',()=>{
  const {context,run}=viewer();
  context.labels=[{id:'a',box:{x1:10,y1:10,x2:40,y2:30},priority:1}];
  context.glyphs=[{id:'a',box:{x1:0,y1:0,x2:10,y2:10}},{id:'b',box:{x1:25,y1:20,x2:35,y2:35}}];
  assert.equal(run('nonOverlappingLabels(labels,glyphs).has("a")'),false);
  run('labels[0].priority=8');assert.equal(run('nonOverlappingLabels(labels,glyphs).has("a")'),true);
});

test('self-reference loops keep control points outside their glyph through zoom changes',t=>{
  const {run}=viewer();t.after(()=>run('state.cy?.destroy()'));
  run(`globalThis.css=()=>'#888';state.scopeShard={scope:'app.core.db'};state.universe.place({},'auto');
    state.cy=cytoscape({headless:true,styleEnabled:true,style:style(),layout:{name:'preset',fit:false},elements:[
      {data:{id:'app.core.db',caption:'Database'},classes:'member'},
      {data:{id:'loop',source:'app.core.db',target:'app.core.db',loopDistance:100,color:'#888'},classes:'loop'}]});
    state.cy.zoom(.05);readableLabels();`);
  const fits = () => run("parseFloat(state.cy.getElementById('loop').style('control-point-step-size'))>state.cy.getElementById('app.core.db').outerWidth()");
  assert.equal(fits(),true);
  run("state.cy.getElementById('loop').style('control-point-step-size',40)");
  assert.equal(fits(),false,'the fixed-size control reproduces a loop hidden inside its star');
  run("state.cy.getElementById('loop').removeStyle('control-point-step-size')");
  run('state.cy.zoom(2);readableLabels();');
  assert.equal(fits(),true);
});

test('a late mouse-out from the previous target cannot erase the current hover trace',()=>{
  const {run}=viewer();
  run(`globalThis.frames=[];globalThis.requestAnimationFrame=fn=>frames.push(fn);
    globalThis.flushFrames=()=>frames.splice(0).forEach(fn=>fn());
    globalThis.css=()=>'#888';globalThis.showTooltip=()=>{};globalThis.readableLabels=()=>{};
    globalThis.layout=()=>{};const create=cytoscape;
    globalThis.cytoscape=options=>create({...options,container:undefined,headless:true});
    state.scopeShard={scope:'app'};realRenderGraph();state.shard={nodes:fixture.nodes,edges:[]};
    state.cy.add([{data:{id:'app.core.db'}},{data:{id:'app.web.views'}},
      {data:{id:'connection',source:'app.core.db',target:'app.web.views'}}]);
    state.cy.getElementById('app.core.db').emit('mouseover');
    state.cy.getElementById('app.web.views').emit('mouseover');
    state.cy.getElementById('app.core.db').emit('mouseout');flushFrames();`);
  assert.equal(run("state.cy.getElementById('app.web.views').hasClass('hovered')"),true);
  assert.ok(run("state.cy.edges('.focus').length")>0);
  run("state.cy.getElementById('app.web.views').emit('mouseout');flushFrames();");
  assert.equal(run("state.cy.elements('.focus,.hovered').length"),0);
  run('state.cy.destroy()');
});

test('bundle counts appear on the inspected connection without cluttering the whole map',()=>{
  const {run}=viewer();
  run(`globalThis.css=()=>'#888888';globalThis.styles=style();`);
  assert.equal(run("styles.find(s=>s.selector==='edge.derived').style.label"),'');
  assert.equal(run("styles.find(s=>s.selector==='edge.derived.hovered, edge.derived:selected').style.label"),'data(count)');
});

test('repeated label updates reuse geometry until zoom or the rendered graph changes',t=>{
  const {run}=viewer();
  t.after(()=>run('state.cy.destroy()'));
  run(`globalThis.css=()=>'#888888';
    state.scopeShard={scope:'app'};
    state.cy=cytoscape({headless:true,styleEnabled:true,style:style(),elements:[
      {data:{id:'a',caption:'A',weight:1}},{data:{id:'b',caption:'B',weight:1}},
      {data:{id:'edge',source:'a',target:'b',weight:1,color:'#888888'}}]});
    globalThis.geometryWrites=0;const original=state.cy.edges.bind(state.cy);
    state.cy.edges=(...args)=>{const edges=original(...args),setter=edges.style;
      edges.style=function(values,...rest){if(values&&Object.hasOwn(values,'arrow-scale'))geometryWrites++;
        return setter.call(this,values,...rest);};return edges;};
    readableLabels();readableLabels();`);
  assert.equal(run('geometryWrites'),0,'camera gestures must use native edge scaling instead of invalidating every reference style');
  run('state.cy.zoom(2);readableLabels();');
  assert.equal(run('geometryWrites'),0);
  run('state.labelGeometry=null;readableLabels();');
  assert.equal(run('geometryWrites'),0);
});

test('projection refresh keeps existing renderer elements and their geometry',()=>{
  const {run}=inspectionViewer();
  run(`state.universe.reveal('app.core.db');refreshMap();
    globalThis.points=JSON.stringify(state.cy.nodes().not(':parent').map(n=>[n.id(),n.position()]));
    globalThis.star=state.cy.nodes()[0];globalThis.reference=state.cy.edges()[0];
    globalThis.rendererWrites=0;const json=state.cy.json.bind(state.cy);
    state.cy.json=(...args)=>{if(args.length)rendererWrites++;return json(...args);};
    star.addClass('focus hovered');refreshMap();`);
  assert.equal(run('rendererWrites'),0,'unchanged projection must not mutate the renderer');
  assert.equal(run('state.cy.getElementById(star.id())[0]===star'),true);
  assert.equal(run('state.cy.getElementById(reference.id())[0]===reference'),true);
  assert.equal(run("state.cy.elements('.focus,.hovered').length"),0,'scope refresh must clear temporary hover');
  assert.equal(run("JSON.stringify(state.cy.nodes().not(':parent').map(n=>[n.id(),n.position()]))===points"),true,
    'updating a compound group must not translate its unchanged child positions');
});

test('expanded constellations use independent renderer shapes instead of costly native compound parents',()=>{
  const {run}=inspectionViewer();
  run("state.universe.reveal('app.core.db');refreshMap();");
  assert.equal(run("state.cy.nodes(':parent').length"),0,'containment belongs to Universe, not native compound style propagation');
  assert.equal(run("state.cy.getElementById('app.core').pannable()"),true);
  assert.equal(run("state.cy.getElementById('app.core.db').pannable()"),false);
  run('state.cy.destroy()');
});

test('expanded backgrounds stay below star hit targets even while a reference trace changes',t=>{
  const {run}=viewer();
  t.after(()=>run('state.cy?.destroy()'));
  run(`globalThis.css=()=>'#888';state.scopeShard={scope:'app'};state.index={nodes:[]};state.manifest={edge_types:[]};
    state.universe.place({},'auto');state.cy=cytoscape({headless:true,styleEnabled:true,style:style(),elements:[]});
    globalThis.viewportCamera=()=>null;state.universe.reveal('app.core.db');refreshMap();`);
  assert.equal(run("state.cy.getElementById('app.core').style('z-compound-depth')"),'bottom');
  assert.ok(run("state.cy.getElementById('app.core').data('layer')")>=0);
  run("state.cy.getElementById('app.core').addClass('focus');");
  assert.equal(run("state.cy.getElementById('app.core').style('z-compound-depth')"),'bottom');
  assert.equal(run("Number(state.cy.getElementById('app.core').style('z-index'))"),run("state.cy.getElementById('app.core').data('layer')"));
  run("state.cy.getElementById('app.core.db').addClass('hovered');");
  assert.equal(run("Number(state.cy.getElementById('app.core.db').style('z-index'))"),20);
  assert.equal(run("state.cy.edges().first().style('z-compound-depth')"),'auto',
    'connections remain interactive above constellation backgrounds');
  run('state.cy.destroy()');
});

test('opening a previously styled ring resets its dimensions and label hit geometry',()=>{
  const {run}=viewer();
  run(`globalThis.css=()=>'#888';state.scopeShard={scope:'app',parents:[]};state.index={nodes:[]};
    state.manifest={edge_types:[]};state.universe.place({},'auto');
    state.cy=cytoscape({headless:true,styleEnabled:true,style:style(),elements:[]});refreshMap();
    state.universe.reveal('app.core.db');refreshMap();`);
  assert.equal(run("state.cy.getElementById('app.core').style('text-valign')"),'top');
  assert.equal(run("state.cy.getElementById('app.core').width()"),run("state.cy.getElementById('app.core').data('spanX')"));
  run('state.cy.destroy()');
});

test('a target change resets renderer scale and cancels old viewport work',()=>{
  const {run}=viewer();
  run(`globalThis.css=()=>'#888';globalThis.cancelled=[];globalThis.cancelAnimationFrame=id=>cancelled.push(id);
    const create=cytoscape;globalThis.cytoscape=options=>create({...options,container:undefined,headless:true});
    globalThis.layout=()=>{};state.renderScale=4096;state.viewportFrame=123;realRenderGraph();`);
  assert.equal(run('state.renderScale'),1);
  assert.equal(run('cancelled.includes(123)'),true);
  run('state.cy.destroy()');
});

test('restoring a deep camera reprojects after moving to its viewport',()=>{
  const {run}=inspectionViewer();
  run(`globalThis.projectedZooms=[];globalThis.refreshMap=()=>projectedZooms.push(worldZoom());
    state.target.run='run';restoreView({target:'sample',run:'run',expanded:['app','app.core'],zoom:100,
      pan:{x:12,y:13},size:{width:state.cy.width(),height:state.cy.height()}});`);
  assert.equal(run('projectedZooms.at(-1)'),100);
  run('state.cy.destroy()');
});

test('exact metadata survives a canonical reference id matching a compact group id',()=>{
  const {run}=inspectionViewer();
  run(`const nodes=fixture.nodes,source=nodes.findIndex(n=>n.id==='app.core.db'),target=nodes.findIndex(n=>n.id==='app.core.models');
    state.universe=new Universe({schema:'laniakea.map/1',nodes,references:[{source,target,type:'calls',count:2}]});
    state.universe.place({},'auto');state.universe.reveal('app.core.db');refreshMap();
    renderDetails({id:'group:1',referenceGroup:1,source:'app.core.db',target:'app.core.models',type:'calls',
      status:'resolved',origin:'compiler',attrs:{line:42}});`);
  assert.equal(run('state.selection.attrs.line'),42);
  assert.equal(run('state.selection.referenceGroup'),1);
  assert.equal(run("state.cy.edges(':selected').length"),1);
  run('state.cy.destroy()');
});

test('gesture frames defer label restyling and settle once without moving world pins',()=>{
  const {run}=viewer();
  run(`globalThis.css=()=>'#888';state.scopeShard={scope:'app'};
    state.cy=cytoscape({headless:true,styleEnabled:true,style:style(),elements:[{data:{id:'a',caption:'A'}}]});
    globalThis.timer=null;globalThis.setTimeout=callback=>{timer=callback;return 1;};globalThis.clearTimeout=()=>{};
    globalThis.pins=JSON.stringify([...state.universe.positions]);beginViewportGesture();readableLabels();`);
  assert.equal(run('state.labelGeometry'),undefined);
  run('timer()');assert.equal(run('state.gestureActive'),false);
  assert.equal(run('state.labelGeometry.cy===state.cy'),true);
  assert.equal(run('JSON.stringify([...state.universe.positions])'),run('pins'));
  run('state.cy.destroy()');
});

test('Fit map recovers the overview after panning into an empty viewport',()=>{
  const {run}=viewer();
  run(`state.universe.place({},'auto');state.cy=cytoscape({headless:true,elements:[]});
    globalThis.bounds=null;globalThis.frame=box=>bounds=box;globalThis.refreshed=0;
    globalThis.refreshMap=()=>refreshed++;fitMap();`);
  assert.equal(run('refreshed'),1);
  assert.equal(run("state.universe.childIds(state.universe.root).every(id=>{const p=state.universe.positions.get(id);return p.x>=bounds.x1&&p.x<=bounds.x2&&p.y>=bounds.y1&&p.y<=bounds.y2;})"),true);
  run('state.cy.destroy()');
});

test('a constellation label delegates its visible family to native dragging and restores inspection',()=>{
  const {run}=inspectionViewer(true);
  run(`state.universe.reveal('app.core.db');refreshMap();state.cy.getElementById('app.web').select();
    state.labelBoxes=new Map([['app.core',{x1:10,y1:10,x2:80,y2:50}]]);
    $('graph').getBoundingClientRect=()=>({left:0,top:0});
    globalThis.points=JSON.stringify([...state.universe.positions]);
    state.gestureActive=true;
    grabConstellationLabel({button:0,clientX:20,clientY:20});`);
  assert.equal(run('state.gestureActive'),false,'a fresh mouse press must use current label geometry');
  assert.equal(run("state.cy.getElementById('app.core.db').selected()"),true);
  assert.equal(run("state.cy.getElementById('app.core.models').selected()"),true);
  assert.equal(run("state.cy.getElementById('app.core').pannable()"),false);
  assert.ok(run("state.cy.edges('.arranging').length")>0);
  assert.equal(run("state.cy.edges().every(e=>e.style('events')==='no')"),true,'wires crossing a group name cannot intercept native grabbing');
  run('releaseConstellationLabel()');
  assert.equal(run("state.cy.edges('.arranging').length"),0);
  assert.equal(run("state.cy.getElementById('app.core').pannable()"),true);
  assert.equal(run("state.cy.nodes(':selected').length"),1);
  assert.equal(run("state.cy.getElementById('app.web').selected()"),true);
  assert.equal(run("state.cy.edges().every(e=>e.style('events')==='yes')"),true,'connection interaction returns after the gesture');
  assert.equal(run('JSON.stringify([...state.universe.positions])'),run('points'));
  run('state.cy.destroy()');
});

test('following a parallel call inspects its exact source location through the shared connection',()=>{
  const {run}=inspectionViewer();
  run(`globalThis.exact={id:'chosen-call',source:'app.core.db',target:'app.core.models',type:'calls',
      status:'resolved',origin:'compiler',attrs:{line:17}};
    state.universe=new Universe({...fixture,edges:[exact,{...exact,id:'other-call',attrs:{line:23}}]});
    state.universe.place({},'auto');refreshMap();followReference(exact);`);
  assert.equal(run('state.selection?.id'),'chosen-call');
  assert.equal(run('state.selection.attrs.line'),17);
  assert.equal(run("state.cy.edges(':selected').length"),1);
  run('refreshMap()');
  assert.equal(run('state.selection?.id'),'chosen-call');
  run("state.hidden.add('calls');refreshMap()");
  assert.equal(run('state.selection'),null);
});

test('expanding one branch does not rewrite unchanged stars in another branch',()=>{
  const {run}=inspectionViewer();
  run(`const untouched=state.cy.getElementById('app.web'),json=untouched.json.bind(untouched);
    globalThis.untouchedWrites=0;untouched.json=(...args)=>{if(args.length)untouchedWrites++;return json(...args);};
    state.universe.reveal('app.core.db');refreshMap();`);
  assert.equal(run('untouchedWrites'),0);
  assert.equal(run("state.cy.getElementById('app.core.db').length"),1);
});

test('flying to a deeply nested function uses its local scale instead of a fixed world radius',()=>{
  const {run}=viewer();
  run(`state.universe.place({},'auto');state.universe.radii.set('app.core',0.2);
    globalThis.frame=(bounds,padding,maxZoom)=>globalThis.camera={bounds,padding,maxZoom};
    frameNode('app.core.db');`);
  assert.ok(run('camera.bounds.x2-camera.bounds.x1')<1,'nearby deep stars must be separated on screen');
  assert.ok(run('camera.maxZoom')>160,'deep hierarchy must not stop at the top-level camera scale');
});

test('the camera fits constellations smaller than one world unit',()=>{
  const {run}=viewer();
  run(`state.cy=cytoscape({headless:true,elements:[],minZoom:0.001,maxZoom:20000});
    globalThis.readableLabels=()=>{};globalThis.rememberView=()=>{};
    frame({x1:0,y1:0,x2:0.1,y2:0.1},0,20000);`);
  assert.ok(run('worldZoom()')>=99,'world-unit rounding must not cap deep camera zoom');
  run('state.cy.destroy()');
});

test('renderer rescaling preserves world positions and camera history across deep zoom',()=>{
  const {run}=inspectionViewer();
  run(`globalThis.worldPoints=JSON.stringify([...state.universe.positions]);
    setWorldViewport(4096,{x:120,y:80});
    history.replaceState=(value)=>globalThis.savedScene=value.scene;rememberView();`);
  assert.equal(run('worldZoom()'),4096);
  assert.ok(run('state.cy.zoom()')<=2,'native fonts must remain in a useful renderer scale');
  assert.equal(run('JSON.stringify([...state.universe.positions])===worldPoints'),true);
  assert.equal(run('savedScene.zoom'),4096);
  assert.equal(run("state.cy.getElementById('app.core').position('x')"),run("state.universe.positions.get('app.core').x*state.renderScale"));
  run('setWorldViewport(0.5,{x:0,y:0});restoreView(savedScene);');
  assert.equal(run('worldZoom()'),4096);
  assert.equal(run('JSON.stringify([...state.universe.positions])===worldPoints'),true);
});

test('wheel scale changes keep stars, fonts and expanded backgrounds in the same painted units',()=>{
  const {run}=viewer();
  run(`globalThis.css=()=>'#888';state.scopeShard={scope:'app'};state.index={nodes:[]};
    state.manifest={edge_types:[]};state.universe.place({},'auto');state.universe.reveal('app.core.db');
    state.cy=cytoscape({headless:true,styleEnabled:true,style:style(),elements:[]});
    globalThis.viewportCamera=()=>null;globalThis.declutterLabels=()=>globalThis.collisions++;
    globalThis.collisions=0;globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
    globalThis.setTimeout=callback=>{globalThis.settle=callback;return 1;};globalThis.clearTimeout=()=>{};
    refreshMap();state.cy.getElementById('app.core.db').addClass('configured');
    state.labelGeometry=null;readableLabels();globalThis.pins=JSON.stringify([...state.universe.positions]);
    globalThis.paints=[];const renderer=state.cy.renderer(),notify=renderer.notify;
    renderer.notify=function(...args){
      const star=state.cy.getElementById('app.core.db'),group=state.cy.getElementById('app.core'),z=state.cy.zoom();
      paints.push({font:parseFloat(star.style('font-size'))*z,glyph:star.width()*z,
        icon:parseFloat(star.style('background-width'))*z,
        background:group.width()*z,padding:parseFloat(group.style('padding'))*z,
        outline:parseFloat(star.style('outline-width'))*z,offset:parseFloat(star.style('outline-offset'))*z});
      return notify.apply(this,args);
    };`);
  for(const [from,to] of [[2.04,1.735],[4.04,3.4],[8.04,6.8],[1024.04,900],[1.96,2.3],[3.96,4.6]]) {
    run(`setWorldViewport(${from},{x:120,y:80});paints=[];collisions=0;
      setWorldViewport(${to},{x:118,y:79},true);`);
    assert.ok(run('paints.length')>0);
    for(const paint of run('paints')) {
      assert.ok(Math.abs(paint.font-13)<0.001,`font flashed at ${from} -> ${to}: ${paint.font}px`);
      assert.ok(Math.abs(paint.glyph-26)<0.001,`star flashed at ${from} -> ${to}: ${paint.glyph}px`);
      assert.ok(Math.abs(paint.icon-26*0.58)<0.001,`type icon flashed at ${from} -> ${to}: ${paint.icon}px`);
      const span=run("state.universe.bounds.get('app.core').x2-state.universe.bounds.get('app.core').x1");
      assert.ok(Math.abs(paint.background-span*to)<0.001,'background retained its old renderer scale');
      assert.ok(Math.abs(paint.padding-26)<0.001,'background padding retained its old renderer scale');
      assert.ok(Math.abs(paint.outline-2)<0.001&&Math.abs(paint.offset-4)<0.001,
        'configuration outline retained its old renderer scale');
    }
    assert.equal(run('collisions'),0,'wheel frames must defer label collision work');
    run('settle()');assert.equal(run('collisions'),1,'labels settle once after the gesture');
    assert.equal(run('JSON.stringify([...state.universe.positions])'),run('pins'));
  }
  run('state.cy.destroy()');
});

test('compiler locations become source links and structured metadata stays readable',()=>{
  const {run}=viewer();
  run(`state.target.roots={project:'C:/Sample'};
    globalThis.el=(tag,text,attrs)=>({tag,text,attrs,children:[],append(...items){this.children.push(...items);}});
    globalThis.metadata={children:[],append(...items){this.children.push(...items);}};
    attributes(metadata,{location:{root:'project',path:'Source/Calls.cpp',line:12},
      context:{target:'SampleEditor',configuration:'Development'}});`);
  assert.equal(run('metadata.children[1].children.length'),1,'call locations need an actionable source link');
  assert.equal(run('metadata.children[1].children[0].attrs.href'),'vscode://file/C:/Sample/Source/Calls.cpp:12');
  assert.equal(run('metadata.children[3].textContent'),'{"target":"SampleEditor","configuration":"Development"}');
});

test('compact reference groups display original reference counts in the map and summary',()=>{
  const {run}=inspectionViewer();
  run(`const nodes=fixture.nodes;
    state.universe=new Universe({schema:'laniakea.map/1',nodes,references:[{
      source:nodes.findIndex(n=>n.id==='app.core.db'),target:nodes.findIndex(n=>n.id==='app.web.views'),type:'calls',count:1000}]});
    state.universe.place({},'auto');refreshMap();`);
  assert.equal(run("state.cy.edges()[0].data('weight')"),1000);
  assert.match(run("$('scope-summary').textContent"),/1000 references/);
});

test('compact startup resolves scope metadata without downloading canonical graph or scope payloads',async()=>{
  const {context,run}=viewer(),requests=[];
  const graph=context.fixture,index={nodes:graph.nodes.filter(n=>!n.boundary).map(n=>({id:n.id,label:n.label,level:n.level,
    child_count:graph.nodes.filter(c=>c.parent===n.id).length,file:n.id==='app'?'entry.json':n.id+'.json'}))};
  run(`state.target=null;state.universe=null;state.targets[0].map_url='/map/sample/key/topology.json';
    state.targets[0].references_url='/map/sample/key/references';globalThis.frameNode=()=>{};`);
  context.fetch=async url=>{requests.push(url);return {ok:true,json:async()=>url.endsWith('manifest.json')?
    {entry:'entry.json',edge_types:[],levels:[]} : url.endsWith('index.json')?index:
    {schema:'laniakea.map/1',nodes:graph.nodes,references:[]}};};
  await run("show('sample','app.core.db.json','push')");
  assert.equal(run('state.universe.paged'),true);assert.equal(run('state.scopeShard.scope'),'app.core.db');
  assert.ok(!requests.some(url=>url.endsWith('/graph.json')||url.endsWith('/app.core.db.json')));
});

test('large reference lists load on scroll and retain a keyboard load action',()=>{
  const {run}=viewer();
  run(`globalThis.el=(tag,text,attrs)=>({tag,text,attrs,children:[],isConnected:true,
    append(...items){this.children.push(...items);},
    insertBefore(item,before){this.children.splice(this.children.indexOf(before),0,item);},remove(){this.removed=true;}});
    globalThis.observers=[];globalThis.IntersectionObserver=class{constructor(callback){this.callback=callback;observers.push(this);}
      observe(){} disconnect(){this.disconnected=true;}};
    state.target.roots={};state.manifest={sources:[],edge_types:[]};
    globalThis.panel=el('section');
    globalThis.references=Array.from({length:125},(_,i)=>({id:'reference'+i,source:'app.web.views',target:'app.core.db',
      type:'calls',status:'resolved',origin:'compiler'}));
    appendReferences(panel,references);`);
  assert.equal(run("panel.children[0].children.filter(n=>n.tag==='li'&&!n.removed).length"),51);
  assert.equal(run('observers.length'),1);
  run('observers[0].callback([{isIntersecting:true}])');
  assert.equal(run("panel.children[0].children.filter(n=>n.tag==='li'&&!n.removed).length"),101);
  run('panel.children[0].children.at(-1).children[0].onclick()');
  assert.equal(run("panel.children[0].children.filter(n=>n.tag==='li'&&!n.removed).length"),125);
  assert.equal(run('observers[0].disconnected'),true);
});

test('paged inspection replaces rows, navigates backwards and rejects stale or mismatched pages',async()=>{
  const {run}=viewer();
  run(`globalThis.el=(tag,text)=>({tag,text,children:[],isConnected:true,
    append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},
    setAttribute(){},scrollIntoView(){this.scrolled=(this.scrolled||0)+1;}});
    state.target.roots={};state.manifest={sources:[],edge_types:[]};state.referenceEpoch=1;
    globalThis.panel=el('aside');globalThis.fail=false;globalThis.deferred=null;
    state.referencePages={load:async query=>{
      if(deferred)return await deferred;
      return {total:fail?126:125,next_cursor:query.cursor+50<125?query.cursor+50:null,
        items:Array.from({length:Math.min(50,125-query.cursor)},(_,i)=>({group:1,
          reference:{id:'ref'+(query.cursor+i),source:'app.core.db',target:'app.web.views',type:'calls',status:'resolved',origin:'compiler'}}))};}};`);
  await run('appendReferencePage(panel,{node:"app.core"},125)');
  assert.equal(run('panel.children[0].children[1].children.length'),50);
  assert.equal(run('panel.children[0].scrolled'),undefined,'initial asynchronous panels must not move the reader');
  await run('panel.children[0].children[0].children[1].onclick()');
  assert.equal(run('panel.children[0].scrolled'),1,'a requested page starts at its controls rather than halfway through new rows');
  assert.equal(run('panel.children[0].children[1].children.length'),50,'previous rows are released rather than appended');
  assert.equal(run('panel.children[0].children[0].children[3].textContent'),'51-100 of 125 references');
  await run('panel.children[0].children[0].children[0].onclick()');
  assert.equal(run('panel.children[0].children[0].children[3].textContent'),'1-50 of 125 references');
  run('fail=true');await run('panel.children[0].children[0].children[1].onclick()');
  assert.match(run('panel.children[0].children[0].children[3].textContent'),/does not match/);
  assert.equal(run('panel.children[0].children[0].children[2].hidden'),false);
  run('fail=false');await run('panel.children[0].children[0].children[2].onclick()');
  assert.equal(run('panel.children[0].children[0].children[3].textContent'),'51-100 of 125 references');
  run('deferred=new Promise(resolve=>globalThis.finish=resolve)');
  const pending=run('panel.children[0].children[0].children[1].onclick()');
  run('state.referenceEpoch++;finish({total:125,items:[],next_cursor:null})');await pending;
  assert.equal(run('panel.children[0].children[1].children.length'),50,'late pages cannot overwrite a different inspection');
});

test('Connections receives projected dependencies while preserving pins and expanded groups',()=>{
  const {run}=inspectionViewer();
  run(`state.universe.reveal('app.core.db');$('layout').value='cose';
    state.positionCache={layouts:{cose:{'app.core':{x:42,y:-17}}},status(){}};
    globalThis.fitMap=()=>{};
    globalThis.layoutInputs=[];globalThis.omitConnections=false;
    const createCy=cytoscape;
    globalThis.cytoscape=options=>{
      const config=omitConnections?{...options,elements:options.elements.filter(e=>!e.data.source)}:options;
      const graph=createCy(config),createLayout=graph.layout;
      graph.layout=options=>{
        layoutInputs.push({name:options.name,edges:graph.edges().map(e=>[e.source().id(),e.target().id()])});
        return createLayout.call(graph,options);
      };
      return graph;
    };`);
  const expanded=run('JSON.stringify([...state.universe.expanded])');
  run('layout()');
  const result=JSON.parse(run('JSON.stringify(layoutInputs[0])'));
  assert.equal(result.name,'cose');
  assert.deepEqual(result.edges.sort(),[['app.core','stdlib'],['app.web','app.core']]);
  assert.equal(run('JSON.stringify([...state.universe.expanded])'),expanded);
  assert.deepEqual(JSON.parse(run("JSON.stringify(state.universe.positions.get('app.core'))")),{x:42,y:-17});
  run('omitConnections=true;layout()');
  assert.equal(run('layoutInputs[1].edges.length'),0,'the same probe must detect the old disconnected layout');
  run('state.cy.destroy()');
});

test('filtering retains the optional inspected node without persistent hover emphasis',()=>{
  const {run}=inspectionViewer();
  run("selectNode('app.web');state.hidden.add('imports');applyFilters()");
  assert.equal(run("state.cy.getElementById('app.web').selected()"),true);
  assert.equal(run('state.selection.id'),'app.web');
  assert.equal(run("state.cy.elements('.focus,.faded').length"),0);
  run('state.cy.destroy()');
});

test('filtered inspected edges refresh their references, and fully hidden inspection clears',()=>{
  const {run}=inspectionViewer();
  run(`fixture.edges.push({id:'other',source:'app.web.views',target:'app.core.models',
      type:'imports.optional',status:'declared',origin:'synthetic'});
    state.universe=new Universe(fixture);state.universe.place({},'auto');refreshMap();
    renderDetails(state.shard.edges.find(e=>e.source==='app.web'));
    state.hidden.add('imports.optional');applyFilters();`);
  assert.equal(run('state.selection.refs.length'),1,'details must describe the displayed bundle');
  assert.equal(run('state.cy.edges(\':selected\').length'),1);
  run("state.hidden.add('imports');applyFilters()");
  assert.equal(run('state.selection'),null);
  assert.equal(run("state.cy.elements(':selected').length"),0);
  assert.equal(run("$('details').hidden"),true);
  run('state.hidden.clear();state.boundary=true;refreshMap();selectNode("stdlib");state.boundary=false;applyFilters()');
  assert.equal(run('state.selection'),null,'hiding the inspected external node must close its details');
  run('state.cy.destroy()');
});

test('a slow earlier scope cannot overwrite the latest navigation', async () => {
  const { context, run } = viewer();
  const pending = {};
  context.fetch = url => url.endsWith('/index.json') ? Promise.resolve({ok:true,json:async()=>({nodes:[]})}) :
    new Promise(resolve => pending[url.split('/').pop()] = title => resolve({ok:true,json:async()=>({title,scope:'app'})}));
  const older = run("show('sample','older.json','push')");
  await new Promise(setImmediate);
  const newer = run("show('sample','newer.json','push')");
  await new Promise(setImmediate);
  pending['newer.json']('newer'); await newer;
  pending['older.json']('older'); await older;
  assert.equal(run('state.file'), 'newer.json');
  assert.equal(run('state.shard.title'), 'newer');
});

test('a removed bookmark falls back to the entry only on HTTP 404', async () => {
  const { context, run } = viewer();
  context.fetch = async url => url.endsWith('missing.json') ? {ok:false,status:404}
    : {ok:true,json:async()=>url.endsWith('index.json')?{nodes:[]}:{title:'entry',scope:'app'}};
  await run("show('sample','missing.json','push')");
  assert.equal(run('state.file'), 'entry.json');
});

test('arrow navigation works before any node is selected', () => {
  const { context, run } = viewer();
  const cy = require('../viewer/vendor/cytoscape.min.js')({headless:true,elements:[
    {data:{id:'a'}},{data:{id:'b'}},
  ]});
  context.testCy = cy;
  run('state.cy = testCy; globalThis.selectNode = id => globalThis.picked = id;');
  run("onKey({target:$('graph'),key:'ArrowRight',preventDefault(){}})");
  assert.equal(run('picked'), 'a');
  run("onKey({target:$('graph'),key:'ArrowLeft',preventDefault(){}})");
  assert.equal(run('picked'), 'b');
  cy.destroy();
});

test('failed navigation retains the current scope and reports the HTTP failure', async () => {
  const { context, run } = viewer();
  const requests = [];
  context.fetch = async url => { requests.push(url); return {ok:false,status:500}; };
  await run("show('sample','broken.json','push')").catch(()=>{});
  assert.equal(requests.length, 1, 'a server failure must not be disguised as a missing bookmark');
  assert.equal(run('state.file'), 'old.json');
  assert.equal(run('state.shard.title'), 'old');
  assert.match(run("$('error').textContent"), /500/);
});

test('a failed target change never commits a partial target or manifest', async () => {
  const { context, run } = viewer();
  run("state.targets.push({id:'other',project:'Other'});");
  context.fetch = async url => url.endsWith('manifest.json')
    ? {ok:true,json:async()=>({entry:'entry.json'})} : {ok:false,status:500};
  await run("show('other',null,'push')").catch(()=>{});
  assert.equal(run('state.target.id'), 'sample');
  assert.equal(run('state.file'), 'old.json');
});

test('failed Up navigation leaves the expanded map intact',async()=>{
  const {context,run}=viewer();
  run("state.scopeShard={scope:'app.core',parents:[{file:'entry.json'}]};state.shard=state.scopeShard;state.universe.expanded.add('app.core');");
  context.fetch=async()=>({ok:false,status:500});
  await run('up()');
  assert.equal(run("state.universe.expanded.has('app.core')"),true);
});

test('overlapping labels preserve selection and members, and return on zoom', () => {
  const { context, run } = viewer();
  context.labels = [
    {id:'context',priority:0,box:{x1:0,x2:100,y1:0,y2:20}},
    {id:'member',priority:2,box:{x1:70,x2:150,y1:0,y2:20}},
    {id:'selected',priority:3,box:{x1:120,x2:200,y1:0,y2:20}},
    {id:'isolated',priority:0,box:{x1:0,x2:100,y1:50,y2:70}},
  ];
  assert.deepEqual(Array.from(run('nonOverlappingLabels(labels)')).sort(), ['context','isolated','selected']);
  run('labels[1].box.y1 = 100; labels[1].box.y2 = 120;');
  assert.equal(run('nonOverlappingLabels(labels).has("member")'), true);
});

test('inspected connection endpoints keep labels ahead of unrelated overlapping stars',t=>{
  const {run}=viewer();
  run(`state.cy=cytoscape({headless:true,styleEnabled:true,layout:{name:'preset',fit:false},elements:[
    {data:{id:'unrelated',caption:'Unrelated'},position:{x:200,y:200}},
    {data:{id:'caller',caption:'Caller'},position:{x:200,y:200}},
    {data:{id:'callee',caption:'Callee'},position:{x:500,y:200}},
    {data:{id:'call',source:'caller',target:'callee'}}]});
    state.cy.width=()=>800;state.cy.height=()=>600;state.scopeShard={scope:'root'};
    // The null renderer has no font metrics; supply the rectangles a canvas renderer measures.
    state.cy.nodes().forEach(n=>n.renderedBoundingBox=()=>{const p=n.renderedPosition();return {
      x1:p.x-50,y1:p.y+20,x2:p.x+50,y2:p.y+50,w:100,h:30};});
    state.cy.getElementById('call').select();declutterLabels();`);
  t.after(()=>run('state.cy.destroy()'));
  assert.equal(run("state.cy.getElementById('caller').style('text-opacity')"),'1');
  assert.equal(run("state.cy.getElementById('unrelated').style('text-opacity')"),'0');
  assert.equal(run("state.cy.getElementById('callee').style('text-opacity')"),'1');
});

test('visible label hit boxes use renderer font metrics rather than estimated character widths',()=>{
  const {run}=viewer();
  run(`state.cy=cytoscape({headless:true,styleEnabled:true,elements:[{data:{id:'a',caption:'Caption'}}]});
    state.cy.width=()=>800;state.cy.height=()=>600;state.scopeShard={scope:'a'};
    state.cy.nodes()[0].renderedBoundingBox=()=>({x1:150,y1:120,x2:270,y2:180,w:120,h:60});declutterLabels();`);
  assert.deepEqual(JSON.parse(run("JSON.stringify(state.labelBoxes.get('a'))")),{x1:150,y1:120,x2:270,y2:180,w:120,h:60});
  run("globalThis.css=()=>'#888888';state.cy.nodes()[0].addClass('expanded').data('iconKind','module');declutterLabels();");
  assert.deepEqual(JSON.parse(run("JSON.stringify(state.labelBoxes.get('a'))")),{x1:150,y1:120,x2:270,y2:180,w:120,h:60},
    'a decorative title icon must not shift the native text hit target');
  run('state.cy.destroy()');
});

test('a late search index cannot populate another project cache', async () => {
  const { context, run } = viewer();
  let release;
  context.fetch = () => new Promise(resolve => release = resolve);
  const older = run('projectIndex()');
  run("state.target = {id:'other'}; state.index = null;");
  release({ok:true,json:async()=>({nodes:[{label:'SampleProject'}]})});
  await older;
  assert.equal(run('state.index'), null);
});

test('drag release sends only that pin and captures its scope before navigation', async () => {
  const { context, run } = viewer();
  const requests = [];
  context.fetch = async (url, options) => { requests.push({url, ...options}); return {ok:true}; };
  run("globalThis.cache = new PositionCache('/layout/sample/entry.json', {}); state.positionCache = cache;");
  await run("cache.move('auto', {id:()=> 'a', position:axis=>axis==='x'?42:-17})");
  run("state.positionCache = new PositionCache('/layout/other/entry.json', {});");
  await run("cache.move('auto', {id:()=> 'b', position:()=>3})");
  assert.equal(requests.length, 2);
  assert.equal(requests[1].url, '/layout/sample/entry.json');
  assert.deepEqual(JSON.parse(requests[1].body), {layout:'auto',positions:{b:{x:3,y:3}}});
  assert.deepEqual(JSON.parse(requests[0].body).positions, {a:{x:42,y:-17}});
});

test('large constellation moves use bounded sequential requests and drain their responses', async () => {
  const {context,run}=viewer();
  const saved=new Map();let inFlight=0,requests=0;
  context.fetch=async(_url,options)=>{
    const bytes=Buffer.byteLength(options.body);requests++;
    if(bytes>48*1024||inFlight+bytes>64*1024)throw Error('browser keepalive budget exceeded');
    inFlight+=bytes;
    for(const [id,p] of Object.entries(JSON.parse(options.body).positions))saved.set(id,p);
    return {ok:true,text:async()=>{inFlight-=bytes;return '{}';}};
  };
  run(`globalThis.cache=new PositionCache('/layout/sample/entry.json',{});
    globalThis.points=Object.fromEntries(Array.from({length:1500},(_,i)=>['symbol:'+String(i).padStart(70,'0'),{x:i,y:-i}]));`);
  assert.equal(await run("cache.moveMany('auto',points)"),true);
  assert.equal(saved.size,1500);assert.ok(requests>2);assert.equal(inFlight,0);
  assert.equal(run('unsavedPositionCaches.size'),0);
});

test('a failed middle position batch remains unsaved until the complete move is retried', async()=>{
  const {context,run}=viewer();let requests=0;
  context.fetch=async()=>({ok:++requests!==2,status:500,text:async()=> 'write failed'});
  run(`globalThis.cache=new PositionCache('/layout/sample/entry.json',{});
    globalThis.points=Object.fromEntries(Array.from({length:1500},(_,i)=>['symbol:'+String(i).padStart(70,'0'),{x:i,y:-i}]));`);
  assert.equal(await run("cache.moveMany('auto',points)"),false);
  assert.equal(run('cache.errors.size'),1500);
  assert.equal(run('unsavedPositionCaches.size'),1);
  context.fetch=async()=>({ok:true,text:async()=> '{}'});
  assert.equal(await run("cache.moveMany('auto',points)"),true);
  assert.equal(run('unsavedPositionCaches.size'),0);
});

test('quick consecutive moves are saved in order, with the newest coordinates last', async () => {
  const { context, run } = viewer();
  const requests = [];
  let release;
  context.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    if(requests.length===1) await new Promise(resolve=>release=resolve);
    return {ok:true};
  };
  run("globalThis.cache = new PositionCache('/layout/sample/entry.json', {});");
  const first = run("cache.move('auto',{id:()=> 'a',position:()=>1})");
  await Promise.resolve();
  const last = run("cache.move('auto',{id:()=> 'a',position:()=>2})");
  assert.equal(requests.length, 1);
  release(); await first; await last;
  assert.equal(requests[1].positions.a.x, 2);
  assert.equal(run('cache.layouts.auto.a.x'), 2);
  assert.equal(run('unsavedPositionCaches.size'), 0);
});

test('a failed save stays observable and does not report positions saved', async () => {
  const { context, run } = viewer();
  context.fetch = async () => ({ok:false,status:500,text:async()=> 'disk unavailable'});
  run("globalThis.cache = new PositionCache('/layout/sample/entry.json', {});state.positionCache=cache;$('layout').value='auto';");
  assert.equal(await run("cache.move('auto',{id:()=> 'a',position:()=>1})"), false);
  assert.match(run("$('position-status').textContent"), /not saved/);
  assert.equal(run('unsavedPositionCaches.size'), 1);
});

test('failed reset retains saved positions, and successful reset clears only its mode', async () => {
  const { context, run } = viewer();
  run("globalThis.cache = new PositionCache('/layout/sample/entry.json', {auto:{a:{x:1,y:2}},grid:{a:{x:3,y:4}}});");
  context.fetch = async () => ({ok:false,status:500,text:async()=> 'failure'});
  await run("cache.write('auto',null)");
  assert.equal(run('cache.layouts.auto.a.x'), 1);
  context.fetch = async () => ({ok:true});
  await run("cache.write('auto',null)");
  assert.equal(run('cache.layouts.auto'), undefined);
  assert.equal(run('cache.layouts.grid.a.x'), 3);
});

test('automatic layout restores saved pins and filtering never moves the arrangement', () => {
  const { context, run } = viewer();
  const cy = run('cytoscape({headless:true,elements:[]})');
  context.testCy = cy;
  context.testPositions = {auto:{a:{x:42,y:-17}}};
  run(`state.cy=testCy;state.scopeShard={scope:'root',title:'sample',parents:[]};state.index={nodes:[]};
    state.universe=new Universe({nodes:[
      {id:'root',label:'Root',level:'project',parent:null,boundary:false,status:'in-target'},
      {id:'a',label:'A',level:'module',parent:'root',boundary:false,status:'in-target'},
      {id:'b',label:'B',level:'module',parent:null,boundary:true,status:'in-target'}],edges:[]});$('layout').value='auto';
    state.positionCache={layouts:testPositions,status(){}};
    globalThis.fitMap=()=>{};globalThis.readableLabels=()=>{};layout();`);
  assert.deepEqual({...cy.getElementById('a').position()}, {x:42,y:-17});
  const before = cy.nodes().map(n=>({...n.position()}));
  run('state.boundary=false;applyFilters();state.boundary=true;applyFilters();');
  assert.deepEqual(cy.nodes().map(n=>({...n.position()})), before);
  cy.destroy();
});

test('opening a scope again reads current workspace positions rather than reusing an old view', async () => {
  const { context, run } = viewer();
  let x = 1, reads = 0;
  context.fetch = async () => { reads++; return {ok:true,json:async()=>({auto:{a:{x,y:0}}})}; };
  const first = await run("realLoadPositionCache('sample','entry.json')");
  assert.equal(first.layouts.auto.a.x, 1);
  x = 25;
  const reopened = await run("realLoadPositionCache('sample','entry.json')");
  assert.equal(reopened.layouts.auto.a.x, 25);
  assert.equal(reads, 2);
});

test('opening a scope waits for its outstanding save before reading the workspace', async () => {
  const { context, run } = viewer();
  let release, reads = 0;
  context.fetch = async (_url, options) => {
    if(options && options.method === 'POST') return await new Promise(resolve=>release=resolve);
    reads++; return {ok:true,json:async()=>({auto:{a:{x:42,y:0}}})};
  };
  run("globalThis.cache = new PositionCache('/layout/sample/entry.json', {});");
  const saving = run("cache.move('auto',{id:()=> 'a',position:()=>42})");
  await Promise.resolve();
  const reopening = run("realLoadPositionCache('sample','entry.json')");
  assert.equal(reads, 0);
  release({ok:true});
  await saving;
  assert.equal((await reopening).layouts.auto.a.x, 42);
  assert.equal(reads, 1);
});

test('opening a scope retains a failed local move so it can be retried', async () => {
  const { context, run } = viewer();
  context.fetch = async () => ({ok:false,status:500,text:async()=> 'disk unavailable'});
  run("globalThis.cache = new PositionCache('/layout/sample/entry.json', {});");
  await run("cache.move('auto',{id:()=> 'a',position:()=>42})");
  const reopened = await run("realLoadPositionCache('sample','entry.json')");
  assert.equal(reopened.layouts.auto.a.x, 42);
  assert.equal(reopened.errors.size, 1);
});

test('map names stay clean while grouping follows canonical kinds and direct child counts', () => {
  const { run } = viewer();
  run("state.index={nodes:[{id:'group',child_count:3},{id:'leaf',child_count:0}]};");
  const group=run("mapNode({id:'group',label:'Sample',level:'package'},new Set(['group']),{group:'group.json'})");
  const leaf=run("mapNode({id:'leaf',label:'Sample',level:'module'},new Set(['leaf']),{leaf:'leaf.json'})");
  assert.equal(group.data.caption, 'Sample');
  assert.ok(group.classes.split(' ').includes('group'));
  assert.equal(leaf.data.caption, 'Sample');
  assert.ok(!leaf.classes.split(' ').includes('group'));
  assert.equal(leaf.data.id, 'leaf', 'presentation must retain saved-position identity');
  assert.equal(run("nodeDescription({id:'external',level:'library',boundary:true})"),'library / external');
  assert.equal(run("mapNode({id:'scope',label:'Producer',level:'namespace',attrs:{source_sections:true}},new Set(),{}).data.iconKind"),'namespace');
  assert.equal(run("mapNode({id:'scope',label:'Producer',level:'namespace',attrs:{source_sections:true}},new Set(),{}).data.caption"),'Producer');
  assert.ok(run("mapNode({id:'scope',label:'Producer',level:'namespace',attrs:{source_sections:true,source_partition:{collapsed:true}}},new Set(),{}).classes.includes('implementation')"));
  const neighbour=run("mapNode({id:'leaf',label:'Neighbour',level:'module'},new Set(),{},true)");
  assert.equal(neighbour.data.caption,'Neighbour');
  const container=run("mapNode({id:'group',label:'Sample',level:'package'},new Set(),{},true)");
  assert.equal(container.data.caption,'Sample');
});

test('renderer movement cannot mutate the saved arrangement before a released drag', () => {
  const {run} = viewer();
  run(`state.cy=cytoscape({headless:true,elements:[]});
    state.scopeShard={scope:'app',title:'Sample',parents:[]};state.index={nodes:[]};
    state.manifest.edge_types=[{id:'imports'},{id:'imports.rollup'}];
    state.universe.place({},'auto');globalThis.readableLabels=()=>{};refreshMap();`);
  const before=run("JSON.stringify(state.universe.positions.get('app.core'))");
  run("state.cy.getElementById('app.core').position({x:77,y:33})");
  assert.equal(run("JSON.stringify(state.universe.positions.get('app.core'))"),before);
  run('state.cy.destroy()');
});

test('a reference id matching a node id cannot hide a rendered connection', () => {
  const {run} = viewer();
  run(`fixture.edges.push({id:'app.core',source:'app.core',target:'app.web',type:'calls',status:'declared',origin:'synthetic'});
    state.universe=new Universe(fixture);state.universe.place({},'auto');
    state.cy=cytoscape({headless:true,elements:[]});state.scopeShard={scope:'app',title:'Sample',parents:[]};
    state.index={nodes:[]};state.manifest.edge_types=[];globalThis.readableLabels=()=>{};refreshMap();`);
  assert.equal(run('state.cy.edges().length'),run('state.shard.edges.length'));
  run('state.cy.destroy()');
});

test('direct references to expanded owners attach to the labelled boundary, not an empty centre',()=>{
  const {run}=inspectionViewer(true);
  try{
    run(`fixture.edges.push({id:'direct',source:'app.core',target:'app.web',type:'imports',status:'declared'},
      {id:'reverse',source:'app.web',target:'app.core',type:'imports',status:'declared'});
      state.universe=new Universe(fixture);state.universe.place({},'auto');
      state.universe.expanded.add('app.core');refreshMap();`);
    for(const end of ['source','target']){
      const direct=run("state.cy.edges().filter(e=>e.data('"+end+"')==='app.core')");
      assert.ok(direct.length,'fixture needs a genuine direct owner reference');
      for(const edge of direct){
        assert.ok(edge.hasClass(end+'-expanded'));
        assert.equal(edge.style(end+'-endpoint'),'0% -50%');
      }
    }
    run(`state.universe.expanded.delete('app.core');refreshMap();`);
    assert.equal(run("state.cy.edges('.source-expanded,.target-expanded').length"),0);
  }finally{run('state.cy.destroy()');}
});

test('saved spatial overlap labels a foreign sibling without changing ownership or positions',()=>{
  const {run}=inspectionViewer(true);
  try{
    run(`state.universe.reveal('app.core.db');state.universe.expanded.add('app.core');
      const p=state.universe.positions.get('app.core.db');state.universe.positions.set('app.web',{...p});
      state.universe.indexPositions();globalThis.before=JSON.stringify([...state.universe.positions]);refreshMap();`);
    assert.equal(run("state.cy.getElementById('app.web').hasClass('overlapping-context')"),true);
    assert.match(run("state.cy.getElementById('app.web').data('displayName')"),/From /);
    assert.equal(run("state.universe.contains('app.core','app.web')"),false);
    assert.equal(run('JSON.stringify([...state.universe.positions])'),run('before'));
    run(`state.universe.positions.set('app.web',{x:9999,y:9999});state.universe.indexPositions();refreshMap();`);
    assert.equal(run("state.cy.getElementById('app.web').hasClass('overlapping-context')"),false);
  }finally{run('state.cy.destroy()');}
});

test('scoped file arrangement requires confirmation and persists only real contained pins',async()=>{
  const {run,context}=inspectionViewer();
  context.surface=JSON.parse(require('node:fs').readFileSync(require.resolve('../fixtures/source-surface.graph.json'),'utf8'));
  context.surface.files=[{owner:context.surface.nodes.findIndex(n=>n.id==='module'),root:'project',path:'Source/Sample/Public/API.h',
    declarations:[],definitions:[],partition:{id:'public',label:'Public headers',collapsed:false,folders:[]}}];
  const writes=[];context.fetch=async(url,options)=>{writes.push(JSON.parse(options.body));return{ok:true,text:async()=>''};};
  try{
    run(`state.universe=new Universe(surface);state.universe.place({},'auto');
      state.scopeShard={scope:'module',title:'Module',parents:[]};
      state.positionCache=new PositionCache('/layout/sample/entry.json',{auto:{unavailable:{x:5,y:6},peer:{x:400,y:500}}});
      globalThis.confirm=()=>false;globalThis.before=JSON.stringify([...state.universe.positions]);`);
    await run('arrangeSourceFiles()');
    assert.equal(writes.length,0);assert.equal(run('JSON.stringify([...state.universe.positions])'),run('before'));
    run('globalThis.confirm=()=>true;globalThis.frameNode=()=>{};');
    await run('arrangeSourceFiles()');
    assert.equal(writes.length,1);
    assert.ok(Object.keys(writes[0].positions).every(id=>context.surface.nodes.some(n=>n.id===id)&&id!=='module'&&id!=='peer'));
    assert.equal(run('state.positionCache.layouts.auto.unavailable.x'),5);
    assert.equal(run('state.positionCache.layouts.auto.peer.x'),400);
  }finally{run('state.cy.destroy()');}
});
