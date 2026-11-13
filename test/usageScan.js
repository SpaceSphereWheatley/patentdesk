'use strict';
// Finds the interactive elements the JS draws (HTML template strings and
// createElement calls) and the feature key each one would get. Shared by the
// usage-tracker tests; not itself a test.
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
      out.push({ file, line, index: m.index, what: '<' + m[1] + '>', key: keyFor(win) });
    }
    const cre = /createElement\('(button|a|select|input)'\)/g;
    while ((m = cre.exec(text))) {
      const line = lineOf(text, m.index);
      const after = text.slice(m.index, m.index + 700);
      if (/\.download\s*=|createObjectURL/.test(after)) continue; // file download, not UI
      if (m[1] === 'input' && /\.type\s*=\s*'text'/.test(after)) continue; // text field, not clicked
      const f = /dataset\.feature\s*=\s*'([^']+)'/.exec(after);
      const id = /\.id\s*=\s*'([^']+)'/.exec(after);
      out.push({ file, line, index: m.index, what: 'createElement(' + m[1] + ')', key: f ? f[1] : id ? id[1] : null });
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
