// SPDX-License-Identifier: AGPL-3.0-or-later
// Native background images decorate existing nodes without adding graph or pointer targets.
'use strict';
const NodeIcons=(()=>{
  const paths={
    project:'<circle cx="12" cy="12" r="3"/><circle cx="4" cy="5" r="2"/><circle cx="20" cy="5" r="2"/><circle cx="12" cy="21" r="2"/><path d="m6 7 4 3m4 0 4-3m-6 8v4"/>',
    module:'<path d="M8 3h13v18H8v-4m0-10V3M8 11v2"/><path d="M3 7h9v4H3zm0 6h9v4H3z"/>',
    plugin:'<path d="M4 4h6a3 3 0 1 1 5 0h5v6a3 3 0 1 0 0 5v5h-6a3 3 0 1 0-5 0H4v-6a3 3 0 1 1 0-5z"/>',
    namespace:'<path d="M6 4H3v16h3m12-16h3v16h-3"/><path d="M9 8v1m0 6v1m6-8v1m0 6v1" stroke-width="3"/>',
    class:'<path d="M18 6c-9-6-14 0-14 6s5 12 14 6"/>',
    struct:'<path d="M18 6C15 2 5 3 5 8c0 6 14 2 14 8 0 5-10 6-14 2"/>',
    union:'<path d="M5 4v10c0 9 14 9 14 0V4"/>',
    enum:'<path d="M18 4H6v16h12M6 12h10"/>',
    interface:'<path d="M6 4h12m-6 0v16m-6 0h12"/>',
    function:'<path d="M11 4H9c-2 0-3 2-3 4v10c0 2-1 3-3 3m0-11h8m5-4c-4 4-4 8 0 12m3-12c4 4 4 8 0 12"/>',
    lambda:'<path d="M8 4H4v16h4m8-16h4v16h-4m-7-8h6"/>',
    field:'<path d="M4 8h6v8H4zm10 0h6m-6 4h6m-6 4h4"/>',
    variable:'<path d="m5 5 7 15 7-15"/>',
    file:'<path d="M5 3h9l5 5v13H5zM14 3v6h5M8 13h8m-8 4h8"/>',
    folder:'<path d="M3 6h7l2 3h9v11H3zm0 3V4h7l2 2h7v3"/>',
    section:'<path d="m3 7 9-4 9 4-9 4zm0 5 9 4 9-4M3 17l9 4 9-4"/>',
    entity:'<circle cx="12" cy="12" r="8"/><path d="M12 8v8m-4-4h8"/>'
  };
  const images=new Map(),styles=new WeakMap(),titles=new WeakMap();
  function kind(node){
    const a=node.attrs||{},k=typeof a.declaration_kind==='string'?a.declaration_kind:node.level||'';
    if(a.source_file)return 'file';
    if(a.source_region)return 'section';
    if(a.presentation_group)return 'folder';
    if(Object.hasOwn(paths,k))return k;
    if(k.startsWith('class template'))return 'class';
    if(['method','constructor','destructor','conversion function','function template'].includes(k))return 'function';
    return Object.hasOwn(paths,node.level)?node.level:'entity';
  }
  function image(kind,ink,reviewMark=''){
    kind=Object.hasOwn(paths,kind)?kind:'entity';
    ink=/^#[0-9a-f]{3,8}$/i.test(ink)?ink:'#888888';
    const key=kind+ink+reviewMark;
    const parts=reviewMark.split(':'),count=Number(parts[1]),badge=Number.isSafeInteger(count)&&count>0?
      '<circle cx="19" cy="5" r="5" fill="'+(parts[0]==='violation'?'#ab2838':'#855600')+'"/>'+
      '<text x="19" y="7.5" text-anchor="middle" font-family="sans-serif" font-size="7" font-weight="bold" fill="#fff"'+
      (count>99?' textLength="9" lengthAdjust="spacingAndGlyphs"':'')+'>'+(count>99?'99+':String(count))+'</text>':'';
    if(!images.has(key)){
      if(images.size>=128)images.clear();
      images.set(key,'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">'+
        '<g fill="none" stroke="'+ink+'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+paths[kind]+'</g>'+badge+'</svg>'));
    }
    return images.get(key);
  }
  function apply(node,value){
    const signature=JSON.stringify(value);
    if(styles.get(node)!==signature){node.style(value);styles.set(node,signature);}
  }
  function paint(node,zoom,palette,visible=true){
    if(!node.data('iconKind'))return;
    const expanded=node.hasClass('expanded'),title=titles.get(node),open=node.hasClass('group')||node.hasClass('source-region')||node.hasClass('not-in-target');
    const ink=expanded||open?palette.fg:palette.bg;
    const size=expanded?16:Math.min(20,node.width()*zoom*0.58);
    apply(node,{'background-image':image(node.data('iconKind'),ink,node.data('reviewMark')||''),'background-fit':'none','background-clip':'none',
      'background-image-containment':'over','background-width':size/zoom,'background-height':size/zoom,
      'background-position-x':'50%','background-position-y':expanded?'0%':'50%',
      'background-offset-x':expanded&&title?.visible?title.x/zoom:0,'background-offset-y':expanded&&title?.visible?title.y/zoom:0,
      'background-image-opacity':expanded?(title?.visible?1:0):visible?1:0,
      'bounds-expansion':expanded?[0,22/zoom,0,22/zoom]:0});
  }
  function update(cy,map,scope,level,zoom,palette){
    const owner=map.nodes.get(scope),detail=owner&&(owner.attrs?.source_sections||owner.attrs?.presentation_group||
      ['class','namespace','function'].includes(owner.level));
    for(const node of cy.nodes()){
      if(!node.data('iconKind'))continue;
      const local=detail&&map.contains(scope,node.id()),visible=local||level>=0.12&&2*(map.radii.get(node.id())||0)*level>=8;
      if(!node.hasClass('expanded')&&!node.hasClass('group')){
        const diameter=visible?26:node.hasClass('member')?15:11;
        if(Math.abs(node.width()*zoom-diameter)>0.01)node.style({width:diameter/zoom,height:diameter/zoom});
      }
      paint(node,zoom,palette,visible);
    }
  }
  function titleBox(node,box){
    return node.hasClass('expanded')&&node.data('iconKind')?{...box,x1:box.x1-22,w:box.w+22}:box;
  }
  function title(node,box,zoom,palette){
    if(!node.data('iconKind'))return;
    const p=node.renderedPosition();
    titles.set(node,box?{visible:true,x:-box.w/2-14,y:(box.y1+box.y2)/2-(p.y-node.outerHeight()*zoom/2)-8}:{visible:false});
    paint(node,zoom,palette);
  }
  return{kind,image,update,titleBox,title};
})();
if(typeof module!=='undefined')module.exports={NodeIcons};
