'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadFunctions } = require('./extractFunctions');

// Objekter fra sandkassen har en annen Object-prototype; kopier før deepStrictEqual.
const plain = (v) => JSON.parse(JSON.stringify(v));

const { homeDeadlineSummary, homeOverdueSubText, homeDockText, homeListBadges } = loadFunctions(
  ['homeDeadlineSummary', 'homeOverdueSubText', 'homeDockText', 'homeListBadges', 'isUnassigned', 'canBeUnassigned']);

// Dager til fristen leses rett fra testsaken, så testene ikke avhenger av datoen.
const days = (c) => c.d;
const sak = (status, d, over) => Object.assign({ type: 'sak', status: status, dueDate: 'x', d: d }, over);
const oppdrag = (d, over) => Object.assign({ type: 'oppdrag', status: 'ny', dueDate: 'x', d: d }, over);

// ── Forfalt-kortet: alle dine forfalte frister ────────────────
// Regression: the card counted only Ny cases, while the banner counted all,
// so Hjem showed two different numbers for the same thing.
test('homeDeadlineSummary counts every overdue deadline that is yours', () => {
  const s = plain(homeDeadlineSummary([
    sak('ny', -6), sak('ny', -2), sak('viderebehandling', -1), oppdrag(-3),
    sak('ny', 3), sak('ny', 5), oppdrag(20),
  ], days));
  assert.deepStrictEqual(s, { total: 4, ny: 2, videre: 1, oppdrag: 1, next: 3 });
});

test('homeDeadlineSummary leaves out the applicant, unassigned cases and closed work', () => {
  const s = plain(homeDeadlineSummary([
    sak('fristarkiv', -10), sak('fristarkiv', 1),
    sak('ny', -4, { unassigned: true }), sak('ny', 2, { unassigned: true }),
    sak('avsluttet', -9), oppdrag(-1, { status: 'avsluttet' }),
    sak('ny', NaN, { dueDate: '' }),
  ], days));
  assert.deepStrictEqual(s, { total: 0, ny: 0, videre: 0, oppdrag: 0, next: null });
});

test('homeDeadlineSummary takes a deadline today as the next one, not as overdue', () => {
  const s = plain(homeDeadlineSummary([sak('ny', 0), sak('ny', 4)], days));
  assert.strictEqual(s.total, 0);
  assert.strictEqual(s.next, 0);
});

test('homeOverdueSubText names the kinds that are overdue', () => {
  assert.strictEqual(homeOverdueSubText({ total: 4, ny: 2, videre: 1, oppdrag: 1 }), '2 nye · 1 viderebehandling · 1 oppdrag');
  assert.strictEqual(homeOverdueSubText({ total: 1, ny: 1, videre: 0, oppdrag: 0 }), '1 ny');
  assert.strictEqual(homeOverdueSubText({ total: 2, ny: 0, videre: 2, oppdrag: 0 }), '2 viderebehandlinger');
  assert.strictEqual(homeOverdueSubText({ total: 0, ny: 0, videre: 0, oppdrag: 0 }), 'ingen saker over fristen');
});

// ── Stripa når Arbeidsplan er slått sammen ────────────────────
test('homeDockText gives the overdue count and the next deadline', () => {
  assert.strictEqual(homeDockText({ total: 3, next: 3 }), '3 forfalt · neste frist om 3 dager');
  assert.strictEqual(homeDockText({ total: 0, next: 1 }), 'Ingen forfalte · neste frist i morgen');
  assert.strictEqual(homeDockText({ total: 1, next: 0 }), '1 forfalt · neste frist i dag');
  assert.strictEqual(homeDockText({ total: 2, next: null }), '2 forfalt · ingen kommende frister');
});

// ── Merkene i overskriften på fristlista ──────────────────────
test('homeListBadges counts the rows the list shows, without the applicant\'s deadlines', () => {
  const rows = [
    { d: -6, kind: 'ny' }, { d: -1, kind: 'viderebehandling' }, { d: -30, kind: 'fristarkiv' },
    { d: 0, kind: 'ny' }, { d: 7, kind: 'oppdrag' }, { d: 8, kind: 'ny' }, { d: 2, kind: 'fristarkiv' },
  ];
  assert.deepStrictEqual(plain(homeListBadges(rows)), { overdue: 2, soon: 2 });
  assert.deepStrictEqual(plain(homeListBadges([])), { overdue: 0, soon: 0 });
});

// ── Fristvarsel-banneret er borte ─────────────────────────────
test('the deadline banner is gone from Hjem', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'PatentDesk.html'), 'utf8');
  assert.ok(!/id="frist-digest"/.test(html), 'banner markup still present');
  assert.ok(!/function renderFristDigest/.test(html), 'banner code still present');
});
