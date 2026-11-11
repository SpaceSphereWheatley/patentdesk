'use strict';
// Mothold og granskingsrapport: Rapport-visningen, D-flagget (sitert av søker)
// og at «Bakgrunn» er fjernet.
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const plain = (x) => JSON.parse(JSON.stringify(x));

const F = loadFunctions([
  'docCategoryLabel', 'claimDocSelectable', 'claimDocCategory', 'buildSearchReport',
  'effectiveClaimValue', 'getClaimCascadeValue', 'formatClaimRanges', 'toggleClaimDoc',
  'ensureSakDocs', 'capPartyText', 'capCpcText', 'sanitizeText',
  'mhViewMode', 'mhReportHtml', 'mhCatsHtml', 'mhReadValueHtml', 'mhRoundBadgeHtml', 'docFirstRound',
  'mhFlagsHtml', 'mhFlagHtml', 'suggestDocFlags',
  'esc', 'toDisplay',
], { vars: ['MAX_INVENTIVE_DOCS', 'PARTY_MAX_LEN', 'CPC_MAX_LEN', 'CPC_MAX_CLASSES'] });

function doc(id, over) {
  return Object.assign({ id, ref: '', title: '', pubDate: '', effDate: '', applicants: '', inventors: '', cpc: '',
    p: false, e: false, d: false, withdrawn: false }, over);
}
function claim(num, over) {
  return Object.assign({ num, novelty: null, inventive: null, formal: null, dep: null,
    noveltyDoc: null, inventiveDocs: [] }, over);
}

// ── Kategorietiketten: EPO-stil, hovedkategorien først ───────

test('category label puts the main category first, then P, E and D (EPO style)', () => {
  assert.strictEqual(F.docCategoryLabel(doc('D1'), 'X'), 'X');
  assert.strictEqual(F.docCategoryLabel(doc('D1', { p: true }), 'X'), 'X,P');
  assert.strictEqual(F.docCategoryLabel(doc('D1', { e: true }), 'X'), 'X,E');
  assert.strictEqual(F.docCategoryLabel(doc('D1', { d: true }), 'A'), 'A,D');
  assert.strictEqual(F.docCategoryLabel(doc('D1', { p: true, d: true }), 'Y'), 'Y,P,D');
  assert.strictEqual(F.docCategoryLabel(doc('D1', { p: true, e: true, d: true }), 'A'), 'A,P,E,D');
});

// ── D endrer ikke hva motholdet kan brukes mot ───────────────

test('a D document is selectable for novelty and inventive step like any other', () => {
  const docs = [doc('D1', { d: true }), doc('D2', { d: true, e: true })];
  assert.deepStrictEqual(plain(F.claimDocSelectable(docs, 'novelty').map(d => d.id)), ['D1', 'D2']);
  // E og D er uavhengige: E-regelen gjelder fortsatt for oppfinnelseshøyde
  assert.deepStrictEqual(plain(F.claimDocSelectable(docs, 'inventive').map(d => d.id)), ['D1']);
});

test('a D document gets X/Y/A from the claim assessment, unchanged by the flag', () => {
  const claims = [claim(1, { novelty: false, inventive: false, noveltyDoc: 'D1' })];
  assert.strictEqual(F.claimDocCategory(claims, claims[0], doc('D1', { d: true })), 'X');
  assert.strictEqual(F.claimDocCategory(claims, claims[0], doc('D2', { d: true })), 'A');
});

// ── «Bakgrunn» er fjernet ────────────────────────────────────

test('an old background document can now be chosen for novelty and inventive step', () => {
  const docs = [doc('D1', { background: true })];
  assert.deepStrictEqual(plain(F.claimDocSelectable(docs, 'novelty').map(d => d.id)), ['D1']);
  assert.deepStrictEqual(plain(F.claimDocSelectable(docs, 'inventive').map(d => d.id)), ['D1']);
  const c = claim(1, { novelty: false, inventive: false });
  F.toggleClaimDoc(c, 'novelty', 'D1', docs);
  assert.strictEqual(c.noveltyDoc, 'D1');
});

