'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { suggestDocFlags, applicationDatesError, ensureSakDocs } = loadFunctions(
  ['suggestDocFlags', 'applicationDatesError', 'ensureSakDocs', 'toDisplay'],
  { vars: ['MAX_INVENTIVE_DOCS'] }
);

// Søknad med prioritet 2022-06-01, innlevert 2023-05-12
const APP = { filingDate: '2023-05-12', priorityDate: '2022-06-01' };
const doc = (pubDate, effDate) => ({ pubDate: pubDate || '', effDate: effDate || '' });

// ── P: publisert på/etter prioritet, før inngivelse ──

test('P is suggested for a document published between priority and filing', () => {
  const s = suggestDocFlags(doc('2022-11-03'), APP);
  assert.strictEqual(s.p, true);
  assert.strictEqual(s.e, false);
  assert.match(s.pReason, /2022\.11\.03/);
});

test('P boundaries: on the priority date counts, on the filing date does not', () => {
  assert.strictEqual(suggestDocFlags(doc('2022-05-31'), APP).p, false);
  assert.strictEqual(suggestDocFlags(doc('2022-06-01'), APP).p, true);
  assert.strictEqual(suggestDocFlags(doc('2023-05-11'), APP).p, true);
  assert.strictEqual(suggestDocFlags(doc('2023-05-12'), APP).p, false);
});

test('P is never suggested without a priority date', () => {
  const s = suggestDocFlags(doc('2023-01-01'), { filingDate: '2023-05-12', priorityDate: '' });
  assert.strictEqual(s.p, false);
});

// ── E: eldre dato, publisert på/etter inngivelsesdagen ──

test('E is suggested for an older document published on or after filing', () => {
  const s = suggestDocFlags(doc('2023-05-12', '2022-01-10'), APP);
  assert.strictEqual(s.e, true);
  assert.strictEqual(s.p, false);
  assert.match(s.eReason, /2022\.01\.10/);
});

test('E compares the document date against the priority date when there is one', () => {
  // Eldre enn inngivelsen, men ikke eldre enn prioriteten
  assert.strictEqual(suggestDocFlags(doc('2023-08-01', '2022-09-01'), APP).e, false);
  assert.strictEqual(suggestDocFlags(doc('2023-08-01', '2022-06-01'), APP).e, false);
  assert.strictEqual(suggestDocFlags(doc('2023-08-01', '2022-05-31'), APP).e, true);
});

test('E falls back to the filing date when there is no priority', () => {
  const app = { filingDate: '2023-05-12', priorityDate: '' };
  assert.strictEqual(suggestDocFlags(doc('2023-08-01', '2023-05-11'), app).e, true);
  assert.strictEqual(suggestDocFlags(doc('2023-08-01', '2023-05-12'), app).e, false);
});

test('E boundaries on publication: the day before filing is not E', () => {
  assert.strictEqual(suggestDocFlags(doc('2023-05-11', '2022-01-10'), APP).e, false);
  assert.strictEqual(suggestDocFlags(doc('2023-05-12', '2022-01-10'), APP).e, true);
});

// ── Ufullstendige data gir ingen forslag ──

test('no suggestions when dates are missing', () => {
  const none = (d, a) => { const s = suggestDocFlags(d, a); return !s.p && !s.e; };
  assert.ok(none(doc('', ''), APP));
  assert.ok(none(doc('', '2022-01-10'), APP));      // E trenger publiseringsdato
  assert.ok(none(doc('2022-11-03'), {}));            // søknaden mangler datoer
  assert.ok(none(doc('2023-08-01', '2022-01-10'), { filingDate: '', priorityDate: '2022-06-01' }));
  assert.ok(none(null, APP));
});

test('ordinary prior art published before the priority date gets no flag', () => {
  const s = suggestDocFlags(doc('2020-01-01', '2019-01-01'), APP);
  assert.strictEqual(s.p, false);
  assert.strictEqual(s.e, false);
});

// ── Søknadsdatoene i modalen ──

test('applicationDatesError rejects a priority date after the filing date', () => {
  assert.ok(applicationDatesError('2023-05-12', '2023-05-13'));
  assert.strictEqual(applicationDatesError('2023-05-12', '2023-05-12'), '');
  assert.strictEqual(applicationDatesError('2023-05-12', '2022-06-01'), '');
  assert.strictEqual(applicationDatesError('', '2022-06-01'), '');
  assert.strictEqual(applicationDatesError('2023-05-12', ''), '');
});

// ── ensureSakDocs beholder datoene ──

test('ensureSakDocs keeps the document dates and defaults them to empty', () => {
  const data = { docs: [{ ref: 'WO 1', pubDate: '2022-11-03', effDate: '2021-10-20' }, { ref: 'EP 2' }], claims: [] };
  ensureSakDocs(data);
  assert.strictEqual(data.docs[0].pubDate, '2022-11-03');
  assert.strictEqual(data.docs[0].effDate, '2021-10-20');
  assert.strictEqual(data.docs[1].pubDate, '');
  assert.strictEqual(data.docs[1].effDate, '');
});
