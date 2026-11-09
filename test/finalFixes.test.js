'use strict';
// Final fix round for 2B+2C (rounds2/2c/fix-round.md), unit-level parts.
// Written by QA before the builder. Browser parts: test/e2e/finalFixes.e2e.js.
//
// C1 (static) every claim-number attribute in the claims-table markup goes
//    through esc().
// C2 OBJECTION_DELETE has the same guard as OBJECTION_ADD / OBJECTION_STATE_SET:
//    the case must exist, not be oppdrag, and be in Viderebehandling.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadFunctions, extractFunctionSource } = require('./extractFunctions');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'PatentDesk.html'), 'utf8');

// ── C1: claim numbers in attributes are escaped ───────────────────────────
// The functions that build the claims table / tree / mapping cells / doc chips.
const CLAIM_MARKUP_FNS = ['claimRowHtml', 'claimMappingRowHtml', 'renderSakClaimsTree',
  'claimDocChipHtml', 'claimDocPopHtml', 'claimDocCopySource', 'claimDocsShown', 'depResetHtml'];

test('C1 every data-claim* / data-kt-num attribute in the claims markup is built with esc()', () => {
  const bad = [];
  CLAIM_MARKUP_FNS.forEach((name) => {
    const src = extractFunctionSource(HTML, name);
    // data-claim="' + X, data-claim-origin, data-kt-num, data-kt-toggle etc.
    const re = /data-(?:claim[\w-]*|kt-[\w-]*)="'\s*\+\s*([^+]+?)\s*\+/g;
    let m;
    while ((m = re.exec(src))) {
      const expr = m[1].trim();
      if (/^esc\(/.test(expr)) continue;
      // A local that was itself built with esc(), e.g. `var nh = esc(n)`
      if (/^[A-Za-z_$][\w$]*$/.test(expr) &&
          new RegExp('(?:var\\s+|,\\s*)' + expr.replace(/\$/g, '\\$') + '\\s*=\\s*esc\\(').test(src)) continue;
      bad.push(name + ': ' + m[0]);
    }
  });
  assert.deepEqual(bad, [], 'unescaped claim-number attributes');
});

// ── C2: OBJECTION_DELETE guard ─────────────────────────────────────────────
function harness(theCase) {
  const saved = [];
  const rendered = [];
  const data = {
    objections: [{ id: 'mdel0001', text: 'Egen', raisedIn: 1 }],
    objectionStates: { 2: { mdel0001: 'maintained' } }
  };
  const cases = theCase ? [theCase] : [];
  const fns = loadFunctions(['_dispatch'], {
    globals: {
      cases,
      AppState: { cases },
      activeSakId: 'c1',
      loadSakData: () => JSON.parse(JSON.stringify(data)),
      saveSakData: (id, d) => saved.push({ id, d }),
      renderSakResponse: (c, d) => rendered.push(d),
      // Minimal stand-in: removes the objection and its states.
      objectionsAfterDelete: (d, objId) => Object.assign({}, d, {
        objections: (d.objections || []).filter((o) => o.id !== objId),
        objectionStates: {}
      }),
      showToast: () => {}
    }
  });
  fns._dispatch('OBJECTION_DELETE', { id: 'c1', objId: 'mdel0001' });
  return { saved, rendered };
}
const mk = (over) => Object.assign({ id: 'c1', caseNumber: '1', type: 'sak', status: 'viderebehandling' }, over);

test('C2 OBJECTION_DELETE still deletes in a Viderebehandling sak (control)', () => {
  const { saved } = harness(mk({}));
  assert.equal(saved.length, 1);
  assert.equal((saved[0].d.objections || []).length, 0);
});

for (const [label, c] of [
  ['Ny', mk({ status: 'ny' })],
  ['Fristarkiv', mk({ status: 'fristarkiv' })],
  ['Avsluttet', mk({ status: 'avsluttet' })],
  ['oppdrag in Viderebehandling', mk({ type: 'oppdrag' })],
  ['unknown case', null]
]) {
  test('C2 OBJECTION_DELETE is ignored for ' + label, () => {
    const { saved, rendered } = harness(c);
    assert.equal(saved.length, 0, 'nothing saved');
    assert.equal(rendered.length, 0, 'nothing rendered');
  });
}
