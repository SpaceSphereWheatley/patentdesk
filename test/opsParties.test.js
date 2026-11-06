'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadFunctions } = require('./extractFunctions');

const plain = (x) => JSON.parse(JSON.stringify(x));

const {
  parseOpsBiblio, opsParties, opsFillPlan, opsFillMessage, capPartyText,
  ensureSakDocs, normalizeImportSakDetails, searchCaseList,
} = loadFunctions([
  'normalizePubNumber', 'opsDate', 'opsAsArray', 'opsDocIdDate', 'opsTitle', 'opsParties',
  'parseOpsBiblio', 'opsFillPlan', 'opsFillMessage', 'toDisplay', 'capPartyText', 'sanitizeText',
  'ensureSakDocs', 'claimDocSelectable',
  'normalizeImportSakDetails', 'normalizeRounds', 'normalizeClaimMapping', 'normalizeObjections',
  'normalizeObjectionStates', 'isPositiveInt',
  'searchCaseList', '_detailsMatch',
], { vars: ['MAX_INVENTIVE_DOCS', 'PARTY_MAX_LEN'], globals: { parseDate: (s) => s } });

const WO_FIXTURE = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures', 'ops-biblio-WO2016169730.json'), 'utf8'));

function bibWith(parties) {
  return { 'ops:world-patent-data': { 'exchange-documents': { 'exchange-document': {
    '@kind': 'A1',
    'bibliographic-data': {
      'publication-reference': { 'document-id': [{ date: { $: '20200102' } }] },
      parties: parties,
    } } } } };
}
const party = (kind, fmt, seq, name) => ({ '@sequence': String(seq), '@data-format': fmt,
  [kind + '-name']: { name: { $: name } } });

// ── AC1 / AC4: lesing fra OPS ─────────────────────────────────

test('parseOpsBiblio reads applicants and inventors in the original format from the real fixture', () => {
  const r = parseOpsBiblio(WO_FIXTURE, 'A1');
  assert.strictEqual(r.applicants, 'ENDRESS+HAUSER MESSTECHNIK GMBH+CO. KG');
  assert.strictEqual(r.inventors, 'THIEL, Torsten; BRÄNDLIN, Stefan; ABRAHAM, Jürgen');
});

test('opsParties falls back to epodoc names when there is no original format', () => {
  const bib = { parties: { applicants: { applicant: party('applicant', 'epodoc', 1, 'ACME SUBSEA AS [NO]') } } };
  assert.strictEqual(opsParties(bib, 'applicant'), 'ACME SUBSEA AS [NO]');
});

test('opsParties keeps OPS order by sequence, removes duplicates and stray commas', () => {
  const bib = { parties: { inventors: { inventor: [
    party('inventor', 'original', 2, 'HANSEN, Kari,'),
    party('inventor', 'original', 1, ' NORDMANN,  Ola '),
    party('inventor', 'original', 3, 'HANSEN, Kari'),
  ] } } };
  assert.strictEqual(opsParties(bib, 'inventor'), 'NORDMANN, Ola; HANSEN, Kari');
});

test('opsParties gives an empty string when OPS has no parties', () => {
  assert.strictEqual(opsParties({}, 'applicant'), '');
  assert.strictEqual(opsParties(null, 'inventor'), '');
  const r = parseOpsBiblio(bibWith(undefined), '');
  assert.strictEqual(r.applicants, '');
  assert.strictEqual(r.inventors, '');
});

test('opsParties caps a very long list at 300 characters', () => {
  const many = [];
  for (let i = 1; i <= 60; i++) many.push(party('inventor', 'original', i, 'INVENTORNAME' + i + ', Firstname'));
  const s = opsParties({ parties: { inventors: { inventor: many } } }, 'inventor');
  assert.ok(s.length <= 300, s.length);
});

// ── AC2 / AC3: utfylling og melding ──────────────────────────

test('opsFillPlan fills empty applicant and inventor fields', () => {
  const dates = { pubDate: '2020-01-02', effDate: '', title: '', applicants: 'ACME AS', inventors: 'NORDMANN, Ola' };
  const plan = opsFillPlan({ pubDate: '', effDate: '', title: '', applicants: '', inventors: '' }, dates);
  assert.deepStrictEqual(plain(plan.patch), { pubDate: '2020-01-02', applicants: 'ACME AS', inventors: 'NORDMANN, Ola' });
});

