// SPDX-License-Identifier: AGPL-3.0-or-later
// Recorded declaration context is shared by hover, inspection and global search.
'use strict';
const DeclarationContext = (() => {
  function describe(node, map) {
    const attrs=node.attrs||{},owners=(map.canonicalPaths?.get(node.id)||map.paths.get(node.id)||[]).slice(0,-1);
    const source=node.source;
    const context=[];
    if(attrs.presentation_group&&!attrs.source_file)context.push('Source organization only; symbols retain their compiler owners.');
    if(attrs.source_region)context.push('Organizational region; wires reach concrete files and symbols.');
    if(attrs.source_file&&attrs.source_definitions)context.push(`${attrs.source_definitions.length} recorded definitions / `+
      `${attrs.source_declarations.length} declarations. Inspect to follow existing symbols.`);
    if(attrs.source_file&&map.navigationTarget?.(node.id))context.push('Zoom to enter its recorded scope.');
    if(attrs.source_partition)context.push('Recorded source: '+attrs.source_partition.label+
      (attrs.source_partition.folders.length?' / '+attrs.source_partition.folders.join(' / '):'')+
      '. Source visibility is separate from C++ member access.');
    if(attrs.definition===false)context.push('Declaration only; definition was not recorded.');
    const properties=[attrs.access,...['static','virtual','const'].filter(name=>attrs[name]===true)].filter(Boolean);
    if(properties.length)context.push(properties.join(' / '));
    if(attrs.member_counts){
      const members=attrs.member_counts,total=values=>Object.values(values||{}).reduce((sum,n)=>sum+n,0);
      context.push(`${total(members.fields)} observed fields / ${total(members.callables)} observed callables`);
      const access=new Map();
      for(const group of Object.values(members))for(const [name,n] of Object.entries(group))access.set(name,(access.get(name)||0)+n);
      if(access.size)context.push('Observed member access: '+[...access].map(([name,n])=>`${n} ${name}`).join(' / '));
      context.push('Fields are summarized, not individual stars. Observed members are not exhaustive coverage.');
    }
    if(attrs.declaration_origin)context.push('Declaration origin: '+attrs.declaration_origin);
    return {path:attrs.qualified||owners.slice(-2).map(id=>map.nodes.get(id).label).join(' / '),
      signature:attrs.type_signature||attrs.signature||'',
      context,
      source:source?source.path.split(/[\\/]/).pop()+(source.line?':'+source.line:''):''};
  }

  function rank(node, query, levels) {
    query=query.trim().toLowerCase();
    if(!query)return null;
    const attrs=node.attrs||{},texts=[node.label,attrs.qualified,attrs.signature,attrs.type_signature,
      attrs.source_file&&node.source?.path]
      .filter(text=>typeof text==='string'&&text).map(text=>text.toLowerCase());
    let fit=Infinity;
    for(const text of texts)fit=Math.min(fit,text===query?0:text.startsWith(query)?1:text.includes(query)?2:Infinity);
    if(!Number.isFinite(fit))return null;
    const level=levels.indexOf(node.level);
    return[fit,level<0?levels.length:level,node.label.length];
  }

  function search(query, nodes, levels=[], limit=8) {
    const items=[];let count=0;
    const compare=(a,b)=>a.rank[0]-b.rank[0]||a.rank[1]-b.rank[1]||a.rank[2]-b.rank[2]||a.node.id.localeCompare(b.node.id);
    for(const node of nodes){
      const score=rank(node,query,levels);if(!score)continue;
      count++;
      const item={node,rank:score},at=items.findIndex(other=>compare(item,other)<0);
      if(at<0)items.push(item);else items.splice(at,0,item);
      if(items.length>limit)items.pop();
    }
    return {items:items.map(item=>item.node),count};
  }
  return {describe,rank,search};
})();
if(typeof module!=='undefined')module.exports={DeclarationContext};
