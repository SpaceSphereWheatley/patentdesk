'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { dayRolloverDue } = loadFunctions(['dayRolloverDue']);

test('dayRolloverDue is false while the rendered day is still today', () => {
  assert.strictEqual(dayRolloverDue('2026-10-29', '2026-10-29', false), false);
  assert.strictEqual(dayRolloverDue('2026-10-29', '2026-10-29', true), false);
});

test('dayRolloverDue is true once the date has changed and the user is not busy', () => {
  assert.strictEqual(dayRolloverDue('2026-10-29', '2026-10-30', false), true);
  // Maskinen sov over flere døgn
  assert.strictEqual(dayRolloverDue('2026-10-24', '2026-10-30', false), true);
});

test('dayRolloverDue waits while the user is busy, so nothing they type is lost', () => {
  assert.strictEqual(dayRolloverDue('2026-10-29', '2026-10-30', true), false);
});

test('dayRolloverDue treats a missing rendered day as nothing to refresh', () => {
  assert.strictEqual(dayRolloverDue('', '2026-10-30', false), false);
  assert.strictEqual(dayRolloverDue(null, '2026-10-30', false), false);
});
