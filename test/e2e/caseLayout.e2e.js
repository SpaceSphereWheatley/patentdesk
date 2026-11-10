'use strict';
// Browser tests for "Case page, work first": folded checklists, one Notater
// block, header meta line, claims empty state, and claims table on the first
// screen. NOT part of `npm test`; run with: node --test test/e2e/*.e2e.js

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('./claimsNotesHarness');
const { CASE_ID } = h;

let chromium = null;
let browser = null;
let skipReason = null;
try { ({ chromium } = require('playwright')); } catch (e) { skipReason = 'playwright not installed'; }
before(async () => {
  if (skipReason) return;
  try { browser = await chromium.launch(); }
  catch (e) { skipReason = 'Chromium could not be launched: ' + String(e.message || e).split('\n')[0]; }
});
after(async () => { if (browser) await browser.close(); });
function e2e(name, fn) {
  test(name, async (t) => { if (skipReason) { t.skip(skipReason); return; } await fn(t); });
}
const open = (w, opts) => h.openCase(browser, w, opts);

e2e('AC1: Vurdering, Gransking, Saken in that order on screen', async () => {
  const s = await open(1440);
  const order = await s.page.evaluate(() => Array.from(document.querySelectorAll('.sak-phase')).map((p) => p.dataset.phase));
  assert.deepEqual(order, ['vurdering', 'gransking', 'saken']);
  await s.close();
});

e2e('claims table is on the first screen at 1440x900', async () => {
  const s = await open(1440);
  await s.page.evaluate(() => window.scrollTo(0, 0));
  const top = await s.page.evaluate(() => document.querySelector('.sak-claims-table tbody tr').getBoundingClientRect().top);
  assert.ok(top < 900, 'first claim row top = ' + top);
  await s.close();
});

e2e('AC4: folds start closed, open on click, ticking updates the count', async () => {
  const s = await open(1440);
  const p = s.page;
  const fold = p.locator('.sak-fold[data-fold="forberedelse"]');
  const head = fold.locator('.sak-fold-head');
  assert.equal(await head.getAttribute('aria-expanded'), 'false');
  assert.equal(await fold.locator('.sak-fold-body').isHidden(), true);
  const controls = await head.getAttribute('aria-controls');
  assert.equal(await p.locator('#' + controls).count(), 1);
  const total = await fold.locator('.sak-checkbox').count();
  assert.match(await fold.locator('.sak-fold-count').textContent(), new RegExp('^0 / ' + total + '$'));
  await head.click();
  assert.equal(await head.getAttribute('aria-expanded'), 'true');
  await fold.locator('.sak-checkbox').first().check();
  assert.match(await fold.locator('.sak-fold-count').textContent(), new RegExp('^1 / ' + total + '$'));
  // the summary card follows the tick (35 items in the default template)
  assert.match(await p.locator('#sak-prog-checklist-pct').textContent(), /^1 \/ \d+$/);
  // open state survives a re-render
  await p.evaluate((id) => navigateTo('hjem') || navigateTo('sak/' + id), CASE_ID);
  await p.evaluate((id) => navigateTo('sak/' + id), CASE_ID);
  assert.equal(await p.locator('.sak-fold[data-fold="forberedelse"] .sak-fold-head').getAttribute('aria-expanded'), 'true');
  await s.close();
});

e2e('checklist group titles are still headings', async () => {
  const s = await open(1440);
  const n = await s.page.locator('h2.sak-fold-h .sak-fold-head').count();
  assert.ok(n >= 3, 'headings: ' + n);
  await s.close();
});

e2e('AC7: both notes fields keep storage; the toggle shows one at a time', async () => {
  const s = await open(1440);
  const p = s.page;
  await p.fill('#sak-case-notes', 'synlig tekst');
  await p.click('.sak-seg-btn[data-notes="int"]');
  assert.equal(await p.locator('#sak-case-notes').isHidden(), true);
  await p.fill('#sak-notes', 'intern tekst');
  const stored = await p.evaluate((id) => ({
    vis: JSON.parse(localStorage.getItem('pt_cases'))[0].notes,
    int: JSON.parse(localStorage.getItem('pt_sak_' + id)).sakNotes
  }), CASE_ID);
  assert.deepEqual(stored, { vis: 'synlig tekst', int: 'intern tekst' });
  // dot on the hidden tab follows typing
  assert.equal(await p.locator('.sak-seg-btn[data-notes="vis"]').evaluate((b) => b.classList.contains('has-text')), true);
  await p.click('.sak-seg-btn[data-notes="vis"]');
  await p.fill('#sak-case-notes', '');
  await p.click('.sak-seg-btn[data-notes="int"]');
  assert.equal(await p.locator('.sak-seg-btn[data-notes="vis"]').evaluate((b) => b.classList.contains('has-text')), false);
  // opening a case resets the view to «Synlig i oversikten»
  await p.evaluate((id) => { navigateTo('hjem'); navigateTo('sak/' + id); }, CASE_ID);
  assert.equal(await p.locator('#sak-case-notes').isVisible(), true);
  assert.equal(await p.locator('.sak-seg-btn[data-notes="vis"]').getAttribute('aria-pressed'), 'true');
  await s.close();
});

