// SPDX-License-Identifier: AGPL-3.0-or-later
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Universe}=require('../viewer/universe.js');
function fixture(){
  const node=(id,parent,attrs={})=>({id,parent,label:id,level:id==='root'?'project':'class',status:'in-target',boundary:false,attrs});
  const partition=(folders=[])=>({id:'private',label:'Private implementation',collapsed:true,folders});
  return {schema:'laniakea.graph/1',nodes:[node('root',null),node('module','root',{source_sections:true}),
    node('api','module',{source_partition:{id:'public',label:'Public headers',collapsed:false,folders:[]}}),
    node('method','api',{source_partition:partition()}),node('helper','module',{source_partition:partition()}),
    node('test','module',{source_partition:partition(['Tests'])}),node('verify','module',{source_partition:partition(['Verify'])}),
    node('shared','module',{source_sections:true}),node('public-type','shared',{source_partition:{id:'public',label:'Public headers',collapsed:false,folders:[]}}),
    node('private-type','shared',{source_partition:partition()})],
    edges:[{id:'use',source:'method',target:'helper',type:'calls',count:3},
      {id:'check',source:'test',target:'api',type:'calls',count:2}]};
}

test('a multi-file namespace preserves the physical-file frontier and switches to its active context once',()=>{
  const graph=JSON.parse(require('node:fs').readFileSync(require.resolve('../fixtures/namespace-files.graph.json'),'utf8'));
  const at=id=>graph.nodes.findIndex(n=>n.id===id),paths=['Private/API.cpp','Public/API.h','Private/Helper.cpp'];
  const files=paths.map((path,i)=>({owner:at('module'),root:'project',path:'Source/Sample/'+path,
    declarations:(i===0?['scope']:i===1?['build','record']:['helper']).map(at),
    definitions:(i===0?['build']:i===1?['record']:['helper']).map(at),
    partition:{id:i===1?'public':'private',label:i===1?'Public':'Implementation',collapsed:i!==1,folders:[]}}));
  const location=path=>files.findIndex(f=>f.path===path);
  const references=new Map();
  for(const e of graph.edges){
    const source=location(e.attrs?.location?.path),target=location(e.attrs?.target_declaration?.location?.path);
    const key=JSON.stringify([e.source,e.target,e.type,source,target]);
    if(!references.has(key))references.set(key,{source:at(e.source),target:at(e.target),type:e.type,count:0,
      ...(source>=0?{source_file:source}:{}),...(target>=0?{target_file:target}:{})});
    references.get(key).count++;
  }
  const topology={schema:'laniakea.map/1',nodes:graph.nodes,files,references:[...references.values()]};
  const before=JSON.stringify(topology),map=new Universe(topology);
  map.place({auto:{build:{x:17,y:32},helper:{x:60,y:15}}},'auto');
  const pins=JSON.stringify([...map.positions]);map.expanded.add('module');
  const [cpp,header,helper]=map.fileIds;
  const projected=(view,group)=>view.edges.find(e=>e.refs.some(r=>r.group===group));
  let view=map.project();
  assert.equal(projected(view,1).target,header,'a collapsed namespace must not swallow recorded header provenance');
  assert.equal(projected(view,2).source,cpp);assert.equal(projected(view,2).target,helper);
  assert.equal(projected(view,4).target,'scope','missing provenance keeps the semantic fallback');
  const alias=[...map.nodes.values()].find(n=>n.attrs?.source_file&&n.attrs.source_owner==='scope'&&n.source.path===files[1].path).id;
  assert.equal(map.navigationTarget(header),alias,'a header enters its existing declaration context, not just its one definition');
  map.expanded.add('scope');view=map.project();
  assert.equal(projected(view,1).target,alias);
  assert.equal(view.nodes.filter(n=>n.attrs?.source_file&&n.source.path===files[1].path).length,1,'no disconnected second header');
  assert.equal(map.referenceStats.get(alias).incoming,6,'context statistics retain weighted and fallback references');
  map.reveal('build');view=map.project();assert.equal(projected(view,1).target,'build');
  assert.equal(projected(view,5).source,'build');assert.equal(projected(view,5).target,'build','real recursion is retained');
  assert.equal(projected(view,3).target,'record','a revealed class wins over its source-file abstraction');
  const groups=map.viewNodes.filter(n=>map.isGroup(n.id)&&n.id!==map.root).map(n=>n.id);
  for(let mask=0;mask<2**groups.length;mask++){
    map.expanded=new Set([map.root,...groups.filter((_,i)=>mask&(1<<i))]);view=map.project();
    const refs=[...view.edges.flatMap(e=>e.refs),...[...view.internal.values()].flat()];
    assert.equal(new Set(refs.map(r=>r.group)).size,topology.references.length,'each exact group is represented once');
    assert.equal(refs.reduce((sum,e)=>sum+e.count,0),9);
    const visible=new Set(view.nodes.map(n=>n.id));
    assert.ok(view.edges.every(e=>visible.has(e.source)&&visible.has(e.target)));
  }
  assert.equal(JSON.stringify([...map.positions]),pins);assert.equal(JSON.stringify(topology),before);
  assert.equal(map.nodes.get('build').parent,'scope');assert.equal(map.nodes.get('record').parent,'scope');
  const shared=JSON.parse(before),second=shared.nodes.length+1;
  shared.nodes.push({id:'scope2',parent:'module',level:'namespace',label:'Second scope',attrs:{source_sections:true}},
    {...shared.nodes[at('build')],id:'second',parent:'scope2',label:'Second'});
  shared.files[1].declarations.push(second);shared.files[0].definitions.push(second);
  shared.references.push({source:at('other'),target:second,type:'uses.function',count:4,target_file:1},
    {source:at('other'),target:at('scope'),type:'uses.namespace',count:1,target_file:0});
  const two=new Universe(shared);two.place({},'galaxy');two.expanded.add('module');two.expanded.add('scope');
  let split=two.project();
  assert.equal(projected(split,6).target,two.fileIds[1],'the unopened second scope still needs the whole-file representative');
  assert.notEqual(projected(split,1).target,two.fileIds[1],'the opened first scope uses its own contextual header');
  assert.equal(projected(split,7).target,'scope','a genuine namespace reference is not a namespace aggregation');
  assert.equal(two.navigationTarget(two.fileIds[1]),null,'a shared header must not choose one namespace or its one definition');
  two.expanded.add('scope2');split=two.project();
  assert.ok(!split.nodes.some(n=>n.id===two.fileIds[1]));
  assert.notEqual(projected(split,1).target,projected(split,6).target,'different namespace contexts do not share a false owner');
});

