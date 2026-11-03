'use strict';
// Browser tests for round snapshots, UI part (spec 2A + approved mockup
// ux/rounds2a-mockup.html). Written by QA before the builder.
//
// NOT part of `npm test`. Run with: node --test test/e2e/*.e2e.js
// If Playwright or Chromium is unavailable, every test is skipped, not failed.
//
// DOM hooks these tests rely on (taken from the mockup; the builder must use them):
//   #sak-page-round                 the existing round line under the title
//   #sak-page-round .btn-round      «Runde N ⇥» button, aria-expanded true/false
//   #sak-page-round .rd-link        backfill link «Lagre nåværende vurdering som runde N»
//   #round-drawer                   the drawer (hidden/absent when closed)
//     .rd-title                     «Runde N»
//     .rd-tab                       picker buttons «Runde 1», «Runde 2» (only with >= 2 rounds)
//     button[aria-pressed]          «Fest»/«Festet» toggle (only when window − sidebar >= 1060 px)
//     button[aria-label="Lukk"]     close
//     .rd-line                      one per frozen claim
//     .rd-frozen                    «Frosset da brevet ble sendt …» (not on backfilled rounds)
//   .mh-row .mh-round-new           «ny i runde N» badge on a citation row

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP_URL = pathToFileURL(process.env.E2E_APP_FILE || path.join(__dirname, '..', '..', 'PatentDesk.html')).href;
const HEIGHT = 900;
const CASE_ID = 'e2erounds';

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
const XSS_LABEL = '<img src=x onerror="window.__xss=1">';

function claim(num, over) {
  return Object.assign({
    num, novelty: null, inventive: null, formal: null, notes: '', independent: num === 1,
    dep: num === 1 ? null : 1, depManual: false, label: '', noveltyDoc: null, inventiveDocs: []
  }, over || {});
}
const H = (from, to, date, extra) => Object.assign({ type: 'status', date: date + 'T10:00:00.000Z', from, to }, extra || {});
const HIST_NY = [{ type: 'status', date: '2026-03-01T10:00:00.000Z', from: null, to: 'ny' }];
const HIST_V1 = HIST_NY.concat([H('ny', 'fristarkiv', '2026-06-01'),
  H('fristarkiv', 'viderebehandling', '2026-08-21', { received: '2026-08-20', changes: ['claims'] })]);
const HIST_V2 = HIST_V1.concat([H('viderebehandling', 'fristarkiv', '2026-09-15'),
  H('fristarkiv', 'viderebehandling', '2026-10-20', { received: '2026-10-19', changes: [] })]);

function round(n, claims, docIds, over) {
  return Object.assign({ n, letter: { date: '2026-0' + (n + 5) + '-01', deadline: '2026-0' + (n + 7) + '-01' },
    response: { date: '2026-0' + (n + 6) + '-20', changes: ['claims'] }, claims, docIds }, over || {});
}
const R1 = round(1, [
  claim(1, { novelty: false, inventive: false, noveltyDoc: 'D1', label: 'Gammel etikett' }),
  claim(2, { novelty: true, inventive: false, inventiveDocs: ['D1', 'D2'] }),
  claim(3, { novelty: true, inventive: true })
], ['D1', 'D2']);
const R2 = round(2, [
  claim(1, { novelty: true, inventive: false, inventiveDocs: ['D3'], label: 'Runde to' }),
  claim(2, { novelty: true, inventive: true })
], ['D1', 'D2', 'D3']);

function seedData(opts) {
  const kase = {
    id: CASE_ID, caseNumber: '20261299', status: opts.status, dueDate: '2026-12-15',
    title: 'Testsak for runder', notes: '', tags: '', createdAt: '2026-03-01T10:00:00.000Z',
    history: opts.history, type: 'sak', duration: null, caseBuffer: null
  };
  const sak = {
    numClaims: 5, filingDate: '', priorityDate: '', checklist: {}, classes: [],
    docs: (opts.docs || ['D1', 'D2', 'D3']).map((id, i) => ({ id, ref: 'EP ' + (1000 + i) + ' A1', pubDate: '', effDate: '',
      title: '', p: false, e: false, background: false, withdrawn: false })),
    claims: [1, 2, 3, 4, 5].map((n) => claim(n, { label: 'Ny etikett ' + n })),
    rounds: opts.rounds
  };
  if (opts.rounds === undefined) delete sak.rounds;
  return { cases: JSON.stringify([kase]), sak: JSON.stringify(sak) };
}

async function openCase(width, opts) {
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
    localStorage.setItem('pt_schema_version', '7');
    localStorage.setItem('pt_cases', cs);
    localStorage.setItem('pt_sak_' + id, sak);
  }, [CASE_ID, s.cases, s.sak]);
  await page.goto(APP_URL);
  await page.evaluate((id) => { navigateTo('sak/' + id); }, CASE_ID);
  await page.waitForTimeout(150);
  return { page, errors, close: () => ctx.close() };
}

