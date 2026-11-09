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
    let stable,cardPosition;
    for(const fraction of [.2,.3,.4,.6,.7,.8]) {
      await move(await point('a','b',fraction));
      const trace=await page.evaluate(()=>({text:$('map-tooltip').textContent,key:state.trace?.key,arrows:
        state.cy.edges('.trace-outgoing,.trace-incoming').map(e=>({role:e.hasClass('trace-outgoing')?'out':'in',
          color:e.style('target-arrow-color'),stroke:e.style('line-color'),opacity:e.style('opacity')}))}));
      check(trace.key===JSON.stringify(['pair','a','b']),'Shared native path lost its pointer trace');
      check(/A -> B: 7 refs.*B -> A: 2 refs/.test(trace.text),'Reciprocal mixed-type counts are incomplete');
      if(stable)check(stable===trace.text,'Pair readout changed along its native path');else stable=trace.text;
      check(trace.arrows.some(a=>a.role==='out')&&trace.arrows.some(a=>a.role==='in'),'Both directional arrows are missing');
      check(trace.arrows.every(a=>a.opacity==='1'),'Active direction contrast is composited away');
      const card=await page.locator('#hover-card').boundingBox();
      check(card&&await page.locator('#hover-card').innerText().then(text=>/Sender -> Receiver.*7 refs.*Receiver -> Sender.*2 refs/s.test(text)),
        'Nearby pair card must show both named directions');
      if(cardPosition)check(card.x===cardPosition.x&&card.y===cardPosition.y,'The card moved while following the same pair');
      else cardPosition=card;
    }
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
    check(await page.evaluate(()=>!state.trace&&state.cy.elements('.focus,.hovered').length===0&&
      $('hover-card').hidden&&!$('map-tooltip').textContent.includes('A -> B')),'Escape retained stale emphasis or counts');
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
    check(await page.evaluate(()=>state.selection?.attrs.target_declaration.id==='declaration-base-a'),
      'Following an exact external relationship lost its original declaration');
    await page.evaluate(()=>{delete state.target.roots['sample-sdk'];state.detailsKey=null;renderDetails(state.selection);});
    check(await page.locator('#details').innerText().then(text=>text.includes('source root is unavailable'))&&
      await page.locator('#details .target-declaration a').count()===0,'Unavailable roots must remain explicit and unlinked');
    await page.evaluate(()=>{
      delete state.selection.attrs.target_declaration;state.detailsKey=null;renderDetails(state.selection);
    });
    check(await page.locator('#details').innerText().then(text=>text.includes('not recorded in this snapshot')),
      'Older external rows lost their missing-provenance explanation');
    check(await page.evaluate(()=>JSON.stringify(state.positionCache.layouts)===traceProof.pins)&&requests.length===0&&errors.length===0,
      'External inspection wrote pins, fetched extra facts or produced runtime errors');
    return {nativeReciprocalPath:true,bothDirectionInspection:true,oneWay:true,recursion:true,filterRefresh:true,
      noHoverRequests:true,noDecorations:true,keyboardReadout:true,externalOwnership:true,externalZoom:true,
      exactDeclarationLinks:true,sharedProvider:true,missingProvenance:true,contrasts,errors};
  }finally{page.off('request',observe);page.off('pageerror',onError);await page.reload();}
}
