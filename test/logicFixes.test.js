'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

// Objekter fra sandkassen har en annen Object-prototype; kopier før deepStrictEqual.
const plain = (v) => JSON.parse(JSON.stringify(v));

// ── Kravtreet: prikkfarge ─────────────────────────────────────
const { claimDotClass } = loadFunctions(['claimDotClass', 'effectiveClaimValue', 'getClaimCascadeValue']);

function claim(num, over) {
  return Object.assign({ num: num, dep: null, novelty: null, inventive: null, formal: null }, over);
}

// Regression: novelty ✓ with inventive step not yet assessed used to show red.
test('claimDotClass shows a claim with unassessed inventive step as unassessed', () => {
  const claims = [claim(1, { novelty: true })];
  assert.strictEqual(claimDotClass(claims[0], claims), 'kt-dot-null');
});

test('claimDotClass colours assessed claims by their result', () => {
  const c = (over) => { const cs = [claim(1, over)]; return claimDotClass(cs[0], cs); };
  assert.strictEqual(c({}), 'kt-dot-null');
  assert.strictEqual(c({ novelty: false, inventive: false }), 'kt-dot-no');
  assert.strictEqual(c({ novelty: true, inventive: false }), 'kt-dot-no');
  assert.strictEqual(c({ novelty: true, inventive: true }), 'kt-dot-ok');
  assert.strictEqual(c({ novelty: true, inventive: true, formal: true }), 'kt-dot-formal');
});

test('claimDotClass follows the cascade from the parent claim', () => {
  const claims = [claim(1, { novelty: true, inventive: true }), claim(2, { dep: 1 })];
  assert.strictEqual(claimDotClass(claims[1], claims), 'kt-dot-ok');
});

// ── Prognosen i Statistikk ────────────────────────────────────
const { forecastByMonth } = loadFunctions(['forecastByMonth', 'isUnassigned', 'canBeUnassigned']);
const due = (c) => c.dueDate;
const today = new Date(2026, 9, 15);

// Regression: Fristarkiv (the applicant's deadline), Viderebehandling and
// unassigned cases were counted as future nybehandlinger.
test('forecastByMonth counts only Ny cases that are yours', () => {
  const list = [
    { status: 'ny', type: 'sak', dueDate: '2026-11-10' },
    { status: 'ny', type: 'sak', dueDate: '2026-11-20', unassigned: true },
    { status: 'fristarkiv', type: 'sak', dueDate: '2026-11-10' },
    { status: 'viderebehandling', type: 'sak', dueDate: '2026-11-10' },
    { status: 'ny', type: 'oppdrag', dueDate: '2026-11-10' },
    { status: 'avsluttet', type: 'sak', dueDate: '2026-11-10' },
  ];
  assert.deepStrictEqual(plain(forecastByMonth(list, 2026, today, due)), { 10: 1 });
});

test('forecastByMonth puts overdue Ny cases in the current month and skips other years', () => {
  const list = [
    { status: 'ny', type: 'sak', dueDate: '2026-09-01' },
    { status: 'ny', type: 'sak', dueDate: '2027-01-10' },
    { status: 'ny', type: 'sak', dueDate: '2026-12-01' },
  ];
  assert.deepStrictEqual(plain(forecastByMonth(list, 2026, today, due)), { 9: 1, 11: 1 });
  assert.deepStrictEqual(plain(forecastByMonth(list, 2025, today, due)), {});
});

test('forecastByMonth uses the due date it is given (the buffered one)', () => {
  const list = [{ status: 'ny', type: 'sak', dueDate: '2026-12-03' }];
  assert.deepStrictEqual(plain(forecastByMonth(list, 2026, today, () => '2026-11-28')), { 10: 1 });
});

// ── Omlasting på en saksside ──────────────────────────────────
const { initialHistoryEntry } = loadFunctions(['initialHistoryEntry']);

// Regression: init rewrote the URL to «#sak», so a reload lost the case.
test('initialHistoryEntry keeps the case and medlesing in the URL', () => {
  assert.deepStrictEqual(plain(initialHistoryEntry('sak', 'id1', null, 'sak/20260001')),
    { page: 'sak', state: { page: 'sak', sakId: 'id1' }, url: '#sak/20260001' });
  assert.deepStrictEqual(plain(initialHistoryEntry('medlesing', null, 'm1', 'medlesing/m1')),
    { page: 'medlesing', state: { page: 'medlesing', medlesingId: 'm1' }, url: '#medlesing/m1' });
});

test('initialHistoryEntry falls back to Hjem for an unknown case and uses the page slugs', () => {
  assert.deepStrictEqual(plain(initialHistoryEntry('sak', null, null, 'sak/finnes-ikke')),
    { page: 'hjem', state: { page: 'hjem' }, url: '#hjem' });
  assert.deepStrictEqual(plain(initialHistoryEntry('avsluttet', null, null, 'alle-saker')),
    { page: 'avsluttet', state: { page: 'avsluttet' }, url: '#alle-saker' });
  assert.deepStrictEqual(plain(initialHistoryEntry('medlesing', null, null, 'medlesing')),
    { page: 'medlesing', state: { page: 'medlesing' }, url: '#medlesing' });
});

// ── Angre ─────────────────────────────────────────────────────
const { casesAfterUndo, statsLogAfterUndo } = loadFunctions(['casesAfterUndo', 'statsLogAfterUndo']);

