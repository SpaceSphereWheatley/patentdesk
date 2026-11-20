'use strict';
// Browser tests for reading .md files: in a document pane and in a new tab
// from the case file list. NOT part of `npm test`; run with:
// node --test test/e2e/markdown.e2e.js
// The local node server acts like Start-PatentDesk.ps1: non-PDF documents are
// sent as downloads (Content-Disposition: attachment), and /docs answers only
// same-origin or address-bar requests.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

let chromium = null;
let browser = null;
let skipReason = null;
try { ({ chromium } = require('playwright')); } catch (e) { skipReason = 'playwright not installed'; }

const APP_FILE = process.env.E2E_APP_FILE || path.join(__dirname, '..', '..', 'PatentDesk.html');
const SHOT_DIR = process.env.E2E_SHOT_DIR || '';

const NOTES_MD = '# Notater 20261299\n\n## Krav 1\n\n- D1 viser **trekk 1a–1c**\n- [ ] sjekk *D2*\n- [x] formalia\n\n' +
  '> Søker hevder at trekk 1d er nytt.\n\n| Krav | D1 | D2 |\n|:-----|:--:|:--:|\n| 1 | X | Y |\n| 2 | X | A |\n\n' +
  '```\nkrav 1: En anordning omfattende …\n```\n\nSe [EPO](https://www.epo.org) og `kode`.\n';
const EVIL_MD = '# Farlig\n\n<script>window.top.__pwned = 1; parent.__pwned = 1;</script>\n\n' +
  '<img src=x onerror="parent.__pwned=1">\n\n[klikk](javascript:parent.__pwned=1)\n';

let server = null;
let base = '';
let docRequests = [];

before(async () => {
  if (skipReason) return;
  try { browser = await chromium.launch(); }
  catch (e) { skipReason = 'Chromium could not be launched: ' + String(e.message || e).split('\n')[0]; return; }
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/PatentDesk.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(APP_FILE));
      return;
    }
    if (url.pathname !== '/docs') { res.writeHead(404); res.end(); return; }
    const file = url.searchParams.get('file');
    const site = req.headers['sec-fetch-site'];
    docRequests.push({ file, site });
    if (site !== 'same-origin' && site !== 'none') { res.writeHead(403); res.end('Ingen tilgang'); return; }
    const body = { 'notater.md': NOTES_MD, 'farlig.md': EVIL_MD, 'stor.md': 'x'.repeat(2 * 1024 * 1024 + 10) }[file];
    if (file === 'Claims.pdf') {
      res.writeHead(200, { 'Content-Type': 'text/html' }); // headless Chromium downloads real PDFs
      res.end('<p>Claims</p>');
    } else if (body !== undefined) {
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': "attachment; filename*=UTF-8''" + file, 'X-Content-Type-Options': 'nosniff' });
      res.end(body);
    } else { res.writeHead(404); res.end('Fant ikke filen'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = 'http://localhost:' + server.address().port;
});
after(async () => {
  if (browser) await browser.close();
  if (server) server.close();
});
function e2e(name, fn) {
  test(name, async (t) => { if (skipReason) { t.skip(skipReason); return; } await fn(t); });
}

const CASE_ID = 'e2emd';
const FILES = [{ name: 'Claims.pdf' }, { name: 'notater.md' }, { name: 'farlig.md' }, { name: 'borte.md' }, { name: 'stor.md' }, { name: 'Notes.docx' }];

