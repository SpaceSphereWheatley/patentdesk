'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const {
  canBeUnassigned, isUnassigned, unassignedPatch, normalizeUnassignedReminder,
  unassignedWaitDays, isUnassignedStale, countsAsPotentialBelegg, countsInBelegg,
  canBeActiveCase, pipelineCounts, statusChangePatch, readImportSettings, caseCountText,
  UNASSIGNED_REMINDER_DEFAULT,
} = loadFunctions(
  ['canBeUnassigned', 'isUnassigned', 'unassignedPatch', 'normalizeUnassignedReminder',
   'unassignedWaitDays', 'isUnassignedStale', 'countsAsPotentialBelegg', 'countsInBelegg',
   'canBeActiveCase', 'caseCountText', 'pipelineCounts', 'examinationRound', 'closedDate', 'statusChangePatch',
   'normaliseOutcome', 'readImportSettings', 'isValidChecklistTemplate', 'normalizeHomeDeadlineFilter',
   'defaultHomeDeadlineFilter', 'normalizeActiveCase', 'normalizeTypeBuffers', 'normalizeWorkWindows'],
  { vars: ['UNASSIGNED_REMINDER_DEFAULT', 'UNASSIGNED_REMINDER_MAX', 'OUTCOMES', 'HOME_DEADLINE_KINDS',
           'HOME_DEADLINE_HORIZONS', 'TYPE_BUFFER_DEFAULTS', 'TYPE_BUFFER_MAX', 'WORK_WINDOW_DEFAULTS', 'WORK_WINDOW_MAX'] }
);

function c(overrides) {
  return Object.assign({ id: 'a', caseNumber: 'NO20250001', status: 'ny', type: 'sak', title: 'T', dueDate: '2026-12-01' }, overrides);
}
const u = (overrides) => c(Object.assign({ unassigned: true, unassignedSince: '2026-10-01T09:00:00.000Z' }, overrides));

// ── canBeUnassigned / isUnassigned ──────────────────

// Du melder deg opp på nye søknader; når saken har gått videre er den din.
test('canBeUnassigned: only Ny søknader can wait for assignment', () => {
  assert.strictEqual(canBeUnassigned(c()), true);
  assert.strictEqual(canBeUnassigned(c({ status: 'viderebehandling' })), false);
  assert.strictEqual(canBeUnassigned(c({ status: 'fristarkiv' })), false);
  assert.strictEqual(canBeUnassigned(c({ status: 'avsluttet' })), false);
  assert.strictEqual(canBeUnassigned(c({ type: 'oppdrag' })), false);
  assert.strictEqual(canBeUnassigned(null), false);
});

test('isUnassigned: needs the flag and a Ny søknad', () => {
  assert.strictEqual(isUnassigned(u()), true);
  assert.strictEqual(isUnassigned(c()), false);
  assert.strictEqual(isUnassigned(c({ unassigned: 'yes' })), false);
});

// Et flagg som står igjen etter et statusbytte skal ikke gjøre saken grå.
test('isUnassigned: a leftover flag on a case that moved on is ignored', () => {
  assert.strictEqual(isUnassigned(u({ status: 'fristarkiv' })), false);
  assert.strictEqual(isUnassigned(u({ type: 'oppdrag' })), false);
});

// ── unassignedPatch ─────────────────────────────────

test('unassignedPatch: marking stamps the time it was marked', () => {
  assert.deepStrictEqual({ ...unassignedPatch(c(), true, 'NOW') }, { unassigned: true, unassignedSince: 'NOW' });
});

// Å lagre «Rediger sak» på nytt skal ikke nullstille ventetiden.
test('unassignedPatch: re-saving an unassigned case keeps the original time', () => {
  assert.strictEqual(unassignedPatch(u(), true, 'NOW').unassignedSince, '2026-10-01T09:00:00.000Z');
});

test('unassignedPatch: confirming clears both fields', () => {
  assert.deepStrictEqual({ ...unassignedPatch(u(), false, 'NOW') }, { unassigned: false, unassignedSince: null });
});

test('unassignedPatch: cannot mark a case that is not a Ny søknad', () => {
  assert.strictEqual(unassignedPatch(c({ status: 'viderebehandling' }), true, 'NOW').unassigned, false);
  assert.strictEqual(unassignedPatch(c({ type: 'oppdrag' }), true, 'NOW').unassigned, false);
});

// ── Påminnelse ──────────────────────────────────────

test('normalizeUnassignedReminder: whole days 0..365, default otherwise', () => {
  assert.strictEqual(UNASSIGNED_REMINDER_DEFAULT, 14);
  assert.strictEqual(normalizeUnassignedReminder(0), 0);
  assert.strictEqual(normalizeUnassignedReminder(21), 21);
  assert.strictEqual(normalizeUnassignedReminder(7.9), 7);
  assert.strictEqual(normalizeUnassignedReminder(-1), 14);
  assert.strictEqual(normalizeUnassignedReminder(366), 14);
  assert.strictEqual(normalizeUnassignedReminder('10'), 14);
  assert.strictEqual(normalizeUnassignedReminder(null), 14);
});

