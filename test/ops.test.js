'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadFunctions } = require('./extractFunctions');

const { opsPubNumber, opsDate, parseOpsBiblio, opsFillPlan, opsFillMessage, opsErrorMessage } = loadFunctions([
  'normalizePubNumber', 'opsPubNumber', 'opsDate', 'opsAsArray', 'opsDocIdDate',
  'opsTitle', 'parseOpsBiblio', 'opsFillPlan', 'opsFillMessage', 'opsErrorMessage', 'toDisplay',
]);

// Et ekte svar fra OPS (published-data/biblio, JSON) for WO 2016/169730 A1:
// ett dokument, én prioritet (DE 10 2015 106 349, 2015-04-24).
const WO_FIXTURE = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures', 'ops-biblio-WO2016169730.json'), 'utf8'));

// OPS gir et enkelt objekt når det er ett element, og en liste når det er
// flere. Bygger et svar med flere dokumenter og flere prioriteter.
function did(date) {
  return [{ '@document-id-type': 'docdb', date: { $: date } },
          { '@document-id-type': 'epodoc', date: { $: date } }];
}
function exDoc(kind, pub, prios, appDate) {
  const bib = { 'publication-reference': { 'document-id': did(pub) } };
  if (appDate) bib['application-reference'] = { 'document-id': did(appDate) };
  if (prios) {
    const claims = prios.map((d) => ({ 'document-id': did(d) }));
    bib['priority-claims'] = { 'priority-claim': claims.length === 1 ? claims[0] : claims };
  }
  return { '@kind': kind, 'bibliographic-data': bib };
}
function wrap(docs) {
  return { 'ops:world-patent-data': { 'exchange-documents': {
    'exchange-document': docs.length === 1 ? docs[0] : docs } } };
}

// ── opsPubNumber ──

test('opsPubNumber splits a reference into epodoc number and kind code', () => {
  assert.deepStrictEqual({ ...opsPubNumber('WO 2016/169730 A1') }, { epodoc: 'WO2016169730', kind: 'A1' });
  assert.deepStrictEqual({ ...opsPubNumber('EP 1 000 000 B1') }, { epodoc: 'EP1000000', kind: 'B1' });
  assert.deepStrictEqual({ ...opsPubNumber('DE102012210085') }, { epodoc: 'DE102012210085', kind: '' });
  assert.deepStrictEqual({ ...opsPubNumber('NO 345678 B1') }, { epodoc: 'NO345678', kind: 'B1' });
});

test('opsPubNumber pads the serial of a short modern WO number', () => {
  assert.strictEqual(opsPubNumber('WO 2020/12345 A1').epodoc, 'WO2020012345');
  assert.strictEqual(opsPubNumber('WO 99/12345').epodoc, 'WO9912345'); // gammelt format urørt
});

test('opsPubNumber drops the zero in a US application number', () => {
  // US 2008/0264140 A1 heter US2008264140 i OPS (se references-cited i fixturen)
  assert.strictEqual(opsPubNumber('US 2008/0264140 A1').epodoc, 'US2008264140');
  assert.strictEqual(opsPubNumber('US 9,876,543 B2').epodoc, 'US9876543');
});

test('opsPubNumber returns null for something that is not a publication number', () => {
  assert.strictEqual(opsPubNumber(''), null);
  assert.strictEqual(opsPubNumber('se vedlegg'), null);
  assert.strictEqual(opsPubNumber('12345'), null);
});

// ── opsDate ──

test('opsDate turns YYYYMMDD into ISO and rejects anything else', () => {
  assert.strictEqual(opsDate('20161027'), '2016-10-27');
  assert.strictEqual(opsDate('2016-10-27'), '');
  assert.strictEqual(opsDate(undefined), '');
});

// ── parseOpsBiblio ──

test('parseOpsBiblio reads the real WO fixture', () => {
  const r = parseOpsBiblio(WO_FIXTURE, 'A1');
  assert.strictEqual(r.pubDate, '2016-10-27');
  assert.strictEqual(r.effDate, '2015-04-24'); // prioriteten, ikke PCT-inngivelsen 2016-03-24
  assert.strictEqual(r.kind, 'A1');
});

test('parseOpsBiblio picks the earliest of several priorities', () => {
  const r = parseOpsBiblio(wrap([exDoc('A1', '20200102', ['20180505', '20180101', '20181212'], '20190101')]), '');
  assert.strictEqual(r.effDate, '2018-01-01');
});

test('parseOpsBiblio falls back to the application date without priority', () => {
  const r = parseOpsBiblio(wrap([exDoc('A1', '20200102', null, '20190101')]), '');
  assert.strictEqual(r.effDate, '2019-01-01');
});

test('parseOpsBiblio matches the kind code among several publications', () => {
  const json = wrap([exDoc('A1', '20000628', ['19980101']), exDoc('B1', '20050101', ['19980101'])]);
  assert.strictEqual(parseOpsBiblio(json, 'B1').pubDate, '2005-01-01');
  assert.strictEqual(parseOpsBiblio(json, 'A1').pubDate, '2000-06-28');
});

test('parseOpsBiblio uses the first publication when no kind is given or it is unknown', () => {
  const json = wrap([exDoc('B1', '20050101', ['19980101']), exDoc('A1', '20000628', ['19980101'])]);
  const none = parseOpsBiblio(json, '');
  assert.strictEqual(none.pubDate, '2000-06-28');
  assert.strictEqual(none.kind, 'A1');
  assert.strictEqual(parseOpsBiblio(json, 'A2').kind, 'A1');
});

