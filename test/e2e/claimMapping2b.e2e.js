'use strict';
// Browser tests for Kravkobling / claim mapping (spec 2B, design 2B, approved
// mockup ux/rounds2bc-mockup.html). Written by QA before the builder.
//
// NOT part of `npm test`. Run with: node --test test/e2e/*.e2e.js
// If Playwright or Chromium is unavailable, every test is skipped, not failed.
//
// DOM hooks these tests rely on (from the mockup; the builder must use them):
//   #sak-claims-tbody tr[data-claim="N"]           the existing claim row
//   tr[data-claim="N"] + tr.km-row                 sub-row for claim N (td colspan 7),
//                                                  only when mapping is active
//   .km-row .km-origin[data-claim-origin="N"]      origin button: «←1+4» / «← ?» / «Ny»
//   .km-row .km-origin-inp                         origin text field (opened by the button;
//                                                  committed on Enter or blur)
//   .km-row .km-err                                origin error, e.g. «Krav 12 finnes ikke i brev 1»
//   .km-row .km-seg button[aria-pressed]           Endret / Uendret segment (single origin only)
//   .km-row .km-chip-endret                        static «Endret» chip (merged origin)
//   .km-row .km-prev                               verdict hint text (after «←… ·»)
//   .km-row .km-p13-btn[data-claim-p13="N"]        § 13 tri-state: «§13 —» / «§13 ✓» / «§13 ✗ mangler grunnlag»
//   .km-row .km-basis                              basis input (saved on change/blur)
//   #btn-undo-action                               «Angre» in the undo toast (existing)
//   button[data-claim="N"][data-field="novelty|inventive|formal"]   existing tri buttons

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const APP_FILE = process.env.E2E_APP_FILE || path.join(__dirname, '..', '..', 'PatentDesk.html');
const APP_URL = pathToFileURL(APP_FILE).href;
const BASELINE_REF = '422b5f0'; // Release v4.53.0 — AC1 "table HTML identical to 4.53.0"
const HEIGHT = 900;
const CASE_ID = 'e2emapping';

let chromium = null;
let browser = null;
let skipReason = null;

try { ({ chromium } = require('playwright')); }
catch (e) { skipReason = 'playwright not installed'; }

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
const XSS = '<img src=x onerror="window.__xss=1">';

function claim(num, over) {
  return Object.assign({
    num, novelty: null, inventive: null, formal: null, notes: '', independent: num === 1,
    dep: num === 1 ? null : 1, depManual: false, label: '', noveltyDoc: null, inventiveDocs: []
  }, over || {});
}
const map = (round, origin, over) => Object.assign({ round, origin, change: null, p13: null, basis: '' }, over || {});
const H = (from, to, date, extra) => Object.assign({ type: 'status', date: date + 'T10:00:00.000Z', from, to }, extra || {});
const HIST_NY = [{ type: 'status', date: '2026-03-01T10:00:00.000Z', from: null, to: 'ny' }];
const HIST_F1 = HIST_NY.concat([H('ny', 'fristarkiv', '2026-06-01')]);
const HIST_V1 = HIST_F1.concat([H('fristarkiv', 'viderebehandling', '2026-08-21', { received: '2026-08-20', changes: ['claims'] })]);
const HIST_V1_ARGS = HIST_F1.concat([H('fristarkiv', 'viderebehandling', '2026-08-21', { received: '2026-08-20', changes: [] })]);
const HIST_F2 = HIST_V1.concat([H('viderebehandling', 'fristarkiv', '2026-09-15')]);

