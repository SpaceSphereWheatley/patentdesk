'use strict';
// Runtime behaviour of the usage tracker (buffer, flush, reset) against a
// fake localStorage and a fake data folder.
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const NAMES = ['_usageBadKey', 'usageIsEmpty', 'usageNormalizeLog', 'usageIsLossless', 'usageMerge', 'usageBump',
  'usageEnabled', '_usageEmpty', '_usageBufRead', '_usageBufWrite', 'usageRecord', 'usageRecordNav', 'usageSetEnabled',
  'usageScheduleFlush', '_usageDirReady', '_usageWithLock', '_usageReadFile', 'usageFlush', '_usageFlushLocked',
  'usageLoadAll', '_usageReset'];
const VARS = ['USAGE_ENABLED_KEY', 'USAGE_BUF_KEY', 'USAGE_INFLIGHT_KEY', 'USAGE_FILE_NAME', '_USAGE_FLUSH_MS', '_usageFlushing', '_usageTimer'];

const TODAY = '2026-11-13';
const BUF = 'pt_usage_buf', INF = 'pt_usage_inflight', FILE = 'usage.json';
const log = (days, versions) => ({ v: 1, days, versions: versions || {} });

function makeDir(files) {
  return {
    perm: 'granted', files: Object.assign({}, files), sub: {}, failWrite: false,
    queryPermission() { return Promise.resolve(this.perm); },
    getDirectoryHandle(name) { return Promise.resolve(this.sub[name] || (this.sub[name] = makeDir())); },
  };
}

function setup(opts) {
  opts = opts || {};
  const store = new Map(Object.entries(opts.ls || {}));
  const toasts = [], timers = [], renders = [];
  const ls = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const dir = opts.dir === undefined ? makeDir() : opts.dir;
  const g = {
    localStorage: ls, todayStr: () => TODAY, APP_VERSION: 'v9.9.9', DAILY_BACKUP_DIR: 'backup',
    showToast: (m) => toasts.push(m), renderUsageView: () => renders.push(1),
    setTimeout: (fn) => { timers.push(fn); return timers.length; },
    _bkDirHandle: dir, _bkFsaSupported: () => true,
    _fsReadText: (d, n) => Promise.resolve(n in d.files ? d.files[n] : null),
    _fsWriteText: (d, n, text) => (d.failWrite ? Promise.reject(new Error('disk')) : (d.files[n] = text, Promise.resolve())),
  };
  const F = loadFunctions(NAMES, { vars: VARS, globals: g });
  const read = (k) => (store.has(k) ? JSON.parse(store.get(k)) : null);
  return { F, store, toasts, timers, renders, dir, read, fileLog: () => (dir && FILE in dir.files ? JSON.parse(dir.files[FILE]) : null) };
}
const on = { ls: { pt_usage_enabled: '1' } };
const plain = (x) => JSON.parse(JSON.stringify(x));

test('AC1: setting off records nothing and creates no buffer or file', async () => {
  const t = setup();
  t.F.usageRecord('btn-x'); t.F.usageRecordNav('hjem');
  assert.strictEqual(t.store.has(BUF), false);
  assert.strictEqual(t.timers.length, 0);
  await t.F.usageFlush();
  assert.strictEqual(FILE in t.dir.files, false);
});

test('AC2/3: on, counts per local day with app version; nav keeps only the page type', () => {
  const t = setup(on);
  t.F.usageRecord('btn-x'); t.F.usageRecord('btn-x'); t.F.usageRecordNav('sak/case-9f3a'); t.F.usageRecordNav('medlesing/abc');
  assert.deepStrictEqual(t.read(BUF), log({ [TODAY]: { 'btn-x': 2, 'page:sak': 1, 'page:medlesing': 1 } }, { 'v9.9.9': TODAY }));
  assert.ok(!t.store.get(BUF).includes('case-9f3a'));
});

test('another tab\'s buffered counts are added to, never overwritten', () => {
  const t = setup({ ls: { pt_usage_enabled: '1', [BUF]: JSON.stringify(log({ [TODAY]: { x: 3 } })) } });
  t.F.usageRecord('y'); t.F.usageRecord('x');
  assert.deepStrictEqual(t.read(BUF).days, { [TODAY]: { x: 4, y: 1 } });
});

test('AC4: flush adds to what is already in the file and clears buffer and in-flight', async () => {
  const t = setup({ ls: { pt_usage_enabled: '1', [BUF]: JSON.stringify(log({ [TODAY]: { x: 2 } })) }, dir: makeDir({ [FILE]: JSON.stringify(log({ [TODAY]: { x: 5 }, '2026-11-01': { z: 1 } }, { v1: '2026-11-01' })) }) });
  await t.F.usageFlush();
  assert.deepStrictEqual(plain(t.fileLog().days), { [TODAY]: { x: 7 }, '2026-11-01': { z: 1 } });
  assert.deepStrictEqual(plain(t.fileLog().versions), { v1: '2026-11-01' });
  assert.strictEqual(t.store.has(BUF), false);
  assert.strictEqual(t.store.has(INF), false);
});