const roundBtn = (page) => page.locator('#sak-page-round .btn-round');
const drawer = (page) => page.locator('#round-drawer');
const stored = (page) => page.evaluate((id) => JSON.parse(localStorage.getItem('pt_sak_' + id)), CASE_ID);

async function openDrawer(page) {
  await roundBtn(page).click();
  await page.waitForTimeout(100);
  assert.ok(await drawer(page).isVisible(), 'drawer opens');
}

// ── AC11: the «Runde N ⇥» button ───────────────────────────────────────────
e2e('AC11 no round button in Ny, even with a stale snapshot', async () => {
  for (const rounds of [undefined, [], [R1]]) {
    const { page, close } = await openCase(1280, { status: 'ny', history: HIST_NY, rounds });
    assert.equal(await roundBtn(page).count(), 0, 'rounds=' + JSON.stringify(rounds && rounds.length));
    await close();
  }
});

e2e('AC11 no round button when there are no snapshots', async () => {
  const { page, close } = await openCase(1280, { status: 'fristarkiv', history: HIST_V1.slice(0, 2), rounds: [] });
  assert.equal(await roundBtn(page).count(), 0);
  await close();
});

e2e('AC11 «Runde 1 ⇥» shown in Viderebehandling with one snapshot', async () => {
  const { page, close } = await openCase(1280, { status: 'viderebehandling', history: HIST_V1, rounds: [R1] });
  assert.equal(await roundBtn(page).count(), 1);
  assert.equal((await roundBtn(page).textContent()).trim(), 'Runde 1 ⇥');
  assert.equal(await roundBtn(page).getAttribute('aria-expanded'), 'false');
  await close();
});

// ── AC11: drawer ───────────────────────────────────────────────────────────
e2e('AC11 drawer shows the previous round frozen, one line per snapshot claim', async () => {
  const { page, close } = await openCase(1280, { status: 'viderebehandling', history: HIST_V1, rounds: [R1] });
  await openDrawer(page);
  assert.equal(await roundBtn(page).getAttribute('aria-expanded'), 'true');
  assert.equal((await drawer(page).locator('.rd-title').textContent()).trim(), 'Runde 1');
  const lines = drawer(page).locator('.rd-line');
  assert.equal(await lines.count(), 3, 'snapshot has 3 claims; current has 5');
  const first = await lines.nth(0).textContent();
  assert.match(first, /Gammel etikett/);
  assert.match(first, /N✗/);
  assert.doesNotMatch(await drawer(page).textContent(), /Ny etikett/, 'not the current assessment');
  assert.equal(await drawer(page).locator('.rd-frozen').count(), 1);
  assert.match(await drawer(page).textContent(), /Frosset da brevet ble sendt/);
  assert.equal(await drawer(page).locator('.rd-tab').count(), 0, 'no picker with one round');
  await close();
});

e2e('AC11 drawer closes on Esc, on outside click and on ✕', async () => {
  const { page, close } = await openCase(1280, { status: 'viderebehandling', history: HIST_V1, rounds: [R1] });
  await openDrawer(page);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  assert.equal(await drawer(page).isVisible(), false, 'Esc closes');
  assert.equal(await roundBtn(page).getAttribute('aria-expanded'), 'false');

  await openDrawer(page);
  await page.mouse.click(400, 860); // in the case page, far from the drawer on the right
  await page.waitForTimeout(100);
  assert.equal(await drawer(page).isVisible(), false, 'outside click closes');

  await openDrawer(page);
  await drawer(page).locator('button[aria-label="Lukk"]').click();
  await page.waitForTimeout(100);
  assert.equal(await drawer(page).isVisible(), false, '✕ closes');
  await close();
});

e2e('AC11 drawer closes when leaving the case', async () => {
  const { page, close } = await openCase(1280, { status: 'viderebehandling', history: HIST_V1, rounds: [R1] });
  await openDrawer(page);
  await page.evaluate(() => { navigateTo('home'); });
  await page.waitForTimeout(150);
  assert.equal(await drawer(page).isVisible(), false);
  await close();
});

e2e('AC11 picker with two rounds: opens the latest, switches to round 1', async () => {
  const { page, close } = await openCase(1280, { status: 'viderebehandling', history: HIST_V2, rounds: [R1, R2] });
  assert.equal((await roundBtn(page).textContent()).trim(), 'Runde 2 ⇥');
  await openDrawer(page);
  assert.equal((await drawer(page).locator('.rd-title').textContent()).trim(), 'Runde 2');
  assert.equal(await drawer(page).locator('.rd-line').count(), 2);
  const tabs = drawer(page).locator('.rd-tab');
  assert.equal(await tabs.count(), 2);
  await tabs.filter({ hasText: 'Runde 1' }).click();
  await page.waitForTimeout(100);
  assert.equal((await drawer(page).locator('.rd-title').textContent()).trim(), 'Runde 1');
  assert.equal(await drawer(page).locator('.rd-line').count(), 3);
  assert.match(await drawer(page).textContent(), /Gammel etikett/);
  await close();
});

