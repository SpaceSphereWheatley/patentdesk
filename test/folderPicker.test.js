'use strict';
// Mappesynk uten lokal server: nettleserens mappevelger (File System Access)
// leser saksmappen i stedet for serverens /docs/list. Se CHANGELOG [Unreleased].
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const {
  docServerProbeUrl, docServerProbeOk, docFolderSyncMode, folderPickerSupported,
  folderEntryAccepted, folderCaseParts, readCaseFolder, folderPermissionGranted,
  folderSyncButton, normalizeFolderListing, folderFilesToAdd
} = loadFunctions(
  ['docServerProbeUrl', 'docServerProbeOk', 'docFolderSyncMode', 'folderPickerSupported',
    'folderEntryAccepted', 'folderCaseParts', 'readCaseFolder', 'folderPermissionGranted',
    'folderSyncButton', '_collectDirEntries', '_sortedByName',
    'normalizeFolderListing', 'folderFilesToAdd', 'folderFileKey', '_folderKeys',
    '_fileHasExt', '_fileResolvedName'],
  { vars: ['FOLDER_LIST_MAX', 'FOLDER_DOC_EXTS'] }
);
const arr = (a) => Array.from(a);

// ── Falske mappehåndtak (samme form som FileSystemDirectoryHandle) ──

function file(name) { return { kind: 'file', name }; }
function dir(name, children) {
  const kids = children || [];
  return {
    kind: 'directory', name,
    values() {
      let i = 0;
      return { next() { return Promise.resolve(i < kids.length ? { done: false, value: kids[i++] } : { done: true, value: undefined }); } };
    },
    getDirectoryHandle(n) {
      const k = kids.find((c) => c.name === n);
      if (!k) return Promise.reject(Object.assign(new Error('nf'), { name: 'NotFoundError' }));
      if (k.kind !== 'directory') return Promise.reject(Object.assign(new Error('tm'), { name: 'TypeMismatchError' }));
      return Promise.resolve(k);
    }
  };
}

// ── Servermodus og synkvalg ─────────────────────────

test('docServerProbeUrl: a valid, harmless listing request on the same origin', () => {
  const u = docServerProbeUrl({ protocol: 'http:', origin: 'http://127.0.0.1:8080' });
  assert.ok(u.startsWith('http://127.0.0.1:8080/docs/list?'), u);
  assert.ok(/root=C%3A%5C/.test(u), 'a full drive path, so the server answers 200 instead of 400');
  assert.ok(/case=/.test(u));
});

test('docServerProbeUrl: file:// and missing location give no probe', () => {
  assert.strictEqual(docServerProbeUrl({ protocol: 'file:', origin: 'null' }), null);
  assert.strictEqual(docServerProbeUrl(null), null);
  assert.strictEqual(docServerProbeUrl(undefined), null);
});

test('docServerProbeOk: only a real listing answer counts as the PatentDesk server', () => {
  assert.strictEqual(docServerProbeOk({ exists: false, files: [] }), true);
  assert.strictEqual(docServerProbeOk({ exists: true, files: ['a.pdf'] }), true);
  [null, undefined, 'x', 5, [], {}, '<html>404</html>', { error: 'x' }].forEach((v) =>
    assert.strictEqual(docServerProbeOk(v), false, JSON.stringify(v)));
});

test('docFolderSyncMode: server first, picker as fallback, otherwise none', () => {
  assert.strictEqual(docFolderSyncMode(true, true), 'server');
  assert.strictEqual(docFolderSyncMode(true, false), 'server');
  assert.strictEqual(docFolderSyncMode(false, true), 'picker');
  assert.strictEqual(docFolderSyncMode(false, false), 'none');
  assert.strictEqual(docFolderSyncMode(undefined, undefined), 'none');
});

test('folderPickerSupported: needs showDirectoryPicker and a secure context', () => {
  assert.strictEqual(folderPickerSupported({ showDirectoryPicker() {}, isSecureContext: true }), true);
  assert.strictEqual(folderPickerSupported({ showDirectoryPicker() {}, isSecureContext: false }), false);
  assert.strictEqual(folderPickerSupported({ isSecureContext: true }), false);   // Firefox, Safari
  assert.strictEqual(folderPickerSupported({}), false);
  assert.strictEqual(folderPickerSupported(null), false);
});

// ── Knappen ─────────────────────────────────────────

