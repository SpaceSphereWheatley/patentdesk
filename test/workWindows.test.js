'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

// workWindows is the user's setting; pass it in as a global so each test can
// pick its own values.
function load(workWindows) {
  return loadFunctions(
    ['normalizeWorkWindows', 'workWindowDays', 'timelineSpanDays', 'periodOverlapsVacation',
     'bufferAppliesTo', 'getEffectiveDueDate', 'effDueFor'],
    {
      vars: ['WORK_WINDOW_DEFAULTS', 'WORK_WINDOW_MAX', 'MILESTONE_DAYS'],
      globals: { workWindows: workWindows, vacations: [], fristBuffer: 0 },
    }
  );
}

function makeCase(overrides) {
  return Object.assign({
    id: 'x', caseNumber: 'NO20240001', dueDate: '2026-08-10',
    status: 'ny', type: 'sak', title: 'Test'
  }, overrides);
}

const DEFAULTS = { ny: 14, viderebehandling: 3, oppdrag: 2 };

test('WORK_WINDOW_DEFAULTS: 14 days for Ny, 3 for Viderebehandling, 2 for oppdrag', () => {
  const { WORK_WINDOW_DEFAULTS } = load(DEFAULTS);
  assert.deepStrictEqual(Object.assign({}, WORK_WINDOW_DEFAULTS), DEFAULTS);
});

test('normalizeWorkWindows falls back to the defaults for missing or invalid input', () => {
  const { normalizeWorkWindows } = load(DEFAULTS);
  assert.deepStrictEqual(Object.assign({}, normalizeWorkWindows(null)), DEFAULTS);
  assert.deepStrictEqual(Object.assign({}, normalizeWorkWindows('x')), DEFAULTS);
  assert.deepStrictEqual(Object.assign({}, normalizeWorkWindows([])), DEFAULTS);
  assert.deepStrictEqual(Object.assign({}, normalizeWorkWindows({})), DEFAULTS);
});

test('normalizeWorkWindows keeps valid values per type and rejects the rest individually', () => {
  const { normalizeWorkWindows } = load(DEFAULTS);
  const r = normalizeWorkWindows({ ny: 10, viderebehandling: 0, oppdrag: '5', extra: 9 });
  assert.deepStrictEqual(Object.assign({}, r), { ny: 10, viderebehandling: 3, oppdrag: 2 });
});

test('normalizeWorkWindows rounds down and caps at 365 days', () => {
  const { normalizeWorkWindows } = load(DEFAULTS);
  assert.strictEqual(normalizeWorkWindows({ ny: 10.8 }).ny, 10);
  assert.strictEqual(normalizeWorkWindows({ ny: 365 }).ny, 365);
  assert.strictEqual(normalizeWorkWindows({ ny: 366 }).ny, 14);
  assert.strictEqual(normalizeWorkWindows({ ny: NaN }).ny, 14);
  assert.strictEqual(normalizeWorkWindows({ ny: Infinity }).ny, 14);
});

test('workWindowDays uses the setting for the case\'s status', () => {
  const { workWindowDays } = load({ ny: 10, viderebehandling: 4, oppdrag: 2 });
  assert.strictEqual(workWindowDays(makeCase({ status: 'ny' })), 10);
  assert.strictEqual(workWindowDays(makeCase({ status: 'viderebehandling' })), 4);
});

test('workWindowDays uses the oppdrag\'s own duration, and the setting when it has none', () => {
  const { workWindowDays } = load({ ny: 14, viderebehandling: 3, oppdrag: 5 });
  assert.strictEqual(workWindowDays(makeCase({ type: 'oppdrag', duration: 1 })), 1);
  assert.strictEqual(workWindowDays(makeCase({ type: 'oppdrag', duration: 8 })), 8);
  assert.strictEqual(workWindowDays(makeCase({ type: 'oppdrag', duration: null })), 5);
  assert.strictEqual(workWindowDays(makeCase({ type: 'oppdrag', duration: 0 })), 5);
  assert.strictEqual(workWindowDays(makeCase({ type: 'oppdrag', duration: 'x' })), 5);
});

test('timelineSpanDays follows the settings, with fristarkiv as a milestone', () => {
  const { timelineSpanDays } = load({ ny: 10, viderebehandling: 3, oppdrag: 2 });
  assert.strictEqual(timelineSpanDays(makeCase({ status: 'ny' })), 10);
  assert.strictEqual(timelineSpanDays(makeCase({ status: 'viderebehandling' })), 3);
  assert.strictEqual(timelineSpanDays(makeCase({ status: 'fristarkiv' })), 1);
  assert.strictEqual(timelineSpanDays(makeCase({ type: 'oppdrag', duration: null })), 2);
});

// Regression: the timeline drew a 1-day oppdrag (or one with no duration) as
// 2 days while the vacation check counted 1 day, so the two could disagree.
test('timeline and vacation check agree on an oppdrag\'s length', () => {
  const settings = { ny: 14, viderebehandling: 3, oppdrag: 2 };
  [1, null].forEach((duration) => {
    const c = makeCase({ type: 'oppdrag', dueDate: '2026-08-10', duration: duration });
    const { timelineSpanDays } = load(settings);
    const days = timelineSpanDays(c);
    // A vacation ending the day before the first day of the span must not
    // overlap; one ending on the first day must.
    const first = new Date('2026-08-10T00:00:00');
    first.setDate(first.getDate() - (days - 1));
    const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const dayBefore = new Date(first); dayBefore.setDate(dayBefore.getDate() - 1);
    const fns = loadFunctions(
      ['normalizeWorkWindows', 'workWindowDays', 'periodOverlapsVacation', 'bufferAppliesTo', 'getEffectiveDueDate', 'effDueFor'],
      { vars: ['WORK_WINDOW_DEFAULTS', 'WORK_WINDOW_MAX'], globals: { workWindows: settings, fristBuffer: 0,
        vacations: [{ from: '2026-07-01', to: iso(first) }] } }
    );
    assert.strictEqual(fns.periodOverlapsVacation(c), true, 'duration ' + duration + ': first day');
    const fns2 = loadFunctions(
      ['normalizeWorkWindows', 'workWindowDays', 'periodOverlapsVacation', 'bufferAppliesTo', 'getEffectiveDueDate', 'effDueFor'],
      { vars: ['WORK_WINDOW_DEFAULTS', 'WORK_WINDOW_MAX'], globals: { workWindows: settings, fristBuffer: 0,
        vacations: [{ from: '2026-07-01', to: iso(dayBefore) }] } }
    );
    assert.strictEqual(fns2.periodOverlapsVacation(c), false, 'duration ' + duration + ': day before');
  });
});

test('periodOverlapsVacation uses the Viderebehandling window from the settings', () => {
  const fns = loadFunctions(
    ['workWindowDays', 'periodOverlapsVacation', 'bufferAppliesTo', 'getEffectiveDueDate', 'effDueFor'],
    { globals: { workWindows: { ny: 14, viderebehandling: 3, oppdrag: 2 }, fristBuffer: 0,
      // Ends 5 days before the due date: inside a 14-day window, outside a 3-day one.
      vacations: [{ from: '2026-07-20', to: '2026-08-05' }] } }
  );
  assert.strictEqual(fns.periodOverlapsVacation(makeCase({ status: 'ny' })), true);
  assert.strictEqual(fns.periodOverlapsVacation(makeCase({ status: 'viderebehandling' })), false);
});
