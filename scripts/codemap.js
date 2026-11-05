#!/usr/bin/env node
'use strict';
// Prints a map of PatentDesk.html: CSS sections, JS sections and
// subsections, and top-level functions, each with its line number.
//
//   node scripts/codemap.js           full map
//   node scripts/codemap.js claim     only functions whose name contains
//                                     "claim" (case-insensitive), with headings
//
// Generated on demand, never committed, so it can't go stale.

const fs = require('fs');
const path = require('path');

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
  return out.join('\n') + '\n';
}

module.exports = { buildCodeMap };

if (require.main === module) {
  const html = fs.readFileSync(path.join(__dirname, '..', 'PatentDesk.html'), 'utf8');
  process.stdout.write(buildCodeMap(html, process.argv[2]));
}
