'use strict';
// Reports how many top-level functions in PatentDesk.html are exercised by
// the test suite (i.e. named in a loadFunctions([...]) call). Many functions
// are DOM/render code that can't be unit-tested this way — this is a coarse
// signal, not a coverage gate.
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'PatentDesk.html');
const TEST_DIR = __dirname;

const html = fs.readFileSync(HTML_PATH, 'utf8');
const allFunctions = new Set();
const fnRe = /^function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
let m;
while ((m = fnRe.exec(html))) allFunctions.add(m[1]);

const testFiles = fs.readdirSync(TEST_DIR).filter((f) => f.endsWith('.test.js'));
const tested = new Set();
testFiles.forEach((f) => {
  const src = fs.readFileSync(path.join(TEST_DIR, f), 'utf8');
  const nameRe = /['"]([A-Za-z_$][\w$]*)['"]/g;
  let nm;
  while ((nm = nameRe.exec(src))) {
    if (allFunctions.has(nm[1])) tested.add(nm[1]);
  }
});

const uncovered = [...allFunctions].filter((f) => !tested.has(f)).sort();
const pct = ((tested.size / allFunctions.size) * 100).toFixed(1);

console.log('Top-level functions in PatentDesk.html: ' + allFunctions.size);
console.log('Exercised by tests:                     ' + tested.size + ' (' + pct + '%)');
console.log('\nUncovered (informational; many are DOM/render-only):');
console.log(uncovered.join(', '));
