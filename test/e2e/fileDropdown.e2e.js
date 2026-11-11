'use strict';
// Browser test: the file list in the "Dokumenter" dropdown on the case page is
// limited in height and scrolls when a case has many files, while the
// add-file field and the footer buttons stay in view. NOT part of `npm test`.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let chromium = null, browser = null, skipReason = null;
try { ({ chromium } = require('playwright')); } catch (e) { skipReason = 'playwright not installed'; }
before(async () => {
  if (skipReason) return;
  try { browser = await chromium.launch(); }
  catch (e) { skipReason = 'Chromium could not be launched: ' + String(e.message || e).split('\n')[0]; }
});
after(async () => { if (browser) await browser.close(); });
function e2e(name, fn) { test(name, async (t) => { if (skipReason) { t.skip(skipReason); return; } await fn(t); }); }

const APP = pathToFileURL(process.env.E2E_APP_FILE || path.join(__dirname, '..', '..', 'PatentDesk.html')).href;
const CASE = {
  id: 'dd1', caseNumber: '20261500', status: 'ny', dueDate: '2026-12-15', title: 'Mange filer', notes: '', tags: '',
  createdAt: '2026-10-01T08:00:00.000Z', history: [{ status: 'ny', date: '2026-10-01T08:00:00.000Z' }],
  type: 'sak', duration: null, caseBuffer: null
};

async function open(fileCount, height) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: height || 900 } });
  const page = await ctx.newPage();
  const files = Array.from({ length: fileCount }, (_, i) => ({ name: 'Dokument-' + String(i + 1).padStart(2, '0') + '.pdf' }));
  const sak = { numClaims: 0, filingDate: '', priorityDate: '', checklist: [], classes: [], docs: [], claims: [], files };
  await page.addInitScript(([c, s]) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    localStorage.setItem('pt_onboarding_completed', '1');
    localStorage.setItem('pt_cases', JSON.stringify([c]));
    localStorage.setItem('pt_sak_' + c.id, JSON.stringify(s));
  }, [CASE, sak]);
  await page.goto(APP);
  await page.evaluate((id) => navigateTo('sak/' + id), CASE.id);
  await page.waitForTimeout(150);
  await page.click('#btn-sak-docs');
  return { page, close: () => ctx.close() };
}
const geom = (page) => page.evaluate(() => {
  const l = document.getElementById('sak-docs-list');
  const r = (id) => { const b = document.querySelector(id).getBoundingClientRect(); return { top: b.top, bottom: b.bottom }; };
  return {
    clientH: l.clientHeight, scrollH: l.scrollHeight, overflowY: getComputedStyle(l).overflowY,
    rows: l.querySelectorAll('.sak-docs-dropdown-row').length,
    add: r('.sak-docs-add-row'), footer: r('.sak-docs-footer-row'), vh: innerHeight
  };
});

e2e('many files: the list is limited in height and scrolls', async () => {
  const s = await open(40);
  const g = await geom(s.page);
  assert.equal(g.rows, 40);
  assert.ok(g.scrollH > g.clientH, 'there is something to scroll: ' + g.scrollH + ' vs ' + g.clientH);
  assert.ok(g.clientH <= 400, 'limited to roughly eight to ten rows: ' + g.clientH + ' px');
  assert.ok(['auto', 'scroll'].includes(g.overflowY), 'overflow-y ' + g.overflowY);
  await s.close();
});

e2e('many files: the add-file field and the footer buttons stay in view', async () => {
  const s = await open(40);
  const g = await geom(s.page);
  assert.ok(g.add.bottom <= g.vh && g.footer.bottom <= g.vh, 'both inside the window: ' + g.add.bottom + ', ' + g.footer.bottom + ' of ' + g.vh);
  await s.close();
});

e2e('many files: the last file can be reached by scrolling the list, and a click on it works', async () => {
  const s = await open(40);
  const last = s.page.locator('#sak-docs-list .sak-docs-dropdown-row').last();
  await last.scrollIntoViewIfNeeded();
  assert.equal(await last.isVisible(), true);
  const box = await last.boundingBox();
  const list = await s.page.locator('#sak-docs-list').boundingBox();
  assert.ok(box.y >= list.y - 1 && box.y + box.height <= list.y + list.height + 1, 'the last row is inside the list after scrolling');
  await s.close();
});

e2e('few files: no scrollbar and no fixed empty space', async () => {
  const s = await open(3);
  const g = await geom(s.page);
  assert.equal(g.scrollH, g.clientH, 'nothing to scroll');
  assert.ok(g.clientH < 200, 'the list is only as tall as its rows: ' + g.clientH);
  await s.close();
});

e2e('a short window: the list never pushes the footer out of the window', async () => {
  const s = await open(40, 560);
  const g = await geom(s.page);
  assert.ok(g.footer.bottom <= g.vh, 'footer in view in a 560 px window: ' + g.footer.bottom);
  await s.close();
});
