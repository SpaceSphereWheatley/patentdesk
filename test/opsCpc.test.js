'use strict';
// CPC-klasser fra OPS på motholdene.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadFunctions } = require('./extractFunctions');

const plain = (x) => JSON.parse(JSON.stringify(x));

const F = loadFunctions([
  'normalizePubNumber', 'opsDate', 'opsAsArray', 'opsDocIdDate', 'opsTitle', 'opsParties', 'opsCpc',
  'parseOpsBiblio', 'opsFillPlan', 'opsReplacePlan', 'capPartyText', 'capCpcText', 'sanitizeText',
  'ensureSakDocs', 'claimDocSelectable', 'docHasDetails',
  'normalizeImportSakDetails', 'normalizeRounds', 'normalizeClaimMapping', 'normalizeObjections',
  'normalizeObjectionStates', 'isPositiveInt', 'searchCaseList', '_detailsMatch',
  'mhReadHtml', 'mhReadValueHtml', 'mhCpcHtml', 'esc', 'toDisplay',
], { vars: ['MAX_INVENTIVE_DOCS', 'PARTY_MAX_LEN', 'CPC_MAX_LEN', 'CPC_MAX_CLASSES', 'MH_DETAIL_FIELDS'],
     globals: { _cpcDb: null, cpcTooltipHtml: () => '' } });

const WO = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'ops-biblio-WO2016169730.json'), 'utf8'));

const pc = (seq, scheme, s, c, sc, mg, sg) => ({ '@sequence': String(seq), 'classification-scheme': { '@scheme': scheme },
  section: { $: s }, class: { $: c }, subclass: { $: sc }, 'main-group': { $: mg }, subgroup: { $: sg } });
const bib = (list) => ({ 'patent-classifications': { 'patent-classification': list } });

// ── AC1 / AC3: lesing fra OPS ────────────────────────────────

test('parseOpsBiblio reads the CPC classes from the real fixture, in OPS order', () => {
  assert.strictEqual(F.parseOpsBiblio(WO, 'A1').cpc, 'G01F25/15; G01N33/0006; G01F1/66');
});

test('opsCpc takes the first four CPC classes by sequence, without duplicates', () => {
  const list = [
    pc(3, 'CPCI', 'B', '63', 'B', '21', '50'), pc(1, 'CPCI', 'F', '16', 'L', '1', '12'),
    pc(2, 'CPCI', 'F', '16', 'L', '1', '12'), pc(4, 'CPCA', 'E', '21', 'B', '17', '01'),
    pc(5, 'CPCI', 'H', '01', 'R', '13', '52'), pc(6, 'CPCI', 'A', '01', 'B', '1', '00'),
  ];
  assert.strictEqual(F.opsCpc(bib(list)), 'F16L1/12; B63B21/50; E21B17/01; H01R13/52');
});

test('opsCpc ignores other schemes, and handles a single entry or none', () => {
  assert.strictEqual(F.opsCpc(bib([pc(1, 'IPC', 'F', '16', 'L', '1', '12')])), '');
  assert.strictEqual(F.opsCpc(bib(pc(1, 'CPCI', 'F', '16', 'L', '1', '12'))), 'F16L1/12');
  assert.strictEqual(F.opsCpc({}), '');
  assert.strictEqual(F.opsCpc(null), '');
});

// ── AC2: fyll og erstatt ─────────────────────────────────────

test('opsFillPlan fills an empty CPC field and never overwrites a filled one', () => {
  const ops = { pubDate: '', effDate: '', cpc: 'F16L1/12' };
  assert.strictEqual(F.opsFillPlan({ cpc: '' }, ops).patch.cpc, 'F16L1/12');
  assert.strictEqual(F.opsFillPlan({ cpc: 'B63B21/50' }, ops).patch.cpc, undefined);
});

test('opsReplacePlan replaces CPC too, and empties it when OPS has none', () => {
  assert.strictEqual(F.opsReplacePlan({ cpc: 'F16L1/12' }).patch.cpc, 'F16L1/12');
  assert.strictEqual(F.opsReplacePlan({}).patch.cpc, '');
});

test('a document with only CPC counts as having details', () => {
  assert.strictEqual(F.docHasDetails({ cpc: 'F16L1/12' }), true);
});

// ── AC4 / AC7: lesevisning ───────────────────────────────────

test('mhReadHtml shows CPC on its own line before the title, each class copyable on its own', () => {
  const html = F.mhReadHtml({ pubDate: '', effDate: '', applicants: 'A', inventors: 'B',
    cpc: 'G01F25/15; G01N33/0006', title: 'TITTEL' }, 0);
  assert.ok(html.indexOf('G01N33/0006') < html.indexOf('TITTEL'), 'title last');
  assert.ok(html.indexOf('B') < html.indexOf('G01F25/15'));
  assert.match(html, /data-copy[^>]*>G01F25\/15</);
  assert.match(html, /data-copy[^>]*>G01N33\/0006</);
});

test('mhReadHtml shows «—» for an empty CPC field', () => {
  const html = F.mhReadHtml({ cpc: '' }, 0);
  assert.match(html, /CPC<\/span><span class="mh-v mh-v-wide mh-v-empty">—</);
});

test('mhCpcHtml escapes the class text', () => {
  const html = F.mhCpcHtml('"><img src=x onerror=alert(1)>');
  assert.ok(!/<img/i.test(html), html);
});

// ── AC7: lagring og import ───────────────────────────────────

test('capCpcText tidies and caps the CPC text, non-text becomes empty', () => {
  assert.strictEqual(F.capCpcText('  F16L1/12 ;\u0007 B63B21/50  '), 'F16L1/12 ; B63B21/50');
  assert.strictEqual(F.capCpcText('x'.repeat(300)).length, 100);
  assert.strictEqual(F.capCpcText(['F16L1/12']), '');
});

test('ensureSakDocs keeps CPC and gives old documents an empty field', () => {
  const d = F.ensureSakDocs({ docs: [{ ref: 'a', cpc: 'F16L1/12' }, { ref: 'b' }], claims: [] });
  assert.strictEqual(d.docs[0].cpc, 'F16L1/12');
  assert.strictEqual(d.docs[1].cpc, '');
});

test('import caps CPC and turns non-text into empty', () => {
  const out = F.normalizeImportSakDetails({ docs: [{ ref: 'a', cpc: 'y'.repeat(500) }, { ref: 'b', cpc: { x: 1 } }, { ref: 'c' }] });
  assert.strictEqual(out.docs[0].cpc.length, 100);
  assert.strictEqual(out.docs[1].cpc, '');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(out.docs[2], 'cpc'), false);
});

// ── AC8: Ctrl+K ──────────────────────────────────────────────

test('searchCaseList finds a case by a prior-art CPC class, typed with or without space', () => {
  const cases = [{ id: 'a', caseNumber: '1', title: 'x' }, { id: 'b', caseNumber: '2', title: 'y' }];
  const details = { a: { docs: [{ ref: 'WO 1', cpc: 'G01F25/15; G01N33/0006' }] } };
  const ids = (q) => plain(F.searchCaseList(q, cases, (id) => details[id] || null)).map((c) => c.id);
  assert.deepStrictEqual(ids('G01N 33/0006'), ['a']);
  assert.deepStrictEqual(ids('g01f25'), ['a']);
});
