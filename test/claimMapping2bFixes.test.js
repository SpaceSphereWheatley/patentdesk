'use strict';
// Kravkobling 2B fix round (B1): imported live claims get num/dep coerced, and
// the 2B sub-row markup never interpolates a raw claim or round number.
// Written by QA before the builder.
//
// normalizeImportSakDetails(sd): each live claim (plain object) is a shallow
//   copy where `num` is a positive integer (else i + 1, as normalizeClaim does)
//   and `dep` is a positive integer or null; `mapping` normalised as before;
//   every other key is exactly as in the file.
// claimMappingRowHtml(data, c, round, m, stateCls, verdictCls): every claim
//   number / round number goes through esc() or Number().

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractFunctionSource } = require('./extractFunctions');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'PatentDesk.html'), 'utf8');

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
    if (!src) continue;
    chunks.push(src);
    (src.match(/[A-Za-z_$][\w$]*/g) || []).forEach((id) => { if (!seen.has(id)) queue.push(id); });
  }
  const sandbox = Object.assign({}, globals);
  vm.createContext(sandbox);
  chunks.sort((a, b) => (a.startsWith('function') ? 0 : 1) - (b.startsWith('function') ? 0 : 1));
  chunks.forEach((src) => { try { vm.runInContext(src, sandbox); } catch (e) { /* DOM-bound var */ } });
  const out = { __sandbox: sandbox };
  names.forEach((n) => { out[n] = vm.runInContext('typeof ' + n + ' === "undefined" ? undefined : ' + n, sandbox); });
  return out;
}

const plain = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const eq = (actual, expected, msg) => assert.deepStrictEqual(plain(actual), expected, msg);

const M = load(['normalizeImportSakDetails', 'claimMappingRowHtml', 'normalizeClaim'],
  { globals: { isNonWorkday: () => false } });

const EVIL = '1"><img src=x onerror=alert(1)>';
function claim(num, over) {
  return Object.assign({
    num, novelty: null, inventive: null, formal: null, notes: '', independent: num === 1,
    dep: num === 1 ? null : 1, depManual: false, label: '', noveltyDoc: null, inventiveDocs: []
  }, over || {});
}
const sak = (claims) => ({ numClaims: claims.length, filingDate: '', priorityDate: '', checklist: {}, classes: [],
  docs: [], claims, rounds: [] });

// ── B1 import coercion ─────────────────────────────────────────────────────
test('B1 import: a non-numeric / invalid num becomes i + 1; a valid num is kept', () => {
  const raw = plain(sak([
    claim(EVIL), claim(2.5), claim(0), claim(-3), claim('5'), claim(null), claim(7)
  ]));
  delete raw.claims[5].num; // missing num
  raw.claims.push(claim(true));
  const out = M.normalizeImportSakDetails(raw);
  eq(out.claims.map((c) => c.num), [1, 2, 3, 4, 5, 6, 7, 8]);
  out.claims.forEach((c) => assert.strictEqual(typeof c.num, 'number'));
});

test('B1 import: dep becomes a positive integer or null', () => {
  const deps = [null, EVIL, 0, -1, 1.5, 'abc', '1', {}, [1], 1, 2];
  const raw = plain(sak(deps.map((d, i) => claim(i + 1, { dep: d }))));
  const out = M.normalizeImportSakDetails(raw);
  eq(out.claims.map((c) => c.dep), [null, null, null, null, null, null, null, null, null, 1, 2]);
});

test('B1 import: the rest of each live claim is untouched', () => {
  const raw = plain(sak([
    claim(EVIL, { notes: 'beholdes', label: 'Apparat', novelty: false, inventive: false, noveltyDoc: 'D1',
      inventiveDocs: ['D2'], formal: true, depManual: true, extra2A: { a: 1 }, dep: EVIL }),
    claim(2, { notes: 'n2', label: 'L2', novelty: true, inventive: true })
  ]));
  const before = JSON.stringify(raw);
  const out = M.normalizeImportSakDetails(raw);
  assert.strictEqual(JSON.stringify(raw), before, 'input not mutated');
  const expected0 = plain(raw.claims[0]);
  expected0.num = 1; expected0.dep = null;
  eq(out.claims[0], expected0, 'only num/dep changed');
  eq(Object.keys(out.claims[0]), Object.keys(raw.claims[0]), 'same keys, same order');
  eq(out.claims[1], plain(raw.claims[1]), 'a valid claim is byte-identical');
  assert.notStrictEqual(out.claims[1], raw.claims[1], 'still a copy');
});

test('B1 import: mapping is still normalised alongside the coercion', () => {
  const raw = plain(sak([claim(EVIL, { mapping: { round: 1, origin: [2, 1, 1], change: 'feil', p13: true, basis: 'b', x: 1 } })]));
  const c = M.normalizeImportSakDetails(raw).claims[0];
  assert.strictEqual(c.num, 1);
  eq(c.mapping, { round: 1, origin: [1, 2], change: null, p13: true, basis: 'b' });
});

// ── B1 markup: no raw number interpolation in the 2B sub-row ───────────────
function rowHtml(c, round, m, editing) {
  vm.runInContext('_kmEditingOrigin = ' + JSON.stringify(editing || null) + ';', M.__sandbox);
  try { return M.claimMappingRowHtml({ docs: [], claims: [c] }, c, round, m, 'km-unset', ''); }
  finally { vm.runInContext('_kmEditingOrigin = null;', M.__sandbox); }
}
const R = (n) => ({ n, letter: { date: '2026-06-01', deadline: '2026-09-01' }, response: { date: '2026-08-20', changes: ['claims'] },
  claims: [claim(1), claim(2)], docIds: [] });

test('B1 claimMappingRowHtml escapes a crafted claim number and round number (all three states)', () => {
  assert.strictEqual(typeof M.claimMappingRowHtml, 'function');
  const c = claim(EVIL);
  const round = R(EVIL);
  const variants = [
    ['unmapped', rowHtml(c, round, null)],
    ['mapped single', rowHtml(c, round, { round: 1, origin: [1], change: 'endret', p13: null, basis: '' })],
    ['mapped merged', rowHtml(c, round, { round: 1, origin: [1, 2], change: 'endret', p13: true, basis: '' })],
    ['ny', rowHtml(c, round, { round: 1, origin: [], change: 'ny', p13: null, basis: '' })],
    ['editing with error', rowHtml(c, round, null, { num: EVIL, value: 'x', error: 'feil' })]
  ];
  for (const [name, html] of variants) {
    assert.ok(!/<img/i.test(html), name + ': no raw <img>: ' + html);
    assert.ok(!html.includes('1"><'), name + ': no attribute break-out');
  }
});

test('B1 claimMappingRowHtml still renders plain numbers unchanged', () => {
  const html = rowHtml(claim(3), R(1), { round: 1, origin: [1], change: 'endret', p13: null, basis: '' });
  assert.match(html, /data-claim-origin="3"/);
  assert.match(html, /data-claim-change="3"/);
  assert.match(html, /data-claim-p13="3"/);
  assert.match(html, /data-claim-basis="3"/);
  const unset = rowHtml(claim(3), R(1), null);
  assert.match(unset, /brev 1 dette kom fra/);
});
