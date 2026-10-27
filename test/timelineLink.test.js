'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { timelineEdgeSide, timelineEdgeLabel } = loadFunctions(['timelineEdgeSide', 'timelineEdgeLabel'], { vars: ['TL_EDGE_MIN_VISIBLE_PX'] });

// Synsfeltet går fra 100 til 600 px i alle testene.

test('timelineEdgeSide is null when the bar is at least partly visible', () => {
  assert.strictEqual(timelineEdgeSide(200, 300, 100, 600), null);
  assert.strictEqual(timelineEdgeSide(50, 150, 100, 600), null);   // stikker ut til venstre
  assert.strictEqual(timelineEdgeSide(550, 700, 100, 600), null);  // stikker ut til høyre
});

test('timelineEdgeSide points right for a bar beyond the right edge', () => {
  assert.strictEqual(timelineEdgeSide(700, 800, 100, 600), 'right');
});

test('timelineEdgeSide points left for a bar before the left edge', () => {
  assert.strictEqual(timelineEdgeSide(0, 90, 100, 600), 'left');
});

test('timelineEdgeSide treats a sliver of a few pixels as not visible', () => {
  assert.strictEqual(timelineEdgeSide(597, 700, 100, 600), 'right');
  assert.strictEqual(timelineEdgeSide(0, 103, 100, 600), 'left');
});

test('timelineEdgeLabel puts the arrow on the side the bar is on', () => {
  assert.strictEqual(timelineEdgeLabel('20261007', 'right'), '20261007 →');
  assert.strictEqual(timelineEdgeLabel('20261007', 'left'), '← 20261007');
});
