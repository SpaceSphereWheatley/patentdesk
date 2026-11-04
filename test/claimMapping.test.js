'use strict';
// Kravkobling / claim mapping (spec 2B + design 2B, v4.53.0, schema 8 — no
// bump). Written by QA before the builder; the new functions do not exist yet.
//
// ── Expected signatures (pure, no clock, no DOM, never mutate inputs) ──────
//
// Mapping shape (optional claim.mapping on live claims and rounds[].claims):
//   { round: int >= 1,               // n of the round R(n) it refers to
//     origin: int[],                 // R(n) claim numbers, 1..999, dedup, asc; [] = new
//     change: 'uendret'|'endret'|'ny'|null,
//     p13: true|false|null,          // § 13 basis tri-state
//     basis: string }                // sanitizeText, trimmed, <= 200 chars
//
// mappingRound(c, rounds) -> R(n) | null
//   c.status === 'viderebehandling', c.type !== 'oppdrag', R(n) = highest n in
//   visibleRounds(c, rounds), and R(n).response.changes includes 'claims'.
// normalizeClaimMapping(raw) -> mapping | null
//   Plain object only; round int >= 1 (else null); origin must be an array
//   (else null — a non-array must never turn into [] = «ny»), bad elements
//   dropped, dedup + asc; change whitelisted else null; p13 tri-state else
//   null; basis string -> sanitizeText/trim/slice(0, 200) else ''. Fresh
//   object with exactly the five keys (no unknown keys, no __proto__).
// parseOrigin(text, prevCount) -> int[] | null | { error: string }
//   '' / whitespace -> null; /^ny$/i -> []; separators + , space; ranges a-b
//   and a–b; dedup + sort; out of 1..prevCount, 0, decimal, a>b, other text,
//   'ny' mixed with numbers, > 200 chars -> { error }.
// claimMapping(claim, round) -> effective mapping | null
//   null when no/invalid mapping, round null, mapping.round !== round.n, or any
//   origin > round.claims.length. change derived: [] -> 'ny'; >= 2 -> 'endret';
//   1 -> 'uendret' only if stored 'uendret', else 'endret'. Fresh object.
// applyClaimChange(claim, next, round, docs) -> { claim, lost }
//   next = mapping (shape above) or null (removes the mapping). Never mutates
//   claim. Into endret/ny from null/uendret -> novelty, inventive, formal null,
//   noveltyDoc null, inventiveDocs []. Into uendret (or origin change while
//   uendret) -> copy EFFECTIVE novelty/inventive + stored formal + docs from
//   round claim num === origin[0]; docs not in `docs` or withdrawn are left out;
//   novelty false => inventive false. endret<->ny, merged-origin edits, p13/basis
//   only -> verdicts unchanged. num/dep/depManual/label/notes/independent never
//   touched. lost = any of the five was non-null/non-empty and changed.
// claimOriginHint(claim, round, docs) -> string (plain text)
//   «← ?» | «Ny» | «←5 Uendret · R1 N✓ O✓» |
//   «←1+4 Endret · R1: 1 N✗ O✗ D1 · 4 N✓ O✓»; effective values within the
//   round; docs = noveltyDoc then inventiveDocs, deduped, joined with '+'
//   (mockup: «D1+D2»); withdrawn/missing doc «D3 (trukket)».
// deletedClaims(round, claims) -> asc R(n) claim numbers that no valid origin
//   (claimMapping(claim, round)) uses; nothing mapped -> all of them.
// normalizeClaim(raw, i): adds `mapping` ONLY when normalizeClaimMapping(raw.mapping)
//   is non-null; otherwise the 2A shape is byte-identical.
// normalizeImportSakDetails(sd): live sd.claims become shallow copies; a
//   `mapping` key is replaced by its normalised value or deleted when null;
//   nothing else on live claims changes.
// dispatch handles 'CLAIM_MAPPING_CHANGE' { id, claimNum, mapping } via applyClaimChange.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunctionSource } = require('./extractFunctions');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'PatentDesk.html'), 'utf8');

// ── Loader with automatic dependency resolution (as in rounds.test.js) ─────
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
function need(fn, name) { assert.strictEqual(typeof fn, 'function', name + ' is not implemented'); }

const FNS = ['mappingRound', 'normalizeClaimMapping', 'parseOrigin', 'claimMapping', 'applyClaimChange',
  'claimOriginHint', 'deletedClaims', 'normalizeClaim', 'normalizeRounds', 'normalizeImportSakDetails',
  'makeRoundSnapshot', 'roundsAfterTransition', 'ensureClaims', 'prepareImportData'];
const M = load(FNS, { globals: { isNonWorkday: () => false } });

// ── Fixtures ───────────────────────────────────────────────────────────────
function claim(num, over) {
  return Object.assign({
    num, novelty: null, inventive: null, formal: null, notes: '', independent: num === 1,
    dep: num === 1 ? null : 1, depManual: false, label: '', noveltyDoc: null, inventiveDocs: []
  }, over || {});
}
const map = (round, origin, over) => Object.assign({ round, origin, change: null, p13: null, basis: '' }, over || {});

