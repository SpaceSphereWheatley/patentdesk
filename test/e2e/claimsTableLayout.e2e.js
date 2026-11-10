'use strict';
// Browser layout tests for the Kravsvurdering table (spec: "Claims table fits
// at working widths", v4.54.0). Layout can only be measured in a real browser,
// so these use Playwright + Chromium and getBoundingClientRect.
//
// NOT part of `npm test` (file name does not match test/*.test.js). Run with:
//   node --test test/e2e/*.e2e.js   (Node 22 does not accept a bare directory)
// If Playwright or Chromium is unavailable, every test is skipped, not failed.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP_URL = pathToFileURL(path.join(__dirname, '..', '..', 'PatentDesk.html')).href;
const HEIGHT = 900;
const CASE_ID = 'e2eclaims';
const TOL = 0.5; // sub-pixel rounding tolerance

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

// Wraps a test so it skips cleanly when no browser is available.
function e2e(name, fn) {
  test(name, async (t) => {
    if (skipReason) { t.skip(skipReason); return; }
    await fn(t);
  });
}

// ── Fixtures ─────────────────────────────────────────────────────────────
const LONG_NOTE = 'Trekk fra D1 kombinert med D2 gir ikke det samme resultatet som kravet beskriver her egentlig';

function claim(num, over) {
  return Object.assign({
    num: num, novelty: null, inventive: null, formal: false, notes: '',
    independent: false, dep: 1, depManual: false, label: '', noveltyDoc: null, inventiveDocs: []
  }, over || {});
}

// 12 claims. Novelty takes at most one document (D1+D2 is impossible there),
// so the widest chip "D1+D2" sits on claim 1's OH; claim 2 has Nyhet ✗ "D1"
// with OH locked/inherited. Claim 6 is a blank independent claim used for the
// layout-jump test. Claim 12 depends on 11 and has a 15-word note. Formelle
// feil is set on every claim so its header shows "✓ Ferdig".
function fixtureClaims(n) {
  if (n === 12) {
    const out = [];
    for (let i = 1; i <= 12; i++) out.push(claim(i));
    out[0] = claim(1, { dep: null, independent: true, novelty: true, inventive: false, inventiveDocs: ['D1', 'D2'], label: 'Fremgangsmåte' });
    out[1] = claim(2, { novelty: false, inventive: false, noveltyDoc: 'D1' });
    out[5] = claim(6, { dep: null, independent: true, label: 'Anordning' });
    for (let i = 7; i <= 11; i++) out[i - 1] = claim(i, { dep: 6 });
    out[11] = claim(12, { dep: 11, notes: LONG_NOTE });
    return out;
  }
  const out = [];
  for (let i = 1; i <= n; i++) out.push(claim(i, { dep: i === 1 ? null : i - 1, independent: i === 1 }));
  return out;
}

function seed(opts) {
  const n = opts.numClaims;
  const kase = {
    id: CASE_ID, caseNumber: '20261234', status: opts.status || 'ny', dueDate: '2026-12-15',
    title: 'Testsak for kravtabell', notes: '', tags: '', createdAt: '2026-10-01T08:00:00.000Z',
    history: [{ status: 'ny', date: '2026-10-01T08:00:00.000Z' }],
    type: opts.type || 'sak', duration: opts.type === 'oppdrag' ? 3 : null, caseBuffer: null
  };
  const sak = {
    numClaims: n, filingDate: '', priorityDate: '', checklist: [], classes: [],
    docs: [{ id: 'D1', ref: 'WO 2020/123456 A1' }, { id: 'D2', ref: 'EP 1234567 A1' }],
    claims: n ? fixtureClaims(n) : []
  };
  return { cases: JSON.stringify([kase]), sak: JSON.stringify(sak) };
}

// Opens the case page at the given viewport width, sidebar open (default).
async function openCase(width, opts) {
  opts = Object.assign({ numClaims: 12 }, opts || {});
  const ctx = await browser.newContext({ viewport: { width: width, height: HEIGHT } });
  const page = await ctx.newPage();
  const s = seed(opts);
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
  if (opts.type !== 'oppdrag') {
    await page.evaluate(() => {
      const sec = document.querySelector('section[data-sak-section="claims"]');
      if (sec) sec.scrollIntoView({ block: 'start' });
    });
  }
  await page.waitForTimeout(50);
  return { page, close: () => ctx.close() };
}

