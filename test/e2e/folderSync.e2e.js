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
const state = { listing: null, status: 200, requests: [], delay: 0 };

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
      const send = () => {
        res.writeHead(state.status, { 'Content-Type': 'application/json' });
        const l = typeof state.listing === 'function' ? state.listing(url.searchParams.get('case')) : state.listing;
        res.end(typeof l === 'string' ? l : JSON.stringify(l));
      };
      if (state.delay) setTimeout(send, state.delay); else send();
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
  if (opts.init) await page.addInitScript(opts.init);
  await page.goto(opts.url);
  await page.evaluate((id) => navigateTo('sak/' + id), CASE_ID);
  await page.waitForTimeout(opts.settle === undefined ? 300 : opts.settle);
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

e2e('files found in the folder go through the slot rules at once, also with the tab already open', async () => {
  state.listing = { exists: true, files: ['Claims_v2.pdf', 'Figures.pdf'] };
  state.delay = 500;
  const s = await open({ files: [], settle: 50 });
  await s.page.click('#sak-tab-docs'); // the tab is open before the folder answer arrives
  await s.page.waitForTimeout(100);
  assert.equal(await s.page.evaluate(() => document.getElementById('dp-frame-0').getAttribute('src')), null, 'nothing yet');
  await s.page.waitForFunction(() => /Claims_v2/.test(document.getElementById('dp-frame-0').getAttribute('src') || ''), null, { timeout: 3000 });
  assert.match(await s.page.evaluate(() => document.getElementById('dp-frame-1').getAttribute('src')), /file=Figures\.pdf/);
  state.delay = 0;
  await s.close();
});

e2e('a late answer for a case that was deleted meanwhile writes nothing', async () => {
  state.listing = { exists: true, files: ['D1.pdf', 'D2.pdf'] };
  state.delay = 500;
  const s = await open({ settle: 50 });
  await s.page.evaluate((id) => dispatch('CASE_DELETE', { id }), CASE_ID);
  await s.page.waitForTimeout(900);
  assert.equal(await s.page.evaluate((id) => localStorage.getItem('pt_sak_' + id), CASE_ID), null, 'no orphaned case details');
  assert.equal(await s.page.locator('.save-toast').allTextContents().then((a) => a.some((t) => /funnet i saksmappen/.test(t))), false, 'no toast about a deleted case');
  state.delay = 0;
  await s.close();
});

