'use strict';
// Utsatt viderebehandling: en viderebehandling kan legges etter fristen i
// arbeidsplanen (negativ buffer). Fristen flytter seg ikke — saken er forfalt
// fra den faktiske fristen — men belegget og bjelken følger planen.
process.env.TZ = 'Europe/Oslo';

const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const DUE_DEPS = ['isoLocalDate', 'getEffectiveDueDate', 'effDueFor', 'bufferAppliesTo', 'typeBufferFor',
  'bufferDaysFor', 'canPostpone', 'postponedDaysFor', 'deadlineFor'];

function load(names, opts) {
  opts = opts || {};
  return loadFunctions(names.concat(DUE_DEPS), {
    vars: (opts.vars || []).concat(['POSTPONE_WARN_DAYS']),
    globals: Object.assign({
      typeBuffers: { ny: 0, viderebehandling: 0 },
      isNonWorkday: () => false,
      workWindows: { ny: 10, viderebehandling: 3, oppdrag: 2 },
    }, opts.globals || {}),
  });
}

const plain = (o) => JSON.parse(JSON.stringify(o));

const vb = (extra) => Object.assign({ id: 'v', caseNumber: 'V', type: 'sak', status: 'viderebehandling', dueDate: '2026-11-04' }, extra);
const ny = (extra) => Object.assign({ id: 'n', caseNumber: 'N', type: 'sak', status: 'ny', dueDate: '2026-11-04' }, extra);

// ── Hvem kan utsettes ───────────────────────────────────────────────────────

test('canPostpone: only Viderebehandling, never Ny, Fristarkiv or oppdrag', () => {
  const { canPostpone } = load([]);
  assert.strictEqual(canPostpone(vb()), true);
  assert.strictEqual(canPostpone(ny()), false);
  assert.strictEqual(canPostpone(vb({ status: 'fristarkiv' })), false);
  assert.strictEqual(canPostpone(vb({ type: 'oppdrag' })), false);
  assert.strictEqual(canPostpone(null), false);
});

test('minBufferFor: no lower limit for Viderebehandling, 0 for the rest', () => {
  const { minBufferFor } = load(['minBufferFor']);
  assert.strictEqual(minBufferFor(vb()), -Infinity);
  assert.strictEqual(minBufferFor(ny()), 0);
});

// ── Planen og fristen ───────────────────────────────────────────────────────

test('a negative buffer on Viderebehandling moves the plan after the deadline', () => {
  const { effDueFor, postponedDaysFor, deadlineFor } = load([]);
  const c = vb({ caseBuffer: -2 });
  assert.strictEqual(effDueFor(c), '2026-11-06');
  assert.strictEqual(postponedDaysFor(c), 2);
  // Fristen flytter seg ikke
  assert.strictEqual(deadlineFor(c), '2026-11-04');
});

test('a negative buffer is ignored where postponing is not allowed', () => {
  const { effDueFor, bufferDaysFor, postponedDaysFor, deadlineFor } = load([]);
  const c = ny({ caseBuffer: -2 });
  assert.strictEqual(bufferDaysFor(c), 0);
  assert.strictEqual(effDueFor(c), '2026-11-04');
  assert.strictEqual(postponedDaysFor(c), 0);
  assert.strictEqual(deadlineFor(c), '2026-11-04');
});

test('deadlineFor keeps the buffered date when the case is not postponed', () => {
  const { deadlineFor, postponedDaysFor } = load([], { globals: { typeBuffers: { ny: 3, viderebehandling: 1 } } });
  assert.strictEqual(deadlineFor(ny()), '2026-11-01');
  assert.strictEqual(deadlineFor(vb()), '2026-11-03');
  assert.strictEqual(postponedDaysFor(vb()), 0);
});

// ── Tidslinjen ──────────────────────────────────────────────────────────────

const TL = ['timelineRange', 'tlDueOffset', 'timelineSpanDays', 'timelineBarStart', 'workWindowDays',
  'workWindowStart', 'isUnassigned', 'canBeUnassigned'];

