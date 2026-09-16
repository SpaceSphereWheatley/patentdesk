'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { claimKeyAction } = loadFunctions(['claimKeyAction']);

// Kravtabellen er tabellen man går gjennom tjue ganger på rad, så den skal
// kunne betjenes uten å flytte hånden til musa. Kartet er rent og testbart;
// selve tastelytteren gjør bare oppslaget.

test('claimKeyAction: j og k flytter mellom krav', () => {
  assert.deepStrictEqual(Object.assign({}, claimKeyAction('j')), { type: 'move', delta: 1 });
  assert.deepStrictEqual(Object.assign({}, claimKeyAction('k')), { type: 'move', delta: -1 });
});

test('claimKeyAction: piltaster gjør det samme som j og k', () => {
  assert.deepStrictEqual(Object.assign({}, claimKeyAction('ArrowDown')), { type: 'move', delta: 1 });
  assert.deepStrictEqual(Object.assign({}, claimKeyAction('ArrowUp')), { type: 'move', delta: -1 });
});

test('claimKeyAction: 1, 2 og 3 velger kolonne', () => {
  assert.deepStrictEqual(Object.assign({}, claimKeyAction('1')), { type: 'field', field: 'novelty' });
  assert.deepStrictEqual(Object.assign({}, claimKeyAction('2')), { type: 'field', field: 'inventive' });
  assert.deepStrictEqual(Object.assign({}, claimKeyAction('3')), { type: 'field', field: 'formal' });
});

test('claimKeyAction: y, n og ? setter verdien direkte', () => {
  assert.deepStrictEqual(Object.assign({}, claimKeyAction('y')), { type: 'set', value: true });
  assert.deepStrictEqual(Object.assign({}, claimKeyAction('n')), { type: 'set', value: false });
  assert.deepStrictEqual(Object.assign({}, claimKeyAction('?')), { type: 'set', value: null });
});

test('claimKeyAction: store bokstaver virker like godt', () => {
  assert.deepStrictEqual(Object.assign({}, claimKeyAction('J')), { type: 'move', delta: 1 });
  assert.deepStrictEqual(Object.assign({}, claimKeyAction('Y')), { type: 'set', value: true });
});

test('claimKeyAction: mellomrom veksler verdien i valgt kolonne', () => {
  assert.deepStrictEqual(Object.assign({}, claimKeyAction(' ')), { type: 'toggle' });
});

test('claimKeyAction: Escape forlater tastaturmodus', () => {
  assert.deepStrictEqual(Object.assign({}, claimKeyAction('Escape')), { type: 'exit' });
});

test('claimKeyAction: alt annet gir null, så tasten går videre som normalt', () => {
  ['a', 'x', '9', 'Enter', 'Tab', 'F5', ''].forEach((k) => {
    assert.strictEqual(claimKeyAction(k), null, 'tasten ' + JSON.stringify(k));
  });
});
