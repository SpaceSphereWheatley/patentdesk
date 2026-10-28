'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

// ── «Rediger sak»: statusbytte går via saksflyten ─────────────
const loaded = loadFunctions(['editStatusPlan']);
// Plain copy, so deepStrictEqual doesn't trip over the sandbox's Object prototype
const editStatusPlan = (orig, selected) => ({ ...loaded.editStatusPlan(orig, selected) });

test('editStatusPlan keeps the status when it is unchanged', () => {
  assert.deepStrictEqual(editStatusPlan({ type: 'sak', status: 'ny' }, 'ny'),
    { status: 'ny', transitionTo: null });
});

// Regression: the edit dialog used to overwrite the status directly, with no
// history, no statistics and no applicant deadline.
test('editStatusPlan defers a status change to the case flow', () => {
  assert.deepStrictEqual(editStatusPlan({ type: 'sak', status: 'ny' }, 'fristarkiv'),
    { status: 'ny', transitionTo: 'fristarkiv' });
  assert.deepStrictEqual(editStatusPlan({ type: 'sak', status: 'fristarkiv' }, 'viderebehandling'),
    { status: 'fristarkiv', transitionTo: 'viderebehandling' });
  assert.deepStrictEqual(editStatusPlan({ type: 'sak', status: 'avsluttet' }, 'ny'),
    { status: 'avsluttet', transitionTo: 'ny' });
});

test('editStatusPlan saves directly for new cases and oppdrag', () => {
  assert.deepStrictEqual(editStatusPlan(null, 'fristarkiv'), { status: 'fristarkiv', transitionTo: null });
  assert.deepStrictEqual(editStatusPlan({ type: 'oppdrag', status: 'ny' }, 'oppdrag'), { status: 'oppdrag', transitionTo: null });
  assert.deepStrictEqual(editStatusPlan({ type: 'sak', status: 'ny' }, 'oppdrag'), { status: 'oppdrag', transitionTo: null });
});

// ── Historikk → riktig hendelse i statistikken ────────────────
const { historyLogType } = loadFunctions(['historyLogType']);

test('historyLogType maps a transition to the statistics entry it created', () => {
  assert.strictEqual(historyLogType({ type: 'status', from: 'ny', to: 'fristarkiv' }, false), 'ny');
  assert.strictEqual(historyLogType({ type: 'status', from: 'viderebehandling', to: 'fristarkiv' }, false), 'videre');
  assert.strictEqual(historyLogType({ type: 'status', from: 'fristarkiv', to: 'avsluttet' }, false), 'avsluttet');
  assert.strictEqual(historyLogType({ type: 'status', from: 'ny', to: 'avsluttet' }, true), 'oppdrag');
});

// Regression: the creation entry (to: 'ny') used to move the nybehandling.
test('historyLogType gives null for transitions that log nothing', () => {
  assert.strictEqual(historyLogType({ type: 'status', from: null, to: 'ny' }, false), null);
  assert.strictEqual(historyLogType({ type: 'status', from: 'fristarkiv', to: 'viderebehandling' }, false), null);
  assert.strictEqual(historyLogType({ type: 'status', from: null, to: 'fristarkiv' }, false), null);
  assert.strictEqual(historyLogType({ type: 'frist', from: '2026-01-01', to: '2026-02-01' }, false), null);
  assert.strictEqual(historyLogType(null, false), null);
});

// ── Slett all data ────────────────────────────────────────────
const { keysForDeleteAll } = loadFunctions(['keysForDeleteAll'], { vars: ['DELETE_ALL_KEEP_KEYS'] });

// Regression: medlesinger, varighet per sakstype and the deadline filter
// used to survive «Slett all data».
test('keysForDeleteAll removes every app key, including ones added later', () => {
  const keys = ['pt_cases', 'pt_sak_abc', 'pt_medlesing', 'pt_work_windows', 'pt_home_frister',
    'pt_medl_log', 'pt_korrupt_x', 'pt_sak_phases_collapsed', 'other_app_key'];
  assert.deepStrictEqual(keysForDeleteAll(keys), keys.filter((k) => k !== 'other_app_key'));
});

test('keysForDeleteAll keeps the backup and data-folder bookkeeping', () => {
  const keep = ['pt_backup_enabled', 'pt_backup_last', 'pt_backup_last_file_date',
    'pt_saved_at', 'pt_workfile_last', 'pt_workfile_synced'];
  assert.deepStrictEqual(keysForDeleteAll(keep.concat(['pt_cases'])), ['pt_cases']);
});

// ── Hendelseslogg: endre dato, behold klokkeslett ─────────────
const { replaceDatePart } = loadFunctions(['replaceDatePart']);

test('replaceDatePart sets the local date and keeps the time of day', () => {
  const iso = new Date(2026, 2, 10, 14, 30).toISOString();
  const out = new Date(replaceDatePart(iso, '2026-05-02'));
  assert.deepStrictEqual([out.getFullYear(), out.getMonth(), out.getDate(), out.getHours(), out.getMinutes()],
    [2026, 4, 2, 14, 30]);
});

// ── Opprydding av foreldreløse saksdetaljer ───────────────────
const { orphanSakKeys, PHASE_COLLAPSE_KEY, SAK_KEY_PREFIX } = loadFunctions(['orphanSakKeys'],
  { vars: ['SAK_KEY_PREFIX', 'PHASE_COLLAPSE_KEY'] });

test('orphanSakKeys finds case details whose case no longer exists', () => {
  const keys = ['pt_sak_a', 'pt_sak_gone', 'pt_cases', 'pt_phases_collapsed'];
  assert.deepStrictEqual([...orphanSakKeys(keys, { a: true }, SAK_KEY_PREFIX)], ['pt_sak_gone']);
});

// Regression: the collapsed-phases setting was stored as pt_sak_phases_collapsed,
// so the cleanup took it for an orphaned case and deleted it on every startup.
test('the collapsed-phases setting is not stored under the case-details prefix', () => {
  assert.strictEqual(PHASE_COLLAPSE_KEY.indexOf(SAK_KEY_PREFIX), -1);
  assert.deepStrictEqual([...orphanSakKeys([PHASE_COLLAPSE_KEY], {}, SAK_KEY_PREFIX)], []);
});
