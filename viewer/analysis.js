// SPDX-License-Identifier: AGPL-3.0-or-later
// Acquisition controls project Monitor state; they do not execute checks or evaluate Review policy.
'use strict';

const CHECK_LABELS={completed:'Recorded',disabled:'Off',unavailable:'Unavailable',incomplete:'Not recorded',pending:'Queued',failed:'Failed'};
const CHECK_MODES={auto:'Auto',on:'On (required)',off:'Off'};

function checkElapsedTime(value){
  if(!Number.isFinite(value)||value<0)return '';
  const seconds=Math.round(value),minutes=Math.floor(seconds/60);
  return `${minutes?`${minutes} min `:''}${seconds%60} s elapsed`;
}

function checksSummary(current,target,message='') {
  const rows=target?.checks||[];
  const outcomes=Object.values(target?.acquisition||{});
  const failed=rows.some(r=>r.status==='failed')||current?.checks?.some(r=>r.status==='failed')||
    outcomes.some(r=>r.status==='failed')||Boolean(current?.error||message);
  const busy=current?.active&&!['fresh','failed','retry required','saved','paused'].includes(current.state);
  const counts={completed:0,disabled:0,unavailable:0,incomplete:0,pending:0,failed:0};
  for(const row of rows)counts[Object.hasOwn(counts,row.status)?row.status:'incomplete']++;
  const done=counts.completed;
  const missing=rows.some(r=>!['completed','disabled'].includes(r.status))||outcomes.some(r=>['incomplete','unavailable'].includes(r.status));
  let phase = '';
  if (current?.state === 'stopping') phase = 'Stopping';
  else if (busy) phase = 'Running';
  else if (failed) phase = 'Failed';
  else if (current?.degraded) phase = 'Monitoring degraded';
  else if (current?.state === 'paused') phase = 'Paused';
  const breakdown=[[counts.disabled,'off'],[counts.unavailable,'unavailable'],
    [counts.incomplete,'incomplete'],[counts.pending,'queued'],[counts.failed,'failed']]
    .filter(([count])=>count).map(([count,label])=>`${count} ${label}`);
  const coverage=rows.length?[`${done} recorded`,...breakdown].join(' / '):'Coverage unavailable';
  return {coverage,phase,counts,guidance:rows.length>0&&done<rows.length,
    attention:failed||missing||Boolean(current?.degraded),done,total:rows.length,busy,
    description:[rows.length?`Displayed map: ${done} of ${rows.length} checks recorded`:'Displayed map: check coverage unavailable',
      ...rows.filter(r=>r.status!=='completed')
      .map(r=>`${r.label}: ${r.status}`),...outcomes.filter(r=>r.status!=='completed').map(r=>`${r.status}: ${r.code}`),
      current?.error,current?.degraded,message].filter(Boolean).join('. ')};
}

function inputChangeSummary(current,target) {
  const value=current?.comparison;
  if(!value?.baseline||value.baseline!==target?.run)return {available:false,label:'Changes: not checked',
    detail:value?.baseline?'Comparison awaits the newer map. Finish pending edits or map gestures to adopt it.':
      value?.reason||'Input comparison is not available. Recorded architecture remains available.'};
  if(!Object.values(value.scope||{}).some(item=>item.status==='compared'))return {available:false,label:'Changes: not available',
    detail:'No recorded input domains can be compared with the current scope. Recorded architecture remains available.'};
  const states={paused:'paused',checking:'checking',unavailable:'unavailable',degraded:'degraded'};
  const last=states[value.status],count=value.total;
  const scopes=Object.values(value.scope||{}).filter(item=>item.status!=='compared');
  const label=last?`Changes: ${last}`:count?`${count} input changes detected`:
    value.context==='changed'?'Monitored context changed':scopes.length||value.context==='unknown'?
      'Changes: limited scope':'Compared inputs unchanged';
  const names={'not-monitored':'not monitored','not-recorded':'not recorded','scope-changed':'scope changed',unavailable:'unavailable'};
  const detail=[last?'Last observation only; this is not a current freshness claim.':'Compared with the displayed recorded analysis.',
    value.context==='unknown'?'Monitoring-context baseline unavailable.':
      value.context==='changed'?'Monitored inputs or settings differ.':'',
    ...scopes.map(item=>`${item.label||'C++ source content'}: ${names[item.status]||item.status}.`),
    !value.complete?'Path detail is limited; counts include all detected comparable changes.':'',value.reason].filter(Boolean).join(' ');
  return {available:true,label,detail};
}

