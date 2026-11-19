'use strict';
// OP-saker (innsigelser): saksnummer, faser, foreslåtte frister og belegg.
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const plain = (x) => JSON.parse(JSON.stringify(x));
const weekend = (d) => d.getDay() === 0 || d.getDay() === 6;

function load(extra) {
  return loadFunctions([
    'isOpCase', 'isApplication', 'opPhase', 'isOpWorkPhase', 'isOpWaitPhase', 'normalizeOpNumber',
    'normalizeOp', 'normalizeOpDate', 'normalizeOpText', 'opControlDeadlines',
    'opPlanDates', 'opSuggestedDue', 'opDueIsEstimate', 'opProvisionalCase', 'normalizeOpPlan', 'opSyncDue', 'opStatusPatch', 'opApplyUpdate', 'opModalPayload', 'opTrack', 'opCaseTitle', 'opPanelHtml', 'opControlText', 'esc', 'toDisplay', 'opForwardAction', 'opPhaseLabel', 'opPhaseIndex',
    'isValidDate', 'parseDate', 'sanitizeText', 'addMonthsClamped', 'isoLocalDate', 'addDaysLocal',
    'workWindowDays', 'countsInBelegg', 'timelineSpanDays', 'workWindowStart', 'canBeUnassigned', 'isUnassigned',
    'bufferAppliesTo', 'bufferDaysFor', 'typeBufferFor', 'deadlineFor', 'effDueFor', 'getEffectiveDueDate', 'postponedDaysFor', 'canPostpone', 'normalizeWorkWindows', 'fristOwnerLabel', 'fristCountdownTone',
    'fristCountdownLabel', 'statusTransition', 'forwardAction', 'sakStatusChip',
  ], Object.assign({
    vars: ['OP_PHASES', 'OP_OUTCOMES', 'OP_DATE_LABELS', 'OP_TEXT_LABELS', 'OP_DATE_FIELDS', 'OP_TEXT_FIELDS', 'OP_TEXT_MAX', 'OP_MAX_OPPONENTS', 'OP_MEETING_DAYS', 'OP_CONTROL_MONTHS', 'OP_PLAN_DEFAULTS', 'OP_PLAN_MAX',
      'WORK_WINDOW_DEFAULTS', 'WORK_WINDOW_MAX', 'MILESTONE_DAYS', 'OUTCOMES', 'DEADLINE_DEFAULTS'],
    globals: { workWindows: { ny: 10, viderebehandling: 3, oppdrag: 2, op_formalia: 1, op_oppstart: 1, op_avgjorelse: 10 },
      isNonWorkday: weekend, vacations: [], opPlan: { formaliaDays: 1, replyDays: 112 },
      typeBuffers: { ny: 0, viderebehandling: 0 } },
  }, extra || {}));
}

function opCase(status, op, more) {
  return Object.assign({ id: 'o1', caseNumber: 'OP 2026/00123', type: 'op', status: status,
    dueDate: '2026-12-11', title: '', op: op || {} }, more || {});
}

// ── 1. Saksnummer ─────────────────────────────────
test('normalizeOpNumber accepts OP YYYY/xxxxx and rejects other forms', () => {
  const { normalizeOpNumber } = load();
  assert.strictEqual(normalizeOpNumber('OP 2026/00123'), 'OP 2026/00123');
  assert.strictEqual(normalizeOpNumber('  op 2026/00123 '), 'OP 2026/00123');
  ['OP 26/123', 'OP2026/00123', 'OP 2026/0012', 'OP 2026/001234', 'NO20260012', '', null, 'OP 1899/00001']
    .forEach((s) => assert.strictEqual(normalizeOpNumber(s), null, String(s)));
});

// ── Typer og faser ────────────────────────────────
test('isApplication is false for Oppdrag and OP, true for søknader', () => {
  const { isApplication, isOpCase } = load();
  assert.strictEqual(isApplication({ type: 'sak' }), true);
  assert.strictEqual(isApplication({}), true);
  assert.strictEqual(isApplication({ type: 'oppdrag' }), false);
  assert.strictEqual(isApplication({ type: 'op' }), false);
  assert.strictEqual(isApplication(null), false);
  assert.strictEqual(isOpCase({ type: 'op' }), true);
  assert.strictEqual(isOpCase({ type: 'sak' }), false);
});

test('OP phases: five phases in order, three of them work', () => {
  const { OP_PHASES, isOpWorkPhase, isOpWaitPhase } = load();
  assert.deepStrictEqual(plain(OP_PHASES.map((p) => p.status)),
    ['op_formalia', 'op_svar', 'op_oppstart', 'op_skrift', 'op_avgjorelse']);
  assert.deepStrictEqual(plain(OP_PHASES.filter((p) => p.work).map((p) => p.status)),
    ['op_formalia', 'op_oppstart', 'op_avgjorelse']);
  assert.strictEqual(isOpWorkPhase(opCase('op_oppstart')), true);
  assert.strictEqual(isOpWaitPhase(opCase('op_svar')), true);
  assert.strictEqual(isOpWorkPhase(opCase('avsluttet')), false);
  assert.strictEqual(isOpWaitPhase(opCase('avsluttet')), false);
  assert.strictEqual(isOpWorkPhase({ type: 'sak', status: 'ny' }), false);
});

test('opForwardAction walks the phases and ends in Avsluttet', () => {
  const { opForwardAction } = load();
  assert.strictEqual(opForwardAction('op_formalia').toStatus, 'op_svar');
  assert.strictEqual(opForwardAction('op_svar').toStatus, 'op_oppstart');
  assert.strictEqual(opForwardAction('op_oppstart').toStatus, 'op_skrift');
  assert.strictEqual(opForwardAction('op_skrift').toStatus, 'op_avgjorelse');
  assert.strictEqual(opForwardAction('op_avgjorelse').toStatus, 'avsluttet');
  assert.strictEqual(opForwardAction('avsluttet'), null);
});

test('forwardAction and sakStatusChip delegate to the OP phases', () => {
  const { forwardAction, sakStatusChip } = load();
  assert.strictEqual(forwardAction('op_svar', false).toStatus, 'op_oppstart');
  assert.deepStrictEqual(plain(sakStatusChip('op_avgjorelse', false)), { label: 'Avgjørelse', tone: 'op' });
  assert.strictEqual(sakStatusChip('avsluttet', false, 'opphevet').label, 'Avsluttet · Opphevet');
});

