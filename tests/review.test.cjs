// SPDX-License-Identifier: AGPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');

test('cancelled Review rechecks cannot reload or report a late failure into the current generation',async()=>{
  const {ArchitectureReview}=require('../viewer/review.js'),saved={$:global.$,labels:global.readableLabels};
  global.$=()=>({replaceChildren(){},textContent:''});global.readableLabels=()=>{};
  try{
    for(const failure of [false,true]){
      let complete,fail,loads=0,statuses=0;
      const owner=Object.assign(Object.create(ArchitectureReview.prototype),{enabled:true,epoch:0,
        requests:new Set(),pages:new Map(),referenceIndex:new Map(),findingIndex:new Map(),
        project(){},refreshInspection(){},status(){statuses++;},load:async()=>{loads++;},
        request:()=>new Promise((resolve,reject)=>{complete=resolve;fail=reject;})});
      const pending=owner.recheck(),before=statuses;owner.cancel();
      if(failure)fail(Error('late old failure'));else complete({});
      await pending;
      assert.equal(loads,0);assert.equal(statuses,before);assert.equal(owner.error,null);
      assert.equal(owner.enabled,false);
    }
  }finally{global.$=saved.$;global.readableLabels=saved.labels;}
});

test('wire findings follow exact reference groups through rollups, deep endpoints and filtering',()=>{
  const {ReviewReferenceIndex,ReviewEdgeProjection}=require('../viewer/review.js');
  const finding={id:'native',severity:'candidate',groups:[1,2],subjects:['A','B']};
  const index=ReviewReferenceIndex([finding]);
  const folded={edges:[{id:'bundle',source:'A',target:'B',refs:[{group:1},{group:2}]}]};
  assert.equal(ReviewEdgeProjection(index,folded).get('bundle').size,1);
  const deep={edges:[{id:'call',source:'method',target:'distant-header',refs:[{group:2}]},
    {id:'unrelated',source:'method',target:'distant-header',refs:[{group:3}]}]};
  const marks=ReviewEdgeProjection(index,deep);
  assert.equal(marks.get('call').get('native'),finding);
  assert.equal(marks.has('unrelated'),false);
  assert.equal(ReviewEdgeProjection(index,{edges:[]}).size,0);
});

test('wire readouts count distinct findings and bound explanations without fetching evidence',()=>{
  const {ArchitectureReview,ReviewReferenceIndex}=require('../viewer/review.js');
  const records=[{id:'a',severity:'candidate',title:'One',groups:[1,2]},
    {id:'b',severity:'violation',title:'Two',groups:[2],acknowledged:true},
    {id:'c',severity:'candidate',title:'Three',groups:[2]}];
  const control=Object.assign(Object.create(ArchitectureReview.prototype),{enabled:true,data:{},
    referenceIndex:ReviewReferenceIndex(records)});
  const readout=control.readout({kind:'pair',refs:[{group:1,count:8},{group:2,count:8}]});
  assert.match(readout.summary,/1 policy violation/);assert.match(readout.summary,/2 review candidates/);
  assert.match(readout.summary,/1 acknowledged/);assert.equal(readout.titles.length,2);
});

test('review badges aggregate unique active concerns without changing the projection',()=>{
  const {ReviewProjection}=require('../viewer/review.js');
  const map={nodes:new Map([['root',{parent:null}],['A',{parent:'root'}],['B',{parent:'root'}]])};
  const view={nodes:[{id:'root'}]},before=JSON.stringify(view);
  const affected={A:[{id:'cycle',severity:'candidate',acknowledged:false}],B:[{id:'cycle',severity:'candidate',acknowledged:false}]};
  const badges=ReviewProjection(affected,map,view);
  assert.equal(badges.get('root').count,1);
  assert.equal(JSON.stringify(view),before);
  assert.deepEqual(badges.get('root').subjects,['A','B']);
});

