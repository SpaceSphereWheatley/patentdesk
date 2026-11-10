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

async function openApp(cases, log, readings, sak) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(([cs, lg, rd, sk]) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    localStorage.setItem('pt_onboarding_completed', '1');
    localStorage.setItem('pt_schema_version', '7');
    localStorage.setItem('pt_cases', cs);
    localStorage.setItem('pt_medl_log', lg);
    localStorage.setItem('pt_medlesing', rd);
    Object.keys(sk).forEach((id) => localStorage.setItem('pt_sak_' + id, JSON.stringify(sk[id])));
    localStorage.setItem('pt_medlesere', JSON.stringify([{ name: 'Kari', active: true }, { name: 'Ola', active: true }]));
  }, [JSON.stringify(cases), JSON.stringify(log), JSON.stringify(readings), sak || {}]);
  await page.goto(APP_URL);
  await page.waitForTimeout(200);
  await page.evaluate(() => navigateTo('medlesing'));
  await page.waitForTimeout(150);
  return { page, close: () => ctx.close() };
}

const rowsOf = (page) => page.locator('#medl-out-tbody tr').allTextContents();

e2e('AC1: all sendings show, open first (oldest first), then returned (newest first)', async () => {
  const { page, close } = await openApp(CASES, LOG, READINGS);
  const rows = await rowsOf(page);
  assert.equal(rows.length, 3);
  assert.match(rows[0], /20250871.*Ola/s);     // open, sent 2026-11-01 (oldest open)
  assert.match(rows[1], /20261235.*Kari/s);    // open, sent 2026-11-03
  assert.match(rows[2], /20240412.*Per/s);     // returned
  assert.match(rows[0], /Hos medleser/);
  assert.match(rows[2], /Tilbake/);
  // returned rows have no action buttons, open rows have both
  assert.equal(await page.locator('#medl-out-tbody tr[data-id="c"] button').count(), 0);
  assert.equal(await page.locator('#medl-out-tbody tr[data-id="a"] .btn-medl-return').count(), 1);
  assert.equal(await page.locator('#medl-out-tbody tr[data-id="a"] .btn-medl-send').count(), 1);
  // the existing section is still there
  assert.equal(await page.locator('#medl-tbody tr').count(), 2);
  await close();
});

e2e('AC1b: days are shown: sent-to-returned for returned, so-far for open', async () => {
  const { page, close } = await openApp(CASES, LOG, READINGS);
  assert.match(await page.locator('#medl-out-tbody tr[data-id="c"]').textContent(), /5 dager/);   // 10-20 -> 10-25
  assert.match(await page.locator('#medl-out-tbody tr[data-id="b"]').textContent(), /\d+ dager/);
  await close();
});

e2e('AC2: a case that moves to Fristarkiv or Avsluttet becomes a returned row and loses its buttons', async () => {
  const { page, close } = await openApp(CASES, LOG, READINGS);
  await page.evaluate(() => { cases.find((c) => c.id === 'a').status = 'fristarkiv'; render(); });
  assert.equal(await page.locator('#medl-out-tbody tr').count(), 3);                    // still listed
  assert.equal(await page.locator('#medl-out-tbody tr[data-id="a"] button').count(), 0); // closed
  assert.equal(await page.locator('#medl-out-tbody tr[data-id="b"] .btn-medl-return').count(), 1);
  await page.evaluate(() => { cases.find((c) => c.id === 'b').status = 'avsluttet'; render(); });
  assert.equal(await page.locator('#medl-out-tbody .btn-medl-return').count(), 0);
  assert.equal(await page.locator('#medl-out-empty').isVisible(), false);                // history is not empty
  assert.match(await page.locator('#medl-count').textContent(), /^2 medlesinger$/);        // none out any more
  await close();
});

e2e('AC3: Viderebehandling is shown like Ny', async () => {
  const { page, close } = await openApp(CASES, LOG, READINGS);
  assert.equal(await page.locator('#medl-out-tbody tr[data-id="b"] .btn-medl-return').count(), 1);
  await close();
});

e2e('AC4: no sendings ever -> empty state; nothing throws', async () => {
  const errors = [];
  const { page, close } = await openApp([], [], []);
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.evaluate(() => render());
  assert.equal(await page.locator('#medl-empty').isVisible(), true);
  assert.equal(await page.locator('#medl-out-empty').isVisible(), true);
  assert.equal(await page.locator('#medl-out-tbody tr').count(), 0);
  assert.deepEqual(errors, []);
  await close();
});

