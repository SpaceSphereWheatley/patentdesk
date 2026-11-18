'use strict';
// Browser tests for OP-saker (innsigelser): create one in «Legg til sak», see it
// on its own page, fill in dates on the case page and walk the phases.
// NOT part of `npm test`; run with: node --test test/e2e/opCases.e2e.js

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const APP_URL = pathToFileURL(process.env.E2E_APP_FILE || path.join(__dirname, '..', '..', 'PatentDesk.html')).href;
const SHOTS = process.env.E2E_SHOTS || null;

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

async function freshApp() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    localStorage.setItem('pt_onboarding_completed', '1');
  });
  await page.goto(APP_URL);
  return { page, errors, close: () => ctx.close() };
}

async function createOp(page, number) {
  await page.evaluate(() => navigateTo('op'));
  await page.click('#btn-open-modal');
  await page.waitForSelector('#modal-row-opcase', { state: 'visible' });
  await page.fill('#f-op-number', number);
  await page.fill('#f-op-patent', 'NO 345678');
  await page.fill('#f-op-holder', 'Eksempel Marine AS');
  await page.fill('#f-op-opponent', 'Testrederi ASA');
  await page.click('#btn-save');
}

const opCase = (page) => page.evaluate(() => JSON.parse(JSON.stringify(cases.find((c) => c.type === 'op'))));

e2e('an OP case is created from «Legg til sak» and listed on OP-saker', async () => {
  const s = await freshApp();
  await createOp(s.page, 'OP 2026/00123');
  const c = await opCase(s.page);
  assert.equal(c.caseNumber, 'OP 2026/00123');
  assert.equal(c.status, 'op_formalia');
  assert.deepEqual(c.op.opponents, [{ name: 'Testrederi ASA', agent: '' }]);
  const cards = await s.page.locator('#case-list .case-card').allTextContents();
  assert.equal(cards.length, 1);
  assert.match(cards[0], /OP 2026\/00123/);
  assert.match(cards[0], /NO 345678 · Eksempel Marine AS/);
  assert.deepEqual(s.errors, []);
  await s.close();
});

e2e('an invalid OP number is refused with a message', async () => {
  const s = await freshApp();
  await createOp(s.page, 'OP2026/00123');
  assert.match(await s.page.textContent('#field-error'), /OP ÅÅÅÅ\/xxxxx/);
  assert.equal(await s.page.evaluate(() => cases.length), 0);
  await s.close();
});

e2e('case page: dates drive the phase deadline, phases walk forward, belegg only in work phases', async () => {
  const s = await freshApp();
  const p = s.page;
  await createOp(p, 'OP 2026/00123');
  const id = (await opCase(p)).id;
  await p.evaluate((i) => navigateTo('sak/' + i), id);
  await p.waitForSelector('#sak-op .op-grid');
  // Søknadsdelene er skjult
  assert.equal(await p.locator('section[data-sak-section="claims"]').isVisible(), false);

  // Svarfrist inn, så videre til «Venter på svar»: fristen blir svarfristen
  await p.fill('#op-d-replyDue', '2027.03.03');
  await p.press('#op-d-replyDue', 'Tab');
  await p.waitForTimeout(50);
  await p.click('#btn-sak-forward');
  await p.waitForTimeout(50);
  let c = await opCase(p);
  assert.equal(c.status, 'op_svar');
  assert.equal(c.dueDate, '2027-03-03');
  assert.equal(await p.evaluate((i) => countsInBelegg(cases.find((x) => x.id === i)), id), false);

  // Svar mottatt → Oppstart: 10 arbeidsdager etter svaret
  await p.selectOption('#sak-op [data-op-field="replyKind"]', 'svar');
  await p.waitForTimeout(50);
  await p.fill('#op-d-replyDate', '2027.03.01');
  await p.press('#op-d-replyDate', 'Tab');
  await p.waitForTimeout(50);
  // Fokus går videre til neste felt selv om panelet tegnes på nytt
  assert.equal(await p.evaluate(() => document.activeElement && document.activeElement.matches('#op-d-replyDate ~ .dp-trigger')), true);
  await p.click('#btn-sak-forward');
  await p.waitForTimeout(50);
  c = await opCase(p);
  assert.equal(c.status, 'op_oppstart');
  assert.equal(c.dueDate, '2027-03-15');
  assert.equal(await p.evaluate((i) => countsInBelegg(cases.find((x) => x.id === i)), id), true);

  // Varsel om tilstrekkelig opplyst → Avgjørelse: varsel + 3 mnd
  await p.click('#btn-sak-forward');
  await p.waitForTimeout(50);
  await p.fill('#op-d-noticeDate', '2027.04.30');
  await p.press('#op-d-noticeDate', 'Tab');
  await p.waitForTimeout(50);
  await p.click('#btn-sak-forward');
  await p.waitForTimeout(50);
  c = await opCase(p);
  assert.equal(c.status, 'op_avgjorelse');
  assert.equal(c.dueDate, '2027-07-30');
  assert.match(await p.textContent('#sak-op .op-ctrl'), /\(b\)[^]*2027\.07\.30/);

  // En ny innsiger legges til, og den siste kan ikke fjernes
  await p.fill('[data-op-opp-new]', 'Prøve Offshore AB');
  await p.press('[data-op-opp-new]', 'Tab');
  await p.waitForTimeout(50);
  assert.equal((await opCase(p)).op.opponents.length, 2);
  await p.click('[data-op-remove="0"]');
  await p.waitForTimeout(50);
  assert.equal(await p.locator('[data-op-remove="0"]').isDisabled(), true);

  if (SHOTS) {
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.screenshot({ path: path.join(SHOTS, 'op-sak.png'), fullPage: true });
    await p.evaluate(() => navigateTo('op'));
    await p.waitForTimeout(100);
    await p.screenshot({ path: path.join(SHOTS, 'op-liste.png') });
  }

  // Avgjørelse sendt: avsluttet, ute av belegg, statistikken teller den
  await p.evaluate((i) => navigateTo('sak/' + i), id);
  await p.click('#btn-sak-forward');
  await p.waitForTimeout(50);
  c = await opCase(p);
  assert.equal(c.status, 'avsluttet');
  assert.equal(await p.evaluate(() => stats.log.filter((e) => e.type === 'op').length), 1);
  assert.deepEqual(s.errors, []);
  await s.close();
});
