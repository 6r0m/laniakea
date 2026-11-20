// SPDX-License-Identifier: AGPL-3.0-or-later
// Read-only finding comparison; Review owns the generation and request lifetime.
'use strict';

function validateSourcePreview(data,item){
  const keys=['root','path','line','column','end_line','end_column'];
  if(!data||!['matching','changed','unavailable'].includes(data.status)||typeof data.detail!=='string'||data.detail.length>2000||
    !data.location||keys.some(key=>data.location[key]!==item[key])||!Array.isArray(data.lines)||data.lines.length>200)
    throw Error('Invalid source preview');
  if(data.status!=='matching'){
    if(data.lines.length)throw Error('Unverified source text cannot be shown as recorded evidence');
    return data;
  }
  if(!Number.isSafeInteger(data.start_line)||data.start_line<1||data.start_line>item.line||!data.lines.length||typeof data.truncated!=='boolean')
    throw Error('Invalid source preview range');
  let bytes=0;
  for(const [index,line] of data.lines.entries()){
    if(line.number!==data.start_line+index||typeof line.text!=='string'||typeof line.matched!=='boolean'||
      line.matched!==(line.number>=item.line&&line.number<=item.end_line))throw Error('Invalid source preview line');
    bytes+=new TextEncoder().encode(line.text).byteLength;
  }
  if(bytes>65536)throw Error('Source preview exceeds its text limit');
  return data;
}


function sourceIcon(kind){
  const paths={preview:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
    editor:'m8 5-6 7 6 7m8-14 6 7-6 7M14 3l-4 18',copy:'M8 8h13v13H8zM16 8V3H3v13h5',
    file:'M5 3h9l5 5v13H5zM14 3v6h5M8 13h8m-8 4h8'};
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS(svg.namespaceURI,'path');
  for(const [key,value] of Object.entries({viewBox:'0 0 24 24',width:'16',height:'16','aria-hidden':'true',focusable:'false'}))svg.setAttribute(key,value);
  path.setAttribute('d',paths[kind]);svg.append(path);return svg;
}

function sourceActions(item,target,current){
  const actions=el('div',null,{class:'source-actions'}),editor=sourceLink(item),
    copy=el('button',null,{type:'button','aria-label':'Copy path',title:'Copy path'}),
    status=el('small',null,{role:'status'}),where=sourcePath(item,target.roots||{});
  if(editor){editor.replaceChildren(sourceIcon('editor'));editor.title='Open in VS Code';editor.setAttribute('aria-label','Open in VS Code');actions.append(editor);}
  copy.append(sourceIcon('copy'));copy.disabled=!where;actions.append(copy,status);
  const fallback=el('input',null,{type:'text',name:'source-path',autocomplete:'off',spellcheck:'false',readonly:'',
    value:where||'','aria-label':'Source path',class:'source-copy-fallback'});fallback.hidden=true;actions.append(fallback);
  copy.onclick=async()=>{
    if(!current())return;copy.disabled=true;
    try{await navigator.clipboard.writeText(where);if(current()&&actions.isConnected)status.textContent='Copied path.';}
    catch(error){if(current()&&actions.isConnected){status.textContent='Clipboard unavailable. Copy the selected path.';
      fallback.hidden=false;fallback.focus({preventScroll:true});fallback.select();}}
    finally{if(actions.isConnected)copy.disabled=!where;}
  };
  return actions;
}

function sourceOccurrenceRow(item,{target,current,preview}){
  const row=el('li',null,{class:'source-evidence-range'}),
    button=el('button',null,{type:'button',class:'source-open',title:'Preview code',
      'aria-label':`Preview code: ${item.path}, lines ${item.line}-${item.end_line}`});
  button.append(sourceIcon('preview'),el('span',`${item.path.split('/').at(-1)}:${item.line}-${item.end_line}`,{translate:'no'}));
  button.onclick=()=>{if(current())preview(button);};
  const name=el('div',null,{class:'source-occurrence-name'});name.append(button,el('small',item.path,{translate:'no'}));
  row.append(name,sourceActions(item,target,current));return row;
}

