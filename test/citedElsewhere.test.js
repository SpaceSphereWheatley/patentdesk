'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const plain = (x) => JSON.parse(JSON.stringify(x));

const { docMatchKey, buildCitationIndex, citedElsewhere } = loadFunctions([
  'normalizePubNumber', 'opsPubNumber', 'docMatchKey', 'buildCitationIndex', 'citedElsewhere',
  'buildSearchReport', 'claimDocCategory', 'docCategoryLabel', 'effectiveClaimValue', 'getClaimCascadeValue',
]);

// Kravsvurdering der D1 tar nyheten for krav 1 (X) og D2 er bakgrunn (A).
function assessed(docs) {
  return {
    docs: docs,
    claims: [{ num: 1, novelty: false, inventive: false, independent: true, dep: null, noveltyDoc: 'D1', inventiveDocs: [] }],
  };
}

const CASES = [
  { id: 'self', caseNumber: '20260001', title: 'Denne', status: 'ny' },
  { id: 'old',  caseNumber: '20231187', title: 'Rørkobling', status: 'avsluttet' },
  { id: 'fa',   caseNumber: '20240412', title: 'Subsea', status: 'fristarkiv' },
  { id: 'vb',   caseNumber: '20250099', title: 'Ventil', status: 'viderebehandling' },
  { id: 'opp',  caseNumber: 'OPP-1', title: 'Oppdrag', status: 'ny', type: 'oppdrag' },
];
const DETAILS = {
  self: assessed([{ id: 'D1', ref: 'WO 2020/123456 A1' }]),
  old:  assessed([{ id: 'D1', ref: 'US 1 B1' }, { id: 'D2', ref: 'WO2020123456A3' }]),
  fa:   assessed([{ id: 'D1', ref: 'wo 2020/123456' }]),
  vb:   assessed([{ id: 'D1', ref: 'WO 2020/123456 A1', withdrawn: true }]),
};
const detailsFn = (id) => DETAILS[id] || null;

// ── Nøkkelen ─────────────────────────────────────────────────

test('docMatchKey ignores format and kind code, and rejects what is not a number', () => {
  assert.strictEqual(docMatchKey('WO 2020/123456 A1'), docMatchKey('WO2020123456A3'));
  assert.strictEqual(docMatchKey('wo 2020/123456'), docMatchKey('WO 2020/123456 A1'));
  assert.strictEqual(docMatchKey('EP 1 000 000 A1'), docMatchKey('EP1000000B1'));
  assert.notStrictEqual(docMatchKey('EP 1000000'), docMatchKey('EP 1000001'));
  assert.strictEqual(docMatchKey(''), null);
  assert.strictEqual(docMatchKey('se vedlegg'), null);
});

// ── AC1 / AC3 / AC4: hvilke saker ────────────────────────────

test('citedElsewhere lists the other cases citing the document, never the case itself', () => {
  const idx = buildCitationIndex(CASES, detailsFn);
  const hits = plain(citedElsewhere(idx, 'WO 2020/123456 A1', 'self'));
  assert.deepStrictEqual(hits.map((h) => h.caseId), ['old', 'fa', 'vb']); // sortert på saksnummer
});

test('citedElsewhere includes closed cases and marks withdrawn documents', () => {
  const hits = plain(citedElsewhere(buildCitationIndex(CASES, detailsFn), 'WO2020123456', 'self'));
  const byId = Object.fromEntries(hits.map((h) => [h.caseId, h]));
  assert.strictEqual(byId.old.status, 'avsluttet');
  assert.strictEqual(byId.vb.withdrawn, true);
  assert.strictEqual(byId.fa.withdrawn, false);
});

// ── AC2: hva hver linje viser ────────────────────────────────

