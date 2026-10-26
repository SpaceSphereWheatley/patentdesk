'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const fns = loadFunctions([
  'canSendToMedleser', 'isUnassigned', 'canBeUnassigned', '_medlKey', 'normalizeMedleserList', 'addMedleser', 'normalizeMedlLog',
  'openMedlFor', 'sendToMedleser', 'returnFromMedleser', 'pruneMedlLog', 'medlLogAfterUndo',
  'medlCutoff12m', 'medleserStats', 'suggestMedleser', 'daysBetweenIso',
  'readImportSettings', 'isValidChecklistTemplate', 'normalizeHomeDeadlineFilter', 'defaultHomeDeadlineFilter'
], { vars: ['HOME_DEADLINE_KINDS', 'HOME_DEADLINE_HORIZONS'] });
const {
  canSendToMedleser, normalizeMedleserList, addMedleser, normalizeMedlLog, openMedlFor,
  sendToMedleser, returnFromMedleser, pruneMedlLog, medlLogAfterUndo, medlCutoff12m,
  medleserStats, suggestMedleser, daysBetweenIso, readImportSettings
} = fns;

// Objekter fra vm-sandkassen har en annen Object-prototype; sammenlign kopier.
const plain = (x) => JSON.parse(JSON.stringify(x));
const TODAY = '2026-10-26';

function c(overrides) {
  return Object.assign({ id: 'a', caseNumber: 'NO20250001', status: 'ny', type: 'sak', title: 'T' }, overrides);
}
function e(overrides) {
  return Object.assign({ id: 'm1', caseId: 'a', caseNumber: 'NO20250001', reader: 'Kari', sent: '2026-10-20', returned: null }, overrides);
}

// ── canSendToMedleser ───────────────────────────────

test('canSendToMedleser: only own patent work (Ny, Viderebehandling)', () => {
  assert.strictEqual(canSendToMedleser(c({ status: 'ny' })), true);
  assert.strictEqual(canSendToMedleser(c({ status: 'viderebehandling' })), true);
  assert.strictEqual(canSendToMedleser(c({ status: 'fristarkiv' })), false);
  assert.strictEqual(canSendToMedleser(c({ status: 'avsluttet' })), false);
  assert.strictEqual(canSendToMedleser(c({ type: 'oppdrag' })), false);
  assert.strictEqual(canSendToMedleser(null), false);
});

test('canSendToMedleser: a case not yet assigned to you cannot be sent', () => {
  assert.strictEqual(canSendToMedleser(c({ unassigned: true })), false);
  assert.strictEqual(canSendToMedleser(c({ unassigned: false })), true);
});

// ── Medleserlista ───────────────────────────────────

test('normalizeMedleserList: trims, drops blanks and case-insensitive duplicates', () => {
  const r = normalizeMedleserList([{ name: ' Kari ' }, { name: 'kari', active: false }, { name: '' }, null, 'x',
    { name: 'Ola', active: false }]);
  assert.deepStrictEqual(plain(r), [{ name: 'Kari', active: true }, { name: 'Ola', active: false }]);
  assert.deepStrictEqual(plain(normalizeMedleserList('nope')), []);
});

test('addMedleser: adds an active reader, ignores blanks and duplicates', () => {
  const list = [{ name: 'Kari', active: true }];
  assert.deepStrictEqual(plain(addMedleser(list, ' Ola ')), [{ name: 'Kari', active: true }, { name: 'Ola', active: true }]);
  assert.strictEqual(addMedleser(list, 'KARI'), list);
  assert.strictEqual(addMedleser(list, '  '), list);
});

// ── Loggen ──────────────────────────────────────────

test('normalizeMedlLog: keeps valid entries only', () => {
  const r = normalizeMedlLog([e(), e({ id: '' }), e({ id: 'm2', sent: 'igår' }), e({ id: 'm3', reader: '' }),
    e({ id: 'm4', returned: 'x' })]);
  assert.deepStrictEqual(plain(r).map((x) => x.id), ['m1', 'm4']);
  assert.strictEqual(r[1].returned, null);
});

test('sendToMedleser: opens a new entry for the case', () => {
  const log = sendToMedleser([], c(), 'Ola', '2026-10-26', 'id1');
  assert.deepStrictEqual(plain(log), [{ id: 'id1', caseId: 'a', caseNumber: 'NO20250001', reader: 'Ola', sent: '2026-10-26', returned: null }]);
});

// «Endre medlesing» retter den åpne utsendingen, den lager ikke en til.
test('sendToMedleser: editing an open entry changes reader and date in place', () => {
  const log = sendToMedleser([e()], c(), 'Ola', '2026-10-21', 'new');
  assert.strictEqual(log.length, 1);
  assert.deepStrictEqual(plain(log[0]), plain(e({ reader: 'Ola', sent: '2026-10-21' })));
});

test('sendToMedleser: a case that came back before can be sent again', () => {
  const log = sendToMedleser([e({ returned: '2026-10-22' })], c(), 'Ola', '2026-10-26', 'id2');
  assert.strictEqual(log.length, 2);
  assert.strictEqual(openMedlFor(log, 'a').id, 'id2');
});

test('returnFromMedleser: closes the open entry with the date', () => {
  const log = returnFromMedleser([e()], 'a', TODAY);
  assert.strictEqual(log[0].returned, TODAY);
  assert.strictEqual(openMedlFor(log, 'a'), null);
});

