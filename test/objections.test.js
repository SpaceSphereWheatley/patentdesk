'use strict';
// Slice 2C — Innvendinger (objections). Spec rounds2/2c/spec.md (AC1–22),
// design rounds2/2c/design.md; built AFTER 2B (claimMapping / deletedClaims).
// Written by QA before the builder; none of the functions below exist yet.
//
// ── Expected signatures (pure, no clock, no DOM, never mutate inputs) ──────
// Notation: L = objectionRound(c, rounds).n, k = examinationRound(c).
//
// objectionsOf(data)        -> data.objections if array, else []
// objectionStatesOf(data)   -> data.objectionStates if plain object, else {}
// objectionRound(c, rounds) -> the round in visibleRounds(c, rounds) with
//     n === lettersSent(c.history); null for oppdrag / when absent.
// deriveObjections(round, rounds?) -> [{ id, round, claim, kind, docs, firstRaised }]
//     id 'r{n}-k{num}-{nyhet|oh|formelt}', kind 'nyhet'|'oh'|'formelt', claim = OLD
//     (frozen) number, ordered by frozen claims (nyhet, oh, formelt per claim).
//     nyhet: novelty===false, docs [noveltyDoc] (suppresses oh);
//     oh: novelty!==false && inventive===false, docs = dedup inventiveDocs;
//     formelt: formal===true, docs []. firstRaised walks back through rounds
//     n-1, n-2 … while the same kind exists on the predecessor claim (2B
//     claimMapping(claim, round n-1) only when change 'uendret' with one
//     origin; 'endret'/'ny' stop; no mapping → same number). rounds omitted → n.
// normalizeObjections(raw) -> [{ id, text, raisedIn }]
// normalizeObjectionStates(raw, objections) -> { "<k>": { "<objId>": state } }
// objectionStatesAfterSet(states, k, ids, state) -> new states ('open' deletes
//     the key; an empty round object is deleted)
// makeManualObjection(text, raisedIn, existingIds, now, rand) -> {id,text,raisedIn}|null
//     id = 'm' + now.toString(36) + 4 chars from rand(); suffix on clash.
// objectionsAfterDelete(data, objId) -> data copy without the objection and
//     without its id in any objectionStates round.
// manualObjectionsShown(objections, states, k) -> [objection + { isNew }]
// mappingComplete(round, claims) -> bool (every current claim has a valid
//     claimMapping(claim, round))
// objectionTargets(oldNum, round, claims) -> { now: [nums], struck: bool } | null
// shownObjections(c, data) -> derived (from objectionRound) + shown manual
//     objections for round k, each with a `state` ('open' when unset).
// groupObjections(list) -> groups (manual never grouped)
// objectionRowText(group, L, targets) -> string; targets = { <oldNum>: objectionTargets(...) }
// objectionProgress(groups) -> { x, y } counting ROWS; isNew manual excluded from y.
// refusalWarnings(c, data, rounds) -> string[] (AC14–20)
// normalizeImportSakDetails(sd) emits objections/objectionStates only when present.
// undoInvalidatedBy(snap, 'OBJECTION_*', payload) === false.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunctionSource } = require('./extractFunctions');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'PatentDesk.html'), 'utf8');

// ── Loader with transitive dependency resolution (as in rounds.test.js) ────
function topLevelFn(name) {
  const re = new RegExp('(^|\\n)function\\s+' + name.replace(/\$/g, '\\$') + '\\s*\\(');
  const m = re.exec(HTML);
  if (!m) return null;
  return extractFunctionSource(HTML.slice(m.index), name);
}
function topLevelVar(name) {
  const re = new RegExp('(^|\\n)var\\s+' + name.replace(/\$/g, '\\$') + '\\s*=');
  const m = re.exec(HTML);
  if (!m) return null;
  const start = m.index + m[1].length;
  let depth = 0;
  for (let i = start; i < HTML.length; i++) {
    const ch = HTML[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      for (i++; i < HTML.length && HTML[i] !== ch; i++) if (HTML[i] === '\\') i++;
    } else if (ch === '/' && HTML[i + 1] === '/') {
      while (i < HTML.length && HTML[i] !== '\n') i++;
    } else if (ch === '/' && HTML[i + 1] === '*') {
      i = HTML.indexOf('*/', i + 2) + 1;
    } else if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ';' && depth === 0) return HTML.slice(start, i + 1);
  }
  return null;
}
function load(names, opts) {
  opts = opts || {};
  const globals = Object.assign({ console }, opts.globals || {});
  const chunks = [];
  const seen = new Set(Object.keys(globals));
  const queue = names.slice();
  while (queue.length) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    let src = topLevelFn(name);
    if (!src) src = topLevelVar(name);
    if (!src) continue; // not built yet -> the test using it fails on its own
    chunks.push(src);
    (src.match(/[A-Za-z_$][\w$]*/g) || []).forEach((id) => { if (!seen.has(id)) queue.push(id); });
  }
  const sandbox = Object.assign({}, globals);
  vm.createContext(sandbox);
  chunks.sort((a, b) => (a.startsWith('function') ? 0 : 1) - (b.startsWith('function') ? 0 : 1));
  chunks.forEach((src) => { try { vm.runInContext(src, sandbox); } catch (e) { /* DOM-bound var */ } });
  const out = {};
  names.forEach((n) => { out[n] = vm.runInContext('typeof ' + n + ' === "undefined" ? undefined : ' + n, sandbox); });
  return out;
}