// R1: 1 N✗ O✗ D1 · 2 N✓ O✗ D1+D2 · 3 N✗ D3 · 4 N✓ O✓ · 5 (dep 4, cascades N✓ O✓)
const R1_CLAIMS = [
  claim(1, { novelty: false, inventive: false, noveltyDoc: 'D1' }),
  claim(2, { novelty: true, inventive: false, inventiveDocs: ['D1', 'D2'] }),
  claim(3, { novelty: false, inventive: false, noveltyDoc: 'D3' }),
  claim(4, { novelty: true, inventive: true }),
  claim(5, { dep: 4 })
];
function round(n, claims, over) {
  return Object.assign({ n, letter: { date: '2026-06-01', deadline: '2026-09-01' },
    response: { date: '2026-08-20', changes: ['claims'] }, claims, docIds: ['D1', 'D2', 'D3'] }, over || {});
}
const R1 = round(1, R1_CLAIMS);

// Live claims: the stale round-1 verdicts are still on the positions.
function liveClaims() {
  return [
    claim(1, { novelty: false, inventive: false, noveltyDoc: 'D1', label: 'Apparat', notes: 'notat 1' }),
    claim(2, { novelty: true, inventive: false, inventiveDocs: ['D1', 'D2'], label: 'Ventil' }),
    claim(3, { novelty: false, inventive: false, noveltyDoc: 'D3', label: 'Hus' }),
    claim(4, { novelty: true, inventive: true, label: 'Sensor' }),
    claim(5, { dep: 4, label: 'Kobling' })
  ];
}
// A fully mapped table (all row kinds) for layout tests.
function mappedClaims() {
  const c = liveClaims();
  c[0].mapping = map(1, [1, 4], { p13: false, basis: 'Beskr. s. 7 l. 3–9, fig. 2 og krav 4 som innlevert' });
  c[1].mapping = map(1, [2, 3, 4, 5], { p13: true, basis: 'Beskr. s. 12' });
  c[2].mapping = map(1, [5], { change: 'uendret' });
  c[3].mapping = map(1, [], { change: 'ny', p13: true, basis: 'Beskr. s. 9 l. 1–4' });
  // claim 5 unmapped -> «← ?»
  return c;
}

function seedData(opts) {
  const kase = {
    id: CASE_ID, caseNumber: '20261377', status: opts.status, dueDate: '2026-12-15',
    title: 'Testsak for kravkobling', notes: '', tags: '', createdAt: '2026-03-01T10:00:00.000Z',
    history: opts.history, type: opts.type || 'sak', duration: opts.type === 'oppdrag' ? 3 : null, caseBuffer: null
  };
  const claims = opts.claims || liveClaims();
  const sak = {
    numClaims: claims.length, filingDate: '', priorityDate: '', checklist: {}, classes: [],
    docs: ['D1', 'D2', 'D3'].map((id, i) => ({ id, ref: 'EP ' + (1000 + i) + ' A1', pubDate: '', effDate: '',
      title: '', p: false, e: false, background: false, withdrawn: id === 'D3' })),
    claims,
    rounds: opts.rounds === undefined ? [R1] : opts.rounds
  };
  return { cases: JSON.stringify([kase]), sak: JSON.stringify(sak) };
}

