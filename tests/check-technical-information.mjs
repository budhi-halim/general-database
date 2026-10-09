import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { technicalDate, requestedDocuments } from '../js/technical-information.js';
import { filterTable, readTableState, writeTableState } from '../../isi/family/js/table-logic.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/halim/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.ISI_PREVIEW_URL || 'http://127.0.0.1:4173';
const output = new URL('../../isi/family-tools/evidence/technical-information/', import.meta.url);
await mkdir(output, { recursive: true });
for (const [input, expected] of [['19-Sep-2026', '2026-09-19'], ['1-jan-2025', '2025-01-01'], ['29-Feb-2024', '2024-02-29'], ['29-Feb-2025', ''], ['31-Apr-2026', ''], [null, ''], ['2026-09-20', '2026-09-20']]) assert.equal(technicalDate(input), expected);
assert.deepEqual(requestedDocuments('["Spec","","Label \\/ package"]'), ['Spec', 'Label / package']);
assert.deepEqual(requestedDocuments(JSON.stringify('["Spec"]')), ['Spec']);
assert.deepEqual(requestedDocuments('Plain request'), ['Plain request']);
assert.deepEqual(requestedDocuments(null), []);
const columns = [{ key: 'date', type: 'date' }, { key: 'docs', filter: true }, { key: 'pic', filter: true }];
const state = readTableState('?f-docs=Spec&f-docs=Label&f-pic=A&sort=date&dir=asc', columns);
assert.deepEqual(readTableState(writeTableState(state), columns), state);
const rows = [
  { id: 0, values: { date: '2026-01-01', docs: 'Spec', pic: 'A' }, lists: { docs: ['Spec'] }, search: 'spec a' },
  { id: 1, values: { date: '2025-12-31', docs: 'Label', pic: 'A' }, lists: { docs: ['Label'] }, search: 'label a' },
  { id: 2, values: { date: '2026-01-02', docs: 'Spec', pic: 'B' }, lists: { docs: ['Spec'] }, search: 'spec b' },
];
assert.deepEqual(filterTable(rows, columns, state, 'date').rows.map(row => row.id), [1, 0]);
assert.deepEqual(filterTable(rows, columns, { ...state, query: 'spec a' }, 'date').rows.map(row => row.id), [0]);

const raw = JSON.parse(await readFile(new URL('../data/technical_information.json', import.meta.url)));
assert.equal(raw.recordsFiltered, raw.data.length);
const fixture = { recordsFiltered: 3, data: [
  { id_tir: '001', tir_no: 'A', date_tir: '2-Jan-2026', customer: 'Customer A', pic: 'Alex', tir_ir: '["Spec","Label",""]', tir_additional_remark: '<img src=x onerror="window.injected=true">Safe remark', view2: '<button onclick="window.injected=true">Delete</button>' },
  { id_tir: '002', tir_no: 'B', date_tir: '31-Dec-2025', customer: 'Customer B', pic: 'Blair', tir_ir: '["Label"]' },
  { id_tir: '003', tir_no: 'C', date_tir: '1-Jan-2026', customer: 'Customer C', pic: 'Alex', tir_ir: '["<img src=x onerror=window.injected=true>Certificate"]' },
] };