class SourceComparison{
  constructor(options){Object.assign(this,options);this.closed=false;this.slots=[];}
  active(){return !this.closed&&this.current()&&this.root?.isConnected;}
  mount(){
    this.root=el('section',null,{class:'source-comparison',tabindex:'-1','aria-label':'Source comparison'});
    const header=el('div',null,{class:'comparison-header'}),title=el('div'),back=el('button','Back to map',{type:'button'});
    this.summary=el('p',null,{class:'comparison-selection',role:'status'});
    title.append(el('h2',this.title),el('small',`${this.finding.token_count} duplicated tokens found in ${this.initial.total} code locations`),
      this.summary,el('small','Compare two locations at a time. Use Next match or choose a match in either pane.'));
    back.onclick=()=>this.close(true);header.append(back,title);this.root.append(header);
    this.root.onkeydown=event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();this.close(true);}};
    const panes=el('div',null,{class:'source-panes'});this.root.append(panes);
    const map=$('map');this.inert=[...map.children].map(node=>[node,node.inert]);
    for(const [node] of this.inert)node.inert=true;
    this.viewInert=$('view-controls').inert;$('view-controls').inert=true;
    this.inspectorInert=$('details').inert;this.small=matchMedia('(max-width:760px)');
    this.resize=()=>{$('details').inert=this.inspectorInert||this.small.matches;};
    this.small.addEventListener('change',this.resize);this.resize();
    map.append(this.root);this.root.focus({preventScroll:true});
    for(const index of this.selected){
      const slot={node:el('section',null,{class:'source-pane'}),page:this.initial,index,pageVersion:0};
      this.slots.push(slot);panes.append(slot.node);this.controls(slot);this.read(slot);
    }
  }
  controls(slot){
    slot.node.replaceChildren();
    const name=slot.page.items[slot.index-slot.page.cursor],header=el('div',null,{class:'source-pane-heading'});
    header.append(sourceIcon('file'),el('h3',name.path.split('/').at(-1),{translate:'no'}));slot.node.append(header);
    slot.position=el('strong',null,{class:'source-match-position'});
    slot.select=el('select',null,{'aria-label':'Match to compare'});
    for(const [i,item] of slot.page.items.entries()){
      const option=new Option(`${slot.page.cursor+i+1}. ${item.path.split('/').at(-1)}:${item.line}-${item.end_line}`,slot.page.cursor+i);
      option.title=item.path;slot.select.add(option);
    }
    slot.select.value=String(slot.index);slot.select.onchange=()=>{slot.index=Number(slot.select.value);this.read(slot);};
    const matches=el('div',null,{class:'source-match-navigation'});slot.matchButtons=[];
    for(const [label,step] of [['Previous match',-1],['Next match',1]]){
      const button=el('button',label,{type:'button'});
      button.onclick=()=>{const index=slot.index+step;
        if(index>=slot.page.cursor&&index<slot.page.cursor+slot.page.items.length){
          slot.index=index;slot.select.value=String(index);this.read(slot);
        }else this.page(slot,Math.floor(index/50)*50,index);
      };
      slot.matchButtons.push(button);matches.append(button);
    }
    slot.pageStatus=el('small',`${slot.page.cursor+1}-${slot.page.cursor+slot.page.items.length} of ${slot.page.total} ranges`,{role:'status'});
    slot.pageStatus.hidden=slot.page.total<=50;
    const pager=el('div',null,{class:'source-range-pager'});slot.buttons=[];
    pager.hidden=slot.page.total<=50;
    for(const [label,cursor] of [['Previous ranges',Math.max(0,slot.page.cursor-50)],['Next ranges',slot.page.next_cursor]]){
      const button=el('button',label,{type:'button'});button.disabled=cursor===null||label==='Previous ranges'&&!slot.page.cursor;
      button.onclick=()=>this.page(slot,cursor);slot.buttons.push(button);pager.append(button);
    }
    slot.content=el('div',null,{class:'source-pane-content'});
    slot.node.append(slot.position,slot.select,matches,slot.pageStatus,pager,slot.content);
  }
  async page(slot,cursor,index=cursor){
    const version=++slot.pageVersion;slot.select.disabled=true;for(const b of [...slot.buttons,...slot.matchButtons])b.disabled=true;
    slot.pageStatus.hidden=false;slot.pageStatus.textContent='Loading ranges...';
    try{
      const data=await this.loadPage(cursor);
      if(!this.active()||version!==slot.pageVersion)return;
      slot.page={...data,cursor};slot.index=index;this.controls(slot);this.read(slot);
    }catch(error){if(this.active()&&version===slot.pageVersion){
      slot.pageStatus.textContent=error.name==='AbortError'?'Range loading cancelled.':'Could not load ranges. '+error.message;
      slot.select.disabled=false;slot.buttons[0].disabled=!slot.page.cursor;slot.buttons[1].disabled=slot.page.next_cursor===null;
      this.selectionSummary(slot);
    }}
  }
  selectionSummary(slot){
    slot.position.textContent=`Match ${slot.index+1} of ${slot.page.total}`;
    slot.matchButtons[0].disabled=slot.index===0;slot.matchButtons[1].disabled=slot.index>=slot.page.total-1;
    const indices=this.slots.map(p=>p.index+1);
    this.summary.textContent=`Showing ${indices.length===1?'match':'matches'} ${indices.join(' and ')} of ${this.initial.total}`;
  }
  async read(slot){
    slot.controller?.abort();const item=slot.page.items[slot.index-slot.page.cursor],index=slot.index;
    const revision=(slot.revision||0)+1;slot.revision=revision;
    this.selectionSummary(slot);
    const active=()=>this.active()&&revision===slot.revision;
    slot.content.replaceChildren();
    slot.node.querySelector('h3').textContent=item.path.split('/').at(-1);
    const path=el('p',item.path,{class:'source-path',translate:'no'}),message=el('p','Loading source...',{role:'status'});
    slot.content.append(path,sourceActions(item,this.target,active),message);
    if(!this.target.source_url){message.textContent='Preview unavailable on this server. Use the editor link.';return;}
    let url;try{url=new URL(this.target.source_url,location.href);}catch(error){message.textContent='Invalid source preview address.';return;}
    if(url.origin!==location.origin){message.textContent='Source preview requires the local server.';return;}
    const controller=new AbortController();controller.sourcePreview=true;slot.controller=controller;this.requests.add(controller);
    slot.content.setAttribute('aria-busy','true');
    try{
      const response=await fetch(url+'?'+new URLSearchParams({report:this.report,finding:this.finding.id,occurrence:index}),{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error(`Source preview: HTTP ${response.status}. Back to map and preview again to retry.`);
      const data=validateSourcePreview(await response.json(),item);if(!active())return;
      message.textContent=data.detail;if(data.status!=='matching')return;
      if(data.truncated)slot.content.append(el('p','Preview limited. Use the editor to inspect the complete range.',{role:'status'}));
      const code=el('pre',null,{class:'source-code',translate:'no',tabindex:'0',role:'region',
        'aria-label':`Source code: ${item.path}, lines ${data.start_line}-${data.lines.at(-1).number}`});
      for(const line of data.lines){const entry=el('span',null,{class:'source-line'+(line.matched?' matched':'')});
        entry.append(el('span',String(line.number),{class:'source-line-number','aria-hidden':'true'}),el('code',line.text||' '));code.append(entry);}
      slot.content.append(code);
    }catch(error){if(active())message.textContent=error.name==='AbortError'?'Preview cancelled. Back to map and preview again to retry.':error.message.slice(0,500);}
    finally{this.requests.delete(controller);if(slot.controller===controller){slot.controller=null;slot.content.removeAttribute('aria-busy');}}
  }
  close(focus=false){
    if(this.closed)return;this.closed=true;for(const slot of this.slots)slot.controller?.abort();
    this.root?.remove();for(const [node,inert] of this.inert||[])node.inert=inert;
    this.small?.removeEventListener('change',this.resize);$('details').inert=this.inspectorInert||false;
    $('view-controls').inert=this.viewInert||false;this.onClose();
    if(focus){const target=this.trigger.isConnected?this.trigger:state.inspector?.tabs.get('architecture');target?.focus({preventScroll:true});}
  }
}

if(typeof module!=='undefined')module.exports={validateSourcePreview};
