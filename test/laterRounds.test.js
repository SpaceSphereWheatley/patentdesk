'use strict';
// Senere runder (2. realitetsbrev og videre): rundelinjen under tittelen,
// fristen for å behandle svaret regnet fra mottaksdatoen, fasekollaps per
// status og sjekklisten for svaret, som starter på nytt hver runde.
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const {
  responseRoundInfo,
  sakRoundLine,
  responseChangesLabel,
  responseDueDate,
  phaseCollapseKey,
  isPhaseCollapsed,
  responseChecked,
  toggleResponseCheck,
  RESPONSE_CHECKLIST,
} = loadFunctions([
  'lettersSent', 'examinationRound', 'toDisplay', 'parseDate', 'isValidDate',
  'addMonthsClamped', 'isoLocalDate',
  'responseRoundInfo', 'sakRoundLine', 'responseChangesLabel', 'responseDueDate',
  'phaseCollapseKey', 'isPhaseCollapsed', 'responseChecked', 'toggleResponseCheck',
], { vars: ['RESPONSE_CHECKLIST'] });

const plain = (v) => JSON.parse(JSON.stringify(v));

const sent1   = { type: 'status', date: '2026-03-02T09:00:00.000Z', from: 'ny', to: 'fristarkiv' };
const answer1 = { type: 'status', date: '2026-10-21T09:00:00.000Z', from: 'fristarkiv', to: 'viderebehandling',
                  received: '2026-10-20', changes: ['claims'] };
const sent2   = { type: 'status', date: '2026-11-15T09:00:00.000Z', from: 'viderebehandling', to: 'fristarkiv' };

// ── Rundelinjen ──

test('round line is empty for new, closed and oppdrag cases', () => {
  assert.strictEqual(sakRoundLine({ status: 'ny', history: [] }), '');
  assert.strictEqual(sakRoundLine({ status: 'avsluttet', history: [sent1] }), '');
  assert.strictEqual(sakRoundLine({ type: 'oppdrag', status: 'ny', history: [] }), '');
});

test('round line in Fristarkiv names the letter and that we wait for an answer', () => {
  assert.strictEqual(sakRoundLine({ status: 'fristarkiv', history: [sent1] }),
    'Runde 1 · brev sendt 2026.03.02 · venter på svar');
  assert.strictEqual(sakRoundLine({ status: 'fristarkiv', history: [sent1, answer1, sent2] }),
    'Runde 2 · brev sendt 2026.11.15 · venter på svar');
});

test('round line in Viderebehandling shows the letter, the received date and what came in', () => {
  assert.strictEqual(sakRoundLine({ status: 'viderebehandling', history: [sent1, answer1] }),
    'Runde 2 · brev 2026.03.02 · svar 2026.10.20 (endrede krav)');
});

test('round line falls back to the transition date when no received date was registered', () => {
  const old = { type: 'status', date: '2026-10-21T09:00:00.000Z', from: 'fristarkiv', to: 'viderebehandling' };
  assert.strictEqual(sakRoundLine({ status: 'viderebehandling', history: [sent1, old] }),
    'Runde 2 · brev 2026.03.02 · svar 2026.10.21');
});

test('round line copes with missing history (imported cases)', () => {
  assert.strictEqual(sakRoundLine({ status: 'viderebehandling' }), 'Runde 2');
  assert.strictEqual(sakRoundLine({ status: 'fristarkiv' }), 'Runde 1 · venter på svar');
});

test('responseRoundInfo picks the answer that belongs to the latest letter', () => {
  const info = responseRoundInfo({ status: 'viderebehandling', history: [sent1, answer1] });
  assert.deepStrictEqual(plain(info), { round: 2, letter: '2026-03-02', received: '2026-10-20', changes: ['claims'] });
});

test('responseChangesLabel describes what the applicant sent in', () => {
  assert.strictEqual(responseChangesLabel([]), 'kun argumenter');
  assert.strictEqual(responseChangesLabel(['claims']), 'endrede krav');
  assert.strictEqual(responseChangesLabel(['description']), 'endret beskrivelse');
  assert.strictEqual(responseChangesLabel(['claims', 'description']), 'endrede krav og beskrivelse');
  assert.strictEqual(responseChangesLabel(undefined), '');
});

// ── Frist regnet fra mottaksdato ──

test('responseDueDate counts the configured months from the received date', () => {
  assert.strictEqual(responseDueDate('2026-10-20', 3), '2027-01-20');
  assert.strictEqual(responseDueDate('2026-11-30', 3), '2027-02-28'); // clamped to month end
});

