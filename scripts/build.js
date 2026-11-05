#!/usr/bin/env node
'use strict';
// Builds PatentDesk.html from src/.
//
// src/index.html is the page. Each line of the exact form
//   <!-- @include css/xx.css -->
// is replaced by that file's contents, byte for byte. Nothing else changes:
// no minifying, no wrapping, no imports. Every file under src/css, src/js
// and src/vendor must be included exactly once.
//
//   node scripts/build.js            write PatentDesk.html
//   node scripts/build.js --check    exit 1 if PatentDesk.html is out of date

const fs = require('fs');
const path = require('path');

const INCLUDE_LINE = /^<!-- @include (.*) -->\n/gm;
const VALID_PATH = /^(css|js|vendor)\/[\w.-]+$/;
const PART_DIRS = ['css', 'js', 'vendor'];

function build(srcDir) {
  const template = fs.readFileSync(path.join(srcDir, 'index.html'), 'utf8');
  const included = new Set();

  // Anything that looks like an include but isn't exactly one would be
  // silently shipped as a comment, so refuse it.
  template.split('\n').forEach((line, i, all) => {
    const exact = /^<!-- @include .* -->$/.test(line) && i < all.length - 1;
    if (line.includes('@include') && !exact) {
      throw new Error('malformed include line ' + (i + 1) + ': ' + JSON.stringify(line));
    }
  });

  const out = template.replace(INCLUDE_LINE, (line, rel) => {
    if (!VALID_PATH.test(rel)) throw new Error('invalid include path: ' + rel);
    if (included.has(rel)) throw new Error('included twice: ' + rel);
    included.add(rel);
    const body = fs.readFileSync(path.join(srcDir, rel), 'utf8');
    if (!body.endsWith('\n')) throw new Error('must end with a newline: ' + rel);
    if (body.includes('\uFFFD')) throw new Error('invalid UTF-8 (save the file as UTF-8): ' + rel);
    if (body.includes('\uFEFF')) throw new Error('byte-order mark (save as UTF-8 without BOM): ' + rel);
    return body;
  });

  const orphans = [];
  for (const dir of PART_DIRS) {
    const abs = path.join(srcDir, dir);
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs)) {
      if (!included.has(dir + '/' + name)) orphans.push(dir + '/' + name);
    }
  }
  if (orphans.length) throw new Error('not included in src/index.html: ' + orphans.join(', '));
  return out;
}

// Included files in build order, e.g. for the code map.
function includedFiles(srcDir) {
  const template = fs.readFileSync(path.join(srcDir, 'index.html'), 'utf8');
  return [...template.matchAll(INCLUDE_LINE)].map(m => m[1]);
}

module.exports = { build, includedFiles };

if (require.main === module) {
  const root = path.join(__dirname, '..');
  const target = path.join(root, 'PatentDesk.html');
  const html = build(path.join(root, 'src'));
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    if (current !== html) {
      console.error('PatentDesk.html is out of date. Edit src/ and run `npm run build`.');
      process.exit(1);
    }
    console.log('PatentDesk.html is up to date.');
  } else {
    fs.writeFileSync(target, html);
    console.log('Built PatentDesk.html (' + html.split('\n').length + ' lines).');
  }
}