test('opsFillPlan leaves filled names alone and reports no conflict', () => {
  const dates = { pubDate: '', effDate: '', applicants: 'ACME AS', inventors: 'NORDMANN, Ola' };
  const plan = opsFillPlan({ applicants: 'Acme', inventors: 'Ola Nordmann' }, dates);
  assert.deepStrictEqual(plain(plan.patch), {});
  assert.strictEqual(plan.conflicts.length, 0);
});

test('opsFillMessage names filled applicant and inventor fields', () => {
  const dates = { pubDate: '2020-01-02', effDate: '', applicants: 'ACME AS', inventors: 'NORDMANN, Ola', kind: 'A1' };
  const msg = opsFillMessage(opsFillPlan({}, dates), dates);
  assert.match(msg, /søker/);
  assert.match(msg, /oppfinner/);
});

test('opsFillMessage says when OPS had no names, while the dates are still filled', () => {
  const dates = { pubDate: '2020-01-02', effDate: '', applicants: '', inventors: '', kind: 'A1' };
  const plan = opsFillPlan({}, dates);
  assert.strictEqual(plan.patch.pubDate, '2020-01-02');
  assert.match(opsFillMessage(plan, dates), /OPS har ikke søker eller oppfinner/);
  const onlyInv = { pubDate: '2020-01-02', effDate: '', applicants: 'ACME AS', inventors: '', kind: 'A1' };
  assert.match(opsFillMessage(opsFillPlan({}, onlyInv), onlyInv), /OPS har ikke oppfinner/);
});

// ── AC5 / AC6: lagret form og import ─────────────────────────

test('capPartyText strips control characters, tidies spaces and cuts at 300', () => {
  assert.strictEqual(capPartyText('  ACME\u0007  AS \n'), 'ACME AS');
  assert.strictEqual(capPartyText('x'.repeat(400)).length, 300);
  assert.strictEqual(capPartyText(42), '');
  assert.strictEqual(capPartyText(null), '');
});

test('ensureSakDocs keeps applicants and inventors, and gives old documents empty fields', () => {
  const data = ensureSakDocs({ docs: [
    { ref: 'WO 2020/1 A1', applicants: 'ACME AS', inventors: 'NORDMANN, Ola' },
    { ref: 'EP 1 B1' },
  ], claims: [] });
  assert.strictEqual(data.docs[0].applicants, 'ACME AS');
  assert.strictEqual(data.docs[0].inventors, 'NORDMANN, Ola');
  assert.strictEqual(data.docs[1].applicants, '');
  assert.strictEqual(data.docs[1].inventors, '');
});

test('ensureSakDocs caps names that are too long or not text', () => {
  const data = ensureSakDocs({ docs: [{ ref: 'x', applicants: 'a'.repeat(1000), inventors: { evil: 1 } }], claims: [] });
  assert.strictEqual(data.docs[0].applicants.length, 300);
  assert.strictEqual(data.docs[0].inventors, '');
});

test('import keeps applicant and inventor names, capped, and loads files without them', () => {
  const out = normalizeImportSakDetails({ docs: [
    { ref: 'WO 2020/1 A1', applicants: 'ACME AS', inventors: 'b'.repeat(500) },
    { ref: 'EP 1 B1', applicants: ['<img src=x>'] },
    { ref: 'EP 2 B1' },
  ] });
  assert.strictEqual(out.docs[0].applicants, 'ACME AS');
  assert.strictEqual(out.docs[0].inventors.length, 300);
  assert.strictEqual(out.docs[1].applicants, '');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(out.docs[2], 'applicants'), false);
});

// ── AC8: Ctrl+K ──────────────────────────────────────────────

test('searchCaseList finds a case by applicant or inventor name of a prior-art document', () => {
  const cases = [{ id: 'a', caseNumber: '20261001', title: 'Pumpe' }, { id: 'b', caseNumber: '20261002', title: 'Ventil' }];
  const details = { a: { docs: [{ ref: 'WO 2020/1 A1', applicants: 'ENDRESS+HAUSER', inventors: 'THIEL, Torsten' }] } };
  const ids = (q) => plain(searchCaseList(q, cases, (id) => details[id] || null)).map((c) => c.id);
  assert.deepStrictEqual(ids('endress'), ['a']);
  assert.deepStrictEqual(ids('thiel'), ['a']);
  assert.deepStrictEqual(ids('th'), []); // under tre tegn leses ikke detaljene
});
