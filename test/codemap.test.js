'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { buildCodeMap, buildSrcMap } = require('../scripts/codemap.js');

const SAMPLE = [
  '<style>',                                   // 1
  '/* ── 1. Variabler ──────── */',            // 2
  '  /* ── Lys modus ── */',                   // 3 indented: not a section
  '/* ── 2. Reset ──────────── */',            // 4
  '</style>',                                  // 5
  '<script>',                                  // 6
  '// ══════════════════════',                 // 7
  '// SEKSJON 1 · KONSTANTER',                 // 8
  '// ══════════════════════',                 // 9
  '// ── Sjekkliste-mal ──────',                // 10
  'function makeChecklist(a) {',               // 11
  '  function inner() {}',                     // 12 nested: not listed
  '}',                                         // 13
  '// ── Kravkobling ─────────',                // 14
  'async function loadClaims() {}',            // 15
  'function claimMap() {}',                    // 16
  '</script>',                                 // 17
].join('\n');

test('codemap lists CSS sections, JS sections, subsections and top-level functions with line numbers', () => {
  const out = buildCodeMap(SAMPLE);
  assert.match(out, /^\s*2\s+1\. Variabler$/m);
  assert.match(out, /^\s*4\s+2\. Reset$/m);
  assert.doesNotMatch(out, /Lys modus/);
  assert.match(out, /^\s*8\s+SEKSJON 1 · KONSTANTER$/m);
  assert.match(out, /^\s*10\s+── Sjekkliste-mal$/m);
  assert.match(out, /^\s*11\s+makeChecklist$/m);
  assert.match(out, /^\s*15\s+loadClaims$/m);
  assert.match(out, /^\s*16\s+claimMap$/m);
  assert.doesNotMatch(out, /inner/);
});

test('codemap filter keeps matching functions and their headings only', () => {
  const out = buildCodeMap(SAMPLE, 'CLAIM');
  assert.match(out, /loadClaims/);
  assert.match(out, /claimMap/);
  assert.match(out, /Kravkobling/);
  assert.match(out, /SEKSJON 1/);
  assert.doesNotMatch(out, /makeChecklist/);
  assert.doesNotMatch(out, /Sjekkliste-mal/);
  assert.doesNotMatch(out, /Variabler/);
});

test('src map covers every SEKSJON and lists functions by source file and line', () => {
  const src = path.join(__dirname, '..', 'src');
  const out = buildSrcMap(src);
  for (let n = 1; n <= 7; n++) assert.match(out, new RegExp('SEKSJON ' + n + ' ·'));
  const file = fs.readdirSync(path.join(src, 'js'))
    .find(f => /^function esc\s*\(/m.test(fs.readFileSync(path.join(src, 'js', f), 'utf8')));
  assert.ok(file, 'esc() not found in src/js');
  const lines = fs.readFileSync(path.join(src, 'js', file), 'utf8').split('\n');
  const line = lines.findIndex(l => /^function esc\s*\(/.test(l)) + 1;
  const block = out.split('== src/js/' + file + '\n')[1].split('\n== ')[0];
  assert.match(block, new RegExp('^\\s*' + line + '\\s+esc$', 'm'));
});

test('src map with a filter only shows files that have a match', () => {
  const out = buildSrcMap(path.join(__dirname, '..', 'src'), 'claimmapping');
  assert.match(out, /^== src\/js\/02-claim-mapping-objections\.js$/m);
  assert.doesNotMatch(out, /^== src\/css\//m);
  assert.doesNotMatch(out, /^== src\/js\/21-bootstrap\.js$/m);
});
