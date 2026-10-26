'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const {
  lettersSent,
  examinationRound,
  caseTrack,
  closedDate,
  pipelineCounts,
  rowAction,
  currentTrackSlot,
  OUTCOMES,
} = loadFunctions([
  'currentTrackSlot',
  'lettersSent',
  'examinationRound',
  'caseTrack',
  'closedDate',
  'pipelineCounts', 'isUnassigned', 'canBeUnassigned',
  'rowAction',
], { vars: ['OUTCOMES'] });

const plain = (v) => JSON.parse(JSON.stringify(v));

function st(from, to, date) {
  return { type: 'status', date: date || '2026-01-01T10:00:00.000Z', from: from, to: to };
}

function sak(status, history, extra) {
  return Object.assign({ id: 'x', type: 'sak', status: status, history: history || [] }, extra);
}

// Ny → Fristarkiv → Viderebehandling → Fristarkiv … — the normal loop.
const NY       = [st(null, 'ny')];
const R1_SENT  = NY.concat([st('ny', 'fristarkiv')]);
const R1_REPLY = R1_SENT.concat([st('fristarkiv', 'viderebehandling')]);
const R2_SENT  = R1_REPLY.concat([st('viderebehandling', 'fristarkiv')]);
const R2_REPLY = R2_SENT.concat([st('fristarkiv', 'viderebehandling')]);

// ── lettersSent ──────────────────────────────────────

test('lettersSent counts each office action sent to Fristarkiv', () => {
  assert.strictEqual(lettersSent(NY), 0);
  assert.strictEqual(lettersSent(R1_SENT), 1);
  assert.strictEqual(lettersSent(R1_REPLY), 1);
  assert.strictEqual(lettersSent(R2_SENT), 2);
  assert.strictEqual(lettersSent(R2_REPLY), 2);
});

test('lettersSent ignores deadline edits and missing history', () => {
  assert.strictEqual(lettersSent(undefined), 0);
  assert.strictEqual(lettersSent(null), 0);
  const withFrist = R1_SENT.concat([{ type: 'frist', date: '2026-02-01', from: null, to: null }]);
  assert.strictEqual(lettersSent(withFrist), 1);
});

test('lettersSent undoes a letter when a case is moved back to Ny by correction', () => {
  const corrected = R1_SENT.concat([st('fristarkiv', 'ny')]);
  assert.strictEqual(lettersSent(corrected), 0);
  // …and sending it again counts it once, not twice.
  assert.strictEqual(lettersSent(corrected.concat([st('ny', 'fristarkiv')])), 1);
});

test('lettersSent does not count a case created directly in Fristarkiv', () => {
  assert.strictEqual(lettersSent([st(null, 'fristarkiv')]), 0);
});

// ── examinationRound ─────────────────────────────────

test('examinationRound: Ny is always round 1', () => {
  assert.strictEqual(examinationRound(sak('ny', NY)), 1);
  assert.strictEqual(examinationRound(sak('ny', [])), 1);
});

test('examinationRound: Fristarkiv is the round of the letter just sent', () => {
  assert.strictEqual(examinationRound(sak('fristarkiv', R1_SENT)), 1);
  assert.strictEqual(examinationRound(sak('fristarkiv', R2_SENT)), 2);
});

test('examinationRound: Viderebehandling is the next letter to write', () => {
  assert.strictEqual(examinationRound(sak('viderebehandling', R1_REPLY)), 2);
  assert.strictEqual(examinationRound(sak('viderebehandling', R2_REPLY)), 3);
});

test('examinationRound falls back to the minimum for the status when history is missing', () => {
  // Imported or legacy cases may lack history; never show "0. brev" or round 1 in Viderebehandling.
  assert.strictEqual(examinationRound(sak('fristarkiv', [])), 1);
  assert.strictEqual(examinationRound(sak('viderebehandling', [])), 2);
  assert.strictEqual(examinationRound(sak('viderebehandling', [st(null, 'viderebehandling')])), 2);
});

// ── caseTrack ────────────────────────────────────────

function states(c) { return caseTrack(c).map((s) => s.state); }
function labels(c) { return caseTrack(c).map((s) => s.label); }

test('caseTrack always returns exactly four slots for a sak', () => {
  ['ny', 'fristarkiv', 'viderebehandling', 'avsluttet'].forEach((status) => {
    assert.strictEqual(caseTrack(sak(status, [])).length, 4, status);
  });
});

test('caseTrack: Formalia is always done', () => {
  ['ny', 'fristarkiv', 'viderebehandling', 'avsluttet'].forEach((status) => {
    assert.deepStrictEqual(plain(caseTrack(sak(status, []))[0]), { label: 'Formalia', state: 'done' });
  });
});

