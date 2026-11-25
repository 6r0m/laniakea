// SPDX-License-Identifier: AGPL-3.0-or-later
// Static appearance ownership, theme semantics, and native style-property validity.
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const cssText=fs.readFileSync(path.join(root,'viewer/app.css'),'utf8');
const html=fs.readFileSync(path.join(root,'viewer/index.html'),'utf8');
const support=fs.readFileSync(path.join(root,'tests/viewer-support.cjs'),'utf8');
const appearanceSource=fs.readFileSync(path.join(root,'viewer/appearance.js'),'utf8');
const mapSource=fs.readFileSync(path.join(root,'viewer/map.js'),'utf8');

function themeBlocks(){
  const light=cssText.match(/^:root\s*\{([^}]*)\}/m)?.[1];
  const dark=cssText.match(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/)?.[1];
  assert.ok(light&&dark,'Expected one light and one dark :root token block');
  return [light,dark];
}
function tokens(block){
  return Object.fromEntries([...block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)].map(match=>[match[1],match[2].trim()]));
}
function rgb(value){
  const match=value.match(/^#([0-9a-f]{6})$/i);
  assert.ok(match,`Expected a six-digit hex color, got ${value}`);
  return [1,3,5].map(index=>parseInt(match[1].slice(index-1,index+1),16));
}
function hue(value){
  const [r,g,b]=rgb(value).map(channel=>channel/255),max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
  if(!delta)return 0;
  let result=max===r?((g-b)/delta)%6:max===g?(b-r)/delta+2:(r-g)/delta+4;
  return (result*60+360)%360;
}
function luminance(value){
  return rgb(value).map(channel=>channel/255).map(channel=>channel<=0.04045?channel/12.92:((channel+0.055)/1.055)**2.4)
    .reduce((sum,channel,index)=>sum+channel*[0.2126,0.7152,0.0722][index],0);
}
function contrast(a,b){const first=luminance(a),second=luminance(b);
  return (Math.max(first,second)+0.05)/(Math.min(first,second)+0.05);}
function styleRules(){
  const values={};for(const block of themeBlocks())Object.assign(values,tokens(block));
  const context={css:name=>values[name]||'#888888'};vm.createContext(context);
  vm.runInContext(appearanceSource,context);
  return context.style();
}
function cytoscape(){return require('../viewer/vendor/cytoscape.min.js');}

test('static Cytoscape appearance has one owner loaded before map.js',()=>{
  assert.match(appearanceSource,/function style\(\)/);
  assert.doesNotMatch(mapSource,/function style\(\)/,'map.js must not own the static stylesheet');
  const appearanceAt=html.indexOf('src="appearance.js"'),mapAt=html.indexOf('src="map.js"');
  assert.ok(appearanceAt>=0&&mapAt>appearanceAt,'index.html must load appearance.js before map.js');
  const supportAppearance=support.indexOf("viewer/appearance.js"),supportMap=support.indexOf("viewer/map.js");
  assert.ok(supportAppearance>=0&&supportMap>supportAppearance,'Node fixtures must load appearance.js before map.js');
});

test('wire pulse admits visible active findings with priority for violations',()=>{
  const edges=new Map(),links=new Map();
  function add(id,severity,{acknowledged=false,visible=true,box={x1:-30,x2:130,y1:45,y2:55}}={}){
    edges.set('view:'+id,{id,length:1,visible:()=>visible,renderedBoundingBox:()=>box,
      hasClass:kind=>kind==='review-'+severity});
    links.set(id,new Map([[id,{severity,acknowledged}]]));
  }
  add('acknowledged','violation',{acknowledged:true});
  add('hidden','violation',{visible:false});
  add('offscreen','violation',{box:{x1:110,x2:140,y1:45,y2:55}});
  for(let i=0;i<16;i++)add('candidate-'+i,'candidate');
  add('crossing','violation');
  const context={state:{universe:{renderPrefix:'view:'},review:{links}}};
  vm.createContext(context);
  vm.runInContext(appearanceSource,context);
  const targets=context.reviewWireTargets({width:()=>100,height:()=>100,getElementById:id=>edges.get(id)});
  assert.deepEqual(Array.from(targets,edge=>edge.id),['crossing',...Array.from({length:15},(_,i)=>'candidate-'+i)]);
});

test('light and dark themes define atmosphere and distinct warning/selection roles',()=>{
  const [light,dark]=themeBlocks().map(tokens);
  for(const [theme,values] of [['light',light],['dark',dark]]){
    for(const name of ['--map-atmosphere-core','--map-atmosphere-edge','--selection','--review-candidate','--review-violation','--bg']){
      assert.ok(values[name],`${theme} theme is missing ${name}`);
    }
    assert.ok(contrast(values['--selection'],values['--bg'])>=3,
      `${theme} selection must meet non-text contrast against the map background`);
    for(const role of ['--review-candidate','--review-violation']){
      const separation=Math.abs(hue(values['--selection'])-hue(values[role]));
      assert.ok(Math.min(separation,360-separation)>=60,
        `${theme} selection and ${role} must occupy different hue families`);
    }
  }
});

test('every Cytoscape style property is valid in the pinned renderer',()=>{
  const renderer=cytoscape()({headless:true,styleEnabled:true,elements:[]});
  try{
    const names=new Set(renderer.style().properties.map(property=>property.name));
    for(const rule of styleRules()){
      assert.equal(typeof rule.selector,'string');
      for(const property of Object.keys(rule.style||{})){
        assert.ok(names.has(property),`Unknown Cytoscape style property: ${property}`);
      }
    }
  }finally{renderer.destroy();}
});

test('architectural colors follow canonical branches across kinds, source regions and projection changes',()=>{
  const {viewer}=require('./viewer-support.cjs');
  const {run,context}=viewer();
  context.source=JSON.parse(fs.readFileSync(path.join(root,'fixtures/source-surface.graph.json'),'utf8'));
  const proof=JSON.parse(run(`
    const branches=Array.from({length:17},(_,i)=>({
      id:'branch-'+String(i).padStart(2,'0'),label:'Repeated label',parent:'root',
      level:i%2?'plugin':'class',boundary:false,status:'in-target'
    }));
    const visibleRole=id=>{
      const element=mapNode(state.universe.nodes.get(id),new Set(),{});
      return {family:element.data.starFamily,glyph:element.data.iconKind};
    };
    const graph={...source,nodes:[...branches,...source.nodes.map(n=>{
      if(n.id==='root')return {...n,attrs:{source_sections:true}};
      if(n.id==='module')return {...n,attrs:{...n.attrs,source_partition:{
        id:'internal',label:'Internal sources',collapsed:true,folders:[]
      }}};
      return n;
    }),{id:'external',parent:null,label:'Dependency',level:'project',boundary:true,status:'in-target'}]};
    state.universe=new Universe(graph);
    const branchRoles=branches.map(n=>visibleRole(n.id).family);
    const sourceIds=[...state.universe.nodes.values()].filter(n=>n.attrs?.source_owner==='module').map(n=>n.id);
    const scopeIds=['module','class','method',...sourceIds];
    const scoped=scopeIds.map(visibleRole);
    const external=visibleRole('external');
    state.universe.reveal('method');
    const expanded=scopeIds.map(visibleRole);
    state.universe=new Universe({...graph,nodes:[...graph.nodes].reverse()});
    JSON.stringify({branchRoles,scoped,external,expanded,reordered:branches.map(n=>visibleRole(n.id).family)});
  `));
  assert.equal(new Set(proof.branchRoles.slice(0,16)).size,16,'Each branch gets an unused color first');
  assert.equal(proof.branchRoles[16],proof.branchRoles[0],'Reuse starts after the palette is exhausted');
  assert.deepEqual(proof.reordered,proof.branchRoles,'Input order must not reorder family colors');
  assert.deepEqual(proof.expanded,proof.scoped,'Navigation must not reassign owner colors');
  assert.equal(new Set(proof.scoped.map(node=>node.family)).size,1,'Files, types and callables inherit their owner color');
  const glyphs=new Set(proof.scoped.map(node=>node.glyph));
  for(const glyph of ['module','class','function','file','section'])assert.ok(glyphs.has(glyph),`Missing ${glyph} glyph`);
  assert.equal(proof.external.family,'external');
});

test('all ownership tokens are distinct and contrast with both themes of the map',()=>{
  for(const block of themeBlocks()){
    const values=tokens(block);
    const palette=Object.entries(values).filter(([name])=>name.startsWith('--star-family-'));
    assert.equal(palette.length,16);
    assert.equal(new Set(palette.map(([,value])=>value)).size,16);
    const backgrounds=['--bg','--map-atmosphere-core','--map-atmosphere-edge','--map-atmosphere-accent'];
    for(const [name,color] of palette)for(const background of backgrounds)
      assert.ok(contrast(color,values[background])>=3,`${name} loses contrast against ${background}`);
  }
});

test('expanded containers never receive the selected underlay glow',()=>{
  const cy=cytoscape()({headless:true,styleEnabled:true,elements:[
    {group:'nodes',data:{id:'expanded',caption:'Expanded',spanX:120,spanY:80,layer:2},classes:'expanded member'},
    {group:'nodes',data:{id:'ordinary',caption:'Ordinary'},classes:'member'}]});
  try{
    cy.style(styleRules());
    const expanded=cy.getElementById('expanded').select();
    const ordinary=cy.getElementById('ordinary').select();
    assert.equal(Number(expanded.style('underlay-opacity')),0,'Expanded containers must keep underlay opacity zero');
    assert.ok(Number(ordinary.style('underlay-opacity'))>0.08,
      'Selected ordinary nodes need a stronger underlay than the idle member glow');
  }finally{cy.destroy();}
});

test('connection paint follows displayed endpoint families and yields to directional tracing',()=>{
  const {run,context}=require('./viewer-support.cjs').inspectionViewer(true);
  context.darkTokens=tokens(themeBlocks()[1]);
  try{
    const proof=JSON.parse(run(`
      globalThis.css=name=>darkTokens[name]||'#888888';
      state.cy.style(style());
      const edge=state.cy.edges().find(e=>e.source().data('starFamily')!==e.target().data('starFamily')&&!e.isLoop());
      const palette=starPalette().stars;
      const source=palette[edge.source().data('starFamily')],target=palette[edge.target().data('starFamily')];
      const rgb=color=>color.match(/[a-f0-9]{2}/gi).map(pair=>parseInt(pair,16));
      const idle=edge.style('line-fill'),stops=edge.pstyle('line-gradient-stop-colors').value.map(channels=>channels.slice(0,3));
      edge.addClass('trace-outgoing');
      const trace=edge.style('line-fill'),traceOpacity=Number(edge.style('line-opacity')),
        traceWidth=parseFloat(edge.style('width')),arrow=edge.style('target-arrow-color');
      edge.select();
      JSON.stringify({idle,stops,ends:[source,target].map(rgb),background:rgb(darkTokens['--map-atmosphere-core']),
        trace,traceOpacity,traceWidth,arrow,traceTint:rgb(darkTokens['--trace-outgoing']),
        selected:edge.style('line-fill'),selectedOpacity:Number(edge.style('line-opacity')),
        selectedStops:edge.pstyle('line-gradient-stop-colors').value.map(channels=>channels.slice(0,3))});
    `));
    assert.equal(proof.idle,'linear-gradient');
    assert.notDeepEqual(proof.ends[0],proof.ends[1]);
    assert.deepEqual([proof.stops[0],proof.stops.at(-1)],proof.ends);
    const distance=(a,b)=>a.reduce((sum,value,i)=>sum+Math.abs(value-b[i]),0);
    assert.ok(distance(proof.stops[1],proof.background)<distance(proof.ends[0],proof.background));
    assert.ok(distance(proof.stops[2],proof.background)<distance(proof.ends[1],proof.background));
    assert.equal(proof.trace,'linear-gradient');
    assert.ok(proof.traceOpacity>0&&proof.traceOpacity<1);
    assert.ok(proof.traceWidth<2,'Focused trace should stay thin enough to separate the moving signal from its track');
    assert.equal(proof.selected,'linear-gradient');
    assert.ok(proof.selectedOpacity>proof.traceOpacity);
    assert.deepEqual(proof.selectedStops,proof.stops);
    assert.deepEqual(proof.arrow.match(/\d+/g).map(Number),proof.traceTint);
  }finally{run('state.cy.destroy()');}
});
