'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { canBeActiveCase, normalizeActiveCase, toggleActiveCase, resolveActiveCase, activeCaseAfterUndo, readImportSettings } = loadFunctions(
  ['canBeActiveCase', 'normalizeActiveCase', 'toggleActiveCase', 'resolveActiveCase', 'activeCaseAfterUndo',
   'readImportSettings', 'isValidChecklistTemplate', 'normalizeHomeDeadlineFilter', 'defaultHomeDeadlineFilter'],
  { vars: ['HOME_DEADLINE_KINDS', 'HOME_DEADLINE_HORIZONS'] }
);

const NOW = '2026-10-20T09:00:00.000Z';

// Objekter fra vm-sandkassen har en annen Object-prototype; sammenlign kopier.
const plain = (x) => JSON.parse(JSON.stringify(x));

function c(overrides) {
  return Object.assign({ id: 'a', caseNumber: 'NO20250001', status: 'ny', type: 'sak', title: 'T' }, overrides);
}

// ── canBeActiveCase ─────────────────────────────────

test('canBeActiveCase: Ny and Viderebehandling are your own work', () => {
  assert.strictEqual(canBeActiveCase(c({ status: 'ny' })), true);
  assert.strictEqual(canBeActiveCase(c({ status: 'viderebehandling' })), true);
});

// I Fristarkiv er brevet sendt og fristen søkerens — det er ingenting å holde på med.
test('canBeActiveCase: Fristarkiv and Avsluttet cannot be marked', () => {
  assert.strictEqual(canBeActiveCase(c({ status: 'fristarkiv' })), false);
  assert.strictEqual(canBeActiveCase(c({ status: 'avsluttet' })), false);
});

test('canBeActiveCase: active oppdrag can be marked, finished ones cannot', () => {
  assert.strictEqual(canBeActiveCase(c({ type: 'oppdrag', status: 'ny' })), true);
  assert.strictEqual(canBeActiveCase(c({ type: 'oppdrag', status: 'avsluttet' })), false);
});

test('canBeActiveCase: no case, no mark', () => {
  assert.strictEqual(canBeActiveCase(null), false);
  assert.strictEqual(canBeActiveCase(undefined), false);
});

// ── normalizeActiveCase ─────────────────────────────

test('normalizeActiveCase: keeps a valid mark', () => {
  assert.deepStrictEqual(plain(normalizeActiveCase({ id: 'a', since: NOW })), { id: 'a', since: NOW });
});

test('normalizeActiveCase: a missing since is tolerated as null', () => {
  assert.deepStrictEqual(plain(normalizeActiveCase({ id: 'a' })), { id: 'a', since: null });
});

test('normalizeActiveCase: anything without a usable id is no mark', () => {
  [null, undefined, 'a', 42, [], {}, { id: '' }, { id: 7 }].forEach(function(raw) {
    assert.strictEqual(normalizeActiveCase(raw), null, JSON.stringify(raw));
  });
});

// ── toggleActiveCase ────────────────────────────────

test('toggleActiveCase: marks a case when nothing is marked', () => {
  assert.deepStrictEqual(plain(toggleActiveCase(null, 'a', NOW)), { id: 'a', since: NOW });
});

test('toggleActiveCase: marking the marked case again clears it', () => {
  assert.strictEqual(toggleActiveCase({ id: 'a', since: NOW }, 'a', NOW), null);
});

// Maks én sak om gangen: å markere en ny flytter markeringen.
test('toggleActiveCase: marking another case moves the mark', () => {
  const later = '2026-10-21T08:00:00.000Z';
  assert.deepStrictEqual(plain(toggleActiveCase({ id: 'a', since: NOW }, 'b', later)), { id: 'b', since: later });
});

// ── resolveActiveCase ───────────────────────────────

test('resolveActiveCase: returns the marked case while it is markable', () => {
  const cases = [c({ id: 'a' }), c({ id: 'b', status: 'viderebehandling' })];
  assert.strictEqual(resolveActiveCase({ id: 'b', since: NOW }, cases), cases[1]);
});

test('resolveActiveCase: no mark resolves to null', () => {
  assert.strictEqual(resolveActiveCase(null, [c()]), null);
});

test('resolveActiveCase: a deleted case is no longer marked', () => {
  assert.strictEqual(resolveActiveCase({ id: 'gone', since: NOW }, [c()]), null);
});

// Markeringen skal forsvinne av seg selv når brevet sendes eller saken avsluttes.
test('resolveActiveCase: a case moved to Fristarkiv or Avsluttet is no longer marked', () => {
  assert.strictEqual(resolveActiveCase({ id: 'a', since: NOW }, [c({ status: 'fristarkiv' })]), null);
  assert.strictEqual(resolveActiveCase({ id: 'a', since: NOW }, [c({ status: 'avsluttet' })]), null);
  assert.strictEqual(resolveActiveCase({ id: 'a', since: NOW }, [c({ type: 'oppdrag', status: 'avsluttet' })]), null);
});

// ── readImportSettings: activeCase ──────────────────

test('readImportSettings: activeCase is read and normalised', () => {
  assert.deepStrictEqual(plain(readImportSettings({ activeCase: { id: 'a', since: NOW } }).activeCase), { id: 'a', since: NOW });
});

test('readImportSettings: an explicit null clears the mark', () => {
  const r = readImportSettings({ activeCase: null });
  assert.ok('activeCase' in r);
  assert.strictEqual(r.activeCase, null);
});

test('readImportSettings: older files without activeCase leave the mark alone', () => {
  assert.ok(!('activeCase' in readImportSettings({ cases: [] })));
});

test('readImportSettings: a malformed activeCase is ignored', () => {
  assert.ok(!('activeCase' in readImportSettings({ activeCase: 'a' })));
  assert.ok(!('activeCase' in readImportSettings({ activeCase: { id: 3 } })));
});

// ── activeCaseAfterUndo ─────────────────────────────

// Flytting til Fristarkiv fjerner markeringen; angre skal gi den tilbake.
test('activeCaseAfterUndo: undo brings back a mark the action cleared', () => {
  const mark = { id: 'a', since: NOW };
  assert.strictEqual(activeCaseAfterUndo({ activeCase: mark }, null), mark);
});

// Har du markert en annen sak siden, er det det nyeste valget ditt som gjelder.
test('activeCaseAfterUndo: a case marked since then is kept', () => {
  const newer = { id: 'b', since: NOW };
  assert.strictEqual(activeCaseAfterUndo({ activeCase: { id: 'a', since: NOW } }, newer), newer);
});

test('activeCaseAfterUndo: nothing marked before or after stays unmarked', () => {
  assert.strictEqual(activeCaseAfterUndo({ activeCase: null }, null), null);
  assert.strictEqual(activeCaseAfterUndo({}, null), null);
});
