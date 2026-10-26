'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { normalizeSettingsTab, stepSettingsTab, SETTINGS_TABS } = loadFunctions(
  ['normalizeSettingsTab', 'stepSettingsTab'],
  { vars: ['SETTINGS_TABS'] }
);

test('SETTINGS_TABS starts with Produksjon and has unique ids', () => {
  assert.strictEqual(SETTINGS_TABS[0], 'produksjon');
  assert.strictEqual(new Set(SETTINGS_TABS).size, SETTINGS_TABS.length);
});

test('normalizeSettingsTab keeps a known tab', () => {
  SETTINGS_TABS.forEach((id) => assert.strictEqual(normalizeSettingsTab(id), id));
});

test('normalizeSettingsTab falls back to the first tab for unknown or missing ids', () => {
  assert.strictEqual(normalizeSettingsTab(null), 'produksjon');
  assert.strictEqual(normalizeSettingsTab(''), 'produksjon');
  assert.strictEqual(normalizeSettingsTab('finnes-ikke'), 'produksjon');
  assert.strictEqual(normalizeSettingsTab(3), 'produksjon');
});

test('stepSettingsTab moves to the next and previous tab', () => {
  assert.strictEqual(stepSettingsTab(SETTINGS_TABS[0], 1), SETTINGS_TABS[1]);
  assert.strictEqual(stepSettingsTab(SETTINGS_TABS[2], -1), SETTINGS_TABS[1]);
});

test('stepSettingsTab wraps around at both ends', () => {
  const last = SETTINGS_TABS[SETTINGS_TABS.length - 1];
  assert.strictEqual(stepSettingsTab(last, 1), SETTINGS_TABS[0]);
  assert.strictEqual(stepSettingsTab(SETTINGS_TABS[0], -1), last);
});

test('stepSettingsTab starts from the first tab when the current id is unknown', () => {
  assert.strictEqual(stepSettingsTab('finnes-ikke', 1), SETTINGS_TABS[1]);
});
