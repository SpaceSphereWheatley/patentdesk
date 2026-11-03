'use strict';
// Fix round for slice 2A (F1–F7). Written by QA before the builder.
// Browser parts (F4/F5 sidebar toggle, F6 drawer text, F7 Esc with a modal,
// F3 toast) are in test/e2e/rounds2aFixes.e2e.js.
//
// ── Expected signatures (pure unless noted) ───────────────────────────────
//
// F1 prepareImportData(data) -> { data, skipped }   (exists)
//   Every data.sakDetails[id] that is not a plain object (array, string,
//   number, boolean, null) is DELETED from data.sakDetails, so it is never
//   written and the local pt_sak_<id> is kept. Plain objects are normalised
//   as today (normalizeImportSakDetails).
//
// F2 importSakDetailsToWrite(sakDetails, validCases, mode) -> { id: details }
//   NEW helper used by DATA_IMPORT to pick which pt_sak_* to write.
//   sakDetails  data.sakDetails after prepareImportData (may be undefined)
//   validCases  data.cases after validation
//   mode        'merge' | 'replace'
//   merge:   only ids that belong to a case in validCases.
//   replace: every validated case's details are included (today's semantics);
//            ids outside validCases are not pinned by these tests.
//   Never includes a non-plain-object entry. Never mutates its inputs.
//
// F3 saveSakData(id, data) -> boolean   (exists; now returns lsSetSafe's result)
//   applyRoundsTransition(theCase, from, to, patch, respExtra) -> roundsBefore
//   | null   (exists). When the save fails it returns null, so the undo
//   snapshot never carries roundsBefore for an unsaved write. The user toast
//   «Runden kunne ikke lagres …» may be raised here or in the dispatcher;
//   the e2e test checks it.
//
// F4 roundPinAllowed(winWidth, sidebarWidth) -> boolean
//   true iff winWidth - sidebarWidth >= 1060. With no arguments it may read
//   window.innerWidth and the .drawer width itself (the DOM wrapper).
//
// F6 roundIsUnassessed(round) -> boolean
//   true when the round has 0 claims, or every claim has novelty AND
//   inventive step unassessed (null). The drawer then shows a single
//   «Ingen vurdering lagret».

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunctionSource } = require('./extractFunctions');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'PatentDesk.html'), 'utf8');

// ── Loader with automatic dependency resolution (as in rounds.test.js) ────
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
  out.__sandbox = sandbox;
  return out;
}
const plain = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const eq = (actual, expected, msg) => assert.deepStrictEqual(plain(actual), expected, msg);
const fn = (f, name) => { assert.strictEqual(typeof f, 'function', name + ' is not defined'); return f; };

// ── Fixtures ───────────────────────────────────────────────────────────────
function claim(num, over) {
  return Object.assign({
    num, novelty: null, inventive: null, formal: null, notes: '', independent: num === 1,
    dep: num === 1 ? null : 1, depManual: false, label: '', noveltyDoc: null, inventiveDocs: []
  }, over || {});
}
function sakData(over) {
  return Object.assign({
    numClaims: 2, filingDate: '', priorityDate: '', checklist: {}, classes: [],
    docs: [{ id: 'D1', ref: 'WO 2020/1', p: false, e: false, background: false, withdrawn: false }],
    claims: [claim(1, { novelty: true, inventive: true }), claim(2)],
    rounds: []
  }, over || {});
}
function kase(id, over) {
  return Object.assign({ id, caseNumber: 'P-' + id, dueDate: '2026-12-01', title: 'T', status: 'viderebehandling' }, over || {});
}
const H = (from, to, date, extra) => Object.assign({ type: 'status', date: date + 'T10:00:00.000Z', from, to }, extra || {});

