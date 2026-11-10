'use strict';
// Browser tests for the "Dokumenter" tab (document panes). NOT part of
// `npm test`; run with: node --test test/e2e/docPanes.e2e.js
// The app is served from a small local node server on http://localhost so the
// panes see the same origin rules as Start-PatentDesk.ps1: the server records
// every /docs request with its Sec-Fetch-Site header, which the real server
// requires to be same-origin or none.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let chromium = null;
let browser = null;
let skipReason = null;
try { ({ chromium } = require('playwright')); } catch (e) { skipReason = 'playwright not installed'; }

const APP_FILE = process.env.E2E_APP_FILE || path.join(__dirname, '..', '..', 'PatentDesk.html');
const MINI_PDF = Buffer.from('%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');

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
    } else if (url.pathname === '/docs') {
      docRequests.push({ file: url.searchParams.get('file'), site: req.headers['sec-fetch-site'] });
      res.writeHead(200, { 'Content-Type': 'application/pdf' });
      res.end(MINI_PDF);
    } else { res.writeHead(404); res.end(); }
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

const CASE_ID = 'e2edocs';
const FILES = [{ name: 'Description.pdf' }, { name: 'Claims.pdf' }, { name: 'Figures.pdf' }, { name: 'D1.pdf' }, { name: 'Notes.docx' }];

function seedFor(opts) {
  const claims = [
    { num: 1, novelty: false, inventive: false, formal: false, notes: '', independent: true, dep: null, depManual: false, label: '', noveltyDoc: null, inventiveDocs: [] },
    { num: 2, novelty: true, inventive: false, formal: false, notes: '', independent: false, dep: 1, depManual: false, label: '', noveltyDoc: null, inventiveDocs: [] },
    { num: 3, novelty: true, inventive: null, formal: false, notes: '', independent: false, dep: 2, depManual: false, label: '', noveltyDoc: null, inventiveDocs: [] }
  ];
  const kase = {
    id: CASE_ID, caseNumber: '20261299', status: 'ny', dueDate: '2026-12-15', title: 'Panelsak', notes: '', tags: '',
    createdAt: '2026-10-01T08:00:00.000Z', history: [{ status: 'ny', date: '2026-10-01T08:00:00.000Z' }],
    type: 'sak', duration: null, caseBuffer: null
  };
  const sak = { numClaims: 3, filingDate: '', priorityDate: '', checklist: [], classes: [], docs: [], claims: claims, files: opts.files };
  return { cases: JSON.stringify([kase]), sak: JSON.stringify(sak) };
}

async function openCase(url, opts) {
  opts = Object.assign({ files: FILES }, opts || {});
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const s = seedFor(opts);
  await page.addInitScript(([id, cs, sak, layout]) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    localStorage.setItem('pt_onboarding_completed', '1');
    localStorage.setItem('pt_schema_version', '8');
    localStorage.setItem('pt_cases', cs);
    localStorage.setItem('pt_sak_' + id, sak);
    if (layout) localStorage.setItem('pt_doc_layout', layout);
  }, [CASE_ID, s.cases, s.sak, opts.layout || null]);
  await page.goto(url);
  await page.evaluate((id) => { navigateTo('sak/' + id); }, CASE_ID);
  await page.waitForTimeout(100);
  return { page, close: () => ctx.close() };
}
const openDocs = async (opts) => {
  docRequests = [];
  const s = await openCase(base + '/PatentDesk.html', opts);
  await s.page.click('#sak-tab-docs');
  await s.page.waitForTimeout(100);
  return s;
};
const frameUrl = (p, i) => p.evaluate((k) => document.getElementById('dp-frame-' + k).getAttribute('src'), i);
const box = (p, sel) => p.evaluate((q) => { const r = document.querySelector(q).getBoundingClientRect(); return { x: r.x, w: r.width, h: r.height }; }, sel);

e2e('AC1: the Dokumenter tab hides the case page and shows two panes by default', async () => {
  const s = await openDocs();
  const p = s.page;
  assert.equal(await p.locator('#sak-viewer').isVisible(), true);
  assert.equal(await p.locator('.sak-phase').first().isVisible(), false, 'the normal case page is hidden');
  assert.equal(await p.locator('#sak-tab-docs').getAttribute('aria-selected'), 'true');
  assert.equal(await p.locator('.dp-pane:visible').count(), 2);
  await p.click('#sak-tab-overview');
  assert.equal(await p.locator('#sak-viewer').isVisible(), false);
  assert.equal(await p.locator('.sak-phase').first().isVisible(), true);
  await s.close();
});

