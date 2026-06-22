'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const {
  parseDate,
  toDisplay,
  normaliseTags,
  sanitizeText,
  isValidDate,
  formatDate,
  formatDateTime,
  monthKey,
  esc,
  highlightMatch,
} = loadFunctions([
  'parseDate', 'toDisplay', 'normaliseTags', 'sanitizeText', 'isValidDate',
  'formatDate', 'formatDateTime', 'monthKey', 'esc', 'highlightMatch',
]);

test('parseDate converts dotted dates to ISO form', () => {
  assert.strictEqual(parseDate('2026.06.22'), '2026-06-22');
  assert.strictEqual(parseDate(''), '');
});

test('toDisplay converts ISO dates to dotted form', () => {
  assert.strictEqual(toDisplay('2026-06-22'), '2026.06.22');
  assert.strictEqual(toDisplay(''), '');
});

test('normaliseTags trims, drops blanks, and rejoins with ", "', () => {
  assert.strictEqual(normaliseTags(' a ,, b ,c'), 'a, b, c');
  assert.strictEqual(normaliseTags(''), '');
  assert.strictEqual(normaliseTags(null), '');
});

test('sanitizeText strips control characters but keeps normal text', () => {
  assert.strictEqual(sanitizeText('abc\x00\x1Fdef'), 'abcdef');
  assert.strictEqual(sanitizeText('hello\tworld\n'), 'hello\tworld\n');
});

test('isValidDate accepts well-formed ISO dates and dotted dates', () => {
  assert.strictEqual(isValidDate('2026-06-22'), true);
  assert.strictEqual(isValidDate('2026.06.22'), true);
});

test('isValidDate rejects malformed or impossible dates', () => {
  assert.strictEqual(isValidDate('not-a-date'), false);
  assert.strictEqual(isValidDate('2026-13-40'), false);
  assert.strictEqual(isValidDate(''), false);
});

test('formatDate renders ISO date as dotted', () => {
  assert.strictEqual(formatDate('2026-06-22'), '2026.06.22');
});

test('formatDateTime renders ISO timestamp as dotted date', () => {
  assert.strictEqual(formatDateTime('2026-06-22T10:30:00.000Z'), '2026.06.22');
});

test('monthKey extracts YYYY-MM from an ISO timestamp', () => {
  assert.strictEqual(monthKey('2026-06-22T10:30:00.000Z'), '2026-06');
});

test('esc escapes HTML-significant characters', () => {
  assert.strictEqual(esc('<script>&"x"</script>'), '&lt;script&gt;&amp;&quot;x&quot;&lt;/script&gt;');
  assert.strictEqual(esc(null), '');
});

test('highlightMatch wraps the matched term in <mark> and escapes the rest', () => {
  assert.strictEqual(highlightMatch('Patentstyret', 'sty'), 'Patent<mark>sty</mark>ret');
  assert.strictEqual(highlightMatch('<b>Patentstyret</b>', 'styret'), '&lt;b&gt;Patent<mark>styret</mark>&lt;/b&gt;');
});

test('highlightMatch escapes the whole string when there is no match', () => {
  assert.strictEqual(highlightMatch('<i>no match</i>', 'xyz'), '&lt;i&gt;no match&lt;/i&gt;');
});
