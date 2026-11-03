'use strict';
// Fristene som foreslås i dialogene kan endres under Innstillinger → Frister.
// Standard er 3 måneder for alle tre: søkers frist etter 1. og senere
// realitetsbrev, og egen frist for å behandle svaret.
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { normalizeDeadlines, statusTransition, readImportSettings, DEADLINE_DEFAULTS } = loadFunctions(
  ['normalizeDeadlines', 'statusTransition', 'readImportSettings', 'isValidChecklistTemplate',
   'normalizeHomeDeadlineFilter', 'defaultHomeDeadlineFilter', 'normalizeWorkWindows',
   'migrateWorkWindowsToWorkdays', 'normalizeTypeBuffers'],
  { vars: ['DEADLINE_DEFAULTS', 'DEADLINE_MAX', 'HOME_DEADLINE_KINDS', 'HOME_DEADLINE_HORIZONS',
           'WORK_WINDOW_DEFAULTS', 'WORK_WINDOW_MAX', 'TYPE_BUFFER_DEFAULTS', 'TYPE_BUFFER_MAX'] }
);

const plain = (v) => JSON.parse(JSON.stringify(v));

test('the defaults are 3 months for all three deadlines', () => {
  assert.deepStrictEqual(plain(DEADLINE_DEFAULTS), { firstLetter: 3, laterLetter: 3, response: 3 });
});

test('normalizeDeadlines fills in defaults for missing or broken input', () => {
  assert.deepStrictEqual(plain(normalizeDeadlines(null)), plain(DEADLINE_DEFAULTS));
  assert.deepStrictEqual(plain(normalizeDeadlines('x')), plain(DEADLINE_DEFAULTS));
  assert.deepStrictEqual(plain(normalizeDeadlines([4])), plain(DEADLINE_DEFAULTS));
});

test('normalizeDeadlines validates each value on its own', () => {
  assert.deepStrictEqual(plain(normalizeDeadlines({ firstLetter: 6, laterLetter: 0, response: 'x' })),
    { firstLetter: 6, laterLetter: 3, response: 3 });
  assert.deepStrictEqual(plain(normalizeDeadlines({ firstLetter: 25, laterLetter: 2.7, response: 24 })),
    { firstLetter: 3, laterLetter: 2, response: 24 });
});

test('statusTransition uses the default deadlines when none are passed', () => {
  assert.strictEqual(statusTransition('ny', 'fristarkiv', false).suggestMonths, 3);
  assert.strictEqual(statusTransition('viderebehandling', 'fristarkiv', false).suggestMonths, 3);
  assert.strictEqual(statusTransition('fristarkiv', 'viderebehandling', false).suggestMonths, 3);
});

test('statusTransition uses the configured deadline for each transition', () => {
  const d = { firstLetter: 4, laterLetter: 2, response: 5 };
  const first = statusTransition('ny', 'fristarkiv', false, d);
  assert.strictEqual(first.suggestMonths, 4);
  assert.match(first.dueDateDesc, /4 måneder/);
  const later = statusTransition('viderebehandling', 'fristarkiv', false, d);
  assert.strictEqual(later.suggestMonths, 2);
  assert.match(later.dueDateDesc, /2 måneder/);
  const resp = statusTransition('fristarkiv', 'viderebehandling', false, d);
  assert.strictEqual(resp.suggestMonths, 5);
  assert.match(resp.dueDateDesc, /5 måneder/);
});

test('statusTransition uses singular "måned" for one month', () => {
  const t = statusTransition('ny', 'fristarkiv', false, { firstLetter: 1, laterLetter: 3, response: 3 });
  assert.match(t.dueDateDesc, /1 måned fra i dag/);
});

test('deadlines are read from an export file only when present', () => {
  assert.deepStrictEqual(plain(readImportSettings({ deadlines: { firstLetter: 6, laterLetter: 99 } }).deadlines),
    { firstLetter: 6, laterLetter: 3, response: 3 });
  assert.ok(!('deadlines' in readImportSettings({})));
  assert.ok(!('deadlines' in readImportSettings({ deadlines: 'x' })));
});
