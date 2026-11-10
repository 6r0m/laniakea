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
  relative(trace,id) {
    const pairs=trace.kind==='overlap'?trace.pairs:[trace],roles=new Map(),peers=[];
    const focus={id,groups:{incoming:[],outgoing:[],within:[]},others:0},seen=new Set();
    for(const pair of pairs){
      if(pair.source!==id&&pair.target!==id){
        focus.others++;for(const key of pair.roles.keys())roles.set(key,'other');continue;
      }
      const reverse=pair.source!==id;
      const groups={incoming:pair.groups[reverse?'outgoing':'incoming'],
        outgoing:pair.groups[reverse?'incoming':'outgoing'],within:pair.groups.within};
      for(const [role,refs] of Object.entries(groups))for(const ref of refs){
        const key=ref.group===undefined?ref.id:ref.group;
        if(!seen.has(key)){seen.add(key);focus.groups[role].push(ref);}
      }
      for(const [key,role] of pair.roles)roles.set(key,reverse&&role!=='within'?
        role==='outgoing'?'incoming':'outgoing':role);
      if(pair.source!==pair.target)peers.push({id:reverse?pair.source:pair.target,
        incoming:this.total(groups.incoming),outgoing:this.total(groups.outgoing)});
    }
    focus.peers=peers;this.finish(focus);
    return {...trace,focus,roles};
  },
  overlap(view,endpoints) {
    const candidates=new Map(endpoints.map(pair=>[this.key(pair.source,pair.target),pair]));
    const groups=new Map([...candidates.keys()].map(key=>[key,[]]));
    for(const edge of view.edges||[])groups.get(this.key(edge.source,edge.target))?.push(edge);
    const pairs=[...candidates].sort(([a],[b])=>a.localeCompare(b)).map(([key,pair])=>
      this.pair({edges:groups.get(key)},pair.source,pair.target)).filter(Boolean);
    if(pairs.length<2)return pairs[0]||null;
    const refs=new Map(),roles=new Map();
    for(const pair of pairs){
      for(const ref of pair.refs)refs.set(ref.group===undefined?ref.id:ref.group,ref);
      for(const [id,role] of pair.roles)roles.set(id,role);
    }
    return {kind:'overlap',key:JSON.stringify(['overlap',...pairs.map(pair=>pair.key)]),
      pairs,refs:[...refs.values()],roles};
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