// ── AC11: pinning ──────────────────────────────────────────────────────────
// Fix round F4: pinning needs window − sidebar >= 1060 px, so 1320 px with the
// sidebar expanded (was 1280 px before the fix round).
e2e('AC11 pinning is offered at 1320 px; pinned drawer stays open and the claims table does not overflow', async () => {
  const { page, close } = await openCase(1320, { status: 'viderebehandling', history: HIST_V1, rounds: [R1] });
  await openDrawer(page);
  const pin = drawer(page).locator('button[aria-pressed]');
  assert.equal(await pin.count(), 1);
  assert.ok(await pin.isVisible(), 'Fest visible at 1320');
  assert.equal(await pin.getAttribute('aria-pressed'), 'false');
  await pin.click();
  await page.waitForTimeout(150);
  assert.equal(await pin.getAttribute('aria-pressed'), 'true');
  assert.match(await pin.textContent(), /Festet/);

  await page.keyboard.press('Escape');
  await page.mouse.click(400, 860);
  await page.waitForTimeout(100);
  assert.ok(await drawer(page).isVisible(), 'pinned: stays open on Esc / outside click');

  await page.evaluate(() => {
    const sec = document.querySelector('section[data-sak-section="claims"]');
    if (sec) sec.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(100);
  const m = await page.evaluate(() => {
    const t = document.querySelector('.sak-claims-table');
    const d = document.getElementById('round-drawer');
    const tb = t.getBoundingClientRect(), db = d.getBoundingClientRect();
    let wrapOverflow = 0;
    for (let el = t.parentElement; el && el !== document.body; el = el.parentElement) {
      wrapOverflow = Math.max(wrapOverflow, el.scrollWidth - el.clientWidth);
      if (el.classList.contains('main') || el.id === 'page-sak') break;
    }
    return { tableRight: tb.right, drawerLeft: db.left, wrapOverflow,
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  assert.ok(m.tableRight <= m.drawerLeft + 0.5, 'table not under the pinned drawer: ' + JSON.stringify(m));
  assert.ok(m.wrapOverflow <= 1, 'no horizontal overflow around the claims table: ' + JSON.stringify(m));
  assert.ok(m.docOverflow <= 0, 'no page-level horizontal scroll: ' + JSON.stringify(m));

  await drawer(page).locator('button[aria-label="Lukk"]').click();
  await page.waitForTimeout(100);
  assert.equal(await drawer(page).isVisible(), false, 'pinned drawer closes on ✕');
  await close();
});

e2e('AC11 pinning is not offered below ~1180 px (overlay only)', async () => {
  const { page, close } = await openCase(1100, { status: 'viderebehandling', history: HIST_V1, rounds: [R1] });
  await openDrawer(page);
  const pin = drawer(page).locator('button[aria-pressed]');
  assert.ok((await pin.count()) === 0 || !(await pin.isVisible()), 'no Fest at 1100 px');
  await close();
});

e2e('AC11 pinned state is not persisted', async () => {
  const { page, close } = await openCase(1320, { status: 'viderebehandling', history: HIST_V1, rounds: [R1] });
  await openDrawer(page);
  await drawer(page).locator('button[aria-pressed]').click();
  await page.waitForTimeout(50);
  await page.reload();
  await page.evaluate((id) => { navigateTo('sak/' + id); }, CASE_ID);
  await page.waitForTimeout(150);
  assert.equal(await drawer(page).isVisible().catch(() => false), false, 'closed after reload');
  await close();
});

// ── AC12: citation badge ───────────────────────────────────────────────────
async function badgeFor(page, id) {
  return page.evaluate((docId) => {
    const row = Array.from(document.querySelectorAll('.mh-row')).find((r) => {
      const i = r.querySelector('.mh-id'); return i && i.textContent.trim() === docId;
    });
    if (!row) return 'NO ROW';
    const b = row.querySelector('.mh-round-new');
    return b ? b.textContent.trim() : null;
  }, id);
}

e2e('AC12 «ny i runde 2» on a citation not in round 1, none on round-1 citations', async () => {
  const { page, close } = await openCase(1280, { status: 'viderebehandling', history: HIST_V1, rounds: [R1] });
  assert.equal(await badgeFor(page, 'D3'), 'ny i runde 2');
  assert.equal(await badgeFor(page, 'D1'), null);
  assert.equal(await badgeFor(page, 'D2'), null);
  await close();
});

e2e('AC12 no badges when rounds = []', async () => {
  const { page, close } = await openCase(1280, { status: 'viderebehandling', history: HIST_V1, rounds: [] });
  assert.equal(await page.locator('.mh-round-new').count(), 0);
  await close();
});

// ── AC13: backfill ─────────────────────────────────────────────────────────
e2e('AC13 backfill link appears with letters sent and no rounds, and creates a backfilled round', async () => {
  const { page, close } = await openCase(1280, { status: 'viderebehandling', history: HIST_V1, rounds: [] });
  const link = page.locator('#sak-page-round .rd-link');
  assert.equal(await link.count(), 1);
  assert.equal((await link.textContent()).trim(), 'Lagre nåværende vurdering som runde 1');
  await link.click();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#sak-page-round .rd-link').count(), 0, 'link disappears');
  assert.equal((await roundBtn(page).textContent()).trim(), 'Runde 1 ⇥');
  const sd = await stored(page);
  assert.equal(sd.rounds.length, 1);
  assert.equal(sd.rounds[0].n, 1);
  assert.equal(sd.rounds[0].backfilled, true);
  assert.equal(sd.rounds[0].claims.length, 5, 'current assessment saved');
  await openDrawer(page);
  const txt = await drawer(page).textContent();
  assert.match(txt, /lagret i ettertid/);
  assert.equal(await drawer(page).locator('.rd-frozen').count(), 0, 'no «Frosset» note on a backfilled round');
  assert.doesNotMatch(txt, /Frosset da brevet/);
  await close();
});

e2e('AC13 no backfill link in Ny or when a round exists', async () => {
  let s = await openCase(1280, { status: 'ny', history: HIST_NY, rounds: [] });
  assert.equal(await s.page.locator('#sak-page-round .rd-link').count(), 0);
  await s.close();
  s = await openCase(1280, { status: 'viderebehandling', history: HIST_V1, rounds: [R1] });
  assert.equal(await s.page.locator('#sak-page-round .rd-link').count(), 0);
  await s.close();
});

// ── AC9/security: snapshot text is text ────────────────────────────────────
e2e('AC9 snapshot labels are rendered as text, not HTML', async () => {
  const xr = round(1, [claim(1, { label: XSS_LABEL })], ['D1']);
  const { page, close } = await openCase(1280, { status: 'viderebehandling', history: HIST_V1, rounds: [xr] });
  await openDrawer(page);
  await page.waitForTimeout(100);
  assert.equal(await drawer(page).locator('img').count(), 0, 'no <img> created');
  assert.ok((await drawer(page).textContent()).includes(XSS_LABEL), 'label shown literally');
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  await close();
});

// ── AC1 end-to-end: «Brev sendt» creates rounds[0] ─────────────────────────
e2e('AC1 «Brev sendt» on a Ny case creates rounds[0] in pt_sak_<id>', async () => {
  const { page, errors, close } = await openCase(1280, { status: 'ny', history: HIST_NY, rounds: [] });
  await page.locator('#btn-sak-forward').click();
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(150);
    const btn = ['#btn-complete-confirm', '#btn-tag-confirm', '#btn-frist-confirm'];
    let clicked = false;
    for (const sel of btn) {
      const b = page.locator(sel);
      if (await b.isVisible().catch(() => false)) { await b.click(); clicked = true; break; }
    }
    if (!clicked) break;
  }
  await page.waitForTimeout(150);
  // pt_cases is stored encoded; read the live state
  const status = await page.evaluate((id) => cases.find((c) => c.id === id).status, CASE_ID);
  assert.equal(status, 'fristarkiv', 'case moved to Fristarkiv');
  const sd = await stored(page);
  assert.ok(Array.isArray(sd.rounds), 'rounds stored');
  assert.equal(sd.rounds.length, 1);
  assert.equal(sd.rounds[0].n, 1);
  assert.equal(sd.rounds[0].claims.length, 5);
  assert.deepEqual(sd.rounds[0].docIds, ['D1', 'D2', 'D3']);
  assert.equal(sd.rounds[0].response, null);
  assert.match(sd.rounds[0].letter.date, /^\d{4}-\d{2}-\d{2}$/);
  const pc = await page.evaluate(() => ({ raw: localStorage.getItem('pt_cases'), live: cases[0].rounds }));
  assert.ok(!/"rounds"/.test(pc.raw) && pc.live === undefined, 'rounds never in pt_cases');
  // «Angre» removes the snapshot again (no ghost round)
  await page.evaluate(() => { dispatch('CASE_UNDO'); });
  await page.waitForTimeout(150);
  assert.deepEqual((await stored(page)).rounds, [], 'undo restores rounds');
  assert.deepEqual(errors, []);
  await close();
});
