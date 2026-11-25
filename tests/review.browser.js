// SPDX-License-Identifier: AGPL-3.0-or-later
// Serve test_review.fixture through the ordinary pipeline/index/server in a disposable workspace.
async page=>{
  const check=(ok,message)=>{if(!ok)throw Error(message);},errors=[],requests=[],writes=[];
  await page.emulateMedia({reducedMotion:'no-preference'});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{requests.push(r);if(r.method()==='POST'&&r.url().includes('/layout/'))writes.push(r.url());});
  const pins=await page.evaluate(()=>JSON.stringify(state.positionCache.layouts));
  const initial=await page.evaluate(()=>({elements:state.cy.elements().length,url:state.target.review_url}));
  const clickStar=async id=>{const p=await page.evaluate(id=>{const p=state.cy.getElementById(id).renderedPosition(),b=$('graph').getBoundingClientRect();
    return{x:p.x+b.x,y:p.y+b.y};},id);await page.mouse.click(p.x,p.y);};
  const badgePixels=async()=>page.evaluate(async()=>{
    const cy=state.cy,n=cy.nodes('.expanded').find(n=>n.data('reviewMark')&&state.labelBoxes.has(n.id()))||
      cy.nodes().find(n=>n.data('reviewMark')&&!n.hasClass('expanded')),
      box=state.labelBoxes.get(n.id()),p=n.renderedPosition(),expanded=n.hasClass('expanded'),
      x=expanded?box.x1-33:p.x+n.width()*cy.zoom()/2,y=expanded?(box.y1+box.y2)/2:p.y-n.height()*cy.zoom()/2;
    const image=new Image();image.src=cy.png({output:'base64uri',scale:1});await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    const pixels=ctx.getImageData(Math.round(x)-8,Math.round(y)-8,16,16).data,
      color=css(n.data('reviewMark').startsWith('violation:')?'--review-violation':'--review-candidate'),
      rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));let count=0;
    for(let i=0;i<pixels.length;i+=4)if(rgb.every((v,c)=>Math.abs(v-pixels[i+c])<8))count++;
    return{count,expanded,x,y,color,width:image.width,graphWidth:cy.width(),position:p};
  });
  check(await page.evaluate(()=>state.review.enabled),'Review should start enabled');
  check(await page.locator('#review').isHidden(),'Automatic review should not cover the map with its list');
  await page.waitForFunction(()=>state.review.data&&!state.review.requests.size);
  await page.waitForFunction(()=>!state.gestureActive&&!state.viewportFrame&&!state.zoomFrame);
  check(await page.locator('#toggle-review').getAttribute('aria-label').then(t=>/candidate|violation/.test(t)),'Toolbar hides the result');
  const marked=await page.evaluate(()=>{
    const node=state.cy.nodes().find(n=>n.data('reviewMark')),edge=state.cy.edges('.review-candidate,.review-violation')[0];
    return{images:(node.style('background-image').match(/data:image\/svg\+xml/g)||[]).length,
      badge:parseFloat(node.style('background-width').split(/\s+/).at(-1))*state.cy.zoom(),
      wire:edge.id(),label:edge.style('label'),size:parseFloat(edge.style('font-size'))*state.cy.zoom(),
      glowWidth:2*edge.numericStyle('underlay-padding')*state.cy.zoom()};
  });
  check([3,4].includes(marked.images)&&Math.abs(marked.badge-16)<.1,'Warning icon is not independently readable: '+JSON.stringify(marked));
  check(['?','!'].includes(marked.label)&&marked.size>=12,'Idle wire hides its review symbol');
  check(marked.glowWidth>1.5&&marked.glowWidth<=3,'Review wire glow must read as a thin stroke');
  const paint=await badgePixels();check(paint.count>30,'Warning badge pixels: '+JSON.stringify(paint));
  await page.evaluate(()=>{
    const trace=ConnectionTrace.pair(state.shard,'A','B');
    const edge=state.cy.getElementById(state.universe.renderPrefix+trace.roles.keys().next().value);
    preview(edge,null,trace);
  });
  await page.waitForFunction(()=>document.querySelectorAll('#graph .wire-feed > span').length===2);
  check(await page.evaluate(()=>{
    const lights=[...document.querySelectorAll('#graph .wire-feed > span')];
    const tint=state.cy.edges('.focus.review-violation').length?css('--review-violation'):css('--review-candidate');
    return lights.length===2&&lights[0].style.offsetPath!==lights[1].style.offsetPath&&
      lights.every(light=>light.style.getPropertyValue('--wire-color')===tint&&light.classList.contains('wire-warning')&&
        getComputedStyle(light).getPropertyValue('--wire-peak').trim()==='1');
  }),'A witnessed cycle did not show opposing flows with Review severity');
  await page.evaluate(()=>unfocus());
  const pulseBadge=await page.evaluate(()=>state.cy.nodes().find(n=>!n.hasClass('expanded')&&
    n.data('reviewMark')?.endsWith(':false')).id());
  const wireSample=id=>{
    const edge=state.cy.getElementById(id);
    return {glow:Number(edge.style('underlay-opacity')),width:edge.renderedWidth(),label:edge.style('label')};
  };
  const staticGlow=marked.label==='!'?.22:.17;
  await page.waitForFunction(({id,base})=>Number(state.cy.getElementById(id).style('underlay-opacity'))>base+.07,
    {id:marked.wire,base:staticGlow},{timeout:5500});
  const brightWire=await page.evaluate(wireSample,marked.wire);
  const pulseSample=id=>{
    const n=state.cy.getElementById(id),layers=n.style('background-image-opacity').split(/\s+/).map(Number);
    const images=n.style('background-image').split(' ');
    const x=parseFloat(n.style('background-offset-x')),y=parseFloat(n.style('background-offset-y'));
    return {glow:layers.length===4?layers[0]:0,centered:x===0&&y===0&&images[0]===images[1],
      badge:layers.at(-1),width:n.renderedWidth(),position:n.renderedPosition()};
  };
  const peak=await page.waitForFunction(id=>{
    const n=state.cy.getElementById(id),alpha=n.style('background-image-opacity').split(/\s+/).map(Number);
    return alpha.length===4&&alpha[0]>.45;
  },pulseBadge,{timeout:5000});
  await peak.dispose();
  const bright=await page.evaluate(pulseSample,pulseBadge);
  check(bright.centered,'The pulse must use the star halo at its centre');
  await page.waitForTimeout(4600);
  const ongoing=await page.evaluate(pulseSample,pulseBadge);
  check(ongoing.glow>0,'The active star stopped pulsing');
  await page.waitForFunction(({id,glow})=>{
    const alpha=state.cy.getElementById(id).style('background-image-opacity').split(/\s+/).map(Number);
    return alpha.length===4&&Math.abs(alpha[0]-glow)>.05;
  },{id:pulseBadge,glow:ongoing.glow});
  const ongoingWire=await page.evaluate(wireSample,marked.wire);
  await page.waitForFunction(({id,glow})=>Math.abs(Number(state.cy.getElementById(id).style('underlay-opacity'))-glow)>.05,
    {id:marked.wire,glow:ongoingWire.glow},{timeout:5500});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.waitForFunction(id=>state.cy.getElementById(id).style('background-image-opacity').split(/\s+/).length===3,
    pulseBadge,{timeout:2000});
  const still=await page.evaluate(pulseSample,pulseBadge);
  const stillWire=await page.evaluate(wireSample,marked.wire);
  check(stillWire.glow===staticGlow&&brightWire.width===stillWire.width&&brightWire.label===stillWire.label,
    'Review pulse changed wire geometry or its badge, or reduced motion did not restore static lighting');
  check(bright.glow>still.glow&&still.badge===1&&bright.badge===1&&bright.width===still.width&&
    bright.position.x===still.position.x&&bright.position.y===still.position.y,'Review glow moved or faded the badge or star');
  await page.emulateMedia({reducedMotion:'no-preference'});
  if(await page.evaluate(()=>new URL(location.href).searchParams.has('policy-proof'))) {
    await page.locator('#toggle-review').click();
    await page.waitForFunction(()=>state.review.data?.counts.violation===1);
    await page.evaluate(()=>{state.universe.expanded.add('A');refreshMap();});
    check(await page.evaluate(()=>state.cy.edges('.review-violation').length>0),'Projection refresh lost the warning stroke on a direct owner reference');
    const expandedPaint=await badgePixels();
    check(expandedPaint.expanded&&expandedPaint.count>30,'Expanded title warning pixels: '+JSON.stringify(expandedPaint));
    await page.evaluate(()=>{state.universe.expanded.delete('A');refreshMap();});
    await clickStar('A');
    const card=page.locator('#details [data-review-finding]');await card.waitFor();
    check(await card.innerText().then(t=>t.includes('! Policy violation')),'Configured violation is not identified');
    check(await page.evaluate(()=>state.cy.getElementById('A').data('reviewMark').startsWith('violation:')),'Violation badge missing');
    await card.getByText('Exact evidence',{exact:true}).click();
    await card.getByRole('button',{name:'Inspect recorded reference',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.review-details li'));
    await card.getByRole('button',{name:'Not relevant',exact:true}).focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>state.review.data?.counts.acknowledged===1&&state.review.data.total===0);
    check(await page.evaluate(()=>document.activeElement?.id==='inspector-tab-architecture'),
      'Acknowledging the last finding left keyboard focus on the removed action');
    check(await page.evaluate(()=>!state.review.badges.size),'Acknowledged-only entity retained a badge');
    await page.reload();await page.waitForFunction(()=>state.cy&&state.positionCache);
    await page.locator('#toggle-review').click();
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
  await page.route(loadingPattern,async route=>{arriveLoading();await loadingGate;await route.continue();});
  await page.reload();await loadingWaiting;
  await page.waitForFunction(()=>state.cy&&state.positionCache);
  check(await page.locator('#toggle-review').getAttribute('aria-label').then(t=>/checking/.test(t)),'Pending review is not explicit');
  await clickStar('A');await page.locator('#toggle-review').click();
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
  await page.getByRole('button',{name:'Close inspector',exact:true}).click();
  await page.waitForFunction(()=>state.mapSize.width===$('graph').getBoundingClientRect().width);
  await page.unroute(loadingPattern);
  check(!await page.locator('#review-items').innerText().then(text=>text.includes('off-view')),
    'Visible marked entities were incorrectly labelled off-view');
  check(await page.evaluate(()=>state.cy.elements().length)===initial.elements,'Review added graph elements');
  const nativeId=await page.evaluate(()=>state.review.data.items.find(f=>f.kind==='native').id);
  check(await page.evaluate(id=>[...state.review.links.values()].some(records=>records.has(id)),nativeId),'Flagged reference has no visible warning wire');
  await page.evaluate(()=>inspectOverlap(ConnectionTrace.overlap(state.shard,state.shard.edges)));
  const findingChoice=page.getByRole('combobox',{name:'Review finding',exact:true});
  check(await findingChoice.locator('option').count()===2,'Overlapping findings need a complete, deduplicated choice');
  await findingChoice.selectOption(nativeId);
  await page.locator('#details .review-finding').filter({hasText:'Native call without recorded module access'}).waitFor();
  check(await findingChoice.evaluate(node=>document.activeElement===node),'Finding choice lost keyboard focus');
  await findingChoice.selectOption({index:0});
  await page.locator('#details .review-finding').filter({hasText:'Module dependency cycle'}).waitFor();
  await page.getByRole('button',{name:'Close inspector',exact:true}).click();
  await page.waitForFunction(()=>state.mapSize.width===$('graph').getBoundingClientRect().width);
  const wheelPoint=await page.evaluate(()=>{const p=state.cy.getElementById('A').renderedPosition(),b=$('graph').getBoundingClientRect();
    return{x:p.x+b.x,y:p.y+b.y};});
  await page.mouse.move(wheelPoint.x,wheelPoint.y);
  for(let step=0;step<22;step++){
    if(await page.evaluate(()=>state.shard.expanded.has('A')&&state.cy.getElementById('C').renderedPosition().y>state.cy.height()+100))break;
    await page.mouse.wheel(0,-90);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  }
  await page.waitForFunction(()=>!state.gestureActive&&!state.viewportFrame&&!state.zoomFrame&&!state.wheel);
  const connectionPoint=await page.evaluate(id=>{
    const edge=state.shard.edges.find(e=>state.review.links.get(e.id)?.has(id));
    if(!edge||edge.source!=='functionA')throw Error('Warning did not follow the revealed callable');
    if(!state.cy.getElementById(state.universe.renderPrefix+edge.id).hasClass('review-candidate'))throw Error('Revealed wire lost its visible warning stroke');
    const a=state.cy.getElementById(edge.source).renderedPosition(),b=state.cy.getElementById(edge.target).renderedPosition(),
      box=$('graph').getBoundingClientRect(),distance=Math.hypot(b.x-a.x,b.y-a.y),part=Math.min(.5,60/distance);
    if(b.x>=0&&b.y>=0&&b.x<=state.cy.width()&&b.y<=state.cy.height())throw Error('Expected a genuinely off-screen partner');
    return{x:box.x+a.x+(b.x-a.x)*part,y:box.y+a.y+(b.y-a.y)*part};
  },nativeId);
  await page.waitForFunction(()=>!state.review.requests.size);
  const beforeHover=requests.filter(r=>r.url().includes('/review')).length;
  await page.mouse.move(connectionPoint.x,connectionPoint.y);
  await page.locator('#hover-card .review-summary').getByText(/review candidate/).waitFor();
  check(requests.filter(r=>r.url().includes('/review')).length===beforeHover,'Warning hover fetched analysis or evidence');
  await page.mouse.click(connectionPoint.x,connectionPoint.y);
  await page.locator('#details .review-finding').filter({hasText:'Native call without recorded module access'}).waitFor();
  await page.getByRole('tab',{name:'Details',exact:true}).click();
  await page.locator('#details .endpoints button').filter({hasText:'SampleC'}).click();
  await page.waitForFunction(()=>state.scopeShard.scope==='C');
  check(await page.evaluate(id=>[...state.review.links.values()].some(records=>records.has(id)),nativeId),'Warning disappeared at the opposite endpoint');
  await page.getByRole('button',{name:'Close inspector',exact:true}).click();
  await page.evaluate(()=>{state.universe.expanded=new Set([state.universe.root]);setSceneScope(state.universe.root);refreshMap();fitMap();});
  await page.waitForFunction(()=>!state.viewportFrame&&!state.gestureActive);
  await page.locator(`#review-items [data-finding="${nativeId}"]`).click();
  await page.locator('#details [data-review-finding]').first().waitFor();
  check(await page.locator('#details [data-review-finding]').count()===1,'Choosing one list finding opened unrelated concerns');
  await page.getByRole('button',{name:'Close inspector',exact:true}).click();
  await clickStar('A');
  const native=page.locator('#details .review-finding').filter({hasText:'Native call without recorded module access'});
  await native.waitFor();
  await native.getByText('Exact evidence',{exact:true}).click();
  await native.getByRole('button',{name:'Inspect recorded reference',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.review-details')?.textContent.includes('Source/Sample.cpp'));
  await native.getByLabel('Decision reason (optional)').fill('Intentional synthetic relationship');
  await native.getByRole('button',{name:'Accept risk',exact:true}).click();
  await page.waitForFunction(()=>state.review.data?.counts.acknowledged===1&&state.review.data.total===1);
  check(await page.evaluate(id=>![...state.review.links.values()].some(records=>records.has(id)),nativeId),'Acknowledged warning retained an active wire');
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
  await page.getByRole('button',{name:'Close inspector',exact:true}).click();
  let release,arrived;
  const waiting=new Promise(resolve=>arrived=resolve),gate=new Promise(resolve=>release=resolve);
  const pattern='**'+initial.url+'?*';
  await page.route(pattern,async route=>{if(new URL(route.request().url()).searchParams.has('node')) {
    arrived();await gate;
  }await route.continue();});
  await page.evaluate(()=>state.review.pages.clear());
  await clickStar('A');await waiting;
  await page.getByRole('button',{name:'Close inspector',exact:true}).click();release();
  await page.waitForFunction(()=>!state.review.requests.size);
  check(await page.locator('#details').isHidden(),'Late review request reopened closed inspection');
  await page.unroute(pattern);
  await page.setViewportSize({width:640,height:900});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Review overflows narrow viewport');
  await page.getByRole('button',{name:'Refresh findings',exact:true}).click();
  await page.waitForFunction(()=>state.review.data?.total===2&&!state.review.requests.size);
  await clickStar('A');await page.locator('#details .review-details').waitFor();
  await page.route('**'+initial.url,async route=>route.request().method()==='POST'&&route.request().postDataJSON()?.action==='recheck'?
    route.fulfill({status:400,body:'Synthetic invalid policy'}):route.continue());
  if(await page.locator('#review').isHidden())await page.locator('#toggle-review').click();
  await page.getByRole('button',{name:'Refresh findings',exact:true}).click();
  await page.locator('#review-status').getByText(/Synthetic invalid policy/).waitFor();
  check(await page.locator('#toggle-review').getAttribute('aria-label').then(t=>/failed/.test(t)),'Failed review resembles a clean result');
  check(await page.locator('#review-items [data-finding]').count()===0&&await page.locator('#details .review-details').count()===0,
    'Failed recheck retained apparently current findings');
  await page.unroute('**'+initial.url);
  await page.getByRole('button',{name:'Close review',exact:true}).click();
  check(await page.evaluate(()=>state.review.enabled),'Closing the list disabled review');
  await page.locator('#toggle-review').click();
  await page.getByLabel('Evaluate recorded evidence',{exact:true}).uncheck();
  check(await page.evaluate(()=>!state.review.enabled&&!state.cy.nodes().some(n=>n.data('reviewMark'))),'Review off retained badges');
  check(await page.locator('#toggle-review').getAttribute('aria-label').then(t=>/off/.test(t)),'Disabled review state is hidden');
  check(await page.evaluate(()=>JSON.stringify(state.positionCache.layouts))===pins,'Review modified pins');
  check(writes.length===0,'Review wrote positions');check(errors.length===0,'Browser errors: '+errors.join('; '));
  return {review:true,automatic:true,readableSymbols:true,independentList:true,warningWires:true,findingChoice:true,offscreenPartner:true,oppositeEndpoint:true,exactEvidence:true,triage:true,refusal:true,lateClose:true,pinsUnchanged:true,
    requests:requests.filter(r=>r.url().includes('/review')).length,errors};
}