test('file catalog lays out public and implementation sections as separate readable bands',()=>{
  const graph=JSON.parse(require('node:fs').readFileSync(require.resolve('../fixtures/source-surface.graph.json'),'utf8'));
  // The compact catalog is normally supplied by the disposable read index.
  const nodes=graph.nodes,owner=nodes.findIndex(n=>n.id==='module');
  graph.files=['Public/API.h',...Array.from({length:18},(_,i)=>`Private/Part${i}.cpp`)].map(path=>({
    owner,root:'project',path:'Source/Sample/'+path,declarations:[],definitions:[],
    partition:{id:path.startsWith('Public')?'public':'private',label:path.startsWith('Public')?'Public headers':'Implementation',
      collapsed:!path.startsWith('Public'),folders:[]}}));
  const map=new Universe(graph);map.place({},'auto');
  const sections=map.childIds('module').filter(id=>map.regions.has(id));
  const api=sections.find(id=>map.nodes.get(id).attrs.source_private===false),impl=sections.find(id=>map.nodes.get(id).attrs.source_private);
  assert.ok(api&&impl,'both source sections must have a named organizational region');
  assert.ok(map.bounds.get(api).y2<map.bounds.get(impl).y1,'interface and implementation bands must not overlap');
  const points=map.childIds(impl).filter(id=>map.nodes.get(id).attrs.source_file).map(id=>map.positions.get(id));
  const box=map.bounds.get('module');
  assert.ok(Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x))>(box.x2-box.x1)*0.5,
    'a dense implementation must use the available module width');
  const before=new Map([...map.positions].map(([id,p])=>[id,{...p}]));
  map.translate('class',100,30);const patch=map.arrangeSource('module');
  assert.ok(Object.keys(patch).length&&Object.keys(patch).every(id=>map.canonicalPaths.get(id)?.includes('module')&&id!=='module'));
  assert.deepEqual(map.positions.get('peer'),before.get('peer'),'scoped arrangement must not move a neighbouring module');
  assert.deepEqual(map.positions.get('module'),before.get('module'),'the module anchor stays fixed');
  const many=JSON.parse(JSON.stringify(graph));
  for(const [i,file] of many.files.entries())file.partition={id:'part'+i,label:'Part '+i,collapsed:false,folders:[]};
  const diverse=new Universe(many);diverse.place({},'auto');
  assert.ok([...diverse.radii.values()].every(r=>Number.isFinite(r)&&r>0),'many recorded partitions need positive geometry');
});