// One snapshot of the claims-section geometry.
function measure(page) {
  return page.evaluate(() => {
    const r = (el) => { const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width }; };
    const layout = document.querySelector('.krav-layout');
    const wrap = document.querySelector('.krav-layout .table-wrap');
    const table = wrap.querySelector('table');
    const tree = document.getElementById('sak-claims-tree');
    const ths = Array.from(table.querySelectorAll('thead th')).map((th) => Object.assign(r(th), {
      text: th.textContent.trim(), scrollW: th.scrollWidth, clientW: th.clientWidth
    }));
    return {
      layout: r(layout), wrap: Object.assign(r(wrap), { scrollW: wrap.scrollWidth, clientW: wrap.clientWidth }),
      table: Object.assign(r(table), { tableLayout: getComputedStyle(table).tableLayout }),
      tree: r(tree), ths: ths
    };
  });
}

function assertNoHorizontalOverflow(m, label) {
  assert.ok(m.wrap.scrollW <= m.wrap.clientW,
    label + ': .table-wrap overflows horizontally (scrollWidth ' + m.wrap.scrollW + ' > clientWidth ' + m.wrap.clientW + ')');
}

function assertHeaderInside(m, idxs, label) {
  idxs.forEach((i) => {
    const th = m.ths[i];
    assert.ok(th.left >= m.wrap.left - TOL && th.right <= m.wrap.right + TOL,
      label + ': header "' + th.text + '" [' + th.left.toFixed(1) + ', ' + th.right.toFixed(1) +
      '] not inside wrap [' + m.wrap.left.toFixed(1) + ', ' + m.wrap.right.toFixed(1) + ']');
  });
}

const NOTES = 6;

// ── Criterion 1: 1440 ────────────────────────────────────────────────────
e2e('C1 @1440: tree beside table, no horizontal overflow, all 7 headers visible, Notater >= 160px', async () => {
  const { page, close } = await openCase(1440);
  try {
    const m = await measure(page);
    assert.equal(m.ths.length, 7);
    assert.ok(m.tree.left >= m.wrap.right - TOL,
      'tree should be beside the table: tree.left ' + m.tree.left + ' < table.right ' + m.wrap.right);
    assertNoHorizontalOverflow(m, '1440');
    assertHeaderInside(m, [0, 1, 2, 3, 4, 5, 6], '1440');
    assert.ok(m.ths[NOTES].width >= 160, 'Notater is ' + m.ths[NOTES].width + 'px, expected >= 160');
  } finally { await close(); }
});

// ── Criterion 2: 1280 ────────────────────────────────────────────────────
e2e('C2 @1280: no overflow, all 7 headers visible, Notater >= 160px', async () => {
  const { page, close } = await openCase(1280);
  try {
    const m = await measure(page);
    assertNoHorizontalOverflow(m, '1280');
    assertHeaderInside(m, [0, 1, 2, 3, 4, 5, 6], '1280');
    assert.ok(m.ths[NOTES].width >= 160, 'Notater is ' + m.ths[NOTES].width + 'px, expected >= 160');
  } finally { await close(); }
});

e2e('C2 @1280: tree below the table at full section width', async () => {
  const { page, close } = await openCase(1280);
  try {
    const m = await measure(page);
    assert.ok(m.tree.top >= m.wrap.bottom - TOL,
      'tree should be below the table: tree.top ' + m.tree.top + ' < table.bottom ' + m.wrap.bottom);
    assert.ok(Math.abs(m.tree.width - m.layout.width) <= 1,
      'tree below should span the claims section: tree ' + m.tree.width + 'px vs section ' + m.layout.width + 'px');
  } finally { await close(); }
});

// ── Criterion 3: 1024 and 960 ────────────────────────────────────────────
for (const w of [1024, 960]) {
  // Var 80px; senket til 70px for å gi plass til ↺ og luft i Avh. av.
  e2e('C3 @' + w + ': no overflow, Krav..Formelle feil fully visible, Notater >= 70px', async () => {
    const { page, close } = await openCase(w);
    try {
      const m = await measure(page);
      assertNoHorizontalOverflow(m, String(w));
      assertHeaderInside(m, [0, 1, 2, 3, 4, 5], String(w));
      assert.ok(m.ths[NOTES].width >= 70, 'Notater is ' + m.ths[NOTES].width + 'px, expected >= 70');
      assert.ok(m.ths[NOTES].right <= m.wrap.right + TOL, 'Notater extends past the visible wrap');
    } finally { await close(); }
  });
}

