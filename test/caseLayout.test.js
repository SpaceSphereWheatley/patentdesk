const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const fs = require('fs');
const path = require('path');
const { checklistGroupCounts, isChecklistOpen, checklistOpenKey, sakMetaLine, claimsTableShown } = loadFunctions(
  ['checklistGroupCounts', 'isChecklistOpen', 'checklistOpenKey', 'sakMetaLine', 'claimsTableShown'],
  { globals: { toDisplay: (d) => (d ? d.replace(/-/g, '.') : '') } }
);

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

// Rekkefølgen styres av markeringen i src/index.html; testen leser den derfra,
// så en tilbakestilt rekkefølge feiler.
test('saksvisningen: Vurdering står før Gransking, som står før Saken', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
  const pos = (name) => html.indexOf('<section class="sak-phase" data-phase="' + name + '"');
  assert.ok(pos('vurdering') > -1 && pos('gransking') > -1 && pos('saken') > -1);
  assert.ok(pos('vurdering') < pos('gransking'));
  assert.ok(pos('gransking') < pos('saken'));
});
test('ankerne i sticky-baren følger samme rekkefølge', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
  const names = [...html.matchAll(/class="sak-anchor" data-anchor="(\w+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(names, ['vurdering', 'gransking', 'saken']);
});

test('claimsTableShown: tabellen vises bare med minst ett krav', () => {
  assert.strictEqual(claimsTableShown({ numClaims: 0 }), false);
  assert.strictEqual(claimsTableShown({}), false);
  assert.strictEqual(claimsTableShown({ numClaims: null }), false);
  assert.strictEqual(claimsTableShown({ numClaims: 1 }), true);
  assert.strictEqual(claimsTableShown({ numClaims: 12 }), true);
});

test('sakMetaLine: viser bare feltene som har data', () => {
  const m = sakMetaLine({ title: 'Anordning', bufferLabel: '0 dager · standard', filing: '2026-01-02', priority: '', medl: '' });
  assert.deepStrictEqual(J(m), ['Anordning', 'Innlevert 2026.01.02', 'Buffer 0 dager · standard']);
});
test('sakMetaLine: alle felt med data kommer i fast rekkefølge', () => {
  const m = sakMetaLine({ title: 'T', bufferLabel: '1 dag · egen', filing: '2026-01-02', priority: '2025-06-30', medl: 'Kari · 2026.11.01' });
  assert.deepStrictEqual(J(m), ['T', 'Innlevert 2026.01.02', 'Prioritet 2025.06.30', 'Buffer 1 dag · egen', 'Medlesing Kari · 2026.11.01']);
});
test('sakMetaLine: ingen «—»-plassholdere når datoer og medlesing mangler', () => {
  const m = sakMetaLine({ title: '', bufferLabel: '0 dager · standard', filing: '', priority: null, medl: '' });
  assert.deepStrictEqual(J(m), ['Buffer 0 dager · standard']);
  assert.ok(!J(m).join(' ').includes('—'));
});
test('sakMetaLine: felt med bare mellomrom regnes som tomme', () => {
  const m = sakMetaLine({ title: '   ', bufferLabel: '0 dager · standard', filing: '', priority: '', medl: '  ' });
  assert.deepStrictEqual(J(m), ['Buffer 0 dager · standard']);
});
test('sakMetaLine: oppdrag viser varighet, ikke datoer/buffer/medlesing', () => {
  const m = sakMetaLine({ title: 'Kvalitet', isOppdrag: true, durationLabel: '3 arb.dager' });
  assert.deepStrictEqual(J(m), ['Kvalitet', 'Varighet 3 arb.dager']);
});
test('sakMetaLine: manglende tittel hoppes over', () => {
  assert.strictEqual(sakMetaLine({ title: '', isOppdrag: true, durationLabel: '2 arb.dager (standard)' })[0], 'Varighet 2 arb.dager (standard)');
});