async function openCase(width, opts, url) {
  const ctx = await browser.newContext({ viewport: { width, height: HEIGHT } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const s = seedData(opts);
  await page.addInitScript(([id, cs, sak]) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    localStorage.setItem('pt_onboarding_completed', '1');
    localStorage.setItem('pt_schema_version', '8');
    localStorage.setItem('pt_cases', cs);
    localStorage.setItem('pt_sak_' + id, sak);
  }, [CASE_ID, s.cases, s.sak]);
  await page.goto(url || APP_URL);
  await page.evaluate((id) => { navigateTo('sak/' + id); }, CASE_ID);
  await page.waitForTimeout(150);
  return { page, errors, close: () => ctx.close() };
}

const ACTIVE = { status: 'viderebehandling', history: HIST_V1 };
const kmRow = (page, n) => page.locator('#sak-claims-tbody tr[data-claim="' + n + '"] + tr.km-row');
const originBtn = (page, n) => kmRow(page, n).locator('.km-origin');
const stored = (page) => page.evaluate((id) => JSON.parse(localStorage.getItem('pt_sak_' + id)), CASE_ID);
const liveCases = (page) => page.evaluate(() => JSON.stringify(cases));
const triClass = (page, n, field) => page.locator('#sak-claims-tbody button[data-claim="' + n + '"][data-field="' + field + '"]').getAttribute('class');

async function setOrigin(page, n, text) {
  await originBtn(page, n).click();
  const inp = kmRow(page, n).locator('.km-origin-inp');
  await inp.waitFor({ state: 'visible', timeout: 2000 });
  await inp.fill(text);
  await inp.press('Enter');
  await page.waitForTimeout(150);
}

// ── AC1–AC3: nothing new outside an active mapping round ───────────────────
e2e('AC1 Ny, round 1 (no rounds): no km-row, no mapping stored', async () => {
  const { page, errors, close } = await openCase(1280, { status: 'ny', history: HIST_NY, rounds: [] });
  assert.ok(await page.locator('#sak-claims-tbody tr[data-claim="1"]').count() === 1, 'claims table rendered');
  assert.equal(await page.locator('.km-row, .km-origin, .km-p13-btn, .km-basis').count(), 0);
  assert.equal(await page.locator('#sak-claims-tbody [class*="km-"]').count(), 0, 'no km- classes on claim rows');
  const sd = await stored(page);
  assert.ok(sd.claims.every((c) => !('mapping' in c)));
  assert.deepEqual(errors, []);
  await close();
});

e2e('AC1 Ny: claims table HTML identical to v4.53.0', async (t) => {
  let baseline;
  try {
    const html = execFileSync('git', ['show', BASELINE_REF + ':PatentDesk.html'],
      { cwd: path.join(__dirname, '..', '..'), maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
    baseline = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pd-baseline-')), 'PatentDesk.html');
    fs.writeFileSync(baseline, html);
  } catch (e) { t.skip('baseline ' + BASELINE_REF + ' not available: ' + e.message); return; }
  const opts = { status: 'ny', history: HIST_NY, rounds: [] };
  const grab = async (url) => {
    const s = await openCase(1280, opts, url);
    const h = await s.page.evaluate(() => document.getElementById('sak-claims-tbody').innerHTML);
    await s.close();
    return h;
  };
  const now = await grab(APP_URL);
  const then = await grab(pathToFileURL(baseline).href);
  assert.equal(now, then);
});

e2e('AC2 stored mapping is kept but not shown in Fristarkiv (round 2), Avsluttet and Oppdrag', async () => {
  const variants = [
    { status: 'fristarkiv', history: HIST_F2, rounds: [R1, round(2, R1_CLAIMS, { response: null })] },
    { status: 'avsluttet', history: HIST_V1.concat([H('viderebehandling', 'avsluttet', '2026-10-01')]) },
    { status: 'viderebehandling', history: HIST_V1, type: 'oppdrag', rounds: [] },
    { status: 'ny', history: HIST_V1 } // status decides, even with a letter sent and R1 «claims»
  ];
  for (const v of variants) {
    const { page, close } = await openCase(1280, Object.assign({ claims: mappedClaims() }, v));
    assert.equal(await page.locator('.km-row, .km-origin, .km-p13-btn, .km-basis').count(), 0, v.status + '/' + (v.type || 'sak'));
    const sd = await stored(page);
    assert.deepEqual(sd.claims[0].mapping, mappedClaims()[0].mapping, 'mapping kept: ' + v.status);
    await close();
  }
});

e2e('AC3 Viderebehandling after «kun argumenter» or without a response: nothing new shown', async () => {
  for (const r of [round(1, R1_CLAIMS, { response: { date: '2026-08-20', changes: [] } }), round(1, R1_CLAIMS, { response: null })]) {
    const { page, close } = await openCase(1280, { status: 'viderebehandling', history: HIST_V1_ARGS, rounds: [r], claims: mappedClaims() });
    assert.equal(await page.locator('.km-row, .km-origin, .km-p13-btn').count(), 0, JSON.stringify(r.response));
    await close();
  }
});

// ── AC4: unmapped hint opens the origin field ──────────────────────────────
e2e('AC4 «← ? angi opphav» on each unmapped claim; click opens the origin field', async () => {
  const claims = liveClaims();
  claims[1].mapping = map(2, [1]); // stale round -> treated as unmapped
  const { page, errors, close } = await openCase(1280, Object.assign({ claims }, ACTIVE));
  assert.equal(await page.locator('#sak-claims-tbody tr.km-row').count(), 5, 'one sub-row per claim');
  for (const n of [1, 2]) {
    const txt = (await kmRow(page, n).textContent()).replace(/\s+/g, ' ');
    assert.match(txt, /←\s?\?/, 'claim ' + n);
    assert.match(txt, /angi opphav/, 'claim ' + n);
    assert.equal(await kmRow(page, n).locator('.km-p13-btn').count(), 0, 'no § 13 on unmapped');
  }
  await originBtn(page, 1).click();
  const inp = kmRow(page, 1).locator('.km-origin-inp');
  await inp.waitFor({ state: 'visible', timeout: 2000 });
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('km-origin-inp')), true, 'focused');
  assert.deepEqual(errors, []);
  await close();
});

// ── AC6/AC7/AC8: «1+4» -> Endret, cleared, Angre ───────────────────────────
e2e('AC7 typing «1+4» shows «←1+4» + Endret, clears verdicts, and «Angre» restores exactly', async () => {
  const { page, errors, close } = await openCase(1280, ACTIVE);
  const before = (await stored(page)).claims[0];
  await setOrigin(page, 1, '1+4');
  assert.equal((await originBtn(page, 1).textContent()).trim(), '←1+4');
  assert.equal((await kmRow(page, 1).locator('.km-chip-endret').textContent()).trim(), 'Endret');
  assert.equal(await kmRow(page, 1).locator('.km-seg').count(), 0, 'merged: no Uendret option');
  assert.match((await kmRow(page, 1).locator('.km-prev').textContent()).trim(), /^R1: 1 N✗ O✗ D1 · 4 N✓ O✓$/);
  const c1 = (await stored(page)).claims[0];
  assert.deepEqual(c1.mapping, { round: 1, origin: [1, 4], change: c1.mapping.change, p13: null, basis: '' });
  assert.notEqual(c1.mapping.change, 'uendret');
  assert.equal(c1.novelty, null); assert.equal(c1.inventive, null); assert.equal(c1.formal, null);
  assert.equal(c1.noveltyDoc, null); assert.deepEqual(c1.inventiveDocs, []);
  assert.equal(c1.label, 'Apparat'); assert.equal(c1.notes, 'notat 1');
  assert.match(await triClass(page, 1, 'novelty'), /sak-tri-btn-null/);
  const undo = page.locator('#btn-undo-action');
  assert.ok(await undo.isVisible(), 'Angre toast shown');
  await undo.click();
  await page.waitForTimeout(150);
  assert.deepEqual((await stored(page)).claims[0], before, 'restored exactly (incl. no mapping)');
  assert.match(await triClass(page, 1, 'novelty'), /sak-tri-btn-no/);
  assert.match((await kmRow(page, 1).textContent()).replace(/\s+/g, ' '), /←\s?\?/);
  assert.deepEqual(errors, []);
  await close();
});

e2e('AC7 «Angre» is gone after the next claim edit', async () => {
  const { page, close } = await openCase(1280, ACTIVE);
  await setOrigin(page, 1, '1+4');
  assert.ok(await page.locator('#btn-undo-action').isVisible());
  await page.locator('#sak-claims-tbody button[data-claim="2"][data-field="formal"]').click();
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => undoSnapshot), null, 'snapshot dropped');
  await close();
});