test('parseOpsBiblio returns null for an answer without documents', () => {
  assert.strictEqual(parseOpsBiblio({}, ''), null);
  assert.strictEqual(parseOpsBiblio(null, ''), null);
  assert.strictEqual(parseOpsBiblio(wrap([{ '@kind': 'A1' }]), ''), null);
});

// ── opsFillPlan ──

test('opsFillPlan fills only empty fields', () => {
  const plan = opsFillPlan({ pubDate: '', effDate: '' }, { pubDate: '2016-10-27', effDate: '2015-04-24' });
  assert.deepStrictEqual({ ...plan.patch }, { pubDate: '2016-10-27', effDate: '2015-04-24' });
  assert.strictEqual(plan.conflicts.length, 0);
});

test('opsFillPlan never overwrites, and reports where OPS disagrees', () => {
  const plan = opsFillPlan({ pubDate: '2016-10-28', effDate: '2015-04-24' },
                           { pubDate: '2016-10-27', effDate: '2015-04-24' });
  assert.deepStrictEqual({ ...plan.patch }, {});
  assert.strictEqual(plan.conflicts.length, 1);
  assert.deepStrictEqual({ ...plan.conflicts[0] }, { field: 'pubDate', mine: '2016-10-28', ops: '2016-10-27' });
});

test('opsFillPlan ignores dates OPS did not have', () => {
  const plan = opsFillPlan({ pubDate: '', effDate: '' }, { pubDate: '2016-10-27', effDate: '' });
  assert.deepStrictEqual({ ...plan.patch }, { pubDate: '2016-10-27' });
});

// ── opsErrorMessage ──

test('opsErrorMessage has a Norwegian message for each failure', () => {
  ['nocreds', 'badref', 'auth', 'notfound', 'quota', 'network', 'http', 'parse'].forEach((k) => {
    assert.ok(opsErrorMessage(k).length > 10, k);
  });
  assert.match(opsErrorMessage('notfound'), /fant ikke/i);
  assert.ok(opsErrorMessage('ukjent').length > 10);
});

// ── opsFillMessage ──

test('opsFillMessage lists what was filled', () => {
  const dates = { pubDate: '2016-10-27', effDate: '2015-04-24', kind: 'A1' };
  const msg = opsFillMessage(opsFillPlan({ pubDate: '', effDate: '' }, dates), dates);
  assert.match(msg, /Hentet fra OPS \(A1\)/);
  assert.match(msg, /publisert 2016\.10\.27/);
  assert.match(msg, /prioritet\/inng\. 2015\.04\.24/);
});

test('opsFillMessage says when nothing was empty, and names disagreements', () => {
  const dates = { pubDate: '2016-10-27', effDate: '2015-04-24', kind: 'A1' };
  const msg = opsFillMessage(opsFillPlan({ pubDate: '2016-10-28', effDate: '2015-04-24' }, dates), dates);
  assert.match(msg, /Ingen tomme datofelt/);
  assert.match(msg, /OPS sier publisert 2016\.10\.27, du har 2016\.10\.28 — ikke endret/);
});

// ── Tittel ──

test('parseOpsBiblio reads the English title from the real WO fixture', () => {
  assert.strictEqual(parseOpsBiblio(WO_FIXTURE, 'A1').title,
    'MOBILE APPARATUS AND METHOD FOR THE IN-SITU CALIBRATION OF A GAS CONCENTRATION MEASURING DEVICE');
});

test('parseOpsBiblio title: English when present, else the first, else empty', () => {
  const withTitle = (t) => {
    const d = exDoc('A1', '20200102', ['20180101']);
    if (t !== undefined) d['bibliographic-data']['invention-title'] = t;
    return wrap([d]);
  };
  assert.strictEqual(parseOpsBiblio(withTitle({ '@lang': 'de', $: 'VORRICHTUNG' }), '').title, 'VORRICHTUNG');
  assert.strictEqual(parseOpsBiblio(withTitle([{ '@lang': 'fr', $: 'DISPOSITIF' }, { '@lang': 'de', $: 'VORRICHTUNG' }]), '').title, 'DISPOSITIF');
  assert.strictEqual(parseOpsBiblio(withTitle([{ '@lang': 'de', $: 'VORRICHTUNG' }, { '@lang': 'en', $: 'DEVICE' }]), '').title, 'DEVICE');
  assert.strictEqual(parseOpsBiblio(withTitle({ '@lang': 'en', $: '  DEVICE\n FOR X ' }), '').title, 'DEVICE FOR X');
  assert.strictEqual(parseOpsBiblio(withTitle(undefined), '').title, '');
});

test('opsFillPlan fills an empty title but never reports a different one', () => {
  const dates = { pubDate: '2016-10-27', effDate: '', title: 'DEVICE' };
  assert.strictEqual(opsFillPlan({ pubDate: '', effDate: '', title: '' }, dates).patch.title, 'DEVICE');
  const kept = opsFillPlan({ pubDate: '2016-10-27', effDate: '', title: 'Anordning for kalibrering' }, dates);
  assert.deepStrictEqual({ ...kept.patch }, {});
  assert.strictEqual(kept.conflicts.length, 0);
});

test('opsFillMessage names the title among the filled fields', () => {
  const dates = { pubDate: '2016-10-27', effDate: '2015-04-24', title: 'DEVICE', kind: 'A1' };
  const msg = opsFillMessage(opsFillPlan({}, dates), dates);
  assert.match(msg, /prioritet\/inng\. 2015\.04\.24, tittel\.$/);
});