test('an old background document is A until a claim is linked to it, then X', () => {
  const unlinked = [claim(1, { novelty: false, inventive: false })];
  assert.strictEqual(F.claimDocCategory(unlinked, unlinked[0], doc('D1', { background: true })), 'A');
  const linked = [claim(1, { novelty: false, inventive: false, noveltyDoc: 'D1' })];
  assert.strictEqual(F.claimDocCategory(linked, linked[0], doc('D1', { background: true })), 'X');
});

test('ensureSakDocs keeps D as a boolean and drops the old background field', () => {
  const data = { docs: [{ ref: 'EP 1', background: true }, { ref: 'EP 2', d: 1 }, { ref: 'EP 3', d: true, p: true }], claims: [] };
  F.ensureSakDocs(data);
  assert.deepStrictEqual(data.docs.map(d => d.d), [false, true, true]);
  assert.ok(data.docs.every(d => !('background' in d)), 'background is gone');
  assert.strictEqual(data.docs[2].p, true);
});

test('ensureSakDocs keeps claim links to an old background document', () => {
  const data = { docs: [{ ref: 'EP 1', background: true }],
    claims: [claim(1, { novelty: false, inventive: false, noveltyDoc: 'D1', inventiveDocs: ['D1'] })] };
  F.ensureSakDocs(data);
  assert.strictEqual(data.claims[0].noveltyDoc, 'D1');
  assert.deepStrictEqual(plain(data.claims[0].inventiveDocs), ['D1']);
});

// ── D-knappen ved siden av P og E ────────────────────────────

test('flag buttons are P, E and D; D is never suggested', () => {
  const app = { filingDate: '2020-01-01', priorityDate: '' };
  const html = F.mhFlagsHtml(doc('D1', { d: true, pubDate: '2020-06-01' }), 0, app);
  const flags = [...html.matchAll(/data-flag="(\w)"/g)].map(m => m[1]);
  assert.deepStrictEqual(flags, ['p', 'e', 'd']);
  const dBtn = html.slice(html.indexOf('data-flag="d"'));
  assert.match(dBtn, /aria-pressed="true"/);
  assert.doesNotMatch(dBtn.split('</button>')[0], /mh-flag-suggest/);
  assert.match(dBtn.split('</button>')[0], /sitert av søker/);
  assert.doesNotMatch(html, /Bakgrunn/);
});

// ── Visningsvalget ───────────────────────────────────────────

test('mhViewMode is "report" only for the stored value "report", else "full"', () => {
  assert.strictEqual(F.mhViewMode('report'), 'report');
  assert.strictEqual(F.mhViewMode('full'), 'full');
  assert.strictEqual(F.mhViewMode(null), 'full');
  assert.strictEqual(F.mhViewMode(''), 'full');
  assert.strictEqual(F.mhViewMode('REPORT'), 'full');
  assert.strictEqual(F.mhViewMode({}), 'full');
});

// ── Rapport-visningen ────────────────────────────────────────

const docs = [
  doc('D1', { ref: 'WO 2020/123456 A1', pubDate: '2020-07-02', applicants: 'Nordvik Subsea AS', inventors: 'Hansen, Kari', title: 'Connector', cpc: 'E21B33/035' }),
  doc('D2', { ref: 'US 10123456 B2', pubDate: '2019-12-03', applicants: '<b>Evil</b> & Co', p: true, d: true }),
  doc('D3', { ref: 'EP 3456789 A1' }),
  doc('D4', { ref: 'NO 345678 B1', pubDate: '2017-01-01', applicants: 'Gone AS', withdrawn: true }),
];
const rows = [
  { docId: 'D1', X: [1, 2, 3, 6], Y: [4, 5], A: [] },
  { docId: 'D2', X: [], Y: [4, 5], A: [1, 2, 3, 6] },
  { docId: 'D3', X: [], Y: [], A: [] },
  { docId: 'D4', X: [], Y: [], A: [] },
];
const rounds = [{ n: 1, docIds: ['D1', 'D3', 'D4'] }, { n: 2, docIds: ['D1', 'D2', 'D3', 'D4'] }];

