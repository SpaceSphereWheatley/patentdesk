'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { toastStackOffset } = loadFunctions(['toastStackOffset']);

test('toastStackOffset: first toast sits at the base offset', () => {
  assert.strictEqual(toastStackOffset(0), 24);
});

test('toastStackOffset: each additional toast stacks above the previous ones', () => {
  assert.strictEqual(toastStackOffset(1), 78);
  assert.strictEqual(toastStackOffset(2), 132);
});

test('toastStackOffset: offsets are strictly increasing so toasts never share a position', () => {
  const offsets = [0, 1, 2, 3].map(toastStackOffset);
  for (let i = 1; i < offsets.length; i++) {
    assert.ok(offsets[i] > offsets[i - 1]);
  }
});
