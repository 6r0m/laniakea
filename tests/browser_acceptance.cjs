// SPDX-License-Identifier: AGPL-3.0-or-later
const fs = require('node:fs/promises');
const path = require('node:path');
const vm = require('node:vm');
const {chromium} = require('playwright-core');

async function main() {
  const [name, url, channel, source] = process.argv.slice(2);
  const filename = path.join(__dirname, `${name}.browser.js`);
  const scenario = vm.runInThisContext(`(${await fs.readFile(filename, 'utf8')}\n)`, {filename});
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
    await page.goto(url);
    await page.waitForFunction(() => typeof state !== 'undefined' && state.cy && state.positionCache);
    await scenario(page, {change});
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
