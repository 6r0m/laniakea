// SPDX-License-Identifier: AGPL-3.0-or-later
// Cytoscape paint and decorative motion; camera geometry remains in map.js.
'use strict';

const FAMILY_COLORS = Array.from({length:16},(_,index)=>'family-'+(index+1));
const STAR_FAMILIES = ['root','external',...FAMILY_COLORS];
const branchColors = new WeakMap();
const appearanceMotion = new WeakMap();
const STAR_PULSE_PERIOD = 4400;
const WIRE_FOCUS_DWELL = 360;
const REVIEW_WIRE_LIMIT = 16;
const REVIEW_WIRE_GLOW = {
  candidate:{idle:0.17,peak:0.29},
  violation:{idle:0.22,peak:0.39},
};
let nodePalette = null;

function starFamily(node, map) {
  if (node.boundary) return 'external';
  const path = map.canonicalPaths.get(node.id) || map.canonicalPaths.get(node.attrs?.source_owner);
  if (!path || path[0]!==map.root || path.length<2) return 'root';
  if (!branchColors.has(map)) {
    const branches = map.graph.nodes.filter(n=>n.parent===map.root&&!n.boundary).map(n=>n.id).sort();
    branchColors.set(map,new Map(branches.map((id,index)=>[id,FAMILY_COLORS[index%FAMILY_COLORS.length]])));
  }
  return branchColors.get(map).get(path[1]) || 'root';
}

function starPalette(){
  if (nodePalette) return nodePalette;
  const haloOpacity=Number(css('--star-halo-opacity'));
  const stars=Object.fromEntries(STAR_FAMILIES.map(family=>[family,css('--star-'+family)]));
  const backdrop=css('--map-atmosphere-core');
  nodePalette={fg:css('--fg'),bg:css('--bg'),ink:css('--star-ink'),candidate:css('--review-candidate'),
    violation:css('--review-violation'),stars,
    quietWire:Object.fromEntries(Object.entries(stars).map(([family,color])=>[family,blendLight(color,backdrop,0.53)])),
    haloOpacity:Number.isFinite(haloOpacity)?haloOpacity:1};
  return nodePalette;
}

function wireTint(edge,end,colors) {
  return colors[edge.data(end+'Family')] || colors.root;
}

function wireOpacity(edge,opacity) {
  return 1-(1-opacity)**(1/(edge.data('sharedStrokeCount')||1));
}