const plain = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const eq = (actual, expected, msg) => assert.deepStrictEqual(plain(actual), expected, msg);

const FNS = ['objectionsOf', 'objectionStatesOf', 'objectionRound', 'deriveObjections',
  'normalizeObjections', 'normalizeObjectionStates', 'objectionStatesAfterSet',
  'makeManualObjection', 'objectionsAfterDelete', 'manualObjectionsShown', 'mappingComplete',
  'objectionTargets', 'shownObjections', 'groupObjections', 'objectionRowText',
  'objectionProgress', 'refusalWarnings', 'normalizeImportSakDetails', 'undoInvalidatedBy'];
const O = load(FNS, { globals: { isNonWorkday: () => false } });

// ── Fixtures ───────────────────────────────────────────────────────────────
function claim(num, over) {
  return Object.assign({
    num, novelty: null, inventive: null, formal: null, notes: '', independent: num === 1,
    dep: num === 1 ? null : 1, depManual: false, label: '', noveltyDoc: null, inventiveDocs: []
  }, over || {});
}
// The spec's example round-1 claims.
const R1_CLAIMS = () => [
  claim(1, { novelty: false, inventive: false, noveltyDoc: 'D1' }),
  claim(2, { novelty: true, inventive: false, inventiveDocs: ['D1', 'D2'] }),
  claim(3, { novelty: true, inventive: true, formal: true }),
  claim(4, { novelty: true, inventive: true, formal: false }),
  claim(5, { novelty: null, inventive: null })
];
function round(n, claims, over) {
  return Object.assign({ n, letter: { date: '2026-06-01', deadline: '2026-09-01' },
    response: { date: '2026-08-20', changes: [] }, claims, docIds: ['D1', 'D2', 'D3'] }, over || {});
}
const H = (from, to, date) => ({ type: 'status', date: date + 'T10:00:00.000Z', from, to });
const HIST_V1 = [{ type: 'status', date: '2026-03-01T10:00:00.000Z', from: null, to: 'ny' },
  H('ny', 'fristarkiv', '2026-06-01'), H('fristarkiv', 'viderebehandling', '2026-08-21')];
const HIST_V2 = HIST_V1.concat([H('viderebehandling', 'fristarkiv', '2026-09-15'),
  H('fristarkiv', 'viderebehandling', '2026-10-20')]);
function kase(over) {
  return Object.assign({ id: 'X', caseNumber: '20261299', status: 'viderebehandling', type: 'sak',
    dueDate: '2026-12-15', history: HIST_V1 }, over || {});
}
function doc(id, over) {
  return Object.assign({ id, ref: 'EP ' + id, p: false, e: false, background: false, withdrawn: false }, over || {});
}
// Current (round-2) data. Default = AC20 clean case: claims unchanged, claim 1
// still ✗N over D1, r1-k1-nyhet maintained, everything else resolved.
function data(over) {
  return Object.assign({
    numClaims: 5, docs: [doc('D1'), doc('D2'), doc('D3')],
    claims: [
      claim(1, { novelty: false, inventive: false, noveltyDoc: 'D1' }),
      claim(2, { novelty: true, inventive: true }),
      claim(3, { novelty: true, inventive: true, formal: false }),
      claim(4, { novelty: true, inventive: true, formal: false }),
      claim(5, { novelty: true, inventive: true })
    ],
    rounds: [round(1, R1_CLAIMS())],
    objections: [],
    objectionStates: { 2: { 'r1-k1-nyhet': 'maintained', 'r1-k2-oh': 'resolved', 'r1-k3-formelt': 'resolved' } }
  }, over || {});
}
const pick = (o) => ({ id: o.id, round: o.round, claim: o.claim, kind: o.kind, docs: plain(o.docs), firstRaised: o.firstRaised });
const W = (c, d) => plain(O.refusalWarnings(c, d, d.rounds));

// ── objectionsOf / objectionStatesOf ───────────────────────────────────────
test('objectionsOf / objectionStatesOf fall back to empty values', () => {
  eq(O.objectionsOf({}), []);
  eq(O.objectionsOf(null), []);
  eq(O.objectionsOf({ objections: 'x' }), []);
  eq(O.objectionsOf({ objections: [{ id: 'mabcd', text: 't', raisedIn: 1 }] }), [{ id: 'mabcd', text: 't', raisedIn: 1 }]);
  eq(O.objectionStatesOf({}), {});
  eq(O.objectionStatesOf(null), {});
  eq(O.objectionStatesOf({ objectionStates: [] }), {});
  eq(O.objectionStatesOf({ objectionStates: { 2: { mabcd: 'resolved' } } }), { 2: { mabcd: 'resolved' } });
});

// ── objectionRound ─────────────────────────────────────────────────────────
test('objectionRound is the round with n === lettersSent (L = k − 1 in Viderebehandling)', () => {
  const rs = [round(1, R1_CLAIMS()), round(2, [claim(1)])];
  assert.strictEqual(O.objectionRound(kase(), rs).n, 1, 'one letter sent → round 1, not the stale round 2');
  assert.strictEqual(O.objectionRound(kase({ history: HIST_V2 }), rs).n, 2);
  assert.strictEqual(O.objectionRound(kase({ history: HIST_V2 }), [rs[0]]), null, 'round 2 missing → null (AC9/AC14)');
  assert.strictEqual(O.objectionRound(kase(), []), null);
  assert.strictEqual(O.objectionRound(kase({ type: 'oppdrag' }), rs), null, 'oppdrag');
});

