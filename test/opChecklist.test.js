'use strict';
// Sjekkliste for OP-saker: egen mal, én gruppe per fase, fasen saken står i er åpen.
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const plain = (x) => JSON.parse(JSON.stringify(x));

function fakeStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

function load(storage) {
  return loadFunctions([
    'opChecklistGroupOpen', 'opChecklistHtml', 'getOpChecklistTemplate', 'saveOpChecklistTemplate',
    'resetOpChecklistTemplate', '_customOpChecklistTemplate', 'isValidChecklistTemplate', 'readImportSettings',
    '_checklistFoldHtml', '_checklistItemsHtml', 'checklistGroupCounts', 'checklistOpenKey', 'esc',
    'getChecklistTemplate', 'lsSetSafe',
  ], {
    vars: ['OP_CHECKLIST_DEFAULT', 'CHECKLIST_OP_KEY', 'CHECKLIST_KEY', 'CHECKLIST_DEFAULT', 'OP_PHASES'],
    globals: { localStorage: storage || fakeStorage(), showToast: () => {} },
  });
}

test('the default OP template has one group per phase, named like the phases, with unique ids', () => {
  const { OP_CHECKLIST_DEFAULT, OP_PHASES } = load();
  assert.deepStrictEqual(plain(OP_CHECKLIST_DEFAULT).map((g) => g.phase), plain(OP_PHASES).map((p) => p.label));
  const ids = plain(OP_CHECKLIST_DEFAULT).flatMap((g) => g.items.map((i) => i.id));
  assert.strictEqual(ids.length, 16);
  assert.strictEqual(new Set(ids).size, ids.length);
  ids.forEach((id) => assert.match(id, /^op-/));
});

test('AC1/5: the OP template is stored apart from the application template, and resets to the default', () => {
  const ls = fakeStorage();
  const S = load(ls);
  assert.deepStrictEqual(plain(S.getOpChecklistTemplate()), plain(S.OP_CHECKLIST_DEFAULT));
  const custom = [{ phase: 'Formalia', items: [{ id: 'x1', label: 'Mitt punkt', type: 'check' }] }];
  S.saveOpChecklistTemplate(custom);
  assert.deepStrictEqual(plain(S.getOpChecklistTemplate()), custom);
  // Søknadsmalen er urørt
  assert.deepStrictEqual(plain(S.getChecklistTemplate()), plain(S.CHECKLIST_DEFAULT));
  assert.strictEqual(ls.getItem(S.CHECKLIST_KEY), null);
  S.resetOpChecklistTemplate();
  assert.deepStrictEqual(plain(S.getOpChecklistTemplate()), plain(S.OP_CHECKLIST_DEFAULT));
});

test('an invalid stored OP template falls back to the default', () => {
  const S = load(fakeStorage({ pt_checklist_op_tpl: '{not json' }));
  assert.deepStrictEqual(plain(S.getOpChecklistTemplate()), plain(S.OP_CHECKLIST_DEFAULT));
  const S2 = load(fakeStorage({ pt_checklist_op_tpl: '[{"phase":1}]' }));
  assert.deepStrictEqual(plain(S2.getOpChecklistTemplate()), plain(S2.OP_CHECKLIST_DEFAULT));
});

test('AC2: the group for the current phase is open; all are closed when the case is closed', () => {
  const { opChecklistGroupOpen } = load();
  assert.strictEqual(opChecklistGroupOpen({ phase: 'Formalia' }, 'op_formalia'), true);
  assert.strictEqual(opChecklistGroupOpen({ phase: ' venter på svar ' }, 'op_svar'), true);
  assert.strictEqual(opChecklistGroupOpen({ phase: 'Formalia' }, 'op_svar'), false);
  assert.strictEqual(opChecklistGroupOpen({ phase: 'Avgjørelse' }, 'avsluttet'), false);
  assert.strictEqual(opChecklistGroupOpen({ phase: 'Egen gruppe' }, 'op_formalia'), false);
});

test('AC2/8: the HTML shows each group with its count, the current one open, and escapes labels', () => {
  const { opChecklistHtml } = load();
  const tpl = [
    { phase: 'Formalia', items: [{ id: 'a', label: '<b>x</b>' }, { id: 'b', label: 'B' }] },
    { phase: 'Avgjørelse', items: [{ id: 'c', label: 'C' }] },
  ];
  const html = opChecklistHtml({ checklist: { b: true } }, tpl, 'op_formalia');
  assert.ok(!html.includes('<b>x</b>'));
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.match(html, /data-fold="formalia"[^]*?aria-expanded="true"[^]*?1 \/ 2/);
  assert.match(html, /data-fold="avgjørelse"[^]*?aria-expanded="false"[^]*?0 \/ 1/);
  // Uten avkrysninger: 0/N
  const empty = opChecklistHtml({}, tpl, 'op_svar');
  assert.match(empty, /0 \/ 2/);
  assert.doesNotMatch(empty, /aria-expanded="true"/);
  assert.strictEqual(opChecklistHtml({}, [], 'op_svar'), '');
});

test('AC6: a removed item is not shown, but its tick is kept and comes back with the item', () => {
  const { opChecklistHtml } = load();
  const data = { checklist: { gone: true, a: true } };
  const without = opChecklistHtml(data, [{ phase: 'Formalia', items: [{ id: 'a', label: 'A' }] }], 'op_formalia');
  assert.doesNotMatch(without, /data-item-id="gone"/);
  assert.match(without, /1 \/ 1/);
  assert.strictEqual(data.checklist.gone, true);
  const back = opChecklistHtml(data, [{ phase: 'Formalia', items: [{ id: 'a', label: 'A' }, { id: 'gone', label: 'G' }] }], 'op_formalia');
  assert.match(back, /data-item-id="gone" checked/);
});

test('AC7: the OP template travels with export/import; a file without it means the default', () => {
  const { readImportSettings } = load();
  const custom = [{ phase: 'Formalia', items: [{ id: 'x1', label: 'Mitt punkt', type: 'check' }] }];
  assert.deepStrictEqual(plain(readImportSettings({ checklistTemplateOp: custom })).checklistTemplateOp, custom);
  assert.strictEqual(readImportSettings({ checklistTemplateOp: null }).checklistTemplateOp, null);
  assert.ok(!('checklistTemplateOp' in readImportSettings({})));
  assert.ok(!('checklistTemplateOp' in readImportSettings({ checklistTemplateOp: [{ phase: 1 }] })));
});
