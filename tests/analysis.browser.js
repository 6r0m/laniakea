// SPDX-License-Identifier: AGPL-3.0-or-later
// A monitored Sample target, with controllable owned-work timing supplied by the harness.
async (page,{hold=async()=>{}}={})=>{
  const check=(value,message)=>{if(!value)throw Error(message);};
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
