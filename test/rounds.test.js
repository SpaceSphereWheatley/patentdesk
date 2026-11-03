'use strict';
// Round snapshots (spec 2A, design 2A, schema 8). Written by QA before the
// builder; the functions below do not exist yet in v4.52.3.
//
// ── Expected signatures (pure, no clock, no DOM, never mutate inputs) ──────
//
// Snapshot shape (one entry of sakData.rounds):
//   { n: 1,                                         // integer >= 1
//     letter:   { date: 'YYYY-MM-DD'|null, deadline: 'YYYY-MM-DD'|null },
//     response: { date: 'YYYY-MM-DD'|null, changes: ['claims'|'description'] } | null,
//     claims:   [normalizeClaim(...)],              // deep copy, whitelisted fields
//     docIds:   ['D1', ...],                         // non-withdrawn docs at snapshot time
//     backfilled: true }                             // only on «Lagre … i ettertid» rounds
//
// normalizeClaim(raw, i) -> claim | null
//   Whitelisted copy: num (int >= 1, default i + 1), novelty/inventive/formal
//   (true|false|null; anything else -> null), independent (bool), dep (int < num
//   or null), depManual (bool), label (string), noveltyDoc (/^D\d+$/ or null),
//   inventiveDocs (array of /^D\d+$/). novelty === false forces inventive === false.
//   Unknown keys dropped. Non-object raw -> null.
// makeRoundSnapshot(n, sakData, letterDate, deadline) -> snapshot (response: null)
// roundsAfterTransition(rounds, ctx) -> new rounds array
//   ctx = { from, to, isOppdrag, lettersAfter, sakData, today, deadline, response }
//     from/to       status keys ('ny'|'fristarkiv'|'viderebehandling'|'avsluttet')
//     lettersAfter  lettersSent(history) after the transition
//     today         'YYYY-MM-DD' (letter date / fallback response date)
//     deadline      new dueDate on → fristarkiv (applicant's deadline) or null
//     response      sanitizeResponseExtra(...) output { received, changes } or null
//   Rules: oppdrag -> []; drop n > lettersAfter; → fristarkiv from ny or
//   viderebehandling appends snapshot n = lettersAfter (replacing same n);
//   fristarkiv → viderebehandling fills last.response {date: received||today,
//   changes: changes||[]}; → avsluttet adds nothing.
// normalizeRounds(raw) -> array (see AC9 tests)
// normalizeImportSakDetails(sd) -> sd copy with rounds = normalizeRounds(sd.rounds);
//   called from prepareImportData for every data.sakDetails[id].
// roundDrawerLines(round) -> [{ num, novelty: 'N✓'|'N✗'|'–',
//   inventive: 'O✓'|'O✗'|'–', docs: ['D1', ...] (noveltyDoc then inventiveDocs,
//   deduped), label }], one per frozen claim, in order. null round -> [].
// docFirstRound(rounds, docId) -> n of the first snapshot whose docIds contain
//   docId; if none does, (max n) + 1 (= new in the current round); [] -> null.
// canBackfillRound(c, rounds) -> bool: c is not oppdrag, lettersSent(c.history)
//   >= 1 and rounds is empty.
// backfillRound(c, sakData) -> snapshot with n = lettersSent(c.history),
//   backfilled: true, letter.date = date of the last letter transition,
//   response from the «Svar mottatt» entry (received) when there is one.
// roundsAfterUndo(current, snap) -> copy of snap.roundsBefore if it is an
//   array, otherwise current.
// roundsOf(data) -> data.rounds if it is an array, otherwise [].
// SCHEMA_VERSION === 8; SCHEMA_MIGRATIONS[7] adds rounds: [] to every pt_sak_*.
// defaultSakData(n).rounds deep-equals [].

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunctionSource } = require('./extractFunctions');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'PatentDesk.html'), 'utf8');

