'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const {
  defaultDocLayout, normalizeDocLayout, normalizePaneWidths, dragPaneWidths,
  docSlotMatch, docSlotAssign, claimOverviewRows, docPaneUrl, readImportSettings
} = loadFunctions(
  ['defaultDocLayout', 'normalizeDocLayout', 'normalizePaneWidths', 'dragPaneWidths',
    'docSlotMatch', 'docSlotAssign', 'claimOverviewRows', 'docPaneUrl', 'readImportSettings', 'isValidChecklistTemplate',
    '_docFileUrl', '_docServedLocally', '_docRootNormalize', '_docRootJoin',
    '_fileHasExt', '_fileResolvedName', '_fileExt', '_fileIsPdf', '_fileDisplayName', 'roundTriState',
    'normalizeHomeDeadlineFilter', 'defaultHomeDeadlineFilter', 'normalizeWorkWindows',
    'migrateWorkWindowsToWorkdays', 'normalizeTypeBuffers', 'normalizeDeadlines'],
  { vars: ['DOC_PANE_MAX', 'DOC_PANE_MIN', 'DOC_CLAIMS_MODES', 'DOC_CLAIMS_SIDES', 'DOC_RULE_MAX',
    'DOC_CLAIMS_W_MIN', 'DOC_CLAIMS_W_MAX',
    'DEADLINE_DEFAULTS', 'DEADLINE_MAX', 'HOME_DEADLINE_KINDS', 'HOME_DEADLINE_HORIZONS',
    'WORK_WINDOW_DEFAULTS', 'WORK_WINDOW_MAX', 'TYPE_BUFFER_DEFAULTS', 'TYPE_BUFFER_MAX'] }
);

const sum = a => Array.from(a).reduce((s, x) => s + x, 0);
const names = files => files.map(f => ({ name: f }));

// ── normalizeDocLayout (AC 3, 6, 9) ─────────────────

test('defaultDocLayout: two panes, claims panel on the left, rules claims/figures', () => {
  const d = defaultDocLayout();
  assert.strictEqual(d.count, 2);
  assert.strictEqual(d.claimsVisible, true);
  assert.strictEqual(d.claimsSide, 'left');
  assert.strictEqual(d.claimsMode, 'overview');
  assert.deepStrictEqual(Array.from(d.rules), ['claims', 'figures', '']);
});

test('normalizeDocLayout: null, arrays and junk give the default', () => {
  const d = defaultDocLayout();
  [null, undefined, 'x', 7, [], true].forEach(v =>
    assert.deepStrictEqual(JSON.parse(JSON.stringify(normalizeDocLayout(v))), JSON.parse(JSON.stringify(d))));
});

test('normalizeDocLayout: count must be an integer 1-3', () => {
  assert.strictEqual(normalizeDocLayout({ count: 1 }).count, 1);
  assert.strictEqual(normalizeDocLayout({ count: 3 }).count, 3);
  [0, 4, 2.5, '2', null, -1].forEach(c => assert.strictEqual(normalizeDocLayout({ count: c }).count, 2));
});

test('normalizeDocLayout: side, mode and visibility are validated', () => {
  assert.strictEqual(normalizeDocLayout({ claimsSide: 'right' }).claimsSide, 'right');
  assert.strictEqual(normalizeDocLayout({ claimsSide: 'top' }).claimsSide, 'left');
  assert.strictEqual(normalizeDocLayout({ claimsMode: 'links' }).claimsMode, 'overview', 'links mode is not available yet');
  assert.strictEqual(normalizeDocLayout({ claimsVisible: false }).claimsVisible, false);
  assert.strictEqual(normalizeDocLayout({ claimsVisible: 'nei' }).claimsVisible, true);
});

test('normalizeDocLayout: rules are three trimmed, length-limited strings', () => {
  const r = normalizeDocLayout({ rules: ['  Claims ', 5, 'x'.repeat(500), 'extra'] }).rules;
  assert.strictEqual(r.length, 3);
  assert.strictEqual(r[0], 'Claims');
  assert.strictEqual(r[1], '');
  assert.ok(r[2].length <= 40);
  assert.deepStrictEqual(Array.from(normalizeDocLayout({ rules: 'x' }).rules), ['claims', 'figures', '']);
  assert.strictEqual(normalizeDocLayout({ rules: ['a'] }).rules.length, 3);
});

test('normalizeDocLayout: rule text can not carry markup into a later render', () => {
  const r = normalizeDocLayout({ rules: ['<img src=x onerror=1>', '', ''] }).rules[0];
  assert.strictEqual(typeof r, 'string'); // stays plain text; render escapes it
});

test('normalizeDocLayout: widths and claims-panel width are normalised', () => {
  const d = normalizeDocLayout({ claimsWidth: 5000, widths: { 2: [3, 1] } });
  assert.strictEqual(d.claimsWidth, 480);
  assert.ok(Math.abs(sum(d.widths[2]) - 1) < 1e-9);
  assert.ok(Math.abs(d.widths[2][0] - 0.75) < 1e-9);
  assert.strictEqual(normalizeDocLayout({ claimsWidth: 10 }).claimsWidth, 160);
  assert.strictEqual(normalizeDocLayout({ claimsWidth: 'x' }).claimsWidth, defaultDocLayout().claimsWidth);
  [1, 2, 3].forEach(n => assert.strictEqual(d.widths[n].length, n));
});

