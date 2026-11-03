'use strict';
// E-dokumenter (eldre søknader publisert etter inngivelsen) teller bare for
// nyhet — patentloven § 2 tredje ledd, jf. EPC art. 54(3)/56. De kan aldri
// brukes mot oppfinnelseshøyden. Og et krav uten nyhet er alltid låst til
// ingen oppfinnelseshøyde, også i effectiveClaimValue selv.
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const {
  effectiveClaimValue,
  claimDocCategory,
  buildSearchReport,
  toggleClaimDoc,
  ensureSakDocs,
  claimDocSelectable,
  claimDocPopHtml,
} = loadFunctions([
  'effectiveClaimValue',
  'getClaimCascadeValue',
  'claimDocCategory',
  'buildSearchReport',
  'toggleClaimDoc',
  'ensureSakDocs',
  'claimDocSelectable',
  'claimDocPopHtml',
  'esc',
], { vars: ['MAX_INVENTIVE_DOCS'] });

const plain = (v) => JSON.parse(JSON.stringify(v));

function doc(id, overrides) {
  return Object.assign({ id: id, ref: '', title: '', p: false, e: false, background: false }, overrides);
}

function claim(num, overrides) {
  return Object.assign({
    num: num, novelty: null, inventive: null, formal: null,
    dep: null, noveltyDoc: null, inventiveDocs: [],
  }, overrides);
}

// ── Låsen: ingen nyhet ⇒ ingen oppfinnelseshøyde ──

test('effectiveClaimValue locks inventive step to false when novelty is false', () => {
  // Inkonsistent lagret data (f.eks. importert): nyhet ✗ men OH ✓ / ikke satt.
  const claims = [
    claim(1, { novelty: false, inventive: true }),
    claim(2, { novelty: false, inventive: null }),
  ];
  assert.strictEqual(effectiveClaimValue(claims, claims[0], 'inventive'), false);
  assert.strictEqual(effectiveClaimValue(claims, claims[1], 'inventive'), false);
});

test('effectiveClaimValue leaves inventive step alone when novelty is true or unassessed', () => {
  const claims = [
    claim(1, { novelty: true, inventive: true }),
    claim(2, { novelty: null, inventive: null }),
    claim(3, { novelty: true, inventive: false }),
  ];
  assert.strictEqual(effectiveClaimValue(claims, claims[0], 'inventive'), true);
  assert.strictEqual(effectiveClaimValue(claims, claims[1], 'inventive'), null);
  assert.strictEqual(effectiveClaimValue(claims, claims[2], 'inventive'), false);
});

test('a dependent claim overridden to no novelty is locked even when its parent is inventive', () => {
  const claims = [
    claim(1, { novelty: true, inventive: true }),
    claim(2, { dep: 1, novelty: false, inventive: null }),
  ];
  assert.strictEqual(effectiveClaimValue(claims, claims[1], 'inventive'), false);
});

// ── E-dokumenter og oppfinnelseshøyde ──

test('claimDocSelectable offers E documents for novelty but not for inventive step', () => {
  const docs = [doc('D1'), doc('D2', { e: true }), doc('D3', { background: true })];
  assert.deepStrictEqual(plain(claimDocSelectable(docs, 'novelty').map(d => d.id)), ['D1', 'D2']);
  assert.deepStrictEqual(plain(claimDocSelectable(docs, 'inventive').map(d => d.id)), ['D1']);
  assert.deepStrictEqual(plain(claimDocSelectable(null, 'inventive')), []);
});

test('toggleClaimDoc refuses an E document for inventive step but accepts it for novelty', () => {
  const docs = [doc('D1'), doc('D2', { e: true })];
  const c = claim(1, { novelty: true, inventive: false });
  toggleClaimDoc(c, 'inventive', 'D2', docs);
  assert.deepStrictEqual(plain(c.inventiveDocs), []);
  toggleClaimDoc(c, 'inventive', 'D1', docs);
  assert.deepStrictEqual(plain(c.inventiveDocs), ['D1']);
  toggleClaimDoc(c, 'novelty', 'D2', docs);
  assert.strictEqual(c.noveltyDoc, 'D2');
});

test('ensureSakDocs strips E documents from inventiveDocs but keeps them as noveltyDoc', () => {
  const data = {
    docs: [doc('D1'), doc('D2', { e: true })],
    claims: [
      claim(1, { novelty: false, inventive: false, noveltyDoc: 'D2' }),
      claim(2, { novelty: true, inventive: false, inventiveDocs: ['D1', 'D2'] }),
    ],
  };
  ensureSakDocs(data);
  assert.strictEqual(data.claims[0].noveltyDoc, 'D2');
  assert.deepStrictEqual(plain(data.claims[1].inventiveDocs), ['D1']);
});

test('an E document is never Y or X for inventive step in the search report', () => {
  // Stale data where an E document sits in inventiveDocs (before cleanup).
  const docs = [doc('D1'), doc('D2', { e: true })];
  const claims = [
    claim(1, { novelty: false, inventive: false, noveltyDoc: 'D2' }),
    claim(2, { novelty: true, inventive: false, inventiveDocs: ['D2'] }),
  ];
  assert.strictEqual(claimDocCategory(claims, claims[0], docs[1]), 'X'); // E,X — novelty
  assert.strictEqual(claimDocCategory(claims, claims[1], docs[1]), 'A');
  const report = plain(buildSearchReport(claims, docs));
  assert.deepStrictEqual(report[1], { docId: 'D2', X: [1], Y: [], A: [2] });
});

test('the inventive-step picker lists no E documents and explains why when only E documents exist', () => {
  const c = claim(1, { novelty: true, inventive: false });
  const onlyE = { docs: [doc('D1', { e: true })], claims: [c] };
  const html = claimDocPopHtml(onlyE, c, 'inventive', []);
  assert.ok(!html.includes('data-doc-pick="D1"'));
  assert.ok(html.includes('E-dokumenter'));

  const mixed = { docs: [doc('D1'), doc('D2', { e: true })], claims: [c] };
  const html2 = claimDocPopHtml(mixed, c, 'inventive', []);
  assert.ok(html2.includes('data-doc-pick="D1"'));
  assert.ok(!html2.includes('data-doc-pick="D2"'));

  const novelty = claimDocPopHtml(mixed, c, 'novelty', []);
  assert.ok(novelty.includes('data-doc-pick="D2"'));
});
