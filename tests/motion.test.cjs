// SPDX-License-Identifier: AGPL-3.0-or-later
// One cancellable camera flight owns explicit navigation; these checks keep its lifecycle observable.
const test=require('node:test'),assert=require('node:assert');
const {viewer}=require('./viewer-support.cjs');

function motionViewer(){
  const {run}=viewer();
  run(`state.cy={minZoom:()=>0.01,maxZoom:()=>100,zoom:()=>1,pan:()=>({x:0,y:0}),destroyed:()=>false,
      resize(){},width:()=>800,height:()=>600};
    state.renderScale=1;state.framing=false;state.flight=null;state.flightGeneration=0;
    globalThis.frameQueue=[];globalThis.cancelled=[];globalThis.cameraCalls=[];globalThis.refreshes=0;globalThis.remembered=0;
    globalThis.requestAnimationFrame=fn=>{frameQueue.push(fn);return frameQueue.length;};
    globalThis.cancelAnimationFrame=id=>{cancelled.push(id);};
    globalThis.matchMedia=()=>({matches:false});
    globalThis.setWorldViewport=(level,pan)=>cameraCalls.push({level,pan:{...pan}});
    globalThis.scheduleViewport=()=>{};
    globalThis.refreshMap=()=>{refreshes++;};
    globalThis.rememberView=()=>{remembered++;};
    globalThis.readableLabels=()=>{};document.querySelectorAll=()=>[];`);
  return {run};
}

test('a flight blocks live adoption for its whole lifetime and commits once at the exact destination',()=>{
  const {run}=motionViewer();
  const started=run(`startNavigationFlight({level:2,pan:{x:100,y:50}});
    ({flight:Boolean(state.flight),framing:state.framing,blocked:liveBlockReason(),calls:cameraCalls.length})`);
  assert.equal(started.flight,true);
  assert.equal(started.framing,true);
  assert.match(started.blocked,/Finish moving the map/,'Inter-frame gaps must remain blocked');
  assert.equal(started.calls,0,'The first frame must not apply a camera before the animation starts');
  run(`frameQueue.shift()(0);`);
  assert.equal(run('Boolean(state.flight)'),true,'A mid-flight frame must retain the flight');
  assert.match(run('liveBlockReason()'),/Finish moving the map/);
  run(`frameQueue.shift()(1000);`);
  const done=run(`({flight:state.flight,framing:state.framing,remembered,calls:cameraCalls,refreshes})`);
  assert.equal(done.flight,null);
  assert.equal(done.framing,false);
  assert.equal(done.remembered,1,'Camera history must be committed once');
  assert.equal(done.refreshes,1);
  const final=done.calls[done.calls.length-1];
  assert.equal(final.level,2);
  assert.deepEqual(final.pan,{x:100,y:50});
});

test('cancelling a flight releases the blocker and never commits the obsolete destination',()=>{
  const {run}=motionViewer();
  run(`startNavigationFlight({level:2,pan:{x:100,y:50}});frameQueue.shift()(0);cancelNavigationFlight({remember:true});`);
  const stopped=run(`({flight:state.flight,framing:state.framing,remembered,cancelled,calls:cameraCalls})`);
  assert.equal(stopped.flight,null);
  assert.equal(stopped.framing,false);
  assert.equal(stopped.remembered,1);
  assert.ok(stopped.cancelled.length>=1);
  assert.ok(stopped.calls.every(call=>call.level!==2||call.pan.x!==100),
    'Cancellation must not apply the obsolete destination');
  assert.equal(run('liveBlockReason()'),'');
});

test('a stale renderer instance cancels the flight instead of moving the new scene',()=>{
  const {run}=motionViewer();
  run(`startNavigationFlight({level:2,pan:{x:100,y:50}});
    state.cy={minZoom:()=>0.01,maxZoom:()=>100,zoom:()=>3,pan:()=>({x:7,y:8}),destroyed:()=>false,resize(){},width:()=>800,height:()=>600};
    frameQueue.shift()(0);`);
  assert.equal(run('state.flight'),null);
  assert.equal(run('state.framing'),false);
  assert.equal(run('cameraCalls.length'),0,'A stale frame must not apply coordinates');
});

test('reduced motion uses the immediate camera path without a flight',()=>{
  const {run}=motionViewer();
  run(`matchMedia=()=>({matches:true});startNavigationFlight({level:2,pan:{x:10,y:20}});`);
  const result=run(`({flight:state.flight,framing:state.framing,remembered,calls:cameraCalls})`);
  assert.equal(result.flight,null);
  assert.equal(result.framing,false);
  assert.equal(result.remembered,1);
  assert.equal(result.calls.length,1);
  assert.deepEqual(result.calls[0].pan,{x:10,y:20});
});

test('a panel resize shifts the active flight with the map instead of cancelling it',()=>{
  const {run}=motionViewer();
  run(`state.mapSize={width:800,height:600};state.cy.width=()=>600;state.cy.height=()=>600;
    state.flight={start:{pan:{x:0,y:0}},target:{pan:{x:100,y:50}}};resizeMap();`);
  assert.deepEqual(run('state.flight.target.pan'),{x:0,y:50});
  assert.deepEqual(run('state.flight.start.pan'),{x:-100,y:0});
});
