// SPDX-License-Identifier: AGPL-3.0-or-later
// Run against the disposable Review fixture through the normal server and read index.
async page=>{
  const check=(ok,message)=>{if(!ok)throw Error(message);},errors=[],writes=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{
    requests.push(r.url());if(r.method()==='POST')writes.push(r.url());
  });
  await page.waitForFunction(()=>state.review.data&&!state.review.requests.size);
  const pins=await page.evaluate(()=>JSON.stringify(state.positionCache.layouts));
  await page.locator('#inspect-project').click();
  const details=page.getByRole('tab',{name:'Details',exact:true}),architecture=page.getByRole('tab',{name:/^Architecture/});
  await details.waitFor({timeout:3000});
  check(await details.getAttribute('aria-selected')==='true','Project should open Details');
  await details.focus();await page.keyboard.press('ArrowLeft');
  check(await architecture.getAttribute('aria-selected')==='true','ArrowLeft did not activate Architecture');
  await page.keyboard.press('End');check(await details.getAttribute('aria-selected')==='true','End did not select Details');
  await page.keyboard.press('Home');check(await architecture.getAttribute('aria-selected')==='true','Home did not select Architecture');
  await page.getByRole('button',{name:'Close inspector',exact:true}).click();
  await page.locator('#toggle-review').click();
  const id=await page.evaluate(()=>[...state.review.findingIndex.values()].find(f=>f.kind==='native').id);
  const referenceRequests=()=>requests.filter(url=>url.includes('/references')).length,before=referenceRequests();
  await page.locator(`#review-items [data-finding="${id}"]`).click();
  const card=page.locator(`#details [data-review-finding="${id}"]`);await card.waitFor();
  check(await architecture.getAttribute('aria-selected')==='true','A finding did not open Architecture');
  check(await architecture.evaluate(n=>n===document.activeElement),'Queue selection did not focus its inspector tab');
  check(referenceRequests()===before,'Opening Architecture eagerly requested ordinary reference pages');
  check(await page.locator('#inspector-page-details .review-finding').count()===0,'Findings leaked into Details');
  check(await page.locator('#inspector-page-architecture .reference-pager').count()===0,'Ordinary references leaked into Architecture');
  await card.getByLabel('Decision reason (optional)').fill('Unfinished synthetic decision');
  await card.getByText('Exact evidence',{exact:true}).click();
  await card.getByRole('button',{name:'Inspect recorded reference',exact:true}).click();await card.locator('li').waitFor();
  await details.click();await page.locator('#inspector-page-details .reference-pager').first().waitFor();
  await page.waitForFunction(()=>!document.querySelector('#inspector-page-details').textContent.includes('Loading references...'));
  const retained=await page.evaluate(()=>{
    const panel=$('inspector-page-details');panel.scrollTop=100;
    globalThis.inspectorDetailNode=panel.firstChild;
    return{epoch:state.referenceEpoch,selection:state.selection.id,scroll:panel.scrollTop,
      camera:JSON.stringify([worldZoom(),state.cy.pan()])};
  });
  await architecture.click();await details.click();
  check(await page.evaluate(before=>state.referenceEpoch===before.epoch&&state.selection.id===before.selection&&
    $('inspector-page-details').scrollTop===before.scroll&&$('inspector-page-details').firstChild===inspectorDetailNode&&
    JSON.stringify([worldZoom(),state.cy.pan()])===before.camera,retained),'Tab switching reset inspection, scroll or camera');
  await architecture.click();
  check(await card.getByLabel('Decision reason (optional)').inputValue()==='Unfinished synthetic decision','Tab switching lost the draft');
  check(await card.locator('li').count()===1,'Tab switching lost loaded evidence');
  await page.keyboard.press('Escape');check(await page.locator('#details').isHidden(),'Escape did not close inspection');
  await page.setViewportSize({width:1000,height:800});
  if(await page.locator('#review').isHidden())await page.locator('#toggle-review').click();
  await page.locator(`#review-items [data-finding="${id}"]`).click();await card.waitFor();
  check(await page.locator('#review').isHidden(),'The narrow queue still crowds the inspector');
  check(await page.locator('#map').boundingBox().then(r=>r.width>600),'The narrow map is squeezed between two panels');
  await page.locator('#toggle-review').click();check(await page.locator('#details').isHidden(),'Opening the narrow queue left the inspector visible');
  await page.locator(`#review-items [data-finding="${id}"]`).click();await card.waitFor();
  await page.setViewportSize({width:640,height:800});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Inspector overflows the narrow window');
  await page.getByRole('button',{name:'Close inspector',exact:true}).click();
  check(await page.locator('#toggle-details').evaluate(n=>n===document.activeElement),'Close did not restore toolbar focus');
  await page.setViewportSize({width:1440,height:1000});
  let release,arrive;const gate=new Promise(resolve=>release=resolve),arrived=new Promise(resolve=>arrive=resolve);
  const reviewUrl=await page.evaluate(()=>state.target.review_url),pattern='**'+reviewUrl+'?*';
  await page.route(pattern,async route=>{if(new URL(route.request().url()).searchParams.has('node')){arrive();await gate;}await route.continue();});
  await page.evaluate(()=>{state.review.pages.clear();state.review.pendingFinding=null;selectNode('A');});await arrived;
  await details.click();release();await page.waitForFunction(()=>!state.review.requests.size);
  check(await details.getAttribute('aria-selected')==='true','A late review response switched tabs');
  await page.getByRole('button',{name:'Close inspector',exact:true}).click();
  await page.unroute(pattern);
  await page.route(pattern,async route=>new URL(route.request().url()).searchParams.has('node')?
    route.fulfill({status:503,body:'Synthetic inspector refusal'}):route.continue());
  await page.evaluate(()=>{state.review.pages.clear();selectNode('A');});
  await page.locator('#inspector-page-architecture').getByText(/Synthetic inspector refusal/).waitFor();
  await page.evaluate(()=>state.review.refreshInspection());
  check(await architecture.innerText().then(t=>/failed/i.test(t)),'Failed findings look like zero findings');
  await details.click();check(await page.locator('#inspector-page-details').isVisible(),'Review failure blocked Details');
  await page.unroute(pattern);await page.getByRole('button',{name:'Close inspector',exact:true}).click();
  check(await page.evaluate(()=>JSON.stringify(state.positionCache.layouts))===pins,'Inspector changed saved pins');
  check(!errors.length&&!writes.length,'Inspector failed or wrote state: '+JSON.stringify({errors,writes}));
  return{tabs:true,keyboard:true,separation:true,lazyReferences:true,retainedContent:true,draft:true,lateResponse:true,
    failure:true,narrow:true,closeFocus:true,pinsUnchanged:true,errors,writes};
}