// ── deriveObjections (AC1–5) ───────────────────────────────────────────────
test('AC1 example round → nyhet k1, oh k2, formelt k3; claims 4 and 5 produce nothing', () => {
  const list = O.deriveObjections(round(1, R1_CLAIMS()));
  eq(list.map(pick), [
    { id: 'r1-k1-nyhet', round: 1, claim: 1, kind: 'nyhet', docs: ['D1'], firstRaised: 1 },
    { id: 'r1-k2-oh', round: 1, claim: 2, kind: 'oh', docs: ['D1', 'D2'], firstRaised: 1 },
    { id: 'r1-k3-formelt', round: 1, claim: 3, kind: 'formelt', docs: [], firstRaised: 1 }
  ]);
});

test('AC2 locked claim (✗N + ✗OH) gives only nyhet', () => {
  const list = O.deriveObjections(round(1, [claim(1, { novelty: false, inventive: false, noveltyDoc: 'D1',
    inventiveDocs: ['D2'] })]));
  eq(list.map((o) => o.id), ['r1-k1-nyhet']);
});

test('AC3 ✗OH + formal → oh before formelt', () => {
  const list = O.deriveObjections(round(1, [claim(1, { novelty: true, inventive: false, formal: true,
    inventiveDocs: ['D2', 'D2'] })]));
  eq(list.map((o) => o.id), ['r1-k1-oh', 'r1-k1-formelt']);
  eq(list[0].docs, ['D2'], 'inventiveDocs deduped');
});

test('AC4 firstRaised follows the same number back when there is no 2B mapping', () => {
  const r2 = round(2, [claim(1, { novelty: false, inventive: false, noveltyDoc: 'D1' })]);
  const same = round(1, [claim(1, { novelty: false, inventive: false, noveltyDoc: 'D1' })]);
  const ok = round(1, [claim(1, { novelty: true, inventive: true })]);
  assert.strictEqual(O.deriveObjections(r2, [same, r2])[0].firstRaised, 1, '✗N in both rounds');
  assert.strictEqual(O.deriveObjections(r2, [ok, r2])[0].firstRaised, 2, '✓ in round 1');
  assert.strictEqual(O.deriveObjections(r2, [r2])[0].firstRaised, 2, 'gap: round 1 missing');
  assert.strictEqual(O.deriveObjections(r2)[0].firstRaised, 2, 'rounds omitted → round.n');
});

test('AC4 firstRaised follows a 2B «uendret» mapping and stops at «endret»/«ny»', () => {
  const r1 = round(1, [claim(1, { novelty: true, inventive: true }),
    claim(2, { novelty: true, inventive: true }),
    claim(3, { novelty: false, inventive: false, noveltyDoc: 'D1' })]);
  const mapped = (m) => round(2, [claim(1, { novelty: false, inventive: false, noveltyDoc: 'D1',
    mapping: Object.assign({ round: 1, p13: null, basis: '' }, m) })], { response: { date: '2026-10-19', changes: ['claims'] } });
  const viaUendret = mapped({ origin: [3], change: 'uendret' });
  assert.strictEqual(O.deriveObjections(viaUendret, [r1, viaUendret])[0].firstRaised, 1,
    'old claim 3 was ✗N in round 1 (claim 1 was ✓)');
  const viaEndret = mapped({ origin: [3], change: 'endret' });
  assert.strictEqual(O.deriveObjections(viaEndret, [r1, viaEndret])[0].firstRaised, 2, 'endret stops');
  const viaNy = mapped({ origin: [], change: 'ny' });
  assert.strictEqual(O.deriveObjections(viaNy, [r1, viaNy])[0].firstRaised, 2, 'ny stops');
  const kindChange = mapped({ origin: [2], change: 'uendret' });
  assert.strictEqual(O.deriveObjections(kindChange, [r1, kindChange])[0].firstRaised, 2,
    'predecessor without the same kind stops');
});

test('AC5 null round or no claims → []', () => {
  eq(O.deriveObjections(null), []);
  eq(O.deriveObjections(round(1, [])), []);
});

test('deriveObjections does not mutate the round', () => {
  const r = round(1, R1_CLAIMS());
  const before = JSON.stringify(r);
  O.deriveObjections(r, [r]);
  assert.strictEqual(JSON.stringify(r), before);
});

// ── AC6 / AC11: shownObjections ────────────────────────────────────────────
test('AC6 editing current claims never changes the derived list', () => {
  const d = data();
  const before = plain(O.shownObjections(kase(), d));
  const edited = data({ claims: [claim(1, { novelty: true, inventive: false, inventiveDocs: ['D3'] }), claim(2), claim(3)] });
  eq(O.shownObjections(kase(), edited), before);
  eq(before.map((o) => o.id), ['r1-k1-nyhet', 'r1-k2-oh', 'r1-k3-formelt']);
});

