'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const {
  workFileStartupAction, workFileSignature, countDifferingCases, dailyBackupsToPrune
} = loadFunctions(
  ['workFileStartupAction', 'workFileSignature', 'countDifferingCases', 'dailyBackupsToPrune']
);

const T1 = '2026-10-13T16:05:00.000Z';
const T2 = '2026-10-14T10:32:00.000Z';

// ── workFileStartupAction ────────────────────────────
// local.syncedAt = the work file's saved-at stamp the last time this browser
// wrote or read it. If the file still carries that stamp, nothing else has
// touched it and the browser's own changes may overwrite it.

const T3 = '2026-10-14T12:00:00.000Z';

test('workFileStartupAction: no work file yet → write the browser data to it', () => {
  assert.strictEqual(workFileStartupAction({ savedAt: T1, caseCount: 12, syncedAt: null }, null), 'write');
  assert.strictEqual(workFileStartupAction({ savedAt: null, caseCount: 0, syncedAt: null }, null), 'write');
});

test('workFileStartupAction: empty browser and a work file → load it without asking', () => {
  // Browser data wiped (no saved-at stamp, no cases): nothing can be lost.
  assert.strictEqual(
    workFileStartupAction({ savedAt: null, caseCount: 0, syncedAt: null },
                          { savedAt: T1, caseCount: 47, identical: false }),
    'load');
});

test('workFileStartupAction: identical content → nothing to do, whatever the stamps say', () => {
  assert.strictEqual(
    workFileStartupAction({ savedAt: T1, caseCount: 3, syncedAt: null },
                          { savedAt: T2, caseCount: 3, identical: true }),
    'none');
});

test('workFileStartupAction: file untouched since last sync, browser has newer changes → write silently', () => {
  // E.g. folder access was not granted last session, so the file lagged behind.
  assert.strictEqual(
    workFileStartupAction({ savedAt: T2, caseCount: 47, syncedAt: T1 },
                          { savedAt: T1, caseCount: 44, identical: false }),
    'write');
});

test('workFileStartupAction: file changed since last sync → ask', () => {
  assert.strictEqual(
    workFileStartupAction({ savedAt: T1, caseCount: 44, syncedAt: T1 },
                          { savedAt: T2, caseCount: 47, identical: false }),
    'ask');
});

test('workFileStartupAction: file changed since last sync → ask even when the browser is newer', () => {
  // E.g. an old daily copy was put back in place of the work file by hand.
  assert.strictEqual(
    workFileStartupAction({ savedAt: T3, caseCount: 47, syncedAt: T2 },
                          { savedAt: T1, caseCount: 40, identical: false }),
    'ask');
});

test('workFileStartupAction: browser wiped, then edited before access was granted → ask, never overwrite', () => {
  // The new edit gives the browser a fresh stamp, but it has never seen this file.
  assert.strictEqual(
    workFileStartupAction({ savedAt: T3, caseCount: 1, syncedAt: null },
                          { savedAt: T1, caseCount: 47, identical: false }),
    'ask');
});

test('workFileStartupAction: browser with data but no stamp (upgrade) and a differing file → ask', () => {
  assert.strictEqual(
    workFileStartupAction({ savedAt: null, caseCount: 5, syncedAt: null },
                          { savedAt: T1, caseCount: 6, identical: false }),
    'ask');
});

test('workFileStartupAction: deliberate "delete all" is not mistaken for a wiped browser', () => {
  // "Slett alt" keeps the saved-at and synced stamps, so the stale file is
  // overwritten with the empty state rather than silently loaded back.
  assert.strictEqual(
    workFileStartupAction({ savedAt: T2, caseCount: 0, syncedAt: T1 },
                          { savedAt: T1, caseCount: 47, identical: false }),
    'write');
});

test('workFileStartupAction: file without a stamp is never assumed to be ours', () => {
  assert.strictEqual(
    workFileStartupAction({ savedAt: T2, caseCount: 2, syncedAt: T1 },
                          { savedAt: null, caseCount: 3, identical: false }),
    'ask');
});

