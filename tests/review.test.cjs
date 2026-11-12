// SPDX-License-Identifier: AGPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');

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

test('a capped review badge discloses additional findings instead of reporting exactly 99',()=>{
  const {NodeIcons}=require('../viewer/icons.js');
  assert.match(decodeURIComponent(NodeIcons.image('module','#123456','candidate:101:false')),/99\+/);
});