// Round 1 as frozen when letter 1 went out (5 claims).
//  1  independent, N✗ O✗ D1, formal ✓
//  2  dep 1, N✓ O✗ D1+D2
//  3  dep 1, N✗, inventive stored null (locked -> O✗), D3 (withdrawn now)
//  4  dep 1, N✓ O✓
//  5  dep 4, nothing stored -> cascades N✓ O✓ from 4
function r1Claims() {
  return [
    claim(1, { novelty: false, inventive: false, formal: true, noveltyDoc: 'D1' }),
    claim(2, { novelty: true, inventive: false, inventiveDocs: ['D1', 'D2'] }),
    claim(3, { novelty: false, inventive: null, noveltyDoc: 'D3' }),
    claim(4, { novelty: true, inventive: true }),
    claim(5, { dep: 4 })
  ];
}
function round(n, claims, over) {
  return Object.assign({ n, letter: { date: '2026-06-01', deadline: '2026-09-01' },
    response: { date: '2026-08-20', changes: ['claims'] }, claims, docIds: ['D1', 'D2', 'D3'] }, over || {});
}
const R1 = () => round(1, r1Claims());
const DOCS = () => [
  { id: 'D1', ref: 'WO 1', p: false, e: false, background: false, withdrawn: false },
  { id: 'D2', ref: 'EP 2', p: false, e: false, background: false, withdrawn: false },
  { id: 'D3', ref: 'US 3', p: false, e: false, background: false, withdrawn: true }
];
// A live claim still carrying stale round-1 verdicts plus its own text.
function live(over) {
  return claim(1, Object.assign({ novelty: true, inventive: true, formal: false, noveltyDoc: 'D2',
    inventiveDocs: ['D1'], notes: 'mitt notat', label: 'Etikett', depManual: true }, over || {}));
}
const VERDICT_KEYS = ['novelty', 'inventive', 'formal', 'noveltyDoc', 'inventiveDocs'];
const verdicts = (c) => plain(VERDICT_KEYS.reduce((o, k) => { o[k] = c[k]; return o; }, {}));
const CLEARED = { novelty: null, inventive: null, formal: null, noveltyDoc: null, inventiveDocs: [] };
function untouched(before, after) {
  for (const k of ['num', 'dep', 'depManual', 'label', 'notes', 'independent']) {
    assert.deepStrictEqual(after[k], before[k], k + ' must not be touched');
  }
}

const H = (from, to, date, extra) => Object.assign({ type: 'status', date: date + 'T10:00:00.000Z', from, to }, extra || {});
const HIST_NY = [{ type: 'status', date: '2026-03-01T10:00:00.000Z', from: null, to: 'ny' }];
const HIST_F1 = HIST_NY.concat([H('ny', 'fristarkiv', '2026-06-01')]);
const HIST_V1 = HIST_F1.concat([H('fristarkiv', 'viderebehandling', '2026-08-21', { received: '2026-08-20', changes: ['claims'] })]);
const HIST_F2 = HIST_V1.concat([H('viderebehandling', 'fristarkiv', '2026-09-15')]);
const HIST_V2 = HIST_F2.concat([H('fristarkiv', 'viderebehandling', '2026-10-20', { received: '2026-10-19', changes: ['claims'] })]);
const kase = (status, history, over) => Object.assign({ id: 'X', status, history, type: 'sak', dueDate: '2026-12-15' }, over || {});

// ── mappingRound ───────────────────────────────────────────────────────────
test('mappingRound: Viderebehandling with R1 response «claims» -> R1', () => {
  need(M.mappingRound, 'mappingRound');
  const r = M.mappingRound(kase('viderebehandling', HIST_V1), [R1()]);
  assert.ok(r, 'active');
  assert.strictEqual(r.n, 1);
});

test('mappingRound AC3: «kun argumenter» (changes []) or response null -> null', () => {
  need(M.mappingRound, 'mappingRound');
  assert.strictEqual(M.mappingRound(kase('viderebehandling', HIST_V1), [round(1, r1Claims(), { response: { date: '2026-08-20', changes: [] } })]), null);
  assert.strictEqual(M.mappingRound(kase('viderebehandling', HIST_V1), [round(1, r1Claims(), { response: null })]), null);
  assert.strictEqual(M.mappingRound(kase('viderebehandling', HIST_V1), [round(1, r1Claims(), { response: { date: '2026-08-20', changes: ['description'] } })]), null,
    'description only: no hint (owner decision 4)');
});

test('mappingRound AC1/AC2: Ny, Fristarkiv, Avsluttet, Oppdrag and no rounds -> null', () => {
  need(M.mappingRound, 'mappingRound');
  assert.strictEqual(M.mappingRound(kase('ny', HIST_NY), []), null);
  assert.strictEqual(M.mappingRound(kase('ny', HIST_NY), [R1()]), null);
  assert.strictEqual(M.mappingRound(kase('fristarkiv', HIST_F2), [R1(), round(2, r1Claims())]), null);
  assert.strictEqual(M.mappingRound(kase('avsluttet', HIST_V1.concat([H('viderebehandling', 'avsluttet', '2026-10-01')])), [R1()]), null);
  assert.strictEqual(M.mappingRound(kase('viderebehandling', HIST_V1, { type: 'oppdrag' }), [R1()]), null);
  assert.strictEqual(M.mappingRound(kase('viderebehandling', HIST_V1), []), null);
  assert.strictEqual(M.mappingRound(kase('viderebehandling', HIST_V1), undefined), null);
});

test('mappingRound uses the highest visible round only', () => {
  need(M.mappingRound, 'mappingRound');
  // Two letters sent: R2 is the latest; its response decides.
  const r2 = round(2, r1Claims().slice(0, 3));
  assert.strictEqual(M.mappingRound(kase('viderebehandling', HIST_V2), [R1(), r2]).n, 2);
  const r2args = round(2, r1Claims(), { response: { date: '2026-10-19', changes: [] } });
  assert.strictEqual(M.mappingRound(kase('viderebehandling', HIST_V2), [R1(), r2args]), null, 'R1 «claims» does not count once R2 exists');
  // One letter sent: a stray R2 is not visible.
  assert.strictEqual(M.mappingRound(kase('viderebehandling', HIST_V1), [R1(), r2]).n, 1);
});

