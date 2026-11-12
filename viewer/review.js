// SPDX-License-Identifier: AGPL-3.0-or-later
// Findings decorate the current frontier; report data never participates in graph or camera ownership.
'use strict';

function ReviewProjection(affected,map,view) {
  const visible=new Set(view.nodes.map(n=>n.id)),badges=new Map();
  for(const [subject,findings] of Object.entries(affected||{})) {
    let id=subject;
    while(id&&!visible.has(id))id=map.nodes.get(id)?.parent;
    if(!id)continue;
    if(!badges.has(id))badges.set(id,{ids:new Set(),subjects:[],severity:'candidate',acknowledged:true});
    const badge=badges.get(id);badge.subjects.push(subject);
    for(const finding of findings) {
      badge.ids.add(finding.id);
      if(finding.severity==='violation')badge.severity='violation';
      if(!finding.acknowledged)badge.acknowledged=false;
    }
  }
  for(const badge of badges.values()){badge.count=badge.ids.size;badge.subjects.sort();}
  return badges;
}

class ArchitectureReview {
  constructor() {
    this.enabled=false;this.ack=false;this.epoch=0;this.requests=new Set();this.pages=new Map();this.badges=new Map();
    $('toggle-review').onclick=()=>this.toggle();
    $('review-close').onclick=()=>this.toggle(false);
    $('review-ack').onchange=()=>{this.ack=$('review-ack').checked;this.pages.clear();this.load();};
    $('review-recheck').onclick=()=>this.recheck();
  }
  reset(target) {
    this.epoch++;for(const controller of this.requests)controller.abort();this.requests.clear();this.pages.clear();
    this.target=target;this.data=null;this.badges.clear();this.enabled=false;this.pendingFinding=null;
    $('review').hidden=true;$('toggle-review').setAttribute('aria-pressed','false');
    $('toggle-review').disabled=!target?.review_url;
  }
  toggle(open=!this.enabled) {
    this.enabled=open;$('review').hidden=!open;$('toggle-review').setAttribute('aria-pressed',String(open));
    if(open){togglePanel('filters',false);this.load();}
    else {this.epoch++;for(const c of this.requests)c.abort();this.requests.clear();this.project();readableLabels();
      this.refreshInspection();$('toggle-review').focus();}
  }
  async request(query={},body=null) {
    const epoch=this.epoch,controller=new AbortController();this.requests.add(controller);
    try {
      const params=new URLSearchParams({...query,ack:String(this.ack)});
      const response=await fetch(this.target.review_url+(body?'':'?'+params),{cache:'no-store',signal:controller.signal,
        ...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
      const text=await response.text();
      if(epoch!==this.epoch||controller.signal.aborted)throw new DOMException('Review cancelled','AbortError');
      if(!response.ok)throw Error(`Review: ${text.trim()}. Use Recheck to reload.`);
      const data=JSON.parse(text);
      if(!body) {
        if(!Array.isArray(data.items)||data.items.length>100||typeof data.report!=='string'||
          !Number.isSafeInteger(data.revision)||!Number.isSafeInteger(data.total)||data.total<0||
          !data.counts||!data.affected||!Array.isArray(data.checks)||
          data.next_cursor!==null&&(!Number.isSafeInteger(data.next_cursor)||data.next_cursor<=Number(query.cursor||0)))throw Error('Invalid review page');
        for(const f of data.items)if(!['violation','candidate'].includes(f.severity)||!Array.isArray(f.subjects)||
          !Array.isArray(f.witnesses)||f.witnesses.length>8||typeof f.id!=='string')throw Error('Invalid review finding');
      }
      return data;
    } finally {this.requests.delete(controller);}
  }
  async load(cursor=0) {
    if(!this.enabled||!this.target?.review_url)return;
    const epoch=this.epoch,sequence=(this.loadSequence||0)+1;this.loadSequence=sequence;
    $('review-status').textContent='Loading review...';$('review').setAttribute('aria-busy','true');
    try {
      const data=await this.request({cursor,...(cursor&&this.data?{report:this.data.report}:{})});
      if(epoch!==this.epoch||sequence!==this.loadSequence||!this.enabled)return;
      this.data=cursor?{...data,affected:this.data.affected}:data;
      this.project();this.renderList(data,cursor);readableLabels();
      this.refreshInspection();
    } catch(error) {if(epoch===this.epoch&&sequence===this.loadSequence&&error.name!=='AbortError') {
      $('review-status').textContent=error.message;this.data=null;this.pages.clear();this.project();readableLabels();
      for(const id of ['review-items','review-pager','review-checks'])$(id).replaceChildren();
      this.refreshInspection();}}
    finally {if(epoch===this.epoch&&sequence===this.loadSequence)$('review').setAttribute('aria-busy','false');}
  }
  async recheck() {
    this.epoch++;for(const c of this.requests)c.abort();this.pages.clear();this.data=null;this.project();readableLabels();
    for(const id of ['review-items','review-pager','review-checks'])$(id).replaceChildren();
    this.refreshInspection();
    $('review-status').textContent='Rechecking...';
    try {await this.request({}, {action:'recheck'});await this.load();}
    catch(error){if(error.name!=='AbortError')$('review-status').textContent=error.message;}
  }
  project() {
    if(!state.cy||!state.shard)return;
    const previous=this.badges;
    this.badges=this.enabled&&this.data?ReviewProjection(this.data.affected,state.universe,state.shard):new Map();
    for(const id of new Set([...previous.keys(),...this.badges.keys()])) {
      const node=state.cy.getElementById(id);if(!node.length)continue;
      const badge=this.badges.get(id),value=badge?`${badge.severity}:${badge.count}:${badge.acknowledged}`:'';
      if(!badge||node.data('reviewMark')!==value)node.data('reviewMark',value);
    }
    if(this.enabled)this.locations();
  }
  locations() {
    const visible=new Set();for(const badge of this.badges.values())for(const id of badge.ids)visible.add(id);
    for(const row of $('review-items').querySelectorAll('[data-review-location]')) {
      const text=row.dataset.caption+(visible.has(row.dataset.reviewLocation)?'':' / off-view');
      if(row.textContent!==text)row.textContent=text;
    }
  }
  renderList(data,cursor) {
    const counts=data.counts,context=data.context.target;
    $('review-status').textContent=`${counts.violation} active violations / ${counts.candidate} active candidates / ${counts.acknowledged} acknowledged`;
    $('review-context').textContent=[context.name,context.platform,context.configuration].filter(Boolean).join(' / ');
    $('review-policy').textContent=`Policy: ${data.policy_path}`;
    const checks=$('review-checks');checks.replaceChildren();
    for(const check of data.checks) {
      const item=el('li',`${check.id}: ${check.status}. ${check.detail||'Recorded scope only.'}`);
      for(const [role,ids] of Object.entries(check.matched||{})) {
        const matches=el('details');matches.append(el('summary',`${role}: ${ids.length} matched modules`),
          el('p',ids.slice(0,100).map(label).join(', ')+(ids.length>100?' (first 100 shown)':'')));item.append(matches);
      }
      checks.append(item);
    }
    const list=$('review-items');list.replaceChildren();
    if(!data.items.length)list.append(el('p','No active findings in recorded scope. Check analysis availability above.',{class:'muted'}));
    for(const finding of data.items) {
      const row=el('article',null,{class:'review-finding'}),button=el('button',this.subjects(finding),
        {type:'button','data-finding':finding.id,title:finding.title});
      button.onclick=()=>{this.pendingFinding=finding.id;state.detailsKey=null;
        const visible=[...this.badges].find(([,b])=>b.ids.has(finding.id));
        if(visible)selectNode(visible[0]);else flyToNode(finding.subjects[0]);};
      const caption=`${finding.severity==='violation'?'! Policy violation':'? Review candidate'} / ${finding.triage}`;
      row.append(button,el('small',finding.title),el('small',caption,
        {'data-review-location':finding.id,'data-caption':caption}));
      list.append(row);
    }
    this.locations();
    const pager=$('review-pager');pager.replaceChildren();
    for(const [title,next] of [['Previous',Math.max(0,cursor-50)],['Next',data.next_cursor]]) {
      const button=el('button',title,{type:'button','aria-label':title+' findings'});button.disabled=title==='Previous'?!cursor:next===null;
      button.onclick=()=>this.load(next);pager.append(button);
    }
  }
  subjects(finding) {
    return finding.subjects.slice(0,8).map(label).join(' -> ')+
      (finding.subjects.length>8?` / ${finding.subjects.length-8} more modules`:'');
  }
  refreshInspection() {
    const slot=document.querySelector('#details [data-review-slot]');
    if(!slot||slot.dataset.reviewSlot!==state.selection?.id)return;
    slot.replaceChildren();this.details(slot,state.selection);
  }
  details(panel,node) {
    if(!this.enabled||!this.data||!this.badges.has(node.id))return;
    const section=el('section',null,{class:'review-details','aria-label':'Architecture findings'});
    section.append(el('h3','Architecture findings'),el('p','Loading findings...',{role:'status'}));panel.append(section);
    const epoch=state.referenceEpoch,reviewEpoch=this.epoch,report=this.data.report;
    const query={node:node.id,report,...(this.pendingFinding?{finding:this.pendingFinding}:{})};this.pendingFinding=null;
    const key=JSON.stringify([query,this.ack,this.data.revision]);
    const loaded=this.pages.has(key)?Promise.resolve(this.pages.get(key).data):this.request(query);
    loaded.then(data=>{
      if(epoch!==state.referenceEpoch||reviewEpoch!==this.epoch||!section.isConnected||!this.enabled)return;
      const bytes=new TextEncoder().encode(JSON.stringify(data)).byteLength;
      if(bytes<=8*1024*1024) {
        this.pages.delete(key);this.pages.set(key,{data,bytes});
        while(this.pages.size>8||[...this.pages.values()].reduce((sum,p)=>sum+p.bytes,0)>8*1024*1024)
          this.pages.delete(this.pages.keys().next().value);
      }
      section.replaceChildren(el('h3','Architecture findings'));
      const append=page=>{
        for(const finding of page.items)this.card(section,finding,page.revision,page.report);
        if(page.next_cursor!==null) {
          const more=el('button','More findings',{type:'button'});section.append(more);
          more.onclick=async()=>{more.disabled=true;try{const next=await this.request({...query,cursor:page.next_cursor});
            if(epoch!==state.referenceEpoch||reviewEpoch!==this.epoch||!more.isConnected)return;
            more.remove();append(next);}catch(error){if(error.name!=='AbortError'){more.disabled=false;more.textContent=error.message;}}};
        }
      };append(data);
    }).catch(error=>{if(epoch===state.referenceEpoch&&reviewEpoch===this.epoch&&section.isConnected&&error.name!=='AbortError')
      section.replaceChildren(el('p',error.message,{role:'alert'}));});
  }
  card(parent,finding,revision,report) {
    const article=el('article',null,{class:'review-finding','data-review-finding':finding.id});
    article.append(el('h4',finding.title),el('strong',finding.severity==='violation'?'! Policy violation':'? Review candidate'),
      el('p',this.subjects(finding)),el('p',`Rule: ${finding.rule}. ${finding.reason}`),
      el('p',`${finding.count} recorded relations / ${finding.triage}`),el('p',finding.guidance));
    if(finding.reopened)article.append(el('p',finding.reopened,{class:'muted'}));
    for(const limit of finding.limits)article.append(el('small',limit));
    const evidence=el('details');evidence.append(el('summary','Exact evidence'),
      el('small',`Showing ${finding.witnesses.length} of ${finding.witness_total} recorded witness links.`));
    for(const witness of finding.witnesses) {
      const row=el('div'),button=el('button','Inspect recorded reference',{type:'button'});row.append(button);evidence.append(row);
      button.onclick=async()=>{
        const epoch=state.referenceEpoch;button.disabled=true;
        try {const page=await state.referencePages.load(witness.query);
          if(epoch!==state.referenceEpoch||!row.isConnected)return;
          const edge=page.items[0]?.reference;
          if(edge?.id!==witness.id)throw Error('Witness no longer matches this snapshot. Recheck review.');
          const list=el('ul');list.append(referenceRow(edge));row.replaceChildren(list);
        } catch(error){if(error.name!=='AbortError'&&row.isConnected)row.append(el('p',error.message,{role:'alert'}));}
      };
    }
    article.append(evidence);
    const reasonLabel=el('label','Decision reason (optional)'),reason=el('input',null,{type:'text',name:'review-reason',
      autocomplete:'off',maxlength:'2000',value:finding.reason_saved});reasonLabel.append(reason);article.append(reasonLabel);
    const controls=el('div',null,{class:'review-actions'}),status=el('p','',{role:'status'});
    const choices=finding.triage==='active'?[['Accept risk','accepted'],['Not relevant','not-relevant']]:[['Reopen','active']];
    for(const [title,stateValue] of choices) {
      const button=el('button',title,{type:'button'});controls.append(button);
      button.onclick=async()=>{
        const epoch=state.referenceEpoch,returnFocus=controls.contains(document.activeElement);
        for(const action of controls.children)action.disabled=true;status.textContent='Saving decision...';
        try {await this.request({}, {action:'triage',report,revision,finding:finding.id,state:stateValue,reason:reason.value});
          this.pages.clear();await this.load();
          if(epoch===state.referenceEpoch&&returnFocus&&!button.isConnected&&document.activeElement===document.body)
            $('review-recheck').focus();
        } catch(error){if(error.name!=='AbortError'&&article.isConnected)status.textContent=error.message;}
        finally {for(const action of controls.children)action.disabled=false;}
      };
    }
    article.append(controls,status);parent.append(article);
  }
}

if(typeof module!=='undefined')module.exports={ReviewProjection,ArchitectureReview};
