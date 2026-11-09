'use strict';
// Nullstill-knappen (↺) i «Avh. av»: vises bare når kravet er satt manuelt,
// aldri på krav 1, og ligger utenfor Tab-rekkefølgen.
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { depResetHtml, depResetAriaLabel } = loadFunctions(['esc', 'depResetHtml', 'depResetAriaLabel']);

function claim(over) {
  return Object.assign({ num: 3, dep: 1, depManual: false }, over);
}

test('depResetAriaLabel: navngir kravet og handlingen', () => {
  assert.strictEqual(depResetAriaLabel(4), 'Krav 4 — tilbake til automatisk tilhørighet');
});

test('depResetHtml: automatisk krav har ingen knapp', () => {
  assert.strictEqual(depResetHtml(claim({ depManual: false })), '');
  assert.strictEqual(depResetHtml(claim({ dep: null, depManual: false })), '');
});

test('depResetHtml: manuelt uselvstendig krav får knappen', () => {
  const html = depResetHtml(claim({ num: 4, dep: 2, depManual: true }));
  assert.match(html, /^<button type="button" class="sak-dep-reset"/);
  assert.match(html, /data-claim-dep-reset="4"/);
  assert.match(html, /aria-label="Krav 4 — tilbake til automatisk tilhørighet"/);
  assert.match(html, /title="[^"]+"/);
  assert.match(html, />↺<\/button>$/);
});

test('depResetHtml: manuelt selvstendig krav får også knappen', () => {
  assert.match(depResetHtml(claim({ num: 5, dep: null, depManual: true })), /data-claim-dep-reset="5"/);
});

test('depResetHtml: krav 1 får aldri knappen', () => {
  assert.strictEqual(depResetHtml(claim({ num: 1, dep: null, depManual: true })), '');
});

test('depResetHtml: knappen har ingen egen Tab-stopp', () => {
  assert.match(depResetHtml(claim({ depManual: true })), /tabindex="-1"/);
});