// Saken går til Fristarkiv, avsluttes eller slettes: utsendingen lukkes, men
// blir liggende i statistikken.
test('pruneMedlLog: closes entries whose case is gone or no longer own work', () => {
  const log = [e({ id: 'm1', caseId: 'a' }), e({ id: 'm2', caseId: 'b' }), e({ id: 'm3', caseId: 'gone' })];
  const cases = [c({ id: 'a', status: 'fristarkiv' }), c({ id: 'b', status: 'viderebehandling' })];
  const r = pruneMedlLog(log, cases, TODAY);
  assert.deepStrictEqual(plain(r).map((x) => x.returned), [TODAY, null, TODAY]);
});

test('pruneMedlLog: returns the same array when nothing changes (no needless save)', () => {
  const log = [e()];
  assert.strictEqual(pruneMedlLog(log, [c()], TODAY), log);
});

test('medlLogAfterUndo: reopens what the undone action closed, keeps newer changes', () => {
  const snapshot = [e({ id: 'm1' }), e({ id: 'm2', caseId: 'b', returned: '2026-10-01' })];
  const current = [e({ id: 'm1', returned: TODAY }), e({ id: 'm2', caseId: 'b', returned: '2026-10-01' }),
    e({ id: 'm3', caseId: 'c', reader: 'Ola' })];
  const r = medlLogAfterUndo(snapshot, current);
  assert.deepStrictEqual(plain(r).map((x) => [x.id, x.returned]), [['m1', null], ['m2', '2026-10-01'], ['m3', null]]);
  assert.strictEqual(medlLogAfterUndo(null, current), current);
});

// ── Statistikk og forslag ───────────────────────────

test('medlCutoff12m: twelve months back from today', () => {
  assert.strictEqual(medlCutoff12m('2026-10-26'), '2025-10-26');
  assert.strictEqual(medlCutoff12m('2028-02-29'), '2027-02-28');
});

test('daysBetweenIso: whole calendar days', () => {
  assert.strictEqual(daysBetweenIso('2026-10-23', '2026-10-26'), 3);
  assert.strictEqual(daysBetweenIso('2026-10-26', '2026-10-26'), 0);
  assert.strictEqual(daysBetweenIso('2026-03-28', '2026-03-30'), 2); // over sommertid
});

const LOG = [
  e({ id: '1', reader: 'Kari', sent: '2026-10-20' }),
  e({ id: '2', reader: 'kari ', sent: '2026-05-02' }),
  e({ id: '3', reader: 'Ola', sent: '2026-08-14' }),
  e({ id: '4', reader: 'Ola', sent: '2025-03-01' }),   // eldre enn 12 mnd
  e({ id: '5', reader: 'Per', sent: '2025-10-26' })    // akkurat 12 mnd: utenfor
];

test('medleserStats: counts per reader for the last 12 months and in total', () => {
  const r = plain(medleserStats(LOG, TODAY));
  assert.deepStrictEqual(r, [
    { name: 'Kari', last12: 2, total: 2, lastSent: '2026-10-20' },
    { name: 'Ola',  last12: 1, total: 2, lastSent: '2026-08-14' },
    { name: 'Per',  last12: 0, total: 1, lastSent: '2025-10-26' }
  ]);
});

test('medleserStats: readers on the list but never used show with zero', () => {
  const r = plain(medleserStats([], TODAY, [{ name: 'Kari', active: true }]));
  assert.deepStrictEqual(r, [{ name: 'Kari', last12: 0, total: 0, lastSent: null }]);
});

test('suggestMedleser: fewest in the last 12 months among active readers', () => {
  const list = [{ name: 'Kari', active: true }, { name: 'Ola', active: true }, { name: 'Per', active: false }];
  assert.strictEqual(suggestMedleser(list, LOG, TODAY), 'Ola');
});

test('suggestMedleser: a tie goes to the one unused longest — never used first', () => {
  const list = [{ name: 'Kari', active: true }, { name: 'Ola', active: true }, { name: 'Ny', active: true }];
  const log = [e({ reader: 'Kari', sent: '2026-09-01' }), e({ id: '2', reader: 'Ola', sent: '2026-06-01' })];
  assert.strictEqual(suggestMedleser(list, log, TODAY), 'Ny');
  assert.strictEqual(suggestMedleser(list.slice(0, 2), log, TODAY), 'Ola');
});

test('suggestMedleser: no active readers, no suggestion', () => {
  assert.strictEqual(suggestMedleser([{ name: 'Kari', active: false }], [], TODAY), null);
  assert.strictEqual(suggestMedleser([], [], TODAY), null);
});

// ── Eksport/import ──────────────────────────────────

test('readImportSettings: reads the reader list and the log, validated', () => {
  const r = readImportSettings({ medlesere: [{ name: 'Kari' }, { name: '' }], medlLog: [e(), { id: 1 }] });
  assert.deepStrictEqual(plain(r.medlesere), [{ name: 'Kari', active: true }]);
  assert.deepStrictEqual(plain(r.medlLog), [plain(e())]);
});

test('readImportSettings: older files without the fields leave them alone', () => {
  const r = readImportSettings({ cases: [] });
  assert.ok(!('medlesere' in r));
  assert.ok(!('medlLog' in r));
});
