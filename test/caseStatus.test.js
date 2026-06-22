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