e2e('the "folder not found" note also shows when the file list is empty (an Oppdrag)', async () => {
  state.listing = { exists: false, files: [] };
  const s = await open({ files: [], caseOver: { type: 'oppdrag', duration: 3 } });
  assert.match(await s.page.locator('#sak-docs-list').textContent(), /Saksmappen finnes ikke på disk/);
  assert.match(await s.page.locator('#sak-docs-list').textContent(), /Ingen filer registrert/);
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

// ── Review round 2 ──────────────────────────────────

const byNumber = { '20261400': { exists: true, files: ['Claims.pdf', 'Old1.pdf'] }, '20261401': { exists: true, files: ['Claims.pdf', 'New1.pdf', 'New2.pdf'] } };
const editNumber = (p, n) => p.evaluate(([id, num]) => {
  const c = cases.find((x) => x.id === id);
  dispatch('CASE_EDIT', { id, caseNumber: num, dueDate: c.dueDate, title: c.title, status: c.status, type: c.type });
  renderSak(id);
}, [CASE_ID, n]);

e2e('changing the case number re-reads the folder: marks and added files follow the new folder', async () => {
  state.listing = (n) => byNumber[n] || { exists: false, files: [] };
  const s = await open({ files: [{ name: 'Claims.pdf' }, { name: 'New1.pdf' }] });
  assert.deepEqual(await stored(s.page), ['Claims.pdf', 'New1.pdf', 'Old1.pdf'], 'first folder read');
  assert.equal((await rows(s.page)).find((r) => r.name === 'New1.pdf').missing, true, 'New1 is not in the first folder');
  await editNumber(s.page, '20261401');
  await s.page.waitForTimeout(400);
  assert.equal(state.requests.length, 2, 'read again after the number changed');
  assert.equal(state.requests[1].case, '20261401');
  assert.deepEqual(await stored(s.page), ['Claims.pdf', 'New1.pdf', 'Old1.pdf', 'New2.pdf']);
  const r = await rows(s.page);
  assert.equal(r.find((x) => x.name === 'New1.pdf').missing, false, 'now found');
  assert.equal(r.find((x) => x.name === 'Old1.pdf').missing, true, 'not in the new folder');
  await s.close();
});

e2e('an answer for the old case number that arrives after the edit is dropped', async () => {
  state.listing = (n) => byNumber[n] || { exists: false, files: [] };
  state.delay = 500;
  const s = await open({ files: [{ name: 'Claims.pdf' }], settle: 50 });
  await editNumber(s.page, '20261401'); // while the first answer is still pending
  await s.page.waitForTimeout(1200);
  const names = await stored(s.page);
  assert.ok(!names.includes('Old1.pdf'), 'the old folder\'s file did not leak in: ' + names.join('|'));
  assert.ok(names.includes('New1.pdf') && names.includes('New2.pdf'), 'the new folder\'s files did: ' + names.join('|'));
  state.delay = 0;
  await s.close();
});

e2e('AC9: a sync changes nothing about the case itself (due date, status, history, other cases data)', async () => {
  state.listing = { exists: true, files: ['D1.pdf', 'D2.pdf'] };
  const s = await open({ settle: 0 });
  const before = await s.page.evaluate(() => localStorage.getItem('pt_cases'));
  await s.page.waitForTimeout(500);
  assert.equal((await stored(s.page)).includes('D1.pdf'), true, 'the sync did run');
  assert.equal(await s.page.evaluate(() => localStorage.getItem('pt_cases')), before, 'pt_cases is byte-for-byte unchanged');
  await s.close();
});

// ── Uten server: nettleserens mappevelger ───────────
// showDirectoryPicker byttes ut med en falsk dokumentrot, så testen trenger
// ingen mappevelger-dialog. (Håndtaket kan ikke lagres i IndexedDB her.)
const FILE_URL = pathToFileURL(APP_FILE).href;
const fakePicker = ({ files, ok }) => {
  const dir = (name, kids) => ({
    kind: 'directory', name,
    values() { let i = 0; return { next: () => Promise.resolve(i < kids.length ? { done: false, value: kids[i++] } : { done: true }) }; },
    getDirectoryHandle(n) {
      const k = kids.find((c) => c.name === n && c.kind === 'directory');
      return k ? Promise.resolve(k) : Promise.reject(Object.assign(new Error('nf'), { name: 'NotFoundError' }));
    }
  });
  const root = dir('Saker', [dir('20261400', files.map((n) => ({ kind: 'file', name: n })))]);
  window.__pickerCalls = 0;
  if (ok) window.showDirectoryPicker = () => { window.__pickerCalls++; return Promise.resolve(root); };
  else delete window.showDirectoryPicker;
};
const initPicker = (files) => ({ init: `(${fakePicker.toString()})(${JSON.stringify({ files, ok: true })})` });
const syncRowVisible = async (p) => {
  await p.click('#btn-sak-docs');
  return p.locator('#sak-docs-sync-row').isVisible();
};

e2e('no server: the button "Velg mappe" is shown, and nothing is read before it is clicked', async () => {
  const s = await open(Object.assign({ url: FILE_URL }, initPicker(['Claims.pdf', 'New.pdf'])));
  assert.equal(await syncRowVisible(s.page), true);
  assert.equal((await s.page.locator('#btn-sak-docs-sync-label').textContent()).trim(), 'Velg mappe');
  assert.deepEqual(await stored(s.page), ['Claims.pdf', 'Description.pdf'], 'no sync without a click');
  assert.equal(await s.page.evaluate(() => window.__pickerCalls), 0);
  await s.close();
});

e2e('no server: picking the folder reads the case folder, adds new files and marks missing ones', async () => {
  const s = await open(Object.assign({ url: FILE_URL }, initPicker(['Claims.pdf', 'New.pdf'])));
  await s.page.click('#btn-sak-docs');
  await s.page.click('#btn-sak-docs-sync');
  await s.page.waitForTimeout(300);
  assert.deepEqual(await stored(s.page), ['Claims.pdf', 'Description.pdf', 'New.pdf']);
  assert.deepEqual(await rows(s.page), [
    { name: 'Claims.pdf', missing: false }, { name: 'Description.pdf', missing: true }, { name: 'New.pdf', missing: false }]);
  assert.equal((await s.page.locator('#btn-sak-docs-sync-label').textContent()).trim(), 'Synk mappe');
  assert.equal(await s.page.locator('#btn-sak-docs-repick').isVisible(), true);
  await s.close();
});

e2e('no server: a browser without the folder picker shows no button at all', async () => {
  const s = await open({ url: FILE_URL, init: `(${fakePicker.toString()})(${JSON.stringify({ files: [], ok: false })})` });
  assert.equal(await syncRowVisible(s.page), false);
  await s.close();
});

e2e('with the local server the picker button is never shown', async () => {
  state.listing = { exists: true, files: ['Claims.pdf'] };
  const s = await open(initPicker(['Claims.pdf']));
  assert.equal(await syncRowVisible(s.page), false);
  await s.close();
});

// ── Mappevelger: tillatelse, bytte av mappe, gamle svar ──
// Falske håndtak med tellere. dpInitFolderHandle tar imot en lesefunksjon, så
// det lagrede håndtaket kan mates inn uten IndexedDB (OPFS finnes ikke på file://).
const fakeHandle = (name, files, opts) => `(function() {
  const o = ${JSON.stringify(opts || {})};
  window.__perm = { query: 0, request: 0 };
  const kid = { kind: 'directory', name: '20261400',
    values() { let i = 0; const f = ${JSON.stringify(files)}; return { next: () => new Promise((r) => setTimeout(() => r(i < f.length ? { done: false, value: { kind: 'file', name: f[i++] } } : { done: true }), o.delay || 0)) }; } };
  return { kind: 'directory', name: ${JSON.stringify(name)},
    queryPermission() { window.__perm.query++; return Promise.resolve(o.state || 'granted'); },
    requestPermission() { window.__perm.request++; return Promise.resolve('granted'); },
    getDirectoryHandle(n) { return n === '20261400' ? Promise.resolve(kid) : Promise.reject(Object.assign(new Error('nf'), { name: 'NotFoundError' })); } };
})()`;

e2e('stored folder with permission already granted: the case syncs by itself when opened, with no dialog', async () => {
  const s = await open({ url: FILE_URL, files: [{ name: 'Claims.pdf' }] });
  await s.page.evaluate((h) => { dpInitFolderHandle((cb) => cb(null, eval(h))); }, fakeHandle('Saker', ['Claims.pdf', 'Auto.pdf']));
  await s.page.waitForTimeout(300);
  assert.deepEqual(await stored(s.page), ['Claims.pdf', 'Auto.pdf']);
  assert.equal(await s.page.evaluate(() => window.__perm.request), 0);
  await s.close();
});

e2e('stored folder that needs permission: opening a case never asks; the button click asks once, then syncs', async () => {
  const s = await open({ url: FILE_URL, files: [{ name: 'Claims.pdf' }] });
  await s.page.evaluate((h) => { dpInitFolderHandle((cb) => cb(null, eval(h))); }, fakeHandle('Saker', ['Claims.pdf', 'Click.pdf'], { state: 'prompt' }));
  await s.page.waitForTimeout(300);
  await s.page.evaluate((id) => navigateTo('sak/' + id), CASE_ID);
  await s.page.waitForTimeout(200);
  assert.equal(await s.page.evaluate(() => window.__perm.request), 0, 'no dialog from opening a case');
  assert.deepEqual(await stored(s.page), ['Claims.pdf'], 'no sync without permission');
  await s.page.click('#btn-sak-docs');
  assert.equal((await s.page.locator('#btn-sak-docs-sync-label').textContent()).trim(), 'Synk mappe');
  await s.page.click('#btn-sak-docs-sync');
  await s.page.waitForTimeout(300);
  assert.equal(await s.page.evaluate(() => window.__perm.request), 1);
  assert.deepEqual(await stored(s.page), ['Claims.pdf', 'Click.pdf']);
  await s.close();
});

e2e('changing folder while the first is still being read: the old answer is discarded', async () => {
  const picks = [fakeHandle('A', ['A.pdf'], { delay: 400 }), fakeHandle('B', ['B.pdf'])];
  const s = await open({ url: FILE_URL, files: [{ name: 'Claims.pdf' }],
    init: `(function() { const picks = [${picks.join(',')}]; window.showDirectoryPicker = () => Promise.resolve(picks.shift()); })()` });
  await s.page.click('#btn-sak-docs');
  await s.page.click('#btn-sak-docs-sync');     // velger A (leses sakte)
  await s.page.click('#btn-sak-docs-repick');   // velger B med en gang
  await s.page.waitForTimeout(900);
  const files = await stored(s.page);
  assert.equal(files.includes('B.pdf'), true, 'B is read');
  assert.equal(files.includes('A.pdf'), false, 'A arrived late and is ignored');
  await s.close();
});

e2e('a folder picked while the stored one is still loading is not overwritten by the old one', async () => {
  const s = await open({ url: FILE_URL });
  const handle = await s.page.evaluate(async (h) => {
    const NEW = eval(h), OLD = { name: 'old', queryPermission: () => Promise.resolve('granted') };
    _folderHandle = null;
    dpInitFolderHandle((cb) => setTimeout(() => cb(null, OLD), 200));
    _folderHandle = NEW;                       // brukeren velger før lagringen svarer
    await new Promise((r) => setTimeout(r, 400));
    return _folderHandle === NEW;
  }, fakeHandle('Ny', []));
  assert.equal(handle, true);
  await s.close();
});

e2e('picker mode: the "folder missing" message names the picked folder, not the Dokumentrot setting', async () => {
  const s = await open({ url: FILE_URL, root: 'S:\\Saker' });
  await s.page.evaluate((h) => { dpInitFolderHandle((cb) => cb(null, eval(h))); }, fakeHandle('ValgtRot', []));
  await s.page.evaluate(() => { _folderHandle.getDirectoryHandle = () => Promise.reject(Object.assign(new Error('nf'), { name: 'NotFoundError' })); _dpResync(); });
  await s.page.waitForTimeout(300);
  await s.page.click('#btn-sak-docs');
  const note = await s.page.locator('.sak-docs-note').textContent();
  assert.match(note, /ValgtRot/);
  assert.doesNotMatch(note, /S:/);
  await s.close();
});

e2e('picker mode: the button stays hidden until the stored folder has been read (no wrong label)', async () => {
  const s = await open({ url: FILE_URL });
  const before = await s.page.evaluate(() => {
    _folderLoaded = false; _folderHandle = null;
    dpInitFolderHandle(() => { /* svarer aldri */ });
    dpUpdateFolderButton();
    return document.getElementById('sak-docs-sync-row').hidden;
  });
  assert.equal(before, true);
  await s.close();
});