function style() {
  nodePalette=null;
  const palette=starPalette(), core=css('--star-core'), surface=css('--star-surface');
  return [
    { selector: 'node', style: { label: 'data(caption)', color: css('--fg'), 'font-family': 'Segoe UI, sans-serif',
      'font-size': 13, 'text-valign': 'bottom', 'text-margin-y': 7, 'text-wrap': 'wrap',
      'text-overflow-wrap': 'anywhere', 'text-max-width': 140,
      'text-events': 'yes', 'text-background-color': css('--bg'), 'text-background-opacity': 0.55,
      'text-background-shape':'roundrectangle',
      'text-background-padding': 3, 'background-color': css('--context'), width: 12, height: 12,
      'border-width': 1, 'border-color': css('--context'), 'overlay-padding': 9,
      'underlay-shape': 'ellipse' } },
    { selector: 'node.member', style: { 'background-color': css('--accent'), 'border-color': css('--accent'),
      width: 16, height: 16, 'underlay-padding': 6 } },
    { selector: 'node.group', style: { 'background-opacity': 0.05, 'border-width': 2, 'border-opacity': 1 } },
    // Rounded diamonds keep native hit-testing reliable at axis-aligned centers.
    { selector: 'node.boundary', style: { shape: 'round-diamond', 'background-color': css('--external'),
      'border-color': css('--external'), 'underlay-shape': 'ellipse' } },
    { selector: 'node.not-in-target', style: { 'background-opacity': 0.15, 'border-style': 'dashed' } },
    { selector: 'node.not-analysed', style: { 'border-style': 'dotted' } },
    { selector: 'node.configured', style: { 'outline-color':css('--configuration'),
      'outline-width':2,'outline-offset':4,'outline-opacity':0.85 } },
    { selector: 'node.focus, node.match', style: {'z-index':10} },
    { selector: 'node.hovered, node:selected', style: {'z-index':20} },
    { selector: 'node.hovered', style: { 'underlay-color': css('--accent'), 'underlay-opacity': 0.2 } },
    { selector: 'node.hovered[reviewMark ^= "candidate"]', style: {'underlay-color':css('--review-candidate'),
      'underlay-opacity':0.24} },
    { selector: 'node.hovered[reviewMark ^= "violation"]', style: {'underlay-color':css('--review-violation'),
      'underlay-opacity':0.28} },
    { selector: 'node.expanded', style: { shape: 'roundrectangle', 'background-opacity': 0.035,
      'border-opacity': 0.45, 'border-width': 1, 'underlay-opacity': 0, 'underlay-shape': 'round-rectangle',
      padding: 28,
      'text-valign': 'top', 'text-halign': 'center', 'text-margin-y': -8, 'font-weight': 600,
      width:'data(spanX)',height:'data(spanY)','z-index':'data(layer)','z-compound-depth':'bottom' } },
    { selector: 'edge', style: { width: 1, 'line-color': edge=>wireTint(edge,'source',palette.stars),
      'target-arrow-color': edge=>wireTint(edge,'target',palette.stars),
      'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'arrow-scale': 0.7,
      // Divide the opacity budget in composited space for coincident summary paths.
      'line-opacity':edge=>wireOpacity(edge,0.27),
      'line-fill':'linear-gradient','line-gradient-stop-positions':'0% 45% 55% 100%',
      'line-gradient-stop-colors':edge=>[wireTint(edge,'source',palette.stars),wireTint(edge,'source',palette.quietWire),
        wireTint(edge,'target',palette.quietWire),wireTint(edge,'target',palette.stars)].join(' '),
      'source-endpoint':'inside-to-node','target-endpoint':'inside-to-node' } },
    { selector: 'edge.derived', style: { 'curve-style':'straight','target-arrow-shape':'none','line-style':'solid', width: 'mapData(weight, 1, 100, 0.75, 1.18)',
      label: '', color: css('--muted'), 'font-size': 11, 'text-background-color': css('--bg'),
      'text-background-opacity': 0.9, 'text-background-padding': 2 } },
    { selector: 'edge.derived.hovered, edge.derived:selected', style: { label: 'data(count)','target-arrow-shape':'triangle' } },
    {selector:'edge.review-candidate',style:{opacity:0.65}},
    {selector:'edge.review-violation',style:{opacity:0.9}},
    // Direct owner references meet the named top boundary of an expanded container.
    {selector:'edge.source-expanded',style:{'source-endpoint':'0% -50%'}},
    {selector:'edge.target-expanded',style:{'target-endpoint':'0% -50%'}},
    { selector:'edge.loop',style:{'line-fill':'solid','curve-style':'bezier','source-endpoint':'outside-to-node','target-endpoint':'outside-to-node',
      'control-point-step-size':'data(loopDistance)'} },
    { selector:'edge.arranging',style:{display:'none'} },
    { selector: '.faded', style: { opacity: 0.3 } },
    { selector: 'edge:selected', style: { 'target-arrow-color':css('--selection') } },
    {selector:'edge.review-candidate',style:{'underlay-color':css('--review-candidate'),
      'underlay-opacity':REVIEW_WIRE_GLOW.candidate.idle}},
    {selector:'edge.review-violation',style:{'underlay-color':css('--review-violation'),
      'underlay-opacity':REVIEW_WIRE_GLOW.violation.idle}},
    { selector: 'edge.focus', style: { width: 1.35, opacity: 1, 'line-opacity':edge=>wireOpacity(edge,0.72),
      'z-index': 5,'target-arrow-shape':'triangle' } },
    ...['outgoing','incoming','within'].map(role=>({selector:'edge.trace-'+role,style:{
      'target-arrow-color':css('--trace-'+role),
      'target-arrow-shape':'triangle','line-opacity':edge=>wireOpacity(edge,0.72),opacity:1,width:1.35,label:''}})),
    {selector:'edge.trace-other',style:{'target-arrow-color':css('--context'),
      'line-opacity':edge=>wireOpacity(edge,0.54),opacity:1,width:1.25}},
    { selector:'edge:selected',style:{opacity:1,width:1.65,'line-opacity':edge=>wireOpacity(edge,0.83)} },
    {selector:'node.trace-anchor',style:{'border-color':css('--fg'),'underlay-color':css('--fg'),
      'underlay-opacity':0.16,'font-weight':600}},
    {selector:'edge.pair-inspected',style:{label:''}},
    { selector: 'node.source-region', style: {shape:'roundrectangle','background-opacity':0.07,
      'underlay-shape':'round-rectangle'} },
    { selector: 'node.implementation', style: {'border-color':css('--context'),'background-color':css('--context')} },
    { selector: 'node.restricted-member', style: {'border-color':css('--muted'),'background-color':css('--context')} },
    { selector: 'node.organizational', style: {'background-opacity':0.025,'border-opacity':0.24,'font-weight':400,
      'underlay-shape':'round-rectangle'} },
    { selector: 'node.overlapping-context', style: {'text-background-opacity':1,'border-width':2,
      'border-color':css('--context'),'underlay-color':css('--bg'),'underlay-opacity':1,'underlay-padding':8} },
    ...STAR_FAMILIES.flatMap(family=>{
      const tint=palette.stars[family], selector='node.star-'+family;
      return [
        {selector, style:{'background-fill':'radial-gradient','background-opacity':1,'border-color':tint,
          'background-gradient-stop-colors':`${core} ${tint} ${tint}`,
          'background-gradient-stop-positions':'0% 58% 100%'}},
        {selector:selector+'.group',style:{'background-opacity':0.74,
          'background-gradient-stop-colors':`${core} ${tint} ${surface}`,
          'background-gradient-stop-positions':'0% 21% 72%','border-opacity':0.85}},
        {selector:selector+'.expanded',style:{'background-opacity':family==='external'?0.13:0.09,'border-opacity':0.64,
          'background-gradient-stop-colors':`${tint} ${surface}`,
          'background-gradient-stop-positions':'0% 100%','outline-color':tint,'outline-opacity':0.15,
          'corner-radius':14}},
      ];
    }),
    {selector:'node.implementation, node.restricted-member',style:{'background-opacity':0.65}},
    {selector:'node.not-in-target',style:{'background-opacity':0.46}},
    {selector:'node.expanded.implementation, node.expanded.organizational',style:{'background-opacity':0.065,'border-opacity':0.38}},
    {selector:'node.configured',style:{'outline-color':css('--configuration'),'outline-opacity':0.85}},
    {selector:'node.trace-anchor',style:{'border-color':css('--fg')}},
    { selector: 'node:selected', style: { 'border-color': css('--selection'), 'border-width': 3,
      'underlay-color': css('--selection'), 'underlay-opacity': 0.3 } },
    { selector: 'node.expanded', style: { 'underlay-opacity': 0 } },
  ];
}

