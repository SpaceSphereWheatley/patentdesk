const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

// CHECKLIST_PHASE_MAP hentes fra filen, slik at testen følger den ekte tabellen.
const fns = loadFunctions(
  ['checklistGroupPhase', 'groupChecklistByPhase', 'savedLabelText'],
  { vars: ['CHECKLIST_PHASE_MAP'] }
);

const { checklistGroupPhase, groupChecklistByPhase, savedLabelText } = fns;

// ── checklistGroupPhase ──────────────────────────────────────────────────────

test('checklistGroupPhase: standardmalens tre grupper treffer hver sin fase', () => {
  assert.strictEqual(checklistGroupPhase('Forberedelse'), 'saken');
  assert.strictEqual(checklistGroupPhase('Gransking'), 'gransking');
  assert.strictEqual(checklistGroupPhase('Rapport'), 'vurdering');
});

test('checklistGroupPhase: ser bort fra store/små bokstaver og mellomrom', () => {
  assert.strictEqual(checklistGroupPhase('  GRANSKING '), 'gransking');
  assert.strictEqual(checklistGroupPhase('rapport'), 'vurdering');
});

test('checklistGroupPhase: ukjent gruppenavn gir null', () => {
  assert.strictEqual(checklistGroupPhase('Mine egne punkter'), null);
  assert.strictEqual(checklistGroupPhase(''), null);
  assert.strictEqual(checklistGroupPhase(null), null);
  assert.strictEqual(checklistGroupPhase(undefined), null);
});

test('checklistGroupPhase: treffer ikke på delstreng', () => {
  assert.strictEqual(checklistGroupPhase('Gransking av formalia'), null);
  assert.strictEqual(checklistGroupPhase('Rapportutkast'), null);
});

// ── groupChecklistByPhase ────────────────────────────────────────────────────

const std = [
  { phase: 'Forberedelse', items: [{ id: 'a', label: 'A' }] },
  { phase: 'Gransking',    items: [{ id: 'b', label: 'B' }] },
  { phase: 'Rapport',      items: [{ id: 'c', label: 'C' }] }
];

test('groupChecklistByPhase: standardmalen fordeles på de tre fasene', () => {
  const g = groupChecklistByPhase(std);
  assert.strictEqual(g.saken.length, 1);
  assert.strictEqual(g.gransking.length, 1);
  assert.strictEqual(g.vurdering.length, 1);
  assert.strictEqual(g.rest.length, 0);
  assert.strictEqual(g.saken[0].phase, 'Forberedelse');
  assert.strictEqual(g.vurdering[0].phase, 'Rapport');
});

test('groupChecklistByPhase: ukjente grupper havner i rest, ikke på gulvet', () => {
  const g = groupChecklistByPhase([
    { phase: 'Forberedelse', items: [{ id: 'a' }] },
    { phase: 'Mitt eget steg', items: [{ id: 'x' }] },
    { phase: 'Enda et', items: [{ id: 'y' }] }
  ]);
  assert.strictEqual(g.saken.length, 1);
  assert.strictEqual(g.rest.length, 2);
  assert.strictEqual(g.gransking.length, 0);
  assert.strictEqual(g.vurdering.length, 0);
});

test('groupChecklistByPhase: en helt egendefinert mal havner samlet i rest', () => {
  const custom = [
    { phase: 'Steg 1', items: [{ id: '1' }] },
    { phase: 'Steg 2', items: [{ id: '2' }] }
  ];
  const g = groupChecklistByPhase(custom);
  assert.strictEqual(g.rest.length, 2);
  assert.strictEqual(g.saken.length + g.gransking.length + g.vurdering.length, 0);
});

test('groupChecklistByPhase: ingen punkter går tapt uansett mal', () => {
  const malen = [
    { phase: 'Forberedelse', items: [{ id: 'a' }, { id: 'b' }] },
    { phase: 'Ukjent',       items: [{ id: 'c' }] },
    { phase: 'Rapport',      items: [{ id: 'd' }, { id: 'e' }, { id: 'f' }] }
  ];
  const g = groupChecklistByPhase(malen);
  const alle = []
    .concat(g.saken, g.gransking, g.vurdering, g.rest)
    .reduce((n, grp) => n + grp.items.length, 0);
  assert.strictEqual(alle, 6);
});

test('groupChecklistByPhase: flere grupper kan dele samme fase', () => {
  const g = groupChecklistByPhase([
    { phase: 'Gransking', items: [{ id: 'a' }] },
    { phase: 'gransking', items: [{ id: 'b' }] }
  ]);
  assert.strictEqual(g.gransking.length, 2);
});

test('groupChecklistByPhase: tom eller manglende mal gir tomme lister', () => {
  for (const inn of [[], null, undefined]) {
    const g = groupChecklistByPhase(inn);
    assert.strictEqual(g.saken.length, 0);
    assert.strictEqual(g.gransking.length, 0);
    assert.strictEqual(g.vurdering.length, 0);
    assert.strictEqual(g.rest.length, 0);
  }
});

test('groupChecklistByPhase: rekkefølgen innenfor en fase er malens egen', () => {
  const g = groupChecklistByPhase([
    { phase: 'Ukjent A', items: [] },
    { phase: 'Ukjent B', items: [] },
    { phase: 'Ukjent C', items: [] }
  ]);
  assert.deepStrictEqual(Array.from(g.rest.map(x => x.phase)), ['Ukjent A', 'Ukjent B', 'Ukjent C']);
});

// ── savedLabelText ───────────────────────────────────────────────────────────

test('savedLabelText: nullpadder time og minutt', () => {
  assert.strictEqual(savedLabelText(new Date(2026, 0, 5, 9, 7)), 'Lagret 09:07');
  assert.strictEqual(savedLabelText(new Date(2026, 0, 5, 14, 30)), 'Lagret 14:30');
  assert.strictEqual(savedLabelText(new Date(2026, 0, 5, 0, 0)), 'Lagret 00:00');
  assert.strictEqual(savedLabelText(new Date(2026, 0, 5, 23, 59)), 'Lagret 23:59');
});

// ── claimLabelAriaLabel ──────────────────────────────────────────────────────

const aria = loadFunctions(['claimLabelAriaLabel', 'claimFieldAriaLabel']);

test('claimLabelAriaLabel: utfylt etikett leses opp med verdien sin', () => {
  assert.strictEqual(aria.claimLabelAriaLabel(1, 'fremgangsmåte'), 'Krav 1 — etikett: fremgangsmåte');
});

test('claimLabelAriaLabel: tom etikett sier at den ikke er satt', () => {
  assert.strictEqual(aria.claimLabelAriaLabel(2, ''), 'Krav 2 — etikett (ikke satt)');
  assert.strictEqual(aria.claimLabelAriaLabel(2, null), 'Krav 2 — etikett (ikke satt)');
  assert.strictEqual(aria.claimLabelAriaLabel(2, undefined), 'Krav 2 — etikett (ikke satt)');
  assert.strictEqual(aria.claimLabelAriaLabel(2, '   '), 'Krav 2 — etikett (ikke satt)');
});
