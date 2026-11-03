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

// Avsluttet: arbeidet er gjort. Et ferdig oppdrag/en avsluttet sak er ikke på
// overtid, uansett hvor langt fristen ligger bak oss.

test('fristCountdownLabel: avsluttet oppdrag er «Utført», uansett dager', () => {
  assert.strictEqual(fristCountdownLabel(sak('avsluttet', 'oppdrag'), -257, 0), 'Utført');
  assert.strictEqual(fristCountdownLabel(sak('avsluttet', 'oppdrag'), 0, 0), 'Utført');
  assert.strictEqual(fristCountdownLabel(sak('avsluttet', 'oppdrag'), 30, 20), 'Utført');
});

test('fristCountdownLabel: avsluttet sak (ikke oppdrag) er «Avsluttet», uansett dager', () => {
  assert.strictEqual(fristCountdownLabel(sak('avsluttet'), -257, 0), 'Avsluttet');
  assert.strictEqual(fristCountdownLabel(sak('avsluttet'), 0, 0), 'Avsluttet');
  assert.strictEqual(fristCountdownLabel(sak('avsluttet'), 30, 20), 'Avsluttet');
  assert.strictEqual(fristCountdownLabel(sak('avsluttet', 'annet'), -1, 0), 'Avsluttet');
});

// ── fristCountdownTone ─────────────────────────────
// CSS-modifikatoren for nedtellingen. Lastes per test, slik at en manglende
// funksjon bare feiler disse testene og ikke hele filen.

function tone(c, days) {
  const { fristCountdownTone } = loadFunctions(['fristCountdownTone']);
  return fristCountdownTone(c, days);
}

test('fristCountdownTone: avsluttet farges aldri, uansett type og dager', () => {
  for (const type of ['case', 'oppdrag']) {
    assert.strictEqual(tone(sak('avsluttet', type), -257), '');
    assert.strictEqual(tone(sak('avsluttet', type), 0), '');
    assert.strictEqual(tone(sak('avsluttet', type), 5), '');
    assert.strictEqual(tone(sak('avsluttet', type), 100), '');
  }
});

test('fristCountdownTone: søkers frist (fristarkiv, ikke oppdrag) farges aldri', () => {
  assert.strictEqual(tone(sak('fristarkiv'), -3), '');
  assert.strictEqual(tone(sak('fristarkiv'), 0), '');
  assert.strictEqual(tone(sak('fristarkiv'), 14), '');
  assert.strictEqual(tone(sak('fristarkiv'), 100), '');
});

test('fristCountdownTone: egen frist — overdue < 0, urgent <= 14, ellers tom', () => {
  for (const status of ['ny', 'viderebehandling']) {
    assert.strictEqual(tone(sak(status), -1), 'overdue');
    assert.strictEqual(tone(sak(status), -257), 'overdue');
    assert.strictEqual(tone(sak(status), 0), 'urgent');
    assert.strictEqual(tone(sak(status), 14), 'urgent');
    assert.strictEqual(tone(sak(status), 15), '');
  }
});

test('fristCountdownTone: aktivt oppdrag farges etter dager', () => {
  assert.strictEqual(tone(sak('ny', 'oppdrag'), -1), 'overdue');
  assert.strictEqual(tone(sak('ny', 'oppdrag'), 14), 'urgent');
  assert.strictEqual(tone(sak('ny', 'oppdrag'), 15), '');
});

test('fristCountdownTone: fristarkiv-unntaket gjelder ikke oppdrag', () => {
  assert.strictEqual(tone(sak('fristarkiv', 'oppdrag'), -1), 'overdue');
  assert.strictEqual(tone(sak('fristarkiv', 'oppdrag'), 14), 'urgent');
  assert.strictEqual(tone(sak('fristarkiv', 'oppdrag'), 15), '');
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
