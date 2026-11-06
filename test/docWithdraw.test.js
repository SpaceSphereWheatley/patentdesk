'use strict';
// Mothold etter at brev er sendt: nummeret er låst. «Fjern» merker motholdet
// «Ikke lenger relevant» i stedet for å slette og renummerere, så D-numrene
// i saken fortsatt stemmer med brevene som har gått ut.
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const {
  docRemoveWithdraws,
  withdrawDocAt,
  restoreDocAt,
  claimDocSelectable,
  claimDocCategory,
  buildSearchReport,
  ensureSakDocs,
} = loadFunctions([
  'lettersSent',
  'docRemoveWithdraws',
  'withdrawDocAt',
  'restoreDocAt',
  'claimDocSelectable',
  'effectiveClaimValue',
  'getClaimCascadeValue',
  'claimDocCategory',
  'buildSearchReport',
  'docCategoryLabel',
  'formatClaimRanges',
  'ensureSakDocs', 'capPartyText', 'sanitizeText',
], { vars: ['MAX_INVENTIVE_DOCS', 'PARTY_MAX_LEN'] });

const plain = (v) => JSON.parse(JSON.stringify(v));

function doc(id, overrides) {
  return Object.assign({ id: id, ref: '', title: '', p: false, e: false, background: false, withdrawn: false }, overrides);
}
function claim(num, overrides) {
  return Object.assign({
    num: num, novelty: null, inventive: null, formal: null,
    dep: null, noveltyDoc: null, inventiveDocs: [],
  }, overrides);
}
const sent = { history: [{ type: 'status', from: 'ny', to: 'fristarkiv' }] };

test('docRemoveWithdraws is false before the first letter and true after', () => {
  assert.strictEqual(docRemoveWithdraws({ history: [] }), false);
  assert.strictEqual(docRemoveWithdraws(null), false);
  assert.strictEqual(docRemoveWithdraws(sent), true);
  // Angret utsending (Fristarkiv → Ny) teller ikke som sendt brev
  assert.strictEqual(docRemoveWithdraws({ history: sent.history.concat([{ type: 'status', from: 'fristarkiv', to: 'ny' }]) }), false);
});

test('withdrawDocAt keeps every number and strips the withdrawn document from claims', () => {
  const docs = [doc('D1'), doc('D2'), doc('D3')];
  const claims = [
    claim(1, { novelty: false, inventive: false, noveltyDoc: 'D2' }),
    claim(2, { novelty: true, inventive: false, inventiveDocs: ['D2', 'D3'] }),
  ];
  const next = withdrawDocAt(docs, claims, 1);
  assert.deepStrictEqual(plain(next.docs.map(d => d.id)), ['D1', 'D2', 'D3']);
  assert.strictEqual(next.docs[1].withdrawn, true);
  assert.strictEqual(next.claims[0].noveltyDoc, null);
  assert.deepStrictEqual(plain(next.claims[1].inventiveDocs), ['D3']);
  // Inn-arrayene er urørt
  assert.strictEqual(docs[1].withdrawn, false);
  assert.strictEqual(claims[0].noveltyDoc, 'D2');
});

test('withdrawDocAt ignores an out-of-range index', () => {
  const docs = [doc('D1')];
  const next = withdrawDocAt(docs, [], 5);
  assert.strictEqual(next.docs, docs);
});

test('restoreDocAt makes a withdrawn document ordinary again without restoring links', () => {
  const docs = [doc('D1', { withdrawn: true })];
  const next = restoreDocAt(docs, 0);
  assert.strictEqual(next[0].withdrawn, false);
  assert.strictEqual(docs[0].withdrawn, true);
});

test('a withdrawn document cannot be picked for novelty or inventive step', () => {
  const docs = [doc('D1'), doc('D2', { withdrawn: true })];
  assert.deepStrictEqual(plain(claimDocSelectable(docs, 'novelty').map(d => d.id)), ['D1']);
  assert.deepStrictEqual(plain(claimDocSelectable(docs, 'inventive').map(d => d.id)), ['D1']);
});

test('ensureSakDocs keeps the withdrawn flag and strips its claim links', () => {
  const data = {
    docs: [doc('D1'), { id: 'D2', ref: 'X', withdrawn: true }, { id: 'D3', ref: 'Y' }],
    claims: [claim(1, { novelty: false, inventive: false, noveltyDoc: 'D2' })],
  };
  ensureSakDocs(data);
  assert.strictEqual(data.docs[1].withdrawn, true);
  assert.strictEqual(data.docs[2].withdrawn, false);
  assert.strictEqual(data.claims[0].noveltyDoc, null);
});

test('a withdrawn document gets no X/Y/A category, not even A on every claim', () => {
  const docs = [doc('D1'), doc('D2', { withdrawn: true })];
  const claims = [claim(1, { novelty: true, inventive: true })];
  assert.strictEqual(claimDocCategory(claims, claims[0], docs[1]), null);
  assert.deepStrictEqual(plain(buildSearchReport(claims, docs)[1]), { docId: 'D2', X: [], Y: [], A: [] });
});

