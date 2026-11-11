'use strict';
// Browser tests for Mothold og granskingsrapport: the Detaljer | Rapport
// switch, the D flag, and that the Bakgrunn button is gone.
//
// NOT part of `npm test`. Run with:  node --test test/e2e/*.e2e.js
// If Playwright or Chromium is unavailable, every test is skipped, not failed.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./claimsNotesHarness');

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

const LIST = '#sak-docs-mothold';
const VIEW = (v) => '.sak-seg-btn[data-mh-view="' + v + '"]';

e2e('Rapport viser én linje per mothold og skjuler knappene', async () => {
  const { page, close } = await h.openCase(browser, 1400);
  assert.equal(await page.locator(LIST + ' .mh-bg-toggle').count(), 0, 'ingen Bakgrunn-knapp');
  assert.equal(await page.locator(LIST + ' .mh-row').first().locator('[data-flag]').count(), 3, 'P, E og D');
  await page.click(VIEW('report'));
  assert.equal(await page.locator(LIST + ' .mr-row').count(), 2);
  assert.equal(await page.locator(LIST + ' .mh-row').count(), 0);
  assert.equal(await page.locator(LIST + ' [data-mh-edit], ' + LIST + ' [data-flag], ' + LIST + ' input').count(), 0);
  assert.equal(await page.locator('#btn-mothold-add').isVisible(), false, '«Legg til mothold» skjult');
  // Fiksturen: D1 er X for krav 2 og Y for krav 1
  assert.match(await page.locator(LIST + ' .mr-row').first().textContent(), /X 2Y 1/);
  assert.equal(await page.getAttribute(VIEW('report'), 'aria-pressed'), 'true');
  await close();
});

e2e('valget huskes etter omlasting og gjelder andre saker', async () => {
  const { page, close } = await h.openCase(browser, 1400);
  await page.click(VIEW('report'));
  assert.equal(await page.evaluate(() => localStorage.getItem('pt_mh_view')), 'report');
  await page.reload();
  await page.evaluate((id) => { navigateTo('sak/' + id); }, h.CASE_ID);
  await page.waitForTimeout(150);
  assert.equal(await page.locator(LIST + ' .mr-row').count(), 2);
  // En annen sak åpnes også i Rapport
  await page.evaluate(() => {
    const cs = JSON.parse(localStorage.getItem('pt_cases'));
    cs.push(Object.assign({}, cs[0], { id: 'e2eother', caseNumber: '20261236' }));
    localStorage.setItem('pt_cases', JSON.stringify(cs));
    const sak = JSON.parse(localStorage.getItem('pt_sak_' + cs[0].id));
    sak.docs = [{ id: 'D1', ref: 'US 1' }];
    sak.claims.forEach((c) => { c.noveltyDoc = null; c.inventiveDocs = []; });
    localStorage.setItem('pt_sak_e2eother', JSON.stringify(sak));
    cases = loadCases(); navigateTo('sak/e2eother');
  });
  await page.waitForTimeout(150);
  assert.equal(await page.locator(LIST + ' .mr-row').count(), 1);
  assert.equal(await page.getAttribute(VIEW('report'), 'aria-pressed'), 'true');
  await close();
});

e2e('D-nummeret i Rapport går til motholdet i Detaljer', async () => {
  const { page, close } = await h.openCase(browser, 1400);
  await page.click(VIEW('report'));
  await page.click(LIST + ' [data-mh-goto="1"]');
  assert.equal(await page.locator(LIST + ' .mh-row').count(), 2);
  assert.equal(await page.getAttribute(VIEW('full'), 'aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement.closest('.mh-row').dataset.idx), '1');
  await close();
});

e2e('D-flagget lagres og gir X,D / Y,D i begge visningene', async () => {
  const { page, close } = await h.openCase(browser, 1400);
  await page.click(LIST + ' .mh-row[data-idx="0"] [data-flag="d"]');
  const d = await page.evaluate((id) => JSON.parse(localStorage.getItem('pt_sak_' + id)).docs[0].d, h.CASE_ID);
  assert.equal(d, true);
  assert.match(await page.locator(LIST + ' .mh-row[data-idx="0"] .mh-cats').textContent(), /X,D 2Y,D 1/);
  await page.click(VIEW('report'));
  assert.match(await page.locator(LIST + ' .mr-row').first().textContent(), /X,D 2Y,D 1/);
  await close();
});

e2e('nytt mothold fra tom sak åpner Detaljer', async () => {
  const { page, close } = await h.openCase(browser, 1400);
  await page.click(VIEW('report'));
  await page.evaluate((id) => {
    const s = JSON.parse(localStorage.getItem('pt_sak_' + id)); s.docs = [];
    s.claims.forEach((c) => { c.noveltyDoc = null; c.inventiveDocs = []; });
    localStorage.setItem('pt_sak_' + id, JSON.stringify(s)); navigateTo('sak/' + id);
  }, h.CASE_ID);
  await page.waitForTimeout(150);
  await page.click('#btn-mh-empty-add');
  assert.equal(await page.locator(LIST + ' .mh-row').count(), 1);
  assert.equal(await page.getAttribute(VIEW('full'), 'aria-pressed'), 'true');
  await close();
});
