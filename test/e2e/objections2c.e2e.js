'use strict';
// Browser tests for slice 2C «Innvendinger» (spec rounds2/2c/spec.md, approved
// mockup ux/rounds2bc-mockup.html). Written by QA before the builder.
//
// NOT part of `npm test`. Run with: node --test test/e2e/*.e2e.js
// If Playwright or Chromium is unavailable, every test is skipped, not failed.
//
// DOM hooks these tests rely on (the builder must use them):
//   #sak-svar .ob-list              the objection block in «Svar og endringer» (absent outside Viderebehandling / oppdrag)
//     .ob-title                     «Innvendinger fra brev L»
//     .ob-progress                  «x / y vurdert»; title= tooltip explaining «Ny» ones are not counted
//     .ob-empty                     «Ingen innvendinger i brev L» (also used for «Ingen lagret runde for brev N»)
//     .ob-backfilled                «Runden er lagret i ettertid» (round.backfilled only)
//     .ob-row                       one per (grouped) row; .ob-row.ob-manual for manual ones
//       .ob-text                    the row text (manual: the escaped free text)
//       .ob-state button[data-state="open|resolved|maintained|dropped"]  aria-pressed="true" on the active one
//       .ob-new                     «Ny – tas med i brev k» pill (no .ob-state in that row)
//       .ob-del                     × delete (manual rows only, no confirm dialog)
//     .ob-add                       «+ Innvending»
//     .ob-form                      add form: .ob-input (text), .ob-isnew (checkbox «Ny i denne runden»),
//                                   .ob-submit «Legg til», .ob-cancel «Avbryt»
//   #videre-choice-backdrop .ob-warn       amber list directly under #btn-videre-avslag
//     li                                   one per refusalWarnings() line; no li (or no list) when clean

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP_URL = pathToFileURL(process.env.E2E_APP_FILE || path.join(__dirname, '..', '..', 'PatentDesk.html')).href;
const HEIGHT = 900;
const CASE_ID = 'e2eobj2c';
const XSS = '<img src=x onerror=alert(1)>';

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
function claim(num, over) {
  return Object.assign({
    num, novelty: null, inventive: null, formal: null, notes: '', independent: num === 1,
    dep: num === 1 ? null : 1, depManual: false, label: '', noveltyDoc: null, inventiveDocs: []
  }, over || {});
}
const H = (from, to, date, extra) => Object.assign({ type: 'status', date: date + 'T10:00:00.000Z', from, to }, extra || {});
const HIST_NY = [{ type: 'status', date: '2026-03-01T10:00:00.000Z', from: null, to: 'ny' }];
const HIST_F1 = HIST_NY.concat([H('ny', 'fristarkiv', '2026-06-01')]);
const HIST_V1 = HIST_F1.concat([H('fristarkiv', 'viderebehandling', '2026-08-21', { received: '2026-08-20', changes: [] })]);

const EX_CLAIMS = () => [
  claim(1, { novelty: false, inventive: false, noveltyDoc: 'D1' }),
  claim(2, { novelty: true, inventive: false, inventiveDocs: ['D1', 'D2'] }),
  claim(3, { novelty: true, inventive: true, formal: true }),
  claim(4, { novelty: true, inventive: true, formal: false }),
  claim(5, { novelty: true, inventive: true })
];
const GROUP_CLAIMS = () => [
  claim(1, { novelty: true, inventive: true }),
  claim(2, { novelty: true, inventive: false, inventiveDocs: ['D1', 'D2'] }),
  claim(3, { novelty: true, inventive: false, inventiveDocs: ['D1', 'D2'] }),
  claim(4, { novelty: true, inventive: false, inventiveDocs: ['D1', 'D2'] }),
  claim(5, { novelty: true, inventive: false, inventiveDocs: ['D1', 'D2'] })
];
function round1(claims, over) {
  return Object.assign({ n: 1, letter: { date: '2026-06-01', deadline: '2026-09-01' },
    response: { date: '2026-08-20', changes: [] }, claims, docIds: ['D1', 'D2', 'D3'] }, over || {});
}

