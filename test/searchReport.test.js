'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const {
  buildSearchReport,
  claimDocCategory,
  docCategoryLabel,
  removeDocAt,
  toggleClaimDoc,
  ensureSakDocs,
  formatSearchReport,
  MAX_INVENTIVE_DOCS,
} = loadFunctions([
  'effectiveClaimValue',
  'getClaimCascadeValue',
  'formatClaimRanges',
  'claimDocCategory',
  'buildSearchReport',
  'docCategoryLabel',
  'removeDocAt',
  'toggleClaimDoc',
  'ensureSakDocs',
  'formatSearchReport',
], { vars: ['MAX_INVENTIVE_DOCS'] });

// loadFunctions runs the extracted source in a vm context, so values built
// inside it carry that realm's prototypes and deepStrictEqual would reject
// them on identity alone. Compare structure instead.
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

// The worked example from the domain: claims 1–5 assessed against D1 and D2.
//   1: D1 takes novelty          2: D1 takes novelty
//   3: novel over D1, but D1 alone takes inventive step
//   4: novel over D1, but D1+D2 takes inventive step
//   5: novel and inventive
function workedExample() {
  return {
    docs: [doc('D1'), doc('D2')],
    claims: [
      claim(1, { novelty: false, inventive: false, noveltyDoc: 'D1' }),
      claim(2, { novelty: false, inventive: false, noveltyDoc: 'D1' }),
      claim(3, { novelty: true, inventive: false, inventiveDocs: ['D1'] }),
      claim(4, { novelty: true, inventive: false, inventiveDocs: ['D1', 'D2'] }),
      claim(5, { novelty: true, inventive: true }),
    ],
  };
}

test('worked example: D1 is X for claims 1-3, Y for 4, A for 5', () => {
  const { claims, docs } = workedExample();
  const report = buildSearchReport(claims, docs);
  assert.deepStrictEqual(plain(report[0]), { docId: 'D1', X: [1, 2, 3], Y: [4], A: [5] });
});

test('worked example: D2 is Y for claim 4 and A for the rest', () => {
  const { claims, docs } = workedExample();
  const report = buildSearchReport(claims, docs);
  assert.deepStrictEqual(plain(report[1]), { docId: 'D2', X: [], Y: [4], A: [1, 2, 3, 5] });
});

test('a document taking novelty is X even when it also appears in a combination', () => {
  const claims = [claim(1, { novelty: false, inventive: false, noveltyDoc: 'D1', inventiveDocs: ['D1', 'D2'] })];
  assert.strictEqual(claimDocCategory(claims, claims[0], doc('D1')), 'X');
});

test('a document taking inventive step alone is X, in combination it is Y', () => {
  const alone = [claim(1, { novelty: true, inventive: false, inventiveDocs: ['D1'] })];
  const combo = [claim(1, { novelty: true, inventive: false, inventiveDocs: ['D1', 'D2'] })];
  assert.strictEqual(claimDocCategory(alone, alone[0], doc('D1')), 'X');
  assert.strictEqual(claimDocCategory(combo, combo[0], doc('D1')), 'Y');
  assert.strictEqual(claimDocCategory(combo, combo[0], doc('D2')), 'Y');
});

test('a claim lacking novelty gives A to every document except its novelty document', () => {
  // Inventive step is locked off for such a claim, so a stale inventiveDocs
  // entry must not promote D2 to X or Y.
  const claims = [claim(1, { novelty: false, inventive: false, noveltyDoc: 'D1', inventiveDocs: ['D2'] })];
  assert.strictEqual(claimDocCategory(claims, claims[0], doc('D1')), 'X');
  assert.strictEqual(claimDocCategory(claims, claims[0], doc('D2')), 'A');
});

test('a stored document does not count once the claim is assessed positively again', () => {
  // Toggling novelty back from ✗ keeps the chosen document so it is remembered
  // if the examiner toggles back — but it must not categorise while unused.
  const novelAgain = [claim(1, { novelty: true, inventive: true, noveltyDoc: 'D1', inventiveDocs: ['D2'] })];
  assert.strictEqual(claimDocCategory(novelAgain, novelAgain[0], doc('D1')), 'A');
  assert.strictEqual(claimDocCategory(novelAgain, novelAgain[0], doc('D2')), 'A');
});

