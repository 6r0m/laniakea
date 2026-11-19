// SPDX-License-Identifier: AGPL-3.0-or-later
const {test}=require('node:test'),assert=require('node:assert/strict');
const {checksSummary}=require('../viewer/analysis.js');

test('input changes belong to the displayed checkpoint and never imply an architecture error',()=>{
  const {inputChangeSummary}=require('../viewer/analysis.js');
  assert.equal(typeof inputChangeSummary,'function','missing change presentation');
  const target={id:'sample',run:'old'},comparison={baseline:'old',observation:'a',status:'current',total:2,
    counts:{Headers:2},scope:{source:{status:'compared'}},complete:true,context:'changed'};
  const shown=inputChangeSummary({comparison},target);
  assert.match(shown.label,/changes detected/i);assert.equal(shown.available,true);
  assert.equal(inputChangeSummary({comparison:{...comparison,baseline:'new'}},target).available,false);
  assert.match(inputChangeSummary({comparison:{...comparison,status:'paused'}},target).label,/paused/i);
});

test('a missing input baseline and a known empty scoped comparison remain different',()=>{
  const {inputChangeSummary}=require('../viewer/analysis.js');
  assert.equal(typeof inputChangeSummary,'function','missing change presentation');
  const target={id:'sample',run:'old'};
  assert.match(inputChangeSummary(null,target).label,/not available|not checked/i);
  const empty={baseline:'old',status:'current',total:0,context:'unchanged',scope:{build:{status:'compared'},source:{status:'not-monitored'}}};
  const shown=inputChangeSummary({comparison:empty},target);
  assert.match(shown.label,/limited scope/i);assert.match(shown.detail,/not monitored/i);
  const unknown=inputChangeSummary({comparison:{...empty,scope:{build:{status:'unavailable'}}}},target);
  assert.equal(unknown.available,false);assert.match(unknown.label,/not available/i);
});

test('late check settings responses cannot change another target form or status',async()=>{
  const {AnalysisControls}=require('../viewer/analysis.js'),previous=global.state;
  const control=Object.create(AnalysisControls.prototype);control.render=()=>{};
  let resolve;global.state={target:{id:'first'},live:{request:()=>new Promise(r=>resolve=r),status:'original'}};
  try{
    const pending=control.request({action:'checks'});
    global.state.target={id:'second'};control.edited=true;control.error='second target';
    resolve({targets:[{id:'first'}]});await pending;
    assert.equal(global.state.live.status,'original');assert.equal(control.edited,true);assert.equal(control.error,'second target');
  }finally{global.state=previous;}
});

test('check coverage keeps unavailable and skipped acquisition distinct from successful evidence',()=>{
  const target={checks:[{label:'Modules',status:'completed'},{label:'C++',status:'unavailable'},{label:'Clones',status:'disabled'}]};
  const value=checksSummary(null,target);
  assert.equal(value.label,'Checks: 1 recorded / 1 off / 1 unavailable');assert.equal(value.attention,true);
  assert.match(value.description,/C\+\+: unavailable/);assert.match(value.description,/Clones: disabled/);
});

test('Off is guidance rather than failure and recorded counts remain explicit',()=>{
  const value=checksSummary({active:true,state:'fresh'},{checks:[{status:'completed'},{status:'disabled'},{status:'disabled'}]});
  assert.equal(value.label,'Checks: 1 recorded / 2 off');assert.equal(value.compact,'Checks: 2 off');
  assert.equal(value.attention,false);assert.equal(value.guidance,true);
});

function guidanceFixture(){
  const {viewer,treeElements}=require('./viewer-support.cjs'),v=viewer(),stored=new Map();treeElements(v.run);
  v.context.localStorage={getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)};
  v.run(`document.querySelectorAll=()=>[];state.cy={};state.startup={monitoring:true};state.live={};
    state.target={id:'sample',run:'recorded',roots:{project:'sample-root'},checks:[
      {id:'foundation',label:'Modules',status:'completed'},
      {id:'native',label:'C++ references',status:'disabled'},
      {id:'duplication',label:'Duplication',status:'disabled'}]};
    state.review={saving:false,panel(open){$('review').hidden=!open;}};
    globalThis.status={targets:[{id:'sample',active:true,state:'fresh',ready:state.target}]};
    globalThis.control=Object.create(AnalysisControls.prototype);control.dismissed=new Set();control.choices={};
    control.build=()=>{};control.renderChanges=()=>{};state.analysis=control;
    $('view-controls').open=false;$('analysis').contains=()=>false;`);
  return {...v,stored};
}

test('the Off guide appears once, survives reload and is isolated by project rather than run',()=>{
  const {run,stored}=guidanceFixture();run('control.render(status)');
  assert.equal(run("$('analysis').hidden"),false);assert.equal(stored.size,1);
  run(`$('analysis').hidden=true;state.target.run='another-run';
    control=Object.create(AnalysisControls.prototype);control.dismissed=new Set();control.choices={};
    control.build=()=>{};control.renderChanges=()=>{};state.analysis=control;control.render(status);`);
  assert.equal(run("$('analysis').hidden"),true,'Reload repeated a handled introduction');
  run("state.target.roots.project='another-project';control.render(status)");
  assert.equal(run("$('analysis').hidden"),false,'A different project inherited handled state');
});