test('AC11 states belong to round k; round 3 derives fresh from round 2, all open', () => {
  const r2 = round(2, [claim(1, { novelty: true, inventive: false, inventiveDocs: ['D1'] })]);
  const d = data({ rounds: [round(1, R1_CLAIMS()), r2], objectionStates: { 2: { 'r1-k1-nyhet': 'resolved' } } });
  const r2view = O.shownObjections(kase(), d);
  assert.strictEqual(r2view.find((o) => o.id === 'r1-k1-nyhet').state, 'resolved');
  assert.strictEqual(r2view.find((o) => o.id === 'r1-k2-oh').state, 'open');
  const r3view = O.shownObjections(kase({ history: HIST_V2 }), d);
  eq(r3view.map((o) => o.id), ['r2-k1-oh']);
  assert.ok(r3view.every((o) => o.state === 'open'));
  eq(d.objectionStates, { 2: { 'r1-k1-nyhet': 'resolved' } }, 'round-2 states untouched');
});

test('AC8 shownObjections is empty outside Viderebehandling and for oppdrag', () => {
  for (const status of ['ny', 'fristarkiv', 'avsluttet']) eq(O.shownObjections(kase({ status }), data()), [], status);
  eq(O.shownObjections(kase({ type: 'oppdrag' }), data()), []);
});

// ── objectionStatesAfterSet (AC11) ─────────────────────────────────────────
test('AC11 objectionStatesAfterSet writes per round, open deletes, empty round removed', () => {
  const s0 = { 1: { 'r1-k1-nyhet': 'maintained' } };
  const s1 = O.objectionStatesAfterSet(s0, 2, ['r1-k1-nyhet'], 'resolved');
  eq(s1, { 1: { 'r1-k1-nyhet': 'maintained' }, 2: { 'r1-k1-nyhet': 'resolved' } });
  eq(s0, { 1: { 'r1-k1-nyhet': 'maintained' } }, 'input not mutated');
  const grouped = O.objectionStatesAfterSet({}, 2, ['r1-k2-oh', 'r1-k3-oh'], 'dropped');
  eq(grouped, { 2: { 'r1-k2-oh': 'dropped', 'r1-k3-oh': 'dropped' } }, 'one entry per member id');
  eq(O.objectionStatesAfterSet(s1, 2, ['r1-k1-nyhet'], 'open'), { 1: { 'r1-k1-nyhet': 'maintained' } });
  eq(O.objectionStatesAfterSet(null, 2, ['r1-k1-nyhet'], 'maintained'), { 2: { 'r1-k1-nyhet': 'maintained' } });
});

// ── Manual objections (AC12) ───────────────────────────────────────────────
const NOW = 1762250000000;
const RAND = () => 0.5;
test('AC12 makeManualObjection trims, validates 1–200 chars and builds an m-id', () => {
  const o = O.makeManualObjection('  Mangler enhet  ', 2, [], NOW, RAND);
  assert.strictEqual(o.text, 'Mangler enhet');
  assert.strictEqual(o.raisedIn, 2);
  assert.match(o.id, /^m[a-z0-9]{4,24}$/);
  assert.ok(o.id.startsWith('m' + NOW.toString(36)));
  eq(Object.keys(o).sort(), ['id', 'raisedIn', 'text']);
  assert.strictEqual(O.makeManualObjection('   ', 2, [], NOW, RAND), null, 'empty rejected');
  assert.strictEqual(O.makeManualObjection('', 2, [], NOW, RAND), null);
  assert.strictEqual(O.makeManualObjection('x'.repeat(201), 2, [], NOW, RAND), null, '>200 rejected');
  assert.strictEqual(O.makeManualObjection('x'.repeat(200), 2, [], NOW, RAND).text.length, 200);
});

test('AC12 makeManualObjection avoids an existing id', () => {
  const a = O.makeManualObjection('a', 1, [], NOW, RAND);
  const b = O.makeManualObjection('b', 1, [a.id], NOW, RAND);
  assert.notStrictEqual(b.id, a.id);
  assert.match(b.id, /^m[a-z0-9]{4,24}$/);
});

test('AC12 objectionsAfterDelete removes the objection and its states in every round', () => {
  const d = { objections: [{ id: 'maaaa1', text: 'a', raisedIn: 1 }, { id: 'mbbbb2', text: 'b', raisedIn: 2 }],
    objectionStates: { 2: { maaaa1: 'resolved', 'r1-k1-nyhet': 'maintained' }, 3: { maaaa1: 'maintained' } } };
  const before = JSON.stringify(d);
  const out = O.objectionsAfterDelete(d, 'maaaa1');
  eq(out.objections, [{ id: 'mbbbb2', text: 'b', raisedIn: 2 }]);
  eq(out.objectionStates, { 2: { 'r1-k1-nyhet': 'maintained' } });
  assert.strictEqual(JSON.stringify(d), before, 'input not mutated');
});