test('caseTrack: Ny — first letter is active, everything after is future', () => {
  const c = sak('ny', NY);
  assert.deepStrictEqual(plain(states(c)), ['done', 'active', 'future', 'future']);
  assert.deepStrictEqual(plain(labels(c)), ['Formalia', '1. brev', 'Svar', 'Avgjørelse']);
});

test('caseTrack: Fristarkiv — waiting on the applicant, round shown from 2', () => {
  assert.deepStrictEqual(plain(caseTrack(sak('fristarkiv', R1_SENT))[2]), { label: 'Venter på svar', state: 'wait' });
  assert.deepStrictEqual(plain(caseTrack(sak('fristarkiv', R2_SENT))[2]), { label: 'Venter på svar · 2', state: 'wait' });
  assert.strictEqual(caseTrack(sak('fristarkiv', R1_SENT))[1].state, 'done');
});

// Viderebehandling gets its own state (and colour) so it can't be mistaken for
// a Ny case's active «1. brev» step.
test('caseTrack: Viderebehandling — round 2 is its own state, round 3+ is a caution', () => {
  assert.deepStrictEqual(plain(caseTrack(sak('viderebehandling', R1_REPLY))[2]), { label: 'Viderebehandling', state: 'videre' });
  assert.deepStrictEqual(plain(caseTrack(sak('viderebehandling', R2_REPLY))[2]), { label: 'Viderebeh. · 3', state: 'caution' });
  const r4 = R2_REPLY.concat([st('viderebehandling', 'fristarkiv'), st('fristarkiv', 'viderebehandling')]);
  assert.deepStrictEqual(plain(caseTrack(sak('viderebehandling', r4))[2]), { label: 'Viderebeh. · 4', state: 'caution' });
});

test('caseTrack: Ny and Viderebehandling never share the active state', () => {
  const ny = caseTrack(sak('ny', NY)).map((s) => s.state);
  const vb = caseTrack(sak('viderebehandling', R1_REPLY)).map((s) => s.state);
  assert.ok(ny.indexOf('active') !== -1);
  assert.strictEqual(vb.indexOf('active'), -1);
});

test('caseTrack: Avsluttet with an outcome shows it in the terminal slot', () => {
  const hist = R1_REPLY.concat([st('viderebehandling', 'avsluttet')]);
  assert.deepStrictEqual(plain(caseTrack(sak('avsluttet', hist, { outcome: 'meddelt' }))[3]), { label: 'Meddelt', state: 'granted' });
  assert.deepStrictEqual(plain(caseTrack(sak('avsluttet', hist, { outcome: 'avslatt' }))[3]), { label: 'Avslått', state: 'refused' });
  assert.deepStrictEqual(plain(caseTrack(sak('avsluttet', hist, { outcome: 'henlagt' }))[3]), { label: 'Henlagt', state: 'closed' });
  assert.deepStrictEqual(plain(caseTrack(sak('avsluttet', hist, { outcome: 'meddelt' }))[2]), { label: 'Behandlet', state: 'done' });
});

test('caseTrack: Avsluttet without an outcome (legacy) reads neutral "Avsluttet"', () => {
  assert.deepStrictEqual(plain(caseTrack(sak('avsluttet', []))[3]), { label: 'Avsluttet', state: 'done' });
  assert.deepStrictEqual(plain(caseTrack(sak('avsluttet', [], { outcome: 'tull' }))[3]), { label: 'Avsluttet', state: 'done' });
});

test('caseTrack: closed straight from Ny had no reply round', () => {
  const c = sak('avsluttet', NY.concat([st('ny', 'avsluttet')]), { outcome: 'meddelt' });
  assert.deepStrictEqual(plain(caseTrack(c)[2]), { label: 'Ingen runde', state: 'done' });
});

test('caseTrack returns null for oppdrag — they have no examination flow', () => {
  assert.strictEqual(caseTrack({ type: 'oppdrag', status: 'ny', history: [] }), null);
});

test('caseTrack treats a missing status as Ny', () => {
  assert.deepStrictEqual(plain(states({ type: 'sak', history: [] })), ['done', 'active', 'future', 'future']);
});

// ── closedDate ───────────────────────────────────────

test('closedDate returns the date of the latest move into Avsluttet', () => {
  const hist = [st(null, 'ny', '2025-01-01T00:00:00Z'), st('ny', 'avsluttet', '2025-03-01T00:00:00Z'),
                st('avsluttet', 'ny', '2025-04-01T00:00:00Z'), st('ny', 'avsluttet', '2026-02-01T00:00:00Z')];
  assert.strictEqual(closedDate(sak('avsluttet', hist)), '2026-02-01T00:00:00Z');
  assert.strictEqual(closedDate(sak('avsluttet', [])), null);
});

// ── pipelineCounts ───────────────────────────────────

