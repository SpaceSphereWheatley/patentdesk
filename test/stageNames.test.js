'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'PatentDesk.html'), 'utf8');
const pipeLabels = [...html.matchAll(/<span class="home-pipe-label"[^>]*>(?:<svg[\s\S]*?<\/svg>\s*)?([^<]+)<\/span>/g)]
  .map((m) => m[1].trim());
const navLabels = [...html.matchAll(/<span class="nav-label">([^<]+)<\/span>/g)].map((m) => m[1].trim());

test('the home flow bar uses the menu names for the three working stages', () => {
  ['Nye saker', 'Fristarkiv', 'Viderebehandling'].forEach((name) => {
    assert.ok(navLabels.includes(name), name + ' is a menu item');
    assert.ok(pipeLabels.includes(name), name + ' heads a flow-bar card');
  });
});

test('the old flow-bar names are gone', () => {
  ['1. brev', 'Venter på svar', 'Svarrunder'].forEach((old) =>
    assert.ok(!pipeLabels.includes(old), old + ' still heads a flow-bar card'));
});
