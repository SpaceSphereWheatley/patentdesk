'use strict';
// Browser tests for "Claims table polish — notes ellipsis + header alignment"
// (base v4.52.0). CSS-only change, so it can only be checked in a real browser.
//
// NOT part of `npm test`. Run with:  node --test test/e2e/*.e2e.js
// If Playwright or Chromium is unavailable, every test is skipped, not failed.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./claimsNotesHarness');
const { LONG_NOTE, SHORT_NOTE, CASE_ID } = h;

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

const open = (w, opts) => h.openCase(browser, w, opts);
const NOTE = (n) => '#sak-claims-tbody .sak-claim-note[data-claim="' + n + '"]';

// Baseline recorded from the unmodified v4.52.0 build (this fixture, height
// 900, sidebar open). Column left x is relative to the table; all values are
// rounded to 1/100 px. AC7 requires these to stay exactly the same.
// Tilsiktet endring senere: «Avh. av» ble 8px bredere (plass til ↺ og luft
// mot Nyhet). Kolonnene etter flyttes 8px, og Notater blir 8px smalere.
const DEP_GROW = 8;
const BASE_ROWS = [47.5, 47, 47, 47, 47.5, 47.5, 47, 47, 47, 47, 47, 46.5];
const BASE_COLS = (notesW) => [
  { left: 0, width: 40 }, { left: 40, width: 68 }, { left: 108, width: 56 + DEP_GROW }, { left: 164 + DEP_GROW, width: 108 },
  { left: 272 + DEP_GROW, width: 108 }, { left: 380 + DEP_GROW, width: 72 }, { left: 452 + DEP_GROW, width: notesW - DEP_GROW }
];
const BASELINE = {
  1440: { tableHeight: 630.77, ths: BASE_COLS(388.45), rows: BASE_ROWS },
  1280: { tableHeight: 630.77, ths: BASE_COLS(402), rows: BASE_ROWS },
  1024: { tableHeight: 630.77, ths: BASE_COLS(146), rows: BASE_ROWS },
  960:  { tableHeight: 630.77, ths: BASE_COLS(82), rows: BASE_ROWS }
};

function assertEllipsis(n, label) {
  assert.ok(n, label + ': note input not found');
  assert.equal(n.textOverflow, 'ellipsis', label + ': unfocused text-overflow is ' + n.textOverflow);
  assert.ok(n.scrollW > n.clientW, label + ': expected overflow (scrollWidth ' + n.scrollW + ' <= clientWidth ' + n.clientW + ')');
}

function assertHeaderAligned(hd, n, label) {
  assert.ok(['left', 'start'].indexOf(hd.notesAlign) !== -1, label + ': th.sak-th-notes text-align is ' + hd.notesAlign);
  assert.ok(hd.notesTextLeft !== null, label + ': "Notater" text not measurable');
  assert.ok(Math.abs(hd.notesTextLeft - n.textLeft) <= 1,
    label + ': header text left ' + hd.notesTextLeft.toFixed(2) + ' vs note text left ' + n.textLeft.toFixed(2) + ' (±1 px)');
}

// ── AC1: long note gets an ellipsis at 960, value untouched ──────────────
e2e('AC1 @960: unfocused long note shows ellipsis; value is the full note', async () => {
  const { page, close } = await open(960);
  try {
    const n = await h.noteInfo(page, 12);
    assertEllipsis(n, '960 claim 12');
    assert.equal(n.focused, false, 'precondition: note not focused');
    assert.equal(n.value, LONG_NOTE, 'value must be unchanged (ellipsis is display only)');
    const sak = JSON.parse(await page.evaluate((id) => localStorage.getItem('pt_sak_' + id), CASE_ID));
    assert.equal(sak.claims[11].notes, LONG_NOTE, 'stored note must be unchanged');
  } finally { await close(); }
});

// ── AC2: short notes are not truncated ───────────────────────────────────
for (const w of [960, 1440]) {
  e2e('AC2 @' + w + ': short note "OK" does not overflow', async () => {
    const { page, close } = await open(w);
    try {
      const n = await h.noteInfo(page, 3);
      assert.equal(n.value, SHORT_NOTE);
      assert.ok(n.scrollW <= n.clientW, w + ': "OK" overflows (' + n.scrollW + ' > ' + n.clientW + ')');
    } finally { await close(); }
  });
}

