'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { normalizeSettingsTab, stepSettingsTab, SETTINGS_TABS } = loadFunctions(
  ['normalizeSettingsTab', 'stepSettingsTab'],
  { vars: ['SETTINGS_TABS', 'SETTINGS_TAB_LEGACY'] }
);

test('SETTINGS_TABS is the three main sections in menu order', () => {
  assert.deepStrictEqual(Array.from(SETTINGS_TABS), ['arbeidsmengde', 'saksbehandling', 'data']);
});

test('normalizeSettingsTab keeps a known tab', () => {
  SETTINGS_TABS.forEach((id) => assert.strictEqual(normalizeSettingsTab(id), id));
});

test('normalizeSettingsTab falls back to the first tab for unknown or missing ids', () => {
  assert.strictEqual(normalizeSettingsTab(null), 'arbeidsmengde');
  assert.strictEqual(normalizeSettingsTab(''), 'arbeidsmengde');
  assert.strictEqual(normalizeSettingsTab('finnes-ikke'), 'arbeidsmengde');
  assert.strictEqual(normalizeSettingsTab(3), 'arbeidsmengde');
});

test('normalizeSettingsTab maps a stored sub-section from v4.35.0 to its main section', () => {
  assert.strictEqual(normalizeSettingsTab('produksjon'), 'arbeidsmengde');
  assert.strictEqual(normalizeSettingsTab('ferie'), 'arbeidsmengde');
  assert.strictEqual(normalizeSettingsTab('medlesere'), 'saksbehandling');
  assert.strictEqual(normalizeSettingsTab('sjekkliste'), 'saksbehandling');
  assert.strictEqual(normalizeSettingsTab('cpc'), 'saksbehandling');
  assert.strictEqual(normalizeSettingsTab('sikkerhetskopi'), 'data');
  assert.strictEqual(normalizeSettingsTab('faresone'), 'data');
  assert.strictEqual(normalizeSettingsTab('om'), 'data');
});

test('stepSettingsTab moves to the next and previous tab', () => {
  assert.strictEqual(stepSettingsTab('arbeidsmengde', 1), 'saksbehandling');
  assert.strictEqual(stepSettingsTab('data', -1), 'saksbehandling');
});

test('stepSettingsTab wraps around at both ends', () => {
  assert.strictEqual(stepSettingsTab('data', 1), 'arbeidsmengde');
  assert.strictEqual(stepSettingsTab('arbeidsmengde', -1), 'data');
});

test('stepSettingsTab starts from the first tab when the current id is unknown', () => {
  assert.strictEqual(stepSettingsTab('finnes-ikke', 1), 'saksbehandling');
});