test('file captions omit only a long shared identifier prefix while retaining complete identity',()=>{
  const graph=fixture(),owner=graph.nodes.findIndex(n=>n.id==='module');
  graph.files=['SampleArchitectureAudit.h','SampleArchitectureReceipt.h'].map(name=>({owner,root:'project',
    path:'Source/Sample/Public/'+name,declarations:[],definitions:[],
    partition:{id:'public',label:'Public headers',collapsed:false,folders:[]}}));
  const map=new Universe(graph);
  assert.deepEqual(map.fileIds.map(id=>map.nodes.get(id).attrs.source_caption),['Audit.h','Receipt.h']);
  assert.deepEqual(map.fileIds.map(id=>map.nodes.get(id).label),['SampleArchitectureAudit.h','SampleArchitectureReceipt.h']);
  assert.ok(map.fileIds.every(id=>map.nodes.get(id).source.path.startsWith('Source/Sample/Public/SampleArchitecture')));
});
test('implementation regions stay open and cpp definitions navigate to one semantic symbol',()=>{
  const graph=fixture();
  graph.nodes.find(n=>n.id==='module').source={root:'project',path:'Source/Sample/Sample.Build.cs'};
  graph.nodes.find(n=>n.id==='helper').source={root:'project',path:'Source/Sample/Private/Helpers.cpp'};
  const map=new Universe(graph);map.reveal('api');
  const region=map.childIds('module').find(id=>map.nodes.get(id).attrs.presentation_group);
  const view=map.project();
  assert.ok(view.expanded.has(region),'organizational region cannot collapse to a dependency bucket');
  const file=map.childIds(region).find(id=>map.nodes.get(id).source?.path.endsWith('Helpers.cpp'));
  assert.ok(file,'cpp-only private helper must have a named source-file representative');
  assert.equal(map.representative('helper'),file);
  assert.ok(view.edges.every(e=>e.source!==region&&e.target!==region));
  assert.equal(graph.nodes.filter(n=>n.id==='helper').length,1);
});
test('every hierarchy frontier routes each reference once to its visible endpoint or internal count',()=>{
  const graph=fixture(),file={root:'project',path:'Source/Sample/Public/API.h'};
  graph.nodes.find(n=>n.id==='api').attrs.source_partition.file=file;
  graph.edges.push({id:'owner-use',source:'module',target:'api',type:'uses.type',count:4},
    {id:'owner-dependency',source:'module',target:'shared',type:'depends',count:1},
    {id:'recursive',source:'method',target:'method',type:'calls',count:1},
    {id:'normalized-internal',source:'api',target:'api',type:'uses.type',count:2,internal_to_owner:true});
  const map=new Universe(graph);map.place({},'galaxy');
  // Shifted pins make the rendered container bounds differ from its original centre.
  map.translate('api',300,-70);
  const groups=map.viewNodes.filter(n=>map.isGroup(n.id)&&n.id!==map.root).map(n=>n.id);
  for(let mask=0;mask<2**groups.length;mask++){
    map.expanded=new Set([map.root,...groups.filter((_,i)=>mask&(1<<i))]);
    for(const camera of [null,{...map.bounds.get('api'),zoom:1000}]){
      const view=map.project(new Set(),true,camera),visible=new Set(view.nodes.map(n=>n.id)),seen=new Set();
      const record=ref=>{assert.ok(!seen.has(ref.id),'duplicate '+ref.id);seen.add(ref.id);};
      for(const edge of view.edges){
        assert.ok(visible.has(edge.source)&&visible.has(edge.target),'missing visible endpoint');
        for(const ref of edge.refs){
          assert.equal(edge.source,map.representative(ref.source,view.expanded));
          assert.equal(edge.target,map.representative(ref.target,view.expanded));record(ref);
        }
      }
      for(const [owner,refs] of view.internal){
        assert.ok(visible.has(owner),'internal references need a visible owner');
        for(const ref of refs){
          assert.equal(map.representative(ref.source,view.expanded),owner);
          assert.equal(map.representative(ref.target,view.expanded),owner);record(ref);
        }
      }
      const represented=graph.edges.filter(e=>seen.has(e.id)).reduce((n,e)=>n+e.count,0);
      assert.equal(represented+view.outside,graph.edges.reduce((n,e)=>n+e.count,0));
      if(!camera)assert.equal(seen.size,graph.edges.length);
    }
  }
});
test('source regions fold implementation while canonical ownership and reference identities stay intact',()=>{
  const graph=fixture(),before=JSON.stringify(graph),map=new Universe(graph);
  const group=map.childIds('module').find(id=>map.nodes.get(id).attrs.presentation_group);
  assert.ok(group,'private implementation must have a folded representative');
  assert.equal(JSON.stringify(graph),before);
  assert.equal(map.nodes.get('helper').parent,'module');
  assert.equal(map.nodes.get('method').parent,'api');
  assert.ok(map.childIds('api').includes('method'),'methods stay inside their type');
  assert.ok(map.childIds('module').includes('shared'),'a mixed namespace stays visible');
  map.reveal('api');
  let view=map.project();
  assert.ok(view.nodes.some(n=>n.id===group));assert.ok(!view.nodes.some(n=>n.id==='test'));
  assert.equal(view.edges.reduce((sum,e)=>sum+(e.count||0),0),5);
  map.reveal('test');view=map.project();
  assert.ok(view.nodes.some(n=>n.id==='test'));
  assert.deepEqual(view.edges.flatMap(e=>e.refs).map(e=>e.id).sort(),['check','use']);
  assert.equal(map.referenceStats.get(group).outgoing,2);assert.equal(map.referenceStats.get(group).incoming,3);
});
test('region dragging saves only real pins and restores its center from those descendants',()=>{
  const map=new Universe(fixture());map.place({},'galaxy');
  const group=map.childIds('module').find(id=>map.nodes.get(id).attrs.presentation_group),before={...map.positions.get(group)};
  assert.ok(group);
  const patch=map.translate(group,60,20);
  assert.ok(Object.keys(patch).every(id=>map.graph.nodes.some(n=>n.id===id)));
  assert.ok(!Object.hasOwn(patch,group));
  const fresh=new Universe(fixture());fresh.place({galaxy:patch},'galaxy');
  assert.ok(Math.abs(fresh.positions.get(group).x-before.x-60)<1e-9);
  assert.ok(Math.abs(fresh.positions.get(group).y-before.y-20)<1e-9);
  for(const [id,p] of Object.entries(patch))assert.deepEqual(fresh.positions.get(id),p);
});

