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

// Extracts a top-level `var name = ...;` declaration from PatentDesk.html.
function extractVarSource(html, name) {
  const re = new RegExp('var\\s+' + name + '\\s*=');
  const match = re.exec(html);
  if (!match) throw new Error('Var not found: ' + name);
  const start = match.index;
  const end = html.indexOf(';\n', start);
  if (end === -1) throw new Error('Unterminated var: ' + name);
  return html.slice(start, end + 1);
}

// Loads the named pure functions (and optional top-level vars / extra globals)
// from PatentDesk.html into a sandbox and returns them as callable JS values,
// so domain-logic tests don't need to spin up the full single-file app (DOM,
// IndexedDB, localStorage, etc).
function loadFunctions(names, opts) {
  opts = opts || {};
  const vars = opts.vars || [];
  const globals = opts.globals || {};
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const sources = names.map((name) => extractFunctionSource(html, name))
    .concat(vars.map((name) => extractVarSource(html, name)));
  const sandbox = Object.assign({ module: { exports: {} } }, globals);
  vm.createContext(sandbox);
  const exported = names.concat(vars);
  vm.runInContext(sources.join('\n') + '\nmodule.exports = { ' + exported.join(', ') + ' };', sandbox);
  return sandbox.module.exports;
}

module.exports = { extractFunctionSource, extractVarSource, loadFunctions };
