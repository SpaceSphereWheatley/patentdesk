'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadFunctions } = require('./extractFunctions');
const { scanDrawn, dynamicKeys } = require('./usageScan');

const F = loadFunctions(
  ['_usageBadKey', 'usageWithRegistry', 'usageIsLossless', 'usageFeatureKey', 'usageNormalizeLog', 'usageMerge', 'usageBump', 'usageRangeStart', 'usageSummarize', 'usageIsEmpty'],
  { vars: ['USAGE_STATIC_SEL', 'USAGE_DYNAMIC_FEATURES'] }
);
const plain = (x) => JSON.parse(JSON.stringify(x));
const el = (o) => Object.assign({ id: '', dataset: {} }, o);

test('usageFeatureKey: data-feature wins, then id, then data attributes', () => {
  assert.strictEqual(F.usageFeatureKey(el({ id: 'btn-x', dataset: { feature: 'custom' } })), 'custom');
  assert.strictEqual(F.usageFeatureKey(el({ id: 'btn-export' })), 'btn-export');
  assert.strictEqual(F.usageFeatureKey(el({ dataset: { page: 'hjem' } })), 'page:hjem');
  assert.strictEqual(F.usageFeatureKey(el({ dataset: { settingsTab: 'data' } })), 'tab:data');
  assert.strictEqual(F.usageFeatureKey(el({ dataset: { sakSection: 'krav' } })), 'section:krav');
  assert.strictEqual(F.usageFeatureKey(el({ dataset: { gotoSettingsTab: 'data' } })), 'goto-tab:data');
  assert.strictEqual(F.usageFeatureKey(el({ dataset: { anchor: 'vurdering' } })), 'anchor:vurdering');
  assert.strictEqual(F.usageFeatureKey(el({ dataset: { status: 'ny' } })), 'status:ny');
  assert.strictEqual(F.usageFeatureKey(el({ dataset: { kind: 'ny', when: 'overdue' } })), 'filter:ny:overdue');
  assert.strictEqual(F.usageFeatureKey(el({ type: 'radio', name: 'status', value: 'ny' })), 'radio:status:ny');
  assert.strictEqual(F.usageFeatureKey(el({ dataset: { mhView: 'full' } })), null); // unknown data values are never used
  assert.strictEqual(F.usageFeatureKey(el({ dataset: { tooltip: 'Hjelp' } })), null);
  assert.strictEqual(F.usageFeatureKey(el({})), null);
  assert.strictEqual(F.usageFeatureKey(null), null);
});

test('usageBump: counts per day and feature, records the app version once', () => {
  const d = { v: 1, days: {}, versions: {} };
  F.usageBump(d, '2026-11-13', 'btn-a', 'v4.68.0');
  F.usageBump(d, '2026-11-13', 'btn-a', 'v4.68.0');
  F.usageBump(d, '2026-11-14', 'btn-b', 'v4.69.0');
  assert.deepStrictEqual(plain(d.days), { '2026-11-13': { 'btn-a': 2 }, '2026-11-14': { 'btn-b': 1 } });
  assert.deepStrictEqual(plain(d.versions), { 'v4.68.0': '2026-11-13', 'v4.69.0': '2026-11-14' });
});

test('usageMerge: sums counts, keeps earliest version date, does not mutate inputs', () => {
  const a = { v: 1, days: { '2026-11-13': { x: 2 } }, versions: { 'v1': '2026-11-01' } };
  const b = { v: 1, days: { '2026-11-13': { x: 1, y: 4 }, '2026-11-14': { x: 1 } }, versions: { 'v1': '2026-11-05', 'v2': '2026-11-14' } };
  const m = F.usageMerge(a, b);
  assert.deepStrictEqual(plain(m.days), { '2026-11-13': { x: 3, y: 4 }, '2026-11-14': { x: 1 } });
  assert.deepStrictEqual(plain(m.versions), { v1: '2026-11-01', v2: '2026-11-14' });
  assert.deepStrictEqual(plain(a.days), { '2026-11-13': { x: 2 } });
});

test('usageNormalizeLog: accepts valid logs, rejects corrupt ones, drops bad entries', () => {
  assert.strictEqual(F.usageNormalizeLog(null), null);
  assert.strictEqual(F.usageNormalizeLog('x'), null);
  assert.strictEqual(F.usageNormalizeLog([]), null);
  assert.strictEqual(F.usageNormalizeLog({ days: [] }), null);
  const ok = F.usageNormalizeLog({ v: 1, days: { '2026-11-13': { a: 2, b: -1, c: 'x', d: 1.5 }, 'not-a-date': { a: 1 } } });
  assert.deepStrictEqual(plain(ok.days), { '2026-11-13': { a: 2 } });
  assert.deepStrictEqual(plain(ok.versions), {});
});

