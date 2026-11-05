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
