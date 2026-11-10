'use strict';
// Browser test: the text in the deadline strip ("Din frist") shares one baseline.
// NOT part of `npm test`; run with: node --test test/e2e/*.e2e.js

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP_URL = pathToFileURL(process.env.E2E_APP_FILE || path.join(__dirname, '..', '..', 'PatentDesk.html')).href;
let chromium = null, browser = null, skipReason = null;
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

function seedCase(over) {
  return Object.assign({
    id: 'fb', caseNumber: '20261299', status: 'ny', dueDate: '2099-12-15', title: 'Frist',
    notes: '', tags: '', createdAt: '2026-10-01T08:00:00.000Z',
    history: [{ status: 'ny', date: '2026-10-01T08:00:00.000Z' }], type: 'sak', duration: null, caseBuffer: 1
  }, over || {});
}

async function openStrip(width, over) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript((cs) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    localStorage.setItem('pt_onboarding_completed', '1');
    localStorage.setItem('pt_schema_version', '7');
    localStorage.setItem('pt_cases', cs);
  }, JSON.stringify([seedCase(over)]));
  await page.goto(APP_URL);
  await page.evaluate(() => navigateTo('sak/fb'));
  await page.waitForTimeout(150);
  return { page, close: () => ctx.close() };
}

// Baseline (px from page top) of the first line of text in each element, via a
// zero-size inline probe; probes are removed again.
function baselines(page, selectors) {
  return page.evaluate((sels) => {
    const out = {};
    sels.forEach((sel) => {
      const el = document.querySelector(sel);
      if (!el || el.offsetParent === null || !el.textContent.trim()) { out[sel] = null; return; }
      const probe = document.createElement('span');
      probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline;';
      el.insertBefore(probe, el.firstChild);
      out[sel] = Math.round(probe.getBoundingClientRect().bottom * 10) / 10;
      probe.remove();
    });
    return out;
  }, selectors);
}

const PARTS = ['#sak-frist-owner', '#sak-frist-date', '#sak-frist-left', '#sak-frist-meta', '#sak-frist-note'];

e2e('deadline strip: owner pill, date, countdown, meta and note share one baseline (wide)', async () => {
  const { page, close } = await openStrip(1440);
  const b = await baselines(page, PARTS);
  const present = Object.entries(b).filter(([, v]) => v !== null);
  assert.ok(present.length >= 4, 'expected the strip to show at least 4 parts, got ' + JSON.stringify(b));
  const ys = present.map(([, v]) => v);
  assert.ok(Math.max(...ys) - Math.min(...ys) <= 1, 'baselines differ: ' + JSON.stringify(b));
  await close();
});

e2e('deadline strip: still one line of text per part at 1440 (nothing wrapped)', async () => {
  const { page, close } = await openStrip(1440);
  const h = await page.evaluate(() => document.getElementById('sak-frist').getBoundingClientRect().height);
  assert.ok(h < 70, 'strip height ' + h);
  await close();
});
