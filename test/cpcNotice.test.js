'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { shouldShowCpcNotice } = loadFunctions(['shouldShowCpcNotice']);

test('the home banner shows while the CPC database is missing and not dismissed', () => {
  assert.strictEqual(shouldShowCpcNotice(false, false), true);
});

test('dismissing it hides it for good (loading stays available in Settings)', () => {
  assert.strictEqual(shouldShowCpcNotice(false, true), false);
});

test('a loaded database never shows the banner', () => {
  assert.strictEqual(shouldShowCpcNotice(true, false), false);
  assert.strictEqual(shouldShowCpcNotice(true, true), false);
});
