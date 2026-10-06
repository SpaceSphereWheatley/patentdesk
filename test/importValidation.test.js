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
