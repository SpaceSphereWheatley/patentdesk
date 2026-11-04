'use strict';
// Browser tests for the 2B fix round (B1–B5), written by QA before the builder.
// NOT part of `npm test`. Run with: node --test test/e2e/claimMapping2bFixes.e2e.js
// Skipped (not failed) when Playwright/Chromium is unavailable.
//
// B1 crafted claim num in an imported file creates no element when the case opens
// B2 invalid origin: red border + error colour; Esc and blur close without saving
// B3 previous-round hint (.km-prev) is italic and dimmed
// B4 after the Endret/Uendret segment click, focus returns to the same segment button
// B5 opening another row's origin field leaves no stale open input/error elsewhere

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP_FILE = process.env.E2E_APP_FILE || path.join(__dirname, '..', '..', 'PatentDesk.html');
const APP_URL = pathToFileURL(APP_FILE).href;
const CASE_ID = 'e2emapfix';

let chromium = null;
let browser = null;
let skipReason = null;
try { ({ chromium } = require('playwright')); } catch (e) { skipReason = 'playwright not installed'; }

before(async () => {
  if (skipReason) return;
  try { browser = await chromium.launch(); }
  catch (e) { skipReason = 'Chromium could not be launched: ' + String(e.message || e).split('\n')[0]; }
});
after(async () => { if (browser) await browser.close(); });

function e2e(name, fn) {
  test(name, async (t) => {
    if (skipReason) { t.skip(skipReason); return; }
    await fn(t);
  });
}

// ── Fixtures ───────────────────────────────────────────────────────────────
function claim(num, over) {
  return Object.assign({
    num, novelty: null, inventive: null, formal: null, notes: '', independent: num === 1,
    dep: num === 1 ? null : 1, depManual: false, label: '', noveltyDoc: null, inventiveDocs: []
  }, over || {});
}
const map = (round, origin, over) => Object.assign({ round, origin, change: null, p13: null, basis: '' }, over || {});
const H = (from, to, date, extra) => Object.assign({ type: 'status', date: date + 'T10:00:00.000Z', from, to }, extra || {});
const HIST_V1 = [{ type: 'status', date: '2026-03-01T10:00:00.000Z', from: null, to: 'ny' },
  H('ny', 'fristarkiv', '2026-06-01'),
  H('fristarkiv', 'viderebehandling', '2026-08-21', { received: '2026-08-20', changes: ['claims'] })];
const R1_CLAIMS = [
  claim(1, { novelty: false, inventive: false, noveltyDoc: 'D1' }),
  claim(2, { novelty: true, inventive: false, inventiveDocs: ['D1', 'D2'] }),
  claim(3, { novelty: false, inventive: false, noveltyDoc: 'D3' }),
  claim(4, { novelty: true, inventive: true }),
  claim(5, { dep: 4 })
];
const R1 = { n: 1, letter: { date: '2026-06-01', deadline: '2026-09-01' },
  response: { date: '2026-08-20', changes: ['claims'] }, claims: R1_CLAIMS, docIds: ['D1', 'D2', 'D3'] };
function liveClaims() {
  return [
    claim(1, { label: 'Apparat' }),
    claim(2, { label: 'Ventil' }),
    claim(3, { label: 'Hus' }),
    claim(4, { label: 'Sensor' }),
    claim(5, { dep: 4, label: 'Kobling' })
  ];
}
function caseRow() {
  return { id: CASE_ID, caseNumber: '20261378', status: 'viderebehandling', dueDate: '2026-12-15',
    title: 'Testsak for kravkobling (fiks)', notes: '', tags: '', createdAt: '2026-03-01T10:00:00.000Z',
    history: HIST_V1, type: 'sak', duration: null, caseBuffer: null };
}
function sakData(claims) {
  return { numClaims: claims.length, filingDate: '', priorityDate: '', checklist: {}, classes: [],
    docs: ['D1', 'D2', 'D3'].map((id, i) => ({ id, ref: 'EP ' + (1000 + i) + ' A1', pubDate: '', effDate: '',
      title: '', p: false, e: false, background: false, withdrawn: false })),
    claims, rounds: [R1] };
}

