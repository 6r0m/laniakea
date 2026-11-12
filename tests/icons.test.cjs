// SPDX-License-Identifier: AGPL-3.0-or-later
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {NodeIcons}=require('../viewer/icons.js');

test('type icons follow recorded kinds independently of containment, access and external status',()=>{
  for(const [node,kind] of [
    [{level:'module'},'module'],[{level:'plugin'},'plugin'],[{level:'namespace'},'namespace'],
    [{level:'class',attrs:{declaration_kind:'struct'}},'struct'],[{level:'class'},'class'],
    [{level:'class',attrs:{declaration_kind:'union'}},'union'],
    [{level:'function',attrs:{declaration_kind:'field'}},'field'],
    [{level:'function',attrs:{declaration_kind:'method'}},'function'],
    [{level:'function',attrs:{declaration_kind:'lambda'}},'lambda'],
    [{level:'source-group',attrs:{source_file:true}},'file'],
    [{level:'source-group',attrs:{source_region:true}},'section'],
    [{level:'folder'},'folder'],[{level:'project'},'project'],[{level:'unrecognized'},'entity']]){
    const before=JSON.stringify(node);
    assert.equal(NodeIcons.kind(node),kind);
    assert.equal(NodeIcons.kind({...node,boundary:true,child_count:30}),kind);
    assert.equal(JSON.stringify(node),before);
  }
  assert.equal(NodeIcons.kind({level:'class',label:'SomeStruct'}),'class','spelling must not invent a declaration kind');
});

test('icons are reusable local vectors and unknown kinds cannot inject SVG',()=>{
  for(const kind of ['project','module','plugin','namespace','class','struct','function','file','folder','section','entity']){
    const uri=NodeIcons.image(kind,'#e0eaf4'),svg=decodeURIComponent(uri.slice(uri.indexOf(',')+1));
    assert.ok(uri.startsWith('data:image/svg+xml,'));
    assert.ok(svg.includes('viewBox="0 0 24 24"'));
    assert.ok(!/<image|<script|<foreignObject|(?:href|src)=|<text/.test(svg));
    assert.equal(NodeIcons.image(kind,'#e0eaf4'),uri);
  }
  assert.equal(NodeIcons.image('<script>','" onload="bad'),NodeIcons.image('entity','#888888'));
});
