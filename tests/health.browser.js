// SPDX-License-Identifier: AGPL-3.0-or-later
// Serve test_health.browser_fixture through the ordinary pipeline, read index and server.
async page=>{
  const check=(ok,message)=>{if(!ok)throw Error(message);},errors=[],writes=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{requests.push(r.url());if(r.method()==='POST'&&r.url().includes('/layout/'))writes.push(r.url());});
  await page.waitForFunction(()=>state.review.data&&!state.review.requests.size);
  const pins=await page.evaluate(()=>JSON.stringify(state.positionCache.layouts));
  check(await page.evaluate(()=>state.review.data.counts.candidate===1),'Missing source candidate');
  await page.locator('#toggle-review').click();
  check(await page.locator('#review-items').innerText().then(t=>t.includes('API.h')&&t.includes('Producer.cpp')),
    'Queue hides the source files behind repeated module names');
  await page.locator('#review-items button[data-finding]').click();
  const review=page.locator('#inspector-page-architecture');
  await review.getByText('Duplicated source tokens',{exact:true}).waitFor();
  check(await review.innerText().then(t=>t.includes('Duplication / 120 tokens / 54 matching ranges')),'Category/count explanation missing');
  check(!requests.some(u=>u.includes('evidence=true')),'Source ranges were fetched eagerly');
  await review.getByText('Exact evidence',{exact:true}).click();
  await review.getByText('1-50 of 54 snapshot ranges',{exact:true}).waitFor();
  check(await review.locator('a[href^="vscode://file/"]').count()===50,'Source links not bounded to a page');
  await review.getByRole('button',{name:'Next source ranges',exact:true}).click();
  await review.getByText('51-54 of 54 snapshot ranges',{exact:true}).waitFor();
  await review.getByRole('button',{name:'Previous source ranges',exact:true}).click();
  await review.getByText('1-50 of 54 snapshot ranges',{exact:true}).waitFor();
  await review.getByRole('button',{name:'Accept risk',exact:true}).click();
  await page.waitForFunction(()=>state.review.data.counts.candidate===0&&state.review.data.counts.acknowledged===1);
  check(await page.evaluate(()=>state.cy.edges('.review-candidate,.review-violation').length===0),'Source observation created warning wires');
  await page.locator('#review-ack').check();
  await page.locator('#review-items button[data-finding]').click();
  await review.getByRole('button',{name:'Reopen',exact:true}).click();
  await page.waitForFunction(()=>state.review.data.counts.candidate===1);
  await page.locator('#review-close').click();
  await page.evaluate(()=>{const u=state.universe;flyToNode('module',false);u.expanded.add('module');refreshMap();frameNode('module');});
  await page.waitForFunction(()=>state.shard.nodes.some(n=>n.attrs?.source_file&&state.review.badges.has(n.id)));
  const file=await page.evaluate(()=>state.shard.nodes.find(n=>n.attrs?.source_file&&state.review.badges.has(n.id)).id);
  const p=await page.evaluate(id=>{const p=state.cy.getElementById(id).renderedPosition(),b=$('graph').getBoundingClientRect();
    return{x:p.x+b.x,y:p.y+b.y};},file);
  await page.mouse.click(p.x,p.y);
  await review.getByText('Duplicated source tokens',{exact:true}).waitFor();
  check(await review.innerText().then(t=>!t.includes('unknown review node')),'File context did not resolve the source finding');
  let arrive,release;
  const arrived=new Promise(r=>arrive=r),hold=new Promise(r=>release=r);
  await page.route('**/*evidence=true*',async route=>{arrive();await hold;await route.continue();});
  await review.getByText('Exact evidence',{exact:true}).click();await arrived;
  await page.getByRole('button',{name:'Close inspector',exact:true}).click();release();
  await page.waitForFunction(()=>!state.review.requests.size);
  check(await page.locator('#details').isHidden(),'Late source evidence reopened closed inspection');
  await page.unroute('**/*evidence=true*');
  await page.setViewportSize({width:540,height:800});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Narrow layout overflows');
  await page.reload();await page.waitForFunction(()=>state.review.data&&state.positionCache);
  check(await page.evaluate(()=>JSON.stringify(state.positionCache.layouts))===pins,'Health changed saved positions');
  check(writes.length===0,'Health wrote positions');check(errors.length===0,'Browser errors: '+errors.join('; '));
  return{sourcePages:true,triage:true,fileContext:true,lateClose:true,pinsUnchanged:true,sourceWires:0,errors};
}
