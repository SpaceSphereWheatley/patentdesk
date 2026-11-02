'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const { sakStatusChip, sakSubtitle, statusMenuHint } = loadFunctions(
  ['sakStatusChip', 'sakSubtitle', 'statusMenuHint', 'forwardAction'],
  { vars: ['OUTCOMES'] }
);

test('the header status button names the status as the menu does, with its colour tone', () => {
  assert.deepStrictEqual({ ...sakStatusChip('ny', false) }, { label: 'Ny', tone: 'ny' });
  assert.deepStrictEqual({ ...sakStatusChip('viderebehandling', false) }, { label: 'Viderebehandling', tone: 'videre' });
  assert.deepStrictEqual({ ...sakStatusChip('fristarkiv', false) }, { label: 'Fristarkiv', tone: 'frist' });
  assert.deepStrictEqual({ ...sakStatusChip('avsluttet', false) }, { label: 'Avsluttet', tone: 'avsl' });
  assert.deepStrictEqual({ ...sakStatusChip(undefined, false) }, { label: 'Ny', tone: 'ny' });
});

test('a closed case shows its outcome in the status button', () => {
  assert.deepStrictEqual({ ...sakStatusChip('avsluttet', false, 'meddelt') }, { label: 'Avsluttet · Meddelt', tone: 'avsl' });
});

test('an oppdrag is either Aktiv or Avsluttet', () => {
  assert.deepStrictEqual({ ...sakStatusChip('ny', true) }, { label: 'Aktiv', tone: 'oppdrag' });
  assert.deepStrictEqual({ ...sakStatusChip('avsluttet', true) }, { label: 'Avsluttet', tone: 'avsl' });
});

test('the subtitle is the title alone — the status has its own button now', () => {
  assert.strictEqual(sakSubtitle({ title: 'Varmeveksler', status: 'ny' }), 'Varmeveksler');
  assert.strictEqual(sakSubtitle({ status: 'ny' }), '');
  assert.strictEqual(sakSubtitle(null), '');
});

test('the menu points to the main button for the usual step, or says nothing when there is none', () => {
  assert.strictEqual(statusMenuHint('ny', false), 'Vanligste steg er knappen til høyre: «Brev sendt».');
  assert.strictEqual(statusMenuHint('ny', true), 'Vanligste steg er knappen til høyre: «Merk som utført».');
  assert.strictEqual(statusMenuHint('avsluttet', false), '');
});