test('file frontiers use call-site provenance and definition links retain one class-owned method',()=>{
  const node=(id,parent,attrs={})=>({id,parent,label:id,level:id==='root'?'project':id==='module'?'module':
    id==='method'||id==='helper'?'function':'class',attrs,status:'in-target',boundary:false});
  const file=(path,definitions=[])=>({owner:1,root:'project',path:'Source/Sample/'+path,declarations:[],definitions,
    partition:{id:path.startsWith('Public')?'public':'private',label:'Source',collapsed:!path.startsWith('Public'),folders:[]}});
  const graph={schema:'laniakea.map/1',nodes:[node('root',null),node('module','root',{source_sections:true}),
    node('api','module',{source_partition:{id:'public',label:'Public',collapsed:false,folders:[],
      file:{root:'project',path:'Source/Sample/Public/API.h'}}}),node('method','api'),node('helper','module'),node('peer','root')],
    files:[file('Public/API.h'),file('Private/Producer.cpp',[3]),file('Private/Helpers.cpp',[4])],references:[
      {source:3,target:4,type:'calls',count:3,source_file:1,target_file:2},
      {source:3,target:4,type:'calls',count:2,source_file:0,target_file:2},
      {source:5,target:3,type:'calls',count:1,target_file:0},
      {source:1,target:5,type:'depends.private',count:1}]};
  graph.nodes[4].attrs.source_partition={...graph.files[2].partition,file:{root:'project',path:graph.files[2].path}};
  const before=JSON.stringify(graph),map=new Universe(graph);map.place({},'galaxy');map.expanded.add('module');
  const [header,producer,helper]=map.fileIds;
  assert.equal(map.nodes.get('method').parent,'api');
  assert.deepEqual(map.nodes.get(producer).attrs.source_definitions,['method']);
  const p=map.positions.get(producer),r=map.radii.get(producer);
  assert.deepEqual(map.zoomStep(180/r,{x:p.x+r*0.2,y:p.y},1),{action:'definition',id:'method'},
    'definition zoom must tolerate a pointer near the file, not only its exact world coordinate');
  assert.equal(map.referenceStats.get(producer).outgoing,3);assert.equal(map.referenceStats.get(header).outgoing,2);
  assert.equal(map.referenceStats.get(header).incoming,1);assert.equal(map.referenceStats.get('api').outgoing,5);
  assert.ok(map.project().edges.some(e=>e.source===producer&&e.target===helper));
  for(const id of [header,'api','method']){
    map.reveal(id);if(map.isGroup(id))map.expanded.add(id);
    const view=map.project(),refs=[...view.edges.flatMap(e=>e.refs),...[...view.internal.values()].flat()];
    assert.equal(new Set(refs.map(r=>r.id)).size,4);assert.equal(refs.reduce((n,r)=>n+r.count,0),7);
    assert.ok(view.edges.every(e=>!map.regions.has(e.source)&&!map.regions.has(e.target)));
    assert.ok(view.edges.some(e=>e.source==='module'&&e.type==='depends.private'));
  }
  assert.ok(map.project().edges.some(e=>e.source==='method'));assert.equal(JSON.stringify(graph),before);
  const ambiguous=JSON.parse(before);ambiguous.files[1].definitions.push(4);
  const mixed=new Universe(ambiguous);
  assert.equal(mixed.definitionTarget(mixed.fileIds[1]),null,'a multi-owner file must not invent one public owner');
});
test('source presentation keeps existing canonical pins and tolerates identifiers matching its preferred prefix',()=>{
  const graph=fixture();graph.nodes.push({id:'source-section:collision',parent:'root',label:'prefix',level:'class'},
    {id:'source-file:collision',parent:'root',label:'file prefix',level:'class'});
  graph.nodes.find(n=>n.id==='api').attrs.source_partition.file={root:'project',path:'Source/Sample/Public/API.h'};
  const map=new Universe(graph),saved={api:{x:17,y:32},helper:{x:40,y:15}};
  map.place({auto:saved},'auto');
  for(const [id,point] of Object.entries(saved))assert.deepEqual(map.positions.get(id),point);
  assert.ok(map.childIds('module').some(id=>id.startsWith('@source-section:')));
  assert.ok(map.childIds('module').some(id=>id.startsWith('@source-file:')));
  for(const node of graph.nodes)for(const ancestor of map.canonicalPaths.get(node.id))assert.ok(map.contains(ancestor,node.id));
  assert.equal(map.nodes.get('public-type').parent,'shared');
});
test('a private namespace spanning source folders keeps those folders without repeating the Private region',()=>{
  const graph=fixture(),node=graph.nodes.find(n=>n.id==='shared');
  node.attrs.source_partition={id:'private',label:'Private implementation',collapsed:true,folders:[]};
  node.source={root:'project',path:'Source/Sample/Private/One.cpp'};
  for(const [id,folder] of [['public-type','Tests'],['private-type','Verify']])graph.nodes.find(n=>n.id===id).attrs.source_partition=
    {id:'private',label:'Private implementation',collapsed:true,folders:[folder]};
  const map=new Universe(graph);
  assert.deepEqual(map.childIds('shared').map(id=>map.nodes.get(id).label).sort(),['Tests','Verify']);
  assert.ok(!map.paths.get('shared').some(id=>map.nodes.get(id).attrs?.source_file),
    'a mixed namespace cannot be owned by its first observed source file');
  assert.equal(map.nodes.get('public-type').parent,'shared');
});
test('public declarations precede folded implementation regardless of compiler ID spelling',()=>{
  const graph=fixture(),rename=id=>id==='root'||id==='module'||id===null?id:'symbol:'+id;
  for(const node of graph.nodes){node.id=rename(node.id);node.parent=rename(node.parent);}
  for(const edge of graph.edges){edge.source=rename(edge.source);edge.target=rename(edge.target);}
  const map=new Universe(graph),children=map.childIds('module');
  assert.equal(map.nodes.get(children.at(-1)).attrs.presentation_group,true);
});