test('usageIsEmpty', () => {
  assert.strictEqual(F.usageIsEmpty({ v: 1, days: {}, versions: {} }), true);
  assert.strictEqual(F.usageIsEmpty({ v: 1, days: { '2026-11-13': { a: 1 } }, versions: {} }), false);
});

test('usageRangeStart: inclusive windows ending today; all = no limit', () => {
  assert.strictEqual(F.usageRangeStart('2026-11-13', '7'), '2026-11-07');
  assert.strictEqual(F.usageRangeStart('2026-11-13', '30'), '2026-10-15');
  assert.strictEqual(F.usageRangeStart('2026-11-13', '90'), '2026-08-16');
  assert.strictEqual(F.usageRangeStart('2026-11-13', 'all'), '');
  assert.strictEqual(F.usageRangeStart('2026-03-02', '7'), '2026-02-24'); // across month end
});

const LOG = { v: 1, versions: {}, days: {
  '2026-11-13': { open: 5, exp: 1 },
  '2026-11-07': { open: 2 },      // first day of the 7-day window
  '2026-11-06': { old: 9 },       // one day outside it
  '2026-08-01': { ancient: 1 },
} };

test('usageSummarize: used ranked by count with last date, window boundaries inclusive', () => {
  const s = F.usageSummarize(LOG, ['open', 'exp', 'old', 'ancient', 'never1'], '2026-11-13', '7');
  assert.deepStrictEqual(plain(s.used), [{ id: 'open', count: 7, last: '2026-11-13' }, { id: 'exp', count: 1, last: '2026-11-13' }]);
});

test('usageSummarize: idle = used before the window; never = never logged at all', () => {
  const s = F.usageSummarize(LOG, ['open', 'exp', 'old', 'ancient', 'never1'], '2026-11-13', '7');
  assert.deepStrictEqual(plain(s.idle), [{ id: 'old', last: '2026-11-06' }, { id: 'ancient', last: '2026-08-01' }]);
  assert.deepStrictEqual(plain(s.never), ['never1']);
});

test('usageSummarize: all time has no idle features; ids only in the log still count as used', () => {
  const s = F.usageSummarize(LOG, ['open'], '2026-11-13', 'all');
  assert.deepStrictEqual(plain(s.used.map((u) => u.id)), ['old', 'open', 'ancient', 'exp']);
  assert.deepStrictEqual(plain(s.idle), []);
  assert.deepStrictEqual(plain(s.never), []);
});

test('usageSummarize: empty log lists every known feature as never used', () => {
  const s = F.usageSummarize({ v: 1, days: {}, versions: {} }, ['b', 'a'], '2026-11-13', '30');
  assert.deepStrictEqual(plain(s.used), []);
  assert.deepStrictEqual(plain(s.never), ['a', 'b']);
});

// AC6: dynamically drawn buttons carry case data in data-attributes. None of
// it may end up in a feature key.
test('usageFeatureKey never uses data-attribute values from dynamic buttons', () => {
  const cases = [
    el({ className: 'btn-card-more', dataset: { id: 'case-9f3a' } }),
    el({ className: 'card-dropdown-item btn-medl-send', dataset: { id: 'case-9f3a' } }),
    el({ className: 'btn-copy-path', dataset: { cn: '20241234' } }),
    el({ className: 'x', dataset: { citedOpen: 'case-9f3a' } }),
    el({ className: 'x', dataset: { docId: 'd1', idx: '4' } }),
    el({ className: 'medl-out-case', dataset: { id: 'case-9f3a' } }),
  ];
  const keys = cases.map((c) => F.usageFeatureKey(c));
  assert.deepStrictEqual(keys, ['class:btn-card-more', 'class:btn-medl-send', 'class:btn-copy-path', null, null, null]);
  keys.forEach((k) => assert.ok(!k || !/case-9f3a|20241234|d1/.test(k)));
});

test('reserved keys (constructor, __proto__ …) are never counted', () => {
  const d = { v: 1, days: {}, versions: {} };
  F.usageBump(d, '2026-11-13', 'constructor', 'v1');
  F.usageBump(d, '2026-11-13', '__proto__', 'v1');
  F.usageBump(d, '2026-11-13', 'ok', 'toString');
  assert.deepStrictEqual(plain(d.days), { '2026-11-13': { ok: 1 } });
  assert.deepStrictEqual(plain(d.versions), {});
  const n = F.usageNormalizeLog(JSON.parse('{"v":1,"days":{"2026-11-13":{"constructor":2,"__proto__":3,"a":1}}}'));
  assert.deepStrictEqual(plain(n.days), { '2026-11-13': { a: 1 } });
  const s = F.usageSummarize({ v: 1, days: {}, versions: {} }, ['constructor', 'a'], '2026-11-13', '7');
  assert.deepStrictEqual(plain(s.never), ['a']);
});