function seedData(opts) {
  const kase = {
    id: CASE_ID, caseNumber: '20261377', status: opts.status || 'viderebehandling', dueDate: '2026-12-15',
    title: 'Testsak for innvendinger', notes: '', tags: '', createdAt: '2026-03-01T10:00:00.000Z',
    history: opts.history || HIST_V1, type: opts.type || 'sak', duration: opts.type === 'oppdrag' ? 5 : null, caseBuffer: null
  };
  const sak = {
    numClaims: 5, filingDate: '', priorityDate: '', checklist: {}, classes: [],
    docs: ['D1', 'D2', 'D3'].map((id, i) => ({ id, ref: 'EP ' + (1000 + i) + ' A1', pubDate: '', effDate: '',
      title: '', p: false, e: false, background: false, withdrawn: false })),
    claims: opts.claims || EX_CLAIMS(),
    rounds: opts.rounds === undefined ? [round1(EX_CLAIMS())] : opts.rounds
  };
  if (opts.objections) sak.objections = opts.objections;
  if (opts.objectionStates) sak.objectionStates = opts.objectionStates;
  return { cases: JSON.stringify([kase]), sak: JSON.stringify(sak) };
}

async function openCase(opts, width) {
  const ctx = await browser.newContext({ viewport: { width: width || 1280, height: HEIGHT } });
  const page = await ctx.newPage();
  const errors = [];
  const dialogs = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  const s = seedData(opts || {});
  await page.addInitScript(([id, cs, sak]) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    localStorage.setItem('pt_onboarding_completed', '1');
    localStorage.setItem('pt_schema_version', '8');
    localStorage.setItem('pt_cases', cs);
    localStorage.setItem('pt_sak_' + id, sak);
  }, [CASE_ID, s.cases, s.sak]);
  await page.goto(APP_URL);
  await gotoCase(page);
  return { page, errors, dialogs, close: () => ctx.close() };
}
async function gotoCase(page) {
  await page.evaluate((id) => { navigateTo('sak/' + id); }, CASE_ID);
  await page.waitForTimeout(150);
}
const list = (page) => page.locator('#sak-svar .ob-list');
const rows = (page) => page.locator('#sak-svar .ob-row');
const stored = (page) => page.evaluate((id) => JSON.parse(localStorage.getItem('pt_sak_' + id)), CASE_ID);
const storedCase = (page) => page.evaluate((id) => decodeCase(JSON.parse(localStorage.getItem('pt_cases')).find((c) => c.id === id)), CASE_ID);
const texts = async (loc) => (await loc.allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());

async function openAvgjor(page) {
  await page.evaluate((id) => { openVidereChoice(id, '20261377'); }, CASE_ID);
  await page.waitForTimeout(100);
  assert.ok(await page.locator('#btn-videre-avslag').isVisible(), 'Avgjør dialog open');
}

// ── AC8 / AC9 / AC10 ───────────────────────────────────────────────────────
e2e('AC8 no objection list or «+ Innvending» in Ny, Fristarkiv, Avsluttet, or for oppdrag', async () => {
  const variants = [
    { status: 'ny', history: HIST_NY },
    { status: 'fristarkiv', history: HIST_F1 },
    { status: 'avsluttet', history: HIST_V1.concat([H('viderebehandling', 'avsluttet', '2026-10-01')]) },
    { status: 'viderebehandling', type: 'oppdrag' }
  ];
  for (const v of variants) {
    const { page, close } = await openCase(v);
    assert.equal(await page.locator('.ob-list').count(), 0, JSON.stringify(v.status + '/' + (v.type || 'sak')));
    assert.equal(await page.locator('.ob-add').count(), 0);
    await close();
  }
});

e2e('AC7 Viderebehandling: «Innvendinger fra brev 1» with one row per objection', async () => {
  const { page, errors, close } = await openCase({});
  assert.equal(await list(page).count(), 1);
  assert.match(await list(page).locator('.ob-title').textContent(), /Innvendinger fra brev 1/);
  assert.deepEqual(await texts(rows(page).locator('.ob-text')), [
    'Brev 1 · krav 1 · Mangler nyhet (D1)',
    'Brev 1 · krav 2 · Mangler OH (D1+D2)',
    'Brev 1 · krav 3 · Formelle feil'
  ]);
  assert.equal((await list(page).locator('.ob-progress').textContent()).trim(), '0 / 3 vurdert');
  assert.equal(await list(page).locator('.ob-backfilled').count(), 0, 'not a backfilled round');
  assert.deepEqual(errors, []);
  await close();
});

e2e('AC9 no stored round → «Ingen lagret runde for brev 1», no rows', async () => {
  const { page, close } = await openCase({ rounds: [] });
  assert.match(await page.locator('#sak-svar').textContent(), /Ingen lagret runde for brev 1/);
  assert.equal(await rows(page).count(), 0);
  await close();
});