// ── F1: non-object sakDetails are dropped at import ────────────────────────
test('F1 prepareImportData drops sakDetails entries that are not plain objects', () => {
  const P = load(['prepareImportData'], { globals: { isNonWorkday: () => false } });
  const ids = ['arr', 'str', 'num', 'nul', 'boo', 'ok'];
  const data = {
    cases: ids.map((id) => kase(id)),
    sakDetails: { arr: [1, 2], str: 'tekst', num: 42, nul: null, boo: true, ok: sakData() }
  };
  const res = fn(P.prepareImportData, 'prepareImportData')(data);
  const sd = res.data.sakDetails;
  for (const id of ['arr', 'str', 'num', 'nul', 'boo']) {
    assert.ok(!Object.prototype.hasOwnProperty.call(sd, id), id + ' must be dropped, got ' + JSON.stringify(sd[id]));
  }
  assert.ok(sd.ok && typeof sd.ok === 'object' && !Array.isArray(sd.ok), 'valid entry kept');
  eq(sd.ok.rounds, [], 'valid entry still normalised');
  eq(sd.ok.claims.length, 2);
});

test('F1 prepareImportData with only invalid sakDetails leaves nothing to write', () => {
  const P = load(['prepareImportData'], { globals: { isNonWorkday: () => false } });
  const res = P.prepareImportData({ cases: [kase('a')], sakDetails: { a: 'x', b: [] } });
  eq(Object.keys(res.data.sakDetails || {}), []);
});

// ── F2: merge import writes details only for validated cases ──────────────
test('F2 importSakDetailsToWrite (merge) keeps only ids of validated cases', () => {
  const F = load(['importSakDetailsToWrite'], { globals: { isNonWorkday: () => false } });
  const pick = fn(F.importSakDetailsToWrite, 'importSakDetailsToWrite');
  const details = { a: sakData(), b: sakData({ numClaims: 9 }), ghost: sakData(), other: sakData() };
  const before = JSON.stringify(details);
  const out = pick(details, [kase('a'), kase('b')], 'merge');
  eq(Object.keys(out).sort(), ['a', 'b']);
  eq(out.b.numClaims, 9);
  assert.strictEqual(JSON.stringify(details), before, 'inputs not mutated');
});

test('F2 importSakDetailsToWrite (merge) with no validated cases writes nothing', () => {
  const F = load(['importSakDetailsToWrite'], { globals: { isNonWorkday: () => false } });
  const pick = fn(F.importSakDetailsToWrite, 'importSakDetailsToWrite');
  eq(Object.keys(pick({ a: sakData(), b: sakData() }, [], 'merge')), []);
});

test('F2 importSakDetailsToWrite (replace) still writes every validated case', () => {
  const F = load(['importSakDetailsToWrite'], { globals: { isNonWorkday: () => false } });
  const pick = fn(F.importSakDetailsToWrite, 'importSakDetailsToWrite');
  const out = pick({ a: sakData(), b: sakData() }, [kase('a'), kase('b')], 'replace');
  assert.ok(out.a && out.b, 'both validated cases written in replace mode');
});

test('F2 importSakDetailsToWrite never returns a non-object entry and tolerates missing sakDetails', () => {
  const F = load(['importSakDetailsToWrite'], { globals: { isNonWorkday: () => false } });
  const pick = fn(F.importSakDetailsToWrite, 'importSakDetailsToWrite');
  const out = pick({ a: 'x', b: [], c: null, d: sakData() }, ['a', 'b', 'c', 'd'].map((id) => kase(id)), 'merge');
  eq(Object.keys(out), ['d']);
  for (const mode of ['merge', 'replace']) {
    eq(Object.keys(pick(undefined, [kase('a')], mode) || {}), [], mode + ': undefined sakDetails');
  }
});

// ── F3: saveSakData reports success; failed round save leaves no undo ─────
test('F3 saveSakData returns true when the write succeeds and false when it fails', () => {
  for (const ok of [true, false]) {
    const writes = [];
    const S = load(['saveSakData'], { globals: {
      lsSetSafe: (k, v) => { writes.push(k); return ok; }, showToast: () => {}, isNonWorkday: () => false
    } });
    const r = fn(S.saveSakData, 'saveSakData')('abc', sakData());
    assert.strictEqual(r, ok, 'lsSetSafe ' + ok + ' -> saveSakData ' + ok);
    assert.strictEqual(writes.length, 1);
  }
});

