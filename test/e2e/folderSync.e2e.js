'use strict';
// Browser tests for the case-folder sync: opening a case reads the files in
// its folder from the local server (/docs/list), adds new ones to the file
// list and marks registered files that are not on disk. NOT part of `npm test`;
// run with: node --test test/e2e/folderSync.e2e.js

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let chromium = null, browser = null, skipReason = null;
try { ({ chromium } = require('playwright')); } catch (e) { skipReason = 'playwright not installed'; }
const APP_FILE = process.env.E2E_APP_FILE || path.join(__dirname, '..', '..', 'PatentDesk.html');

let server = null, base = '';
const state = { listing: null, status: 200, requests: [] };

before(async () => {
  if (skipReason) return;
  try { browser = await chromium.launch(); }
  catch (e) { skipReason = 'Chromium could not be launched: ' + String(e.message || e).split('\n')[0]; return; }
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/PatentDesk.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(APP_FILE));
    } else if (url.pathname === '/docs/list') {
      state.requests.push({ root: url.searchParams.get('root'), case: url.searchParams.get('case'), site: req.headers['sec-fetch-site'] });
      res.writeHead(state.status, { 'Content-Type': 'application/json' });
      res.end(typeof state.listing === 'string' ? state.listing : JSON.stringify(state.listing));
    } else if (url.pathname === '/docs') {
      res.writeHead(200, { 'Content-Type': 'application/pdf' });
      res.end('%PDF-1.1');
    } else { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = 'http://localhost:' + server.address().port;
});
after(async () => { if (browser) await browser.close(); if (server) server.close(); });
function e2e(name, fn) { test(name, async (t) => { if (skipReason) { t.skip(skipReason); return; } await fn(t); }); }

const CASE_ID = 'syncA';
function kase(over) {
  return Object.assign({
    id: CASE_ID, caseNumber: '20261400', status: 'ny', dueDate: '2026-12-15', title: 'Mappesak', notes: '', tags: '',
    createdAt: '2026-10-01T08:00:00.000Z', history: [{ status: 'ny', date: '2026-10-01T08:00:00.000Z' }],
    type: 'sak', duration: null, caseBuffer: null
  }, over || {});
}

// Opens the case through the local server (or as a file) with the given registered files
async function open(opts) {
  opts = Object.assign({ files: [{ name: 'Claims.pdf' }, { name: 'Description.pdf' }], url: base + '/PatentDesk.html', caseOver: {} }, opts || {});
  state.requests = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const sak = { numClaims: 0, filingDate: '', priorityDate: '', checklist: [], classes: [], docs: [], claims: [], files: opts.files };
  await page.addInitScript(([c, s, root]) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    localStorage.setItem('pt_onboarding_completed', '1');
    localStorage.setItem('pt_cases', JSON.stringify([c]));
    localStorage.setItem('pt_sak_' + c.id, JSON.stringify(s));
    if (root) localStorage.setItem('pt_doc_root', root);
  }, [kase(opts.caseOver), sak, opts.root || null]);
  await page.goto(opts.url);
  await page.evaluate((id) => navigateTo('sak/' + id), CASE_ID);
  await page.waitForTimeout(300);
  return { page, close: () => ctx.close() };
}
const stored = (p) => p.evaluate((id) => JSON.parse(localStorage.getItem('pt_sak_' + id)).files.map((f) => f.name), CASE_ID);
const rows = (p) => p.evaluate(() => Array.from(document.querySelectorAll('#sak-docs-list .sak-docs-dropdown-row')).map((r) => ({ name: r.querySelector('.sak-docs-open').getAttribute('title'), missing: r.classList.contains('sak-docs-missing') })));

e2e('opening a case adds the files found in its folder, in folder order', async () => {
  state.listing = { exists: true, files: ['Claims.pdf', 'Description.pdf', 'D1.pdf', 'Figures.pdf'] };
  const s = await open();
  assert.deepEqual(await stored(s.page), ['Claims.pdf', 'Description.pdf', 'D1.pdf', 'Figures.pdf']);
  assert.match(await s.page.locator('.save-toast').allTextContents().then((a) => a.join(' ')), /2 nye filer funnet i saksmappen/);
  await s.close();
});

e2e('the request names the root and case, and is same-origin like the server requires', async () => {
  state.listing = { exists: true, files: ['Claims.pdf'] };
  const s = await open({ root: 'C:\\Saker' });
  assert.equal(state.requests.length, 1);
  assert.equal(state.requests[0].case, '20261400');
  assert.equal(state.requests[0].root, 'C:\\Saker');
  assert.equal(state.requests[0].site, 'same-origin');
  await s.close();
});

e2e('registered files that are not on disk are marked "mangler", never removed', async () => {
  state.listing = { exists: true, files: ['Claims.pdf'] };
  const s = await open();
  assert.deepEqual(await stored(s.page), ['Claims.pdf', 'Description.pdf'], 'nothing removed');
  assert.deepEqual(await rows(s.page), [{ name: 'Claims.pdf', missing: false }, { name: 'Description.pdf', missing: true }]);
  assert.equal(await s.page.locator('#sak-docs-list .sak-docs-missing-tag').count(), 1);
  await s.close();
});

