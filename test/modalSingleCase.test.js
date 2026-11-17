'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const plain = (v) => JSON.parse(JSON.stringify(v));

// ── «Lagre sak»-knappen etter fanebytte ───────────────────────
const { modalSaveButtonState } = loadFunctions(['modalSaveButtonState']);

test('modalSaveButtonState: «Én sak» is always enabled, even after the bulk tab disabled it', () => {
  assert.deepStrictEqual(plain(modalSaveButtonState(false, 0)), { text: 'Lagre sak', disabled: false });
  assert.deepStrictEqual(plain(modalSaveButtonState(false, 5)), { text: 'Lagre sak', disabled: false });
});

test('modalSaveButtonState: «Flere saker» is disabled until a row is picked', () => {
  assert.deepStrictEqual(plain(modalSaveButtonState(true, 0)), { text: 'Legg til saker', disabled: true });
  assert.deepStrictEqual(plain(modalSaveButtonState(true, 3)), { text: 'Legg til 3 saker', disabled: false });
});

// ── «Én sak» i forhåndsvisningen av tidslinjen ────────────────
const { singleCaseDraftRow } = loadFunctions(['singleCaseDraftRow', 'isValidDate', 'parseDate']);

test('singleCaseDraftRow: a new Ny case with a valid date gives a draft row', () => {
  assert.deepStrictEqual(plain(singleCaseDraftRow({ cn: '20261450', title: 'T', date: '2027.01.15', status: 'ny' })),
    { cn: '20261450', title: 'T', date: '2027-01-15', checked: true, type: 'sak', status: 'ny', duration: null });
});

test('singleCaseDraftRow: keeps the chosen status, so Fristarkiv draws as a milestone and Viderebehandling with its own window', () => {
  assert.strictEqual(singleCaseDraftRow({ cn: '1', date: '2027-01-15', status: 'fristarkiv' }).status, 'fristarkiv');
  assert.strictEqual(singleCaseDraftRow({ cn: '1', date: '2027-01-15', status: 'viderebehandling' }).status, 'viderebehandling');
});

test('singleCaseDraftRow: Oppdrag carries its duration and is drawn as an oppdrag', () => {
  const r = singleCaseDraftRow({ cn: '1', date: '2027-01-15', status: 'oppdrag', duration: '4' });
  assert.strictEqual(r.type, 'oppdrag');
  assert.strictEqual(r.duration, 4);
  assert.strictEqual(singleCaseDraftRow({ cn: '1', date: '2027-01-15', status: 'oppdrag', duration: '' }).duration, null);
});

test('singleCaseDraftRow: no draft without a valid date, or when editing a case already on the timeline', () => {
  assert.strictEqual(singleCaseDraftRow({ cn: '1', date: '', status: 'ny' }), null);
  assert.strictEqual(singleCaseDraftRow({ cn: '1', date: '2027.02.31', status: 'ny' }), null);
  assert.strictEqual(singleCaseDraftRow({ cn: '1', date: '2027.01', status: 'ny' }), null);
  assert.strictEqual(singleCaseDraftRow({ cn: '1', date: '2027-01-15', status: 'ny', editing: true }), null);
});

test('singleCaseDraftRow: an empty case number still draws (shown as «?»)', () => {
  assert.strictEqual(singleCaseDraftRow({ cn: '', date: '2027-01-15', status: 'ny' }).cn, '');
});