test('one-file namespaces enter their concrete cpp file while mixed namespaces keep their real scope',()=>{
  const graph=fixture(),scope=graph.nodes.find(n=>n.id==='shared');
  scope.attrs.source_partition={id:'private',label:'Private implementation',collapsed:true,folders:[]};
  for(const id of ['public-type','private-type']){
    const n=graph.nodes.find(n=>n.id===id);n.source={root:'project',path:'Source/Sample/Private/Local.cpp'};
    n.attrs.source_partition={...scope.attrs.source_partition};
  }
  let map=new Universe(graph);
  const files=map.paths.get('shared').filter(id=>map.nodes.get(id).attrs?.source_file);
  assert.equal(files.length,1);assert.equal(map.nodes.get(files[0]).label,'Local.cpp');
  assert.deepEqual(map.childIds('shared').sort(),['private-type','public-type']);
  assert.equal(map.nodes.get('shared').parent,'module');
  graph.nodes.find(n=>n.id==='private-type').source.path='Source/Sample/Private/Other.cpp';
  map=new Universe(graph);
  assert.ok(!map.paths.get('shared').some(id=>map.nodes.get(id).attrs?.source_file));
  assert.equal(map.childIds('shared').filter(id=>map.nodes.get(id).attrs?.source_file).length,2);
});

