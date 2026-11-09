'use strict';
// Kopier mothold fra kravet rett over (knapp i velgeren og hurtigtast c).
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { claimDocCopySource, copyClaimDocsFromAbove, claimKeyAction, claimDocPopHtml } = loadFunctions(
  ['claimDocCopySource', 'copyClaimDocsFromAbove', 'claimKeyAction', 'claimDocPopHtml', 'claimDocSelectable', 'esc'],
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
  const cs = [claim(1, { noveltyDoc: 'D1' }), claim(2)];
  assert.deepStrictEqual(arr(claimDocCopySource(cs, 2, 'novelty', DOCS)), ['D1']);
});

test('claimDocCopySource: oppfinnelseshøyde-motholdene fra kravet rett over', () => {
  const cs = [claim(1), claim(2, { inventiveDocs: ['D1', 'D2'] }), claim(3)];
  assert.deepStrictEqual(arr(claimDocCopySource(cs, 3, 'inventive', DOCS)), ['D1', 'D2']);
});

test('claimDocCopySource: null på krav 1', () => {
  const cs = [claim(1, { noveltyDoc: 'D1' })];
  assert.strictEqual(claimDocCopySource(cs, 1, 'novelty', DOCS), null);
});

test('claimDocCopySource: null når kravet over ikke har noe valg', () => {
  const cs = [claim(1), claim(2)];
  assert.strictEqual(claimDocCopySource(cs, 2, 'novelty', DOCS), null);
  assert.strictEqual(claimDocCopySource(cs, 2, 'inventive', DOCS), null);
});

test('claimDocCopySource: null når valget allerede er det samme', () => {
  const cs = [claim(1, { inventiveDocs: ['D1', 'D2'] }), claim(2, { inventiveDocs: ['D1', 'D2'] })];
  assert.strictEqual(claimDocCopySource(cs, 2, 'inventive', DOCS), null);
});

test('claimDocCopySource: E-dokumenter og tilbaketrukne mothold filtreres bort', () => {
  const cs = [claim(1, { inventiveDocs: ['D3', 'D1'] }), claim(2)];
  assert.deepStrictEqual(arr(claimDocCopySource(cs, 2, 'inventive', DOCS)), ['D1']);
  const cs2 = [claim(1, { noveltyDoc: 'D4' }), claim(2)];
  assert.strictEqual(claimDocCopySource(cs2, 2, 'novelty', DOCS), null);
});

test('claimDocCopySource: E-dokument kan kopieres for nyhet', () => {
  const cs = [claim(1, { noveltyDoc: 'D3' }), claim(2)];
  assert.deepStrictEqual(arr(claimDocCopySource(cs, 2, 'novelty', DOCS)), ['D3']);
});

test('copyClaimDocsFromAbove: erstatter nyhetsmotholdet', () => {
  const cs = [claim(1, { noveltyDoc: 'D1' }), claim(2, { noveltyDoc: 'D2' })];
  assert.strictEqual(copyClaimDocsFromAbove(cs, 2, 'novelty', DOCS), true);
  assert.strictEqual(cs[1].noveltyDoc, 'D1');
});

test('copyClaimDocsFromAbove: erstatter oppfinnelseshøyde-motholdene (ny liste)', () => {
  const cs = [claim(1, { inventiveDocs: ['D1', 'D2'] }), claim(2, { inventiveDocs: ['D2'] })];
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
  const cs = [claim(1, { noveltyDoc: 'D1' }), claim(2)];
  const html = claimDocPopHtml({ claims: cs, docs: DOCS }, cs[1], 'novelty', []);
  assert.match(html, /data-doc-copy="2"/);
  assert.match(html, /Som krav 1 \(D1\)/);
});

test('claimDocPopHtml: ingen kopieringsknapp på krav 1', () => {
  const cs = [claim(1)];
  const html = claimDocPopHtml({ claims: cs, docs: DOCS }, cs[0], 'novelty', []);
  assert.doesNotMatch(html, /data-doc-copy/);
});
