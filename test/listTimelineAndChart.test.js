const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

let store = {};
const g = { _lsGet: (k) => (k in store ? store[k] : null), _lsSet: (k, v) => { store[k] = v; } };
const { casesTlCollapsed, setCasesTlCollapsed, chartIsEmpty } = loadFunctions(
  ['casesTlCollapsed', 'setCasesTlCollapsed', 'chartIsEmpty'],
  { globals: g, vars: ['CASES_TL_KEY'] }
);

test('casesTlCollapsed: åpen som standard', () => {
  store = {};
  assert.strictEqual(casesTlCollapsed(), false);
});
test('casesTlCollapsed: husker valget', () => {
  store = {};
  setCasesTlCollapsed(true);
  assert.strictEqual(casesTlCollapsed(), true);
  assert.strictEqual(store.pt_cases_tl_collapsed, '1');
  setCasesTlCollapsed(false);
  assert.strictEqual(casesTlCollapsed(), false);
});
test('casesTlCollapsed: ugyldig lagret verdi regnes som åpen', () => {
  store = { pt_cases_tl_collapsed: 'banan' };
  assert.strictEqual(casesTlCollapsed(), false);
});

test('chartIsEmpty: ingen nybehandlinger og ingen prognose er tomt', () => {
  assert.strictEqual(chartIsEmpty([0, 0, 0], false), true);
  assert.strictEqual(chartIsEmpty([], false), true);
});
test('chartIsEmpty: data eller prognose gir ikke tom tilstand', () => {
  assert.strictEqual(chartIsEmpty([0, 2, 0], false), false);
  assert.strictEqual(chartIsEmpty([0, 0, 0], true), false);
});
