// SPDX-License-Identifier: AGPL-3.0-or-later
// Static appearance ownership, theme semantics, and native style-property validity.
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const cssText=fs.readFileSync(path.join(root,'viewer/app.css'),'utf8');
const html=fs.readFileSync(path.join(root,'viewer/index.html'),'utf8');
const support=fs.readFileSync(path.join(root,'tests/viewer-support.cjs'),'utf8');
const appearanceSource=fs.readFileSync(path.join(root,'viewer/appearance.js'),'utf8');
const mapSource=fs.readFileSync(path.join(root,'viewer/map.js'),'utf8');

function themeBlocks(){
  const light=cssText.match(/^:root\s*\{([^}]*)\}/m)?.[1];
  const dark=cssText.match(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]*)\}/)?.[1];
  assert.ok(light&&dark,'Expected one light and one dark :root token block');
  return [light,dark];
}
function tokens(block){
  return Object.fromEntries([...block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)].map(match=>[match[1],match[2].trim()]));
}
function rgb(value){
  const match=value.match(/^#([0-9a-f]{6})$/i);
  assert.ok(match,`Expected a six-digit hex color, got ${value}`);
  return [1,3,5].map(index=>parseInt(match[1].slice(index-1,index+1),16));
}
function hue(value){
  const [r,g,b]=rgb(value).map(channel=>channel/255),max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
  if(!delta)return 0;
  let result=max===r?((g-b)/delta)%6:max===g?(b-r)/delta+2:(r-g)/delta+4;
  return (result*60+360)%360;
}
function luminance(value){
  return rgb(value).map(channel=>channel/255).map(channel=>channel<=0.04045?channel/12.92:((channel+0.055)/1.055)**2.4)
    .reduce((sum,channel,index)=>sum+channel*[0.2126,0.7152,0.0722][index],0);
}
function contrast(a,b){const first=luminance(a),second=luminance(b);
  return (Math.max(first,second)+0.05)/(Math.min(first,second)+0.05);}
function styleRules(){
  const values={};for(const block of themeBlocks())Object.assign(values,tokens(block));
  const context={css:name=>values[name]||'#888888'};vm.createContext(context);
  vm.runInContext(appearanceSource,context);
  return context.style();
}
function cytoscape(){return require('../viewer/vendor/cytoscape.min.js');}

test('static Cytoscape appearance has one owner loaded before map.js',()=>{
  assert.match(appearanceSource,/function style\(\)/);
  assert.doesNotMatch(mapSource,/function style\(\)/,'map.js must not own the static stylesheet');
  const appearanceAt=html.indexOf('src="appearance.js"'),mapAt=html.indexOf('src="map.js"');
  assert.ok(appearanceAt>=0&&mapAt>appearanceAt,'index.html must load appearance.js before map.js');
  const supportAppearance=support.indexOf("viewer/appearance.js"),supportMap=support.indexOf("viewer/map.js");
  assert.ok(supportAppearance>=0&&supportMap>supportAppearance,'Node fixtures must load appearance.js before map.js');
});

test('light and dark themes define atmosphere and distinct warning/selection roles',()=>{
  const [light,dark]=themeBlocks().map(tokens);
  for(const [theme,values] of [['light',light],['dark',dark]]){
    for(const name of ['--map-atmosphere-core','--map-atmosphere-edge','--selection','--review-candidate','--review-violation','--bg']){
      assert.ok(values[name],`${theme} theme is missing ${name}`);
    }
    assert.ok(contrast(values['--selection'],values['--bg'])>=3,
      `${theme} selection must meet non-text contrast against the map background`);
    for(const role of ['--review-candidate','--review-violation']){
      const separation=Math.abs(hue(values['--selection'])-hue(values[role]));
      assert.ok(Math.min(separation,360-separation)>=60,
        `${theme} selection and ${role} must occupy different hue families`);
    }
  }
});

test('every Cytoscape style property is valid in the pinned renderer',()=>{
  const renderer=cytoscape()({headless:true,styleEnabled:true,elements:[]});
  try{
    const names=new Set(renderer.style().properties.map(property=>property.name));
    for(const rule of styleRules()){
      assert.equal(typeof rule.selector,'string');
      for(const property of Object.keys(rule.style||{})){
        assert.ok(names.has(property),`Unknown Cytoscape style property: ${property}`);
      }
    }
  }finally{renderer.destroy();}
});

test('expanded containers never receive the selected underlay glow',()=>{
  const cy=cytoscape()({headless:true,styleEnabled:true,elements:[
    {group:'nodes',data:{id:'expanded',caption:'Expanded',spanX:120,spanY:80,layer:2},classes:'expanded member'},
    {group:'nodes',data:{id:'ordinary',caption:'Ordinary'},classes:'member'}]});
  try{
    cy.style(styleRules());
    const expanded=cy.getElementById('expanded').select();
    const ordinary=cy.getElementById('ordinary').select();
    assert.equal(Number(expanded.style('underlay-opacity')),0,'Expanded containers must keep underlay opacity zero');
    assert.ok(Number(ordinary.style('underlay-opacity'))>0.08,
      'Selected ordinary nodes need a stronger underlay than the idle member glow');
  }finally{cy.destroy();}
});