e2e('AC2 @1440: a note that fits the Notater column is not truncated', async () => {
  // LONG_NOTE (~590 px) is wider than Notater at 1440 (~388 px), so use a
  // medium note that fits there.
  const { page, close } = await open(1440, { notes: { 4: 'Se D1 avsnitt 12 og fig. 3' } });
  try {
    const n = await h.noteInfo(page, 4);
    assert.ok(n.scrollW <= n.clientW, '1440: fitting note overflows (' + n.scrollW + ' > ' + n.clientW + ')');
  } finally { await close(); }
});

// ── AC3: focused input scrolls normally, no ellipsis while editing ───────
e2e('AC3 @960: focus, End, type "X" -> scrolls to the end, no ellipsis while focused, Home -> scrollLeft 0', async () => {
  const { page, close } = await open(960);
  try {
    await page.click(NOTE(12));
    let n = await h.noteInfo(page, 12);
    assert.equal(n.focused, true, 'click should focus the note input');
    assert.notEqual(n.textOverflow, 'ellipsis', 'focused input must not show an ellipsis (text-overflow is ' + n.textOverflow + ')');
    await page.keyboard.press('End');
    n = await h.noteInfo(page, 12);
    assert.ok(n.scrollLeft > 0, 'after End the input should scroll (scrollLeft ' + n.scrollLeft + ')');
    await page.keyboard.type('X');
    n = await h.noteInfo(page, 12);
    assert.equal(n.value, LONG_NOTE + 'X');
    assert.equal(n.focused, true, 'focus kept while typing');
    assert.notEqual(n.textOverflow, 'ellipsis', 'still focused: no ellipsis');
    assert.ok(n.scrollLeft + n.clientW >= n.scrollW - 1,
      'end of text ("X") should be visible: scrollLeft ' + n.scrollLeft + ' + clientWidth ' + n.clientW + ' < scrollWidth ' + n.scrollW);
    await page.keyboard.press('Home');
    n = await h.noteInfo(page, 12);
    assert.equal(n.scrollLeft, 0, 'Home should scroll back to the start');
  } finally { await close(); }
});

// ── AC4: blur after editing at the end resets to the start + ellipsis ────
e2e('AC4 @960: Tab out after editing at the end -> scrollLeft 0, ellipsis, value saved', async () => {
  const { page, close } = await open(960);
  try {
    await page.click(NOTE(12));
    await page.keyboard.press('End');
    await page.keyboard.type('X');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500); // > SAK_TYPING_DEBOUNCE_MS
    const n = await h.noteInfo(page, 12);
    assert.equal(n.focused, false, 'Tab should move focus out of the note');
    assert.equal(n.value, LONG_NOTE + 'X');
    assert.equal(n.scrollLeft, 0, 'after blur the note should show its start (scrollLeft ' + n.scrollLeft + ')');
    assertEllipsis(n, '960 after blur');
    const sak = JSON.parse(await page.evaluate((id) => localStorage.getItem('pt_sak_' + id), CASE_ID));
    assert.equal(sak.claims[11].notes, LONG_NOTE + 'X', 'note saved to pt_sak_{id}');
  } finally { await close(); }
});

// ── AC5: placeholder shows in full ───────────────────────────────────────
e2e('AC5 @960: empty note placeholder "Notat…" fits in full, also when focused', async () => {
  const { page, close } = await open(960);
  try {
    let n = await h.noteInfo(page, 4);
    assert.equal(n.value, '');
    assert.equal(n.placeholder, 'Notat…');
    assert.ok(n.placeholderShown, 'placeholder should be shown');
    assert.ok(n.placeholderW <= n.contentW + 0.5,
      'placeholder ' + n.placeholderW.toFixed(1) + 'px wider than content box ' + n.contentW.toFixed(1) + 'px (would read "Nota…")');
    await page.click(NOTE(4));
    n = await h.noteInfo(page, 4);
    assert.equal(n.focused, true);
    assert.ok(n.placeholderShown, 'placeholder should stay until typing');
    assert.ok(n.placeholderW <= n.contentW + 0.5, 'focused: placeholder does not fit');
    await page.keyboard.type('a');
    n = await h.noteInfo(page, 4);
    assert.equal(n.placeholderShown, false, 'placeholder hidden after typing');
  } finally { await close(); }
});

// ── AC6: Notater header aligned with the note text ───────────────────────
for (const w of [1440, 960]) {
  e2e('AC6 @' + w + ': Notater header is left-aligned and its text lines up with the note text (±1 px)', async () => {
    const { page, close } = await open(w);
    try {
      const hd = await h.headerInfo(page);
      for (const n of [3, 12]) assertHeaderAligned(hd, await h.noteInfo(page, n), w + ' claim ' + n);
    } finally { await close(); }
  });
}

