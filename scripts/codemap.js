#!/usr/bin/env node
'use strict';
// Prints a map of the source files in src/ (in build order): CSS sections,
// JS sections and subsections, and top-level functions, each with its line
// number in that file.
//
//   node scripts/codemap.js           full map
//   node scripts/codemap.js claim     only functions whose name contains
//                                     "claim" (case-insensitive), with headings
//
// Generated on demand, never committed, so it can't go stale.

const fs = require('fs');
const path = require('path');
const { includedFiles } = require('./build.js');

const CSS_SECTION = /^\/\* ── (.+?) ─/;
const JS_SECTION = /^\/\/ (SEKSJON \d+ · .+?)\s*$/;
const JS_SUBSECTION = /^\/\/ ── (.+?) ─/;
const FUNCTION = /^(?:async\s+)?function\s+([\w$]+)\s*\(/;

function buildCodeMap(html, filter) {
  const needle = filter ? String(filter).toLowerCase() : '';
  const lines = html.split('\n');
  const width = String(lines.length).length;
  const fmt = (n, indent, text) => String(n).padStart(width) + '  ' + indent + text;

  const out = [];
  let pendingSection = null;    // printed lazily when filtering
  let pendingSubsection = null;

  lines.forEach((line, i) => {
    const n = i + 1;
    let m;
    if ((m = CSS_SECTION.exec(line))) {
      if (!needle) out.push(fmt(n, '', m[1]));
    } else if ((m = JS_SECTION.exec(line))) {
      pendingSection = fmt(n, '', m[1]);
      pendingSubsection = null;
      if (!needle) { out.push(pendingSection); pendingSection = null; }
    } else if ((m = JS_SUBSECTION.exec(line))) {
      pendingSubsection = fmt(n, '  ', '── ' + m[1]);
      if (!needle) { out.push(pendingSubsection); pendingSubsection = null; }
    } else if ((m = FUNCTION.exec(line))) {
      if (needle && !m[1].toLowerCase().includes(needle)) return;
      if (pendingSection) { out.push(pendingSection); pendingSection = null; }
      if (pendingSubsection) { out.push(pendingSubsection); pendingSubsection = null; }
      out.push(fmt(n, '    ', m[1]));
    }
  });
  return out.length ? out.join('\n') + '\n' : '';
}

// Map of every included source file, each under a "== src/<file>" heading.
// Files with nothing to show (e.g. no match for the filter) are left out.
function buildSrcMap(srcDir, filter) {
  return includedFiles(srcDir).map(rel => {
    const body = buildCodeMap(fs.readFileSync(path.join(srcDir, rel), 'utf8'), filter);
    return body ? '== src/' + rel + '\n' + body : '';
  }).filter(Boolean).join('\n');
}

module.exports = { buildCodeMap, buildSrcMap };

if (require.main === module) {
  process.stdout.write(buildSrcMap(path.join(__dirname, '..', 'src'), process.argv[2]));
}
