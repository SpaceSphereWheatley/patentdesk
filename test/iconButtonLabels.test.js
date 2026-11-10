const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// En knapp med bare et symbol som innhold (✕ ‹ › ⋯ ⏱) har ingen tekst en
// skjermleser kan lese; title alene er ikke et pålitelig tilgjengelig navn.
test('knapper med bare et symbol har aria-label', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
  const bad = [];
  const re = /<button\b([^>]*)>\s*([✕×‹›⋯⏱✎])\s*<\/button>/g;
  let m;
  while ((m = re.exec(html))) {
    if (!/\baria-label=/.test(m[1])) bad.push((/id="([^"]+)"/.exec(m[1]) || [, m[2]])[1]);
  }
  assert.deepStrictEqual(bad, []);
});