e2e('AC10 round without objections → «Ingen innvendinger i brev 1» and «+ Innvending»', async () => {
  const ok = [1, 2, 3].map((n) => claim(n, { novelty: true, inventive: true }));
  const { page, close } = await openCase({ rounds: [round1(ok)], claims: ok });
  assert.match(await list(page).locator('.ob-empty').textContent(), /Ingen innvendinger i brev 1/);
  assert.equal(await rows(page).count(), 0);
  assert.equal(await list(page).locator('.ob-add').count(), 1);
  await close();
});

e2e('grouped row: same ground and docs → «krav 2–5», one state control', async () => {
  const { page, close } = await openCase({ rounds: [round1(GROUP_CLAIMS())], claims: GROUP_CLAIMS() });
  assert.deepEqual(await texts(rows(page).locator('.ob-text')), ['Brev 1 · krav 2–5 · Mangler OH (D1+D2)']);
  await rows(page).first().locator('.ob-state button[data-state="maintained"]').click();
  await page.waitForTimeout(100);
  const s = await stored(page);
  assert.deepEqual(s.objectionStates, { 2: { 'r1-k2-oh': 'maintained', 'r1-k3-oh': 'maintained',
    'r1-k4-oh': 'maintained', 'r1-k5-oh': 'maintained' } }, 'stored per claim');
  assert.equal((await list(page).locator('.ob-progress').textContent()).trim(), '1 / 1 vurdert');
  await close();
});

e2e('«Runden er lagret i ettertid» on a backfilled round', async () => {
  const { page, close } = await openCase({ rounds: [round1(EX_CLAIMS(), { backfilled: true })] });
  assert.match(await list(page).locator('.ob-backfilled').textContent(), /Runden er lagret i ettertid/);
  await close();
});

