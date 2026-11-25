// SPDX-License-Identifier: AGPL-3.0-or-later
// Use test_source_preview.browser_fixture(base, occurrences=4).
async(page,{screenshot=async()=>{}}={})=>{
  const check=(ok,message)=>{if(!ok)throw Error(message);},errors=[],writes=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.method()==='POST')writes.push(request.url());});
  await page.waitForFunction(()=>state.cy&&state.review?.data&&!state.review.loading);
  if(await page.locator('#analysis').isVisible())await page.locator('#analysis-close').click();
  await page.locator('#toggle-review').click();await page.locator('#review-items [data-finding]').first().click();
  const compare=page.getByRole('button',{name:'Compare matches',exact:true});
  await page.waitForFunction(()=>document.querySelector('.source-evidence .primary-action')?.disabled===false);
  const before=await page.evaluate(()=>JSON.stringify([state.cy.pan(),worldZoom(),state.positionCache.layouts]));
  await compare.click();const view=page.locator('.source-comparison'),panes=view.locator('.source-pane');
  await view.getByText('Showing matches 1 and 2 of 4',{exact:true}).waitFor();
  await panes.nth(1).locator('.source-code').waitFor();
  check(await panes.count()===2,'Four locations should retain a bounded two-pane comparison');
  check(await panes.first().getByRole('button',{name:'Previous match',exact:true}).isDisabled(),'First match has a predecessor');
  for(const number of [3,4]){
    await panes.nth(1).getByRole('button',{name:'Next match',exact:true}).click();
    await view.getByText(`Showing matches 1 and ${number} of 4`,{exact:true}).waitFor();
    await panes.nth(1).getByText(`Match ${number} of 4`,{exact:true}).waitFor();
    await panes.nth(1).locator('.source-code').waitFor();
  }
  check(await panes.nth(1).getByRole('button',{name:'Next match',exact:true}).isDisabled(),'Fourth match is not the last location');
  await panes.nth(1).getByRole('button',{name:'Previous match',exact:true}).click();
  await view.getByText('Showing matches 1 and 3 of 4',{exact:true}).waitFor();
  await panes.nth(1).getByRole('combobox',{name:'Match to compare',exact:true}).selectOption('1');
  await view.getByText('Showing matches 1 and 2 of 4',{exact:true}).waitFor();
  await panes.nth(1).locator('.source-code').waitFor();
  await screenshot(page,'comparison-four-locations');
  await view.getByRole('button',{name:'Back to map',exact:true}).click();
  check(await page.evaluate(()=>JSON.stringify([state.cy.pan(),worldZoom(),state.positionCache.layouts]))===before,'Navigation changed map or pins');
  check(!errors.length&&!writes.length,'Match navigation caused errors or writes');
  return{fourLocations:true,twoVisible:true,allReachable:true,counts:true,boundaries:true,mapUnchanged:true,errors};
}
