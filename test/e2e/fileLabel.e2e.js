'use strict';
// Browser tests for eget visningsnavn på saksdokumenter: the two-field edit
// row in the Dokumenter dropdown (Navn + Filnavn).
//
// NOT part of `npm test`. Run with:  node --test test/e2e/*.e2e.js
// If Playwright or Chromium is unavailable, every test is skipped, not failed.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

let chromium = null;
let browser = null;
let skipReason = null;

try { ({ chromium } = require('playwright')); }
catch (e) { skipReason = 'playwright not installed'; }

before(async () => {
  if (skipReason) return;
  try { browser = await chromium.launch(); }
  catch (e) { skipReason = 'Chromium could not be launched: ' + String(e.message || e).split('\n')[0]; }
});

after(async () => { if (browser) await browser.close(); });

function e2e(name, fn) {
  test(name, async (t) => {
    if (skipReason) { t.skip(skipReason); return; }
    await fn(t);
  });
}

const APP_URL = 'file://' + path.join(__dirname, '..', '..', 'PatentDesk.html');
const ID = 'c1';
const LONG = '(ISA_237) Written Opinion of the International Searching Authority - corrected version.pdf';

async function openCase(files) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const kase = { id: ID, caseNumber: 'NO20240001', status: 'ny', dueDate: '2026-12-15', title: 'T', notes: '',
    tags: '', createdAt: '2026-03-01T10:00:00.000Z', history: [], type: 'sak', duration: null, caseBuffer: null };
  const sak = { numClaims: 0, checklist: {}, classes: [], docs: [], claims: [], rounds: [], files };
  await page.addInitScript(([cs, sd]) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    localStorage.setItem('pt_onboarding_completed', '1');
    localStorage.setItem('pt_schema_version', '8');
    localStorage.setItem('pt_cases', cs);
    localStorage.setItem('pt_sak_c1', sd);
  }, [JSON.stringify([kase]), JSON.stringify(sak)]);
  await page.goto(APP_URL);
  await page.evaluate((id) => { navigateTo('sak/' + id); }, ID);
  await page.waitForTimeout(150);
  await page.click('#btn-sak-docs');
  return { page, errors, close: () => ctx.close() };
}
const storedFiles = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('pt_sak_c1')).files);
const openText = (page, i) => page.locator('.sak-docs-open[data-idx="' + i + '"]').textContent();

e2e('blyanten: Navn settes, Tab til Filnavn lagrer ikke, Enter lagrer (AK 2, 4)', async () => {
  const { page, errors, close } = await openCase([{ name: LONG }]);
  await page.click('.sak-docs-rename[data-idx="0"]');
  await page.fill('.sak-docs-label-input', 'WO - ISA');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(50);
  assert.equal(await page.locator('.sak-docs-edit').count(), 1, 'redigeringen er fortsatt åpen');
  assert.equal(await page.evaluate(() => document.activeElement.classList.contains('sak-docs-name-input')), true);
  await page.keyboard.press('Enter');
  assert.deepEqual(await storedFiles(page), [{ name: LONG, label: 'WO - ISA' }]);
  assert.match(await openText(page, 0), /WO - ISA$/);
  assert.equal(await page.locator('.sak-docs-open[data-idx="0"]').getAttribute('title'), LONG);
  assert.deepEqual(errors, []);
  await close();
});

e2e('Esc avbryter uten å lagre (AK 4)', async () => {
  const { page, close } = await openCase([{ name: 'Claims.pdf', label: 'Krav' }]);
  await page.click('.sak-docs-rename[data-idx="0"]');
  await page.fill('.sak-docs-label-input', 'Noe annet');
  await page.fill('.sak-docs-name-input', 'Annet.pdf');
  await page.keyboard.press('Escape');
  assert.deepEqual(await storedFiles(page), [{ name: 'Claims.pdf', label: 'Krav' }]);
  assert.match(await openText(page, 0), /Krav$/);
  await close();
});

e2e('tomt Navn gir filnavnet tilbake; uendret langt filnavn beholdes helt (AK 5)', async () => {
  const { page, close } = await openCase([{ name: LONG, label: 'WO - ISA' }]);
  await page.click('.sak-docs-rename[data-idx="0"]');
  await page.fill('.sak-docs-label-input', '');
  await page.keyboard.press('Enter');
  assert.deepEqual(await storedFiles(page), [{ name: LONG }]);
  assert.match(await openText(page, 0), /corrected version$/);
  await close();
});

e2e('åpne og forlate redigering uten endring lagrer ingenting', async () => {
  const { page, close } = await openCase([{ name: LONG }]);
  const before = await page.evaluate(() => localStorage.getItem('pt_sak_c1'));
  await page.click('.sak-docs-rename[data-idx="0"]');
  await page.click('h1, body', { position: { x: 1200, y: 700 } });
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => localStorage.getItem('pt_sak_c1')), before);
  await close();
});
