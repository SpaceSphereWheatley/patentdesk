'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { cpcRowHtml, claimsAffectedBy } = loadFunctions(
  ['cpcRowHtml', 'claimsAffectedBy', 'esc']
);

// ── cpcRowHtml ─────────────────────────────────────
// Raden ligger i et rutenett med fire kolonner. Beskrivelsen ble tidligere
// bare skrevet ut når den fantes, og da gled slettekrysset inn i dens plass.

test('cpcRowHtml: beskrivelsen opptar sin kolonne også når den mangler', () => {
  const uten = cpcRowHtml({ code: 'B63B 21/50', inUse: false }, 0, '', '');
  const med  = cpcRowHtml({ code: 'B63B 21/50', inUse: false }, 0, 'Anchoring arrangements', '');
  // Presis: klassenavnet står i sak-class-desc-missing også, så tell attributtet.
  const tell = (s, n) => s.split(n).length - 1;
  assert.strictEqual(tell(uten, 'class="sak-class-desc'), 1);
  assert.strictEqual(tell(med, 'class="sak-class-desc'), 1);
});

test('cpcRowHtml: slettekrysset er alltid siste element i raden', () => {
  [['', 'uten'], ['Anchoring arrangements', 'med']].forEach(([desc, hva]) => {
    const html = cpcRowHtml({ code: 'B63B 21/50', inUse: false }, 0, desc, '');
    const del = html.lastIndexOf('btn-sak-class-del');
    const dsc = html.lastIndexOf('sak-class-desc');
    assert.ok(del > dsc, hva + ' beskrivelse: krysset skal komme etter beskrivelsen');
  });
});

test('cpcRowHtml: uten beskrivelse sies det at databasen mangler', () => {
  const html = cpcRowHtml({ code: 'B63B 21/50', inUse: false }, 0, '', '');
  assert.match(html, /ikke tilgjengelig/);
  assert.match(html, /sak-class-desc-missing/);
});

test('cpcRowHtml: med beskrivelse vises teksten, uten mangel-markering', () => {
  const html = cpcRowHtml({ code: 'B63B 21/50', inUse: false }, 0, 'Anchoring arrangements', '');
  assert.match(html, /Anchoring arrangements/);
  assert.doesNotMatch(html, /sak-class-desc-missing/);
});

test('cpcRowHtml: koden markeres som i bruk når den er det', () => {
  const av  = cpcRowHtml({ code: 'B63B 21/50', inUse: false }, 0, '', '');
  const på  = cpcRowHtml({ code: 'B63B 21/50', inUse: true }, 0, '', '');
  assert.doesNotMatch(av, /sak-class-tag-active/);
  assert.match(på, /sak-class-tag-active/);
  assert.match(på, /checked/);
});

test('cpcRowHtml: indeksen følger med på knappene', () => {
  const html = cpcRowHtml({ code: 'H04L 9/00', inUse: false }, 7, '', '');
  assert.match(html, /data-idx="7"/);
});

test('cpcRowHtml: koden escapes', () => {
  const html = cpcRowHtml({ code: '<script>', inUse: false }, 0, '', '');
  assert.doesNotMatch(html, /<script>/);
});

// ── claimsAffectedBy ───────────────────────────────
// Endres ett krav, arver etterfølgende krav den nye verdien. Bare de radene
// trenger å tegnes på nytt.

function claims(deps) {
  return deps.map((dep, i) => ({ num: i + 1, dep: dep, novelty: null, inventive: null, formal: null }));
}

test('claimsAffectedBy: et krav uten avhengige påvirker bare seg selv', () => {
  const cs = claims([null, null, null]);
  assert.deepStrictEqual(Array.from(claimsAffectedBy(cs, 2)), [2]);
});

test('claimsAffectedBy: direkte avhengige krav tas med', () => {
  const cs = claims([null, 1, 1]);
  assert.deepStrictEqual(Array.from(claimsAffectedBy(cs, 1)), [1, 2, 3]);
});

test('claimsAffectedBy: arven følger kjeden nedover', () => {
  const cs = claims([null, 1, 2, 3]);
  assert.deepStrictEqual(Array.from(claimsAffectedBy(cs, 1)), [1, 2, 3, 4]);
});

test('claimsAffectedBy: et sidegrener påvirkes ikke', () => {
  const cs = claims([null, 1, null, 3]);
  assert.deepStrictEqual(Array.from(claimsAffectedBy(cs, 3)), [3, 4]);
});

test('claimsAffectedBy: resultatet er sortert og uten duplikater', () => {
  const cs = claims([null, 1, 1, 2, 2]);
  const r = Array.from(claimsAffectedBy(cs, 1));
  assert.deepStrictEqual(r, [1, 2, 3, 4, 5]);
});

test('claimsAffectedBy: ukjent kravnummer gir bare seg selv', () => {
  assert.deepStrictEqual(Array.from(claimsAffectedBy(claims([null, 1]), 99)), [99]);
});

test('claimsAffectedBy: en sirkulær avhengighet stopper i stedet for å henge', () => {
  // dep skal alltid peke oppover, men dataene er brukerredigerte — gjenbesøk
  // av et krav må ikke gi evig løkke.
  const cs = [{ num: 1, dep: 2 }, { num: 2, dep: 1 }];
  assert.deepStrictEqual(Array.from(claimsAffectedBy(cs, 1)), [1, 2]);
});
