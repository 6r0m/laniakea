// SPDX-License-Identifier: AGPL-3.0-or-later
// Explicit navigation has one interruptible camera flight; live adoption stays blocked for its lifetime.
async page=>{
  const check=(ok,message)=>{if(!ok)throw Error(message);},errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.waitForFunction(()=>state.cy&&state.universe&&!state.flight);
  const sample=await page.evaluate(()=>state.target.id==='sample');
  check(sample,'Motion acceptance requires the disposable sample');

  const started=await page.evaluate(()=>{
    const id=[...state.universe.nodes.values()].find(node=>node.level==='module')?.id;
    if(!id)throw Error('Sample has no module target');
    const target=nodeFrameCamera(id);
    startNavigationFlight(target);
    return {flight:Boolean(state.flight),blocked:liveBlockReason(),target};
  });
  check(started.flight,'Explicit navigation did not start a flight');
  check(/Finish moving the map/.test(started.blocked),'The flight did not block live adoption');

  await page.waitForTimeout(30);
  check(await page.evaluate(()=>Boolean(state.flight)&&liveBlockReason()==='Finish moving the map'),
    'Live adoption became unblocked between animation frames');

  await page.waitForFunction(()=>!state.flight);
  const final=await page.evaluate(target=>({zoom:worldZoom(),pan:{...state.cy.pan()},target}),started.target)
    .catch(()=>null);
  check(final,'Could not read the completed camera');
  check(Math.abs(final.zoom-final.target.level)<1e-6,'Flight did not settle at the exact zoom');
  check(Math.abs(final.pan.x-final.target.pan.x)<1e-6&&Math.abs(final.pan.y-final.target.pan.y)<1e-6,
    'Flight did not settle at the exact pan');
  check(await page.evaluate(()=>!state.flight&&!state.framing),'Completed flight left its blocker active');

  const integrated=await page.evaluate(()=>{
    const id=[...state.universe.nodes.values()].find(node=>node.level==='module')?.id;
    flyToNode(id,true);
    return {flight:Boolean(state.flight),target:id};
  });
  check(integrated.flight,'The user-facing flyToNode path did not start a flight');
  await page.waitForFunction(()=>!state.flight);
  check(await page.evaluate(id=>state.selection?.id===id,integrated.target),
    'The completed flyToNode flight lost its inspected target');
  await page.evaluate(()=>renderDetails(null));

  const interrupted=await page.evaluate(()=>{
    const id=[...state.universe.nodes.values()].find(node=>node.level==='module')?.id;
    const target=nodeFrameCamera(id);
    startNavigationFlight(target);
    const before={...state.cy.pan()};
    zoomAt(worldZoom()*1.2,{x:120,y:90});
    return {flight:Boolean(state.flight),before,after:{...state.cy.pan()},target};
  });
  check(!interrupted.flight,'Explicit wheel input did not cancel the flight');
  check(await page.evaluate(()=>!state.framing&&!state.flight),'Interrupted flight left its blocker active');
  await page.waitForFunction(()=>!state.viewportFrame&&!state.gestureActive);
  check(JSON.stringify(interrupted.before)!==JSON.stringify(interrupted.after),
    'Interrupted flight snapped the camera back to its obsolete start');

  await page.emulateMedia({reducedMotion:'reduce'});
  const reduced=await page.evaluate(()=>{
    const id=[...state.universe.nodes.values()].find(node=>node.level==='module')?.id;
    startNavigationFlight(nodeFrameCamera(id));
    return {flight:Boolean(state.flight),framing:Boolean(state.framing)};
  });
  check(!reduced.flight&&!reduced.framing,'Reduced motion still started a transitional flight');
  await page.emulateMedia({reducedMotion:'no-preference'});
  check(!errors.length,'Runtime errors: '+errors.join(' / '));
  return {flight:true,blocked:true,interrupted:true,reducedMotion:true,errors};
}