// ── workFileSignature ───────────────────────────────

test('workFileSignature: ignores the export and saved-at timestamps', () => {
  const a = { version: 2, exported: T1, savedAt: T1, cases: [{ id: 'a' }] };
  const b = { version: 2, exported: T2, savedAt: T2, cases: [{ id: 'a' }] };
  assert.strictEqual(workFileSignature(a), workFileSignature(b));
});

test('workFileSignature: differs when the content differs', () => {
  const a = { version: 2, exported: T1, cases: [{ id: 'a' }] };
  const b = { version: 2, exported: T1, cases: [{ id: 'b' }] };
  assert.notStrictEqual(workFileSignature(a), workFileSignature(b));
});

test('workFileSignature: does not mutate the payload', () => {
  const a = { exported: T1, savedAt: T1, cases: [] };
  workFileSignature(a);
  assert.strictEqual(a.exported, T1);
  assert.strictEqual(a.savedAt, T1);
});

// ── countDifferingCases ─────────────────────────────

test('countDifferingCases: identical payloads → 0', () => {
  const p = { cases: [{ id: 'a', t: 1 }, { id: 'b', t: 2 }], sakDetails: { a: { claims: [] } } };
  assert.strictEqual(countDifferingCases(p, JSON.parse(JSON.stringify(p))), 0);
});

test('countDifferingCases: counts cases only on one side and changed cases', () => {
  const local = { cases: [{ id: 'a', t: 1 }, { id: 'b', t: 2 }, { id: 'c', t: 3 }] };
  const file  = { cases: [{ id: 'a', t: 1 }, { id: 'b', t: 9 }, { id: 'd', t: 4 }] };
  // b changed, c only local, d only in file
  assert.strictEqual(countDifferingCases(local, file), 3);
});

test('countDifferingCases: a change in the case details counts as a differing case', () => {
  const local = { cases: [{ id: 'a' }], sakDetails: { a: { claims: [1] } } };
  const file  = { cases: [{ id: 'a' }], sakDetails: { a: { claims: [1, 2] } } };
  assert.strictEqual(countDifferingCases(local, file), 1);
});

test('countDifferingCases: tolerates missing cases and sakDetails', () => {
  assert.strictEqual(countDifferingCases({}, { cases: [{ id: 'a' }] }), 1);
  assert.strictEqual(countDifferingCases({}, {}), 0);
});

// ── dailyBackupsToPrune ─────────────────────────────

function days(n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(Date.UTC(2026, 0, i));
    out.push('patentdesk-backup-' + d.toISOString().slice(0, 10) + '.json');
  }
  return out;
}

test('dailyBackupsToPrune: keeps everything at or below the limit', () => {
  assert.deepStrictEqual(dailyBackupsToPrune(days(30), 30), []);
  assert.deepStrictEqual(dailyBackupsToPrune(days(3), 30), []);
});

test('dailyBackupsToPrune: removes the oldest beyond the limit', () => {
  const names = days(32);
  assert.deepStrictEqual(dailyBackupsToPrune(names, 30), [names[0], names[1]]);
});

test('dailyBackupsToPrune: order of the listing does not matter', () => {
  const names = days(31);
  const shuffled = names.slice().reverse();
  assert.deepStrictEqual(dailyBackupsToPrune(shuffled, 30), [names[0]]);
});

test('dailyBackupsToPrune: never touches files that are not daily backups', () => {
  const names = days(31).concat([
    'notater.txt', 'patentdesk-data.json', 'patentdesk-backup-2026-01-01 (1).json',
    'patentdesk-backup-gammel.json', 'patentdesk-data-ulesbar-2026-01-01.json'
  ]);
  const pruned = dailyBackupsToPrune(names, 30);
  assert.deepStrictEqual(pruned, ['patentdesk-backup-2026-01-01.json']);
});
