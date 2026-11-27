// SPDX-License-Identifier: AGPL-3.0-or-later
// Measure an explicit deep flight on a served map: pre-projection cost, peak renderer
// retention, final retention and pins. This is an acceptance probe, not a unit test.
async page => {
  await page.waitForFunction(()=>state.cy&&state.universe&&state.positionCache&&
    !state.flight&&!state.gestureActive&&!state.positionCache.pending);
  const original=await page.evaluate(()=>({zoom:worldZoom(),pan:{...state.cy.pan()},
    expanded:[...state.universe.expanded],scope:state.scopeShard.scope,selection:state.selection,
    pins:JSON.stringify(state.positionCache.layouts),positions:JSON.stringify([...state.universe.positions])}));
  const measurement=await page.evaluate(()=>{
    const map=state.universe,cy=state.cy;
    const target=[...map.nodes.values()].filter(node=>['module','class'].includes(node.level))
      .sort((a,b)=>(map.paths.get(b.id)?.length||0)-(map.paths.get(a.id)?.length||0))[0];
    if(!target)throw Error('Flight performance requires a module or class target');
    const camera=nodeFrameCamera(target.id);
    if(!camera)throw Error('Flight target has no camera');
    const probe={longTasks:[],peak:{nodes:0,edges:0},samples:[],started:performance.now(),firstFrameMs:null};
    probe.observer=new PerformanceObserver(list=>probe.longTasks.push(...list.getEntries().map(entry=>entry.duration)));
    probe.observer.observe({type:'longtask'});window.__flightPerformance=probe;
    const sample=()=>{
      if(probe.firstFrameMs===null)probe.firstFrameMs=performance.now()-probe.started;
      probe.peak.nodes=Math.max(probe.peak.nodes,cy.nodes().length);
      probe.peak.edges=Math.max(probe.peak.edges,cy.edges().length);
      probe.samples.push(cy.nodes().length);
      if(state.flight)requestAnimationFrame(sample);
    };
    const frame=requestAnimationFrame(sample);
    const before={nodes:cy.nodes().length,edges:cy.edges().length};
    const start=performance.now();
    flyToNode(target.id,false);
    const callMs=performance.now()-start;
    const cut=state.viewportCut?{width:state.viewportCut.x2-state.viewportCut.x1,
      height:state.viewportCut.y2-state.viewportCut.y1,zoom:state.viewportCut.zoom,force:state.viewportCut.force.length}:null;
    const afterPreprojection={nodes:cy.nodes().length,edges:cy.edges().length};
    return {targetLevel:target.level,targetDepth:map.paths.get(target.id).length,before,
      afterPreprojection,callMs,cut,frame};
  });
  await page.waitForFunction(()=>!state.flight,null,{timeout:10000});
  const result=await page.evaluate(({frame,original})=>{
    const probe=window.__flightPerformance;
    cancelAnimationFrame(frame);probe.observer.disconnect();delete window.__flightPerformance;
    const final={nodes:state.cy.nodes().length,edges:state.cy.edges().length};
    const totalMs=performance.now()-probe.started;
    const pinsUnchanged=JSON.stringify(state.positionCache.layouts)===original.pins&&
      JSON.stringify([...state.universe.positions])===original.positions;
    return {final,pinsUnchanged,longTasksMs:probe.longTasks,totalMs,firstFrameMs:probe.firstFrameMs,
      peakNodes:probe.peak.nodes,peakEdges:probe.peak.edges,frameSamples:probe.samples.length};
  },{frame:measurement.frame,original});
  await page.evaluate(original=>{
    state.universe.expanded=new Set(original.expanded);state.selection=null;
    setSceneScope(original.scope);setWorldViewport(original.zoom,original.pan);refreshMap();
    renderDetails(original.selection);
  },original);
  if(!result.pinsUnchanged)throw Error('Explicit flight changed world positions or saved pins');
  return {targetLevel:measurement.targetLevel,targetDepth:measurement.targetDepth,
    before:measurement.before,afterPreprojection:measurement.afterPreprojection,
    callMs:measurement.callMs,cut:measurement.cut,final:result.final,
    peakNodes:result.peakNodes,peakEdges:result.peakEdges,frameSamples:result.frameSamples,
    totalMs:result.totalMs,firstFrameMs:result.firstFrameMs,longTasksMs:result.longTasksMs,pinsUnchanged:result.pinsUnchanged};
}
