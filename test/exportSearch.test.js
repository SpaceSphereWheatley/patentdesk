'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadFunctions } = require('./extractFunctions');

// Objekter fra sandkassen har en annen Object-prototype; kopier før deepStrictEqual.
const plain = (v) => JSON.parse(JSON.stringify(v));

// ── CSV-eksport ───────────────────────────────────────────────
const { caseCsvRows } = loadFunctions(['caseCsvRows', 'isUnassigned', 'canBeUnassigned', 'toDisplay'],
  { vars: ['STATUS_CONFIG', 'OUTCOMES'] });

test('caseCsvRows has a header with the new columns', () => {
  assert.deepStrictEqual(plain(caseCsvRows([], () => null))[0], ['Saksnummer', 'Type', 'Status', 'Utfall',
    'Forfallsdato', 'Tittel', 'Notater', 'Stikkord', 'Innleveringsdato', 'Ikke fordelt']);
});

// Regression: type, outcome, filing date and «ikke fordelt» were left out.
test('caseCsvRows writes type, outcome, filing date and unassigned', () => {
  const list = [
    { id: 'a', caseNumber: '20261001', type: 'sak', status: 'avsluttet', outcome: 'meddelt', dueDate: '2026-05-01', title: 'A', notes: 'n', tags: 't' },
    { id: 'b', caseNumber: '20261002', type: 'sak', status: 'ny', unassigned: true, dueDate: '2026-12-01', title: 'B' },
    { id: 'c', caseNumber: 'OPP-1', type: 'oppdrag', status: 'ny', dueDate: '2026-11-15', title: 'C' },
    { id: 'd', caseNumber: 'OPP-2', type: 'oppdrag', status: 'avsluttet', dueDate: '2026-10-01', title: 'D' },
  ];
  const details = { a: { filingDate: '2025-03-14' } };
  const rows = plain(caseCsvRows(list, (id) => details[id] || null)).slice(1);
  assert.deepStrictEqual(rows, [
    ['20261001', 'Søknad', 'Avsluttet', 'Meddelt', '2026.05.01', 'A', 'n', 't', '2025.03.14', ''],
    ['20261002', 'Søknad', 'Ny', '', '2026.12.01', 'B', '', '', '', 'Ja'],
    ['OPP-1', 'Oppdrag', 'Aktiv', '', '2026.11.15', 'C', '', '', '', ''],
    ['OPP-2', 'Oppdrag', 'Utført', '', '2026.10.01', 'D', '', '', '', ''],
  ]);
});

// ── Ctrl+K: søk også i saksdetaljene ──────────────────────────
const { searchCaseList } = loadFunctions(['searchCaseList', '_detailsMatch', 'normalizePubNumber']);

const cases = [
  { id: 'a', caseNumber: '20261001', title: 'Pumpe', tags: '', notes: '' },
  { id: 'b', caseNumber: '20261002', title: 'Ventil', tags: 'hydraulikk', notes: '' },
  { id: 'c', caseNumber: '20261003', title: 'Fortøyning', tags: '', notes: '' },
];
const details = {
  a: { docs: [{ ref: 'WO 2020/123456 A1' }], classes: [{ code: 'F04B 49/06' }], sakNotes: '' },
  c: { docs: [], classes: [], sakNotes: 'Søker har svart om ankerlinen' },
};
const detailsFn = (id) => details[id] || null;
const ids = (q) => plain(searchCaseList(q, cases, detailsFn)).map((c) => c.id);

test('searchCaseList finds a case by a prior-art publication number, typed any way', () => {
  assert.deepStrictEqual(ids('WO2020123456'), ['a']);
  assert.deepStrictEqual(ids('wo 2020/1234'), ['a']);
});

test('searchCaseList finds a case by CPC class and by case notes', () => {
  assert.deepStrictEqual(ids('f04b49'), ['a']);
  assert.deepStrictEqual(ids('ankerlinen'), ['c']);
});

test('searchCaseList ranks the case fields above the details', () => {
  const list = cases.concat([{ id: 'd', caseNumber: '20261004', title: 'F04B-pumpe', tags: '', notes: '' }]);
  assert.deepStrictEqual(plain(searchCaseList('f04b', list, detailsFn)).map((c) => c.id), ['d', 'a']);
  assert.deepStrictEqual(ids('hydraulikk'), ['b']);
  assert.deepStrictEqual(ids('2026100'), ['a', 'b', 'c']);
});

test('searchCaseList skips the details for short queries', () => {
  let calls = 0;
  searchCaseList('wo', cases, () => { calls++; return null; });
  assert.strictEqual(calls, 0);
  assert.deepStrictEqual(plain(searchCaseList('', cases, detailsFn)), []);
});

// ── Flerfane-vakten ───────────────────────────────────────────
const { isDataStorageKey } = loadFunctions(['isDataStorageKey'],
  { vars: ['STORAGE_KEY', 'STATS_KEY', 'VACATION_KEY', 'SAK_KEY_PREFIX', 'MEDLESING_KEY', 'MEDL_LOG_KEY', 'MEDLESERE_KEY'] });

// Regression: changes to medlesinger in another tab went unnoticed.
test('isDataStorageKey covers the case data and the medlesing data', () => {
  ['pt_cases', 'pt_stats', 'pt_vacations', 'pt_sak_abc', 'pt_medlesing', 'pt_medl_log', 'pt_medlesere']
    .forEach((k) => assert.strictEqual(isDataStorageKey(k), true, k));
  ['pt_backup_last', 'pt_saved_at', 'pt_drawer_collapsed', null, '']
    .forEach((k) => assert.strictEqual(isDataStorageKey(k), false, String(k)));
});

// ── Esc lukker alle dialoger unntatt konfliktdialogen ─────────
const { CLOSABLE_BACKDROPS } = loadFunctions([], { vars: ['CLOSABLE_BACKDROPS'] });
const html = fs.readFileSync(path.join(__dirname, '..', 'PatentDesk.html'), 'utf8');
const allBackdrops = [...html.matchAll(/class="modal-backdrop" id="([^"]+)"/g)].map((m) => m[1]);

test('Esc closes every dialog except the data-folder conflict, which needs an answer', () => {
  const closable = plain(CLOSABLE_BACKDROPS);
  assert.deepStrictEqual(allBackdrops.filter((id) => closable.indexOf(id) === -1), ['workfile-conflict-backdrop']);
  assert.deepStrictEqual(closable.filter((id) => allBackdrops.indexOf(id) === -1), []);
});

// ── Eksport: statuskart ───────────────────────────────────────
test('the export status map lists only statuses that exist', () => {
  const m = html.match(/statusMap: (\{[^}]*\})/);
  assert.ok(m, 'statusMap not found');
  assert.ok(!/'4'/.test(m[1]), 'status 4 (oppdrag) is not a status any more');
});
