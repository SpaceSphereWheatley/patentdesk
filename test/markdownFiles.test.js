'use strict';
// .md-filer i saksmappen: mappesynk, dokumentpaneler og fillisten.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadFunctions } = require('./extractFunctions');

const {
  _fileIsMd, _fileIsPaneDoc, _fileIcon, folderEntryAccepted, docSlotMatch, docSlotAssign, docPaneUrl
} = loadFunctions(
  ['_fileIsMd', '_fileIsPaneDoc', '_fileIsPdf', '_fileExt', '_fileIcon', '_fileHasExt', '_fileResolvedName',
    '_fileDisplayName', 'folderEntryAccepted', 'docSlotMatch', 'docSlotAssign', 'docPaneUrl',
    '_docFileUrl', '_docServedLocally', '_docRootNormalize', '_docRootJoin'],
  { vars: ['FOLDER_DOC_EXTS', 'DOC_PANE_MAX'] }
);
const names = (files) => files.map((f) => ({ name: f }));
const LOCAL = { protocol: 'http:', hostname: 'localhost', origin: 'http://localhost:8080' };

test('_fileIsMd / _fileIsPaneDoc: .md (any case) and .pdf open in a pane, nothing else', () => {
  assert.strictEqual(_fileIsMd('Notater.md'), true);
  assert.strictEqual(_fileIsMd('NOTATER.MD'), true);
  assert.strictEqual(_fileIsMd('notater.markdown'), false);
  assert.strictEqual(_fileIsMd('Claims'), false, 'no extension means .pdf');
  assert.strictEqual(_fileIsPaneDoc('a.md'), true);
  assert.strictEqual(_fileIsPaneDoc('a.pdf'), true);
  assert.strictEqual(_fileIsPaneDoc('a'), true);
  ['a.docx', 'a.txt', 'a.png', 'a.html'].forEach((n) => assert.strictEqual(_fileIsPaneDoc(n), false, n));
});

test('_fileIcon: .md files get the text icon', () => {
  assert.strictEqual(_fileIcon('notater.md'), _fileIcon('notater.txt'));
});

test('folderEntryAccepted: .md files are picked up by the folder picker (AC 3)', () => {
  assert.strictEqual(folderEntryAccepted('Notater.md'), true);
  assert.strictEqual(folderEntryAccepted('NOTATER.MD'), true);
  assert.strictEqual(folderEntryAccepted('~$notater.md'), false);
  assert.strictEqual(folderEntryAccepted('.notater.md'), false);
});

test('Start-PatentDesk.ps1 lists and serves .md as text, with the same types as the folder picker (AC 3)', () => {
  const ps1 = fs.readFileSync(path.join(__dirname, '..', 'Start-PatentDesk.ps1'), 'utf8');
  const start = ps1.indexOf('$docTypes = @{');
  const block = ps1.slice(start, ps1.indexOf('}', start));
  assert.match(block, /'\.md'\s*=\s*'text\/markdown; charset=utf-8'/);
  const serverExts = (block.match(/'\.[a-z0-9]+'/g) || []).map((s) => s.slice(1, -1)).sort();
  assert.deepStrictEqual(serverExts, Array.from(FOLDER_DOC_EXTS_COPY()).sort());
});
function FOLDER_DOC_EXTS_COPY() {
  return loadFunctions([], { vars: ['FOLDER_DOC_EXTS'] }).FOLDER_DOC_EXTS;
}

test('docSlotMatch: pane rules still match PDFs only, never .md', () => {
  assert.strictEqual(docSlotMatch(names(['notater.md']), 'notater', []), -1);
  assert.strictEqual(docSlotMatch(names(['notater.md', 'notater.pdf']), 'notater', []), 1);
});

test('docSlotAssign: a .md file can be picked by hand and is kept (AC 4, 5)', () => {
  const f = names(['Claims.pdf', 'notater.md', 'Figur.docx']);
  assert.deepStrictEqual(Array.from(docSlotAssign(f, ['claims', '', ''], 2, [null, 1])), [0, 1]);
  assert.deepStrictEqual(Array.from(docSlotAssign(f, ['', '', ''], 2, [1, 2])), [1, -1], 'docx is still not a pane file');
});

test('docSlotAssign: an .md picked by hand is not also placed by a rule elsewhere', () => {
  const f = names(['notater.md', 'notater.pdf']);
  assert.deepStrictEqual(Array.from(docSlotAssign(f, ['', 'notater', ''], 2, [0, null])), [0, 1]);
});

test('docPaneUrl: an .md file gets a /docs address in server mode, none without the server', () => {
  assert.strictEqual(docPaneUrl('C:\\Saker', 'NO1', 'notater.md', LOCAL, false),
    'http://localhost:8080/docs?root=C%3A%5CSaker&case=NO1&file=notater.md');
  assert.strictEqual(docPaneUrl('C:\\Saker', 'NO1', 'notater.md', { protocol: 'file:', hostname: '' }, false), null);
});