// ── normalizeClaimMapping ──────────────────────────────────────────────────
test('normalizeClaimMapping keeps a valid mapping as a fresh five-key object', () => {
  need(M.normalizeClaimMapping, 'normalizeClaimMapping');
  const raw = map(1, [1, 4], { change: 'endret', p13: true, basis: 'Beskr. s. 7 l. 3–9' });
  const out = M.normalizeClaimMapping(raw);
  eq(out, { round: 1, origin: [1, 4], change: 'endret', p13: true, basis: 'Beskr. s. 7 l. 3–9' });
  assert.notStrictEqual(out, raw);
  assert.notStrictEqual(out.origin, raw.origin);
  eq(Object.keys(out).sort(), ['basis', 'change', 'origin', 'p13', 'round']);
});

test('normalizeClaimMapping: non-objects and bad round -> null', () => {
  need(M.normalizeClaimMapping, 'normalizeClaimMapping');
  [undefined, null, 'x', 5, true, [], [map(1, [1])]].forEach((v) => assert.strictEqual(M.normalizeClaimMapping(v), null, JSON.stringify(v)));
  [0, -1, 1.5, '1', null, undefined, NaN].forEach((r) => assert.strictEqual(M.normalizeClaimMapping(map(r, [1])), null, 'round ' + r));
});

test('normalizeClaimMapping AC13: origin must be an array; bad elements dropped; dedup + asc', () => {
  need(M.normalizeClaimMapping, 'normalizeClaimMapping');
  assert.strictEqual(M.normalizeClaimMapping(map(1, '1+4')), null, 'string origin is not «ny»');
  assert.strictEqual(M.normalizeClaimMapping(map(1, 3)), null);
  assert.strictEqual(M.normalizeClaimMapping(Object.assign(map(1, [1]), { origin: undefined })), null);
  eq(M.normalizeClaimMapping(map(1, [4, 1, 4, 0, -2, 1.5, '3', null, 1000, 999, 2])).origin, [1, 2, 4, 999]);
  eq(M.normalizeClaimMapping(map(1, [])).origin, []);
});

test('normalizeClaimMapping AC13: wrong types -> null / \'\'; bad change -> null; basis cut to 200', () => {
  need(M.normalizeClaimMapping, 'normalizeClaimMapping');
  const out = M.normalizeClaimMapping({ round: 2, origin: [1], change: 'slettet', p13: 'ja', basis: 42 });
  eq(out, { round: 2, origin: [1], change: null, p13: null, basis: '' });
  ['uendret', 'endret', 'ny'].forEach((c) => assert.strictEqual(M.normalizeClaimMapping(map(1, [1], { change: c })).change, c));
  assert.strictEqual(M.normalizeClaimMapping(map(1, [1], { change: 'Endret' })).change, null, 'case-sensitive whitelist');
  assert.strictEqual(M.normalizeClaimMapping(map(1, [1], { p13: false })).p13, false);
  assert.strictEqual(M.normalizeClaimMapping(map(1, [1], { p13: 1 })).p13, null);
  const long = M.normalizeClaimMapping(map(1, [1], { basis: '  ' + 'x'.repeat(300) + '  ' })).basis;
  assert.strictEqual(long, 'x'.repeat(200));
  assert.strictEqual(M.normalizeClaimMapping(map(1, [1], { basis: ' a\u0001b\u007f ' })).basis, 'ab', 'sanitizeText + trim');
  const xss = '<img src=x onerror="alert(1)">';
  assert.strictEqual(M.normalizeClaimMapping(map(1, [1], { basis: xss })).basis, xss, 'kept as plain text, not escaped');
});

test('normalizeClaimMapping AC13: unknown keys and __proto__ dropped', () => {
  need(M.normalizeClaimMapping, 'normalizeClaimMapping');
  const raw = JSON.parse('{"round":1,"origin":[2],"change":"uendret","p13":null,"basis":"",' +
    '"evil":"<x>","__proto__":{"polluted":true},"constructor":{"prototype":{"p2":1}}}');
  const out = M.normalizeClaimMapping(raw);
  eq(Object.keys(out).sort(), ['basis', 'change', 'origin', 'p13', 'round']);
  assert.ok(!Object.prototype.hasOwnProperty.call(out, '__proto__'));
  assert.strictEqual(out.polluted, undefined);
  assert.strictEqual({}.polluted, undefined);
});

// ── parseOrigin (AC5) ──────────────────────────────────────────────────────
test('parseOrigin AC5: separators, ranges, dedup and sort', () => {
  need(M.parseOrigin, 'parseOrigin');
  eq(M.parseOrigin('1+4', 10), [1, 4]);
  eq(M.parseOrigin('4, 1 1', 10), [1, 4]);
  eq(M.parseOrigin('2-3', 10), [2, 3]);
  eq(M.parseOrigin('2-4', 10), [2, 3, 4]);
  eq(M.parseOrigin('2–4', 10), [2, 3, 4], 'en dash');
  eq(M.parseOrigin('2 - 4', 10), [2, 3, 4]);
  eq(M.parseOrigin('5', 10), [5]);
  eq(M.parseOrigin(' 7,  3+3 1-2 ', 10), [1, 2, 3, 7]);
  eq(M.parseOrigin('10', 10), [10]);
  eq(M.parseOrigin('3-3', 10), [3]);
});