test('folderSyncButton: hidden unless the picker is the sync mode (never in server mode or without support)', () => {
  assert.strictEqual(folderSyncButton('server', true, true).visible, false);
  assert.strictEqual(folderSyncButton('none', false, false).visible, false);
  assert.strictEqual(folderSyncButton('picker', false, false).visible, true);
});

test('folderSyncButton: no folder picked yet -> the button asks for the folder', () => {
  const b = folderSyncButton('picker', false, false);
  assert.strictEqual(b.label, 'Velg mappe');
  assert.strictEqual(b.autoSync, false);
});

test('folderSyncButton: folder remembered but permission needs a click -> "Synk mappe", no automatic sync', () => {
  const b = folderSyncButton('picker', true, false);
  assert.strictEqual(b.label, 'Synk mappe');
  assert.strictEqual(b.autoSync, false);
});

test('folderSyncButton: permission already granted -> the case syncs by itself when opened', () => {
  const b = folderSyncButton('picker', true, true);
  assert.strictEqual(b.autoSync, true);
  assert.strictEqual(b.label, 'Synk mappe');
});

// ── Hvilke filer som tas med (som serveren) ─────────

test('folderEntryAccepted: document types only, case-insensitive', () => {
  ['a.pdf', 'A.PDF', 'b.docx', 'c.xlsx', 'd.png', 'e.JPG', 'f.txt'].forEach((n) => assert.strictEqual(folderEntryAccepted(n), true, n));
  ['a.exe', 'b.zip', 'noext', 'c.pdf.lnk', '.pdf'].forEach((n) => assert.strictEqual(folderEntryAccepted(n), false, n));
});

test('folderEntryAccepted: temp files (~$) and hidden files (.) are skipped', () => {
  assert.strictEqual(folderEntryAccepted('~$Claims.docx'), false);
  assert.strictEqual(folderEntryAccepted('.hidden.pdf'), false);
});

// ── Saksnummer som mappenavn ────────────────────────

test('folderCaseParts: plain case numbers and one-level paths are split like the server does', () => {
  assert.deepStrictEqual(arr(folderCaseParts('20241234')), ['20241234']);
  assert.deepStrictEqual(arr(folderCaseParts('NO/2024\\1234')), ['NO', '2024', '1234']);
});

test('folderCaseParts: empty, dot and parent segments are rejected (never leave the root)', () => {
  ['', '   ', null, undefined, '..', '../x', 'a/../b', './x', 'a/./b', '/', '\\'].forEach((v) =>
    assert.strictEqual(folderCaseParts(v), null, JSON.stringify(v)));
});

// ── readCaseFolder ──────────────────────────────────

test('readCaseFolder: lists files in the case folder and one subfolder down, as relative names with /', async () => {
  const root = dir('Saker', [dir('123', [file('Claims.pdf'), file('Notes.txt'), dir('Cited', [file('D1.pdf')])])]);
  const raw = await readCaseFolder(root, '123');
  assert.strictEqual(raw.exists, true);
  assert.deepStrictEqual(arr(raw.files), ['Claims.pdf', 'Notes.txt', 'Cited/D1.pdf']);
});

test('readCaseFolder: the answer has the shape the server gives, so it passes normalizeFolderListing', async () => {
  const root = dir('Saker', [dir('123', [file('Claims.pdf')])]);
  const n = normalizeFolderListing(await readCaseFolder(root, '123'));
  assert.strictEqual(n.exists, true);
  assert.deepStrictEqual(arr(n.files), ['Claims.pdf']);
});

test('readCaseFolder: only one level of subfolder is read', async () => {
  const root = dir('Saker', [dir('123', [dir('A', [file('x.pdf'), dir('B', [file('deep.pdf')])])])]);
  assert.deepStrictEqual(arr((await readCaseFolder(root, '123')).files), ['A/x.pdf']);
});

test('readCaseFolder: files in the folder itself come first, then subfolders by name; each sorted by name', async () => {
  const root = dir('Saker', [dir('123', [
    file('b.pdf'), dir('Zeta', [file('z.pdf')]), file('a.pdf'), dir('Alfa', [file('y.pdf'), file('x.pdf')])
  ])]);
  assert.deepStrictEqual(arr((await readCaseFolder(root, '123')).files),
    ['a.pdf', 'b.pdf', 'Alfa/x.pdf', 'Alfa/y.pdf', 'Zeta/z.pdf']);
});

test('readCaseFolder: skips other file types, temp and hidden files', async () => {
  const root = dir('Saker', [dir('123', [file('ok.pdf'), file('virus.exe'), file('~$tmp.docx'), file('.DS.pdf'), file('arch.zip')])]);
  assert.deepStrictEqual(arr((await readCaseFolder(root, '123')).files), ['ok.pdf']);
});