test('timelineRange draws a postponed case where it is planned, and overdue from the real deadline', () => {
  const { timelineRange } = load(TL, { vars: ['MILESTONE_DAYS'] });
  // Frist 28.10, planlagt 12.11; i dag 30.10
  const now = new Date('2026-10-30T10:00:00');
  const r = timelineRange(vb({ dueDate: '2026-10-28', caseBuffer: -15 }), now, 90, 30);
  assert.strictEqual(r.effDue, '2026-11-12');
  assert.ok(r.end > 0, 'the bar ends in the future');
  assert.ok(r.actualEnd < 0, 'the real deadline is in the past');
  assert.strictEqual(r.postponed, 15);
  assert.strictEqual(r.isOverdue, true, 'forfalt from the real deadline');
  assert.strictEqual(r.planOverdue, false, 'the plan is still ahead, so the belegg is not penalised');
});

test('timelineRange: a postponed case whose real deadline is ahead is neither overdue nor plan-overdue', () => {
  const { timelineRange } = load(TL, { vars: ['MILESTONE_DAYS'] });
  const now = new Date('2026-10-30T10:00:00');
  const r = timelineRange(vb({ caseBuffer: -2 }), now, 90, 30);
  assert.strictEqual(r.postponed, 2);
  assert.strictEqual(r.isOverdue, false);
  assert.strictEqual(r.planOverdue, false);
  assert.ok(r.actualEnd < r.end);
});

test('timelineRange: a case whose plan has passed is both overdue and plan-overdue', () => {
  const { timelineRange } = load(TL, { vars: ['MILESTONE_DAYS'] });
  const now = new Date('2026-11-20T10:00:00');
  const r = timelineRange(vb({ caseBuffer: -2 }), now, 90, 30);
  assert.strictEqual(r.isOverdue, true);
  assert.strictEqual(r.planOverdue, true);
});

test('timelineOverdueBands follows the plan, not the real deadline', () => {
  const { timelineOverdueBands } = loadFunctions(['timelineOverdueBands']);
  const base = { id: 'a', caseNumber: 'A', isOppdrag: false, unassigned: false, status: 'viderebehandling' };
  const postponed = Object.assign({}, base, { isOverdue: true, planOverdue: false });
  const late      = Object.assign({}, base, { id: 'b', isOverdue: true, planOverdue: true });
  assert.deepStrictEqual(plain(timelineOverdueBands([postponed, late], [0, 1, 2])).map((b) => b.id), ['b']);
});

// ── Drag og tastatur ────────────────────────────────────────────────────────

test('timelineDragBuffer goes below 0 only when a lower limit is given', () => {
  const { timelineDragBuffer } = loadFunctions(['timelineDragBuffer']);
  assert.strictEqual(timelineDragBuffer(0, 50, 10, 90), 0);
  assert.strictEqual(timelineDragBuffer(0, 50, 10, 90, 0), 0);
  assert.strictEqual(timelineDragBuffer(0, 50, 10, 90, -Infinity), -5);
  assert.strictEqual(timelineDragBuffer(-5, -20, 10, 90, -Infinity), -3);
});

test('timelineKeyBuffer goes below 0 only when a lower limit is given', () => {
  const { timelineKeyBuffer } = loadFunctions(['timelineKeyBuffer']);
  assert.strictEqual(timelineKeyBuffer(0, 'ArrowRight', 90), 0);
  assert.strictEqual(timelineKeyBuffer(0, 'ArrowRight', 90, -Infinity), -1);
  assert.strictEqual(timelineKeyBuffer(-1, 'ArrowLeft', 90, -Infinity), 0);
});

const { timelineDragChip } = loadFunctions(['timelineDragChip', 'bufferWord'], { vars: ['POSTPONE_WARN_DAYS'] });

test('timelineDragChip says how far after the deadline the case is planned', () => {
  assert.deepStrictEqual(plain(timelineDragChip(0, -2, 0, '6.11.2026', '4.11.2026')), {
    head: 'Buffer 0 → utsatt 2 dager',
    sub:  'planlagt 6.11.2026 · frist 4.11.2026',
    warn: false
  });
  assert.strictEqual(timelineDragChip(-2, 1, 0, '3.11.2026', '4.11.2026').head, 'Buffer utsatt 2 → 1 dag');
  assert.strictEqual(timelineDragChip(0, -1, 0, '5.11.2026', '4.11.2026').head, 'Buffer 0 → utsatt 1 dag');
});

