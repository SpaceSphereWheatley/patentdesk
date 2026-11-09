'use strict';
// Browser tests for "kopier mothold fra kravet over": the button in the
// prior-art picker and the C shortcut in the claims table.
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

// Fixture (claimsNotesHarness, 12 claims). Claims 3–5 have novelty (inherited
// from claim 1) and no inventive-step verdict yet; setInvFalse marks them ✗.
const CHIP = (n, f) => '#sak-claims-tbody [data-doc-pop="' + n + '"][data-field="' + f + '"]';
const TRI  = (n, f) => '#sak-claims-tbody .sak-tri-btn[data-claim="' + n + '"][data-field="' + f + '"]';
async function setInvFalse(page, nums) {
  for (const n of nums) {
    await page.focus(TRI(n, 'inventive'));
    await page.keyboard.press('n');
  }
}
const docsOf = (page, n) => page.evaluate(([id, num]) => {
  const c = JSON.parse(localStorage.getItem('pt_sak_' + id)).claims[num - 1];
  return { nov: c.noveltyDoc, inv: c.inventiveDocs };
}, [h.CASE_ID, n]);

e2e('knappen «Som krav n» i velgeren erstatter valget med kravet over', async () => {
  const { page, close } = await h.openCase(browser, 1400);
  await setInvFalse(page, [3, 4]);
  await page.click(CHIP(3, 'inventive'));
  await page.click('#sak-claims-tbody .doc-pop [data-doc-pick="D2"]');   // krav 3: D2
  await page.click(CHIP(4, 'inventive'));
  const btn = page.locator('#sak-claims-tbody .doc-pop-copy');
  assert.equal((await btn.textContent()).trim(), '⧉ Som krav 3 (D2)');
  await btn.click();
  assert.deepEqual((await docsOf(page, 4)).inv, ['D2']);
  assert.equal(await page.locator('#sak-claims-tbody .doc-pop').count(), 0, 'velgeren lukkes etter kopiering');
  await page.click(CHIP(4, 'inventive'));
  assert.equal(await page.locator('#sak-claims-tbody .doc-pop-copy').count(), 0, 'knappen vises ikke når valget er likt');
  await close();
});

e2e('c i tastaturmodus kopierer, og j c j c går nedover', async () => {
  const { page, close } = await h.openCase(browser, 1400);
  await setInvFalse(page, [3, 4, 5]);
  await page.click(CHIP(3, 'inventive'));
  await page.click('#sak-claims-tbody .doc-pop [data-doc-pick="D1"]');
  await page.keyboard.press('Escape');
  await page.focus(TRI(4, 'inventive'));
  await page.keyboard.press('c');
  await page.keyboard.press('j');
  await page.keyboard.press('c');
  assert.deepEqual((await docsOf(page, 4)).inv, ['D1']);
  assert.deepEqual((await docsOf(page, 5)).inv, ['D1']);
  await close();
});

e2e('c gjør ingenting når feltet ikke er ✗', async () => {
  const { page, close } = await h.openCase(browser, 1400);
  // Krav 3 og 4 har nyhet (arvet fra krav 1) — ingen velger, ingen kopiering.
  await page.evaluate((id) => {
    const d = JSON.parse(localStorage.getItem('pt_sak_' + id));
    d.claims[2].noveltyDoc = 'D1';
    localStorage.setItem('pt_sak_' + id, JSON.stringify(d));
  }, h.CASE_ID);
  await page.focus(TRI(4, 'novelty'));
  await page.keyboard.press('c');
  assert.equal((await docsOf(page, 4)).nov, null);
  await close();
});

e2e('snarveioversikten nevner C, Enter, Tab og Backspace', async () => {
  const { page, close } = await h.openCase(browser, 1400);
  const txt = await page.textContent('#shortcuts-backdrop');
  assert.match(txt, /Kopier mothold fra kravet over/);
  assert.match(txt, /Lagre og gå til samme felt på neste krav/);
  assert.match(txt, /tilbake til automatisk/);
  await close();
});