test('usageIsLossless: only a clean v1 file survives untouched', () => {
  assert.strictEqual(F.usageIsLossless({ v: 1, days: { '2026-11-13': { a: 1 } }, versions: { v1: '2026-11-13' } }), true);
  assert.strictEqual(F.usageIsLossless({ v: 2, days: {}, versions: {} }), false);
  assert.strictEqual(F.usageIsLossless({ v: 1, days: {}, versions: {}, extra: 1 }), false);
  assert.strictEqual(F.usageIsLossless({ v: 1, days: { '2026-11-13': { a: 1, b: -2 } } }), false);
  assert.strictEqual(F.usageIsLossless({ v: 1, days: { 'bad': { a: 1 } } }), false);
});

// Every interactive element in the static markup must have a derivable
// feature ID, so a new button can't silently escape the usage view.
test('static markup: every interactive element has a feature key', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
  const tagRe = /<(button|a|select|summary|input)\b([^>]*)>/g;
  const missing = [];
  let m;
  while ((m = tagRe.exec(html))) {
    const attrs = m[2];
    if (m[1] === 'input' && !/type="(checkbox|radio|button|submit)"/.test(attrs)) continue;
    if (m[1] === 'a' && !/href=/.test(attrs)) continue;
    const dataset = {};
    const id = (/\sid="([^"]+)"/.exec(' ' + attrs) || [])[1] || '';
    const attrRe = /\sdata-([a-z-]+)="([^"]*)"/g;
    let a;
    while ((a = attrRe.exec(' ' + attrs))) dataset[a[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = a[2];
    const name = (/\sname="([^"]*)"/.exec(' ' + attrs) || [])[1];
    const value = (/\svalue="([^"]*)"/.exec(' ' + attrs) || [])[1];
    const type = (/\stype="([^"]*)"/.exec(' ' + attrs) || [])[1];
    const className = (/\sclass="([^"]*)"/.exec(' ' + attrs) || [])[1] || '';
    if (!F.usageFeatureKey({ id, dataset, name, value, type, className })) missing.push(m[0].slice(0, 90));
  }
  assert.deepStrictEqual(missing, []);
});

// ── The list of drawn features ("Aldri brukt" for buttons the DOM lacks) ──
// These two tests keep the list honest: a new drawn button must get a name,
// and the list must match the code. Fix a failure by editing the code or
// USAGE_DYNAMIC_FEATURES in src/js/09a-usage-tracker.js.
test('every interactive element drawn by src/js has a feature key', () => {
  const unkeyed = scanDrawn().filter((x) => !x.key).map((x) => x.file + ':' + x.line + ' ' + x.what);
  assert.deepStrictEqual(unkeyed, [], 'Give these elements data-feature="name" (or an id / btn-… class), then list the name in USAGE_DYNAMIC_FEATURES.');
});

test('USAGE_DYNAMIC_FEATURES lists exactly the drawn features that are not in the static markup', () => {
  const listed = Object.keys(F.USAGE_DYNAMIC_FEATURES).sort();
  const found = dynamicKeys();
  assert.deepStrictEqual(found.filter((k) => !listed.includes(k)), [], 'drawn but not listed — add to USAGE_DYNAMIC_FEATURES with a label');
  assert.deepStrictEqual(listed.filter((k) => !found.includes(k)), [], 'listed but no longer drawn — remove from USAGE_DYNAMIC_FEATURES');
  listed.forEach((k) => assert.ok(typeof F.USAGE_DYNAMIC_FEATURES[k] === 'string' && F.USAGE_DYNAMIC_FEATURES[k].trim(), 'label for ' + k));
});

test('usageWithRegistry adds listed features and their names win over DOM text', () => {
  const r = F.usageWithRegistry({ ids: ['a', 'doc-open'], labels: { a: 'A', 'doc-open': '2024-0042' } }, { 'doc-open': 'Dokument: Åpne', 'x-new': 'Ny' });
  assert.deepStrictEqual(plain(r.ids), ['a', 'doc-open', 'x-new']);
  assert.deepStrictEqual(plain(r.labels), { a: 'A', 'doc-open': 'Dokument: Åpne', 'x-new': 'Ny' });
});

test('a drawn feature that was never clicked shows up under never used', () => {
  const ids = F.usageWithRegistry({ ids: ['btn-a'], labels: {} }, F.USAGE_DYNAMIC_FEATURES).ids;
  const s = F.usageSummarize({ v: 1, days: { '2026-11-13': { 'btn-a': 1, 'claim-novelty': 2 } }, versions: {} }, ids, '2026-11-13', '30');
  assert.ok(s.never.includes('claim-formal'));
  assert.ok(!s.never.includes('claim-novelty'));
});
