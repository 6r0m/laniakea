// SPDX-License-Identifier: AGPL-3.0-or-later
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {chromium} = require('playwright-core');

async function loadScenario(name) {
  const filename = path.join(__dirname, name);
  return vm.runInThisContext(`(${await fs.readFile(filename, 'utf8')}\n)`, {filename});
}

async function waitForViewer(page) {
  // The map can initialize while Chromium is withholding animation frames.
  const outcome = await page.waitForFunction(() => {
    const error = document.getElementById('error');
    if (error && !error.hidden) return {error: error.textContent};
    return document.getElementById('graph')?.getAttribute('aria-busy') === 'false' &&
      typeof state !== 'undefined' && state.cy && state.positionCache && {ready: true};
  }, null, {polling: 100});
  const status = await outcome.jsonValue();
  if (!status.ready) throw new Error(`Viewer startup failed: ${status.error}`);
}

async function viewerState(page) {
  return page.evaluate(() => {
    const graph = document.getElementById('graph');
    const current = typeof state === 'undefined' ? {} : state;
    const {cy, selection, scopeShard, mapSize} = current;
    const inspector = document.getElementById('details');
    const root = getComputedStyle(document.documentElement);
    const paletteTokens = typeof STAR_FAMILIES === 'undefined' ? [] : STAR_FAMILIES.map(family => '--star-' + family);
    return {
      url: location.href, navigation: current.navigation, busy: graph?.getAttribute('aria-busy'),
      scope: scopeShard?.scope, selection: selection?.id || selection?.key || null,
      inspector: {open: inspector && !inspector.hidden, tab: inspector?.querySelector('[aria-selected=true]')?.textContent,
        findings: [...(inspector?.querySelectorAll('[data-inspection-finding]') || [])].map(row => row.dataset.inspectionFinding)},
      camera: cy && {zoom: cy.zoom(), pan: cy.pan(), flight: Boolean(current.flight)},
      graph: graph?.getBoundingClientRect().toJSON(), mapSize, renderer: cy && {width: cy.width(), height: cy.height()},
      tap: window.acceptanceTap,
      stylesheet: document.querySelector('link[href="app.css"]')?.sheet?.cssRules.length ?? null,
      theme: Object.fromEntries(['--map-atmosphere-core', ...paletteTokens]
        .map(token => [token, root.getPropertyValue(token).trim()])),
    };
  });
}

async function main() {
  const [name, url, channel, source, trace, mode] = process.argv.slice(2);
  const measuring = mode === '--measure';
  const probes = measuring ? ['viewer.performance.js', 'viewer.flight-performance.js'] : [`${name}.browser.js`];
  const original = source ? await fs.readFile(source) : null;
  const change = async action => {
    if (!original) throw new Error('This fixture has no editable source');
    switch (action) {
      case 'edit': return fs.writeFile(source, Buffer.concat([original, Buffer.from('// changed source\n')]));
      case 'missing': return fs.unlink(source);
      case 'restore': return fs.writeFile(source, original);
      default: throw new Error(`Unexpected source action: ${action}`);
    }
  };
  const browser = await chromium.launch({channel: channel === 'chromium' ? undefined : channel, headless: true});
  let context, failure, tracing = false;
  const exceptions = [], diagnostics = [];
  const injected = new WeakSet();
  const injectFault = (route, response) => {
    injected.add(route.request());
    return route.fulfill(response);
  };
  const recordRequest = (request, result) => diagnostics.push({
    method: request.method(), url: request.url(), type: request.resourceType(),
    injected: injected.has(request), ...result,
  });
  try {
    console.log(`${name}: ${channel} ${browser.version()}`);
    context = await browser.newContext({viewport: {width: 1440, height: 1000}});
    context.on('weberror', event => exceptions.push(event.error().stack));
    context.on('console', message => {
      if (message.type() === 'error') diagnostics.push({console: message.text(), location: message.location()});
    });
    context.on('requestfailed', request => recordRequest(request, {failure: request.failure()?.errorText}));
    context.on('response', response => {
      if (response.status() >= 400) recordRequest(response.request(), {status: response.status()});
    });
    if (!measuring) {
      await context.tracing.start({screenshots: true, snapshots: true});
      tracing = true;
    }
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const start = performance.now();
    await page.goto(url);
    await waitForViewer(page);
    if (measuring) {
      console.log(JSON.stringify({workload: name, browser: browser.version(), channel, viewport: page.viewportSize(),
        platform: os.platform(), logicalCpus: os.cpus().length, viewerReadyMs: Math.round(performance.now() - start)}));
    }
    for (const probe of probes) {
      const scenario = await loadScenario(probe);
      const result = await scenario(page, {change, waitForViewer, injectFault});
      if (measuring) console.log(JSON.stringify({workload: name, probe, ...result}));
    }
    if (exceptions.length) throw new Error(exceptions.join('\n'));
    if (tracing) await context.tracing.stop();
    process.stdout.write(`${name} passed\n`);
  } catch (error) {
    failure = error;
    console.error(JSON.stringify({case: name, exceptions, diagnostics}, null, 2));
    const reports = await Promise.allSettled([
      ...(context?.pages() || []).map(page =>
        viewerState(page).then(scene => console.error('Viewer state:', JSON.stringify(scene)))),
      tracing && fs.mkdir(path.dirname(trace), {recursive: true})
        .then(() => context.tracing.stop({path: trace}))
        .then(() => console.error('Playwright trace:', trace)),
    ]);
    for (const report of reports) {
      if (report.status === 'rejected') console.error('Could not capture diagnostic:', report.reason);
    }
    throw error;
  } finally {
    await browser.close().catch(error => {
      if (!failure) throw error;
      console.error('Could not close browser:', error);
    });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