e2e('AC4b: only returned sendings -> history shown, no empty state', async () => {
  const { page, close } = await openApp(CASES, [LOG[2]], []);
  assert.equal(await page.locator('#medl-out-tbody tr').count(), 1);
  assert.equal(await page.locator('#medl-out-empty').isVisible(), false);
  await close();
});

e2e('AC5: Tilbake moves the row down (not away) and the menu count follows; Endre opens the dialog', async () => {
  const { page, close } = await openApp(CASES, LOG, READINGS);
  const badge = () => page.locator('.nav-tab[data-page="medlesing"] .nav-count').textContent();
  assert.equal(await badge(), '3');                 // 1 open reading + 2 open sendings
  await page.locator('#medl-out-tbody tr[data-id="b"] .btn-medl-return').click();
  assert.equal(await page.locator('#medl-out-tbody tr').count(), 3);
  assert.equal(await page.locator('#medl-out-tbody tr[data-id="b"] button').count(), 0);
  const order = await page.locator('#medl-out-tbody tr').evaluateAll((trs) => trs.map((t) => t.dataset.id));
  assert.equal(order[0], 'a');                      // the only open one stays first
  assert.equal(await badge(), '2');
  await page.locator('#medl-out-tbody tr[data-id="a"] .btn-medl-send').click();
  assert.equal(await page.locator('#medl-send-backdrop').evaluate((el) => el.classList.contains('open')), true);
  await close();
});

e2e('AC6: case number and reader name are escaped', async () => {
  const log = [{ id: 'x', caseId: 'a', caseNumber: '<img src=x onerror="window.__pwned=1">', reader: '<b>Kari</b>', sent: '2026-11-03', returned: null }];
  const { page, close } = await openApp(CASES, log, []);
  assert.equal(await page.locator('#medl-out-tbody img, #medl-out-tbody b').count(), 0);
  assert.equal(await page.evaluate(() => window.__pwned), undefined);
  await close();
});

