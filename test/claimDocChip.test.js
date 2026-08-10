'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { claimDocChipHtml } = loadFunctions(
  ['claimDocChipHtml', 'claimDocPopHtml', 'effectiveClaimValue', 'getClaimCascadeValue', 'esc'],
  { vars: ['MAX_INVENTIVE_DOCS'], globals: { _sakOpenDocPop: null } }
);

function claim(num, overrides) {
  return Object.assign({
    num: num, novelty: null, inventive: null, dep: null,
    noveltyDoc: null, inventiveDocs: [],
  }, overrides);
}

test('renders a hidden placeholder (not nothing) when novelty has not failed', () => {
  const c = claim(1, { novelty: true });
  const html = claimDocChipHtml({ claims: [c] }, c, 'novelty', true);
  assert.match(html, /claim-doc-chip-placeholder/);
  assert.match(html, />velg</);
  assert.doesNotMatch(html, /data-doc-pop/);
});

test('renders a placeholder when the claim is not yet assessed (novelty null)', () => {
  const c = claim(1, { novelty: null });
  const html = claimDocChipHtml({ claims: [c] }, c, 'novelty', null);
  assert.match(html, /claim-doc-chip-placeholder/);
});

test('renders the real empty chip ("velg") once novelty fails, matching placeholder text', () => {
  const c = claim(1, { novelty: false });
  const html = claimDocChipHtml({ claims: [c] }, c, 'novelty', false);
  assert.match(html, /data-doc-pop="1"/);
  assert.match(html, /claim-doc-chip-empty/);
  assert.doesNotMatch(html, /claim-doc-chip-placeholder/);
  assert.match(html, />velg</);
});

test('renders the picked mothold id once a doc is selected', () => {
  const c = claim(1, { novelty: false, noveltyDoc: 'D1' });
  const html = claimDocChipHtml({ claims: [c] }, c, 'novelty', false);
  assert.match(html, />D1</);
});

test('renders the inherited chip on the inventive column when novelty fails', () => {
  const c = claim(1, { novelty: false, inventive: false, noveltyDoc: 'D1' });
  const html = claimDocChipHtml({ claims: [c] }, c, 'inventive', false);
  assert.match(html, /claim-doc-chip-inherit/);
  assert.match(html, />D1</);
  assert.doesNotMatch(html, /claim-doc-chip-placeholder/);
});

test('renders a placeholder on the inventive column when inventive step still holds', () => {
  const c = claim(1, { novelty: true, inventive: true });
  const html = claimDocChipHtml({ claims: [c] }, c, 'inventive', true);
  assert.match(html, /claim-doc-chip-placeholder/);
});