// ── Loader with automatic dependency resolution ───────────────────────────
// The builder chooses the helpers; this pulls in every top-level function or
// var a requested function (transitively) refers to, so the tests pin the
// contract, not the internals. Each chunk is evaluated on its own; a var whose
// initializer needs the DOM simply stays undefined.
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
    if (!src && names.includes(name)) {
      try { src = extractFunctionSource(HTML, name); } catch (e) { src = null; }
    }
    if (!src) src = topLevelVar(name);
    if (!src) {
      continue; // not built yet -> the test using it fails on its own
    }
    chunks.push(src);
    (src.match(/[A-Za-z_$][\w$]*/g) || []).forEach((id) => { if (!seen.has(id)) queue.push(id); });
  }
  const sandbox = Object.assign({}, globals);
  vm.createContext(sandbox);
  // Functions first (hoisted declarations), then vars in source order.
  chunks.sort((a, b) => (a.startsWith('function') ? 0 : 1) - (b.startsWith('function') ? 0 : 1));
  chunks.forEach((src) => { try { vm.runInContext(src, sandbox); } catch (e) { /* DOM-bound var */ } });
  const out = {};
  names.forEach((n) => { out[n] = vm.runInContext('typeof ' + n + ' === "undefined" ? undefined : ' + n, sandbox); });
  out.__sandbox = sandbox;
  return out;
}

// Cross-realm values: compare as plain JSON.
const plain = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const eq = (actual, expected, msg) => assert.deepStrictEqual(plain(actual), expected, msg);

const FNS = ['normalizeClaim', 'makeRoundSnapshot', 'roundsAfterTransition', 'normalizeRounds',
  'normalizeImportSakDetails', 'roundDrawerLines', 'docFirstRound', 'canBackfillRound',
  'backfillRound', 'roundsAfterUndo', 'roundsOf'];
const R = load(FNS, { globals: { isNonWorkday: () => false } });

// ── Fixtures ───────────────────────────────────────────────────────────────
function claim(num, over) {
  return Object.assign({
    num, novelty: null, inventive: null, formal: null, notes: '', independent: num === 1,
    dep: num === 1 ? null : 1, depManual: false, label: '', noveltyDoc: null, inventiveDocs: []
  }, over || {});
}
function sakData(over) {
  return Object.assign({
    numClaims: 3, filingDate: '', priorityDate: '', checklist: {}, classes: [],
    docs: [
      { id: 'D1', ref: 'WO 2020/1', p: false, e: false, background: false, withdrawn: false },
      { id: 'D2', ref: 'EP 2', p: false, e: false, background: false, withdrawn: true },
      { id: 'D3', ref: 'US 3', p: false, e: false, background: false, withdrawn: false }
    ],
    claims: [
      claim(1, { novelty: false, inventive: false, noveltyDoc: 'D1', label: 'Anordning' }),
      claim(2, { novelty: true, inventive: false, inventiveDocs: ['D1', 'D3'] }),
      claim(3, { novelty: true, inventive: true })
    ],
    rounds: []
  }, over || {});
}
function snap(n, over) {
  return Object.assign({
    n, letter: { date: '2026-0' + n + '-10', deadline: '2026-0' + (n + 3) + '-10' },
    response: null, claims: [claim(1, { novelty: true, inventive: true })], docIds: ['D1']
  }, over || {});
}
function ctx(over) {
  return Object.assign({
    from: 'ny', to: 'fristarkiv', isOppdrag: false, lettersAfter: 1,
    sakData: sakData(), today: '2026-11-03', deadline: '2027-02-03', response: null
  }, over || {});
}
const H = (from, to, date, extra) => Object.assign({ type: 'status', date: date + 'T10:00:00.000Z', from, to }, extra || {});

// ── normalizeClaim ─────────────────────────────────────────────────────────
test('normalizeClaim keeps whitelisted fields and drops unknown keys', () => {
  const c = R.normalizeClaim(Object.assign(claim(2, { novelty: true, inventive: true, label: 'Bruk',
    noveltyDoc: 'D1', inventiveDocs: ['D1', 'D2'] }), { evil: 'x', __secret: 1 }), 1);
  assert.strictEqual(c.num, 2);
  assert.strictEqual(c.novelty, true);
  assert.strictEqual(c.inventive, true);
  assert.strictEqual(c.label, 'Bruk');
  assert.strictEqual(c.noveltyDoc, 'D1');
  eq(c.inventiveDocs, ['D1', 'D2']);
  assert.strictEqual(c.dep, 1);
  assert.ok(!('evil' in c) && !('__secret' in c));
});

