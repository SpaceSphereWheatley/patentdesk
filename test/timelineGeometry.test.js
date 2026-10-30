'use strict';
// Kjøres i norsk tid: lokal midnatt er gårsdagen i UTC, og det er der
// datofeil av typen toISOString().slice(0, 10) viser seg. node --test kjører
// hver fil i sin egen prosess, så dette påvirker ikke de andre testene.
process.env.TZ = 'Europe/Oslo';

const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const DUE_DEPS = ['isoLocalDate', 'getEffectiveDueDate', 'effDueFor', 'bufferAppliesTo', 'typeBufferFor', 'bufferDaysFor', 'canPostpone', 'postponedDaysFor'];

function load(names, buffers, nonWorkday) {
  return loadFunctions(names.concat(DUE_DEPS, ['timelineSpanDays', 'timelineBarStart', 'workWindowDays', 'workWindowStart', 'isUnassigned', 'canBeUnassigned']), {
    vars: ['MILESTONE_DAYS'],
    globals: {
      isNonWorkday: nonWorkday || (() => false),
      typeBuffers: buffers || { ny: 0, viderebehandling: 0 },
      workWindows: { ny: 14, viderebehandling: 5, oppdrag: 3 },
    },
  });
}

// ── isoLocalDate / getEffectiveDueDate ──────────────────────────────────────

test('isoLocalDate gives the local calendar date, not the UTC one', () => {
  const { isoLocalDate } = load([]);
  assert.strictEqual(isoLocalDate(new Date('2026-11-10T00:00:00')), '2026-11-10');
  assert.strictEqual(isoLocalDate(new Date('2026-07-01T00:30:00')), '2026-07-01');
});

test('getEffectiveDueDate subtracts exactly the buffer in Norwegian time', () => {
  const { getEffectiveDueDate } = load([], { ny: 3, viderebehandling: 2 });
  assert.strictEqual(getEffectiveDueDate('2026-11-10', { status: 'ny' }), '2026-11-07');
  assert.strictEqual(getEffectiveDueDate('2026-07-15', { status: 'viderebehandling' }), '2026-07-13');
  // Over sommertidsskiftet
  assert.strictEqual(getEffectiveDueDate('2026-10-27', { status: 'ny' }), '2026-10-24');
});

// ── tlDueOffset / timelineRange ─────────────────────────────────────────────

test('tlDueOffset measures to 16:00 on the due date', () => {
  const { tlDueOffset } = load(['tlDueOffset']);
  const now = new Date('2026-11-10T04:00:00');
  assert.strictEqual(tlDueOffset('2026-11-10', now), 0.5);
  assert.strictEqual(tlDueOffset('2026-11-12', now), 2.5);
});

test('timelineRange draws a work window ending at the buffered deadline', () => {
  const { timelineRange } = load(['timelineRange', 'tlDueOffset'], { ny: 3, viderebehandling: 0 });
  const now = new Date('2026-11-01T16:00:00');
  const r = timelineRange({ id: 'a', caseNumber: 'A', status: 'ny', dueDate: '2026-11-21' }, now, 365, 180);
  assert.strictEqual(r.end, 17);         // 21. minus 3 dagers buffer = 18., 17 dager fram
  assert.strictEqual(r.actualEnd, 20);
  assert.strictEqual(r.start, 3);        // 14 dagers vindu
  assert.strictEqual(r.hasBuffer, true);
  assert.strictEqual(r.isOverdue, false);
  assert.strictEqual(r.isMilestone, false);
});

test('timelineRange stretches the work window back past weekends', () => {
  const weekend = (d) => d.getDay() === 0 || d.getDay() === 6;
  const { timelineRange } = load(['timelineRange', 'tlDueOffset'], { ny: 0, viderebehandling: 0 }, weekend);
  // Søn. 1.11.2026 kl. 16; frist fre. 20.11; 14 arbeidsdager = tir. 3.11–fre. 20.11
  const now = new Date('2026-11-01T16:00:00');
  const r = timelineRange({ id: 'a', caseNumber: 'A', status: 'ny', dueDate: '2026-11-20' }, now, 365, 180);
  assert.strictEqual(r.end, 19);
  assert.strictEqual(r.windowStart, '2026-11-03');
  assert.strictEqual(r.start, 1);         // arbeidsslutt dagen før 3.11
});

test('timelineRange marks overdue cases and keeps their real end beyond the past window', () => {
  const { timelineRange } = load(['timelineRange', 'tlDueOffset']);
  const now = new Date('2026-11-01T16:00:00');
  const r = timelineRange({ id: 'a', status: 'ny', dueDate: '2026-01-01' }, now, 365, 180);
  assert.strictEqual(r.isOverdue, true);
  assert.ok(r.end < -180, 'end is not clamped to the past window');
  assert.strictEqual(r.start, -180);
});

test('timelineRange draws fristarkiv as a milestone without buffer', () => {
  const { timelineRange } = load(['timelineRange', 'tlDueOffset'], { ny: 3, viderebehandling: 3 });
  const now = new Date('2026-11-01T16:00:00');
  const r = timelineRange({ id: 'a', status: 'fristarkiv', dueDate: '2026-11-11' }, now, 365, 180);
  assert.strictEqual(r.isMilestone, true);
  assert.strictEqual(r.hasBuffer, false);
  assert.strictEqual(r.end - r.start, 1);
});

