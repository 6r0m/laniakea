// SPDX-License-Identifier: AGPL-3.0-or-later
// Accessible tab presentation; selection, data requests and decisions remain with their existing owners.
'use strict';

class InspectorTabs {
  constructor(container,create,{title,tabs,onClose,onSelect,id='inspector'}) {
    this.pages=new Map();this.tabs=new Map();this.onSelect=onSelect;
    const header=create('div',null,{class:'inspector-header'}),heading=create('h2',title),
      close=create('button','\u00d7',{type:'button',class:'details-close','aria-label':'Close inspector',title:'Close inspector (Esc)'}),
      list=create('div',null,{role:'tablist','aria-label':'Inspection view',class:'inspector-tabs'});
    close.onclick=onClose;header.append(heading,close);container.append(header,list);
    for(const {id:name,label} of tabs) {
      const button=create('button',label,{type:'button',role:'tab',id:`${id}-tab-${name}`,
        'aria-controls':`${id}-page-${name}`,'aria-selected':'false',tabindex:'-1'}),
        panel=create('section',null,{id:`${id}-page-${name}`,role:'tabpanel',tabindex:'0',
          'aria-labelledby':`${id}-tab-${name}`,class:'inspector-page','data-inspector-page':name});
      panel.hidden=true;button.onclick=()=>this.select(name);
      button.onkeydown=event=>{
        if(event.altKey||event.ctrlKey||event.metaKey)return;
        const names=[...this.tabs.keys()],index=names.indexOf(name);
        const next={ArrowLeft:(index+names.length-1)%names.length,ArrowRight:(index+1)%names.length,
          Home:0,End:names.length-1}[event.key];
        if(next===undefined)return;
        event.preventDefault();event.stopPropagation();this.select(names[next],{focus:true});
      };
      this.tabs.set(name,button);this.pages.set(name,panel);list.append(button);container.append(panel);
    }
  }
  select(name,{focus=false}={}) {
    if(!this.tabs.has(name))throw Error('Unknown inspector tab');
    this.active=name;
    for(const [id,button] of this.tabs) {
      const selected=id===name;button.setAttribute('aria-selected',String(selected));
      button.setAttribute('tabindex',selected?'0':'-1');this.pages.get(id).hidden=!selected;
    }
    if(focus)this.tabs.get(name).focus();
    this.onSelect?.(name);
  }
  setLabel(name,text) { this.tabs.get(name).textContent=text; }
}

if(typeof module!=='undefined')module.exports={InspectorTabs};