test('parseOrigin AC5: «ny» in any case -> []; empty -> null', () => {
  need(M.parseOrigin, 'parseOrigin');
  ['ny', 'NY', 'Ny', ' nY '].forEach((s) => eq(M.parseOrigin(s, 10), [], s));
  assert.strictEqual(M.parseOrigin('', 10), null);
  assert.strictEqual(M.parseOrigin('   ', 10), null);
});

test('parseOrigin AC5: invalid input -> { error }', () => {
  need(M.parseOrigin, 'parseOrigin');
  const bad = ['0', '11', '12', '1.5', '1,5.', 'abc', '1+x', '4-2', 'ny 1', '1+ny', '-1', '1--3', '#1',
    '1'.repeat(3) + ' '.repeat(200) + '2'];
  for (const s of bad) {
    const r = M.parseOrigin(s, 10);
    assert.ok(r && !Array.isArray(r) && typeof r.error === 'string' && r.error.length > 0,
      JSON.stringify(s) + ' -> ' + JSON.stringify(r));
  }
});

test('parseOrigin AC5: previous round with 0 claims -> only «ny» / \'\' valid', () => {
  need(M.parseOrigin, 'parseOrigin');
  eq(M.parseOrigin('ny', 0), []);
  assert.strictEqual(M.parseOrigin('', 0), null);
  const r = M.parseOrigin('1', 0);
  assert.ok(r && typeof r.error === 'string');
});

// ── claimMapping (AC4, AC6) ────────────────────────────────────────────────
test('claimMapping AC4: no mapping, invalid mapping, no round or round mismatch -> null', () => {
  need(M.claimMapping, 'claimMapping');
  assert.strictEqual(M.claimMapping(claim(1), R1()), null);
  assert.strictEqual(M.claimMapping(claim(1, { mapping: 'x' }), R1()), null);
  assert.strictEqual(M.claimMapping(claim(1, { mapping: map(1, [1]) }), null), null);
  assert.strictEqual(M.claimMapping(claim(1, { mapping: map(2, [1]) }), R1()), null, 'refers to R2, we are in R1');
  assert.strictEqual(M.claimMapping(claim(1, { mapping: map(1, [1]) }), round(2, r1Claims())), null,
    'old mapping stops counting in the next round (AC11)');
});

test('claimMapping: origin outside the round\'s claims -> null', () => {
  need(M.claimMapping, 'claimMapping');
  assert.strictEqual(M.claimMapping(claim(1, { mapping: map(1, [6]) }), R1()), null);
  assert.strictEqual(M.claimMapping(claim(1, { mapping: map(1, [1, 6]) }), R1()), null);
  assert.ok(M.claimMapping(claim(1, { mapping: map(1, [5]) }), R1()));
  assert.strictEqual(M.claimMapping(claim(1, { mapping: map(1, [1]) }), round(1, [])), null);
  eq(M.claimMapping(claim(1, { mapping: map(1, []) }), round(1, [])).change, 'ny', 'empty round: only new');
});

test('claimMapping AC6: derived change state', () => {
  need(M.claimMapping, 'claimMapping');
  const ch = (origin, change) => M.claimMapping(claim(1, { mapping: map(1, origin, { change }) }), R1()).change;
  assert.strictEqual(ch([], null), 'ny');
  assert.strictEqual(ch([], 'endret'), 'ny', '[] forces ny');
  assert.strictEqual(ch([], 'uendret'), 'ny');
  assert.strictEqual(ch([1, 4], 'uendret'), 'endret', 'merged never Uendret');
  assert.strictEqual(ch([1, 4], null), 'endret');
  assert.strictEqual(ch([1, 4], 'ny'), 'endret');
  assert.strictEqual(ch([3], null), 'endret', 'single origin defaults to Endret (owner decision 1)');
  assert.strictEqual(ch([3], 'ny'), 'endret');
  assert.strictEqual(ch([3], 'endret'), 'endret');
  assert.strictEqual(ch([3], 'uendret'), 'uendret');
});

test('claimMapping returns a fresh normalised object incl. p13 and basis', () => {
  need(M.claimMapping, 'claimMapping');
  const c = claim(1, { mapping: map(1, [4, 1], { change: 'endret', p13: false, basis: ' s. 3 ' }) });
  const before = JSON.stringify(c);
  const out = M.claimMapping(c, R1());
  eq(out, { round: 1, origin: [1, 4], change: 'endret', p13: false, basis: 's. 3' });
  out.origin.push(9);
  out.change = 'ny';
  assert.strictEqual(JSON.stringify(c), before, 'input not mutated / not aliased');
});

// ── applyClaimChange (AC7) ─────────────────────────────────────────────────
function apply(c, next) {
  need(M.applyClaimChange, 'applyClaimChange');
  const before = JSON.stringify(c);
  const res = M.applyClaimChange(c, next, R1(), DOCS());
  assert.strictEqual(JSON.stringify(c), before, 'input claim not mutated');
  assert.ok(res && res.claim && typeof res.lost === 'boolean', 'returns { claim, lost }');
  return res;
}
const changeOf = (c) => (M.claimMapping(c, R1()) || {}).change;

