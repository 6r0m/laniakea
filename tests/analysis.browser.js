// SPDX-License-Identifier: AGPL-3.0-or-later
// A monitored Sample target, with controllable owned-work timing supplied by the harness.
async (page,{hold=async()=>{},guidance=false,screenshot=async()=>{}}={})=>{
  const check=(value,message)=>{if(!value)throw Error(message);};
  if(guidance){
    const browser=page.context().browser(),url=page.url(),errors=[];
    const settle=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const camera=p=>p.evaluate(()=>{const cy=state.cy,pan=cy.pan(),zoom=worldZoom();
      return JSON.stringify([(cy.width()/2-pan.x)/zoom,(cy.height()/2-pan.y)/zoom,zoom,[...state.universe.expanded]]);});
    for(const width of [1440,390])for(const panel of ['review','details','filters','view']){
      const context=await browser.newContext({viewport:{width,height:900}}),p=await context.newPage();
      p.on('pageerror',e=>errors.push(e.message));
      let release;const gate=new Promise(r=>release=r);let controls=0;
      p.on('request',r=>{if(r.url().endsWith('/monitor/control'))controls++;});
      await p.route('**/monitor/status?*',async route=>{await gate;await route.continue();});
      try{
        await p.goto(url);await p.waitForFunction(()=>typeof state!=='undefined'&&state.cy&&state.analysis);
        if(panel==='review'){await p.locator('#toggle-review').click();await p.locator('#review-ack').focus();}
        if(panel==='details'){await p.locator('#inspect-project').click();await p.locator('.details-close').focus();}
        if(panel==='filters'){await p.locator('#view-summary').click();await p.locator('#toggle-filters').click();
          await p.locator('#filters input').first().focus();}
        if(panel==='view'){await p.locator('#view-summary').click();await p.locator('#fit').focus();}
        const selector=panel==='view'?'#view-controls':'#'+panel;
        const reading=await p.evaluate(selector=>{window.readingFocus=document.activeElement;const node=document.querySelector(selector);
          return {scroll:node.scrollTop,text:node.innerText};},selector),before=await camera(p);
        release();await p.waitForFunction(()=>state.live?.status);await settle(p);
        check(await p.locator('#analysis').isHidden(),`Automatic Checks replaced ${panel} at ${width}`);
        check(await p.locator(selector).isVisible(),`Reading ${panel} disappeared`);
        check(await p.evaluate(({selector,reading})=>document.activeElement===window.readingFocus&&
          document.querySelector(selector).scrollTop===reading.scroll,{selector,reading}),'Delayed guidance changed reading focus/scroll');
        check(await camera(p)===before,'Delayed guidance changed the camera');
        check(await p.evaluate(()=>!state.analysis.guideHandled()),'Deferred guidance was marked handled');
        check(controls===0,'Opening or deferring guidance started analysis');
        await p.locator('#toggle-analysis').click();
        check(await p.locator('#analysis').isVisible(),'Manual Checks failed');
        check(await p.locator('#review').isHidden()&&await p.locator('#filters').isHidden(),'Manual panel coordination changed');
        if(width===390)check(await p.locator('#details').isHidden(),'Manual narrow Checks did not close Inspector');
        await p.locator('#analysis-explore').click();await settle(p);
        check(await p.evaluate(()=>document.activeElement===$('graph')),'Explore did not return graph focus');
        check(await camera(p)===before,'Guidance changed the camera');
        await p.reload();await p.waitForFunction(()=>state.live?.status);await settle(p);
        check(await p.locator('#analysis').isHidden(),'Handled guide reopened after reload');
        check(controls===0,'Dismissing guidance started analysis');
      }finally{release();await context.close();}
    }
    const denied=await browser.newContext(),deniedPage=await denied.newPage();
    try{
      await denied.addInitScript(()=>{Storage.prototype.getItem=Storage.prototype.setItem=()=>{throw Error('Storage blocked');};});
      await deniedPage.goto(url);await deniedPage.waitForFunction(()=>state.live?.status&&!$('analysis').hidden);
      await deniedPage.locator('#analysis-explore').click();
      await deniedPage.evaluate(()=>{state.analysis.render(state.live.status);state.analysis.render(state.live.status);});
      check(await deniedPage.locator('#analysis').isHidden(),'Storage denial repeats the introduction within a session');
      await deniedPage.locator('#toggle-analysis').click();
      check(await deniedPage.locator('#analysis').isVisible(),'Storage denial disables manual Checks');
    }finally{await denied.close();}
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),p=await context.newPage();
    p.on('pageerror',e=>errors.push(e.message));let controls=0;
    p.on('request',r=>{if(r.url().endsWith('/monitor/control'))controls++;});
    try{
      await p.goto(url);await p.waitForFunction(()=>state.live?.status&&!$('analysis').hidden);
      check(await p.locator('#analysis-overview-checks [data-status="disabled"]').count()===2,'Off coverage is not explicit');
      check(/do not install tools, build the project or guarantee completion/.test(await p.locator('#analysis-recommendation').innerText()),
        'Recommended action overpromises');
      check(await p.locator('#analysis-recommended').isEnabled(),'Recommended checks are unavailable for an idle Off project');
      const before=await camera(p);
      for(const colorScheme of ['light','dark'])for(const width of [1440,1080,390]){
        await p.emulateMedia({colorScheme});await p.setViewportSize({width,height:1000});await settle(p);
        check(await p.evaluate(()=>['toggle-analysis','toggle-review','view-controls','toggle-details'].every(id=>{
          const b=$(id).getBoundingClientRect();return b.left>=0&&b.right<=innerWidth&&b.width>20;
        })),'Primary actions need horizontal scrolling');
        check(await p.evaluate(()=>$('analysis').scrollWidth<=$('analysis').clientWidth+1),'Guidance overflows the panel');
        check(await p.evaluate(()=>{const height=document.querySelector('.scope-bar').getBoundingClientRect().height;
          const status=structuredClone(state.live.status);status.targets.find(t=>t.id===state.target.id).error='Synthetic status change';
          state.analysis.render(status);const stable=document.querySelector('.scope-bar').getBoundingClientRect().height===height;
          state.analysis.render(state.live.status);return stable;}),'Status changes resize the toolbar');
        await screenshot(p,`guidance-${colorScheme}-${width}`);
      }
      await p.setViewportSize({width:1440,height:1000});
      await p.locator('[name="check-native"]').selectOption('on');
      check(await p.locator('#analysis-recommended').isDisabled(),'Recommended checks can overwrite a draft');
      await p.locator('#analysis-discard').click();
      await p.locator('#analysis-close').click();
      check(await p.evaluate(()=>document.activeElement===$('toggle-analysis')),'Close lost keyboard focus');
      await p.locator('#toggle-analysis').click();await p.locator('[name="check-native"]').focus();await p.keyboard.press('Escape');
      check(await p.locator('#analysis').isHidden(),'Escape did not dismiss guidance');
      await p.evaluate(()=>{const s=structuredClone(state.live.status),t=s.targets.find(t=>t.id===state.target.id);
        t.state='failed';t.error='Synthetic compiler failure after dismissal';state.analysis.render(s);});
      check((await p.locator('#toggle-analysis').innerText()).includes('failed'),'Handled guide hid a later failure');
      check(await p.locator('#analysis').isHidden(),'Later failure reopened the introduction');
      await p.locator('#toggle-analysis').click();
      check((await p.locator('#analysis-error').innerText()).includes('Synthetic compiler failure'),'Later failure has no explanation');
      await p.evaluate(()=>state.analysis.render(state.live.status));
      check(controls===0,'Guidance or draft controls started analysis');
      await hold(true);
      const requested=p.waitForRequest(r=>r.url().endsWith('/monitor/control')&&r.postDataJSON().action==='checks');
      await p.locator('#analysis-recommended').click();await requested;
      await p.waitForFunction(()=>!$('analysis-stop').hidden&&!$('analysis-stop').disabled);
      check(await p.evaluate(()=>Object.values(state.analysis.choices).every(select=>select.value==='auto')),
        'Recommended checks did not apply Auto');
      await p.locator('#analysis-stop').click();
      await p.waitForFunction(()=>state.live.status.targets.find(t=>t.id===state.target.id).state==='paused');
      check(await camera(p)===before,'Recommended/Stop changed exploration state');
    }finally{await hold(false);await context.close();}
    check(!errors.length,errors.join('; '));
    return {firstOpening:true,readingPanels:8,reload:true,focus:true,themes:true,widths:[390,1080,1440],
      noImplicitRequests:true,draftSafety:true,laterFailure:true,storageRefusal:true,recommendedAuto:true,stop:true,errors};
  }
  check(await page.locator('#toggle-analysis').count()===1,'Checks has no persistent primary control');
  await page.waitForFunction(()=>state.analysis&&state.live?.status);
  await page.waitForFunction(()=>state.live.status.targets.find(t=>t.id===state.target.id).state==='fresh');
  if(await page.locator('#analysis').isHidden())await page.locator('#toggle-analysis').click();
  check((await page.locator('#analysis').innerText()).includes('Module architecture'),'Missing map foundation explanation');
  check(await page.locator('#analysis [name="check-foundation"]').count()===0,'Mandatory map foundation is selectable');
  check(await page.locator('#analysis [name="check-native"]').count()===1,'C++ mode is not available');
  check(await page.locator('#analysis [name="check-duplication"]').count()===1,'Duplication mode is not available');
  await page.locator('#analysis-close').click();
  check(await page.evaluate(()=>document.activeElement===$('toggle-analysis')),'Analysis close loses focus');
  for(const width of [1080,390]){
    await page.setViewportSize({width,height:844});
    check(await page.evaluate(()=>['toggle-analysis','toggle-review','view-controls','toggle-details'].every(id=>{
      const b=$(id).getBoundingClientRect();return b.left>=0&&b.right<=innerWidth;
    })),'A primary action requires horizontal scrolling');
  }
  await page.locator('#view-summary').click();await page.keyboard.press('Escape');
  check(await page.evaluate(()=>!$('view-controls').open&&document.activeElement===$('view-summary')),'View does not close by keyboard');
  await page.setViewportSize({width:1440,height:1000});await page.locator('#toggle-analysis').click();
  await page.locator('[name="check-native"]').focus();await page.keyboard.press('Escape');
  check(await page.locator('#analysis').isHidden(),'Escape from a check selector does not close Analysis');
  await page.locator('#toggle-analysis').click();
  await page.locator('[name="check-native"]').selectOption('auto');
  await page.locator('[name="check-duplication"]').selectOption('auto');
  await hold(true);await page.locator('#analysis-run').click();
  await page.waitForFunction(()=>!$('analysis-stop').hidden&&!$('analysis-stop').disabled);
  await page.locator('#analysis-stop').click();
  await page.waitForFunction(()=>state.live.status.targets.find(t=>t.id===state.target.id).state==='paused');
  await hold(false);
  check((await page.locator('#analysis-status').innerText()).includes('previous'),'Stopped state does not explain retained results');
  await page.locator('[name="check-native"]').selectOption('off');
  await page.locator('[name="check-duplication"]').selectOption('off');
  const revision=await page.evaluate(()=>state.analysis.base.revision);
  const other=await page.context().newPage();
  await hold(true);
  try{
    await other.goto(page.url());await other.waitForFunction(()=>state.analysis?.base&&state.live?.status);
    if(await other.locator('#analysis').isHidden())await other.locator('#toggle-analysis').click();
    await other.locator('[name="check-native"]').selectOption('off');
    await other.locator('[name="check-duplication"]').selectOption('auto');
    await other.locator('#analysis-run').click();
    await page.waitForFunction(revision=>state.live.status.targets.find(t=>t.id===state.target.id).revision>revision,revision);
    check(await page.evaluate(revision=>state.analysis.base.revision===revision,revision),'Polling rewrote a dirty form baseline');
    await page.locator('#analysis-run').click();
    await page.waitForFunction(()=>state.analysis.error?.includes('Another tab'));
    check(await page.locator('[name="check-duplication"]').inputValue()==='off','Conflict erased the draft choices');
    await page.locator('#analysis-discard').click();
    check(await page.locator('[name="check-duplication"]').inputValue()==='auto','Reload did not show the pending choices');
  }finally{await other.close();await hold(false);}
  await page.locator('[name="check-native"]').selectOption('off');
  await page.locator('[name="check-duplication"]').selectOption('off');
  await page.locator('#analysis-run').click();
  await page.waitForFunction(()=>{
    const t=state.live.status.targets.find(t=>t.id===state.target.id);
    return t.active&&t.state==='fresh'&&!t.requested&&t.ready.recipe.checks?.native==='off';
  });
  let release,received,finished;const delayed=new Promise(r=>release=r),responded=new Promise(r=>received=r),handled=new Promise(r=>finished=r);
  let captured=false;
  const intercept=async route=>{
    if(!captured&&route.request().postDataJSON().action==='checks'){
      captured=true;
      try{const response=await route.fetch();received();await delayed;await route.fulfill({response});}
      finally{finished();}
    }else await route.continue();
  };
  await hold(true);await page.route('**/monitor/control',intercept);
  try{
    await page.locator('[name="check-duplication"]').selectOption('auto');await page.locator('#analysis-run').click();
    await responded;
    check(await page.locator('[name="check-native"]').isDisabled()&&
      await page.locator('[name="check-duplication"]').isDisabled(),'Mode selectors remain editable during Apply');
    const submitted=await page.locator('[name="check-duplication"]').inputValue();
    const box=await page.locator('[name="check-duplication"]').boundingBox();
    await page.mouse.click(box.x+box.width/2,box.y+box.height/2);await page.keyboard.press('ArrowUp');
    check(await page.locator('[name="check-duplication"]').inputValue()===submitted,'An in-flight edit changed the submitted form');
    for(const id of ['historical','sample']){
      await page.locator('#target').selectOption(id);
      await page.waitForFunction(id=>state.target.id===id&&state.analysis.target===id,id);
    }
    if(await page.locator('#analysis').isHidden())await page.locator('#toggle-analysis').click();
    await page.locator('[name="check-duplication"]').selectOption('off');
    release();await page.waitForResponse(r=>r.url().endsWith('/monitor/control')&&r.request().postDataJSON().action==='checks');
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    check(await page.evaluate(()=>state.analysis.edited&&state.analysis.choices.duplication.value==='off'),
      'A late response erased a new draft after returning to the same project');
  }finally{release();if(captured)await handled;await page.unroute('**/monitor/control',intercept);await hold(false);}
  await page.locator('#analysis-run').click();
  await page.waitForFunction(()=>{
    const t=state.live.status.targets.find(t=>t.id===state.target.id);
    return t.state==='fresh'&&!t.requested&&t.ready.recipe.checks.duplication==='off';
  });
  return {primaryControls:true,readOnlyFoundation:true,optionalModes:true,focus:true,narrow:true,viewKeyboard:true,
    stop:true,retainedMap:true,appliedSettings:true,staleTab:true,dirtyForm:true,lateTargetResponse:true};
}