test('AC12 manualObjectionsShown: raisedIn ≤ k, hidden once resolved/dropped earlier, isNew when raisedIn === k', () => {
  const objs = [
    { id: 'mold01', text: 'gammel', raisedIn: 1 },
    { id: 'mres01', text: 'løst', raisedIn: 1 },
    { id: 'mdro01', text: 'frafalt', raisedIn: 1 },
    { id: 'mmai01', text: 'opprettholdt', raisedIn: 1 },
    { id: 'mnew02', text: 'ny', raisedIn: 2 },
    { id: 'mfut04', text: 'framtid', raisedIn: 4 }
  ];
  const states = { 2: { mres01: 'resolved', mdro01: 'dropped', mmai01: 'maintained' } };
  const r2 = O.manualObjectionsShown(objs, states, 2);
  eq(r2.map((o) => o.id), ['mold01', 'mres01', 'mdro01', 'mmai01', 'mnew02'], 'own round state still shown');
  eq(r2.map((o) => !!o.isNew), [false, false, false, false, true]);
  const r3 = O.manualObjectionsShown(objs, states, 3);
  eq(r3.map((o) => o.id), ['mold01', 'mmai01', 'mnew02'], 'resolved/dropped in round 2 hidden in round 3');
  assert.ok(r3.every((o) => !o.isNew));
});

// ── Normalisation (AC21) ───────────────────────────────────────────────────
test('AC21 normalizeObjections keeps {id,text,raisedIn}, drops bad items and unknown keys', () => {
  const raw = JSON.parse('[' +
    '{"id":"mabcd1","text":"  ok  ","raisedIn":2,"evil":1,"__proto__":{"x":1}},' +
    '{"id":"mabcd1","text":"duplicate","raisedIn":1},' +
    '{"id":"r1-k1-nyhet","text":"derived id","raisedIn":1},' +
    '{"id":"MABCD","text":"upper","raisedIn":1},' +
    '{"id":7,"text":"num id","raisedIn":1},' +
    '{"id":"mempty","text":"   ","raisedIn":1},' +
    '{"id":"mzero1","text":"zero","raisedIn":0},' +
    '{"id":"mfrac1","text":"frac","raisedIn":1.5},' +
    '{"id":"mlong1","text":"' + 'y'.repeat(250) + '","raisedIn":1},' +
    '"str", null, [1]]');
  const out = plain(O.normalizeObjections(raw));
  eq(out.map((o) => o.id), ['mabcd1', 'mlong1']);
  eq(out[0], { id: 'mabcd1', text: 'ok', raisedIn: 2 });
  assert.strictEqual(out[1].text, 'y'.repeat(200), 'text cut to 200');
  eq(O.normalizeObjections('nope'), []);
  eq(O.normalizeObjections(undefined), []);
});

test('AC21 normalizeObjections strips control characters and caps at 100', () => {
  eq(plain(O.normalizeObjections([{ id: 'mctrl1', text: 'a\u0000b\u0007c', raisedIn: 1 }]))[0].text, 'abc');
  const many = Array.from({ length: 130 }, (_, i) => ({ id: 'mcap' + String(i).padStart(3, '0'), text: 't', raisedIn: 1 }));
  assert.strictEqual(O.normalizeObjections(many).length, 100);
});

test('AC21 normalizeObjectionStates: round keys, states, ids, __proto__', () => {
  const objs = [{ id: 'mabcd1', text: 'ok', raisedIn: 1 }];
  const raw = JSON.parse('{' +
    '"2":{"r1-k1-nyhet":"resolved","r1-k2-oh":"maintained","r1-k3-formelt":"dropped","mabcd1":"resolved",' +
    '"mgone1":"resolved","r1-k4-oh":"open","r1-k5-oh":"bogus","<img>":"resolved","__proto__":"resolved"},' +
    '"0":{"r1-k1-nyhet":"resolved"},"02":{"r1-k1-nyhet":"resolved"},"x":{"r1-k1-nyhet":"resolved"},' +
    '"1000":{"r1-k1-nyhet":"resolved"},"3":"notobject","__proto__":{"r1-k1-nyhet":"resolved"}}');
  const out = O.normalizeObjectionStates(raw, objs);
  eq(out, { 2: { 'r1-k1-nyhet': 'resolved', 'r1-k2-oh': 'maintained', 'r1-k3-formelt': 'dropped', mabcd1: 'resolved' } });
  assert.strictEqual(Object.prototype.hasOwnProperty.call(out, '__proto__'), false);
  assert.strictEqual(({}).polluted, undefined);
  eq(O.normalizeObjectionStates(null, objs), {});
  eq(O.normalizeObjectionStates([], objs), {});
});

test('AC21 normalizeObjectionStates caps 1000 ids per round', () => {
  const r = {};
  for (let i = 1; i <= 999; i++) { r['r1-k' + i + '-nyhet'] = 'resolved'; r['r1-k' + i + '-oh'] = 'resolved'; }
  const out = O.normalizeObjectionStates({ 2: r }, []);
  assert.strictEqual(Object.keys(out[2]).length, 1000);
});

test('AC21 normalizeImportSakDetails emits objections/objectionStates only when present', () => {
  const bare = O.normalizeImportSakDetails({ numClaims: 1, claims: [], rounds: [] });
  assert.ok(!('objections' in bare), 'no objections key');
  assert.ok(!('objectionStates' in bare), 'no objectionStates key');
  const full = O.normalizeImportSakDetails({ numClaims: 1, claims: [], rounds: [],
    objections: [{ id: 'mabcd1', text: ' t ', raisedIn: 1 }, { id: 'mbad01', text: '', raisedIn: 1 }],
    objectionStates: { 2: { mabcd1: 'resolved', mbad01: 'resolved', 'r1-k1-nyhet': 'nope' } } });
  eq(full.objections, [{ id: 'mabcd1', text: 't', raisedIn: 1 }]);
  eq(full.objectionStates, { 2: { mabcd1: 'resolved' } }, 'states normalised against the normalised objections');
  const statesOnly = O.normalizeImportSakDetails({ objectionStates: { 2: { 'r1-k1-nyhet': 'maintained' } } });
  eq(statesOnly.objectionStates, { 2: { 'r1-k1-nyhet': 'maintained' } });
  const objsOnly = O.normalizeImportSakDetails({ objections: 'x' });
  eq(objsOnly.objections, []);
});

