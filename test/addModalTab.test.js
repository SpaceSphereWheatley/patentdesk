'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { defaultAddTab, addButtonLabel } = loadFunctions(['defaultAddTab', 'addButtonLabel']);

test('defaultAddTab opens «Flere saker» from the overview and the new-case pages', () => {
  ['hjem', 'ny', 'avsluttet', 'statistikk', 'innstillinger', 'sak', 'medlesing'].forEach((page) => {
    assert.strictEqual(defaultAddTab(page), 'bulk', page);
  });
});

test('defaultAddTab keeps «Én sak» where bulk would give the wrong status or type', () => {
  // «Flere saker» legger alltid inn Ny søknader, og oppdrag legges inn ett og ett
  ['fristarkiv', 'viderebehandling', 'oppdrag'].forEach((page) => {
    assert.strictEqual(defaultAddTab(page), 'sak', page);
  });
});

test('addButtonLabel follows the tab the button opens', () => {
  assert.strictEqual(addButtonLabel('ny'), '+ Legg til saker');
  assert.strictEqual(addButtonLabel('hjem'), '+ Legg til saker');
  assert.strictEqual(addButtonLabel('fristarkiv'), '+ Legg til sak');
  assert.strictEqual(addButtonLabel('oppdrag'), '+ Legg til sak');
});
