'use strict';
// PR #69 fix round (tier Fix): F1–F4. F5 is CHANGELOG wording only.
//
// Contract for the builder — new pure helpers expected in PatentDesk.html,
// declared as top-level `function name(...)` so the harness can extract them:
//
//   docRemoveToast(docsBefore, idx) -> string
//     docsBefore: the docs array BEFORE removing the citation at idx (pre-first-
//     letter delete + renumber). Returns the undo-toast text:
//       '<removed id> fjernet'                       when nothing follows idx
//       '<removed id> fjernet – D3 heter nå D2, D4 heter nå D3'  otherwise
//     (en dash with spaces, entries joined by ', ', old id 'heter nå' new id,
//     new id = 'D' + position after removal, i.e. 'D' + j for old index j > idx).
//     Uses only docsBefore and idx; no DOM, no other helpers.
//
//   sanitizeResponseExtra(extra) -> { received, changes } | null
//     extra: the «Svar mottatt» historyExtra payload (untrusted shape).
//     Returns null if extra is not a non-null, non-array object. Otherwise:
//       received: the string itself if it is a valid ISO 'YYYY-MM-DD' calendar
//                 date, else undefined (numbers, objects, '2026-02-31',
//                 '2026.05.30' all -> undefined)
//       changes:  if Array.isArray(extra.changes), a new array with only
//                 'claims' / 'description' entries (order kept); else undefined
//     May call isValidDate / parseDate (loaded below) and nothing else.
//
// F1: responseRoundInfo / sakRoundLine may call isValidDate / parseDate; those
// are loaded here. If another helper is needed, ask QA to add it to the list.
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const plain = (v) => JSON.parse(JSON.stringify(v));

const core = loadFunctions([
  'lettersSent', 'examinationRound', 'toDisplay', 'parseDate', 'isValidDate',
  'responseRoundInfo', 'sakRoundLine', 'responseChangesLabel',
  'responseChecked', 'toggleResponseCheck',
  'claimDocSelectable', 'toggleClaimDoc',
], { vars: ['RESPONSE_CHECKLIST', 'MAX_INVENTIVE_DOCS'] });

function loadOne(name, extra) {
  try { return loadFunctions((extra || []).concat([name]))[name]; } catch (e) { return null; }
}
const docRemoveToast = loadOne('docRemoveToast');
const sanitizeResponseExtra = loadOne('sanitizeResponseExtra', ['parseDate', 'isValidDate']);

// ── F1: invalid `received` in history never breaks the round line ──────────
const sent1 = { type: 'status', date: '2026-03-02T09:00:00.000Z', from: 'ny', to: 'fristarkiv' };
function answeredCase(received) {
  return { status: 'viderebehandling', history: [sent1,
    { type: 'status', date: '2026-06-01T09:00:00.000Z', from: 'fristarkiv', to: 'viderebehandling',
      received: received, changes: ['claims'] }] };
}
const BAD_RECEIVED = [
  ['number', 20260530], ['object', { x: 1 }], ['array', ['2026-05-30']],
  ['invalid date', '2026-02-31'], ['garbage string', '<img src=x>'],
  ['display format', '2026.05.30'], ['boolean', true],
];

for (const [label, bad] of BAD_RECEIVED) {
  test(`F1: responseRoundInfo falls back to the transition date when received is ${label}`, () => {
    const info = core.responseRoundInfo(answeredCase(bad));
    assert.strictEqual(info.received, '2026-06-01');
  });
  test(`F1: sakRoundLine renders without throwing when received is ${label}`, () => {
    let line;
    assert.doesNotThrow(() => { line = core.sakRoundLine(answeredCase(bad)); });
    assert.match(line, /svar 2026\.06\.01 \(endrede krav\)/);
  });
}

test('F1: a valid ISO received date is still used as-is', () => {
  assert.strictEqual(core.responseRoundInfo(answeredCase('2026-05-30')).received, '2026-05-30');
  assert.match(core.sakRoundLine(answeredCase('2026-05-30')), /svar 2026\.05\.30/);
});

test('F1: non-array changes is ignored (null), non-string entries do not break the label', () => {
  const c = answeredCase('2026-05-30');
  c.history[1].changes = { claims: true };
  assert.strictEqual(core.responseRoundInfo(c).changes, null);
  c.history[1].changes = [42, null, 'description'];
  assert.doesNotThrow(() => core.sakRoundLine(c));
});