for (const channel of ['chrome', 'msedge']) {
  const browser = await chromium.launch({ channel, headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`${base}/general-database/technical-information.html`);
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 25);
    assert.match(await page.locator('.workspace-footer').innerText(), new RegExp(raw.data.length.toLocaleString()));
    assert.ok(await page.locator('tbody ul li').count() > 0);
    await page.locator('thead th').first().locator('button').click();
    await page.waitForFunction(() => document.querySelector('th').getAttribute('aria-sort') === 'ascending');
    const dates = await page.locator('tbody tr td:first-child').allTextContents();
    assert.deepEqual(dates, [...dates].sort());
    await page.getByLabel('Rows', { exact: true }).selectOption('100');
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 100);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.waitForFunction(() => new URL(location.href).searchParams.get('page') === '2');
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 100);
    assert.equal(new URL(page.url()).searchParams.get('page'), '2');
    for (const width of [360, 430, 768, 1600, 2560]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if ([360, 1600].includes(width)) {
        await page.emulateMedia({ colorScheme: 'dark' });
        await page.screenshot({ path: fileURLToPath(new URL(`${channel}-${width}-dark.png`, output)) });
        await page.emulateMedia({ colorScheme: 'light' });
        await page.screenshot({ path: fileURLToPath(new URL(`${channel}-${width}-light.png`, output)) });
      }
    }
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.route('**/data/technical_information.json', route => route.fulfill({ json: fixture }));
    await page.goto(`${base}/general-database/technical-information.html`);
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 3);
    assert.deepEqual(await page.locator('tbody tr td:nth-child(2)').allTextContents(), ['A', 'C', 'B']);
    await page.locator('.workspace-table-tools > summary').click();
    const docs = page.locator('.workspace-multiselect').filter({ has: page.locator('summary', { hasText: 'Requested documents' }) });
    await docs.locator('summary').click();
    await docs.getByRole('checkbox', { name: 'Spec', exact: true }).check();
    await docs.getByRole('checkbox', { name: 'Label', exact: true }).check();
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 2);
    await page.keyboard.press('Escape');
    const pic = page.locator('.workspace-multiselect').filter({ has: page.locator('summary', { hasText: /^PIC/ }) });
    await pic.locator('summary').click();
    await pic.getByRole('checkbox', { name: 'Alex', exact: true }).check();
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
    assert.deepEqual(new URL(page.url()).searchParams.getAll('f-tir_ir'), ['Spec', 'Label']);
    await page.getByRole('button', { name: 'View record A', exact: true }).click();
    assert.deepEqual(await page.locator('dialog li').allTextContents(), ['Spec', 'Label']);
    assert.equal(await page.locator('dialog img, dialog [onclick]').count(), 0);
    assert.ok(!(await page.locator('dialog').innerText()).includes('Delete'));
    await page.keyboard.press('Escape');
    await page.locator('.workspace-table-tools > summary').click();
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 3);
    assert.equal(await page.locator('tbody img, tbody [onclick]').count(), 0);
    assert.equal(await page.evaluate(() => window.injected), undefined);
    await page.unroute('**/data/technical_information.json');
    await page.route('**/data/technical_information.json', route => route.fulfill({ status: 503, body: 'Unavailable' }));
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await page.getByText('Refresh failed. Previously loaded records are still shown.', { exact: true }).first().waitFor();
    assert.equal(await page.locator('tbody tr').count(), 3);

    await page.goto(`${base}/pl-isi/`);
    await page.waitForFunction(() => document.querySelectorAll('.product-name-content').length > 100);
    const deviations = await page.locator('.product-name-content').evaluateAll(nodes => nodes.slice(0, 100).map(node => {
      const inner = node.getBoundingClientRect(), cell = node.parentElement.getBoundingClientRect();
      return Math.abs(inner.top + inner.height / 2 - cell.top - cell.height / 2);
    }));
    assert.ok(Math.max(...deviations) <= 1, `Name centering: ${Math.max(...deviations)}`);
    const backTop = page.locator('.workspace-back-top');
    assert.equal(await backTop.getAttribute('aria-hidden'), 'true');
    await page.evaluate(() => scrollTo({ top: 2000, behavior: 'instant' }));
    await page.waitForFunction(() => document.querySelector('.workspace-back-top').dataset.state === 'visible');
    await page.waitForTimeout(70);
    const animation = await backTop.evaluate(node => ({ opacity: Number(getComputedStyle(node).opacity), transform: getComputedStyle(node).transform }));
    assert.ok(animation.opacity > 0 && animation.opacity < 1, JSON.stringify(animation));
    assert.notEqual(animation.transform, 'none');
    await page.waitForTimeout(250);
    await page.screenshot({ path: fileURLToPath(new URL(`${channel}-product.png`, output)) });
    await backTop.click();
    await page.waitForFunction(() => scrollY === 0);
    await page.waitForTimeout(250);
    assert.equal(await backTop.evaluate(node => getComputedStyle(node).opacity), '0');
    assert.equal(await backTop.evaluate(node => node.inert), true);
    await page.evaluate(() => scrollTo({ top: 2000, behavior: 'instant' }));
    await page.waitForTimeout(300);
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(70);
    const fading = await backTop.evaluate(node => Number(getComputedStyle(node).opacity));
    assert.ok(fading > 0 && fading < 1, `Fade out: ${fading}`);
    await page.evaluate(() => scrollTo({ top: 2000, behavior: 'instant' }));
    await page.waitForTimeout(300);
    assert.equal(await backTop.evaluate(node => getComputedStyle(node).opacity), '1');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await backTop.evaluate(node => getComputedStyle(node).transitionDuration), '0s');
    await backTop.click();
    await page.waitForFunction(() => scrollY === 0);
    assert.deepEqual(errors, []);
    console.log(`${channel}: real ${raw.data.length} records, responsive themes, bullet lists, multi-select/URL/PIC, date order, details/XSS, failed refresh, name centering, animated/reduced back-to-top passed`);
  } finally { await browser.close(); }
}
