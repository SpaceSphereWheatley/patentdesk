'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

// Objekter fra sandkassen har en annen Object-prototype; kopier før deepStrictEqual.
const plain = (v) => JSON.parse(JSON.stringify(v));

// ── «Flere saker»: saker som finnes fra før ───────────────────
const { markBulkDuplicates } = loadFunctions(['markBulkDuplicates']);

const row = (id, cn) => ({ id: id, cn: cn, title: 'T', date: '2027-01-01', checked: true });
const existing = [
  { id: 'c1', caseNumber: '20261388', status: 'ny', type: 'sak' },
  { id: 'c2', caseNumber: '20260977P', status: 'fristarkiv', type: 'sak' },
];

test('markBulkDuplicates unticks rows whose case number already exists', () => {
  const res = plain(markBulkDuplicates([row('a', '20261450'), row('b', '20261388'), row('c', '20260977p')], existing));
  assert.deepStrictEqual(res.rows.map((r) => r.checked), [true, false, false]);
  assert.strictEqual(res.rows[0].dup, null);
  assert.deepStrictEqual(res.rows[1].dup, { id: 'c1', status: 'ny', type: 'sak' });
  assert.strictEqual(res.rows[2].dup.id, 'c2', 'matching ignores case and surrounding spaces');
  assert.strictEqual(res.dupCount, 2);
});

test('markBulkDuplicates keeps a case number pasted twice only once', () => {
  const res = plain(markBulkDuplicates([row('a', '20261450'), row('b', ' 20261450 '), row('c', '20261502')], []));
  assert.deepStrictEqual(res.rows.map((r) => r.id), ['a', 'c']);
  assert.strictEqual(res.droppedInPaste, 1);
  assert.strictEqual(res.dupCount, 0);
});

test('markBulkDuplicates leaves rows without a case number alone', () => {
  const res = plain(markBulkDuplicates([row('a', ''), row('b', '')], existing));
  assert.deepStrictEqual(res.rows.map((r) => [r.id, r.checked, r.dup]), [['a', true, null], ['b', true, null]]);
});

test('markBulkDuplicates does not change the rows it is given', () => {
  const rows = [row('a', '20261388')];
  markBulkDuplicates(rows, existing);
  assert.strictEqual(rows[0].checked, true);
  assert.ok(!('dup' in rows[0]));
});

// ── Færre krav: hva som går tapt ──────────────────────────────
const { claimsRemovalSummary, claimsRemovalLines } = loadFunctions(
  ['claimsRemovalSummary', 'claimsRemovalLines', 'formatClaimRanges']);

function claim(num, over) {
  return Object.assign({ num: num, novelty: null, inventive: null, formal: null, notes: '', label: '',
    noveltyDoc: null, inventiveDocs: [] }, over);
}
const claims = [
  claim(1, { novelty: true }), claim(7), claim(8),
  claim(9, { novelty: false, inventive: false, noveltyDoc: 'D1', inventiveDocs: ['D2'] }),
  claim(10, { inventive: true, notes: 'se D3' }),
  claim(11, { notes: '  husk  ' }),
  claim(12, { formal: true, label: 'fremgangsmåte' }),
];

test('claimsRemovalSummary lists what the removed claims hold', () => {
  const s = plain(claimsRemovalSummary(claims, 8));
  assert.deepStrictEqual(s, { from: 9, to: 12, assessed: [9, 10, 12], notes: [10, 11], labels: [12],
    docClaims: [9], docIds: ['D1', 'D2'], hasData: true });
});

test('claimsRemovalSummary has no data when the removed claims are empty', () => {
  const s = plain(claimsRemovalSummary([claim(1, { novelty: true }), claim(2), claim(3)], 1));
  assert.strictEqual(s.hasData, false);
  assert.strictEqual(s.from, 2);
  assert.strictEqual(s.to, 3);
});

test('claimsRemovalSummary has nothing to remove when the count does not drop', () => {
  assert.strictEqual(claimsRemovalSummary(claims, 12).hasData, false);
  assert.strictEqual(claimsRemovalSummary(claims, 20).hasData, false);
});

test('claimsRemovalLines describes each kind of loss in plain words', () => {
  assert.deepStrictEqual(plain(claimsRemovalLines(claimsRemovalSummary(claims, 8))), [
    'Vurdering på krav 9–10, 12',
    'Motholdsvalg (D1, D2) på krav 9',
    'Notater på krav 10–11',
    'Etikett på krav 12',
  ]);
});

// ── Statistikk: avgjørelser og totaler ────────────────────────
const { decisionsByMonth, allTimeTotals } = loadFunctions(
  ['decisionsByMonth', 'allTimeTotals', 'closedDate'], { vars: ['OUTCOMES'] });

function closed(outcome, when, over) {
  return Object.assign({ status: 'avsluttet', type: 'sak', outcome: outcome,
    history: [{ type: 'status', from: 'fristarkiv', to: 'avsluttet', date: when }] }, over);
}
const decided = [
  closed('meddelt', new Date(2026, 0, 15, 12).toISOString()),
  closed('meddelt', new Date(2026, 0, 20, 12).toISOString()),
  closed('avslatt', new Date(2026, 4, 3, 12).toISOString()),
  closed('henlagt', new Date(2025, 11, 30, 12).toISOString()),
  closed(null, new Date(2026, 4, 3, 12).toISOString()),
  closed('meddelt', new Date(2026, 4, 3, 12).toISOString(), { type: 'oppdrag' }),
  { status: 'fristarkiv', type: 'sak', outcome: null, history: [] },
];

test('decisionsByMonth counts decisions with an outcome per month of the year', () => {
  const d = plain(decisionsByMonth(decided, 2026));
  assert.deepStrictEqual(d.months, [2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepStrictEqual([d.meddelt, d.avslatt, d.henlagt, d.total], [2, 1, 0, 3]);
  assert.strictEqual(decisionsByMonth(decided, 2025).henlagt, 1);
});

test('allTimeTotals counts every year from the log and the cases', () => {
  const log = [{ type: 'ny' }, { type: 'ny' }, { type: 'videre' }, { type: 'avsluttet' }, { type: 'oppdrag' }];
  assert.deepStrictEqual(plain(allTimeTotals(log, decided)), { ny: 2, videre: 1, decided: 4 });
  assert.deepStrictEqual(plain(allTimeTotals([], [])), { ny: 0, videre: 0, decided: 0 });
});