e2e('AC9: new controls are keyboard reachable with a visible focus ring', async () => {
  const s = await open(1440);
  const p = s.page;
  for (const sel of ['.sak-fold-head', '.sak-seg-btn']) {
    await p.focus(sel);
    const ring = await p.evaluate((q) => {
      const cs = getComputedStyle(document.querySelector(q));
      return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
    }, sel);
    assert.equal(ring, true, sel + ' needs a focus ring');
  }
  await s.close();
});

e2e('AC10: hostile title is rendered as text in the header meta line', async () => {
  const s = await open(1440);
  const p = s.page;
  await p.evaluate(() => {
    const c = cases[0];
    c.title = '<img src=x onerror="window.__pwned=1">';
    renderSakMeta(c);
  });
  assert.equal(await p.locator('#sak-meta-line img').count(), 0);
  assert.match(await p.locator('#sak-meta-line').textContent(), /<img src=x/);
  assert.equal(await p.evaluate(() => window.__pwned), undefined);
  await s.close();
});

e2e('AC5: zero claims shows an empty state, not an empty table', async () => {
  const s = await open(1440, { numClaims: 0 });
  const p = s.page;
  assert.equal(await p.locator('#sak-claims-empty').isVisible(), true);
  assert.equal(await p.locator('.sak-claims-table').isVisible(), false);
  await p.click('#btn-claims-empty-set');
  assert.equal(await p.evaluate(() => document.activeElement.id), 'sak-num-claims');
  await s.close();
});

e2e('AC3: oppdrag shows no claim sections and no phase of only hidden sections', async () => {
  const s = await open(1440, { type: 'oppdrag' });
  const p = s.page;
  assert.equal(await p.locator('.sak-claims-table').isVisible(), false);
  assert.equal(await p.locator('#sak-phase-vurdering').isVisible(), false);
  assert.match(await p.locator('#sak-meta-line').textContent(), /Varighet 3 arb\.dager/);
  assert.equal(await p.locator('#sak-phase-gransking').isVisible(), false);
  assert.equal(await p.locator('.sak-fold').count(), 0);
  assert.equal(await p.locator('#sak-case-notes').isVisible(), true);
  await s.close();
});

e2e('meta line: only the title is styled as a title; empty fields are hidden', async () => {
  const s = await open(1440);
  const p = s.page;
  const sizes = await p.evaluate(() => {
    const c = cases[0];
    const out = {};
    const d = loadSakData(c.id); d.filingDate = '2026-01-02'; saveSakData(c.id, d);
    c.title = '';
    renderSakMeta(c);
    const spans = Array.from(document.querySelectorAll('#sak-meta-line span'));
    out.noTitle = spans.map((x) => ({ t: x.textContent, fs: getComputedStyle(x).fontSize }));
    c.title = 'En tittel';
    renderSakMeta(c);
    const sp2 = Array.from(document.querySelectorAll('#sak-meta-line span'));
    out.withTitle = sp2.map((x) => ({ t: x.textContent, fs: getComputedStyle(x).fontSize }));
    return out;
  });
  assert.ok(sizes.noTitle.length >= 2, 'need two spans to compare: ' + JSON.stringify(sizes.noTitle));
  const small = sizes.noTitle[0].fs;
  assert.ok(sizes.noTitle.every((x) => x.fs === small), 'no span is title-sized without a title: ' + JSON.stringify(sizes.noTitle));
  assert.ok(sizes.noTitle.every((x) => !x.t.includes('—')), 'no placeholders: ' + JSON.stringify(sizes.noTitle));
  assert.notEqual(sizes.withTitle[0].fs, sizes.withTitle[1].fs, 'title is larger than the other fields');
  await s.close();
});