test('AC7 unmapped -> Endret (merged 1+4) clears all five verdicts; lost; other fields untouched', () => {
  const c = live();
  const res = apply(c, map(1, [1, 4], { change: 'endret' }));
  eq(verdicts(res.claim), CLEARED);
  assert.strictEqual(res.lost, true);
  untouched(c, res.claim);
  eq(res.claim.mapping.origin, [1, 4]);
  assert.strictEqual(res.claim.mapping.round, 1);
  assert.strictEqual(changeOf(res.claim), 'endret');
});

test('AC7 unmapped -> Ny clears verdicts', () => {
  const res = apply(live(), map(1, [], { change: 'ny' }));
  eq(verdicts(res.claim), CLEARED);
  assert.strictEqual(res.lost, true);
  assert.strictEqual(changeOf(res.claim), 'ny');
});

test('AC7 unmapped -> single origin with no change given defaults to Endret and clears', () => {
  const res = apply(live(), map(1, [4]));
  eq(verdicts(res.claim), CLEARED);
  assert.strictEqual(changeOf(res.claim), 'endret');
});

test('AC7 merged origin asked as Uendret is Endret: clears, never copies', () => {
  const res = apply(live(), map(1, [1, 4], { change: 'uendret' }));
  eq(verdicts(res.claim), CLEARED);
  assert.strictEqual(changeOf(res.claim), 'endret');
});

test('AC7 clearing a claim that has no verdicts is not «lost»', () => {
  const res = apply(claim(1, { notes: 'n' }), map(1, [1, 4]));
  eq(verdicts(res.claim), CLEARED);
  assert.strictEqual(res.lost, false);
});

test('AC7 a single non-empty field counts as lost (inventiveDocs)', () => {
  const res = apply(claim(1, { inventiveDocs: ['D1'] }), map(1, []));
  assert.strictEqual(res.lost, true);
});

test('AC7 Uendret copies EFFECTIVE values from R(n) (cascaded claim 5 -> N✓ O✓)', () => {
  const c = live();
  const res = apply(c, map(1, [5], { change: 'uendret' }));
  eq(verdicts(res.claim), { novelty: true, inventive: true, formal: null, noveltyDoc: null, inventiveDocs: [] });
  assert.strictEqual(changeOf(res.claim), 'uendret');
  assert.strictEqual(res.lost, true, 'formal/noveltyDoc/inventiveDocs were overwritten');
  untouched(c, res.claim);
});

test('AC7 Uendret copies stored formal and the novelty doc (claim 1)', () => {
  const res = apply(claim(1), map(1, [1], { change: 'uendret' }));
  eq(verdicts(res.claim), { novelty: false, inventive: false, formal: true, noveltyDoc: 'D1', inventiveDocs: [] });
  assert.strictEqual(res.lost, false, 'nothing was set before');
});

test('AC7 Uendret copies inventive docs (claim 2, D1+D2)', () => {
  const res = apply(claim(2), map(1, [2], { change: 'uendret' }));
  eq(verdicts(res.claim), { novelty: true, inventive: false, formal: null, noveltyDoc: null, inventiveDocs: ['D1', 'D2'] });
});

test('AC7 Uendret leaves withdrawn docs out and keeps the novelty lock (claim 3)', () => {
  const res = apply(claim(3), map(1, [3], { change: 'uendret' }));
  eq(verdicts(res.claim), { novelty: false, inventive: false, formal: null, noveltyDoc: null, inventiveDocs: [] });
});

test('AC7 Uendret leaves docs out that no longer exist at all', () => {
  need(M.applyClaimChange, 'applyClaimChange');
  const docs = DOCS().filter((d) => d.id !== 'D2');
  const res = M.applyClaimChange(claim(2), map(1, [2], { change: 'uendret' }), R1(), docs);
  eq(res.claim.inventiveDocs, ['D1']);
});

test('AC7 copying identical values is not «lost»', () => {
  const res = apply(claim(4, { novelty: true, inventive: true }), map(1, [4], { change: 'uendret' }));
  eq(verdicts(res.claim), { novelty: true, inventive: true, formal: null, noveltyDoc: null, inventiveDocs: [] });
  assert.strictEqual(res.lost, false);
});

test('AC7 changing the origin while Uendret copies from the new origin', () => {
  const c = claim(1, { mapping: map(1, [5], { change: 'uendret' }), novelty: true, inventive: true });
  const res = apply(c, map(1, [1], { change: 'uendret' }));
  eq(verdicts(res.claim), { novelty: false, inventive: false, formal: true, noveltyDoc: 'D1', inventiveDocs: [] });
  assert.strictEqual(res.lost, true);
});

test('AC7 Endret (single) -> Uendret copies', () => {
  const c = claim(1, { mapping: map(1, [4], { change: 'endret' }) });
  const res = apply(c, map(1, [4], { change: 'uendret' }));
  eq(verdicts(res.claim), { novelty: true, inventive: true, formal: null, noveltyDoc: null, inventiveDocs: [] });
});

test('AC7 Uendret -> Endret clears', () => {
  const c = claim(1, { mapping: map(1, [4], { change: 'uendret' }), novelty: true, inventive: true });
  const res = apply(c, map(1, [4], { change: 'endret' }));
  eq(verdicts(res.claim), CLEARED);
  assert.strictEqual(res.lost, true);
});

