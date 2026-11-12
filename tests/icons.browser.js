// SPDX-License-Identifier: AGPL-3.0-or-later
// Run on the disposable synthetic server; icons decorate the existing native graph.
async page=>{
  const check=(ok,message)=>{if(!ok)throw Error(message);},errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.method()==='POST')writes.push(r.url());});
  const settle=async()=>{await page.waitForFunction(()=>!state.viewportFrame&&!state.gestureActive&&!state.zoomFrame&&!state.wheelFrame);
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
  check(await page.evaluate(()=>state.target.id==='sample'),'Requires disposable sample');
  await page.evaluate(()=>{
    const node=(id,parent,level,attrs={})=>({id,parent,level,label:id,attrs,status:'in-target',boundary:false});
    const graph={schema:'laniakea.graph/1',nodes:[node('root',null,'project'),node('module','root','module'),
      node('namespace','module','namespace'),node('class','namespace','class'),node('method','class','function',{declaration_kind:'method'}),
      node('struct','module','class',{declaration_kind:'struct'}),node('field','struct','function',{declaration_kind:'field'}),
      node('plugin','root','plugin'),node('folder','root','folder')],edges:[
      {id:'use',source:'method',target:'field',type:'calls',status:'resolved'}]};
    state.universe=new Universe(graph);state.universe.place({},'galaxy');
    state.index={nodes:graph.nodes.map(n=>({...n,file:n.id+'.json',child_count:state.universe.childIds(n.id).length}))};
    state.indexLookup=new Map(state.index.nodes.map(n=>[n.id,n]));
    state.manifest.edge_types=[{id:'calls',label:'calls',status:'resolved'}];state.hidden=new Set();state.selection=null;
    state.universe.reveal('field');state.universe.reveal('method');state.scopeShard={scope:'module',title:'Module',parents:[]};
    renderGraph();layout();flyToNode('class',false);state.universe.expanded.add('class');refreshMap();frameNode('class');
  });await settle();
  const initial=await page.evaluate(()=>({pins:JSON.stringify(state.positionCache.layouts),positions:JSON.stringify([...state.universe.positions]),
    ids:state.cy.elements().map(n=>n.id()).sort()}));
  for(const theme of ['dark','light']){
    await page.emulateMedia({colorScheme:theme});await settle();
    const proof=await page.evaluate(async()=>{
      const cy=state.cy,zoom=cy.zoom(),node=cy.getElementById('method'),expanded=cy.getElementById('class');
      const uri=node.style('background-image');
      const image=new Image();image.src=Array.isArray(uri)?uri[0]:uri;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=24;canvas.height=24;
      const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
      const painted=ctx.getImageData(0,0,24,24).data.some((n,i)=>i%4===3&&n>0);
      return {painted,kind:node.data('iconKind'),
        opacity:node.style('background-image-opacity')[0],icon:parseFloat(node.style('background-width'))*zoom,
        expanded:expanded.hasClass('expanded'),titleVisible:expanded.style('background-image-opacity')[0],
        offset:parseFloat(expanded.style('background-offset-x'))*zoom,
        ids:cy.elements().map(n=>n.id()).sort(),positions:JSON.stringify([...state.universe.positions])};
    });
    check(proof.painted&&proof.kind==='function'&&Number(proof.opacity)===1,'Callable icon did not decode or is hidden');
    check(Math.abs(proof.icon-26*.58)<.1,'Icon size changed with native renderer units');
    check(proof.expanded&&Number(proof.titleVisible)===1&&proof.offset<0,'Expanded title lost its type icon');
    check(JSON.stringify(proof.ids)===JSON.stringify(initial.ids)&&proof.positions===initial.positions,'Decoration changed graph or positions');
    await page.locator('#type-key summary').focus();await page.keyboard.press('Enter');
    check(await page.locator('#icon-key').isVisible(),'Icon key has no keyboard route');
    check(await page.locator('#icon-key img').count()===17,'Icon key is incomplete');
    check(await page.locator('#icon-key').evaluate(el=>el.getBoundingClientRect().right<=innerWidth),'Icon key overflows');
    await page.keyboard.press('Escape');
    check(!await page.locator('#type-key').evaluate(el=>el.open),'Escape leaves the icon key open');
  }
  const point=await page.evaluate(()=>{const p=state.cy.getElementById('method').renderedPosition(),b=$('graph').getBoundingClientRect();
    return{x:p.x+b.x,y:p.y+b.y};});
  await page.mouse.move(point.x,point.y);await settle();
  check(await page.evaluate(()=>state.trace?.kind==='node'&&state.trace.source==='method'),'Icon center intercepted native node hover');
  await page.mouse.click(point.x,point.y);await page.waitForFunction(()=>state.selection?.id==='method');
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{
    state.universe.expanded=new Set([state.universe.root]);state.scopeShard={scope:state.universe.root};
    refreshMap();setWorldViewport(.02,{x:300,y:300});
  });await settle();
  check(await page.evaluate(()=>state.cy.nodes().every(n=>Number(n.style('background-image-opacity')[0])===0)),
    'Far overview keeps unreadable detail icons');
  await page.setViewportSize({width:640,height:900});await settle();
  await page.locator('#type-key summary').click();
  check(await page.locator('#icon-key').evaluate(el=>el.getBoundingClientRect().left>=0&&el.getBoundingClientRect().right<=innerWidth),
    'Narrow icon key is clipped');
  check(await page.evaluate(pins=>JSON.stringify(state.positionCache.layouts)===pins,initial.pins),'Icons changed saved pins');
  check(!errors.length&&!writes.length,'Runtime errors or position writes');
  return {localVectors:true,dark:true,light:true,expandedTitle:true,stableSizes:true,graphUnchanged:true,
    nativeHover:true,nativeClick:true,farOverview:true,keyboardLegend:true,narrow:true,pinsUnchanged:true,errors};
}
