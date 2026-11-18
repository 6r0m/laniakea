// SPDX-License-Identifier: AGPL-3.0-or-later
// Acquisition controls project Monitor state; they do not execute checks or evaluate Review policy.
'use strict';

function checksSummary(current,target,message='') {
  const rows=target?.checks||[];
  const outcomes=Object.values(target?.acquisition||{});
  const failed=rows.some(r=>r.status==='failed')||current?.checks?.some(r=>r.status==='failed')||
    outcomes.some(r=>r.status==='failed')||Boolean(current?.error||message);
  const busy=current?.active&&!['fresh','failed','retry required','saved','paused'].includes(current.state);
  const done=rows.filter(r=>r.status==='completed').length;
  const missing=rows.some(r=>!['completed','disabled'].includes(r.status))||outcomes.some(r=>['incomplete','unavailable'].includes(r.status));
  const label=current?.state==='stopping'?'Checks: stopping':failed?'Checks: failed':busy?'Checks: running':
    rows.length?`Checks: ${done}/${rows.length}`:'Checks: unavailable';
  return {label,attention:failed||missing||Boolean(current?.degraded),done,total:rows.length,busy,
    description:[`Displayed map: ${done} of ${rows.length} checks recorded`,...rows.filter(r=>r.status!=='completed')
      .map(r=>`${r.label}: ${r.status}`),...outcomes.filter(r=>r.status!=='completed').map(r=>`${r.status}: ${r.code}`),
      current?.error,current?.degraded,message].filter(Boolean).join('. ')};
}