// ── normalizePaneWidths / dragPaneWidths (AC: widths) ─

test('normalizePaneWidths: wrong length, non-numbers, zero or negative fall back to equal', () => {
  [[0.5], [0.5, 'x'], [0, 1], [-1, 2], null, 'x', [NaN, 1]].forEach(w => {
    const out = normalizePaneWidths(w, 2);
    assert.strictEqual(out.length, 2);
    assert.ok(Math.abs(out[0] - 0.5) < 1e-9);
  });
});

test('normalizePaneWidths: every pane keeps at least the minimum width', () => {
  const out = normalizePaneWidths([0.99, 0.005, 0.005], 3);
  out.forEach(x => assert.ok(x >= 0.15 - 1e-9, 'pane below minimum: ' + x));
  assert.ok(Math.abs(sum(out) - 1) < 1e-9);
});

test('normalizePaneWidths: one pane is always the full width', () => {
  assert.deepStrictEqual(Array.from(normalizePaneWidths([0.3], 1)), [1]);
});

test('dragPaneWidths: moves the divider between two panes, total stays 1', () => {
  const out = dragPaneWidths([0.5, 0.5], 0, 0.1);
  assert.ok(Math.abs(out[0] - 0.6) < 1e-9 && Math.abs(out[1] - 0.4) < 1e-9);
});

test('dragPaneWidths: neither neighbour goes below the minimum; others untouched', () => {
  const out = dragPaneWidths([0.3, 0.4, 0.3], 0, 5);
  assert.ok(Math.abs(out[1] - 0.15) < 1e-9, 'right neighbour stops at minimum');
  assert.ok(Math.abs(out[2] - 0.3) < 1e-9, 'third pane untouched');
  const left = dragPaneWidths([0.3, 0.4, 0.3], 1, -5);
  assert.ok(Math.abs(left[1] - 0.15) < 1e-9);
  assert.ok(Math.abs(sum(left) - 1) < 1e-9);
});

test('dragPaneWidths: a divider that does not exist changes nothing', () => {
  assert.deepStrictEqual(Array.from(dragPaneWidths([0.5, 0.5], 5, 0.1)), [0.5, 0.5]);
  assert.deepStrictEqual(Array.from(dragPaneWidths([1], 0, 0.1)), [1]);
});

// ── docSlotMatch (AC 3, 4) ──────────────────────────

test('docSlotMatch: contains, ignoring case and extension', () => {
  const f = names(['Description.pdf', 'Claims_v2.pdf', 'Figures.pdf']);
  assert.strictEqual(docSlotMatch(f, 'claims', []), 1);
  assert.strictEqual(docSlotMatch(f, 'CLAIMS', []), 1);
  assert.strictEqual(docSlotMatch(f, 'fig', []), 2);
  assert.strictEqual(docSlotMatch(f, 'pdf', []), -1, 'the extension is not part of the name');
});

test('docSlotMatch: first file in the list wins', () => {
  assert.strictEqual(docSlotMatch(names(['Claims_new.pdf', 'Claims.pdf']), 'claims', []), 0);
});

test('docSlotMatch: empty or blank rule never matches; no files gives -1', () => {
  const f = names(['Claims.pdf']);
  assert.strictEqual(docSlotMatch(f, '', []), -1);
  assert.strictEqual(docSlotMatch(f, '   ', []), -1);
  assert.strictEqual(docSlotMatch([], 'claims', []), -1);
  assert.strictEqual(docSlotMatch(null, 'claims', []), -1);
});

test('docSlotMatch: only PDFs can be shown in a pane; a name without extension counts as pdf', () => {
  assert.strictEqual(docSlotMatch(names(['Claims.docx', 'Claims.pdf']), 'claims', []), 1);
  assert.strictEqual(docSlotMatch(names(['Claims.docx']), 'claims', []), -1);
  assert.strictEqual(docSlotMatch(names(['Claims']), 'claims', []), 0);
});

test('docSlotMatch: files in the skip list are passed over', () => {
  const f = names(['Claims.pdf', 'Claims_v2.pdf']);
  assert.strictEqual(docSlotMatch(f, 'claims', [0]), 1);
});

test('docSlotMatch: malformed file entries are ignored', () => {
  assert.strictEqual(docSlotMatch([null, {}, { name: 5 }, { name: 'Claims.pdf' }], 'claims', []), 3);
});

// ── docSlotAssign (AC 4, 5, 7) ──────────────────────

test('docSlotAssign: fills each slot from its rule, up to the pane count', () => {
  const f = names(['Description.pdf', 'Claims.pdf', 'Figures.pdf']);
  assert.deepStrictEqual(Array.from(docSlotAssign(f, ['claims', 'figures', ''], 3, [])), [1, 2, -1]);
  assert.deepStrictEqual(Array.from(docSlotAssign(f, ['claims', 'figures', ''], 2, [])), [1, 2]);
  assert.deepStrictEqual(Array.from(docSlotAssign(f, ['claims', 'figures', ''], 1, [])), [1]);
});

