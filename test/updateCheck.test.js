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
const { compareVersions, parseRemoteVersion, runUpdateCheck, renderUpdateStatus, startUpdateCheck, wireUpdateCheck } = loadFunctions(
  ['compareVersions', 'parseRemoteVersion', 'runUpdateCheck', 'renderUpdateStatus', 'startUpdateCheck', 'wireUpdateCheck'],
  { vars: ['UPDATE_CHECK_URL', 'UPDATE_DOWNLOAD_URL', 'UPDATE_TIMEOUT_MS'], globals: sandboxGlobals }
);

test('every check asks for a fresh copy past CDN and proxy caches (?t=<now>)', async () => {
  let url;
  const before = Date.now();
  await runUpdateCheck((u) => { url = u; return okFetch("var APP_VERSION = 'v4.54.0';")(); });
  const t = Number(/\?t=(\d+)$/.exec(url)[1]);
  assert.ok(t >= before && t <= Date.now(), 'cache-buster is the current time');
});

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
  assert.match(seen.url, /^https:\/\/raw\.githubusercontent\.com\/SpaceSphereWheatley\/patentdesk\/main\/src\/js\/01-config-templates\.js\?t=\d+$/);
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

test('a timed-out request is aborted, not left running', async () => {
  let signal;
  const r = await runUpdateCheck((u, o) => { signal = o.signal; return new Promise(() => {}); }, 20);
  assert.strictEqual(r.kind, 'error');
  assert.strictEqual(signal.aborted, true);
});

test('the check touches no storage: a successful check still reports "new"', async () => {
  const boom = new Proxy({}, { get() { throw new Error('storage touched'); } });
  const g = Object.assign({}, sandboxGlobals, { localStorage: boom, indexedDB: boom });
  const f = loadFunctions(['compareVersions', 'parseRemoteVersion', 'runUpdateCheck', 'renderUpdateStatus', 'startUpdateCheck'],
    { vars: ['UPDATE_CHECK_URL', 'UPDATE_DOWNLOAD_URL', 'UPDATE_TIMEOUT_MS'], globals: g });
  const btn = { disabled: false }, out = makeEl();
  const r = await f.startUpdateCheck(btn, out, okFetch("var APP_VERSION = 'v4.55.0';"));
  assert.strictEqual(r.kind, 'new'); // a storage access would be swallowed into 'error'
  assert.ok(out.children[0].text.startsWith('v4.55.0 er tilgjengelig'));
});

test('wireUpdateCheck makes no request until the button is clicked', async () => {
  let handler, fetched = 0;
  const btn = { disabled: false, addEventListener: (ev, fn) => { assert.strictEqual(ev, 'click'); handler = fn; } };
  const out = makeEl();
  const doc = { getElementById: (id) => (id === 'btn-check-update' ? btn : out) };
  wireUpdateCheck(doc, () => { fetched++; return okFetch("var APP_VERSION = 'v4.54.0';")(); });
  assert.strictEqual(fetched, 0);
  await Promise.resolve();
  assert.strictEqual(fetched, 0);
  handler();
  await new Promise((r) => setTimeout(r, 10));
  assert.strictEqual(fetched, 1);
  assert.strictEqual(out.textContent, 'Du har nyeste versjon');
});

test('wireUpdateCheck is a no-op when the elements are missing', () => {
  wireUpdateCheck({ getElementById: () => null }, () => { throw new Error('no'); });
});