e2e('AC6/AC7 «5» defaults to Endret; Uendret copies effective R1 verdicts', async () => {
  const { page, errors, close } = await openCase(1280, ACTIVE);
  await setOrigin(page, 3, '5');
  assert.equal((await originBtn(page, 3).textContent()).trim(), '←5');
  const seg = kmRow(page, 3).locator('.km-seg button');
  assert.equal(await seg.count(), 2);
  assert.equal(await kmRow(page, 3).locator('.km-seg button[aria-pressed="true"]').textContent(), 'Endret');
  let c3 = (await stored(page)).claims[2];
  assert.equal(c3.novelty, null, 'Endret starts blank');
  await kmRow(page, 3).locator('.km-seg button', { hasText: /^Uendret$/ }).click();
  await page.waitForTimeout(150);
  assert.equal((await kmRow(page, 3).locator('.km-seg button[aria-pressed="true"]').textContent()).trim(), 'Uendret');
  c3 = (await stored(page)).claims[2];
  assert.equal(c3.novelty, true, 'cascaded N✓ copied as a value');
  assert.equal(c3.inventive, true);
  assert.equal(c3.noveltyDoc, null);
  assert.equal(c3.mapping.change, 'uendret');
  assert.deepEqual(c3.mapping.origin, [5]);
  assert.match((await kmRow(page, 3).locator('.km-prev').textContent()).trim(), /^R1 N✓ O✓$/);
  assert.equal(await kmRow(page, 3).locator('.km-p13-btn, .km-basis').count(), 0, 'no § 13 on Uendret');
  assert.match(await triClass(page, 3, 'novelty'), /sak-tri-btn-ok/);
  assert.deepEqual(errors, []);
  await close();
});