test('timelineDragChip warns once the case is postponed more than two weeks', () => {
  assert.strictEqual(timelineDragChip(0, -14, 0, '18.11.2026', '4.11.2026').warn, false);
  const t = timelineDragChip(0, -18, 0, '22.11.2026', '4.11.2026');
  assert.strictEqual(t.warn, true);
  assert.strictEqual(t.sub, 'Over 14 dager etter fristen · planlagt 22.11.2026');
});

test('timelineDragChip explains why Ny stops at the deadline', () => {
  const t = timelineDragChip(3, 0, 0, '4.11.2026', '4.11.2026', true);
  assert.strictEqual(t.sub, 'Bare viderebehandling kan flyttes etter fristen');
});

// ── Sakssiden og Rediger sak ────────────────────────────────────────────────

test('caseBufferLabel names a postponement', () => {
  const { caseBufferLabel } = loadFunctions(['caseBufferLabel', 'typeBufferFor'], {
    globals: { typeBuffers: { ny: 0, viderebehandling: 0 } },
  });
  assert.strictEqual(caseBufferLabel(vb({ caseBuffer: -2 })), 'utsatt 2 dager · egen');
  assert.strictEqual(caseBufferLabel(vb({ caseBuffer: -1 })), 'utsatt 1 dag · egen');
});

test('modalCaseBuffer keeps a negative value only for Viderebehandling', () => {
  const { modalCaseBuffer } = loadFunctions(['modalCaseBuffer']);
  const orig = { status: 'viderebehandling', caseBuffer: null };
  assert.strictEqual(modalCaseBuffer(orig, 'viderebehandling', '-2'), -2);
  assert.strictEqual(modalCaseBuffer({ status: 'ny', caseBuffer: null }, 'ny', '-2'), 0);
});

test('showBufferLegend also shows the real-deadline legend for a postponed case', () => {
  const { showBufferLegend } = load(['showBufferLegend']);
  assert.strictEqual(showBufferLegend([vb({ caseBuffer: -2 })]), true);
});

// ── Listene ─────────────────────────────────────────────────────────────────

test('postponePillHtml shows the planned date, and nothing when not postponed', () => {
  const { postponePillHtml } = load(['postponePillHtml', 'toDisplay'], {
    globals: { esc: (s) => String(s) },
  });
  assert.strictEqual(postponePillHtml(vb()), '');
  const html = postponePillHtml(vb({ caseBuffer: -2 }));
  assert.ok(html.includes('Utsatt til 2026.11.06'), html);
  assert.ok(html.includes('2 dager etter fristen'), html);
});

test('timelineDueInfo counts down to the deadline and puts the plan last for a postponed case', () => {
  const { timelineDueInfo } = loadFunctions(['timelineDueInfo']);
  assert.strictEqual(timelineDueInfo('2026.10.28', '2026.11.12', -2, 0, 15),
    'frist 2026.10.28 · 2d forfalt · 0 arb.dager · planlagt 2026.11.12 (+15 d)');
  assert.strictEqual(timelineDueInfo('2026.11.10', '2026.11.07', 8, 6),
    'frist 2026.11.10 · buffret til 2026.11.07 · 8d · 6 arb.dager');
});

test('assignTimelineRows keeps a postponed case off the row its deadline line would cross', () => {
  const { assignTimelineRows } = loadFunctions(['assignTimelineRows', 'timelineRowPriority']);
  const rows = assignTimelineRows([
    { id: 'n', status: 'ny', start: -4, end: 7 },
    { id: 'v', status: 'viderebehandling', start: 10, end: 13, laneStart: -2 },
  ]).ranges;
  assert.notStrictEqual(rows[0].row, rows[1].row);
});

test('timelineRange gives a postponed case a lane from its real deadline', () => {
  const { timelineRange } = load(TL, { vars: ['MILESTONE_DAYS'] });
  const now = new Date('2026-10-30T10:00:00');
  const r = timelineRange(vb({ dueDate: '2026-10-28', caseBuffer: -15 }), now, 90, 30);
  assert.strictEqual(r.laneStart, r.actualEnd);
  assert.strictEqual(timelineRange(vb(), now, 90, 30).laneStart, null);
});
