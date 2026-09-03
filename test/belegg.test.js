'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

// computeBelegg is loaded with isNonWorkday stubbed to "every day is a
// workday", so the arithmetic below is plain day counting and the tests don't
// drift when a public holiday moves.
function load(cases) {
  return loadFunctions(
    ['computeBelegg', 'countsInBelegg', 'effDueFor', 'getEffectiveDueDate', 'bufferAppliesTo'],
    {
      vars: ['WORK_WINDOW_DAYS'],
      globals: {
        cases: cases || [],
        vacations: [],
        fristBuffer: 0,
        isNonWorkday: () => false,
      },
    }
  );
}

// A date `days` from today, as YYYY-MM-DD.
function inDays(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function makeCase(overrides) {
  return Object.assign({
    id: 'x', caseNumber: 'NO20240001', dueDate: inDays(30),
    status: 'ny', type: 'sak', title: 'Test'
  }, overrides);
}

// One case due in 30 days covers offsets 16..30 = 15 of the 60 days = 25%.
const ONE_CASE_PCT = 25;

test('computeBelegg counts the work window of a single case', () => {
  const { computeBelegg } = load([makeCase({ id: 'a' })]);
  const res = computeBelegg(60);
  assert.strictEqual(res.avail, 60);
  assert.strictEqual(res.busy, 15);
  assert.strictEqual(res.pct1, ONE_CASE_PCT);
});

// This pins a deliberate design decision, so don't "fix" it into a set of
// unique dates: the work window is an estimate of effort, and belegg is
// effort booked against capacity available. Deduplicating overlapping windows
// would report ten cases due the same day as no busier than one — silent in
// exactly the case that most needs a warning. It follows that the percentage
// can exceed 100, and should: that means overbooked.
test('computeBelegg sums overlapping work windows rather than merging them', () => {
  const { computeBelegg } = load([
    makeCase({ id: 'a' }),
    makeCase({ id: 'b' }),
  ]);
  assert.strictEqual(computeBelegg(60).pct1, ONE_CASE_PCT * 2);
});

test('computeBelegg reports over 100% when the booked work exceeds capacity', () => {
  const many = [];
  for (let i = 0; i < 5; i++) many.push(makeCase({ id: 'c' + i }));
  const { computeBelegg } = load(many);
  const pct = computeBelegg(60).pct1;
  assert.strictEqual(pct, ONE_CASE_PCT * 5);
  assert.ok(pct > 100, 'five concurrent cases should read as overbooked');
});

test('computeBelegg ignores fristarkiv cases', () => {
  const { computeBelegg } = load([
    makeCase({ id: 'a', status: 'ny' }),
    makeCase({ id: 'b', status: 'fristarkiv' }),
  ]);
  assert.strictEqual(computeBelegg(60).pct1, ONE_CASE_PCT);
});

test('computeBelegg counts viderebehandling as real work', () => {
  const { computeBelegg } = load([makeCase({ id: 'a', status: 'viderebehandling' })]);
  assert.strictEqual(computeBelegg(60).pct1, ONE_CASE_PCT);
});

test('computeBelegg ignores avsluttet cases and oppdrag', () => {
  const { computeBelegg } = load([
    makeCase({ id: 'a', status: 'avsluttet' }),
    makeCase({ id: 'b', type: 'oppdrag', status: 'ny', duration: 5 }),
  ]);
  assert.strictEqual(computeBelegg(60).pct1, 0);
});