async function openCase(opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: opts.scale || 1 });
  const page = await ctx.newPage();
  const kase = {
    id: CASE_ID, caseNumber: '20261299', status: opts.status || 'ny', dueDate: '2026-12-15', title: 'Markdownsak', notes: '', tags: '',
    createdAt: '2026-10-01T08:00:00.000Z', history: [{ status: 'ny', date: '2026-10-01T08:00:00.000Z' }],
    type: opts.type || 'sak', duration: opts.type === 'oppdrag' ? 3 : null, caseBuffer: null
  };
  const sak = { numClaims: 1, filingDate: '', priorityDate: '', checklist: [], classes: [], docs: [],
    claims: [{ num: 1, novelty: null, inventive: null, formal: false, notes: '', independent: true, dep: null, depManual: false, label: '', noveltyDoc: null, inventiveDocs: [] }],
    files: opts.files || FILES };
  await page.addInitScript(([id, cs, s]) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    localStorage.setItem('pt_onboarding_completed', '1');
    localStorage.setItem('pt_schema_version', '8');
    localStorage.setItem('pt_cases', cs);
    localStorage.setItem('pt_sak_' + id, s);
  }, [CASE_ID, JSON.stringify([kase]), JSON.stringify(sak)]);
  await page.goto(base + '/PatentDesk.html');
  await page.evaluate((id) => { navigateTo('sak/' + id); }, CASE_ID);
  await page.waitForTimeout(100);
  return { ctx, page, close: () => ctx.close() };
}
async function openDocs(opts) {
  docRequests = [];
  const s = await openCase(opts);
  await s.page.click('#sak-tab-docs');
  await s.page.waitForTimeout(600);
  return s;
}
async function pickMd(p, slot, label) {
  await p.selectOption('[data-dp-pick="' + slot + '"]', { label });
  await p.waitForFunction((k) => document.getElementById('dp-frame-' + k).hasAttribute('srcdoc'), slot);
  await p.waitForTimeout(150);
}
const paneFrame = (p, slot) => p.frameLocator('#dp-frame-' + slot);

e2e('AC4: .md files are offered in the pane picker (docx still is not) and render formatted', async () => {
  const s = await openDocs({ scale: SHOT_DIR ? 2 : 1 });
  const p = s.page;
  const opts = await p.locator('[data-dp-pick="1"] option').allTextContents();
  assert.ok(opts.includes('notater.md'), opts.join('|'));
  assert.ok(!opts.some((t) => /Notes/.test(t)), 'docx not offered');
  await pickMd(p, 1, 'notater.md');
  const f = paneFrame(p, 1);
  assert.equal(await f.locator('h1').textContent(), 'Notater 20261299');
  assert.equal(await f.locator('strong').first().textContent(), 'trekk 1a–1c');
  assert.equal(await f.locator('table th').count(), 3);
  assert.equal(await f.locator('blockquote').count(), 1);
  assert.equal(await f.locator('li.md-task').count(), 2);
  assert.equal(await f.locator('a').getAttribute('href'), 'https://www.epo.org');
  const attrs = await p.evaluate(() => { const fr = document.getElementById('dp-frame-1'); return { src: fr.getAttribute('src'), sandbox: fr.getAttribute('sandbox'), md: fr.classList.contains('dp-frame-md') }; });
  assert.equal(attrs.src, null, 'shown from srcdoc, not loaded as a download');
  assert.equal(attrs.sandbox, 'allow-popups allow-popups-to-escape-sandbox');
  assert.equal(attrs.md, true);
  assert.match(await p.locator('#dp-pin-1').textContent(), /for hånd/);
  docRequests.forEach((r) => assert.equal(r.site, 'same-origin', 'Sec-Fetch-Site for ' + r.file));
  if (SHOT_DIR) await p.screenshot({ path: path.join(SHOT_DIR, 'md-pane.png') });
  await s.close();
});

e2e('AC2: HTML and javascript: links in a .md file never run', async () => {
  const s = await openDocs();
  const p = s.page;
  await pickMd(p, 1, 'farlig.md');
  const f = paneFrame(p, 1);
  assert.equal(await f.locator('script').count(), 0);
  assert.equal(await f.locator('img').count(), 0);
  assert.equal(await f.locator('a').count(), 0, 'javascript: link is plain text');
  assert.match(await f.locator('body').textContent(), /<script>window\.top\.__pwned/);
  assert.equal(await p.evaluate(() => window.__pwned), undefined);
  await s.close();
});