test('review projection prefers visible subjects, preserves severity and does not invent off-view markers',()=>{
  const {ReviewProjection}=require('../viewer/review.js');
  const map={nodes:new Map([['root',{parent:null}],['A',{parent:'root'}],['B',{parent:'root'}]])};
  const affected={A:[{id:'x',severity:'violation',acknowledged:true}],B:[{id:'y',severity:'candidate',acknowledged:false}]};
  const badges=ReviewProjection(affected,map,{nodes:[{id:'A'}]});
  assert.equal(badges.size,1);assert.equal(badges.get('A').severity,'violation');
  assert.equal(badges.get('A').acknowledged,true);
});

test('disabled review performs no rendered-node scan and clears only its previous badges',()=>{
  const {ArchitectureReview}=require('../viewer/review.js'),previous=global.state;
  const changed=[];
  global.state={shard:{nodes:[]},cy:{nodes(){throw Error('Review off scanned rendered nodes');},
    getElementById(id){return{length:1,data(key,value){changed.push([id,key,value]);}};}}};
  try {
    const control=Object.assign(Object.create(ArchitectureReview.prototype),{enabled:false,badges:new Map(),data:null});
    control.project();assert.equal(changed.length,0);
    control.badges.set('A',{count:1});control.project();
    assert.deepEqual(changed,[['A','reviewMark','']]);
  } finally {global.state=previous;}
});

test('review starts enabled with a closed list, and closing that list retains analysis',()=>{
  const {ArchitectureReview}=require('../viewer/review.js'),previous=global.$,previousPanel=global.togglePanel;
  const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,setAttribute(){},focus(){}});return nodes.get(id);};
  global.$=node;global.togglePanel=()=>{};
  try {
    const control=new ArchitectureReview();control.reset({review_url:'/review'});
    assert.equal(control.enabled,true);assert.equal(node('review').hidden,true);
    control.panel(true);assert.equal(node('review').hidden,false);
    control.panel(false);assert.equal(control.enabled,true);assert.equal(node('review').hidden,true);
    control.loading=true;control.status();assert.match(node('toggle-review').title,/checking/i);
    control.loading=false;control.error='Failed';control.status();assert.match(node('toggle-review').title,/failed/i);
    control.error=null;control.data={counts:{candidate:2,violation:0,acknowledged:0}};control.status();
    assert.match(node('toggle-review').title,/2 candidates/);
    control.data={counts:{candidate:0,violation:0,acknowledged:0},checks:[
      {status:'failed'},{status:'unavailable'},{status:'available'},{status:'disabled'}]};
    control.status();assert.match(node('toggle-review').title,/0 recorded findings \/ 1 failed \/ 1 unavailable \/ 1 disabled/);
    assert.equal(node('review-label-wide').textContent,'Review: 0 recorded findings');
    control.data.checks.push({status:'incomplete'});control.status();
    assert.match(node('toggle-review').title,/0 recorded findings \/ 1 incomplete \/ 1 failed \/ 1 unavailable \/ 1 disabled/);
  } finally {global.$=previous;global.togglePanel=previousPanel;}
});

test('warning symbols use independent readable images rather than shrinking inside type icons',()=>{
  const {NodeIcons}=require('../viewer/icons.js');
  const candidate=decodeURIComponent(NodeIcons.warning('candidate:101:false','#855600','#ffffff'));
  const violation=decodeURIComponent(NodeIcons.warning('violation:1:false','#ab2838','#ffffff'));
  assert.match(candidate,/<polygon/);assert.match(violation,/<polygon/);
  assert.notEqual(candidate,violation);assert.match(candidate,/>!</);
  assert.equal(NodeIcons.warning(''),null);
});