test('readCaseFolder: a missing case folder is a valid answer: exists false, no files', async () => {
  const raw = await readCaseFolder(dir('Saker', [dir('999', [])]), '123');
  assert.deepStrictEqual({ exists: raw.exists, files: arr(raw.files) }, { exists: false, files: [] });
});

test('readCaseFolder: a case "folder" that is really a file counts as missing', async () => {
  const raw = await readCaseFolder(dir('Saker', [file('123')]), '123');
  assert.strictEqual(raw.exists, false);
});

test('readCaseFolder: an empty case folder exists with no files', async () => {
  const raw = await readCaseFolder(dir('Saker', [dir('123', [])]), '123');
  assert.deepStrictEqual({ exists: raw.exists, files: arr(raw.files) }, { exists: true, files: [] });
});

test('readCaseFolder: nested case numbers walk into the root one part at a time', async () => {
  const root = dir('Saker', [dir('NO', [dir('2024', [dir('1234', [file('a.pdf')])])])]);
  assert.deepStrictEqual(arr((await readCaseFolder(root, 'NO/2024/1234')).files), ['a.pdf']);
});

test('readCaseFolder: an unsafe case number reads nothing and gives null (no sync)', async () => {
  const root = dir('Saker', [dir('123', [file('a.pdf')])]);
  for (const v of ['', '..', 'a/../b', null]) assert.strictEqual(await readCaseFolder(root, v), null, JSON.stringify(v));
});

test('readCaseFolder: a handle error other than "not found" (permission lost, disk gone) gives null, never a false "folder missing"', async () => {
  const root = { kind: 'directory', name: 'Saker', getDirectoryHandle() { return Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })); } };
  assert.strictEqual(await readCaseFolder(root, '123'), null);
  assert.strictEqual(await readCaseFolder(null, '123'), null);
});

test('readCaseFolder: the list is capped at 500 files', async () => {
  const many = Array.from({ length: 700 }, (_, i) => file('f' + String(i).padStart(4, '0') + '.pdf'));
  const raw = await readCaseFolder(dir('Saker', [dir('123', many)]), '123');
  assert.strictEqual(raw.files.length, 500);
});

test('readCaseFolder + folderFilesToAdd: new files are added, registered ones are not', async () => {
  const root = dir('Saker', [dir('123', [file('Claims.pdf'), file('New.pdf')])]);
  const n = normalizeFolderListing(await readCaseFolder(root, '123'));
  assert.deepStrictEqual(arr(folderFilesToAdd([{ name: 'Claims.pdf' }], n.files)), ['New.pdf']);
});

// ── Tillatelse ──────────────────────────────────────

test('folderPermissionGranted: already granted -> true without asking', async () => {
  let asked = 0;
  const h = { queryPermission: async () => 'granted', requestPermission: async () => { asked++; return 'granted'; } };
  assert.strictEqual(await folderPermissionGranted(h, true), true);
  assert.strictEqual(asked, 0);
});

test('folderPermissionGranted: needs a click -> asks only when allowed to (ask = true)', async () => {
  let asked = 0;
  const h = { queryPermission: async () => 'prompt', requestPermission: async () => { asked++; return 'granted'; } };
  assert.strictEqual(await folderPermissionGranted(h, false), false);
  assert.strictEqual(asked, 0, 'opening a case must never pop up a permission dialog');
  assert.strictEqual(await folderPermissionGranted(h, true), true);
  assert.strictEqual(asked, 1);
});

test('folderPermissionGranted: denied, errors and no handle all give false, never throw', async () => {
  const denied = { queryPermission: async () => 'prompt', requestPermission: async () => 'denied' };
  const boom = { queryPermission: async () => { throw new Error('x'); } };
  assert.strictEqual(await folderPermissionGranted(denied, true), false);
  assert.strictEqual(await folderPermissionGranted(boom, true), false);
  assert.strictEqual(await folderPermissionGranted(null, true), false);
  assert.strictEqual(await folderPermissionGranted({}, true), false);
});

test('folderPermissionGranted: asks for read access only', async () => {
  const modes = [];
  const h = { queryPermission: async (o) => { modes.push(o.mode); return 'prompt'; }, requestPermission: async (o) => { modes.push(o.mode); return 'granted'; } };
  await folderPermissionGranted(h, true);
  assert.deepStrictEqual(modes, ['read', 'read']);
});
