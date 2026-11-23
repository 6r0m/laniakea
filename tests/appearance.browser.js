// SPDX-License-Identifier: AGPL-3.0-or-later
// Serve the synthetic sample; verify computed luminous styling without replacing the native graph.
async page=>{
  const check=(ok,message)=>{if(!ok)throw Error(message);},errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.waitForFunction(()=>state.cy&&state.universe&&!state.flight);
  check(await page.evaluate(()=>state.target.id==='sample'),'Appearance proof requires the disposable sample');
  await page.evaluate(()=>{window.__appearanceCy=state.cy;
    window.__appearanceElements=state.cy.elements().map(element=>element.id()).sort();});

  for(const theme of ['light','dark']){
    await page.emulateMedia({colorScheme:theme});
    await page.waitForFunction(()=>!state.flight&&!state.gestureActive);
    const values=await page.evaluate(()=>{
      const hue=value=>{
        const channels=value.match(/[0-9a-f]{2}/gi).map(channel=>parseInt(channel,16)/255);
        const [r,g,b]=channels,max=Math.max(...channels),min=Math.min(...channels),delta=max-min;
        if(!delta)return 0;
        let result=max===r?((g-b)/delta)%6:max===g?(b-r)/delta+2:(r-g)/delta+4;
        return (result*60+360)%360;
      };
      const luminance=value=>value.match(/[0-9a-f]{2}/gi).map(channel=>parseInt(channel,16)/255)
        .map(channel=>channel<=0.04045?channel/12.92:((channel+0.055)/1.055)**2.4)
        .reduce((sum,channel,index)=>sum+channel*[0.2126,0.7152,0.0722][index],0);
      const selection=css('--selection'),candidate=css('--review-candidate'),violation=css('--review-violation'),bg=css('--bg');
      return {selection,candidate,violation,bg,
        hueGap:Math.min(
          Math.abs(hue(selection)-hue(candidate)),360-Math.abs(hue(selection)-hue(candidate)),
          Math.abs(hue(selection)-hue(violation)),360-Math.abs(hue(selection)-hue(violation))),
        contrast:(Math.max(luminance(selection),luminance(bg))+0.05)/
          (Math.min(luminance(selection),luminance(bg))+0.05),
        atmosphere:getComputedStyle($('map')).backgroundImage,
        graphBackground:getComputedStyle($('graph')).backgroundColor};
    });
    check(values.hueGap>=60,`${theme} selection shares a hue family with a warning role`);
    check(values.contrast>=3,`${theme} selection has insufficient non-text contrast`);
    check(/radial-gradient/.test(values.atmosphere),`${theme} map atmosphere is missing`);
    check(values.graphBackground==='rgba(0, 0, 0, 0)',`${theme} graph canvas hides the atmosphere`);

    const proof=await page.evaluate(()=>{
      const cy=state.cy,leaf=cy.nodes().not('.expanded').first(),expanded=cy.nodes('.expanded').first();
      leaf.select();const leafUnderlay=Number(leaf.style('underlay-opacity'));
      if(expanded.length)expanded.select();const expandedUnderlay=expanded.length?Number(expanded.style('underlay-opacity')):0;
      leaf.unselect();if(expanded.length)expanded.unselect();
      return {sameGraph:state.cy===window.__appearanceCy,
        ids:cy.elements().map(element=>element.id()).sort(),leafUnderlay,expandedUnderlay,
        selected:cy.elements(':selected').length};
    });
    check(proof.selected===0,'Theme or selection checks left a selection behind');
    check(proof.leafUnderlay>0.08,'Selected ordinary nodes have no luminous underlay');
    check(proof.expandedUnderlay===0,'Expanded containers received a selected underlay');
    check(proof.sameGraph,`${theme} theme change replaced the renderer`);
    check(JSON.stringify(proof.ids)===JSON.stringify(await page.evaluate(()=>window.__appearanceElements)),
      `${theme} theme change replaced graph elements`);
  }
  check(!errors.length,'Runtime errors: '+errors.join(' / '));
  return {themes:true,atmosphere:true,selection:true,expandedUnderlay:true,graphStable:true,errors};
}