test('timelineRange clamps the end to the horizon', () => {
  const { timelineRange } = load(['timelineRange', 'tlDueOffset']);
  const now = new Date('2026-11-01T16:00:00');
  const r = timelineRange({ id: 'a', status: 'ny', dueDate: '2028-01-01' }, now, 365, 180);
  assert.strictEqual(r.end, 365);
});

// ── timelineLeadDays ────────────────────────────────────────────────────────

const { timelineLeadDays, overdueLeftOf, timelineDayAtPx, timelineDragBuffer, timelineBarLabel, timelineDueInfo } = loadFunctions([
  'timelineLeadDays', 'overdueLeftOf', 'timelineDayAtPx', 'timelineDragBuffer', 'timelineBarLabel', 'timelineDueInfo',
], { vars: ['TL_LABEL_CHAR_PX', 'TL_LABEL_PAD_PX'] });

test('timelineLeadDays is 0 when nothing is overdue', () => {
  assert.strictEqual(timelineLeadDays([{ start: -5, end: 3, isOverdue: false }], 14), 0);
  assert.strictEqual(timelineLeadDays([], 14), 0);
});

test('timelineLeadDays reaches back far enough to show a recently overdue bar', () => {
  assert.strictEqual(timelineLeadDays([{ start: -3.2, end: -1.2, isOverdue: true }], 14), 5);
});

test('timelineLeadDays never reaches back further than the maximum', () => {
  assert.strictEqual(timelineLeadDays([{ start: -17, end: -3, isOverdue: true }], 14), 14);
});

test('timelineLeadDays ignores cases overdue for longer than the maximum — they go in the pin', () => {
  assert.strictEqual(timelineLeadDays([{ start: -54, end: -40, isOverdue: true }], 14), 0);
});

// ── overdueLeftOf / timelineDayAtPx ─────────────────────────────────────────

test('overdueLeftOf lists overdue cases ending left of a day, oldest first', () => {
  const ranges = [
    { id: 'a', end: -3, isOverdue: true },
    { id: 'b', end: -200, isOverdue: true },
    { id: 'c', end: -20, isOverdue: true },
    { id: 'd', end: -30, isOverdue: false },
  ];
  assert.deepStrictEqual(overdueLeftOf(ranges, -10).map((r) => r.id), ['b', 'c']);
  assert.deepStrictEqual(overdueLeftOf(ranges, -500), []);
});

test('timelineDayAtPx converts a scroll position to a day offset from today', () => {
  assert.strictEqual(timelineDayAtPx(0, 10, 180), -180);
  assert.strictEqual(timelineDayAtPx(1800, 10, 180), 0);
  assert.strictEqual(timelineDayAtPx(1850, 10, 180), 5);
});

// ── timelineDragBuffer ──────────────────────────────────────────────────────

test('timelineDragBuffer: dragging left adds buffer, right removes it', () => {
  assert.strictEqual(timelineDragBuffer(3, -20, 10, 90), 5);
  assert.strictEqual(timelineDragBuffer(3, 10, 10, 90), 2);
  assert.strictEqual(timelineDragBuffer(3, 4, 10, 90), 3);
});

test('timelineDragBuffer stays between 0 and the maximum', () => {
  assert.strictEqual(timelineDragBuffer(3, 500, 10, 90), 0);
  assert.strictEqual(timelineDragBuffer(3, -5000, 10, 90), 90);
});

// ── timelineBarLabel ────────────────────────────────────────────────────────

test('timelineBarLabel shows the whole case number when it fits', () => {
  assert.strictEqual(timelineBarLabel('20261005', 200), '20261005');
});

test('timelineBarLabel keeps the distinguishing last digits when space is short', () => {
  const lbl = timelineBarLabel('20261005', 60);
  assert.ok(lbl.startsWith('…') && '20261005'.endsWith(lbl.slice(1)), lbl);
  assert.ok(lbl.length >= 5);
});

test('timelineBarLabel shows nothing when not even four digits fit', () => {
  assert.strictEqual(timelineBarLabel('20261005', 30), '');
  assert.strictEqual(timelineBarLabel('', 200), '');
});

// ── timelineDueInfo ─────────────────────────────────────────────────────────

test('timelineDueInfo shows the real deadline and the countdown', () => {
  assert.strictEqual(timelineDueInfo('07.11.2026', '', 8, 6), 'frist 07.11.2026 · 8d · 6 arb.dager');
});

test('timelineDueInfo also names the buffered deadline the countdown is measured to', () => {
  assert.strictEqual(timelineDueInfo('07.11.2026', '04.11.2026', 9, 7), 'frist 07.11.2026 · buffret til 04.11.2026 · 9d · 7 arb.dager');
});

test('timelineDueInfo words today and overdue', () => {
  assert.strictEqual(timelineDueInfo('07.11.2026', '', 0, 0), 'frist 07.11.2026 · i dag · 0 arb.dager');
  assert.strictEqual(timelineDueInfo('07.11.2026', '', -3, null), 'frist 07.11.2026 · 3d forfalt');
});
