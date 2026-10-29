'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { normalizeCaseSourceUrl, normalizeCaseSource, caseSourceTitle, readImportSettings } = loadFunctions(
  ['normalizeCaseSourceUrl', 'normalizeCaseSource', 'caseSourceTitle',
   'readImportSettings', 'isValidChecklistTemplate', 'normalizeHomeDeadlineFilter', 'defaultHomeDeadlineFilter',
   'normalizeWorkWindows', 'migrateWorkWindowsToWorkdays', 'normalizeTypeBuffers'],
  { vars: ['CASE_SOURCE_TRACKING_PARAMS', 'CASE_SOURCE_LABEL_MAX',
           'HOME_DEADLINE_KINDS', 'HOME_DEADLINE_HORIZONS', 'WORK_WINDOW_DEFAULTS', 'WORK_WINDOW_MAX',
           'TYPE_BUFFER_DEFAULTS', 'TYPE_BUFFER_MAX'] }
);

const PAGE = 'https://patentstyret.sharepoint.com/sites/PatentAVD/drift/SitePages/Oppgavefordeling%20maskin%20bygg%20skip.aspx';

// ── normalizeCaseSourceUrl ──────────────────────────

test('normalizeCaseSourceUrl: empty input means no link', () => {
  assert.strictEqual(normalizeCaseSourceUrl(''), '');
  assert.strictEqual(normalizeCaseSourceUrl('   '), '');
  assert.strictEqual(normalizeCaseSourceUrl(null), '');
  assert.strictEqual(normalizeCaseSourceUrl(undefined), '');
});

test('normalizeCaseSourceUrl: strips Teams/Office tracking parameters', () => {
  const pasted = 'https://patentstyret.sharepoint.com/sites/PatentAVD/drift/SitePages/Oppgavefordeling maskin bygg skip.aspx' +
    '?TeamsCID=a958da53&OR=Teams-HL&CT=1790250921238&xsdata=MDV8MDJ8&sdata=ZGo0b0%3D' +
    '&ovuser=0de88540%2Cmom%40patentstyret.no&clickparams=eyJBcHBOYW1lIjoi';
  assert.strictEqual(normalizeCaseSourceUrl(pasted), PAGE);
});

test('normalizeCaseSourceUrl: keeps parameters the page may need, and the hash', () => {
  assert.strictEqual(
    normalizeCaseSourceUrl('https://x.sharepoint.com/:u:/s/a/b?e=abc123&OR=Teams-HL#top'),
    'https://x.sharepoint.com/:u:/s/a/b?e=abc123#top');
});

test('normalizeCaseSourceUrl: encodes spaces and trims', () => {
  assert.strictEqual(normalizeCaseSourceUrl('  https://a.no/x y.aspx  '), 'https://a.no/x%20y.aspx');
});

test('normalizeCaseSourceUrl: already clean URL is unchanged', () => {
  assert.strictEqual(normalizeCaseSourceUrl(PAGE), PAGE);
});

test('normalizeCaseSourceUrl: only https is accepted', () => {
  assert.strictEqual(normalizeCaseSourceUrl('http://a.no/x'), null);
  assert.strictEqual(normalizeCaseSourceUrl('javascript:alert(1)'), null);
  assert.strictEqual(normalizeCaseSourceUrl('file:///C:/x.html'), null);
  assert.strictEqual(normalizeCaseSourceUrl('a.no/x'), null);
  assert.strictEqual(normalizeCaseSourceUrl('https://'), null);
  assert.strictEqual(normalizeCaseSourceUrl('HTTPS://A.no/x'), 'HTTPS://A.no/x');
});

// ── normalizeCaseSource ─────────────────────────────

test('normalizeCaseSource: garbage gives an empty source', () => {
  for (const v of [null, undefined, 'x', 42, []]) {
    const s = normalizeCaseSource(v);
    assert.strictEqual(s.url, '');
    assert.strictEqual(s.label, '');
  }
});

test('normalizeCaseSource: invalid URL is dropped, label is trimmed and capped', () => {
  const s = normalizeCaseSource({ url: 'http://a.no', label: '  ' + 'x'.repeat(100) + ' ' });
  assert.strictEqual(s.url, '');
  assert.strictEqual(s.label.length, 40);
});

test('normalizeCaseSource: valid source is cleaned', () => {
  const s = normalizeCaseSource({ url: PAGE + '?OR=Teams-HL', label: ' Oppgavefordeling ' });
  assert.strictEqual(s.url, PAGE);
  assert.strictEqual(s.label, 'Oppgavefordeling');
});

// ── caseSourceTitle ─────────────────────────────────

test('caseSourceTitle: uses the label, with a fallback', () => {
  assert.strictEqual(caseSourceTitle({ url: PAGE, label: 'Oppgavefordeling' }), 'Åpne Oppgavefordeling');
  assert.strictEqual(caseSourceTitle({ url: PAGE, label: '' }), 'Åpne siden med nye saker');
});

// ── readImportSettings ──────────────────────────────

test('readImportSettings: older exports without caseSource leave it alone', () => {
  assert.ok(!('caseSource' in readImportSettings({ cases: [] })));
});

test('readImportSettings: caseSource is validated; null clears it', () => {
  const s = readImportSettings({ caseSource: { url: PAGE + '?OR=x', label: 'O' } }).caseSource;
  assert.strictEqual(s.url, PAGE);
  assert.strictEqual(s.label, 'O');
  const cleared = readImportSettings({ caseSource: null }).caseSource;
  assert.strictEqual(cleared.url, '');
  assert.strictEqual(cleared.label, '');
});