e2e('AC5 «12» shows «Krav 12 finnes ikke i brev 1» and stores nothing', async () => {
  const { page, close } = await openCase(1280, ACTIVE);
  const before = await stored(page);
  await setOrigin(page, 2, '12');
  const err = kmRow(page, 2).locator('.km-err');
  assert.ok(await err.isVisible(), 'error shown');
  assert.equal((await err.textContent()).trim(), 'Krav 12 finnes ikke i brev 1');
  assert.equal(await kmRow(page, 2).locator('.km-origin-inp').getAttribute('aria-invalid'), 'true');
  assert.deepEqual(await stored(page), before, 'nothing stored');
  await close();
});

e2e('AC5 «ny» marks the claim new; empty input clears the mapping', async () => {
  const { page, close } = await openCase(1280, ACTIVE);
  await setOrigin(page, 4, 'NY');
  assert.equal((await originBtn(page, 4).textContent()).trim(), 'Ny');
  assert.deepEqual((await stored(page)).claims[3].mapping.origin, []);
  assert.equal(await kmRow(page, 4).locator('.km-p13-btn').count(), 1, '§ 13 on Ny');
  await setOrigin(page, 4, '');
  assert.ok(!('mapping' in (await stored(page)).claims[3]) || (await stored(page)).claims[3].mapping == null);
  assert.match((await kmRow(page, 4).textContent()).replace(/\s+/g, ' '), /←\s?\?/);
  await close();
});