async function newPage(seed) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.addInitScript(([id, cs, sak]) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    localStorage.setItem('pt_onboarding_completed', '1');
    localStorage.setItem('pt_schema_version', '8');
    localStorage.setItem('pt_cases', cs);
    if (sak) localStorage.setItem('pt_sak_' + id, sak);
  }, [CASE_ID, JSON.stringify(seed ? [caseRow()] : []), seed ? JSON.stringify(sakData(seed)) : null]);
  await page.goto(APP_URL);
  return { page, errors, close: () => ctx.close() };
}
async function openSak(page) {
  await page.evaluate((id) => { navigateTo('sak/' + id); }, CASE_ID);
  await page.waitForTimeout(150);
}
async function openCase(claims) {
  const s = await newPage(claims || liveClaims());
  await openSak(s.page);
  return s;
}

const kmRow = (page, n) => page.locator('#sak-claims-tbody tr[data-claim="' + n + '"] + tr.km-row');
const originBtn = (page, n) => kmRow(page, n).locator('.km-origin');
const stored = (page) => page.evaluate((id) => JSON.parse(localStorage.getItem('pt_sak_' + id)), CASE_ID);
async function openOrigin(page, n) {
  await originBtn(page, n).click();
  const inp = kmRow(page, n).locator('.km-origin-inp');
  await inp.waitFor({ state: 'visible', timeout: 2000 });
  return inp;
}
async function invalidOrigin(page, n, text) {
  const inp = await openOrigin(page, n);
  await inp.fill(text || '12');
  await inp.press('Enter');
  await page.waitForTimeout(150);
  return inp;
}
// Resolve a CSS custom property to the computed rgb() string Chrome reports.
const resolveColor = (page, cssVar) => page.evaluate((v) => {
  const el = document.createElement('span');
  el.style.color = 'var(' + v + ')';
  document.body.appendChild(el);
  const c = getComputedStyle(el).color;
  el.remove();
  return c;
}, cssVar);

// ── B1 ─────────────────────────────────────────────────────────────────────
const EVIL = '1"><img src=x onerror="window.__xss=1">';

e2e('B1 importing a crafted claim num creates no element when the case is opened', async () => {
  const { page, errors, close } = await newPage(null);
  const claims = liveClaims();
  claims[0].num = EVIL;
  claims[1].dep = EVIL;
  claims[2].mapping = map(1, [5]);
  const file = { cases: [caseRow()], sakDetails: { [CASE_ID]: sakData(claims) } };
  await page.setInputFiles('#import-file-input', {
    name: 'patentdesk-import.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file))
  });
  await page.locator('#btn-import-confirm').waitFor({ state: 'visible', timeout: 3000 });
  await page.locator('#btn-import-confirm').click();
  await page.waitForTimeout(200);
  const sd = await stored(page);
  assert.ok(sd && Array.isArray(sd.claims), 'case details imported');
  assert.equal(sd.claims[0].num, 1, 'num coerced to i + 1 on import');
  assert.equal(sd.claims[1].dep, null, 'dep coerced to null on import');
  assert.equal(sd.claims[0].label, 'Apparat', 'rest of the claim untouched');
  await openSak(page);
  assert.ok(await page.locator('#sak-claims-tbody tr.km-row').count() > 0, 'mapping sub-rows rendered (active round)');
  assert.equal(await page.locator('#sak-claims-tbody img').count(), 0, 'no <img> in the claims table');
  assert.equal(await page.locator('img[src="x"]').count(), 0, 'no <img src=x> anywhere');
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.__xss), undefined, 'payload never ran');
  assert.equal(await page.locator('#sak-claims-tbody tr[data-claim="1"]').count(), 1, 'claim 1 row present');
  assert.deepEqual(errors, []);
  await close();
});

// ── B2 ─────────────────────────────────────────────────────────────────────
e2e('B2 invalid origin after Enter: red border on the input and error text in the error colour', async () => {
  const { page, errors, close } = await openCase();
  const inp = await invalidOrigin(page, 2, '12');
  const err = kmRow(page, 2).locator('.km-err');
  assert.ok(await err.isVisible(), 'error shown');
  const danger = await resolveColor(page, '--danger');
  const muted = await resolveColor(page, '--muted-text');
  const st = await inp.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { top: cs.borderTopColor, right: cs.borderRightColor, bottom: cs.borderBottomColor, left: cs.borderLeftColor };
  });
  for (const side of Object.keys(st)) assert.equal(st[side], danger, 'border-' + side + ' is --danger: ' + JSON.stringify(st));
  const errColor = await err.evaluate((el) => getComputedStyle(el).color);
  const errorColours = [danger, await resolveColor(page, '--color-error'), await resolveColor(page, '--text-on-no')];
  assert.ok(errorColours.includes(errColor), 'error text uses an error colour, got ' + errColor + ' vs ' + JSON.stringify(errorColours));
  assert.notEqual(errColor, muted, 'not the muted grey');
  const op = await err.evaluate((el) => {
    let o = 1;
    for (let e = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity);
    return o;
  });
  assert.equal(op, 1, 'error text is not dimmed by opacity');
  assert.deepEqual(errors, []);
  await close();
});