e2e('AC4: slot rules fill the panes; requests are same-origin like the real server demands', async () => {
  const s = await openDocs();
  assert.match(await frameUrl(s.page, 0), /file=Claims\.pdf/);
  assert.match(await frameUrl(s.page, 1), /file=Figures\.pdf/);
  await s.page.waitForTimeout(300);
  assert.ok(docRequests.length >= 2, 'the frames requested their files');
  docRequests.forEach((r) => assert.equal(r.site, 'same-origin', 'Sec-Fetch-Site for ' + r.file));
  await s.close();
});

e2e('AC4/5: three panes; the third is empty until picked, and only PDFs are offered', async () => {
  const s = await openDocs();
  const p = s.page;
  await p.click('[data-dp-count="3"]');
  assert.equal(await p.locator('.dp-pane:visible').count(), 3);
  assert.match(await p.locator('#dp-empty-2').textContent(), /Velg en fil over/);
  const opts = await p.locator('[data-dp-pick="2"] option').allTextContents();
  assert.ok(!opts.some((t) => /Notes/.test(t)), 'a .docx is not offered: ' + opts.join('|'));
  await p.selectOption('[data-dp-pick="2"]', { label: 'D1' });
  assert.match(await frameUrl(p, 2), /file=D1\.pdf/);
  assert.match(await p.locator('#dp-pin-2').textContent(), /for hånd/);
  await p.click('[data-dp-count="1"]');
  assert.equal(await p.locator('.dp-pane:visible').count(), 1);
  await s.close();
});

e2e('AC5: choosing Automatisk again goes back to the rule', async () => {
  const s = await openDocs();
  const p = s.page;
  await p.selectOption('[data-dp-pick="0"]', { label: 'D1' });
  assert.match(await frameUrl(p, 0), /file=D1\.pdf/);
  await p.selectOption('[data-dp-pick="0"]', { value: '' });
  assert.match(await frameUrl(p, 0), /file=Claims\.pdf/);
  await s.close();
});

e2e('AC7: no files and no matching rule give a clear empty state', async () => {
  let s = await openDocs({ files: [] });
  assert.match(await s.page.locator('#dp-empty-0').textContent(), /Ingen filer registrert/);
  await s.close();
  s = await openDocs({ files: [{ name: 'Description.pdf' }] });
  assert.match(await s.page.locator('#dp-empty-0').textContent(), /Ingen fil passer regelen «claims»/);
  await s.close();
});

e2e('claims panel: overview shows novelty and inventive step; side and hide work without reloading the frames', async () => {
  const s = await openDocs();
  const p = s.page;
  const rows = await p.locator('.dp-ov tbody tr').allTextContents();
  assert.equal(rows.length, 3);
  assert.match(rows[0], /1/);
  assert.match(rows[1], /2.*→ 1/);
  assert.equal(await p.locator('.dp-ov tbody tr').nth(0).locator('.dp-no').count(), 2, 'claim 1: no novelty, no inventive step');
  assert.equal(await p.locator('.dp-ov tbody tr').nth(2).locator('.dp-unk').count(), 1, 'claim 3: inventive step not assessed');
  await p.waitForTimeout(300);
  const before = docRequests.length;
  let c = await box(p, '#dp-claims'), pn = await box(p, '#dp-panes');
  assert.ok(c.x < pn.x, 'claims on the left by default');
  await p.click('[data-dp-side="right"]');
  c = await box(p, '#dp-claims'); pn = await box(p, '#dp-panes');
  assert.ok(c.x > pn.x, 'claims on the right');
  await p.click('#dp-claims-toggle');
  assert.equal(await p.locator('#dp-claims').isVisible(), false);
  assert.match(await p.locator('#dp-claims-toggle').textContent(), /Vis krav/);
  await p.click('#dp-claims-toggle');
  assert.equal(await p.locator('#dp-claims').isVisible(), true);
  await p.waitForTimeout(300);
  assert.equal(docRequests.length, before, 'moving or hiding the claims panel did not reload any PDF');
  await s.close();
});

e2e('layout is remembered: reloading keeps count, side and hidden claims panel', async () => {
  const s = await openDocs();
  const p = s.page;
  await p.click('[data-dp-count="3"]');
  await p.click('[data-dp-side="right"]');
  await p.click('#dp-claims-toggle');
  const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('pt_doc_layout')));
  assert.equal(stored.count, 3);
  assert.equal(stored.claimsSide, 'right');
  assert.equal(stored.claimsVisible, false);
  await p.reload();
  await p.evaluate((id) => { navigateTo('sak/' + id); }, CASE_ID);
  await p.click('#sak-tab-docs');
  assert.equal(await p.locator('.dp-pane:visible').count(), 3);
  assert.equal(await p.locator('#dp-claims').isVisible(), false);
  await s.close();
});