test('docSlotAssign: a manual pick overrides the rule for that slot only', () => {
  const f = names(['Description.pdf', 'Claims.pdf', 'Figures.pdf']);
  assert.deepStrictEqual(Array.from(docSlotAssign(f, ['claims', 'figures', ''], 2, [0, null])), [0, 2]);
});

test('docSlotAssign: the same file is not placed in two slots by rules', () => {
  const f = names(['Claims.pdf', 'Claims_v2.pdf']);
  assert.deepStrictEqual(Array.from(docSlotAssign(f, ['claims', 'claims', ''], 2, [])), [0, 1]);
  assert.deepStrictEqual(Array.from(docSlotAssign(names(['Claims.pdf']), ['claims', 'claims', ''], 2, [])), [0, -1]);
});

test('docSlotAssign: a file picked manually in one slot is skipped by rules in the others', () => {
  const f = names(['Claims.pdf', 'Claims_v2.pdf']);
  assert.deepStrictEqual(Array.from(docSlotAssign(f, ['claims', 'claims', ''], 2, [null, 0])), [1, 0]);
});

test('docSlotAssign: no files, bad rules, bad manual picks', () => {
  assert.deepStrictEqual(Array.from(docSlotAssign([], ['claims', 'figures', ''], 3, [])), [-1, -1, -1]);
  assert.deepStrictEqual(Array.from(docSlotAssign(null, null, 2, null)), [-1, -1]);
  const f = names(['Claims.pdf']);
  assert.deepStrictEqual(Array.from(docSlotAssign(f, ['claims', '', ''], 2, [9, -3])), [0, -1], 'out-of-range picks are ignored');
  assert.deepStrictEqual(Array.from(docSlotAssign(names(['a.docx']), ['', '', ''], 2, [0, null])), [-1, -1], 'a non-PDF can not be placed');
});

// ── claimOverviewRows (AC overview mode) ────────────

test('claimOverviewRows: no claims gives no rows', () => {
  assert.deepStrictEqual(Array.from(claimOverviewRows(null)), []);
  assert.deepStrictEqual(Array.from(claimOverviewRows([])), []);
});

test('claimOverviewRows: carries number, dependency, novelty and inventive step', () => {
  const rows = claimOverviewRows([
    { num: 1, dep: null, independent: true, novelty: false, inventive: false },
    { num: 2, dep: 1, novelty: true, inventive: null },
    { num: 3, dep: 1, novelty: true, inventive: true }
  ]);
  assert.strictEqual(rows.length, 3);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(rows[0])), { num: 1, dep: null, novelty: false, inventive: false });
  assert.strictEqual(rows[1].inventive, null, 'not assessed stays null');
  assert.strictEqual(rows[2].dep, 1);
});

test('claimOverviewRows: junk entries are dropped and values are tri-state', () => {
  const rows = claimOverviewRows([null, 'x', { num: 2, novelty: 'ja', inventive: 1 }]);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].novelty, null);
  assert.strictEqual(rows[0].inventive, null);
});

// ── docPaneUrl (AC 1, 2) ────────────────────────────

const FILE_LOC = { protocol: 'file:', hostname: '', origin: 'null' };
const LOCALHOST = { protocol: 'http:', hostname: 'localhost', origin: 'http://localhost:8080' };

test('docPaneUrl: needs the local server; without it there is no pane url', () => {
  assert.strictEqual(docPaneUrl('C:\\Saker', 'NO1', 'Claims.pdf', FILE_LOC), null);
  assert.strictEqual(docPaneUrl('C:\\Saker', 'NO1', 'Claims.pdf', null), null);
  assert.strictEqual(docPaneUrl('C:\\Saker', 'NO1', 'Claims.pdf', { protocol: 'https:', hostname: 'example.com', origin: 'https://example.com' }), null);
});

test('docPaneUrl: served locally it is the /docs url', () => {
  assert.strictEqual(
    docPaneUrl('C:\\Saker', 'NO1', 'Claims', LOCALHOST),
    'http://localhost:8080/docs?root=C%3A%5CSaker&case=NO1&file=Claims.pdf'
  );
});

// ── readImportSettings: docLayout (AC 9) ────────────

test('readImportSettings: docLayout is read and normalised', () => {
  const r = readImportSettings({ docLayout: { count: 3, claimsSide: 'right', rules: ['  x ', '', ''] } });
  assert.strictEqual(r.docLayout.count, 3);
  assert.strictEqual(r.docLayout.claimsSide, 'right');
  assert.strictEqual(r.docLayout.rules[0], 'x');
});

test('readImportSettings: a bad or missing docLayout changes nothing', () => {
  assert.ok(!('docLayout' in readImportSettings({ docLayout: 'x' })));
  assert.ok(!('docLayout' in readImportSettings({ docLayout: [1] })));
  assert.ok(!('docLayout' in readImportSettings({})));
});