// ── F2a: undo/renumber toast text ───────────────────────────────────────────
const d = (n) => ({ id: 'D' + n, ref: 'REF' + n });

test('F2a: docRemoveToast exists', () => {
  assert.strictEqual(typeof docRemoveToast, 'function', 'docRemoveToast(docsBefore, idx) not found in PatentDesk.html');
});

test('F2a: removing D2 of four renames the ones after it', () => {
  assert.strictEqual(docRemoveToast([d(1), d(2), d(3), d(4)], 1), 'D2 fjernet – D3 heter nå D2, D4 heter nå D3');
});

test('F2a: removing the last citation has no renumbering suffix', () => {
  assert.strictEqual(docRemoveToast([d(1), d(2), d(3)], 2), 'D3 fjernet');
});

test('F2a: removing the only citation', () => {
  assert.strictEqual(docRemoveToast([d(1)], 0), 'D1 fjernet');
});

test('F2a: removing D1 renames every remaining citation', () => {
  assert.strictEqual(docRemoveToast([d(1), d(2), d(3)], 0), 'D1 fjernet – D2 heter nå D1, D3 heter nå D2');
});

// ── F2b: sanitising «Svar mottatt» history extras ───────────────────────────
test('F2b: sanitizeResponseExtra exists', () => {
  assert.strictEqual(typeof sanitizeResponseExtra, 'function', 'sanitizeResponseExtra(extra) not found in PatentDesk.html');
});

test('F2b: valid extra passes through unchanged', () => {
  assert.deepStrictEqual(plain(sanitizeResponseExtra({ received: '2026-05-30', changes: ['claims', 'description'] })),
    { received: '2026-05-30', changes: ['claims', 'description'] });
});

test('F2b: invalid received becomes undefined', () => {
  for (const [, bad] of BAD_RECEIVED) {
    const out = sanitizeResponseExtra({ received: bad, changes: [] });
    assert.ok(out && typeof out === 'object', 'returns an object for an object input');
    assert.strictEqual(out.received, undefined, 'received ' + JSON.stringify(bad));
  }
});

test('F2b: changes are filtered to claims/description, order kept', () => {
  const out = sanitizeResponseExtra({ received: '2026-05-30', changes: ['x', 'description', 7, null, 'claims', '<b>'] });
  assert.deepStrictEqual(plain(out.changes), ['description', 'claims']);
});

test('F2b: empty changes stays an empty array ("kun argumenter")', () => {
  assert.deepStrictEqual(plain(sanitizeResponseExtra({ received: '2026-05-30', changes: [] }).changes), []);
});

test('F2b: non-array changes becomes undefined', () => {
  assert.strictEqual(sanitizeResponseExtra({ received: '2026-05-30', changes: 'claims' }).changes, undefined);
  assert.strictEqual(sanitizeResponseExtra({ received: '2026-05-30' }).changes, undefined);
});

test('F2b: non-object extra returns null', () => {
  for (const bad of [null, undefined, 'x', 5, ['2026-05-30']]) {
    assert.strictEqual(sanitizeResponseExtra(bad), null, 'input ' + JSON.stringify(bad));
  }
});

test('F2b: the returned object does not carry other stored keys through', () => {
  const out = sanitizeResponseExtra({ received: '2026-05-30', changes: [], type: 'evil', __proto__x: 1 });
  assert.deepStrictEqual(Object.keys(out).sort(), ['changes', 'received']);
});

// ── F3: responseChecked returns only known ids, no duplicates ───────────────
test('F3: unknown ids and non-strings are dropped', () => {
  const data = { responseChecks: { 2: ['read', 'bogus', 42, null, { id: 'read' }, '<img>', 'search'] } };
  assert.deepStrictEqual(plain(core.responseChecked(data, 2)), ['read', 'search']);
});

test('F3: duplicates are removed', () => {
  const data = { responseChecks: { 1: ['read', 'read', 'basis', 'read', 'basis'] } };
  assert.deepStrictEqual(plain(core.responseChecked(data, 1)), ['read', 'basis']);
});

test('F3: progress count can never exceed the checklist length', () => {
  const ids = core.RESPONSE_CHECKLIST.map((i) => i.id);
  const data = { responseChecks: { 1: ids.concat(ids, ids, ['x', 'y']) } };
  assert.ok(core.responseChecked(data, 1).length <= core.RESPONSE_CHECKLIST.length);
  assert.strictEqual(core.responseChecked(data, 1).length, ids.length);
});

