'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { dataFolderNotice } = loadFunctions(['dataFolderNotice']);

test('no folder chosen: a warning that data lives only in the browser, with a button to pick one', () => {
  const n = dataFolderNotice(true, null, false);
  assert.strictEqual(n.warn, true);
  assert.match(n.sub, /kun i nettleseren/);
  assert.strictEqual(n.btn, 'Velg mappe');
});

test('browser cannot save to a folder: still warned, no button, told to export', () => {
  const n = dataFolderNotice(false, null, false);
  assert.strictEqual(n.warn, true);
  assert.match(n.sub, /kun i nettleseren/);
  assert.match(n.sub2, /eksporter/i);
  assert.strictEqual(n.btn, null);
});

test('folder chosen but access not granted: warned, names the folder, asks for access', () => {
  const n = dataFolderNotice(true, 'PatentDesk-data', false);
  assert.strictEqual(n.warn, true);
  assert.match(n.sub, /PatentDesk-data/);
  assert.strictEqual(n.btn, 'Gi tilgang');
});

test('folder chosen and access granted: no warning (caller shows the folder status)', () => {
  assert.strictEqual(dataFolderNotice(true, 'PatentDesk-data', true), null);
});