test('source findings mark concrete contextual files without inventing dependency wires',()=>{
  const {ReviewProjection,ReviewReferenceIndex,ReviewEdgeProjection}=require('../viewer/review.js');
  const file={id:'context-file',parent:'scope',source:{root:'project',path:'Source/Sample/API.cpp'},
    attrs:{source_file:true,source_owner:'scope',presentation_group:true}};
  const other={...file,id:'unrelated-context',attrs:{...file.attrs,source_owner:'other'}};
  const map={nodes:new Map([['module',{parent:'root'}],['scope',{parent:'module'}],['other',{parent:'root'}]])};
  const finding={id:'clone',severity:'candidate',groups:[],subjects:['module'],source_paths:[file.source.path]};
  const view={nodes:[{id:'module'},file,other],edges:[{id:'real',refs:[{group:1}]}]};
  const before=JSON.stringify(view),badges=ReviewProjection({module:[finding]},map,view);
  assert.equal(badges.get('context-file').count,1);assert.equal(badges.has('unrelated-context'),false);
  assert.equal(ReviewEdgeProjection(ReviewReferenceIndex([finding]),view).size,0);
  assert.equal(JSON.stringify(view),before);
  const {ArchitectureReview}=require('../viewer/review.js');
  const control=Object.assign(Object.create(ArchitectureReview.prototype),{target:{review_url:'/review'},enabled:true,
    data:{},badges,ownerBadges:new Set(badges.keys())});
  assert.deepEqual(control.inspection(file).exact,['clone']);
});

test('source candidates in the same module retain distinct file context in the queue',()=>{
  const {ArchitectureReview}=require('../viewer/review.js');
  const control=Object.assign(Object.create(ArchitectureReview.prototype),{data:{affected:{module:[
    {id:'first',source_paths:['Source/Sample/First.cpp']},{id:'second',source_paths:['Source/Sample/Second.cpp']}]}}});
  const finding={id:'first',subjects:['module'],evidence_type:'source'};
  assert.deepEqual(control.sourceFiles(finding),['First.cpp']);
  assert.deepEqual(control.sourceFiles({...finding,id:'second'}),['Second.cpp']);
  assert.deepEqual(control.sourceFiles({...finding,evidence_type:undefined}),[]);
});

test('source evidence follows recorded nested containers without marking clean files or semantic declarations',()=>{
  const {Universe}=require('../viewer/universe.js'),{ReviewProjection,ArchitectureReview}=require('../viewer/review.js');
  const graph=JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname,'../fixtures/source-surface.graph.json')));
  const helper=graph.nodes.find(n=>n.id==='helper');
  helper.attrs.source_partition.folders=['Tests','Nested'];
  const second=structuredClone(helper);second.id='second';second.source.path='Source/Sample/Private/Tests/Nested/Second.cpp';
  const clean=structuredClone(helper);clean.id='clean';clean.source.path='Source/Sample/Private/Clean/Other.cpp';
  clean.attrs.source_partition.folders=['Clean'];
  graph.nodes.push(second,clean);
  const map=new Universe(graph),files=[...map.nodes.values()].filter(n=>n.attrs?.source_file);
  const file=files.find(n=>n.source.path===helper.source.path),other=files.find(n=>n.source.path===second.source.path);
  const cleanFile=files.find(n=>n.source.path===clean.source.path);
  const route=map.paths.get(file.id).filter(id=>map.nodes.get(id).attrs?.presentation_group);
  const unrelated=map.paths.get(cleanFile.id).find(id=>map.nodes.get(id).label==='Clean');
  const shared={id:'clone',severity:'candidate',acknowledged:false,source_paths:[file.source.path,other.source.path]};
  const before=JSON.stringify(graph),affected={module:[shared]};
  for(let depth=1;depth<=route.length;depth++){
    const visible=['module',unrelated,...route.slice(0,depth)],view={nodes:visible.map(id=>map.nodes.get(id))};
    const badges=ReviewProjection(affected,map,view);
    for(const id of ['module',...route.slice(0,depth)])assert.equal(badges.get(id)?.count,1,`Missing evidence trail at ${map.nodes.get(id).label}`);
    assert.equal(badges.has(unrelated),false,'A clean sibling folder inherited unrelated evidence');
    const control=Object.assign(Object.create(ArchitectureReview.prototype),{enabled:true,target:{review_url:'/review'},data:{},badges,ownerBadges:new Set(badges.keys())});
    assert.deepEqual(control.inspection(map.nodes.get(route[depth-1])).exact,['clone']);
  }
  const view={nodes:['module',...route,other.id,cleanFile.id,'helper','class'].map(id=>map.nodes.get(id))};
  const badges=ReviewProjection(affected,map,view);
  assert.equal(badges.get(other.id)?.count,1);assert.equal(badges.get(route.at(-2))?.count,1,'Shared finding counted twice');
  assert.equal(ReviewProjection(affected,map,{nodes:[file]}).get(file.id)?.count,1,'An off-screen module hid visible file evidence');
  for(const id of [cleanFile.id,'helper','class'])assert.equal(badges.has(id),false,'File evidence invented declaration ownership');
  const violation={...shared,id:'violation',severity:'violation',acknowledged:true};
  const mixed=ReviewProjection({module:[shared,violation]},map,view).get(route.at(-2));
  assert.equal(mixed.count,2);assert.equal(mixed.severity,'violation');assert.equal(mixed.acknowledged,false);
  assert.equal(ReviewProjection({},map,view).size,0,'Removed/acknowledged evidence left a stale trail');
  assert.equal(JSON.stringify(graph),before,'Review changed semantic ownership or references');
});

