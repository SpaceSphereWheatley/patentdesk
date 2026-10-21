'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { caseNoteHtml, caseNotePreview } = loadFunctions(['caseNoteHtml', 'caseNotePreview', 'esc']);

test('caseNotePreview collapses line breaks and extra spaces onto one line', () => {
  assert.strictEqual(caseNotePreview('Venter på\n\nprioritetsdokument   fra søker '), 'Venter på prioritetsdokument fra søker');
  assert.strictEqual(caseNotePreview(''), '');
  assert.strictEqual(caseNotePreview(null), '');
  assert.strictEqual(caseNotePreview('  \n '), '');
});

test('caseNoteHtml renders nothing for a case without a note', () => {
  assert.strictEqual(caseNoteHtml({}), '');
  assert.strictEqual(caseNoteHtml({ notes: '   ' }), '');
  assert.strictEqual(caseNoteHtml(null), '');
});

test('caseNoteHtml shows the note on one line, with the full text in the tooltip', () => {
  const html = caseNoteHtml({ notes: 'Linje én\nLinje to' });
  assert.ok(html.indexOf('class="case-note"') !== -1);
  assert.ok(html.indexOf('>Linje én Linje to<') !== -1, html);
  // The tooltip keeps the line break so the whole note reads as written.
  assert.ok(html.indexOf('title="Linje én\nLinje to"') !== -1, html);
});

test('caseNoteHtml escapes the note in both the text and the tooltip', () => {
  const html = caseNoteHtml({ notes: '<b>"x"</b> & y' });
  assert.ok(html.indexOf('<b>') === -1);
  assert.ok(html.indexOf('&lt;b&gt;') !== -1);
  assert.ok(html.indexOf('title="&lt;b&gt;&quot;x&quot;') !== -1, html);
});