test('unassessed claims are excluded from the report entirely', () => {
  const claims = [
    claim(1, { novelty: true, inventive: true }),
    claim(2, { novelty: true, inventive: null }),
    claim(3, { novelty: null, inventive: null }),
  ];
  assert.strictEqual(claimDocCategory(claims, claims[1], doc('D1')), null);
  assert.deepStrictEqual(plain(buildSearchReport(claims, [doc('D1')])), [{ docId: 'D1', X: [], Y: [], A: [1] }]);
});

test('a dependent claim inheriting novelty and inventive step from its parent is A', () => {
  const claims = [
    claim(1, { novelty: true, inventive: true }),
    claim(2, { dep: 1 }),
  ];
  assert.deepStrictEqual(plain(buildSearchReport(claims, [doc('D1')])), [{ docId: 'D1', X: [], Y: [], A: [1, 2] }]);
});

test('background documents are A on every assessed claim', () => {
  const { claims, docs } = workedExample();
  docs.push(doc('D3', { background: true }));
  const report = buildSearchReport(claims, docs);
  assert.deepStrictEqual(plain(report[2]), { docId: 'D3', X: [], Y: [], A: [1, 2, 3, 4, 5] });
});

test('a background document is A even where a claim still references it', () => {
  const claims = [claim(1, { novelty: false, inventive: false, noveltyDoc: 'D1' })];
  assert.strictEqual(claimDocCategory(claims, claims[0], doc('D1', { background: true })), 'A');
});

test('P and E flags prefix the category label', () => {
  assert.strictEqual(docCategoryLabel(doc('D1'), 'X'), 'X');
  assert.strictEqual(docCategoryLabel(doc('D1', { p: true }), 'X'), 'P,X');
  assert.strictEqual(docCategoryLabel(doc('D1', { e: true }), 'Y'), 'E,Y');
  assert.strictEqual(docCategoryLabel(doc('D1', { p: true, e: true }), 'A'), 'P,E,A');
});

test('removing a document renumbers the rest and remaps claim references', () => {
  const docs = [doc('D1'), doc('D2'), doc('D3')];
  const claims = [
    claim(1, { novelty: false, inventive: false, noveltyDoc: 'D1' }),
    claim(2, { novelty: true, inventive: false, inventiveDocs: ['D2', 'D3'] }),
  ];
  const out = removeDocAt(docs, claims, 0); // remove D1
  assert.deepStrictEqual(plain(out.docs.map((d) => d.id)), ['D1', 'D2']);
  // Old D2 and D3 became D1 and D2; claim 1 lost its (deleted) novelty document.
  assert.strictEqual(out.claims[0].noveltyDoc, null);
  assert.deepStrictEqual(plain(out.claims[1].inventiveDocs), ['D1', 'D2']);
});

test('removing a document leaves the original arrays untouched', () => {
  const docs = [doc('D1'), doc('D2')];
  const claims = [claim(1, { noveltyDoc: 'D2' })];
  removeDocAt(docs, claims, 0);
  assert.deepStrictEqual(plain(docs.map((d) => d.id)), ['D1', 'D2']);
  assert.strictEqual(claims[0].noveltyDoc, 'D2');
});

test('removing an out-of-range index is a no-op', () => {
  const docs = [doc('D1')];
  const claims = [claim(1)];
  assert.deepStrictEqual(plain(removeDocAt(docs, claims, 5).docs.map((d) => d.id)), ['D1']);
  assert.deepStrictEqual(plain(removeDocAt(docs, claims, -1).docs.map((d) => d.id)), ['D1']);
});

