'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { compareVersions, parseRemoteVersion, runUpdateCheck } = loadFunctions(
  ['compareVersions', 'parseRemoteVersion', 'runUpdateCheck'],
  { vars: ['UPDATE_CHECK_URL'], globals: { APP_VERSION: 'v4.54.0' } }
);

test('compareVersions compares numerically, not as strings', () => {
  assert.strictEqual(compareVersions('v4.10.0', 'v4.9.0'), 1);
  assert.strictEqual(compareVersions('v4.9.0', 'v4.10.0'), -1);
  assert.strictEqual(compareVersions('v4.54.0', 'v4.54.0'), 0);
  assert.strictEqual(compareVersions('v5.0.0', 'v4.99.99'), 1);
  assert.strictEqual(compareVersions('4.54.1', 'v4.54.0'), 1); // leading v optional
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

test('older remote (local build is ahead) → "current", never an update prompt', async () => {
  assert.strictEqual((await runUpdateCheck(okFetch("var APP_VERSION = 'v4.40.0';"))).kind, 'current');
});

test('malformed body, HTTP error and network failure → "error"', async () => {
  assert.strictEqual((await runUpdateCheck(okFetch('garbage'))).kind, 'error');
  assert.strictEqual((await runUpdateCheck(okFetch('x', 404))).kind, 'error');
  assert.strictEqual((await runUpdateCheck(() => Promise.reject(new TypeError('Failed to fetch')))).kind, 'error');
});

test('request is a plain GET with no payload or credentials', async () => {
  let seen;
  await runUpdateCheck((url, opts) => { seen = { url, opts: opts || {} }; return okFetch("var APP_VERSION = 'v4.54.0';")(); });
  assert.match(seen.url, /^https:\/\/raw\.githubusercontent\.com\/SpaceSphereWheatley\/patentdesk\/main\//);
  assert.ok(!seen.opts.body);
  assert.ok(!seen.opts.method || seen.opts.method === 'GET');
  assert.notStrictEqual(seen.opts.credentials, 'include');
});
