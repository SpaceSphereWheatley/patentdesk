'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { normalizeTlView, tlViewFromConfig, TIMELINE_TYPES } = loadFunctions(
  ['normalizeTlView', 'tlViewFromConfig'],
  { vars: ['TIMELINE_TYPES', 'TL_HORIZONS'] }
);

const DEFAULT = {
  home:  { horizon: 90, axisMode: 'month', typeFilter: ['ny', 'oppdrag'] },
  modal: { horizon: 90, axisMode: 'month' },
};

test('normalizeTlView gives the defaults when nothing is stored', () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(normalizeTlView(null))), DEFAULT);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(normalizeTlView('tull'))), DEFAULT);
});

test('normalizeTlView keeps a valid stored view', () => {
  const v = normalizeTlView({
    home:  { horizon: 365, axisMode: 'week', typeFilter: ['viderebehandling', 'fristarkiv'] },
    modal: { horizon: 180, axisMode: 'week' },
  });
  assert.strictEqual(v.home.horizon, 365);
  assert.strictEqual(v.home.axisMode, 'week');
  assert.deepStrictEqual([...v.home.typeFilter], ['viderebehandling', 'fristarkiv']);
  assert.strictEqual(v.modal.horizon, 180);
  assert.strictEqual(v.modal.axisMode, 'week');
});

test('normalizeTlView falls back field by field on invalid values', () => {
  const v = normalizeTlView({ home: { horizon: 42, axisMode: 'dag', typeFilter: 'ny' }, modal: { horizon: 365 } });
  assert.strictEqual(v.home.horizon, 90);
  assert.strictEqual(v.home.axisMode, 'month');
  assert.deepStrictEqual([...v.home.typeFilter], ['ny', 'oppdrag']);
  assert.strictEqual(v.modal.horizon, 365);
  assert.strictEqual(v.modal.axisMode, 'month');
});

test('normalizeTlView drops unknown and duplicate sakstyper but keeps an empty choice', () => {
  assert.deepStrictEqual([...normalizeTlView({ home: { typeFilter: ['ny', 'avsluttet', 'ny'] } }).home.typeFilter], ['ny']);
  assert.deepStrictEqual([...normalizeTlView({ home: { typeFilter: [] } }).home.typeFilter], []);
});

test('tlViewFromConfig stores the home and modal choices, not the per-page cases filter', () => {
  const cfg = {
    'home-timeline':  { horizon: 180, axisMode: 'week', typeFilter: ['ny'] },
    'cases-timeline': { horizon: 180, axisMode: 'week', typeFilter: ['fristarkiv'] },
    'modal-timeline': { horizon: 365, axisMode: 'month', typeFilter: ['ny'] },
  };
  assert.deepStrictEqual(JSON.parse(JSON.stringify(tlViewFromConfig(cfg))), {
    home:  { horizon: 180, axisMode: 'week', typeFilter: ['ny'] },
    modal: { horizon: 365, axisMode: 'month' },
  });
});

test('every timeline type survives a round trip', () => {
  const v = normalizeTlView({ home: { typeFilter: TIMELINE_TYPES.slice() } });
  assert.deepStrictEqual([...v.home.typeFilter], [...TIMELINE_TYPES]);
});
