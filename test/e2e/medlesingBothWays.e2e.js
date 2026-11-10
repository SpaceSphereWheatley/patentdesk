'use strict';
// Browser tests for the Medlesing page showing both directions.
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

const mk = (id, n, status, due, over) => Object.assign({
  id, caseNumber: n, status, dueDate: due, title: 'Sak ' + n, notes: '', tags: '',
  createdAt: '2026-10-01T08:00:00.000Z', history: [{ status: 'ny', date: '2026-10-01T08:00:00.000Z' }],
  type: 'sak', duration: null, caseBuffer: null
}, over || {});

const CASES = [
  mk('a', '20261235', 'ny', '2026-12-20'),
  mk('b', '20250871', 'viderebehandling', '2026-12-22'),
  mk('c', '20240412', 'ny', '2026-12-24')
];
const LOG = [
  { id: 'l1', caseId: 'a', caseNumber: '20261235', reader: 'Kari', sent: '2026-11-03', returned: null },
  { id: 'l2', caseId: 'b', caseNumber: '20250871', reader: 'Ola', sent: '2026-11-01', returned: null },
  { id: 'l3', caseId: 'c', caseNumber: '20240412', reader: 'Per', sent: '2026-10-20', returned: '2026-10-25' }
];
const READINGS = [
  { id: 'm1', caseNumber: '20199999', saksbehandler: 'Eva', type: 'normal', date: '2026-11-02', checklist: {}, completed: false, notat: '' },
  { id: 'm2', caseNumber: '20188888', saksbehandler: 'Eva', type: 'normal', date: '2026-10-02', checklist: {}, completed: true, notat: '' }
];

async function openApp(cases, log, readings) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(([cs, lg, rd]) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    localStorage.setItem('pt_onboarding_completed', '1');
    localStorage.setItem('pt_schema_version', '7');
    localStorage.setItem('pt_cases', cs);
    localStorage.setItem('pt_medl_log', lg);
    localStorage.setItem('pt_medlesing', rd);
    localStorage.setItem('pt_medlesere', JSON.stringify([{ name: 'Kari', active: true }, { name: 'Ola', active: true }]));
  }, [JSON.stringify(cases), JSON.stringify(log), JSON.stringify(readings)]);
  await page.goto(APP_URL);
  await page.waitForTimeout(200);
  await page.evaluate(() => navigateTo('medlesing'));
  await page.waitForTimeout(150);
  return { page, close: () => ctx.close() };
}

e2e('AC1: open sendings show under «Hos medleser», returned ones do not; oldest first', async () => {
  const { page, close } = await openApp(CASES, LOG, READINGS);
  const rows = await page.locator('#medl-out-list .medl-out').allTextContents();
  assert.equal(rows.length, 2);
  assert.match(rows[0], /20250871.*Ola/s);     // sent 2026-11-01, oldest first
  assert.match(rows[1], /20261235.*Kari/s);
  assert.ok(!(await page.locator('#medl-out-list').textContent()).includes('Per'));
  // the existing section is still there
  assert.equal(await page.locator('#medl-tbody tr').count(), 2);
  await close();
});

e2e('AC2: a case that moves to Fristarkiv or Avsluttet drops out of the section', async () => {
  const { page, close } = await openApp(CASES, LOG, READINGS);
  await page.evaluate(() => { cases.find((c) => c.id === 'a').status = 'fristarkiv'; render(); });
  assert.equal(await page.locator('#medl-out-list .medl-out').count(), 1);
  await page.evaluate(() => { cases.find((c) => c.id === 'b').status = 'avsluttet'; render(); });
  assert.equal(await page.locator('#medl-out-list .medl-out').count(), 0);
  assert.equal(await page.locator('#medl-out-empty').isVisible(), true);
  await close();
});

e2e('AC3: Viderebehandling is shown like Ny', async () => {
  const { page, close } = await openApp(CASES, LOG, READINGS);
  assert.equal(await page.locator('#medl-out-list .medl-out[data-id="b"]').count(), 1);
  await close();
});

e2e('AC4: empty sections show their own empty state and nothing throws', async () => {
  const errors = [];
  const { page, close } = await openApp([], [], []);
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.evaluate(() => render());
  assert.equal(await page.locator('#medl-empty').isVisible(), true);
  assert.equal(await page.locator('#medl-out-empty').isVisible(), true);
  assert.equal(await page.locator('#medl-out-list .medl-out').count(), 0);
  assert.deepEqual(errors, []);
  await close();
});

e2e('AC5: Tilbake ✓ and Endre work from the page, the menu count follows', async () => {
  const { page, close } = await openApp(CASES, LOG, READINGS);
  const badge = () => page.locator('.nav-tab[data-page="medlesing"] .nav-count').textContent();
  assert.equal(await badge(), '3');                 // 1 open reading + 2 open sendings
  await page.locator('#medl-out-list .medl-out[data-id="b"] .btn-medl-return').click();
  assert.equal(await page.locator('#medl-out-list .medl-out').count(), 1);
  assert.equal(await badge(), '2');
  await page.locator('#medl-out-list .medl-out[data-id="a"] .btn-medl-send').click();
  assert.equal(await page.locator('#medl-send-backdrop').evaluate((el) => el.classList.contains('open')), true);
  await close();
});

e2e('AC6: case number and reader name are escaped', async () => {
  const log = [{ id: 'x', caseId: 'a', caseNumber: '<img src=x onerror="window.__pwned=1">', reader: '<b>Kari</b>', sent: '2026-11-03', returned: null }];
  const { page, close } = await openApp(CASES, log, []);
  assert.equal(await page.locator('#medl-out-list img, #medl-out-list b').count(), 0);
  assert.equal(await page.evaluate(() => window.__pwned), undefined);
  await close();
});

e2e('the case-number link opens the case', async () => {
  const { page, close } = await openApp(CASES, LOG, READINGS);
  await page.locator('#medl-out-list .medl-out-case[data-id="a"]').click();
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => activePage), 'sak');
  await close();
});

e2e('Hjem still shows its own «Hos medleser» block', async () => {
  const { page, close } = await openApp(CASES, LOG, READINGS);
  await page.evaluate(() => navigateTo('hjem'));
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#home-medl-out .medl-out').count(), 2);
  assert.equal(await page.locator('#home-medl-out .btn-medl-send').count(), 0, 'Hjem has no Endre button');
  assert.equal(await page.locator('#home-medl-out .btn-medl-return').count(), 2);
  await close();
});