// ── Fasekollaps per status ──

test('in Viderebehandling, Saken and Gransking start collapsed by default', () => {
  assert.strictEqual(isPhaseCollapsed({}, 'saken', 'viderebehandling'), true);
  assert.strictEqual(isPhaseCollapsed({}, 'gransking', 'viderebehandling'), true);
  assert.strictEqual(isPhaseCollapsed({}, 'vurdering', 'viderebehandling'), false);
});

test('in other statuses nothing is collapsed by default', () => {
  ['ny', 'fristarkiv', 'avsluttet'].forEach((s) => {
    assert.strictEqual(isPhaseCollapsed({}, 'saken', s), false, s);
    assert.strictEqual(isPhaseCollapsed({}, 'gransking', s), false, s);
  });
});

test('a manual choice overrides the default, and is kept apart per status', () => {
  const state = {};
  state[phaseCollapseKey('gransking', 'viderebehandling')] = false; // opened by hand in round 2
  state[phaseCollapseKey('saken', 'ny')] = true;                     // collapsed by hand in round 1
  assert.strictEqual(isPhaseCollapsed(state, 'gransking', 'viderebehandling'), false);
  assert.strictEqual(isPhaseCollapsed(state, 'saken', 'viderebehandling'), true); // still default
  assert.strictEqual(isPhaseCollapsed(state, 'saken', 'ny'), true);
  assert.strictEqual(isPhaseCollapsed(state, 'gransking', 'ny'), false);
});

test('the round-1 key is the bare phase name, so stored preferences keep working', () => {
  assert.strictEqual(phaseCollapseKey('saken', 'ny'), 'saken');
  assert.strictEqual(phaseCollapseKey('saken', 'fristarkiv'), 'saken');
  assert.strictEqual(phaseCollapseKey('saken', 'viderebehandling'), 'videre:saken');
});

// ── Sjekkliste for svaret ──

test('the response checklist has the four fixed steps', () => {
  assert.deepStrictEqual(plain(RESPONSE_CHECKLIST.map(i => i.id)), ['read', 'basis', 'reassess', 'search']);
});

test('response checks are kept per round and start empty each round', () => {
  const data = {};
  assert.deepStrictEqual(plain(responseChecked(data, 2)), []);
  toggleResponseCheck(data, 2, 'read');
  toggleResponseCheck(data, 2, 'basis');
  assert.deepStrictEqual(plain(responseChecked(data, 2)), ['read', 'basis']);
  assert.deepStrictEqual(plain(responseChecked(data, 3)), []);
  toggleResponseCheck(data, 2, 'read');
  assert.deepStrictEqual(plain(responseChecked(data, 2)), ['basis']);
});

test('toggleResponseCheck ignores unknown items', () => {
  const data = {};
  toggleResponseCheck(data, 2, 'nope');
  assert.deepStrictEqual(plain(responseChecked(data, 2)), []);
});

// ── Fremdriftslinjen ──

const { sakChecklistProgress } = loadFunctions(
  ['lettersSent', 'examinationRound', 'responseChecked', 'sakChecklistProgress'],
  { vars: ['RESPONSE_CHECKLIST'] }
);

const TPL = [{ phase: 'A', items: [{ id: 'a1' }, { id: 'a2' }] }, { phase: 'B', items: [{ id: 'b1' }] }];

test('progress shows the main checklist outside Viderebehandling', () => {
  const data = { checklist: { a1: true, a2: null, b1: false } };
  ['ny', 'fristarkiv', 'avsluttet'].forEach((status) => {
    assert.deepStrictEqual(plain(sakChecklistProgress({ status, history: [sent1] }, data, TPL)),
      { label: 'Sjekkliste', done: 2, total: 3 }, status);
  });
});

test('progress shows the response checklist for the current round in Viderebehandling', () => {
  const data = { checklist: { a1: true, a2: true, b1: true }, responseChecks: { 2: ['read'], 3: ['read', 'basis'] } };
  assert.deepStrictEqual(plain(sakChecklistProgress({ status: 'viderebehandling', history: [sent1, answer1] }, data, TPL)),
    { label: 'Svar – runde 2', done: 1, total: 4 });
});

test('oppdrag keep the main checklist label even in odd states', () => {
  assert.strictEqual(sakChecklistProgress({ type: 'oppdrag', status: 'ny' }, { checklist: {} }, TPL).label, 'Sjekkliste');
});