function appearanceTargets(cy) {
  const width=cy.width(),height=cy.height();
  const onScreen=({x,y})=>x>=0&&x<=width&&y>=0&&y<=height;
  const stars=cy.nodes('[reviewMark $= ":false"]').not('.expanded').filter(node=>onScreen(node.renderedPosition())).toArray();
  stars.sort((a,b)=>Number(b.data('reviewMark').startsWith('violation:'))-Number(a.data('reviewMark').startsWith('violation:')));
  return stars.slice(0,16);
}

function reviewWireTargets(cy) {
  const width=cy.width(),height=cy.height(),violations=[],candidates=[];
  for(const [id,findings] of state.review?.links||[]){
    let severity;
    for(const finding of findings.values()){
      if(finding.acknowledged)continue;
      severity=finding.severity;
      if(severity==='violation')break;
    }
    if(!severity)continue;
    const targets=severity==='violation'?violations:candidates;
    if(targets.length===REVIEW_WIRE_LIMIT)continue;
    const edge=cy.getElementById(state.universe.renderPrefix+id);
    if(!edge.length||!edge.visible())continue;
    const {x1,y1,x2,y2}=edge.renderedBoundingBox({includeLabels:false,includeOverlays:false});
    if(x2>=0&&x1<=width&&y2>=0&&y1<=height)targets.push({edge,severity});
    if(violations.length===REVIEW_WIRE_LIMIT)break;
  }
  return violations.concat(candidates).slice(0,REVIEW_WIRE_LIMIT);
}

