// SPDX-License-Identifier: AGPL-3.0-or-later
// Run with node --test tests/viewer.test.cjs; no npm packages required.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function viewer() {
  const elements = new Map();
  const context = vm.createContext({ console, Set, Map, URL, URLSearchParams, setTimeout, clearTimeout,
    document: { body: {}, getElementById: id => {
      if (!elements.has(id)) elements.set(id, { value: '', textContent: '', hidden: true, setAttribute() {},
        append(){},replaceChildren(){},classList:{add(){},remove(){}} });
      return elements.get(id);
    } }, location: { hash: '' }, history: { pushState() {}, replaceState() {} },
    localStorage: { setItem() {}, getItem() { return null; } }, innerWidth: 1280,
  });
  const source = fs.readFileSync(path.join(__dirname, '../viewer/app.js'), 'utf8');
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../viewer/vendor/cytoscape.min.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../viewer/universe.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../viewer/map.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../viewer/scene.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../viewer/positions.js'), 'utf8'), context);
  vm.runInContext(source.slice(0, source.lastIndexOf('start().catch')), context);
  vm.runInContext(`
    globalThis.realRenderDetails = renderDetails;
    for (const name of ['renderBanner','renderCoverage','renderCrumbs','renderFilters','renderGraph','renderDetails']) {
      globalThis[name] = () => {};
    }
    state.targets = [{id:'sample', project:'SampleProject'}];
    state.target = state.targets[0]; state.manifest = {entry:'entry.json'};
    state.shard = {title:'old'}; state.file = 'old.json';
    globalThis.realLoadPositionCache = loadPositionCache;
    globalThis.loadPositionCache = async () => null;
  `, context);
  context.fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/generic.graph.json'), 'utf8'));
  vm.runInContext('state.universe=new Universe(fixture);',context);
  return { context, run: source => vm.runInContext(source, context) };
}

function inspectionViewer() {
  const instance = viewer();
  instance.run(`state.cy=cytoscape({headless:true,elements:[]});
    state.scopeShard={scope:'app',title:'Sample',parents:[]};state.index={nodes:[]};
    state.manifest={edge_types:[],sources:[]};state.target.roots={};
    state.universe.place({},'auto');globalThis.readableLabels=()=>{};
    globalThis.el=()=>({append(){},setAttribute(){}});
    globalThis.attributes=()=>{};globalThis.togglePanel=(name,open)=>$(name).hidden=!open;
    globalThis.renderDetails=realRenderDetails;refreshMap();`);
  return instance;
}

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
  const newer = run("show('sample','newer.json','push')");
  pending['newer.json']('newer'); await newer;
  pending['older.json']('older'); await older;
  assert.equal(run('state.file'), 'newer.json');
  assert.equal(run('state.shard.title'), 'newer');
});

test('a removed bookmark falls back to the entry only on HTTP 404', async () => {
  const { context, run } = viewer();
  context.fetch = async url => url.endsWith('missing.json') ? {ok:false,status:404}
    : {ok:true,json:async()=>({title:'entry',scope:'app'})};
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

test('map captions and grouping follow canonical kinds and direct child counts', () => {
  const { run } = viewer();
  run("state.index={nodes:[{id:'group',child_count:3},{id:'leaf',child_count:0}]};");
  const group=run("mapNode({id:'group',label:'Sample',level:'package'},new Set(['group']),{group:'group.json'})");
  const leaf=run("mapNode({id:'leaf',label:'Sample',level:'module'},new Set(['leaf']),{leaf:'leaf.json'})");
  assert.equal(group.data.caption, 'Sample\npackage / 3 inside');
  assert.ok(group.classes.split(' ').includes('group'));
  assert.equal(leaf.data.caption, 'Sample\nmodule');
  assert.ok(!leaf.classes.split(' ').includes('group'));
  assert.equal(leaf.data.id, 'leaf', 'presentation must retain saved-position identity');
  assert.equal(run("nodeDescription({id:'external',level:'library',boundary:true})"),'library / external');
  const neighbour=run("mapNode({id:'leaf',label:'Neighbour',level:'module'},new Set(),{},true)");
  assert.equal(neighbour.data.caption,'Neighbour');
  const container=run("mapNode({id:'group',label:'Sample',level:'package'},new Set(),{},true)");
  assert.equal(container.data.caption,'Sample\npackage / 3 inside');
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
