'use strict';
// Motholdets opplysninger som tekst med «Rediger», og automatisk OPS-oppslag.
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const plain = (x) => JSON.parse(JSON.stringify(x));

const F = loadFunctions([
  'docHasDetails', 'mhIsEditing', 'opsAutoAction', 'opsReplacePlan', 'mhReadHtml', 'mhReadValueHtml',
  'copyToastText', 'normalizePubNumber', 'opsPubNumber', 'esc', 'toDisplay',
], { vars: ['MH_DETAIL_FIELDS'] });

const full = { pubDate: '2016-10-27', effDate: '2015-04-24', title: 'DEVICE', applicants: 'ACME AS', inventors: 'NORDMANN, Ola' };
const empty = { pubDate: '', effDate: '', title: '', applicants: '', inventors: '' };

// ── AC4: hvilke mothold står i redigering ────────────────────

test('docHasDetails is true when any detail field has a value', () => {
  assert.strictEqual(F.docHasDetails(empty), false);
  assert.strictEqual(F.docHasDetails({}), false);
  assert.strictEqual(F.docHasDetails(null), false);
  assert.strictEqual(F.docHasDetails({ ...empty, inventors: 'X' }), true);
  assert.strictEqual(F.docHasDetails({ ...empty, pubDate: '2020-01-01' }), true);
});

test('mhIsEditing: an empty document is edited, a filled one only after «Rediger»', () => {
  assert.strictEqual(F.mhIsEditing(empty, undefined), true);
  assert.strictEqual(F.mhIsEditing(full, undefined), false);
  assert.strictEqual(F.mhIsEditing(full, true), true);
  // «Ferdig» gjelder også et tomt mothold, så det kan vises som tekst
  assert.strictEqual(F.mhIsEditing(empty, false), false);
});

// ── AC1 / AC2 / AC8: lesevisningen ───────────────────────────

test('mhReadHtml shows dates, then applicant and inventors, then the title last', () => {
  const html = F.mhReadHtml(full, 0);
  const pos = (s) => html.indexOf(s);
  assert.ok(pos('2016.10.27') > -1 && pos('2015.04.24') > -1, 'dates in display format');
  assert.ok(pos('2016.10.27') < pos('ACME AS'));
  assert.ok(pos('ACME AS') < pos('NORDMANN, Ola'));
  assert.ok(pos('NORDMANN, Ola') < pos('DEVICE'), 'title last');
});

test('mhReadHtml marks values as copyable, and empty values as «—» without copy', () => {
  const html = F.mhReadHtml({ ...full, inventors: '' }, 2);
  assert.strictEqual((html.match(/data-copy/g) || []).length, 4);
  assert.match(html, /mh-v-empty[^>]*>—</);
});

test('mhReadHtml never cuts a long title', () => {
  const long = 'A'.repeat(250);
  assert.ok(F.mhReadHtml({ ...full, title: long }, 0).includes(long));
});

test('mhReadHtml escapes every value', () => {
  const EVIL = '"><img src=x onerror=alert(1)>';
  const html = F.mhReadHtml({ pubDate: '', effDate: '', title: EVIL, applicants: EVIL, inventors: EVIL }, 0);
  assert.ok(!/<img/i.test(html), html);
  assert.ok(!html.includes(EVIL));
});

test('copyToastText names what was copied, shortened when long', () => {
  assert.strictEqual(F.copyToastText('2016.10.27'), '✓ Kopiert: 2016.10.27');
  const t = F.copyToastText('X'.repeat(200));
  assert.ok(t.length < 80, t.length);
  assert.ok(t.endsWith('…'));
});

// ── Automatisk oppslag ───────────────────────────────────────

test('opsAutoAction fills an empty document when a valid number is committed', () => {
  assert.strictEqual(F.opsAutoAction('', 'WO 2016/169730 A1', empty, true), 'fill');
  assert.strictEqual(F.opsAutoAction('se vedlegg', 'WO 2016/169730 A1', empty, true), 'fill');
});