e2e('widths: dragging a divider resizes the panes, respects the minimum, and is remembered', async () => {
  const s = await openDocs();
  const p = s.page;
  const split = await p.locator('[data-dp-split="0"]').boundingBox();
  const sx = split.x + split.width / 2, sy = split.y + 100;
  const w0 = await box(p, '.dp-pane[data-dp-pane="0"]');
  await p.mouse.move(sx, sy);
  await p.mouse.down();
  await p.mouse.move(sx + 150, sy, { steps: 5 });
  assert.equal(await p.evaluate(() => document.getElementById('dp-body').classList.contains('is-dragging')), true, 'iframes are shielded while dragging');
  await p.mouse.up();
  assert.equal(await p.evaluate(() => document.getElementById('dp-body').classList.contains('is-dragging')), false);
  const w1 = await box(p, '.dp-pane[data-dp-pane="0"]');
  assert.ok(w1.w > w0.w + 100, 'left pane grew: ' + w0.w + ' -> ' + w1.w);
  const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('pt_doc_layout')).widths['2']);
  assert.ok(stored[0] > 0.5 && Math.abs(stored[0] + stored[1] - 1) < 1e-6);
  // dragging far past the edge stops at the minimum
  const split2 = await p.locator('[data-dp-split="0"]').boundingBox();
  await p.mouse.move(split2.x + 3, sy);
  await p.mouse.down();
  await p.mouse.move(split2.x + 3 + 3000, sy, { steps: 5 });
  await p.mouse.up();
  const paneW = await box(p, '.dp-pane[data-dp-pane="1"]');
  const total = (await box(p, '#dp-panes')).w;
  assert.ok(paneW.w >= total * 0.15 - 6, 'right pane keeps its minimum: ' + paneW.w);
  // double-click resets
  await p.locator('[data-dp-split="0"]').dblclick();
  const w2 = await box(p, '.dp-pane[data-dp-pane="0"]');
  const w3 = await box(p, '.dp-pane[data-dp-pane="1"]');
  assert.ok(Math.abs(w2.w - w3.w) < 4, 'equal again after double-click');
  await s.close();
});

e2e('widths: the claims panel can be resized and reset', async () => {
  const s = await openDocs();
  const p = s.page;
  const sp = await p.locator('#dp-csplit').boundingBox();
  const sx = sp.x + sp.width / 2, sy = sp.y + 100;
  await p.mouse.move(sx, sy);
  await p.mouse.down();
  await p.mouse.move(sx + 80, sy, { steps: 4 });
  await p.mouse.up();
  const w = (await box(p, '#dp-claims')).w;
  assert.ok(w > 300 && w <= 480, 'claims panel widened: ' + w);
  await p.locator('#dp-csplit').dblclick();
  assert.ok(Math.abs((await box(p, '#dp-claims')).w - 250) < 3);
  await s.close();
});

e2e('settings: a slot rule changes which file the panel gets', async () => {
  const s = await openDocs();
  const p = s.page;
  await p.evaluate(() => navigateTo('innstillinger'));
  await p.click('#settings-tab-saksbehandling');
  await p.fill('[data-dp-rule="0"]', 'descr');
  await p.locator('[data-dp-rule="0"]').dispatchEvent('change');
  const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('pt_doc_layout')).rules);
  assert.equal(stored[0], 'descr');
  await p.evaluate((id) => navigateTo('sak/' + id), CASE_ID);
  await p.click('#sak-tab-docs');
  assert.match(await frameUrl(p, 0), /file=Description\.pdf/);
  await s.close();
});

e2e('AC2: opened as a plain file, the tab explains that the server is needed', async () => {
  docRequests = [];
  const s = await openCase(pathToFileURL(APP_FILE).href);
  await s.page.click('#sak-tab-docs');
  assert.equal(await s.page.locator('#dp-notice').isVisible(), true);
  assert.match(await s.page.locator('#dp-notice').textContent(), /Start-PatentDesk/);
  assert.equal(await s.page.locator('#dp-body').isVisible(), false);
  assert.equal(await s.page.locator('iframe.dp-frame:visible').count(), 0);
  await s.close();
});

e2e('returning to the same case keeps the Dokumenter tab', async () => {
  const s = await openDocs();
  const p = s.page;
  await p.evaluate(() => navigateTo('hjem'));
  await p.evaluate((id) => navigateTo('sak/' + id), CASE_ID);
  assert.equal(await p.locator('#sak-viewer').isVisible(), true, 'same case: tab is kept');
  await s.close();
});