test('statusTransition for OP: every phase step asks for confirmation; closing asks for outcome and tags', () => {
  const { statusTransition } = load();
  const t = statusTransition('op_formalia', 'op_svar', false);
  assert.strictEqual(t.needsConfirm, true);
  assert.strictEqual(t.alwaysConfirm, true);
  assert.match(t.confirmDesc, /Formalia.*Venter på svar/);
  assert.strictEqual(t.needsDueDate, false);
  assert.strictEqual(t.needsTags, false);
  assert.strictEqual(t.logType, null);
  // Tilbake i flyten (en korreksjon) spør også
  assert.strictEqual(statusTransition('op_oppstart', 'op_svar', false).needsConfirm, true);
  const close = statusTransition('op_avgjorelse', 'avsluttet', false);
  assert.strictEqual(close.logType, 'op');
  assert.strictEqual(close.needsTags, true);
  assert.strictEqual(close.needsConfirm, false); // dialogen med utfall er bekreftelsen
});

// ── Normalisering ─────────────────────────────────
test('normalizeOp fills every field, drops invalid dates and empty opponents', () => {
  const { normalizeOp } = load();
  const n = plain(normalizeOp({
    patentNo: ' NO 345678 ', holder: 'Eksempel AS', replyDue: '2026-02-31', noticeDate: '2026-09-28',
    replyKind: 'tull', outcome: 'feil', opponents: [{ name: 'A', agent: 'B' }, { name: '  ' }, 'x', { name: 'C' }],
  }));
  assert.strictEqual(n.patentNo, 'NO 345678');
  assert.strictEqual(n.replyDue, '');
  assert.strictEqual(n.noticeDate, '2026-09-28');
  assert.strictEqual(n.replyKind, '');
  assert.strictEqual(n.outcome, '');
  assert.deepStrictEqual(n.opponents, [{ name: 'A', agent: 'B' }, { name: 'C', agent: '' }]);
  assert.strictEqual(n.dueManual, false);
  ['received', 'meetingDate', 'decisionDate', 'protocolDate', 'sentDate', 'transferDate', 'replyDate']
    .forEach((k) => assert.strictEqual(n[k], '', k));
});

test('normalizeOp copes with missing data and caps text and opponents', () => {
  const { normalizeOp, OP_TEXT_MAX, OP_MAX_OPPONENTS } = load();
  const empty = plain(normalizeOp(undefined));
  assert.deepStrictEqual(empty.opponents, []);
  assert.strictEqual(empty.holder, '');
  const long = plain(normalizeOp({ holder: 'x'.repeat(OP_TEXT_MAX + 50),
    opponents: Array.from({ length: OP_MAX_OPPONENTS + 5 }, (_, i) => ({ name: 'N' + i })) }));
  assert.strictEqual(long.holder.length, OP_TEXT_MAX);
  assert.strictEqual(long.opponents.length, OP_MAX_OPPONENTS);
  assert.strictEqual(plain(normalizeOp({ outcome: 'endret' })).outcome, 'endret');
  assert.strictEqual(plain(normalizeOp({ replyKind: 'utlopt' })).replyKind, 'utlopt');
});

// ── 7. Kontrollfrister ────────────────────────────
test('control deadline (a): unanswered reply deadline + 3 months, met when taken up', () => {
  const { opControlDeadlines } = load();
  const a = plain(opControlDeadlines({ replyKind: 'utlopt', replyDue: '2026-07-03' })).a;
  assert.deepStrictEqual(a, { applies: true, date: '2026-10-03', met: false });
  assert.strictEqual(opControlDeadlines({ replyKind: 'utlopt', replyDue: '2026-07-03', decisionDate: '2026-09-01' }).a.met, true);
  assert.strictEqual(opControlDeadlines({ replyKind: 'svar', replyDue: '2026-07-03' }).a.applies, false);
  assert.strictEqual(opControlDeadlines({}).a.applies, false);
});

test('control deadline (b): notice + 3 months, month end clamped, met when protocol is done', () => {
  const { opControlDeadlines } = load();
  assert.deepStrictEqual(plain(opControlDeadlines({ noticeDate: '2026-09-28' }).b),
    { applies: true, date: '2026-12-28', met: false });
  assert.strictEqual(opControlDeadlines({ noticeDate: '2026-11-30' }).b.date, '2027-02-28');
  assert.strictEqual(opControlDeadlines({ noticeDate: '2026-09-28', protocolDate: '2026-12-01' }).b.met, true);
  assert.strictEqual(opControlDeadlines({}).b.applies, false);
});

test('oppstartsmøte: 10 calendar days after the reply or the expired deadline, holidays and vacation included', () => {
  const { opPlanDates } = load();
  const meet = (op) => plain(opPlanDates(op)).op_oppstart.date;
  assert.strictEqual(meet({ replyKind: 'svar', replyDate: '2026-06-29', replyDue: '2026-07-03' }), '2026-07-09');
  assert.strictEqual(meet({ replyKind: 'utlopt', replyDue: '2026-07-03', replyDate: '2026-07-06' }), '2026-07-13');
  // Over jul og nyttår: fortsatt bare kalenderdager
  assert.strictEqual(meet({ replyKind: 'svar', replyDate: '2026-12-22' }), '2027-01-01');
  assert.strictEqual(meet({}), '');
});

test('AC2: the whole plan comes from the inndato and is marked as an estimate', () => {
  const { opPlanDates } = load();
  const pl = plain(opPlanDates({ received: '2026-10-20' }));
  assert.deepStrictEqual(pl, {
    op_formalia:   { date: '2026-10-21', est: true },
    op_svar:       { date: '2027-02-09', est: true },
    op_oppstart:   { date: '2027-02-19', est: true },
    op_skrift:     { date: '', est: false },
    op_avgjorelse: { date: '2027-05-09', est: true },
  });
  assert.strictEqual(plain(opPlanDates({})).op_avgjorelse.date, '');
});

