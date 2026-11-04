'use strict';
// Browser tests for the final 2B+2C fix round (rounds2/2c/fix-round.md, C1–C6).
// Written by QA before the builder. Unit-level parts: test/finalFixes.test.js.
//
// NOT part of `npm test`. Run with: node --test test/e2e/*.e2e.js
// If Playwright or Chromium is unavailable, every test is skipped, not failed.
//
// Seeding: an init script fills localStorage once per page. No test here calls
// page.reload() (the init script would run again); a «reload» is a fresh page
// in the same context.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP_URL = pathToFileURL(process.env.E2E_APP_FILE || path.join(__dirname, '..', '..', 'PatentDesk.html')).href;
const HEIGHT = 900;
const CASE_ID = 'e2efinal';
const EVIL_NUM = '1" onfocus=alert(1) x="';

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
const histV1 = (changes) => HIST_F1.concat([H('fristarkiv', 'viderebehandling', '2026-08-21', { received: '2026-08-20', changes })]);

const EX_CLAIMS = () => [
  claim(1, { novelty: false, inventive: false, noveltyDoc: 'D1' }),
  claim(2, { novelty: true, inventive: false, inventiveDocs: ['D1', 'D2'] }),
  claim(3, { novelty: true, inventive: true, formal: true }),
  claim(4, { novelty: true, inventive: true, formal: false }),
  claim(5, { novelty: true, inventive: true })
];
function round1(claims, changes) {
  return { n: 1, letter: { date: '2026-06-01', deadline: '2026-09-01' },
    response: { date: '2026-08-20', changes: changes || [] }, claims, docIds: ['D1', 'D2', 'D3'] };
}

function seedData(opts) {
  const kase = {
    id: CASE_ID, caseNumber: '20261388', status: opts.status || 'viderebehandling', dueDate: '2026-12-15',
    title: 'Testsak for siste rettinger', notes: '', tags: '', createdAt: '2026-03-01T10:00:00.000Z',
    history: opts.history || histV1(opts.changes || []), type: 'sak', duration: null, caseBuffer: null
  };
  const sak = {
    numClaims: opts.numClaims || 5, filingDate: '', priorityDate: '', checklist: {}, classes: [],
    docs: ['D1', 'D2', 'D3'].map((id, i) => ({ id, ref: 'EP ' + (1000 + i) + ' A1', pubDate: '', effDate: '',
      title: '', p: false, e: false, background: false, withdrawn: false })),
    claims: opts.claims || EX_CLAIMS(),
    rounds: opts.rounds === undefined ? [round1(EX_CLAIMS(), opts.changes)] : opts.rounds
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
  return { page, ctx, errors, dialogs, close: () => ctx.close() };
}
async function gotoCase(page) {
  await page.evaluate((id) => { navigateTo('sak/' + id); }, CASE_ID);
  await page.waitForTimeout(150);
}
const list = (page) => page.locator('#sak-svar .ob-list');
const rows = (page) => page.locator('#sak-svar .ob-row');
const texts = async (loc) => (await loc.allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());

// ── C1: a stored hostile claim num makes no attribute / handler ────────────
e2e('C1 a claim num seeded straight into localStorage creates no handler attribute when the case is opened', async () => {
  // Viderebehandling with changed claims, so the mapping cells render as well.
  const claims = EX_CLAIMS().map((c) => Object.assign(c, { mapping: { round: 1, origin: [c.num], change: 'uendret' } }));
  claims[0].num = EVIL_NUM;
  claims[0].mapping = { round: 1, origin: [1], change: 'uendret' };
  const { page, errors, dialogs, close } = await openCase({ claims, changes: ['claims'] });
  assert.ok(await page.locator('#sak-claims-tbody tr').count() > 0, 'claims table rendered');

  const injected = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('*').forEach((el) => {
      for (const a of el.attributes) {
        const html = el.namespaceURI === 'http://www.w3.org/1999/xhtml'; // SVG x= is legitimate
        if (/^on/i.test(a.name) || (html && a.name === 'x')) out.push(el.tagName + '[' + a.name + '="' + a.value + '"]');
      }
    });
    return out;
  });
  assert.deepEqual(injected, [], 'no injected handler / attribute anywhere');

  // Focus and click through the claims table: neither fires the payload nor
  // throws from a querySelector built from the raw num.
  const focusables = page.locator('#sak-claims-tbody button, #sak-claims-tbody input, #sak-claims-tree [data-kt-num]');
  const n = await focusables.count();
  for (let i = 0; i < Math.min(n, 40); i++) {
    await focusables.nth(i).focus().catch(() => {});
  }
  const first = page.locator('#sak-claims-tbody .sak-tri-btn[data-field]').first();
  if (await first.count()) {
    await first.click().catch(() => {});
    await page.keyboard.press('ArrowDown').catch(() => {});
    await page.keyboard.press('ArrowRight').catch(() => {});
  }
  await page.waitForTimeout(150);
  assert.deepEqual(dialogs, [], 'no alert fired');
  assert.deepEqual(errors.filter((e) => /SyntaxError|not a valid selector/i.test(e)), [], 'no selector built from the raw num');
  await close();
});

