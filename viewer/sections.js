// SPDX-License-Identifier: AGPL-3.0-or-later
// Source-file navigation preserves compiler ownership.
'use strict';
const SourceSections=(()=>{
  function build(graph){
    const nodes=new Map(graph.nodes.map(n=>[n.id,n])),parents=new Map(graph.nodes.map(n=>[n.id,n.parent])),originalChildren=new Map();
    for(const node of graph.nodes){
      if(!originalChildren.has(node.parent))originalChildren.set(node.parent,[]);
      originalChildren.get(node.parent).push(node);
    }
    let prefix='source-section:';
    while(graph.nodes.some(n=>n.id.startsWith(prefix)))prefix='@'+prefix;
    let filePrefix='source-file:';
    while(graph.nodes.some(n=>n.id.startsWith(filePrefix)))filePrefix='@'+filePrefix;
    const sameFile=(a,b)=>a&&b&&a.root===b.root&&a.path===b.path;
    const commonFiles=new Map();
    // One observed namespace location cannot stand in for children declared across several files.
    const commonFile=node=>{
      if(commonFiles.has(node.id))return commonFiles.get(node.id);
      const hint=node.attrs?.source_partition?.file;
      let file=hint;
      if(!file&&node.attrs?.source_sections){
        const children=originalChildren.get(node.id)||[],files=children.map(commonFile);
        if(files.length&&files[0]&&files.every(f=>sameFile(f,files[0])))file=files[0];
      }else if(!file)file=node.source;
      commonFiles.set(node.id,file);return file;
    };
    const region=(owner,partition)=>{
      const path=partition.folders||[];
      let parent=owner.id;
      for(let depth=0;depth<=path.length;depth++){
        const id=prefix+JSON.stringify([owner.id,partition.id,...path.slice(0,depth)]);
        if(!nodes.has(id)){
          nodes.set(id,{id,parent,label:depth?path[depth-1]:partition.label,level:'source-group',
            boundary:owner.boundary,status:owner.status,attrs:{presentation_group:true,source_owner:owner.id,
              source_region:depth===0,source_private:partition.collapsed,source_context:depth?path.slice(0,depth).join(' / '):partition.label}});
          parents.set(id,parent);
        }else if(parents.get(id)!==parent){parents.set(id,parent);nodes.get(id).parent=parent;}
        parent=id;
      }
      return parent;
    };
    for(const owner of graph.nodes){
      if(!owner.attrs?.source_sections)continue;
      for(const child of originalChildren.get(owner.id)||[]){
        const partition=child.attrs?.source_partition;
        if(!partition)continue;
        if(typeof partition.id!=='string'||!partition.id||typeof partition.collapsed!=='boolean'||
          !Array.isArray(partition.folders)||partition.folders.some(p=>typeof p!=='string'||!p)||
          typeof partition.label!=='string')throw Error('Invalid source partition');
        let parent=owner.id;
        const inherited=owner.attrs.source_partition;
        const common=inherited?.id===partition.id&&inherited.folders.every((name,i)=>partition.folders[i]===name);
        const first=common?inherited.folders.length+1:partition.collapsed?0:1;
        for(let depth=first;depth<=partition.folders.length;depth++){
          const path=partition.folders.slice(0,depth),id=prefix+JSON.stringify([owner.id,partition.id,...path]);
          if(!nodes.has(id)){
            nodes.set(id,{id,parent,label:depth?path.at(-1):partition.label,level:'source-group',
              boundary:owner.boundary,status:owner.status,attrs:{presentation_group:true,source_region:depth===0,source_owner:owner.id,
                source_private:partition.collapsed,source_context:depth?path.join(' / '):partition.label}});
            parents.set(id,parent);
          }
          parent=id;
        }
        const file=commonFile(child);
        if(file!==undefined&&(typeof file?.root!=='string'||!file.root||typeof file?.path!=='string'||!file.path))
          throw Error('Invalid source file partition');
        // A common file already wraps the enclosing semantic scope.
        if(file&&!sameFile(inherited?.file||(inherited&&commonFile(owner)),file)){
          const id=filePrefix+JSON.stringify([owner.id,file.root,file.path]);
          if(!nodes.has(id)){
            nodes.set(id,{id,parent,label:file.path.split(/[\\/]/).pop(),level:'source-group',source:{...file,line:1},
              boundary:owner.boundary,status:owner.status,attrs:{presentation_group:true,source_file:true,
                source_private:partition.collapsed,source_owner:owner.id,source_context:file.path}});
            parents.set(id,parent);
          }else if(parents.get(id)!==parent)throw Error('Conflicting source file context');
          parent=id;
        }
        parents.set(child.id,parent);
      }
    }
    const fileIds=(graph.files||[]).map(file=>{
      const owner=graph.nodes[file.owner];
      if(!owner||!owner.attrs?.source_sections||typeof file.root!=='string'||!file.root||typeof file.path!=='string'||!file.path||
        ![file.declarations,file.definitions].every(ids=>Array.isArray(ids)&&ids.every(i=>Number.isInteger(i)&&graph.nodes[i])))
        throw Error('Invalid source file catalog');
      if(file.partition&&(typeof file.partition.id!=='string'||!file.partition.id||typeof file.partition.label!=='string'||
        typeof file.partition.collapsed!=='boolean'||!Array.isArray(file.partition.folders)||
        file.partition.folders.some(folder=>typeof folder!=='string'||!folder)))throw Error('Invalid source file partition');
      const id=filePrefix+JSON.stringify([owner.id,file.root,file.path]);
      const parent=file.partition?region(owner,file.partition):owner.id;
      if(!nodes.has(id)){
        nodes.set(id,{id,parent,label:file.path.split(/[\\/]/).pop(),level:'source-group',source:{root:file.root,path:file.path,line:1},
          boundary:owner.boundary,status:owner.status,attrs:{presentation_group:true,source_file:true,
            source_owner:owner.id,source_context:file.path,source_private:file.partition?.collapsed}});
        parents.set(id,parent);
      }else if(parents.get(id)!==parent){parents.set(id,parent);nodes.get(id).parent=parent;}
      Object.assign(nodes.get(id).attrs,{source_declarations:file.declarations.map(i=>graph.nodes[i].id),
        source_definitions:file.definitions.map(i=>graph.nodes[i].id)});
      return id;
    });
    const children=new Map(),paths=new Map();
    for(const [id,parent] of parents){
      if(!children.has(parent))children.set(parent,[]);
      children.get(parent).push(id);
    }
    for(const [parent,list] of children){
      const files=list.map(id=>nodes.get(id)).filter(n=>n.attrs?.source_file);
      if(files.length>1){
        const names=files.map(n=>n.label);let length=0;
        while(length<names[0].length&&names.every(name=>name[length]===names[0][length]))length++;
        while(length>0&&!names.every(name=>/[A-Z_]/.test(name[length]||'')))length--;
        if(length>=12)for(const file of files)file.attrs.source_caption=file.label.slice(length);
      }
      const owner=nodes.get(parent),publicFirst=owner?.attrs?.source_sections&&!owner.attrs.source_partition?.collapsed;
      const foldersFirst=owner?.attrs?.presentation_group||owner?.attrs?.source_partition?.collapsed;
      list.sort((a,b)=>{
        const rank=id=>{
          const attrs=nodes.get(id).attrs||{},group=attrs.presentation_group,file=attrs.source_file;
          return publicFirst?Number(Boolean(group&&!file&&attrs.source_private!==false)):foldersFirst?group?file?1:0:2:0;
        };
        return rank(a)-rank(b)||(a<b?-1:a>b?1:0);
      });
    }
    const path=id=>{
      if(!paths.has(id))paths.set(id,[...(parents.get(id)===null?[]:path(parents.get(id))),id]);
      return paths.get(id);
    };
    for(const id of nodes.keys())path(id);
    return{nodes,parents,children,paths,fileIds};
  }
  return{build};
})();
if(typeof module!=='undefined')module.exports={SourceSections};
