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
const TOG  = (n) => '#sak-claims-tbody .sak-num-tog[data-claim-dep-tog="' + n + '"]';
const TRI  = (n, f) => '#sak-claims-tbody .sak-tri-btn[data-claim="' + n + '"][data-field="' + f + '"]';
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

e2e('kravnummeret bytter selvstendig/uselvstendig, gjør kravet manuelt og beholder fokus', async () => {
  const { page, close } = await h.openCase(browser, 1400);
  assert.equal(await page.locator('#sak-claims-tbody .sak-dep-tog').count(), 0, 'S/U-knappen er borte');
  assert.equal((await page.textContent(TOG(4))).trim(), '4');
  assert.equal(await page.getAttribute(TOG(4), 'class'), 'sak-num-tog');
  await page.click(TOG(4));
  const s = await stored(page);
  assert.deepEqual(s[3], { dep: null, manual: true });
  assert.equal(s[4].dep, 4, 'krav 5 følger det nye selvstendige kravet');
  assert.equal(await page.getAttribute(TOG(4), 'class'), 'sak-num-tog is-indep');
  assert.equal(await focused(page), 'sak-num-tog is-indep|4');
  await page.keyboard.press('Space');
  assert.deepEqual((await stored(page))[3], { dep: 1, manual: true });
  await close();
});

e2e('krav 1 kan ikke byttes og vises som selvstendig', async () => {
  const { page, close } = await h.openCase(browser, 1400);
  assert.equal(await page.isDisabled(TOG(1)), true);
  assert.match(await page.getAttribute(TOG(1), 'class'), /is-indep/);
  await close();
});

e2e('S i tastaturmodus bytter kravet markøren står på', async () => {
  const { page, close } = await h.openCase(browser, 1400);
  await page.focus(TRI(4, 'novelty'));
  await page.keyboard.press('s');
  assert.deepEqual((await stored(page))[3], { dep: null, manual: true });
  const f = await page.evaluate(() => document.activeElement.dataset.field + '|' + document.activeElement.dataset.claim);
  assert.equal(f, 'novelty|4', 'fokus blir på samme felt');
  await page.keyboard.press('S');
  assert.deepEqual((await stored(page))[3], { dep: 1, manual: true });
  await page.focus(TRI(1, 'novelty'));
  await page.keyboard.press('s');
  assert.deepEqual((await stored(page))[0], { dep: null, manual: false }, 'krav 1 endres ikke');
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

e2e('Tab etter endring går rett til Nyhet', async () => {
  const { page, close } = await h.openCase(browser, 1400);
  await page.fill(DEP(3), '2');
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

// ── Nullstill-knappen (↺) ───────────────────────────
const RESET = (n) => '#sak-claims-tbody .sak-dep-reset[data-claim-dep-reset="' + n + '"]';

e2e('↺ vises bare på manuelle krav, aldri på krav 1', async () => {
  const { page, close } = await h.openCase(browser, 1400);
  assert.equal(await page.locator('#sak-claims-tbody .sak-dep-reset').count(), 0, 'ingen knapp når alt er automatisk');
  await page.fill(DEP(4), '2');                    // manuelt uselvstendig
  await page.press(DEP(4), 'Enter');
  await page.click(TOG(3));                        // manuelt selvstendig
  assert.equal(await page.locator(RESET(4)).count(), 1);
  assert.equal(await page.locator(RESET(3)).count(), 1);
  assert.equal(await page.locator(RESET(2)).count(), 0);
  assert.equal(await page.locator(RESET(1)).count(), 0);
  assert.equal(await page.isVisible(RESET(4)), true, 'knappen er synlig uten hover');
  await close();
});

e2e('klikk på ↺ setter kravet tilbake til automatisk og gir fokus til feltet', async () => {
  const { page, close } = await h.openCase(browser, 1400);
  await page.click(TOG(3));                        // krav 3 selvstendig; 4 og 5 følger
  assert.equal((await stored(page))[4].dep, 3);
  await page.click(RESET(3));
  const s = await stored(page);
  assert.deepEqual(s[2], { dep: 1, manual: false });
  assert.equal(s[4].dep, 1, 'påfølgende automatiske krav følger med');
  assert.equal(await page.locator(RESET(3)).count(), 0, 'knappen forsvinner');
  assert.doesNotMatch(await page.getAttribute(DEP(3), 'class'), /dep-manual/);
  assert.equal(await focused(page), 'sak-dep-inp|3');
  await close();
});

e2e('↺ har ingen Tab-stopp: Tab fra Avh. av går fortsatt til Nyhet', async () => {
  const { page, close } = await h.openCase(browser, 1400);
  await page.fill(DEP(4), '2');
  await page.press(DEP(4), 'Enter');
  assert.equal(await page.getAttribute(RESET(4), 'tabindex'), '-1');
  await page.focus(DEP(4));
  await page.keyboard.press('Tab');
  const f = await page.evaluate(() => document.activeElement.dataset.field + '|' + document.activeElement.dataset.claim);
  assert.equal(f, 'novelty|4');
  await close();
});

// ── Markørrammen følger fokus ───────────────────────
// Rammen rundt cellen viser at tabellen eier tastene. Når fokus forlater
// tabellen (klikk utenfor), skal rammen bort; det uthevede kravet blir stående.
function cursorFrameShown(page) {
  return page.evaluate(() => {
    const td = document.querySelector('#sak-claims-tbody .sak-claim-active-cell');
    return !!td && getComputedStyle(td).boxShadow !== 'none';
  });
}

e2e('markørrammen forsvinner når fokus forlater tabellen etter Tab fra Avh. av', async () => {
  const { page, close } = await h.openCase(browser, 1400);
  await page.fill(DEP(3), '2');
  await page.keyboard.press('Tab');
  assert.equal(await cursorFrameShown(page), true, 'rammen vises mens fokus er i tabellen');
  await page.mouse.click(5, 5);
  assert.equal(await cursorFrameShown(page), false, 'rammen er borte etter klikk utenfor');
  await page.focus(TRI(3, 'novelty'));
  assert.equal(await cursorFrameShown(page), true, 'rammen kommer tilbake når fokus går inn igjen');
  await close();
});

e2e('markørrammen forsvinner også etter klikk på en ja/nei-knapp og så utenfor', async () => {
  const { page, close } = await h.openCase(browser, 1400);
  await page.click(TRI(5, 'novelty'));
  assert.equal(await cursorFrameShown(page), true);
  await page.mouse.click(5, 5);
  assert.equal(await cursorFrameShown(page), false);
  await close();
});