for (const w of [1440, 960]) {
  e2e('AC6 @' + w + ': the other six headers stay centred', async () => {
    const { page, close } = await open(w);
    try {
      const hd = await h.headerInfo(page);
      const others = hd.aligns.filter((a) => a.cls.indexOf('sak-th-notes') === -1);
      assert.equal(others.length, 6);
      others.forEach((a) => assert.equal(a.align, 'center', 'header "' + a.text + '" (' + a.cls + ') is ' + a.align));
    } finally { await close(); }
  });
}

// ── AC7: nothing else moves ──────────────────────────────────────────────
for (const w of [1440, 1280, 1024, 960]) {
  e2e('AC7 @' + w + ': column x, widths, row heights and table height equal the v4.52.0 baseline', async () => {
    const { page, close } = await open(w);
    try {
      const g = await h.geometry(page);
      assert.deepEqual(g.ths, BASELINE[w].ths, w + ': column left x / width changed');
      assert.equal(g.tableHeight, BASELINE[w].tableHeight, w + ': table height changed');
      assert.deepEqual(g.rows, BASELINE[w].rows, w + ': row heights changed');
    } finally { await close(); }
  });
}

for (const w of [1440, 960]) {
  e2e('AC7 @' + w + ': focusing and blurring a note moves no column and changes no row height', async () => {
    const { page, close } = await open(w);
    try {
      const base = await h.geometry(page);
      await page.click(NOTE(12));
      assert.deepEqual(await h.geometry(page), base, 'geometry changed on focus');
      await page.keyboard.press('End');
      assert.deepEqual(await h.geometry(page), base, 'geometry changed on End');
      await page.keyboard.press('Tab');
      assert.deepEqual(await h.geometry(page), base, 'geometry changed on blur');
    } finally { await close(); }
  });
}

// ── AC8: same look in every status; editability unchanged ───────────────
e2e('AC8 @960: ellipsis, header alignment and note editability identical in all four statuses', async () => {
  const look = {};
  for (const status of ['ny', 'fristarkiv', 'viderebehandling', 'avsluttet']) {
    const { page, close } = await open(960, { status: status });
    try {
      const n = await h.noteInfo(page, 12);
      const hd = await h.headerInfo(page);
      look[status] = {
        textOverflow: n.textOverflow, overflows: n.scrollW > n.clientW,
        headerAlign: hd.notesAlign, headerOffset: Math.round(hd.notesTextLeft - n.textLeft),
        disabled: n.disabled, readOnly: n.readOnly
      };
    } finally { await close(); }
  }
  // In v4.52.0 the note is editable in every status; that must not change.
  assert.equal(look.ny.disabled, false);
  assert.equal(look.ny.readOnly, false);
  assert.equal(look.ny.textOverflow, 'ellipsis', 'precondition: Ny shows the ellipsis');
  assert.deepEqual(look.fristarkiv, look.ny);
  assert.deepEqual(look.viderebehandling, look.ny);
  assert.deepEqual(look.avsluttet, look.ny);
});

// ── AC9: empty data and 200 claims ───────────────────────────────────────
e2e('AC9 @960: 0 claims -> Notater header left-aligned, no horizontal overflow', async () => {
  const { page, close } = await open(960, { numClaims: 0 });
  try {
    const hd = await h.headerInfo(page);
    assert.ok(['left', 'start'].indexOf(hd.notesAlign) !== -1, 'th.sak-th-notes text-align is ' + hd.notesAlign);
    const wrap = await page.evaluate(() => {
      const w = document.querySelector('.krav-layout .table-wrap');
      return { s: w.scrollWidth, c: w.clientWidth };
    });
    assert.ok(wrap.s <= wrap.c, '.table-wrap overflows (' + wrap.s + ' > ' + wrap.c + ')');
  } finally { await close(); }
});

e2e('AC9 @960: 200 claims -> last row has ellipsis and its note text lines up with the header', async () => {
  const { page, close } = await open(960, { numClaims: 200, notes: { 200: LONG_NOTE } });
  try {
    const n = await h.noteInfo(page, 200);
    assertEllipsis(n, '960 claim 200');
    assert.equal(n.value, LONG_NOTE);
    assertHeaderAligned(await h.headerInfo(page), n, '960 claim 200');
  } finally { await close(); }
});
