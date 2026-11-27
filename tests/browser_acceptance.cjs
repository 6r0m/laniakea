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
    return typeof state !== 'undefined' && state.cy && state.positionCache && {ready: true};
  }, null, {polling: 100});
  const status = await outcome.jsonValue();
  if (!status.ready) throw new Error(`Viewer startup failed: ${status.error}`);
}

async function main() {
  const [name, url, channel, source, mode] = process.argv.slice(2);
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
  const browser = await chromium.launch({channel, headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
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
      const result = await scenario(page, {change, waitForViewer});
      if (measuring) console.log(JSON.stringify({workload: name, probe, ...result}));
    }
    if (errors.length) throw new Error(errors.join('\n'));
    process.stdout.write(`${name} passed\n`);
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
