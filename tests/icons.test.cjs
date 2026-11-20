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

test('expanded title images remain inside native drawing bounds above the container',()=>{
  for(const mark of ['', 'candidate:3:false'])for(const zoom of [.25,1,2,5]){
    let style;
    const node={data:key=>key==='iconKind'?'folder':key==='reviewMark'?mark:undefined,
      hasClass:kind=>kind==='expanded'||kind==='group',renderedPosition:()=>({x:200,y:200}),
      outerHeight:()=>100,style:value=>{style=value;}};
    const top=node.renderedPosition().y-node.outerHeight()*zoom/2;
    const box={x1:150,x2:250,y1:top-24,y2:top-4,w:100,h:20};
    NodeIcons.title(node,box,zoom,{fg:'#ffffff',bg:'#111111',candidate:'#ffaa00',violation:'#ff0000'});
    const offset=Array.isArray(style['background-offset-y'])?style['background-offset-y'][0]:style['background-offset-y'];
    assert.ok(offset<0,'Fixture must position the icon above its container');
    assert.ok(style['bounds-expansion'][0]>=-offset,'Native texture bounds clip the expanded title icon');
    assert.equal(style['bounds-expansion'][2],0,'Title decoration must not grow the bottom bounds');
  }
});
