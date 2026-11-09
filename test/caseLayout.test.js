const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { checklistGroupCounts, isChecklistOpen, checklistOpenKey, sakMetaLine } = loadFunctions(
  ['checklistGroupCounts', 'isChecklistOpen', 'checklistOpenKey', 'sakMetaLine'],
  { globals: { toDisplay: (d) => (d ? d.replace(/-/g, '.') : '') } }
);
const { SAK_PHASE_ORDER } = loadFunctions([], { vars: ['SAK_PHASE_ORDER'] });

const J = (x) => JSON.parse(JSON.stringify(x));
const group = { phase: 'Forberedelse', items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };

test('checklistGroupCounts: teller bare avkryssede punkter i gruppen', () => {
  assert.deepStrictEqual(J(checklistGroupCounts({ checklist: { a: true, b: false, z: true } }, group)), { done: 1, total: 3 });
});
test('checklistGroupCounts: tom/manglende data gir 0 av total', () => {
  assert.deepStrictEqual(J(checklistGroupCounts({}, group)), { done: 0, total: 3 });
  assert.deepStrictEqual(J(checklistGroupCounts(null, group)), { done: 0, total: 3 });
});
test('checklistGroupCounts: tom gruppe gir 0/0', () => {
  assert.deepStrictEqual(J(checklistGroupCounts({ checklist: {} }, { items: [] })), { done: 0, total: 0 });
  assert.deepStrictEqual(J(checklistGroupCounts({ checklist: {} }, null)), { done: 0, total: 0 });
});

test('isChecklistOpen: lukket som standard, åpen bare når valgt', () => {
  assert.strictEqual(isChecklistOpen({}, 'Forberedelse'), false);
  assert.strictEqual(isChecklistOpen(null, 'Forberedelse'), false);
  assert.strictEqual(isChecklistOpen({ [checklistOpenKey('Forberedelse')]: true }, 'Forberedelse'), true);
  assert.strictEqual(isChecklistOpen({ [checklistOpenKey('Forberedelse')]: true }, 'Rapport'), false);
});
test('checklistOpenKey: uavhengig av store/små bokstaver og mellomrom', () => {
  assert.strictEqual(checklistOpenKey(' Rapport '), checklistOpenKey('rapport'));
});

test('SAK_PHASE_ORDER: Vurdering først, så Gransking, så Saken', () => {
  assert.deepStrictEqual(J(SAK_PHASE_ORDER), ['vurdering', 'gransking', 'saken']);
});

test('sakMetaLine: tittel, datoer, buffer og medlesing på én linje', () => {
  const m = sakMetaLine({ title: 'Anordning', bufferLabel: '0 dager · standard', filing: '2026-01-02', priority: '', medl: '' });
  assert.deepStrictEqual(J(m), ['Anordning', 'Innlevert 2026.01.02', 'Prioritet —', 'Buffer 0 dager · standard', 'Medlesing —']);
});
test('sakMetaLine: oppdrag viser varighet, ikke datoer/buffer/medlesing', () => {
  const m = sakMetaLine({ title: 'Kvalitet', isOppdrag: true, durationLabel: '3' });
  assert.deepStrictEqual(J(m), ['Kvalitet', 'Varighet 3 arb.dager']);
});
test('sakMetaLine: manglende tittel hoppes over', () => {
  assert.strictEqual(sakMetaLine({ title: '', isOppdrag: true, durationLabel: '2' })[0], 'Varighet 2 arb.dager');
});
