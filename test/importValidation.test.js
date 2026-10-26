'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { _validateImportCase, migrateCases } = loadFunctions(
  ['_validateImportCase', 'migrateCases', 'parseDate', 'sanitizeText', 'uid', 'normaliseOutcome'],
  { vars: ['VALID_IMPORT_STATUSES', 'OUTCOMES'] }
);

function validCase(overrides) {
  return Object.assign({
    id: 'abc123', caseNumber: 'P-2026-001', dueDate: '2026-07-01', title: 'Test', status: 'ny',
  }, overrides);
}

test('_validateImportCase accepts a well-formed case', () => {
  assert.strictEqual(_validateImportCase(validCase()), true);
});

test('_validateImportCase rejects non-objects', () => {
  assert.strictEqual(_validateImportCase(null), false);
  assert.strictEqual(_validateImportCase('not an object'), false);
});

test('_validateImportCase rejects a missing or blank id', () => {
  assert.strictEqual(_validateImportCase(validCase({ id: '' })), false);
  assert.strictEqual(_validateImportCase(validCase({ id: undefined })), false);
});

test('_validateImportCase rejects a missing case number', () => {
  assert.strictEqual(_validateImportCase(validCase({ caseNumber: '   ' })), false);
});

test('_validateImportCase rejects an invalid status', () => {
  assert.strictEqual(_validateImportCase(validCase({ status: 'oppdrag' })), false);
  assert.strictEqual(_validateImportCase(validCase({ status: 'unknown' })), false);
});

test('migrateCases assigns defaults for missing fields', () => {
  const [migrated] = migrateCases([{ caseNumber: 'P-1', dueDate: '2026.07.01' }]);
  assert.strictEqual(migrated.caseNumber, 'P-1');
  assert.strictEqual(migrated.dueDate, '2026-07-01');
  assert.strictEqual(migrated.status, 'ny');
  assert.strictEqual(migrated.type, 'sak');
  assert.ok(migrated.id);
  assert.strictEqual(migrated.history.length, 1);
  assert.strictEqual(migrated.history[0].status, 'ny');
});

test('migrateCases normalizes legacy oppdrag status to ny', () => {
  const [migrated] = migrateCases([{ id: 'x', type: 'oppdrag', status: 'oppdrag', dueDate: '2026-07-01' }]);
  assert.strictEqual(migrated.status, 'ny');
});

test('migrateCases preserves an existing non-empty history', () => {
  const hist = [{ status: 'ny', date: '2025-01-01T00:00:00.000Z' }, { status: 'avsluttet', date: '2025-02-01T00:00:00.000Z' }];
  const [migrated] = migrateCases([{ id: 'x', dueDate: '2026-07-01', history: hist }]);
  assert.strictEqual(migrated.history.length, 2);
  assert.strictEqual(migrated.history[1].status, 'avsluttet');
});

test('migrateCases sanitizes notes of control characters', () => {
  const [migrated] = migrateCases([{ id: 'x', dueDate: '2026-07-01', notes: 'ok\x00bad' }]);
  assert.strictEqual(migrated.notes, 'okbad');
});

// ── prepareImportData: shared by file import, snapshot restore and work file ──
const { prepareImportData } = loadFunctions(
  ['prepareImportData', '_validateImportCase', 'migrateCases', 'decodeCase', 'parseDate', 'sanitizeText', 'uid', 'normaliseOutcome'],
  { vars: ['VALID_IMPORT_STATUSES', 'INT_TO_STATUS', 'OUTCOMES'] }
);

test('prepareImportData decodes integer statuses and keeps valid cases', () => {
  const r = prepareImportData({ cases: [validCase({ status: 2 })] });
  assert.strictEqual(r.skipped, 0);
  assert.strictEqual(r.data.cases.length, 1);
  assert.strictEqual(r.data.cases[0].status, 'fristarkiv');
});

test('prepareImportData drops invalid cases and reports how many', () => {
  const r = prepareImportData({ cases: [validCase(), validCase({ id: 'x2', caseNumber: '' })] });
  assert.strictEqual(r.data.cases.length, 1);
  assert.strictEqual(r.skipped, 1);
});

test('prepareImportData discards malformed stats but keeps well-formed stats', () => {
  assert.strictEqual(prepareImportData({ cases: [], stats: { log: 'x' } }).data.stats, undefined);
  const stats = { nyTotal: 1, log: [] };
  assert.deepStrictEqual(prepareImportData({ cases: [], stats }).data.stats, stats);
});

test('prepareImportData throws on data without a cases array', () => {
  assert.throws(() => prepareImportData(null));
  assert.throws(() => prepareImportData({}));
  assert.throws(() => prepareImportData({ cases: 'nei' }));
});

test('migrateCases keeps a valid outcome on a closed case', () => {
  const [migrated] = migrateCases([{ id: 'x', dueDate: '2026-07-01', status: 'avsluttet', outcome: 'meddelt' }]);
  assert.strictEqual(migrated.outcome, 'meddelt');
});

test('migrateCases drops an outcome on an open case or an unknown outcome', () => {
  const [open] = migrateCases([{ id: 'x', dueDate: '2026-07-01', status: 'ny', outcome: 'meddelt' }]);
  assert.strictEqual(open.outcome, null);
  const [bogus] = migrateCases([{ id: 'y', dueDate: '2026-07-01', status: 'avsluttet', outcome: 'kanskje' }]);
  assert.strictEqual(bogus.outcome, null);
  const [legacy] = migrateCases([{ id: 'z', dueDate: '2026-07-01', status: 'avsluttet' }]);
  assert.strictEqual(legacy.outcome, null);
});

test('prepareImportData keeps the outcome of a closed case (work file and import)', () => {
  const r = prepareImportData({ cases: [validCase({ status: 3, outcome: 'avslatt' })] });
  assert.strictEqual(r.data.cases[0].status, 'avsluttet');
  assert.strictEqual(r.data.cases[0].outcome, 'avslatt');
});

// «Ikke fordelt» må overleve lagring, eksport og import — migrateCases bygger
// saken felt for felt, så et felt som ikke står der, forsvinner.
test('migrateCases keeps the unassigned flag and when it was set', () => {
  const [m] = migrateCases([validCase({ unassigned: true, unassignedSince: '2026-10-01T09:00:00.000Z' })]);
  assert.strictEqual(m.unassigned, true);
  assert.strictEqual(m.unassignedSince, '2026-10-01T09:00:00.000Z');
});

test('migrateCases leaves cases without the flag unchanged', () => {
  const [m] = migrateCases([validCase()]);
  assert.ok(!('unassigned' in m));
  assert.ok(!('unassignedSince' in m));
});

test('migrateCases drops a flag that is not literally true', () => {
  const [m] = migrateCases([validCase({ unassigned: 'yes', unassignedSince: 42 })]);
  assert.ok(!('unassigned' in m));
});
