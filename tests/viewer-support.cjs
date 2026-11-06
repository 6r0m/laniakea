// SPDX-License-Identifier: AGPL-3.0-or-later
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function viewer() {
  const elements = new Map();
  const context = vm.createContext({ console, Set, Map, URL, URLSearchParams, TextEncoder, AbortController, DOMException, setTimeout, clearTimeout,
    document: { body: {}, getElementById: id => {
      if (!elements.has(id)) elements.set(id, { value: '', textContent: '', hidden: true, setAttribute() {},
        append(){},replaceChildren(){},classList:{add(){},remove(){}} });
      return elements.get(id);
    } }, location: { hash: '' }, history: { pushState() {}, replaceState() {} },
    localStorage: { setItem() {}, getItem() { return null; } }, innerWidth: 1280,
  });
  const source = fs.readFileSync(path.join(__dirname, '../viewer/app.js'), 'utf8');
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../viewer/vendor/cytoscape.min.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../viewer/vendor/flatbush.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../viewer/universe.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../viewer/traces.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../viewer/map.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../viewer/scene.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../viewer/positions.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../viewer/references.js'), 'utf8'), context);
  vm.runInContext(source.slice(0, source.lastIndexOf('start().catch')), context);
  vm.runInContext(`
    globalThis.realRenderDetails = renderDetails;
    globalThis.realRenderBanner = renderBanner;
    globalThis.realRenderGraph=renderGraph;
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

function inspectionViewer(styleEnabled = false) {
  const instance = viewer();
  instance.run(`globalThis.css=()=>'#888888';state.cy=cytoscape({headless:true,elements:[],styleEnabled:${styleEnabled},style:style()});
    state.scopeShard={scope:'app',title:'Sample',parents:[]};state.index={nodes:[]};
    state.manifest={edge_types:[],sources:[]};state.target.roots={};
    state.universe.place({},'auto');globalThis.readableLabels=()=>{};
    // Headless renderer checks have no camera; viewport cuts have Universe and browser coverage.
    globalThis.viewportCamera=()=>null;
    globalThis.el=()=>({append(){},setAttribute(){},insertBefore(){},remove(){}});
    globalThis.attributes=()=>{};globalThis.togglePanel=(name,open)=>$(name).hidden=!open;
    globalThis.renderDetails=realRenderDetails;refreshMap();`);
  return instance;
}

function treeElements(run) {
  run(`globalThis.el=(tag,text,attrs={})=>({tag,textContent:text||'',attrs,children:[],isConnected:true,
    append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},
    setAttribute(name,value){this.attrs[name]=value;},remove(){},
    querySelector(selector){return this.children.flatMap(function walk(n){return[n,...(n.children||[]).flatMap(walk)];})
      .find(n=>selector==='[data-action="toggle-group"]'&&n.attrs?.['data-action']==='toggle-group')||null;}});
    for(const id of ['details','banner']){const old=$(id);Object.assign(old,el('aside'));}
  `);
}

module.exports={viewer,inspectionViewer,treeElements};
