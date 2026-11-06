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
// Oppdrag og en annen Ny-sak som også har dokumentet (AC3)
const CASES3 = CASES.concat([{ id: 'ny2', caseNumber: '20260002', title: 'Annen ny', status: 'ny' }]);
const DETAILS3 = Object.assign({}, DETAILS, {
  opp: assessed([{ id: 'D1', ref: 'WO 2020/123456 A1' }]),
  ny2: assessed([{ id: 'D1', ref: 'WO 2020/123456 A2' }]),
});
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

test('citedElsewhere includes Oppdrag and other Ny cases that cite the document', () => {
  const idx = buildCitationIndex(CASES3, (id) => DETAILS3[id] || null);
  const ids = plain(citedElsewhere(idx, 'WO 2020/123456 A1', 'self')).map((h) => h.caseId);
  assert.ok(ids.includes('opp'), 'oppdrag listed');
  assert.ok(ids.includes('ny2'), 'other Ny case listed');
  assert.strictEqual(ids.length, 5);
});

test('within one case, an active row wins over a withdrawn row with the same number', () => {
  const details = { a: assessed([{ id: 'D1', ref: 'WO 2020/123456 A1', withdrawn: true }, { id: 'D2', ref: 'EP 9 A1' },
                                  { id: 'D3', ref: 'WO 2020/123456 A3' }]) };
  details.a.claims[0].noveltyDoc = 'D3';
  const idx = buildCitationIndex([{ id: 'a', caseNumber: '1', status: 'ny' }], (id) => details[id]);
  const hits = plain(citedElsewhere(idx, 'WO2020123456', 'x'));
  assert.strictEqual(hits.length, 1);
  assert.strictEqual(hits[0].docId, 'D3');
  assert.strictEqual(hits[0].withdrawn, false);
  assert.deepStrictEqual(hits[0].cats, ['X']);
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

// ── Status og escaping i markupen (AC2, AC6; A·AC5) ─────────
const R = loadFunctions(['mhCitedHtml', 'mhPartyHtml', 'citedStatusLabel', 'citedBadgeText', 'citedEntryWhat', 'esc'],
  { vars: ['STATUS_CONFIG', 'PARTY_MAX_LEN'] });

test('citedStatusLabel says when an oppdrag is closed', () => {
  assert.strictEqual(R.citedStatusLabel({ type: 'oppdrag', status: 'avsluttet' }), 'Avsluttet oppdrag');
  assert.strictEqual(R.citedStatusLabel({ type: 'oppdrag', status: 'ny' }), 'Oppdrag');
  assert.strictEqual(R.citedStatusLabel({ type: 'sak', status: 'fristarkiv' }), 'Fristarkiv');
});

const EVIL = '"><img src=x onerror=alert(1)>';
const rawTag = (html) => /<img/i.test(html);

test('mhCitedHtml escapes titles, case numbers and ids from other cases', () => {
  const html = R.mhCitedHtml([{ caseId: EVIL, caseNumber: EVIL, title: EVIL, status: 'ny', type: '',
                                docId: 'D1', withdrawn: false, cats: ['X'] }]);
  assert.ok(!rawTag(html), html);
  // Alle tre forekomstene (id-attributt, saksnummer, tittel) står escapet
  assert.strictEqual(html.split('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;').length - 1, 3);
  assert.ok(!html.includes(EVIL), 'raw value never appears');
  assert.strictEqual(R.mhCitedHtml([]), '');
});

test('mhPartyHtml escapes the name in the value and the title attribute', () => {
  const html = R.mhPartyHtml({ id: 'D1', applicants: EVIL }, 0, 'applicants', 'Søker');
  assert.ok(!rawTag(html), html);
  assert.strictEqual(html.split('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;').length - 1, 2); // value og title
  assert.ok(!html.includes(EVIL), 'raw value never appears');
  assert.match(html, /maxlength="300"/);
});

// ── Korrupt sak: indeksen leser stille (funn 5) ──────────────
test('loadSakDataQuiet reads details without warnings or writes, and returns null for corrupt data', () => {
  const store = { pt_sak_ok: '{"docs":[]}', pt_sak_bad: '{not json' };
  let writes = 0, toasts = 0;
  const Q = loadFunctions(['loadSakDataQuiet', 'sakKey'], { vars: ['SAK_KEY_PREFIX'], globals: {
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: () => { writes++; } },
    showToast: () => { toasts++; },
  } });
  assert.deepStrictEqual(plain(Q.loadSakDataQuiet('ok')), { docs: [] });
  assert.strictEqual(Q.loadSakDataQuiet('bad'), null);
  assert.strictEqual(Q.loadSakDataQuiet('missing'), null);
  assert.strictEqual(writes, 0);
  assert.strictEqual(toasts, 0);
});
