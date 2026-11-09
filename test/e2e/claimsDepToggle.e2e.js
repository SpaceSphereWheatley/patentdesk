'use strict';
// Browser tests for "Avhengig av": empty field resets to automatic, the S/U
// toggle, and Enter/Tab navigation in the dep and note fields. The table is
// re-rendered when a dep changes, so focus can only be checked in a browser.
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

const DEP  = (n) => '#sak-claims-tbody .sak-dep-inp[data-claim-dep="' + n + '"]';
const TOG  = (n) => '#sak-claims-tbody .sak-dep-tog[data-claim-dep-tog="' + n + '"]';
const NOTE = (n) => '#sak-claims-tbody .sak-claim-note[data-claim="' + n + '"]';

function stored(page) {
  return page.evaluate((id) => JSON.parse(localStorage.getItem('pt_sak_' + id)).claims
    .map((c) => ({ dep: c.dep, manual: c.depManual })), h.CASE_ID);
}
function focused(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    return el ? (el.className + '|' + (el.dataset.claimDep || el.dataset.claimDepTog || el.dataset.claim || el.dataset.claimLabel || '')) : '';
  });
}

e2e('tømt felt nullstiller et manuelt krav til automatisk', async () => {
  const { page, close } = await h.openCase(browser, 1400);
  await page.fill(DEP(3), '2');
  await page.press(DEP(3), 'Enter');
  let s = await stored(page);
  assert.deepEqual(s[2], { dep: 2, manual: true });
  await page.fill(DEP(3), '');
  await page.press(DEP(3), 'Enter');
  s = await stored(page);
  assert.deepEqual(s[2], { dep: 1, manual: false });
  await close();
});

e2e('S/U-knappen bytter, gjør kravet manuelt og beholder fokus', async () => {
  const { page, close } = await h.openCase(browser, 1400);
  assert.equal(await page.textContent(TOG(4)), 'U');
  await page.click(TOG(4));
  const s = await stored(page);
  assert.deepEqual(s[3], { dep: null, manual: true });
  assert.equal(s[4].dep, 4, 'krav 5 følger det nye selvstendige kravet');
  assert.equal(await page.textContent(TOG(4)), 'S');
  assert.equal(await focused(page), 'sak-dep-tog dep-manual|4');
  await page.keyboard.press('Space');
  assert.deepEqual((await stored(page))[3], { dep: 1, manual: true });
  await close();
});

e2e('krav 1 har deaktivert S/U-knapp', async () => {
  const { page, close } = await h.openCase(browser, 1400);
  assert.equal(await page.isDisabled(TOG(1)), true);
  await close();
});

e2e('Enter i tallfeltet går til neste krav uten å låse automatiske krav', async () => {
  const { page, close } = await h.openCase(browser, 1400);
  await page.focus(DEP(2));
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  assert.equal(await focused(page), 'sak-dep-inp|4');
  assert.ok((await stored(page)).every((c) => !c.manual), 'ingen krav ble manuelle');
  await page.keyboard.type('2');
  await page.keyboard.press('Enter');
  assert.equal(await focused(page), 'sak-dep-inp|5');
  assert.deepEqual((await stored(page))[3], { dep: 2, manual: true });
  await close();
});

e2e('Tab etter endring går til S/U-knappen, så videre til Nyhet', async () => {
  const { page, close } = await h.openCase(browser, 1400);
  await page.fill(DEP(3), '2');
  await page.keyboard.press('Tab');
  assert.equal(await focused(page), 'sak-dep-tog dep-manual|3');
  await page.keyboard.press('Tab');
  const f = await page.evaluate(() => document.activeElement.dataset.field + '|' + document.activeElement.dataset.claim);
  assert.equal(f, 'novelty|3');
  await close();
});

e2e('Enter i notatfeltet lagrer og går til notatet på neste krav', async () => {
  const { page, close } = await h.openCase(browser, 1400);
  await page.fill(NOTE(4), 'hei');
  await page.press(NOTE(4), 'Enter');
  assert.equal(await focused(page), 'sak-claim-note|5');
  const notes = await page.evaluate((id) => JSON.parse(localStorage.getItem('pt_sak_' + id)).claims[3].notes, h.CASE_ID);
  assert.equal(notes, 'hei');
  await close();
});

e2e('Backspace i et tomt, manuelt selvstendig felt nullstiller til automatisk', async () => {
  const { page, close } = await h.openCase(browser, 1400);
  await page.click(TOG(3));                        // krav 3 → selvstendig, manuelt
  assert.deepEqual((await stored(page))[2], { dep: null, manual: true });
  await page.focus(DEP(3));
  await page.keyboard.press('Backspace');
  assert.deepEqual((await stored(page))[2], { dep: 1, manual: false });
  assert.equal(await focused(page), 'sak-dep-inp|3');
  await close();
});

e2e('ugyldig tegn i et manuelt felt tilbakestilles i stedet for å nullstille', async () => {
  const { page, close } = await h.openCase(browser, 1400);
  await page.fill(DEP(4), '2');
  await page.press(DEP(4), 'Enter');
  await page.focus(DEP(4));
  await page.keyboard.press('End');
  await page.keyboard.type('e');
  await page.keyboard.press('Enter');
  assert.deepEqual((await stored(page))[3], { dep: 2, manual: true });
  await close();
});

e2e('Tab fra krav 1 går til Nyhet', async () => {
  const { page, close } = await h.openCase(browser, 1400);
  await page.focus(DEP(1));
  await page.keyboard.press('Tab');
  const f = await page.evaluate(() => document.activeElement.dataset.field + '|' + document.activeElement.dataset.claim);
  assert.equal(f, 'novelty|1');
  await close();
});

e2e('Shift+Tab etter endring går til etiketten i samme rad', async () => {
  const { page, close } = await h.openCase(browser, 1400);
  await page.fill(DEP(3), '2');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await focused(page), 'sak-tag-display sak-tag-empty|3');
  await close();
});

e2e('Enter markerer innholdet i neste felt', async () => {
  const { page, close } = await h.openCase(browser, 1400);
  await page.focus(DEP(2));
  await page.keyboard.press('Enter');
  await page.keyboard.type('2');                   // erstatter markert «1»
  await page.keyboard.press('Enter');
  assert.deepEqual((await stored(page))[2], { dep: 2, manual: true });
  await close();
});
