'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { caseMedlFor, setCaseMedlesing, medlReaderChoices } = loadFunctions([
  '_medlKey', 'caseMedlFor', 'setCaseMedlesing', 'medlReaderChoices'
]);

// Objekter fra vm-sandkassen har en annen Object-prototype; sammenlign kopier.
const plain = (x) => JSON.parse(JSON.stringify(x));

function c(overrides) {
  return Object.assign({ id: 'a', caseNumber: 'NO20250001', status: 'avsluttet', type: 'sak', title: 'T' }, overrides);
}
function e(overrides) {
  return Object.assign({ id: 'm1', caseId: 'a', caseNumber: 'NO20250001', reader: 'Kari', sent: '2026-03-01', returned: '2026-03-05' }, overrides);
}

// ── caseMedlFor ─────────────────────────────────────

test('caseMedlFor: the latest entry for the case, or null', () => {
  const log = [e({ id: 'm1', sent: '2026-03-01' }), e({ id: 'm2', sent: '2026-06-01' }), e({ id: 'm3', caseId: 'b', sent: '2026-09-01' })];
  assert.strictEqual(caseMedlFor(log, 'a').id, 'm2');
  assert.strictEqual(caseMedlFor(log, 'b').id, 'm3');
  assert.strictEqual(caseMedlFor(log, 'x'), null);
  assert.strictEqual(caseMedlFor([], 'a'), null);
});

// ── setCaseMedlesing ────────────────────────────────

test('setCaseMedlesing: adds a closed entry on a case without one (any status)', () => {
  const r = setCaseMedlesing([], c(), 'Ola', '2025-11-12', 'new1');
  assert.deepStrictEqual(plain(r), [{ id: 'new1', caseId: 'a', caseNumber: 'NO20250001', reader: 'Ola', sent: '2025-11-12', returned: '2025-11-12' }]);
});

test('setCaseMedlesing: corrects the existing entry instead of adding a second', () => {
  const log = [e()];
  const r = setCaseMedlesing(log, c(), 'Ola', '2026-03-02', 'new1');
  assert.strictEqual(r.length, 1);
  assert.deepStrictEqual(plain(r[0]), plain(e({ reader: 'Ola', sent: '2026-03-02' })));
  assert.strictEqual(log[0].reader, 'Kari', 'input not mutated');
});

test('setCaseMedlesing: an open entry stays open (still with the reader)', () => {
  const r = setCaseMedlesing([e({ returned: null })], c({ status: 'ny' }), 'Ola', '2026-03-02', 'new1');
  assert.strictEqual(r[0].returned, null);
  assert.strictEqual(r[0].reader, 'Ola');
});

test('setCaseMedlesing: return date is never before the new date', () => {
  const r = setCaseMedlesing([e()], c(), 'Kari', '2026-04-01', 'new1');
  assert.strictEqual(r[0].returned, '2026-04-01');
});

test('setCaseMedlesing: only the latest entry is corrected', () => {
  const log = [e({ id: 'm1', sent: '2026-01-01' }), e({ id: 'm2', sent: '2026-06-01', returned: '2026-06-03' })];
  const r = setCaseMedlesing(log, c(), 'Ola', '2026-06-02', 'new1');
  assert.strictEqual(r[0], log[0]);
  assert.strictEqual(r[1].reader, 'Ola');
});

test('setCaseMedlesing: no reader removes the case\'s entries, others kept', () => {
  const other = e({ id: 'm9', caseId: 'b' });
  const r = setCaseMedlesing([e({ id: 'm1' }), e({ id: 'm2' }), other], c(), '', '', 'new1');
  assert.deepStrictEqual(plain(r), [plain(other)]);
});

test('setCaseMedlesing: same array back when nothing changes', () => {
  const log = [e()];
  assert.strictEqual(setCaseMedlesing(log, c(), 'Kari', '2026-03-01', 'new1'), log);
  assert.strictEqual(setCaseMedlesing(log, c({ id: 'b' }), '  ', '', 'new1'), log);
});

test('setCaseMedlesing: trims the reader name', () => {
  const r = setCaseMedlesing([], c(), '  Ola ', '2026-01-01', 'n');
  assert.strictEqual(r[0].reader, 'Ola');
});

// ── medlReaderChoices ───────────────────────────────

test('medlReaderChoices: active first, then inactive', () => {
  const list = [{ name: 'Per', active: false }, { name: 'Kari', active: true }, { name: 'Ola', active: true }];
  assert.deepStrictEqual(plain(medlReaderChoices(list, '')), [
    { name: 'Kari', active: true }, { name: 'Ola', active: true }, { name: 'Per', active: false }
  ]);
});

test('medlReaderChoices: a current reader no longer on the list is still offered', () => {
  const list = [{ name: 'Kari', active: true }];
  assert.deepStrictEqual(plain(medlReaderChoices(list, 'Gunn')), [{ name: 'Kari', active: true }, { name: 'Gunn', active: false }]);
  assert.strictEqual(medlReaderChoices(list, 'kari').length, 1, 'case-insensitive match');
});

// ── modalFallbackStatus ─────────────────────────────
// «Rediger sak» har ingen knapp for Avsluttet. Uten avkrysset knapp ble en
// avsluttet sak lagret som Ny; den skal beholde statusen sin.

const { modalFallbackStatus } = loadFunctions(['modalFallbackStatus']);

test('modalFallbackStatus: a closed case stays closed when edited', () => {
  assert.strictEqual(modalFallbackStatus(c({ status: 'avsluttet' })), 'avsluttet');
});

test('modalFallbackStatus: otherwise Ny (new case, or nothing to keep)', () => {
  assert.strictEqual(modalFallbackStatus(null), 'ny');
  assert.strictEqual(modalFallbackStatus(c({ status: 'ny' })), 'ny');
});
