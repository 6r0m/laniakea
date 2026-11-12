// SPDX-License-Identifier: AGPL-3.0-or-later
// Serve fixtures/namespace-files.graph.json through the normal map/read-index pipeline.
async page=>{
  const check=(ok,message)=>{if(!ok)throw Error(message);},errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/layout/'))writes.push(r.url());});
  const settle=async()=>{await page.waitForFunction(()=>!state.viewportFrame&&!state.gestureActive&&!state.zoomFrame&&!state.wheelFrame);
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
  check(await page.evaluate(()=>state.target.id==='sample'&&state.universe.nodes.has('build')),'Requires namespace fixture');
  const initial=await page.evaluate(()=>JSON.stringify(state.positionCache.layouts));
  const file=path=>page.evaluate(path=>state.universe.fileIds.find(id=>state.universe.nodes.get(id).source.path.endsWith(path)),path);
  const header=await file('Public/API.h'),cpp=await file('Private/API.cpp'),helper=await file('Private/Helper.cpp');
  const alias=await page.evaluate(id=>state.universe.navigationTarget(id),header);
  check(alias&&alias!==header,'Header has no recorded namespace-file entry');
  const reset=async()=>{await page.evaluate(()=>{const u=state.universe;u.expanded=new Set([u.root]);flyToNode('module',false);
    u.expanded.add('module');refreshMap();frameNode('module');});await settle();};
  const groups=await page.evaluate(async()=>{
    const ids={};
    for(const ref of state.universe.graph.edges){const page=await state.referencePages.load({groups:[ref.group]});
      for(const row of page.items)ids[row.reference.id]=ref.group;}
    return ids;
  });
  const assertFrontier=async expanded=>{
    const result=await page.evaluate(({groups,header,cpp,helper,alias,expanded})=>{
      const u=state.universe,v=state.shard,edge=id=>v.edges.find(e=>e.refs.some(r=>r.group===groups[id]));
      const refs=[...v.edges.flatMap(e=>e.refs),...[...v.internal.values()].flat()];
      const helperContext=u.fileContext(u.graph.edges.find(r=>r.group===groups['build-helper-1']),'target');
      return {incoming:edge('external-build')?.target,from:edge('build-helper-1')?.source,to:edge('build-helper-1')?.target,
        expectedHelper:expanded?helperContext:helper,unknown:edge('unknown-location')?.target,
        headers:v.nodes.filter(n=>n.attrs?.source_file&&n.source.path.endsWith('Public/API.h')).map(n=>n.id),
        unique:new Set(refs.map(r=>r.group)).size===u.graph.edges.length,total:refs.reduce((n,r)=>n+r.count,0),
        parents:[u.nodes.get('build').parent,u.nodes.get('record').parent]};
    },{groups,header,cpp,helper,alias,expanded});
    check(result.incoming===(expanded?alias:header),'Incoming file provenance hidden by namespace');
    check(result.from===cpp&&result.to===result.expectedHelper,'Implementation files lost their relationship');
    check(result.headers.length===1&&result.headers[0]===(expanded?alias:header),'Duplicate disconnected header');
    check(result.unique&&result.total===9&&result.parents.every(id=>id==='scope'),'Lost refs or canonical owners');
  };
  await reset();await assertFrontier(false);
  await page.evaluate(()=>{state.universe.expanded.add('scope');flyToNode('scope',false);refreshMap();frameNode('scope');});await settle();await assertFrontier(true);
  await page.evaluate(id=>flyToNode(id),alias);await settle();await page.waitForFunction(()=>!state.referencePages.pending.size);
  const contextText=await page.locator('#details').innerText();
  check(/Incoming references recorded \(6\)/.test(contextText)&&!/Could not load/.test(contextText),'File-context exact paging is incorrect');
  await reset();await page.evaluate(id=>flyToNode(id),header);await settle();
  await page.getByRole('button',{name:'Open recorded scope',exact:true}).focus();await page.keyboard.press('Enter');await settle();
  check(await page.evaluate(id=>state.scopeShard.scope===id&&state.cy.getElementById('build').length&&state.cy.getElementById('record').length,alias),
    'Keyboard header entry did not reveal original declarations');
  await page.keyboard.press('Escape');
  check(await page.evaluate(groups=>state.shard.edges.some(e=>e.target==='build'&&e.refs.some(r=>r.group===groups['external-build']))&&
    state.shard.edges.some(e=>e.source==='build'&&e.target==='build'&&e.refs.some(r=>r.group===groups['recursive-1'])),groups),
    'Visible callable did not become the endpoint or true recursion disappeared');
  await page.reload();await page.waitForFunction(()=>state.cy&&state.positionCache);await settle();
  check(await page.evaluate(id=>state.scopeShard.scope===id&&state.cy.getElementById('build').length,alias),'Reload lost the file context');
  await reset();
  const p=await page.evaluate(id=>{const p=state.cy.getElementById(id).renderedPosition(),b=$('graph').getBoundingClientRect();
    return{x:p.x+b.x+2,y:p.y+b.y+2};},header);
  await page.mouse.move(p.x,p.y);await page.mouse.wheel(0,-1);await settle();
  check(await page.evaluate(id=>!state.universe.expanded.has(id),alias),'Tiny wheel input jumped into the contextual file');
  for(let i=0;i<40&&!await page.evaluate(id=>state.scopeShard.scope===id,alias);i++){
    const before=await page.evaluate(id=>{const u=state.universe,b=$('graph').getBoundingClientRect(),p=u.positions.get(id),zoom=worldZoom(),pan=state.cy.pan();
      return{x:b.x+p.x*zoom+pan.x,y:b.y+p.y*zoom+pan.y,size:2*u.radii.get(id)*zoom};},header);
    await page.mouse.move(before.x,before.y);await page.mouse.wheel(0,-60);await settle();
    if(await page.evaluate(id=>state.scopeShard.scope===id,alias))check(await page.evaluate(({alias,before})=>{
      const b=state.universe.bounds.get(alias),zoom=worldZoom(),span=Math.max(b.x2-b.x1,b.y2-b.y1,2*state.universe.radii.get(alias));
      return Math.abs(span*zoom-before.size*Math.exp(.108))<1e-5;
    },{alias,before}),'Contextual file entry changed its apparent footprint');
  }
  check(await page.evaluate(id=>state.scopeShard.scope===id&&state.cy.getElementById('build').length,alias),'Trusted wheel missed the contextual header');
  await reset();await page.evaluate(id=>flyToNode(id,false),header);await settle();
  const q=await page.evaluate(id=>{const p=state.cy.getElementById(id).renderedPosition(),b=$('graph').getBoundingClientRect();return{x:p.x+b.x,y:p.y+b.y};},header);
  await page.mouse.dblclick(q.x,q.y);await settle();
  check(await page.evaluate(id=>state.scopeShard.scope===id,alias),'Double-click could not enter the recorded scope');
  check(await page.evaluate(initial=>JSON.stringify(state.positionCache.layouts)===initial,initial),'Navigation changed pins');
  check(!errors.length&&!writes.length,'Runtime errors or unexpected pin writes');
  return {fileFirst:true,namespaceContexts:true,noRedundantHeader:true,weightedCounts:true,exactPaging:true,
    semanticHandoff:true,recursion:true,canonicalOwners:true,keyboard:true,wheel:true,doubleClick:true,reload:true,pinsUnchanged:true,errors};
}
