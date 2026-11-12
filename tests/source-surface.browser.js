// SPDX-License-Identifier: AGPL-3.0-or-later
// Serve fixtures/source-surface.graph.json through the normal map index and reference endpoints.
async page=>{
  const check=(ok,message)=>{if(!ok)throw Error(message);},errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/layout/'))writes.push(r.url());});
  const settle=async()=>{await page.waitForFunction(()=>!state.viewportFrame&&!state.gestureActive);
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
  check(await page.evaluate(()=>state.target.id==='sample'&&state.universe.nodes.has('method')),'Requires the disposable source surface fixture');
  const initial=await page.evaluate(()=>JSON.stringify(state.positionCache.layouts));
  await page.evaluate(()=>{flyToNode('module',false);state.universe.expanded.add('module');refreshMap();frameNode('module');});await settle();
  const files=await page.evaluate(()=>Object.fromEntries(state.universe.fileIds.map(id=>[state.universe.nodes.get(id).label,id])));
  check(files['API.h']&&files['Producer.cpp']&&files['Helpers.cpp']&&files['Other.cpp'],'Missing concrete file representatives');
  await page.evaluate(id=>{state.universe.expanded=new Set([state.universe.root]);state.universe.reveal(id);refreshMap();frameNode('module');},files['API.h']);await settle();
  const headerPoint=await page.evaluate(id=>{const p=state.cy.getElementById(id).renderedPosition(),b=$('graph').getBoundingClientRect();
    return{x:b.x+p.x+3,y:b.y+p.y+3};},files['API.h']);
  await page.mouse.move(headerPoint.x,headerPoint.y);await page.mouse.wheel(0,-120);await settle();
  check(await page.evaluate(id=>state.scopeShard.scope===id&&state.universe.expanded.has(id)&&state.cy.getElementById('class').length,files['API.h']),
    'One trusted wheel step over a header did not reveal its declarations');
  const classPoint=await page.evaluate(()=>{const p=state.cy.getElementById('class').renderedPosition(),b=$('graph').getBoundingClientRect();
    return{x:b.x+p.x+3,y:b.y+p.y+3};});
  await page.mouse.move(classPoint.x,classPoint.y);await page.mouse.wheel(0,-120);await settle();
  check(await page.evaluate(()=>state.scopeShard.scope==='class'&&state.universe.expanded.has('class')&&state.cy.getElementById('method').length),
    'One trusted wheel step inside a header did not reveal class members');
  await page.evaluate(()=>{state.universe.expanded=new Set([state.universe.root]);flyToNode('module',false);state.universe.expanded.add('module');refreshMap();frameNode('module');});await settle();
  check(await page.evaluate(()=>state.shard.edges.every(e=>!state.universe.regions.has(e.source)&&!state.universe.regions.has(e.target))),
    'An organizational region receives dependency wires');
  check(await page.evaluate(()=>state.shard.edges.some(e=>e.source==='module'&&e.type==='depends.private')),'Build dependency moved to a file');
  await page.evaluate(id=>flyToNode(id),files['Producer.cpp']);await settle();
  check(await page.evaluate(id=>!state.cy.getElementById(id).grabbable(),files['Producer.cpp']),
    'A navigation-only file pretends to have an independently saved position');
  await page.waitForFunction(()=>!state.referencePages.pending.size);
  const details=await page.locator('#details').innerText();
  check(/Definitions in this file \(1\)/.test(details),'Definition-only cpp file is not explorable');
  check(/Outgoing references recorded \(1\)/.test(details),'File totals merged distinct call-site files');
  check(!/Could not load/.test(details),'File paging failed');
  check(await page.locator('#details a[href*="Producer.cpp"]').count()>0,'Implementation source link missing');
  await page.keyboard.press('Escape');
  for(let i=0;i<24&&!await page.evaluate(()=>state.scopeShard.scope==='method');i++){
    const p=await page.evaluate(id=>{const b=$('graph').getBoundingClientRect(),p=state.cy.getElementById(id).renderedPosition();
      return{x:b.x+p.x,y:b.y+p.y};},files['Producer.cpp']);
    await page.mouse.move(p.x,p.y);await page.mouse.wheel(0,-120);await settle();
  }
  check(await page.evaluate(()=>state.scopeShard.scope==='method'),'Wheel did not follow the unambiguous definition');
  await page.evaluate(id=>flyToNode(id),files['Producer.cpp']);await settle();
  await page.locator('#details button[data-symbol="method"]').click();await settle();
  check(await page.evaluate(()=>state.selection?.id==='method'&&state.universe.nodes.get('method').parent==='class'),
    'Definition link did not focus the existing class-owned method');
  check(await page.evaluate(()=>state.cy.getElementById('method').length===1&&state.universe.graph.nodes.filter(n=>n.id==='method').length===1),
    'Declaration and definition became duplicate methods');
  check(/API.h/.test(await page.locator('#details').innerText())&&/Producer.cpp/.test(await page.locator('#details').innerText()),
    'Inspection lost separate declaration and definition locations');
  await page.keyboard.press('Escape');await page.evaluate(()=>flyToNode('helper',false));await settle();
  check(await page.evaluate(()=>state.cy.getElementById('helper').length&&state.universe.nodes.get('helper').parent==='module'),
    'Private helper was reassigned to the public header');
  await page.evaluate(id=>flyToNode(id),files['Helpers.cpp']);await settle();
  await page.waitForFunction(()=>!state.referencePages.pending.size);
  check(/Incoming references recorded \(2\)/.test(await page.locator('#details').innerText()),'Private file lost an incoming call site');
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{flyToNode('module',false);state.universe.expanded.add('module');refreshMap();frameNode('module');});await settle();
  const graph=await page.locator('#graph').boundingBox();await page.mouse.move(graph.x+graph.width*.6,graph.y+graph.height*.55);
  for(const delta of [-80,-80,80,80]){await page.mouse.wheel(0,delta);await settle();}
  await page.setViewportSize({width:640,height:900});await settle();await page.evaluate(id=>flyToNode(id),files['Producer.cpp']);await settle();
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'File definition navigation overflows a narrow viewport');
  await page.locator('#details button[data-symbol="method"]').focus();await page.keyboard.press('Enter');await settle();
  check(await page.evaluate(()=>state.selection?.id==='method'),'Definition navigation has no keyboard route');
  await page.reload();await page.waitForFunction(()=>state.cy&&state.positionCache);await settle();
  check(await page.evaluate(initial=>JSON.stringify(state.positionCache.layouts)===initial,initial),'Exploration changed saved pins');
  check(!errors.length&&!writes.length,'Runtime error or unintended pin writes');
  await page.setViewportSize({width:1440,height:1000});await settle();
  await page.evaluate(()=>{flyToNode('module',false);state.universe.expanded.add('module');refreshMap();frameNode('module');});await settle();
  check(await page.evaluate(()=>{
    const u=state.universe,regions=u.childIds('module').filter(id=>u.regions.has(id));
    return regions.some(id=>u.nodes.get(id).attrs.source_private===false)&&regions.some(id=>u.nodes.get(id).attrs.source_private);
  }),'Module has no separate public and implementation sections');
  const other=await page.evaluate(()=>JSON.stringify(state.universe.positions.get('peer')));
  await page.evaluate(()=>state.universe.translate('class',1000,300));
  const crowded=await page.evaluate(()=>JSON.stringify([...state.universe.positions]));
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('#arrange-files').click();
  check(await page.evaluate(before=>JSON.stringify([...state.universe.positions])===before,crowded),'Cancel changed the arrangement');
  check(!writes.length,'Cancel saved positions');
  page.once('dialog',dialog=>dialog.accept());await page.locator('#arrange-files').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>!state.positionCache.pending);await settle();
  check(await page.evaluate(other=>JSON.stringify(state.universe.positions.get('peer'))===other,other),'Arrange moved a neighbouring module');
  check(writes.length>0,'Arrange did not save the requested local positions');
  const pins=await page.evaluate(()=>JSON.stringify(state.positionCache.layouts[$('layout').value]));
  check(writes.every(url=>url.includes('/layout/')),'Unexpected save endpoint');
  await page.reload();await page.waitForFunction(()=>state.cy&&state.positionCache);await settle();
  check(await page.evaluate(pins=>Object.entries(JSON.parse(pins)).every(([id,p])=>{
    const n=state.universe.nodes.get(id),q=state.universe.positions.get(id);
    return n&&!n.attrs?.presentation_group&&q.x===p.x&&q.y===p.y;
  }),pins),'Arranged real pins did not survive reload');
  check(!errors.length,'Arrangement runtime errors');
  return {concreteFiles:true,organizationalRegion:true,physicalPaging:true,singleSymbol:true,definitionNavigation:true,
    privateOwnership:true,wheel:true,headerOneStep:true,classOneStep:true,keyboard:true,narrow:true,reload:true,sourceBands:true,arrangeCancel:true,
    arrangeLocal:true,arrangeReload:true,errors,writes:writes.length};
}