test('F3: non-array/odd stored shapes give an empty list', () => {
  assert.deepStrictEqual(plain(core.responseChecked({ responseChecks: { 1: 'read' } }, 1)), []);
  assert.deepStrictEqual(plain(core.responseChecked({ responseChecks: 'x' }, 1)), []);
  assert.deepStrictEqual(plain(core.responseChecked({}, 1)), []);
  assert.deepStrictEqual(plain(core.responseChecked(null, 1)), []);
});

test('F3: toggling after dirty data stores a clean list', () => {
  const data = { responseChecks: { 1: ['read', 'read', 'bogus'] } };
  core.toggleResponseCheck(data, 1, 'basis');
  assert.deepStrictEqual(plain(data.responseChecks[1]), ['read', 'basis']);
});

// ── F4: toggleClaimDoc uses the picker rule (claimDocSelectable) ────────────
const docsF4 = [
  { id: 'D1', ref: 'A' },
  { id: 'D2', ref: 'B' },
  { id: 'D3', ref: 'C', withdrawn: true },
  { id: 'D4', ref: 'D', e: true },
];
const blank = () => ({ num: 1, dep: null, noveltyDoc: null, inventiveDocs: [] });

test('F4: withdrawn citation refused for novelty and inventive step', () => {
  const c = blank();
  core.toggleClaimDoc(c, 'novelty', 'D3', docsF4);
  core.toggleClaimDoc(c, 'inventive', 'D3', docsF4);
  assert.strictEqual(c.noveltyDoc, null);
  assert.deepStrictEqual(plain(c.inventiveDocs), []);
});

test('F4: E document refused for inventive step, accepted for novelty', () => {
  const c = blank();
  core.toggleClaimDoc(c, 'inventive', 'D4', docsF4);
  assert.deepStrictEqual(plain(c.inventiveDocs), []);
  core.toggleClaimDoc(c, 'novelty', 'D4', docsF4);
  assert.strictEqual(c.noveltyDoc, 'D4');
});

test('F4: unknown doc id refused when docs are given', () => {
  const c = blank();
  core.toggleClaimDoc(c, 'novelty', 'D9', docsF4);
  core.toggleClaimDoc(c, 'inventive', 'D9', docsF4);
  assert.strictEqual(c.noveltyDoc, null);
  assert.deepStrictEqual(plain(c.inventiveDocs), []);
});

test('F4: a refused pick does not replace an existing valid novelty choice', () => {
  const c = blank();
  core.toggleClaimDoc(c, 'novelty', 'D1', docsF4);
  core.toggleClaimDoc(c, 'novelty', 'D3', docsF4);
  assert.strictEqual(c.noveltyDoc, 'D1');
});

test('F4: plain citation still selectable and toggles off', () => {
  const c = blank();
  core.toggleClaimDoc(c, 'inventive', 'D1', docsF4);
  assert.deepStrictEqual(plain(c.inventiveDocs), ['D1']);
  core.toggleClaimDoc(c, 'inventive', 'D1', docsF4);
  assert.deepStrictEqual(plain(c.inventiveDocs), []);
});

test('F4: an existing pick can still be removed after the doc stops being selectable', () => {
  // Kravet har allerede valgene; dokumentene blir senere trukket/E.
  const c = { num: 1, dep: null, noveltyDoc: 'D2', inventiveDocs: ['D2', 'D3', 'D4'] };
  core.toggleClaimDoc(c, 'novelty', 'D2', docsF4);     // vanlig, slås av
  assert.strictEqual(c.noveltyDoc, null);
  core.toggleClaimDoc(c, 'inventive', 'D2', docsF4);   // vanlig, slås av
  core.toggleClaimDoc(c, 'inventive', 'D3', docsF4);   // trukket
  core.toggleClaimDoc(c, 'inventive', 'D4', docsF4);   // E, ikke lov for oppfinnelseshøyde
  assert.deepStrictEqual(plain(c.inventiveDocs), []);
  c.noveltyDoc = 'D3';
  core.toggleClaimDoc(c, 'novelty', 'D3', docsF4);     // trukket
  assert.strictEqual(c.noveltyDoc, null);
});

test('F4: removing a stale pick does not re-add it on the next click', () => {
  const c = { num: 1, dep: null, noveltyDoc: null, inventiveDocs: ['D3'] };
  core.toggleClaimDoc(c, 'inventive', 'D3', docsF4);
  core.toggleClaimDoc(c, 'inventive', 'D3', docsF4);
  assert.deepStrictEqual(plain(c.inventiveDocs), []);
});