test('citedElsewhere gives the D-number and the category used in each case', () => {
  const hits = plain(citedElsewhere(buildCitationIndex(CASES, detailsFn), 'WO 2020/123456 A1', 'self'));
  const byId = Object.fromEntries(hits.map((h) => [h.caseId, h]));
  assert.strictEqual(byId.old.docId, 'D2');
  assert.strictEqual(byId.old.caseNumber, '20231187');
  assert.strictEqual(byId.old.title, 'Rørkobling');
  assert.deepStrictEqual(byId.old.cats, ['A']); // D1 tar nyheten der, D2 er A
  assert.deepStrictEqual(byId.fa.cats, ['X']);
});

test('citedElsewhere gives the P/E prefix on the category', () => {
  const details = { a: assessed([{ id: 'D1', ref: 'EP 5 A1', p: true }]) };
  const idx = buildCitationIndex([{ id: 'a', caseNumber: '1', status: 'ny' }], (id) => details[id]);
  assert.deepStrictEqual(plain(citedElsewhere(idx, 'EP 5 B1', 'x'))[0].cats, ['P,X']);
});

test('a case citing the same number twice is listed once', () => {
  const details = { a: assessed([{ id: 'D1', ref: 'EP 5 A1' }, { id: 'D2', ref: 'EP 5 B1' }]) };
  const idx = buildCitationIndex([{ id: 'a', caseNumber: '1', status: 'ny' }], (id) => details[id]);
  const hits = plain(citedElsewhere(idx, 'EP 5', 'x'));
  assert.strictEqual(hits.length, 1);
  assert.strictEqual(hits[0].docId, 'D1');
});

// ── AC5: ingen merking ───────────────────────────────────────

test('citedElsewhere is empty for an empty or invalid number, or a number only this case has', () => {
  const idx = buildCitationIndex(CASES, detailsFn);
  assert.deepStrictEqual(plain(citedElsewhere(idx, '', 'self')), []);
  assert.deepStrictEqual(plain(citedElsewhere(idx, 'se vedlegg', 'self')), []);
  assert.deepStrictEqual(plain(citedElsewhere(idx, 'NO 999999 B1', 'self')), []);
});

test('buildCitationIndex survives cases without details and broken documents', () => {
  const details = { a: { docs: null }, b: { docs: [null, { ref: 42 }, { id: 'D3', ref: 'EP 7 A1' }], claims: 'x' } };
  const idx = buildCitationIndex([{ id: 'a' }, { id: 'b', caseNumber: '2' }, { id: 'c' }, null], (id) => details[id]);
  const hits = plain(citedElsewhere(idx, 'EP 7', 'x'));
  assert.strictEqual(hits.length, 1);
  assert.deepStrictEqual(hits[0].cats, []);
});

// ── AC8: ytelse ──────────────────────────────────────────────

test('buildCitationIndex reads each case detail once, and lookups do not read again', () => {
  let reads = 0;
  const list = [];
  for (let i = 0; i < 500; i++) list.push({ id: 'c' + i, caseNumber: String(i), status: 'ny' });
  const idx = buildCitationIndex(list, (id) => { reads++; return assessed([{ id: 'D1', ref: 'EP ' + id.slice(1) + ' A1' }]); });
  assert.strictEqual(reads, 500);
  for (let i = 0; i < 20; i++) citedElsewhere(idx, 'EP ' + i, 'x');
  assert.strictEqual(reads, 500);
});

// ── Teksten i merket og lista ────────────────────────────────
const { citedBadgeText, citedEntryWhat } = loadFunctions(['citedBadgeText', 'citedEntryWhat']);

test('citedBadgeText says sak or saker', () => {
  assert.strictEqual(citedBadgeText(1), 'også i 1 sak');
  assert.strictEqual(citedBadgeText(3), 'også i 3 saker');
});

test('citedEntryWhat shows the D-number with the categories, withdrawn or not assessed', () => {
  assert.strictEqual(citedEntryWhat({ docId: 'D2', cats: ['X', 'Y'], withdrawn: false }), 'D2 · X, Y');
  assert.strictEqual(citedEntryWhat({ docId: 'D1', cats: ['X'], withdrawn: true }), 'D1 · ikke lenger relevant');
  assert.strictEqual(citedEntryWhat({ docId: 'D3', cats: [], withdrawn: false }), 'D3 · ikke vurdert');
});