test('AC3: a real date from SANT replaces the estimate, and the later dates follow it', () => {
  const { opPlanDates } = load();
  // Faktisk svarfrist
  let pl = plain(opPlanDates({ received: '2026-10-20', replyDue: '2027-02-15' }));
  assert.deepStrictEqual(pl.op_svar, { date: '2027-02-15', est: false });
  assert.deepStrictEqual(pl.op_oppstart, { date: '2027-02-25', est: false });
  assert.deepStrictEqual(pl.op_avgjorelse, { date: '2027-05-15', est: true });
  // Svar mottatt tidligere
  pl = plain(opPlanDates({ received: '2026-10-20', replyKind: 'svar', replyDate: '2027-01-30' }));
  assert.deepStrictEqual(pl.op_oppstart, { date: '2027-02-09', est: false });
  assert.deepStrictEqual(pl.op_avgjorelse, { date: '2027-04-30', est: true });
  // Varsel sendt: kontrollfrist (b)
  pl = plain(opPlanDates({ received: '2026-10-20', replyKind: 'svar', replyDate: '2027-01-30', noticeDate: '2027-03-01' }));
  assert.deepStrictEqual(pl.op_avgjorelse, { date: '2027-06-01', est: false });
  // Ubesvart: kontrollfrist (a), den tidligste av de uoppfylte gjelder
  pl = plain(opPlanDates({ replyKind: 'utlopt', replyDue: '2026-07-03' }));
  assert.deepStrictEqual(pl.op_avgjorelse, { date: '2026-10-03', est: false });
  pl = plain(opPlanDates({ replyKind: 'utlopt', replyDue: '2026-07-03', noticeDate: '2026-08-01' }));
  assert.strictEqual(pl.op_avgjorelse.date, '2026-10-03');
  pl = plain(opPlanDates({ replyKind: 'utlopt', replyDue: '2026-07-03', noticeDate: '2026-08-01', decisionDate: '2026-09-15' }));
  assert.strictEqual(pl.op_avgjorelse.date, '2026-11-01');
});

test('the plan follows the settings for formalia and reply time', () => {
  const { opPlanDates, normalizeOpPlan } = load({ globals: { workWindows: {}, opPlan: { formaliaDays: 3, replyDays: 90 } } });
  const pl = plain(opPlanDates({ received: '2026-10-20' }));
  assert.strictEqual(pl.op_formalia.date, '2026-10-23');
  assert.strictEqual(pl.op_svar.date, '2027-01-18');
  assert.deepStrictEqual(plain(normalizeOpPlan(null)), { formaliaDays: 1, replyDays: 112 });
  assert.deepStrictEqual(plain(normalizeOpPlan({ formaliaDays: 0, replyDays: 366 })), { formaliaDays: 0, replyDays: 112 });
  assert.deepStrictEqual(plain(normalizeOpPlan({ formaliaDays: -1, replyDays: 60.7 })), { formaliaDays: 1, replyDays: 60 });
});

test('opSuggestedDue and opDueIsEstimate per phase', () => {
  const { opSuggestedDue, opDueIsEstimate } = load();
  const op = { received: '2026-10-20' };
  assert.strictEqual(opSuggestedDue(opCase('op_formalia', op)), '2026-10-21');
  assert.strictEqual(opSuggestedDue(opCase('op_skrift', op)), '');
  assert.strictEqual(opSuggestedDue(opCase('avsluttet', op)), '');
  assert.strictEqual(opDueIsEstimate(opCase('op_svar', op)), true);
  assert.strictEqual(opDueIsEstimate(opCase('op_svar', Object.assign({ replyDue: '2027-02-15' }, op))), false);
  assert.strictEqual(opDueIsEstimate(opCase('op_svar', Object.assign({ dueManual: true }, op))), false);
  assert.strictEqual(opDueIsEstimate(opCase('avsluttet', op)), false);
  assert.strictEqual(opDueIsEstimate({ type: 'sak', status: 'ny' }), false);
});

test('opSyncDue follows the suggestion unless the due date was set by hand', () => {
  const { opSyncDue } = load();
  const op = { replyDue: '2026-07-03', dueManual: false };
  assert.strictEqual(opSyncDue(opCase('op_svar', op, { dueDate: '' }), weekend), '2026-07-03');
  assert.strictEqual(opSyncDue(opCase('op_formalia', op, { dueDate: '2026-03-10' }), weekend), '');
  const manual = Object.assign({}, op, { dueManual: true });
  assert.strictEqual(opSyncDue(opCase('op_svar', manual, { dueDate: '2026-07-20' }), weekend), '2026-07-20');
});

// ── 2–6, 9. Belegg, vindu, tidslinje ──────────────
test('OP wait phases and closed cases do not count in belegg; work phases do', () => {
  const { countsInBelegg } = load();
  assert.strictEqual(countsInBelegg(opCase('op_formalia')), true);
  assert.strictEqual(countsInBelegg(opCase('op_svar')), false);
  assert.strictEqual(countsInBelegg(opCase('op_oppstart')), true);
  assert.strictEqual(countsInBelegg(opCase('op_skrift')), false);
  assert.strictEqual(countsInBelegg(opCase('op_avgjorelse')), true);
  assert.strictEqual(countsInBelegg(opCase('avsluttet')), false);
  assert.strictEqual(countsInBelegg(opCase('op_avgjorelse', {}, { dueDate: '' })), false);
});

test('workWindowDays for OP uses the phase setting, or the case\'s own duration', () => {
  const { workWindowDays, timelineSpanDays, MILESTONE_DAYS } = load();
  assert.strictEqual(workWindowDays(opCase('op_formalia')), 1);
  assert.strictEqual(workWindowDays(opCase('op_oppstart')), 1);
  assert.strictEqual(workWindowDays(opCase('op_avgjorelse')), 10);
  assert.strictEqual(workWindowDays(opCase('op_avgjorelse', {}, { duration: 15 })), 15);
  assert.strictEqual(timelineSpanDays(opCase('op_svar')), MILESTONE_DAYS);
  assert.strictEqual(timelineSpanDays(opCase('op_skrift')), MILESTONE_DAYS);
  assert.strictEqual(timelineSpanDays(opCase('op_avgjorelse')), 10);
});

test('the OP window stretches back past weekends like any other case', () => {
  const { workWindowStart, workWindowDays } = load();
  // 10 arbeidsdager som slutter fredag 11. desember 2026 starter mandag 30. november
  assert.strictEqual(workWindowStart('2026-12-11', workWindowDays(opCase('op_avgjorelse')), weekend), '2026-11-30');
});

test('normalizeWorkWindows keeps the OP phase defaults', () => {
  const { normalizeWorkWindows } = load();
  const w = plain(normalizeWorkWindows({ op_avgjorelse: 12, op_oppstart: 0 }));
  assert.strictEqual(w.op_avgjorelse, 12);
  assert.strictEqual(w.op_oppstart, 1);
  assert.strictEqual(w.op_formalia, 1);
});

