'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { normalizePubNumber, espacenetUrl } = loadFunctions(
  ['normalizePubNumber', 'espacenetUrl'],
  { globals: { encodeURIComponent } }
);

test('normalizePubNumber strips spaces, slashes and separators', () => {
  assert.strictEqual(normalizePubNumber('WO 2020/123456 A1'), 'WO2020123456A1');
  assert.strictEqual(normalizePubNumber('US 9,876,543 B2'), 'US9876543B2');
  assert.strictEqual(normalizePubNumber('EP 1 000 000 A1'), 'EP1000000A1');
  assert.strictEqual(normalizePubNumber('NO-345678-B1'), 'NO345678B1');
  assert.strictEqual(normalizePubNumber('jp2019.123456a'), 'JP2019123456A');
});

test('normalizePubNumber returns empty string for blank input', () => {
  assert.strictEqual(normalizePubNumber(''), '');
  assert.strictEqual(normalizePubNumber('   '), '');
  assert.strictEqual(normalizePubNumber(null), '');
  assert.strictEqual(normalizePubNumber(undefined), '');
});

test('espacenetUrl builds a pn= search for the normalized number', () => {
  assert.strictEqual(espacenetUrl('WO 2020/123456 A1'),
    'https://worldwide.espacenet.com/patent/search?q=pn%3DWO2020123456A1');
});

test('espacenetUrl returns null when there is nothing to look up', () => {
  assert.strictEqual(espacenetUrl(''), null);
  assert.strictEqual(espacenetUrl(' / '), null);
});