test('unassignedWaitDays: calendar days since the case was marked', () => {
  assert.strictEqual(unassignedWaitDays(u(), '2026-10-01'), 0);
  assert.strictEqual(unassignedWaitDays(u(), '2026-10-15'), 14);
});

// Saker fra før feltet fantes, eller importert uten tidspunkt, måles fra opprettelsen.
test('unassignedWaitDays: falls back to createdAt, then to null', () => {
  assert.strictEqual(unassignedWaitDays(u({ unassignedSince: null, createdAt: '2026-10-05T12:00:00.000Z' }), '2026-10-15'), 10);
  assert.strictEqual(unassignedWaitDays(u({ unassignedSince: null }), '2026-10-15'), null);
});

test('isUnassignedStale: flags from the reminder day on', () => {
  assert.strictEqual(isUnassignedStale(u(), 14, '2026-10-14'), false);
  assert.strictEqual(isUnassignedStale(u(), 14, '2026-10-15'), true);
});

test('isUnassignedStale: 0 turns the reminder off', () => {
  assert.strictEqual(isUnassignedStale(u(), 0, '2027-10-15'), false);
});

test('isUnassignedStale: only unassigned cases, and only with a known start', () => {
  assert.strictEqual(isUnassignedStale(c(), 14, '2027-01-01'), false);
  assert.strictEqual(isUnassignedStale(u({ unassignedSince: null }), 14, '2027-01-01'), false);
});

// ── Belegg ──────────────────────────────────────────

// Belegget skal vise arbeid du faktisk har, ikke saker du kanskje får.
test('countsInBelegg: an unassigned case is not your work yet', () => {
  assert.strictEqual(countsInBelegg(u()), false);
  assert.strictEqual(countsInBelegg(c()), true);
});

test('countsAsPotentialBelegg: exactly the unassigned cases with a deadline', () => {
  assert.strictEqual(countsAsPotentialBelegg(u()), true);
  assert.strictEqual(countsAsPotentialBelegg(u({ dueDate: '' })), false);
  assert.strictEqual(countsAsPotentialBelegg(c()), false);
});

// ── Pågående sak ────────────────────────────────────

test('canBeActiveCase: a case you have not been given cannot be in progress', () => {
  assert.strictEqual(canBeActiveCase(u()), false);
  assert.strictEqual(canBeActiveCase(c()), true);
});

// ── Saksflyt på Oversikt ────────────────────────────

test('pipelineCounts: unassigned cases are counted apart from Ny', () => {
  const p = pipelineCounts([c({ id: '1' }), u({ id: '2' }), u({ id: '3' })], 2026, '2026-10-26');
  assert.strictEqual(p.ny, 1);
  assert.strictEqual(p.nyUnassigned, 2);
});

// ── Statusbytte ─────────────────────────────────────

test('statusChangePatch: moving a case on clears the unassigned flag', () => {
  const p = statusChangePatch('fristarkiv', null, null);
  assert.strictEqual(p.unassigned, false);
  assert.strictEqual(p.unassignedSince, null);
});

// ── Eksport/import ──────────────────────────────────

test('readImportSettings: reads a valid reminder, ignores a bad one or none', () => {
  assert.strictEqual(readImportSettings({ unassignedReminder: 0 }).unassignedReminder, 0);
  assert.strictEqual(readImportSettings({ unassignedReminder: 30 }).unassignedReminder, 30);
  assert.ok(!('unassignedReminder' in readImportSettings({ unassignedReminder: 'x' })));
  assert.ok(!('unassignedReminder' in readImportSettings({})));
});

// ── Telling i sidehodet ─────────────────────────────

test('caseCountText: unassigned cases are counted apart', () => {
  assert.strictEqual(caseCountText([c(), c(), u()], false), '2 saker · 1 ikke fordelt');
  assert.strictEqual(caseCountText([c()], false), '1 sak');
  assert.strictEqual(caseCountText([u()], false), '0 saker · 1 ikke fordelt');
});

test('caseCountText: the overview counts every case and notes the unassigned ones', () => {
  assert.strictEqual(caseCountText([c(), u()], true), '2 saker totalt · 1 ikke fordelt');
  assert.strictEqual(caseCountText([c()], true), '1 saker totalt');
});

// ── Standard for nye saker ──────────────────────────
test('new cases default to «ikke fordelt», both single and bulk', () => {
  const { extractFunctionSource } = require('./extractFunctions');
  const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'PatentDesk.html'), 'utf8');
  const { UNASSIGNED_NEW_DEFAULT } = loadFunctions([], { vars: ['UNASSIGNED_NEW_DEFAULT'] });
  assert.strictEqual(UNASSIGNED_NEW_DEFAULT, true);
  assert.match(extractFunctionSource(html, 'openModal'),
    /getElementById\('f-unassigned'\)\.checked = UNASSIGNED_NEW_DEFAULT/);
  assert.match(extractFunctionSource(html, '_modalSwitchTab'),
    /getElementById\('f-bulk-unassigned'\)\.checked = UNASSIGNED_NEW_DEFAULT/);
  // Redigering beholder sakens egen verdi
  assert.match(extractFunctionSource(html, 'openModal'),
    /getElementById\('f-unassigned'\)\.checked = isUnassigned\(c\)/);
});
