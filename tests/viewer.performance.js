// SPDX-License-Identifier: AGPL-3.0-or-later
// Evaluate on a served map. Measures trusted mouse/wheel input and restores its scene without moving pins.
async page => {
  const cdp=await page.context().newCDPSession(page);
  const metric=(result,name)=>result.metrics.find(item=>item.name===name)?.value;
  let original;
  await page.bringToFront();
  await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await cdp.send('Performance.enable');
  await page.waitForFunction(()=>state.cy&&state.universe&&!state.gestureActive&&!state.positionCache.pending);
  try {
    original=await page.evaluate(()=>({zoom:worldZoom(),pan:{...state.cy.pan()},expanded:[...state.universe.expanded],
      scope:state.scopeShard.scope,selection:state.selection,
      positions:JSON.stringify([...state.universe.positions]),pins:JSON.stringify(state.positionCache.layouts)}));
    await page.evaluate(()=>{
      window.mapPerformance={frames:[],longTasks:[],last:null};
      const probe=window.mapPerformance;
      probe.observer=new PerformanceObserver(list=>probe.longTasks.push(...list.getEntries().map(entry=>entry.duration)));
      probe.observer.observe({type:'longtask'});
      const tick=time=>{
        if(probe.last!==null)probe.frames.push(time-probe.last);
        probe.last=time;probe.frame=requestAnimationFrame(tick);
      };
      probe.frame=requestAnimationFrame(tick);
    });
    const before=await cdp.send('Performance.getMetrics');
    const box=await page.locator('#graph').boundingBox();
    for(let i=0;i<12;i++) {
      await page.mouse.move(box.x+box.width*.3+(i%4)*50,box.y+box.height*.45);
      await page.mouse.wheel(0,i<6?-55:55);
    }
    await page.waitForFunction(()=>!state.wheelFrame&&!state.zoomFrame&&!state.viewportFrame&&!state.gestureActive);
    const after=await cdp.send('Performance.getMetrics');
    const samples=await page.evaluate(original=>{
      const probe=window.mapPerformance;
      cancelAnimationFrame(probe.frame);probe.observer.disconnect();
      const frames=probe.frames.sort((a,b)=>a-b),percentile=p=>frames[Math.floor((frames.length-1)*p)]||0;
      return {frames:frames.length,frameMs:{p50:percentile(.5),p95:percentile(.95),max:Math.max(0,...frames)},
        longTasksMs:probe.longTasks,nodes:state.cy.nodes().length,edges:state.cy.edges().length,
        referencePages:state.referencePages?.cache.size||0,referenceCacheBytes:state.referencePages?.bytes||0,
        pinsUnchanged:JSON.stringify(state.positionCache.layouts)===original.pins&&
          JSON.stringify([...state.universe.positions])===original.positions};
    },original);
    if(!samples.pinsUnchanged)throw new Error('Camera input changed world positions or saved pins');
    return {...samples,mainThreadSeconds:metric(after,'TaskDuration')-metric(before,'TaskDuration'),
      heapBytes:metric(after,'JSHeapUsedSize')};
  } finally {
    await page.evaluate(original=>{
      const probe=window.mapPerformance;
      if(probe){cancelAnimationFrame(probe.frame);probe.observer.disconnect();delete window.mapPerformance;}
      if(original){
        state.universe.expanded=new Set(original.expanded);state.selection=null;
        setSceneScope(original.scope);setWorldViewport(original.zoom,original.pan);refreshMap();renderDetails(original.selection);
      }
    },original);
    await cdp.detach();
  }
}