test('normalizeClaim enforces the novelty lock (no novelty -> no inventive step)', () => {
  const c = R.normalizeClaim(claim(1, { novelty: false, inventive: true }), 0);
  assert.strictEqual(c.novelty, false);
  assert.strictEqual(c.inventive, false);
});

test('normalizeClaim coerces bad values to safe defaults', () => {
  const c = R.normalizeClaim({ num: 'x', novelty: 'yes', inventive: 1, label: 42, noveltyDoc: '<b>',
    inventiveDocs: ['D1', 'nope', 7, 'D9'], dep: 5 }, 2);
  assert.strictEqual(c.num, 3, 'num falls back to i + 1');
  assert.strictEqual(c.novelty, null);
  assert.strictEqual(c.inventive, null);
  assert.strictEqual(typeof c.label, 'string');
  assert.strictEqual(c.noveltyDoc, null);
  eq(c.inventiveDocs, ['D1', 'D9']);
  assert.strictEqual(c.dep, null, 'a claim cannot depend on a later claim');
});

test('normalizeClaim returns null for non-objects', () => {
  assert.strictEqual(R.normalizeClaim(null, 0), null);
  assert.strictEqual(R.normalizeClaim('krav', 0), null);
  assert.strictEqual(R.normalizeClaim([1, 2], 0), null);
});

// ── AC1/AC5 makeRoundSnapshot ──────────────────────────────────────────────
test('AC1 makeRoundSnapshot records n, letter, claims and non-withdrawn docIds', () => {
  const s = R.makeRoundSnapshot(1, sakData(), '2026-11-03', '2027-02-03');
  assert.strictEqual(s.n, 1);
  eq(s.letter, { date: '2026-11-03', deadline: '2027-02-03' });
  assert.strictEqual(s.response, null);
  assert.strictEqual(s.claims.length, 3);
  assert.strictEqual(s.claims[0].noveltyDoc, 'D1');
  eq(s.docIds, ['D1', 'D3']);
  assert.ok(!s.backfilled, 'a letter snapshot is not backfilled');
});

test('AC5 makeRoundSnapshot is a deep copy: later work does not change the round', () => {
  const sd = sakData();
  const s = R.makeRoundSnapshot(1, sd, '2026-11-03', null);
  const before = plain(s);
  sd.claims[1].novelty = false;
  sd.claims[1].inventiveDocs.push('D9');
  sd.claims[0].label = 'endret';
  sd.claims.push(claim(4));
  sd.docs[0].withdrawn = true;
  eq(s, before);
});

test('AC1 makeRoundSnapshot with 0 claims gives an empty claims list', () => {
  const s = R.makeRoundSnapshot(1, sakData({ claims: [], numClaims: 0 }), '2026-11-03', null);
  eq(s.claims, []);
});

// ── roundsAfterTransition ──────────────────────────────────────────────────
test('AC1 first «Brev sendt» (ny -> fristarkiv) creates rounds[0]', () => {
  const out = R.roundsAfterTransition([], ctx());
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].n, 1);
  eq(out[0].letter, { date: '2026-11-03', deadline: '2027-02-03' });
  assert.strictEqual(out[0].response, null);
  assert.strictEqual(out[0].claims.length, 3);
  eq(out[0].docIds, ['D1', 'D3']);
});

test('AC2 new office action (viderebehandling -> fristarkiv) appends round n + 1', () => {
  const r1 = snap(1, { response: { date: '2026-05-01', changes: ['claims'] } });
  const out = R.roundsAfterTransition([r1], ctx({ from: 'viderebehandling', lettersAfter: 2 }));
  assert.strictEqual(out.length, 2);
  eq(out[0], plain(r1), 'round 1 untouched');
  assert.strictEqual(out[1].n, 2);
  assert.strictEqual(out[1].letter.date, '2026-11-03');
});

test('AC2 a round with the same n is replaced, not duplicated', () => {
  const out = R.roundsAfterTransition([snap(1)], ctx({ lettersAfter: 1 }));
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].letter.date, '2026-11-03');
});