// ── C2: OBJECTION_DELETE guard (browser check; unit test in finalFixes.test.js)
e2e('C2 OBJECTION_DELETE does nothing outside Viderebehandling', async () => {
  const objections = [{ id: 'mdel0001', text: 'Egen innvending', raisedIn: 1 }];
  const { page, close } = await openCase({ status: 'fristarkiv', history: HIST_F1, objections });
  const pre = await page.evaluate((id) => JSON.parse(localStorage.getItem('pt_sak_' + id)), CASE_ID);
  assert.deepEqual(pre.objections, objections, 'seeded objection present before the action');
  await page.evaluate((id) => { dispatch('OBJECTION_DELETE', { id, objId: 'mdel0001' }); }, CASE_ID);
  await page.waitForTimeout(80);
  const s = await page.evaluate((id) => JSON.parse(localStorage.getItem('pt_sak_' + id)), CASE_ID);
  assert.deepEqual(s.objections, objections, 'objection kept');
  await close();
});

// ── C3: manual rows lay out like derived rows at 960 px ───────────────────
const LONG = 'Egen innvending med en ganske lang tekst om at kravene mangler klarhet og støtte i beskrivelsen, ' +
  'og at uttrykket «i det vesentlige» er uklart';

async function rowGeometry(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('#sak-svar .ob-row')).map((r) => {
    const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, r: b.right, b: b.bottom, h: b.height }; };
    return { manual: r.classList.contains('ob-manual'), row: box(r), text: box(r.querySelector('.ob-text')),
      state: box(r.querySelector('.ob-state')), del: box(r.querySelector('.ob-del')) };
  }));
}

for (const width of [960, 1280]) {
  e2e('C3 at ' + width + ' px manual («Egen») rows lay out like derived rows (buttons + × on the right, one line, text wraps)', async () => {
    const { page, close } = await openCase({ objections: [
      { id: 'mlong001', text: LONG, raisedIn: 1 },
      { id: 'mshrt001', text: 'Kort egen', raisedIn: 1 }
    ] }, width);
    const g = await rowGeometry(page);
    assert.ok(g.length >= 5, 'derived + manual rows: ' + g.length);
    assert.ok(g.some((r) => r.manual) && g.some((r) => !r.manual), 'both kinds present');
    const long = g.find((r) => r.manual && r.text && r.text.h > 30);
    assert.ok(long, 'long manual text wraps onto more than one line: ' + JSON.stringify(g.filter((r) => r.manual)));
    const msg = (r) => JSON.stringify(r);
    for (const r of g) {
      assert.ok(r.state, 'state control: ' + msg(r));
      // Buttons beside the text, not pushed onto a line below it
      assert.ok(r.state.y < r.text.b - 4 && r.state.b > r.text.y + 4, 'state buttons beside the text: ' + msg(r));
      assert.ok(r.state.b <= r.row.b + 1 && r.state.y - r.row.y < r.row.h / 2, 'state buttons not on a second line: ' + msg(r));
      assert.ok(r.text.r <= r.state.x + 1, 'text left of the buttons: ' + msg(r));
      if (r.manual) {
        assert.ok(r.del && r.del.h > 0, '× present on a manual row: ' + msg(r));
        assert.ok(Math.abs((r.del.y + r.del.b) / 2 - (r.state.y + r.state.b) / 2) <= 4, '× on the same line as the buttons: ' + msg(r));
        assert.ok(r.state.r <= r.del.x + 1, 'buttons left of the ×: ' + msg(r));
        assert.ok(r.row.r - r.del.r <= 2, '× at the right edge: ' + msg(r));
      }
    }
    // Same right-hand column for the buttons in every row (derived and manual)
    const rights = g.map((r) => Math.round(r.state.r));
    assert.ok(Math.max(...rights) - Math.min(...rights) <= 2, 'state buttons end at the same x in every row: ' + rights);
    // Same vertical layout: every row is one line of controls (row height ≈ max(text, buttons))
    for (const r of g) {
      assert.ok(r.row.h <= Math.max(r.text.h, r.state.h) + 20, 'no extra line in the row: ' + msg(r));
    }
    await close();
  });
}