test('opsAutoAction does nothing without keys, with an invalid number, or when the number is unchanged', () => {
  assert.strictEqual(F.opsAutoAction('', 'WO 2016/169730 A1', empty, false), 'none');
  assert.strictEqual(F.opsAutoAction('', 'se vedlegg', empty, true), 'none');
  assert.strictEqual(F.opsAutoAction('', '', empty, true), 'none');
  // Samme nummer, bare skrevet annerledes
  assert.strictEqual(F.opsAutoAction('WO 2016/169730 A1', 'WO2016169730A1', empty, true), 'none');
});

test('opsAutoAction asks before replacing details when the number changes to another document', () => {
  assert.strictEqual(F.opsAutoAction('WO 2016/169730 A1', 'WO 2016/169731 A1', full, true), 'ask');
  // Annen kind-kode er en annen publisering med andre datoer
  assert.strictEqual(F.opsAutoAction('EP 1 000 000 A1', 'EP 1 000 000 B1', full, true), 'ask');
});

test('opsAutoAction fills the gaps when a first valid number is entered on a partly filled document', () => {
  assert.strictEqual(F.opsAutoAction('', 'EP 1000000 B1', { ...empty, title: 'Min tittel' }, true), 'fill');
  assert.strictEqual(F.opsAutoAction('', 'EP 1000000 B1', full, true), 'none');
});

test('opsReplacePlan replaces all five fields, clearing what OPS does not have', () => {
  const plan = F.opsReplacePlan({ pubDate: '2020-01-02', effDate: '', title: 'NEW', applicants: 'B AS', inventors: '', kind: 'A1' });
  assert.deepStrictEqual(plain(plan.patch),
    { pubDate: '2020-01-02', effDate: '', title: 'NEW', applicants: 'B AS', inventors: '' });
  assert.deepStrictEqual(plain(plan.conflicts), []);
});

// ── Runde 2 etter review ─────────────────────────────────────

test('opsAutoAction treats adding or dropping the kind code as the same document', () => {
  assert.strictEqual(F.opsAutoAction('WO 2016/169730 A1', 'WO 2016/169730', full, true), 'none');
  assert.strictEqual(F.opsAutoAction('WO 2016/169730', 'WO 2016/169730 A1', full, true), 'none');
  // ...men fyller hull når noe mangler
  assert.strictEqual(F.opsAutoAction('WO 2016/169730', 'WO 2016/169730 A1', { ...full, title: '' }, true), 'fill');
});

const G = loadFunctions(['mhEditStateOnRender', 'opsBusyStart', 'opsBusyEnd', 'docHasDetails'], { vars: ['MH_DETAIL_FIELDS', '_opsBusySeq'] });

test('mhEditStateOnRender pins an empty document in edit mode, so a redraw cannot flip it', () => {
  assert.strictEqual(G.mhEditStateOnRender(empty, undefined), true);
  // Har du skrevet en dato, står det fortsatt i redigering ved neste tegning
  assert.strictEqual(G.mhEditStateOnRender({ ...empty, pubDate: '2020-01-01' }, true), true);
  assert.strictEqual(G.mhEditStateOnRender(full, undefined), undefined);
  assert.strictEqual(G.mhEditStateOnRender(full, false), false);
});

test('opsBusyStart allows one lookup per document; opsBusyEnd only clears its own', () => {
  const map = {};
  const t1 = G.opsBusyStart(map, 'case|0');
  assert.ok(t1);
  assert.strictEqual(G.opsBusyStart(map, 'case|0'), null, 'second lookup refused while the first runs');
  assert.ok(G.opsBusyStart(map, 'case|1'), 'another document is independent');
  assert.strictEqual(G.opsBusyEnd(map, 'case|0', 'stale'), false);
  assert.ok(map['case|0'], 'a stale token does not clear the running lookup');
  assert.strictEqual(G.opsBusyEnd(map, 'case|0', t1), true);
  assert.strictEqual(map['case|0'], undefined);
  assert.ok(G.opsBusyStart(map, 'case|0'), 'free again after it ends');
});