test('AC3 approval or refusal (-> avsluttet) adds no snapshot', () => {
  const rounds = [snap(1, { response: { date: '2026-05-01', changes: [] } })];
  ['viderebehandling', 'fristarkiv', 'ny'].forEach((from) => {
    const out = R.roundsAfterTransition(rounds, ctx({ from, to: 'avsluttet', lettersAfter: 1, deadline: null }));
    eq(out, plain(rounds), 'from ' + from);
  });
});

test('AC4 «Svar mottatt» (fristarkiv -> viderebehandling) fills response on the last round', () => {
  const rounds = [snap(1)];
  const out = R.roundsAfterTransition(rounds, ctx({ from: 'fristarkiv', to: 'viderebehandling', lettersAfter: 1,
    deadline: null, response: { received: '2026-10-20', changes: ['claims', 'description'] } }));
  assert.strictEqual(out.length, 1);
  eq(out[0].response, { date: '2026-10-20', changes: ['claims', 'description'] });
  eq(out[0].claims, plain(rounds[0].claims), 'claims stay frozen');
  assert.strictEqual(rounds[0].response, null, 'input not mutated');
});

test('AC4 «Svar mottatt» without a received date falls back to today', () => {
  const out = R.roundsAfterTransition([snap(1)], ctx({ from: 'fristarkiv', to: 'viderebehandling',
    lettersAfter: 1, deadline: null, response: null }));
  eq(out[0].response, { date: '2026-11-03', changes: [] });
});

test('AC4 «Svar mottatt» fills only the last round', () => {
  const r1 = snap(1, { response: { date: '2026-04-01', changes: ['claims'] } });
  const out = R.roundsAfterTransition([r1, snap(2)], ctx({ from: 'fristarkiv', to: 'viderebehandling',
    lettersAfter: 2, deadline: null, response: { received: '2026-10-20', changes: [] } }));
  eq(out[0].response, { date: '2026-04-01', changes: ['claims'] });
  eq(out[1].response, { date: '2026-10-20', changes: [] });
});

test('AC6 correction fristarkiv -> ny drops the last snapshot (n <= lettersSent)', () => {
  const out = R.roundsAfterTransition([snap(1)], ctx({ from: 'fristarkiv', to: 'ny', lettersAfter: 0, deadline: null }));
  eq(out, []);
  const out2 = R.roundsAfterTransition([snap(1), snap(2)], ctx({ from: 'fristarkiv', to: 'ny', lettersAfter: 1, deadline: null }));
  assert.strictEqual(out2.length, 1);
  assert.strictEqual(out2[0].n, 1);
});

test('AC6 rounds beyond lettersAfter (e.g. from a merge import) are clamped at the next transition', () => {
  const out = R.roundsAfterTransition([snap(1), snap(2), snap(3)], ctx({ from: 'viderebehandling', lettersAfter: 2 }));
  eq(out.map((r) => r.n), [1, 2]);
  assert.strictEqual(out[1].letter.date, '2026-11-03');
});

test('AC7 oppdrag never get rounds', () => {
  eq(R.roundsAfterTransition([], ctx({ isOppdrag: true })), []);
  eq(R.roundsAfterTransition([snap(1)], ctx({ isOppdrag: true, to: 'avsluttet' })), []);
});

test('AC1 a case with 0 claims still gets a round', () => {
  const out = R.roundsAfterTransition([], ctx({ sakData: sakData({ claims: [], numClaims: 0, docs: [] }) }));
  assert.strictEqual(out.length, 1);
  eq(out[0].claims, []);
  eq(out[0].docIds, []);
});

test('AC5 roundsAfterTransition does not mutate rounds or sakData, and copies deeply', () => {
  const rounds = [snap(1, { response: { date: '2026-05-01', changes: ['claims'] } })];
  const sd = sakData();
  const roundsBefore = plain(rounds), sdBefore = plain(sd);
  const out = R.roundsAfterTransition(rounds, ctx({ from: 'viderebehandling', lettersAfter: 2, sakData: sd }));
  eq(rounds, roundsBefore);
  eq(sd, sdBefore);
  assert.notStrictEqual(out, rounds);
  sd.claims[2].novelty = false;
  sd.claims[1].inventiveDocs.push('D9');
  assert.strictEqual(out[1].claims[2].novelty, true);
  eq(out[1].claims[1].inventiveDocs, ['D1', 'D3']);
});

