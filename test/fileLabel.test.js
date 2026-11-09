'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { fileListLabel, applyFileEdit, sakFileRowHtml } = loadFunctions(
  ['fileListLabel', 'applyFileEdit', 'sakFileRowHtml', '_fileHasExt', '_fileResolvedName',
    '_fileDisplayName', '_fileExt', '_fileIcon', 'esc', 'sanitizeText'],
  { vars: ['FILE_LABEL_MAX'] }
);

const plain = (o) => JSON.parse(JSON.stringify(o));
const LONG = '(ISA_237) Written Opinion of the International Searching Authority.pdf';

test('fileListLabel: uten visningsnavn vises filnavnet uten .pdf (AK 1)', () => {
  assert.strictEqual(fileListLabel({ name: 'Claims.pdf' }), 'Claims');
  assert.strictEqual(fileListLabel({ name: 'Notat.docx' }), 'Notat.docx');
  assert.strictEqual(fileListLabel({ name: 'Claims.pdf', label: '   ' }), 'Claims');
});

test('fileListLabel: visningsnavnet vinner når det finnes (AK 2)', () => {
  assert.strictEqual(fileListLabel({ name: LONG, label: 'WO - ISA' }), 'WO - ISA');
});

test('applyFileEdit: setter visningsnavn og beholder filnavn (AK 4)', () => {
  assert.deepStrictEqual(plain(applyFileEdit({ name: LONG }, LONG, '  WO - ISA ')), { name: LONG, label: 'WO - ISA' });
});

test('applyFileEdit: tomt visningsnavn fjerner feltet (AK 5)', () => {
  const out = applyFileEdit({ name: 'A.pdf', label: 'X' }, 'A.pdf', '  ');
  assert.deepStrictEqual(plain(out), { name: 'A.pdf' });
  assert.ok(!('label' in out));
});

test('applyFileEdit: tomt filnavn beholder det gamle (AK 5)', () => {
  assert.deepStrictEqual(plain(applyFileEdit({ name: 'A.pdf', label: 'X' }, '   ', 'X')), { name: 'A.pdf', label: 'X' });
});

test('applyFileEdit: endrer filnavn og renser kontrolltegn, kutter til maks lengde', () => {
  const out = applyFileEdit({ name: 'A.pdf' }, ' B\u0007.pdf ', 'y'.repeat(200));
  assert.strictEqual(out.name, 'B.pdf');
  assert.strictEqual(out.label.length, 80);
});

test('applyFileEdit: muterer ikke originalen', () => {
  const f = { name: 'A.pdf' };
  applyFileEdit(f, 'B.pdf', 'L');
  assert.deepStrictEqual(f, { name: 'A.pdf' });
});

test('sakFileRowHtml: viser visningsnavn, filnavn i tooltip, lenke på filnavn (AK 2, 3)', () => {
  const html = sakFileRowHtml({ name: LONG, label: 'WO - ISA' }, 2, 'file:///C:/x/' + encodeURI(LONG));
  assert.match(html, />WO - ISA<\/span><\/a>/);
  assert.match(html, /title="\(ISA_237\) Written Opinion of the International Searching Authority\.pdf"/);
  assert.match(html, /href="file:\/\/\/C:\/x\/\(ISA_237\)%20Written/);
  assert.match(html, /data-idx="2"/);
});

test('sakFileRowHtml: uten visningsnavn vises filnavnet som før (AK 1)', () => {
  const html = sakFileRowHtml({ name: 'Claims.pdf' }, 0, '#');
  assert.match(html, />Claims<\/span><\/a>/);
  assert.match(html, /title="Claims\.pdf"/);
});

test('sakFileRowHtml: escaper visningsnavn og filnavn (AK 6)', () => {
  const html = sakFileRowHtml({ name: 'a"<x>.pdf', label: '<b>fet</b>' }, 0, '#');
  assert.ok(!html.includes('<b>'));
  assert.ok(html.includes('&lt;b&gt;fet&lt;/b&gt;'));
  assert.ok(html.includes('title="a&quot;&lt;x&gt;.pdf"'));
});