// Regression: undo restored the whole case list, so edits to other cases made
// while the «Angre» toast was showing were lost.
test('casesAfterUndo reverts only the fields the action changed, on that case', () => {
  const current = [
    { id: 'a', status: 'fristarkiv', tags: 'x', notes: 'edited after' },
    { id: 'b', status: 'ny', notes: 'edited in the meantime' },
  ];
  const snap = { mode: 'patch', caseId: 'a', before: { status: 'ny', tags: '' } };
  assert.deepStrictEqual(plain(casesAfterUndo(current, snap)), [
    { id: 'a', status: 'ny', tags: '', notes: 'edited after' },
    { id: 'b', status: 'ny', notes: 'edited in the meantime' },
  ]);
});

test('casesAfterUndo puts a deleted case back where it was', () => {
  const current = [{ id: 'a' }, { id: 'c' }];
  const snap = { mode: 'reinsert', caseId: 'b', index: 1, before: { id: 'b', title: 'B' } };
  assert.deepStrictEqual(plain(casesAfterUndo(current, snap)).map((c) => c.id), ['a', 'b', 'c']);
  assert.deepStrictEqual(plain(casesAfterUndo([], snap)).map((c) => c.id), ['b']);
});

test('casesAfterUndo leaves the list alone when there is nothing to undo', () => {
  const current = [{ id: 'a', status: 'ny' }];
  assert.strictEqual(casesAfterUndo(current, { mode: 'patch', caseId: 'gone', before: { status: 'x' } }), current);
  assert.strictEqual(casesAfterUndo(current, { mode: 'reinsert', caseId: 'a', index: 0, before: { id: 'a' } }), current);
});

test('statsLogAfterUndo removes only the entries the action wrote', () => {
  const log = [{ id: '1', type: 'ny' }, { id: '2', type: 'videre' }, { id: '3', type: 'ny' }];
  assert.deepStrictEqual(plain(statsLogAfterUndo(log, ['2'])).map((e) => e.id), ['1', '3']);
  assert.deepStrictEqual(plain(statsLogAfterUndo(log, [])).map((e) => e.id), ['1', '2', '3']);
});

// ── Foreslått frist ved månedsslutt ───────────────────────────
const { addMonthsClamped } = loadFunctions(['addMonthsClamped', 'isoLocalDate']);

// Regression: 31 August + 6 months gave 3 March.
test('addMonthsClamped stops at the last day of a shorter month', () => {
  assert.strictEqual(addMonthsClamped(new Date(2026, 7, 31), 6), '2027-02-28');
  assert.strictEqual(addMonthsClamped(new Date(2027, 7, 31), 6), '2028-02-29');
  assert.strictEqual(addMonthsClamped(new Date(2026, 4, 31), 6), '2026-11-30');
  assert.strictEqual(addMonthsClamped(new Date(2026, 9, 29), 3), '2027-01-29');
  assert.strictEqual(addMonthsClamped(new Date(2026, 9, 29), 6), '2027-04-29');
});

// ── Forklaringen «Faktisk frist» i tidslinjen ─────────────────
const { showBufferLegend } = loadFunctions(['showBufferLegend', 'bufferDaysFor', 'bufferAppliesTo', 'typeBufferFor'],
  { globals: { typeBuffers: { ny: 0, viderebehandling: 0 } } });

// Regression: the legend was decided once at startup.
test('showBufferLegend shows the legend when any active case has a buffer', () => {
  assert.strictEqual(showBufferLegend([{ status: 'ny', type: 'sak', dueDate: '2026-12-01' }]), false);
  assert.strictEqual(showBufferLegend([{ status: 'ny', type: 'sak', dueDate: '2026-12-01', caseBuffer: 3 }]), true);
  assert.strictEqual(showBufferLegend([{ status: 'fristarkiv', type: 'sak', dueDate: '2026-12-01', caseBuffer: 3 }]), false);
  assert.strictEqual(showBufferLegend([{ status: 'avsluttet', type: 'sak', dueDate: '2026-12-01', caseBuffer: 3 }]), false);
});

test('showBufferLegend shows the legend when a default buffer is set', () => {
  const { showBufferLegend: withDefault } = loadFunctions(['showBufferLegend', 'bufferDaysFor', 'bufferAppliesTo', 'typeBufferFor'],
    { globals: { typeBuffers: { ny: 2, viderebehandling: 0 } } });
  assert.strictEqual(withDefault([{ status: 'ny', type: 'sak', dueDate: '2026-12-01' }]), true);
  assert.strictEqual(withDefault([]), false);
});

// ── Import: mål og belegg-horisont valideres ──────────────────
const { readImportSettings } = loadFunctions(
  ['readImportSettings', 'isValidChecklistTemplate', 'normalizeHomeDeadlineFilter', 'defaultHomeDeadlineFilter', 'normalizeActiveCase'],
  { vars: ['HOME_DEADLINE_KINDS', 'HOME_DEADLINE_HORIZONS'] }
);

// Regression: any truthy beleggHorizon was taken as is, e.g. 45 or "90".
test('readImportSettings takes the belegg horizon only when it is 30, 60 or 90', () => {
  assert.strictEqual(readImportSettings({ beleggHorizon: 90 }).beleggHorizon, 90);
  assert.ok(!('beleggHorizon' in readImportSettings({ beleggHorizon: 45 })));
  assert.ok(!('beleggHorizon' in readImportSettings({ beleggHorizon: '90' })));
  assert.ok(!('beleggHorizon' in readImportSettings({})));
});

test('readImportSettings takes the production goal only when it is a whole number of 0 or more', () => {
  assert.strictEqual(readImportSettings({ goal: 70 }).goal, 70);
  assert.strictEqual(readImportSettings({ goal: 0 }).goal, 0);
  assert.ok(!('goal' in readImportSettings({ goal: -5 })));
  assert.ok(!('goal' in readImportSettings({ goal: 1.5 })));
  assert.ok(!('goal' in readImportSettings({ goal: NaN })));
});
