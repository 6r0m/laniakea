// SPDX-License-Identifier: AGPL-3.0-or-later
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ReferencePages}=require('../viewer/references.js');
const page=id=>({items:[{group:1,reference:{id,source:'a',target:'b',type:'calls',status:'resolved',origin:'compiler'}}],total:1,next_cursor:null});
const response=data=>({ok:true,text:async()=>JSON.stringify(data)});

test('reference pages evict least recently used data by bytes and entry count',async t=>{
  const original=global.fetch;t.after(()=>global.fetch=original);
  let requests=0;
  global.fetch=async url=>{requests++;return response(page(url));};
  const cache=new ReferencePages('/map/run/references',{maxBytes:800,maxEntries:2});
  await cache.load({node:'a'});await cache.load({node:'b'});await cache.load({node:'a'});
  assert.equal(requests,2);
  await cache.load({node:'c'});
  assert.ok(cache.bytes<=800);assert.equal(cache.cache.size,2);
  await cache.load({node:'b'});assert.equal(requests,4,'an evicted page must be fetched again');
  cache.clear();assert.equal(cache.bytes,0);assert.equal(cache.cache.size,0);
});

test('cancelled stale responses cannot replace a newer request for the same page',async t=>{
  const original=global.fetch;t.after(()=>global.fetch=original);
  let resolveOld,requests=0;
  global.fetch=async()=>++requests===1?await new Promise(resolve=>resolveOld=resolve):response(page('new'));
  const cache=new ReferencePages('/map/run/references');
  const old=cache.load({node:'a'});cache.cancel();
  const newer=await cache.load({node:'a'});assert.equal(newer.items[0].reference.id,'new');
  resolveOld(response(page('old')));
  await assert.rejects(old,{name:'AbortError'});
  assert.equal((await cache.load({node:'a'})).items[0].reference.id,'new');
  assert.equal(cache.pending.size,0);
});

test('invalid cursor progress and unknown exact-reference shapes stay observable',async t=>{
  const original=global.fetch;t.after(()=>global.fetch=original);
  const cache=new ReferencePages('/map/run/references');
  for(const data of [{...page('a'),next_cursor:0},{...page('a'),items:[{group:0,reference:{}}]},
    {...page('a'),total:51,items:Array(51).fill(page('a').items[0])}]) {
    global.fetch=async()=>response(data);
    await assert.rejects(cache.load({node:'a',cursor:0}),/Invalid/);
    assert.equal(cache.cache.size,0);
  }
});