test('AC5: only Avgjørelse can be planned earlier, never later; overdue counts from the deadline', () => {
  const { bufferAppliesTo, bufferDaysFor, canPostpone, isUnassigned, effDueFor, deadlineFor } = load();
  const avg = opCase('op_avgjorelse', {}, { dueDate: '2027-05-09', caseBuffer: 14, unassigned: true });
  assert.strictEqual(bufferAppliesTo(avg), true);
  assert.strictEqual(bufferDaysFor(avg), 14);
  assert.strictEqual(effDueFor(avg), '2027-04-25');
  assert.strictEqual(deadlineFor(avg), '2027-05-09');
  assert.strictEqual(canPostpone(avg), false);
  assert.strictEqual(bufferDaysFor(Object.assign({}, avg, { caseBuffer: -5 })), 0);
  assert.strictEqual(bufferDaysFor(opCase('op_avgjorelse', {}, { caseBuffer: null })), 0);
  assert.strictEqual(isUnassigned(avg), false);
  // Andre faser har ingen buffer
  ['op_formalia', 'op_svar', 'op_oppstart', 'op_skrift'].forEach((st) => {
    assert.strictEqual(bufferDaysFor(opCase(st, {}, { caseBuffer: 14 })), 0, st);
  });
});

test('AC4: Avgjørelse is a provisional block from the first day until the case gets there', () => {
  const { opProvisionalCase } = load();
  const op = { received: '2026-10-20' };
  ['op_formalia', 'op_svar', 'op_oppstart', 'op_skrift'].forEach((st) => {
    const v = plain(opProvisionalCase(opCase(st, op, { caseBuffer: 7 })));
    assert.strictEqual(v.status, 'op_avgjorelse', st);
    assert.strictEqual(v.dueDate, '2027-05-09', st);
    assert.strictEqual(v.provisional, true, st);
    assert.strictEqual(v.caseBuffer, 7, st);
    assert.strictEqual(v.id, 'o1', st);
  });
  assert.strictEqual(opProvisionalCase(opCase('op_avgjorelse', op)), null);
  assert.strictEqual(opProvisionalCase(opCase('avsluttet', op)), null);
  assert.strictEqual(opProvisionalCase(opCase('op_svar', {})), null); // ingen dato å regne fra
  assert.strictEqual(opProvisionalCase({ type: 'sak', status: 'ny' }), null);
});

test('frist labels: patenthaver\'s deadline is not yours, work phases count in workdays', () => {
  const { fristOwnerLabel, fristCountdownTone, fristCountdownLabel } = load();
  assert.strictEqual(fristOwnerLabel(opCase('op_svar')), 'Patenthavers frist');
  assert.strictEqual(fristOwnerLabel(opCase('op_avgjorelse')), 'Din frist');
  assert.strictEqual(fristCountdownTone(opCase('op_svar'), -3), '');
  assert.strictEqual(fristCountdownTone(opCase('op_avgjorelse'), -3), 'overdue');
  assert.strictEqual(fristCountdownLabel(opCase('op_avgjorelse'), 10, 8), '8 arbeidsdager igjen');
  assert.strictEqual(fristCountdownLabel(opCase('op_svar'), 10, 8), '10 dager igjen');
  assert.strictEqual(fristCountdownLabel(opCase('avsluttet'), 10, 8), 'Avsluttet');
});

// ── 11. Lagring, import og eksport ────────────────
function loadStorage() {
  return loadFunctions(['migrateCases', '_validateImportCase', 'normalizeOp', 'normalizeOpDate', 'normalizeOpText',
    'isOpCase', 'opPhase', 'opPhaseIndex', 'isValidDate', 'parseDate', 'sanitizeText', 'normaliseOutcome', 'uid',
    'encodeCase', 'decodeCase'], {
    vars: ['OP_PHASES', 'OP_OUTCOMES', 'OP_DATE_LABELS', 'OP_TEXT_LABELS', 'OP_DATE_FIELDS', 'OP_TEXT_FIELDS', 'OP_TEXT_MAX', 'OP_MAX_OPPONENTS',
      'OUTCOMES', 'VALID_IMPORT_STATUSES', 'STATUS_CONFIG', 'INT_TO_STATUS'],
  });
}

test('migrateCases keeps an OP case and normalises its data', () => {
  const { migrateCases } = loadStorage();
  const [c] = plain(migrateCases([{ id: 'o1', caseNumber: 'OP 2026/00123', type: 'op', status: 'op_svar',
    dueDate: '2026-07-03', title: '', outcome: 'meddelt', unassigned: true,
    op: { holder: 'Eksempel AS', opponents: [{ name: 'Testrederi ASA', agent: 'Demo IP' }], replyDue: '2026-07-03' } }]));
  assert.strictEqual(c.type, 'op');
  assert.strictEqual(c.status, 'op_svar');
  assert.strictEqual(c.op.holder, 'Eksempel AS');
  assert.deepStrictEqual(c.op.opponents, [{ name: 'Testrederi ASA', agent: 'Demo IP' }]);
  assert.strictEqual(c.op.replyDue, '2026-07-03');
  assert.strictEqual(c.outcome, null);
  assert.strictEqual(c.unassigned, undefined);
});

test('migrateCases leaves søknader and oppdrag without an op field (schema 8 data loads unchanged)', () => {
  const { migrateCases } = loadStorage();
  const out = plain(migrateCases([
    { id: 's', caseNumber: 'NO20240001', status: 'ny', dueDate: '2026-07-03', title: 'T' },
    { id: 'p', caseNumber: '12345678P', type: 'oppdrag', status: 'ny', dueDate: '2026-07-03', title: 'T', duration: 3 },
  ]));
  assert.strictEqual(out[0].type, 'sak');
  assert.strictEqual('op' in out[0], false);
  assert.strictEqual('op' in out[1], false);
  assert.strictEqual(out[1].duration, 3);
});

test('import validation: OP phases only on OP cases', () => {
  const { _validateImportCase } = loadStorage();
  const base = { id: 'o1', caseNumber: 'OP 2026/00123', dueDate: '', title: '' };
  const opp = { op: { opponents: [{ name: 'A', agent: '' }] } };
  assert.strictEqual(_validateImportCase(Object.assign({ type: 'op', status: 'op_avgjorelse' }, opp, base)), true);
  assert.strictEqual(_validateImportCase(Object.assign({ type: 'op', status: 'avsluttet' }, opp, base)), true);
  assert.strictEqual(_validateImportCase(Object.assign({ type: 'op', status: 'ny' }, opp, base)), false);
  assert.strictEqual(_validateImportCase(Object.assign({ type: 'sak', status: 'op_svar' }, base)), false);
  assert.strictEqual(_validateImportCase(Object.assign({ type: 'sak', status: 'ny' }, base)), true);
});

