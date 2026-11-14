// SPDX-License-Identifier: AGPL-3.0-or-later
// Findings decorate the current frontier; report data never participates in graph or camera ownership.
'use strict';

function ReviewProjection(affected,map,view) {
  const visible=new Set(view.nodes.map(n=>n.id)),badges=new Map();
  const files=new Map();
  for(const node of view.nodes)if(node.attrs?.source_file&&node.source?.root==='project'){
    if(!files.has(node.source.path))files.set(node.source.path,[]);
    files.get(node.source.path).push(node);
  }
  const add=(id,subject,finding)=>{
    if(!badges.has(id))badges.set(id,{ids:new Set(),subjects:[],severity:'candidate',acknowledged:true});
    const badge=badges.get(id);if(!badge.subjects.includes(subject))badge.subjects.push(subject);
    badge.ids.add(finding.id);
    if(finding.severity==='violation')badge.severity='violation';
    if(!finding.acknowledged)badge.acknowledged=false;
  };
  for(const [subject,findings] of Object.entries(affected||{})) {
    let id=subject;
    while(id&&!visible.has(id))id=map.nodes.get(id)?.parent;
    if(!id)continue;
    for(const finding of findings) {
      add(id,subject,finding);
      for(const path of finding.source_paths||[])for(const file of files.get(path)||[]){
        let owner=file.attrs.source_owner;
        while(owner&&owner!==subject)owner=map.nodes.get(owner)?.parent;
        if(owner===subject)add(file.id,subject,finding);
      }
    }
  }
  for(const badge of badges.values()){badge.count=badge.ids.size;badge.subjects.sort();}
  return badges;
}

function ReviewReferenceIndex(connections) {
  const groups=new Map();
  for(const finding of connections||[])for(const group of finding.groups){
    if(!groups.has(group))groups.set(group,new Map());
    groups.get(group).set(finding.id,finding);
  }
  return groups;
}

function ReviewEdgeProjection(index,view) {
  const edges=new Map();
  for(const edge of view.edges){
    const findings=new Map();
    for(const ref of edge.refs)for(const [id,finding] of index.get(ref.group)||[])findings.set(id,finding);
    if(findings.size)edges.set(edge.id,findings);
  }
  return edges;
}

