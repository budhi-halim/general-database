import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/halim/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = 'http://127.0.0.1:4173';
const routes = ['sales-orders', 'stock-requests', 'sample-requests', 'last-production', 'technical-information'].map(name => `/general-database/${name}.html`).concat('/exchange-rate/');
const output = new URL('../../isi/family-tools/evidence/table-workspaces/', import.meta.url);
await mkdir(output, { recursive: true });
for (const repo of ['isi', 'isi-share']) {
  const apps = JSON.parse(await readFile(new URL(`../../${repo}/data/app_list.json`, import.meta.url)));
  assert.equal(apps.filter(app => app.name === 'Technical Information').length, 1);
  assert.equal(apps.find(app => app.name === 'Technical Information').url, 'https://budhi-halim.github.io/general-database/technical-information.html');
}

for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel, headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const rate = { date: '2026-09-20', final: true };
  for (const category of ['e_rate', 'tt_counter', 'bank_notes']) for (const side of ['buying', 'selling']) {
    rate[`${category}_${side}_rate`] = 16000;
    rate[`${category}_${side}_rate_buffered`] = 16500;
  }
  await page.route('**/exchange-rate/data/today.json', route => route.fulfill({ json: rate }));
  await page.route('**/exchange-rate/data/history.json', route => route.fulfill({ json: Array.from({ length: 50 }, (_, i) => ({ ...rate, date: `2026-08-${String(i % 28 + 1).padStart(2, '0')}` })) }));
  async function bounds() {
    const metrics = await page.evaluate(() => {
      const table = document.querySelector('.isi-table-region').getBoundingClientRect();
      const footer = document.querySelector('.workspace-footer').getBoundingClientRect();
      return { overflow: document.documentElement.scrollHeight - innerHeight, horizontal: document.documentElement.scrollWidth - innerWidth, tableBottom: table.bottom, tableHeight: table.height, footerTop: footer.top, footerBottom: footer.bottom, height: innerHeight };
    });
    assert.ok(metrics.overflow <= 1 && metrics.horizontal <= 1, JSON.stringify(metrics));
    assert.ok(metrics.tableHeight > 20 && metrics.tableBottom <= metrics.footerTop + 1 && metrics.footerBottom <= metrics.height, JSON.stringify(metrics));
    const next = await page.getByRole('button', { name: 'Next', exact: true }).boundingBox();
    assert.ok(next.y >= 0 && next.y + next.height <= metrics.height, JSON.stringify(next));
  }
  try {
    for (const route of routes) {
      await page.setViewportSize({ width: 1600, height: 900 });
      await page.goto(base + route);
      await page.waitForFunction(() => document.querySelectorAll('tbody tr').length > 0);
      await page.getByLabel('Rows', { exact: true }).selectOption('100');
      await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 100);
      for (const [width, height] of [[360, 640], [430, 740], [768, 600], [1600, 900], [2560, 1600], [800, 320], [320, 320]]) {
        await page.setViewportSize({ width, height });
        await bounds();
        await page.locator('.workspace-table-tools > summary').click();
        await bounds();
        await page.locator('.workspace-columns > summary').click();
        await bounds();
        await page.locator('.workspace-table-tools > summary').click();
        await page.locator('.isi-table-region').evaluate(node => { node.scrollTop = node.scrollHeight; node.scrollLeft = node.scrollWidth; });
        await bounds();
        await page.locator('.isi-table-region').evaluate(node => { node.scrollTop = 0; node.scrollLeft = 0; });
      }
      await page.setViewportSize({ width: 1600, height: 900 });
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await page.waitForFunction(() => new URL(location.href).searchParams.get('page') === '2');
      await page.reload();
      await page.waitForFunction(() => document.querySelectorAll('tbody tr').length > 0);
      assert.equal(new URL(page.url()).searchParams.get('page'), '2');
      await bounds();
      await page.getByRole('button', { name: /^View record/ }).first().click();
      await page.locator('dialog').waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      await page.locator('.workspace-table-tools > summary').click();
      await page.getByRole('searchbox', { name: 'Search', exact: true }).fill('no-such-record-zzzz');
      await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 0);
      await bounds();
      await page.getByRole('button', { name: 'Reset', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 25);
      await page.locator('.workspace-table-tools > summary').click();
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.screenshot({ path: fileURLToPath(new URL(`${channel}-${route.split('/').filter(Boolean).at(-1)}.png`, output)) });
      console.log(`${channel} ${route}: viewport containment, expanded controls, table scroll, pagination, details, search/reset passed`);
    }
    for (const repo of ['isi', 'isi-share']) {
      await page.goto(`${base}/${repo}/`);
      const link = page.getByRole('link', { name: /Technical Information/ });
      await link.waitFor();
      assert.ok((await link.getAttribute('href')).startsWith(`${base}/general-database/technical-information.html`));
      const opened = page.waitForEvent('popup');
      await link.click();
      const destination = await opened;
      await destination.waitForFunction(() => document.querySelectorAll('tbody tr').length === 25);
      await destination.close();
    }
    await page.goto(`${base}/pl-isi/`);
    await page.waitForFunction(() => document.querySelectorAll('.product-name-content').length > 100);
    assert.equal(await page.locator('body').evaluate(node => node.classList.contains('isi-data-workspace')), false);
    assert.ok(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