test('roundsAfterTransition tolerates missing rounds (older data)', () => {
  const out = R.roundsAfterTransition(undefined, ctx());
  assert.strictEqual(out.length, 1);
});

// ── AC9 normalizeRounds / normalizeImportSakDetails ────────────────────────
test('AC9 normalizeRounds turns a non-array into []', () => {
  [undefined, null, 'x', 5, {}, { 0: snap(1) }, true].forEach((v) => eq(R.normalizeRounds(v), [], String(v)));
});

test('AC9 normalizeRounds drops entries that are not objects or lack a valid n', () => {
  const out = R.normalizeRounds([null, 'x', 3, [], snap(1), { n: 0 }, { n: -1 }, { n: 1.5 }, { n: '2' }, {}]);
  eq(out.map((r) => r.n), [1]);
});

test('AC9 normalizeRounds keeps valid rounds unchanged (export round-trips, AC10)', () => {
  const rounds = [
    snap(1, { response: { date: '2026-05-01', changes: ['claims', 'description'] } }),
    snap(2, { backfilled: true })
  ];
  const json = JSON.parse(JSON.stringify(rounds));
  const once = plain(R.normalizeRounds(json));
  eq(once.map((r) => r.n), [1, 2]);
  eq(once[0].letter, rounds[0].letter);
  eq(once[0].response, rounds[0].response);
  eq(once[0].docIds, ['D1']);
  assert.strictEqual(once[1].backfilled, true);
  assert.strictEqual(once[0].claims[0].novelty, true);
  eq(plain(R.normalizeRounds(once)), once, 'idempotent');
});

test('AC9 normalizeRounds sets invalid or non-ISO dates to null', () => {
  const out = R.normalizeRounds([
    snap(1, { letter: { date: '2026-02-30', deadline: '01.06.2026' }, response: { date: 'i går', changes: [] } }),
    snap(2, { letter: { date: 20260101, deadline: '2026-13-01' } }),
    snap(3, { letter: 'x' })
  ]);
  eq(out[0].letter, { date: null, deadline: null });
  assert.strictEqual(out[0].response.date, null);
  eq(out[1].letter, { date: null, deadline: null });
  eq(out[2].letter, { date: null, deadline: null });
});

test('AC9 normalizeRounds: response is an object or null; changes filtered', () => {
  const out = R.normalizeRounds([
    snap(1, { response: 'ja' }),
    snap(2, { response: { date: '2026-05-01', changes: ['claims', 'evil', 3, 'description'] } }),
    snap(3, { response: { date: '2026-05-01', changes: 'claims' } }),
    snap(4, { response: [1] })
  ]);
  assert.strictEqual(out[0].response, null);
  eq(out[1].response, { date: '2026-05-01', changes: ['claims', 'description'] });
  eq(out[2].response.changes, []);
  assert.strictEqual(out[3].response, null);
});

test('AC9 normalizeRounds normalises claims (incl. novelty lock) and docIds', () => {
  const out = R.normalizeRounds([snap(1, {
    claims: [{ num: 1, novelty: false, inventive: true, label: 'A', junk: 1 }, null, 'krav'],
    docIds: ['D1', 'D2', 'X1', '<img src=x>', 4, 'D10']
  })]);
  assert.strictEqual(out[0].claims.length, 1);
  assert.strictEqual(out[0].claims[0].inventive, false);
  assert.ok(!('junk' in out[0].claims[0]));
  eq(out[0].docIds, ['D1', 'D2', 'D10']);
  const out2 = R.normalizeRounds([snap(1, { claims: 'x', docIds: 'D1' })]);
  eq(out2[0].claims, []);
  eq(out2[0].docIds, []);
});

test('AC9 normalizeRounds drops unknown and prototype keys', () => {
  const raw = JSON.parse('[{"n":1,"letter":{"date":"2026-01-10","deadline":null,"x":1},"response":null,' +
    '"claims":[{"num":1,"__proto__":{"polluted":true},"constructor":{"prototype":{"p2":1}}}],' +
    '"docIds":[],"__proto__":{"polluted":true},"evil":"<script>","constructor":"x"}]');
  const out = R.normalizeRounds(raw);
  const r = out[0];
  eq(Object.keys(r).filter((k) => !['n', 'letter', 'response', 'claims', 'docIds', 'backfilled'].includes(k)), []);
  assert.ok(!Object.prototype.hasOwnProperty.call(r, '__proto__'));
  assert.strictEqual(r.polluted, undefined);
  assert.strictEqual(r.claims[0].polluted, undefined);
  assert.ok(!Object.prototype.hasOwnProperty.call(r.claims[0], 'constructor'));
  eq(Object.keys(r.letter).sort(), ['date', 'deadline']);
  assert.strictEqual({}.polluted, undefined);
});