// ── 2B integration: mappingComplete / objectionTargets ─────────────────────
const M = (origin, change) => ({ round: 1, origin, change, p13: null, basis: '' });
const R1C = () => round(1, R1_CLAIMS(), { response: { date: '2026-08-20', changes: ['claims'] } });

test('mappingComplete: true only when every current claim has a valid mapping to the round', () => {
  const r = R1C();
  const all = [claim(1, { mapping: M([1, 4], 'endret') }), claim(2, { mapping: M([2], 'uendret') }), claim(3, { mapping: M([], 'ny') })];
  assert.strictEqual(O.mappingComplete(r, all), true);
  assert.strictEqual(O.mappingComplete(r, all.slice(0, 2).concat([claim(3)])), false, 'one unmapped');
  assert.strictEqual(O.mappingComplete(r, [claim(1, { mapping: Object.assign(M([1], 'uendret'), { round: 2 }) })]), false,
    'mapping to another round');
});

test('objectionTargets: «nå krav», struck only with a complete mapping, null without mapping', () => {
  const r = R1C();
  const partial = [claim(1, { mapping: M([1, 4], 'endret') }), claim(2, { mapping: M([2], 'uendret') }), claim(3)];
  eq(O.objectionTargets(2, r, partial), { now: [2], struck: false });
  eq(O.objectionTargets(1, r, partial), { now: [1], struck: false });
  eq(O.objectionTargets(3, r, partial), { now: [], struck: false }, 'incomplete mapping never says struck');
  const complete = partial.slice(0, 2).concat([claim(3, { mapping: M([], 'ny') })]);
  eq(O.objectionTargets(3, r, complete), { now: [], struck: true });
  assert.strictEqual(O.objectionTargets(1, r, [claim(1), claim(2)]), null, 'nothing mapped');
  assert.strictEqual(O.objectionTargets(1, round(1, R1_CLAIMS()), partial), null, "response.changes lacks 'claims'");
});

// ── groupObjections / objectionRowText / objectionProgress (AC7, AC11) ────
const withState = (list, states) => list.map((o) => Object.assign({}, o, { state: (states && states[o.id]) || 'open' }));

test('AC7 row text, one row per objection with the OLD number', () => {
  const groups = O.groupObjections(withState(O.deriveObjections(round(1, R1_CLAIMS()))));
  eq(groups.map((g) => O.objectionRowText(g, 1, {})), [
    'Brev 1 · krav 1 · Mangler nyhet (D1)',
    'Brev 1 · krav 2 · Mangler OH (D1+D2)',
    'Brev 1 · krav 3 · Formelle feil'
  ]);
});

test('AC7 «(først i brev m)» when m < L', () => {
  const r1 = round(1, [claim(1, { novelty: false, inventive: false, noveltyDoc: 'D1' })]);
  const r2 = round(2, [claim(1, { novelty: false, inventive: false, noveltyDoc: 'D1' })]);
  const g = O.groupObjections(withState(O.deriveObjections(r2, [r1, r2])));
  assert.strictEqual(O.objectionRowText(g[0], 2, {}), 'Brev 2 · krav 1 · Mangler nyhet (D1) (først i brev 1)');
});

test('AC7 2B targets append «→ nå krav 2» / «→ strøket»', () => {
  const g = O.groupObjections(withState(O.deriveObjections(round(1, R1_CLAIMS()))));
  assert.strictEqual(O.objectionRowText(g[0], 1, { 1: { now: [2], struck: false } }), 'Brev 1 · krav 1 · Mangler nyhet (D1) → nå krav 2');
  assert.strictEqual(O.objectionRowText(g[1], 1, { 2: { now: [], struck: true } }), 'Brev 1 · krav 2 · Mangler OH (D1+D2) → strøket');
  assert.strictEqual(O.objectionRowText(g[2], 1, { 3: null }), 'Brev 1 · krav 3 · Formelle feil');
});

const OH_CLAIMS = () => [
  claim(1, { novelty: true, inventive: true }),
  claim(2, { novelty: true, inventive: false, inventiveDocs: ['D1', 'D2'] }),
  claim(3, { novelty: true, inventive: false, inventiveDocs: ['D2', 'D1'] }),
  claim(4, { novelty: true, inventive: false, inventiveDocs: ['D1', 'D2'] }),
  claim(5, { novelty: true, inventive: false, inventiveDocs: ['D1', 'D2'] }),
  claim(6, { novelty: true, inventive: false, inventiveDocs: ['D3'] }),
  claim(7, { novelty: true, inventive: false, inventiveDocs: ['D1', 'D2'] })
];

