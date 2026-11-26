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
  assert.equal(value.coverage,'1 recorded / 1 off / 1 unavailable');assert.equal(value.attention,true);
  assert.match(value.description,/C\+\+: unavailable/);assert.match(value.description,/Clones: disabled/);
});

test('Off is guidance rather than failure and recorded counts remain explicit',()=>{
  const value=checksSummary({active:true,state:'fresh'},{checks:[{status:'completed'},{status:'disabled'},{status:'disabled'}]});
  assert.equal(value.coverage,'1 recorded / 2 off');assert.equal(value.phase,'');
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
    $('view-controls').open=false;$('analysis').contains=()=>false;$('analysis-checks').querySelector=()=>null;
    for(const id of ['foundation','native','duplication'])Object.assign($('check-'+id+'-status'),el('strong'));
    Object.assign($('toggle-analysis'),el('button'));
    for(const id of ['analysis-meter','checks-meter']){Object.assign($(id),el('progress'));
      $(id).removeAttribute=function(name){delete this.attrs[name];};}`);
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
  for(const id of ['review','details','browse','filters','view-controls','keyboard']){
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
  assert.equal(run("$('checks-activity').textContent"),'Failed');
  assert.match(run("$('checks-coverage').textContent"),/1 recorded/);
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
  assert.equal(summary.done,0);assert.equal(summary.coverage,'0 recorded / 1 incomplete');
  assert.match(summary.description,/C\+\+: incomplete/);
});

test('an old complete map cannot disguise running or failed new work as completed checks',()=>{
  const target={checks:[{label:'Modules',status:'completed'}]};
  assert.equal(checksSummary({active:true,state:'updating'},target).phase,'Running');
  assert.equal(checksSummary({active:false,state:'stopping'},target).phase,'Stopping');
  const failed=checksSummary({active:true,state:'failed',error:'compiler error'},target);
  assert.equal(failed.phase,'Failed');assert.equal(failed.coverage,'1 recorded');
  const degraded=checksSummary({active:true,state:'fresh',degraded:'Source watch failed'},target);
  assert.equal(degraded.attention,true);assert.match(degraded.description,/Source watch failed/);
});

test('a profile without a catalog never invents completed checks and generic acquisition errors remain visible',()=>{
  assert.equal(checksSummary(null,{}).coverage,'Coverage unavailable');
  assert.equal(checksSummary(null,{acquisition:{source:{status:'failed',code:'tool_invalid'}}}).phase,'Failed');
  const {run}=guidanceFixture();run('state.target.checks=[];control.render(status)');
  assert.equal(run("$('analysis-current-title').textContent"),'Check coverage unavailable');
  assert.equal(run("$('analysis-recommended').disabled"),true);
});

test('current source work is prominent while displayed Off evidence stays unchanged',()=>{
  const {run}=guidanceFixture();
  run(`status.targets[0].state='updating';status.targets[0].progress={phase:'duplication',label:'Checking duplicated code',seconds:31};
    control.render(status);`);
  assert.equal(run("$('analysis-current-title').textContent"),'Checking duplicated code');
  assert.equal(run("$('analysis-meter').hidden"),false);
  assert.equal(run("$('analysis-meter').getAttribute('value')"),null,'CPD must not invent a percentage');
  assert.match(run("$('analysis-progress').textContent"),/31 s elapsed/);
  assert.match(run("$('checks-coverage').textContent"),/1 recorded.*off/i);
  assert.match(run("$('checks-activity').textContent"),/duplicated code/i);
  assert.match(run("$('toggle-analysis').getAttribute('aria-label')"),/Displayed map: 1 of .*Checking duplicated code/);
  assert.equal(run("$('check-native-status').textContent"),'Off');
  run("status.targets[0].progress={phase:'native',label:'Indexing C++ units',completed:3,total:8,seconds:44};control.render(status)");
  assert.equal(run("$('analysis-meter').getAttribute('value')"),'3');
  assert.equal(run("$('analysis-meter').getAttribute('max')"),'8');
  run('status.targets[0].progress.completed=9;control.render(status)');
  assert.equal(run("$('analysis-meter').getAttribute('value')"),null,'Invalid counts need an indeterminate bar');
});

test('retrying an old failed snapshot shows running work rather than a failed attempt',()=>{
  const value=checksSummary({active:true,state:'updating',progress:{phase:'native'}},{checks:[{status:'failed'}]});
  assert.equal(value.phase,'Running');
});

test('saved views offer check details without run controls, and live views avoid duplicate recheck actions',()=>{
  const {run}=guidanceFixture();
  run(`state.target.checks.forEach(row=>row.status='completed');
    state.startup.monitoring=false;control.render(null);`);
  assert.equal(run("$('analysis-recommended').hidden"),true);
  assert.equal(run("$('analysis-run').hidden"),true);
  assert.equal(run("$('analysis-settings').hidden"),true);
  run(`state.startup.monitoring=true;control.render(status);`);
  assert.equal(run("$('analysis-recommended').textContent"),'Recheck enabled checks');
  assert.equal(run("$('analysis-recommended').hidden"),false);
  assert.equal(run("$('analysis-run').hidden"),true);
  run(`control.edited=true;control.render(status);`);
  assert.equal(run("$('analysis-recommended').hidden"),true);
  assert.equal(run("$('analysis-run').hidden"),false);
  assert.equal(run("$('analysis-run').textContent"),'Apply and run');
  run(`control.edited=false;state.target.checks[1].status='disabled';control.render(status);`);
  assert.equal(run("$('analysis-recommended').textContent"),'Run recommended checks');
  assert.equal(run("$('analysis-run').hidden"),false);
  assert.equal(run("$('analysis-run').textContent"),'Recheck enabled checks');
});

test('current missing prerequisites have a visible explanation without changing displayed evidence',()=>{
  const {run}=guidanceFixture();
  run(`status.targets[0].checks=[{id:'native',label:'C++ references',status:'unavailable',detail:'A successful project build receipt is required.'}];
    control.render(status);`);
  assert.equal(run("$('analysis-current-title').textContent"),'Checks need setup');
  assert.match(run("$('analysis-status').textContent"),/successful project build receipt/);
  assert.equal(run("$('check-native-status').textContent"),'Off');
});

test('queued recheck explains owned earlier work without borrowing its native counts',()=>{
  const {run}=guidanceFixture();
  run(`status.targets[0].state='pending';status.targets[0].progress=null;
    status.targets[0].previous_work={label:'Recheck queued; earlier checks are still running',seconds:72};control.render(status);`);
  assert.equal(run("$('analysis-current-title').textContent"),'Recheck queued');
  assert.equal(run("$('analysis-meter').hidden"),false);
  assert.equal(run("$('analysis-meter').getAttribute('value')"),null);
  assert.match(run("$('analysis-status').textContent"),/Earlier checks are still running/);
  assert.match(run("$('analysis-progress').textContent"),/Earlier work: 1 min 12 s elapsed/);
  assert.equal(run("$('analysis-stop').hidden"),false);
  assert.equal(run("$('analysis-stop').textContent"),'Stop checks');
  run('status.targets[0].previous_work.seconds=1371;control.render(status)');
  assert.match(run("$('analysis-progress').textContent"),/22 min 51 s elapsed/,
    'Long-running checks should not require converting thousands of seconds');
  run('delete status.targets[0].previous_work;control.render(status)');
  assert.equal(run("$('analysis-current-title').textContent"),'Checks queued',
    'A queued request does not prove source edits');
});

test('provider failure outranks missing setup and automatic build waiting is not terminal failure',()=>{
  const {run}=guidanceFixture();
  run(`status.targets[0].checks=[{id:'native',label:'C++',status:'unavailable',detail:'LLVM setup is missing'},
    {id:'duplication',label:'Duplicated code',status:'failed',detail:'CPD process failed'}];control.render(status);`);
  assert.equal(run("$('analysis-current-title').textContent"),'Checks need attention');
  assert.match(run("$('analysis-status').textContent"),/CPD process failed/);
  run(`status.targets[0].state='waiting for external build';status.targets[0].error='Another UnrealBuildTool is running';
    control.render(status);`);
  assert.equal(run("$('analysis-current-title').textContent"),'Waiting for project build');
  assert.match(run("$('analysis-status').textContent"),/retry automatically/);
  assert.doesNotMatch(run("$('analysis-status').textContent"),/attempt failed/);
  assert.equal(run("$('analysis-retry').hidden"),true);
  assert.equal(run("$('analysis-stop').hidden"),false);
  run("status.targets[0].state='failed';control.saving=true;control.render(status)");
  assert.equal(run("$('analysis-retry').disabled"),true,'Retry must not submit twice while a request is pending');
});