test('quiet metadata and a hidden coordination close do not consume later attention',()=>{
  const {run,stored}=guidanceFixture();
  run("state.target.checks=state.target.checks.slice(0,1);control.panel(false);control.render(status)");
  assert.equal(stored.size,0);assert.equal(run("$('analysis').hidden"),true);
  run("status.targets[0].error='Synthetic later failure';control.render(status)");
  assert.equal(run("$('analysis').hidden"),false,'Quiet first status consumed the opening');
});

test('automatic guidance yields to reading panels, View and keyboard focus but manual Checks still opens',()=>{
  for(const id of ['review','details','filters','view-controls','keyboard']){
    const {run,stored}=guidanceFixture();
    run(id==='view-controls'?"$('view-controls').open=true":id==='keyboard'?
      "document.activeElement={closest:()=>({})}":`$('${id}').hidden=false`);
    run('control.render(status)');
    assert.equal(run("$('analysis').hidden"),true,`${id} was displaced`);assert.equal(stored.size,0);
    run(id==='view-controls'?"$('view-controls').open=false":id==='keyboard'?
      'document.activeElement=null':`$('${id}').hidden=true`);
    run('control.render(status)');assert.equal(run("$('analysis').hidden"),false,'Deferred guidance was lost');
  }
  const {run}=guidanceFixture();run("innerWidth=390;$('review').hidden=false;$('details').hidden=false;control.panel(true)");
  assert.equal(run("$('review').hidden"),true);assert.equal(run("$('details').hidden"),true);
});

test('storage refusal retains a session guard and handled guidance never suppresses later failures',()=>{
  const {run,context}=guidanceFixture();context.localStorage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
  run('control.render(status)');assert.equal(run("$('analysis').hidden"),false);
  run("$('analysis').hidden=true;status.targets[0].error='Synthetic later failure';control.render(status)");
  assert.equal(run("$('analysis').hidden"),true,'Failure repeated the introduction');
  assert.equal(run("$('checks-label-wide').textContent"),'Checks: failed');
  assert.match(run("$('analysis-error').textContent"),/Synthetic later failure/);
});

test('hidden status cannot present or acknowledge guidance before actual visibility',()=>{
  const {run,stored}=guidanceFixture();
  run('document.hidden=true;control.render(status)');
  assert.equal(run("$('analysis').hidden"),true,'Background status opened unseen guidance');
  assert.equal(stored.size,0,'Background status consumed the introduction');
  run('document.hidden=false;control.render(status)');
  assert.equal(run("$('analysis').hidden"),false);assert.equal(stored.size,1);
  const pending=guidanceFixture();
  pending.run("control.panel(true);document.hidden=true;control.render(status)");
  assert.equal(pending.stored.size,0,'A panel opened before coverage acknowledged it while hidden');
  pending.run('document.hidden=false;control.render(status)');assert.equal(pending.stored.size,1);
});

test('focused graph defers automatic guidance without disabling manual Checks',()=>{
  const {run,stored}=guidanceFixture();
  run("document.activeElement=$('graph');control.render(status)");
  assert.equal(run("$('analysis').hidden"),true,'Guidance interrupted graph keyboard focus');
  assert.equal(stored.size,0);assert.equal(run("document.activeElement===$('graph')"),true);
  run('document.activeElement=null;control.render(status)');
  assert.equal(run("$('analysis').hidden"),false,'Graph focus consumed deferred guidance');
  const manual=guidanceFixture();manual.run("document.activeElement=$('graph');control.panel(true)");
  assert.equal(manual.run("$('analysis').hidden"),false,'Graph focus blocked explicit Checks');
});

test('a newer ready snapshot cannot supply displayed check counts',()=>{
  const displayed={checks:[{id:'native',label:'C++',status:'incomplete'}]},
    ready={checks:[{id:'native',label:'C++',status:'completed'}]};
  const summary=checksSummary({active:true,state:'fresh',checks:ready.checks,ready},displayed);
  assert.equal(summary.done,0);assert.match(summary.description,/C\+\+: incomplete/);
});

test('an old complete map cannot disguise running or failed new work as completed checks',()=>{
  const target={checks:[{label:'Modules',status:'completed'}]};
  assert.equal(checksSummary({active:true,state:'updating'},target).label,'Checks: running');
  assert.equal(checksSummary({active:false,state:'stopping'},target).label,'Checks: stopping');
  assert.equal(checksSummary({active:true,state:'failed',error:'compiler error'},target).label,'Checks: failed');
  const degraded=checksSummary({active:true,state:'fresh',degraded:'Source watch failed'},target);
  assert.equal(degraded.attention,true);assert.match(degraded.description,/Source watch failed/);
});

test('a profile without a catalog never invents completed checks and generic acquisition errors remain visible',()=>{
  assert.equal(checksSummary(null,{}).label,'Checks: unavailable');
  assert.equal(checksSummary(null,{acquisition:{source:{status:'failed',code:'tool_invalid'}}}).label,'Checks: failed');
});