// ── AC11: state persists ───────────────────────────────────────────────────
e2e('AC11 state buttons: default Åpen, «Løst» persists in objectionStates["2"] across reload', async () => {
  const { page, close } = await openCase({});
  const first = rows(page).first();
  assert.equal(await first.locator('.ob-state button').count(), 4);
  assert.equal(await first.locator('.ob-state button[data-state="open"]').getAttribute('aria-pressed'), 'true');
  await first.locator('.ob-state button[data-state="resolved"]').click();
  await page.waitForTimeout(100);
  assert.deepEqual((await stored(page)).objectionStates, { 2: { 'r1-k1-nyhet': 'resolved' } });
  assert.equal((await list(page).locator('.ob-progress').textContent()).trim(), '1 / 3 vurdert');

  await page.reload();
  await gotoCase(page);
  assert.equal(await rows(page).first().locator('.ob-state button[data-state="resolved"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await rows(page).nth(1).locator('.ob-state button[data-state="open"]').getAttribute('aria-pressed'), 'true');

  await rows(page).first().locator('.ob-state button[data-state="open"]').click();
  await page.waitForTimeout(100);
  const s = await stored(page);
  assert.ok(!s.objectionStates || !s.objectionStates[2] || !('r1-k1-nyhet' in s.objectionStates[2]), 'open is not stored');
  await close();
});

e2e('AC11 «x / y vurdert» tooltip explains that «Ny» objections are not counted', async () => {
  const { page, close } = await openCase({ objections: [{ id: 'mnew0001', text: 'Enhet', raisedIn: 2 }] });
  assert.equal((await list(page).locator('.ob-progress').textContent()).trim(), '0 / 3 vurdert', 'Ny not in y');
  const title = await list(page).locator('.ob-progress').getAttribute('title');
  assert.ok(title, 'tooltip present');
  assert.match(title, /Ny/);
  assert.match(title, /ikke/);
  await close();
});

// ── AC12: manual objections ────────────────────────────────────────────────
e2e('AC12 «+ Innvending» with «Ny i denne runden» → «Ny – tas med i brev 2», then delete', async () => {
  const { page, close } = await openCase({});
  await list(page).locator('.ob-add').click();
  const form = list(page).locator('.ob-form');
  await form.locator('.ob-input').fill('   ');
  await form.locator('.ob-submit').click();
  await page.waitForTimeout(80);
  assert.ok(!((await stored(page)).objections || []).length, 'empty text rejected');

  await form.locator('.ob-input').fill('  Mangler enhet  ');
  await form.locator('.ob-isnew').check();
  await form.locator('.ob-submit').click();
  await page.waitForTimeout(100);
  const s = await stored(page);
  assert.equal(s.objections.length, 1);
  assert.equal(s.objections[0].text, 'Mangler enhet');
  assert.equal(s.objections[0].raisedIn, 2);
  assert.match(s.objections[0].id, /^m[a-z0-9]{4,24}$/);

  const manual = page.locator('#sak-svar .ob-row.ob-manual');
  assert.equal(await manual.count(), 1);
  assert.match(await manual.textContent(), /Mangler enhet/);
  assert.match(await manual.locator('.ob-new').textContent(), /Ny – tas med i brev 2/);
  assert.equal(await manual.locator('.ob-state').count(), 0, 'no state control on a new one');

  await manual.locator('.ob-del').click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#sak-svar .ob-row.ob-manual').count(), 0);
  assert.deepEqual((await stored(page)).objections || [], []);
  await close();
});

e2e('AC12 unticked → raisedIn = L, with a state control', async () => {
  const { page, close } = await openCase({});
  await list(page).locator('.ob-add').click();
  const form = list(page).locator('.ob-form');
  await form.locator('.ob-input').fill('Enhet fra brev 1');
  await form.locator('.ob-submit').click();
  await page.waitForTimeout(100);
  assert.equal((await stored(page)).objections[0].raisedIn, 1);
  const manual = page.locator('#sak-svar .ob-row.ob-manual');
  assert.equal(await manual.locator('.ob-state button').count(), 4);
  assert.equal(await manual.locator('.ob-new').count(), 0);
  assert.equal((await list(page).locator('.ob-progress').textContent()).trim(), '0 / 4 vurdert');
  await close();
});

// ── AC14–20 in Avgjør ──────────────────────────────────────────────────────
e2e('Avgjør: warnings listed under «Avslag»; Avslag still closes the case as avslått', async () => {
  const { page, close } = await openCase({});
  await openAvgjor(page);
  const warn = page.locator('#videre-choice-backdrop .ob-warn');
  assert.equal(await warn.count(), 1, 'one list, only under Avslag');
  assert.deepEqual(await texts(warn.locator('li')), ['3 innvendinger er ikke vurdert']);
  const a = await page.locator('#btn-videre-avslag').boundingBox();
  const w = await warn.boundingBox();
  const other = await page.locator('#btn-videre-avslutt').boundingBox();
  assert.ok(w.y >= a.y + a.height - 1 && w.y < other.y, 'directly under the Avslag button');
  assert.equal(await page.locator('#btn-videre-avslag').isDisabled(), false);

  await page.locator('#btn-videre-avslag').click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#btn-videre-avslag').isVisible(), false, 'no «Avslå likevel?» step');
  await page.locator('#btn-tag-confirm').click(); // the existing «Avslutt sak» step
  await page.waitForTimeout(150);
  const c = await storedCase(page);
  assert.equal(c.status, 'avsluttet');
  assert.equal(c.outcome, 'avslatt');
  await close();
});

e2e('Avgjør: no warning list when the case is clean', async () => {
  const { page, close } = await openCase({ objectionStates: { 2: { 'r1-k1-nyhet': 'maintained',
    'r1-k2-oh': 'maintained', 'r1-k3-formelt': 'maintained' } } });
  await openAvgjor(page);
  assert.equal(await page.locator('#videre-choice-backdrop .ob-warn li').count(), 0);
  const warn = page.locator('#videre-choice-backdrop .ob-warn');
  if (await warn.count()) assert.equal(await warn.isVisible(), false, 'empty list not shown');
  await close();
});

// ── AC22: escaping ─────────────────────────────────────────────────────────
e2e('AC22 manual text is rendered literally in the list and in Avgjør', async () => {
  const { page, errors, dialogs, close } = await openCase({
    objections: [{ id: 'mxss0001', text: XSS, raisedIn: 2 }],
    objectionStates: { 2: { 'r1-k1-nyhet': 'maintained', 'r1-k2-oh': 'maintained', 'r1-k3-formelt': 'maintained' } }
  });
  const manual = page.locator('#sak-svar .ob-row.ob-manual');
  assert.match(await manual.textContent(), /<img src=x onerror=alert\(1\)>/);
  assert.equal(await list(page).locator('img').count(), 0);
  await openAvgjor(page);
  assert.deepEqual(await texts(page.locator('#videre-choice-backdrop .ob-warn li')), ['Ny innvending: ' + XSS]);
  assert.equal(await page.locator('#videre-choice-backdrop img').count(), 0);
  await page.waitForTimeout(100);
  assert.deepEqual(dialogs, [], 'no alert fired');
  assert.deepEqual(errors, []);
  await close();
});
