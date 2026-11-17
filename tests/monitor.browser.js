// SPDX-License-Identifier: AGPL-3.0-or-later
// Two registered sample targets; startup selects/monitors sample while other remains cached.
async page=>{
  const check=(value,message)=>{if(!value)throw Error(message);};
  const base=new URL('/',page.url()).href,errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const ready=id=>page.waitForFunction(id=>state.target?.id===id&&state.cy&&$('graph').getAttribute('aria-busy')==='false',id);
  await page.evaluate(()=>localStorage.setItem('target','other'));
  await page.goto(base+'?launch-test=start');await ready('sample');
  check(await page.evaluate(()=>state.startup.target==='sample'),'Launch selection was not handed to the browser');
  check((await page.locator('#coverage').innerText()).includes('freshness not checked'),'Saved-only opening implied fresh source coverage');
  await page.goto(base+'?launch-test=deep#/other/entry.json');await ready('other');
  let status=await page.evaluate(()=>fetch('/monitor/status').then(response=>response.json()));
  check(status.targets.find(target=>target.id==='sample').active,'Explicit browsing paused the launch target');
  check(!status.targets.find(target=>target.id==='other').active,'Browsing silently activated a historical target');
  await page.goto(base+'?launch-test=invalid#/not-registered/entry.json');await ready('sample');
  const refused=await page.request.post(base+'monitor/control',{headers:{Origin:'https://foreign.example'},
    data:{action:'activate',target:'other'}});
  check(refused.status()===403,'Foreign activation was accepted');
  const post=(action,target)=>page.evaluate(async({action,target})=>{
    const response=await fetch('/monitor/control',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({action,target})});return {status:response.status,data:await response.json()};
  },{action,target});
  await post('activate','other');status=(await post('activate','other')).data;
  check(status.targets.filter(target=>target.active).length===2,'Activation was not session-local and deduplicated');
  status=(await post('pause','other')).data;
  check(!status.targets.find(target=>target.id==='other').active,'Pause did not deactivate the chosen target');
  check(status.targets.find(target=>target.id==='sample').active,'Pause affected an unrelated target');
  check(errors.length===0,'Runtime errors: '+errors.join('; '));
  return {launchPrecedence:true,explicitLinks:true,inactiveBrowsing:true,originRefusal:true,sessionControls:true};
}