test('source trail supports catalog and contextual namespace files without assigning clones to the namespace',()=>{
  const {Universe}=require('../viewer/universe.js'),{ReviewProjection,ArchitectureReview}=require('../viewer/review.js');
  const graph=JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname,'../fixtures/namespace-files.graph.json')));
  const at=id=>graph.nodes.findIndex(n=>n.id===id);
  graph.files=[{owner:at('module'),root:'project',path:'Source/Sample/Private/Helper.cpp',
    declarations:[at('helper')],definitions:[at('helper')],partition:graph.nodes[at('helper')].attrs.source_partition}];
  const map=new Universe(graph),path='Source/Sample/Private/Helper.cpp';
  const files=[...map.contextFiles.keys()].map(id=>map.nodes.get(id)).filter(n=>n.source.path===path);
  assert.ok(files.length>=2,'Fixture must contain catalog and contextual file representatives');
  const finding={id:'clone',severity:'candidate',acknowledged:false,source_paths:[path]};
  const affected={module:[finding]},before=JSON.stringify(graph);
  for(const file of files){
    const ids=['module','scope',...map.paths.get(file.id).filter(id=>map.nodes.get(id).attrs?.presentation_group)];
    const view={nodes:[...new Set(ids)].map(id=>map.nodes.get(id))},badges=ReviewProjection(affected,map,view);
    for(const id of ids.filter(id=>map.nodes.get(id).attrs?.presentation_group))assert.equal(badges.get(id)?.count,1);
    assert.equal(badges.has('scope'),false,'A file match cannot prove namespace ownership');
    const control=Object.assign(Object.create(ArchitectureReview.prototype),{enabled:true,target:{review_url:'/review'},data:{},badges,ownerBadges:new Set(badges.keys())});
    assert.deepEqual(control.inspection(file).exact,['clone']);
  }
  assert.equal(map.nodes.get('helper').parent,'scope');assert.equal(JSON.stringify(graph),before);
});

test('source marker hover distinguishes container evidence from semantic ownership',()=>{
  const {ArchitectureReview}=require('../viewer/review.js'),previous=global.state;
  global.state={universe:{nodes:new Map([
    ['folder',{attrs:{presentation_group:true}}],['file',{attrs:{presentation_group:true,source_file:true}}],['module',{}]])}};
  try{
    const finding={id:'clone',severity:'candidate',title:'Duplicated source tokens'};
    const owner=Object.assign(Object.create(ArchitectureReview.prototype),{enabled:true,data:{},
      badges:new Map(['folder','file','module'].map(id=>[id,{ids:new Set(['clone'])}])),findingIndex:new Map([['clone',finding]])});
    assert.match(owner.readout({kind:'node',source:'folder'}).summary,/inside this container/);
    assert.match(owner.readout({kind:'node',source:'file'}).summary,/in this file/);
    assert.match(owner.readout({kind:'node',source:'module'}).summary,/for this owner/);
  }finally{global.state=previous;}
});
