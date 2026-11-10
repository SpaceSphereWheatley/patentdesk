'use strict';
// Browser tests for the timeline popup: placed at the track (above, else
// below), so it never covers the bars, and shown after half a second.
// Time is driven by Playwright's clock (page.clock.runFor), so the 500 ms and
// 300 ms thresholds are exact and the tests do not depend on machine speed.
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

// Datoer relativt til i dag, så bjelkene alltid ligger i tidslinjen
const iso = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const mk = (id, n, status, due, extra) => Object.assign({
  id, caseNumber: n, status, dueDate: due, title: 'Sak ' + n, notes: '', tags: '',
  createdAt: '2026-10-01T08:00:00.000Z', history: [{ status: 'ny', date: '2026-10-01T08:00:00.000Z' }],
  type: 'sak', duration: null, caseBuffer: null
}, extra || {});

const LONG_NOTE = Array.from({ length: 20 }, (_, i) => 'Notatlinje ' + (i + 1)).join('\n');
const CASES = [
  mk('a', '20261235', 'ny', iso(12), { notes: LONG_NOTE }),
  mk('b', '20250871', 'ny', iso(20)),
  mk('c', '20240412', 'viderebehandling', iso(16)),
  mk('d', '20231120', 'fristarkiv', iso(40)),
  mk('e', 'OP-1', 'ny', iso(9), { type: 'oppdrag', duration: 3 }),
  mk('f', '20220001', 'ny', iso(-3))                  // forfalt
];

async function openApp(viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.clock.install();
  await page.goto(APP_URL);
  await page.evaluate((cs) => {
    localStorage.clear();
    localStorage.setItem('pt_onboarding_completed', '1');
    localStorage.setItem('pt_schema_version', '7');
    localStorage.setItem('pt_cases', cs);
  }, JSON.stringify(CASES));
  await page.reload();
  await page.clock.runFor(200);
  return { page, errors, close: () => ctx.close() };
}
const go = (p, name) => p.evaluate((n) => navigateTo(n), name).then(() => p.clock.runFor(200));

async function barCentre(page, sel) {
  const loc = page.locator(sel).first();
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  return { x: b.x + Math.min(b.width / 2, 20), y: b.y + b.height / 2 };
}
const popupShown = (page) => page.evaluate(() => getComputedStyle(document.querySelector('.tl-popup')).display !== 'none');
// Popupens og sporets mål i vinduskoordinater
const geom = (page, host) => page.evaluate((h) => {
  const pr = document.querySelector('.tl-popup').getBoundingClientRect();
  const tr = document.querySelector('#' + h + ' .tl-track').getBoundingClientRect();
  return { pTop: pr.top, pBottom: pr.bottom, pLeft: pr.left, pRight: pr.right, tTop: tr.top, tBottom: tr.bottom,
    below: document.querySelector('.tl-popup').classList.contains('is-below'),
    vw: document.documentElement.clientWidth, vh: document.documentElement.clientHeight };
}, host);

function assertOutsideTrack(g) {
  if (g.below) assert.ok(g.pTop >= g.tBottom + 7.5, 'below: popup top ' + g.pTop + ' vs track bottom ' + g.tBottom);
  else assert.ok(g.pBottom <= g.tTop - 7.5, 'above: popup bottom ' + g.pBottom + ' vs track top ' + g.tTop);
  assert.ok(g.pLeft >= 7.5 && g.pRight <= g.vw - 7.5, 'inside the window horizontally');
  assert.ok(g.pTop >= 7.5 && g.pBottom <= g.vh - 7.5, 'inside the window vertically');
}

e2e('Hjem: the popup waits, then stands above the track', async () => {
  const { page, errors, close } = await openApp();
  await go(page, 'hjem');
  const c = await barCentre(page, '#home-timeline .tl-bar[data-id="b"]');
  await page.mouse.move(c.x, c.y);
  await page.clock.runFor(200);
  assert.equal(await popupShown(page), false, 'hidden after 200 ms');
  await page.clock.runFor(450);
  assert.equal(await popupShown(page), true, 'shown after 650 ms');
  const g = await geom(page, 'home-timeline');
  assert.equal(g.below, false);
  assertOutsideTrack(g);
  assert.deepEqual(errors, []);
  await close();
});

e2e('the popup switches at once to the next bar, and waits again after leaving', async () => {
  const { page, close } = await openApp();
  await go(page, 'hjem');
  const b = await barCentre(page, '#home-timeline .tl-bar[data-id="b"]');
  const a = await barCentre(page, '#home-timeline .tl-bar[data-id="a"]');
  await page.mouse.move(b.x, b.y);
  await page.clock.runFor(650);
  await page.mouse.move(a.x, a.y);
  await page.clock.runFor(30);
  assert.equal(await popupShown(page), true, 'switched at once');
  assert.match(await page.locator('.tl-popup').textContent(), /20261235/);
  await page.mouse.move(5, 5);
  await page.clock.runFor(1000);
  await page.mouse.move(b.x, b.y);
  await page.clock.runFor(200);
  assert.equal(await popupShown(page), false, 'waits again after 1 s away');
  await close();
});

