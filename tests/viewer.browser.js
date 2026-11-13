// SPDX-License-Identifier: AGPL-3.0-or-later
// Evaluate this Playwright function on the served synthetic sample.
async (page) => {
  const base = page.url().split('/').slice(0,3).join('/');
  const check = (ok, message) => { if (!ok) throw new Error(message); };
  const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const point = id => page.evaluate(id => {
    const n = state.cy.getElementById(id), p = n.renderedPosition(), b = $('graph').getBoundingClientRect();
    if (!n.length) throw new Error(`Missing visible star ${id}`);
    return {x:b.x+p.x,y:b.y+p.y,world:{...state.universe.positions.get(id)},pan:{...state.cy.pan()}};
  }, id);
  const wheel = async (id, expanded, delta) => {
    for (let i = 0; i < 80; i++) {
      if (await page.evaluate(({id,expanded}) => state.universe.expanded.has(id) === expanded, {id,expanded})) return i;
      let p = await point(id);
      if (delta>0) {
        const box=await page.locator('#graph').boundingBox();
        p={x:Math.max(box.x+20,Math.min(box.x+box.width-20,p.x)),y:Math.max(box.y+20,Math.min(box.y+box.height-20,p.y))};
      }
      await page.mouse.move(p.x,p.y);
      await page.mouse.wheel(0,delta);
      await frames();
    }
    const diagnostic=await page.evaluate(id=>({zoom:worldZoom(),pan:state.cy.pan(),size:{width:state.cy.width(),height:state.cy.height()},
      point:state.cy.getElementById(id).renderedPosition(),pointer:state.pointer,scope:state.scopeShard.scope,drag:state.drag}),id);
    throw new Error(`Wheel did not ${expanded?'expand':'collapse'} ${id}: ${JSON.stringify(diagnostic)}`);
  };
  const accounted = () => page.evaluate(() => {
    const refs = [...state.shard.edges.flatMap(e=>e.refs),...[...state.shard.internal.values()].flat()];
    return referenceTotal(refs)+state.shard.outside+state.shard.hidden===referenceTotal(state.universe.graph.edges) &&
      new Set(refs.map(e=>e.id)).size===refs.length;
  });
  const cdp = await page.context().newCDPSession(page);
  await page.bringToFront();
  await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(`${base}/`);
  await page.waitForFunction(()=>typeof state!=='undefined'&&state.cy&&state.positionCache);
  await frames();
  check(await page.evaluate(()=>$('error').hidden),'Startup reports an error');
  check(await page.evaluate(()=>state.target.id==='sample'&&state.universe.nodes.has('folder:Sample')&&
    state.universe.nodes.has('module:SampleCore')),'This mutation check requires the served synthetic sample');
  const original=await page.evaluate(()=>({mode:$('layout').value,layouts:state.positionCache.layouts}));
  const acceptInitialReset=dialog=>dialog.accept();
  page.on('dialog',acceptInitialReset);
  try {await page.evaluate(async()=>{await resetPositions();});}
  finally {page.off('dialog',acceptInitialReset);}
  if(original.mode!=='galaxy')await page.evaluate(async()=>{await state.positionCache.write('galaxy',null);});
  await frames();
  const posts=[],errors=[];
  const observe = request => {if(request.method()==='POST'&&new URL(request.url()).pathname.startsWith('/layout/'))posts.push(request.url());};
  const error = value => errors.push(value.message);
  page.on('request',observe);page.on('pageerror',error);
  try {
    const initialMode=await page.locator('#layout').inputValue();
    for(const mode of ['auto','galaxy','breadthfirst','cose','grid']) {
      await page.selectOption('#layout',mode);await page.waitForFunction(()=>!state.gestureActive);
      check(await page.evaluate(()=>!configurationVisible()&&!state.cy.getElementById(state.universe.root).length),
        `Configuration default restored root wires in ${mode}`);
      const before=await page.evaluate(()=>({edges:state.cy.edges().map(e=>e.id()).sort().join(),
        positions:JSON.stringify([...state.universe.positions])}));
      await page.locator('#toggle-configuration').click();
      check(await page.evaluate(before=>state.cy.nodes('.configured').length>0&&
        !state.cy.getElementById(state.universe.root).length&&state.cy.edges().map(e=>e.id()).sort().join()===before.edges&&
        JSON.stringify([...state.universe.positions])===before.positions,before),`Marks changed architecture or positions in ${mode}`);
      await page.locator('#toggle-configuration').click();
    }
    await page.selectOption('#layout',initialMode);
    await page.evaluate(()=>flyToNode('plugin:SampleDisabled',false));
    await wheel('plugin:SampleDisabled',true,-120);
    await page.waitForFunction(()=>!state.gestureActive&&!state.viewportFrame);
    check(await page.evaluate(()=>state.cy.getElementById('module:SampleDisabled').length===1&&
      /SampleDisabled: Outside.*target.*internals.*not analysed/i.test($('map-tooltip').textContent)),
      'Wheel expansion must explain why recorded structure stops at an outside-target module');
    const unavailable=await point('module:SampleDisabled');
    await page.mouse.move(unavailable.x,unavailable.y);await page.mouse.wheel(0,-120);
    await page.waitForFunction(()=>!state.gestureActive&&!state.wheelFrame&&!state.zoomFrame&&!state.viewportFrame);
    check(await page.evaluate(()=>/Outside.*target/.test($('map-tooltip').textContent)),
      'Further wheel zoom discarded the coverage hint');
    await page.evaluate(()=>{state.universe.expanded=new Set([state.universe.root]);setSceneScope(state.universe.root);refreshMap();fitMap();});
    check(await page.evaluate(()=>!$('map-tooltip').textContent.includes('Outside analysed target')),
      'Returning to the analysed root retained an unrelated coverage hint');
    await page.selectOption('#layout','galaxy');await frames();
    await page.waitForFunction(()=>!state.gestureActive&&state.visibleLabels);
    check(await page.evaluate(()=>!configurationVisible()&&state.universe.positions.get('engine').x===0&&
      state.universe.positions.get('engine').y===0&&!state.cy.getElementById(state.universe.root).length),
      'Galaxy must center the declared boundary and hide only root configuration by default');
    check(await page.evaluate(()=>state.shard.edges.some(e=>e.refs.some(r=>r.type==='requires'&&r.source!==state.universe.root))),
      'Galaxy hid plugin-to-plugin descriptor dependencies');
    check(await page.evaluate(()=>state.visibleLabels.has('folder:Sample')&&state.visibleLabels.has('module:SampleProject')),
      'Important constellation/source names disappeared from the overview');
    const configuration=page.locator('#toggle-configuration');
    const architecture=await page.evaluate(()=>({edges:state.cy.edges().map(e=>e.id()).sort().join(),
      pins:JSON.stringify(state.positionCache.layouts),positions:JSON.stringify([...state.universe.positions])}));
    await configuration.focus();await page.keyboard.press('Enter');await frames();
    check(await configuration.getAttribute('aria-pressed')==='true'&&await page.evaluate(()=>
      !state.cy.getElementById(state.universe.root).length&&state.cy.nodes('.configured').length>0),
      'Keyboard configuration marks must outline targets without restoring the root endpoint');
    check(await page.evaluate(before=>state.cy.edges().map(e=>e.id()).sort().join()===before.edges&&
      JSON.stringify(state.positionCache.layouts)===before.pins&&JSON.stringify([...state.universe.positions])===before.positions,
      architecture),'Annotations changed architecture edges or positions');
    await page.keyboard.press('Enter');await frames();
    check(await accounted(),'Configuration subset filtering lost or double-counted references');
    const projectDetails=page.getByRole('button',{name:'Project details',exact:true});
    const contextBefore=await page.evaluate(()=>({file:state.file,zoom:worldZoom(),
      x:(state.cy.width()/2-state.cy.pan('x'))/worldZoom(),y:(state.cy.height()/2-state.cy.pan('y'))/worldZoom()}));
    await projectDetails.click();await frames();
    check(await page.evaluate(before=>state.selection?.projectContext&&!$('details').hidden&&state.file===before.file&&
      Math.abs(worldZoom()-before.zoom)<1e-6&&Math.abs((state.cy.width()/2-state.cy.pan('x'))/worldZoom()-before.x)<1e-6&&
      Math.abs((state.cy.height()/2-state.cy.pan('y'))/worldZoom()-before.y)<1e-6,contextBefore),
      'Explicit Project inspection changed map scope/camera or required a root marker');
    await page.waitForFunction(()=>!state.referencePages?.pending.size);
    check(await page.locator('#details').innerText().then(text=>/Project configuration.*listed targets/s.test(text)),
      'Project context lost exact declarations and distinct target counts');
    const closeDetails=page.getByRole('button',{name:'Close inspector',exact:true});
    await closeDetails.focus();await page.keyboard.press('Enter');await page.evaluate(()=>refreshMap());
    check(await page.locator('#details').isHidden()&&await page.locator('#toggle-details').evaluate(n=>n===document.activeElement),
      'Keyboard close must dismiss inspection and return focus to Details');
    await projectDetails.click();
    await page.keyboard.press('Escape');await page.evaluate(()=>refreshMap());
    check(await page.locator('#details').isHidden(),'Escape must close context without reopening Project details');
    await projectDetails.click();await page.getByRole('button',{name:'Clear selection',exact:true}).click();
    check(await page.locator('#details').isHidden(),'Clear must close Project details');
    await page.evaluate(()=>flyToNode('plugin:SampleCore'));
    await page.waitForFunction(()=>!state.gestureActive);
    const coreHover=await point('plugin:SampleCore');await page.mouse.move(coreHover.x,coreHover.y);await frames();
    check(await page.locator('#hover-card').innerText().then(text=>/Incoming references recorded.*Of which: project configuration.*1/s.test(text)&&
      /explicitly listed, not necessarily compiled/.test(text)&&!text.includes('Used by')),
      'Hover must disclose the numerical configuration subset without implying usage');
    check(await page.locator('#map-tooltip').innerText().then(text=>/Incoming references recorded.*Of which: project configuration: 1/.test(text)),
      'Accessible readout lost the numerical subset');
    await page.getByRole('button',{name:'SampleProject (project) -> SampleCore (plugin)',exact:true}).click();
    check(await page.evaluate(()=>!configurationVisible()&&state.selection?.configurationInspection&&
      state.selection.source===state.universe.root&&!state.cy.getElementById(state.universe.root).length),
      'Following configuration must preserve the exact record without restoring root wires');
    await projectDetails.focus();await page.keyboard.press('Enter');await frames();
    check(await page.evaluate(()=>state.selection?.projectContext),'Nested-scope Project action lost keyboard inspection');
    await page.evaluate(()=>{renderDetails(null);state.universe.expanded=new Set([state.universe.root]);setSceneScope(state.universe.root);});
    await page.selectOption('#layout',initialMode);await frames();
    await page.evaluate(()=>{
      globalThis.bannerProbe=state.target;
      state.target={...state.target,stale:true,changed_count:40,
        changed:Array.from({length:40},(_,i)=>`Plugins/Sample/SyntheticFeature${i}/Source/Private/SyntheticComponent${i}.cpp`)};
      renderBanner();
    });
    try {
      const warning=page.locator('#banner'),disclosure=warning.locator('details'),summary=disclosure.locator('summary');
      check(await warning.isVisible()&&await disclosure.count()===1,'Staleness needs a persistent warning with diagnostic disclosure');
      check(await summary.innerText()==='Snapshot out of date: 40 inputs changed','Staleness summary must identify the snapshot limitation');
      check(await disclosure.evaluate(node=>!node.open),'Stale paths must start collapsed');
      check(await warning.evaluate(node=>node.getBoundingClientRect().height<=70),'Collapsed staleness consumes the desktop map');
      await summary.click();
      check(await disclosure.evaluate(node=>node.open&&node.querySelectorAll('li').length===40&&
        node.textContent.includes('SyntheticComponent39.cpp')&&node.textContent.includes('python laniakea.py extract sample')),
        'Expanding staleness lost exact diagnostics or its recovery action');
      await summary.focus();await page.keyboard.press('Enter');
      check(await disclosure.evaluate(node=>!node.open),'Stale diagnostics cannot be collapsed by keyboard');
      await page.setViewportSize({width:390,height:844});await frames();
      const narrowWarning=await page.evaluate(()=>{
        const banner=$('banner').getBoundingClientRect(),map=$('graph').getBoundingClientRect();
        return {banner:banner.height,mapHeight:map.height,mapTop:map.top,viewport:innerHeight,width:document.documentElement.scrollWidth};
      });
      check(narrowWarning.banner<=115&&narrowWarning.mapHeight>=300&&narrowWarning.mapTop<=narrowWarning.viewport-300&&narrowWarning.width<=390,
        'Collapsed stale warning leaves no useful narrow map: '+JSON.stringify(narrowWarning));
    } finally {
      await page.setViewportSize({width:1440,height:1000});
      await page.evaluate(()=>{state.target=bannerProbe;delete globalThis.bannerProbe;renderBanner();});await frames();
    }
    await page.evaluate(()=>{
      const node=state.universe.nodes.get('module:SampleProject');
      globalThis.metadataProbe={id:node.id,attrs:node.attrs};
      node.attrs={...node.attrs,synthetic_notes:Array.from({length:120},(_,i)=>`Sample metadata item ${i}`)};
      flyToNode(node.id);
    });
    try {
      const metadata=page.locator('#details .node-metadata'),summary=metadata.locator('summary');
      check(await summary.innerText()==='Metadata'&&await metadata.evaluate(node=>!node.open),'Bulk node metadata must start collapsed');
      const usable=await page.evaluate(()=>{
        const panel=$('details'),box=panel.getBoundingClientRect(),heading=panel.querySelector('h3'),metadata=panel.querySelector('.node-metadata');
        return heading&&heading.getBoundingClientRect().bottom<=box.bottom&&
          Boolean(metadata.compareDocumentPosition(heading)&Node.DOCUMENT_POSITION_FOLLOWING)&&
          [...panel.querySelectorAll('button')].some(b=>b.textContent==='Fly to star'&&b.getBoundingClientRect().bottom<=box.bottom);
      });
      check(usable,'Bulk metadata pushes navigation or connection headings below the initial detail viewport');
      await summary.click();
      check(await metadata.evaluate(node=>node.open&&node.textContent.includes('Sample metadata item 119')),'Metadata disclosure loses recorded values');
      await summary.click();
    } finally {
      await page.evaluate(()=>{state.universe.nodes.get(metadataProbe.id).attrs=metadataProbe.attrs;
        delete globalThis.metadataProbe;state.detailsKey=null;renderDetails(null);fitMap();});await frames();
    }
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
    const wire=await page.evaluate(()=>{
      const cy=state.cy,g=$('graph').getBoundingClientRect();
      const glyphs=cy.nodes().not('.expanded').map(n=>n.renderedBoundingBox({includeLabels:false,includeOverlays:false,includeUnderlays:false}));
      const backgrounds=cy.nodes('.expanded').map(n=>n.renderedBoundingBox({includeLabels:false,includeOverlays:false,includeUnderlays:false}));
      const inside=(p,b)=>p.x>b.x1&&p.x<b.x2&&p.y>b.y1&&p.y<b.y2;
      for(const e of cy.edges()){
        const p=e.renderedMidpoint();
        if(p.x>25&&p.y>25&&p.x<cy.width()-25&&p.y<cy.height()-25&&backgrounds.some(b=>inside(p,b))&&
          !glyphs.some(b=>inside(p,b))&&![...state.labelBoxes.values()].some(b=>inside(p,b)))return{id:e.id(),x:g.x+p.x,y:g.y+p.y};
      }
      throw Error('Synthetic scene needs an exposed connection inside a constellation');
    });
    await page.waitForFunction(()=>!state.gestureActive);await page.mouse.move(wire.x,wire.y);await frames();
    const wireHover=await page.evaluate(()=>({traced:state.cy.edges('.hovered').length,tooltip:!$('map-tooltip').hidden,
      gesture:state.gestureActive,targets:state.cy.elements('.hovered').map(e=>e.id())}));
    check(wireHover.traced>0&&wireHover.tooltip,'A constellation background blocks connection tracing: '+JSON.stringify(wireHover));
    await page.mouse.click(wire.x,wire.y);await frames();
    check(await page.evaluate(()=>state.selection&&state.selection.level===undefined&&!$('details').hidden),
      'A constellation background blocks connection inspection');
    await closeDetails.click();await page.evaluate(()=>refreshMap());
    check(await page.evaluate(()=>$('details').hidden&&state.selection===null&&state.cy.elements(':selected').length===0),
      'Connection close left inspection open or selected');
    await page.evaluate(()=>selectNode('folder:Sample'));
    await page.getByRole('button',{name:'Collapse constellation',exact:true}).click();
    await page.getByRole('button',{name:'Clear selection',exact:true}).click();
    await page.getByRole('button',{name:'Fit map',exact:true}).click();await frames();
    await page.evaluate(()=>selectNode('folder:Sample'));
    const groupControl=page.locator('#details [data-action="toggle-group"]');
    check(await groupControl.innerText()==='Expand constellation'&&await groupControl.getAttribute('aria-expanded')==='false',
      'Collapsed constellation control has incorrect state');
    await page.waitForFunction(()=>!state.referencePages?.pending.size);
    await page.evaluate(()=>{globalThis.groupProbe={button:document.querySelector('#details [data-action="toggle-group"]'),
      pager:document.querySelector('#details .reference-pager')};if(!groupProbe.pager)throw Error('Synthetic folder needs a reference pager');});
    await wheel('folder:Sample',true,-120);await page.waitForFunction(()=>!state.gestureActive);
    check(await groupControl.innerText()==='Collapse constellation'&&await groupControl.getAttribute('aria-expanded')==='true',
      'Semantic zoom leaves a stale constellation control');
    check(await page.evaluate(()=>groupProbe.button===document.querySelector('#details [data-action="toggle-group"]')&&
      groupProbe.pager===document.querySelector('#details .reference-pager')),'Semantic zoom recreated the reader\'s reference pager');
    await groupControl.click();await page.evaluate(()=>delete globalThis.groupProbe);
    await page.getByRole('button',{name:'Clear selection',exact:true}).click();
    await page.getByRole('button',{name:'Fit map',exact:true}).click();await frames();
    const unaffected=await page.evaluate(()=>({...state.universe.positions.get('folder:Experimental')}));
    const openSteps=await wheel('folder:Sample',true,-120);
    check(await accounted(),'References disappeared while opening the folder');
    const now=await page.evaluate(()=>({...state.universe.positions.get('folder:Experimental')}));
    check(now.x===unaffected.x&&now.y===unaffected.y,'Expanding a folder moved an unrelated constellation');
    check(posts.length===0,'Zooming wrote user pins');
    await page.waitForFunction(()=>!state.gestureActive);
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
    await page.waitForFunction(()=>!state.gestureActive);
    const candidates=await page.evaluate(()=>{
      const b=state.labelBoxes.get('plugin:SampleGameplay'),g=$('graph').getBoundingClientRect();
      return b?[{x:g.x+(b.x1+b.x2)/2,y:g.y+(b.y1+b.y2)/2}]:[];
    });
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
    const body=await page.evaluate(()=>{
      const cy=state.cy,b=cy.getElementById('plugin:SampleGameplay').renderedBoundingBox({includeLabels:false,includeOverlays:false,includeUnderlays:false});
      const graph=$('graph').getBoundingClientRect();
      return {x:graph.x+b.x1+b.w*.2,y:graph.y+b.y1+b.h*.2,pan:{...cy.pan()},
        positions:JSON.stringify([...state.universe.positions])};
    });
    const beforePan=posts.length;
    await page.mouse.move(body.x,body.y);await page.mouse.down();
    await page.mouse.move(body.x+35,body.y+25,{steps:8});await page.mouse.up();
    check(await page.evaluate(body=>Math.abs(state.cy.pan().x-body.pan.x-35)<1&&
      JSON.stringify([...state.universe.positions])===body.positions,body)&&posts.length===beforePan,
      'An expanded background must pan without moving or saving its descendants');
    await page.evaluate(pan=>setWorldViewport(worldZoom(),pan),body.pan);
    await page.waitForFunction(()=>!state.gestureActive);
    await page.evaluate(()=>frameNode('module:SampleGameplay'));await frames();
    const source=await point('module:SampleGameplay');
    await page.mouse.click(source.x,source.y);
    await page.waitForFunction(()=>state.selection?.id==='module:SampleGameplay');
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
      const cy=state.cy,b=$('graph').getBoundingClientRect(),pan=cy.pan(),zoom=cy.zoom();
      for(let y=80;y<state.cy.height()-100;y+=80)for(let x=40;x<state.cy.width()-120;x+=80){
        const hit=cy.renderer().findNearestElements((x-pan.x)/zoom,(y-pan.y)/zoom,true,false);
        if(hit.every(n=>!n.isNode()||n.hasClass('expanded'))&&[...state.labelBoxes.values()].every(a=>x<a.x1-20||x>a.x2+20||y<a.y1-20||y>a.y2+20))
          return{x:b.x+x,y:b.y+y,pan:{...pan}};
      }
      throw new Error('No empty space for the flight check');
    });
    const flightPosts=posts.length;
    await page.mouse.move(empty.x,empty.y);await page.mouse.down();
    await page.mouse.move(empty.x+65,empty.y+35,{steps:8});await page.mouse.up();
    const flight=await page.evaluate(()=>({...state.cy.pan()}));
    check(Math.abs(flight.x-empty.pan.x)>30&&posts.length===flightPosts,'Dragging space did not fly without writing pins');
    const beforeReset=await page.evaluate(()=>({...state.universe.positions.get('engine')}));
    await page.getByRole('button',{name:'Fit map',exact:true}).click();
    check(await page.evaluate(()=>state.file===state.manifest.entry&&state.scopeShard.scope===state.universe.root&&
      location.hash===hashFor(state.target.id,state.manifest.entry)&&$('up').disabled&&
      $('crumbs').querySelector('[aria-current="page"]').textContent.startsWith(state.manifest.project)),
      'Fit map leaves a deep breadcrumb or scope address on the overview');
    await page.evaluate(()=>renderDetails(null));await frames();
    await page.waitForFunction(()=>!state.gestureActive&&state.visibleLabels);
    const engine=await point('engine'), beforeDrag=posts.length;
    await page.mouse.move(engine.x,engine.y);await frames();
    check(await page.evaluate(()=>state.visibleLabels.has('engine')),'Hover did not expose the external star name');
    // Drag the visible name, preserving coverage of label hit-testing as well as the star glyph.
    const labelPoint=await page.evaluate(()=>{
      const n=state.cy.getElementById('engine'),b=$('graph').getBoundingClientRect();
      const label=n.renderedBoundingBox({includeNodes:false,includeEdges:false,includeLabels:true,includeOverlays:false,includeUnderlays:false});
      return{x:b.x+(label.x1+label.x2)/2,y:b.y+(label.y1+label.y2)/2};
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
      await p.selectOption('#layout',initialMode);
      const restored=await p.evaluate(()=>({engine:{...state.universe.positions.get('engine')},
        deep:{...state.universe.positions.get('module:SampleCore')},error:$('error').hidden}));
      check(restored.error,'Fresh bare-address startup failed');
      check(restored.engine.x===stored.engine.x&&restored.engine.y===stored.engine.y,'A fresh browser did not restore the outer pin');
      check(restored.deep.x===deepStored.x&&restored.deep.y===deepStored.y,'A fresh browser did not restore the deep pin');
      await p.route('**/data/targets.json',route=>route.fulfill({json:[]}));
      await p.reload();await p.waitForFunction(()=>$('inspect-project').disabled);
      check(await p.locator('#inspect-project').isDisabled(),'Empty startup left Project inspection active without a project');
    } finally {await fresh.close();}
    const savedBeforeReset=await page.evaluate(()=>({mode:$('layout').value,modeLabel:$('layout').selectedOptions[0].textContent,project:state.target.project,
      pins:JSON.stringify(state.positionCache.layouts),positions:JSON.stringify([...state.universe.positions]),
      count:Object.keys(state.positionCache.layouts[$('layout').value]||{}).length}));
    check(savedBeforeReset.count>0,'Reset refusal needs saved synthetic positions');
    const beforeCancel=posts.length,cancelDialog=page.waitForEvent('dialog');
    const cancelClick=page.getByRole('button',{name:'Reset layout',exact:true}).click();
    const refused=await cancelDialog;
    const resetMessage=refused.message();
    check(refused.type()==='confirm'&&resetMessage.includes(savedBeforeReset.project)&&resetMessage.includes(savedBeforeReset.modeLabel)&&
      resetMessage.includes(String(savedBeforeReset.count)),'Reset confirmation omits the affected project, mode or position count');
    await refused.dismiss();await cancelClick;await frames();
    check(posts.length===beforeCancel&&await page.evaluate(before=>JSON.stringify(state.positionCache.layouts)===before.pins&&
      JSON.stringify([...state.universe.positions])===before.positions&&!$('reset-layout').disabled,savedBeforeReset),
      'Cancelling reset changed or saved positions');
    const acceptDialog=page.waitForEvent('dialog'),acceptClick=page.getByRole('button',{name:'Reset layout',exact:true}).click();
    const accepted=await acceptDialog;await accepted.accept();await acceptClick;
    await page.waitForFunction(()=>state.positionCache.pending===0&&state.positionCache.errors.size===0&&
      !Object.hasOwn(state.positionCache.layouts,$('layout').value));
    check(posts.length===beforeCancel+1,'Confirmed reset must make exactly one layout request');
    const paging=await page.evaluate(async()=>{
      const pane=document.createElement('aside');pane.id='pagination-probe';
      pane.style.cssText='position:fixed;top:150px;right:0;width:296px;height:600px;z-index:20;overflow:auto';
      document.body.append(pane);
      globalThis.pagerProbe={pane,cache:state.referencePages,epoch:state.referenceEpoch};state.referenceEpoch++;
      state.referencePages={load:async query=>({total:125,next_cursor:query.cursor+50<125?query.cursor+50:null,
        items:Array.from({length:Math.min(50,125-query.cursor)},(_,i)=>({group:1,reference:{id:'sample-page-'+(query.cursor+i),
          source:'module:SampleCore',target:'module:SampleGameplay',type:'calls',status:'resolved',origin:'compiler'}}))})};
      return await appendReferencePage(pane,{node:'module:SampleCore'},125);
    });
    check(paging,'Synthetic reference page did not load');
    try {
      const probe=page.locator('#pagination-probe'),next=probe.getByRole('button',{name:'Next references',exact:true});
      await next.focus();await page.keyboard.press('Enter');
      await page.waitForFunction(()=>document.querySelector('#pagination-probe [role=status]').textContent==='51-100 of 125 references');
      check(await next.evaluate(node=>document.activeElement===node),'Paging lost keyboard focus');
      await page.evaluate(()=>pagerProbe.pane.scrollTop=800);await frames();
      check(await page.evaluate(()=>{const pane=pagerProbe.pane.getBoundingClientRect(),pager=pagerProbe.pane.querySelector('.reference-pager').getBoundingClientRect();
        return pager.top>=pane.top-1&&pager.top<=pane.top+20;}),'Reference controls disappeared while scrolling');
      await page.keyboard.press('Enter');
      await page.waitForFunction(()=>document.querySelector('#pagination-probe [role=status]').textContent==='101-125 of 125 references');
      const paged=await page.evaluate(()=>{
        const pane=pagerProbe.pane,first=pane.querySelector('li button').getBoundingClientRect(),pager=pane.querySelector('.reference-pager').getBoundingClientRect();
        return {bounded:pane.querySelectorAll('li').length===25,startsAtFirstRow:first.top>=pager.bottom-2&&first.top<pane.getBoundingClientRect().bottom,
          focus:document.activeElement.getAttribute('aria-label')==='Previous references',noOverflow:pane.scrollWidth<=pane.clientWidth,
          geometry:{first:first.top,pager:pager.bottom,pane:pane.getBoundingClientRect().top,scroll:pane.scrollTop}};
      });
      check(paged.bounded&&paged.startsAtFirstRow&&paged.focus&&paged.noOverflow,'Reference page realization: '+JSON.stringify(paged));
    } finally {
      await page.evaluate(()=>{state.referencePages=pagerProbe.cache;state.referenceEpoch=pagerProbe.epoch;pagerProbe.pane.remove();delete globalThis.pagerProbe;});
    }
    await page.evaluate(()=>flyToNode('module:SampleCore'));
    await page.waitForFunction(()=>state.selection?.id==='module:SampleCore');
    await page.evaluate(()=>{const panel=$('inspector-page-details');panel.scrollTop=500;panel.scrollLeft=20;flyToNode('module:SampleGameplay');});
    await page.waitForFunction(()=>state.selection?.id==='module:SampleGameplay');
    check(await page.evaluate(()=>$('inspector-page-details').scrollTop===0&&$('inspector-page-details').scrollLeft===0),
      'New inspection retained the previous list scroll');
    await page.setViewportSize({width:390,height:844});await frames();
    await page.getByRole('button',{name:'Fit map',exact:true}).click();
    const narrow=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,
      count:state.cy.nodes().length,error:$('error').hidden}));
    check(narrow.width<=narrow.viewport&&narrow.count>0&&narrow.error,'Narrow viewport overflows or loses the map');
    await page.evaluate(()=>selectNode('folder:Sample'));await page.waitForFunction(()=>!state.referencePages?.pending.size);
    await page.evaluate(()=>$('inspector-page-details').scrollTop=200);await frames();
    check(await closeDetails.evaluate(button=>{
      const b=button.getBoundingClientRect(),pane=document.getElementById('details'),p=pane.getBoundingClientRect();
      return b.top>=p.top&&b.bottom<=p.bottom&&b.left>=p.left&&b.right<=p.right&&
        document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)===button&&pane.scrollWidth<=pane.clientWidth;
    }),'Close inspector is obscured or offscreen after scrolling the narrow panel');
    await closeDetails.click();check(await page.locator('#details').isHidden(),'Narrow details close failed');
    await page.setViewportSize({width:1440,height:1000});
    await page.evaluate(()=>{renderDetails(null);state.universe.expanded=new Set([state.universe.root]);});
    await page.selectOption('#layout','galaxy');await frames();
    const legacy=await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(state.positionCache.layouts).filter(([key])=>key!=='galaxy'))));
    await page.waitForFunction(()=>!state.gestureActive);
    const center=await point('engine');
    check(await page.evaluate(()=>{
      const cy=state.cy,n=cy.getElementById('engine');
      return cy.renderer().findNearestElements(n.position('x'),n.position('y'),true,false)[0]?.id()==='engine';
    }),'A connection intercepts the exact center of the external star');
    await page.mouse.move(center.x,center.y);await page.mouse.down();
    await page.mouse.move(center.x+38,center.y+25,{steps:8});await page.mouse.up();
    await page.waitForFunction(()=>state.positionCache.pending===0&&state.positionCache.layouts.galaxy?.engine);
    const galaxyPin=await page.evaluate(()=>({...state.positionCache.layouts.galaxy.engine}));
    check(Math.hypot(galaxyPin.x-center.world.x,galaxyPin.y-center.world.y)>1,'Galaxy drag did not move the center');
    await page.goto(base+'/');await page.waitForFunction(()=>typeof state!=='undefined'&&state.cy&&state.positionCache);
    check(await page.evaluate(({galaxyPin,legacy})=>$('layout').value==='galaxy'&&
      JSON.stringify(state.universe.positions.get('engine'))===JSON.stringify(galaxyPin)&&
      JSON.stringify(Object.fromEntries(Object.entries(state.positionCache.layouts).filter(([key])=>key!=='galaxy')))===legacy,
      {galaxyPin,legacy}),'Bare URL reload lost the galaxy pin or changed a legacy mode');
    check(errors.length===0,`Browser errors: ${errors.join('; ')}`);
    return {connectionsUsesDependencies:true,optionalInspectionStable:true,
      wheelExpansion:true,wheelCollapse:true,hoverOnlyTracing:true,allReferencesAccounted:true,
      exactReferenceFollow:true,doubleClickExpansion:true,spaceFlight:true,reloadAndHistory:true,
      groupDragSaved:true,deepPinSaved:true,labelDragSaved:true,freshBrowserRestored:true,
      narrowViewport:true,detailsClose:true,keyboardPaging:true,stickyPager:true,boundedReferenceRows:true,
      compactStaleWarning:true,metadataDisclosure:true,liveGroupControl:true,overviewAddress:true,resetRefusal:true,
      interiorConnectionTracing:true,centeredGalaxy:true,configurationSubset:true,primaryNames:true,galaxyPinIsolated:true,
      outsideTargetHint:true,openSteps,errors};
  } finally {
    page.off('request',observe);page.off('pageerror',error);
    await page.evaluate(async original=>{
      const cache=state.positionCache;
      if(!await cache.write(original.mode,null))throw new Error('Could not restore the synthetic layout');
      if(Object.hasOwn(original.layouts,original.mode)&&!await cache.moveMany(original.mode,original.layouts[original.mode]))
        throw new Error('Could not restore the synthetic pins');
      if(original.mode!=='galaxy'){
        if(!await cache.write('galaxy',null))throw new Error('Could not restore the synthetic galaxy layout');
        if(original.layouts.galaxy&&!await cache.moveMany('galaxy',original.layouts.galaxy))throw new Error('Could not restore synthetic galaxy pins');
      }
      $('layout').value=original.mode;layout();
    },original);
  }
}