test('OP phases are stored as text, so an older version skips them instead of turning them into Ny', () => {
  const { encodeCase, decodeCase } = loadStorage();
  assert.strictEqual(encodeCase({ status: 'op_svar' }).status, 'op_svar');
  assert.strictEqual(encodeCase({ status: 'fristarkiv' }).status, 2);
  assert.strictEqual(decodeCase({ status: 'op_svar' }).status, 'op_svar');
});

// ── Fasebytte og redigering ───────────────────────
test('opStatusPatch: a new phase gets its suggested deadline and drops the own window', () => {
  const { opStatusPatch } = load();
  const c = opCase('op_formalia', { replyDue: '2026-07-03', dueManual: true }, { dueDate: '2026-03-10', duration: 3 });
  const p = plain(opStatusPatch(c, 'op_svar', weekend));
  assert.strictEqual(p.dueDate, '2026-07-03');
  assert.strictEqual(p.duration, null);
  assert.strictEqual(p.op.dueManual, false);
  assert.strictEqual(p.op.replyDue, '2026-07-03');
  // Ingen fast frist i Skriftveksling: fristen tømmes, du setter den selv
  assert.strictEqual(opStatusPatch(opCase('op_oppstart', {}), 'op_skrift', weekend).dueDate, '');
  // Avsluttet beholder fristen den hadde
  assert.strictEqual(opStatusPatch(opCase('op_avgjorelse', {}, { dueDate: '2026-12-28' }), 'avsluttet', weekend).dueDate, '2026-12-28');
  // Planen for Avgjørelse (buffer) følger saken gjennom fasene
  assert.strictEqual(opStatusPatch(opCase('op_skrift', {}, { caseBuffer: 10 }), 'op_avgjorelse').caseBuffer, 10);
});

test('opApplyUpdate: changed dates move a suggested deadline, not one set by hand', () => {
  const { opApplyUpdate } = load();
  const c = opCase('op_avgjorelse', { replyKind: 'svar', replyDate: '2026-06-29' }, { dueDate: '' });
  const p = plain(opApplyUpdate(c, { noticeDate: '2026-09-28' }, weekend));
  assert.strictEqual(p.op.noticeDate, '2026-09-28');
  assert.strictEqual(p.dueDate, '2026-12-28');
  const manual = opCase('op_avgjorelse', { noticeDate: '2026-09-28', dueManual: true }, { dueDate: '2026-12-01' });
  assert.strictEqual(opApplyUpdate(manual, { protocolDate: '2026-11-20' }, weekend).dueDate, '2026-12-01');
});

test('opApplyUpdate: setting the deadline by hand, and going back to the suggestion', () => {
  const { opApplyUpdate } = load();
  const c = opCase('op_avgjorelse', { noticeDate: '2026-09-28' }, { dueDate: '2026-12-28' });
  const own = plain(opApplyUpdate(c, { dueDate: '2026-12-11' }, weekend));
  assert.strictEqual(own.dueDate, '2026-12-11');
  assert.strictEqual(own.op.dueManual, true);
  const back = plain(opApplyUpdate(Object.assign({}, c, own), { dueManual: false }, weekend));
  assert.strictEqual(back.dueDate, '2026-12-28');
  assert.strictEqual(back.op.dueManual, false);
  // Ugyldig dato og ukjente felt ignoreres
  const bad = plain(opApplyUpdate(c, { noticeDate: '2026-02-31', evil: 'x' }, weekend));
  assert.strictEqual(bad.op.noticeDate, '');
  assert.strictEqual('evil' in bad.op, false);
});

test('opApplyUpdate: opponents are optional, so the last one can be removed; the inndato cannot be cleared', () => {
  const { opApplyUpdate } = load();
  const c = opCase('op_formalia', { received: '2026-10-20', opponents: [{ name: 'A', agent: '' }] });
  assert.deepStrictEqual(plain(opApplyUpdate(c, { opponents: [] })).op.opponents, []);
  const two = plain(opApplyUpdate(c, { opponents: [{ name: 'A' }, { name: 'B', agent: 'C' }] }));
  assert.deepStrictEqual(two.op.opponents, [{ name: 'A', agent: '' }, { name: 'B', agent: 'C' }]);
  assert.strictEqual(opApplyUpdate(c, { received: '' }), null);
  assert.strictEqual(opApplyUpdate(c, { received: '2026-02-31' }), null);
  assert.strictEqual(plain(opApplyUpdate(c, { received: '2026-10-22' })).op.received, '2026-10-22');
});

test('opApplyUpdate refuses non-OP cases', () => {
  const { opApplyUpdate } = load();
  assert.strictEqual(opApplyUpdate({ type: 'sak', status: 'ny' }, { holder: 'x' }, weekend), null);
});

// ── 1, 10. Dialogen «Legg til sak» ────────────────
test('AC1: only the OP number and the inndato are required in the dialog', () => {
  const { opModalPayload } = load();
  const ok = plain(opModalPayload({ number: 'op 2026/00123', received: '2026.10.20' }, false));
  assert.strictEqual(ok.error, undefined);
  assert.strictEqual(ok.caseNumber, 'OP 2026/00123');
  assert.strictEqual(ok.op.received, '2026-10-20');
  assert.deepStrictEqual(ok.op.opponents, []);
  assert.strictEqual(ok.duration, null);
  const full = plain(opModalPayload({ number: 'OP 2026/00123', received: '2026.10.20', patentNo: 'NO 345678',
    holder: 'Eksempel AS', opponent: 'Testrederi ASA', opponentAgent: 'Demo IP' }, false));
  assert.deepStrictEqual(full.op.opponents, [{ name: 'Testrederi ASA', agent: 'Demo IP' }]);
  assert.strictEqual(full.op.patentNo, 'NO 345678');
});

test('AC1: errors for number, inndato, dates and window', () => {
  const { opModalPayload } = load();
  const base = { number: 'OP 2026/00123', received: '2026.10.20', due: '', duration: '' };
  assert.match(opModalPayload(Object.assign({}, base, { number: 'OP2026/00123' }), false).error, /OP ÅÅÅÅ\/xxxxx/);
  assert.match(opModalPayload(Object.assign({}, base, { number: '' }), false).error, /OP ÅÅÅÅ\/xxxxx/);
  assert.match(opModalPayload(Object.assign({}, base, { received: '' }), false).error, /inndato/);
  assert.match(opModalPayload(Object.assign({}, base, { received: '2026.02.31' }), false).error, /inndato/);
  assert.match(opModalPayload(Object.assign({}, base, { due: '2026.13.01' }), false).error, /frist/);
  assert.match(opModalPayload(Object.assign({}, base, { duration: '0' }), false).error, /vindu/);
  assert.strictEqual(opModalPayload(Object.assign({}, base, { duration: '15', due: '2026.12.11' }), false).duration, 15);
});