test('AC7 Endret <-> Ny keeps verdicts', () => {
  const v = { novelty: true, inventive: false, formal: false, noveltyDoc: null, inventiveDocs: ['D1'] };
  let res = apply(claim(1, Object.assign({ mapping: map(1, [4]) }, v)), map(1, []));
  eq(verdicts(res.claim), v);
  assert.strictEqual(res.lost, false);
  assert.strictEqual(changeOf(res.claim), 'ny');
  res = apply(claim(1, Object.assign({ mapping: map(1, [], { change: 'ny' }) }, v)), map(1, [4]));
  eq(verdicts(res.claim), v);
  assert.strictEqual(res.lost, false);
  assert.strictEqual(changeOf(res.claim), 'endret');
});

test('AC7 editing a merged origin keeps verdicts', () => {
  const v = { novelty: false, inventive: false, formal: null, noveltyDoc: 'D2', inventiveDocs: [] };
  const res = apply(claim(1, Object.assign({ mapping: map(1, [1, 4]) }, v)), map(1, [1, 4, 5]));
  eq(verdicts(res.claim), v);
  eq(res.claim.mapping.origin, [1, 4, 5]);
  assert.strictEqual(res.lost, false);
});

test('AC7/AC9 § 13 and basis edits keep verdicts and are stored', () => {
  const v = { novelty: true, inventive: null, formal: null, noveltyDoc: null, inventiveDocs: [] };
  const res = apply(claim(1, Object.assign({ mapping: map(1, [1, 4]) }, v)),
    map(1, [1, 4], { p13: false, basis: 'Beskr. s. 7' }));
  eq(verdicts(res.claim), v);
  assert.strictEqual(res.claim.mapping.p13, false);
  assert.strictEqual(res.claim.mapping.basis, 'Beskr. s. 7');
  assert.strictEqual(res.lost, false);
});

test('AC9 setting Uendret keeps p13 and basis stored', () => {
  const c = claim(1, { mapping: map(1, [4], { p13: true, basis: 's. 2' }) });
  const res = apply(c, map(1, [4], { change: 'uendret', p13: true, basis: 's. 2' }));
  assert.strictEqual(res.claim.mapping.p13, true);
  assert.strictEqual(res.claim.mapping.basis, 's. 2');
});

test('AC7 next = null removes the mapping and keeps verdicts', () => {
  const v = { novelty: true, inventive: true, formal: null, noveltyDoc: null, inventiveDocs: [] };
  const c = claim(1, Object.assign({ mapping: map(1, [4], { change: 'uendret' }) }, v));
  const res = apply(c, null);
  assert.ok(!res.claim.mapping, 'mapping removed');
  eq(verdicts(res.claim), v);
  assert.strictEqual(res.lost, false);
  untouched(c, res.claim);
});

test('AC7 a stale mapping (previous round) counts as unmapped: Uendret copies', () => {
  const c = claim(1, { mapping: map(2, [4], { change: 'endret' }), novelty: false });
  const res = apply(c, map(1, [4], { change: 'uendret' }));
  eq(verdicts(res.claim), { novelty: true, inventive: true, formal: null, noveltyDoc: null, inventiveDocs: [] });
});

test('AC7 the stored mapping is normalised (no unknown keys)', () => {
  const res = apply(claim(1), Object.assign(map(1, [4, 1, 4]), { evil: 1 }));
  eq(res.claim.mapping.origin, [1, 4]);
  assert.ok(!('evil' in res.claim.mapping));
});

// ── claimOriginHint (AC8) ──────────────────────────────────────────────────
function hint(mapping, r, docs) {
  need(M.claimOriginHint, 'claimOriginHint');
  return M.claimOriginHint(claim(1, mapping === undefined ? {} : { mapping }), r || R1(), docs || DOCS());
}

test('AC8 unmapped and stale -> «← ?»', () => {
  assert.strictEqual(hint(undefined), '← ?');
  assert.strictEqual(hint(map(2, [1])), '← ?');
  assert.strictEqual(hint(map(1, [9])), '← ?', 'origin out of range is not a mapping');
});

test('AC8 new -> «Ny»', () => {
  assert.strictEqual(hint(map(1, [])), 'Ny');
});

test('AC8 one origin: «←5 Uendret · R1 N✓ O✓» (effective values)', () => {
  assert.strictEqual(hint(map(1, [5], { change: 'uendret' })), '←5 Uendret · R1 N✓ O✓');
  assert.strictEqual(hint(map(1, [5])), '←5 Endret · R1 N✓ O✓');
  assert.strictEqual(hint(map(1, [4], { change: 'endret' })), '←4 Endret · R1 N✓ O✓');
});

test('AC8 merged: «←1+4 Endret · R1: 1 N✗ O✗ D1 · 4 N✓ O✓»', () => {
  assert.strictEqual(hint(map(1, [1, 4])), '←1+4 Endret · R1: 1 N✗ O✗ D1 · 4 N✓ O✓');
  assert.strictEqual(hint(map(1, [4, 1], { change: 'uendret' })), '←1+4 Endret · R1: 1 N✗ O✗ D1 · 4 N✓ O✓');
});

test('AC8 docs joined with «+»; novelty lock shown as O✗', () => {
  assert.strictEqual(hint(map(1, [2])), '←2 Endret · R1 N✓ O✗ D1+D2');
});

test('AC8 withdrawn doc -> «D3 (trukket)»', () => {
  assert.strictEqual(hint(map(1, [3])), '←3 Endret · R1 N✗ O✗ D3 (trukket)');
  const docs = DOCS().filter((d) => d.id !== 'D2');
  assert.strictEqual(hint(map(1, [2]), null, docs), '←2 Endret · R1 N✓ O✗ D1+D2 (trukket)', 'missing doc too');
});

