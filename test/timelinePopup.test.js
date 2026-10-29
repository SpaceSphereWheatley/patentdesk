'use strict';
// Popupen i tidslinjen: står over sporet, så den aldri dekker bjelkene, og
// kommer etter en kort forsinkelse.
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { timelinePopupPosition, timelinePopupDelay } = loadFunctions(
  ['timelinePopupPosition', 'timelinePopupDelay'],
  { vars: ['TL_POPUP_DELAY_MS', 'TL_POPUP_WARM_MS', 'TL_POPUP_GAP_PX'] }
);
const plain = (v) => JSON.parse(JSON.stringify(v));

// ── timelinePopupPosition ───────────────────────────────────────────────────

test('timelinePopupPosition puts the popup above the track, centred on the anchor', () => {
  // Sporet starter 300 px ned; popupen er 200 × 40 px; vinduet 1000 px bredt
  const p = timelinePopupPosition(500, 300, 200, 40, 1000);
  assert.deepStrictEqual(plain(p), { left: 400, top: 252, arrowX: 100 });
});

test('timelinePopupPosition never reaches down over the track', () => {
  const p = timelinePopupPosition(500, 300, 200, 40, 1000);
  assert.ok(p.top + 40 <= 300);
});

test('timelinePopupPosition stays inside the window and keeps the arrow on the anchor', () => {
  const right = timelinePopupPosition(980, 300, 200, 40, 1000);
  assert.strictEqual(right.left, 792);       // 1000 − 200 − 8
  assert.strictEqual(right.arrowX, 188);     // 980 − 792
  const left = timelinePopupPosition(20, 300, 200, 40, 1000);
  assert.strictEqual(left.left, 8);
  assert.strictEqual(left.arrowX, 12);
});

test('timelinePopupPosition keeps the arrow off the rounded corners', () => {
  assert.strictEqual(timelinePopupPosition(1000, 300, 200, 40, 1000).arrowX, 190);
  assert.strictEqual(timelinePopupPosition(0, 300, 200, 40, 1000).arrowX, 10);
});

test('timelinePopupPosition does not go above the top of the window', () => {
  assert.strictEqual(timelinePopupPosition(500, 20, 200, 40, 1000).top, 8);
});

// ── timelinePopupDelay ──────────────────────────────────────────────────────

test('timelinePopupDelay waits half a second before the first popup', () => {
  assert.strictEqual(timelinePopupDelay(false, Infinity), 500);
});

test('timelinePopupDelay switches at once while a popup is showing', () => {
  assert.strictEqual(timelinePopupDelay(true, 0), 0);
});

test('timelinePopupDelay switches at once right after one closed, then waits again', () => {
  assert.strictEqual(timelinePopupDelay(false, 100), 0);
  assert.strictEqual(timelinePopupDelay(false, 1000), 500);
});
