'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { beleggBar } = loadFunctions(['beleggBar']);

test('under capacity: the bar fills to the percentage, the 100 % mark sits at the end, no overflow', () => {
  assert.deepStrictEqual({ ...beleggBar(60) }, { fill: 60, over: 0, mark: 100, overPct: 0 });
  assert.deepStrictEqual({ ...beleggBar(100) }, { fill: 100, over: 0, mark: 100, overPct: 0 });
});

test('over capacity: the scale grows so the part past 100 % shows as its own segment', () => {
  const b = beleggBar(125);
  assert.strictEqual(b.mark, 80);       // 100 of 125
  assert.strictEqual(b.fill, 80);
  assert.strictEqual(b.over, 20);       // 25 of 125
  assert.strictEqual(b.overPct, 25);
  assert.strictEqual(b.fill + b.over, 100);
});

test('far over capacity: the scale stops at 200 % so the mark stays readable; overPct still tells the truth', () => {
  const b = beleggBar(350);
  assert.strictEqual(b.mark, 50);
  assert.strictEqual(b.fill + b.over, 100);
  assert.strictEqual(b.overPct, 250);
});

test('zero or bad input gives an empty bar', () => {
  assert.deepStrictEqual({ ...beleggBar(0) }, { fill: 0, over: 0, mark: 100, overPct: 0 });
  assert.deepStrictEqual({ ...beleggBar(NaN) }, { fill: 0, over: 0, mark: 100, overPct: 0 });
});

const { fridagLead } = loadFunctions(['fridagLead']);

test('the fridag line reads naturally for today, tomorrow and later', () => {
  assert.strictEqual(fridagLead(0), 'Fridag i dag');
  assert.strictEqual(fridagLead(1), 'Neste fridag i morgen');
  assert.strictEqual(fridagLead(51), 'Neste fridag om <strong>51 dager</strong>');
});