test('AC8 unassessed claim shows – and round number follows R(n)', () => {
  const r2 = round(2, [claim(1), claim(2, { dep: null, novelty: true })]);
  assert.strictEqual(hint(map(2, [1]), r2), '←1 Endret · R2 – –');
  assert.strictEqual(hint(map(2, [1, 2]), r2), '←1+2 Endret · R2: 1 – – · 2 N✓ –');
});

test('AC8 hint is plain text and does not mutate inputs', () => {
  need(M.claimOriginHint, 'claimOriginHint');
  const c = claim(1, { mapping: map(1, [1, 4]) });
  const r = R1();
  const d = DOCS();
  const snap = JSON.stringify([c, r, d]);
  const s = M.claimOriginHint(c, r, d);
  assert.strictEqual(typeof s, 'string');
  assert.doesNotMatch(s, /[<>&]/);
  assert.strictEqual(JSON.stringify([c, r, d]), snap);
});

// ── deletedClaims (AC12) ───────────────────────────────────────────────────
const R10 = () => round(1, Array.from({ length: 10 }, (_, i) => claim(i + 1)));

test('AC12 deletedClaims: R1 10 claims, origins {1,4,5..10} -> [2, 3]', () => {
  need(M.deletedClaims, 'deletedClaims');
  const cur = [
    claim(1, { mapping: map(1, [1, 4]) }),
    claim(2, { mapping: map(1, [5]) }),
    claim(3, { mapping: map(1, [6, 7, 8]) }),
    claim(4, { mapping: map(1, [10, 9], { change: 'uendret' }) }),
    claim(5, { mapping: map(1, []) }),
    claim(6, { mapping: map(2, [2]) }),  // stale: does not count
    claim(7, { mapping: map(1, [3, 11]) }), // invalid (11 > 10): does not count
    claim(8)
  ];
  const before = JSON.stringify(cur);
  eq(M.deletedClaims(R10(), cur), [2, 3]);
  assert.strictEqual(JSON.stringify(cur), before);
});

