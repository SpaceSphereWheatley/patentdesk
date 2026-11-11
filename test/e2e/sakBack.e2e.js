'use strict';
// Browser test: the "Tilbake" button on the case page must always leave the
// case, also when the case was opened straight from the address (no earlier
// page in the history). NOT part of `npm test`.

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
  id: 'backcase', caseNumber: '20261301', status: 'ny', dueDate: '2026-12-15', title: 'Tilbake-sak', notes: '', tags: '',
  createdAt: '2026-10-01T08:00:00.000Z', history: [{ status: 'ny', date: '2026-10-01T08:00:00.000Z' }],
  type: 'sak', duration: null, caseBuffer: null
};

async function newPage(url) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript((cs) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    localStorage.setItem('pt_onboarding_completed', '1');
    localStorage.setItem('pt_cases', JSON.stringify([cs]));
  }, CASE);
  await page.goto(url);
  await page.waitForTimeout(150);
  return { page, close: () => ctx.close() };
}
const hash = (p) => p.evaluate(() => location.hash);

e2e('Tilbake after opening the case from a list goes back to that list', async () => {
  const s = await newPage(APP + '#alle-saker');
  await s.page.evaluate(() => navigateTo('sak/backcase'));
  assert.match(await hash(s.page), /^#sak\//);
  await s.page.click('#btn-sak-back');
  await s.page.waitForTimeout(150);
  assert.equal(await hash(s.page), '#alle-saker');
  await s.close();
});

e2e('Tilbake on a case opened straight from the address leaves the case (no history to go back to)', async () => {
  const s = await newPage(APP + '#sak/20261301');
  assert.equal(await s.page.locator('#view-sak').isVisible(), true, 'the case page is open');
  await s.page.click('#btn-sak-back');
  await s.page.waitForTimeout(200);
  assert.equal(await s.page.locator('#view-sak').isVisible(), false, 'the case page is closed');
  assert.equal(await hash(s.page), '#hjem');
  await s.close();
});

e2e('Tilbake still goes back after a reload of the case page', async () => {
  const s = await newPage(APP + '#alle-saker');
  await s.page.evaluate(() => navigateTo('sak/backcase'));
  await s.page.reload();
  await s.page.waitForTimeout(150);
  assert.equal(await s.page.locator('#view-sak').isVisible(), true);
  await s.page.click('#btn-sak-back');
  await s.page.waitForTimeout(200);
  assert.equal(await hash(s.page), '#alle-saker');
  await s.close();
});
