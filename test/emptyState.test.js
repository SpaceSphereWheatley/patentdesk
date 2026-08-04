'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { emptyStateMessage } = loadFunctions(['emptyStateMessage']);

test('emptyStateMessage: no filter → create-a-case copy, not clearable', () => {
  const msg = emptyStateMessage('');
  assert.strictEqual(msg.text, 'Ingen saker her. Bruk «+ Legg til sak» for å opprette en ny.');
  assert.strictEqual(msg.clearable, false);
});

test('emptyStateMessage: null/undefined filter behaves like no filter', () => {
  assert.strictEqual(emptyStateMessage(null).clearable, false);
  assert.strictEqual(emptyStateMessage(undefined).clearable, false);
});

test('emptyStateMessage: whitespace-only filter behaves like no filter', () => {
  assert.strictEqual(emptyStateMessage('   ').clearable, false);
});

test('emptyStateMessage: active filter → no-matches copy naming the search term, clearable', () => {
  const msg = emptyStateMessage('kobber');
  assert.strictEqual(msg.text, 'Ingen saker matcher «kobber».');
  assert.strictEqual(msg.clearable, true);
});

test('emptyStateMessage: trims the filter before embedding it in the message', () => {
  assert.strictEqual(emptyStateMessage('  kobber  ').text, 'Ingen saker matcher «kobber».');
});
