'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { fristOwnerLabel, fristOwnerNote, forwardAction, migrateDocTitles } = loadFunctions(
  ['fristOwnerLabel', 'fristOwnerNote', 'forwardAction', 'migrateDocTitles']
);

function sak(status, type) {
  return { id: '1', caseNumber: '20240517', status: status, type: type || 'case' };
}

// ── fristOwnerLabel ────────────────────────────────
// Hvem fristen tilhører er den sentrale domeneregelen på sakssiden, så den
// skal stå skrevet i UI-et og ikke bare ligge i logikken.

test('fristOwnerLabel: Ny og Viderebehandling er saksbehandlerens egen frist', () => {
  assert.strictEqual(fristOwnerLabel(sak('ny')), 'Din frist');
  assert.strictEqual(fristOwnerLabel(sak('viderebehandling')), 'Din frist');
});

test('fristOwnerLabel: i Fristarkiv er fristen søkerens', () => {
  assert.strictEqual(fristOwnerLabel(sak('fristarkiv')), 'Søkers frist');
});

test('fristOwnerLabel: avsluttet sak har ingen eier å utheve', () => {
  assert.strictEqual(fristOwnerLabel(sak('avsluttet')), 'Frist');
});

test('fristOwnerLabel: oppdrag har sin egen frist uansett status', () => {
  assert.strictEqual(fristOwnerLabel(sak('ny', 'oppdrag')), 'Frist');
  assert.strictEqual(fristOwnerLabel(sak('avsluttet', 'oppdrag')), 'Frist');
});

test('fristOwnerNote: bare Fristarkiv sier at fristen ikke koster arbeid', () => {
  assert.match(fristOwnerNote(sak('fristarkiv')), /søker/i);
  assert.match(fristOwnerNote(sak('fristarkiv')), /belegg/i);
  assert.match(fristOwnerNote(sak('ny')), /belegg/i);
  assert.strictEqual(fristOwnerNote(sak('avsluttet')), '');
});

// ── forwardAction ──────────────────────────────────
// Etiketten på «Marker som fullført» er en avledning av statusmodellen, ikke
// en hardkodet streng per knapp.

test('forwardAction: Ny og Viderebehandling fullføres til Fristarkiv', () => {
  assert.deepStrictEqual(Object.assign({}, forwardAction('ny', false)),
    { label: 'Marker som fullført', toStatus: 'fristarkiv', choice: null });
  assert.deepStrictEqual(Object.assign({}, forwardAction('viderebehandling', false)),
    { label: 'Marker som fullført', toStatus: 'fristarkiv', choice: null });
});

test('forwardAction: Fristarkiv har to mulige utfall, så den åpner valgpopupen', () => {
  const a = forwardAction('fristarkiv', false);
  assert.strictEqual(a.label, 'Registrer svar …');
  assert.strictEqual(a.toStatus, null);
  assert.strictEqual(a.choice, 'fristarkiv');
});

test('forwardAction: et aktivt oppdrag merkes utført', () => {
  assert.deepStrictEqual(Object.assign({}, forwardAction('ny', true)),
    { label: 'Merk som utført', toStatus: 'avsluttet', choice: null });
});

test('forwardAction: en avsluttet sak har ingen handling igjen', () => {
  assert.strictEqual(forwardAction('avsluttet', false), null);
  assert.strictEqual(forwardAction('avsluttet', true), null);
});

test('forwardAction: ukjent status gir ingen knapp i stedet for å gjette', () => {
  assert.strictEqual(forwardAction('tullestatus', false), null);
  assert.strictEqual(forwardAction('', false), null);
});

// ── migrateDocTitles ───────────────────────────────
// Tittelfeltet fjernes fra motholdradene. Ingen lagret tekst skal bli
// liggende usynlig og uredigerbar.

function doc(overrides) {
  return Object.assign({ id: 'D1', ref: '', title: '', p: false, e: false, background: false }, overrides);
}

test('migrateDocTitles: tittel flyttes til referansen når referansen er tom', () => {
  const data = { docs: [doc({ title: 'Mooring system for floating wind turbine' })] };
  assert.strictEqual(migrateDocTitles(data), true);
  assert.strictEqual(data.docs[0].ref, 'Mooring system for floating wind turbine');
  assert.strictEqual('title' in data.docs[0], false);
});

test('migrateDocTitles: en eksisterende referanse vinner over tittelen', () => {
  const data = { docs: [doc({ ref: 'WO 2019/143283 A1', title: 'Mooring system' })] };
  migrateDocTitles(data);
  assert.strictEqual(data.docs[0].ref, 'WO 2019/143283 A1');
  assert.strictEqual('title' in data.docs[0], false);
});

test('migrateDocTitles: tom tittel fjernes uten å røre referansen', () => {
  const data = { docs: [doc({ ref: 'EP 3 456 984 B1' })] };
  assert.strictEqual(migrateDocTitles(data), true);
  assert.strictEqual(data.docs[0].ref, 'EP 3 456 984 B1');
  assert.strictEqual('title' in data.docs[0], false);
});

test('migrateDocTitles: allerede migrerte data rapporterer ingen endring', () => {
  const d = doc({ ref: 'WO 2019/143283 A1' });
  delete d.title;
  const data = { docs: [d] };
  assert.strictEqual(migrateDocTitles(data), false);
});

test('migrateDocTitles: data uten mothold er en trygg no-op', () => {
  assert.strictEqual(migrateDocTitles(null), false);
  assert.strictEqual(migrateDocTitles({}), false);
  assert.strictEqual(migrateDocTitles({ docs: [] }), false);
});
