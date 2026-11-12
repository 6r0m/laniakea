// SPDX-License-Identifier: AGPL-3.0-or-later
// Expanded owners and descendant references must have identifiable rendered endpoints at every frontier.
async page=>{
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  check(await page.evaluate(()=>state.target.id==='sample'),'Endpoint proof requires the disposable sample');
  const errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/layout/'))writes.push(r.url());});
  const settle=async()=>{await page.waitForFunction(()=>!state.gestureActive&&!state.viewportFrame);
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
  await page.evaluate(()=>{
    const node=(id,parent,level,attrs={})=>({id,parent,label:id,level,attrs,status:'in-target',boundary:false});
    const partition={id:'public',label:'Public headers',collapsed:false,folders:[],file:{root:'project',path:'Source/Sample/Public/API.h'}};
    const nodes=[node('root',null,'project'),node('module','root','module',{source_sections:true}),
      node('Scope','module','namespace',{source_sections:true,source_partition:partition}),
      node('Record','Scope','class',{source_partition:partition}),node('Read','Record','function'),
      node('Lambda','Read','class'),node('operator()','Lambda','function'),node('Peer','root','class')];
    const edges=[['build','module','Peer'],['type','Record','Peer'],['call','Read','Peer'],
      ['lambda','operator()','Peer'],['reverse','Peer','Record'],['recursion','Read','Read']]
      .map(([id,source,target],i)=>({id,source,target,type:i===0?'depends':'calls',status:'derived',count:i+1}));
    state.universe=new Universe({schema:'laniakea.graph/1',nodes,edges});
    state.index={nodes:nodes.map(n=>({...n,file:n.id+'.json',child_count:state.universe.childIds(n.id).length}))};
    state.indexLookup=null;state.scopeShard={scope:'root',title:'Sample',parents:[]};state.selection=null;
    state.manifest={...state.manifest,edge_types:[{id:'depends',label:'depends'},{id:'calls',label:'calls'}]};
    delete state.manifest.overview;state.hidden=new Set();state.cy.destroy();renderGraph();
    state.universe.translate('Record',35,-20);refreshMap();
    globalThis.endpointAudit=()=>{
      const seen=new Set(),u=state.universe,view=state.shard;
      for(const edge of view.edges){
        const rendered=state.cy.getElementById(u.renderPrefix+edge.id);
        for(const end of ['source','target']){
          const id=edge[end],n=state.cy.getElementById(id),p=n.renderedPosition();
          if(!n.length||!n.visible())throw Error('Missing visible endpoint '+id);
          if(edge.source===edge.target)continue;
          const point=end==='source'?rendered.renderedSourceEndpoint():rendered.renderedTargetEndpoint();
          const expected=n.hasClass('expanded')?{x:p.x,y:p.y-n.renderedOuterHeight()/2}:p;
          if(Math.hypot(point.x-expected.x,point.y-expected.y)>1)throw Error('Unmarked endpoint '+id);
        }
        for(const ref of edge.refs){if(seen.has(ref.id))throw Error('Duplicated reference');seen.add(ref.id);}
      }
      for(const refs of view.internal.values())for(const ref of refs){if(seen.has(ref.id))throw Error('Duplicated internal');seen.add(ref.id);}
      const represented=u.graph.edges.filter(e=>seen.has(e.id)).reduce((n,e)=>n+e.count,0);
      if(represented+view.outside!==21)throw Error('Reference accounting drift');
      return {nodes:view.nodes.length,edges:view.edges.length};
    };
  });
  const frontiers=[];
  for(const id of ['module','Scope','Record','Read','Lambda','operator()']){
    await page.evaluate(id=>{state.universe.reveal(id);if(state.universe.isGroup(id))state.universe.expanded.add(id);
      refreshMap();frameNode(id);},id);await settle();
    frontiers.push(await page.evaluate(()=>endpointAudit()));
    await page.evaluate(()=>{setWorldViewport(worldZoom()*1.35,state.cy.pan());refreshMap();});await settle();
    await page.evaluate(()=>endpointAudit());
  }
  await page.evaluate(()=>{const u=state.universe,p=u.positions.get('module');
    u.positions.set('Peer',{x:p.x+240,y:p.y});u.indexPositions();u.expanded=new Set(['root','module']);
    refreshMap();frame({x1:p.x-180,y1:p.y-180,x2:p.x+300,y2:p.y+180},50,10);refreshMap();});await settle();
  const rejectsCentre=await page.evaluate(()=>{
    const edge=state.cy.edges('.source-expanded').first();edge.style('source-endpoint','inside-to-node');
    let rejected=false;try{endpointAudit();}catch(e){rejected=/Unmarked endpoint/.test(e.message);}
    edge.removeStyle('source-endpoint');return rejected;
  });
  check(rejectsCentre,'Regression control failed to reject the former empty-centre endpoint');await settle();
  const wire=await page.evaluate(()=>{
    const edge=state.cy.edges('.source-expanded').first(),a=edge.renderedSourceEndpoint(),b=edge.renderedTargetEndpoint();
    const box=$('graph').getBoundingClientRect();
    const p=Array.from({length:17},(_,i)=>(i+2)/20).map(t=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}))
      .find(p=>p.x>40&&p.x<box.width-40&&p.y>40&&p.y<box.height-40);
    if(!p)throw Error('Fixture wire is offscreen');
    const trace=connectionAt(p);if(!trace)throw Error('Geometric picking lost boundary-anchored wire');
    return {x:box.x+p.x,y:box.y+p.y,expanded:[...state.universe.expanded]};
  });
  await page.mouse.move(wire.x,wire.y);await settle();
  check(await page.locator('#hover-card').isVisible(),'Trusted hover lost anchored wire');
  await page.mouse.dblclick(wire.x,wire.y);await settle();
  check(await page.evaluate(before=>before.every(id=>state.universe.expanded.has(id)),wire.expanded),
    'Boundary wire double click folded its owner');
  await page.keyboard.press('Escape');
  check(!errors.length,'Runtime errors: '+errors.join('; '));check(!writes.length,'Endpoint exploration changed pins');
  return {frontiers,oldCentreRejected:rejectsCentre,errors,writes:writes.length};
}