e2e('B2 Esc after an invalid origin closes the field without saving and restores the previous display', async () => {
  const claims = liveClaims();
  claims[2].mapping = map(1, [5]);
  const { page, errors, close } = await openCase(claims);
  const before = await stored(page);
  const label = (await originBtn(page, 3).textContent()).trim();
  assert.equal(label, '←5');
  const inp = await invalidOrigin(page, 3, '99');
  assert.ok(await kmRow(page, 3).locator('.km-err').isVisible(), 'error state first');
  await inp.press('Escape');
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#sak-claims-tbody .km-origin-inp').count(), 0, 'field closed');
  assert.equal(await page.locator('#sak-claims-tbody .km-err').count(), 0, 'error gone');
  assert.equal((await originBtn(page, 3).textContent()).trim(), label, 'previous display restored');
  assert.deepEqual(await stored(page), before, 'nothing saved');
  assert.deepEqual(errors, []);
  await close();
});

e2e('B2 Esc on an unmapped claim restores «← ?» and saves nothing', async () => {
  const { page, close } = await openCase();
  const before = await stored(page);
  const inp = await openOrigin(page, 1);
  await inp.fill('1+');
  await inp.press('Escape');
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#sak-claims-tbody .km-origin-inp').count(), 0);
  assert.match((await originBtn(page, 1).textContent()).trim(), /^←\s?\?$/);
  assert.deepEqual(await stored(page), before);
  await close();
});

e2e('B2 blur with an invalid value closes the field without saving', async () => {
  const claims = liveClaims();
  claims[2].mapping = map(1, [5]);
  const { page, errors, close } = await openCase(claims);
  const before = await stored(page);
  // Typed invalid value, never committed with Enter
  const inp = await openOrigin(page, 3);
  await inp.fill('abc');
  await page.locator('#sak-claims-tbody tr[data-claim="1"] .sak-claim-note').focus();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#sak-claims-tbody .km-origin-inp').count(), 0, 'field closed on blur');
  assert.equal(await page.locator('#sak-claims-tbody .km-err').count(), 0, 'no error left');
  assert.equal((await originBtn(page, 3).textContent()).trim(), '←5', 'previous display');
  assert.deepEqual(await stored(page), before, 'nothing saved');
  // Invalid value committed with Enter (error state), then blur
  const inp2 = await invalidOrigin(page, 3, '12');
  assert.ok(await kmRow(page, 3).locator('.km-err').isVisible(), 'error state');
  await inp2.evaluate((el) => el.blur());
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#sak-claims-tbody .km-origin-inp').count(), 0, 'field closed after error + blur');
  assert.equal(await page.locator('#sak-claims-tbody .km-err').count(), 0);
  assert.equal((await originBtn(page, 3).textContent()).trim(), '←5');
  assert.deepEqual(await stored(page), before, 'nothing saved');
  assert.deepEqual(errors, []);
  await close();
});

e2e('B2 a valid value still commits on blur', async () => {
  const { page, close } = await openCase();
  const inp = await openOrigin(page, 1);
  await inp.fill('1+4');
  await inp.evaluate((el) => el.blur());
  await page.waitForTimeout(150);
  assert.deepEqual((await stored(page)).claims[0].mapping.origin, [1, 4]);
  assert.equal((await originBtn(page, 1).textContent()).trim(), '←1+4');
  await close();
});

