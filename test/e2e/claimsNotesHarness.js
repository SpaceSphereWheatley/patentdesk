'use strict';
// Shared Playwright fixture for the claims-notes polish e2e tests
// (claimsNotesPolish.e2e.js). Same case as claimsTableLayout.e2e.js (12 claims,
// sidebar open, height 900, claim 12 has LONG_NOTE) plus claim 3 note "OK".
// Not a test file itself: the name does not match *.e2e.js or *.test.js.

const path = require('node:path');
const { pathToFileURL } = require('node:url');

// E2E_APP_FILE lets QA point the suite at a scratch copy of the app.
const APP_URL = pathToFileURL(process.env.E2E_APP_FILE || path.join(__dirname, '..', '..', 'PatentDesk.html')).href;
const HEIGHT = 900;
const CASE_ID = 'e2enotes';
const LONG_NOTE = 'Trekk fra D1 kombinert med D2 gir ikke det samme resultatet som kravet beskriver her egentlig';
const SHORT_NOTE = 'OK';

function claim(num, over) {
  return Object.assign({
    num: num, novelty: null, inventive: null, formal: false, notes: '',
    independent: false, dep: 1, depManual: false, label: '', noveltyDoc: null, inventiveDocs: []
  }, over || {});
}

// `notes` maps claim number -> note text and is applied on top of the fixture.
function fixtureClaims(n, notes) {
  let out = [];
  if (n === 12) {
    for (let i = 1; i <= 12; i++) out.push(claim(i));
    out[0] = claim(1, { dep: null, independent: true, novelty: true, inventive: false, inventiveDocs: ['D1', 'D2'], label: 'Fremgangsmåte' });
    out[1] = claim(2, { novelty: false, inventive: false, noveltyDoc: 'D1' });
    out[2] = claim(3, { notes: SHORT_NOTE });
    out[5] = claim(6, { dep: null, independent: true, label: 'Anordning' });
    for (let i = 7; i <= 11; i++) out[i - 1] = claim(i, { dep: 6 });
    out[11] = claim(12, { dep: 11, notes: LONG_NOTE });
  } else {
    for (let i = 1; i <= n; i++) out.push(claim(i, { dep: i === 1 ? null : i - 1, independent: i === 1 }));
  }
  Object.keys(notes || {}).forEach((k) => { out[Number(k) - 1].notes = notes[k]; });
  return out;
}

function seed(opts) {
  const n = opts.numClaims;
  const kase = {
    id: CASE_ID, caseNumber: '20261235', status: opts.status || 'ny', dueDate: '2026-12-15',
    title: 'Testsak for kravnotater', notes: '', tags: '', createdAt: '2026-10-01T08:00:00.000Z',
    history: [{ status: 'ny', date: '2026-10-01T08:00:00.000Z' }],
    type: opts.type || 'sak', duration: opts.type === 'oppdrag' ? 3 : null, caseBuffer: null
  };
  const sak = {
    numClaims: n, filingDate: '', priorityDate: '', checklist: [], classes: [],
    docs: [{ id: 'D1', ref: 'WO 2020/123456 A1' }, { id: 'D2', ref: 'EP 1234567 A1' }],
    claims: n ? fixtureClaims(n, opts.notes) : []
  };
  return { cases: JSON.stringify([kase]), sak: JSON.stringify(sak) };
}

async function openCase(browser, width, opts) {
  opts = Object.assign({ numClaims: 12 }, opts || {});
  const ctx = await browser.newContext({ viewport: { width: width, height: HEIGHT } });
  const page = await ctx.newPage();
  const s = seed(opts);
  await page.addInitScript(([id, cs, sak]) => {
    if (sessionStorage.getItem('__seeded')) return;
    sessionStorage.setItem('__seeded', '1');
    localStorage.clear();
    localStorage.setItem('pt_onboarding_completed', '1');
    localStorage.setItem('pt_schema_version', '7');
    localStorage.setItem('pt_cases', cs);
    localStorage.setItem('pt_sak_' + id, sak);
  }, [CASE_ID, s.cases, s.sak]);
  await page.goto(APP_URL);
  await page.evaluate((id) => { navigateTo('sak/' + id); }, CASE_ID);
  await page.waitForTimeout(150);
  if (opts.type !== 'oppdrag') {
    await page.evaluate(() => {
      const sec = document.querySelector('section[data-sak-section="claims"]');
      if (sec) sec.scrollIntoView({ block: 'start' });
    });
  }
  await page.waitForTimeout(50);
  return { page, close: () => ctx.close() };
}

// Column geometry relative to the table (immune to page/wrap scrolling),
// rounded to 1/100 px, plus table and per-row heights.
function geometry(page) {
  return page.evaluate(() => {
    const r2 = (x) => Math.round(x * 100) / 100;
    const table = document.querySelector('.sak-claims-table');
    const t = table.getBoundingClientRect();
    const ths = Array.from(table.querySelectorAll('thead th')).map((th) => {
      const b = th.getBoundingClientRect();
      return { left: r2(b.left - t.left), width: r2(b.width) };
    });
    const rows = Array.from(table.querySelectorAll('#sak-claims-tbody tr')).map((tr) => r2(tr.getBoundingClientRect().height));
    return { tableWidth: r2(t.width), tableHeight: r2(t.height), ths: ths, rows: rows };
  });
}

// Measurements of one note input (by claim number).
function noteInfo(page, num) {
  return page.evaluate((n) => {
    const inp = document.querySelector('#sak-claims-tbody .sak-claim-note[data-claim="' + n + '"]');
    if (!inp) return null;
    const cs = getComputedStyle(inp);
    const b = inp.getBoundingClientRect();
    const cv = document.createElement('canvas').getContext('2d');
    cv.font = cs.font;
    const contentW = inp.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    return {
      value: inp.value, placeholder: inp.placeholder,
      textOverflow: cs.textOverflow, overflowX: cs.overflowX, whiteSpace: cs.whiteSpace,
      scrollW: inp.scrollWidth, clientW: inp.clientWidth, scrollLeft: inp.scrollLeft,
      contentW: contentW, placeholderW: cv.measureText(inp.placeholder).width,
      textLeft: b.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft),
      focused: document.activeElement === inp, placeholderShown: inp.matches(':placeholder-shown'),
      disabled: inp.disabled, readOnly: inp.readOnly
    };
  }, num);
}

// Header text-align for every th, plus where the "Notater" text starts.
function headerInfo(page) {
  return page.evaluate(() => {
    const ths = Array.from(document.querySelectorAll('.sak-claims-table thead th'));
    const notes = document.querySelector('.sak-claims-table thead th.sak-th-notes');
    let textLeft = null;
    if (notes) {
      const range = document.createRange();
      range.selectNodeContents(notes);
      const rects = Array.from(range.getClientRects()).filter((x) => x.width > 0);
      if (rects.length) textLeft = Math.min.apply(null, rects.map((x) => x.left));
    }
    return {
      aligns: ths.map((th) => ({ cls: th.className, text: th.textContent.trim(), align: getComputedStyle(th).textAlign })),
      notesAlign: notes ? getComputedStyle(notes).textAlign : null,
      notesTextLeft: textLeft
    };
  });
}

module.exports = { APP_URL, HEIGHT, CASE_ID, LONG_NOTE, SHORT_NOTE, openCase, geometry, noteInfo, headerInfo };
