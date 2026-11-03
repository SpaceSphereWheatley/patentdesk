'use strict';
// Browser tests for the slice 2A fix round (F3–F7). Written by QA before the
// builder. NOT part of `npm test`. Run with: node --test test/e2e/*.e2e.js
// If Playwright or Chromium is unavailable, every test is skipped, not failed.
//
// Expected behaviour / hooks (same DOM hooks as rounds2a.e2e.js):
//   F4  «Fest» (#round-drawer button[aria-pressed]) is offered only when
//       window width − sidebar (.drawer / #main-drawer) width >= 1060 px.
//       Sidebar: 260 px expanded, 48 px collapsed (pt_drawer_collapsed = '1').
//   F5  Expanding/collapsing the sidebar (#drawer-toggle-btn) re-checks the
//       rule; if pinning is no longer allowed while pinned, the drawer stays
//       open as an overlay: no «Festet», body has no .rd-pinned, Esc closes it.
//   F6  A round whose claims are all unassessed (or has 0 claims) shows the
//       text «Ingen vurdering lagret» exactly once in the drawer.
//   F7  Esc while a modal (.modal-backdrop.open) is open closes the modal but
//       leaves the unpinned drawer open.
//   F3  If writing pt_sak_<id> fails during «Brev sendt», the status still
//       changes, a toast matches /Runden kunne ikke lagres/, and
//       AppState.undoSnapshot.roundsBefore is not set.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP_URL = pathToFileURL(process.env.E2E_APP_FILE || path.join(__dirname, '..', '..', 'PatentDesk.html')).href;
const HEIGHT = 900;
const CASE_ID = 'e2efix';

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
const HIST_V1 = HIST_NY.concat([H('ny', 'fristarkiv', '2026-06-01'),
  H('fristarkiv', 'viderebehandling', '2026-08-21', { received: '2026-08-20', changes: ['claims'] })]);
const R1 = { n: 1, letter: { date: '2026-06-01', deadline: '2026-08-01' },
  response: { date: '2026-08-20', changes: ['claims'] },
  claims: [claim(1, { novelty: false, inventive: false, noveltyDoc: 'D1' }), claim(2, { novelty: true, inventive: true })],
  docIds: ['D1'] };

function seedData(opts) {
  const kase = {
    id: CASE_ID, caseNumber: '20261300', status: opts.status, dueDate: '2026-12-15',
    title: 'Testsak for rettinger', notes: '', tags: '', createdAt: '2026-03-01T10:00:00.000Z',
    history: opts.history, type: 'sak', duration: null, caseBuffer: null
  };
  const sak = {
    numClaims: 3, filingDate: '', priorityDate: '', checklist: {}, classes: [],
    docs: ['D1', 'D2'].map((id, i) => ({ id, ref: 'EP ' + (1000 + i) + ' A1', pubDate: '', effDate: '',
      title: '', p: false, e: false, background: false, withdrawn: false })),
    claims: opts.claims || [1, 2, 3].map((n) => claim(n)),
    rounds: opts.rounds
  };
  return { cases: JSON.stringify([kase]), sak: JSON.stringify(sak) };
}

