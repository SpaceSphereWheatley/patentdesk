'use strict';
// Finds the interactive elements the JS draws (HTML template strings and
// createElement calls) and the feature key each one would get. Shared by the
// usage-tracker tests; not itself a test.
//
// What this scan cannot see (so a drawn element built that way is NOT guarded):
//  - tag names built from code ('<' + tag), createElement with double quotes,
//    a variable or 'summary', and role="tab" elements drawn by JS
//  - elements made with cloneNode, <template>, DOMParser, or attributes set
//    later (setAttribute('id' | 'data-feature', …), .href = …)
//  - a template window ends at the first '>', so a '=>' or 'a > b' inside an
//    attribute expression cuts it short and later attributes are ignored
//  - only comment lines starting with // or * are skipped; 09a-usage-tracker.js
//    itself is skipped
// Static disabled buttons and the date picker's filler cells are skipped on
// purpose: they can never be clicked / are not features.
const fs = require('fs');
const path = require('path');
const { loadFunctions } = require('./extractFunctions');

const JS_DIR = path.join(__dirname, '..', 'src', 'js');
const STATIC_VALUE = '([^"\'+\\\\]*)'; // a value is only usable if it is a plain string

function attr(win, name) {
  const m = new RegExp('\\s' + name + '=\\\\?"' + STATIC_VALUE + '\\\\?"').exec(win);
  return m ? m[1] : undefined;
}

function keyFor(win) {
  const { usageFeatureKey } = loadFunctions(['usageFeatureKey']);
  const dataset = {};
  const re = new RegExp('\\sdata-([a-z-]+)=\\\\?"' + STATIC_VALUE + '\\\\?"', 'g');
  let a;
  while ((a = re.exec(win))) dataset[a[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = a[2];
  return usageFeatureKey({ id: attr(win, 'id') || '', dataset, className: attr(win, 'class') || '',
    type: attr(win, 'type'), name: attr(win, 'name'), value: attr(win, 'value') });
}

// Attributes that decide the feature key. If one is built from code (an id
// with a case id in it, say) the key would carry case data at runtime while
// the scan only sees the static fallback, so the scan reports it.
const KEY_ATTRS = ['id', 'data-page', 'data-settings-tab', 'data-sak-section', 'data-goto-settings-tab',
  'data-anchor', 'data-status', 'data-kind', 'data-when'];

function unsafeAttrs(win) {
  if (attr(win, 'data-feature') !== undefined) return []; // wins at runtime
  const names = KEY_ATTRS.slice();
  if (/\stype=\\?"radio/.test(win)) names.push('name', 'value');
  const bad = [];
  if (/\sdata-feature=/.test(win)) bad.push('data-feature'); // present but not a plain string
  for (const n of names) {
    if (new RegExp('\\s' + n + '=\\\\?"').test(win) && attr(win, n) === undefined) bad.push(n);
  }
  return bad;
}

function lineOf(text, idx) { return text.slice(0, idx).split('\n').length; }

// Returns [{ file, line, what, key }] — key is null when none can be derived.
function scanDrawn() {
  const out = [];
  for (const file of fs.readdirSync(JS_DIR)) {
    if (file === '09a-usage-tracker.js') continue;
    const text = fs.readFileSync(path.join(JS_DIR, file), 'utf8');
    const lineStarts = text.split('\n');
    const re = /<(button|a|select|summary|input)\b/g;
    let m;
    while ((m = re.exec(text))) {
      const line = lineOf(text, m.index);
      if (/^\s*(\/\/|\*)/.test(lineStarts[line - 1])) continue; // comment
      const rest = text.slice(m.index, m.index + 900);
      const win = rest.slice(0, rest.indexOf('>') === -1 ? 900 : rest.indexOf('>'));
      if (m[1] === 'a' && !/\shref=/.test(win)) continue;
      if (m[1] === 'input' && !/\stype=\\?"(checkbox|radio)/.test(win)) continue;
      if (/"\s+disabled[\s>/]/.test(win)) continue; // always disabled: can never be clicked
      if (/class=\\?"[^"]*\bdp-day-empty\b/.test(win)) continue; // date picker filler cell
      out.push({ file, line, index: m.index, what: '<' + m[1] + '>', key: keyFor(win), unsafe: unsafeAttrs(win) });
    }
    const cre = /createElement\('(button|a|select|input)'\)/g;
    while ((m = cre.exec(text))) {
      const line = lineOf(text, m.index);
      let after = text.slice(m.index, m.index + 400);
      const nextEl = after.indexOf('createElement(', 10);
      if (nextEl !== -1) after = after.slice(0, nextEl); // never read the next element's lines
      if (/\.download\s*=|createObjectURL/.test(after)) continue; // file download, not UI
      if (m[1] === 'input' && /\.type\s*=\s*'text'/.test(after)) continue; // text field, not clicked
      const f = /dataset\.feature\s*=\s*'([^']+)'/.exec(after);
      const id = /\.id\s*=\s*'([^']+)'/.exec(after);
      const unsafe = [];
      const rhs = (name) => { const r = new RegExp('\\.' + name + '\\s*=\\s*([^;\\n]+)').exec(after); return r ? r[1].trim() : null; };
      const featRhs = rhs('dataset\\.feature'), idRhs = rhs('id');
      if (featRhs && !/^'[^'+]*'$/.test(featRhs)) unsafe.push('data-feature');
      if (!f && idRhs && !/^'[^'+]*'$/.test(idRhs)) unsafe.push('id');
      out.push({ file, line, index: m.index, what: 'createElement(' + m[1] + ')', key: f ? f[1] : id ? id[1] : null, unsafe });
    }
  }
  return out;
}

module.exports = { scanDrawn };

// Feature keys of the static markup in src/index.html (always in the DOM).
function staticKeys() {
  const { usageFeatureKey } = loadFunctions(['usageFeatureKey']);
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
  const keys = new Set();
  const re = /<(button|a|select|summary|input)\b([^>]*)>/g;
  let m;
  while ((m = re.exec(html))) {
    const at = ' ' + m[2];
    if (m[1] === 'a' && !/\shref=/.test(at)) continue;
    if (m[1] === 'input' && !/\stype="(checkbox|radio|button|submit)"/.test(at)) continue;
    const dataset = {};
    const dre = /\sdata-([a-z-]+)="([^"]*)"/g;
    let a;
    while ((a = dre.exec(at))) dataset[a[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = a[2];
    const g = (n) => (new RegExp('\\s' + n + '="([^"]*)"').exec(at) || [])[1];
    const k = usageFeatureKey({ id: g('id') || '', dataset, className: g('class') || '', type: g('type'), name: g('name'), value: g('value') });
    if (k) keys.add(k);
  }
  return keys;
}

// Keys of drawn elements that are not in the static markup: what the
// "never used" list cannot learn from the DOM.
function dynamicKeys() {
  const stat = staticKeys();
  return [...new Set(scanDrawn().map((x) => x.key).filter(Boolean))].filter((k) => !stat.has(k)).sort();
}

module.exports.staticKeys = staticKeys;
module.exports.dynamicKeys = dynamicKeys;
