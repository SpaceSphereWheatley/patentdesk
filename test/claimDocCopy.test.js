'use strict';
// Kopier mothold fra kravet rett over (knapp i velgeren og hurtigtast c).
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { claimDocCopySource, copyClaimDocsFromAbove, claimKeyAction, claimDocPopHtml, claimDocsShown, canCopyClaimDocs } = loadFunctions(
  ['claimDocCopySource', 'copyClaimDocsFromAbove', 'claimKeyAction', 'claimDocPopHtml', 'claimDocSelectable', 'esc',
   'claimDocsShown', 'canCopyClaimDocs', 'effectiveClaimValue', 'getClaimCascadeValue'],
  { vars: ['MAX_INVENTIVE_DOCS'] }
);

const DOCS = [
  { id: 'D1', ref: 'WO 1' },
  { id: 'D2', ref: 'EP 2' },
  { id: 'D3', ref: 'EP 3', e: true },
  { id: 'D4', ref: 'US 4', withdrawn: true },
];

function claim(num, o) {
  return Object.assign({ num: num, novelty: null, inventive: null, dep: null, noveltyDoc: null, inventiveDocs: [] }, o);
}
const arr = (a) => (a === null ? null : Array.from(a));

test('claimDocCopySource: nyhetsmotholdet fra kravet rett over', () => {
  const cs = [claim(1, { novelty: false, noveltyDoc: 'D1' }), claim(2)];
  assert.deepStrictEqual(arr(claimDocCopySource(cs, 2, 'novelty', DOCS)), ['D1']);
});

test('claimDocCopySource: oppfinnelseshøyde-motholdene fra kravet rett over', () => {
  const cs = [claim(1), claim(2, { novelty: true, inventive: false, inventiveDocs: ['D1', 'D2'] }), claim(3)];
  assert.deepStrictEqual(arr(claimDocCopySource(cs, 3, 'inventive', DOCS)), ['D1', 'D2']);
});

test('claimDocCopySource: null på krav 1', () => {
  const cs = [claim(1, { novelty: false, noveltyDoc: 'D1' })];
  assert.strictEqual(claimDocCopySource(cs, 1, 'novelty', DOCS), null);
});

test('claimDocCopySource: null når kravet over ikke har noe valg', () => {
  const cs = [claim(1), claim(2)];
  assert.strictEqual(claimDocCopySource(cs, 2, 'novelty', DOCS), null);
  assert.strictEqual(claimDocCopySource(cs, 2, 'inventive', DOCS), null);
});

test('claimDocCopySource: null når valget allerede er det samme', () => {
  const cs = [claim(1, { novelty: true, inventive: false, inventiveDocs: ['D1', 'D2'] }), claim(2, { inventiveDocs: ['D1', 'D2'] })];
  assert.strictEqual(claimDocCopySource(cs, 2, 'inventive', DOCS), null);
});

test('claimDocCopySource: E-dokumenter og tilbaketrukne mothold filtreres bort', () => {
  const cs = [claim(1, { novelty: true, inventive: false, inventiveDocs: ['D3', 'D1'] }), claim(2)];
  assert.deepStrictEqual(arr(claimDocCopySource(cs, 2, 'inventive', DOCS)), ['D1']);
  const cs2 = [claim(1, { novelty: false, noveltyDoc: 'D4' }), claim(2)];
  assert.strictEqual(claimDocCopySource(cs2, 2, 'novelty', DOCS), null);
});

test('claimDocCopySource: E-dokument kan kopieres for nyhet', () => {
  const cs = [claim(1, { novelty: false, noveltyDoc: 'D3' }), claim(2)];
  assert.deepStrictEqual(arr(claimDocCopySource(cs, 2, 'novelty', DOCS)), ['D3']);
});

test('copyClaimDocsFromAbove: erstatter nyhetsmotholdet', () => {
  const cs = [claim(1, { novelty: false, noveltyDoc: 'D1' }), claim(2, { noveltyDoc: 'D2' })];
  assert.strictEqual(copyClaimDocsFromAbove(cs, 2, 'novelty', DOCS), true);
  assert.strictEqual(cs[1].noveltyDoc, 'D1');
});

test('copyClaimDocsFromAbove: erstatter oppfinnelseshøyde-motholdene (ny liste)', () => {
  const cs = [claim(1, { novelty: true, inventive: false, inventiveDocs: ['D1', 'D2'] }), claim(2, { inventiveDocs: ['D2'] })];
  assert.strictEqual(copyClaimDocsFromAbove(cs, 2, 'inventive', DOCS), true);
  assert.deepStrictEqual(Array.from(cs[1].inventiveDocs), ['D1', 'D2']);
  assert.notStrictEqual(cs[1].inventiveDocs, cs[0].inventiveDocs, 'listen deles ikke mellom kravene');
});

