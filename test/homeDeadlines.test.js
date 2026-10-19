'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const {
  defaultHomeDeadlineFilter, normalizeHomeDeadlineFilter, homeDeadlineKind,
  selectHomeDeadlines, homeDeadlineFilterSummary, HOME_DEADLINE_KINDS, HOME_DEADLINE_HORIZONS
} = loadFunctions(
  ['defaultHomeDeadlineFilter', 'normalizeHomeDeadlineFilter', 'homeDeadlineKind',
   'selectHomeDeadlines', 'homeDeadlineFilterSummary'],
  { vars: ['HOME_DEADLINE_KINDS', 'HOME_DEADLINE_HORIZONS'] }
);

// Testsakene bærer dagene til fristen direkte, så testen ikke avhenger av dagens dato
function days(c) { return c.d; }
function ids(rows) { return Array.from(rows, function(r) { return r.c.id; }); }

const CASES = [
  { id: 'ny-late',   status: 'ny',               d: -5 },
  { id: 'ny-soon',   status: 'ny',               d: 3 },
  { id: 'ny-far',    status: 'ny',               d: 120 },
  { id: 'vb-late',   status: 'viderebehandling', d: -2 },
  { id: 'vb-soon',   status: 'viderebehandling', d: 10 },
  { id: 'fa-late',   status: 'fristarkiv',       d: -8 },
  { id: 'fa-soon',   status: 'fristarkiv',       d: 20 },
  { id: 'opp-today', status: 'ny', type: 'oppdrag', d: 0 },
  { id: 'opp-done',  status: 'avsluttet', type: 'oppdrag', d: -1 },
  { id: 'done',      status: 'avsluttet',        d: -40 }
];

// ── homeDeadlineKind ────────────────────────────────

test('homeDeadlineKind: oppdrag is its own kind, closed cases have none', () => {
  assert.strictEqual(homeDeadlineKind({ status: 'ny' }), 'ny');
  assert.strictEqual(homeDeadlineKind({ status: 'viderebehandling' }), 'viderebehandling');
  assert.strictEqual(homeDeadlineKind({ status: 'fristarkiv' }), 'fristarkiv');
  assert.strictEqual(homeDeadlineKind({ status: 'ny', type: 'oppdrag' }), 'oppdrag');
  assert.strictEqual(homeDeadlineKind({ status: 'avsluttet' }), null);
  assert.strictEqual(homeDeadlineKind({ status: 'avsluttet', type: 'oppdrag' }), null);
  assert.strictEqual(homeDeadlineKind(null), null);
});

// ── default + normalize ─────────────────────────────

test('defaultHomeDeadlineFilter: own work on, applicant deadlines off, no horizon', () => {
  const f = defaultHomeDeadlineFilter();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(f)), {
    ny:               { overdue: true,  upcoming: true },
    viderebehandling: { overdue: true,  upcoming: true },
    fristarkiv:       { overdue: false, upcoming: false },
    oppdrag:          { overdue: true,  upcoming: true },
    horizon: 0
  });
});

test('defaultHomeDeadlineFilter: returns a fresh object each time', () => {
  const a = defaultHomeDeadlineFilter();
  a.ny.overdue = false;
  assert.strictEqual(defaultHomeDeadlineFilter().ny.overdue, true);
});

test('normalizeHomeDeadlineFilter: garbage falls back to the default', () => {
  const def = JSON.stringify(defaultHomeDeadlineFilter());
  assert.strictEqual(JSON.stringify(normalizeHomeDeadlineFilter(null)), def);
  assert.strictEqual(JSON.stringify(normalizeHomeDeadlineFilter('x')), def);
  assert.strictEqual(JSON.stringify(normalizeHomeDeadlineFilter([])), def);
});

test('normalizeHomeDeadlineFilter: keeps valid flags, fills in missing ones', () => {
  const f = normalizeHomeDeadlineFilter({ fristarkiv: { overdue: true }, ny: { upcoming: false }, horizon: 30 });
  assert.strictEqual(f.fristarkiv.overdue, true);
  assert.strictEqual(f.fristarkiv.upcoming, false);   // default
  assert.strictEqual(f.ny.overdue, true);             // default
  assert.strictEqual(f.ny.upcoming, false);
  assert.strictEqual(f.horizon, 30);
});

