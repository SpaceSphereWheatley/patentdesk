'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { ensureSakFiles } = loadFunctions(['ensureSakFiles']);

test('ensureSakFiles: a new søknad case starts with an empty file list', () => {
  const d = ensureSakFiles({}, { type: 'soknad' });
  assert.deepStrictEqual(Array.from(d.files), []);
});

test('ensureSakFiles: a new oppdrag starts with an empty file list', () => {
  const d = ensureSakFiles({}, { type: 'oppdrag' });
  assert.deepStrictEqual(Array.from(d.files), []);
});

test('ensureSakFiles: an existing file list is never changed, standard names included', () => {
  const files = [{ name: 'Claims.pdf' }, { name: 'Figures.pdf' }, { name: 'XXX-krav.pdf' }];
  const d = ensureSakFiles({ files }, { type: 'soknad' });
  assert.strictEqual(d.files, files);
  assert.deepStrictEqual(d.files.map(f => f.name), ['Claims.pdf', 'Figures.pdf', 'XXX-krav.pdf']);
});

test('ensureSakFiles: an existing empty list stays empty', () => {
  const files = [];
  assert.strictEqual(ensureSakFiles({ files }, { type: 'soknad' }).files, files);
});