test('copyClaimDocsFromAbove: ingenting å kopiere gir false og ingen endring', () => {
  const cs = [claim(1), claim(2, { noveltyDoc: 'D2' })];
  assert.strictEqual(copyClaimDocsFromAbove(cs, 2, 'novelty', DOCS), false);
  assert.strictEqual(cs[1].noveltyDoc, 'D2');
});

test('claimKeyAction: c kopierer fra kravet over', () => {
  assert.deepStrictEqual(Object.assign({}, claimKeyAction('c')), { type: 'copyDocs' });
  assert.deepStrictEqual(Object.assign({}, claimKeyAction('C')), { type: 'copyDocs' });
});

test('claimDocPopHtml: kopieringsknappen vises når kravet over har et annet valg', () => {
  const cs = [claim(1, { novelty: false, noveltyDoc: 'D1' }), claim(2)];
  const html = claimDocPopHtml({ claims: cs, docs: DOCS }, cs[1], 'novelty', []);
  assert.match(html, /data-doc-copy="2"/);
  assert.match(html, /Som krav 1 \(D1\)/);
});

test('claimDocPopHtml: ingen kopieringsknapp på krav 1', () => {
  const cs = [claim(1)];
  const html = claimDocPopHtml({ claims: cs, docs: DOCS }, cs[0], 'novelty', []);
  assert.doesNotMatch(html, /data-doc-copy/);
});

// ── Det som vises på kravet over, ikke det som er lagret ──

test('claimDocCopySource: et gammelt, skjult nyhetsmothold kopieres ikke', () => {
  // Krav 1 var ✗ D1, men har fått nyhet tilbake — D1 ligger lagret, men vises ikke.
  const cs = [claim(1, { novelty: true, noveltyDoc: 'D1' }), claim(2, { novelty: false })];
  assert.strictEqual(claimDocCopySource(cs, 2, 'novelty', DOCS), null);
});

test('claimDocCopySource: kravet over uten nyhet viser nyhetsmotholdet under oppfinnelseshøyde', () => {
  const cs = [claim(1, { novelty: false, noveltyDoc: 'D1', inventiveDocs: ['D2'] }),
              claim(2, { dep: 1, novelty: true, inventive: false })];
  assert.deepStrictEqual(arr(claimDocCopySource(cs, 2, 'inventive', DOCS)), ['D1']);
});

test('claimDocCopySource: samme tilfelle uten gamle lagrede OH-mothold', () => {
  const cs = [claim(1, { novelty: false, noveltyDoc: 'D2' }), claim(2, { dep: 1, novelty: true, inventive: false })];
  assert.deepStrictEqual(arr(claimDocCopySource(cs, 2, 'inventive', DOCS)), ['D2']);
});

test('claimDocCopySource: inventiveDocs ut over grensen kuttes til MAX_INVENTIVE_DOCS', () => {
  const docs = DOCS.concat([{ id: 'D5', ref: 'X' }]);
  const cs = [claim(1, { novelty: true, inventive: false, inventiveDocs: ['D1', 'D2', 'D5'] }), claim(2)];
  assert.deepStrictEqual(arr(claimDocCopySource(cs, 2, 'inventive', docs)), ['D1', 'D2']);
});

test('claimDocsShown: ingenting når feltet ikke er ✗', () => {
  const cs = [claim(1, { novelty: true, inventive: true, noveltyDoc: 'D1', inventiveDocs: ['D2'] })];
  assert.deepStrictEqual(arr(claimDocsShown(cs, cs[0], 'novelty')), []);
  assert.deepStrictEqual(arr(claimDocsShown(cs, cs[0], 'inventive')), []);
});

test('canCopyClaimDocs: bare når feltet er ✗ og ikke låst', () => {
  const cs = [
    claim(1, { novelty: true, inventive: true }),     // ✓
    claim(2, { dep: 1, novelty: null }),              // arvet ✓
    claim(3, { novelty: null, inventive: null }),     // ? (selvstendig, ingen arv)
    claim(4, { novelty: false }),                     // mangler nyhet → OH låst
    claim(5, { novelty: true, inventive: false }),    // OH ✗
  ];
  assert.strictEqual(canCopyClaimDocs(cs, cs[0], 'novelty'), false);
  assert.strictEqual(canCopyClaimDocs(cs, cs[1], 'novelty'), false);
  assert.strictEqual(canCopyClaimDocs(cs, cs[2], 'novelty'), false);
  assert.strictEqual(canCopyClaimDocs(cs, cs[3], 'novelty'), true);
  assert.strictEqual(canCopyClaimDocs(cs, cs[3], 'inventive'), false, 'låst oppfinnelseshøyde');
  assert.strictEqual(canCopyClaimDocs(cs, cs[4], 'inventive'), true);
  assert.strictEqual(canCopyClaimDocs(cs, cs[4], 'formal'), false);
});
