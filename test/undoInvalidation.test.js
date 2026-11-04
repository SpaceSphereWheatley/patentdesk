'use strict';
// Fix: «Angre» must not overwrite later edits (docs/claims undo snapshots).
//
// Contract for the builder — a pure, top-level function in PatentDesk.html:
//
//   function undoInvalidatedBy(snapshot, actionType, payload) -> boolean
//
// Returns true when dispatching `actionType` with `payload` must discard
// `snapshot` (so CASE_UNDO no longer restores it). Must not touch globals.
//
// Returns true ONLY when ALL of:
//   - snapshot is non-null and snapshot.mode is 'docs' or 'claims'
//   - payload && payload.id === snapshot.caseId
//   - actionType is one of INVALIDATING below
//
// INVALIDATING (change claims or citations of the case):
//   CLAIM_TOGGLE, CLAIM_SET, CLAIM_DOC_TOGGLE, CLAIM_DEP_CHANGE,
//   CLAIM_LABEL_CHANGE, CLAIM_NOTE_CHANGE,
//   DOC_ADD, DOC_REMOVE, DOC_RESTORE, DOC_FIELD_CHANGE,
//   SAK_CLAIM_COUNT_CHANGE, CLAIM_MAPPING_CHANGE (spec 2B: a mapping edit
//   drops a pending Angre on the same case; it may create its own snapshot)
//
// NOT invalidating (examples tested): CHECKLIST_TOGGLE, SAK_NOTES_CHANGE,
//   RESPONSE_CHECK_TOGGLE, CPC_ADD, CPC_REMOVE, CPC_INUSE_TOGGLE, FILE_ADD,
//   SAK_FILING_DATE_CHANGE, SAK_DURATION_CHANGE, CASE_FIELD_UPDATE, NAV_GO,
//   CASE_UNDO; any action on another case; any action when the snapshot mode
//   is not 'docs'/'claims' (e.g. undefined/'patch'/'reinsert' — AC4).
//
// Wiring: dispatch() must call it before handling an action and set
// undoSnapshot to null (and drop the toast) when it returns true. An action
// that itself creates a new snapshot (DOC_REMOVE, undoable count change)
// simply replaces it afterwards.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadFunctions, extractFunctionSource } = require('./extractFunctions');

const { undoInvalidatedBy } = loadFunctions(['undoInvalidatedBy']);

const INVALIDATING = [
  'CLAIM_TOGGLE', 'CLAIM_SET', 'CLAIM_DOC_TOGGLE', 'CLAIM_DEP_CHANGE',
  'CLAIM_LABEL_CHANGE', 'CLAIM_NOTE_CHANGE',
  'DOC_ADD', 'DOC_REMOVE', 'DOC_RESTORE', 'DOC_FIELD_CHANGE',
  'SAK_CLAIM_COUNT_CHANGE', 'CLAIM_MAPPING_CHANGE'
];
const NOT_INVALIDATING = [
  'CHECKLIST_TOGGLE', 'SAK_NOTES_CHANGE', 'RESPONSE_CHECK_TOGGLE',
  'CPC_ADD', 'CPC_REMOVE', 'CPC_INUSE_TOGGLE', 'FILE_ADD',
  'SAK_FILING_DATE_CHANGE', 'SAK_DURATION_CHANGE', 'CASE_FIELD_UPDATE',
  'NAV_GO', 'CASE_UNDO'
];

function snap(mode) {
  return { mode: mode, caseId: 'X', logIds: [], label: '1', before: { docs: [], claims: [] } };
}

for (const mode of ['docs', 'claims']) {
  for (const type of INVALIDATING) {
    test(`AC1: ${type} on the same case invalidates a '${mode}' snapshot`, () => {
      assert.strictEqual(undoInvalidatedBy(snap(mode), type, { id: 'X', claimNum: 1 }), true);
    });
    test(`AC2: ${type} on another case keeps a '${mode}' snapshot`, () => {
      assert.strictEqual(undoInvalidatedBy(snap(mode), type, { id: 'Y', claimNum: 1 }), false);
    });
  }
  for (const type of NOT_INVALIDATING) {
    test(`AC2: ${type} on the same case keeps a '${mode}' snapshot`, () => {
      assert.strictEqual(undoInvalidatedBy(snap(mode), type, { id: 'X' }), false);
    });
  }
}

test('AC4: other undo modes are never invalidated by claim/doc edits', () => {
  for (const mode of [undefined, 'patch', 'reinsert']) {
    const s = { mode: mode, caseId: 'X', sakId: 'X', logIds: [] };
    for (const type of INVALIDATING) {
      assert.strictEqual(undoInvalidatedBy(s, type, { id: 'X' }), false, `${mode}/${type}`);
    }
  }
});

test('no snapshot or no payload: returns false without throwing', () => {
  assert.strictEqual(undoInvalidatedBy(null, 'CLAIM_SET', { id: 'X' }), false);
  assert.strictEqual(undoInvalidatedBy(snap('docs'), 'CLAIM_SET', undefined), false);
  assert.strictEqual(undoInvalidatedBy(snap('docs'), 'NAV_GO', undefined), false);
});

test('pure: does not mutate the snapshot', () => {
  const s = snap('claims');
  const copy = JSON.stringify(s);
  undoInvalidatedBy(s, 'CLAIM_SET', { id: 'X' });
  assert.strictEqual(JSON.stringify(s), copy);
});

test('wiring: dispatch() consults undoInvalidatedBy', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'PatentDesk.html'), 'utf8');
  const src = extractFunctionSource(html, 'dispatch');
  assert.match(src, /undoInvalidatedBy\s*\(/);
});