test('normalizeHomeDeadlineFilter: non-boolean flags and unknown horizons are ignored', () => {
  const f = normalizeHomeDeadlineFilter({ ny: { overdue: 'no' }, horizon: 45 });
  assert.strictEqual(f.ny.overdue, true);
  assert.strictEqual(f.horizon, 0);
  HOME_DEADLINE_HORIZONS.forEach(function(h) {
    assert.strictEqual(normalizeHomeDeadlineFilter({ horizon: h }).horizon, h);
  });
});

test('HOME_DEADLINE_KINDS: the four kinds the filter covers', () => {
  assert.deepStrictEqual(Array.from(HOME_DEADLINE_KINDS), ['ny', 'viderebehandling', 'fristarkiv', 'oppdrag']);
});

// ── selectHomeDeadlines ─────────────────────────────

test('selectHomeDeadlines: default shows own work and oppdrag in one list, sorted by date', () => {
  const rows = selectHomeDeadlines(CASES, defaultHomeDeadlineFilter(), days);
  assert.deepStrictEqual(ids(rows), ['ny-late', 'vb-late', 'opp-today', 'ny-soon', 'vb-soon', 'ny-far']);
  assert.strictEqual(rows[0].d, -5);
  assert.strictEqual(rows[0].kind, 'ny');
});

test('selectHomeDeadlines: overdue and upcoming are chosen separately per kind', () => {
  const f = defaultHomeDeadlineFilter();
  f.ny.overdue = false;
  f.viderebehandling.upcoming = false;
  f.fristarkiv.overdue = true;
  const rows = selectHomeDeadlines(CASES, f, days);
  assert.deepStrictEqual(ids(rows), ['fa-late', 'vb-late', 'opp-today', 'ny-soon', 'ny-far']);
});

test('selectHomeDeadlines: today counts as upcoming, not overdue', () => {
  const f = defaultHomeDeadlineFilter();
  f.oppdrag.upcoming = false;
  assert.ok(ids(selectHomeDeadlines(CASES, f, days)).indexOf('opp-today') === -1);
});

test('selectHomeDeadlines: horizon limits upcoming only — overdue always shows', () => {
  const f = defaultHomeDeadlineFilter();
  f.horizon = 14;
  f.fristarkiv.upcoming = true;
  assert.deepStrictEqual(ids(selectHomeDeadlines(CASES, f, days)), ['ny-late', 'vb-late', 'opp-today', 'ny-soon', 'vb-soon']);
});

test('selectHomeDeadlines: closed cases and cases without a date are left out', () => {
  const all = defaultHomeDeadlineFilter();
  HOME_DEADLINE_KINDS.forEach(function(k) { all[k].overdue = true; all[k].upcoming = true; });
  const rows = selectHomeDeadlines(CASES.concat([{ id: 'nodate', status: 'ny', d: NaN }]), all, days);
  assert.ok(ids(rows).indexOf('done') === -1);
  assert.ok(ids(rows).indexOf('opp-done') === -1);
  assert.ok(ids(rows).indexOf('nodate') === -1);
  assert.strictEqual(rows.length, 8);
});

test('selectHomeDeadlines: everything off gives an empty list', () => {
  const none = defaultHomeDeadlineFilter();
  HOME_DEADLINE_KINDS.forEach(function(k) { none[k].overdue = false; none[k].upcoming = false; });
  assert.strictEqual(selectHomeDeadlines(CASES, none, days).length, 0);
});

// ── homeDeadlineFilterSummary ───────────────────────

test('homeDeadlineFilterSummary: names the kinds and qualifies partial ones', () => {
  assert.strictEqual(homeDeadlineFilterSummary(defaultHomeDeadlineFilter()),
    'Førstesøknader · Viderebehandlinger · Oppdrag');
  const f = defaultHomeDeadlineFilter();
  f.viderebehandling.upcoming = false;
  f.fristarkiv.overdue = true;
  f.horizon = 30;
  assert.strictEqual(homeDeadlineFilterSummary(f),
    'Førstesøknader · Viderebehandlinger (forfalte) · Svarfrister (forfalte) · Oppdrag · kommende innen 30 dager');
  f.ny.overdue = false;
  assert.strictEqual(homeDeadlineFilterSummary(f).split(' · ')[0], 'Førstesøknader (kommende)');
});

test('homeDeadlineFilterSummary: says so when nothing is selected', () => {
  const none = defaultHomeDeadlineFilter();
  HOME_DEADLINE_KINDS.forEach(function(k) { none[k].overdue = false; none[k].upcoming = false; });
  assert.strictEqual(homeDeadlineFilterSummary(none), 'Ingenting valgt');
});