test('groupObjections: same ground + docs grouped, ranges «2–5, 7»', () => {
  const groups = O.groupObjections(withState(O.deriveObjections(round(1, OH_CLAIMS()))));
  eq(groups.map((g) => O.objectionRowText(g, 1, {})), [
    'Brev 1 · krav 2–5, 7 · Mangler OH (D1+D2)',
    'Brev 1 · krav 6 · Mangler OH (D3)'
  ]);
});

test('groupObjections: a different state splits the group', () => {
  const list = withState(O.deriveObjections(round(1, OH_CLAIMS())), { 'r1-k3-oh': 'resolved' });
  eq(O.groupObjections(list).map((g) => O.objectionRowText(g, 1, {})), [
    'Brev 1 · krav 2, 4–5, 7 · Mangler OH (D1+D2)',
    'Brev 1 · krav 3 · Mangler OH (D1+D2)',
    'Brev 1 · krav 6 · Mangler OH (D3)'
  ]);
});

test('groupObjections: grouped row with mapping shows the union and « · 5 strøket»', () => {
  const g = O.groupObjections(withState(O.deriveObjections(round(1, OH_CLAIMS().slice(0, 5)))));
  assert.strictEqual(g.length, 1);
  const t = { 2: { now: [2], struck: false }, 3: { now: [2], struck: false }, 4: { now: [2], struck: false }, 5: { now: [], struck: true } };
  assert.strictEqual(O.objectionRowText(g[0], 1, t), 'Brev 1 · krav 2–5 · Mangler OH (D1+D2) → nå krav 2 · 5 strøket');
});

test('groupObjections never groups manual objections', () => {
  const manual = O.manualObjectionsShown([{ id: 'maaaa1', text: 'Enhet', raisedIn: 1 },
    { id: 'mbbbb1', text: 'Enhet', raisedIn: 1 }], {}, 2).map((o) => Object.assign({}, o, { state: 'open' }));
  const groups = O.groupObjections(manual);
  assert.strictEqual(groups.length, 2);
  assert.ok(O.objectionRowText(groups[0], 1, {}).includes('Enhet'));
});

test('AC11 objectionProgress counts rows; «Ny» manual objections are not counted', () => {
  const derived = withState(O.deriveObjections(round(1, OH_CLAIMS())), { 'r1-k6-oh': 'maintained' });
  const manual = O.manualObjectionsShown([{ id: 'mold01', text: 'gammel', raisedIn: 1 },
    { id: 'mnew02', text: 'ny', raisedIn: 2 }], { 2: { mold01: 'resolved' } }, 2)
    .map((o) => Object.assign({}, o, { state: o.id === 'mold01' ? 'resolved' : 'open' }));
  const groups = O.groupObjections(derived.concat(manual));
  eq(O.objectionProgress(groups), { x: 2, y: 3 }, 'rows: krav 2–5,7 (open), krav 6 (maintained), mold01 (resolved)');
  eq(O.objectionProgress([]), { x: 0, y: 0 });
});

// ── refusalWarnings (AC14–20) ──────────────────────────────────────────────
test('AC20 clean case → []', () => {
  eq(W(kase(), data()), []);
});

test('refusalWarnings is [] outside Viderebehandling and for oppdrag', () => {
  for (const status of ['ny', 'fristarkiv', 'avsluttet']) eq(W(kase({ status }), data({ objectionStates: {} })), [], status);
  eq(W(kase({ type: 'oppdrag' }), data({ objectionStates: {} })), []);
});

test('AC14 no stored round → only the «Ingen lagret runde» line', () => {
  eq(W(kase(), data({ rounds: [] })), ['Ingen lagret runde – kan ikke kontrollere at søker er hørt']);
});

test('AC15 claims changed without a 2B mapping → one line, per-claim checks skipped', () => {
  const d = data({ rounds: [R1C()] });
  d.claims[1] = claim(2, { novelty: true, inventive: false, inventiveDocs: ['D3'] }); // would trigger AC16
  eq(W(kase(), d), ['Kravene er endret i svaret – søker har ikke uttalt seg om kravene slik de nå lyder']);
});

test('AC15 claims changed, complete 2B mapping → per-claim endret/nytt lines; uendret checked against the old number', () => {
  const d = data({
    rounds: [R1C()],
    claims: [
      claim(1, { novelty: false, inventive: false, noveltyDoc: 'D1', mapping: M([1, 4], 'endret') }),
      claim(2, { novelty: true, inventive: false, inventiveDocs: ['D1'], mapping: M([], 'ny') }),
      claim(3, { novelty: true, inventive: false, inventiveDocs: ['D1', 'D2'], mapping: M([2], 'uendret') }),
      claim(4, { novelty: true, inventive: true, mapping: M([3], 'endret') }),
      claim(5, { novelty: true, inventive: true, mapping: M([5], 'uendret') })
    ],
    objectionStates: { 2: { 'r1-k1-nyhet': 'maintained', 'r1-k2-oh': 'resolved', 'r1-k3-formelt': 'resolved' } }
  });
  eq(W(kase(), d), [
    'Krav 1 er endret – søker har ikke uttalt seg om kravet slik det nå lyder',
    'Krav 2 er nytt – søker har ikke uttalt seg om kravet',
    'Krav 3: mangler oppfinnelseshøyde er ikke reist i brev 1'
  ]);
  d.objectionStates[2]['r1-k2-oh'] = 'maintained';
  eq(W(kase(), d), [
    'Krav 1 er endret – søker har ikke uttalt seg om kravet slik det nå lyder',
    'Krav 2 er nytt – søker har ikke uttalt seg om kravet'
  ], 'old claim 2 ✗OH (D1+D2) maintained covers current claim 3');
});

