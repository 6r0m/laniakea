// SPDX-License-Identifier: AGPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');

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
    control.loading=true;control.status();assert.match(node('toggle-review').textContent,/checking/i);
    control.loading=false;control.error='Failed';control.status();assert.match(node('toggle-review').textContent,/failed/i);
    control.error=null;control.data={counts:{candidate:2,violation:0,acknowledged:0}};control.status();
    assert.match(node('toggle-review').textContent,/2 candidates/);
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
