// SPDX-License-Identifier: AGPL-3.0-or-later
// Evaluate on the served synthetic sample; replaces only this tab's in-memory scene.
async page => {
  const check=(ok,message)=>{if(!ok)throw new Error(message);};
  const frames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.waitForFunction(()=>state.cy&&state.positionCache);
  check(await page.evaluate(()=>state.target.id==='sample'),'Trace mutation proof requires the synthetic sample');
  const requests=[],errors=[];
  const observe=request=>{if(request.method()==='POST')requests.push(request.url());};
  const onError=error=>errors.push(error.message);
  page.on('request',observe);page.on('pageerror',onError);
  try {
    await page.evaluate(()=>{
      const node=(id,label)=>({id,label,level:id==='root'?'project':'function',parent:id==='root'?null:'root',
        boundary:false,status:'in-target'});
      const nodes=[node('root','Sample'),node('a','Sender'),node('b','Receiver'),node('c','Crossing source'),
        node('d','Crossing target'),node('e','One way')];
      const edge=(id,source,target,type='calls')=>({id,source,target,type,status:'resolved',origin:'synthetic'});
      const edges=[...Array.from({length:3},(_,i)=>edge('call'+i,'a','b')),
        ...Array.from({length:4},(_,i)=>edge('type'+i,'a','b','uses.type')),
        ...Array.from({length:2},(_,i)=>edge('back'+i,'b','a')),edge('self','a','a'),
        edge('cross','c','d'),edge('one','b','e')];
      state.manifest={...state.manifest,edge_types:[{id:'calls',label:'calls'},{id:'uses.type',label:'type refs'}],sources:[]};
      delete state.manifest.overview;
      state.universe=new Universe({schema:'laniakea.graph/1',nodes,edges});
      state.index={nodes:nodes.map(n=>({...n,child_count:0,file:n.id+'.json'}))};state.indexLookup=null;
      state.scopeShard={scope:'root',title:'Sample',parents:[]};state.selection=null;state.hidden=new Set();
      state.cy.destroy();renderGraph();
      const coordinates={root:[0,0],a:[-300,0],b:[300,0],c:[0,-220],d:[0,220],e:[400,220]};
      for(const [id,[x,y]] of Object.entries(coordinates))state.universe.positions.set(id,{x,y});
      state.universe.indexPositions();refreshMap();fitMap();
      globalThis.traceProof={pins:JSON.stringify(state.positionCache.layouts),positions:JSON.stringify([...state.universe.positions]),
        elements:state.cy.elements().length};
    });
    const point=async (source,target,fraction=.25)=>page.evaluate(({source,target,fraction})=>{
      const a=state.cy.getElementById(source).renderedPosition(),b=state.cy.getElementById(target).renderedPosition();
      const box=$('graph').getBoundingClientRect();
      return {x:box.x+a.x+(b.x-a.x)*fraction,y:box.y+a.y+(b.y-a.y)*fraction};
    },{source,target,fraction});
    const move=async p=>{
      await page.waitForFunction(()=>!state.gestureActive&&!state.viewportFrame);
      await page.mouse.move(p.x,p.y);await frames();
    };
    let stable,cardPosition,lastFocus;
    for(const fraction of [.2,.3,.4,.6,.7,.8]) {
      await move(await point('a','b',fraction));
      const trace=await page.evaluate(()=>({text:$('map-tooltip').textContent,key:state.trace?.key,arrows:
        state.cy.edges('.trace-outgoing,.trace-incoming').map(e=>({role:e.hasClass('trace-outgoing')?'out':'in',
          color:e.style('target-arrow-color'),stroke:e.style('line-color'),opacity:e.style('opacity')}))}));
      check(trace.key===JSON.stringify(['pair','a','b']),'Shared native path lost its pointer trace');
      const focus=await page.evaluate(()=>state.trace.focus);
      const expected=fraction<.5?'a':'b';
      check(focus.id===expected&&focus.counts.incoming===(expected==='a'?2:7)&&focus.counts.outgoing===(expected==='a'?7:2),
        'Proximity must reverse directional totals relative to the titled endpoint');
      if(lastFocus===focus.id)check(stable===trace.text,'Readout changed without a focus change');
      check(trace.arrows.some(a=>a.role==='out')&&trace.arrows.some(a=>a.role==='in'),'Both directional arrows are missing');
      check(trace.arrows.every(a=>a.opacity==='1'),'Active direction contrast is composited away');
      const card=await page.locator('#hover-card').boundingBox();
      check(card&&await page.locator('#hover-card .hover-name').innerText()===(expected==='a'?'Sender':'Receiver')&&
        await page.locator('#hover-card .hover-direction').count()===2,'Card must name its focus and use two direction columns');
      check(await page.evaluate(()=>state.cy.nodes('.trace-anchor').length===1&&
        state.cy.nodes('.trace-anchor')[0].id()===state.trace.focus.id),'The titled endpoint must have a visible focus marker');
      if(cardPosition&&lastFocus===focus.id)check(card.x===cardPosition.x&&card.y===cardPosition.y,'Card moved without a focus change');
      cardPosition=card;lastFocus=focus.id;stable=trace.text;
    }
    for(const fraction of [.49,.51,.48,.52]){
      await move(await point('a','b',fraction));
      check(await page.evaluate(()=>state.trace.focus.id==='b'),'Midpoint jitter must not flip the viewpoint');
    }
    check(await page.evaluate(()=>state.cy.edges('.derived').not('.loop').every(edge=>{
      const a=edge.renderedSourceEndpoint(),b=edge.renderedTargetEndpoint(),
        source=edge.source().renderedPosition(),target=edge.target().renderedPosition();
      return Math.hypot(a.x-source.x,a.y-source.y)<.001&&Math.hypot(b.x-target.x,b.y-target.y)<.001;
    })),'Summary hit paths must agree with native rendered centre-to-centre endpoints');
    const pairPoint=await point('a','b',.3);await move(pairPoint);
    // Focused captions can grow across a previously hovered connection.
    await page.evaluate(()=>{
      const a=state.cy.getElementById('a'),b=state.cy.getElementById('b'),z=state.cy.zoom();
      a.style({'label':'Sender caption','text-halign':'center','text-valign':'center','text-margin-y':0,
        'text-margin-x':(b.renderedPosition('x')-a.renderedPosition('x'))*.3/z});
    });
    await page.mouse.click(pairPoint.x,pairPoint.y);await frames();
    check(await page.evaluate(()=>state.selection?.pairInspection&&state.selection.counts.outgoing===7&&
      state.selection.counts.incoming===2&&$('details').querySelectorAll('li').length===9),
      'Native click did not inspect both directions and reference families');
    check(await page.locator('#details .direction-summary button').count()===2,
      'Inspection must expose both directional totals before the reference lists');
    await page.getByRole('button',{name:'B -> A: 2 refs',exact:true}).click();
    check(await page.evaluate(()=>document.activeElement.textContent==='B -> A (2 refs)'),
      'Reverse-reference shortcut did not focus its heading');
    await page.evaluate(()=>{
      state.cy.getElementById('a').removeStyle('text-margin-x text-margin-y text-halign text-valign label');readableLabels();
    });
    await page.keyboard.press('Escape');await frames();
    check(await page.evaluate(()=>!state.trace&&state.cy.elements('.focus,.hovered,.trace-anchor').length===0&&
      $('hover-card').hidden&&!$('map-tooltip').textContent.includes('Focus:')),'Escape retained stale emphasis or counts');
    await move(await point('a','b',.5));
    check(await page.evaluate(()=>state.trace?.kind==='overlap'&&state.trace.pairs.length===2&&
      ConnectionTrace.total(state.trace.refs)===10),'Crossing must expose both pairs without counting reciprocal families twice');
    check(await page.evaluate(()=>state.trace.focus.others===1&&ConnectionTrace.total(state.trace.focus.refs)===1)&&
      await page.locator('#hover-card').innerText().then(text=>text.includes('1 other overlapping connection')&&
      !text.includes('type refs')),'Other crossing pairs must be disclosed outside the focus totals');
    const crossing=await point('a','b',.5);await page.mouse.click(crossing.x,crossing.y);await frames();
    check(await page.evaluate(()=>state.selection?.overlapInspection)&&
      await page.locator('#details .connections button').count()===2,'Click must expose the overlapping candidate list');
    check(await page.evaluate(()=>getComputedStyle($('details').querySelector('.trace-outgoing')).color!==
      getComputedStyle($('details').querySelector('.trace-incoming')).color),'Candidate direction colors are indistinguishable');
    const candidate=page.locator('#details .connections button').first();await candidate.focus();await frames();
    check(await page.evaluate(()=>state.trace?.kind==='pair'),'Keyboard focus must emphasize one candidate');
    await candidate.click();await frames();
    check(await page.evaluate(()=>state.selection?.pairInspection&&state.selection.refs.length===9),
      'Choosing an overlap candidate must reuse both-direction exact inspection');
    await page.keyboard.press('Escape');
    await page.evaluate(()=>{
      state.universe.positions.set('c',{x:-250,y:0});state.universe.positions.set('d',{x:250,y:0});
      state.universe.indexPositions();refreshMap();
    });
    let overlapKey,overlapBox,overlapFocus;
    for(const fraction of [.3,.4,.6,.7]){
      await move(await point('a','b',fraction));
      const key=await page.evaluate(()=>state.trace?.key),box=await page.locator('#hover-card').boundingBox();
      check(await page.evaluate(()=>state.trace?.kind==='overlap'&&state.trace.pairs.length===2),
        'Coincident different endpoint pairs must remain discoverable');
      const focus=await page.evaluate(()=>state.trace.focus.id);
      if(overlapKey)check(key===overlapKey,'Native hit changes must not discard other candidates');
      if(overlapFocus===focus)check(box.x===overlapBox.x&&box.y===overlapBox.y,'Card moved without changing focus');
      overlapKey=key;overlapBox=box;overlapFocus=focus;
    }
    const overlapPoint=await point('a','b',.4);await page.mouse.click(overlapPoint.x,overlapPoint.y);await frames();
    await page.evaluate(()=>{state.hidden.add('calls');applyFilters();});await frames();
    check(await page.evaluate(()=>!state.selection&&!state.trace),'Filtering an overlap must close stale candidate details');
    await page.evaluate(()=>{
      state.hidden.clear();state.universe.positions.set('c',{x:0,y:-220});state.universe.positions.set('d',{x:0,y:220});
      state.universe.indexPositions();refreshMap();
    });
    await move(await point('c','c'));
    check(await page.locator('#hover-card').innerText().then(text=>/Outgoing references recorded.*1 ref.*Incoming references recorded.*0 refs/s.test(text)&&
      text.includes('No incoming references recorded in this snapshot.')),'Zero incoming references must be explicit on the star card');
    await move(await point('c','d',.25));
    check(await page.evaluate(()=>state.trace?.key===JSON.stringify(['pair','c','d'])),'Unrelated crossing pair reused old endpoints');
    await move(await point('b','e',.5));
    check(await page.evaluate(()=>state.trace?.counts.outgoing===1&&state.trace.counts.incoming===0),
      'One-way connection invented reverse references');
    const loop=await page.evaluate(()=>{
      const edge=state.cy.edges().filter(e=>e.source().id()==='a'&&e.target().id()==='a')[0];
      const p=edge.renderedMidpoint(),box=$('graph').getBoundingClientRect();return{x:box.x+p.x,y:box.y+p.y};
    });
    await move(loop);
    check(await page.evaluate(()=>state.trace?.counts.within===1&&$('map-tooltip').textContent.includes('Within/self')),
      'Real recursion did not retain its within/self readout');
    check(await page.locator('#hover-card .hover-within').innerText()==='Within/self: 1'&&
      await page.locator('#hover-card .hover-none').count()===2,'Recursion must stay separate from incoming/outgoing');
    await move(await point('a','a'));
    check(await page.evaluate(()=>state.trace?.kind==='node'&&state.trace.counts.within===1),
      'Node hover omitted its within references');
    await page.mouse.move(10,10);await frames();
    check(await page.locator('#hover-card').isHidden(),'Leaving the trace kept the visual card');
    check(await page.locator('#map-tooltip').innerText().then(text=>text.startsWith('Last traced: ')),
      'Leaving the canvas discarded the readable summary');
    await move(await point('a','b',.3));
    await page.evaluate(()=>{state.hidden.add('uses.type');applyFilters();});await frames();
    check(await page.evaluate(()=>!state.trace&&!$('map-tooltip').textContent.includes('7 refs')),'Filter left stale counts');
    await page.mouse.move(10,10);await move(await point('a','b',.3));
    check(await page.evaluate(()=>state.trace.counts.outgoing===3&&state.trace.counts.incoming===2),
      'Filtered pair totals do not follow the current projection');
    const contrasts=[];
    for(const theme of ['light','dark']) {
      await page.emulateMedia({colorScheme:theme});await frames();
      const colors=await page.evaluate(()=>['--bg','--trace-outgoing','--trace-incoming','--trace-within'].map(css));
      const lum=hex=>{const rgb=hex.trim().slice(1).match(/../g).map(n=>parseInt(n,16)/255)
        .map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
      const bg=lum(colors[0]),values=colors.slice(1).map(c=>(Math.max(bg,lum(c))+.05)/(Math.min(bg,lum(c))+.05));
      check(values.every(v=>v>=4.5),'Trace palette has insufficient theme contrast');contrasts.push({theme,values});
    }
    await page.setViewportSize({width:390,height:844});await frames();
    await page.evaluate(()=>{fitMap();});await move(await point('c','c'));
    const boundedCard=await page.locator('#hover-card').boundingBox(),graph=await page.locator('#graph').boundingBox();
    check(boundedCard&&boundedCard.x>=graph.x&&boundedCard.y>=graph.y&&
      boundedCard.x+boundedCard.width<=graph.x+graph.width&&boundedCard.y+boundedCard.height<=graph.y+graph.height,
      'Narrow hover card escapes the map');
    await page.locator('#map-tooltip').focus();await page.keyboard.press('ArrowRight');
    check(await page.evaluate(()=>document.activeElement===$('map-tooltip')&&document.documentElement.scrollWidth<=innerWidth),
      'Narrow readout is not keyboard accessible or overflows the page');
    await page.setViewportSize({width:1440,height:1000});await frames();
    await move(await point('a','b',.3));await page.mouse.wheel(0,55);
    await page.waitForFunction(()=>!state.gestureActive&&!state.wheelFrame&&!state.viewportFrame);
    check(await page.evaluate(()=>!state.trace&&$('hover-card').hidden&&state.cy.edges('.trace-outgoing,.trace-incoming,.trace-within').length===0),
      'Gesture retained a trace');
    check(await page.evaluate(()=>JSON.stringify(state.positionCache.layouts)===traceProof.pins&&
      JSON.stringify([...state.universe.positions])===traceProof.positions&&state.cy.elements().length<=traceProof.elements),
      'Trace changed positions or accumulated renderer elements');
    check(requests.length===0,'Trace requested pages or wrote layouts');check(errors.length===0,'Browser errors: '+errors.join('; '));
    await page.evaluate(()=>{
      const node=(id,label,level,parent,boundary=false,attrs={})=>({id,label,level,parent,boundary,status:'in-target',attrs});
      const nodes=[node('root','Sample','project',null),node('component','Sample component','module','root'),
        node('derived','SampleDerived','class','component'),node('caller','SampleCaller','function','component'),
        node('suppliers','Toolchains & SDKs','project',null,true),
        node('sdk','Sample SDK','folder','suppliers',true,{ownership:'Recorded SDK root in build context',analysis:'Referenced declarations only'})];
      const edge=(id,source,type,symbol,path,line)=>({id,source,target:'sdk',type,status:'resolved',origin:'synthetic',
        attrs:{symbol,location:{root:'project',path:'Source/Sample.cpp',line:20},
          target_declaration:{id:'declaration-'+id,location:{root:'sample-sdk',path,line}}}});
      const edges=[edge('base-a','derived','inherits','SampleBaseA','include/Bases.h',1),
        edge('base-b','derived','inherits','SampleBaseB','include/Bases.h',2),
        edge('api','caller','calls','SampleApi()','include/Api.h',4)];
      state.manifest={...state.manifest,edge_types:[{id:'inherits',label:'inherits'},{id:'calls',label:'calls'}]};
      state.target.roots={...state.target.roots,'sample-sdk':'C:/SyntheticSDK'};
      state.universe=new Universe({schema:'laniakea.graph/1',nodes,edges});
      state.index={nodes:nodes.filter(n=>!n.boundary).map(n=>({...n,child_count:nodes.filter(c=>c.parent===n.id).length,
        file:n.id==='root'?'entry.json':n.id+'.json'}))};state.indexLookup=null;
      state.scopeShard={scope:'root',title:'Sample',parents:[]};state.selection=null;state.hidden.clear();
      renderGraph();
      for(const [id,[x,y]] of Object.entries({root:[0,0],component:[-260,0],derived:[-280,-40],caller:[-240,40],suppliers:[260,0],sdk:[260,0]}))
        state.universe.positions.set(id,{x,y});
      state.universe.indexPositions();refreshMap();fitMap();
    });
    await page.evaluate(()=>flyToNode('suppliers',false));
    for(let i=0;i<12&&!await page.evaluate(()=>state.universe.expanded.has('suppliers'));i++){
      const p=await point('suppliers','suppliers');await page.mouse.move(p.x,p.y);await page.mouse.wheel(0,-120);await frames();
    }
    await page.waitForFunction(()=>!state.gestureActive&&!state.viewportFrame);
    check(await page.evaluate(()=>state.universe.expanded.has('suppliers')&&state.cy.getElementById('sdk').length===1),
      'Wheel did not reveal the external provider within its recorded constellation');
    await move(await point('sdk','sdk'));
    check(await page.locator('#hover-card').innerText().then(text=>text.includes('Recorded SDK root in build context')&&
      text.includes('Shown types:')&&text.includes('inherits')&&text.includes('calls')),
      'External hover lost ownership evidence or typed reference explanation');
    const provider=await point('sdk','sdk');await page.mouse.click(provider.x,provider.y);await frames();
    check(await page.locator('#details .target-declaration a').count()===3,
      'Exact external relationships did not expose declaring-header links');
    const links=await page.locator('#details .target-declaration a').evaluateAll(items=>items.map(n=>n.getAttribute('href')));
    check(links.includes('vscode://file/C:/SyntheticSDK/include/Bases.h:1')&&
      links.includes('vscode://file/C:/SyntheticSDK/include/Bases.h:2')&&links.includes('vscode://file/C:/SyntheticSDK/include/Api.h:4'),
      'Distinct external declarations collapsed to the same header location');
    check(await page.evaluate(()=>state.cy.getElementById('sdk').length===1),
      'Several consumers created duplicate provider identities');
    await page.getByRole('button',{name:'SampleDerived (class) -> Sample SDK (folder)',exact:true}).first().click();
    await page.waitForFunction(()=>!state.gestureActive&&!state.viewportFrame&&!state.zoomFrame&&!state.wheelFrame);
    check(await page.evaluate(()=>state.selection?.attrs.target_declaration.id==='declaration-base-a'),
      'Following an exact external relationship lost its original declaration');
    await page.evaluate(()=>{delete state.target.roots['sample-sdk'];state.detailsKey=null;renderDetails(state.selection);});
    await frames();
    check(await page.locator('#details').innerText().then(text=>text.includes('source root is unavailable'))&&
      await page.locator('#details .target-declaration a').count()===0,'Unavailable roots must remain explicit and unlinked');
    await page.evaluate(()=>{
      delete state.selection.attrs.target_declaration;state.detailsKey=null;renderDetails(state.selection);
    });
    await frames();
    check(await page.locator('#details').innerText().then(text=>text.includes('not recorded in this snapshot')),
      'Older external rows lost their missing-provenance explanation');
    check(await page.evaluate(()=>JSON.stringify(state.positionCache.layouts)===traceProof.pins)&&requests.length===0&&errors.length===0,
      'External inspection wrote pins, fetched extra facts or produced runtime errors');
    await page.keyboard.press('Escape');await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>{
      const node=(id,label,level,parent,boundary=false)=>({id,label,level,parent,boundary,status:'in-target'});
      const nodes=[node('root','Sample','project',null),node('one','First subsystem with a long ownership path','folder','root'),
        node('two','Second subsystem with a long ownership path','folder','root'),
        node('first','VeryLongSharedDeclarationName','function','one'),node('second','VeryLongSharedDeclarationName','function','two'),
        node('sdk','Sample SDK','project',null,true)];
      const edges=[{id:'first-sdk',source:'first',target:'sdk',type:'calls',count:3},
        {id:'second-sdk',source:'second',target:'sdk',type:'calls',count:5}].map(e=>({...e,status:'resolved',origin:'synthetic'}));
      state.universe=new Universe({schema:'laniakea.graph/1',nodes,edges});
      state.index={nodes:nodes.map(n=>({...n,child_count:nodes.filter(c=>c.parent===n.id).length,file:n.id+'.json'}))};state.indexLookup=null;
      state.scopeShard={scope:'root',title:'Sample',parents:[]};state.selection=null;state.hidden.clear();renderGraph();
      state.universe.expanded=new Set(['root','one','two']);
      state.universe.radii.set('one',100);state.universe.radii.set('two',100);
      for(const [id,[x,y]] of Object.entries({one:[-100,-10],two:[-100,10],first:[-100,-10],second:[-100,10],sdk:[100,0]}))
        state.universe.positions.set(id,{x,y});
      state.universe.indexPositions();refreshMap();fitMap();
    });
    await move(await point('first','sdk',.8));
    check(await page.evaluate(()=>state.trace?.kind==='overlap'&&state.trace.focus.id==='sdk'&&
      state.trace.focus.counts.incoming===8&&state.trace.focus.counts.outgoing===0),
      'Shared endpoint must summarize every incoming peer without inventing outgoing references');
    check(await page.locator('#hover-card .hover-direction').count()===2&&
      await page.locator('#hover-card .hover-none').innerText()==='None','Compact empty direction is missing');
    check(await page.evaluate(()=>{
      const card=$('hover-card').getBoundingClientRect(),peers=[...$('hover-card').querySelectorAll('.hover-peer')];
      return peers.length===2&&peers.every(row=>row.querySelector('span').getBoundingClientRect().height<=36&&
        row.querySelector('strong').getBoundingClientRect().bottom<=card.bottom)&&document.documentElement.scrollWidth<=innerWidth;
    }),'Long peer paths clipped counts or overflowed the narrow card');
    check(await page.locator('#map-tooltip').innerText().then(text=>text.includes('First subsystem')&&text.includes('Second subsystem')),
      'The readable summary must retain disambiguated full ownership paths');
    check(requests.length===0&&errors.length===0&&await page.evaluate(()=>JSON.stringify(state.positionCache.layouts)===traceProof.pins),
      'Viewpoint hover wrote positions, fetched facts or produced errors');
    await page.setViewportSize({width:1440,height:1000});
    // A wide native hit area can select a neighboring wire instead of the geometric centreline under the pointer.
    await page.evaluate(()=>{
      inspectPair('first','sdk');
      state.cy.nodes('.expanded').style('events','no');
      state.cy.getElementById(state.universe.renderPrefix+'first-sdk').style({'width':40,'z-index':100});
      state.cy.getElementById(state.universe.renderPrefix+'second-sdk').style('events','no');state.connectionHits=null;
      globalThis.nativeTap=null;state.cy.one('tap',e=>{globalThis.nativeTap=e.target.id();});
    });
    await page.waitForFunction(()=>!state.gestureActive&&!state.viewportFrame);await frames();
    const mismatched=await point('second','sdk',.6);await page.mouse.move(mismatched.x,mismatched.y);await frames();
    await page.mouse.click(mismatched.x,mismatched.y);await frames();
    check(await page.evaluate(()=>nativeTap===state.universe.renderPrefix+'first-sdk'&&state.selection?.pairInspection&&
      [state.selection.source,state.selection.target].includes('second')),
      'Native wide-edge hit must not override the single geometric hover pair');
    // Route native double taps through the expanded background while keeping the underlying wires geometrically visible.
    await page.evaluate(()=>{
      state.cy.nodes('.expanded').removeStyle('events');state.cy.edges().removeStyle('width z-index');
      state.cy.edges().style('events','no');state.connectionHits=null;
      inspectOverlap(ConnectionTrace.overlap(state.shard,state.shard.edges));
      globalThis.nativeDouble=null;state.cy.one('dbltap',e=>{globalThis.nativeDouble=e.target.id();});
    });
    await page.waitForFunction(()=>!state.gestureActive&&!state.viewportFrame);await frames();
    const beneath=await point('first','sdk',.4);await page.mouse.dblclick(beneath.x,beneath.y,{delay:40});await frames();
    check(await page.evaluate(()=>['one','two'].includes(nativeDouble)&&state.universe.expanded.has('one')&&
      state.universe.expanded.has('two')&&state.selection?.pairInspection&&
      state.selection.key===ConnectionTrace.key('first','sdk')),
      'Double-clicking a wire routed through an expanded background must not fold the group');
    check(requests.length===0&&errors.length===0,'Pointer routing wrote layouts or produced runtime errors');
    return {nativeReciprocalPath:true,bothDirectionInspection:true,oneWay:true,recursion:true,filterRefresh:true,
      noHoverRequests:true,noDecorations:true,keyboardReadout:true,externalOwnership:true,externalZoom:true,
      exactDeclarationLinks:true,sharedProvider:true,missingProvenance:true,crossingCandidates:true,proximityFocus:true,midpointStable:true,
      coincidentPairs:true,stableOverlapCard:true,keyboardCandidate:true,compactSharedEndpoint:true,longPeersNarrow:true,
      mismatchedNativeHit:true,wireDoubleClickKeepsGroup:true,contrasts,errors};
  }finally{page.off('request',observe);page.off('pageerror',onError);await page.reload();}
}
