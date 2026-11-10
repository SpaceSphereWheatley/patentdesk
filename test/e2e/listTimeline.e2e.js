'use strict';
// Browser tests for the collapsible Arbeidsplan on list pages.
// NOT part of `npm test`; run with: node --test test/e2e/*.e2e.js

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP_URL = pathToFileURL(process.env.E2E_APP_FILE || path.join(__dirname, '..', '..', 'PatentDesk.html')).href;
let chromium = null, browser = null, skipReason = null;
try { ({ chromium } = require('playwright')); } catch (e) { skipReason = 'playwright not installed'; }
before(async () => {
  if (skipReason) return;
  try { browser = await chromium.launch(); }
  catch (e) { skipReason = 'Chromium could not be launched: ' + String(e.message || e).split('\n')[0]; }
});
after(async () => { if (browser) await browser.close(); });
function e2e(name, fn) {
  test(name, async (t) => { if (skipReason) { t.skip(skipReason); return; } await fn(t); });
}

const mk = (id, n, status, due, type) => ({
  id, caseNumber: n, status, dueDate: due, title: 'Sak ' + n, notes: '', tags: '',
  createdAt: '2026-10-01T08:00:00.000Z', history: [{ status: 'ny', date: '2026-10-01T08:00:00.000Z' }],
  type: type || 'sak', duration: type === 'oppdrag' ? 3 : null, caseBuffer: null
});

// Seeder med evaluate + reload, ikke addInitScript: init-skriptet leser noen
// ganger tom localStorage ved reload på file:// og seeder da på nytt, så
// «huskes etter reload» kunne ikke testes.
async function openApp(cases) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(APP_URL);
  await page.evaluate((cs) => {
    localStorage.clear();
    localStorage.setItem('pt_onboarding_completed', '1');
    localStorage.setItem('pt_schema_version', '7');
    localStorage.setItem('pt_cases', cs);
  }, JSON.stringify(cases));
  await page.reload();
  await page.waitForTimeout(200);
  return { page, close: () => ctx.close() };
}

const CASES = [
  mk('a', '20261235', 'ny', '2026-11-20'),
  mk('b', '20250871', 'ny', '2026-11-05'),          // overdue
  mk('c', '20240412', 'viderebehandling', '2026-11-25'),
  mk('d', '20231120', 'fristarkiv', '2026-12-30'),
  mk('e', 'OP-1', 'ny', '2026-11-18', 'oppdrag')
];
const go = (p, name) => p.evaluate((n) => navigateTo(n), name).then(() => p.waitForTimeout(150));

e2e('AC1: toggle shows on the work lists, not on Alle saker', async () => {
  const { page, close } = await openApp(CASES);
  for (const name of ['ny', 'viderebehandling', 'fristarkiv', 'oppdrag']) {
    await go(page, name);
    assert.equal(await page.locator('#cases-tl-toggle').isVisible(), true, name);
  }
  await go(page, 'avsluttet');
  assert.equal(await page.locator('#cases-tl-toggle').isVisible(), false);
  await close();
});

e2e('AC2/AC3: collapse hides the timeline, persists, expand redraws with width', async () => {
  const { page, close } = await openApp(CASES);
  await go(page, 'ny');
  const tog = page.locator('#cases-tl-toggle');
  assert.equal(await tog.getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('#cases-tl-host .tl-track').first().isVisible(), true);
  await tog.click();
  assert.equal(await tog.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('#cases-tl-host').isVisible(), false);
  await go(page, 'viderebehandling');                      // remembered across list pages
  assert.equal(await page.locator('#cases-tl-toggle').getAttribute('aria-expanded'), 'false');
  await page.reload();
  await page.waitForTimeout(200);
  await go(page, 'ny');
  assert.equal(await page.locator('#cases-tl-toggle').getAttribute('aria-expanded'), 'false');
  await page.locator('#cases-tl-toggle').click();
  const w = await page.evaluate(() => document.querySelector('#cases-tl-host .tl-track').getBoundingClientRect().width);
  assert.ok(w > 300, 'timeline width after expand = ' + w);
  await close();
});

e2e('AC5: overdue and Oppdrag bars are still drawn after collapse + expand', async () => {
  const { page, close } = await openApp(CASES);
  await go(page, 'ny');
  const before = await page.locator('#cases-tl-host .tl-bar').count();
  await page.locator('#cases-tl-toggle').click();
  await page.locator('#cases-tl-toggle').click();
  assert.equal(await page.locator('#cases-tl-host .tl-bar').count(), before);
  assert.ok(before >= 1);
  await close();
});

e2e('AC6: zero cases: toggle works, no errors', async () => {
  const { page, close } = await openApp([]);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await go(page, 'ny');
  await page.locator('#cases-tl-toggle').click();
  await page.locator('#cases-tl-toggle').click();
  assert.deepEqual(errors, []);
  await close();
});

e2e('AC4: no redraw while collapsed', async () => {
  const { page, close } = await openApp(CASES);
  await go(page, 'ny');
  await page.locator('#cases-tl-toggle').click();
  const before = await page.evaluate(() => document.getElementById('cases-tl-host').innerHTML);
  await page.evaluate(() => render());
  assert.equal(await page.evaluate(() => document.getElementById('cases-tl-host').innerHTML), before);
  await close();
});

e2e('AC7: stats chart shows the empty message only without data, naming the year', async () => {
  const empty = await openApp([]);
  await go(empty.page, 'statistikk');
  assert.equal(await empty.page.locator('#chart-empty').isVisible(), true);
  assert.match(await empty.page.locator('#chart-empty').textContent(), /i 2026\.$/);
  assert.equal(await empty.page.locator('#chart-canvas-wrap').isVisible(), false);
  await empty.close();
  const some = await openApp(CASES);
  await go(some.page, 'statistikk');
  assert.equal(await some.page.locator('#chart-canvas-wrap').isVisible(), true);
  assert.equal(await some.page.locator('#chart-empty').isVisible(), false);
  await some.close();
});