test('opModalPayload when editing: innsiger is edited on the case page, not required here', () => {
  const { opModalPayload } = load();
  const p = plain(opModalPayload({ number: 'OP 2026/00123', opponent: '', due: '2026.12.11', duration: '' }, true));
  assert.strictEqual(p.error, undefined);
  assert.strictEqual(p.dueDate, '2026-12-11');
  assert.strictEqual(p.op, undefined);
});

// ── Forløpsspor og kort ───────────────────────────
test('opTrack: earlier phases done, the current one active or waiting, the rest future', () => {
  const { opTrack } = load();
  const st = (c) => plain(opTrack(c)).map((s) => s.state);
  assert.deepStrictEqual(st(opCase('op_formalia')), ['active', 'future', 'future', 'future', 'future']);
  assert.deepStrictEqual(st(opCase('op_svar')), ['done', 'wait', 'future', 'future', 'future']);
  assert.deepStrictEqual(st(opCase('op_avgjorelse')), ['done', 'done', 'done', 'done', 'active']);
  assert.deepStrictEqual(st(opCase('avsluttet')), ['done', 'done', 'done', 'done', 'done']);
  assert.deepStrictEqual(plain(opTrack(opCase('op_svar'))).map((s) => s.label),
    ['Formalia', 'Venter på svar', 'Oppstart', 'Skriftveksling', 'Avgjørelse']);
  assert.strictEqual(opTrack({ type: 'sak', status: 'ny' }), null);
});

test('opCaseTitle falls back to patent number and holder', () => {
  const { opCaseTitle } = load();
  assert.strictEqual(opCaseTitle(opCase('op_svar', { patentNo: 'NO 345678', holder: 'Eksempel AS' })), 'NO 345678 · Eksempel AS');
  assert.strictEqual(opCaseTitle(opCase('op_svar', { patentNo: 'NO 1' }, { title: 'Ventil' })), 'Ventil');
  assert.strictEqual(opCaseTitle(opCase('op_svar', {})), '');
});

// ── OP-panelet ────────────────────────────────────
test('opPanelHtml escapes every text from the case', () => {
  const { opPanelHtml } = load();
  const evil = '"><img src=x onerror=alert(1)>';
  const html = opPanelHtml(opCase('op_svar', { holder: evil, patentNo: evil, voter2: evil,
    opponents: [{ name: evil, agent: evil }], replyDue: '2026-07-03' }), weekend);
  assert.ok(!html.includes('<img'), html);
  assert.ok(html.includes('&quot;&gt;&lt;img'));
});

test('opPanelHtml shows both control deadlines separately, and the phase deadline as a suggestion', () => {
  const { opPanelHtml } = load();
  const html = opPanelHtml(opCase('op_avgjorelse',
    { replyKind: 'svar', replyDate: '2026-06-29', noticeDate: '2026-09-28', opponents: [{ name: 'A' }] },
    { dueDate: '2026-12-28' }), weekend);
  assert.match(html, /\(a\)[^<]*<\/span><span class="op-ctrl-na">ikke aktuell \(svar mottatt\)/);
  assert.match(html, /\(b\)[^<]*<\/span><span class="op-ctrl-open">2026\.12\.28/);
  assert.match(html, /Frist for fasen «Avgjørelse»/);
  assert.match(html, /forslag · kontroller i SANT/);
  // Innsiger er valgfri: også den eneste kan fjernes
  assert.doesNotMatch(html, /data-op-remove="0" disabled/);
});

