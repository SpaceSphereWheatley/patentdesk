'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { medlesingTemplateFor, medlesingProgress, MEDLESING_TEMPLATE_NORMAL, MEDLESING_TEMPLATE_MEDIUM_STOR } = loadFunctions(
  ['medlesingTemplateFor', 'medlesingProgress'],
  { vars: ['MEDLESING_FASER_FELLES', 'MEDLESING_TEMPLATE_NORMAL', 'MEDLESING_TEMPLATE_MEDIUM_STOR'] }
);

test('medlesingTemplateFor returns the normal template by default', () => {
  assert.strictEqual(medlesingTemplateFor('normal'), MEDLESING_TEMPLATE_NORMAL);
  assert.strictEqual(medlesingTemplateFor(undefined), MEDLESING_TEMPLATE_NORMAL);
});

test('medlesingTemplateFor returns the medium/stor template', () => {
  assert.strictEqual(medlesingTemplateFor('medium_stor'), MEDLESING_TEMPLATE_MEDIUM_STOR);
});

test('the medium/stor template includes every shared phase from the normal template', () => {
  const normalPhases = MEDLESING_TEMPLATE_NORMAL.map((p) => p.phase);
  const mediumPhases = MEDLESING_TEMPLATE_MEDIUM_STOR.map((p) => p.phase);
  normalPhases.forEach((phase) => assert.ok(mediumPhases.includes(phase)));
  // Medium/stor has extra phases on top of the shared ones
  assert.ok(mediumPhases.length > normalPhases.length);
});

test('medlesingProgress counts checked items against the template total', () => {
  const template = MEDLESING_TEMPLATE_NORMAL;
  const total = template.reduce((n, phase) => n + phase.items.length, 0);
  const firstId = template[0].items[0].id;
  const progress = medlesingProgress(template, { [firstId]: true });
  assert.strictEqual(progress.total, total);
  assert.strictEqual(progress.checked, 1);
  assert.strictEqual(progress.done, false);
});

test('medlesingProgress is done only when every item is checked', () => {
  const template = MEDLESING_TEMPLATE_NORMAL;
  const allChecked = {};
  template.forEach((phase) => phase.items.forEach((item) => { allChecked[item.id] = true; }));
  assert.strictEqual(medlesingProgress(template, allChecked).done, true);
});

test('medlesingProgress handles a missing checklist gracefully', () => {
  const progress = medlesingProgress(MEDLESING_TEMPLATE_NORMAL, undefined);
  assert.strictEqual(progress.checked, 0);
  assert.strictEqual(progress.done, false);
});
