'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { build } = require('../scripts/build.js');

const ROOT = path.join(__dirname, '..');

function tmpSrc(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pd-build-'));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  }
  return dir;
}

test('committed PatentDesk.html is exactly the build of src/ (edit src/, then run npm run build)', () => {
  const built = build(path.join(ROOT, 'src'));
  const committed = fs.readFileSync(path.join(ROOT, 'PatentDesk.html'), 'utf8');
  assert.ok(built === committed,
    'PatentDesk.html is out of sync with src/. Edit files in src/ and run `npm run build`.');
});

test('build replaces include lines with file contents, byte for byte', () => {
  const dir = tmpSrc({
    'index.html': '<style>\n<!-- @include css/a.css -->\n</style>\n<script>\n<!-- @include js/b.js -->\n</script>\n',
    'css/a.css': 'body { x: 1; }\n',
    'js/b.js': 'function b() {}\n\n',
  });
  assert.strictEqual(build(dir),
    '<style>\nbody { x: 1; }\n</style>\n<script>\nfunction b() {}\n\n</script>\n');
});

test('build fails on a source file that is not included', () => {
  const dir = tmpSrc({
    'index.html': '<!-- @include js/a.js -->\n',
    'js/a.js': 'a\n',
    'js/orphan.js': 'o\n',
  });
  assert.throws(() => build(dir), /not included.*js\/orphan\.js/);
});

test('build fails on a file included twice, a missing file, or a bad path', () => {
  assert.throws(() => build(tmpSrc({
    'index.html': '<!-- @include js/a.js -->\n<!-- @include js/a.js -->\n', 'js/a.js': 'a\n',
  })), /included twice.*js\/a\.js/);
  assert.throws(() => build(tmpSrc({ 'index.html': '<!-- @include js/missing.js -->\n' })),
    /js\/missing\.js/);
  assert.throws(() => build(tmpSrc({ 'index.html': '<!-- @include ../secret.js -->\n' })),
    /invalid include path/);
});

test('build fails on a source file without a trailing newline', () => {
  assert.throws(() => build(tmpSrc({
    'index.html': '<!-- @include js/a.js -->\n', 'js/a.js': 'a',
  })), /must end with a newline.*js\/a\.js/);
});

test('build fails on a part with invalid UTF-8 or a byte-order mark', () => {
  const dir = tmpSrc({ 'index.html': '<!-- @include css/a.css -->\n', 'css/a.css': '' });
  fs.writeFileSync(path.join(dir, 'css/a.css'), Buffer.from([0x61, 0xf8, 0x0a])); // Latin-1 ø
  assert.throws(() => build(dir), /invalid UTF-8.*css\/a\.css/);
  assert.throws(() => build(tmpSrc({
    'index.html': '<!-- @include css/a.css -->\n', 'css/a.css': '﻿body {}\n',
  })), /byte-order mark.*css\/a\.css/);
});

test('build fails on a malformed include line instead of shipping it', () => {
  for (const line of ['  <!-- @include js/a.js -->\n', '<!-- @include js/a.js --> \n',
    '<!-- @include js/a.js -->\r\n', '<!-- @include js/a.js -->']) {
    assert.throws(() => build(tmpSrc({ 'index.html': line, 'js/a.js': 'a\n' })),
      /malformed include line 1/, JSON.stringify(line));
  }
});