e2e('leaving before half a second shows no popup', async () => {
  const { page, close } = await openApp();
  await go(page, 'hjem');
  const b = await barCentre(page, '#home-timeline .tl-bar[data-id="b"]');
  await page.mouse.move(b.x, b.y);
  await page.clock.runFor(200);
  await page.mouse.move(5, 5);
  await page.clock.runFor(600);
  assert.equal(await popupShown(page), false);
  await close();
});

e2e('keyboard focus shows the popup at once', async () => {
  const { page, close } = await openApp();
  await go(page, 'hjem');
  await page.locator('#home-timeline .tl-bar[data-id="b"]').first().focus();
  await page.clock.runFor(30);
  assert.equal(await popupShown(page), true);
  assertOutsideTrack(await geom(page, 'home-timeline'));
  await close();
});

e2e('list page: a tall popup with no room above goes below the track', async () => {
  const { page, errors, close } = await openApp({ width: 1440, height: 900 });
  await go(page, 'ny');
  await page.evaluate(() => window.scrollTo(0, 0));
  const a = await barCentre(page, '#cases-timeline .tl-bar[data-id="a"]');
  await page.mouse.move(a.x, a.y);
  await page.clock.runFor(650);
  assert.equal(await popupShown(page), true);
  const g = await geom(page, 'cases-timeline');
  assert.ok(g.pBottom - g.pTop > g.tTop - 16, 'the 20-line note does not fit above');
  assert.equal(g.below, true, 'no room above → below');
  assertOutsideTrack(g);
  assert.deepEqual(errors, []);
  await close();
});

e2e('every kind of bar gets a popup outside the track', async () => {
  const { page, close } = await openApp();
  const targets = [
    ['hjem', 'home-timeline', '.tl-bar[data-id="b"]'],              // Ny
    ['hjem', 'home-timeline', '.tl-bar[data-id="e"]'],              // Oppdrag
    ['hjem', 'home-timeline', '.tl-bar[data-id="f"]'],              // forfalt
    ['hjem', 'home-timeline', '.tl-overdue-band'],                  // forfalt-bånd
    ['viderebehandling', 'cases-timeline', '.tl-bar[data-id="c"]'],
    ['fristarkiv', 'cases-timeline', '.tl-bar[data-id="d"]'],
    ['oppdrag', 'cases-timeline', '.tl-bar[data-id="e"]']
  ];
  for (const [view, host, sel] of targets) {
    await go(page, view);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.mouse.move(5, 5);
    await page.clock.runFor(400);
    assert.equal(await page.locator('#' + host + ' ' + sel).count() > 0, true, view + ' ' + sel + ' exists');
    const p = await barCentre(page, '#' + host + ' ' + sel);
    await page.mouse.move(p.x, p.y);
    await page.clock.runFor(650);
    assert.equal(await popupShown(page), true, 'popup for ' + view + ' ' + sel);
    assertOutsideTrack(await geom(page, host));
  }
  await close();
});

e2e('drag: no popup, and the chip stands outside the track', async () => {
  const { page, errors, close } = await openApp();
  await go(page, 'hjem');
  const sel = '#home-timeline .tl-bar.draggable';
  assert.ok(await page.locator(sel).count() > 0, 'a draggable bar');
  const p = await barCentre(page, sel);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x - 40, p.y, { steps: 5 });
  await page.clock.runFor(650);
  assert.equal(await popupShown(page), false, 'no popup while dragging');
  const g = await page.evaluate(() => {
    const ch = document.querySelector('.tl-drag-chip').getBoundingClientRect();
    const tr = document.querySelector('#home-timeline .tl-track').getBoundingClientRect();
    return { cTop: ch.top, cBottom: ch.bottom, tTop: tr.top, tBottom: tr.bottom };
  });
  assert.ok(g.cBottom <= g.tTop - 7.5 || g.cTop >= g.tBottom + 7.5, JSON.stringify(g));
  await page.keyboard.press('Escape');
  await page.mouse.up();
  assert.deepEqual(errors, []);
  await close();
});

e2e('empty timeline: hovering it raises no error', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.clock.install();
  await page.goto(APP_URL);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('pt_onboarding_completed', '1'); localStorage.setItem('pt_cases', '[]'); });
  await page.reload();
  await page.clock.runFor(200);
  await page.evaluate(() => navigateTo('hjem'));
  const tl = page.locator('#home-timeline');
  if (await tl.count() && await tl.isVisible()) {
    const b = await tl.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.clock.runFor(650);
  }
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.tl-popup')).display), 'none');
  assert.deepEqual(errors, []);
  await ctx.close();
});