test('header regions collect recorded declarations while type members and exact references retain their owners',()=>{
  const graph=fixture(),file={root:'project',path:'Source/Sample/Public/API.h'};
  graph.nodes.push({id:'nested-type',parent:'api',label:'Internal',level:'class',status:'in-target',boundary:false,
    attrs:{access:'private',source_partition:{id:'public',label:'Public headers',collapsed:false,folders:[],file}}});
  for(const id of ['api','shared'])graph.nodes.find(n=>n.id===id).attrs.source_partition=
    {id:'public',label:'Public headers',collapsed:false,folders:[],file};
  const before=JSON.stringify(graph),map=new Universe(graph);
  const header=map.childIds('module').find(id=>map.nodes.get(id).attrs.source_file);
  assert.ok(header,'missing header constellation');
  assert.equal(map.nodes.get(header).source.path,file.path);
  assert.deepEqual(map.childIds(header).sort(),['api','shared']);
  assert.equal(map.nodes.get('api').parent,'module');assert.deepEqual(map.childIds('api'),['method','nested-type']);
  assert.equal(map.nodes.get('nested-type').parent,'api');
  assert.equal(JSON.stringify(graph),before);
  map.reveal(header);let view=map.project();
  assert.ok(view.nodes.some(n=>n.id===header)&&!view.nodes.some(n=>n.id==='api'));
  assert.equal([...view.edges.flatMap(e=>e.refs),...[...view.internal.values()].flat()].reduce((n,e)=>n+e.count,0),5);
  map.reveal('method');assert.ok(map.project().nodes.some(n=>n.id==='method'));
  map.place({},'galaxy');const patch=map.translate(header,20,10);
  assert.ok(Object.keys(patch).every(id=>graph.nodes.some(n=>n.id===id)));
  const fresh=new Universe(graph);fresh.place({galaxy:patch},'galaxy');
  assert.ok(Math.hypot(fresh.positions.get(header).x-map.positions.get(header).x,
    fresh.positions.get(header).y-map.positions.get(header).y)<1e-6);
});