test('AC12 deletedClaims: nothing mapped -> every R(n) claim', () => {
  need(M.deletedClaims, 'deletedClaims');
  eq(M.deletedClaims(R10(), [claim(1), claim(2)]), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  eq(M.deletedClaims(R10(), []), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

// ── normalizeClaim / snapshots (2A shapes, AC11) ───────────────────────────
const KEYS_2A = ['num', 'novelty', 'inventive', 'formal', 'independent', 'dep', 'depManual', 'label', 'noveltyDoc', 'inventiveDocs'];

test('normalizeClaim without a mapping keeps the 2A shape byte-identical', () => {
  const c = M.normalizeClaim(claim(2, { novelty: true, inventive: false, inventiveDocs: ['D1'], label: 'A' }), 1);
  eq(Object.keys(c), KEYS_2A);
  assert.strictEqual(JSON.stringify(c),
    '{"num":2,"novelty":true,"inventive":false,"formal":null,"independent":false,"dep":1,"depManual":false,' +
    '"label":"A","noveltyDoc":null,"inventiveDocs":["D1"]}');
  for (const bad of [null, 'x', [], { round: 0, origin: [1] }, { round: 1, origin: 'x' }]) {
    eq(Object.keys(M.normalizeClaim(claim(1, { mapping: bad }), 0)), KEYS_2A, 'invalid mapping omitted: ' + JSON.stringify(bad));
  }
});

test('normalizeClaim includes a valid mapping (normalised)', () => {
  const c = M.normalizeClaim(claim(1, { mapping: Object.assign(map(1, [4, 1], { change: 'endret', p13: true, basis: ' s. 1 ' }), { x: 1 }) }), 0);
  eq(Object.keys(c), KEYS_2A.concat(['mapping']));
  eq(c.mapping, { round: 1, origin: [1, 4], change: 'endret', p13: true, basis: 's. 1' });
});

test('AC11 normalizeRounds keeps mappings on frozen claims', () => {
  const out = M.normalizeRounds([round(1, [claim(1, { mapping: map(1, [2]) }), claim(2, { mapping: 'junk' })])]);
  eq(out[0].claims[0].mapping, { round: 1, origin: [2], change: null, p13: null, basis: '' });
  assert.ok(!('mapping' in out[0].claims[1]));
});

test('AC11 «Brev sendt» freezes each claim\'s mapping into R(n+1); next «Svar mottatt» makes it stale', () => {
  const sd = { numClaims: 2, docs: DOCS(), claims: [
    claim(1, { mapping: map(1, [1, 4], { p13: true, basis: 's. 3' }), notes: 'privat' }),
    claim(2)
  ] };
  let rounds = M.roundsAfterTransition([R1()], { from: 'viderebehandling', to: 'fristarkiv', isOppdrag: false,
    lettersAfter: 2, sakData: sd, today: '2026-11-04', deadline: '2027-02-04', response: null });
  assert.strictEqual(rounds.length, 2);
  eq(rounds[1].claims[0].mapping, { round: 1, origin: [1, 4], change: null, p13: true, basis: 's. 3' });
  assert.ok(!('mapping' in rounds[1].claims[1]));
  assert.ok(!('notes' in rounds[1].claims[0]), 'whitelist still applies');
  rounds = M.roundsAfterTransition(rounds, { from: 'fristarkiv', to: 'viderebehandling', isOppdrag: false,
    lettersAfter: 2, sakData: sd, today: '2026-12-01', deadline: null, response: { received: '2026-11-30', changes: ['claims'] } });
  const r2 = rounds[1];
  assert.strictEqual(M.claimMapping(sd.claims[0], r2), null, 'round mismatch: stops counting');
  assert.ok(sd.claims[0].mapping, 'nothing deleted');
  assert.strictEqual(M.claimOriginHint(sd.claims[0], r2, DOCS()), '← ?');
});

// ── AC10 claim count ───────────────────────────────────────────────────────
test('AC10 claim count 8 -> 6 drops mappings on 7-8; rising again leaves new claims unmapped', () => {
  const data = { numClaims: 8, claims: Array.from({ length: 8 }, (_, i) => claim(i + 1, { mapping: map(1, [i + 1]) })) };
  data.numClaims = 6;
  M.ensureClaims(data);
  assert.strictEqual(data.claims.length, 6);
  assert.ok(data.claims.every((c) => c.mapping));
  data.numClaims = 8;
  M.ensureClaims(data);
  assert.ok(!data.claims[6].mapping && !data.claims[7].mapping);
});

// ── AC13 import ────────────────────────────────────────────────────────────
function sakData(claims, rounds) {
  return { numClaims: claims.length, filingDate: '', priorityDate: '', checklist: {}, classes: [], docs: DOCS(), claims, rounds: rounds || [] };
}

test('AC13 normalizeImportSakDetails normalises mappings on live claims, nothing else', () => {
  const raw = JSON.parse(JSON.stringify(sakData([
    claim(1, { notes: 'beholdes', extra2A: 'x', mapping: Object.assign(map(1, [4, 1, 1000, 'x'], { change: 'feil', basis: 'y'.repeat(250) }), { evil: 1 }) }),
    claim(2, { mapping: 'junk' }),
    claim(3, { mapping: { round: 1, origin: 'ny' } }),
    claim(4)
  ], [round(1, [claim(1, { mapping: map(1, [2], { change: 'uendret' }) })])])));
  const copy = JSON.stringify(raw);
  const out = M.normalizeImportSakDetails(raw);
  assert.strictEqual(JSON.stringify(raw), copy, 'input not mutated');
  const c = out.claims;
  eq(c[0].mapping, { round: 1, origin: [1, 4], change: null, p13: null, basis: 'y'.repeat(200) });
  assert.strictEqual(c[0].notes, 'beholdes', 'live claims are not whitelisted (notes kept)');
  assert.strictEqual(c[0].extra2A, 'x', 'nothing else on live claims changes');
  assert.ok(!('mapping' in c[1]), 'invalid mapping deleted');
  assert.ok(!('mapping' in c[2]));
  eq(c[3], plain(raw.claims[3]));
  eq(out.rounds[0].claims[0].mapping, { round: 1, origin: [2], change: 'uendret', p13: null, basis: '' });
});

test('AC13 __proto__ inside a live mapping is dropped', () => {
  const raw = JSON.parse('{"numClaims":1,"claims":[{"num":1,"novelty":null,"inventive":null,"formal":null,"notes":"",' +
    '"mapping":{"round":1,"origin":[1],"change":"endret","p13":true,"basis":"","__proto__":{"polluted":true}}}],"rounds":[]}');
  const m = M.normalizeImportSakDetails(raw).claims[0].mapping;
  eq(Object.keys(m).sort(), ['basis', 'change', 'origin', 'p13', 'round']);
  assert.strictEqual(m.polluted, undefined);
  assert.strictEqual({}.polluted, undefined);
});

test('AC13 a 4.53.0 file without mappings imports unchanged', () => {
  const raw = JSON.parse(JSON.stringify(sakData([
    claim(1, { novelty: false, inventive: false, noveltyDoc: 'D1', notes: 'n1', label: 'L' }),
    claim(2, { novelty: true, inventive: true })
  ], [round(1, [claim(1, { novelty: false, inventive: false }), claim(2)].map((x) => M.normalizeClaim(x, 0)))])));
  const out = M.normalizeImportSakDetails(raw);
  eq(out.claims, plain(raw.claims));
  assert.ok(out.claims.every((c) => !('mapping' in c)));
  eq(out.rounds, plain(raw.rounds));
});

test('AC13 prepareImportData keeps valid mappings (file, backup, workfile path)', () => {
  const data = {
    cases: [{ id: 'abc', caseNumber: 'P-1', dueDate: '2026-12-01', title: 'T', status: 'viderebehandling' }],
    sakDetails: { abc: sakData([claim(1, { mapping: map(1, [2], { basis: 'ok' }) }), claim(2, { mapping: 7 })],
      [round(1, [claim(1), claim(2)])]) }
  };
  const res = M.prepareImportData(JSON.parse(JSON.stringify(data)));
  const cl = res.data.sakDetails.abc.claims;
  eq(cl[0].mapping, { round: 1, origin: [2], change: null, p13: null, basis: 'ok' });
  assert.ok(!('mapping' in cl[1]));
  assert.ok(!/mapping/.test(JSON.stringify(res.data.cases)), 'mapping never in cases[]');
});

// ── Wiring ─────────────────────────────────────────────────────────────────
test('wiring: the reducer (_dispatch, wrapped by dispatch) handles CLAIM_MAPPING_CHANGE through mappingRound + applyClaimChange', () => {
  const src = extractFunctionSource(HTML, '_dispatch');
  assert.match(src, /case\s+'CLAIM_MAPPING_CHANGE'/);
  const i = src.indexOf("'CLAIM_MAPPING_CHANGE'");
  const body = src.slice(i, i + 3000);
  assert.match(body, /applyClaimChange\s*\(/);
  assert.match(body, /mappingRound\s*\(/);
});