e2e('keyboard focus on a bar scrolled out of view still shows the popup, at the bar', async () => {
  const { page, errors, close } = await openApp({ width: 900, height: 500 });
  await go(page, 'hjem');
  await page.evaluate(() => {
    const wrap = document.querySelector('#home-timeline .tl-track').closest('.tl-scroll-wrap');
    wrap.scrollLeft = wrap.scrollWidth;                     // bars at the start are out of view
  });
  const bar = page.locator('#home-timeline .tl-bar[data-id="e"]').first();
  const before = await page.evaluate(() => {
    const wrap = document.querySelector('#home-timeline .tl-track').closest('.tl-scroll-wrap');
    const b = document.querySelector('#home-timeline .tl-bar[data-id="e"]').getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    return b.right < w.left || b.left > w.right;
  });
  assert.equal(before, true, 'the bar starts out of view');
  await bar.focus();
  await page.clock.runFor(300);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  assert.equal(await popupShown(page), true, 'popup shown after the browser scrolled the bar into view');
  const g = await page.evaluate(() => {
    const p = document.querySelector('.tl-popup');
    const pr = p.getBoundingClientRect();
    const br = document.activeElement.getBoundingClientRect();
    return { arrow: pr.left + parseFloat(p.style.getPropertyValue('--tl-popup-arrow-x')), mid: br.left + br.width / 2 };
  });
  assert.ok(Math.abs(g.arrow - g.mid) <= 12, 'the arrow points at the focused bar: ' + JSON.stringify(g));
  assertOutsideTrack(await geom(page, 'home-timeline'));
  assert.deepEqual(errors, []);
  await close();
});

e2e('the popup follows the track when its height changes (rows follow the view)', async () => {
  const { page, errors, close } = await openApp();
  await go(page, 'hjem');
  const b = await barCentre(page, '#home-timeline .tl-bar[data-id="b"]');
  await page.mouse.move(b.x, b.y);
  await page.clock.runFor(650);
  assert.equal(await popupShown(page), true);
  const before = await geom(page, 'home-timeline');
  // Sporet blir 60 px høyere uten overgang, som når radene endres
  await page.evaluate(() => {
    const tr = document.querySelector('#home-timeline .tl-track');
    tr.style.transition = 'none';
    tr.style.height = (tr.getBoundingClientRect().height + 60) + 'px';
  });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
  await page.clock.runFor(50);
  const after = await geom(page, 'home-timeline');
  assert.notEqual(after.tTop + after.tBottom, before.tTop + before.tBottom, 'the track moved or grew');
  assertOutsideTrack(after);
  assert.deepEqual(errors, []);
  await close();
});

e2e('a pending popup is dropped when the timeline is redrawn', async () => {
  const { page, errors, close } = await openApp();
  await go(page, 'hjem');
  const b = await barCentre(page, '#home-timeline .tl-bar[data-id="b"]');
  await page.mouse.move(b.x, b.y);
  await page.clock.runFor(200);
  await page.evaluate(() => renderTimeline({ target: 'home-timeline' }));   // the hovered bar is replaced
  await page.clock.runFor(600);
  assert.equal(await popupShown(page), false, 'no popup for a bar that is gone');
  assert.deepEqual(errors, []);
  await close();
});

e2e('scrolling hides the popup instead of leaving it behind', async () => {
  const { page, close } = await openApp();
  await go(page, 'hjem');
  const b = await barCentre(page, '#home-timeline .tl-bar[data-id="b"]');
  await page.mouse.move(b.x, b.y);
  await page.clock.runFor(650);
  assert.equal(await popupShown(page), true);
  // Siden scrolles (scroll-hendelsen går til document)
  await page.evaluate(() => document.dispatchEvent(new Event('scroll')));
  assert.equal(await popupShown(page), false, 'hidden when the page scrolls');
  // Tidslinjen scrolles sideveis
  await page.mouse.move(b.x + 1, b.y);
  await page.clock.runFor(650);
  assert.equal(await popupShown(page), true);
  await page.evaluate(() => {
    const wrap = document.querySelector('#home-timeline .tl-track').closest('.tl-scroll-wrap');
    wrap.dispatchEvent(new Event('scroll'));
  });
  assert.equal(await popupShown(page), false, 'hidden when the timeline scrolls');
  await close();
});

e2e('sak-dialogen: the popup in the preview stands outside the track', async () => {
  const { page, errors, close } = await openApp();
  await go(page, 'ny');
  await page.evaluate(() => openModal(cases.find((c) => c.id === 'b')));
  await page.clock.runFor(300);
  const sel = '#modal-timeline .tl-bar';
  assert.ok(await page.locator(sel).count() > 0, 'the dialog shows a timeline with bars');
  const p = await barCentre(page, sel);
  await page.mouse.move(p.x, p.y);
  await page.clock.runFor(650);
  assert.equal(await popupShown(page), true);
  assertOutsideTrack(await geom(page, 'modal-timeline'));
  // the popup (pointer-events: none) must stack above the dialog
  const z = await page.evaluate(() => ({
    pz: parseInt(getComputedStyle(document.querySelector('.tl-popup')).zIndex, 10),
    bz: parseInt(getComputedStyle(document.getElementById('modal-backdrop')).zIndex, 10) || 0
  }));
  assert.ok(z.pz > z.bz, 'popup above the dialog: ' + JSON.stringify(z));
  assert.deepEqual(errors, []);
  await close();
});