test('AC9 backfilled is kept only when it is exactly true', () => {
  const out = R.normalizeRounds([snap(1, { backfilled: 'yes' }), snap(2, { backfilled: true })]);
  assert.ok(!out[0].backfilled);
  assert.strictEqual(out[1].backfilled, true);
});

test('AC9 normalizeRounds sorts by n and keeps one entry per n', () => {
  const out = R.normalizeRounds([snap(3), snap(1), snap(2), snap(1)]);
  eq(out.map((r) => r.n), [1, 2, 3]);
});

test('AC9 XSS-looking text is kept as plain text, not stripped or escaped', () => {
  const label = '<img src=x onerror="alert(1)">';
  const out = R.normalizeRounds([snap(1, { claims: [claim(1, { label })] })]);
  assert.strictEqual(out[0].claims[0].label, label);
});

test('AC9 normalizeImportSakDetails normalises rounds and leaves other data alone', () => {
  const sd = sakData({ rounds: 'nope' });
  const out = R.normalizeImportSakDetails(sd);
  eq(out.rounds, []);
  eq(out.claims, plain(sd.claims));
  eq(out.docs, plain(sd.docs));
  assert.strictEqual(out.numClaims, 3);
  const sd2 = sakData();
  delete sd2.rounds;
  eq(R.normalizeImportSakDetails(sd2).rounds, [], 'missing rounds -> []');
  const out3 = R.normalizeImportSakDetails(sakData({ rounds: [snap(1, { evil: 1 })] }));
  assert.strictEqual(out3.rounds.length, 1);
  assert.ok(!('evil' in out3.rounds[0]));
});

test('AC9 prepareImportData normalises rounds in sakDetails (file import, backups, workfile)', () => {
  const P = load(['prepareImportData'], { globals: { isNonWorkday: () => false } });
  const data = {
    cases: [{ id: 'abc', caseNumber: 'P-1', dueDate: '2026-12-01', title: 'T', status: 'viderebehandling' }],
    sakDetails: {
      abc: sakData({ rounds: [snap(1, { evil: '<x>', letter: { date: 'bad', deadline: null } }), 'junk'] })
    }
  };
  const res = P.prepareImportData(data);
  const rounds = res.data.sakDetails.abc.rounds;
  assert.strictEqual(rounds.length, 1);
  assert.ok(!('evil' in rounds[0]));
  assert.strictEqual(rounds[0].letter.date, null);
  const data2 = { cases: data.cases, sakDetails: { abc: sakData({ rounds: 7 }) } };
  eq(P.prepareImportData(data2).data.sakDetails.abc.rounds, []);
});

// ── AC11 roundDrawerLines ──────────────────────────────────────────────────
test('AC11 roundDrawerLines gives one line per frozen claim', () => {
  const r = snap(1, { claims: [
    claim(1, { novelty: false, inventive: false, noveltyDoc: 'D1', label: 'Anordning' }),
    claim(2, { novelty: true, inventive: false, inventiveDocs: ['D1', 'D2'] }),
    claim(3, { novelty: true, inventive: true }),
    claim(4)
  ] });
  eq(R.roundDrawerLines(r), [
    { num: 1, novelty: 'N✗', inventive: 'O✗', docs: ['D1'], label: 'Anordning' },
    { num: 2, novelty: 'N✓', inventive: 'O✗', docs: ['D1', 'D2'], label: '' },
    { num: 3, novelty: 'N✓', inventive: 'O✓', docs: [], label: '' },
    { num: 4, novelty: '–', inventive: '–', docs: [], label: '' }
  ]);
});

