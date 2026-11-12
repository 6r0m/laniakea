// SPDX-License-Identifier: AGPL-3.0-or-later
// Serve test_review.fixture through the ordinary pipeline/index/server in a disposable workspace.
async page=>{
  const check=(ok,message)=>{if(!ok)throw Error(message);},errors=[],requests=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{requests.push(r);if(r.method()==='POST'&&r.url().includes('/layout/'))writes.push(r.url());});
  const pins=await page.evaluate(()=>JSON.stringify(state.positionCache.layouts));
  const initial=await page.evaluate(()=>({elements:state.cy.elements().length,url:state.target.review_url}));
  const clickStar=async id=>{const p=await page.evaluate(id=>{const p=state.cy.getElementById(id).renderedPosition(),b=$('graph').getBoundingClientRect();
    return{x:p.x+b.x,y:p.y+b.y};},id);await page.mouse.click(p.x,p.y);};
  check(await page.evaluate(()=>!state.review.enabled),'Review should start disabled');
  if(await page.evaluate(()=>new URL(location.href).searchParams.has('policy-proof'))) {
    await page.getByRole('button',{name:'Review',exact:true}).click();
    await page.waitForFunction(()=>state.review.data?.counts.violation===1);
    await clickStar('A');
    const card=page.locator('#details [data-review-finding]');await card.waitFor();
    check(await card.innerText().then(t=>t.includes('! Policy violation')),'Configured violation is not identified');
    check(await page.evaluate(()=>state.cy.getElementById('A').data('reviewMark').startsWith('violation:')),'Violation badge missing');
    await card.getByText('Exact evidence',{exact:true}).click();
    await card.getByRole('button',{name:'Inspect recorded reference',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.review-details li'));
    await card.getByRole('button',{name:'Not relevant',exact:true}).focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>state.review.data?.counts.acknowledged===1&&state.review.data.total===0);
    check(await page.evaluate(()=>document.activeElement?.id==='review-recheck'),
      'Acknowledging the last finding left keyboard focus on the removed action');
    check(await page.evaluate(()=>!state.review.badges.size),'Acknowledged-only entity retained a badge');
    await page.reload();await page.waitForFunction(()=>state.cy&&state.positionCache);
    await page.getByRole('button',{name:'Review',exact:true}).click();
    await page.waitForFunction(()=>state.review.data?.counts.acknowledged===1);
    await page.getByLabel('Show acknowledged',{exact:true}).check();
    await page.waitForFunction(()=>state.review.data?.total===1);
    await clickStar('A');await card.getByRole('button',{name:'Reopen',exact:true}).click();
    await page.waitForFunction(()=>state.review.data?.counts.violation===1&&state.review.data.counts.acknowledged===0);
    check(await page.evaluate(()=>JSON.stringify(state.positionCache.layouts))===pins,'Policy review changed positions');
    check(errors.length===0,'Policy browser errors');
    return {configuredViolation:true,exactEvidence:true,acknowledgedOnly:true,reloadPersistence:true,reopen:true,pinsUnchanged:true,errors};
  }
  let releaseLoading,arriveLoading;
  const loadingWaiting=new Promise(resolve=>arriveLoading=resolve),loadingGate=new Promise(resolve=>releaseLoading=resolve);
  const loadingPattern='**'+initial.url+'?*';
  await clickStar('A');
  await page.route(loadingPattern,async route=>{arriveLoading();await loadingGate;await route.continue();});
  await page.getByRole('button',{name:'Review',exact:true}).click();await loadingWaiting;
  await page.waitForFunction(()=>state.mapSize.width===$('graph').getBoundingClientRect().width);
  const loadingZoom=await page.evaluate(()=>worldZoom()),loadingBox=await page.locator('#graph').boundingBox();
  await page.mouse.move(loadingBox.x+30,loadingBox.y+40);await page.mouse.wheel(0,-10);
  await page.waitForFunction(before=>worldZoom()!==before,loadingZoom);
  check(await page.evaluate(()=>!state.review.data),'Expected the analysis request to remain pending during camera input');
  const readingControl=page.locator('#details [data-action="toggle-group"]');
  await readingControl.evaluate(node=>node.dataset.readingProbe='ordinary-inspection');await readingControl.focus();
  releaseLoading();
  await page.waitForFunction(()=>state.review.data?.total===2);
  check(await page.evaluate(()=>document.activeElement?.dataset.readingProbe==='ordinary-inspection'),
    'Background review completion replaced the ordinary reference reader or stole keyboard focus');
  await page.getByRole('button',{name:'Close details',exact:true}).click();
  await page.waitForFunction(()=>state.mapSize.width===$('graph').getBoundingClientRect().width);
  await page.unroute(loadingPattern);
  check(!await page.locator('#review-items').innerText().then(text=>text.includes('off-view')),
    'Visible marked entities were incorrectly labelled off-view');
  check(await page.evaluate(()=>state.cy.elements().length)===initial.elements,'Review added graph elements');
  const nativeId=await page.evaluate(()=>state.review.data.items.find(f=>f.kind==='native').id);
  await page.locator(`#review-items [data-finding="${nativeId}"]`).click();
  await page.locator('#details [data-review-finding]').first().waitFor();
  check(await page.locator('#details [data-review-finding]').count()===1,'Choosing one list finding opened unrelated concerns');
  await page.getByRole('button',{name:'Close details',exact:true}).click();
  await clickStar('A');
  const native=page.locator('#details .review-finding').filter({hasText:'Possible missing direct build dependency'});
  await native.waitFor();
  await native.getByText('Exact evidence',{exact:true}).click();
  await native.getByRole('button',{name:'Inspect recorded reference',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.review-details')?.textContent.includes('Source/Sample.cpp'));
  await native.getByLabel('Decision reason (optional)').fill('Intentional synthetic relationship');
  await native.getByRole('button',{name:'Accept risk',exact:true}).click();
  await page.waitForFunction(()=>state.review.data?.counts.acknowledged===1&&state.review.data.total===1);
  check(await native.count()===0,'Acknowledged finding still clutters entity Details');
  let releaseAck,arriveAck;
  const ackWaiting=new Promise(resolve=>arriveAck=resolve),ackGate=new Promise(resolve=>releaseAck=resolve);
  const ackPattern='**'+initial.url+'?*';
  await page.route(ackPattern,async route=>{
    const query=new URL(route.request().url()).searchParams;
    if(query.get('ack')==='true'&&!query.has('node')){arriveAck();await ackGate;}
    await route.continue();
  });
  await page.getByLabel('Show acknowledged',{exact:true}).check();await ackWaiting;
  await page.getByLabel('Show acknowledged',{exact:true}).uncheck();
  await page.waitForFunction(()=>state.review.data?.total===1);
  releaseAck();await page.waitForFunction(()=>!state.review.requests.size);
  check(await page.evaluate(()=>state.review.data.total===1&&!state.review.ack),'Late acknowledged response replaced the active list');
  await page.unroute(ackPattern);
  await page.getByLabel('Show acknowledged',{exact:true}).check();
  await page.waitForFunction(()=>state.review.data?.total===2);
  await native.getByRole('button',{name:'Reopen',exact:true}).click();
  await page.waitForFunction(()=>state.review.data?.counts.acknowledged===0);
  await page.getByLabel('Show acknowledged',{exact:true}).uncheck();
  await page.waitForFunction(()=>state.review.data?.total===2&&!state.review.ack);
  await page.route('**'+initial.url,async route=>{
    if(route.request().method()==='POST'&&route.request().postDataJSON()?.action==='triage')
      return route.fulfill({status:503,body:'Synthetic write refusal'});
    return route.continue();
  });
  await native.getByRole('button',{name:'Not relevant',exact:true}).click();
  await native.getByText(/Synthetic write refusal/).waitFor();
  check(await page.evaluate(()=>state.review.data.counts.acknowledged===0&&state.review.data.total===2),'Refused write changed visible triage');
  await page.unroute('**'+initial.url);
  await page.getByRole('button',{name:'Close details',exact:true}).click();
  let release,arrived;
  const waiting=new Promise(resolve=>arrived=resolve),gate=new Promise(resolve=>release=resolve);
  const pattern='**'+initial.url+'?*';
  await page.route(pattern,async route=>{if(new URL(route.request().url()).searchParams.has('node')) {
    arrived();await gate;
  }await route.continue();});
  await page.evaluate(()=>state.review.pages.clear());
  await clickStar('A');await waiting;
  await page.getByRole('button',{name:'Close details',exact:true}).click();release();
  await page.waitForFunction(()=>!state.review.requests.size);
  check(await page.locator('#details').isHidden(),'Late review request reopened closed inspection');
  await page.unroute(pattern);
  await page.setViewportSize({width:640,height:900});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Review overflows narrow viewport');
  await page.getByRole('button',{name:'Recheck',exact:true}).click();
  await page.waitForFunction(()=>state.review.data?.total===2&&!state.review.requests.size);
  await clickStar('A');await page.locator('#details .review-details').waitFor();
  await page.route('**'+initial.url,async route=>route.request().method()==='POST'&&route.request().postDataJSON()?.action==='recheck'?
    route.fulfill({status:400,body:'Synthetic invalid policy'}):route.continue());
  await page.getByRole('button',{name:'Recheck',exact:true}).click();
  await page.locator('#review-status').getByText(/Synthetic invalid policy/).waitFor();
  check(await page.locator('#review-items [data-finding]').count()===0&&await page.locator('#details .review-details').count()===0,
    'Failed recheck retained apparently current findings');
  await page.unroute('**'+initial.url);
  await page.getByRole('button',{name:'Close architecture review',exact:true}).click();
  check(await page.evaluate(()=>!state.review.enabled&&!state.cy.nodes().some(n=>n.data('reviewMark'))),'Review off retained badges');
  check(await page.evaluate(()=>JSON.stringify(state.positionCache.layouts))===pins,'Review modified pins');
  check(writes.length===0,'Review wrote positions');check(errors.length===0,'Browser errors: '+errors.join('; '));
  return {review:true,exactEvidence:true,triage:true,refusal:true,lateClose:true,pinsUnchanged:true,
    requests:requests.filter(r=>r.url().includes('/review')).length,errors};
}