test('F3 saveSakData still forces inventive=false on claims without novelty', () => {
  let written = null;
  const S = load(['saveSakData'], { globals: {
    lsSetSafe: (k, v) => { written = JSON.parse(v); return true; }, showToast: () => {}, isNonWorkday: () => false
  } });
  S.saveSakData('abc', sakData({ claims: [claim(1, { novelty: false, inventive: true })] }));
  assert.strictEqual(written.claims[0].inventive, false);
});

function transitionHarness(saveOk) {
  const toasts = [];
  const saved = [];
  const A = load(['applyRoundsTransition'], { globals: {
    isNonWorkday: () => false,
    loadSakData: () => sakData(),
    todayStr: () => '2026-11-03',
    saveSakData: (id, d) => { saved.push(id); return saveOk; },
    lsSetSafe: () => saveOk,
    showToast: (m, err) => toasts.push(m)
  } });
  const theCase = kase('abc', { status: 'ny', history: [H(null, 'ny', '2026-03-01')] });
  const patch = { status: 'fristarkiv', dueDate: '2027-02-03',
    history: theCase.history.concat([H('ny', 'fristarkiv', '2026-11-03')]) };
  const r = fn(A.applyRoundsTransition, 'applyRoundsTransition')(theCase, 'ny', 'fristarkiv', patch, null);
  return { r, toasts, saved };
}

test('F3 applyRoundsTransition returns roundsBefore when the round is saved (control)', () => {
  const { r, saved } = transitionHarness(true);
  assert.strictEqual(saved.length, 1);
  eq(r, [], 'roundsBefore = rounds before the letter');
});

test('F3 applyRoundsTransition returns null when saving the round fails', () => {
  const { r, saved } = transitionHarness(false);
  assert.strictEqual(saved.length, 1, 'a save was attempted');
  assert.strictEqual(r, null, 'no roundsBefore for an unsaved write');
});

// ── F4: pin rule ───────────────────────────────────────────────────────────
test('F4 roundPinAllowed(window, sidebar): content beside the sidebar must be >= 1060 px', () => {
  const P = load(['roundPinAllowed'], { globals: { isNonWorkday: () => false } });
  const allowed = fn(P.roundPinAllowed, 'roundPinAllowed');
  const cases = [
    [1320, 260, true], [1280, 260, false], [1180, 48, true], [1100, 48, false],
    [1319, 260, false], [1108, 48, true], [1107, 48, false], [1110, 48, true], [1920, 260, true]
  ];
  for (const [w, s, want] of cases) {
    assert.strictEqual(allowed(w, s), want, w + ' / ' + s + ' -> ' + want);
  }
});

// ── F6: «Ingen vurdering lagret» decision ──────────────────────────────────
test('F6 roundIsUnassessed: 0 claims or every claim N and O unassessed -> true', () => {
  const R = load(['roundIsUnassessed'], { globals: { isNonWorkday: () => false } });
  const un = fn(R.roundIsUnassessed, 'roundIsUnassessed');
  const round = (claims) => ({ n: 1, letter: { date: '2026-06-01', deadline: null }, response: null, claims, docIds: [] });
  assert.strictEqual(un(round([])), true, '0 claims');
  assert.strictEqual(un(round([claim(1), claim(2), claim(3)])), true, 'all – –');
  assert.strictEqual(un(round([claim(1), claim(2, { novelty: true })])), false, 'one novelty set');
  assert.strictEqual(un(round([claim(1), claim(2, { inventive: false })])), false, 'one inventive set');
  assert.strictEqual(un(round([claim(1, { novelty: false, inventive: false })])), false, 'N✗ is an assessment');
  assert.strictEqual(un(round([claim(1, { formal: true, label: 'x', noveltyDoc: 'D1' })])), true,
    'only N/O count, not formal, label or docs');
});