test('AC11 roundDrawerLines dedupes docs and applies the novelty lock', () => {
  const lines = R.roundDrawerLines(snap(1, { claims: [claim(1, { novelty: false, inventive: true, noveltyDoc: 'D2', inventiveDocs: ['D2', 'D3'] })] }));
  assert.strictEqual(lines[0].inventive, 'O✗');
  eq(lines[0].docs, ['D2', 'D3']);
});

test('AC11 roundDrawerLines is empty for no round or no claims', () => {
  eq(R.roundDrawerLines(null), []);
  eq(R.roundDrawerLines(snap(1, { claims: [] })), []);
  eq(R.roundDrawerLines(snap(1, { claims: 'x' })), []);
});

// ── AC12 docFirstRound ─────────────────────────────────────────────────────
test('AC12 docFirstRound is the first round whose docIds contain the doc', () => {
  const rounds = [snap(1, { docIds: ['D1', 'D2'] }), snap(2, { docIds: ['D1', 'D2', 'D4'] })];
  assert.strictEqual(R.docFirstRound(rounds, 'D1'), 1);
  assert.strictEqual(R.docFirstRound(rounds, 'D4'), 2);
});

test('AC12 a doc in no snapshot is new in the current round (max n + 1)', () => {
  assert.strictEqual(R.docFirstRound([snap(1, { docIds: ['D1'] })], 'D3'), 2);
});

test('AC12 no rounds -> no badge (null)', () => {
  assert.strictEqual(R.docFirstRound([], 'D1'), null);
  assert.strictEqual(R.docFirstRound(undefined, 'D1'), null);
});

// ── AC13 canBackfillRound / backfillRound ──────────────────────────────────
const sentOnce = [H(null, 'ny', '2026-03-01'), H('ny', 'fristarkiv', '2026-06-01')];
const answered = sentOnce.concat([H('fristarkiv', 'viderebehandling', '2026-08-21', { received: '2026-08-20', changes: ['claims'] })]);

test('AC13 canBackfillRound: letters sent and no rounds', () => {
  assert.strictEqual(R.canBackfillRound({ status: 'fristarkiv', type: 'sak', history: sentOnce }, []), true);
  assert.strictEqual(R.canBackfillRound({ status: 'viderebehandling', type: 'sak', history: answered }, []), true);
});

test('AC13 canBackfillRound is false with no letters, existing rounds, or oppdrag', () => {
  assert.strictEqual(R.canBackfillRound({ status: 'ny', type: 'sak', history: [H(null, 'ny', '2026-03-01')] }, []), false);
  assert.strictEqual(R.canBackfillRound({ status: 'viderebehandling', type: 'sak', history: answered }, [snap(1)]), false);
  assert.strictEqual(R.canBackfillRound({ status: 'fristarkiv', type: 'oppdrag', history: sentOnce }, []), false);
  assert.strictEqual(R.canBackfillRound({ status: 'fristarkiv', type: 'sak', history: [] }, []), false);
});

test('AC13 backfillRound creates a backfilled snapshot of the current assessment', () => {
  const c = { id: 'a', status: 'viderebehandling', type: 'sak', dueDate: '2026-12-01', history: answered };
  const sd = sakData();
  const s = R.backfillRound(c, sd);
  assert.strictEqual(s.n, 1);
  assert.strictEqual(s.backfilled, true);
  assert.strictEqual(s.letter.date, '2026-06-01');
  assert.ok(s.response && s.response.date === '2026-08-20', 'response from «Svar mottatt»');
  assert.strictEqual(s.claims.length, 3);
  eq(s.docIds, ['D1', 'D3']);
  sd.claims[0].label = 'endret';
  assert.strictEqual(s.claims[0].label, 'Anordning', 'deep copy');
});

test('AC13 backfillRound uses lettersSent for n', () => {
  const hist = answered.concat([H('viderebehandling', 'fristarkiv', '2026-10-01')]);
  const s = R.backfillRound({ id: 'a', status: 'fristarkiv', type: 'sak', dueDate: '2027-01-01', history: hist }, sakData());
  assert.strictEqual(s.n, 2);
  assert.strictEqual(s.letter.date, '2026-10-01');
  assert.strictEqual(s.backfilled, true);
});

