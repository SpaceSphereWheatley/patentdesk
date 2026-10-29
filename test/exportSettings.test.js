'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { readImportSettings, isValidChecklistTemplate } = loadFunctions(
  ['readImportSettings', 'isValidChecklistTemplate', 'normalizeHomeDeadlineFilter', 'defaultHomeDeadlineFilter', 'normalizeWorkWindows', 'migrateWorkWindowsToWorkdays', 'normalizeTypeBuffers'],
  { vars: ['HOME_DEADLINE_KINDS', 'HOME_DEADLINE_HORIZONS', 'WORK_WINDOW_DEFAULTS', 'WORK_WINDOW_MAX', 'TYPE_BUFFER_DEFAULTS', 'TYPE_BUFFER_MAX'] }
);

const TPL = [
  { phase: 'Forberedelse', items: [{ id: 'a', label: 'Les søknaden', type: 'check' }] },
  { phase: 'Gransking', items: [] }
];

// ── isValidChecklistTemplate ────────────────────────

test('isValidChecklistTemplate: accepts phases with labelled items (empty phases allowed)', () => {
  assert.strictEqual(isValidChecklistTemplate(TPL), true);
});

test('isValidChecklistTemplate: rejects anything that would break the checklist', () => {
  assert.strictEqual(isValidChecklistTemplate(null), false);
  assert.strictEqual(isValidChecklistTemplate([]), false);
  assert.strictEqual(isValidChecklistTemplate('x'), false);
  assert.strictEqual(isValidChecklistTemplate([{ phase: 'P' }]), false);
  assert.strictEqual(isValidChecklistTemplate([{ phase: 1, items: [] }]), false);
  assert.strictEqual(isValidChecklistTemplate([{ phase: 'P', items: [{ id: 'a' }] }]), false);
  assert.strictEqual(isValidChecklistTemplate([{ phase: 'P', items: [null] }]), false);
});

// ── readImportSettings ──────────────────────────────

test('readImportSettings: older export files without the fields change nothing', () => {
  assert.deepStrictEqual(Object.keys(readImportSettings({ cases: [] })), []);
});

test('readImportSettings: reads name, template, buffer and medlesing', () => {
  const med = [{ id: 'm1', caseNumber: 'P-1', checklist: {} }];
  const r = readImportSettings({ userName: '  Kari ', checklistTemplate: TPL, fristBuffer: 3, medlesing: med });
  assert.strictEqual(r.userName, 'Kari');
  assert.deepStrictEqual(r.checklistTemplate, TPL);
  assert.deepStrictEqual(Object.assign({}, r.typeBuffers), { ny: 3, viderebehandling: 3 });
  assert.deepStrictEqual(r.medlesing, med);
});

test('readImportSettings: null template means "use the default" and is passed on', () => {
  const r = readImportSettings({ checklistTemplate: null });
  assert.ok('checklistTemplate' in r);
  assert.strictEqual(r.checklistTemplate, null);
});

test('readImportSettings: an invalid template is ignored, not applied', () => {
  assert.ok(!('checklistTemplate' in readImportSettings({ checklistTemplate: [{ phase: 'P' }] })));
});

test('readImportSettings: an old fristBuffer must be a non-negative number, rounded down', () => {
  assert.strictEqual(readImportSettings({ fristBuffer: 0 }).typeBuffers.ny, 0);
  assert.strictEqual(readImportSettings({ fristBuffer: 4.7 }).typeBuffers.ny, 4);
  assert.ok(!('typeBuffers' in readImportSettings({ fristBuffer: -1 })));
  assert.ok(!('typeBuffers' in readImportSettings({ fristBuffer: '3' })));
  assert.ok(!('typeBuffers' in readImportSettings({ fristBuffer: NaN })));
  assert.ok(!('typeBuffers' in readImportSettings({ fristBuffer: Infinity })));
});

test('readImportSettings: work windows are read and normalised per type', () => {
  const r = readImportSettings({ workWindows: { ny: 10, viderebehandling: -1 } });
  assert.deepStrictEqual(Object.assign({}, r.workWindows), { ny: 10, viderebehandling: 3, oppdrag: 2 });
  assert.ok(!('workWindows' in readImportSettings({ workWindows: 'x' })));
  assert.ok(!('workWindows' in readImportSettings({})));
});

test('readImportSettings: type buffers are read and normalised per type', () => {
  const r = readImportSettings({ typeBuffers: { ny: 2, viderebehandling: 'x' } });
  assert.deepStrictEqual(Object.assign({}, r.typeBuffers), { ny: 2, viderebehandling: 0 });
});

// Export files from before v4.30.0 only have the single global buffer.
test('readImportSettings: an old global fristBuffer seeds both type buffers', () => {
  const r = readImportSettings({ fristBuffer: 3 });
  assert.deepStrictEqual(Object.assign({}, r.typeBuffers), { ny: 3, viderebehandling: 3 });
  assert.ok(!('typeBuffers' in readImportSettings({})));
});

test('readImportSettings: medlesing keeps only records with an id', () => {
  const r = readImportSettings({ medlesing: [{ id: 'm1' }, null, { caseNumber: 'x' }, { id: '' }, 'x'] });
  assert.deepStrictEqual(r.medlesing, [{ id: 'm1' }]);
  assert.ok(!('medlesing' in readImportSettings({ medlesing: 'nei' })));
});

test('readImportSettings: a non-string name is ignored; an empty name is passed on', () => {
  assert.ok(!('userName' in readImportSettings({ userName: 42 })));
  assert.strictEqual(readImportSettings({ userName: '' }).userName, '');
});

test('readImportSettings: the Oversikt deadline filter is read and normalised', () => {
  const r = readImportSettings({ homeDeadlineFilter: { fristarkiv: { overdue: true }, horizon: 30 } });
  assert.strictEqual(r.homeDeadlineFilter.fristarkiv.overdue, true);
  assert.strictEqual(r.homeDeadlineFilter.fristarkiv.upcoming, false);
  assert.strictEqual(r.homeDeadlineFilter.ny.upcoming, true);
  assert.strictEqual(r.homeDeadlineFilter.horizon, 30);
  assert.ok(!('homeDeadlineFilter' in readImportSettings({ homeDeadlineFilter: 'x' })));
  assert.ok(!('homeDeadlineFilter' in readImportSettings({})));
});

test('readImportSettings: an export from before workdays gets the new Ny default', () => {
  const s = readImportSettings({ workWindows: { ny: 14, viderebehandling: 3, oppdrag: 2 } });
  assert.strictEqual(s.workWindows.ny, 10);
});

test('readImportSettings: an export already in workdays keeps its Ny window', () => {
  const s = readImportSettings({ workWindowUnit: 'workdays', workWindows: { ny: 14, viderebehandling: 3, oppdrag: 2 } });
  assert.strictEqual(s.workWindows.ny, 14);
});