e2e('the case-number link opens the case; a deleted case shows without a link', async () => {
  const gone = { id: 'g', caseId: 'deleted', caseNumber: '20111111', reader: 'Per', sent: '2026-09-01', returned: '2026-09-04' };
  const { page, close } = await openApp(CASES, LOG.concat([gone]), READINGS);
  assert.equal(await page.locator('#medl-out-tbody tr[data-id="deleted"] .medl-out-case').count(), 0);
  assert.match(await page.locator('#medl-out-tbody tr[data-id="deleted"]').textContent(), /20111111/);
  await page.locator('#medl-out-tbody .medl-out-case[data-id="a"]').click();
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

// ── Notater på siden ────────────────────────────────────────────────────────
const NOTED = [
  mk('a', '20261235', 'ny', '2026-12-20', { notes: 'Venter på svar fra Kari\nom D2' }),
  mk('b', '20250871', 'viderebehandling', '2026-12-22')
];

e2e('notes: «Jeg medleser» shows the reading note (full text in the tooltip), empty note gives an empty cell', async () => {
  const readings = [
    Object.assign({}, READINGS[0], { notat: 'Sjekk klasse H04L\nog kravene' }),
    Object.assign({}, READINGS[1], { notat: '' })
  ];
  const { page, close } = await openApp(NOTED, LOG, readings);
  const withNote = page.locator('#medl-tbody tr[data-id="m1"] .medl-note-cell .case-note');
  assert.equal(await withNote.count(), 1);
  assert.match(await withNote.locator('.case-note-text').textContent(), /Sjekk klasse H04L og kravene/);
  assert.match(await withNote.getAttribute('title'), /Sjekk klasse H04L\nog kravene/);
  assert.equal(await page.locator('#medl-tbody tr[data-id="m2"] .medl-note-cell .case-note').count(), 0);
  await close();
});

e2e('notes: «Hos medleser» shows the case note visible in the overview, never the internal note', async () => {
  const sak = { a: { sakNotes: 'HEMMELIG INTERN' } };
  const { page, close } = await openApp(NOTED, LOG, READINGS, sak);
  const a = page.locator('#medl-out-tbody tr[data-id="a"] .medl-note-cell');
  assert.match(await a.textContent(), /Venter på svar fra Kari om D2/);
  assert.ok(!(await page.locator('#medl-out-tbody').textContent()).includes('HEMMELIG'));
  assert.equal(await page.locator('#medl-out-tbody tr[data-id="b"] .medl-note-cell .case-note').count(), 0);
  await close();
});

e2e('notes: a deleted case shows an empty note cell', async () => {
  const gone = { id: 'g', caseId: 'deleted', caseNumber: '20111111', reader: 'Per', sent: '2026-09-01', returned: '2026-09-04' };
  const { page, close } = await openApp(NOTED, [gone], []);
  assert.equal(await page.locator('#medl-out-tbody tr[data-id="deleted"] .medl-note-cell .case-note').count(), 0);
  await close();
});

e2e('notes: note text is escaped in both tables', async () => {
  const evil = '<img src=x onerror="window.__pwned=1">';
  const cs = [mk('a', '20261235', 'ny', '2026-12-20', { notes: evil })];
  const readings = [Object.assign({}, READINGS[0], { notat: evil })];
  const { page, close } = await openApp(cs, LOG.slice(0, 1), readings);
  assert.equal(await page.locator('#medl-tbody img, #medl-out-tbody img').count(), 0);
  assert.equal(await page.evaluate(() => window.__pwned), undefined);
  await close();
});

e2e('notes: very long notes are cut off, never widen the page (960 and 1440)', async () => {
  const long = 'x '.repeat(300);
  const cs = [mk('a', '20261235', 'ny', '2026-12-20', { notes: long })];
  const readings = [Object.assign({}, READINGS[0], { notat: long })];
  const { page, close } = await openApp(cs, LOG.slice(0, 1), readings);
  for (const w of [1440, 960]) {
    await page.setViewportSize({ width: w, height: 900 });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(over <= 0, 'horizontal overflow ' + over + 'px at ' + w);
  }
  await close();
});

e2e('notes: clicking a reading row still opens its detail view', async () => {
  const readings = [Object.assign({}, READINGS[0], { notat: 'Et notat' })];
  const { page, close } = await openApp(NOTED, LOG, readings);
  await page.locator('#medl-tbody tr[data-id="m1"] .medl-note-cell').click();
  assert.equal(await page.locator('#medl-detail-view').isVisible(), true);
  assert.equal(await page.inputValue('#medl-d-notat'), 'Et notat');
  await close();
});

e2e('table headers: the actions column has an accessible name, and no extra Notat column', async () => {
  const { page, close } = await openApp(NOTED, LOG, READINGS);
  const first = (await page.locator('#medl-list-view table').first().locator('thead th').allTextContents()).map((t) => t.trim());
  assert.ok(!first.includes('Notat'), 'notes sit under the case number, not in a column');
  const ths = (await page.locator('#medl-out-table thead th').allTextContents()).map((t) => t.trim());
  assert.ok(!ths.includes('Notat'));
  assert.ok(ths.includes('Handling'), 'actions column needs an accessible name: ' + JSON.stringify(ths));
  await close();
});

e2e('notes: at 960 a long note does not push the action buttons further out than without a note', async () => {
  const long = 'x '.repeat(300);
  const widths = {};
  for (const withNote of [false, true]) {
    const cs = [mk('a', '20261235', 'ny', '2026-12-20', { notes: withNote ? long : '' })];
    const { page, close } = await openApp(cs, LOG.slice(0, 1), []);
    await page.setViewportSize({ width: 960, height: 900 });
    widths[withNote] = await page.locator('#medl-out-table').evaluate((t) => t.scrollWidth);
    await close();
  }
  assert.ok(widths[true] - widths[false] <= 60, 'long note widens the table by ' + (widths[true] - widths[false]) + 'px: ' + JSON.stringify(widths));
});

e2e('the hidden «Handling» header cannot leak out of the table wrapper (no contain hack needed)', async () => {
  const { page, close } = await openApp(NOTED, LOG, READINGS);
  const pos = await page.locator('#medl-out-table thead th').last().evaluate((th) => getComputedStyle(th).position);
  assert.equal(pos, 'relative', 'the sr-only span is absolutely positioned; its header cell must be its containing block');
  await close();
});
