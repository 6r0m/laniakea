// SPDX-License-Identifier: AGPL-3.0-or-later
// The harness publishes through the real pipeline/read contexts; it owns no production route.
async (page,{publish})=>{
  const check=(v,message)=>{if(!v)throw Error(message);};
  await page.waitForFunction(()=>state.live&&!state.live.running);
  await page.evaluate(()=>{clearTimeout(state.live.timer);state.live.stopped=true;});
  const poll=()=>page.evaluate(async()=>{state.live.stopped=false;await state.live.tick();clearTimeout(state.live.timer);state.live.stopped=true;});
  const before=await page.evaluate(()=>{
    const map=state.universe,id=[...map.nodes.values()].find(n=>n.level==='function').id;
    flyToNode(id);state.hidden.add('type_ref');
    return {id,run:state.target.run};
  });
  await page.waitForFunction(()=>!state.framing&&!state.gestureActive);
  const view=await page.evaluate(()=>({pan:{...state.cy.pan()},zoom:worldZoom(),scope:state.scopeShard.scope,
    expanded:[...state.universe.expanded],url:location.hash,mode:$('layout').value}));
  let run=await publish();
  await page.evaluate(()=>{state.pointerDown=true;});await poll();
  check(await page.evaluate(run=>state.target.run!==run,run),'Adopted during dragging');
  await page.evaluate(()=>{state.pointerDown=false;state.positionCache.errors.add('auto/pin');unsavedPositionCaches.add(state.positionCache);});
  await poll();check(await page.evaluate(run=>state.target.run!==run,run),'Adopted with failed position save');
  await page.evaluate(()=>{state.positionCache.errors.clear();unsavedPositionCaches.clear();});
  await page.waitForFunction(()=>!liveBlockReason());
  await poll();
  check(await page.evaluate(run=>state.target.run===run,run),'Ready snapshot was not adopted');
  const after=await page.evaluate(()=>({pan:{...state.cy.pan()},zoom:worldZoom(),scope:state.scopeShard.scope,
    expanded:[...state.universe.expanded],url:location.hash,mode:$('layout').value,filter:state.hidden.has('type_ref')}));
  check(JSON.stringify(view.pan)===JSON.stringify(after.pan)&&view.zoom===after.zoom,'Adoption changed the camera');
  check(view.scope===after.scope&&view.url===after.url&&view.mode===after.mode&&after.filter,'Adoption lost scope, URL, layout or filters');
  check(view.expanded.every(id=>after.expanded.includes(id)),'Expanded containers were lost');
  check(await page.evaluate(()=>state.referencePages.url.includes(state.target.run)&&state.positionCache.url.includes(state.target.run)),
    'New exact references or position writes use the old generation');
  await page.evaluate(id=>selectNode(id),before.id);
  const oldRun=run;
  let release;
  const held=new Promise(resolve=>{release=resolve;});
  const reviewURL=url=>url.pathname.endsWith('/review');
  await page.route(reviewURL,async route=>{
    if(route.request().url().includes(oldRun)){
      await held;await route.fulfill({status:500,body:'late old Review failure'}).catch(()=>{});
    }else await route.fulfill({status:500,body:'synthetic current Review failure'});
  });
  await page.evaluate(()=>{state.review.recheck();});
  run=await publish();await poll();release();
  check(await page.evaluate(({run,id})=>state.target.run===run&&state.selection?.id===id&&!$('details').hidden,
    {run,id:before.id}),'Blocked Review prevented adoption or lost the selected symbol');
  await page.waitForFunction(()=>state.review.error);
  check(await page.evaluate(()=>!state.review.error.includes('late old')),'Old Review error crossed generations');
  await page.unroute(reviewURL);await page.evaluate(()=>state.review.recheck());
  const second=await page.context().newPage();
  try{
    await second.goto(page.url());await second.waitForFunction(()=>typeof state!=='undefined'&&state.cy&&state.live);
    await second.evaluate(()=>{state.live.stop();setWorldViewport(worldZoom(),{x:123,y:234});});
    run=await publish();await page.bringToFront();await page.waitForFunction(()=>!liveBlockReason());await poll();
    await second.bringToFront();await second.waitForFunction(()=>!liveBlockReason());
    await second.evaluate(async()=>{state.live.stopped=false;await state.live.tick();state.live.stop();});
    check(await second.evaluate(run=>state.target.run===run&&state.cy.pan('x')===123&&state.cy.pan('y')===234,run),
      'Another tab failed independent adoption or lost its camera');
  }finally{await second.close();await page.bringToFront();}
  await page.evaluate(()=>renderDetails(null));run=await publish();await poll();
  check(await page.evaluate(()=>$('details').hidden),'Adoption reopened closed Inspector');
  await page.evaluate(()=>{const input=el('input',null,{name:'review-reason',value:''});input.value='draft';$('details').append(input);});
  run=await publish();await poll();check(await page.evaluate(run=>state.target.run!==run,run),'Adoption discarded a decision draft');
  await page.evaluate(()=>$('details').querySelector('[name="review-reason"]').remove());
  await page.waitForFunction(()=>!liveBlockReason());await poll();
  check(await page.evaluate(run=>state.target.run===run,run),'Adoption did not resume after the draft cleared');
  await page.evaluate(id=>flyToNode(id),before.id);await page.waitForFunction(()=>!state.framing&&!state.gestureActive);
  run=await publish('remove');await poll();
  check(await page.evaluate(({run,id})=>state.target.run===run&&state.scopeShard.scope!==id&&
    state.universe.nodes.has(state.scopeShard.scope),{run,id:before.id}),'Removed focus did not fall back');
  await page.setViewportSize({width:390,height:844});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&$('graph').getBoundingClientRect().height>=300),
    'Live controls leave no useful narrow map or overflow');
  await page.locator('#live-summary').click();
  check(await page.evaluate(()=>document.querySelector('.live-options').getBoundingClientRect().top>=
    $('live-summary').getBoundingClientRect().bottom),'Live controls cover their own close target');
  await page.locator('#live-toggle').focus();await page.keyboard.press('Escape');
  check(await page.evaluate(()=>!$('live-controls').open&&document.activeElement===$('live-summary')),'Live controls do not close by keyboard');
  return {adoption:true,camera:true,deepScope:true,filters:true,immutableURLs:true,dragAndSaveDeferral:true,
    drafts:true,closedInspector:true,removedFocus:true,narrowMap:true,reviewIsolation:true,multipleTabs:true};
}
