'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'PatentDesk.html'), 'utf8');
const root = /:root\s*\{([\s\S]*?)\n\}/.exec(html)[1];
function token(name) {
  const m = new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{6})').exec(root);
  assert.ok(m, 'token --' + name + ' not found in :root');
  return m[1];
}
function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

['muted-text', 'accent-text'].forEach((name) => {
  test('--' + name + ' reaches 4.5:1 against both the page background and white', () => {
    const fg = token(name);
    ['bg', 'surface'].forEach((bg) => {
      const r = contrast(fg, token(bg));
      assert.ok(r >= 4.5, '--' + name + ' on --' + bg + ' is ' + r.toFixed(2) + ':1');
    });
  });
});

test('text never uses the decorative --muted or fill --accent colour directly', () => {
  const bad = html.match(/(?<![-\w])color:\s*var\(--(muted|accent)\)/g) || [];
  assert.deepStrictEqual(bad, [], 'use --muted-text / --accent-text for text');
});
