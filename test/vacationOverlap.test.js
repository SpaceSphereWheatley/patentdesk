'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

function load(vacations, fristBuffer) {
  return loadFunctions(
    ['bufferAppliesTo', 'getEffectiveDueDate', 'effDueFor', 'periodOverlapsVacation'],
    {
      vars: ['WORK_WINDOW_DAYS'],
      globals: { vacations: vacations || [], fristBuffer: fristBuffer != null ? fristBuffer : 0 },
    }
  );
}

test('bufferAppliesTo excludes oppdrag and fristarkiv, includes other statuses', () => {
  const { bufferAppliesTo } = load([], 5);
  assert.strictEqual(bufferAppliesTo({ type: 'sak', status: 'ny' }), true);
  assert.strictEqual(bufferAppliesTo({ type: 'sak', status: 'viderebehandling' }), true);
  assert.strictEqual(bufferAppliesTo({ type: 'sak', status: 'fristarkiv' }), false);
  assert.strictEqual(bufferAppliesTo({ type: 'oppdrag', status: 'ny' }), false);
});

test('getEffectiveDueDate returns the due date unchanged for oppdrag cases', () => {
  const { getEffectiveDueDate } = load([], 5);
  assert.strictEqual(getEffectiveDueDate('2026-07-15', { type: 'oppdrag' }), '2026-07-15');
});

test('getEffectiveDueDate subtracts the buffer for regular cases', () => {
  const { getEffectiveDueDate } = load([], 5);
  assert.strictEqual(getEffectiveDueDate('2026-07-15', { type: 'sak' }), '2026-07-10');
});

test('getEffectiveDueDate prefers a per-case buffer over the global default', () => {
  const { getEffectiveDueDate } = load([], 5);
  assert.strictEqual(getEffectiveDueDate('2026-07-15', { type: 'sak', caseBuffer: 2 }), '2026-07-13');
});

test('getEffectiveDueDate returns the due date unchanged for fristarkiv cases', () => {
  const { getEffectiveDueDate } = load([], 5);
  assert.strictEqual(getEffectiveDueDate('2026-07-15', { type: 'sak', status: 'fristarkiv' }), '2026-07-15');
});

test('getEffectiveDueDate ignores a per-case buffer for fristarkiv cases', () => {
  const { getEffectiveDueDate } = load([], 0);
  assert.strictEqual(
    getEffectiveDueDate('2026-07-15', { type: 'sak', status: 'fristarkiv', caseBuffer: 4 }),
    '2026-07-15'
  );
});

test('getEffectiveDueDate still buffers a case that has left fristarkiv', () => {
  const { getEffectiveDueDate } = load([], 5);
  assert.strictEqual(
    getEffectiveDueDate('2026-07-15', { type: 'sak', status: 'viderebehandling', caseBuffer: 4 }),
    '2026-07-11'
  );
});

test('getEffectiveDueDate applies the global buffer when no case object is given', () => {
  const { getEffectiveDueDate } = load([], 5);
  assert.strictEqual(getEffectiveDueDate('2026-07-15'), '2026-07-10');
});

test('effDueFor uses the raw dueDate for oppdrag and the buffered date otherwise', () => {
  const { effDueFor } = load([], 3);
  assert.strictEqual(effDueFor({ type: 'oppdrag', dueDate: '2026-07-15' }), '2026-07-15');
  assert.strictEqual(effDueFor({ type: 'sak', dueDate: '2026-07-15' }), '2026-07-12');
});

test('effDueFor uses the raw dueDate for cases in fristarkiv', () => {
  const { effDueFor } = load([], 3);
  assert.strictEqual(effDueFor({ type: 'sak', status: 'fristarkiv', dueDate: '2026-07-15' }), '2026-07-15');
  assert.strictEqual(
    effDueFor({ type: 'sak', status: 'fristarkiv', caseBuffer: 7, dueDate: '2026-07-15' }),
    '2026-07-15'
  );
});

test('periodOverlapsVacation ignores fristarkiv cases entirely', () => {
  // A vacation sitting squarely on the due date would overlap for any status
  // that had a working period — a fristarkiv case has none, so it never does.
  const { periodOverlapsVacation } = load([{ from: '2026-07-13', to: '2026-07-17' }], 0);
  assert.strictEqual(periodOverlapsVacation({ type: 'sak', status: 'ny', dueDate: '2026-07-15' }), true);
  assert.strictEqual(periodOverlapsVacation({ type: 'sak', status: 'fristarkiv', dueDate: '2026-07-15' }), false);
});

test('periodOverlapsVacation still measures the buffered window for other statuses', () => {
  const { periodOverlapsVacation } = load([{ from: '2026-06-20', to: '2026-06-24' }], 10);
  // Buffered, the 14-day window ends 2026-07-05 and starts 2026-06-22 (overlap).
  assert.strictEqual(periodOverlapsVacation({ type: 'sak', status: 'ny', dueDate: '2026-07-15' }), true);
  // Without the buffer it would end 2026-07-15 and start 2026-07-02 — no overlap.
  assert.strictEqual(periodOverlapsVacation({ type: 'sak', status: 'viderebehandling', dueDate: '2026-07-15' }), true);
});

test('caseBufferLabel marks the buffer as inactive for fristarkiv cases only', () => {
  const { caseBufferLabel } = loadFunctions(['bufferAppliesTo', 'caseBufferLabel']);
  assert.strictEqual(caseBufferLabel({ status: 'ny', caseBuffer: 5 }), '5 dager');
  assert.strictEqual(caseBufferLabel({ status: 'ny' }), 'Globalt');
  assert.strictEqual(caseBufferLabel({ status: 'fristarkiv', caseBuffer: 5 }), '5 dager · ikke aktiv i Fristarkiv');
  assert.strictEqual(caseBufferLabel({ status: 'fristarkiv' }), 'Globalt · ikke aktiv i Fristarkiv');
});

test('periodOverlapsVacation detects overlap within the 14-day window for søknader', () => {
  const { periodOverlapsVacation } = load([{ from: '2026-07-01', to: '2026-07-05' }], 0);
  assert.strictEqual(periodOverlapsVacation({ type: 'sak', dueDate: '2026-07-10' }), true);
});

test('periodOverlapsVacation returns false when no vacation overlaps', () => {
  const { periodOverlapsVacation } = load([{ from: '2026-01-01', to: '2026-01-05' }], 0);
  assert.strictEqual(periodOverlapsVacation({ type: 'sak', dueDate: '2026-07-10' }), false);
});

test('periodOverlapsVacation uses the oppdrag duration window instead of 14 days', () => {
  const { periodOverlapsVacation } = load([{ from: '2026-07-09', to: '2026-07-09' }], 0);
  assert.strictEqual(periodOverlapsVacation({ type: 'oppdrag', dueDate: '2026-07-10', duration: 2 }), true);
  assert.strictEqual(periodOverlapsVacation({ type: 'oppdrag', dueDate: '2026-07-10', duration: 1 }), false);
});

test('periodOverlapsVacation returns false for a case without a due date', () => {
  const { periodOverlapsVacation } = load([], 0);
  assert.strictEqual(periodOverlapsVacation({ type: 'sak' }), false);
});
