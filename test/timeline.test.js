'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { filterCasesForTimeline, assignTimelineRows } = loadFunctions([
  'filterCasesForTimeline', 'assignTimelineRows',
]);

function makeCase(overrides) {
  return Object.assign({
    id: 'x', caseNumber: 'NO20240001', dueDate: '2026-08-10',
    status: 'ny', type: 'sak', title: 'Test'
  }, overrides);
}

test('filterCasesForTimeline includes only the selected sakstyper', () => {
  const cases = [
    makeCase({ id: 'a', status: 'ny' }),
    makeCase({ id: 'b', status: 'fristarkiv' }),
    makeCase({ id: 'c', status: 'viderebehandling' }),
    makeCase({ id: 'd', type: 'oppdrag', status: 'ny' }),
  ];
  const result = filterCasesForTimeline(cases, ['ny', 'viderebehandling']);
  assert.deepStrictEqual(result.map((c) => c.id), ['a', 'c']);
});

test('filterCasesForTimeline treats oppdrag as its own type, independent of status', () => {
  const cases = [
    makeCase({ id: 'a', status: 'ny' }),
    makeCase({ id: 'd', type: 'oppdrag', status: 'ny' }),
  ];
  // 'ny' selected, but not 'oppdrag' — oppdrag case must not leak in
  assert.deepStrictEqual(filterCasesForTimeline(cases, ['ny']).map((c) => c.id), ['a']);
  // 'oppdrag' selected, but not 'ny' — regular ny-case must not leak in
  assert.deepStrictEqual(filterCasesForTimeline(cases, ['oppdrag']).map((c) => c.id), ['d']);
});

test('filterCasesForTimeline excludes avsluttet oppdrag even when oppdrag is selected', () => {
  const cases = [makeCase({ id: 'd', type: 'oppdrag', status: 'avsluttet' })];
  assert.deepStrictEqual(filterCasesForTimeline(cases, ['ny', 'fristarkiv', 'viderebehandling', 'oppdrag']), []);
});

test('filterCasesForTimeline excludes cases without a due date', () => {
  const cases = [makeCase({ id: 'a', dueDate: '' })];
  assert.deepStrictEqual(filterCasesForTimeline(cases, ['ny']), []);
});

test('filterCasesForTimeline returns nothing for an empty type filter', () => {
  const cases = [makeCase({ id: 'a' }), makeCase({ id: 'd', type: 'oppdrag' })];
  assert.deepStrictEqual(filterCasesForTimeline(cases, []), []);
  assert.deepStrictEqual(filterCasesForTimeline(cases, null), []);
});

test('assignTimelineRows keeps non-overlapping ranges on a single row', () => {
  const ranges = [{ start: 0, end: 5 }, { start: 10, end: 15 }, { start: 20, end: 25 }];
  const result = assignTimelineRows(ranges);
  assert.strictEqual(result.laneCount, 1);
  assert.deepStrictEqual(result.ranges.map((r) => r.row), [0, 0, 0]);
});

test('assignTimelineRows stacks two overlapping ranges on separate rows', () => {
  const ranges = [{ start: 0, end: 10 }, { start: 5, end: 15 }];
  const result = assignTimelineRows(ranges);
  assert.strictEqual(result.laneCount, 2);
  assert.deepStrictEqual(result.ranges.map((r) => r.row), [0, 1]);
});

test('assignTimelineRows stacks three mutually overlapping ranges on three rows instead of collapsing onto row 1', () => {
  // Regression test: the old code capped rows at Math.min(row, 1), so a third
  // overlapping bar was drawn directly on top of the second, invisibly.
  const ranges = [{ start: 0, end: 10 }, { start: 1, end: 11 }, { start: 2, end: 12 }];
  const result = assignTimelineRows(ranges);
  assert.strictEqual(result.laneCount, 3);
  assert.deepStrictEqual(result.ranges.map((r) => r.row), [0, 1, 2]);
});

test('assignTimelineRows reuses a row for ranges that do not overlap each other, even if both overlap a third', () => {
  // A spans the whole window; B and C sit inside it but don't overlap each
  // other, so they should share row 1 instead of each claiming a new row.
  const ranges = [
    { start: 0, end: 10 },  // A
    { start: 2, end: 4 },   // B
    { start: 6, end: 8 },   // C
  ];
  const result = assignTimelineRows(ranges);
  assert.strictEqual(result.laneCount, 2);
  assert.strictEqual(result.ranges[0].row, 0); // A
  assert.strictEqual(result.ranges[1].row, 1); // B
  assert.strictEqual(result.ranges[2].row, 1); // C — reuses B's row
});

test('assignTimelineRows does not depend on input order', () => {
  const chronological = [{ start: 0, end: 10 }, { start: 1, end: 11 }, { start: 2, end: 12 }];
  const shuffled = [chronological[2], chronological[0], chronological[1]];
  const a = assignTimelineRows(chronological);
  const b = assignTimelineRows(shuffled);
  assert.strictEqual(a.laneCount, 3);
  assert.strictEqual(b.laneCount, 3);
  // Each range keeps its own identity (matched by start) regardless of input order
  const rowByStart = (result) => {
    const map = {};
    result.ranges.forEach((r) => { map[r.start] = r.row; });
    return map;
  };
  assert.deepStrictEqual(rowByStart(a), rowByStart(b));
});

test('assignTimelineRows handles overdue (negative) ranges without corrupting row reuse', () => {
  // Regression test: the old code used `rowEnds[row] || 0` as a sentinel for
  // "unset", which mangled negative end values (Math.max(0, -8) => 0) and
  // could force a later, non-overlapping overdue range into an unnecessary
  // new row. These two ranges don't overlap each other and must share row 0.
  const ranges = [{ start: -10, end: -8 }, { start: -6, end: -2 }];
  const result = assignTimelineRows(ranges);
  assert.strictEqual(result.laneCount, 1);
  assert.deepStrictEqual(result.ranges.map((r) => r.row), [0, 0]);
});

test('assignTimelineRows preserves extra fields on each range', () => {
  const ranges = [{ start: 0, end: 5, caseNumber: 'NO20240001' }];
  const result = assignTimelineRows(ranges);
  assert.strictEqual(result.ranges[0].caseNumber, 'NO20240001');
});
