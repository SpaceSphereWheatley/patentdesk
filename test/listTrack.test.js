'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { listTrackMini } = loadFunctions(['listTrackMini']);

test('single-status lists use the compact track, so the title gets the width', () => {
  ['ny', 'viderebehandling', 'fristarkiv', 'oppdrag'].forEach((p) =>
    assert.strictEqual(listTrackMini(p), true, p));
});

test('Alle saker keeps the full track — statuses differ from row to row there', () => {
  assert.strictEqual(listTrackMini('avsluttet'), false);
});