test('AC5: no folder or no permission keeps counts buffered, silently', async () => {
  for (const mk of [() => null, () => Object.assign(makeDir(), { perm: 'prompt' })]) {
    const t = setup({ ls: { pt_usage_enabled: '1', [BUF]: JSON.stringify(log({ [TODAY]: { x: 2 } })) }, dir: mk() });
    await t.F.usageFlush();
    assert.deepStrictEqual(t.read(BUF).days, { [TODAY]: { x: 2 } });
    assert.strictEqual(t.toasts.length, 0);
  }
});

test('AC5: a failed write puts the counts back (in-flight included), without a toast', async () => {
  const dir = makeDir(); dir.failWrite = true;
  const t = setup({ ls: { pt_usage_enabled: '1', [BUF]: JSON.stringify(log({ [TODAY]: { x: 2 } })), [INF]: JSON.stringify(log({ [TODAY]: { x: 1, w: 1 } })) }, dir });
  await t.F.usageFlush();
  assert.deepStrictEqual(t.read(BUF).days, { [TODAY]: { x: 3, w: 1 } });
  assert.strictEqual(t.store.has(INF), false);
  assert.strictEqual(t.toasts.length, 0);
  dir.failWrite = false;
  await t.F.usageFlush();
  assert.deepStrictEqual(plain(t.fileLog().days), { [TODAY]: { x: 3, w: 1 } });
});

test('AC9: a corrupt file is backed up once before it is overwritten', async () => {
  const dir = makeDir({ [FILE]: '{not json' });
  const t = setup({ ls: { pt_usage_enabled: '1', [BUF]: JSON.stringify(log({ [TODAY]: { x: 1 } })) }, dir });
  await t.F.usageFlush();
  const backups = Object.keys(dir.sub.backup.files);
  assert.strictEqual(backups.length, 1);
  assert.strictEqual(dir.sub.backup.files[backups[0]], '{not json');
  assert.deepStrictEqual(plain(t.fileLog().days), { [TODAY]: { x: 1 } });
  assert.strictEqual(t.toasts.length, 1);
});

test('a newer or partly invalid file is backed up too, not silently cut down', async () => {
  const dir = makeDir({ [FILE]: JSON.stringify({ v: 2, days: { [TODAY]: { a: 1 } }, extra: true }) });
  const t = setup({ ls: { pt_usage_enabled: '1', [BUF]: JSON.stringify(log({ [TODAY]: { x: 1 } })) }, dir });
  await t.F.usageFlush();
  assert.strictEqual(Object.keys(dir.sub.backup.files).length, 1);
});

test('viewing a corrupt file is silent and writes nothing, also with tracking off', async () => {
  const dir = makeDir({ [FILE]: '{not json' });
  const t = setup({ dir });
  const res = await t.F.usageLoadAll();
  assert.strictEqual(res.hasFile, true);
  assert.deepStrictEqual(plain(res.log.days), {});
  assert.strictEqual(dir.sub.backup, undefined);
  assert.strictEqual(t.toasts.length, 0);
  assert.strictEqual(dir.files[FILE], '{not json');
});

test('AC10: reset empties file and buffers', async () => {
  const dir = makeDir({ [FILE]: JSON.stringify(log({ [TODAY]: { x: 5 } })) });
  const t = setup({ ls: { [BUF]: JSON.stringify(log({ [TODAY]: { x: 1 } })), [INF]: JSON.stringify(log({ [TODAY]: { x: 1 } })) }, dir });
  await t.F._usageReset();
  assert.deepStrictEqual(plain(t.fileLog().days), {});
  assert.strictEqual(t.store.has(BUF) || t.store.has(INF), false);
});

test('AC10: reset refuses when the folder cannot be reached, and changes nothing', async () => {
  const dir = Object.assign(makeDir({ [FILE]: JSON.stringify(log({ [TODAY]: { x: 5 } })) }), { perm: 'prompt' });
  const t = setup({ ls: { [BUF]: JSON.stringify(log({ [TODAY]: { x: 1 } })) }, dir });
  await t.F._usageReset();
  assert.deepStrictEqual(plain(JSON.parse(dir.files[FILE]).days), { [TODAY]: { x: 5 } });
  assert.deepStrictEqual(t.read(BUF).days, { [TODAY]: { x: 1 } });
  assert.ok(t.toasts[0].startsWith('✗'));
});

test('AC10: reset without any data folder clears the buffer', async () => {
  const t = setup({ ls: { [BUF]: JSON.stringify(log({ [TODAY]: { x: 1 } })) }, dir: null });
  await t.F._usageReset();
  assert.strictEqual(t.store.has(BUF), false);
});

test('AC11: turning off stops recording but keeps (and flushes) the log', async () => {
  const t = setup(on);
  t.F.usageRecord('a');
  await t.F.usageSetEnabled(false);
  t.F.usageRecord('b');
  await t.F.usageFlush();
  assert.deepStrictEqual(plain(t.fileLog().days), { [TODAY]: { a: 1 } });
  const res = await t.F.usageLoadAll();
  assert.deepStrictEqual(plain(res.log.days), { [TODAY]: { a: 1 } });
});