test('pipelineCounts counts cases per track slot and excludes oppdrag', () => {
  const list = [
    sak('ny', NY), sak('ny', NY),
    sak('fristarkiv', R1_SENT, { dueDate: '2026-10-20' }),
    sak('fristarkiv', R2_SENT, { dueDate: '2027-03-01' }),
    sak('viderebehandling', R1_REPLY),
    sak('viderebehandling', R2_REPLY),
    { type: 'oppdrag', status: 'ny', history: [] },
    { type: 'oppdrag', status: 'avsluttet', history: [st('ny', 'avsluttet', '2026-05-01T00:00:00Z')] },
  ];
  const p = pipelineCounts(list, 2026, '2026-10-06');
  assert.strictEqual(p.ny, 2);
  assert.strictEqual(p.fristarkiv, 1 + 1);
  assert.strictEqual(p.fristarkivSoon, 1);
  assert.strictEqual(p.videre, 2);
  assert.strictEqual(p.videreLate, 1);
  assert.strictEqual(p.decided.total, 0);
});

test('pipelineCounts tallies outcomes decided in the given calendar year only', () => {
  const closed = (outcome, date) => sak('avsluttet', R1_SENT.concat([st('fristarkiv', 'avsluttet', date)]), { outcome: outcome });
  const list = [
    closed('meddelt', '2026-01-01T08:00:00Z'),
    closed('meddelt', '2026-12-31T20:00:00Z'),
    closed('avslatt', '2026-06-15T10:00:00Z'),
    closed('henlagt', '2026-03-03T10:00:00Z'),
    closed('meddelt', '2025-12-31T10:00:00Z'),   // previous year
    closed(undefined, '2026-04-04T10:00:00Z'),   // legacy, no outcome
  ];
  const p = pipelineCounts(list, 2026, '2026-10-06');
  assert.deepStrictEqual(plain(p.decided), { meddelt: 2, avslatt: 1, henlagt: 1, total: 4 });
  assert.strictEqual(pipelineCounts(list, 2025, '2026-10-06').decided.meddelt, 1);
});

test('pipelineCounts handles an empty list', () => {
  const p = pipelineCounts([], 2026, '2026-10-06');
  assert.deepStrictEqual(plain(p), {
    ny: 0, nyUnassigned: 0, fristarkiv: 0, fristarkivSoon: 0, videre: 0, videreLate: 0,
    decided: { meddelt: 0, avslatt: 0, henlagt: 0, total: 0 },
  });
});

// ── rowAction ────────────────────────────────────────

test('rowAction gives the forward step per status, matching the old list buttons', () => {
  assert.deepStrictEqual(plain(rowAction('ny', false)), { type: 'confirm', label: 'Marker som fullført' });
  assert.deepStrictEqual(plain(rowAction('fristarkiv', false)), { type: 'choice-fristarkiv', label: 'Registrer svar …' });
  assert.deepStrictEqual(plain(rowAction('viderebehandling', false)), { type: 'choice-videre', label: 'Fullfør behandling …' });
  assert.strictEqual(rowAction('avsluttet', false), null);
});

test('rowAction: active oppdrag are completed, finished ones have nothing', () => {
  assert.deepStrictEqual(plain(rowAction('ny', true)), { type: 'complete-oppdrag', label: 'Merk som utført' });
  assert.strictEqual(rowAction('avsluttet', true), null);
});

// ── OUTCOMES ─────────────────────────────────────────

test('OUTCOMES defines the three decisions with their track states', () => {
  assert.deepStrictEqual(Object.keys(OUTCOMES), ['meddelt', 'avslatt', 'henlagt']);
  assert.strictEqual(OUTCOMES.meddelt.state, 'granted');
  assert.strictEqual(OUTCOMES.avslatt.state, 'refused');
  assert.strictEqual(OUTCOMES.henlagt.state, 'closed');
});

// ── currentTrackSlot ─────────────────────────────────

test('currentTrackSlot picks the step the case is on, for the dashboard mini-track', () => {
  assert.deepStrictEqual(plain(currentTrackSlot(caseTrack(sak('ny', NY)))), { label: '1. brev', state: 'active' });
  assert.deepStrictEqual(plain(currentTrackSlot(caseTrack(sak('fristarkiv', R1_SENT)))), { label: 'Venter på svar', state: 'wait' });
  assert.deepStrictEqual(plain(currentTrackSlot(caseTrack(sak('viderebehandling', R2_REPLY)))), { label: 'Viderebeh. · 3', state: 'caution' });
  assert.deepStrictEqual(plain(currentTrackSlot(caseTrack(sak('avsluttet', [], { outcome: 'avslatt' })))), { label: 'Avslått', state: 'refused' });
  assert.strictEqual(currentTrackSlot(null), null);
});
