// SPDX-License-Identifier: AGPL-3.0-or-later
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const {viewer}=require('./viewer-support.cjs');
function fixture(){
  const v=viewer();
  v.context.crypto=require('node:crypto').webcrypto;
  v.run(`document.querySelectorAll=()=>[];state.review={};state.cy={};state.positionCache={revision:0};
    state.scopeShard={scope:state.universe.root};
    globalThis.live=new LiveUpdates();globalThis.layouts=unsavedPositionCaches;`);
  return v;
}

test('native checkpoint styles retain functions without freezing stylesheet interaction',()=>{
  const renderer=require('../viewer/vendor/cytoscape.min.js')({headless:true,styleEnabled:true,
    elements:[{data:{id:'sample',size:24,ink:'#112233'}}],
    style:[{selector:'node',style:{opacity:1}},{selector:'.marked',style:{opacity:0.5}}]});
  try{
    const node=renderer.nodes();node.style({width:n=>n.data('size'),'background-color':n=>n.data('ink')});
    const {context,run}=fixture();context.renderer=renderer;
    const [[id,overrides]]=run('renderedOverrides(renderer)');assert.equal(id,'sample');
    assert.equal(overrides.opacity,undefined);assert.equal(typeof overrides.width,'function');
    node.style({width:100,opacity:0.1});node.removeStyle().style(Object.fromEntries(Object.entries(overrides)));
    node.data({size:48,ink:'#334455'}).addClass('marked');
    node.style(Object.fromEntries(Object.entries(overrides)));
    assert.equal(node.width(),48);assert.equal(node.style('background-color'),'rgb(51,68,85)');
    assert.equal(node.style('opacity'),'0.5');
  }finally{renderer.destroy();}
});
test('live adoption waits for gestures, unsaved positions and Review decisions',()=>{
  const {run}=fixture();
  assert.equal(run('liveBlockReason()'),'');
  for(const flag of ['drag','labelDrag','pointerDown','gestureActive','wheel','zoomFrame','viewportFrame']){
    run(`state.${flag}=true`);assert.notEqual(run('liveBlockReason()'),'');run(`state.${flag}=false`);
  }
  run('layouts.add({})');assert.match(run('liveBlockReason()'),/position/);run('layouts.clear()');
  run('state.review.saving=1');assert.match(run('liveBlockReason()'),/decision/);
  run('state.review.saving=0;document.querySelectorAll=()=>[{value:"draft",defaultValue:""}]');
  assert.match(run('liveBlockReason()'),/decision/);
});
test('removed focus falls back through its recorded ancestors',()=>{
  const {run}=fixture();
  run(`globalThis.old=state.universe;globalThis.next={nodes:new Map([['app',{}]]),root:'app'};`);
  assert.equal(run("liveScope(next,old,'app.core')"),'app');
});

test('reading source comparison defers adoption without changing the displayed map',()=>{
  const {run}=fixture();const before=run('state.universe');
  run('state.review.comparison={}');assert.match(run('liveBlockReason()'),/Comparing/);
  assert.equal(run('state.universe'),before);run('state.review.comparison=null');assert.equal(run('liveBlockReason()'),'');
});

test('a navigation or position change during staging cannot commit the obsolete copy',async()=>{
  for(const change of ['state.navigation++','state.positionCache.revision++']){
    const {run,context}=fixture();let release;
    context.getReady=async()=>({targets:[{id:'sample',ready:{id:'sample',run:'next'}}]});
    context.waitStage=()=>new Promise(resolve=>{release=resolve;});
    run(`state.positionCache={revision:0};globalThis.getJson=getReady;live.stage=waitStage;
      live.render=()=>{};live.adopt=()=>{throw Error('obsolete adoption');};globalThis.work=live.tick();`);
    await new Promise(resolve=>setImmediate(resolve));run(change);release({target:{id:'sample',run:'next'}});
    await run('work');run('live.stop()');
    assert.equal(run('state.target.run'),undefined);
    assert.equal(run('live.message'),'');
  }
});

test('invalid staged data keeps the old map and does not loop on the same ready generation',async()=>{
  const {run,context}=fixture();let attempts=0;
  context.getReady=async()=>({targets:[{id:'sample',ready:{id:'sample',run:'next'}}]});
  context.failStage=async()=>{attempts++;throw Error('invalid topology');};
  run('globalThis.getJson=getReady;live.stage=failStage;live.render=()=>{};');
  const before=run('state.universe');await run('live.tick()');await run('live.tick()');run('live.stop()');
  assert.equal(attempts,1);assert.equal(run('state.universe'),before);
  assert.match(run('live.message'),/invalid topology/);
});

test('source acquisition failure stays visible even with the live controls closed',()=>{
  const {run}=fixture();
  run(`state.startup={monitoring:true};live.status={targets:[{id:'sample',active:true,state:'fresh',
    ready:{run:'next',acquisition:{clones:{status:'failed',code:'provider_exit'}}}}]};live.render();`);
  const summary=run('checksSummary(live.status.targets[0],live.status.targets[0].ready)');
  assert.equal(summary.phase,'Failed');assert.match(summary.description,/provider_exit/);
});

test('validated unchanged topology reuses geometry while changed facts stage a new universe',async()=>{
  const {run,context}=fixture();const requests=[];
  context.getData=async url=>{requests.push(url);return url.endsWith('manifest.json')?
    {run:'next'}:url.endsWith('index.json')?{nodes:[]}:{};};
  run(`globalThis.getJson=getData;state.target.map_identity='same';
    globalThis.target={id:'sample',run:'next',map_identity:'same',data_url:'/snapshot/sample/next/data/',
      map_url:'/snapshot/sample/next/map/topology.json',layout_url:'/snapshot/sample/next/layout/'};`);
  const prepared=await run('live.stage(target)');
  assert.equal(prepared.universe,run('state.universe'));assert.equal(requests.some(u=>u.endsWith('topology.json')),false);
  context.getData=async url=>url.endsWith('manifest.json')?{run:'next'}:
    url.endsWith('index.json')?{nodes:[]}:url.endsWith('topology.json')?context.fixture:{};
  run("globalThis.getJson=getData;target.map_identity='changed'");
  const changed=await run('live.stage(target)');assert.notEqual(changed.universe,run('state.universe'));
});

test('regenerating an index for the same run still replaces its browser readers',async()=>{
  const {run,context}=fixture();let applied=false;
  context.getReady=async()=>({targets:[{id:'sample',ready:{id:'sample',run:'same',map_identity:'new'}}]});
  context.applied=()=>{applied=true;};
  run(`state.target.run='same';state.target.map_identity='old';globalThis.getJson=getReady;live.render=()=>{};
    live.stage=async target=>({target});live.adopt=applied;`);
  await run('live.tick()');run('live.stop()');assert.equal(applied,true);
});
