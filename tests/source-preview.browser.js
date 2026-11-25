// SPDX-License-Identifier: AGPL-3.0-or-later
// Serve the disposable test_source_preview fixture; never mutate an analysed project.
async(page,{change,screenshot=async()=>{}})=>{
 const check=(ok,message)=>{if(!ok)throw Error(message);},errors=[],writes=[],reads=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')writes.push(r.url());if(r.url().includes('/source?'))reads.push(r.url());});
 await page.waitForFunction(()=>state.cy&&state.review?.data&&!state.review.loading);
 if(await page.locator('#analysis').isVisible())await page.locator('#analysis-close').click();
 await page.locator('#toggle-review').click();await page.locator('#review-items [data-finding]').first().click();
 const review=page.locator('#inspector-page-architecture'),compare=review.getByRole('button',{name:'Compare matches',exact:true});
 await compare.first().waitFor({state:'visible'});
 check(await compare.count()===1,'Selected duplication has no direct Compare matches action');
 await review.getByText('Locations 1-50 of 51',{exact:true}).waitFor();
 check(await review.locator('.source-evidence details').count()===0,'Source evidence still uses nested spoilers');
 check(reads.length===0,'Listing finding ranges read source bodies');
 const draft=review.getByLabel('Decision reason (optional)');await draft.fill('Synthetic decision draft');
 const camera=()=>page.evaluate(()=>{const c=state.cy,p=c.pan(),z=worldZoom();return JSON.stringify([
  [(c.width()/2-p.x)/z,(c.height()/2-p.y)/z].map(v=>Math.round(v*1e6)/1e6),z,[...state.universe.expanded],state.selection.id]);});
 const before=await camera(),pins=await page.evaluate(()=>JSON.stringify(state.positionCache.layouts));
 await compare.click();
 const view=page.locator('.source-comparison'),panes=view.locator('.source-pane');
 await view.waitFor();await view.locator('.source-code').nth(1).waitFor();
 check(await panes.count()===2,'Compare does not open two ranges directly');
 await view.getByText('Showing matches 1 and 2 of 51',{exact:true}).waitFor();
 await panes.nth(1).getByRole('button',{name:'Next match',exact:true}).click();
 await view.getByText('Showing matches 1 and 3 of 51',{exact:true}).waitFor();
 await panes.nth(1).locator('.source-code').waitFor();
 await panes.nth(1).getByRole('button',{name:'Next match',exact:true}).click();
 await view.getByText('Showing matches 1 and 4 of 51',{exact:true}).waitFor();
 await panes.nth(1).locator('.source-code').waitFor();
 await panes.nth(1).getByRole('combobox',{name:'Match to compare',exact:true}).selectOption('1');
 await panes.nth(1).locator('.source-code').waitFor();
 check((await panes.first().locator('.source-code').innerText()).includes('<script>throw 1</script>'),'Source markup lost');
 check(await view.locator('script,textarea,[contenteditable="true"]').count()===0,'Source is executable or editable');
 check(await panes.first().locator('.source-line.matched').count()===20,'Match highlight missing');
 check(await page.locator('#graph').evaluate(n=>n.inert),'Graph is interactive beneath comparison');
 check(await page.evaluate(()=>liveBlockReason().includes('Comparing')),'Live adoption can replace compared evidence');
 await view.focus();for(const key of ['Backspace','/','Enter','ArrowLeft','+'])await view.press(key);
 check(await camera()===before,'Comparison keys moved the hidden galaxy');
 await panes.nth(1).getByRole('combobox').selectOption('2');await panes.nth(1).locator('.source-code').waitFor();
 check(reads.some(u=>u.endsWith('occurrence=2')),'Changing a range lost its occurrence identity');
 await panes.nth(1).getByRole('button',{name:'Next ranges',exact:true}).click();
 await panes.nth(1).getByText('51-51 of 51 ranges',{exact:true}).waitFor();
 await panes.nth(1).locator('.source-code').waitFor();
 await panes.nth(1).getByRole('button',{name:'Previous match',exact:true}).click();
 await panes.nth(1).getByText('Match 50 of 51',{exact:true}).waitFor();
 await panes.nth(1).locator('.source-code').waitFor();
 await panes.nth(1).getByRole('button',{name:'Next match',exact:true}).click();
 await panes.nth(1).getByText('Match 51 of 51',{exact:true}).waitFor();
 await panes.nth(1).locator('.source-code').waitFor();
 check(await panes.nth(1).getByRole('button',{name:'Next match',exact:true}).isDisabled(),'Last match permits navigation beyond recorded evidence');
 check(await view.locator('.source-code').count()===2,'Paging retains more than two source bodies');
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.copiedLocation=value;}}}));
 await panes.first().getByRole('button',{name:'Copy path',exact:true}).click();
 check(await page.evaluate(()=>copiedLocation.endsWith('/API.h')),'Copy path contains coordinates');
 await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('denied');};});
 await panes.first().getByRole('button',{name:'Copy path',exact:true}).click();
 check(await panes.first().locator('.source-copy-fallback').evaluate(n=>n.readOnly&&n===document.activeElement),'Clipboard refusal has no selectable path');
 for(const colorScheme of ['dark','light'])for(const width of [1600,390]){
  await page.emulateMedia({colorScheme});await page.setViewportSize({width,height:1000});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Comparison overflows page');
  if(width===1600){const a=await panes.first().boundingBox(),b=await panes.nth(1).boundingBox();check(b.x>=a.x+a.width-1,'Wide panes do not compare side by side');}
  if(width===390)check(await panes.first().evaluate(node=>{
    const content=node.querySelector('.source-pane-content'),box=content.getBoundingClientRect(),pane=node.getBoundingClientRect(),code=content.querySelector('.source-code').getBoundingClientRect();
    return box.bottom<=pane.bottom&&(![getComputedStyle(content).overflowY,getComputedStyle(content).overflowX].includes('visible')||code.bottom<=box.bottom);
  }),'Narrow code paints beyond its pane after clipboard refusal');
  await screenshot(page,`comparison-${colorScheme}-${width}`);
 }
 await page.setViewportSize({width:1440,height:1000});
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 await view.getByRole('button',{name:'Back to map',exact:true}).click();
 check(await view.count()===0,'Back does not close comparison');
 check(await camera()===before,'Returning changed camera, hierarchy or selection: '+before+' / '+await camera());
 check(await compare.evaluate(n=>n===document.activeElement),'Back lost invoking focus');
 check(await draft.inputValue()==='Synthetic decision draft','Comparison replaced triage draft');
 check(!await page.locator('#graph').evaluate(n=>n.inert),'Graph remains inert after Back');
 await review.getByRole('button',{name:'Next source ranges',exact:true}).click();
 await review.getByText('Locations 51-51 of 51',{exact:true}).waitFor();
 await compare.click();await view.locator('.source-code').first().waitFor();
 check(await panes.count()===2,'Compare on a final one-item page does not obtain a second recorded range');
 await view.press('Escape');
 check(await review.getByText('Locations 51-51 of 51',{exact:true}).isVisible(),'Compare changed the range-list page');
 await review.getByRole('button',{name:'Previous source ranges',exact:true}).click();
 await review.getByText('Locations 1-50 of 51',{exact:true}).waitFor();
 const preview=review.locator('.source-evidence-range').first().getByRole('button',{name:/Preview code/});
 await preview.click();await view.locator('.source-code').waitFor();check(await panes.count()===1,'One file preview opens unrelated ranges');
 await view.press('Escape');check(await view.count()===0,'Escape does not return to map');
 await change('edit');await compare.click();await panes.first().getByText(/Changed since analysis/).waitFor();
 check(await panes.first().locator('.source-code').count()===0,'Changed source shown as recorded code');await view.press('Escape');
 await change('missing');await compare.click();await panes.first().getByText('The recorded source file is no longer available.',{exact:true}).waitFor();await view.press('Escape');await change('restore');
 await page.route('**/source?*',r=>r.fulfill({status:503,body:'unavailable'}));await compare.click();await view.getByText(/HTTP 503/).first().waitFor();await view.press('Escape');await page.unroute('**/source?*');
 await page.route('**/source?*',r=>r.fulfill({status:200,contentType:'application/json',body:'{"status":"matching","lines":[]}'}));await compare.click();await view.getByText('Invalid source preview',{exact:true}).first().waitFor();await view.press('Escape');await page.unroute('**/source?*');
 let arrive,release;const arrived=new Promise(r=>arrive=r),hold=new Promise(r=>release=r);
 await page.route('**/source?*',async route=>{arrive();await hold;try{await route.continue();}catch(e){if(!route.request().failure())throw e;}});
 await compare.click();await arrived;await view.getByRole('button',{name:'Back to map',exact:true}).click();release();await page.waitForFunction(()=>!state.review.requests.size);
 check(await view.count()===0,'Late source response reopened comparison');await page.unroute('**/source?*');
 await compare.click();await view.locator('.source-code').nth(1).waitFor();
 await page.locator('#inspector-tab-details').click();check(await view.count()===0,'Changing Inspector tab keeps obsolete comparison');
 await page.locator('#inspector-tab-architecture').click();await compare.click();await view.locator('.source-code').nth(1).waitFor();
 await page.getByRole('button',{name:'Close inspector',exact:true}).click();check(await view.count()===0,'Closing Inspector keeps comparison');
 check(await page.evaluate(p=>JSON.stringify(state.positionCache.layouts)===p,pins),'Comparison changed saved pins');
 check(writes.length===0,'Comparison wrote state');check(errors.length===0,errors.join('; '));
 return{directComparison:true,noSpoilers:true,twoPanes:true,singlePreview:true,paging:true,readOnly:true,hashDrift:true,
  missing:true,readFailure:true,invalidResponse:true,lateClose:true,keyboard:true,camera:true,triageDraft:true,copyFallback:true,
  liveDeferral:true,themes:true,narrow:true,pinsUnchanged:true,errors};
}