// ── AC9: § 13 tri-state + basis ────────────────────────────────────────────
e2e('AC9 § 13 cycles — / ✓ / ✗ mangler grunnlag; basis saved on blur and rendered escaped', async () => {
  const { page, errors, close } = await openCase(1280, ACTIVE);
  await setOrigin(page, 1, '1+4');
  const p13 = kmRow(page, 1).locator('.km-p13-btn[data-claim-p13="1"]');
  assert.equal((await p13.textContent()).trim(), '§13 —');
  await p13.click(); await page.waitForTimeout(100);
  assert.equal((await kmRow(page, 1).locator('.km-p13-btn').textContent()).trim(), '§13 ✓');
  assert.equal((await stored(page)).claims[0].mapping.p13, true);
  await kmRow(page, 1).locator('.km-p13-btn').click(); await page.waitForTimeout(100);
  assert.equal((await kmRow(page, 1).locator('.km-p13-btn').textContent()).trim(), '§13 ✗ mangler grunnlag');
  assert.equal((await stored(page)).claims[0].mapping.p13, false);
  await kmRow(page, 1).locator('.km-p13-btn').click(); await page.waitForTimeout(100);
  assert.equal((await kmRow(page, 1).locator('.km-p13-btn').textContent()).trim(), '§13 —');
  assert.equal((await stored(page)).claims[0].mapping.p13, null);

  const basis = kmRow(page, 1).locator('.km-basis');
  assert.equal(await basis.getAttribute('maxlength'), '200');
  await basis.fill('  ' + XSS + '  ');
  await basis.press('Tab');
  await page.waitForTimeout(150);
  assert.equal((await stored(page)).claims[0].mapping.basis, XSS, 'trimmed, stored as plain text');
  // re-render from storage
  await page.evaluate(() => { navigateTo('home'); });
  await page.waitForTimeout(100);
  await page.evaluate((id) => { navigateTo('sak/' + id); }, CASE_ID);
  await page.waitForTimeout(150);
  assert.equal(await kmRow(page, 1).locator('.km-basis').inputValue(), XSS, 'shown literally');
  assert.equal(await page.locator('#sak-claims-tbody img').count(), 0, 'no <img> created');
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.deepEqual(errors, []);
  await close();
});

e2e('AC9 Uendret hides § 13 and basis but keeps them stored', async () => {
  const claims = liveClaims();
  claims[2].mapping = map(1, [5], { p13: true, basis: 'Beskr. s. 2' });
  const { page, close } = await openCase(1280, Object.assign({ claims }, ACTIVE));
  assert.equal(await kmRow(page, 3).locator('.km-p13-btn').count(), 1);
  await kmRow(page, 3).locator('.km-seg button', { hasText: /^Uendret$/ }).click();
  await page.waitForTimeout(150);
  assert.equal(await kmRow(page, 3).locator('.km-p13-btn, .km-basis').count(), 0);
  const m = (await stored(page)).claims[2].mapping;
  assert.equal(m.p13, true);
  assert.equal(m.basis, 'Beskr. s. 2');
  await close();
});

e2e('AC8 hint shows «D3 (trukket)» for a withdrawn citation', async () => {
  const claims = liveClaims();
  claims[0].mapping = map(1, [3]);
  const { page, close } = await openCase(1280, Object.assign({ claims }, ACTIVE));
  assert.match((await kmRow(page, 1).locator('.km-prev').textContent()).trim(), /^R1 N✗ O✗ D3 \(trukket\)$/);
  await close();
});

