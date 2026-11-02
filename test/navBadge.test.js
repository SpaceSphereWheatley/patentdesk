'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { navHasBadge } = loadFunctions(['navHasBadge'], { vars: ['NAV_PAGES_WITHOUT_BADGE'] });

test('work lists and Medlesing carry a count badge', () => {
  ['ny', 'viderebehandling', 'oppdrag', 'fristarkiv', 'medlesing'].forEach((p) =>
    assert.strictEqual(navHasBadge(p), true, p));
});

test('Alle saker has no badge — its list is every case, so a count of closed cases misleads', () => {
  assert.strictEqual(navHasBadge('avsluttet'), false);
});

test('pages that are not case lists have no badge', () => {
  ['hjem', 'statistikk', 'innstillinger'].forEach((p) =>
    assert.strictEqual(navHasBadge(p), false, p));
});