// ── Criterion 4: nothing spills ──────────────────────────────────────────
function spillReport(page) {
  return page.evaluate(() => {
    const bad = [];
    const inside = (a, b) => a.left >= b.left - 0.5 && a.right <= b.right + 0.5;
    const tbody = document.getElementById('sak-claims-tbody');
    tbody.querySelectorAll('.sak-tri-btn, .claim-doc-chip').forEach((el) => {
      if (getComputedStyle(el).visibility === 'hidden' || el.getClientRects().length === 0) return;
      const td = el.closest('td');
      if (!inside(el.getBoundingClientRect(), td.getBoundingClientRect())) {
        bad.push('spill: ' + el.className.split(' ')[0] + ' "' + el.textContent.trim() + '" in claim ' + el.closest('tr').dataset.claim);
      }
    });
    // Widest chip must actually be rendered
    const chips = Array.from(tbody.querySelectorAll('.claim-doc-chip')).map((c) => c.textContent.trim());
    if (chips.indexOf('D1+D2') === -1) bad.push('chip "D1+D2" not rendered');
    // Dep input: "12" must fit in the input's content box
    const dep = tbody.querySelector('[data-claim-dep="12"]');
    const cs = getComputedStyle(dep);
    const cv = document.createElement('canvas').getContext('2d');
    cv.font = cs.font;
    const textW = cv.measureText('12').width;
    const contentW = dep.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (textW > contentW + 0.5) bad.push('dep input too narrow for "12": text ' + textW.toFixed(1) + 'px > content ' + contentW.toFixed(1) + 'px');
    if (!inside(dep.getBoundingClientRect(), dep.closest('td').getBoundingClientRect())) bad.push('dep input spills its td');
    // Header cells and progress labels not clipped (wrapping allowed)
    document.querySelectorAll('.sak-claims-table thead th, .sak-claims-table thead th *').forEach((el) => {
      if (el.scrollWidth > el.clientWidth + 0.5 && el.clientWidth > 0) {
        bad.push('header clipped: "' + el.textContent.trim() + '" ' + el.scrollWidth + ' > ' + el.clientWidth);
      }
    });
    const prog = Array.from(document.querySelectorAll('.sak-claims-table .th-col-progress')).map((p) => p.textContent.trim());
    if (prog.length !== 3) bad.push('expected 3 header progress labels, got ' + prog.length);
    if (prog.indexOf('✓ Ferdig') === -1) bad.push('"✓ Ferdig" progress label not rendered');
    return bad;
  });
}

for (const w of [1440, 1280, 1024, 960]) {
  e2e('C4 @' + w + ': tri buttons, chips (incl. D1+D2), dep "12" and header progress labels do not spill', async () => {
    const { page, close } = await openCase(w);
    try {
      const bad = await spillReport(page);
      assert.deepEqual(bad, []);
    } finally { await close(); }
  });
}

// ── Criterion 5: no layout jumps ─────────────────────────────────────────
e2e('C5 @1280: table-layout stays fixed', async () => {
  const { page, close } = await openCase(1280);
  try {
    const m = await measure(page);
    assert.equal(m.table.tableLayout, 'fixed');
  } finally { await close(); }
});

e2e('C5 @1280: toggling Nyhet and choosing D1, then D1+D2 leaves every column left x unchanged', async () => {
  const { page, close } = await openCase(1280);
  try {
    const lefts = () => page.evaluate(() => {
      // Relative to the table, so scrolling (page or .table-wrap) is not a "jump"
      const t0 = document.querySelector('.sak-claims-table').getBoundingClientRect().left;
      const ths = Array.from(document.querySelectorAll('.sak-claims-table thead th')).map((th) => th.getBoundingClientRect().left - t0);
      const tds = Array.from(document.querySelectorAll('#sak-claims-tbody tr[data-claim="6"] td')).map((td) => td.getBoundingClientRect().left - t0);
      return ths.concat(tds);
    });
    const base = await lefts();
    const steps = [];
    const btn = (field) => '#sak-claims-tbody .sak-tri-btn[data-claim="6"][data-field="' + field + '"]';
    // Nyhet: — → ✓ → ✗ → — (all three states)
    for (let i = 0; i < 3; i++) { await page.click(btn('novelty')); steps.push('novelty click ' + (i + 1)); steps.push(await lefts()); }
    // OH to ✗, then choose D1, then D1+D2
    await page.click(btn('inventive')); steps.push('inventive ✓'); steps.push(await lefts());
    await page.click(btn('inventive')); steps.push('inventive ✗'); steps.push(await lefts());
    await page.click('#sak-claims-tbody [data-doc-pop="6"][data-field="inventive"]');
    await page.click('#sak-claims-tbody [data-doc-pick="D1"][data-claim="6"][data-field="inventive"]');
    steps.push('chose D1'); steps.push(await lefts());
    await page.click('#sak-claims-tbody [data-doc-pick="D2"][data-claim="6"][data-field="inventive"]');
    steps.push('chose D1+D2'); steps.push(await lefts());
    const chip = await page.textContent('#sak-claims-tbody [data-doc-pop="6"][data-field="inventive"]');
    assert.equal(chip.trim(), 'D1+D2', 'precondition: chip shows D1+D2');
    for (let i = 0; i < steps.length; i += 2) {
      assert.deepEqual(steps[i + 1], base, 'column positions moved after: ' + steps[i]);
    }
  } finally { await close(); }
});

