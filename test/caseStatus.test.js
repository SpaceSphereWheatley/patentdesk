'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { encodeCase, decodeCase } = loadFunctions(
  ['encodeCase', 'decodeCase'],
  { vars: ['STATUS_CONFIG', 'INT_TO_STATUS'] }
);

test('encodeCase maps a string status to its compact integer form', () => {
  const c = { id: '1', status: 'fristarkiv' };
  assert.strictEqual(encodeCase(c).status, 2);
});

test('encodeCase leaves an already-unknown status untouched', () => {
  const c = { id: '1', status: 'oppdrag' };
  assert.strictEqual(encodeCase(c).status, 'oppdrag');
});

test('decodeCase maps an integer status back to its string form', () => {
  const c = { id: '1', status: 2 };
  assert.strictEqual(decodeCase(c).status, 'fristarkiv');
});

test('decodeCase defaults to "ny" when status is missing', () => {
  assert.strictEqual(decodeCase({ id: '1' }).status, 'ny');
});

test('encodeCase and decodeCase round-trip every known status', () => {
  ['ny', 'viderebehandling', 'fristarkiv', 'avsluttet'].forEach((status) => {
    const encoded = encodeCase({ id: '1', status });
    assert.strictEqual(decodeCase(encoded).status, status);
  });
});

// ── statusTransition ───────────────────────────────
// Beskriver hva en overgang fra én status til en annen krever. Matrisen her er
// fasiten som både sakslista og statusknappene på sakssiden skal følge.

const { statusTransition } = loadFunctions(
  ['statusTransition'],
  { vars: ['FRIST_NY_TIL_FRISTARKIV', 'FRIST_FRISTARKIV_TIL_VIDERE', 'FRIST_VIDERE_TIL_FRISTARKIV'] }
);

test('statusTransition: en overgang til samme status er ingen overgang', () => {
  assert.strictEqual(statusTransition('ny', 'ny', false), null);
  assert.strictEqual(statusTransition('fristarkiv', 'fristarkiv', false), null);
});

test('statusTransition: manglende målstatus gir null', () => {
  assert.strictEqual(statusTransition('ny', null, false), null);
  assert.strictEqual(statusTransition('ny', '', false), null);
});

test('Ny → Fristarkiv: bekreftelse, stikkord og ny frist — og teller som nybehandling', () => {
  const t = statusTransition('ny', 'fristarkiv', false);
  assert.strictEqual(t.needsConfirm, true);
  assert.strictEqual(t.needsTags, true);
  assert.strictEqual(t.needsDueDate, true);
  assert.strictEqual(t.suggestMonths, 6);
  assert.strictEqual(t.logType, 'ny');
});

test('Ny → Fristarkiv: fristteksten nevner det foreslåtte antallet måneder', () => {
  const t = statusTransition('ny', 'fristarkiv', false);
  assert.match(t.dueDateDesc, /Foreslått frist er 6 måneder fra i dag/);
  assert.match(t.confirmDesc, /nybehandlet/);
});

test('Viderebehandling → Fristarkiv: ny frist, men ingen bekreftelse eller stikkord', () => {
  const t = statusTransition('viderebehandling', 'fristarkiv', false);
  assert.strictEqual(t.needsConfirm, false);
  assert.strictEqual(t.needsTags, false);
  assert.strictEqual(t.needsDueDate, true);
  assert.strictEqual(t.suggestMonths, 6);
  assert.strictEqual(t.logType, 'videre');
});

test('Fristarkiv → Viderebehandling: ny frist, og teller ikke i statistikken', () => {
  const t = statusTransition('fristarkiv', 'viderebehandling', false);
  assert.strictEqual(t.needsDueDate, true);
  assert.strictEqual(t.suggestMonths, 3);
  assert.strictEqual(t.logType, null);
});

test('Alt → Avsluttet: stikkord, men ingen ny frist', () => {
  ['ny', 'fristarkiv', 'viderebehandling'].forEach((from) => {
    const t = statusTransition(from, 'avsluttet', false);
    assert.strictEqual(t.needsTags, true, from);
    assert.strictEqual(t.needsDueDate, false, from);
    assert.strictEqual(t.logType, 'avsluttet', from);
  });
});

test('Oppdrag → Avsluttet: rett igjennom, og bokføres som oppdrag', () => {
  const t = statusTransition('ny', 'avsluttet', true);
  assert.strictEqual(t.needsTags, false);
  assert.strictEqual(t.needsDueDate, false);
  assert.strictEqual(t.logType, 'oppdrag');
});

test('Oppdrag: gjenåpning krever ingen dialog og teller ikke', () => {
  const t = statusTransition('avsluttet', 'ny', true);
  assert.strictEqual(t.needsDueDate, false);
  assert.strictEqual(t.logType, null);
});

test('Bakoverrettede flyttinger spør ikke om frist og teller ikke i statistikken', () => {
  [['fristarkiv', 'ny'], ['viderebehandling', 'ny'], ['avsluttet', 'ny']].forEach(([from, to]) => {
    const t = statusTransition(from, to, false);
    assert.strictEqual(t.needsDueDate, false, from + '→' + to);
    assert.strictEqual(t.needsTags, false, from + '→' + to);
    assert.strictEqual(t.logType, null, from + '→' + to);
  });
});

test('Ny → Viderebehandling hopper over Fristarkiv og teller derfor ikke', () => {
  const t = statusTransition('ny', 'viderebehandling', false);
  assert.strictEqual(t.needsDueDate, false);
  assert.strictEqual(t.logType, null);
});

test('statusTransition: en frist foreslås aldri uten at needsDueDate er satt', () => {
  ['ny', 'fristarkiv', 'viderebehandling', 'avsluttet'].forEach((from) => {
    ['ny', 'fristarkiv', 'viderebehandling', 'avsluttet'].forEach((to) => {
      const t = statusTransition(from, to, false);
      if (t && !t.needsDueDate) assert.strictEqual(t.suggestMonths, 0, from + '→' + to);
    });
  });
});
