'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { normalizeFolderListing, folderFilesToAdd, missingFileIndexes, sakFileRowHtml } = loadFunctions(
  ['normalizeFolderListing', 'folderFilesToAdd', 'missingFileIndexes', 'folderFileKey', '_folderKeys', '_registeredName', 'sakFileRowHtml',
    'fileListLabel', '_fileLabelClean', '_fileHasExt', '_fileResolvedName', '_fileDisplayName', '_fileExt',
    '_fileIcon', 'esc', 'sanitizeText'],
  { vars: ['FILE_LABEL_MAX', 'FOLDER_LIST_MAX'] }
);
const arr = (a) => Array.from(a);
const names = (l) => l.map((n) => ({ name: n }));

// ── normalizeFolderListing ──────────────────────────

test('normalizeFolderListing: a valid answer keeps exists and the file names', () => {
  const r = normalizeFolderListing({ exists: true, files: ['Claims.pdf', 'Sub/D1.pdf'] });
  assert.strictEqual(r.exists, true);
  assert.deepStrictEqual(arr(r.files), ['Claims.pdf', 'Sub/D1.pdf']);
});

test('normalizeFolderListing: a missing folder is a valid answer with no files', () => {
  const r = normalizeFolderListing({ exists: false, files: [] });
  assert.strictEqual(r.exists, false);
  assert.deepStrictEqual(arr(r.files), []);
});

test('normalizeFolderListing: anything that is not the expected shape is rejected', () => {
  [null, undefined, 'x', 5, [], {}, { exists: 'ja', files: [] }, { exists: true }, { exists: true, files: 'x' }].forEach((v) =>
    assert.strictEqual(normalizeFolderListing(v), null, JSON.stringify(v)));
});

test('normalizeFolderListing: only safe, plain file names survive', () => {
  const r = normalizeFolderListing({ exists: true, files: [
    'ok.pdf', '', '   ', 5, null, '../secret.pdf', 'a/../b.pdf', '/abs.pdf', 'C:\\x.pdf', 'd:x.pdf', 'x'.repeat(300) + '.pdf', 'ctrl\u0001.pdf', 'Sub\\Back.pdf'
  ] });
  assert.deepStrictEqual(arr(r.files), ['ok.pdf', 'ctrl.pdf', 'Sub/Back.pdf']);
});

test('normalizeFolderListing: duplicates (ignoring case) are dropped and the list is capped', () => {
  const r = normalizeFolderListing({ exists: true, files: ['A.pdf', 'a.PDF', 'B.pdf'] });
  assert.deepStrictEqual(arr(r.files), ['A.pdf', 'B.pdf']);
  const many = Array.from({ length: 2000 }, (_, i) => 'f' + i + '.pdf');
  assert.ok(normalizeFolderListing({ exists: true, files: many }).files.length <= 500);
});

// ── folderFilesToAdd ────────────────────────────────

test('folderFilesToAdd: files on disk that are not registered are added, in folder order', () => {
  assert.deepStrictEqual(arr(folderFilesToAdd(names(['Claims.pdf']), ['Claims.pdf', 'D1.pdf', 'Figures.pdf'])), ['D1.pdf', 'Figures.pdf']);
});

test('folderFilesToAdd: comparison ignores case, and a registered name without extension means .pdf', () => {
  assert.deepStrictEqual(arr(folderFilesToAdd(names(['claims', 'FIGURES.PDF']), ['Claims.pdf', 'Figures.pdf', 'D1.pdf'])), ['D1.pdf']);
});

test('folderFilesToAdd: slashes and backslashes are the same path', () => {
  assert.deepStrictEqual(arr(folderFilesToAdd(names(['Sub\\D1.pdf']), ['Sub/D1.pdf'])), []);
});

test('folderFilesToAdd: nothing to add when everything is registered, or when there are no files', () => {
  assert.deepStrictEqual(arr(folderFilesToAdd(names(['A.pdf']), ['A.pdf'])), []);
  assert.deepStrictEqual(arr(folderFilesToAdd(names(['A.pdf']), [])), []);
  assert.deepStrictEqual(arr(folderFilesToAdd([], ['A.pdf'])), ['A.pdf']);
  assert.deepStrictEqual(arr(folderFilesToAdd(null, ['A.pdf'])), ['A.pdf']);
});

test('folderFilesToAdd: malformed registered entries are ignored, not matched', () => {
  assert.deepStrictEqual(arr(folderFilesToAdd([null, {}, { name: 5 }, { name: 'A.pdf' }], ['A.pdf', 'B.pdf'])), ['B.pdf']);
});

// ── missingFileIndexes ──────────────────────────────

test('missingFileIndexes: registered files that are not on disk are flagged by position', () => {
  const f = names(['Claims.pdf', 'Description.pdf', 'Abstract.pdf']);
  assert.deepStrictEqual(arr(missingFileIndexes(f, ['claims.pdf', 'Other.pdf'])), [1, 2]);
});

test('missingFileIndexes: a name without extension matches the .pdf on disk', () => {
  assert.deepStrictEqual(arr(missingFileIndexes(names(['Claims']), ['Claims.pdf'])), []);
});

test('missingFileIndexes: nothing is flagged when the folder has all of them, or the list is empty', () => {
  assert.deepStrictEqual(arr(missingFileIndexes(names(['A.pdf']), ['A.pdf'])), []);
  assert.deepStrictEqual(arr(missingFileIndexes([], ['A.pdf'])), []);
  assert.deepStrictEqual(arr(missingFileIndexes(null, [])), []);
});

test('missingFileIndexes: all registered files are flagged when the folder is empty', () => {
  assert.deepStrictEqual(arr(missingFileIndexes(names(['A.pdf', 'B.pdf']), [])), [0, 1]);
});

// ── sakFileRowHtml ──────────────────────────────────

test('sakFileRowHtml: a missing file carries a visible "mangler" tag and a class', () => {
  const html = sakFileRowHtml({ name: 'Claims.pdf' }, 0, '#', true);
  assert.match(html, /sak-docs-missing/);
  assert.match(html, /mangler/);
});

test('sakFileRowHtml: an ordinary file looks as before', () => {
  const html = sakFileRowHtml({ name: 'Claims.pdf' }, 0, '#');
  assert.doesNotMatch(html, /sak-docs-missing/);
  assert.doesNotMatch(html, /mangler/);
  assert.strictEqual(html, sakFileRowHtml({ name: 'Claims.pdf' }, 0, '#', false));
});

test('sakFileRowHtml: markup in a file name stays text', () => {
  const html = sakFileRowHtml({ name: '<img src=x onerror=1>.pdf' }, 0, '#', true);
  assert.doesNotMatch(html, /<img/);
});
