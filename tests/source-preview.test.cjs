// SPDX-License-Identifier: AGPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateSourcePreview}=require('../viewer/source-preview.js');

const item={root:'project',path:'Source/Sample/API.cpp',line:2,column:1,end_line:3,end_column:10};
const fixture=()=>({status:'matching',detail:'Verified source.',location:{...item},start_line:1,truncated:false,
  lines:[{number:1,text:'// Sample',matched:false},{number:2,text:'int value = 1;',matched:true},
    {number:3,text:'return value;',matched:true},{number:4,text:'}',matched:false}]});

test('source preview retains recorded coordinates and accepts only consecutive correctly highlighted lines',()=>{
  const data=fixture();assert.equal(validateSourcePreview(data,item),data);
  for(const mutate of [data=>data.location.path='Source/Other.cpp',data=>data.location.column=3,
    data=>data.lines[0].number=2,data=>data.lines[1].matched=false,data=>data.lines[0].text=null,
    data=>data.start_line=4,data=>data.truncated=undefined]){
    const invalid=fixture();mutate(invalid);assert.throws(()=>validateSourcePreview(invalid,item));
  }
});

test('changed or unavailable evidence has no source text; text and line budgets are enforced',()=>{
  for(const status of ['changed','unavailable']){
    const data={...fixture(),status,lines:[]};assert.equal(validateSourcePreview(data,item),data);
    data.lines=fixture().lines;assert.throws(()=>validateSourcePreview(data,item));
  }
  const large=fixture();large.lines[0].text='x'.repeat(65537);assert.throws(()=>validateSourcePreview(large,item));
  const many=fixture();many.lines=Array(201).fill(many.lines[0]);assert.throws(()=>validateSourcePreview(many,item));
});
