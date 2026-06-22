'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

function load(vacations, fristBuffer) {
  return loadFunctions(
    ['getEffectiveDueDate', 'effDueFor', 'periodOverlapsVacation'],
    { globals: { vacations: vacations || [], fristBuffer: fristBuffer != null ? fristBuffer : 0 } }
  );
}

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

test('effDueFor uses the raw dueDate for oppdrag and the buffered date otherwise', () => {
  const { effDueFor } = load([], 3);
  assert.strictEqual(effDueFor({ type: 'oppdrag', dueDate: '2026-07-15' }), '2026-07-15');
  assert.strictEqual(effDueFor({ type: 'sak', dueDate: '2026-07-15' }), '2026-07-12');
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
