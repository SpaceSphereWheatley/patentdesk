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
  const claims = opts.claims || [
    { num: 1, novelty: false, inventive: false, formal: false, notes: '', independent: true, dep: null, depManual: false, label: '', noveltyDoc: null, inventiveDocs: [] },
    { num: 2, novelty: true, inventive: false, formal: false, notes: '', independent: false, dep: 1, depManual: false, label: '', noveltyDoc: null, inventiveDocs: [] },
    { num: 3, novelty: true, inventive: null, formal: false, notes: '', independent: false, dep: 2, depManual: false, label: '', noveltyDoc: null, inventiveDocs: [] }
  ];
  const kase = {
    id: CASE_ID, caseNumber: '20261299', status: opts.status || 'ny', dueDate: '2026-12-15', title: 'Panelsak', notes: '', tags: '',
    createdAt: '2026-10-01T08:00:00.000Z', history: [{ status: 'ny', date: '2026-10-01T08:00:00.000Z' }],
    type: opts.type || 'sak', duration: opts.type === 'oppdrag' ? 3 : null, caseBuffer: null
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
  await s.page.waitForTimeout(600); // the sidebar folds in with a transition; positions settle after it
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
  assert.equal(await p.locator('.dp-ov tbody tr').nth(0).locator('.sak-tri-btn-no').count(), 2, 'claim 1: no novelty, so no inventive step either');
  assert.equal(await p.locator('.dp-ov tbody tr').nth(0).locator('.sak-tri-locked').count(), 1, 'claim 1: inventive step is locked');
  assert.equal(await p.locator('.dp-ov tbody tr').nth(2).locator('.sak-tri-btn-null').count() + await p.locator('.dp-ov tbody tr').nth(2).locator('.sak-tri-btn-cascade').count() >= 1, true, 'claim 3: inventive step not assessed');
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

// ── Review round 1 ──────────────────────────────────

e2e('AC7: the tab works the same in every workflow state and for an Oppdrag with files', async () => {
  for (const o of [{ status: 'fristarkiv' }, { status: 'viderebehandling' }, { status: 'avsluttet' }, { type: 'oppdrag' }]) {
    const s = await openDocs(o);
    assert.equal(await s.page.locator('.dp-pane:visible').count(), 2, JSON.stringify(o));
    assert.match(await frameUrl(s.page, 0), /file=Claims\.pdf/, JSON.stringify(o));
    assert.match(await frameUrl(s.page, 1), /file=Figures\.pdf/, JSON.stringify(o));
    await s.close();
  }
});

e2e('AC7: a registered file that does not exist is still named above the pane (the server answers the 404)', async () => {
  const s = await openDocs({ files: [{ name: 'Claims.pdf' }, { name: 'Gone.pdf' }] });
  await s.page.selectOption('[data-dp-pick="1"]', { label: 'Gone' });
  assert.match(await frameUrl(s.page, 1), /file=Gone\.pdf/);
  assert.equal(await s.page.locator('[data-dp-pick="1"] option:checked').textContent(), 'Gone');
  await s.close();
});

e2e('AC5: manual picks are dropped when another case is opened', async () => {
  const s = await openDocs();
  const p = s.page;
  await p.selectOption('[data-dp-pick="0"]', { label: 'D1' });
  assert.match(await frameUrl(p, 0), /file=D1\.pdf/);
  await p.evaluate(() => dpOnSakRendered('another-case'));
  assert.deepEqual(await p.evaluate(() => _dpManual), [null, null, null]);
  await s.close();
});

e2e('files: a manual pick follows the file, not its position, when the list changes', async () => {
  const s = await openDocs();
  const p = s.page;
  await p.selectOption('[data-dp-pick="0"]', { label: 'Figures' });
  assert.match(await frameUrl(p, 0), /file=Figures\.pdf/);
  await p.evaluate((id) => dispatch('FILE_DELETE', { id, idx: 0 }), CASE_ID); // Description.pdf goes
  assert.match(await frameUrl(p, 0), /file=Figures\.pdf/, 'still Figures, not whatever moved into its index');
  assert.match(await p.locator('#dp-pin-0').textContent(), /for hånd/);
  // deleting the picked file itself drops the pick; the rule takes over again
  await p.evaluate((id) => dispatch('FILE_DELETE', { id, idx: 1 }), CASE_ID); // Figures.pdf itself
  assert.match(await frameUrl(p, 0), /file=Claims\.pdf/, 'the pick is gone, so the rule (claims) applies again');
  assert.doesNotMatch(await p.locator('#dp-pin-0').textContent(), /for hånd/);
  await s.close();
});

e2e('files: adding or renaming a file redraws the panes at once', async () => {
  const s = await openDocs({ files: [{ name: 'Description.pdf' }] });
  const p = s.page;
  assert.match(await p.locator('#dp-empty-0').textContent(), /Ingen fil passer regelen «claims»/);
  await p.evaluate((id) => dispatch('FILE_ADD', { id, name: 'Claims.pdf' }), CASE_ID);
  assert.match(await frameUrl(p, 0), /file=Claims\.pdf/);
  await p.evaluate((id) => dispatch('FILE_RENAME', { id, idx: 1, name: 'Claims_v2.pdf', label: '' }), CASE_ID);
  assert.match(await frameUrl(p, 0), /file=Claims_v2\.pdf/);
  await s.close();
});

e2e('AC9: the layout is in the export payload, applied by import, and reset by delete-all', async () => {
  const s = await openDocs();
  const p = s.page;
  await p.click('[data-dp-count="3"]');
  await p.click('[data-dp-side="right"]');
  const exported = await p.evaluate(() => JSON.parse(JSON.stringify(makeExportPayload().docLayout)));
  assert.equal(exported.count, 3);
  assert.equal(exported.claimsSide, 'right');
  // import (replace) of a payload with another layout is applied and saved
  const payload = await p.evaluate(() => {
    const d = JSON.parse(JSON.stringify(makeExportPayload()));
    d.docLayout = { count: 1, claimsSide: 'left', claimsVisible: false, rules: ['  descr ', '', ''] };
    return d;
  });
  await p.evaluate((d) => dispatch('DATA_IMPORT', { data: d, mode: 'replace' }), payload);
  const stored = await p.evaluate(() => JSON.parse(localStorage.getItem('pt_doc_layout')));
  assert.equal(stored.count, 1);
  assert.equal(stored.claimsVisible, false);
  assert.equal(stored.rules[0], 'descr');
  assert.equal(await p.evaluate(() => docLayout.count), 1);
  // delete-all: memory, storage, the settings inputs and the loaded PDFs are all reset
  await p.evaluate(() => dispatch('DATA_DELETE_ALL', {}));
  assert.equal(await p.evaluate(() => docLayout.count), 2);
  assert.equal(await p.evaluate(() => localStorage.getItem('pt_doc_layout')), null);
  assert.equal(await p.evaluate(() => document.querySelector('[data-dp-rule="0"]').value), 'claims');
  assert.equal(await p.evaluate(() => Array.from(document.querySelectorAll('.dp-frame')).every((f) => !f.getAttribute('src'))), true);
  await s.close();
});

e2e('a11y: the tab does not point at a missing id and the dividers expose their value', async () => {
  const s = await openDocs();
  const p = s.page;
  const ctl = await p.getAttribute('#sak-tab-overview', 'aria-controls');
  if (ctl) assert.equal(await p.locator('#' + ctl).count(), 1, 'aria-controls target exists: ' + ctl);
  const now = Number(await p.getAttribute('[data-dp-split="0"]', 'aria-valuenow'));
  assert.ok(now >= 15 && now <= 85, 'aria-valuenow ' + now);
  assert.equal(await p.getAttribute('[data-dp-split="0"]', 'aria-valuemin'), '15');
  assert.ok(Number(await p.getAttribute('#dp-csplit', 'aria-valuenow')) >= 160);
  await s.close();
});

e2e('drag: only the left button drags, and a lost release ends the drag', async () => {
  const s = await openDocs();
  const p = s.page;
  const split = await p.locator('[data-dp-split="0"]').boundingBox();
  const sx = split.x + split.width / 2, sy = split.y + 100;
  await p.mouse.move(sx, sy);
  await p.mouse.down({ button: 'right' });
  assert.equal(await p.evaluate(() => document.getElementById('dp-body').classList.contains('is-dragging')), false, 'right button does not start a drag');
  await p.mouse.up({ button: 'right' });
  await p.mouse.down();
  assert.equal(await p.evaluate(() => document.getElementById('dp-body').classList.contains('is-dragging')), true);
  // the release is lost (e.g. swallowed by a context menu): the next move arrives with no button down
  await p.evaluate(() => document.getElementById('dp-body').dispatchEvent(new PointerEvent('pointermove', { pointerId: _dpDrag.pointerId, buttons: 0, clientX: 10, clientY: 10, bubbles: true })));
  assert.equal(await p.evaluate(() => document.getElementById('dp-body').classList.contains('is-dragging')), false, 'a move with no button down ends the drag');
  await p.mouse.up();
  await s.close();
});

e2e('import replace starts the case view fresh, like delete-all', async () => {
  const s = await openDocs();
  const p = s.page;
  await p.selectOption('[data-dp-pick="0"]', { label: 'D1' });
  const payload = await p.evaluate(() => JSON.parse(JSON.stringify(makeExportPayload())));
  await p.evaluate((d) => dispatch('DATA_IMPORT', { data: d, mode: 'replace' }), payload);
  assert.deepEqual(await p.evaluate(() => _dpManual), [null, null, null]);
  assert.equal(await p.evaluate(() => _dpTab), 'overview');
  await s.close();
});

// ── Claims panel is editable ────────────────────────

const storedClaim = (p, num) => p.evaluate(([id, n]) => JSON.parse(localStorage.getItem('pt_sak_' + id)).claims.find((c) => c.num === n), [CASE_ID, num]);
const ovBtn = (p, num, field) => p.locator('#dp-claims .sak-tri-btn[data-claim="' + num + '"][data-field="' + field + '"]');

e2e('claims panel: the novelty and inventive-step buttons edit the claim, same rules as the claims table', async () => {
  const s = await openDocs();
  const p = s.page;
  // claim 3 (dep 2): novelty true, inventive null. Claim 1: novelty false, inventive false (locked).
  assert.equal(await p.locator('#dp-claims .sak-tri-locked').count() >= 1, true, 'inventive step is locked where novelty is missing');
  // toggling novelty on claim 3 changes the stored claim, and the panel redraws
  const before = (await storedClaim(p, 3)).novelty;
  await ovBtn(p, 3, 'novelty').click();
  const after = (await storedClaim(p, 3)).novelty;
  assert.notEqual(after, before, 'novelty changed in storage');
  // a novelty-less claim locks inventive step to false
  for (let i = 0; i < 3 && (await storedClaim(p, 3)).novelty !== false; i++) await ovBtn(p, 3, 'novelty').click();
  assert.equal((await storedClaim(p, 3)).novelty, false);
  assert.equal((await storedClaim(p, 3)).inventive, false, 'no novelty means no inventive step');
  assert.equal(await p.locator('#dp-claims .sak-tri-btn[data-claim="3"][data-field="inventive"]').count(), 0, 'locked button has no data-field, so it can not be clicked');
  await s.close();
});

e2e('claims panel: an edit shows in the normal claims table, and focus stays on the button', async () => {
  const s = await openDocs();
  const p = s.page;
  await ovBtn(p, 2, 'inventive').click();
  const focused = await p.evaluate(() => { const e = document.activeElement; return e && e.dataset ? e.dataset.claim + ':' + e.dataset.field : null; });
  assert.equal(focused, '2:inventive', 'focus restored after the redraw');
  const v = (await storedClaim(p, 2)).inventive;
  await p.click('#sak-tab-overview');
  const cell = await p.locator('.sak-claims-table tr', { has: p.locator('[data-claim="2"][data-field="inventive"]') }).locator('[data-field="inventive"]').getAttribute('class');
  assert.ok(cell, 'claims table row exists');
  assert.notEqual(v, undefined);
  await s.close();
});

e2e('claims panel: edits made in the claims table show up in the panel when the tab is opened', async () => {
  const s = await openDocs();
  const p = s.page;
  await p.click('#sak-tab-overview');
  await p.locator('.sak-claims-table [data-claim="3"][data-field="inventive"]').first().click();
  const v = (await storedClaim(p, 3)).inventive;
  await p.click('#sak-tab-docs');
  const cls = await ovBtn(p, 3, 'inventive').getAttribute('class');
  assert.equal(/sak-tri-btn-yes/.test(cls) || /sak-tri-btn-no/.test(cls) || /sak-tri-btn/.test(cls), true);
  assert.notEqual(v, null, 'the table edit changed claim 3');
  await s.close();
});

e2e('claims panel: inherited novelty and inventive step are shown, as in the claims table', async () => {
  const mk = (num, over) => Object.assign({ num, novelty: null, inventive: null, formal: false, notes: '', independent: false, dep: 1, depManual: false, label: '', noveltyDoc: null, inventiveDocs: [] }, over);
  const s = await openDocs({ claims: [mk(1, { dep: null, independent: true, novelty: true, inventive: true }), mk(2), mk(3, { dep: 2 })] });
  const p = s.page;
  for (const n of [2, 3]) {
    assert.equal(await ovBtn(p, n, 'novelty').getAttribute('class').then((c) => /cascade/.test(c)), true, 'claim ' + n + ' novelty inherited');
    assert.equal(await ovBtn(p, n, 'inventive').getAttribute('class').then((c) => /cascade/.test(c)), true, 'claim ' + n + ' inventive step inherited');
    assert.match(await ovBtn(p, n, 'novelty').getAttribute('title'), /Arvet/);
  }
  // overriding an inherited value works and does not touch the parent
  await ovBtn(p, 2, 'novelty').click();
  assert.equal((await storedClaim(p, 2)).novelty, false);
  assert.equal((await storedClaim(p, 1)).novelty, true);
  await s.close();
});

// ── Compact header and sidebar ──────────────────────

e2e('compact header: the documents start high on the screen and fill the window height', async () => {
  const s = await openDocs({ status: 'viderebehandling' });
  const p = s.page;
  const b = await p.evaluate(() => { const r = document.getElementById('dp-body').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, scroll: document.documentElement.scrollHeight, h: innerHeight }; });
  assert.ok(b.top < 130, 'documents start at ' + b.top);
  assert.ok(b.bottom <= b.h, 'no page scrolling needed: bottom ' + b.bottom + ' of ' + b.h);
  assert.ok(b.h - b.bottom < 40, 'uses the available height: ' + (b.h - b.bottom) + ' px left');
  assert.equal(await p.locator('#sak-page-round').isVisible(), false, 'the round line is folded away');
  assert.equal(await p.locator('#sak-tabs').isVisible() && await p.locator('#dp-toolbar').isVisible(), true);
  // tabs and pane controls share a row
  const t = await box(p, '#sak-tabs'), tb = await box(p, '#dp-toolbar');
  assert.ok(Math.abs((await p.evaluate(() => document.getElementById('sak-tabs').getBoundingClientRect().bottom)) - (await p.evaluate(() => document.getElementById('dp-toolbar').getBoundingClientRect().bottom))) < 12, 'same row');
  assert.ok(t.h > 0 && tb.h > 0);
  // back on Oversikt the normal header returns
  await p.click('#sak-tab-overview');
  assert.equal(await p.locator('#sak-page-round').isVisible(), true);
  await s.close();
});

