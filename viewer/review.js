// SPDX-License-Identifier: AGPL-3.0-or-later
// Findings decorate the current frontier; report data never participates in graph or camera ownership.
'use strict';

const REVIEW_SEVERITY_LABELS={violation:'Error',candidate:'Warning'};

function reviewCount(count,severity) {
  return `${count} ${REVIEW_SEVERITY_LABELS[severity].toLowerCase()}${count===1?'':'s'}`;
}

function ReviewProjection(affected,map,view) {
  const visible=new Set(view.nodes.map(n=>n.id)),badges=new Map();
  const files=new Map();
  const recorded=map.contextFiles?.size?[...map.contextFiles.keys()].map(id=>map.nodes.get(id)):
    map.viewNodes||[...map.nodes.values()];
  for(const node of [...recorded,...view.nodes])if(node?.attrs?.source_file&&node.source?.root==='project'){
    if(!files.has(node.source.path))files.set(node.source.path,new Map());
    files.get(node.source.path).set(node.id,node);
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
    for(const finding of findings) {
      if(id)add(id,subject,finding);
      for(const path of finding.source_paths||[])for(const file of files.get(path)?.values()||[]){
        let owner=file.attrs.source_owner;
        while(owner&&owner!==subject)owner=map.nodes.get(owner)?.parent;
        if(owner!==subject)continue;
        // File evidence decorates its recorded presentation route, not every declaration in that file.
        for(const parent of map.paths?.get(file.id)||[file.id]){
          if(visible.has(parent)&&(parent===file.id||map.nodes.get(parent)?.attrs?.presentation_group))add(parent,subject,finding);
        }
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
    this.closeComparison();
    this.epoch++;for(const controller of this.requests)controller.abort();this.requests.clear();this.pages.clear();
    this.target=target;this.data=null;this.badges.clear();this.enabled=Boolean(target?.review_url);this.pendingFinding=null;
    this.inspectionView=null;
    this.loading=false;this.error=null;
    this.referenceIndex.clear();this.findingIndex.clear();this.links.clear();this.nodeLinks.clear();this.ownerBadges.clear();
    this.panel(false);this.status();
  }
  cancel() {
    this.closeComparison();
    this.enabled=false;this.epoch++;for(const controller of this.requests)controller.abort();this.requests.clear();
  }
  panel(open=$('review').hidden) {
    $('review').hidden=!open;$('toggle-review').setAttribute('aria-expanded',String(open));
    if(open){closeMapPanels();if(typeof state!=='undefined')state.analysis?.panel(false);
      if(typeof innerWidth!=='undefined'&&innerWidth<=1000)togglePanel('details',false);}
    else if(typeof document!=='undefined'&&$('review').contains(document.activeElement))$('toggle-review').focus();
  }
  status() {
    const button=$('toggle-review'),counts=this.data?.counts;
    const phase=!this.target?.review_url?'Unavailable':!this.enabled?'Off':this.error?'Failed':
      this.loading||!counts?'Checking...':'';
    const visible=[];
    for(const severity of ['violation','candidate']){
      const count=$(`review-${severity}-count`),n=phase?0:counts[severity];
      count.hidden=!n;
      count.textContent=n?reviewCount(n,severity):'';
      if(n)visible.push(count.textContent);
    }
    const empty=$('review-phase');
    empty.hidden=visible.length>0;
    empty.textContent=phase||(!visible.length?'0 recorded findings':'');
    const label=visible.join(' / ')||empty.textContent;
    const coverage=['incomplete','failed','unavailable','disabled'].map(status=>{
      const count=(this.data?.checks||[]).filter(check=>check.status===status).length;
      return count?`${count} ${status}`:null;
    }).filter(Boolean);
    button.disabled=!this.target?.review_url;
    button.title=this.error||[label,...coverage].join(' / ')+'. Findings use recorded evidence; source checks are in Analysis.';
    button.setAttribute('aria-label','Review: '+[label,...coverage].join(' / '));
    button.setAttribute('data-phase',phase);
    $('review-enabled').checked=this.enabled;$('review-enabled').disabled=button.disabled;
    $('review-recheck').disabled=!this.enabled;
    $('review-legend').hidden=!this.enabled||!this.data;
    if(typeof state!=='undefined'&&state.inspector&&state.selection)this.refreshInspection();
  }
  toggle(enabled=!this.enabled) {
    this.enabled=enabled;this.error=null;this.loading=false;
    if(enabled)this.load();
    else {this.closeComparison();this.epoch++;for(const c of this.requests)c.abort();this.requests.clear();
      this.data=null;this.pages.clear();this.referenceIndex.clear();this.findingIndex.clear();
      for(const id of ['review-items','review-pager','review-checks'])$(id).replaceChildren();
      $('review-status').textContent='Review is off.';$('review').setAttribute('aria-busy','false');
      this.project();readableLabels();
      this.refreshInspection();}
    this.status();
  }
  async request(query={},body=null,{preview=false}={}) {
    const epoch=this.epoch,controller=new AbortController();this.requests.add(controller);
    controller.sourcePreview=preview;
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
    const epoch=this.epoch;
    this.referenceIndex.clear();this.findingIndex.clear();
    for(const id of ['review-items','review-pager','review-checks'])$(id).replaceChildren();
    this.refreshInspection();
    this.loading=true;this.error=null;this.status();$('review-status').textContent='Rechecking...';
    try {await this.request({}, {action:'recheck'});if(epoch===this.epoch)await this.load();}
    catch(error){if(epoch===this.epoch&&error.name!=='AbortError'){
      this.loading=false;this.error=error.message;this.status();$('review-status').textContent=error.message;}}
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
      const mark=records?(violation?'review-violation':'review-candidate'):null;
      if(mark?edge.hasClass(mark):!edge.hasClass('review-candidate')&&!edge.hasClass('review-violation'))continue;
      edge.removeClass('review-candidate review-violation');
      if(mark)edge.addClass(mark);
      state.labelGeometry=null;
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
      const text=[row.dataset.caption,visible.has(row.dataset.reviewLocation)?'':'Outside view'].filter(Boolean).join(' / ');
      if(row.textContent!==text)row.textContent=text;
      row.hidden=!text;
    }
  }
  renderList(data,cursor) {
    const counts=data.counts,context=data.context.target;
    $('review-status').textContent=`${reviewCount(counts.violation,'violation')} / ${reviewCount(counts.candidate,'candidate')} / ${counts.acknowledged} acknowledged`;
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
    if(!data.items.length)list.append(el('p','No findings to show in this recorded scope. See Review settings for coverage.',{class:'muted'}));
    for(const [severity,label] of Object.entries(REVIEW_SEVERITY_LABELS)){
      const findings=data.items.filter(finding=>finding.severity===severity);
      if(!findings.length)continue;
      const group=el('section',null,{class:'review-group','aria-labelledby':`review-group-${severity}`});
      group.append(el('h3',label+'s',{id:`review-group-${severity}`,class:`review-${severity}`}));
      for(const finding of findings)group.append(this.findingButton(finding));
      list.append(group);
    }
    this.locations();
    const pager=$('review-pager');pager.replaceChildren();
    if(!cursor&&data.next_cursor===null)return;
    for(const [title,next] of [['Previous',Math.max(0,cursor-50)],['Next',data.next_cursor]]) {
      const button=el('button',title,{type:'button','aria-label':title+' findings'});button.disabled=title==='Previous'?!cursor:next===null;
      button.onclick=()=>this.load(next);pager.append(button);
    }
  }
  findingButton(finding) {
    const source=finding.evidence_type==='source';
    const button=el('button',null,{type:'button',class:'review-item','data-finding':finding.id});
    button.append(el('strong',source?'Duplicated code':finding.title));
    const files=this.sourceFiles(finding);
    button.append(el('small',files.length?files.join(', '):this.subjects(finding)));
    if(source)button.append(el('small',`${finding.token_count} tokens in ${finding.evidence_total} source ranges`));
    const caption=finding.triage==='accepted'?'Risk accepted':finding.triage==='not-relevant'?'Not relevant':'';
    button.append(el('small',caption,{'data-review-location':finding.id,'data-caption':caption}));
    button.onclick=()=>{this.pendingFinding=finding.id;
      const visible=[...this.badges].find(([,b])=>b.ids.has(finding.id));
      if(visible&&state.selection?.id===visible[0]&&!state.selection.projectContext&&state.inspector){
        this.refreshInspection();togglePanel('details',true);state.inspector.select('architecture',{focus:true});return;
      }
      state.detailsKey=null;
      if(visible){if(typeof cancelNavigationFlight==='function')cancelNavigationFlight();selectNode(visible[0]);}
      else flyToNode(finding.subjects[0]);};
    return button;
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
  cancelPreviews(){
    for(const controller of this.requests)if(controller.sourcePreview){controller.abort();this.requests.delete(controller);}
  }
  closeComparison(focus=false){
    const comparison=this.comparison;this.comparison=null;comparison?.close(focus);this.cancelPreviews();
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
    const node=trace.kind==='node'?state.universe.nodes.get(trace.source):null;
    const context=node?.attrs?.source_file?' in this file':node?.attrs?.presentation_group?' inside this container':
      trace.kind==='node'?' for this owner':' in these references';
    const violations=records.filter(f=>f.severity==='violation').length,candidates=records.length-violations;
    const summary=[violations&&reviewCount(violations,'violation'),
      candidates&&reviewCount(candidates,'candidate')].filter(Boolean).join(' / ')+
      context+
      (records.some(f=>f.acknowledged)?` (${records.filter(f=>f.acknowledged).length} acknowledged)`:'');
    return {summary,titles:[...new Set(records.map(f=>f.title))].slice(0,2)};
  }
  details(panel,node) {
    const status=this.inspection(node),inspector=state.inspector;
    const label=(count,status)=>inspector?.setLabel('architecture',count===null?`Review: ${status}`:`Review (${count})`);
    if(status.count===null||!status.count){
      this.cancelPreviews();
      this.closeComparison();
      label(status.count,status.status);panel.replaceChildren(el('p',status.message,{class:'muted',role:status.status==='failed'?'alert':'status'}));
      this.inspectionView=null;delete panel.dataset.reviewKey;
      if(status.status!=='checking...')delete panel.dataset.finding;
      return;
    }
    const exact=status.exact,requested=this.pendingFinding,chosen=requested||panel.dataset.finding;
    this.pendingFinding=null;
    const report=this.data.report,key=JSON.stringify([report,this.data.revision,this.ack,node.id||node.key,exact]);
    if(panel.dataset.reviewKey===key){if(requested)this.inspectionView.select(requested);return;}
    this.closeComparison();
    label(status.count);
    const previous=this.inspectionView;
    const drafts=previous?.panel===panel&&previous.report===report?previous.drafts:new Map();
    panel.dataset.reviewKey=key;delete panel.dataset.finding;
    const section=el('section',null,{class:'review-details','aria-label':'Review findings'});
    const rows=el('div',null,{class:'inspection-findings',role:'group','aria-label':'Select a finding'});
    const statusLine=el('p','Loading findings...', {class:'muted',role:'status'});
    const more=el('button','More findings',{type:'button',hidden:''}),body=el('div',null,{class:'inspection-finding-body'});
    if(state.target.stale)section.append(el('p','Snapshot is stale. Source locations and findings may have changed.',{class:'inspection-caution',role:'status'}));
    if(this.data.checks.some(check=>['failed','unavailable','incomplete'].includes(check.status))){
      section.append(el('p','Some Review checks have limited evidence. See Review settings for coverage.',{class:'inspection-caution'}));
    }
    section.append(rows,statusLine,more,body);panel.replaceChildren(section);
    const epoch=state.referenceEpoch,reviewEpoch=this.epoch,entries=new Map();
    const recorded=new Map(this.data.items.map(finding=>[finding.id,finding]));
    const current=()=>epoch===state.referenceEpoch&&reviewEpoch===this.epoch&&section.isConnected&&this.enabled;
    let cursor=0;
    const add=(finding,page)=>{
      if(entries.has(finding.id))return;
      const button=el('button',null,{type:'button',class:'inspection-finding-row','data-inspection-finding':finding.id,'aria-pressed':'false'});
      this.findingSummary(button,finding);
      button.onclick=()=>select(finding.id);
      entries.set(finding.id,{button,finding,page});rows.append(button);
    };
    const select=async id=>{
      if(!id||id===panel.dataset.finding)return;
      const entry=entries.get(id),known=this.findingIndex.get(id);
      if(!entry&&!known)return;
      if(!entry)add(recorded.get(id)||known,recorded.has(id)?this.data:undefined);
      this.closeComparison();panel.dataset.finding=id;
      for(const [key,{button}] of entries)button.setAttribute('aria-pressed',String(key===id));
      const loading=el('p','Loading finding...', {role:'status'});
      body.replaceChildren(loading);
      const active=()=>current()&&loading.isConnected;
      try{
        const selection=entries.get(id);
        const data=selection.page||await this.inspectionPage({report,finding:id},true);
        if(!active())return;
        const finding=selection.page?selection.finding:data.items[0];
        if(!finding){body.replaceChildren(el('p','This finding is no longer available.',{role:'status'}));return;}
        this.findingSummary(entries.get(id).button,finding);
        body.replaceChildren();this.card(body,finding,data.revision,data.report,drafts);
      }catch(error){if(active()&&error.name!=='AbortError'){
        const retry=el('button','Retry finding',{type:'button'});
        retry.onclick=()=>{delete panel.dataset.finding;select(id);};
        body.replaceChildren(el('p',error.message,{role:'alert'}),retry);
      }}
    };
    this.inspectionView={panel,report,drafts,select};
    const load=async(first=false)=>{
      more.disabled=true;
      try{
        const data=exact?null:await this.inspectionPage({report,node:node.id,cursor});
        if(!current())return;
        const before=entries.size;
        if(exact){for(const id of exact.slice(cursor,cursor+50)){
          const finding=recorded.get(id)||this.findingIndex.get(id);
          if(finding)add(finding,recorded.has(id)?this.data:undefined);
        }}else for(const finding of data.items)add(finding,data);
        const count=exact?.length??data.total;
        label(count);
        statusLine.textContent=count?'':'No recorded findings for this selection.';
        const next=exact?(cursor+50<count?cursor+50:null):data.next_cursor;
        more.hidden=next===null;more.textContent='More findings';cursor=next;
        if(first)select(this.findingIndex.has(chosen)?chosen:entries.keys().next().value);
        else [...entries.values()][before]?.button.focus();
      }catch(error){if(current()&&error.name!=='AbortError'){
        if(first)label(null,'failed');
        statusLine.textContent=error.message;more.hidden=false;more.textContent='Retry findings';
      }}finally{if(current())more.disabled=false;}
    };
    more.onclick=()=>load(!entries.size);
    load(true);
  }
  async inspectionPage(query,preview=false){
    const key=JSON.stringify([query,this.ack,this.data.revision]);
    if(this.pages.has(key))return this.pages.get(key).data;
    const data=await this.request(query,null,{preview});
    const bytes=new TextEncoder().encode(JSON.stringify(data)).byteLength;
    if(bytes<=8*1024*1024){
      this.pages.set(key,{data,bytes});
      while(this.pages.size>8||[...this.pages.values()].reduce((sum,p)=>sum+p.bytes,0)>8*1024*1024)
        this.pages.delete(this.pages.keys().next().value);
    }
    return data;
  }
  findingSummary(button,finding){
    const copy=el('span',null,{class:'inspection-finding-copy'});
    const subjects=this.subjects(finding);
    copy.append(el('strong',finding.title),el('small',subjects,{class:'inspection-subjects',title:subjects}));
    const caption=finding.evidence_type==='source'?`${finding.token_count} tokens / ${finding.evidence_total} locations`:
      finding.count>1?`${finding.count} recorded relations`:'';
    const triage=finding.triage==='accepted'?'Risk accepted':finding.triage==='not-relevant'?'Not relevant':finding.acknowledged?'Acknowledged':'';
    if(caption||triage)copy.append(el('small',[caption,triage].filter(Boolean).join(' / ')));
    button.replaceChildren(el('span','',{class:`severity-mark review-${finding.severity}`,'aria-label':REVIEW_SEVERITY_LABELS[finding.severity],role:'img'}),copy);
  }
  hasInspectionDraft(){
    const view=this.inspectionView;
    return Boolean(view?.panel.isConnected&&view.drafts.size);
  }
  card(parent,finding,revision,report,drafts) {
    const article=el('article',null,{class:'review-finding','data-review-finding':finding.id});
    article.append(el('p',REVIEW_SEVERITY_LABELS[finding.severity],{class:`inspection-severity review-${finding.severity}`}),
      el('h3',finding.title));
    if(finding.reopened)article.append(el('p',finding.reopened,{class:'inspection-caution',role:'status'}));
    const check=this.data.checks.find(check=>check.id===finding.rule);
    const incomplete=check?.status==='partial'&&check.kind!=='duplication'&&
      (check.kind!=='native'||check.unverified_relations>0);
    if(incomplete&&check.detail)article.append(el('p',check.detail,{class:'inspection-caution'}));
    if(finding.guidance)article.append(el('p',finding.guidance));
    const evidence=el('section',null,{class:finding.evidence_type==='source'?'source-evidence':'inspection-evidence'});
    if(finding.evidence_type==='source')this.sourceEvidence(evidence,finding,report);
    else {
      evidence.append(el('h4','Exact evidence'),
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
        } catch(error){if(error.name!=='AbortError'&&row.isConnected){button.disabled=false;
          row.querySelector('[role="alert"]')?.remove();row.append(el('p',error.message,{role:'alert'}));}}
      };
    }
    }
    article.append(evidence);
    const rule=el('details',null,{class:'inspection-disclosure'});
    rule.append(el('summary','Rule and analysis limits'),el('p',`Rule ${finding.rule}`));
    if(finding.reason)rule.append(el('p',finding.reason));
    if(!incomplete&&check?.detail)rule.append(el('p',check.detail));
    for(const limit of finding.limits)rule.append(el('small',limit));
    const decision=el('details',null,{class:'inspection-disclosure'});
    const decisionLabel={active:'Review decision',accepted:'Review decision (risk accepted)','not-relevant':'Review decision (not relevant)'};
    decision.append(el('summary',decisionLabel[finding.triage]||'Review decision'));
    const reasonLabel=el('label','Decision reason (optional)'),reason=el('input',null,{type:'text',name:'review-reason',
      autocomplete:'off',maxlength:'2000',value:finding.reason_saved});reasonLabel.append(reason);decision.append(reasonLabel);
    if(drafts.has(finding.id)){reason.value=drafts.get(finding.id);decision.open=true;}
    reason.oninput=()=>{if(reason.value===reason.defaultValue)drafts.delete(finding.id);else drafts.set(finding.id,reason.value);};
    const controls=el('div',null,{class:'review-actions'}),status=el('p','',{role:'status'});
    const choices=finding.triage==='active'?[['Accept risk','accepted'],['Not relevant','not-relevant']]:[['Reopen','active']];
    for(const [title,stateValue] of choices) {
      const button=el('button',title,{type:'button'});controls.append(button);
      button.onclick=async()=>{
        const epoch=state.referenceEpoch,returnFocus=controls.contains(document.activeElement);
        this.saving=(this.saving||0)+1;
        for(const action of controls.children)action.disabled=true;status.textContent='Saving decision...';
        try {await this.request({}, {action:'triage',report,revision,finding:finding.id,state:stateValue,reason:reason.value});
          drafts.delete(finding.id);this.pages.clear();await this.load();
          if(epoch===state.referenceEpoch&&returnFocus&&!button.isConnected&&document.activeElement===document.body)
            (state.inspector?.tabs.get('architecture')||$('review-recheck')).focus();
        } catch(error){if(error.name!=='AbortError'&&article.isConnected)status.textContent=error.message;}
        finally {this.saving--;for(const action of controls.children)action.disabled=false;}
      };
    }
    decision.append(controls,status);article.append(rule,decision);parent.append(article);
  }
  sourceEvidence(panel,finding,report) {
    const compare=el('button','Compare matches',{type:'button',class:'primary-action'}),body=el('div'),
      comparisonStatus=el('small',null,{role:'status'});
    compare.disabled=true;panel.append(compare,comparisonStatus,body);
    const epoch=state.referenceEpoch,reviewEpoch=this.epoch;
    const current=()=>epoch===state.referenceEpoch&&reviewEpoch===this.epoch&&panel.isConnected&&this.enabled;
    const loadPage=(cursor,preview=false)=>this.request({finding:finding.id,evidence:true,report,cursor,limit:50},null,{preview});
    let page=null;
    const open=(selected,trigger,initial=page)=>{
      if(!current()||!page)return;this.closeComparison();
      const comparison=new SourceComparison({target:this.target,finding,report,initial,selected,trigger,
        title:selected.length===1?'Preview duplicated code':'Compare duplicated code',
        requests:this.requests,current,loadPage:cursor=>loadPage(cursor,true),onClose:()=>{
          if(this.comparison===comparison)this.comparison=null;this.cancelPreviews();
        }});
      this.comparison=comparison;comparison.mount();
    };
    compare.onclick=async()=>{
      if(!page||!current())return;compare.disabled=true;comparisonStatus.textContent='';
      try{
        const initial=page.items.length<2&&page.total>1?{...await loadPage(0,true),cursor:0}:page;
        if(current())open(initial.items.slice(0,2).map((_,i)=>initial.cursor+i),compare,initial);
      }catch(error){if(current()&&error.name!=='AbortError')comparisonStatus.textContent='Could not open comparison. '+error.message;}
      finally{if(current())compare.disabled=!page.items.length;}
    };
    const load=async(cursor=0)=>{
      const focused=body.contains(document.activeElement)&&document.activeElement.getAttribute('aria-label');
      if(page)this.closeComparison();compare.disabled=true;
      body.replaceChildren(el('p','Loading source ranges...',{role:'status'}));
      try{
        const data=await loadPage(cursor);if(!current())return;
        page={...data,cursor};compare.disabled=!data.items.length;
        const heading=el('div',null,{class:'source-locations-heading'});
        heading.append(el('h4','Source locations'),el('small',String(data.total)));
        body.replaceChildren(heading);
        if(data.total>50)body.append(el('p',`Locations ${data.items.length?cursor+1:0}-${cursor+data.items.length} of ${data.total}`));
        if(state.target.stale)body.append(el('p','Snapshot is stale. Current source locations may have moved.',{role:'status'}));
        const list=el('ul',null,{class:'source-evidence-list'});body.append(list);
        for(const [index,item] of data.items.entries())list.append(sourceOccurrenceRow(item,{target:this.target,current,
          preview:trigger=>open([cursor+index],trigger)}));
        if(cursor||data.next_cursor!==null){
          const controls=el('div',null,{class:'review-actions'});
          for(const [title,next] of [['Previous',Math.max(0,cursor-50)],['Next',data.next_cursor]]){
            const button=el('button',title,{type:'button','aria-label':title+' source ranges'});
            button.disabled=title==='Previous'?!cursor:next===null;button.onclick=()=>load(next);controls.append(button);
          }
          body.append(controls);
          if(focused&&document.activeElement===document.body){
            const buttons=[...controls.children];
            (buttons.find(button=>!button.disabled&&button.getAttribute('aria-label')===focused)||
              buttons.find(button=>!button.disabled))?.focus({preventScroll:true});
          }
        }
      }catch(error){if(current()&&error.name!=='AbortError')body.replaceChildren(el('p',error.message,{role:'alert'}));}
    };
    load();
  }
}

if(typeof module!=='undefined')module.exports={ReviewProjection,ReviewReferenceIndex,ReviewEdgeProjection,ArchitectureReview};
