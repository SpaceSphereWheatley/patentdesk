'use strict';
// Popupen i tidslinjen: står ved sporet (over, ellers under), så den ikke
// dekker bjelkene, og kommer etter en kort forsinkelse.
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { timelinePopupPosition, timelinePopupDelay } = loadFunctions(
  ['timelinePopupPosition', 'timelinePopupDelay'],
  { vars: ['TL_POPUP_DELAY_MS', 'TL_POPUP_WARM_MS', 'TL_POPUP_GAP_PX'] }
);
const plain = (v) => JSON.parse(JSON.stringify(v));

// Sporet går fra 300 til 420 px; popupen er 200 × 40 px; vinduet 1000 × 800 px
const pos = (anchorX, top, bottom, h, vh) =>
  timelinePopupPosition(anchorX, top, bottom, 200, h == null ? 40 : h, 1000, vh == null ? 800 : vh);

// ── timelinePopupPosition: loddrett ─────────────────────────────────────────

test('timelinePopupPosition puts the popup above the track, centred on the anchor', () => {
  assert.deepStrictEqual(plain(pos(500, 300, 420)), { left: 400, top: 252, arrowX: 100, below: false });
});

test('timelinePopupPosition never reaches down over the track when there is room above', () => {
  const p = pos(500, 300, 420);
  assert.ok(p.top + 40 <= 300 - 8);
});

test('timelinePopupPosition uses the space above when it just fits', () => {
  // 8 + 40 + 8 = 56: sporet starter akkurat lavt nok
  const p = pos(500, 56, 200);
  assert.strictEqual(p.below, false);
  assert.strictEqual(p.top, 8);
});

test('timelinePopupPosition goes below the track when there is no room above', () => {
  const p = pos(500, 40, 200);
  assert.strictEqual(p.below, true);
  assert.strictEqual(p.top, 208);           // sporets bunn + 8
  assert.ok(p.top >= 200 + 8);
});

test('timelinePopupPosition goes below for a tall popup near the top (notes on a list page)', () => {
  const p = pos(500, 120, 260, 140);
  assert.strictEqual(p.below, true);
  assert.strictEqual(p.top, 268);
});

test('timelinePopupPosition picks the roomier side, kept in the window, when neither fits', () => {
  // Over: 300 − 8 = 292 px plass; under: 800 − 520 − 8 = 272 px; popupen er 400 høy
  const up = pos(500, 300, 520, 400);
  assert.strictEqual(up.below, false);
  assert.strictEqual(up.top, 8);
  // Sporet høyt oppe: mer plass under
  const down = pos(500, 100, 300, 600);
  assert.strictEqual(down.below, true);
  assert.strictEqual(down.top, 192);        // 800 − 600 − 8: holdt innenfor vinduet
});

// ── timelinePopupPosition: vannrett og pil ──────────────────────────────────

test('timelinePopupPosition stays inside the window and keeps the arrow on the anchor', () => {
  const right = pos(980, 300, 420);
  assert.strictEqual(right.left, 792);       // 1000 − 200 − 8
  assert.strictEqual(right.arrowX, 188);     // 980 − 792
  const left = pos(20, 300, 420);
  assert.strictEqual(left.left, 8);
  assert.strictEqual(left.arrowX, 12);
});

test('timelinePopupPosition keeps the arrow off the rounded corners', () => {
  assert.strictEqual(pos(1000, 300, 420).arrowX, 190);
  assert.strictEqual(pos(0, 300, 420).arrowX, 10);
});

test('timelinePopupPosition places the popup the same way below the track', () => {
  const p = pos(980, 40, 200);
  assert.strictEqual(p.left, 792);
  assert.strictEqual(p.arrowX, 188);
});

// ── timelinePopupDelay ──────────────────────────────────────────────────────

test('timelinePopupDelay waits half a second before the first popup', () => {
  assert.strictEqual(timelinePopupDelay(false, Infinity), 500);
});

test('timelinePopupDelay switches at once while a popup is showing', () => {
  assert.strictEqual(timelinePopupDelay(true, 0), 0);
  assert.strictEqual(timelinePopupDelay(true, Infinity), 0);
});

test('timelinePopupDelay switches at once right after one closed, then waits again', () => {
  assert.strictEqual(timelinePopupDelay(false, 100), 0);
  assert.strictEqual(timelinePopupDelay(false, 299), 0);
  assert.strictEqual(timelinePopupDelay(false, 300), 500);
  assert.strictEqual(timelinePopupDelay(false, 1000), 500);
});