// ── Criterion 6: placement follows the container, not the viewport ───────
async function setSectionWidth(page, px) {
  await page.evaluate((w) => {
    const sec = document.querySelector('section[data-sak-section="claims"]');
    sec.style.width = w + 'px';
    sec.style.maxWidth = w + 'px';
    sec.style.minWidth = w + 'px';
  }, px);
  await page.waitForTimeout(50);
}

e2e('C6 @1440: tree moves below when the claims section is narrowed to 862px', async () => {
  const { page, close } = await openCase(1440);
  try {
    await setSectionWidth(page, 862);
    const m = await measure(page);
    assert.ok(m.layout.width <= 862 + TOL, 'precondition: .krav-layout is ' + m.layout.width + 'px');
    assert.ok(m.tree.top >= m.wrap.bottom - TOL,
      'tree should be below at 862px section width (viewport 1440): tree.top ' + m.tree.top + ' < table.bottom ' + m.wrap.bottom);
  } finally { await close(); }
});

e2e('C6 @1280: tree moves beside when the claims section is given 1022px', async () => {
  const { page, close } = await openCase(1280);
  try {
    await setSectionWidth(page, 1022);
    const m = await measure(page);
    assert.ok(m.layout.width >= 900, 'precondition: .krav-layout is ' + m.layout.width + 'px');
    assert.ok(m.tree.left >= m.wrap.right - TOL,
      'tree should be beside at 1022px section width (viewport 1280): tree.left ' + m.tree.left + ' < table.right ' + m.wrap.right);
    assertNoHorizontalOverflow(m, '1280/1022');
  } finally { await close(); }
});

// ── Criterion 7: tree click selects the row, beside or below ─────────────
for (const w of [1440, 1280]) {
  e2e('C7 @' + w + ': clicking a claim in the tree highlights its row', async () => {
    const { page, close } = await openCase(w);
    try {
      await page.click('#sak-claims-tree [data-kt-num="12"]');
      const active = await page.evaluate(() =>
        Array.from(document.querySelectorAll('#sak-claims-tbody tr.sak-claim-active-row')).map((tr) => tr.dataset.claim));
      assert.deepEqual(active, ['12']);
    } finally { await close(); }
  });
}

// ── Criterion 8: edges ───────────────────────────────────────────────────
e2e('C8 @960: 0 claims -> empty state replaces the table, no overflow', async () => {
  const { page, close } = await openCase(960, { numClaims: 0 });
  try {
    const m = await measure(page);
    const st = await page.evaluate(() => {
      const e = document.getElementById('sak-claims-empty');
      const t = document.querySelector('.sak-claims-table');
      const b = e.getBoundingClientRect();
      return { emptyShown: e.offsetParent !== null, tableShown: t.offsetParent !== null, right: b.right, vw: window.innerWidth };
    });
    assert.equal(st.emptyShown, true, 'empty state not rendered');
    assert.equal(st.tableShown, false, 'table should be hidden with 0 claims');
    assert.ok(st.right <= st.vw, 'empty state overflows the viewport');
    assertNoHorizontalOverflow(m, '960/empty');
  } finally { await close(); }
});

