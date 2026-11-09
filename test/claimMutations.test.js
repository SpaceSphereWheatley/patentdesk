'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { isValidDep, applyDepChange, nearestIndependentClaim, migrateClaimNotes, triAriaLabel } = loadFunctions(
  ['isValidDep', 'applyDepChange', 'nearestIndependentClaim', 'migrateClaimNotes', 'triAriaLabel']
);

// Bygger et kravsett slik defaultSakData gjør det, men kompakt.
function claims(specs) {
  return specs.map((s, i) => Object.assign({
    num: i + 1, novelty: null, inventive: null, formal: null, notes: '',
    independent: false, dep: null, depManual: false, label: '',
    noveltyDoc: null, inventiveDocs: []
  }, s));
}

// ── isValidDep ─────────────────────────────────────

test('isValidDep: null (selvstendig krav) er alltid gyldig', () => {
  assert.strictEqual(isValidDep(1, null), true);
  assert.strictEqual(isValidDep(7, null), true);
});

test('isValidDep: et krav kan avhenge av et lavere kravnummer', () => {
  assert.strictEqual(isValidDep(5, 1), true);
  assert.strictEqual(isValidDep(5, 4), true);
});

test('isValidDep: et krav kan ikke avhenge av seg selv eller et høyere krav', () => {
  assert.strictEqual(isValidDep(5, 5), false);
  assert.strictEqual(isValidDep(5, 6), false);
});

test('isValidDep: krav 1 kan ikke avhenge av noe', () => {
  assert.strictEqual(isValidDep(1, 1), false);
});

test('isValidDep: avviser null-ekvivalenter som ikke er tall', () => {
  assert.strictEqual(isValidDep(5, 0), false);
  assert.strictEqual(isValidDep(5, -1), false);
  assert.strictEqual(isValidDep(5, NaN), false);
});

// ── applyDepChange ─────────────────────────────────

test('applyDepChange: setter dep og markerer kravet som manuelt', () => {
  const cs = claims([{}, {}, {}]);
  applyDepChange(cs, 2, 1);
  assert.strictEqual(cs[1].dep, 1);
  assert.strictEqual(cs[1].depManual, true);
});

test('applyDepChange: null gjør kravet selvstendig og låser det mot kaskader', () => {
  const cs = claims([{}, { dep: 1, depManual: true }, {}]);
  applyDepChange(cs, 2, null);
  assert.strictEqual(cs[1].dep, null);
  assert.strictEqual(cs[1].depManual, true);
});

test('applyDepChange: kaskaderer til etterfølgende auto-krav', () => {
  const cs = claims([{}, {}, {}, {}]);
  applyDepChange(cs, 2, 1);
  assert.deepStrictEqual(cs.map((c) => c.dep), [null, 1, 1, 1]);
});

test('applyDepChange: etterfølgende krav peker på nærmeste selvstendige krav, ikke kravet over', () => {
  const cs = claims([{}, { dep: 1 }, { dep: 1 }, { dep: 1 }, { dep: 1 }]);
  applyDepChange(cs, 3, 2);
  assert.deepStrictEqual(cs.map((c) => c.dep), [null, 1, 2, 1, 1]);
});

test('applyDepChange: et krav som gjøres selvstendig blir forelder for kravene under', () => {
  const cs = claims([{}, { dep: 1 }, { dep: 1 }, { dep: 1 }, { dep: 1 }]);
  applyDepChange(cs, 3, null);
  assert.deepStrictEqual(cs.map((c) => c.dep), [null, 1, null, 3, 3]);
});

test('applyDepChange: kaskaden stopper ved et selvstendig krav brukeren har satt', () => {
  const cs = claims([{}, { dep: 1 }, { dep: 1 }, { dep: 1 }, { dep: 1 }, { dep: 1 }]);
  applyDepChange(cs, 4, null);   // krav 4 selvstendig → 5, 6 peker på 4
  applyDepChange(cs, 2, null);   // krav 2 selvstendig → 3 peker på 2, men 4 består
  assert.deepStrictEqual(cs.map((c) => c.dep), [null, null, 2, null, 4, 4]);
});

test('applyDepChange: kaskaden stopper ved første manuelt satte krav', () => {
  const cs = claims([{}, {}, {}, { dep: 2, depManual: true }, {}]);
  applyDepChange(cs, 2, 1);
  assert.deepStrictEqual(cs.map((c) => c.dep), [null, 1, 1, 2, null]);
});

// ── nearestIndependentClaim ────────────────────────

test('nearestIndependentClaim: finner nærmeste selvstendige krav før posisjonen', () => {
  const cs = claims([{}, { dep: 1 }, {}, { dep: 3 }, { dep: 4 }]);
  assert.strictEqual(nearestIndependentClaim(cs, 5), 3);
  assert.strictEqual(nearestIndependentClaim(cs, 2), 1);
});

test('nearestIndependentClaim: null når det ikke finnes noe krav før', () => {
  assert.strictEqual(nearestIndependentClaim([], 0), null);
  assert.strictEqual(nearestIndependentClaim(claims([{}]), 0), null);
});