class AnalysisControls {
  constructor(){
    this.handled=new Set();this.edited=false;this.saving=false;this.formKey=null;
    $('toggle-analysis').onclick=()=>this.panel();
    $('analysis-close').onclick=()=>this.panel(false);
    $('analysis-run').onclick=()=>this.run();
    $('analysis-stop').onclick=()=>this.control('pause');
    $('analysis-recommended').onclick=()=>{if(this.recommended){
      for(const select of $('analysis-checks').querySelectorAll('select'))select.value='auto';this.edited=true;}
      this.run();};
    $('analysis-explore').onclick=()=>{this.panel(false);$('graph').focus({preventScroll:true});};
    $('analysis-discard').onclick=()=>{this.edited=false;this.formKey=null;this.error='';this.render(this.status);};
    $('analysis-auto').onchange=()=>this.control($('analysis-auto').checked?'activate':'pause');
    $('analysis-retry').onclick=()=>this.control('retry');
    $('input-change-status').onclick=()=>{
      this.panel(true);
      const section=$('analysis-changes');
      (section.hidden?$('analysis-current'):section).scrollIntoView({block:'nearest'});
    };
    $('input-change-show').onclick=()=>{
      if(this.pathsOpen){this.cancelPaths();this.pathsOpen=false;this.renderChanges(this.changeCurrent);}
      else {this.pathsOpen=true;this.renderChanges(this.changeCurrent);}
    };
    $('input-change-previous').onclick=()=>this.loadPaths(Math.max(0,(this.pathPage?.cursor||0)-50));
    $('input-change-next').onclick=()=>{if(this.pathPage?.next!==null)this.loadPaths(this.pathPage.next);};
    const repositionHelp=()=>this.positionCheckHelp();
    $('analysis').addEventListener('scroll',repositionHelp,{passive:true});
    window.addEventListener('scroll',repositionHelp,{passive:true});
    window.addEventListener('resize',repositionHelp);
  }
  dirty(){return this.edited||this.saving;}
  guideKey(){return state.target?.id?'analysis-guide:'+JSON.stringify([state.target.id,
    state.target.roots?.project||state.target.project||'']):null;}
  guideHandled(){
    const key=this.guideKey(),handled=this.handled||=new Set();
    if(key&&recall(key)==='1')handled.add(key);
    return !key||handled.has(key);
  }
  markHandled(){
    const key=this.guideKey();if(document.hidden||!key||this.guideHandled())return;
    this.handled.add(key);remember(key,'1');
  }
  guideBlocked(){
    return Boolean(document.hidden||['graph','map-tooltip'].some(id=>document.activeElement===$(id))||liveBlockReason()||
      ['review','details',...mapPanels].some(id=>!$(id).hidden)||
      ['view-controls','type-key','coverage-details'].some(id=>$(id).open)||
      document.activeElement?.closest?.('input,select,textarea,button,a,summary,[contenteditable="true"]'));
  }
  panel(open=$('analysis').hidden,{guidance=false}={}){
    const shown=!$('analysis').hidden;
    $('analysis').hidden=!open;$('toggle-analysis').setAttribute('aria-expanded',String(open));
    $('analysis-explore').hidden=!open||!guidance;
    if(open){state.review?.panel(false);closeMapPanels();
      if(innerWidth<=1000)togglePanel('details',false);
      if(this.hasGuide)this.markHandled();}
    else {this.dismissCheckHelp();this.cancelPaths();if(shown)this.markHandled();
      if($('analysis').contains(document.activeElement))$('toggle-analysis').focus();}
    if(open&&this.pathsOpen)this.renderChanges(this.changeCurrent);
  }
  dismissCheckHelp(){
    const popup=$('analysis-checks').querySelector('.check-help:popover-open');
    if(!popup)return false;
    popup.hidePopover();
    return true;
  }
  positionCheckHelp(popup=$('analysis-checks').querySelector('.check-help:popover-open')){
    if(!popup)return;
    const anchor=popup.parentElement.querySelector('.check-help-toggle').getBoundingClientRect();
    const panel=$('analysis').getBoundingClientRect();
    const height=document.documentElement.clientHeight,width=document.documentElement.clientWidth;
    if(anchor.bottom<=Math.max(panel.top,0)||anchor.top>=Math.min(panel.bottom,height)){
      popup.hidePopover();
      return;
    }
    const edge=10,gap=6,below=height-anchor.bottom-gap-edge,above=anchor.top-gap-edge;
    const placeBelow=below>=popup.scrollHeight+2||below>=above;
    const left=Math.max(edge,Math.min(anchor.left,width-popup.offsetWidth-edge));
    Object.assign(popup.style,{
      left:left+'px',top:placeBelow?anchor.bottom+gap+'px':'auto',
      bottom:placeBelow?'auto':height-anchor.top+gap+'px',
      maxHeight:Math.max(0,placeBelow?below:above)+'px'
    });
  }
  renderCurrent(current,summary,awaiting,blocked,enabled){
    const busy=summary.busy,stopping=current?.state==='stopping',progress=busy&&!this.saving?current?.progress:null;
    const earlier=busy&&!this.saving&&!progress?current?.previous_work:null;
    const choices=Object.values(this.choices||{}),optional=(state.target.checks||[]).filter(row=>row.optional);
    this.recommended=choices.some(select=>select.value==='off')||(!choices.length&&summary.counts.disabled>0);
    const off=optional.length&&optional.every(row=>row.status==='disabled');
    const checkRows=current?.checks||state.target.checks||[];
    const concern=['failed','unavailable','incomplete'].map(status=>checkRows.find(row=>row.status===status)).find(Boolean);
    const waiting={'waiting for external build':'Waiting for project build','waiting for writer':'Waiting for another analysis',
      'waiting for read index':'Preparing map access'}[current?.state];
    const title=this.saving?'Sending check request':stopping?'Stopping checks':busy?
      earlier?'Recheck queued':waiting||progress?.label||(current?.state==='pending'?'Checks queued':'Preparing checks'):
      current?.error||this.error||concern?.status==='failed'?'Checks need attention':awaiting?'Results ready to display':
      concern?.status==='unavailable'?'Checks need setup':
      current?.state==='paused'?'Checks paused':!summary.total?'Check coverage unavailable':
      off?'Source checks are off':summary.guidance?'Some checks need attention':'Recorded checks are ready';
    $('analysis-current-title').textContent=title;
    $('analysis-current').setAttribute('data-state',busy?'running':current?.error||this.error||concern?.status==='failed'?'failed':'idle');
    $('analysis-error').setAttribute('role',waiting&&busy?'status':'alert');
    $('analysis-error').setAttribute('data-waiting',String(Boolean(waiting&&busy)));
    const running=Boolean(busy||stopping||this.saving);
    $('analysis-current-title').hidden=!(running||awaiting||this.error||summary.attention||!summary.total||
      enabled&&(summary.guidance||current?.state==='paused'));
    const determinate=progress?.phase==='native'&&Number.isSafeInteger(progress.completed)&&
      Number.isSafeInteger(progress.total)&&progress.total>0&&progress.total<=1000000&&progress.completed>=0&&progress.completed<=progress.total;
    for(const id of ['analysis-meter','checks-meter']){const meter=$(id);meter.hidden=!running;
      meter.setAttribute('aria-label',title);meter.setAttribute('max',String(determinate?progress.total:1));
      if(determinate)meter.setAttribute('value',String(progress.completed));else meter.removeAttribute('value');}
    $('analysis-progress').hidden=!running;
    $('analysis-progress').textContent=progress?[determinate?`${progress.completed}/${progress.total} units`:'',
      checkElapsedTime(progress.seconds),progress.detail].filter(Boolean).join(' / '):
      this.saving?'Waiting for the request to be accepted.':earlier&&Number.isFinite(earlier.seconds)?
        `Earlier work: ${checkElapsedTime(earlier.seconds)}`:running?'Waiting for phase progress.':'';
    const activity=running?title:awaiting&&!current?.error?'Results ready':summary.phase;
    $('checks-activity').textContent=activity;
    $('checks-activity').hidden=!activity;
    const button=$('toggle-analysis');
    button.setAttribute('data-phase',activity);
    button.title=[summary.description,activity,running&&$('analysis-progress').textContent,
      blocked&&`Update waiting: ${blocked}`].filter(Boolean).join('. ');
    button.setAttribute('aria-label','Checks. '+button.title);
    let explanation=!enabled?'Saved view. Open in live mode to run checks and compare inputs.':
      stopping?'Stopping owned work. The previous map and saved settings remain available.':
      current?.state==='paused'?'Checks paused for this session. Showing previous results.':
      waiting?current.state==='waiting for external build'?'Another project build is running. Checks will retry automatically.':
        'Checks are waiting for shared resources. The current map remains available.':
      current?.error?'The attempt failed. Showing the previous map; saved settings were retained.':
      earlier?'Earlier checks are still running. The current map remains available.':
      busy?'Keep exploring the displayed map while checks run.':concern?`${concern.label}: ${concern.detail||'Expand this check for details.'}`:'';
    if(current?.requested)explanation+=' Check choices are pending; they are saved only with a validated update.';
    if(blocked)explanation+=` Update waiting: ${blocked}.`;
    $('analysis-status').hidden=!explanation;$('analysis-status').textContent=explanation;
    const canRecheck=enabled&&summary.total>0&&!running&&!(current?.error&&current?.active);
    const showRecommended=Boolean(canRecheck&&this.recommended&&!this.edited);
    $('analysis-recommendation').hidden=!showRecommended;
    $('analysis-recommendation').textContent='Sets optional checks to Auto using installed tools and existing build results.';
    $('analysis-recommended').textContent=this.recommended?'Run recommended checks':'Recheck enabled checks';
    $('analysis-recommended').hidden=!canRecheck||this.edited;
    $('analysis-recommended').disabled=!canRecheck||this.edited;
    $('analysis-run').hidden=!enabled||!(this.edited||canRecheck&&this.recommended);
    $('analysis-run').textContent=this.edited?'Apply and run':'Recheck enabled checks';
    $('analysis-run').disabled=!enabled||!summary.total||this.saving||stopping;
  }
  build(rows){
    const root=$('analysis-checks');root.replaceChildren();this.choices={};
    for(const row of rows){
      const section=el('details',null,{class:'check-disclosure','data-check':row.id});
      const summary=el('summary'),line=el('span',null,{class:'check-line'});
      line.append(el('span',row.label),el('strong',null,{id:'check-'+row.id+'-status',class:'check-coverage'}));
      summary.append(line);
      const body=el('div',null,{class:'check-body'});
      const descriptionRegion=el('div');
      const description=el('p',row.description,{class:'muted'});
      descriptionRegion.append(description);body.append(descriptionRegion);
      if(row.help?.why&&row.help?.method){
        const explanation=el('div',null,{id:'check-'+row.id+'-help',class:'check-help',popover:'auto'});
        const toggle=el('button','?',{type:'button',class:'check-help-toggle','aria-label':'About '+row.label,
          'aria-controls':explanation.id,'aria-expanded':'false'});
        let dismissTimer;
        const isOpen=()=>explanation.matches(':popover-open');
        const show=open=>{
          clearTimeout(dismissTimer);
          if(open===isOpen())return;
          if(open){
            explanation.showPopover({source:toggle});
            this.positionCheckHelp(explanation);
          }else explanation.hidePopover();
        };
        explanation.onbeforetoggle=event=>toggle.setAttribute('aria-expanded',String(event.newState==='open'));
        toggle.onpointerenter=event=>{if(event.pointerType!=='touch')show(true);};
        descriptionRegion.onpointerenter=()=>clearTimeout(dismissTimer);
        descriptionRegion.onpointerleave=event=>{
          if(event.pointerType!=='touch')dismissTimer=setTimeout(()=>{
            if(document.activeElement!==toggle)show(false);
          },150);
        };
        toggle.onfocus=()=>{if(toggle.matches(':focus-visible'))show(true);};
        toggle.onblur=()=>{if(!descriptionRegion.matches(':hover'))show(false);};
        toggle.onclick=event=>show(event.pointerType==='touch'||!isOpen());
        section.ontoggle=()=>{if(!section.open)show(false);};
        for(const [label,text] of [['Why it matters',row.help.why],['How it is checked',row.help.method]]){
          const paragraph=el('p');paragraph.append(el('strong',label),' '+text);explanation.append(paragraph);
        }
        description.append(' ',toggle);
        descriptionRegion.append(explanation);
      }
      if(row.optional){
        const label=el('label','Mode ',{id:'check-'+row.id+'-mode-control',class:'check-mode'});
        const select=el('select',null,{name:'check-'+row.id,'aria-label':row.label+' mode'});
        for(const [value,text] of Object.entries(CHECK_MODES))select.append(el('option',text,{value}));
        this.choices[row.id]=select;
        select.onchange=()=>{this.edited=true;this.error='';this.render(this.status);};
        label.append(select);
        body.append(label,el('p',null,{id:'check-'+row.id+'-saved-mode',hidden:true}));
      }
      body.append(el('p',null,{id:'check-'+row.id+'-detail',class:'check-observation'}));
      const diagnostic=el('details',null,{id:'check-'+row.id+'-technical',hidden:true});
      diagnostic.append(el('summary','Technical details'),el('p','',{id:'check-'+row.id+'-diagnostic'}));
      body.append(diagnostic);
      if(row.setup){
        const help=el('details',null,{id:'check-'+row.id+'-setup',hidden:true});
        help.append(el('summary','Tool setup'),el('code',row.setup));
        body.append(help);
      }
      section.append(summary,body);
      root.append(section);
    }
  }
  render(status=this.status,message=state.live?.message||''){
    this.status=status;
    if(!state.target)return;
    message=message||status?.error||'';
    const current=status?.targets.find(t=>t.id===state.target.id),ready=current?.ready||state.target;
    const displayed=state.target,enabled=Boolean(state.startup?.monitoring),summary=checksSummary(current,displayed,message);
    const reported=current?.checks?.length?current.checks:ready.checks||[];
    const rows=[...new Map([...(displayed.checks||[]),...reported].map(row=>[row.id,row])).values()];
    const awaiting=Boolean(current?.ready&&liveGeneration(current.ready)!==liveGeneration(displayed));
    const blocked=awaiting?liveBlockReason():'';
    $('checks-coverage').textContent=summary.coverage;
    this.hasGuide=summary.total>0;$('analysis-overview').hidden=!rows.length;
    const catalog=JSON.stringify([displayed.id,rows.map(({id,label,optional,description,setup,help})=>
      [id,label,optional,description,setup,help?.why,help?.method])]);
    const key=JSON.stringify([liveGeneration(ready),current?.revision||0,current?.requested?.checks]);
    if(this.target!==ready.id){this.target=ready.id;this.requestId=(this.requestId||0)+1;
      this.edited=false;this.saving=false;this.formKey=null;this.error='';}
    this.renderChanges(current);
    if(!this.edited&&!this.saving){
      if(catalog!==this.catalog){this.build(rows);this.catalog=catalog;this.formKey=null;}
      if(key!==this.formKey){
        for(const row of rows){
          const select=this.choices[row.id];
          if(select)select.value=current?.requested?.checks?.[row.id]||row.mode||'off';
        }
        this.formKey=key;this.base={run:ready.run,revision:current?.revision||0};
      }
    }
    const busy=summary.busy,progress=current?.progress;
    this.renderCurrent(current,summary,awaiting,blocked,enabled);
    $('analysis-ready').hidden=!awaiting;
    const readyRows=ready.checks||[];
    $('analysis-ready').textContent=awaiting?(readyRows.length?
      `New results ready: ${readyRows.filter(r=>r.status==='completed').length} of ${readyRows.length} checks recorded. Not displayed yet.`:
      'New results are ready. Not displayed yet.') :'';
    $('analysis-error').hidden=!this.error&&!current?.error&&!current?.degraded&&!message;
    $('analysis-error').textContent=[this.error,current?.error,current?.degraded&&`Monitoring degraded: ${current.degraded}`,message].filter(Boolean).join('. ');
    for(const row of rows){
      const cell=$('check-'+row.id+'-status'),detail=$('check-'+row.id+'-detail');if(!cell||!detail)continue;
      const evidence=displayed.checks?.find(item=>item.id===row.id)||{status:'incomplete',detail:'Not recorded in the displayed map.'};
      const next=awaiting&&readyRows.find(item=>item.id===row.id);
      const label=CHECK_LABELS[evidence.status]||'Not recorded';
      if(cell.textContent!==label)cell.textContent=label;
      detail.textContent=[evidence.status!=='completed'&&evidence.status!=='disabled'?evidence.detail:'',
        busy&&progress?.phase===row.id?'Current attempt: running.':row.status!==evidence.status&&row.status!=='completed'?
          `Current attempt: ${CHECK_LABELS[row.status]||row.status}. ${row.status==='disabled'?'':row.detail}`:'',
        next&&next.status!==evidence.status?`Update ready: ${CHECK_LABELS[next.status]||next.status}; not displayed yet.`:''].filter(Boolean).join(' ');
      const diagnostic=!['completed','disabled'].includes(row.status)?row:evidence;
      const diagnosticText=[diagnostic.code,diagnostic.diagnostic].filter(Boolean).join(': ');
      $('check-'+row.id+'-technical').hidden=!diagnosticText||['completed','disabled'].includes(diagnostic.status);
      $('check-'+row.id+'-diagnostic').textContent=diagnosticText;
      if(cell.getAttribute('data-status')!==evidence.status)cell.setAttribute('data-status',evidence.status);
      const setup=$('check-'+row.id+'-setup');
      if(setup)setup.hidden=evidence.status==='completed'&&diagnostic.status==='completed';
      if(row.optional){
        $('check-'+row.id+'-mode-control').hidden=!enabled;
        const savedMode=$('check-'+row.id+'-saved-mode'),mode=CHECK_MODES[evidence.mode];
        savedMode.hidden=enabled||!mode;savedMode.textContent=mode?'Mode: '+mode:'';
      }
    }
    for(const select of Object.values(this.choices||{}))select.disabled=!enabled||this.saving;
    $('analysis-settings').hidden=!enabled;
    $('analysis-stop').hidden=!enabled||!current?.active||!busy;
    $('analysis-stop').textContent=current?.state==='updating'||current?.previous_work?'Stop checks':'Skip for now';
    $('analysis-stop').disabled=this.saving||current?.state==='stopping';
    $('analysis-auto').checked=Boolean(current?.active);$('analysis-auto').disabled=!enabled||this.saving||this.edited;
    $('analysis-discard').hidden=!enabled||!this.edited;
    $('analysis-retry').hidden=!enabled||!current?.error||!current?.active||Boolean(busy);
    $('analysis-retry').disabled=this.saving;
    if(!$('analysis').hidden&&this.hasGuide)this.markHandled();
    if(enabled&&current&&this.hasGuide&&(summary.guidance||summary.attention)&&!this.guideHandled()&&!this.guideBlocked())
      this.panel(true,{guidance:true});
  }
  cancelPaths(){this.pathRequest=(this.pathRequest||0)+1;this.pathController?.abort();this.pathLoading=false;}
  renderChanges(current){
    this.changeCurrent=current;
    const value=current?.comparison,summary=inputChangeSummary(current,state.target);
    const key=JSON.stringify([state.target.id,state.target.run,summary.available?value.observation:null]);
    if(this.changeKey!==key){this.cancelPaths();this.changeKey=key;this.pathPage=null;this.pathError='';}
    const indicator=$('input-change-status');indicator.textContent=summary.label;
    indicator.title=summary.label+'. '+summary.detail;indicator.setAttribute('aria-label',indicator.title+' Open Checks.');
    $('analysis-changes').hidden=!state.startup?.monitoring&&!value;
    $('input-change-summary').textContent=summary.label;
    $('input-change-detail').textContent=[summary.detail,summary.available&&value.observed_at?
      'Observed '+new Date(value.observed_at*1000).toLocaleString()+'.':''].filter(Boolean).join(' ');
    const scopes=$('input-change-scope');scopes.replaceChildren();
    if(summary.available){
      for(const [category,count] of Object.entries(value.counts||{}))scopes.append(el('p',`${category}: ${count.toLocaleString()}`));
      if(!value.complete)scopes.append(el('p',`${value.available||0} of ${value.total.toLocaleString()} changed paths available.`));
    }
    $('input-change-guidance').textContent=summary.available?(value.guidance||[]).join(' '):'';
    const limits=summary.available?(value.limits||[]).join(' '):'';
    $('input-change-comparison-limits').hidden=!limits;
    $('input-change-limits').textContent=limits;
    $('input-change-show').hidden=!summary.available||!value.available;
    $('input-change-show').textContent=this.pathsOpen?'Hide paths':'Show paths';
    $('input-change-paths').hidden=!summary.available||!value.available||!this.pathsOpen;
    if(summary.available&&value.available&&this.pathsOpen&&!this.pathPage&&!this.pathLoading&&!this.pathError&&!$('analysis').hidden)this.loadPaths(0);
    this.renderPaths();renderBanner();
  }
  renderPaths(){
    const key=JSON.stringify([this.changeKey,this.pathPage,this.pathLoading,this.pathError]);
    if(this.pathRenderKey===key)return;this.pathRenderKey=key;
    const root=$('input-change-list'),page=this.pathPage;root.replaceChildren();
    $('input-change-page-status').textContent=this.pathError|| (this.pathLoading?'Loading paths...':page?
      `${page.cursor+1}-${page.cursor+page.items.length} of ${page.available} available paths. Links open the file at its start.`:'');
    for(const item of page?.items||[]){
      const row=el('li'),link=item.source&&sourceLink({...item.source,line:1});
      row.append(link||el('span',item.path));if(link)link.textContent=item.path;
      row.append(el('small',`${item.change} / ${item.category}`));root.append(row);
    }
    $('input-change-previous').disabled=this.pathLoading||!page||page.cursor===0;
    $('input-change-next').disabled=this.pathLoading||!page||page.next===null;
  }
  async loadPaths(cursor){
    const value=this.changeCurrent?.comparison,summary=inputChangeSummary(this.changeCurrent,state.target);
    if(!summary.available||!this.pathsOpen||$('analysis').hidden)return;
    this.cancelPaths();const request=this.pathRequest,key=this.changeKey,target=state.target.id,run=state.target.run;
    this.pathController=new AbortController();this.pathLoading=true;this.pathError='';this.renderPaths();
    const current=()=>request===this.pathRequest&&key===this.changeKey&&state.target.id===target&&state.target.run===run&&!$('analysis').hidden;
    const params=new URLSearchParams({target,run,observation:value.observation,cursor,limit:50});
    try{
      const response=await fetch('/monitor/changes?'+params,{cache:'no-store',signal:this.pathController.signal});
      if(!response.ok)throw Error(response.status===409?'The observation changed. Wait for Checks to refresh, then show paths again.':
        'Could not load paths. Hide and show paths to retry.');
      const page=await response.json();if(!current())return;
      if(page.observation!==value.observation||page.baseline!==state.target.run)throw Error('Path page belongs to another observation.');
      this.pathPage=page;
    }catch(error){if(current()&&error.name!=='AbortError')this.pathError=error.message;}
    finally{if(current()){this.pathLoading=false;this.renderPaths();}}
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

if(typeof module!=='undefined')module.exports={checksSummary,inputChangeSummary,AnalysisControls};
