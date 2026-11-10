const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { openMedlEntries, medlNavCount } = loadFunctions(['openMedlEntries', 'medlNavCount']);
const J = (x) => JSON.parse(JSON.stringify(x));

const e = (id, caseId, sent, returned) => ({ id, caseId, caseNumber: 'N' + caseId, reader: 'Kari', sent, returned: returned || null });

test('openMedlEntries: bare åpne utsendinger, eldst først', () => {
  const log = [e('1', 'a', '2026-11-05'), e('2', 'b', '2026-11-01', '2026-11-03'), e('3', 'c', '2026-11-02')];
  assert.deepStrictEqual(J(openMedlEntries(log)).map((x) => x.id), ['3', '1']);
});
test('openMedlEntries: lik dato sorteres på saksnummer, og inndata endres ikke', () => {
  const log = [e('1', 'b', '2026-11-02'), e('2', 'a', '2026-11-02')];
  const copy = J(log);
  assert.deepStrictEqual(J(openMedlEntries(log)).map((x) => x.id), ['2', '1']);
  assert.deepStrictEqual(J(log), copy);
});
test('openMedlEntries: tom eller manglende logg gir tom liste', () => {
  assert.deepStrictEqual(J(openMedlEntries([])), []);
  assert.deepStrictEqual(J(openMedlEntries(null)), []);
});

test('medlNavCount: åpne lesinger pluss åpne utsendinger', () => {
  const medlesing = [{ completed: false }, { completed: true }, { completed: false }];
  const log = [e('1', 'a', '2026-11-05'), e('2', 'b', '2026-11-01', '2026-11-03')];
  assert.strictEqual(medlNavCount(medlesing, log), 3);
});
test('medlNavCount: ingenting åpent gir 0, og tomme/manglende lister er greit', () => {
  assert.strictEqual(medlNavCount([], []), 0);
  assert.strictEqual(medlNavCount(null, null), 0);
  assert.strictEqual(medlNavCount([{ completed: true }], [e('1', 'a', '2026-11-01', '2026-11-02')]), 0);
});