test('AC2: the panel marks an estimated phase deadline as «anslag»', () => {
  const { opPanelHtml } = load();
  const html = opPanelHtml(opCase('op_svar', { received: '2026-10-20' }, { dueDate: '2027-02-09' }));
  assert.match(html, /anslag/);
  assert.doesNotMatch(opPanelHtml(opCase('op_svar', { received: '2026-10-20', replyDue: '2027-02-09' }, { dueDate: '2027-02-09' })), /op-due-note">anslag/);
});

test('opPanelHtml offers the suggestion back when the deadline was set by hand', () => {
  const { opPanelHtml } = load();
  const html = opPanelHtml(opCase('op_avgjorelse', { noticeDate: '2026-09-28', dueManual: true, opponents: [{ name: 'A' }, { name: 'B' }] },
    { dueDate: '2026-12-11' }), weekend);
  assert.match(html, /satt for hånd · forslag 2026\.12\.28/);
  assert.match(html, /data-op-action="use-suggestion"/);
  assert.strictEqual(opPanelHtml({ type: 'sak' }, weekend), '');
});

test('vacation conflict: only OP work phases can collide with a vacation', () => {
  const { periodOverlapsVacation } = loadFunctions(['periodOverlapsVacation', 'effDueFor', 'getEffectiveDueDate',
    'bufferAppliesTo', 'bufferDaysFor', 'typeBufferFor', 'canPostpone', 'workWindowStart', 'workWindowDays'], {
    vars: ['WORK_WINDOW_DEFAULTS'],
    globals: { workWindows: { op_formalia: 1, op_oppstart: 1, op_avgjorelse: 10 }, isNonWorkday: weekend,
      vacations: [{ from: '2026-12-07', to: '2026-12-09' }] },
  });
  assert.strictEqual(periodOverlapsVacation(opCase('op_avgjorelse', {}, { dueDate: '2026-12-11' })), true);
  assert.strictEqual(periodOverlapsVacation(opCase('op_svar', {}, { dueDate: '2026-12-08' })), false);
  assert.strictEqual(periodOverlapsVacation(opCase('op_skrift', {}, { dueDate: '2026-12-08' })), false);
});

// ── Funn fra gjennomgangen ────────────────────────
function inDays(days) {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + days);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function loadBelegg(list) {
  return loadFunctions(['opProvisionalCases', 'opProvisionalCase', 'opPlanDates', 'opControlDeadlines', 'addMonthsClamped', 'deadlineFor', 'computeBelegg', 'countsInBelegg', 'countsAsPotentialBelegg', 'isUnassigned', 'canBeUnassigned',
    'workWindowDays', 'workWindowStart', 'addDaysLocal', 'overduePenaltyOffsets', 'effDueFor', 'getEffectiveDueDate',
    'isoLocalDate', 'bufferAppliesTo', 'typeBufferFor', 'bufferDaysFor'], {
    vars: ['OVERDUE_PENALTY_WORKDAYS', 'WORK_WINDOW_DEFAULTS'],
    globals: { cases: list, workWindows: { ny: 10, viderebehandling: 3, oppdrag: 2, op_formalia: 1, op_oppstart: 1, op_avgjorelse: 10 },
      vacations: [], typeBuffers: { ny: 0, viderebehandling: 0 }, isNonWorkday: () => false,
      opPlan: { formaliaDays: 1, replyDays: 112 } },
  });
}

test('AC8: an overdue OP work phase costs the overdue penalty; an overdue wait phase costs nothing', () => {
  const work = loadBelegg([opCase('op_avgjorelse', {}, { dueDate: inDays(-5) })]).computeBelegg(30);
  assert.strictEqual(work.busy, 3);
  const wait = loadBelegg([opCase('op_svar', {}, { dueDate: inDays(-5) })]).computeBelegg(30);
  assert.strictEqual(wait.busy, 0);
  const closed = loadBelegg([opCase('avsluttet', {}, { dueDate: inDays(5) })]).computeBelegg(30);
  assert.strictEqual(closed.busy, 0);
  const avg = loadBelegg([opCase('op_avgjorelse', {}, { dueDate: inDays(20) })]).computeBelegg(30);
  assert.strictEqual(avg.busy, 10);
});

test('AC4: the provisional Avgjørelse block counts in belegg while waiting, once in Avgjørelse, never when closed', () => {
  // Svarfristen om 10 dager: Avgjørelse om ca. 3 mnd. + 10 dager
  const waiting = opCase('op_svar', { replyDue: inDays(10) }, { dueDate: inDays(10) });
  assert.strictEqual(loadBelegg([waiting]).computeBelegg(200).busy, 10);
  // I Formalia: formaliadagen og Avgjørelse
  const formalia = opCase('op_formalia', { received: inDays(-1), replyDue: inDays(10) }, { dueDate: inDays(5) });
  assert.strictEqual(loadBelegg([formalia]).computeBelegg(200).busy, 11);
  // Planlagt tidligere: fortsatt 10 dager, bare flyttet
  assert.strictEqual(loadBelegg([Object.assign({}, waiting, { caseBuffer: 20 })]).computeBelegg(200).busy, 10);
  // Når saken er i Avgjørelse, telles bare den faktiske blokken
  const inAvg = opCase('op_avgjorelse', { replyDue: inDays(10) }, { dueDate: inDays(40) });
  assert.strictEqual(loadBelegg([inAvg]).computeBelegg(200).busy, 10);
  assert.strictEqual(loadBelegg([opCase('avsluttet', { replyDue: inDays(10) })]).computeBelegg(200).busy, 0);
});

function loadTimeline() {
  return loadFunctions(['timelineRange', 'timelineBarStart', 'tlDueOffset', 'timelineSpanDays', 'workWindowDays', 'workWindowStart',
    'effDueFor', 'getEffectiveDueDate', 'bufferAppliesTo', 'bufferDaysFor', 'typeBufferFor', 'canPostpone', 'postponedDaysFor',
    'isUnassigned', 'canBeUnassigned', 'isoLocalDate', 'timelineOverdueBands', 'filterCasesForTimeline', 'opDueIsEstimate', 'opProvisionalCases', 'opProvisionalCase', 'opPlanDates', 'opControlDeadlines', 'addMonthsClamped', 'deadlineFor', ], {
    vars: ['MILESTONE_DAYS', 'WORK_WINDOW_DEFAULTS'],
    globals: { workWindows: { op_formalia: 1, op_oppstart: 1, op_avgjorelse: 10 }, typeBuffers: { ny: 0, viderebehandling: 0 },
      isNonWorkday: weekend, vacations: [], opPlan: { formaliaDays: 1, replyDays: 112 } },
  });
}

test('AC2/4: wait phases are milestones on their date; work phases are windows, also with a 1-day window', () => {
  const { timelineRange } = loadTimeline();
  const now = new Date('2026-11-18T08:00:00');
  const svar = timelineRange(opCase('op_svar', {}, { dueDate: '2026-12-11' }), now, 365, 180);
  assert.strictEqual(svar.isMilestone, true);
  assert.strictEqual(svar.windowStart, null);
  ['op_formalia', 'op_oppstart', 'op_avgjorelse'].forEach((st) => {
    const r = timelineRange(opCase(st, {}, { dueDate: '2026-12-11' }), now, 365, 180);
    assert.strictEqual(r.isMilestone, false, st);
    assert.ok(r.windowStart, st);
  });
});

test('AC8/9: overdue bands for OP work phases only; closed and waiting OP cases leave the timeline filter', () => {
  const { timelineOverdueBands, filterCasesForTimeline } = loadTimeline();
  const bands = timelineOverdueBands([
    { planOverdue: true, isOpCase: true, opWork: true, status: 'op_avgjorelse', id: 'a' },
    { planOverdue: true, isOpCase: true, opWork: false, status: 'op_svar', id: 'b' },
  ], [0, 1, 2]);
  assert.strictEqual(bands.length, 1);
  const list = [opCase('op_svar', {}, { id: 'w' }), opCase('avsluttet', {}, { id: 'c' }), opCase('op_avgjorelse', {}, { id: 'a', dueDate: '' })];
  assert.deepStrictEqual(plain(filterCasesForTimeline(list, ['op'])).map((c) => c.id), ['w']);
  assert.deepStrictEqual(plain(filterCasesForTimeline(list, ['ny'])), []);
});

test('AC2/4: the timeline gets the provisional Avgjørelse block, dashed as an estimate and draggable', () => {
  const { filterCasesForTimeline, timelineRange } = loadTimeline();
  const c = opCase('op_svar', { received: '2026-10-20' }, { dueDate: '2027-02-09' });
  const list = plain(filterCasesForTimeline([c], ['op']));
  assert.deepStrictEqual(list.map((x) => [x.status, x.dueDate, !!x.provisional]),
    [['op_svar', '2027-02-09', false], ['op_avgjorelse', '2027-05-09', true]]);
  const now = new Date('2026-11-19T08:00:00');
  const svar = timelineRange(list[0], now, 365, 180);
  assert.strictEqual(svar.isEstimate, true);
  assert.strictEqual(svar.canBuffer, false);
  const prov = timelineRange(list[1], now, 365, 180);
  assert.strictEqual(prov.isProvisional, true);
  assert.strictEqual(prov.isEstimate, true);
  assert.strictEqual(prov.canBuffer, true);
  assert.strictEqual(prov.isMilestone, false);
  // Faktiske datoer: ikke anslag
  const real = timelineRange(opCase('op_svar', { received: '2026-10-20', replyDue: '2027-02-15' }, { dueDate: '2027-02-15' }), now, 365, 180);
  assert.strictEqual(real.isEstimate, false);
});

test('AC9: homeDeadlineKind keeps OP work phases only', () => {
  const { homeDeadlineKind } = loadFunctions(['homeDeadlineKind'], { vars: ['HOME_DEADLINE_KINDS'] });
  assert.strictEqual(homeDeadlineKind(opCase('op_avgjorelse')), 'op');
  assert.strictEqual(homeDeadlineKind(opCase('op_svar')), null);
  assert.strictEqual(homeDeadlineKind(opCase('avsluttet')), null);
});

test('AC5: the OP window stretches back past a public holiday and a vacation', () => {
  const { workWindowStart, workWindowDays } = load();
  // 7. desember er en (tenkt) rød dag, 8. desember en feriedag
  const off = (d) => weekend(d) || (d.getFullYear() === 2026 && d.getMonth() === 11 && (d.getDate() === 7 || d.getDate() === 8));
  // Uten fridager: 30. november. To fridager inni vinduet skyver starten to arbeidsdager bakover.
  assert.strictEqual(workWindowStart('2026-12-11', workWindowDays(opCase('op_avgjorelse')), off), '2026-11-26');
});

test('AC6: a negative own window is refused in the dialog and in the settings', () => {
  const { opModalPayload, normalizeWorkWindows } = load();
  assert.match(opModalPayload({ number: 'OP 2026/00123', opponent: 'A', duration: '-3' }, false).error, /vindu/);
  assert.strictEqual(normalizeWorkWindows({ op_avgjorelse: -4 }).op_avgjorelse, 10);
});

test('AC1/8: import accepts an OP case without opponents or inndato (data saved by v1 loads)', () => {
  const { _validateImportCase } = loadStorage();
  const base = { id: 'o1', caseNumber: 'OP 2026/00123', dueDate: '', title: '', type: 'op', status: 'op_svar' };
  assert.strictEqual(_validateImportCase(Object.assign({ op: { opponents: [] } }, base)), true);
  assert.strictEqual(_validateImportCase(Object.assign({}, base)), true);
  assert.strictEqual(_validateImportCase(Object.assign({ op: { opponents: [{ name: 'A', agent: '' }] } }, base)), true);
});

test('AC11: every OP field survives encode → decode → migrate → validate', () => {
  const { migrateCases, _validateImportCase, encodeCase, decodeCase } = loadStorage();
  const op = { patentNo: 'NO 1', holder: 'H', holderAgent: 'HA', unit: 'U', voter2: 'V2', voter3: 'V3', jurist: 'J',
    received: '2026-03-03', replyDue: '2026-07-03', replyDate: '2026-06-29', meetingDate: '2026-07-09',
    noticeDate: '2026-09-28', decisionDate: '2026-11-01', protocolDate: '2026-12-01', sentDate: '2026-12-05',
    transferDate: '2026-12-10', replyKind: 'svar', outcome: 'endret', dueManual: true,
    opponents: [{ name: 'A', agent: 'B' }, { name: 'C', agent: '' }] };
  const orig = { id: 'o1', caseNumber: 'OP 2026/00123', type: 'op', status: 'op_avgjorelse', dueDate: '2026-12-20',
    title: 'T', duration: 12, history: [{ type: 'status', date: '2026-03-03T00:00:00.000Z', from: null, to: 'op_formalia' }], op: op };
  const wire = JSON.parse(JSON.stringify(encodeCase(orig)));
  const [back] = plain(migrateCases([decodeCase(wire)]));
  assert.strictEqual(_validateImportCase(back), true);
  assert.deepStrictEqual(back.op, op);
  assert.strictEqual(back.status, 'op_avgjorelse');
  assert.strictEqual(back.duration, 12);
  assert.strictEqual(back.dueDate, '2026-12-20');
});

test('AC12: the empty OP page tells you how to add one', () => {
  const { emptyStateMessage } = loadFunctions(['emptyStateMessage', 'addButtonLabel', 'defaultAddTab']);
  assert.strictEqual(emptyStateMessage('', 'op').text, 'Ingen saker her. Bruk «+ Legg til sak» for å opprette en ny.');
});

test('stored timeline views from before OP get the OP type added once', () => {
  const { migrateTlViewAddOp } = loadFunctions(['migrateTlViewAddOp']);
  assert.deepStrictEqual(plain(migrateTlViewAddOp({ home: { horizon: 180, typeFilter: ['ny'] }, modal: {} })),
    { home: { horizon: 180, typeFilter: ['ny', 'op'] }, modal: {} });
  assert.deepStrictEqual(plain(migrateTlViewAddOp({ home: { typeFilter: ['op', 'ny'] } })), { home: { typeFilter: ['op', 'ny'] } });
  assert.strictEqual(migrateTlViewAddOp(null), null);
  assert.deepStrictEqual(plain(migrateTlViewAddOp({ home: { horizon: 90 } })), { home: { horizon: 90 } });
});

test('opStatusPatch: closing stores the chosen OP outcome on the case', () => {
  const { opStatusPatch } = load();
  const c = opCase('op_avgjorelse', { opponents: [{ name: 'A' }] }, { dueDate: '2026-12-28' });
  assert.strictEqual(opStatusPatch(c, 'avsluttet', 'opphevet').op.outcome, 'opphevet');
  assert.strictEqual(opStatusPatch(c, 'avsluttet', 'meddelt').op.outcome, '');
  assert.strictEqual(opStatusPatch(opCase('op_avgjorelse', { outcome: 'endret' }), 'avsluttet').op.outcome, 'endret');
});

test('OP track: the waiting step says it waits on the parties, not the applicant', () => {
  const { opTrack } = load();
  assert.strictEqual(plain(opTrack(opCase('op_svar')))[1].stateText, 'venter på partene');
});

test('a closed OP case shows its outcome in the status chip', () => {
  const { sakStatusChip } = load();
  assert.strictEqual(sakStatusChip('avsluttet', false, 'opphevet').label, 'Avsluttet · Opphevet');
  assert.strictEqual(sakStatusChip('avsluttet', false, 'meddelt').label, 'Avsluttet · Meddelt');
});
