'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { wfShouldAutoAsk } = loadFunctions(['wfShouldAutoAsk']);

// Every condition satisfied: folder chosen, browser supports it, access not
// yet granted, no automatic request yet, not dismissed, click not on the bar.
function base(over) {
  return Object.assign({
    supported: true,
    hasHandle: true,
    permGranted: false,
    attempted: false,
    dismissed: false,
    onPermBar: false,
  }, over);
}

test('all conditions hold: first click asks for folder access', () => {
  assert.strictEqual(wfShouldAutoAsk(base()), true);
});

test('File System Access not supported: never asks', () => {
  assert.strictEqual(wfShouldAutoAsk(base({ supported: false })), false);
});

test('no data folder chosen: never asks', () => {
  assert.strictEqual(wfShouldAutoAsk(base({ hasHandle: false })), false);
});

test('permission already granted: does not ask again', () => {
  assert.strictEqual(wfShouldAutoAsk(base({ permGranted: true })), false);
});

test('already attempted this page load (accepted, denied or dismissed prompt): at most one automatic request', () => {
  assert.strictEqual(wfShouldAutoAsk(base({ attempted: true })), false);
});

test('user clicked "Senere" on the bar this session: does not ask', () => {
  assert.strictEqual(wfShouldAutoAsk(base({ dismissed: true })), false);
});

test('click was on the permission bar itself: its own buttons handle it (no double request)', () => {
  assert.strictEqual(wfShouldAutoAsk(base({ onPermBar: true })), false);
});

test('empty object: false', () => {
  assert.strictEqual(wfShouldAutoAsk({}), false);
});

test('missing supported or hasHandle counts as false', () => {
  const noSupported = base();
  delete noSupported.supported;
  assert.strictEqual(wfShouldAutoAsk(noSupported), false);
  const noHandle = base();
  delete noHandle.hasHandle;
  assert.strictEqual(wfShouldAutoAsk(noHandle), false);
});

test('missing negative flags count as false, so only supported + hasHandle is enough', () => {
  assert.strictEqual(wfShouldAutoAsk({ supported: true, hasHandle: true }), true);
});
