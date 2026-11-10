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
  ['compareVersions', 'parseRemoteVersion', 'fetchTextWithTimeout', 'runUpdateCheck', 'renderUpdateStatus', 'startUpdateCheck', 'wireUpdateCheck', 'githubLink'],
  { vars: ['UPDATE_CHECK_URL', 'UPDATE_DOWNLOAD_URL', 'CHANGELOG_URL', 'UPDATE_TIMEOUT_MS'], globals: sandboxGlobals }
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

test('renderUpdateStatus: ny versjon gir også en «Hva er nytt»-lenke til endringsloggen på GitHub', () => {
  const el = makeEl();
  renderUpdateStatus(el, { kind: 'new', remote: 'v4.61.0' });
  const a = el.children[el.children.length - 1];
  assert.strictEqual(a.href, 'https://github.com/SpaceSphereWheatley/patentdesk/blob/main/CHANGELOG.md');
  assert.strictEqual(a.textContent, 'Hva er nytt');
  assert.strictEqual(a.target, '_blank');
  assert.strictEqual(a.rel, 'noopener noreferrer');
  assert.strictEqual(a.onclick, undefined, 'endringslogg-lenken laster ikke ned noe');

  for (const kind of ['current', 'error']) {
    const e = makeEl();
    renderUpdateStatus(e, { kind });
    assert.strictEqual(e.children.length, 0);
  }
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
  const f = loadFunctions(['compareVersions', 'parseRemoteVersion', 'fetchTextWithTimeout', 'runUpdateCheck', 'renderUpdateStatus', 'startUpdateCheck', 'githubLink'],
    { vars: ['UPDATE_CHECK_URL', 'UPDATE_DOWNLOAD_URL', 'CHANGELOG_URL', 'UPDATE_TIMEOUT_MS'], globals: g });
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

// ── Direkte nedlasting av ny versjon ───────────────

const APP_HTML = (v) => "<!DOCTYPE html>\n<html lang=\"no\">\n<head><title>PatentDesk</title></head><script>\nvar APP_VERSION    = '" + v + "';\n</script></html>";

function dlSandbox(extra) {
  const saved = [];
  const clicks = [];
  const g = Object.assign({}, sandboxGlobals, {
    Blob: function(parts, opts) { this.parts = parts; this.type = opts && opts.type; },
    URL: { createObjectURL: (b) => { saved.push(b); return 'blob:x'; }, revokeObjectURL: () => {} },
  }, extra || {});
  g.document = Object.assign({}, document, {
    createElement: () => { const el = makeEl(); el.click = () => clicks.push({ href: el.href, download: el.download }); el.style = {}; return el; },
    body: { appendChild: () => {}, removeChild: () => {} },
  });
  const f = loadFunctions(
    ['compareVersions', 'parseRemoteVersion', 'fetchTextWithTimeout', 'runUpdateCheck', 'isPatentDeskFile',
     'runUpdateDownload', 'saveAppFile', 'startUpdateDownload', 'renderUpdateStatus', 'startUpdateCheck', 'githubLink'],
    { vars: ['UPDATE_CHECK_URL', 'UPDATE_DOWNLOAD_URL', 'CHANGELOG_URL', 'UPDATE_FILE_URL', 'UPDATE_TIMEOUT_MS', 'UPDATE_DOWNLOAD_TIMEOUT_MS'], globals: g });
  return { f, saved, clicks };
}

test('isPatentDeskFile: godtar bare PatentDesk-HTML med varslet versjon', () => {
  const { f } = dlSandbox();
  assert.strictEqual(f.isPatentDeskFile(APP_HTML('v4.59.0'), 'v4.59.0'), true);
  assert.strictEqual(f.isPatentDeskFile(APP_HTML('v4.58.0'), 'v4.59.0'), false, 'feil versjon');
  assert.strictEqual(f.isPatentDeskFile("var APP_VERSION = 'v4.59.0';", 'v4.59.0'), false, 'ikke HTML');
  assert.strictEqual(f.isPatentDeskFile('<!DOCTYPE html><html></html>', 'v4.59.0'), false, 'ingen versjon');
  assert.strictEqual(f.isPatentDeskFile(null, 'v4.59.0'), false);
});

test('runUpdateDownload: henter PatentDesk.html fra main som ren GET forbi mellomlagring', async () => {
  const { f } = dlSandbox();
  let seen;
  const r = await f.runUpdateDownload((url, opts) => { seen = { url, opts }; return okFetch(APP_HTML('v4.59.0'))(); }, 'v4.59.0');
  assert.strictEqual(r.ok, true);
  assert.match(seen.url, /^https:\/\/raw\.githubusercontent\.com\/SpaceSphereWheatley\/patentdesk\/main\/PatentDesk\.html\?t=\d+$/);
  assert.strictEqual(seen.opts.method, 'GET');
  assert.ok(!('body' in seen.opts));
  assert.strictEqual(seen.opts.credentials, 'omit');
  assert.strictEqual(seen.opts.referrerPolicy, 'no-referrer');
});

test('runUpdateDownload: feil innhold, HTTP-feil, nettverksfeil og timeout gir ok: false', async () => {
  const { f } = dlSandbox();
  assert.strictEqual((await f.runUpdateDownload(okFetch('garbage'), 'v4.59.0')).ok, false);
  assert.strictEqual((await f.runUpdateDownload(okFetch(APP_HTML('v4.58.0')), 'v4.59.0')).ok, false);
  assert.strictEqual((await f.runUpdateDownload(okFetch('x', 404), 'v4.59.0')).ok, false);
  assert.strictEqual((await f.runUpdateDownload(() => Promise.reject(new Error('offline')), 'v4.59.0')).ok, false);
  assert.strictEqual((await f.runUpdateDownload(() => new Promise(() => {}), 'v4.59.0', 20)).ok, false);
});

test('saveAppFile: lagrer som PatentDesk.html med typen text/html', () => {
  const { f, saved, clicks } = dlSandbox();
  f.saveAppFile(APP_HTML('v4.59.0'));
  assert.strictEqual(saved.length, 1);
  assert.strictEqual(saved[0].type, 'text/html;charset=utf-8');
  assert.strictEqual(saved[0].parts[0], APP_HTML('v4.59.0'));
  assert.deepStrictEqual(clicks, [{ href: 'blob:x', download: 'PatentDesk.html' }]);
});

test('startUpdateDownload: viser fremdrift, lagrer og sier hvor filen ligger', async () => {
  const { f, clicks } = dlSandbox();
  const out = makeEl();
  const btn = { disabled: false };
  const p = f.startUpdateDownload(out, okFetch(APP_HTML('v4.59.0')), 'v4.59.0', btn);
  assert.strictEqual(out.textContent, 'Laster ned …');
  assert.strictEqual(out.children.length, 0, 'lenken er borte mens nedlastingen pågår');
  assert.strictEqual(btn.disabled, true, '«Se etter oppdatering» er låst under nedlastingen');
  const r = await p;
  assert.strictEqual(r, true);
  assert.strictEqual(btn.disabled, false);
  assert.strictEqual(clicks.length, 1);
  assert.strictEqual(out.textContent, 'Lastet ned v4.59.0 — åpne den nyeste PatentDesk-filen i nedlastingsmappen');
});

test('startUpdateDownload: feil lagrer ingenting og faller tilbake til GitHub-lenken', async () => {
  const { f, clicks } = dlSandbox();
  const out = makeEl();
  const btn = { disabled: false };
  assert.strictEqual(await f.startUpdateDownload(out, okFetch('garbage'), 'v4.59.0', btn), false);
  assert.strictEqual(btn.disabled, false, 'knappen låses opp også etter feil');
  assert.strictEqual(clicks.length, 0);
  assert.strictEqual(out.className, 'upd-status upd-error');
  assert.strictEqual(out.children[0].text, 'Nedlasting feilet. ');
  assert.strictEqual(out.children[1].href, 'https://github.com/SpaceSphereWheatley/patentdesk/blob/main/PatentDesk.html');
  assert.strictEqual(out.children[1].textContent, 'Åpne på GitHub');
});

test('renderUpdateStatus: klikk på «Last ned» laster ned direkte i stedet for å åpne GitHub', async () => {
  const { f, clicks } = dlSandbox();
  const out = makeEl();
  let fetched = 0;
  f.renderUpdateStatus(out, { kind: 'new', remote: 'v4.59.0' }, () => { fetched++; return okFetch(APP_HTML('v4.59.0'))(); });
  const a = out.children[1];
  assert.strictEqual(fetched, 0, 'ingenting hentes før klikk');
  let prevented = false;
  a.onclick({ preventDefault: () => { prevented = true; }, ctrlKey: false, metaKey: false, shiftKey: false, button: 0 });
  assert.strictEqual(prevented, true);
  await new Promise((r) => setTimeout(r, 10));
  assert.strictEqual(fetched, 1);
  assert.strictEqual(clicks.length, 1);
});

test('renderUpdateStatus: Ctrl/⌘-klikk og midtklikk åpner fortsatt GitHub-siden', () => {
  const { f } = dlSandbox();
  const out = makeEl();
  f.renderUpdateStatus(out, { kind: 'new', remote: 'v4.59.0' }, () => { throw new Error('no fetch'); });
  const a = out.children[1];
  for (const ev of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) {
    let prevented = false;
    a.onclick(Object.assign({ preventDefault: () => { prevented = true; }, ctrlKey: false, metaKey: false, shiftKey: false, button: 0 }, ev));
    assert.strictEqual(prevented, false);
  }
});

test('mens en nedlasting pågår, kan ikke en ny sjekk starte en ny nedlasting', async () => {
  const { f } = dlSandbox();
  const btn = { disabled: false }, out = makeEl();
  let release, checks = 0;
  const fetchFn = (url) => {
    if (url.includes('01-config-templates.js')) { checks++; return okFetch("var APP_VERSION = 'v4.59.0';")(); }
    return new Promise((r) => { release = () => r({ ok: true, text: () => Promise.resolve(APP_HTML('v4.59.0')) }); });
  };
  await f.startUpdateCheck(btn, out, fetchFn);
  const a = out.children[1];
  a.onclick({ preventDefault: () => {}, ctrlKey: false, metaKey: false, shiftKey: false, button: 0 });
  await Promise.resolve();
  assert.strictEqual(btn.disabled, true);
  assert.strictEqual(await f.startUpdateCheck(btn, out, fetchFn), null, 'ny sjekk ignoreres');
  assert.strictEqual(checks, 1);
  release();
  await new Promise((r) => setTimeout(r, 10));
  assert.strictEqual(btn.disabled, false);
});
