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
