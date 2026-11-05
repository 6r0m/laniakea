// SPDX-License-Identifier: AGPL-3.0-or-later
// Evaluate this Playwright function on the served synthetic sample.
async (page) => {
  const base = page.url().split('/').slice(0,3).join('/');
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const point = id => page.evaluate(id => {
    const n = state.cy.getElementById(id), p = n.renderedPosition(), b = $('graph').getBoundingClientRect();
    if (!n.length) throw new Error(`Missing visible star ${id}`);
    return {x:b.x+p.x,y:b.y+p.y,world:{...n.position()},pan:{...state.cy.pan()}};
  }, id);
  const wheel = async (id, expanded, delta) => {
    for (let i = 0; i < 80; i++) {
      if (await page.evaluate(({id,expanded}) => state.universe.expanded.has(id) === expanded, {id,expanded})) return i;
      const p = await point(id);
      await page.mouse.move(p.x,p.y);
      await page.mouse.wheel(0,delta);
      await frames();
    }
    throw new Error(`Wheel did not ${expanded?'expand':'collapse'} ${id}`);
  };
  const accounted = () => page.evaluate(() => {
    const refs = [...state.shard.edges.flatMap(e=>e.refs),...[...state.shard.internal.values()].flat()];
    return refs.length === state.universe.graph.edges.length && new Set(refs.map(e=>e.id)).size === refs.length;
  });
  const cdp = await page.context().newCDPSession(page);
  await page.bringToFront();
  await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(`${base}/`);
  await page.waitForFunction(()=>typeof state!=='undefined'&&state.cy&&state.positionCache);
  await frames();
  check(await page.evaluate(()=>$('error').hidden),'Startup reports an error');
  const posts=[],errors=[];
  const observe = request => {if(request.method()==='POST')posts.push(request.url());};
  const error = value => errors.push(value.message);
  page.on('request',observe);page.on('pageerror',error);
  try {
    const connections=await page.evaluate(()=>{
      const create=cytoscape,mode=$('layout').value;
      let edges=0;
      globalThis.cytoscape=options=>{
        const cy=create(options);
        if(options.headless)edges=cy.edges().length;
        return cy;
      };
      try {$('layout').value='cose';layout();$('layout').value=mode;layout();}
      finally {globalThis.cytoscape=create;$('layout').value=mode;}
      return edges;
    });
    check(connections>0,'Connections received no projected dependencies');
    const double=await point('folder:Sample');
    await page.mouse.dblclick(double.x,double.y,{delay:80});await frames();
    check(await page.evaluate(()=>state.universe.expanded.has('folder:Sample')),'Double-click was intercepted by the details panel');
    await page.evaluate(()=>selectNode('folder:Sample'));
    await page.getByRole('button',{name:'Collapse constellation',exact:true}).click();
    await page.getByRole('button',{name:'Clear selection',exact:true}).click();
    await page.getByRole('button',{name:'Fit map',exact:true}).click();await frames();
    const unaffected=await page.evaluate(()=>({...state.cy.getElementById('folder:Experimental').position()}));
    const openSteps=await wheel('folder:Sample',true,-120);
    check(await accounted(),'References disappeared while opening the folder');
    const now=await page.evaluate(()=>({...state.cy.getElementById('folder:Experimental').position()}));
    check(now.x===unaffected.x&&now.y===unaffected.y,'Expanding a folder moved an unrelated constellation');
    check(posts.length===0,'Zooming wrote user pins');
    const hover=await point('plugin:SampleGameplay');
    await page.mouse.move(hover.x,hover.y);await frames();
    check(await page.evaluate(()=>state.cy.edges('.focus').length>0&&state.selection===null),'Hover requires a click or does not trace');
    await page.mouse.move(20,20);await frames();
    check(await page.evaluate(()=>state.cy.elements('.faded,.focus').length===0),'Hover emphasis remained after leaving the star');
    await wheel('plugin:SampleGameplay',true,-120);
    check(await accounted(),'References disappeared while opening the plugin');
    const groupBefore=await page.evaluate(()=>({child:{...state.universe.positions.get('module:SampleGameplay')},
      group:{...state.universe.positions.get('plugin:SampleGameplay')},
      box:state.cy.getElementById('plugin:SampleGameplay').renderedBoundingBox({includeLabels:false,includeOverlays:false,includeUnderlays:false}),
      graph:$('graph').getBoundingClientRect().toJSON()}));
    const groupPosts=posts.length;
    const groupX=groupBefore.graph.x+(groupBefore.box.x1+groupBefore.box.x2)/2;
    const candidates=[{x:groupX,y:groupBefore.graph.y+groupBefore.box.y1-20},
      ...[[0.25,0.25],[0.75,0.25],[0.25,0.75],[0.75,0.75]].map(([x,y])=>({
        x:groupBefore.graph.x+groupBefore.box.x1+groupBefore.box.w*x,
        y:groupBefore.graph.y+groupBefore.box.y1+groupBefore.box.h*y}))];
    let grab;
    for(const candidate of candidates){
      await page.mouse.move(candidate.x,candidate.y);await frames();
      if(await page.evaluate(()=>state.cy.getElementById('plugin:SampleGameplay').hasClass('hovered'))){grab=candidate;break;}
    }
    check(grab,'No exposed constellation body or label to drag');
    await page.mouse.down();await page.mouse.move(grab.x+30,grab.y+25,{steps:8});await page.mouse.up();
    await page.waitForFunction(()=>state.positionCache.pending===0&&state.positionCache.errors.size===0);
    const groupAfter=await page.evaluate(()=>({child:{...state.universe.positions.get('module:SampleGameplay')},
      group:{...state.universe.positions.get('plugin:SampleGameplay')}}));
    check(posts.length===groupPosts+1,'Dragging a constellation must save its subtree in one request');
    check(Math.abs(groupAfter.child.x-groupBefore.child.x)>0.1&&
      Math.abs((groupAfter.child.x-groupBefore.child.x)-(groupAfter.group.x-groupBefore.group.x))<0.000001,
      'Dragging a constellation detached its child positions');
    const source=await point('module:SampleGameplay');
    await page.mouse.click(source.x,source.y);
    await page.evaluate(()=>{state.hidden.add('depends.public');applyFilters();});
    check(await page.evaluate(()=>state.selection?.id==='module:SampleGameplay'&&
      state.cy.getElementById('module:SampleGameplay').selected()),'Filtering lost the inspected module marker');
    await page.getByRole('button',{name:'SampleGameplay (module) -> SampleCore (module)',exact:true}).click();
    check(await page.evaluate(()=>state.cy.getElementById('module:SampleCore').length===1&&
      state.cy.getElementById('module:SampleGameplay').length===1),'Following a reference lost an endpoint');
    check(await accounted(),'Exact reference navigation changed the known reference set');
    const inspection=await page.evaluate(()=>{
      const selected=state.selection;
      state.hidden.add('requires');applyFilters();
      const kept=state.selection?.id===selected.id&&state.cy.edges(':selected').length===1;
      state.hidden.add('depends.public');applyFilters();
      const cleared=state.selection===null&&state.cy.elements(':selected').length===0&&$('details').hidden;
      state.hidden.clear();applyFilters();renderDetails(selected);
      return {kept,cleared};
    });
    check(inspection.kept&&inspection.cleared,'Optional inspection and filter visibility disagree');
    await frames();
    const camera=await page.evaluate(()=>({x:(state.cy.width()/2-state.cy.pan('x'))/state.cy.zoom(),
      y:(state.cy.height()/2-state.cy.pan('y'))/state.cy.zoom(),zoom:state.cy.zoom(),expanded:[...state.universe.expanded].sort()}));
    await page.reload();
    await page.waitForFunction(()=>typeof state!=='undefined'&&state.cy&&state.universe);
    await frames();
    const restoredCamera=await page.evaluate(()=>({x:(state.cy.width()/2-state.cy.pan('x'))/state.cy.zoom(),
      y:(state.cy.height()/2-state.cy.pan('y'))/state.cy.zoom(),zoom:state.cy.zoom(),expanded:[...state.universe.expanded].sort()}));
    check(Math.abs(restoredCamera.x-camera.x)<0.001&&Math.abs(restoredCamera.y-camera.y)<0.001&&
      Math.abs(restoredCamera.zoom-camera.zoom)<0.001&&JSON.stringify(restoredCamera.expanded)===JSON.stringify(camera.expanded),
      'Reload lost the camera or expanded constellation state');
    await page.goBack();
    await page.waitForFunction(()=>state.file==='plugin~3ASampleGameplay.json');
    await page.goForward();
    await page.waitForFunction(()=>state.file==='module~3ASampleCore.json');
    const deep=await point('module:SampleCore');
    const countBefore=posts.length;
    await page.mouse.move(deep.x,deep.y);await page.mouse.down();
    await page.mouse.move(deep.x+35,deep.y+25,{steps:8});await page.mouse.up();
    await page.waitForFunction(()=>state.positionCache.pending===0&&state.positionCache.errors.size===0);
    check(posts.length===countBefore+1,'A deep pin drag must send exactly one save');
    const deepStored=await page.evaluate(()=>({...state.positionCache.layouts[$('layout').value]['module:SampleCore']}));
    check(Math.abs(deepStored.x-deep.world.x)>0.1,'The deep pin did not move');
    await wheel('folder:Sample',false,120);
    check(await accounted(),'References disappeared while folding the folder');
    await page.evaluate(()=>renderDetails(null));await frames();
    const empty=await page.evaluate(()=>{
      const boxes=state.cy.nodes().map(n=>n.renderedBoundingBox()),b=$('graph').getBoundingClientRect();
      for(let y=80;y<state.cy.height()-100;y+=80)for(let x=40;x<state.cy.width()-120;x+=80){
        if(boxes.every(a=>x<a.x1-20||x>a.x2+20||y<a.y1-20||y>a.y2+20))return{x:b.x+x,y:b.y+y,pan:{...state.cy.pan()}};
      }
      throw new Error('No empty space for the flight check');
    });
    const flightPosts=posts.length;
    await page.mouse.move(empty.x,empty.y);await page.mouse.down();
    await page.mouse.move(empty.x+65,empty.y+35,{steps:8});await page.mouse.up();
    const flight=await page.evaluate(()=>({...state.cy.pan()}));
    check(Math.abs(flight.x-empty.pan.x)>30&&posts.length===flightPosts,'Dragging space did not fly without writing pins');
    const beforeReset=await page.evaluate(()=>({...state.cy.getElementById('engine').position()}));
    await page.getByRole('button',{name:'Fit map',exact:true}).click();
    await page.evaluate(()=>renderDetails(null));await frames();
    const engine=await point('engine'), beforeDrag=posts.length;
    // Drag the visible name, preserving coverage of label hit-testing as well as the star glyph.
    const labelPoint=await page.evaluate(()=>{
      const n=state.cy.getElementById('engine'),p=n.renderedPosition(),b=$('graph').getBoundingClientRect();
      const align=n.style('text-halign');
      return{x:b.x+p.x+(align==='left'?-n.renderedWidth()/2-12:align==='right'?n.renderedWidth()/2+12:10),
        y:b.y+p.y+n.renderedHeight()/2+15};
    });
    await page.mouse.move(labelPoint.x,labelPoint.y);await page.mouse.down();
    await page.mouse.move(labelPoint.x+45,labelPoint.y+55,{steps:8});await page.mouse.up();
    await page.waitForFunction(()=>state.positionCache.pending===0&&state.positionCache.errors.size===0);
    const moved=await point('engine');
    check(Math.abs(moved.world.y-beforeReset.y)>1,'Dragging the name did not move its star');
    check(Math.abs(moved.pan.y-engine.pan.y)<1,'Dragging a name panned space');
    check(posts.length===beforeDrag+1,'Dragging a name must send exactly one save');
    const stored=await page.evaluate(async()=>{
      const data=await getJson(`/layout/${state.target.id}/${state.manifest.entry}`);
      return data[$('layout').value];
    });
    check(Math.abs(stored.engine.x-moved.world.x)<0.000001&&Math.abs(stored.engine.y-moved.world.y)<0.000001,
      'Released pin was not saved in the workspace');
    const fresh=await page.context().browser().newContext();
    try {
      const p=await fresh.newPage();await p.goto(`${base}/`);
      await p.waitForFunction(()=>typeof state!=='undefined'&&state.cy&&state.positionCache);
      const restored=await p.evaluate(()=>({engine:{...state.universe.positions.get('engine')},
        deep:{...state.universe.positions.get('module:SampleCore')},error:$('error').hidden}));
      check(restored.error,'Fresh bare-address startup failed');
      check(restored.engine.x===stored.engine.x&&restored.engine.y===stored.engine.y,'A fresh browser did not restore the outer pin');
      check(restored.deep.x===deepStored.x&&restored.deep.y===deepStored.y,'A fresh browser did not restore the deep pin');
    } finally {await fresh.close();}
    await page.setViewportSize({width:390,height:844});await frames();
    await page.getByRole('button',{name:'Fit map',exact:true}).click();
    const narrow=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,
      count:state.cy.nodes().length,error:$('error').hidden}));
    check(narrow.width<=narrow.viewport&&narrow.count>0&&narrow.error,'Narrow viewport overflows or loses the map');
    check(errors.length===0,`Browser errors: ${errors.join('; ')}`);
    return {connectionsUsesDependencies:true,optionalInspectionStable:true,
      wheelExpansion:true,wheelCollapse:true,hoverOnlyTracing:true,allReferencesAccounted:true,
      exactReferenceFollow:true,doubleClickExpansion:true,spaceFlight:true,reloadAndHistory:true,
      groupDragSaved:true,deepPinSaved:true,labelDragSaved:true,freshBrowserRestored:true,
      narrowViewport:true,openSteps,errors};
  } finally {page.off('request',observe);page.off('pageerror',error);}
}
