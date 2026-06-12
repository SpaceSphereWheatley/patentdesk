'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HTML_PATH = path.join(__dirname, '..', 'PatentDesk.html');

// Extracts a top-level `function name(...) { ... }` block from PatentDesk.html
// by brace-counting from the `function name(` declaration.
function extractFunctionSource(html, name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\(');
  const match = re.exec(html);
  if (!match) throw new Error('Function not found: ' + name);
  const start = match.index;
  const braceStart = html.indexOf('{', start);
  let depth = 0;
  let i = braceStart;
  for (; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) { i++; break; }
    }
  }
  return html.slice(start, i);
}

// Loads the named pure functions from PatentDesk.html into a sandbox and
// returns them as callable JS functions, so domain-logic tests don't need
// to spin up the full single-file app (DOM, IndexedDB, localStorage, etc).
function loadFunctions(names) {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const sources = names.map((name) => extractFunctionSource(html, name));
  const sandbox = { module: { exports: {} } };
  vm.createContext(sandbox);
  vm.runInContext(sources.join('\n') + '\nmodule.exports = { ' + names.join(', ') + ' };', sandbox);
  return sandbox.module.exports;
}

module.exports = { extractFunctionSource, loadFunctions };
