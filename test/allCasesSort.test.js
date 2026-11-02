'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { normalizeAllSort, nextAllSort, sortAllCases, closedDaysAgo } = loadFunctions(
  ['normalizeAllSort', 'nextAllSort', 'sortAllCases', 'closedDaysAgo', 'allCasesStatusRank', 'closedDate'],
  { vars: ['ALL_SORT_KEYS'] }
);

const c = (id, status, dueDate, extra) => Object.assign({ id, caseNumber: '2026' + id, title: 'T' + id, status, dueDate, type: 'sak' }, extra);
const ids = (list) => list.map((x) => x.id);

test('normalizeAllSort: a stored sort is kept; anything else falls back to deadline, ascending', () => {
  assert.deepStrictEqual({ ...normalizeAllSort({ key: 'cn', dir: 'desc' }) }, { key: 'cn', dir: 'desc' });
  assert.deepStrictEqual({ ...normalizeAllSort(null) }, { key: 'frist', dir: 'asc' });
  assert.deepStrictEqual({ ...normalizeAllSort({ key: 'nope', dir: 'up' }) }, { key: 'frist', dir: 'asc' });
  assert.deepStrictEqual({ ...normalizeAllSort({ key: 'tittel' }) }, { key: 'tittel', dir: 'asc' });
});

test('nextAllSort: clicking the same column flips the direction, a new column starts ascending', () => {
  assert.deepStrictEqual({ ...nextAllSort({ key: 'frist', dir: 'asc' }, 'frist') }, { key: 'frist', dir: 'desc' });
  assert.deepStrictEqual({ ...nextAllSort({ key: 'frist', dir: 'desc' }, 'frist') }, { key: 'frist', dir: 'asc' });
  assert.deepStrictEqual({ ...nextAllSort({ key: 'frist', dir: 'desc' }, 'cn') }, { key: 'cn', dir: 'asc' });
});

test('sort on deadline: soonest first, closed cases always last (newest closed first)', () => {
  const list = [
    c('1', 'ny', '2026-11-20'),
    c('2', 'avsluttet', '2026-01-01', { history: [{ type: 'status', to: 'avsluttet', date: '2026-09-01T10:00:00Z' }] }),
    c('3', 'fristarkiv', '2026-11-05'),
    c('4', 'avsluttet', '2026-01-01', { history: [{ type: 'status', to: 'avsluttet', date: '2026-10-01T10:00:00Z' }] }),
  ];
  assert.deepStrictEqual(ids(sortAllCases(list, { key: 'frist', dir: 'asc' })), ['3', '1', '4', '2']);
  assert.deepStrictEqual(ids(sortAllCases(list, { key: 'frist', dir: 'desc' })), ['1', '3', '4', '2']);
});

test('sort on deadline uses the deadline the badge shows when given one', () => {
  const list = [c('1', 'ny', '2026-11-20'), c('2', 'ny', '2026-11-10')];
  const dueOf = (x) => (x.id === '1' ? '2026-11-01' : x.dueDate);
  assert.deepStrictEqual(ids(sortAllCases(list, { key: 'frist', dir: 'asc' }, dueOf)), ['1', '2']);
});

test('sort on status follows the workflow: Oppdrag, Ny, Viderebehandling, Fristarkiv, Avsluttet; deadline breaks ties', () => {
  const list = [
    c('a', 'avsluttet', '2026-01-01'), c('f', 'fristarkiv', '2026-11-05'), c('n2', 'ny', '2026-12-01'),
    c('v', 'viderebehandling', '2026-11-08'), c('n1', 'ny', '2026-11-02'), c('o', 'ny', '2026-11-09', { type: 'oppdrag' }),
  ];
  assert.deepStrictEqual(ids(sortAllCases(list, { key: 'status', dir: 'asc' })), ['o', 'n1', 'n2', 'v', 'f', 'a']);
});

test('sort on case number and title, both directions; the input list is not changed', () => {
  const list = [c('2', 'ny', '2026-11-01', { title: 'beta' }), c('10', 'ny', '2026-11-01', { title: 'Alfa' }), c('1', 'ny', '2026-11-01', { title: 'Ære' })];
  assert.deepStrictEqual(ids(sortAllCases(list, { key: 'cn', dir: 'asc' })), ['1', '2', '10']);
  assert.deepStrictEqual(ids(sortAllCases(list, { key: 'cn', dir: 'desc' })), ['10', '2', '1']);
  assert.deepStrictEqual(ids(sortAllCases(list, { key: 'tittel', dir: 'asc' })), ['10', '2', '1']);
  assert.deepStrictEqual(ids(list), ['2', '10', '1']);
});

test('closedDaysAgo: days since the case was closed, from its history; null when unknown or not closed', () => {
  const closed = c('x', 'avsluttet', '2026-01-01', { history: [{ type: 'status', to: 'avsluttet', date: '2026-09-20T10:00:00Z' }] });
  assert.strictEqual(closedDaysAgo(closed, '2026-10-31'), 41);
  assert.strictEqual(closedDaysAgo(c('y', 'avsluttet', '2026-01-01'), '2026-10-31'), null);
  assert.strictEqual(closedDaysAgo(c('z', 'ny', '2026-11-01'), '2026-10-31'), null);
});
