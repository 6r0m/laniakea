// SPDX-License-Identifier: AGPL-3.0-or-later
// Immutable reference pages have a bounded memory lifetime, independent of user positions.
'use strict';

class ReferencePages {
  constructor(url, {maxBytes=8*1024*1024,maxEntries=64,validate=()=>{}}={}) {
    this.url=url;this.maxBytes=maxBytes;this.maxEntries=maxEntries;this.validate=validate;
    this.cache=new Map();this.pending=new Map();this.controllers=new Set();this.bytes=0;
  }

  load(query) {
    const params=new URLSearchParams();
    for(const [name,value] of Object.entries(query)) {
      if(value!==undefined)params.set(name,Array.isArray(value)?JSON.stringify(value):String(value));
    }
    params.sort();
    const key=this.url+'?'+params.toString();
    if(this.cache.has(key)) {
      const entry=this.cache.get(key);this.cache.delete(key);this.cache.set(key,entry);
      return Promise.resolve(entry.data);
    }
    if(this.pending.has(key))return this.pending.get(key);
    const controller=new AbortController();this.controllers.add(controller);
    const operation=(async()=>{
      const response=await fetch(query.groups?this.url:key,query.groups?
        {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(query),cache:'no-store',signal:controller.signal}:
        {cache:'no-store',signal:controller.signal});
      const text=await response.text();
      if(!response.ok)throw new Error(`Reference page: HTTP ${response.status}: ${text}`);
      if(controller.signal.aborted)throw new DOMException('Reference request cancelled','AbortError');
      const data=JSON.parse(text),cursor=Number(query.cursor||0);
      if(!Array.isArray(data.items)||data.items.length>Number(query.limit||50)||!Number.isSafeInteger(data.total)||data.total<data.items.length||
        data.next_cursor!==null&&(!Number.isSafeInteger(data.next_cursor)||data.next_cursor<=cursor||!data.items.length)) {
        throw new Error('Invalid reference page');
      }
      for(const item of data.items) {
        const edge=item.reference;
        if(!Number.isSafeInteger(item.group)||item.group<1||!edge||typeof edge.id!=='string'||
          typeof edge.source!=='string'||typeof edge.target!=='string'||typeof edge.type!=='string'||
          edge.internal_to_owner!==undefined&&(typeof edge.internal_to_owner!=='boolean'||edge.internal_to_owner&&edge.source!==edge.target)) {
          throw new Error('Invalid exact reference');
        }
      }
      this.validate(data);
      const bytes=new TextEncoder().encode(text+key).byteLength;
      if(bytes<=this.maxBytes&&this.maxEntries>0) {
        this.cache.set(key,{data,bytes});this.bytes+=bytes;
        while(this.bytes>this.maxBytes||this.cache.size>this.maxEntries) {
          const oldest=this.cache.keys().next().value;
          this.bytes-=this.cache.get(oldest).bytes;this.cache.delete(oldest);
        }
      }
      return data;
    })().finally(()=>{
      this.controllers.delete(controller);
      if(this.pending.get(key)===operation)this.pending.delete(key);
    });
    this.pending.set(key,operation);
    return operation;
  }

  cancel() {
    for(const controller of this.controllers)controller.abort();
    this.controllers.clear();this.pending.clear();
  }

  clear() {this.cancel();this.cache.clear();this.bytes=0;}
}

if(typeof module!=='undefined')module.exports={ReferencePages};
