'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { normalizeTypeBuffers, TYPE_BUFFER_DEFAULTS } = loadFunctions(
  ['normalizeTypeBuffers'],
  { vars: ['TYPE_BUFFER_DEFAULTS', 'TYPE_BUFFER_MAX'] }
);

const plain = (o) => Object.assign({}, o);

test('TYPE_BUFFER_DEFAULTS: no buffer for Ny or Viderebehandling', () => {
  assert.deepStrictEqual(plain(TYPE_BUFFER_DEFAULTS), { ny: 0, viderebehandling: 0 });
});

test('normalizeTypeBuffers falls back to the defaults for missing or invalid input', () => {
  assert.deepStrictEqual(plain(normalizeTypeBuffers(null)), { ny: 0, viderebehandling: 0 });
  assert.deepStrictEqual(plain(normalizeTypeBuffers('x')), { ny: 0, viderebehandling: 0 });
  assert.deepStrictEqual(plain(normalizeTypeBuffers([])), { ny: 0, viderebehandling: 0 });
});

test('normalizeTypeBuffers validates each type on its own, rounding down', () => {
  const r = normalizeTypeBuffers({ ny: 3.9, viderebehandling: -1, oppdrag: 5 });
  assert.deepStrictEqual(plain(r), { ny: 3, viderebehandling: 0 });
  assert.strictEqual(normalizeTypeBuffers({ ny: 90 }).ny, 90);
  assert.strictEqual(normalizeTypeBuffers({ ny: 91 }).ny, 0);
  assert.strictEqual(normalizeTypeBuffers({ ny: '2' }).ny, 0);
});

// Upgrading from the single global buffer must change nothing: the old value
// seeds both types.
test('normalizeTypeBuffers seeds missing types from the legacy global buffer', () => {
  assert.deepStrictEqual(plain(normalizeTypeBuffers(null, 4)), { ny: 4, viderebehandling: 4 });
  assert.deepStrictEqual(plain(normalizeTypeBuffers({ ny: 1 }, 4)), { ny: 1, viderebehandling: 4 });
  assert.deepStrictEqual(plain(normalizeTypeBuffers(null, -2)), { ny: 0, viderebehandling: 0 });
  assert.deepStrictEqual(plain(normalizeTypeBuffers(null, NaN)), { ny: 0, viderebehandling: 0 });
});

const { typeBufferFor, bufferDaysFor } = loadFunctions(
  ['typeBufferFor', 'bufferDaysFor', 'bufferAppliesTo'],
  { globals: { typeBuffers: { ny: 5, viderebehandling: 2 } } }
);

test('typeBufferFor picks the standard buffer for the case\'s status', () => {
  assert.strictEqual(typeBufferFor({ status: 'ny' }), 5);
  assert.strictEqual(typeBufferFor({ status: 'viderebehandling' }), 2);
  assert.strictEqual(typeBufferFor(null), 5);
});

test('bufferDaysFor: own buffer wins, else type standard, and 0 where no buffer applies', () => {
  assert.strictEqual(bufferDaysFor({ type: 'sak', status: 'ny' }), 5);
  assert.strictEqual(bufferDaysFor({ type: 'sak', status: 'viderebehandling' }), 2);
  assert.strictEqual(bufferDaysFor({ type: 'sak', status: 'ny', caseBuffer: 0 }), 0);
  assert.strictEqual(bufferDaysFor({ type: 'sak', status: 'ny', caseBuffer: 9 }), 9);
  assert.strictEqual(bufferDaysFor({ type: 'sak', status: 'fristarkiv', caseBuffer: 9 }), 0);
  assert.strictEqual(bufferDaysFor({ type: 'oppdrag', status: 'ny' }), 0);
});

// ── statusChangePatch ───────────────────────────────

const { statusChangePatch } = loadFunctions(['statusChangePatch', 'normaliseOutcome'], { vars: ['OUTCOMES'] });

// The per-case buffer belongs to the deadline it was set for. Once the status
// changes that deadline has been dealt with, so the case falls back to the
// standard for its new type.
test('statusChangePatch clears the per-case buffer on every status change', () => {
  ['fristarkiv', 'viderebehandling', 'avsluttet', 'ny'].forEach((to) => {
    const p = statusChangePatch(to, null, null);
    assert.ok('caseBuffer' in p, to);
    assert.strictEqual(p.caseBuffer, null, to);
    assert.strictEqual(p.status, to);
  });
});

test('statusChangePatch sets a new due date only when one is given', () => {
  assert.strictEqual(statusChangePatch('fristarkiv', null, '2027-01-10').dueDate, '2027-01-10');
  assert.ok(!('dueDate' in statusChangePatch('fristarkiv', null, null)));
});

test('statusChangePatch keeps a valid outcome only for avsluttet', () => {
  assert.strictEqual(statusChangePatch('avsluttet', 'meddelt', null).outcome, 'meddelt');
  assert.strictEqual(statusChangePatch('viderebehandling', 'meddelt', null).outcome, null);
});

// ── modalCaseBuffer ─────────────────────────────────

const { modalCaseBuffer } = loadFunctions(['modalCaseBuffer']);

test('modalCaseBuffer: unchanged status keeps what the field says', () => {
  assert.strictEqual(modalCaseBuffer({ status: 'ny', caseBuffer: 3 }, 'ny', '3'), 3);
  assert.strictEqual(modalCaseBuffer({ status: 'ny', caseBuffer: 3 }, 'ny', '5'), 5);
  assert.strictEqual(modalCaseBuffer({ status: 'ny', caseBuffer: 3 }, 'ny', ''), null);
});

test('modalCaseBuffer: a status change drops the old buffer left in the field', () => {
  assert.strictEqual(modalCaseBuffer({ status: 'ny', caseBuffer: 3 }, 'viderebehandling', '3'), null);
  assert.strictEqual(modalCaseBuffer({ status: 'ny', caseBuffer: 3 }, 'viderebehandling', ''), null);
});

test('modalCaseBuffer: a status change keeps a new value typed in the same save', () => {
  assert.strictEqual(modalCaseBuffer({ status: 'ny', caseBuffer: 3 }, 'viderebehandling', '1'), 1);
  assert.strictEqual(modalCaseBuffer({ status: 'ny' }, 'viderebehandling', '2'), 2);
});

test('modalCaseBuffer: no buffer for fristarkiv, and negative or junk input is treated as empty or zero', () => {
  assert.strictEqual(modalCaseBuffer({ status: 'ny', caseBuffer: 3 }, 'fristarkiv', '3'), null);
  assert.strictEqual(modalCaseBuffer(null, 'ny', '4'), 4);
  assert.strictEqual(modalCaseBuffer(null, 'ny', '-2'), 0);
  assert.strictEqual(modalCaseBuffer(null, 'ny', '  '), null);
});