test('AC16 ground not raised: ✗OH now, ✓ in brev 1', () => {
  const d = data();
  d.claims[3] = claim(4, { novelty: true, inventive: false, inventiveDocs: ['D1'] });
  eq(W(kase(), d), ['Krav 4: mangler oppfinnelseshøyde er ikke reist i brev 1']);
});

test('AC16 resolved/dropped count as not raised', () => {
  for (const s of ['resolved', 'dropped']) {
    const d = data();
    d.objectionStates[2]['r1-k1-nyhet'] = s;
    eq(W(kase(), d), ['Krav 1: mangler nyhet er ikke reist i brev 1'], s);
  }
});

test('AC16 formal: «formelle feil er ikke reist»', () => {
  const d = data();
  d.claims[4] = claim(5, { novelty: true, inventive: true, formal: true });
  eq(W(kase(), d), ['Krav 5: formelle feil er ikke reist i brev 1']);
});

test('AC16 docs not cited in brev L; «(nytt i runde k)» for a citation new in this round', () => {
  const d = data({ docs: [doc('D1'), doc('D2'), doc('D3'), doc('D4'), doc('D5', { withdrawn: true })] });
  d.claims[1] = claim(2, { novelty: true, inventive: false, inventiveDocs: ['D1', 'D3'] });
  d.objectionStates[2]['r1-k2-oh'] = 'maintained';
  d.claims[0] = claim(1, { novelty: false, inventive: false, noveltyDoc: 'D4' });
  eq(W(kase(), d), [
    'Krav 1: D4 ble ikke anført i brev 1 (nytt i runde 2)',
    'Krav 2: D3 ble ikke anført i brev 1'
  ]);
  d.claims[0] = claim(1, { novelty: false, inventive: false, noveltyDoc: 'D5' });
  eq(W(kase(), d), ['Krav 2: D3 ble ikke anført i brev 1'], 'withdrawn current doc ignored');
});

test('AC17 new manual objection → «Ny innvending: <text>»', () => {
  const d = data({ objections: [{ id: 'mnew002', text: 'Mangler enhet', raisedIn: 2 }] });
  eq(W(kase(), d), ['Ny innvending: Mangler enhet']);
});

test('AC18 open objections → «N innvendinger er ikke vurdert» / «1 innvending er ikke vurdert»', () => {
  const d1 = data();
  delete d1.objectionStates[2]['r1-k2-oh'];
  eq(W(kase(), d1), ['1 innvending er ikke vurdert']);
  const d2 = data();
  delete d2.objectionStates[2]['r1-k2-oh'];
  delete d2.objectionStates[2]['r1-k3-formelt'];
  eq(W(kase(), d2), ['2 innvendinger er ikke vurdert']);
  const d3 = data({ objections: [{ id: 'mold001', text: 'Gammel', raisedIn: 1 }] });
  eq(W(kase(), d3), ['1 innvending er ikke vurdert'], 'an open shown manual objection counts');
});

test('AC19 nothing left → «Ingen gjenstående innvendinger – avslag mangler grunnlag»', () => {
  const d = data();
  d.claims[0] = claim(1, { novelty: true, inventive: true });
  d.objectionStates[2]['r1-k1-nyhet'] = 'resolved';
  eq(W(kase(), d), ['Ingen gjenstående innvendinger – avslag mangler grunnlag']);
  const withManual = data({ claims: d.claims, objectionStates: { 2: Object.assign({}, d.objectionStates[2], { mold001: 'maintained' }) },
    objections: [{ id: 'mold001', text: 'Enhet', raisedIn: 1 }] });
  eq(W(kase(), withManual), [], 'a maintained older manual objection is a ground');
});

test('refusalWarnings order: per-claim, Ny innvending, ikke vurdert', () => {
  const d = data({ objections: [{ id: 'mnew002', text: 'Ny ting', raisedIn: 2 }] });
  d.claims[3] = claim(4, { novelty: true, inventive: false, inventiveDocs: ['D1'] });
  delete d.objectionStates[2]['r1-k3-formelt'];
  eq(W(kase(), d), [
    'Krav 4: mangler oppfinnelseshøyde er ikke reist i brev 1',
    'Ny innvending: Ny ting',
    '1 innvending er ikke vurdert'
  ]);
});

test('refusalWarnings does not mutate its inputs', () => {
  const c = kase(); const d = data();
  const before = JSON.stringify([c, d]);
  O.refusalWarnings(c, d, d.rounds);
  assert.strictEqual(JSON.stringify([c, d]), before);
});

// ── AC13: undo invalidation ────────────────────────────────────────────────
test('AC13 OBJECTION_* actions never invalidate a docs/claims undo snapshot', () => {
  for (const mode of ['docs', 'claims']) {
    const snap = { mode, caseId: 'X', logIds: [], label: '1', before: { docs: [], claims: [] } };
    for (const type of ['OBJECTION_STATE_SET', 'OBJECTION_ADD', 'OBJECTION_DELETE']) {
      assert.strictEqual(O.undoInvalidatedBy(snap, type, { id: 'X' }), false, mode + ' / ' + type);
    }
  }
});