e2e('the default file names that are not on disk are marked too', async () => {
  state.listing = { exists: true, files: ['Claims.pdf'] };
  const s = await open({ files: ['Claims.pdf', 'Description.pdf', 'Abstract.pdf', 'Figures.pdf', 'Application.pdf'].map((n) => ({ name: n })) });
  assert.equal(await s.page.locator('#sak-docs-list .sak-docs-missing').count(), 4);
  await s.close();
});

e2e('syncing twice does not duplicate: case and missing extension are the same file', async () => {
  state.listing = { exists: true, files: ['claims.PDF', 'DESCRIPTION.pdf', 'D1.pdf'] };
  const s = await open({ files: [{ name: 'Claims.pdf' }, { name: 'Description' }] });
  assert.deepEqual(await stored(s.page), ['Claims.pdf', 'Description', 'D1.pdf']);
  await s.page.evaluate(() => navigateTo('hjem'));
  await s.page.evaluate((id) => navigateTo('sak/' + id), CASE_ID);
  await s.page.waitForTimeout(300);
  assert.deepEqual(await stored(s.page), ['Claims.pdf', 'Description', 'D1.pdf'], 'still three');
  assert.equal(state.requests.length, 2, 'one read per opening of the case');
  await s.close();
});

e2e('the folder is read once per opening, not on every redraw', async () => {
  state.listing = { exists: true, files: ['Claims.pdf'] };
  const s = await open();
  await s.page.evaluate((id) => { for (let i = 0; i < 5; i++) renderSak(id); }, CASE_ID);
  await s.page.waitForTimeout(200);
  assert.equal(state.requests.length, 1);
  await s.close();
});

e2e('a case folder that does not exist gives one note, no marks, and adds nothing', async () => {
  state.listing = { exists: false, files: [] };
  const s = await open();
  assert.deepEqual(await stored(s.page), ['Claims.pdf', 'Description.pdf']);
  assert.equal(await s.page.locator('#sak-docs-list .sak-docs-missing').count(), 0);
  assert.match(await s.page.locator('#sak-docs-list .sak-docs-note').textContent(), /Saksmappen finnes ikke på disk/);
  await s.close();
});

e2e('a failing or unexpected answer changes nothing and says nothing', async () => {
  for (const [status, listing] of [[500, '{"x":1}'], [200, 'not json'], [200, '{"exists":"ja","files":[]}'], [403, '{}']]) {
    state.status = status; state.listing = listing;
    const s = await open();
    assert.deepEqual(await stored(s.page), ['Claims.pdf', 'Description.pdf'], status + ' ' + listing);
    assert.equal(await s.page.locator('#sak-docs-list .sak-docs-missing').count(), 0);
    await s.close();
  }
  state.status = 200;
});

e2e('opened as a plain file there is no read at all', async () => {
  state.listing = { exists: true, files: ['D1.pdf'] };
  const s = await open({ url: pathToFileURL(APP_FILE).href });
  assert.equal(state.requests.length, 0);
  assert.deepEqual(await stored(s.page), ['Claims.pdf', 'Description.pdf']);
  await s.close();
});

e2e('it works the same for every status and for an Oppdrag', async () => {
  state.listing = { exists: true, files: ['Claims.pdf', 'Notat.docx'] };
  for (const o of [{ status: 'fristarkiv' }, { status: 'viderebehandling' }, { status: 'avsluttet' }, { type: 'oppdrag', duration: 3 }]) {
    const s = await open({ caseOver: o });
    assert.deepEqual(await stored(s.page), ['Claims.pdf', 'Description.pdf', 'Notat.docx'], JSON.stringify(o));
    await s.close();
  }
});

e2e('files found in the folder go through the slot rules at once', async () => {
  state.listing = { exists: true, files: ['Claims_v2.pdf', 'Figures.pdf'] };
  const s = await open({ files: [] });
  await s.page.click('#sak-tab-docs');
  await s.page.waitForTimeout(300);
  assert.match(await s.page.evaluate(() => document.getElementById('dp-frame-0').getAttribute('src')), /file=Claims_v2\.pdf/);
  assert.match(await s.page.evaluate(() => document.getElementById('dp-frame-1').getAttribute('src')), /file=Figures\.pdf/);
  await s.close();
});

e2e('the pane picker marks files that are not on disk', async () => {
  state.listing = { exists: true, files: ['Claims.pdf'] };
  const s = await open();
  await s.page.click('#sak-tab-docs');
  await s.page.waitForTimeout(300);
  const opts = await s.page.locator('[data-dp-pick="0"] option').allTextContents();
  assert.ok(opts.some((t) => /Description.*\(mangler\)/.test(t)), opts.join('|'));
  assert.ok(!opts.some((t) => /^Claims.*mangler/.test(t)));
  await s.close();
});

e2e('hostile names from disk stay plain text', async () => {
  state.listing = { exists: true, files: ['<img src=x onerror=window.__pwn=1>.pdf', '../escape.pdf', 'C:\\evil.pdf'] };
  const s = await open();
  assert.equal(await s.page.evaluate(() => window.__pwn), undefined);
  const names = await stored(s.page);
  assert.ok(!names.some((n) => /escape|evil/.test(n)), names.join('|'));
  assert.equal(await s.page.locator('#sak-docs-list img').count(), 0);
  await s.close();
});
