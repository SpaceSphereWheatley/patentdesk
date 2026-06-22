'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const {
  _docRootNormalize, _docRootJoin, _fileHasExt, _fileResolvedName,
  _fileDisplayName, _fileExt, formatClaimRanges, caseNumberToSlug, slugToCaseId,
} = loadFunctions(
  ['_docRootNormalize', '_docRootJoin', '_fileHasExt', '_fileResolvedName',
    '_fileDisplayName', '_fileExt', 'formatClaimRanges', 'caseNumberToSlug', 'slugToCaseId'],
  { globals: { cases: [{ id: '1', caseNumber: 'P 2026 001' }, { id: '2', caseNumber: 'P-2026-002' }] } }
);

test('_docRootNormalize trims, strips trailing slashes, and converts to backslashes', () => {
  assert.strictEqual(_docRootNormalize('  C:/docs/root/  '), 'C:\\docs\\root');
  assert.strictEqual(_docRootNormalize('C:\\docs\\'), 'C:\\docs');
});

test('_docRootJoin builds a backslash-joined path', () => {
  assert.strictEqual(_docRootJoin('C:/docs', 'P-1', 'søknad.pdf'), 'C:\\docs\\P-1\\søknad.pdf');
});

test('_fileHasExt detects a file extension', () => {
  assert.strictEqual(_fileHasExt('søknad.pdf'), true);
  assert.strictEqual(_fileHasExt('søknad'), false);
});

test('_fileResolvedName appends .pdf when there is no extension', () => {
  assert.strictEqual(_fileResolvedName('søknad'), 'søknad.pdf');
  assert.strictEqual(_fileResolvedName('søknad.docx'), 'søknad.docx');
});

test('_fileDisplayName strips a trailing .pdf extension', () => {
  assert.strictEqual(_fileDisplayName('søknad'), 'søknad');
  assert.strictEqual(_fileDisplayName('søknad.pdf'), 'søknad');
  assert.strictEqual(_fileDisplayName('søknad.docx'), 'søknad.docx');
});

test('_fileExt returns the lowercased extension', () => {
  assert.strictEqual(_fileExt('søknad.PDF'), 'pdf');
  assert.strictEqual(_fileExt('søknad.DOCX'), 'docx');
  assert.strictEqual(_fileExt('søknad'), 'pdf');
});

test('formatClaimRanges returns an em-dash for an empty list', () => {
  assert.strictEqual(formatClaimRanges([]), '—');
});

test('formatClaimRanges collapses consecutive numbers into a range', () => {
  assert.strictEqual(formatClaimRanges([1, 2, 3]), '1–3');
});

test('formatClaimRanges separates non-consecutive numbers and sorts input', () => {
  assert.strictEqual(formatClaimRanges([5, 1, 2, 8]), '1–2, 5, 8');
});

test('caseNumberToSlug replaces whitespace with hyphens', () => {
  assert.strictEqual(caseNumberToSlug('P 2026 001'), 'P-2026-001');
  assert.strictEqual(caseNumberToSlug(''), '');
});

test('slugToCaseId resolves a slug back to the matching case id', () => {
  assert.strictEqual(slugToCaseId('P-2026-001'), '1');
  assert.strictEqual(slugToCaseId('P-2026-002'), '2');
});

test('slugToCaseId returns null when no case matches', () => {
  assert.strictEqual(slugToCaseId('unknown-slug'), null);
});
