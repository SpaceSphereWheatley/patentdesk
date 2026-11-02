'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Blått (--primary) betyr «her kan du gjøre noe»; gull (--accent) er identitet:
// logo, saksnummer, CPC-koder, A/B/C-merker, aktiv sak, grafer.
const html = fs.readFileSync(path.join(__dirname, '..', 'PatentDesk.html'), 'utf8');
const css = html.slice(html.indexOf('<style>') + 7, html.indexOf('</style>')).replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
const usesGold = (r) => /var\(--accent(-dim|-text|-btn-text)?\)/.test(r.body);

test('focus states are never gold', () => {
  const bad = rules.filter((r) => /:focus/.test(r.sel) && usesGold(r)).map((r) => r.sel);
  assert.deepStrictEqual(bad, []);
});

test('checkboxes and radios are never gold', () => {
  const bad = rules.filter((r) => /accent-color:\s*var\(--accent/.test(r.body)).map((r) => r.sel);
  assert.deepStrictEqual(bad, []);
});

test('the main action buttons are blue', () => {
  ['.btn-sak-forward', '.s-btn-accent', '.cle-btn-save', '.undo-toast button', '.btn-add'].forEach((sel) => {
    const r = rules.find((x) => x.sel === sel);
    assert.ok(r, sel + ' rule exists');
    assert.ok(/var\(--primary/.test(r.body), sel + ' uses --primary');
    assert.ok(!usesGold(r), sel + ' has no gold');
  });
});

test('identity stays gold: case numbers and the active-case marker', () => {
  ['.case-card-cn', '.home-upcoming-cn', '.active-dot'].forEach((sel) => {
    const r = rules.find((x) => x.sel === sel);
    assert.ok(r && usesGold(r), sel + ' keeps gold');
  });
});
