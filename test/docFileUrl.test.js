'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadFunctions } = require('./extractFunctions');

const { _docFileUrl } = loadFunctions(
  ['_docFileUrl', '_docServedLocally', '_docRootNormalize', '_docRootJoin',
    '_fileHasExt', '_fileResolvedName']
);

const FILE_LOC = { protocol: 'file:', hostname: '', origin: 'null' };
const LOCALHOST = { protocol: 'http:', hostname: 'localhost', origin: 'http://localhost:8080' };

test('_docFileUrl: opened as a file keeps the file:/// link unchanged', () => {
  assert.strictEqual(
    _docFileUrl('C:\\Saker', 'NO20240001', 'Claims', FILE_LOC),
    'file:///C:/Saker/NO20240001/Claims.pdf'
  );
});

test('_docFileUrl: without a location falls back to the file:/// link', () => {
  assert.strictEqual(
    _docFileUrl('C:\\Saker', 'NO20240001', 'Claims.pdf'),
    'file:///C:/Saker/NO20240001/Claims.pdf'
  );
});

test('_docFileUrl: on localhost links to the local server /docs route', () => {
  assert.strictEqual(
    _docFileUrl('C:\\Saker', 'NO20240001', 'Claims', LOCALHOST),
    'http://localhost:8080/docs?root=C%3A%5CSaker&case=NO20240001&file=Claims.pdf'
  );
});

test('_docFileUrl: 127.0.0.1 is not the local server (it only answers on localhost)', () => {
  const loc = { protocol: 'http:', hostname: '127.0.0.1', origin: 'http://127.0.0.1:8080' };
  assert.strictEqual(
    _docFileUrl('C:\\Saker', 'NO1', 'a.pdf', loc),
    'file:///C:/Saker/NO1/a.pdf'
  );
});

test('_docFileUrl: special characters in root, case number and file name are encoded', () => {
  assert.strictEqual(
    _docFileUrl('C:\\Mine saker+', 'P 2026/001', 'Svar #2 & 100% æøå.pdf', LOCALHOST),
    'http://localhost:8080/docs?root=C%3A%5CMine%20saker%2B&case=P%202026%2F001' +
      '&file=Svar%20%232%20%26%20100%25%20%C3%A6%C3%B8%C3%A5.pdf'
  );
});

test('_docFileUrl: the document root from the settings is normalized before sending', () => {
  assert.strictEqual(
    _docFileUrl('  C:/Saker/  ', 'NO1', 'a.pdf', LOCALHOST),
    'http://localhost:8080/docs?root=C%3A%5CSaker&case=NO1&file=a.pdf'
  );
});

test('_docFileUrl: a whole drive as document root is sent as the bare drive', () => {
  assert.strictEqual(
    _docFileUrl('S:\\', 'NO1', 'a.pdf', LOCALHOST),
    'http://localhost:8080/docs?root=S%3A&case=NO1&file=a.pdf'
  );
});

test('_docFileUrl: a file in a subfolder of the case keeps its separator encoded', () => {
  assert.strictEqual(
    _docFileUrl('C:\\Saker', 'NO1', 'Svar/a.pdf', LOCALHOST),
    'http://localhost:8080/docs?root=C%3A%5CSaker&case=NO1&file=Svar%2Fa.pdf'
  );
});

test('_docFileUrl: a non-local http origin does not use the /docs route', () => {
  const loc = { protocol: 'https:', hostname: 'example.com', origin: 'https://example.com' };
  assert.strictEqual(
    _docFileUrl('C:\\Saker', 'NO1', 'a.pdf', loc),
    'file:///C:/Saker/NO1/a.pdf'
  );
});

// The PowerShell server can't run in CI; check that its safeguards are present.
test('Start-PatentDesk.ps1 takes the root from the link and confines files to root\\case', () => {
  const ps1 = fs.readFileSync(path.join(__dirname, '..', 'Start-PatentDesk.ps1'), 'utf8');
  assert.doesNotMatch(ps1, /\$docRoot\s*=\s*"/, 'no document folder to fill in by hand');
  assert.match(ps1, /Get-QueryValue \$query 'root'/);
  assert.match(ps1, /GetFullPath/);
  assert.match(ps1, /StartsWith\(/);
  assert.match(ps1, /'\.pdf'\s*=\s*'application\/pdf'/);
  assert.match(ps1, /'\.docx'/);
  const docTypes = ps1.slice(ps1.indexOf('$docTypes = @{'), ps1.indexOf('}', ps1.indexOf('$docTypes = @{')));
  assert.match(docTypes, /'\.pdf'/);
  assert.doesNotMatch(docTypes, /'\.(html?|svg|js|exe)'/, 'no executable types among the documents');
  // a bare drive (S:) is a valid root and is made absolute (S:\) before use
  assert.match(ps1, /\^\[A-Za-z\]:\$/);
});

test('Start-PatentDesk.ps1 only serves /docs to PatentDesk itself or the address bar', () => {
  const ps1 = fs.readFileSync(path.join(__dirname, '..', 'Start-PatentDesk.ps1'), 'utf8');
  assert.match(ps1, /Sec-Fetch-Site/);
  const check = ps1.indexOf('Sec-Fetch-Site');
  assert.ok(check > -1 && check < ps1.indexOf('Resolve-Inside $root'), 'origin is checked before any file system access');
});

test('Start-PatentDesk.ps1 stops an already running server before starting', () => {
  const ps1 = fs.readFileSync(path.join(__dirname, '..', 'Start-PatentDesk.ps1'), 'utf8');
  assert.match(ps1, /Win32_Process/);
  assert.match(ps1, /ProcessId -ne \$PID/);
  assert.match(ps1, /Stop-Process/);
  assert.ok(ps1.indexOf('Stop-Process') < ps1.indexOf('.Start()'), 'old server is stopped before the new one starts');
});
