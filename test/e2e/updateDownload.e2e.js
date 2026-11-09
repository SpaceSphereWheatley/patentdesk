'use strict';
// Browser test for «Last ned» in «Se etter oppdatering»: a plain click saves
// PatentDesk.html directly instead of opening GitHub. GitHub is simulated
// with page.route, so the test needs no network.
//
// NOT part of `npm test`. Run with:  node --test test/e2e/*.e2e.js
// If Playwright or Chromium is unavailable, every test is skipped, not failed.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP_URL = pathToFileURL(process.env.E2E_APP_FILE || path.join(__dirname, '..', '..', 'PatentDesk.html')).href;
const NEW = 'v99.0.0';
const NEW_HTML = "<!DOCTYPE html>\n<html><head><title>PatentDesk</title></head><script>\nvar APP_VERSION    = '" + NEW + "';\n</script></html>";

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

async function open(fileBody) {
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const cors = { 'access-control-allow-origin': '*', 'content-type': 'text/plain; charset=utf-8' };
  await page.route('https://raw.githubusercontent.com/**', (route) => {
    const u = route.request().url();
    if (u.includes('/src/js/01-config-templates.js')) return route.fulfill({ status: 200, headers: cors, body: "var APP_VERSION    = '" + NEW + "';" });
    if (u.includes('/PatentDesk.html')) return route.fulfill({ status: 200, headers: cors, body: fileBody });
    return route.abort();
  });
  let githubOpened = false;
  ctx.on('page', () => { githubOpened = true; });
  await page.addInitScript(() => { localStorage.setItem('pt_onboarding_completed', '1'); });
  await page.goto(APP_URL);
  await page.click('#btn-check-update');
  await page.waitForSelector('#update-status a');
  return { page, ctx, githubOpened: () => githubOpened };
}

e2e('«Last ned» lagrer PatentDesk.html direkte, uten å åpne GitHub', async () => {
  const { page, ctx, githubOpened } = await open(NEW_HTML);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#update-status a')]);
  assert.equal(dl.suggestedFilename(), 'PatentDesk.html');
  const saved = fs.readFileSync(await dl.path(), 'utf8');
  assert.equal(saved, NEW_HTML);
  await page.waitForFunction(() => /Lastet ned/.test(document.getElementById('update-status').textContent));
  assert.equal(githubOpened(), false);
  await ctx.close();
});

e2e('feil innhold lagrer ingenting og gir lenke til GitHub', async () => {
  const { page, ctx } = await open('<html>not it</html>');
  let downloaded = false;
  page.on('download', () => { downloaded = true; });
  await page.click('#update-status a');
  await page.waitForFunction(() => /Nedlasting feilet/.test(document.getElementById('update-status').textContent));
  assert.equal(downloaded, false);
  const href = await page.getAttribute('#update-status a', 'href');
  assert.equal(href, 'https://github.com/SpaceSphereWheatley/patentdesk/blob/main/PatentDesk.html');
  await ctx.close();
});
