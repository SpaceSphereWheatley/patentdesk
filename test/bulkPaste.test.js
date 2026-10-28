'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { parseBulkBlocks } = loadFunctions(['parseBulkBlocks', '_normDate']);

const UTEN_INTERESSENTER = [
  '20261406',
  '',
  'Pat. Upri 7mnd',
  'Mobile device for temporary storage of bulk material and moisture removal from bulk material',
  'Maskin',
  '02.11.2026',
  '25.05.2027',
  'B65D',
].join('\n');

const MED_INTERESSENTER = [
  '20261238',
  '',
  'Pat. Upri 7mnd',
  'A fluid transfer line assembly with buoyancy module',
  'Skip',
  'Mohibb Malik',
  'Eirik Gylder Smestad',
  '29.10.2026',
  '18.04.2027',
  'B63B',
].join('\n');

function plain(rows) { return JSON.parse(JSON.stringify(rows)); }

test('parseBulkBlocks reads a case without stakeholders', () => {
  assert.deepStrictEqual(plain(parseBulkBlocks(UTEN_INTERESSENTER)), [{
    cn: '20261406',
    title: 'Mobile device for temporary storage of bulk material and moisture removal from bulk material',
    date: '2027-05-25',
    tags: 'Maskin',
  }]);
});

test('parseBulkBlocks skips stakeholder names between field and dates', () => {
  assert.deepStrictEqual(plain(parseBulkBlocks(MED_INTERESSENTER)), [{
    cn: '20261238',
    title: 'A fluid transfer line assembly with buoyancy module',
    date: '2027-04-18',
    tags: 'Skip',
  }]);
});

test('parseBulkBlocks splits several cases pasted back to back', () => {
  const rows = parseBulkBlocks(UTEN_INTERESSENTER + '\n' + MED_INTERESSENTER);
  assert.deepStrictEqual(plain(rows.map((r) => r.cn)), ['20261406', '20261238']);
  assert.deepStrictEqual(plain(rows.map((r) => r.date)), ['2027-05-25', '2027-04-18']);
});

test('parseBulkBlocks tolerates Windows line endings and surrounding whitespace', () => {
  const rows = parseBulkBlocks('  ' + MED_INTERESSENTER.replace(/\n/g, '  \r\n') + '\r\n');
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].title, 'A fluid transfer line assembly with buoyancy module');
  assert.strictEqual(rows[0].date, '2027-04-18');
});

test('parseBulkBlocks leaves the date empty unless both deadlines are present', () => {
  const rows = parseBulkBlocks(UTEN_INTERESSENTER.replace('\n25.05.2027', ''));
  assert.strictEqual(rows[0].date, '');
});

test('parseBulkBlocks accepts case numbers with a trailing P', () => {
  const rows = parseBulkBlocks(UTEN_INTERESSENTER.replace('20261406', '20261406P'));
  assert.strictEqual(rows[0].cn, '20261406P');
});

test('parseBulkBlocks ignores text before the first case number', () => {
  assert.deepStrictEqual(parseBulkBlocks('Søknader\n\n').length, 0);
  assert.strictEqual(parseBulkBlocks('Søknader\n' + UTEN_INTERESSENTER).length, 1);
});