async function openCase(width, opts) {
  const ctx = await browser.newContext({ viewport: { width, height: HEIGHT } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const s = seedData(opts);
  await page.addInitScript(([id, cs, sak, collapsed, failSak]) => {
    if (failSak) {
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function(k, v) {
        if (window.__failSak && String(k).indexOf('pt_sak_') === 0) {
          throw new DOMException('full', 'QuotaExceededError');
        }
        return orig.call(this, k, v);
      };
    }
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    localStorage.setItem('pt_onboarding_completed', '1');
    localStorage.setItem('pt_schema_version', '7');
    localStorage.setItem('pt_drawer_collapsed', collapsed ? '1' : '0');
    localStorage.setItem('pt_cases', cs);
    localStorage.setItem('pt_sak_' + id, sak);
  }, [CASE_ID, s.cases, s.sak, !!opts.collapsed, !!opts.failSak]);
  await page.goto(APP_URL);
  await page.evaluate((id) => { navigateTo('sak/' + id); }, CASE_ID);
  await page.waitForTimeout(150);
  return { page, errors, close: () => ctx.close() };
}

const roundBtn = (page) => page.locator('#sak-page-round .btn-round');
const drawer = (page) => page.locator('#round-drawer');
const pinBtn = (page) => drawer(page).locator('button[aria-pressed]');

async function openDrawer(page) {
  await roundBtn(page).click();
  await page.waitForTimeout(100);
  assert.ok(await drawer(page).isVisible(), 'drawer opens');
}
async function pinOffered(page) {
  return (await pinBtn(page).count()) > 0 && (await pinBtn(page).isVisible());
}
// Waits for the sidebar width transition to settle, then returns the width.
async function sidebarWidth(page) {
  let prev = -1, w = 0;
  for (let i = 0; i < 30; i++) {
    w = await page.evaluate(() => document.getElementById('main-drawer').getBoundingClientRect().width);
    if (w === prev && (w === 48 || w === 260)) break;
    prev = w;
    await page.waitForTimeout(100);
  }
  return w;
}

// ── F4: pin rule uses the space beside the sidebar ─────────────────────────
for (const [w, collapsed, want] of [[1280, false, false], [1320, false, true], [1280, true, true],
  [1110, true, true], [1100, true, false]]) {
  e2e('F4 «Fest» ' + (want ? 'offered' : 'not offered') + ' at ' + w + ' px, sidebar ' + (collapsed ? 'collapsed' : 'expanded'), async () => {
    const { page, close } = await openCase(w, { status: 'viderebehandling', history: HIST_V1, rounds: [R1], collapsed });
    const sw = await sidebarWidth(page);
    assert.equal(sw, collapsed ? 48 : 260, 'fixture sidebar width');
    await openDrawer(page);
    assert.equal(await pinOffered(page), want);
    await close();
  });
}

// ── F5: sidebar toggle re-checks the rule ──────────────────────────────────
e2e('F5 expanding the sidebar while pinned at 1280 px falls back to the overlay', async () => {
  const { page, errors, close } = await openCase(1280, { status: 'viderebehandling', history: HIST_V1, rounds: [R1], collapsed: true });
  await openDrawer(page);
  await pinBtn(page).click();
  await page.waitForTimeout(100);
  assert.equal(await pinBtn(page).getAttribute('aria-pressed'), 'true', 'pinned at 1280 with collapsed sidebar');
  await page.locator('#drawer-toggle-btn').click();
  await page.waitForTimeout(700); // sidebar width transition
  assert.equal(await sidebarWidth(page), 260, 'sidebar expanded');
  assert.ok(await drawer(page).isVisible(), 'drawer stays open as an overlay');
  assert.equal(await pinOffered(page), false, 'no «Fest»/«Festet» when there is no room');
  assert.equal(await page.evaluate(() => document.body.classList.contains('rd-pinned')), false, 'body not in pinned layout');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  assert.equal(await drawer(page).isVisible(), false, 'overlay closes on Esc');
  assert.deepEqual(errors, []);
  await close();
});

e2e('F5 collapsing the sidebar at 1280 px offers «Fest» again', async () => {
  const { page, close } = await openCase(1280, { status: 'viderebehandling', history: HIST_V1, rounds: [R1] });
  await openDrawer(page);
  assert.equal(await pinOffered(page), false, 'not offered with sidebar expanded');
  await page.locator('#drawer-toggle-btn').click();
  await page.waitForTimeout(700);
  assert.equal(await sidebarWidth(page), 48);
  assert.ok(await drawer(page).isVisible(), 'drawer still open');
  assert.equal(await pinOffered(page), true, 'offered once the sidebar is collapsed');
  await close();
});

// ── F6: «Ingen vurdering lagret» ───────────────────────────────────────────
e2e('F6 backfilled round with all claims unassessed shows «Ingen vurdering lagret»', async () => {
  const { page, close } = await openCase(1320, { status: 'viderebehandling', history: HIST_V1, rounds: [] });
  await page.locator('#sak-page-round .rd-link').click();
  await page.waitForTimeout(150);
  await openDrawer(page);
  const txt = await drawer(page).textContent();
  assert.equal((txt.match(/Ingen vurdering lagret/g) || []).length, 1, 'shown exactly once: ' + txt);
  await close();
});

e2e('F6 round with 0 claims shows «Ingen vurdering lagret»', async () => {
  const r = Object.assign({}, R1, { claims: [] });
  const { page, close } = await openCase(1320, { status: 'viderebehandling', history: HIST_V1, rounds: [r] });
  await openDrawer(page);
  assert.match(await drawer(page).textContent(), /Ingen vurdering lagret/);
  await close();
});

e2e('F6 an assessed round does not show «Ingen vurdering lagret»', async () => {
  const { page, close } = await openCase(1320, { status: 'viderebehandling', history: HIST_V1, rounds: [R1] });
  await openDrawer(page);
  assert.doesNotMatch(await drawer(page).textContent(), /Ingen vurdering lagret/);
  assert.equal(await drawer(page).locator('.rd-line').count(), 2);
  await close();
});

// ── F7: Esc with a modal open ──────────────────────────────────────────────
e2e('F7 Esc with a modal open closes the modal, not the drawer', async () => {
  const { page, close } = await openCase(1320, { status: 'viderebehandling', history: HIST_V1, rounds: [R1] });
  await openDrawer(page);
  await page.evaluate(() => { openBackdrop('about-backdrop'); });
  await page.waitForTimeout(100);
  assert.ok(await page.locator('#about-backdrop.open').count() === 1, 'modal open');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#about-backdrop.open').count(), 0, 'modal closed by Esc');
  assert.ok(await drawer(page).isVisible(), 'drawer still open');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  assert.equal(await drawer(page).isVisible(), false, 'next Esc closes the drawer');
  await close();
});

// ── F3: failed round save during «Brev sendt» ──────────────────────────────
e2e('F3 «Brev sendt» with a failing pt_sak_ write: status changes, toast, no roundsBefore', async () => {
  const { page, close } = await openCase(1320, { status: 'ny', history: HIST_NY, rounds: [], failSak: true });
  await page.evaluate(() => { window.__failSak = true; });
  await page.locator('#btn-sak-forward').click();
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(150);
    let clicked = false;
    for (const sel of ['#btn-complete-confirm', '#btn-tag-confirm', '#btn-frist-confirm']) {
      const b = page.locator(sel);
      if (await b.isVisible().catch(() => false)) { await b.click(); clicked = true; break; }
    }
    if (!clicked) break;
  }
  await page.waitForTimeout(150);
  const r = await page.evaluate((id) => ({
    status: cases.find((c) => c.id === id).status,
    hasRoundsBefore: !!(AppState.undoSnapshot && 'roundsBefore' in AppState.undoSnapshot),
    toasts: Array.from(document.querySelectorAll('.save-toast')).map((t) => t.textContent),
    live: (document.getElementById('toast-announcer') || {}).textContent || ''
  }), CASE_ID);
  assert.equal(r.status, 'fristarkiv', 'status change still happens');
  assert.equal(r.hasRoundsBefore, false, 'undo snapshot has no roundsBefore');
  assert.ok(r.toasts.some((t) => /Runden kunne ikke lagres/.test(t)), 'round toast shown: ' + JSON.stringify(r.toasts));
  await close();
});
