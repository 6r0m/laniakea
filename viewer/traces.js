// SPDX-License-Identifier: AGPL-3.0-or-later
// Trace scopes derive from the current projection, never from renderer decorations or hidden facts.
'use strict';

const ConnectionTrace = {
  key(source,target) { return JSON.stringify(['pair',...[source,target].sort()]); },
  total(refs) { return refs.reduce((sum,ref)=>sum+(ref.count===undefined?1:ref.count),0); },
  finish(trace) {
    trace.refs=Object.values(trace.groups).flat();
    trace.counts=Object.fromEntries(Object.entries(trace.groups).map(([role,refs])=>[role,this.total(refs)]));
    return trace;
  },
  signature(trace) {
    return JSON.stringify(trace.refs.map(ref=>[ref.group===undefined?ref.id:ref.group,ref.type,ref.count||1]).sort());
  },
  node(map,view,id) {
    if(!view.nodes?.some(node=>node.id===id))return null;
    const trace={kind:'node',key:JSON.stringify(['node',id]),source:id,
      groups:{outgoing:[],incoming:[],within:[]},roles:new Map()};
    const seen=new Set();
    const add=ref=>{
      if(seen.has(ref.id))return null;
      const source=map.contains(id,ref.source),target=map.contains(id,ref.target);
      if(!source&&!target)return null;
      seen.add(ref.id);
      const role=source&&target?'within':source?'outgoing':'incoming';
      trace.groups[role].push(ref);return role;
    };
    for(const edge of view.edges||[]) {
      if(!map.contains(id,edge.source)&&!map.contains(id,edge.target))continue;
      const roles=new Set((edge.refs||[edge]).map(add).filter(Boolean));
      if(roles.size)trace.roles.set(edge.id,roles.size===1?[...roles][0]:'both');
    }
    for(const [owner,refs] of view.internal||[])if(map.contains(id,owner))refs.forEach(add);
    return this.finish(trace);
  },
  pair(view,source,target) {
    const [a,b]=[source,target].sort(),edges=(view.edges||[]).filter(edge=>
      edge.source===a&&edge.target===b||edge.source===b&&edge.target===a);
    if(!edges.length)return null;
    const trace={kind:'pair',key:this.key(a,b),source:a,target:b,
      groups:{outgoing:[],incoming:[],within:[]},roles:new Map()},seen=new Set();
    for(const edge of edges) {
      const role=a===b?'within':edge.source===a?'outgoing':'incoming';
      trace.roles.set(edge.id,role);
      for(const ref of edge.refs||[edge])if(!seen.has(ref.id)) {
        seen.add(ref.id);trace.groups[role].push(ref);
      }
    }
    return this.finish(trace);
  },
};

if(typeof module!=='undefined')module.exports={ConnectionTrace};