function blendLight(tint,light,amount) {
  const channels=color=>{
    if(!color.startsWith('#'))return color.match(/\d+/g).map(Number).slice(0,3);
    const hex=color.slice(1);
    const pairs=hex.length===3?[...hex].map(value=>value.repeat(2)):hex.match(/../g);
    return pairs.slice(0,3).map(value=>parseInt(value,16));
  };
  const from=channels(tint),to=channels(light);
  const rgb=from.map((value,i)=>Math.round(value*(1-amount)+to[i]*amount));
  return `rgb(${rgb.join(',')})`;
}

function wirePath({a,b,controls}) {
  const point=p=>`${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  let path='M '+point(a);
  if(!controls.length)return path+' L '+point(b);
  controls.forEach((control,i)=>{
    const next=controls[i+1],end=next?{x:(control.x+next.x)/2,y:(control.y+next.y)/2}:b;
    path+=' Q '+point(control)+' '+point(end);
  });
  return path;
}

function startWireFlow(cy,edges,palette) {
  const paths=new Map(),zoom=cy.zoom(),pan=cy.pan();
  const position=id=>cy.getElementById(id).renderedPosition();
  const project=p=>({x:p.x*zoom+pan.x,y:p.y*zoom+pan.y});
  const width=cy.width(),height=cy.height();
  for(const edge of edges){
    if(!edge.length||!edge.visible()||edge.isLoop())continue;
    const source=edge.data('source'),target=edge.data('target');
    const key=edge.hasClass('derived')?ConnectionTrace.key(source,target):edge.id();
    let track=paths.get(key);
    if(!track){
      const geometry=renderedConnectionGeometry(edge,position,project);
      if(!geometry)continue;
      const {a,b,controls}=geometry,points=[a,...controls,b];
      if(Math.hypot(a.x-b.x,a.y-b.y)<1||points.every(p=>p.x<0)||points.every(p=>p.x>width)||
        points.every(p=>p.y<0)||points.every(p=>p.y>height))continue;
      track={source,geometry,colors:['source','target'].map(end=>wireTint(edge,end,palette.stars)),directions:new Map()};
      paths.set(key,track);
    }
    if(!track.directions.has(source))track.directions.set(source,'');
    for(const finding of state.review?.links?.get(edge.data('referenceId'))?.values()||[]){
      if(finding.kind!=='cycles'||finding.acknowledged)continue;
      if(finding.severity==='violation'||!track.directions.get(source))track.directions.set(source,finding.severity);
    }
  }
  if(!paths.size)return null;
  const svg=(tag,attrs)=>{
    const element=document.createElementNS('http://www.w3.org/2000/svg',tag);
    for(const [name,value] of Object.entries(attrs))element.setAttribute(name,value);
    return element;
  };
  const layer=document.createElement('div');
  layer.className='wire-flow';
  layer.setAttribute('aria-hidden','true');
  layer.dataset.paths=paths.size;
  const thread=svg('svg',{class:'wire-breath',focusable:'false'}),feed=document.createElement('div');
  feed.className='wire-feed';
  layer.style.setProperty('--wire-period',STAR_PULSE_PERIOD+'ms');
  layer.style.setProperty('--wire-strength',Math.min(1,Math.sqrt(4/paths.size)));
  if(paths.size>18)layer.classList.add('dense');
  for(const {source,geometry,colors,directions} of paths.values()){
    const {a,b,controls}=geometry;
    const span=Math.min(58,Math.hypot(a.x-b.x,a.y-b.y)*.4);
    const rendered=[geometry,{a:b,b:a,controls:controls.slice().reverse()}].map((direction,i)=>({
      d:wirePath(direction),pathLength:100,stroke:colors[i],
    }));
    rendered.forEach(attrs=>thread.append(svg('path',attrs)));
    for(const [from,severity] of directions){
      const {d,stroke}=rendered[Number(from!==source)],light=document.createElement('span');
      if(directions.size>1&&from!==source)light.classList.add('wire-counterpart');
      if(severity)light.classList.add('wire-warning');
      light.style.offsetPath=`path("${d}")`;
      light.style.setProperty('--wire-color',severity?palette[severity]:stroke);
      light.style.setProperty('--wire-length',span+'px');
      light.style.setProperty('--wire-width',Math.min(14,span*.28)+'px');
      feed.append(light);
    }
  }
  layer.append(thread);
  if(feed.childElementCount)layer.append(feed);
  cy.container().append(layer);
  return layer;
}

function clearWireFlow(motion=appearanceMotion.get(state.cy)) {
  motion?.focus?.layer?.remove();
  if(motion)motion.focus=null;
}

function updateWireFlow(cy,motion,now,palette){
  const trace=state.trace,selection=state.selection;
  const key=trace?.key??(selection?.source!==undefined||selection?.overlapInspection?
    'selected:'+(selection.key||selection.id):null);
  if((motion.focus?.key??null)!==key){
    clearWireFlow(motion);
    if(key)motion.focus={key,since:now,layer:null,finished:false};
  }
  const focus=motion.focus;
  if(!focus||focus.finished||focus.layer)return false;
  if(now-focus.since<WIRE_FOCUS_DWELL)return true;
  const edges=cy.edges(trace?'.focus':':selected');
  focus.layer=startWireFlow(cy,edges,palette);
  focus.finished=!focus.layer;
  return false;
}

function updateAppearanceTargets(cy,motion,stars=[],wires=[]) {
  const palette=starPalette(),zoom=cy.zoom();
  const nextStars=new Set(stars),nextWires=new Set(wires.map(({edge})=>edge));
  cy.batch(()=>{
    for(const node of motion.stars)if(!nextStars.has(node))NodeIcons.shine(node,0,zoom,palette);
    for(const {edge} of motion.wires)if(!nextWires.has(edge))edge.removeStyle('underlay-opacity underlay-color');
    for(const {edge,severity} of wires){
      if(edge.hasClass('review-'+severity))edge.removeStyle('underlay-color');
      else edge.style('underlay-color',palette[severity]);
    }
  });
  motion.stars=stars;
  motion.wires=wires;
}

function syncAppearanceMotion() {
  const cy=state.cy;
  if(!cy||cy.destroyed())return;
  const existing=appearanceMotion.get(cy);
  if(document.hidden!==false||prefersReducedMotion()){
    if(existing){
      clearTimeout(existing.timer);
      updateAppearanceTargets(cy,existing);
      clearWireFlow(existing);
      appearanceMotion.delete(cy);
    }
    return;
  }
  if(existing?.timer!=null)return;
  const motion=existing||{stars:[],wires:[],view:null,focus:null,timer:null};
  if(!existing)appearanceMotion.set(cy,motion);
  motion.timer=setTimeout(frame,64);

  function frame(){
    motion.timer=null;
    if(cy.destroyed()||state.cy!==cy){
      clearWireFlow(motion);
      appearanceMotion.delete(cy);
      return;
    }
    if(state.framing||state.gestureActive||state.wheel||state.flight||state.drag){
      clearWireFlow(motion);
      motion.view=null;
      motion.timer=setTimeout(frame,120);
      return;
    }
    const zoom=cy.zoom(),{x,y}=cy.pan();
    const viewport=[zoom,x,y,cy.width(),cy.height()];
    const review=state.review?.enabled?state.review.data:null;
    const palette=starPalette(),view=[...viewport,state.shard,review,palette];
    if(!motion.view||view.some((value,i)=>value!==motion.view[i])){
      if(motion.view&&(motion.review!==review||viewport.some((value,i)=>value!==motion.view[i])))clearWireFlow(motion);
      updateAppearanceTargets(cy,motion,appearanceTargets(cy),reviewWireTargets(cy));
      motion.view=view;motion.review=review;
    }
    const now=performance.now(),phase=now/STAR_PULSE_PERIOD*Math.PI*2;
    const intensity=i=>(1-Math.cos(phase+i*0.71))/2;
    let glowing;
    cy.batch(()=>{
      motion.stars.forEach((node,i)=>{
        if(!node.removed()&&!node.hasClass('expanded')&&node.data('reviewMark')?.endsWith(':false')){
          NodeIcons.shine(node,0.08+0.02*Math.round(41*intensity(i)),zoom,palette);
        }
      });
      motion.wires.forEach(({edge,severity},i)=>{
        if(edge.removed())return;
        const {idle,peak}=REVIEW_WIRE_GLOW[severity];
        edge.style('underlay-opacity',idle+(peak-idle)*intensity(i));
      });
      glowing=updateWireFlow(cy,motion,now,palette);
    });
    if(motion.stars.length||motion.wires.length||glowing)motion.timer=setTimeout(frame,64);
  }
}