e2e('C8 @960: 200 claims -> "200" fits in Krav and dep "199" fits in Avh. av', async () => {
  const { page, close } = await openCase(960, { numClaims: 200 });
  try {
    const m = await measure(page);
    assertNoHorizontalOverflow(m, '960/200');
    const bad = await page.evaluate(() => {
      const out = [];
      const tr = document.querySelector('#sak-claims-tbody tr[data-claim="200"]');
      const tdK = tr.querySelector('td.sak-td-krav'), strong = tdK.querySelector('.sak-num-tog');
      const a = strong.getBoundingClientRect(), b = tdK.getBoundingClientRect();
      if (a.left < b.left - 0.5 || a.right > b.right + 0.5 || tdK.scrollWidth > tdK.clientWidth + 0.5) out.push('"200" spills Krav cell');
      const dep = tr.querySelector('[data-claim-dep="200"]');
      if (dep.value !== '199') out.push('precondition: dep value is ' + dep.value);
      const cs = getComputedStyle(dep);
      const cv = document.createElement('canvas').getContext('2d');
      cv.font = cs.font;
      const textW = cv.measureText('199').width;
      const contentW = dep.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      if (textW > contentW + 0.5) out.push('dep input too narrow for "199": text ' + textW.toFixed(1) + 'px > content ' + contentW.toFixed(1) + 'px');
      const d = dep.getBoundingClientRect(), td = dep.closest('td').getBoundingClientRect();
      if (d.left < td.left - 0.5 || d.right > td.right + 0.5) out.push('dep input spills Avh. av cell');
      return out;
    });
    assert.deepEqual(bad, []);
  } finally { await close(); }
});

// ── Nullstill-knappen og avstand til Nyhet ──
e2e('↺ @960, 200 claims: manual dep "199" with reset button stays inside Avh. av; inputs aligned', async () => {
  const { page, close } = await openCase(960, { numClaims: 200 });
  try {
    await page.fill('[data-claim-dep="200"]', '198');
    await page.press('[data-claim-dep="200"]', 'Enter');
    const m = await measure(page);
    assertNoHorizontalOverflow(m, '960/200/manual');
    const bad = await page.evaluate(() => {
      const out = [];
      const tr = document.querySelector('#sak-claims-tbody tr[data-claim="200"]');
      const btn = tr.querySelector('.sak-dep-reset');
      if (!btn) return ['precondition: no reset button on claim 200'];
      const td = btn.closest('td').getBoundingClientRect(), b = btn.getBoundingClientRect();
      if (b.left < td.left - 0.5 || b.right > td.right + 0.5) out.push('reset button spills Avh. av cell');
      const inp = tr.querySelector('.sak-dep-inp').getBoundingClientRect();
      if (b.left < inp.right - 0.5) out.push('reset button overlaps the input');
      const other = document.querySelector('#sak-claims-tbody tr[data-claim="199"] .sak-dep-inp').getBoundingClientRect();
      if (Math.abs(other.left - inp.left) > 0.5) out.push('dep inputs not aligned between manual and automatic rows');
      return out;
    });
    assert.deepEqual(bad, []);
  } finally { await close(); }
});

e2e('Avh. av @1280: at least 24px between the dep field and the Nyhet button', async () => {
  const { page, close } = await openCase(1280);
  try {
    const gap = await page.evaluate(() => {
      const tr = document.querySelector('#sak-claims-tbody tr[data-claim="3"]');
      const a = tr.querySelector('.sak-dep-inp').getBoundingClientRect();
      const b = tr.querySelector('.sak-tri-btn[data-field="novelty"]').getBoundingClientRect();
      return b.left - a.right;
    });
    assert.ok(gap >= 24, 'gap is only ' + gap.toFixed(1) + 'px');
  } finally { await close(); }
});

// ── Criterion 9 (smoke): status does not change the layout; oppdrag unchanged ──
e2e('C9 @1280: column widths and tree placement identical in Ny, Fristarkiv, Viderebehandling, Avsluttet', async () => {
  const shapes = {};
  for (const status of ['ny', 'fristarkiv', 'viderebehandling', 'avsluttet']) {
    const { page, close } = await openCase(1280, { status: status });
    try {
      const m = await measure(page);
      shapes[status] = {
        cols: m.ths.map((t) => Math.round(t.width)),
        treeBelow: m.tree.top >= m.wrap.bottom - TOL,
        overflow: m.wrap.scrollW > m.wrap.clientW
      };
    } finally { await close(); }
  }
  assert.deepEqual(shapes.fristarkiv, shapes.ny);
  assert.deepEqual(shapes.viderebehandling, shapes.ny);
  assert.deepEqual(shapes.avsluttet, shapes.ny);
});

e2e('C9: oppdrag has no visible claims section', async () => {
  const { page, close } = await openCase(1280, { type: 'oppdrag' });
  try {
    const visible = await page.evaluate(() => {
      const sec = document.querySelector('section[data-sak-section="claims"]');
      return !!sec && sec.getClientRects().length > 0 && getComputedStyle(sec).display !== 'none';
    });
    assert.equal(visible, false);
  } finally { await close(); }
});