class AnalysisControls {
  constructor(){
    this.dismissed=new Set();this.edited=false;this.saving=false;this.formKey=null;
    $('toggle-analysis').onclick=()=>this.panel();
    $('analysis-close').onclick=()=>this.panel(false);
    $('analysis-run').onclick=()=>this.run();
    $('analysis-stop').onclick=()=>this.control('pause');
    $('analysis-recommended').onclick=()=>{for(const select of $('analysis-checks').querySelectorAll('select'))select.value='auto';
      this.edited=true;this.run();};
    $('analysis-discard').onclick=()=>{this.edited=false;this.formKey=null;this.error='';this.render(this.status);};
    $('analysis-auto').onchange=()=>this.control($('analysis-auto').checked?'activate':'pause');
    $('analysis-retry').onclick=()=>this.control('retry');
  }
  dirty(){return this.edited||this.saving;}
  panel(open=$('analysis').hidden){
    $('analysis').hidden=!open;$('toggle-analysis').setAttribute('aria-expanded',String(open));
    if(open){state.review?.panel(false);togglePanel('filters',false);
      if(innerWidth<=1000)togglePanel('details',false);}
    else {this.dismissed.add(state.target?.id);if($('analysis').contains(document.activeElement))$('toggle-analysis').focus();}
  }
  build(rows,current){
    const root=$('analysis-checks');root.replaceChildren();this.choices={};
    const pending=current?.requested?.checks;
    for(const row of rows){
      const section=el('section',null,{class:'analysis-check','data-check':row.id});
      const header=el('div',null,{class:'analysis-check-heading'});header.append(el('h3',row.label));
      if(row.optional){
        const label=el('label','Mode '),select=el('select',null,{name:'check-'+row.id,'aria-label':row.label+' mode'});
        for(const [value,text] of [['auto','Auto'],['on','On (required)'],['off','Off']])select.append(el('option',text,{value}));
        select.value=pending?.[row.id]||row.mode||'off';this.choices[row.id]=select;
        select.onchange=()=>{this.edited=true;this.error='';this.render(this.status);};label.append(select);header.append(label);
      }else header.append(el('small','Always collected',{class:'muted'}));
      section.append(header,el('p',row.description,{class:'muted'}),
        el('strong','',{id:'check-'+row.id+'-status'}),el('p','',{id:'check-'+row.id+'-detail'}));
      const diagnostic=el('details',null,{id:'check-'+row.id+'-technical',hidden:true});
      diagnostic.append(el('summary','Technical details'),el('p','',{id:'check-'+row.id+'-diagnostic'}));section.append(diagnostic);
      if(row.setup){const help=el('details'),summary=el('summary','Tool setup');
        help.append(summary,el('p','Tools are installed locally, offline. Show the setup command options:'),el('code',row.setup));
        section.append(help);}
      root.append(section);
    }
    const cycles=el('section',null,{class:'analysis-check'});
    cycles.append(el('h3','Dependency cycles and boundary rules'),
      el('p','Review evaluates the recorded map. Open Review for findings and policy; this does not start source analysis.',{class:'muted'}));
    root.append(cycles);
  }
  render(status=this.status,message=state.live?.message||''){
    this.status=status;
    if(!state.target)return;
    message=message||status?.error||'';
    const current=status?.targets.find(t=>t.id===state.target.id),ready=current?.ready||state.target;
    const rows=current?.checks?.length?current.checks:ready.checks||[];
    const displayed=state.target,enabled=Boolean(state.startup?.monitoring),summary=checksSummary(current,displayed,message);
    const awaiting=Boolean(current?.ready&&liveGeneration(current.ready)!==liveGeneration(displayed));
    const blocked=awaiting?liveBlockReason():'';
    const button=$('toggle-analysis');button.textContent=awaiting&&!summary.busy?'Checks: waiting':summary.label;
    button.title=[summary.description,blocked&&`Update waiting: ${blocked}`].filter(Boolean).join('. ');
    button.setAttribute('aria-label','Checks. '+button.title);button.setAttribute('data-attention',String(summary.attention));
    const key=JSON.stringify([ready.id,ready.run,current?.revision||0,current?.requested?.checks]);
    if(this.target!==ready.id){this.target=ready.id;this.requestId=(this.requestId||0)+1;
      this.edited=false;this.saving=false;this.formKey=null;this.error='';}
    if(!this.edited&&!this.saving&&key!==this.formKey){this.build(rows,current);this.formKey=key;
      this.base={run:ready.run,revision:current?.revision||0};}
    const busy=summary.busy,progress=current?.progress;
    let explanation=!enabled?'Saved-only view. Open the viewer normally to enable background checks.':
      current?.state==='stopping'?'Stopping owned work. The previous map and saved settings remain available.':
      current?.state==='paused'?'Checks paused for this session. Showing previous results.':
      current?.error?'The attempt failed. Showing the previous map; saved settings were retained.':
      busy?'Checks run locally in the background. You can keep exploring the previous map.':
      'Recorded results are available below. Completed checks do not certify the whole architecture.';
    if(current?.requested)explanation+=' Check choices are pending; they are saved only with a validated update.';
    if(blocked)explanation+=` Update waiting: ${blocked}.`;
    explanation+=' Coverage below belongs to the displayed map.';
    $('analysis-status').textContent=explanation;
    $('analysis-ready').hidden=!awaiting;
    const readyRows=ready.checks||[];
    $('analysis-ready').textContent=awaiting?(readyRows.length?
      `New results ready: ${readyRows.filter(r=>r.status==='completed').length} of ${readyRows.length} checks recorded. Not displayed yet.`:
      'New results are ready. Not displayed yet.') :'';
    $('analysis-error').hidden=!this.error&&!current?.error&&!current?.degraded&&!message;
    $('analysis-error').textContent=[this.error,current?.error,current?.degraded&&`Monitoring degraded: ${current.degraded}`,message].filter(Boolean).join('. ');
    $('analysis-progress').hidden=!progress||!busy;
    $('analysis-progress').textContent=progress?[progress.label,
      Number.isInteger(progress.completed)?`${progress.completed}/${progress.total} units`:'',
      progress.seconds!==undefined?`${Math.round(progress.seconds)} s elapsed`:'',progress.detail].filter(Boolean).join(' / '):'';
    for(const row of rows){
      const cell=$('check-'+row.id+'-status'),detail=$('check-'+row.id+'-detail');if(!cell||!detail)continue;
      const labels={completed:'Recorded',disabled:'Off',unavailable:'Needs setup / prerequisite',failed:'Failed',
        incomplete:'Not recorded',pending:'Queued'};
      const evidence=displayed.checks?.find(item=>item.id===row.id)||{status:'incomplete',detail:'Not recorded in the displayed map.'};
      const next=awaiting&&readyRows.find(item=>item.id===row.id);
      cell.textContent=(labels[evidence.status]||evidence.status)+' in displayed map';
      detail.textContent=[evidence.detail,busy&&progress?.phase===row.id?'Current attempt: running.':
        row.status!==evidence.status&&row.status!=='completed'?`Current attempt: ${labels[row.status]||row.status}. ${row.status==='disabled'?'':row.detail}`:'',
        next&&next.status!==evidence.status?`Update ready: ${labels[next.status]||next.status}; not displayed yet.`:''].filter(Boolean).join(' ');
      const diagnostic=!['completed','disabled'].includes(row.status)?row:evidence;
      $('check-'+row.id+'-technical').hidden=['completed','disabled'].includes(diagnostic.status);
      $('check-'+row.id+'-diagnostic').textContent=[diagnostic.code,diagnostic.diagnostic].filter(Boolean).join(': ');
      cell.setAttribute('data-status',evidence.status);
    }
    for(const select of Object.values(this.choices||{}))select.disabled=this.saving;
    $('analysis-run').textContent=this.edited?'Apply and run':'Run checks';
    $('analysis-run').disabled=!enabled||this.saving||current?.state==='stopping';
    $('analysis-stop').hidden=!current?.active||!busy;
    $('analysis-stop').textContent=current?.state==='updating'?'Stop checks':'Skip for now';
    $('analysis-stop').disabled=this.saving||current?.state==='stopping';
    $('analysis-auto').checked=Boolean(current?.active);$('analysis-auto').disabled=!enabled||this.saving||this.edited;
    $('analysis-discard').hidden=!this.edited;$('analysis-retry').hidden=!current?.error||!current?.active;
    $('analysis-recommended').disabled=!enabled||this.saving;
    if(current&&!this.dismissed.has(ready.id)&&!this.opened?.has(ready.id)){
      (this.opened||=new Set()).add(ready.id);
      if(summary.attention&&current.active)this.panel(true);
    }
  }
  async request(body){
    const target=state.target.id,request=this.requestId=(this.requestId||0)+1;
    const current=()=>state.target.id===target&&this.requestId===request;
    this.saving=true;this.error='';this.render(this.status);
    try{
      const status=await state.live.request(body);if(!current())return;
      if(body.action==='checks')this.edited=false;this.formKey=null;this.status=status;
      state.live.status=status;state.live.failed=null;state.live.message='';
    }catch(error){if(current())this.error=error.message;}
    finally{if(current()){this.saving=false;this.render(this.status);}}
  }
  async run(){
    const checks=Object.fromEntries(Object.entries(this.choices||{}).map(([key,select])=>[key,select.value]));
    await this.request({action:'checks',target:state.target.id,run:this.base.run,revision:this.base.revision,checks});
  }
  async control(action){await this.request({action,target:state.target.id});}
}

if(typeof module!=='undefined')module.exports={checksSummary,AnalysisControls};