// ── Undo ───────────────────────────────────────────────────────────────────
test('roundsAfterUndo restores roundsBefore (no ghost snapshot after «Angre»)', () => {
  const before = [snap(1)];
  const out = R.roundsAfterUndo([snap(1), snap(2)], { roundsBefore: before, roundsCaseId: 'a' });
  eq(out, plain(before));
  eq(R.roundsAfterUndo([snap(1)], { roundsBefore: [] }), []);
});

test('roundsAfterUndo keeps current when the snapshot has no roundsBefore', () => {
  const cur = [snap(1)];
  eq(R.roundsAfterUndo(cur, {}), plain(cur));
  eq(R.roundsAfterUndo(cur, null), plain(cur));
});

// ── roundsOf ───────────────────────────────────────────────────────────────
test('roundsOf reads rounds, treating missing/invalid as []', () => {
  const rs = [snap(1)];
  assert.strictEqual(R.roundsOf({ rounds: rs }), rs);
  eq(R.roundsOf({}), []);
  eq(R.roundsOf(null), []);
  eq(R.roundsOf({ rounds: 'x' }), []);
});

// ── AC8 schema 8 and the v7 -> v8 migration ────────────────────────────────
function fakeStorage(init) {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key: (i) => Array.from(m.keys())[i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    dump: () => Object.fromEntries(m)
  };
}

test('AC8 SCHEMA_VERSION is 8', () => {
  const S = load(['SCHEMA_VERSION']);
  assert.strictEqual(S.SCHEMA_VERSION, 8);
});

test('AC8 SCHEMA_MIGRATIONS[7] adds rounds: [] and changes nothing else; idempotent', () => {
  const casesJson = JSON.stringify([{ id: 'a', caseNumber: '1', status: 'fristarkiv', dueDate: '2026-12-01', title: 'T' }]);
  const a = sakData();
  delete a.rounds;
  const b = sakData({ rounds: [snap(1)] });
  const c = sakData({ rounds: 'garbage' });
  const ls = fakeStorage({
    pt_cases: casesJson,
    pt_sak_a: JSON.stringify(a),
    pt_sak_b: JSON.stringify(b),
    pt_sak_c: JSON.stringify(c),
    pt_sak_bad: '{not json',
    pt_other: 'keep'
  });
  const S = load(['SCHEMA_MIGRATIONS'], { globals: { localStorage: ls, showToast: () => {} } });
  assert.strictEqual(typeof S.SCHEMA_MIGRATIONS[7], 'function');
  S.SCHEMA_MIGRATIONS[7]();
  const after1 = ls.dump();
  const pa = JSON.parse(after1.pt_sak_a);
  eq(pa.rounds, []);
  delete pa.rounds;
  eq(pa, plain(a), 'nothing else changed');
  eq(JSON.parse(after1.pt_sak_b), plain(b), 'existing rounds untouched');
  eq(JSON.parse(after1.pt_sak_c).rounds, []);
  assert.strictEqual(after1.pt_sak_bad, '{not json', 'invalid JSON skipped');
  assert.strictEqual(after1.pt_other, 'keep');
  assert.strictEqual(after1.pt_cases, casesJson, 'pt_cases untouched (rounds never live there)');
  S.SCHEMA_MIGRATIONS[7]();
  assert.deepStrictEqual(ls.dump(), after1, 'idempotent');
});

test('AC8 defaultSakData starts with rounds: []', () => {
  const D = load(['defaultSakData'], { globals: { getChecklistTemplate: () => [] } });
  eq(D.defaultSakData(2).rounds, []);
});

// ── AC14 no workload change ────────────────────────────────────────────────
test('AC14 workload logic does not read rounds', () => {
  ['computeBelegg', 'deadlineFor', 'effDueFor', 'workWindowStart', 'lettersSent', 'examinationRound'].forEach((fn) => {
    assert.ok(!/\brounds\b/.test(extractFunctionSource(HTML, fn)), fn + ' must not depend on rounds');
  });
});

test('AC14 rounds never end up on the case record in pt_cases', () => {
  const M = load(['migrateCases']);
  const out = M.migrateCases([{ id: 'a', caseNumber: '1', status: 'ny', dueDate: '2026-12-01', title: 'T', rounds: [snap(1)] }]);
  assert.strictEqual(out[0].rounds, undefined);
});