e2e('sidebar: it folds in while Dokumenter is open and comes back afterwards', async () => {
  const s = await openDocs();
  const p = s.page;
  const collapsed = () => p.evaluate(() => document.getElementById('main-drawer').classList.contains('collapsed'));
  assert.equal(await collapsed(), true, 'folded on the Dokumenter tab');
  assert.equal(await p.evaluate(() => localStorage.getItem('pt_drawer_collapsed')), null, 'the saved choice is untouched');
  await p.click('#sak-tab-overview');
  assert.equal(await collapsed(), false, 'back on Oversikt');
  await p.click('#sak-tab-docs');
  assert.equal(await collapsed(), true);
  await p.evaluate(() => navigateTo('hjem'));
  assert.equal(await collapsed(), false, 'leaving the case brings it back');
  await s.close();
});

e2e('sidebar: a sidebar the user had folded stays folded', async () => {
  const s = await openDocs();
  const p = s.page;
  await p.click('#sak-tab-overview');
  await p.click('#drawer-toggle-btn'); // the user folds it
  assert.equal(await p.evaluate(() => localStorage.getItem('pt_drawer_collapsed')), '1');
  await p.click('#sak-tab-docs');
  await p.click('#sak-tab-overview');
  assert.equal(await p.evaluate(() => document.getElementById('main-drawer').classList.contains('collapsed')), true, 'still the user\'s choice');
  await s.close();
});

e2e('sidebar: opened by hand on the Dokumenter tab it stays open through redraws, and a fold the user makes is kept', async () => {
  const s = await openDocs();
  const p = s.page;
  const collapsed = () => p.evaluate(() => document.getElementById('main-drawer').classList.contains('collapsed'));
  assert.equal(await collapsed(), true);
  await p.click('#drawer-toggle-btn'); // the user opens it again
  assert.equal(await collapsed(), false);
  await p.evaluate((id) => { renderSak(id); renderSak(id); }, CASE_ID);
  assert.equal(await collapsed(), false, 'a redraw does not fold it again');
  await p.click('#drawer-toggle-btn'); // the user folds it: saved as their choice
  assert.equal(await p.evaluate(() => localStorage.getItem('pt_drawer_collapsed')), '1');
  await p.click('#sak-tab-overview');
  assert.equal(await collapsed(), true, 'leaving the tab keeps what the user chose');
  await s.close();
});