// ── B3 ─────────────────────────────────────────────────────────────────────
e2e('B3 previous-round hint is italic and dimmed; text unchanged', async () => {
  const claims = liveClaims();
  claims[0].mapping = map(1, [1, 4]);
  claims[2].mapping = map(1, [5], { change: 'uendret' });
  const { page, close } = await openCase(claims);
  for (const [n, re] of [[1, /^R1: 1 N✗ O✗ D1 · 4 N✓ O✓$/], [3, /^R1 N✓ O✓$/]]) {
    const prev = kmRow(page, n).locator('.km-prev');
    assert.match((await prev.textContent()).trim(), re, 'hint text unchanged, claim ' + n);
    const s = await prev.evaluate((el) => {
      const cs = getComputedStyle(el);
      const td = getComputedStyle(el.closest('td'));
      return { fontStyle: cs.fontStyle, opacity: parseFloat(cs.opacity), color: cs.color, tdColor: td.color };
    });
    assert.equal(s.fontStyle, 'italic', 'italic, claim ' + n);
    const lum = (rgb) => {
      const m = rgb.match(/[\d.]+/g).map(Number);
      const a = m.length > 3 ? m[3] : 1;
      return { l: 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2], a };
    };
    const own = lum(s.color), base = lum(s.tdColor);
    const dimmed = s.opacity < 1 || own.a < 1 || own.l > base.l;
    assert.ok(dimmed, 'dimmed (reduced opacity or lighter than the sub-row text), claim ' + n + ': ' + JSON.stringify(s));
  }
  await close();
});

// ── B4 ─────────────────────────────────────────────────────────────────────
e2e('B4 after clicking Uendret / Endret, focus is on the same segment button of that claim', async () => {
  const claims = liveClaims();
  claims[2].mapping = map(1, [5]);
  const { page, errors, close } = await openCase(claims);
  const focused = () => page.evaluate(() => {
    const a = document.activeElement;
    return a ? { claim: a.getAttribute('data-claim-change'), change: a.getAttribute('data-change'),
      pressed: a.getAttribute('aria-pressed'), connected: a.isConnected } : null;
  });
  await kmRow(page, 3).locator('.km-seg button', { hasText: /^Uendret$/ }).click();
  await page.waitForTimeout(150);
  assert.equal((await stored(page)).claims[2].mapping.change, 'uendret', 'change applied');
  assert.deepEqual(await focused(), { claim: '3', change: 'uendret', pressed: 'true', connected: true });
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  assert.equal((await stored(page)).claims[2].mapping.change, 'endret', 'keyboard toggles back to Endret');
  assert.deepEqual(await focused(), { claim: '3', change: 'endret', pressed: 'true', connected: true });
  assert.deepEqual(errors, []);
  await close();
});

// ── B5 ─────────────────────────────────────────────────────────────────────
e2e('B5 opening another row\'s origin field leaves no stale open input or error on the first row', async () => {
  const claims = liveClaims();
  claims[0].mapping = map(1, [2]);
  const { page, errors, close } = await openCase(claims);
  const before = await stored(page);
  await invalidOrigin(page, 1, '12');
  assert.ok(await kmRow(page, 1).locator('.km-err').isVisible(), 'row 1 in error state');
  await originBtn(page, 2).click();
  await page.waitForTimeout(150);
  assert.equal(await kmRow(page, 2).locator('.km-origin-inp').count(), 1, 'row 2 field open');
  assert.equal(await kmRow(page, 1).locator('.km-origin-inp').count(), 0, 'row 1 field closed');
  assert.equal(await page.locator('#sak-claims-tbody .km-err').count(), 0, 'no stale error');
  assert.equal(await page.locator('#sak-claims-tbody .km-origin-inp').count(), 1, 'exactly one open field');
  assert.equal((await originBtn(page, 1).textContent()).trim(), '←2', 'row 1 shows its stored origin');
  assert.deepEqual(await stored(page), before, 'nothing saved');
  assert.deepEqual(errors, []);
  await close();
});

e2e('B5 a full re-render (leave and reopen the case) clears a stale origin-edit state', async () => {
  const { page, close } = await openCase();
  await invalidOrigin(page, 1, '12');
  await page.evaluate(() => { navigateTo('home'); });
  await page.waitForTimeout(100);
  await openSak(page);
  assert.equal(await page.locator('#sak-claims-tbody .km-origin-inp').count(), 0, 'no open origin field');
  assert.equal(await page.locator('#sak-claims-tbody .km-err').count(), 0, 'no stale error');
  await close();
});

e2e('B5 a re-render from another claim edit clears a stale origin-edit state', async () => {
  const { page, close } = await openCase();
  await invalidOrigin(page, 1, '12');
  await page.locator('#sak-claims-tbody button[data-claim="2"][data-field="formal"]').click();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#sak-claims-tbody .km-origin-inp').count(), 0, 'no open origin field');
  assert.equal(await page.locator('#sak-claims-tbody .km-err').count(), 0, 'no stale error');
  await close();
});
