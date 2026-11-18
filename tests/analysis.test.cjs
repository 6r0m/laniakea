// SPDX-License-Identifier: AGPL-3.0-or-later
const {test}=require('node:test'),assert=require('node:assert/strict');
const {checksSummary}=require('../viewer/analysis.js');

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
  assert.equal(value.label,'Checks: 1/3');assert.equal(value.attention,true);
  assert.match(value.description,/C\+\+: unavailable/);assert.match(value.description,/Clones: disabled/);
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