function rowHtml(html, id) {
  const parts = html.split('<div class="mr-row');
  return parts.find(p => p.includes('>' + id + '</button>')) || '';
}

test('report: one line per document, in order, with a D-number button to Detaljer', () => {
  const html = F.mhReportHtml(docs, rows, rounds);
  const ids = [...html.matchAll(/data-mh-goto="(\d+)"[^>]*>(D\d+)</g)].map(m => [m[1], m[2]]);
  assert.deepStrictEqual(ids, [['0', 'D1'], ['1', 'D2'], ['2', 'D3'], ['3', 'D4']]);
});

test('report: number, publication date and applicant are copyable; inventors, CPC and title are not shown', () => {
  const r1 = rowHtml(F.mhReportHtml(docs, rows, rounds), 'D1');
  assert.match(r1, /data-copy[^>]*>WO 2020\/123456 A1</);
  assert.match(r1, /data-copy[^>]*>2020\.07\.02</);
  assert.match(r1, /data-copy[^>]*>Nordvik Subsea AS</);
  assert.doesNotMatch(r1, /Hansen|Connector|E21B/);
});

test('report: categories use the EPO label and claim ranges', () => {
  const html = F.mhReportHtml(docs, rows, rounds);
  const r1 = rowHtml(html, 'D1');
  assert.match(r1, /mh-cat-x"><b>X<\/b> 1–3, 6/);
  assert.match(r1, /mh-cat-y"><b>Y<\/b> 4–5/);
  const r2 = rowHtml(html, 'D2');
  assert.match(r2, /<b>Y,P,D<\/b> 4–5/);
  assert.match(r2, /<b>A,P,D<\/b> 1–3, 6/);
});

test('report: "ny i runde N" stays; empty values are a dash; no assessed claims is said', () => {
  const html = F.mhReportHtml(docs, rows, rounds);
  assert.match(rowHtml(html, 'D2'), /ny i runde 2/);
  assert.doesNotMatch(rowHtml(html, 'D1'), /ny i runde/);
  const r3 = rowHtml(html, 'D3');
  assert.match(r3, /mh-v-empty">—</);
  assert.match(r3, /ingen vurderte krav/);
});

test('report: a withdrawn document is struck through and marked, with no copy targets', () => {
  const r4 = rowHtml(F.mhReportHtml(docs, rows, rounds), 'D4');
  assert.match(r4, /mr-row-withdrawn/);
  assert.match(r4, /NO 345678 B1/);
  assert.match(r4, /Ikke lenger relevant/);
  assert.doesNotMatch(r4, /data-copy/);
  assert.doesNotMatch(r4, /Gone AS/);
});

test('report: no edit, OPS, flag, delete or cited-elsewhere controls', () => {
  const html = F.mhReportHtml(docs, rows, rounds);
  assert.doesNotMatch(html, /data-mh-edit|data-mh-del|data-flag|mh-ops|mh-cited|data-mh-restore|<input/);
});

test('report: applicant and reference text is escaped', () => {
  const html = F.mhReportHtml([doc('D1', { ref: '"><img src=x>', applicants: '<b>Evil</b> & Co' })],
    [{ docId: 'D1', X: [], Y: [], A: [] }], []);
  assert.doesNotMatch(html, /<img|<b>Evil/);
  assert.match(html, /&lt;b&gt;Evil&lt;\/b&gt; &amp; Co/);
});

test('report: no rounds and missing rows do not throw', () => {
  const html = F.mhReportHtml([doc('D1', { ref: 'EP 1' })], [], undefined);
  assert.match(html, /ingen vurderte krav/);
  assert.strictEqual(F.mhReportHtml([], [], []), '');
});
