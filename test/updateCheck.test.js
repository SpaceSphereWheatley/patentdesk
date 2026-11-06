'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

// Minimal DOM stub for renderUpdateStatus
function makeEl() {
  return { children: [], className: '', _text: '',
    set textContent(v) { this._text = v; this.children = []; }, get textContent() { return this._text; },
    appendChild(c) { this.children.push(c); return c; } };
}
const document = {
  createTextNode: (t) => ({ text: t }),
  createElement: () => makeEl(),
};
const sandboxGlobals = { APP_VERSION: 'v4.54.0', document, setTimeout, clearTimeout, AbortController, Promise };
const { compareVersions, parseRemoteVersion, runUpdateCheck, renderUpdateStatus, startUpdateCheck } = loadFunctions(
  ['compareVersions', 'parseRemoteVersion', 'runUpdateCheck', 'renderUpdateStatus', 'startUpdateCheck'],
  { vars: ['UPDATE_CHECK_URL', 'UPDATE_DOWNLOAD_URL', 'UPDATE_TIMEOUT_MS'], globals: sandboxGlobals }
);

test('compareVersions compares numerically, not as strings', () => {
  assert.strictEqual(compareVersions('v4.10.0', 'v4.9.0'), 1);
  assert.strictEqual(compareVersions('v4.9.0', 'v4.10.0'), -1);
  assert.strictEqual(compareVersions('v4.54.0', 'v4.54.0'), 0);
  assert.strictEqual(compareVersions('v5.0.0', 'v4.99.99'), 1);
  assert.strictEqual(compareVersions('4.54.1', 'v4.54.0'), 1);
});

test('parseRemoteVersion reads APP_VERSION from the source file', () => {
  assert.strictEqual(parseRemoteVersion("// x\nvar APP_VERSION    = 'v4.55.0';\nvar SCHEMA_VERSION = 8;"), 'v4.55.0');
});

test('parseRemoteVersion returns null on garbage or non-strings', () => {
  assert.strictEqual(parseRemoteVersion('<html>404</html>'), null);
  assert.strictEqual(parseRemoteVersion("var APP_VERSION = 'latest';"), null);
  assert.strictEqual(parseRemoteVersion(''), null);
  assert.strictEqual(parseRemoteVersion(null), null);
  assert.strictEqual(parseRemoteVersion(undefined), null);
});

const okFetch = (body, status) => () => Promise.resolve({ ok: status === undefined || status < 400, status: status || 200, text: () => Promise.resolve(body) });

test('newer remote → kind "new" with the remote version', async () => {
  const r = await runUpdateCheck(okFetch("var APP_VERSION = 'v4.55.0';"));
  assert.strictEqual(r.kind, 'new');
  assert.strictEqual(r.remote, 'v4.55.0');
});

test('equal remote → "current"', async () => {
  assert.strictEqual((await runUpdateCheck(okFetch("var APP_VERSION = 'v4.54.0';"))).kind, 'current');
});

test('older remote (local build ahead) → "current", never an update prompt', async () => {
  assert.strictEqual((await runUpdateCheck(okFetch("var APP_VERSION = 'v4.40.0';"))).kind, 'current');
});

test('malformed body, HTTP error and network failure → "error"', async () => {
  assert.strictEqual((await runUpdateCheck(okFetch('garbage'))).kind, 'error');
  assert.strictEqual((await runUpdateCheck(okFetch('x', 404))).kind, 'error');
  assert.strictEqual((await runUpdateCheck(() => Promise.reject(new TypeError('Failed to fetch')))).kind, 'error');
  assert.strictEqual((await runUpdateCheck(() => { throw new Error('sync'); })).kind, 'error');
});

test('a request that never answers times out as "error" instead of hanging', async () => {
  const r = await runUpdateCheck(() => new Promise(() => {}), 20);
  assert.strictEqual(r.kind, 'error');
});

test('request is a plain GET: no body, no credentials, no referrer, no cache', async () => {
  let seen;
  await runUpdateCheck((url, opts) => { seen = { url, opts }; return okFetch("var APP_VERSION = 'v4.54.0';")(); });
  assert.match(seen.url, /^https:\/\/raw\.githubusercontent\.com\/SpaceSphereWheatley\/patentdesk\/main\/src\/js\/01-config-templates\.js$/);
  assert.strictEqual(seen.opts.method, 'GET');
  assert.ok(!('body' in seen.opts));
  assert.strictEqual(seen.opts.credentials, 'omit');
  assert.strictEqual(seen.opts.referrerPolicy, 'no-referrer');
  assert.strictEqual(seen.opts.cache, 'no-store');
});

test('renderUpdateStatus shows the right text per kind, with the download link only for "new"', () => {
  let el = makeEl();
  renderUpdateStatus(el, { kind: 'new', remote: 'v4.55.0' });
  assert.strictEqual(el.className, 'upd-status upd-new');
  assert.strictEqual(el.children[0].text, 'v4.55.0 er tilgjengelig ');
  const a = el.children[1];
  assert.strictEqual(a.href, 'https://github.com/SpaceSphereWheatley/patentdesk/blob/main/PatentDesk.html');
  assert.strictEqual(a.textContent, 'Last ned');
  assert.strictEqual(a.rel, 'noopener noreferrer');

  el = makeEl();
  renderUpdateStatus(el, { kind: 'current' });
  assert.strictEqual(el.textContent, 'Du har nyeste versjon');
  assert.strictEqual(el.children.length, 0);

  el = makeEl();
  renderUpdateStatus(el, { kind: 'error' });
  assert.strictEqual(el.textContent, 'Kunne ikke sjekke (frakoblet?)');
  assert.strictEqual(el.className, 'upd-status upd-error');
});

test('startUpdateCheck locks the button while checking, ignores a second click, and unlocks after success and error', async () => {
  const btn = { disabled: false }, out = makeEl();
  let calls = 0, release;
  const slow = () => { calls++; return new Promise((r) => { release = () => r({ ok: true, text: () => Promise.resolve("var APP_VERSION = 'v4.54.0';") }); }); };
  const first = startUpdateCheck(btn, out, slow);
  assert.strictEqual(btn.disabled, true);
  assert.strictEqual(out.textContent, 'Sjekker …');
  assert.strictEqual(await startUpdateCheck(btn, out, slow), null); // second click ignored
  assert.strictEqual(calls, 1);
  await Promise.resolve(); await Promise.resolve(); release();
  await first;
  assert.strictEqual(btn.disabled, false);
  assert.strictEqual(out.textContent, 'Du har nyeste versjon');

  await startUpdateCheck(btn, out, () => Promise.reject(new Error('offline')));
  assert.strictEqual(btn.disabled, false);
  assert.strictEqual(out.textContent, 'Kunne ikke sjekke (frakoblet?)');
});

test('the check touches no storage and makes no request until called', async () => {
  const boom = new Proxy({}, { get() { throw new Error('storage touched'); } });
  const g = Object.assign({}, sandboxGlobals, { localStorage: boom, indexedDB: boom, fetch: () => { throw new Error('fetch at load'); } });
  const f = loadFunctions(['compareVersions', 'parseRemoteVersion', 'runUpdateCheck', 'renderUpdateStatus', 'startUpdateCheck'],
    { vars: ['UPDATE_CHECK_URL', 'UPDATE_DOWNLOAD_URL', 'UPDATE_TIMEOUT_MS'], globals: g }); // loading must not fetch
  const btn = { disabled: false };
  await f.startUpdateCheck(btn, makeEl(), okFetch("var APP_VERSION = 'v4.55.0';"));
  assert.strictEqual(btn.disabled, false);
});
