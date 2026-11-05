// SPDX-License-Identifier: AGPL-3.0-or-later
// Evaluate this Playwright function on a served synthetic sample. No project-specific data is used.
async (page) => {
  const base = page.url().split('/').slice(0, 3).join('/');
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  await page.setViewportSize({width:1440,height:900});
  await page.goto(`${base}/`);
  await page.reload();
  await page.waitForFunction(() => typeof state !== 'undefined' && state.cy && state.positionCache);
  const before = await page.evaluate(() => {
    const node = state.cy.getElementById('engine');
    if (!node.length) throw new Error('Run this check on the synthetic sample entry view');
    const p = node.renderedPosition(), box = $('graph').getBoundingClientRect();
    const alignment = node.style('text-halign');
    const offset = alignment === 'right' ? 24 : alignment === 'left' ? -24 : 20;
    const below = node.style('text-valign') === 'bottom' ? 18 : 0;
    return { world: { ...node.position() }, pan: { ...state.cy.pan() },
      start: { x: box.x + p.x + offset, y: box.y + p.y + below },
      target: state.target.id, scope: state.file, mode: $('layout').value };
  });
  const requests = [];
  const observe = request => { if (request.method() === 'POST') requests.push(request.url()); };
  page.on('request', observe);
  try {
    await page.mouse.move(before.start.x, before.start.y);
    await page.mouse.down();
    await page.mouse.move(before.start.x + 50, before.start.y + 100, { steps: 10 });
    await page.mouse.up();
    const moved = await page.evaluate(() => ({ world: { ...state.cy.getElementById('engine').position() },
      pan: { ...state.cy.pan() } }));
    check(Math.abs(moved.world.y - before.world.y) > 10, 'Dragging the label did not move its node');
    check(Math.abs(moved.pan.y - before.pan.y) < 1, 'Dragging the label panned the canvas');
    await page.waitForFunction(() => state.positionCache.pending === 0 &&
      $('position-status').textContent === 'Positions saved');
    check(requests.length === 1, 'A drag must produce exactly one save request');
    const stored = await page.evaluate(async ({target, scope, mode}) => {
      const response = await fetch(`/layout/${encodeURIComponent(target)}/${encodeURIComponent(scope)}`, {cache:'no-store'});
      if (!response.ok) throw new Error(`Saved positions HTTP ${response.status}`);
      return (await response.json())[mode].engine;
    }, before);
    check(Math.abs(stored.y - moved.world.y) < 0.001, 'Released coordinates were not saved on the server');
    // A fresh context has no browser storage, HTTP cache or previous page state.
    const fresh = await page.context().browser().newContext();
    try {
      const reopenedPage = await fresh.newPage();
      await reopenedPage.goto(`${base}/`);
      await reopenedPage.waitForFunction(() => typeof state !== 'undefined' && state.cy && state.positionCache);
      const reopened = await reopenedPage.evaluate(() => ({ ...state.cy.getElementById('engine').position() }));
      check(Math.abs(reopened.x - stored.x) < 0.001 && Math.abs(reopened.y - stored.y) < 0.001,
        'The bare address did not restore the saved pin');
    } finally {
      await fresh.close();
    }
    await page.evaluate(() => openScope('module~3ASampleDisabled.json'));
    const single = await page.evaluate(() => ({ count: state.cy.nodes().length, zoom: state.cy.zoom(),
      border: state.cy.nodes().first().numericStyle('border-width') * state.cy.zoom() }));
    check(single.count === 1, 'The disabled synthetic module should be an isolated leaf');
    check(single.zoom <= 1.2 && single.border <= 2.01, 'Fitting a single leaf distorts its border');
    await page.setViewportSize({width:390,height:844});
    const narrow = await page.evaluate(() => {
      const nodes=Array.from({length:14},(_,i)=>({id:`sample-${i}`,label:`Sample group ${i}`,level:'package',
        parent:'sample-root',boundary:false,status:'in-target'}));
      state.index={nodes:[{id:'sample-root',level:'project',child_count:14},
        ...nodes.map(n=>({...n,child_count:5}))]};
      state.shard={scope:'sample-root',title:'Sample',parents:[],members:nodes.map(n=>n.id),nodes,edges:[],drill:{}};
      state.positionCache={layouts:{},status(){}};
      renderGraph();
      const xs=state.cy.nodes().map(n=>n.renderedPosition('x'));
      return {span:Math.max(...xs)-Math.min(...xs),width:state.cy.width()};
    });
    check(narrow.span > narrow.width * 0.5, 'Fitting long labels collapsed the narrow constellation');
    return { labelDrag: true, savedToWorkspace: true, bareAddressRestored: true,
      singleNodeLegible: true, narrowConstellationLegible:true, requestsPerDrag: requests.length };
  } finally {
    page.off('request', observe);
  }
}