test('shared namespaces keep scoped headers and single-header scopes avoid repeated file wrappers',()=>{
  const graph=fixture(),one={root:'project',path:'Source/Sample/Public/One/API.h'},two={root:'project',path:'Source/Sample/Public/Two/API.h'};
  for(const [id,file] of [['api',one],['public-type',one],['private-type',two]])
    graph.nodes.find(n=>n.id===id).attrs.source_partition={id:'public',label:'Public headers',collapsed:false,folders:[],file};
  let map=new Universe(graph);
  const rootHeader=map.childIds('module').find(id=>map.nodes.get(id).source?.path===one.path);
  const headers=map.childIds('shared').filter(id=>map.nodes.get(id).attrs.source_file);
  assert.equal(headers.length,2);assert.ok(!headers.includes(rootHeader));
  assert.equal(map.nodes.get('shared').parent,'module');
  graph.nodes.find(n=>n.id==='shared').attrs.source_partition={id:'public',label:'Public headers',collapsed:false,folders:[],file:one};
  graph.nodes.find(n=>n.id==='private-type').attrs.source_partition.file=one;
  map=new Universe(graph);
  assert.ok(map.paths.get('public-type').filter(id=>map.nodes.get(id).attrs.source_file).length===1);
  assert.deepEqual(map.childIds('shared').sort(),['private-type','public-type']);
});

test('public header subfolders precede Private and invalid file hints fail without mutating graph facts',()=>{
  const graph=fixture(),api=graph.nodes.find(n=>n.id==='api');
  api.attrs.source_partition={id:'public',label:'Public headers',collapsed:false,folders:['Network'],
    file:{root:'project',path:'Source/Sample/Public/Network/API.h'}};
  const map=new Universe(graph),children=map.childIds('module');
  assert.ok(children.findIndex(id=>map.nodes.get(id).label==='Network')<
    children.findIndex(id=>map.nodes.get(id).label==='Private implementation'));
  api.attrs.source_partition.file={root:'project'};const before=JSON.stringify(graph);
  assert.throws(()=>new Universe(graph),/source file/i);assert.equal(JSON.stringify(graph),before);
});