test('applyDepChange: returnerer kravnumrene som faktisk ble endret', () => {
  const cs = claims([{}, {}, {}, { dep: 2, depManual: true }]);
  assert.deepStrictEqual(Array.from(applyDepChange(cs, 2, 1)), [2, 3]);
});

test('applyDepChange: ukjent kravnummer endrer ingenting', () => {
  const cs = claims([{}, {}]);
  assert.deepStrictEqual(Array.from(applyDepChange(cs, 99, 1)), []);
  assert.deepStrictEqual(cs.map((c) => c.dep), [null, null]);
});

// ── migrateClaimNotes ──────────────────────────────

test('migrateClaimNotes: berger et notat som ble skrevet til feil felt', () => {
  const data = { claims: claims([{ note: 'mangler enhet' }]) };
  assert.strictEqual(migrateClaimNotes(data), true);
  assert.strictEqual(data.claims[0].notes, 'mangler enhet');
  assert.strictEqual('note' in data.claims[0], false);
});

test('migrateClaimNotes: et eksisterende notes-felt vinner over det gamle', () => {
  const data = { claims: claims([{ note: 'gammelt', notes: 'gjeldende' }]) };
  migrateClaimNotes(data);
  assert.strictEqual(data.claims[0].notes, 'gjeldende');
  assert.strictEqual('note' in data.claims[0], false);
});

test('migrateClaimNotes: tomt gammelt notat overskriver ikke', () => {
  const data = { claims: claims([{ note: '', notes: 'gjeldende' }]) };
  migrateClaimNotes(data);
  assert.strictEqual(data.claims[0].notes, 'gjeldende');
});

test('migrateClaimNotes: data uten krav er en trygg no-op', () => {
  assert.strictEqual(migrateClaimNotes(null), false);
  assert.strictEqual(migrateClaimNotes({}), false);
  assert.strictEqual(migrateClaimNotes({ claims: [] }), false);
});

test('migrateClaimNotes: allerede migrerte data rapporterer ingen endring', () => {
  const data = { claims: claims([{ notes: 'ok' }]) };
  assert.strictEqual(migrateClaimNotes(data), false);
});

// ── triAriaLabel ───────────────────────────────────

test('triAriaLabel: navngir krav, kolonne og tilstand', () => {
  assert.strictEqual(triAriaLabel(3, 'novelty', null, false, false),
    'Krav 3 — nyhet: ikke vurdert');
  assert.strictEqual(triAriaLabel(3, 'novelty', true, false, false),
    'Krav 3 — nyhet: ja');
  assert.strictEqual(triAriaLabel(12, 'inventive', false, false, false),
    'Krav 12 — oppfinnelseshøyde: nei');
});

test('triAriaLabel: formelle feil er sin egen kolonne', () => {
  assert.strictEqual(triAriaLabel(1, 'formal', true, false, false),
    'Krav 1 — formelle feil: ja');
});

test('triAriaLabel: låst oppfinnelseshøyde forklarer hvorfor', () => {
  assert.strictEqual(triAriaLabel(5, 'inventive', false, false, true),
    'Krav 5 — oppfinnelseshøyde: nei (låst, krav mangler nyhet)');
});

test('triAriaLabel: arvet verdi sier at den er arvet', () => {
  assert.strictEqual(triAriaLabel(4, 'novelty', true, true, false),
    'Krav 4 — nyhet: ja (arvet fra overordnet krav)');
});

test('triAriaLabel: låsing har forrang over arv', () => {
  assert.strictEqual(triAriaLabel(4, 'inventive', false, true, true),
    'Krav 4 — oppfinnelseshøyde: nei (låst, krav mangler nyhet)');
});

// ── ensureClaims: nye krav ─────────────────────────

const { ensureClaims } = loadFunctions(['ensureClaims', 'nearestIndependentClaim']);

test('ensureClaims: nye krav avhenger av krav 1 som standard', () => {
  const d = ensureClaims({ numClaims: 4, claims: [] });
  assert.deepStrictEqual(d.claims.map((c) => c.dep), [null, 1, 1, 1]);
  assert.ok(d.claims.every((c) => c.depManual === false));
});

test('ensureClaims: nye krav peker på nærmeste selvstendige krav, ikke kravet over', () => {
  const d = ensureClaims({ numClaims: 3, claims: [] });
  d.claims[1].dep = null;           // krav 2 selvstendig
  d.claims[2].dep = 1;              // krav 3 avhenger av krav 1
  d.numClaims = 5;
  ensureClaims(d);
  assert.deepStrictEqual(d.claims.map((c) => c.dep), [null, null, 1, 2, 2]);
});

// ── Nullstille og bytte kravtilhørighet ────────────

const { resetDep, toggleDepIndependent, claimFieldKeyNav, depKeyResets } = loadFunctions(
  ['resetDep', 'toggleDepIndependent', 'claimFieldKeyNav', 'depKeyResets', 'applyDepChange', 'nearestIndependentClaim']
);

