// SPDX-License-Identifier: AGPL-3.0-or-later
// Evaluate on the served synthetic sample; only this tab's in-memory graph changes.
async page => {
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  const frames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  check(await page.evaluate(()=>state.target.id==='sample'),'Readability proof requires the synthetic sample');
  const requests=[],errors=[];
  page.on('request',request=>requests.push({url:request.url(),method:request.method()}));
  page.on('pageerror',error=>errors.push(error.message));
  await page.evaluate(()=>{
    const node=(id,label,level,parent,attrs={})=>({id,label,level,parent,attrs,boundary:false,status:'in-target'});
    const nodes=[node('root','Sample','project',null),node('module','SampleCore','module','root',{source_sections:true}),
      node('scope','Sample','namespace','module',{
        source_partition:{id:'private',label:'Private implementation',collapsed:true,folders:['Helpers'],
          file:{root:'project',path:'Source/Sample/Private/Helpers/SampleHelpers.h'}}}),
      node('detail','Detail','namespace','scope'),
      node('record','Record','class','detail',{declaration_kind:'class',qualified:'Sample::Detail::Record'}),
      node('get','Get','function','record',{qualified:'Sample::Detail::Record::Get',declaration_kind:'method',
        access:'public',static:true,type_signature:'int Get()',declaration_origin:'unknown'}),
      node('data','Data','class','detail',{qualified:'Sample::Detail::Data',declaration_kind:'struct',
        member_counts:{fields:{public:2},callables:{}}}),
      node('other','Other','class','detail'),
      node('other-get','Get','function','other',{qualified:'Sample::Detail::Other::Get',signature:'Get(int)'})];
    let parent='get';
    for(let i=0;i<8;i++){
      const id='nested'+i;
      for(let sibling=0;sibling<3;sibling++)nodes.push(node(id+'-peer'+sibling,'Local helper '+sibling,'function',parent));
      nodes.push(node(id,i%2?'operator()':'lambda Sample.cpp:'+i+':4',i%2?'function':'class',parent,
        {declaration_kind:i%2?'method':'lambda'}));
      parent=id;
    }
    nodes.push(node('wide','SampleDense','module','root'));
    nodes.push(node('surface','SamplePublicSurface','module','root',{source_sections:true}));
    for(const name of ['ConfigurationReader','ConfigurationWriter','Result','ResultFactory'])
      nodes.push(node('surface-'+name,'SampleArchitectureBoundary'+name,'class','surface',{
        source_partition:{id:'public',label:'Public headers',collapsed:false,folders:[],file:{root:'project',
          path:'Source/Sample/Public/'+(name.startsWith('Result')?'SampleResults':name)+'.h'}}}));
    nodes.push(node('surface-private','InternalHelper','class','surface',{
      source_partition:{id:'private',label:'Private implementation',collapsed:true,folders:[]}}));
    for(let i=0;i<72;i++){
      nodes.push(node('wide'+i,'SampleLongArchitectureContextReader'+i,'class','wide',
        {signature:'SampleLongArchitectureContextReader'+i+'<SamplePolicy, SampleAllocator, SampleConfiguration>'}));
      nodes.push(node('wide-member'+i,'Read','function','wide'+i));
    }
    state.manifest={...state.manifest,levels:['project','module','namespace','class','function'],
      edge_types:[{id:'calls',label:'calls'}]};delete state.manifest.overview;
    state.universe=new Universe({schema:'laniakea.graph/1',nodes,edges:[]});
    state.index={nodes:nodes.map(n=>({...n,file:n.id+'.json',child_count:state.universe.childIds(n.id).length}))};
    state.indexLookup=null;state.scopeShard={scope:'root',title:'Sample',parents:[]};state.selection=null;
    state.hidden=new Set();state.cy.destroy();renderGraph();
    state.target={...state.target,stale:true,changed_count:2,changed:['Source/SampleDense/A.cpp','Source/SampleDense/B.cpp']};
    renderBanner();
    toggleGroup('wide');
  });
  await frames();
  check(await page.evaluate(()=>state.universe.childIds('wide').filter(id=>state.visibleLabels.has(id)).length>=16),
    'Dense scope still shows mostly anonymous glyphs after framing');
  await page.locator('#find').fill('SampleLongArchitectureContextReader');await page.locator('#find').press('ArrowUp');
  const resultBox=await page.locator('#find-results').boundingBox(),activeBox=await page.locator('#find-results button.active').boundingBox();
  check(activeBox.y>=resultBox.y&&activeBox.y+activeBox.height<=resultBox.y+resultBox.height,
    'Keyboard choice is hidden outside the bounded result list');
  await page.locator('#find').fill('');
  await page.evaluate(()=>{flyToNode('surface',false);state.universe.expanded.add('surface');refreshMap();frameNode('surface');});
  await frames();
  check(await page.evaluate(()=>state.universe.childIds('surface').every(id=>state.visibleLabels.has(id)&&
    state.cy.getElementById(id).style('label')===state.universe.nodes.get(id).label)),
    'Compact public surface must show all complete declaration names');
  const header=await page.evaluate(()=>state.universe.childIds('surface').find(id=>state.universe.nodes.get(id).label==='SampleResults.h'));
  check(header,'Recorded header is missing from the public surface');
  await page.evaluate(id=>flyToNode(id),header);await frames();
  check(/source file/.test(await page.locator('#details').innerText()),'Header is not identified as source context');
  await page.getByRole('button',{name:'Expand constellation',exact:true}).click();await frames();
  await page.waitForFunction(()=>!state.gestureActive&&state.visibleLabels&&!state.viewportFrame);
  check(await page.evaluate(()=>['surface-Result','surface-ResultFactory'].every(id=>state.cy.getElementById(id).length&&
    state.universe.nodes.get(id).parent==='surface'&&state.visibleLabels.has(id)&&
    state.cy.getElementById(id).style('label')===state.universe.nodes.get(id).label)),
    'Header expansion must reveal readable types without rewriting their semantic parent');
  await page.locator('#find').fill('Public/SampleResults.h');
  check(await page.locator('#find-results button').count()===1,'Recorded header path must be searchable');
  await page.locator('#find').press('Enter');await page.waitForFunction(id=>state.selection?.id===id,header);
  await page.locator('#find').fill('Sample::Detail::Record::Get');
  check(await page.locator('#find-results button').count()===1,'Qualified search must identify its owner');
  await page.locator('#find').press('Enter');
  await page.waitForFunction(()=>state.selection?.id==='get');
  check(await page.locator('#inspector-page-details > code').innerText()==='int Get()','Signature is not primary inspection content');
  check(/public.*static/.test(await page.locator('#details').innerText()),'Access and static method context missing');
  await page.locator('#clear').click();
  await page.waitForFunction(()=>!state.gestureActive&&!state.viewportFrame&&state.mapSize.width===$('graph').getBoundingClientRect().width);
  await frames();
  const point=await page.evaluate(()=>{const p=state.cy.getElementById('get').renderedPosition(),b=$('graph').getBoundingClientRect();
    return{x:b.x+p.x,y:b.y+p.y};});
  const before=requests.length;
  await page.mouse.move(10,10);await page.mouse.move(point.x,point.y);await frames();
  check(await page.locator('#hover-card').isVisible()&&/int Get\(\)/.test(await page.locator('#hover-card').innerText()),
    'Trusted hover did not show the recorded signature');
  check(!requests.slice(before).some(r=>r.method==='POST'||r.url.includes('/references')),'Hover requested pages or saved pins');
  await page.locator('#find').fill('Get');
  check(await page.locator('#find-results button').count()===2,'Ambiguous names require both choices');
  await page.locator('#find').press('ArrowDown');
  const chosen=await page.evaluate(()=>state.findCandidates[state.findChoice].id);
  await page.locator('#find').press('Enter');await page.waitForFunction(id=>state.selection?.id===id,chosen);
  await page.evaluate(()=>flyToNode('data'));
  check(/struct/.test(await page.locator('#details').innerText())&&
    /2 observed fields \/ 0 observed callables/.test(await page.locator('#details').innerText())&&
    /not individual stars/.test(await page.locator('#details').innerText()),'Data-only type looks empty or has the wrong kind');
  await page.locator('#clear').click();
  await page.evaluate(()=>{state.universe.expanded=new Set(['root']);flyToNode('module',false);
    state.universe.expanded.add('module');refreshMap();frameNode('module');});
  let wheelSteps=0;
  const journey=await page.evaluate(()=>state.universe.paths.get('nested7').slice(2,-1));
  check(journey.some(id=>id.startsWith('source-section:')),'Deep journey must cross folded source regions');
  check(journey.some(id=>id.startsWith('source-file:')),'Deep journey must cross a header constellation');
  for(const id of journey){
    if(await page.evaluate(id=>state.universe.regions.has(id),id))continue;
    for(let step=0;step<65;step++){
      if(await page.evaluate(id=>state.universe.expanded.has(id),id))break;
      let p=await page.evaluate(id=>{const n=state.cy.getElementById(id),b=$('graph').getBoundingClientRect();
        if(!n.length)throw Error('Owner not revealed: '+id);const p=n.renderedPosition();return{x:b.x+p.x,y:b.y+p.y};},id);
      const box=await page.locator('#graph').boundingBox();
      if(p.x<box.x+40||p.x>box.x+box.width-40||p.y<box.y+40||p.y>box.y+box.height-40){
        const delta={x:Math.max(-box.width/4,Math.min(box.width/4,box.x+box.width/2-p.x)),
          y:Math.max(-box.height/4,Math.min(box.height/4,box.y+box.height/2-p.y))};
        const blank=await page.evaluate(delta=>{
          const b=$('graph').getBoundingClientRect(),glyphs=state.cy.nodes().not('.expanded');
          for(const y of [b.height*.4,b.height*.6])for(const x of [b.width*.25,b.width*.75])
            if(glyphs.every(n=>{const p=n.renderedPosition();return Math.hypot(p.x-x,p.y-y)>60;}))
              return{x:b.x+x,y:b.y+y};
          throw Error('No background for a safe pan');
        },delta);
        await page.mouse.move(blank.x,blank.y);await page.mouse.down();
        await page.mouse.move(blank.x+delta.x,blank.y+delta.y,{steps:6});await page.mouse.up();await frames();
        continue;
      }
      await page.mouse.move(p.x,p.y);await page.mouse.wheel(0,-120);await frames();wheelSteps++;
    }
    check(await page.evaluate(id=>state.universe.expanded.has(id),id),'Wheel cannot reach '+id+' '+JSON.stringify(await page.evaluate(id=>({
      zoom:worldZoom(),limit:state.cy.maxZoom(),radius:state.universe.radii.get(id),pointer:state.pointer,
      point:state.cy.getElementById(id).renderedPosition(),size:state.mapSize,scope:state.scopeShard.scope}),id)));
  }
  check(await page.evaluate(()=>state.cy.getElementById('nested7').length===1),'Deep callable not visible');
  check(await page.evaluate(()=>worldZoom()>20000),'The deep fixture did not exercise the former zoom ceiling');
  await page.evaluate(()=>flyToNode('nested7',false));
  for(const width of [1440,640]){
    await page.setViewportSize({width,height:1000});await frames();
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Deep header overflows viewport');
    check(await page.locator('#crumbs .crumb-links a').count()>0,'Earlier ancestors are inaccessible');
    await page.locator('#crumbs summary').click();
    check(await page.locator('#crumbs .crumb-links a').first().isVisible(),'Ancestor disclosure is not reachable');
    await page.locator('#crumbs summary').click();
  }
  check(!requests.some(r=>r.method==='POST')&&!errors.length,'Readability exploration wrote pins or raised errors');
  return {qualifiedSearch:true,ambiguousKeyboardChoice:true,signatureHover:true,noHoverRequests:true,
    dataOnlyCoverage:true,headerExpansion:true,deepWheel:true,earlierAncestors:true,narrowHeader:true,wheelSteps,errors};
}
