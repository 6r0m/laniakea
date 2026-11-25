// SPDX-License-Identifier: AGPL-3.0-or-later
// Serve the source-surface fixture through the normal viewer and map index.
async page=>{
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  const settle=()=>page.waitForFunction(()=>!state.flight&&!state.wheel&&!state.wheelFrame&&!state.zoomFrame&&
    !state.viewportFrame&&!state.gestureActive);
  await page.waitForFunction(()=>state.cy&&state.universe?.nodes.has('method'));
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(()=>{state.analysis?.markHandled();state.analysis?.panel(false);});
  await page.waitForFunction(()=>{
    const bounds=$('graph').getBoundingClientRect();
    return state.mapSize.width===bounds.width&&state.mapSize.height===bounds.height;
  });
  await settle();
  const setCamera=async (level,caption)=>{
    const setup=await page.evaluate(({level,caption})=>{
      const map=state.universe,cy=state.cy;
      map.expanded=new Set([map.root]);setSceneScope(map.root);
      const from=caption&&map.fileIds.find(id=>map.nodes.get(id).label===caption);
      if(from){map.reveal(from);setSceneScope('module');}
      const world=from?map.positions.get(from):{x:-400,y:-400};
      const point={x:Math.round(cy.width()*.62),y:Math.round(cy.height()*.51)};
      setWorldViewport(level,{x:point.x-world.x*level,y:point.y-world.y*level});refreshMap();
      const box=$('graph').getBoundingClientRect();
      return {mouse:{x:box.left+point.x,y:box.top+point.y},point,world};
    },{level,caption});
    await settle();
    await page.mouse.move(setup.mouse.x,setup.mouse.y);
    return setup;
  };
  const record=async point=>page.evaluate(point=>{
    window.wheelTrace={frames:[],trusted:0};
    const trace=window.wheelTrace;
    const input=event=>{if(event.isTrusted)trace.trusted++;};
    window.addEventListener('wheel',input,true);
    trace.stop=()=>{window.removeEventListener('wheel',input,true);cancelAnimationFrame(trace.frame);};
    const sample=()=>{
      const zoom=worldZoom(),pan=state.cy.pan();
      trace.frames.push({zoom,scale:state.renderScale,scope:state.scopeShard.scope,
        x:(point.x-pan.x)/zoom,y:(point.y-pan.y)/zoom});
      trace.frame=requestAnimationFrame(sample);
    };
    sample();
  },point);
  const result=async ()=>page.evaluate(()=>{
    const {trusted,frames,stop}=window.wheelTrace;stop();return {trusted,frames};
  });
  const close=(a,b,tolerance=1e-5)=>Math.abs(a-b)<tolerance;

  const initial=await setCamera(1.95);
  await record(initial.point);
  await page.mouse.wheel(0,-120);await settle();
  const notch=await result(),levels=[...new Set(notch.frames.map(f=>f.zoom))];
  check(notch.trusted===1&&levels.length>=4,'One trusted wheel notch must paint intermediate camera scales');
  check(close(levels.at(-1),1.95*Math.exp(.216)),'One wheel notch lost movement');
  check(notch.frames.some(f=>f.scale>1)&&notch.frames.every(f=>close(f.x,initial.world.x)&&close(f.y,initial.world.y)),
    'Renderer scale crossing displaced the world point under the mouse');

  const burst=await setCamera(1.95);
  await record(burst.point);
  await page.mouse.wheel(0,-120);
  await page.waitForFunction(()=>worldZoom()>1.95&&worldZoom()<1.95*Math.exp(.215));
  await page.mouse.move(burst.mouse.x+48,burst.mouse.y-36);
  for(const delta of [-105,225])await page.mouse.wheel(0,delta);
  await settle();
  const retarget=await result();
  check(retarget.trusted===3&&close(retarget.frames.at(-1).zoom,1.95),'Retargeting lost outstanding wheel deltas');

  const portal=await setCamera(10.6,'Producer.cpp');
  await record(portal.point);
  await page.mouse.wheel(0,-120);await settle();
  const handoff=await result(),end=handoff.frames.at(-1);
  const distance=Math.hypot(end.x-portal.world.x,end.y-portal.world.y);
  check(handoff.trusted===1&&end.scope==='method'&&distance>1,'The recorded definition portal did not complete');
  check(handoff.frames.slice(1).every((f,i)=>Math.hypot(f.x-handoff.frames[i].x,f.y-handoff.frames[i].y)<distance*.6),
    'The file portal rebased the world point in one frame');
  check(await page.evaluate(()=>state.cy.getElementById('method').length===1),'Portal duplicated or dropped its destination');

  const reversal=await setCamera(10.6,'Producer.cpp');
  const before=await page.evaluate(()=>JSON.stringify([...state.universe.expanded]));
  await record(reversal.point);
  await page.mouse.wheel(0,-120);
  await page.waitForFunction(()=>state.wheel?.portal?.progress>.12);
  await page.mouse.wheel(0,120);await settle();
  const reverse=await result();
  check(reverse.trusted===2&&reverse.frames.every(frame=>frame.scope==='module'),'Reversing the portal committed its abandoned scope');
  check(await page.evaluate(before=>JSON.stringify([...state.universe.expanded])===before,before),
    'Reversing the portal retained staging expansion');

  await page.emulateMedia({reducedMotion:'reduce'});
  const reduced=await setCamera(1);
  await record(reduced.point);
  await page.mouse.wheel(0,-120);await settle();
  const immediate=await result();
  check(new Set(immediate.frames.map(f=>f.zoom)).size===2&&close(immediate.frames.at(-1).zoom,Math.exp(.216)),
    'Reduced motion must apply one immediate wheel step');
  return {notchFrames:levels.length,retargeted:true,portal:true,reversal:true,reducedMotion:true};
}
