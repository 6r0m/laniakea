// SPDX-License-Identifier: AGPL-3.0-or-later
// The harness publishes through the real pipeline/read contexts; it owns no production route.
async (page,{publish})=>{
  const check=(v,message)=>{if(!v)throw Error(message);};
  await page.waitForFunction(()=>state.live&&!state.live.running);
  await page.waitForFunction(()=>!state.review.loading&&!state.review.requests.size);
  await page.evaluate(()=>{clearTimeout(state.live.timer);state.live.stopped=true;});
  const poll=async()=>{await page.waitForFunction(()=>!state.live.running);
    await page.evaluate(async()=>{state.live.stopped=false;await state.live.tick();clearTimeout(state.live.timer);state.live.stopped=true;});
    await page.waitForFunction(()=>!state.live.running);};
  const before=await page.evaluate(()=>{
    const map=state.universe,id=[...map.nodes.values()].find(n=>n.level==='function').id;
    flyToNode(id);state.hidden.add('type_ref');
    return {id,run:state.target.run};
  });
  await page.waitForFunction(()=>!state.framing&&!state.gestureActive&&!state.flight);
  let view;
  await page.evaluate(id=>selectNode(id),before.id);
  await page.locator('#toggle-browse').click();
  await page.waitForFunction(()=>state.mapSize.width===$('graph').clientWidth&&
    !state.referencePages.pending.size&&!liveBlockReason());
  for(const operation of ['layout','refreshMap','renderCoverage']){
    await page.evaluate(operation=>{
      const elements=()=>state.cy.elements().map(e=>e.json()).sort((a,b)=>a.data.id.localeCompare(b.data.id));
      window.priorAdoption={target:state.target,manifest:state.manifest,universe:state.universe,
        cache:state.positionCache,reader:state.referencePages,review:state.review,inspector:state.inspector,
        details:[...$('details').childNodes],text:$('details').innerText,elements:JSON.stringify(elements()),
        browseRows:[...$('browse-list').childNodes],
        styles:JSON.stringify(renderedOverrides(state.cy).sort(([a],[b])=>a.localeCompare(b))),
        pan:state.cy.pan(),zoom:worldZoom(),url:location.href,history:JSON.stringify(history.state),
        chrome:['build-context','coverage-summary','coverage-record','toggle-review'].map(id=>$(id).outerHTML),
        operation,original:window[operation]};
      window[operation]=()=>{
        if(operation==='refreshMap'){
          priorAdoption.original();state.cy.nodes().data('candidateOnly','must not survive recovery')
            .style({width:12345,opacity:0.25});
        }
        if(operation==='renderCoverage'){
          state.manifest.target.name='CandidateEditor';
          renderBuildContext();priorAdoption.original();
        }
        throw Error('injected '+operation+' failure');
      };
    },operation);
    await publish('remove');await poll();
    await page.evaluate(()=>{window[priorAdoption.operation]=priorAdoption.original;});
    check(await page.evaluate(()=>state.target===priorAdoption.target&&state.manifest===priorAdoption.manifest&&
      state.universe===priorAdoption.universe&&state.positionCache===priorAdoption.cache&&
      state.referencePages===priorAdoption.reader&&state.review===priorAdoption.review&&
      state.inspector===priorAdoption.inspector&&
      priorAdoption.details.every((node,i)=>$('details').childNodes[i]===node)&&$('details').innerText===priorAdoption.text&&
      ['build-context','coverage-summary','coverage-record','toggle-review'].every((id,i)=>$(id).outerHTML===priorAdoption.chrome[i])&&
      JSON.stringify(state.cy.elements().map(e=>e.json()).sort((a,b)=>a.data.id.localeCompare(b.data.id)))===priorAdoption.elements&&
      JSON.stringify(renderedOverrides(state.cy).sort(([a],[b])=>a.localeCompare(b)))===priorAdoption.styles&&
      location.href===priorAdoption.url&&JSON.stringify(history.state)===priorAdoption.history&&
      JSON.stringify(state.cy.pan())===JSON.stringify(priorAdoption.pan)&&worldZoom()===priorAdoption.zoom),
      'Failed '+operation+' left a partially adopted map, scene or Inspector');
    const browse=await page.evaluate(()=>({open:!$('browse').hidden,expanded:$('toggle-browse').getAttribute('aria-expanded'),
      focus:document.activeElement.id,rows:priorAdoption.browseRows.every((node,i)=>$('browse-list').childNodes[i]===node)}));
    check(browse.open&&browse.expanded==='true'&&browse.focus==='browse-close'&&browse.rows,
      'Failed '+operation+' changed Browse: '+JSON.stringify(browse));
    check(await page.evaluate(()=>state.live.message.includes('injected '+priorAdoption.operation+' failure')),
      'Rendering failure is not observable');
    await page.evaluate(()=>{delete window.priorAdoption;state.live.failed=null;});
  }
  await page.locator('#browse-close').click();
  await page.evaluate(()=>renderDetails(null));
  await page.waitForFunction(()=>!liveBlockReason());
  view=await page.evaluate(()=>({pan:{...state.cy.pan()},size:{...state.mapSize},zoom:worldZoom(),scope:state.scopeShard.scope,
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
  const after=await page.evaluate(()=>({pan:{...state.cy.pan()},size:{...state.mapSize},zoom:worldZoom(),scope:state.scopeShard.scope,
    expanded:[...state.universe.expanded],url:location.hash,mode:$('layout').value,filter:state.hidden.has('type_ref')}));
  const center=camera=>({x:(camera.size.width/2-camera.pan.x)/camera.zoom,y:(camera.size.height/2-camera.pan.y)/camera.zoom});
  const start=center(view),end=center(after);
  check(view.zoom===after.zoom&&Math.hypot(start.x-end.x,start.y-end.y)<1e-8,'Adoption changed the world camera');
  check(view.scope===after.scope&&view.url===after.url&&view.mode===after.mode&&after.filter,'Adoption lost scope, URL, layout or filters');
  check(view.expanded.every(id=>after.expanded.includes(id)),'Expanded containers were lost');
  check(await page.evaluate(()=>state.referencePages.url.includes(state.target.run)&&state.positionCache.url.includes(state.target.run)),
    'New exact references or position writes use the old generation');
  await page.evaluate(id=>selectNode(id),before.id);
  for(const width of [1440,390])for(const selector of ['#review-ack','.details-close']){
    await page.setViewportSize({width,height:1000});
    if(selector==='#review-ack'){
      if(await page.locator('#review').isHidden())await page.locator('#toggle-review').click();
      if(!await page.locator('#review-settings').evaluate(node=>node.open))await page.locator('#review-settings > summary').click();
    }else await page.evaluate(id=>selectNode(id),before.id);
    await page.locator(selector).focus();
    const pane=selector==='#review-ack'?'review':'details';
    const scroll=await page.evaluate(pane=>$(pane).scrollTop,pane);
    await page.waitForFunction(()=>!liveBlockReason());run=await publish();await poll();
    check(await page.locator(selector).evaluate(node=>document.activeElement===node),
      `Successful adoption lost ${selector} reading focus at ${width}`);
    check(await page.evaluate(({pane,scroll})=>!$(pane).hidden&&$(pane).scrollTop===scroll,{pane,scroll}),
      `Successful adoption changed ${pane} reading position`);
    if(selector==='#review-ack')await page.locator('#review-close').click();
  }
  await page.setViewportSize({width:1440,height:1000});
  const oldRun=run;
  await page.waitForFunction(()=>!liveBlockReason());
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
  await page.waitForFunction(()=>!state.framing&&!state.gestureActive&&!state.flight&&
    state.wheel==null&&state.zoomFrame==null&&state.viewportFrame==null);
  await page.evaluate(()=>{const input=el('input',null,{name:'review-reason',value:''});input.value='draft';$('details').append(input);});
  run=await publish();await poll();check(await page.evaluate(run=>state.target.run!==run,run),'Adoption discarded a decision draft');
  check(await page.locator('#toggle-analysis').getAttribute('title').then(text=>/decision draft/.test(text)),
    'Deferred update lost its visible explanation in Checks');
  await page.evaluate(()=>$('details').querySelector('[name="review-reason"]').remove());
  await page.waitForFunction(()=>!liveBlockReason());await poll();
  check(await page.evaluate(run=>state.target.run===run,run),'Adoption did not resume after the draft cleared');
  await page.evaluate(id=>flyToNode(id),before.id);await page.waitForFunction(()=>!liveBlockReason());
  run=await publish('remove');
  for(let attempt=0;attempt<20&&!await page.evaluate(run=>state.target.run===run,run);attempt++){
    await poll();await page.waitForTimeout(50);}
  await page.waitForFunction(run=>state.target.run===run,run);
  check(await page.evaluate(({run,id})=>state.target.run===run&&state.scopeShard.scope!==id&&
    state.universe.nodes.has(state.scopeShard.scope),{run,id:before.id}),'Removed focus did not fall back');
  await page.setViewportSize({width:390,height:844});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&$('graph').getBoundingClientRect().height>=300),
    'Live controls leave no useful narrow map or overflow');
  await page.locator('#view-summary').click();
  check(await page.evaluate(()=>document.querySelector('.view-options').getBoundingClientRect().top>=
    $('view-summary').getBoundingClientRect().bottom),'View options cover their own close target');
  await page.locator('#view-summary').focus();await page.keyboard.press('Escape');
  check(await page.evaluate(()=>!$('view-controls').open&&document.activeElement===$('view-summary')),'View controls do not close by keyboard');
  return {adoption:true,camera:true,deepScope:true,filters:true,immutableURLs:true,dragAndSaveDeferral:true,
    drafts:true,closedInspector:true,removedFocus:true,narrowMap:true,reviewIsolation:true,multipleTabs:true,renderRollback:true,
    successfulReadingFocus:true};
}
