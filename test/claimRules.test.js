'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const {
  claimResultLabel,
  claimResultClass,
  triToggle,
  triToggleFormal,
  getClaimCascadeValue,
  effectiveClaimValue,
} = loadFunctions([
  'claimResultLabel',
  'claimResultClass',
  'triToggle',
  'triToggleFormal',
  'getClaimCascadeValue',
  'effectiveClaimValue',
]);

function claim(num, overrides) {
  return Object.assign({
    num: num, novelty: null, inventive: null, formal: null,
    independent: false, dep: null,
  }, overrides);
}

test('triToggle cycles null -> true -> false -> null', () => {
  assert.strictEqual(triToggle(null), true);
  assert.strictEqual(triToggle(true), false);
  assert.strictEqual(triToggle(false), null);
});

test('triToggleFormal cycles null -> true -> false -> null', () => {
  assert.strictEqual(triToggleFormal(null), true);
  assert.strictEqual(triToggleFormal(true), false);
  assert.strictEqual(triToggleFormal(false), null);
});

test('claimResultLabel: unassessed claim returns null', () => {
  const c = claim(1, { novelty: null, inventive: true });
  assert.strictEqual(claimResultLabel(c), null);
});

test('claimResultLabel: patentable when novelty and inventive step are met', () => {
  const c = claim(1, { novelty: true, inventive: true, formal: false });
  assert.strictEqual(claimResultLabel(c), 'patenterbar');
  assert.strictEqual(claimResultClass(c), 'claim-ok');
});

test('claimResultLabel: missing novelty is reported and rejects the claim', () => {
  const c = claim(1, { novelty: false, inventive: false, formal: false });
  assert.strictEqual(claimResultLabel(c), 'Mangler nyhet, Mangler oppfinnelseshøyde');
  assert.strictEqual(claimResultClass(c), 'claim-rejected');
});

test('claim without novelty cascades no inventive step to dependent claims', () => {
  const claims = [
    claim(1, { independent: true, dep: null, novelty: false, inventive: false }),
    claim(2, { independent: false, dep: 1 }),
  ];
  // Dependent claim 2 inherits no novelty / no inventive step from its parent.
  assert.strictEqual(getClaimCascadeValue(claims, 2, 'novelty'), null);
  assert.strictEqual(getClaimCascadeValue(claims, 2, 'inventive'), null);
  assert.strictEqual(effectiveClaimValue(claims, claims[1], 'novelty'), null);
});

test('dependent claim cascades novelty and inventive step from parent when both true', () => {
  const claims = [
    claim(1, { independent: true, dep: null, novelty: true, inventive: true }),
    claim(2, { independent: false, dep: 1 }),
  ];
  assert.strictEqual(getClaimCascadeValue(claims, 2, 'novelty'), true);
  assert.strictEqual(getClaimCascadeValue(claims, 2, 'inventive'), true);
});

test('inventive step cascade requires effective novelty to also be true', () => {
  const claims = [
    claim(1, { independent: true, dep: null, novelty: false, inventive: true }),
    claim(2, { independent: false, dep: 1 }),
  ];
  // Even if the parent's inventive flag were somehow true, lacking novelty
  // must block the inventive-step cascade for dependents.
  assert.strictEqual(getClaimCascadeValue(claims, 2, 'inventive'), null);
});

test('a manually-set value on a dependent claim overrides cascade', () => {
  const claims = [
    claim(1, { independent: true, dep: null, novelty: true, inventive: true }),
    claim(2, { independent: false, dep: 1, novelty: false }),
  ];
  assert.strictEqual(effectiveClaimValue(claims, claims[1], 'novelty'), false);
});

test('cascade propagates transitively through multiple dependent levels', () => {
  const claims = [
    claim(1, { independent: true, dep: null, novelty: true, inventive: true }),
    claim(2, { independent: false, dep: 1 }),
    claim(3, { independent: false, dep: 2 }),
  ];
  assert.strictEqual(getClaimCascadeValue(claims, 3, 'novelty'), true);
  assert.strictEqual(getClaimCascadeValue(claims, 3, 'inventive'), true);
});