e2e('AC5/8: the hand-picked .md survives a re-render; switching to a PDF drops the sandbox', async () => {
  const s = await openDocs();
  const p = s.page;
  await pickMd(p, 1, 'notater.md');
  const n0 = docRequests.length;
  await p.click('#dp-claims-toggle');
  await p.click('#dp-claims-toggle');
  await p.waitForTimeout(200);
  assert.equal(docRequests.length, n0, 'no refetch on re-render');
  assert.equal(await paneFrame(p, 1).locator('h1').textContent(), 'Notater 20261299');
  await p.selectOption('[data-dp-pick="1"]', { label: 'Claims' });
  await p.waitForTimeout(300);
  const attrs = await p.evaluate(() => { const fr = document.getElementById('dp-frame-1'); return { src: fr.getAttribute('src'), sandbox: fr.hasAttribute('sandbox'), srcdoc: fr.hasAttribute('srcdoc'), md: fr.classList.contains('dp-frame-md') }; });
  assert.match(attrs.src, /file=Claims\.pdf/);
  assert.deepEqual([attrs.sandbox, attrs.srcdoc, attrs.md], [false, false, false]);
  await s.close();
});

e2e('AC6: a missing file and a too large file show a message in the pane', async () => {
  const s = await openDocs();
  const p = s.page;
  await pickMd(p, 1, 'borte.md');
  assert.equal(await paneFrame(p, 1).locator('.md-problem').textContent(), 'Kunne ikke lese filen (404).');
  await pickMd(p, 1, 'stor.md');
  assert.equal(await paneFrame(p, 1).locator('.md-problem').textContent(), 'Filen er for stor til å vises.');
  await s.close();
});

e2e('Tilbake: loading a .md into a pane adds no history entry', async () => {
  const s = await openDocs();
  const p = s.page;
  const len0 = await p.evaluate(() => history.length);
  await pickMd(p, 1, 'notater.md');
  await pickMd(p, 1, 'farlig.md');
  assert.equal(await p.evaluate(() => history.length), len0);
  await p.click('#btn-sak-back');
  await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => activePage), 'hjem');
  await s.close();
});

e2e('AC7: clicking a .md in the file list opens a new tab with the formatted text', async () => {
  const s = await openCase({ scale: SHOT_DIR ? 2 : 1 });
  const p = s.page;
  await p.click('#btn-sak-docs');
  const [tab] = await Promise.all([
    s.ctx.waitForEvent('page'),
    p.locator('.sak-docs-open', { hasText: 'notater.md' }).click()
  ]);
  await tab.waitForURL(/^blob:/);
  await tab.waitForTimeout(200);
  assert.equal(await tab.title(), 'notater.md');
  const inner = tab.frameLocator('iframe');
  assert.equal(await inner.locator('h1').textContent(), 'Notater 20261299');
  assert.equal(await tab.locator('iframe').getAttribute('sandbox'), 'allow-popups allow-popups-to-escape-sandbox');
  assert.equal(await tab.evaluate(() => window.opener), null);
  if (SHOT_DIR) await tab.screenshot({ path: path.join(SHOT_DIR, 'md-tab.png') });
  await s.close();
});

e2e('AC2/7: a dangerous .md opened in a tab runs nothing', async () => {
  const s = await openCase();
  const p = s.page;
  await p.click('#btn-sak-docs');
  const [tab] = await Promise.all([
    s.ctx.waitForEvent('page'),
    p.locator('.sak-docs-open', { hasText: 'farlig.md' }).click()
  ]);
  await tab.waitForURL(/^blob:/);
  await tab.waitForTimeout(200);
  assert.equal(await tab.frameLocator('iframe').locator('h1').textContent(), 'Farlig');
  assert.equal(await tab.evaluate(() => window.__pwned), undefined);
  assert.equal(await p.evaluate(() => window.__pwned), undefined);
  await s.close();
});

e2e('AC8: a PDF in the file list is still a plain link to /docs', async () => {
  const s = await openCase();
  const p = s.page;
  await p.click('#btn-sak-docs');
  const [tab] = await Promise.all([
    s.ctx.waitForEvent('page'),
    p.locator('.sak-docs-open', { hasText: 'Claims' }).click()
  ]);
  await tab.waitForLoadState();
  assert.match(tab.url(), /\/docs\?.*file=Claims\.pdf/);
  await s.close();
});

e2e('AC9: works the same for an Oppdrag and a Fristarkiv case', async () => {
  for (const o of [{ type: 'oppdrag', status: 'ny' }, { status: 'fristarkiv' }]) {
    const s = await openDocs(o);
    await pickMd(s.page, 1, 'notater.md');
    assert.equal(await paneFrame(s.page, 1).locator('h1').textContent(), 'Notater 20261299', JSON.stringify(o));
    await s.close();
  }
});