test('resetDep: et manuelt krav blir automatisk og peker på nærmeste selvstendige krav', () => {
  const cs = claims([{}, { dep: 1 }, { dep: null, depManual: true }, { dep: 3 }]);
  resetDep(cs, 3);
  assert.strictEqual(cs[2].depManual, false);
  assert.strictEqual(cs[2].dep, 1);
});

test('resetDep: kravene under følger med på nytt', () => {
  const cs = claims([{}, { dep: 1 }, { dep: null, depManual: true }, { dep: 3 }, { dep: 3 }]);
  assert.deepStrictEqual(Array.from(resetDep(cs, 3)), [3, 4, 5]);
  assert.deepStrictEqual(cs.map((c) => c.dep), [null, 1, 1, 1, 1]);
});

test('resetDep: kaskaden stopper ved neste manuelle krav', () => {
  const cs = claims([{}, { dep: null, depManual: true }, { dep: 2 }, { dep: null, depManual: true }, { dep: 4 }]);
  resetDep(cs, 2);
  assert.deepStrictEqual(cs.map((c) => c.dep), [null, 1, 1, null, 4]);
  assert.strictEqual(cs[3].depManual, true);
});

test('resetDep: krav 1 blir automatisk selvstendig', () => {
  const cs = claims([{ depManual: true }, { dep: 1 }]);
  resetDep(cs, 1);
  assert.strictEqual(cs[0].dep, null);
  assert.strictEqual(cs[0].depManual, false);
});

test('resetDep: ukjent kravnummer endrer ingenting', () => {
  const cs = claims([{}, { dep: 1 }]);
  assert.deepStrictEqual(Array.from(resetDep(cs, 9)), []);
});

test('toggleDepIndependent: uselvstendig → selvstendig, manuelt, med kaskade', () => {
  const cs = claims([{}, { dep: 1 }, { dep: 1 }]);
  toggleDepIndependent(cs, 2);
  assert.strictEqual(cs[1].dep, null);
  assert.strictEqual(cs[1].depManual, true);
  assert.strictEqual(cs[2].dep, 2);
});

test('toggleDepIndependent: selvstendig → uselvstendig peker på nærmeste selvstendige krav over, manuelt', () => {
  const cs = claims([{}, { dep: 1 }, { dep: null, depManual: true }, { dep: 3 }]);
  toggleDepIndependent(cs, 3);
  assert.strictEqual(cs[2].dep, 1);
  assert.strictEqual(cs[2].depManual, true);
  assert.strictEqual(cs[3].dep, 1);
});

test('toggleDepIndependent: krav 1 kan ikke byttes', () => {
  const cs = claims([{}, { dep: 1 }]);
  assert.deepStrictEqual(Array.from(toggleDepIndependent(cs, 1)), []);
  assert.strictEqual(cs[0].dep, null);
  assert.strictEqual(cs[0].depManual, false);
});

test('claimFieldKeyNav: Enter går til samme felt på neste krav', () => {
  assert.deepStrictEqual(Object.assign({}, claimFieldKeyNav('Enter', false, 'dep', 2, 5)), { claim: 3, field: 'dep' });
  assert.deepStrictEqual(Object.assign({}, claimFieldKeyNav('Enter', false, 'note', 4, 5)), { claim: 5, field: 'note' });
});

test('claimFieldKeyNav: Enter på siste krav blir stående', () => {
  assert.deepStrictEqual(Object.assign({}, claimFieldKeyNav('Enter', false, 'dep', 5, 5)), { claim: 5, field: 'dep' });
});

test('claimFieldKeyNav: Tab fra tallfeltet går til S/U-knappen, Shift+Tab til etiketten', () => {
  assert.deepStrictEqual(Object.assign({}, claimFieldKeyNav('Tab', false, 'dep', 3, 5)), { claim: 3, field: 'depToggle' });
  assert.deepStrictEqual(Object.assign({}, claimFieldKeyNav('Tab', true, 'dep', 3, 5)), { claim: 3, field: 'label' });
});

test('claimFieldKeyNav: andre taster og Tab i notatfeltet overlates til nettleseren', () => {
  assert.strictEqual(claimFieldKeyNav('a', false, 'dep', 3, 5), null);
  assert.strictEqual(claimFieldKeyNav('Tab', false, 'note', 3, 5), null);
  assert.strictEqual(claimFieldKeyNav('Enter', true, 'dep', 3, 5), null);
});

test('claimFieldKeyNav: Tab fra krav 1 hopper over den deaktiverte S/U-knappen til Nyhet', () => {
  assert.deepStrictEqual(Object.assign({}, claimFieldKeyNav('Tab', false, 'dep', 1, 5)), { claim: 1, field: 'novelty' });
});

test('depKeyResets: Backspace/Delete i et tomt, manuelt felt nullstiller', () => {
  assert.strictEqual(depKeyResets('Backspace', '', true), true);
  assert.strictEqual(depKeyResets('Delete', '', true), true);
});

test('depKeyResets: ikke når feltet har innhold, er automatisk, eller ved andre taster', () => {
  assert.strictEqual(depKeyResets('Backspace', '2', true), false);
  assert.strictEqual(depKeyResets('Backspace', '', false), false);
  assert.strictEqual(depKeyResets('Tab', '', true), false);
});
