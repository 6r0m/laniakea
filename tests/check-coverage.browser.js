// SPDX-License-Identifier: AGPL-3.0-or-later
// Start from a module-only Sample snapshot; the harness publishes synthetic native facts through the pipeline.
async(page,{publishNative})=>{
  const check=(value,message)=>{if(!value)throw Error(message);};
  await page.waitForFunction(()=>state.analysis?.base&&state.live&&!state.live.running);
  await page.evaluate(()=>state.live.stop());
  if(await page.locator('#analysis').isHidden())await page.locator('#toggle-analysis').click();
  const old=await page.evaluate(()=>({run:state.target.run,pins:JSON.stringify(state.positionCache.layouts)}));
  check(!/Recorded/.test(await page.locator('#check-native-status').innerText()),'Fixture already has native coverage');
  await page.evaluate(()=>{state.positionCache.errors.add('synthetic/save');unsavedPositionCaches.add(state.positionCache);});
  const run=await publishNative();
  const poll=()=>page.evaluate(async()=>{state.live.stopped=false;await state.live.tick();state.live.stop();});
  await poll();
  check(await page.evaluate(old=>state.target.run===old,old.run),'Blocked update replaced the displayed map');
  check(!/Recorded/.test(await page.locator('#check-native-status').innerText()),'Ready native evidence leaked into displayed coverage');
  check(await page.locator('#analysis-ready').isVisible()&&/Not displayed yet/.test(await page.locator('#analysis-ready').innerText()),
    'New coverage lacks a pending-adoption explanation');
  check(/Update ready: Recorded/.test(await page.locator('#check-native-detail').innerText()),'Ready native coverage is missing');
  check(/Displayed map: 1 of 3/.test(await page.locator('#toggle-analysis').getAttribute('title')),'Toolbar counts ready evidence as displayed');
  await page.evaluate(()=>{state.positionCache.errors.clear();unsavedPositionCaches.clear();});
  await page.waitForFunction(()=>!liveBlockReason());await poll();
  check(await page.evaluate(run=>state.target.run===run,run),'Ready native snapshot did not adopt');
  check(/Recorded in displayed map/.test(await page.locator('#check-native-status').innerText()),'Adoption did not update displayed coverage');
  check(await page.locator('#analysis-ready').isHidden(),'Adoption left a stale ready notice');
  check(await page.evaluate(pins=>JSON.stringify(state.positionCache.layouts)===pins,old.pins),'Coverage inspection changed pins');
  return {displayedEvidence:true,pendingEvidence:true,guardedAdoption:true,pinsUnchanged:true};
}
