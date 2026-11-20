// SPDX-License-Identifier: AGPL-3.0-or-later
// A monitored Sample corpus; the harness edits synthetic build rules and holds staging until released.
async(page,{change,hold,inspect=async()=>{}})=>{
  const check=(value,message)=>{if(!value)throw Error(message);};
  await page.waitForFunction(()=>{const current=state.live?.status?.targets.find(t=>t.id===state.target.id);
    return state.analysis?.base&&current?.state==='fresh'&&current.ready.run===state.target.run&&current.comparison?.baseline===state.target.run;});
  if(await page.locator('#analysis').isHidden())await page.locator('#toggle-analysis').click();
  const old=await page.evaluate(()=>({run:state.target.run,pins:JSON.stringify(state.positionCache.layouts),
    zoom:worldZoom(),pan:{...state.cy.pan()},top:$('graph').getBoundingClientRect().top}));
  await hold(true);await change(0);
  await page.waitForFunction(()=>state.live.status.targets.find(t=>t.id===state.target.id).comparison?.total===123);
  check(/123 input changes detected/.test(await page.locator('#input-change-summary').innerText()),'Changes lack an explicit count');
  check(await page.evaluate(old=>$('graph').getBoundingClientRect().top===old.top,old),'Async comparison moved the map');
  check(/not monitored/.test(await page.locator('#input-change-detail').innerText()),'Off-mode coverage looks globally fresh');
  await page.locator('#input-change-show').click();await page.waitForFunction(()=>state.analysis.pathPage?.items.length===50);
  check(!await page.evaluate(()=>state.analysis.dirty()),'Read-only comparison created a draft');
  check(await page.locator('#input-change-list a').count()===50,'Recorded paths lost their source links');
  await inspect('paths');
  check((await page.locator('#input-change-list a').first().getAttribute('href')).endsWith(':1'),'Changed-line provenance was fabricated');
  const first=await page.locator('#input-change-list a').first();await first.focus();
  await page.evaluate(()=>state.analysis.render(state.live.status));
  check(await first.evaluate(node=>node===document.activeElement),'Polling replaced the focused path');
  await page.locator('#input-change-next').click();await page.waitForFunction(()=>state.analysis.pathPage?.cursor===50);
  await page.locator('#input-change-next').click();await page.waitForFunction(()=>state.analysis.pathPage?.cursor===100);
  check(await page.locator('#input-change-list li').count()===23,'Last page lost changed paths');
  check(await page.locator('#input-change-list a').count()===22,'Removed input acquired a source link');
  await page.locator('#input-change-previous').click();await page.waitForFunction(()=>state.analysis.pathPage?.cursor===50);
  if(!await page.locator('#analysis-settings').evaluate(node=>node.open))await page.locator('#analysis-settings > summary').click();
  await page.locator('[name="check-native"]').selectOption('auto');
  await page.locator('#input-change-next').click();await page.waitForFunction(()=>state.analysis.pathPage?.cursor===100);
  check(await page.evaluate(()=>state.analysis.edited&&state.analysis.choices.native.value==='auto'),'Paging erased check choices');
  await page.locator('#analysis-discard').click();
  let release,received;const delayed=new Promise(r=>release=r),responseReady=new Promise(r=>received=r);
  const intercept=async route=>{const response=await route.fetch();received();await delayed;await route.fulfill({response});};
  await page.route('**/monitor/changes?**',intercept);
  try{
    await page.locator('#input-change-previous').click();await responseReady;
    await page.locator('#analysis-close').click();release();
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    check(await page.locator('#analysis').isHidden(),'Late paths reopened Checks');
  }finally{release();await page.unroute('**/monitor/changes?**',intercept);}
  await page.locator('#toggle-analysis').click();
  for(const width of [1440,1080,390])for(const colorScheme of ['dark','light']){
    await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme});
    check(await page.evaluate(()=>$('analysis').scrollWidth<=$('analysis').clientWidth+1),'Long paths overflow Checks');
    check(await page.evaluate(()=>{const b=$('input-change-status').getBoundingClientRect();return b.left>=0&&b.right<=innerWidth;}),
      'Change inspection is off screen');
    if(width===390||width===1440)await inspect(`${width}-${colorScheme}`);
  }
  await page.setViewportSize({width:1440,height:1000});
  let finish,started;const delayedTarget=new Promise(r=>finish=r),targetReady=new Promise(r=>started=r);
  const pending=async route=>{const response=await route.fetch();started();await delayedTarget;await route.fulfill({response});};
  await page.route('**/monitor/changes?**',pending);
  try{
    await page.locator('#input-change-previous').click();await targetReady;
    await page.locator('#target').selectOption('historical');
    await page.waitForFunction(()=>state.target.id==='historical'&&state.analysis.target==='historical');finish();
    check((await page.locator('#input-change-list').innerText())==='','Old target paths leaked into another project');
  }finally{finish();await page.unroute('**/monitor/changes?**',pending);}
  await page.locator('#target').selectOption('sample');
  await page.waitForFunction(()=>state.target.id==='sample'&&state.analysis.target==='sample'&&state.analysis.base.run===state.target.run);
  if(await page.locator('#analysis').isHidden())await page.locator('#toggle-analysis').click();
  const token=await page.evaluate(()=>state.live.status.targets.find(t=>t.id==='sample').comparison.observation);
  await page.locator('[name="check-native"]').selectOption('auto');
  await change(1);await page.waitForFunction(token=>state.live.status.targets.find(t=>t.id==='sample').comparison.observation!==token,token);
  const stale=await page.evaluate(async({token,run})=>(await fetch('/monitor/changes?'+new URLSearchParams({target:'sample',run,observation:token}))).status,
    {token,run:old.run});check(stale===409,'Expired observation returned another page');
  await hold(false);
  await page.waitForFunction(run=>state.live.status.targets.find(t=>t.id==='sample').ready.run!==run,old.run);
  check(await page.evaluate(run=>state.target.run===run,old.run),'Draft did not defer adoption');
  check(/awaits the newer map/.test(await page.locator('#input-change-detail').innerText()),'Ready comparison leaked into an old map');
  check(await page.locator('#input-change-show').isHidden(),'New-run paths were offered for an old map');
  await page.locator('#analysis-discard').click();
  await page.waitForFunction(run=>state.target.run!==run,old.run);
  await page.waitForFunction(()=>state.live.status.targets.find(t=>t.id==='sample').comparison?.baseline===state.target.run);
  check(/Changes: limited scope/.test(await page.locator('#input-change-summary').innerText()),'Adoption retained old changes or hid the Off scope');
  check(await page.evaluate(pins=>JSON.stringify(state.positionCache.layouts)===pins,old.pins),'Read-only changes altered pins');
  await page.evaluate(()=>{state.live.stop();state.target.stale=true;state.target.changed=['Source/Legacy.Build.cs'];
    state.target.changed_count=1;state.live.status={targets:[]};renderBanner();});
  await page.locator('#banner summary').click();
  check(await page.locator('#banner').isVisible()&&(await page.locator('#banner').innerText()).includes('Legacy.Build.cs'),
    'No-monitor scan-enabled startup lost useful changed paths');
  return {pagedPaths:123,removedHasNoLink:true,offScope:true,stableMap:true,dirtyForm:true,lateClose:true,lateTarget:true,
    narrowThemes:true,expiredObservation:true,displayedBaseline:true,adoption:true,legacyBanner:true,pinsUnchanged:true};
}