test('novelty takes exactly one document; picking another replaces it', () => {
  const c = claim(1);
  toggleClaimDoc(c, 'novelty', 'D1');
  assert.strictEqual(c.noveltyDoc, 'D1');
  toggleClaimDoc(c, 'novelty', 'D2');
  assert.strictEqual(c.noveltyDoc, 'D2');
  toggleClaimDoc(c, 'novelty', 'D2'); // picking the same one clears it
  assert.strictEqual(c.noveltyDoc, null);
});

test('inventive step accepts up to MAX_INVENTIVE_DOCS documents', () => {
  assert.strictEqual(MAX_INVENTIVE_DOCS, 2);
  const c = claim(1);
  toggleClaimDoc(c, 'inventive', 'D1');
  toggleClaimDoc(c, 'inventive', 'D2');
  toggleClaimDoc(c, 'inventive', 'D3'); // over the limit — ignored
  assert.deepStrictEqual(plain(c.inventiveDocs), ['D1', 'D2']);
  toggleClaimDoc(c, 'inventive', 'D1'); // deselect frees a slot
  assert.deepStrictEqual(plain(c.inventiveDocs), ['D2']);
  toggleClaimDoc(c, 'inventive', 'D3');
  assert.deepStrictEqual(plain(c.inventiveDocs), ['D2', 'D3']);
});

test('ensureSakDocs normalises missing docs and claim fields', () => {
  const data = { claims: [{ num: 1 }] };
  ensureSakDocs(data);
  assert.deepStrictEqual(plain(data.docs), []);
  assert.strictEqual(data.claims[0].noveltyDoc, null);
  assert.deepStrictEqual(plain(data.claims[0].inventiveDocs), []);
});

test('ensureSakDocs renumbers documents by position', () => {
  const data = { docs: [{ id: 'D7', ref: 'WO 1' }, { id: 'D2', ref: 'EP 2' }], claims: [] };
  ensureSakDocs(data);
  assert.deepStrictEqual(plain(data.docs.map((d) => d.id)), ['D1', 'D2']);
  assert.strictEqual(data.docs[0].ref, 'WO 1');
});

test('ensureSakDocs drops claim references to unknown and background documents', () => {
  const data = {
    docs: [doc('D1'), doc('D2', { background: true })],
    claims: [claim(1, { noveltyDoc: 'D2', inventiveDocs: ['D1', 'D2', 'D9'] })],
  };
  ensureSakDocs(data);
  assert.strictEqual(data.claims[0].noveltyDoc, null);
  assert.deepStrictEqual(plain(data.claims[0].inventiveDocs), ['D1']);
});

test('ensureSakDocs deduplicates and caps inventive documents', () => {
  const data = {
    docs: [doc('D1'), doc('D2'), doc('D3')],
    claims: [claim(1, { inventiveDocs: ['D1', 'D1', 'D2', 'D3'] })],
  };
  ensureSakDocs(data);
  assert.deepStrictEqual(plain(data.claims[0].inventiveDocs), ['D1', 'D2']);
});

test('formatSearchReport renders the worked example as copyable text', () => {
  const { claims, docs } = workedExample();
  docs[0].ref = 'WO 2020/123456 A1';
  docs[1].ref = 'EP 3 214 987 B1';
  assert.strictEqual(formatSearchReport(claims, docs), [
    'D1  WO 2020/123456 A1',
    '  X: krav 1–3',
    '  Y: krav 4',
    '  A: krav 5',
    '',
    'D2  EP 3 214 987 B1',
    '  Y: krav 4',
    '  A: krav 1–3, 5',
  ].join('\n'));
});

test('formatSearchReport marks a document with no assessed claims', () => {
  const docs = [doc('D1', { ref: 'WO 1' })];
  const claims = [claim(1)]; // unassessed
  assert.strictEqual(formatSearchReport(claims, docs), 'D1  WO 1\n  (ingen vurderte krav)');
});

test('empty inputs produce an empty report', () => {
  assert.deepStrictEqual(plain(buildSearchReport([], [])), []);
  assert.deepStrictEqual(plain(buildSearchReport(null, null)), []);
  assert.strictEqual(formatSearchReport([], []), '');
});
