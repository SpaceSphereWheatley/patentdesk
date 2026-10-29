'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const {
  timelineLaneGeometry, visibleLaneCount, timelineOverdueBands, timelineDragChip, timelineKeyBuffer
} = loadFunctions(
  ['timelineLaneGeometry', 'visibleLaneCount', 'timelineOverdueBands', 'timelineDragChip', 'timelineKeyBuffer'],
  { vars: ['TL_LANE'] }
);
const plain = (v) => JSON.parse(JSON.stringify(v));

// ── Punkt 3: radhøyde etter det som er synlig ──────────────────────────────

test('timelineLaneGeometry gives one lane full-height bars', () => {
  assert.deepStrictEqual(plain(timelineLaneGeometry(1, 0)), { barH: 40, contentH: 40, bandsH: 0, trackH: 48 });
});

test('timelineLaneGeometry stacks several lanes as narrow bars', () => {
  // 3 × 18 + 2 × 3 = 60
  assert.deepStrictEqual(plain(timelineLaneGeometry(3, 0)), { barH: 18, contentH: 60, bandsH: 0, trackH: 68 });
});

test('timelineLaneGeometry makes room for overdue bands below the bars', () => {
  // To bånd: 2 × 5 + 1 × 2 + 3 luft over = 15
  assert.deepStrictEqual(plain(timelineLaneGeometry(1, 2)), { barH: 40, contentH: 40, bandsH: 15, trackH: 63 });
});

test('timelineLaneGeometry treats zero lanes as one', () => {
  assert.strictEqual(timelineLaneGeometry(0, 0).trackH, 48);
});

const R = [
  { start: 0, end: 14, row: 0 },
  { start: 250, end: 264, row: 0 },
  { start: 251, end: 265, row: 1 },
  { start: 252, end: 266, row: 2 },
  { start: 253, end: 267, row: 3 },
];

test('visibleLaneCount only counts the lanes used inside the view', () => {
  assert.strictEqual(visibleLaneCount(R, -14, 90), 1);
  assert.strictEqual(visibleLaneCount(R, 200, 300), 4);
  // Bare den øverste av klyngen er så vidt inne i bildet
  assert.strictEqual(visibleLaneCount(R, 100, 250.5), 1);
});

test('visibleLaneCount is at least one, also with nothing in view', () => {
  assert.strictEqual(visibleLaneCount(R, 30, 60), 1);
  assert.strictEqual(visibleLaneCount([], 0, 90), 1);
});

// ── Punkt 2: forfalt-båndet ────────────────────────────────────────────────

const overdueNy = { id: 'a', caseNumber: 'A', isOverdue: true, isOppdrag: false, unassigned: false, status: 'ny' };

test('timelineOverdueBands merges the penalty days into runs', () => {
  // Tor, fre, man → [0, 2) og [4, 5)
  const bands = timelineOverdueBands([overdueNy], [0, 1, 4]);
  assert.deepStrictEqual(plain(bands), [{ id: 'a', caseNumber: 'A', segments: [[0, 2], [4, 5]] }]);
});

test('timelineOverdueBands gives every overdue case its own band on the same days, as the belegg does', () => {
  const b = Object.assign({}, overdueNy, { id: 'b', caseNumber: 'B', status: 'viderebehandling' });
  const bands = timelineOverdueBands([overdueNy, b], [0, 1, 2]);
  assert.deepStrictEqual(plain(bands).map((x) => x.segments), [[[0, 3]], [[0, 3]]]);
});

test('timelineOverdueBands leaves out cases the belegg does not charge', () => {
  const rs = [
    Object.assign({}, overdueNy, { isOverdue: false }),
    Object.assign({}, overdueNy, { isOppdrag: true }),
    Object.assign({}, overdueNy, { unassigned: true }),
    Object.assign({}, overdueNy, { status: 'fristarkiv' }),
  ];
  assert.deepStrictEqual(plain(timelineOverdueBands(rs, [0, 1, 2])), []);
});

test('timelineOverdueBands draws nothing when there are no penalty days', () => {
  assert.deepStrictEqual(plain(timelineOverdueBands([overdueNy], [])), []);
});

// ── Punkt 5: drag og tastatur ───────────────────────────────────────────────

test('timelineDragChip shows the old and new buffer and the dates it gives', () => {
  assert.deepStrictEqual(plain(timelineDragChip(5, 8, 0, '3.12.2026', '11.12.2026')), {
    head: 'Buffer 5 → 8 dager',
    sub:  'buffret til 3.12.2026 · frist 11.12.2026'
  });
});

test('timelineDragChip says when the buffer lands on the standard for the type', () => {
  assert.strictEqual(timelineDragChip(5, 2, 2, '9.12.2026', '11.12.2026').head, 'Buffer 5 → 2 dager · standard');
});

test('timelineDragChip uses the singular and drops the buffer date at zero', () => {
  assert.deepStrictEqual(plain(timelineDragChip(2, 1, 0, '10.12.2026', '11.12.2026')).head, 'Buffer 2 → 1 dag');
  assert.deepStrictEqual(plain(timelineDragChip(2, 0, 3, '11.12.2026', '11.12.2026')).sub, 'frist 11.12.2026');
});

test('timelineKeyBuffer: left moves the bar earlier (more buffer), right later', () => {
  assert.strictEqual(timelineKeyBuffer(5, 'ArrowLeft', 90), 6);
  assert.strictEqual(timelineKeyBuffer(5, 'ArrowRight', 90), 4);
});

test('timelineKeyBuffer stays within 0 and max, and ignores other keys', () => {
  assert.strictEqual(timelineKeyBuffer(0, 'ArrowRight', 90), 0);
  assert.strictEqual(timelineKeyBuffer(90, 'ArrowLeft', 90), 90);
  assert.strictEqual(timelineKeyBuffer(5, 'ArrowUp', 90), null);
});

// ── Røde dager som henger sammen, tegnes som ett felt ──────────────────────

const { holidayRuns } = loadFunctions(['holidayRuns']);

test('holidayRuns merges consecutive days off into one block', () => {
  // Julaften–2. juledag og nyttårsaften–nyttårsdag
  assert.deepStrictEqual(plain(holidayRuns([56, 57, 58, 63, 64])), [[56, 59], [63, 65]]);
});

test('holidayRuns keeps a single holiday as a one-day block, in any input order', () => {
  assert.deepStrictEqual(plain(holidayRuns([10, -3, 9])), [[-3, -2], [9, 11]]);
});

test('holidayRuns ignores duplicates and gives nothing for no holidays', () => {
  assert.deepStrictEqual(plain(holidayRuns([4, 4, 5])), [[4, 6]]);
  assert.deepStrictEqual(plain(holidayRuns([])), []);
});

// ── Popup for røde dager ────────────────────────────────────────────────────

const { holidayLabel } = loadFunctions(['holidayLabel']);

test('holidayLabel names a single holiday', () => {
  assert.strictEqual(holidayLabel(['Grunnlovsdagen']), 'Grunnlovsdagen');
});

test('holidayLabel lists several holidays with «og» before the last', () => {
  assert.strictEqual(holidayLabel(['Nyttårsaften', 'Nyttårsdag']), 'Nyttårsaften og Nyttårsdag');
  assert.strictEqual(holidayLabel(['Julaften', '1. juledag', '2. juledag']), 'Julaften, 1. juledag og 2. juledag');
});

test('holidayLabel falls back to «Rød dag» without names', () => {
  assert.strictEqual(holidayLabel([]), 'Rød dag');
  assert.strictEqual(holidayLabel(null), 'Rød dag');
});
