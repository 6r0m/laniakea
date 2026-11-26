// SPDX-License-Identifier: AGPL-3.0-or-later
// Start from a module-only Sample snapshot; the harness publishes synthetic native facts through the pipeline.
async(page,{publishNative})=>{
  const check=(value,message)=>{if(!value)throw Error(message);};
  await page.waitForFunction(()=>state.analysis?.base&&state.live&&!state.live.running);
  await page.evaluate(()=>state.live.stop());
  if(await page.locator('#analysis').isHidden())await page.locator('#toggle-analysis').click();
  const native=page.locator('[data-check="native"]');
  if(!await native.evaluate(node=>node.open))await native.locator(':scope > summary').click();
  const help=native.getByRole('button',{name:'About C++ usage and references',exact:true});
  const explanation=native.locator('.check-help');
  const nextCheck=page.locator('[data-check="duplication"]');
  const nextPosition=await nextCheck.boundingBox();
  check(await explanation.isHidden(),'Check help must start collapsed');
  await help.hover();
  check(await explanation.isVisible(),'Hovering the question mark did not show check help');
  check((await nextCheck.boundingBox()).y===nextPosition.y,'Opening check help moved the next check');
  await explanation.hover();
  check(await explanation.isVisible(),'Moving into the explanation collapsed check help');
  await page.mouse.move(4,4);
  await explanation.waitFor({state:'hidden'});
  await native.locator(':scope > summary').focus();await page.keyboard.press('Tab');
  check(await help.getAttribute('aria-expanded')==='true'&&await explanation.isVisible(),'Check help cannot be opened by keyboard');
  check(/Why it matters/.test(await explanation.innerText())&&/Clang/.test(await explanation.innerText()),'Check help lacks purpose or method');
  await native.evaluate(node=>{window.openNativeCheck=node;});
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
  check(await page.locator('#check-native-status').innerText()==='Recorded','Adoption did not update displayed coverage');
  check(await native.evaluate(node=>node===window.openNativeCheck&&node.open&&document.activeElement===node.querySelector('.check-help-toggle')),
    'Adopting coverage replaced the open check or displaced keyboard focus');
  check(await explanation.isVisible(),'Adopting coverage collapsed check help');
  await page.keyboard.press('Escape');
  check(await explanation.isHidden()&&await page.locator('#analysis').isVisible(),'Escape closed the Checks panel while reading help');
  check(await page.locator('#analysis-ready').isHidden(),'Adoption left a stale ready notice');
  check(await page.evaluate(pins=>JSON.stringify(state.positionCache.layouts)===pins,old.pins),'Coverage inspection changed pins');
  return {displayedEvidence:true,pendingEvidence:true,guardedAdoption:true,pinsUnchanged:true};
}
