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
    'http://localhost:8080/docs/NO20240001/Claims.pdf'
  );
});

test('_docFileUrl: 127.0.0.1 is not the local server (it only answers on localhost)', () => {
  const loc = { protocol: 'http:', hostname: '127.0.0.1', origin: 'http://127.0.0.1:8080' };
  assert.strictEqual(
    _docFileUrl('C:\\Saker', 'NO1', 'a.pdf', loc),
    'file:///C:/Saker/NO1/a.pdf'
  );
});

test('_docFileUrl: special characters in case number and file name are encoded', () => {
  assert.strictEqual(
    _docFileUrl('C:\\Saker', 'P 2026/001', 'Svar #2 & 100% æøå.pdf', LOCALHOST),
    'http://localhost:8080/docs/P%202026%2F001/Svar%20%232%20%26%20100%25%20%C3%A6%C3%B8%C3%A5.pdf'
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
test('Start-PatentDesk.ps1 confines /docs to $docRoot and serves PDFs inline', () => {
  const ps1 = fs.readFileSync(path.join(__dirname, '..', 'Start-PatentDesk.ps1'), 'utf8');
  assert.match(ps1, /\$docRoot\s*=/);
  assert.match(ps1, /-eq 'docs'/);
  assert.match(ps1, /GetFullPath/);
  assert.match(ps1, /StartsWith\(/);
  assert.match(ps1, /application\/pdf/);
  // / and \ inside a decoded part become folders (a file in a subfolder), not a 403
  assert.match(ps1, /UnescapeDataString\(\$_\) -split '\[\\\\\/\]'/);
});
