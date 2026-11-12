// SPDX-License-Identifier: AGPL-3.0-or-later
// Profile hints added to the disposable sample exercise the real paging and position endpoints.
async page=>{
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  const frames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const settle=async()=>{await page.waitForFunction(()=>!state.gestureActive&&!state.viewportFrame&&
    state.mapSize.width===$('graph').getBoundingClientRect().width);await frames();};
  const setup=await page.evaluate(()=>({target:state.target,layouts:structuredClone(state.positionCache.layouts),mode:$('layout').value}));
  check(setup.target.id==='sample','Source region mutation requires the disposable sample');
  const errors=[],writes=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/layout/'))writes.push(r.postDataJSON());});
  const pattern='**'+setup.target.map_url;
  await page.route(pattern,async route=>{
    const response=await route.fetch(),data=await response.json();
    const root=data.nodes.find(n=>n.parent===null&&!n.boundary);
    root.attrs={...root.attrs,source_sections:true};
    const child=data.nodes.find(n=>n.id==='folder:Sample');
    child.attrs={...child.attrs,source_partition:{id:'private',label:'Private implementation',collapsed:true,folders:['Tests'],
      file:{root:'project',path:'Source/SampleProject/Private/Tests/SampleFixture.h'}}};
    await route.fulfill({response,json:data});
  });
  const point=id=>page.evaluate(id=>{
    const n=state.cy.getElementById(id),p=n.renderedPosition(),b=$('graph').getBoundingClientRect();
    if(!n.length)throw Error('Missing source region '+id);
    return{x:b.x+p.x,y:b.y+p.y};
  },id);
  try{
    await page.reload();await page.waitForFunction(()=>state.cy&&state.positionCache);await settle();
    const region=await page.evaluate(()=>state.universe.childIds(state.universe.root).find(id=>state.universe.nodes.get(id).attrs?.source_region));
    check(region,'No implementation region');
    check(await page.evaluate(id=>state.shard.expanded.has(id)&&state.shard.edges.every(e=>e.source!==id&&e.target!==id),region),
      'Organizational region is a wire endpoint or a collapsed bucket');
    const group=await page.evaluate(id=>state.universe.childIds(id).find(id=>state.universe.nodes.get(id).label==='Tests'),region);
    await page.evaluate(()=>fitOverview());await settle();
    check(await page.evaluate(id=>state.cy.getElementById(id).style('border-style')!=='dashed',group),
      'Source grouping reuses the outside-target dashed status');
    check(await page.evaluate(group=>state.cy.getElementById(group).length&&!state.cy.getElementById('folder:Sample').length&&
      state.universe.nodes.get('folder:Sample').parent===state.universe.root,group),'Private source did not fold independently of ownership');
    let p=await point(group);await page.mouse.move(p.x,p.y);await frames();
    check(/Tests.*source region/s.test(await page.locator('#hover-card').innerText()),'Source folder is not explained on hover');
    await page.mouse.click(p.x,p.y);await page.waitForFunction(id=>state.selection?.id===id,group);
    await page.waitForFunction(()=>!state.referencePages.pending.size);
    check(await page.locator('#details .connections li').count()>0,'Derived region did not load canonical exact references');
    check(!(await page.locator('#details').innerText()).includes('Could not load'),'Region queried an unknown canonical node');
    await page.locator('#details .connections li button').first().click();await settle();
    check(await page.evaluate(()=>Boolean(state.selection&&!$('details').hidden)),'Following a region reference lost its exact record');
    await page.locator('#clear').click();
    await page.evaluate(id=>{state.universe.expanded.delete(id);flyToNode(id,false);},group);await settle();
    for(let step=0;step<30&&!await page.evaluate(id=>state.universe.expanded.has(id),group);step++){
      p=await point(group);await page.mouse.move(p.x,p.y);await page.mouse.wheel(0,-120);await settle();
    }
    check(await page.evaluate(id=>state.universe.expanded.has(id),group),'Trusted wheel did not open the private region');
    const tests=group;
    check(tests,'Recorded Tests folder missing');
    await page.evaluate(id=>flyToNode(id),tests);await settle();
    const control=page.locator('#details [data-action="toggle-group"]');
    check(await control.count()===1,'Source folder inspection has no group control');
    if(await control.getAttribute('aria-expanded')==='true'){await control.click();await settle();}
    await page.getByRole('button',{name:'Expand constellation',exact:true}).click();await settle();
    check(await page.evaluate(id=>state.universe.expanded.has(id),tests),'Folder inspection cannot expand');
    const header=await page.evaluate(id=>state.universe.childIds(id).find(id=>state.universe.nodes.get(id).attrs.source_file),tests);
    check(header,'Tests folder lost its recorded header');
    await page.evaluate(id=>{state.universe.expanded.delete(id);flyToNode(id);},header);await settle();
    await page.waitForFunction(()=>!state.referencePages.pending.size);
    check(await page.locator('#details .connections li').count()>0,'Header exact-reference pages did not load');
    check(await page.locator('#details a[href*="SampleFixture.h:1"]').count()===1,'Header source link lost its recorded file');
    check(/source file/.test(await page.locator('#details').innerText()),'Header has no source-container explanation');
    await page.getByRole('button',{name:'Expand constellation',exact:true}).focus();await page.keyboard.press('Enter');await settle();
    check(await page.evaluate(id=>state.universe.expanded.has(id)&&state.cy.getElementById('folder:Sample').length,header),
      'Header keyboard expansion did not reveal its declaration');
    await page.evaluate(id=>{state.universe.expanded.delete(id);flyToNode(id,false);},header);await settle();
    const headerBefore=await page.evaluate(id=>({...state.universe.positions.get(id)}),header);
    p=await point(header);await page.mouse.move(p.x,p.y);await page.mouse.down();
    await page.mouse.move(p.x+30,p.y+16,{steps:8});await page.mouse.up();
    await page.waitForFunction(()=>!state.positionCache.pending);await settle();
    const headerMoved=await page.evaluate(id=>({...state.universe.positions.get(id)}),header);
    check(Math.hypot(headerMoved.x-headerBefore.x,headerMoved.y-headerBefore.y)>1,'Header drag did not move');
    await page.reload();await page.waitForFunction(()=>state.cy&&state.positionCache);await settle();
    check(await page.evaluate(({id,p})=>Math.hypot(state.universe.positions.get(id).x-p.x,state.universe.positions.get(id).y-p.y)<1e-6,
      {id:header,p:headerMoved}),'Header position was not restored from real declaration pins');
    const original=await page.evaluate(()=>state.universe.nodes.get('folder:Sample').parent);
    check(original==='project','Source presentation rewrote ownership');
    await page.reload();await page.waitForFunction(()=>state.cy&&state.positionCache);await settle();
    check(await page.evaluate(id=>state.universe.expanded.has(id),tests),'Reload lost derived-region expansion');
    await page.evaluate(id=>{state.universe.expanded.delete(id);flyToNode(id,false);},group);await settle();
    const before=await page.evaluate(id=>({point:{...state.universe.positions.get(id)},positions:JSON.stringify([...state.universe.positions])}),group);
    p=await point(group);await page.mouse.move(p.x,p.y);await page.mouse.down();
    await page.mouse.move(p.x+36,p.y+24,{steps:8});await page.mouse.up();
    await page.waitForFunction(()=>!state.positionCache.pending);await settle();
    check(writes.length>0,'Region drag did not persist contained stars');
    check(writes.every(body=>Object.keys(body.positions||{}).every(id=>!id.includes('source-section:')&&!id.includes('source-file:'))),
      'Synthetic source ID entered the pin store');
    const moved=await page.evaluate(id=>({...state.universe.positions.get(id)}),group);
    check(Math.hypot(moved.x-before.point.x,moved.y-before.point.y)>1,'Region drag did not move');
    await page.reload();await page.waitForFunction(()=>state.cy&&state.positionCache);await settle();
    check(await page.evaluate(({id,moved})=>Math.hypot(state.universe.positions.get(id).x-moved.x,state.universe.positions.get(id).y-moved.y)<1e-6,
      {id:group,moved}),'Region center was not restored from saved real pins');
    await page.setViewportSize({width:640,height:900});await settle();
    await page.evaluate(id=>flyToNode(id),group);await settle();
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Source region inspection overflows');
    await page.keyboard.press('Escape');check(await page.locator('#details').isHidden(),'Escape reopened source inspection');
    check(!errors.length,'Runtime errors: '+errors.join('; '));
    return{folded:true,canonicalOwnership:true,exactPaging:true,referenceNavigation:true,wheel:true,folderExpansion:true,
      reload:true,headerExpansion:true,headerPaging:true,headerSourceLink:true,headerDragRestored:true,
      realPinsOnly:true,dragRestored:true,narrow:true,errors};
  }finally{
    await page.evaluate(async setup=>{
      const cache=state.positionCache,mode=setup.mode;
      if(!await cache.write(mode,null))throw Error('Could not restore synthetic positions');
      if(setup.layouts[mode]&&!await cache.moveMany(mode,setup.layouts[mode]))throw Error('Could not restore synthetic pins');
    },setup);
    await page.unroute(pattern);
  }
}
