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

test('wheel motion blocks adoption and a cancelled or failed frame cannot outlive its camera intent',()=>{
  const {run}=motionViewer();
  run(`$('graph').getBoundingClientRect=()=>({left:0,top:0});
    globalThis.wheelInput={deltaY:-120,deltaMode:0,clientX:300,clientY:200,
      preventDefault(){},stopImmediatePropagation(){}};
    zoomWithWheel(wheelInput);`);
  assert.match(run('liveBlockReason()'),/Finish moving the map/);
  run('cancelWheelMotion();frameQueue.shift()(16);');
  assert.equal(run('cameraCalls.length'),0,'A cancelled callback must leave the camera fixed');
  assert.equal(run('liveBlockReason()'),'');

  run(`globalThis.setWorldViewport=()=>{throw Error('wheel camera failed');};
    zoomWithWheel(wheelInput);`);
  assert.throws(()=>run('frameQueue.shift()(32);'),/wheel camera failed/);
  assert.equal(run('state.wheel'),null);
  assert.equal(run('liveBlockReason()'),'');
});

test('rapid wheel input starts gently and advances on consecutive 144 Hz frames',()=>{
  const {run}=motionViewer();
  run(`$('graph').getBoundingClientRect=()=>({left:0,top:0});
    globalThis.applySemanticZoom=()=>false;
    zoomWithWheel({deltaY:-480,deltaMode:0,clientX:300,clientY:200,preventDefault(){},stopImmediatePropagation(){}});
    frameQueue.shift()(0);frameQueue.shift()(1000/144);`);
  const calls=run('cameraCalls');
  assert.equal(calls.length,2,'A normal high-refresh display should not skip every other wheel frame');
  assert.ok(Math.log(calls[0].level)<.04,'The first painted step applied too much of the wheel burst');
  run('cancelWheelMotion(false);');
});

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
  assert.equal(done.refreshes,2,'One union pre-projection and one final projection');
  const final=done.calls[done.calls.length-1];
  assert.equal(final.level,2);
  assert.deepEqual(final.pan,{x:100,y:50});
});

test('a flight interpolates the world-space centre with logarithmic zoom',()=>{
  const {run}=motionViewer();
  // Start centred at (400,300), then move to zoom 4 around the same centre.
  run(`startNavigationFlight({level:4,pan:{x:-1200,y:-900}});frameQueue.shift()(0);
    globalThis.midflight=frameQueue.shift();midflight(state.flight.duration/2);`);
  const mid=run(`cameraCalls[cameraCalls.length-1]`);
  assert.ok(Math.abs(mid.level-2)<1e-9,'Halfway zoom must be logarithmic');
  assert.ok(Math.abs(mid.pan.x+400)<1e-6,'Halfway pan must preserve the world-space centre');
  assert.ok(Math.abs(mid.pan.y+300)<1e-6,'Halfway pan must preserve the world-space centre');
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

test('cancelling a flight restores the ordinary projection once',()=>{
  const {run}=motionViewer();
  run(`startNavigationFlight({level:4,pan:{x:-1200,y:-900}});`);
  const result=run(`cancelNavigationFlight();({refreshes,flight:Boolean(state.flight),framing:state.framing})`);
  assert.equal(result.flight,false);
  assert.equal(result.framing,false);
  assert.equal(result.refreshes,2,'Pre-projection plus one ordinary restoration');
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

test('a frame error releases the flight and restores the live-adoption gate',()=>{
  const {run}=motionViewer();
  run(`globalThis.setWorldViewport=()=>{throw Error('viewport failed');};
    startNavigationFlight({level:2,pan:{x:10,y:20}});`);
  const result=run(`globalThis.flightError='';
    try{frameQueue.shift()(0);}catch(error){flightError=error.message;}
    ({error:flightError,flight:state.flight,framing:state.framing,blocked:liveBlockReason()})`);
  assert.equal(result.error,'viewport failed');
  assert.equal(result.flight,null);
  assert.equal(result.framing,false);
  assert.equal(result.blocked,'');
});

test('a final render error releases the flight without leaving a stale blocker',()=>{
  const {run}=motionViewer();
  run(`let refreshes=0;globalThis.refreshMap=()=>{if(++refreshes>1)throw Error('render failed');};
    startNavigationFlight({level:2,pan:{x:10,y:20}});`);
  const result=run(`globalThis.flightError='';
    try{frameQueue.shift()(0);frameQueue.shift()(1000);}catch(error){flightError=error.message;}
    ({error:flightError,flight:state.flight,framing:state.framing,blocked:liveBlockReason()})`);
  assert.equal(result.error,'render failed');
  assert.equal(result.flight,null);
  assert.equal(result.framing,false);
  assert.equal(result.blocked,'');
});

test('stale cleanup cannot release a newer flight',()=>{
  const {run}=motionViewer();
  run(`startNavigationFlight({level:2,pan:{x:10,y:20}});globalThis.oldFlight=state.flight;
    startNavigationFlight({level:3,pan:{x:30,y:40}});globalThis.newFlight=state.flight;`);
  const result=run(`({released:releaseNavigationFlight(oldFlight,false,false),same:state.flight===newFlight,
    framing:state.framing})`);
  assert.equal(result.released,false);
  assert.equal(result.same,true);
  assert.equal(result.framing,true);
});