class ArchitectureReview {
  constructor() {
    this.enabled=false;this.ack=false;this.epoch=0;this.requests=new Set();this.pages=new Map();this.badges=new Map();
    this.referenceIndex=new Map();this.findingIndex=new Map();this.links=new Map();this.nodeLinks=new Map();this.ownerBadges=new Set();
    $('toggle-review').onclick=()=>this.panel();
    $('review-close').onclick=()=>this.panel(false);
    $('review-enabled').onchange=()=>this.toggle($('review-enabled').checked);
    $('review-ack').onchange=()=>{this.ack=$('review-ack').checked;this.pages.clear();this.load();};
    $('review-recheck').onclick=()=>this.recheck();
  }
  reset(target) {
    this.epoch++;for(const controller of this.requests)controller.abort();this.requests.clear();this.pages.clear();
    this.target=target;this.data=null;this.badges.clear();this.enabled=Boolean(target?.review_url);this.pendingFinding=null;
    this.loading=false;this.error=null;
    this.referenceIndex.clear();this.findingIndex.clear();this.links.clear();this.nodeLinks.clear();this.ownerBadges.clear();
    this.panel(false);this.status();
  }
  panel(open=$('review').hidden) {
    $('review').hidden=!open;$('toggle-review').setAttribute('aria-expanded',String(open));
    if(open){togglePanel('filters',false);if(typeof innerWidth!=='undefined'&&innerWidth<=1000)togglePanel('details',false);}
    else if(typeof document!=='undefined'&&$('review').contains(document.activeElement))$('toggle-review').focus();
  }
  status() {
    const button=$('toggle-review'),counts=this.data?.counts;
    const label=!this.target?.review_url?'unavailable':!this.enabled?'off':this.loading?'checking...':this.error?'failed':
      counts?[[counts.violation,'violation'],[counts.candidate,'candidate']].filter(([n])=>n)
        .map(([n,label])=>`${n} ${label}${n===1?'':'s'}`).join(' / ')||'0 findings':'checking...';
    button.textContent='Review: '+label;button.disabled=!this.target?.review_url;
    button.title=this.error||'All modules in the recorded snapshot. Open for review counts, coverage and controls.';
    button.setAttribute('data-severity',counts?.violation?'violation':counts?.candidate?'candidate':'');
    $('review-enabled').checked=this.enabled;$('review-enabled').disabled=button.disabled;
    $('review-legend').hidden=!this.enabled||!this.data;
    if(typeof state!=='undefined'&&state.inspector&&state.selection)this.refreshInspection();
  }
  toggle(enabled=!this.enabled) {
    this.enabled=enabled;this.error=null;this.loading=false;
    if(enabled)this.load();
    else {this.epoch++;for(const c of this.requests)c.abort();this.requests.clear();
      this.data=null;this.pages.clear();this.referenceIndex.clear();this.findingIndex.clear();this.project();readableLabels();
      this.refreshInspection();}
    this.status();
  }
  async request(query={},body=null) {
    const epoch=this.epoch,controller=new AbortController();this.requests.add(controller);
    try {
      const params=new URLSearchParams({...query,...(query.evidence?{}:{ack:String(this.ack)})});
      const response=await fetch(this.target.review_url+(body?'':'?'+params),{cache:'no-store',signal:controller.signal,
        ...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
      const text=await response.text();
      if(epoch!==this.epoch||controller.signal.aborted)throw new DOMException('Review cancelled','AbortError');
      if(!response.ok)throw Error(`Review: ${text.trim()}. Use Recheck to reload.`);
      const data=JSON.parse(text);
      if(query.evidence&&!body){
        if(!Array.isArray(data.items)||data.items.length>100||typeof data.report!=='string'||
          !Number.isSafeInteger(data.total)||data.total<0||data.next_cursor!==null&&
          (!Number.isSafeInteger(data.next_cursor)||data.next_cursor<=Number(query.cursor||0)))throw Error('Invalid source evidence page');
        for(const item of data.items)if(item.root!=='project'||typeof item.path!=='string'||
          !['line','column','end_line','end_column'].every(k=>Number.isSafeInteger(item[k])&&item[k]>0))throw Error('Invalid source range');
      }else if(!body) {
        if(!Array.isArray(data.items)||data.items.length>100||typeof data.report!=='string'||
          !Number.isSafeInteger(data.revision)||!Number.isSafeInteger(data.total)||data.total<0||
          !data.counts||!data.affected||!Array.isArray(data.checks)||!Array.isArray(data.connections)||
          data.next_cursor!==null&&(!Number.isSafeInteger(data.next_cursor)||data.next_cursor<=Number(query.cursor||0)))throw Error('Invalid review page');
        for(const f of data.items)if(!['violation','candidate'].includes(f.severity)||!Array.isArray(f.subjects)||
          !Array.isArray(f.witnesses)||f.witnesses.length>8||typeof f.id!=='string')throw Error('Invalid review finding');
        for(const f of data.connections)if(typeof f.id!=='string'||!['violation','candidate'].includes(f.severity)||
          !Array.isArray(f.groups)||f.groups.some(g=>!Number.isSafeInteger(g)||g<1)||!Array.isArray(f.subjects))
          throw Error('Invalid review connection');
      }
      return data;
    } finally {this.requests.delete(controller);}
  }
  async load(cursor=0) {
    if(!this.enabled||!this.target?.review_url)return;
    const epoch=this.epoch,sequence=(this.loadSequence||0)+1;this.loadSequence=sequence;
    this.loading=true;this.error=null;this.status();
    $('review-status').textContent='Loading review...';$('review').setAttribute('aria-busy','true');
    try {
      const data=await this.request({cursor,...(cursor&&this.data?{report:this.data.report}:{})});
      if(epoch!==this.epoch||sequence!==this.loadSequence||!this.enabled)return;
      this.data=cursor?{...data,affected:this.data.affected,connections:this.data.connections}:data;
      if(!cursor){this.referenceIndex=ReviewReferenceIndex(data.connections);this.findingIndex=new Map(data.connections.map(f=>[f.id,f]));}
      this.project();this.renderList(data,cursor);readableLabels();
      this.refreshInspection();
    } catch(error) {if(epoch===this.epoch&&sequence===this.loadSequence&&error.name!=='AbortError') {
      this.error=error.message;$('review-status').textContent=error.message;this.data=null;this.pages.clear();this.project();readableLabels();
      this.referenceIndex.clear();this.findingIndex.clear();
      for(const id of ['review-items','review-pager','review-checks'])$(id).replaceChildren();
      this.refreshInspection();}}
    finally {if(epoch===this.epoch&&sequence===this.loadSequence){this.loading=false;this.status();$('review').setAttribute('aria-busy','false');}}
  }
  async recheck() {
    this.epoch++;for(const c of this.requests)c.abort();this.pages.clear();this.data=null;this.project();readableLabels();
    this.referenceIndex.clear();this.findingIndex.clear();
    for(const id of ['review-items','review-pager','review-checks'])$(id).replaceChildren();
    this.refreshInspection();
    this.loading=true;this.error=null;this.status();$('review-status').textContent='Rechecking...';
    try {await this.request({}, {action:'recheck'});await this.load();}
    catch(error){if(error.name!=='AbortError'){this.loading=false;this.error=error.message;this.status();$('review-status').textContent=error.message;}}
  }
  project() {
    if(!state.cy||!state.shard)return;
    const previous=this.badges;
    this.badges=this.enabled&&this.data?ReviewProjection(this.data.affected,state.universe,state.shard):new Map();
    this.ownerBadges=new Set(this.badges.keys());
    const oldLinks=this.links||new Map();this.nodeLinks=new Map();
    this.links=this.enabled&&this.data?ReviewEdgeProjection(this.referenceIndex,state.shard):new Map();
    for(const item of this.links.size?state.shard.edges:[]){
      const findings=this.links.get(item.id);if(!findings)continue;
      for(const id of new Set([item.source,item.target])){
        if(!this.nodeLinks.has(id))this.nodeLinks.set(id,new Set());
        if(!this.badges.has(id))this.badges.set(id,{ids:new Set(),subjects:[],severity:'candidate',acknowledged:true});
        const badge=this.badges.get(id);
        for(const finding of findings.values()){
          this.nodeLinks.get(id).add(finding.id);badge.ids.add(finding.id);
          if(finding.severity==='violation')badge.severity='violation';
          if(!finding.acknowledged)badge.acknowledged=false;
        }
        badge.count=badge.ids.size;
      }
    }
    for(const id of new Set([...oldLinks.keys(),...this.links.keys()])){
      const edge=state.cy.getElementById(state.universe.renderPrefix+id);if(!edge.length)continue;
      const records=this.links.get(id),violation=records&&[...records.values()].some(f=>f.severity==='violation');
      const value=records?`${violation?'violation':'candidate'}:${records.size}`:'';
      const mark=records?(violation?'review-violation':'review-candidate'):null;
      if(edge.data('reviewMark')===value&&(mark?edge.hasClass(mark):
        !edge.hasClass('review-candidate')&&!edge.hasClass('review-violation')))continue;
      edge.removeClass('review-candidate review-violation');
      edge.data('reviewMark',value);state.labelGeometry=null;
      if(records){
        edge.data('reviewSymbol',violation?'!':'?');
        edge.data('reviewText',`${violation?'!':'?'} ${records.size} review`);
        edge.addClass(violation?'review-violation':'review-candidate');}
      else {edge.data('reviewText','');edge.data('reviewSymbol','');}
    }
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
      row.append(button,el('small',finding.evidence_type==='source'?
        `Duplication / ${finding.token_count} tokens / ${finding.evidence_total} ranges`:finding.title));
      const files=this.sourceFiles(finding);if(files.length)row.append(el('small',files.join(', ')));
      row.append(el('small',caption,
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
    return finding.subjects.slice(0,8).map(label).join(finding.kind==='duplication'?', ':' -> ')+
      (finding.subjects.length>8?` / ${finding.subjects.length-8} more modules`:'');
  }
  sourceFiles(finding) {
    if(finding.evidence_type!=='source')return[];
    const paths=new Set();
    for(const subject of finding.subjects.slice(0,8)){
      const hint=this.data?.affected[subject]?.find(item=>item.id===finding.id);
      for(const path of (hint?.source_paths||[]).slice(0,2))paths.add(path);
    }
    return [...paths].slice(0,2).map(path=>path.split('/').at(-1));
  }
  refreshInspection() {
    const slot=document.querySelector('#details [data-review-slot]');
    if(!slot||!state.selection||slot.dataset.reviewSlot!==(state.selection.id||'connection'))return;
    this.details(slot,state.selection);
  }
  inspection(node) {
    const unavailable=!this.target?.review_url?'unavailable':!this.enabled?'off':this.error?'failed':!this.data?'checking...':null;
    if(unavailable)return{count:null,status:unavailable,message:this.error||{
      unavailable:'Review is unavailable for this snapshot.',off:'Review is off. Open Review to enable it.',
      'checking...':'Checking recorded review evidence...'}[unavailable]};
    const exact=node.attrs?.presentation_group?[...(this.badges.get(node.id)?.ids||[])]:
      node.id?(node.projectContext||this.ownerBadges.has(node.id)?null:[...(this.nodeLinks.get(node.id)||[])]):
      [...this.findingsFor(node).keys()];
    const count=node.projectContext?this.data.counts.violation+this.data.counts.candidate+(this.ack?this.data.counts.acknowledged:0):
      node.id?this.badges.get(node.id)?.count||0:exact.length;
    return{count,exact,message:'No recorded review findings for this selection. This does not prove conformance; see Review for coverage.'};
  }
  findingsFor(trace) {
    const findings=new Map();if(!this.enabled||!this.data)return findings;
    if(trace.kind==='node'){
      for(const id of this.badges.get(trace.source)?.ids||[]){const finding=this.findingIndex.get(id);if(finding)findings.set(id,finding);}
    }else for(const ref of trace.refs||[])for(const [id,finding] of this.referenceIndex.get(ref.group)||[])findings.set(id,finding);
    return findings;
  }
  readout(trace) {
    const records=[...this.findingsFor(trace).values()];if(!records.length)return null;
    const violations=records.filter(f=>f.severity==='violation').length,candidates=records.length-violations;
    const summary=[violations&&`! ${violations} policy violation${violations===1?'':'s'}`,
      candidates&&`? ${candidates} review candidate${candidates===1?'':'s'}`].filter(Boolean).join(' / ')+
      (trace.kind==='node'?' for this owner':' in these references')+
      (records.some(f=>f.acknowledged)?` (${records.filter(f=>f.acknowledged).length} acknowledged)`:'');
    return {summary,titles:[...new Set(records.map(f=>f.title))].slice(0,2)};
  }
  details(panel,node) {
    const status=this.inspection(node),inspector=state.inspector;
    const label=(count,status)=>inspector?.setLabel('architecture',count===null?`Review: ${status}`:`Review (${count})`);
    if(status.count===null||!status.count){
      label(status.count,status.status);panel.replaceChildren(el('p',status.message,{class:'muted',role:status.status==='failed'?'alert':'status'}));
      delete panel.dataset.reviewKey;delete panel.dataset.finding;return;
    }
    const exact=status.exact,chosen=this.pendingFinding||panel.dataset.finding||exact?.[0];this.pendingFinding=null;
    const query={report:this.data.report,...(chosen?{finding:chosen}:{node:node.id})};
    const key=JSON.stringify([query,this.ack,this.data.revision]);
    if(panel.dataset.reviewKey===key)return;
    label(chosen&&!exact?.length?1:status.count);
    panel.dataset.reviewKey=key;panel.dataset.finding=chosen||'';panel.replaceChildren();
    const section=el('section',null,{class:'review-details','aria-label':'Review findings'});
    const body=el('div');
    if(exact?.length>1){
      const choose=el('select',null,{'aria-label':'Review finding',name:'review-finding'});
      for(const id of exact){const finding=this.findingIndex.get(id);choose.add(new Option(this.subjects(finding)+' / '+finding.title,id));}
      choose.value=chosen;choose.onchange=()=>{this.pendingFinding=choose.value;this.refreshInspection();
        document.querySelector('#details select[name="review-finding"]')?.focus();};section.append(choose);
    }
    body.append(el('p','Loading findings...',{role:'status'}));section.append(body);panel.append(section);
    const epoch=state.referenceEpoch,reviewEpoch=this.epoch,report=this.data.report;
    const loaded=this.pages.has(key)?Promise.resolve(this.pages.get(key).data):this.request(query);
    loaded.then(data=>{
      if(epoch!==state.referenceEpoch||reviewEpoch!==this.epoch||!section.isConnected||!this.enabled)return;
      const bytes=new TextEncoder().encode(JSON.stringify(data)).byteLength;
      if(bytes<=8*1024*1024) {
        this.pages.delete(key);this.pages.set(key,{data,bytes});
        while(this.pages.size>8||[...this.pages.values()].reduce((sum,p)=>sum+p.bytes,0)>8*1024*1024)
          this.pages.delete(this.pages.keys().next().value);
      }
      label(exact?.length||data.total);body.replaceChildren();
      const append=page=>{
        for(const finding of page.items)this.card(body,finding,page.revision,page.report);
        if(page.next_cursor!==null) {
          const more=el('button','More findings',{type:'button'});body.append(more);
          more.onclick=async()=>{more.disabled=true;try{const next=await this.request({...query,cursor:page.next_cursor});
            if(epoch!==state.referenceEpoch||reviewEpoch!==this.epoch||!more.isConnected)return;
            more.remove();append(next);}catch(error){if(error.name!=='AbortError'){more.disabled=false;more.textContent=error.message;}}};
        }
      };append(data);
    }).catch(error=>{if(epoch===state.referenceEpoch&&reviewEpoch===this.epoch&&section.isConnected&&error.name!=='AbortError'){
      label(null,'failed');body.replaceChildren(el('p',error.message,{role:'alert'}));}});
  }
  card(parent,finding,revision,report) {
    const article=el('article',null,{class:'review-finding','data-review-finding':finding.id});
    article.append(el('p',this.subjects(finding),{class:'finding-subjects'}),el('h3',finding.title),
      el('strong',finding.severity==='violation'?'! Policy violation':'? Review candidate'),el('p',`Rule: ${finding.rule}. ${finding.reason}`),
      el('p',finding.evidence_type==='source'?`Duplication / ${finding.token_count} tokens / ${finding.evidence_total} matching ranges / ${finding.triage}`:
        `Architecture / ${finding.count} recorded relations / ${finding.triage}`),el('p',finding.guidance));
    if(finding.reopened)article.append(el('p',finding.reopened,{class:'muted'}));
    for(const limit of finding.limits)article.append(el('small',limit));
    const evidence=el('details');evidence.append(el('summary','Exact evidence'));
    if(finding.evidence_type==='source')this.sourceEvidence(evidence,finding,report);
    else {
      evidence.append(
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
            (state.inspector?.tabs.get('architecture')||$('review-recheck')).focus();
        } catch(error){if(error.name!=='AbortError'&&article.isConnected)status.textContent=error.message;}
        finally {for(const action of controls.children)action.disabled=false;}
      };
    }
    article.append(controls,status);parent.append(article);
  }
  sourceEvidence(panel,finding,report) {
    const body=el('div');panel.append(body);
    const epoch=state.referenceEpoch,reviewEpoch=this.epoch;
    let started=false;
    const load=async(cursor=0)=>{
      body.replaceChildren(el('p','Loading source ranges...',{role:'status'}));
      try{
        const data=await this.request({finding:finding.id,evidence:true,report,cursor,limit:50});
        if(epoch!==state.referenceEpoch||reviewEpoch!==this.epoch||!body.isConnected||!this.enabled)return;
        body.replaceChildren(el('p',`${cursor+1}-${cursor+data.items.length} of ${data.total} snapshot ranges`));
        if(state.target.stale)body.append(el('p','Snapshot is stale. Current source locations may have moved.',{role:'status'}));
        const list=el('ul');body.append(list);
        for(const item of data.items){
          const row=el('li'),link=sourceLink(item);
          row.append(link||el('span',`${item.path}:${item.line}`),el('small',
            `${label(item.owner)} / ${item.line}:${item.column}-${item.end_line}:${item.end_column}`));list.append(row);
        }
        for(const [title,next] of [['Previous',Math.max(0,cursor-50)],['Next',data.next_cursor]]){
          const button=el('button',title,{type:'button','aria-label':title+' source ranges'});
          button.disabled=title==='Previous'?!cursor:next===null;button.onclick=()=>load(next);body.append(button);
        }
      }catch(error){if(epoch===state.referenceEpoch&&reviewEpoch===this.epoch&&body.isConnected&&error.name!=='AbortError')
        body.replaceChildren(el('p',error.message,{role:'alert'}));}
    };
    panel.ontoggle=()=>{if(panel.open&&!started){started=true;load();}};
  }
}

if(typeof module!=='undefined')module.exports={ReviewProjection,ReviewReferenceIndex,ReviewEdgeProjection,ArchitectureReview};
