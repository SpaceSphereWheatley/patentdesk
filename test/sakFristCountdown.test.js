'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { fristCountdownLabel, claimFieldAriaLabel } = loadFunctions(
  ['fristCountdownLabel', 'claimFieldAriaLabel']
);

function sak(status, type) {
  return { id: '1', caseNumber: '20240517', status: status, type: type || 'case' };
}

// ── fristCountdownLabel ────────────────────────────
// Arbeidsdager er saksbehandlerens målestokk. Søkerens svarfrist er en
// kalenderfrist — søkeren jobber ikke etter vår arbeidskalender.

test('fristCountdownLabel: egen frist telles i arbeidsdager', () => {
  assert.strictEqual(fristCountdownLabel(sak('ny'), 70, 50), '50 arbeidsdager igjen');
  assert.strictEqual(fristCountdownLabel(sak('viderebehandling'), 70, 50), '50 arbeidsdager igjen');
});

test('fristCountdownLabel: søkers frist telles i kalenderdager', () => {
  assert.strictEqual(fristCountdownLabel(sak('fristarkiv'), 112, 80), '112 dager igjen');
});

test('fristCountdownLabel: oppdrag bruker kalenderdager', () => {
  assert.strictEqual(fristCountdownLabel(sak('ny', 'oppdrag'), 10, 8), '10 dager igjen');
});

test('fristCountdownLabel: i dag sies rett ut', () => {
  assert.strictEqual(fristCountdownLabel(sak('ny'), 0, 0), 'i dag');
  assert.strictEqual(fristCountdownLabel(sak('fristarkiv'), 0, 0), 'i dag');
});

test('fristCountdownLabel: forfalt telles i kalenderdager uansett eier', () => {
  assert.strictEqual(fristCountdownLabel(sak('ny'), -3, 0), '3 dager på overtid');
  assert.strictEqual(fristCountdownLabel(sak('fristarkiv'), -3, 0), '3 dager på overtid');
});

test('fristCountdownLabel: én dag bøyes ikke feil', () => {
  assert.strictEqual(fristCountdownLabel(sak('fristarkiv'), 1, 1), '1 dag igjen');
  assert.strictEqual(fristCountdownLabel(sak('ny'), 1, 1), '1 arbeidsdag igjen');
  assert.strictEqual(fristCountdownLabel(sak('ny'), -1, 0), '1 dag på overtid');
});

// ── claimFieldAriaLabel ────────────────────────────
// Feltene i kravtabellen har bare plassholdere; en skjermleser trenger å vite
// hvilket krav og hvilken kolonne den står i.

test('claimFieldAriaLabel: navngir krav og kolonne', () => {
  assert.strictEqual(claimFieldAriaLabel(3, 'dep'), 'Krav 3 — avhengig av');
  assert.strictEqual(claimFieldAriaLabel(3, 'note'), 'Krav 3 — notat');
  assert.strictEqual(claimFieldAriaLabel(12, 'label'), 'Krav 12 — etikett');
});

test('claimFieldAriaLabel: ukjent felt gir et brukbart navn framfor å kaste', () => {
  assert.strictEqual(claimFieldAriaLabel(1, 'tull'), 'Krav 1');
});