// ── Layout: no horizontal overflow with mapped rows ────────────────────────
for (const width of [960, 1280]) {
  e2e('layout: claims table with mapped rows has no horizontal overflow at ' + width + ' px', async () => {
    const { page, close } = await openCase(width, Object.assign({ claims: mappedClaims() }, ACTIVE));
    assert.equal(await page.locator('#sak-claims-tbody tr.km-row').count(), 5);
    await page.evaluate(() => {
      const sec = document.querySelector('section[data-sak-section="claims"]');
      if (sec) sec.scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(100);
    const m = await page.evaluate(() => {
      const t = document.querySelector('.sak-claims-table');
      let wrapOverflow = 0;
      for (let el = t.parentElement; el && el !== document.body; el = el.parentElement) {
        wrapOverflow = Math.max(wrapOverflow, el.scrollWidth - el.clientWidth);
        if (el.classList.contains('main') || el.id === 'page-sak') break;
      }
      const rows = Array.from(document.querySelectorAll('#sak-claims-tbody tr.km-row'));
      const tb = t.getBoundingClientRect();
      const sticking = rows.some((r) => Array.from(r.querySelectorAll('*')).some((el) => el.getBoundingClientRect().right > tb.right + 0.5));
      return { wrapOverflow, sticking, tableOverflow: t.scrollWidth - t.clientWidth,
        docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    assert.ok(m.wrapOverflow <= 1, JSON.stringify(m));
    assert.ok(m.tableOverflow <= 1, JSON.stringify(m));
    assert.ok(!m.sticking, 'sub-row content stays inside the table: ' + JSON.stringify(m));
    assert.ok(m.docOverflow <= 0, JSON.stringify(m));
    await close();
  });
}

// ── AC11: stored in pt_sak_<id>, frozen into the next round ────────────────
e2e('AC11 mapping lives in pt_sak_<id> (never pt_cases) and is frozen into R2 on «Brev sendt»', async () => {
  const { page, errors, close } = await openCase(1280, ACTIVE);
  await setOrigin(page, 1, '1+4');
  await kmRow(page, 1).locator('.km-p13-btn').click();
  await page.waitForTimeout(100);
  let sd = await stored(page);
  assert.deepEqual(sd.claims[0].mapping.origin, [1, 4]);
  const pc = await page.evaluate(() => ({ raw: localStorage.getItem('pt_cases'), live: JSON.stringify(cases) }));
  // Key names, not bare words: CASE_ID itself contains «mapping».
  assert.ok(!/"(mapping|origin|p13|basis)"\s*:/.test(pc.live), 'not in cases[]');
  assert.ok(!/"(mapping|origin|p13|basis)"\s*:/.test(pc.raw), 'not in pt_cases');

  await page.locator('#btn-sak-forward').click();
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(150);
    let clicked = false;
    // From Viderebehandling «Avgjør» asks first: «Nytt realitetsbrev» -> frist dialog.
    for (const sel of ['#btn-videre-fristarkiv', '#btn-complete-confirm', '#btn-tag-confirm', '#btn-frist-confirm']) {
      const b = page.locator(sel);
      if (await b.isVisible().catch(() => false)) { await b.click(); clicked = true; break; }
    }
    if (!clicked) break;
  }
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate((id) => cases.find((c) => c.id === id).status, CASE_ID), 'fristarkiv');
  sd = await stored(page);
  assert.equal(sd.rounds.length, 2);
  assert.equal(sd.rounds[1].n, 2);
  assert.deepEqual(sd.rounds[1].claims[0].mapping, sd.claims[0].mapping, 'frozen into R2');
  assert.equal(sd.rounds[1].claims[0].mapping.p13, true);
  assert.ok(!('mapping' in sd.rounds[1].claims[1]), 'unmapped claims stay without mapping');
  assert.ok(sd.claims[0].mapping, 'live mapping kept');
  assert.equal(await page.locator('.km-row').count(), 0, 'Fristarkiv: hidden');
  assert.deepEqual(errors, []);
  await close();
});

// ── AC14: belegg-related case data unchanged ───────────────────────────────
e2e('AC14 mapping edits leave cases[] (dueDate, status, belegg inputs) byte-identical', async () => {
  const { page, close } = await openCase(1280, ACTIVE);
  const before = await liveCases(page);
  const rawBefore = await page.evaluate(() => localStorage.getItem('pt_cases'));
  await setOrigin(page, 1, '1+4');
  await setOrigin(page, 3, '5');
  await kmRow(page, 3).locator('.km-seg button', { hasText: /^Uendret$/ }).click();
  await page.waitForTimeout(100);
  await setOrigin(page, 4, 'ny');
  await kmRow(page, 4).locator('.km-p13-btn').click();
  await kmRow(page, 4).locator('.km-basis').fill('s. 4');
  await kmRow(page, 4).locator('.km-basis').press('Tab');
  await page.waitForTimeout(150);
  assert.equal(await liveCases(page), before, 'cases[] unchanged');
  assert.equal(await page.evaluate(() => localStorage.getItem('pt_cases')), rawBefore, 'pt_cases unchanged');
  await close();
});
