'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadFunctions } = require('./extractFunctions');

const plain = (v) => JSON.parse(JSON.stringify(v));
const { vacationListOrder, vacationClashes, vacationClashText } = loadFunctions(
  ['vacationListOrder', 'vacationClashes', 'vacationClashText', 'toDisplay']);

const vac = (from, to, label) => ({ from: from, to: to, label: label });
const TODAY = '2026-10-30';

// ── Rekkefølgen i ferielista ──────────────────────────────────
// Regression: the list kept the order the periods were entered in.
test('vacationListOrder puts ongoing and upcoming periods first, by date', () => {
  const list = [
    vac('2026-12-21', '2027-01-02', 'Jul'),
    vac('2026-07-01', '2026-07-21', 'Sommer'),
    vac('2026-10-28', '2026-11-03', 'Høstferie'),
    vac('2027-04-01', '2027-04-06', 'Påske'),
    vac('2026-02-20', '2026-02-27', 'Vinter'),
  ];
  // Pågår og kommende etter dato, så ferdige med den siste først.
  assert.deepStrictEqual(plain(vacationListOrder(list, TODAY)), [2, 0, 3, 1, 4]);
});

test('vacationListOrder counts a period ending today as ongoing', () => {
  const list = [vac('2026-01-01', '2026-01-05', 'Gammel'), vac('2026-10-20', TODAY, 'Slutter i dag')];
  assert.deepStrictEqual(plain(vacationListOrder(list, TODAY)), [1, 0]);
  assert.deepStrictEqual(plain(vacationListOrder([], TODAY)), []);
});

// ── Overlapp med perioder som finnes ──────────────────────────
test('vacationClashes finds periods that share at least one day', () => {
  const list = [vac('2026-07-01', '2026-07-21', 'Sommer'), vac('2026-12-21', '2027-01-02', 'Jul')];
  assert.deepStrictEqual(plain(vacationClashes(list, '2026-07-21', '2026-07-25')).map((v) => v.label), ['Sommer'], 'shared end day');
  assert.deepStrictEqual(plain(vacationClashes(list, '2026-06-01', '2027-02-01')).map((v) => v.label), ['Sommer', 'Jul']);
  assert.deepStrictEqual(plain(vacationClashes(list, '2026-07-22', '2026-07-30')), [], 'the day after is fine');
});

test('vacationClashes leaves out the period being edited', () => {
  const list = [vac('2026-07-01', '2026-07-21', 'Sommer'), vac('2026-07-20', '2026-07-31', 'Hytte')];
  assert.deepStrictEqual(plain(vacationClashes(list, '2026-07-01', '2026-07-25', 0)).map((v) => v.label), ['Hytte']);
  assert.deepStrictEqual(plain(vacationClashes(list, '2026-07-01', '2026-07-10', 0)), []);
});

test('vacationClashText names the periods it overlaps', () => {
  assert.strictEqual(vacationClashText([]), '');
  assert.strictEqual(vacationClashText([vac('2026-07-01', '2026-07-21', 'Sommer')]),
    ' · overlapper Sommer (2026.07.01–2026.07.21)');
  assert.strictEqual(vacationClashText([vac('2026-07-01', '2026-07-21', ''), vac('2026-12-21', '2027-01-02', 'Jul')]),
    ' · overlapper Ferie (2026.07.01–2026.07.21), Jul (2026.12.21–2027.01.02)');
});

// ── «Finnes» i Legg til saker er bare et merke ────────────────
// Regression: clicking it closed the dialog and the pasted list was lost.
test('the duplicate tag in the paste preview is not a link', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'PatentDesk.html'), 'utf8');
  assert.ok(!/<a [^>]*class="bulk-dup-tag"/.test(html), 'tag is still a link');
  assert.ok(!/closest\('\.bulk-dup-tag'\)/.test(html), 'click handler still present');
});