// ── C4: Avgjør warning list aligned with «Avslag» ─────────────────────────
for (const width of [960, 1280]) {
  e2e('C4 at ' + width + ' px the warning list under «Avslag» is left-aligned with it and as wide (±2 px)', async () => {
    const { page, close } = await openCase({}, width);
    await page.evaluate((id) => { openVidereChoice(id, '20261388'); }, CASE_ID);
    await page.waitForTimeout(120);
    const warn = page.locator('#videre-choice-backdrop .ob-warn');
    assert.ok(await warn.isVisible(), 'warning list shown (unassessed objections)');
    const a = await page.locator('#btn-videre-avslag').boundingBox();
    const w = await warn.boundingBox();
    assert.ok(Math.abs(w.x - a.x) <= 2, 'left edge: warn ' + w.x + ' vs Avslag ' + a.x);
    assert.ok(Math.abs(w.width - a.width) <= 2, 'width: warn ' + w.width + ' vs Avslag ' + a.width);
    assert.ok(w.y >= a.y + a.height - 1, 'still under the button');
    await close();
  });
}

// ── C5: claim count change re-renders the objection block ─────────────────
e2e('C5 SAK_CLAIM_COUNT_CHANGE re-renders «Svar og endringer» so «→ nå krav / → strøket» are not stale', async () => {
  const claims = EX_CLAIMS().map((c) => Object.assign(c, { mapping: { round: 1, origin: [c.num], change: 'uendret' } }));
  const { page, close } = await openCase({ claims, changes: ['claims'] });
  const before = await texts(rows(page).locator('.ob-text'));
  assert.ok(before.some((t) => /krav 3 · Formelle feil.*→ nå krav 3/.test(t)), 'before: ' + JSON.stringify(before));

  await page.evaluate((id) => { dispatch('SAK_CLAIM_COUNT_CHANGE', { id, count: 2 }); }, CASE_ID);
  await page.waitForTimeout(120);
  const afterChange = await texts(rows(page).locator('.ob-text'));
  assert.ok(afterChange.some((t) => /krav 3 · Formelle feil.*→ strøket/.test(t)), 'after: ' + JSON.stringify(afterChange));

  await gotoCase(page); // a full render from storage must agree
  assert.deepEqual(afterChange, await texts(rows(page).locator('.ob-text')), 'same as a fresh render');
  await close();
});

// ── C6: open add form survives a state-button re-render ───────────────────
e2e('C6 an open «+ Innvending» form keeps its text and «Ny i denne runden» after a state-button click', async () => {
  const { page, errors, close } = await openCase({});
  await list(page).locator('.ob-add').click();
  const form = () => list(page).locator('.ob-form');
  await form().locator('.ob-input').fill('Halvskrevet innvending');
  await form().locator('.ob-isnew').check();

  await rows(page).first().locator('.ob-state button[data-state="maintained"]').click();
  await page.waitForTimeout(120);
  assert.equal(await rows(page).first().locator('.ob-state button[data-state="maintained"]').getAttribute('aria-pressed'), 'true',
    'the state click took effect (block re-rendered)');
  assert.ok(await form().isVisible(), 'form still open');
  assert.equal(await list(page).locator('.ob-add').isVisible(), false, '«+ Innvending» still hidden while the form is open');
  assert.equal(await form().locator('.ob-input').inputValue(), 'Halvskrevet innvending', 'typed text kept');
  assert.equal(await form().locator('.ob-isnew').isChecked(), true, 'checkbox kept');
  assert.match(await form().locator('.ob-count').textContent(), /^22 \//, 'character count matches the kept text');
  assert.deepEqual(errors, []);
  await close();
});
