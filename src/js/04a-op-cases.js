// ════════════════════════════════════════════════════════════════════════════
// SEKSJON 2a · OP-SAKER (INNSIGELSER)
// Egen sakstype (type: 'op') med egne faser. Hver fase oppfører seg som en
// vanlig sak: arbeidsfasene har et arbeidsvindu som slutter på fasens frist og
// teller i belegget, ventefasene er milepæler (som Fristarkiv). Saksdataene
// ligger på saken som `op` (se normalizeOp). SANT er fasit for frister og
// status — fristene appen regner ut, er forslag som kan overstyres.
// Rene funksjoner — se test/opCases.test.js.
// ════════════════════════════════════════════════════════════════════════════

// Fasene i rekkefølge. Statusen lagres som `status` på saken, så alt som ser på
// Ny/Fristarkiv/Viderebehandling, aldri treffer en OP-sak. `next` er etiketten
// på knappen som fører saken videre fra fasen.
var OP_PHASES = [
  { status: 'op_formalia',   label: 'Formalia',       work: true,  windowKey: 'op_formalia',   next: 'Oversendt patenthaver' },
  { status: 'op_svar',       label: 'Venter på svar', work: false, windowKey: null,            next: 'Svar / fristutløp' },
  { status: 'op_oppstart',   label: 'Oppstart',       work: true,  windowKey: 'op_oppstart',   next: 'Oppstartsmøte holdt' },
  { status: 'op_skrift',     label: 'Skriftveksling', work: false, windowKey: null,            next: 'Tilstrekkelig opplyst' },
  { status: 'op_avgjorelse', label: 'Avgjørelse',     work: true,  windowKey: 'op_avgjorelse', next: 'Avgjørelse sendt' }
];

var OP_OUTCOMES = {
  opprettholdt: 'Opprettholdt',
  endret:       'Opprettholdt i endret form',
  opphevet:     'Opphevet',
  avvist:       'Innsigelse avvist'
};

var OP_TEXT_MAX = 200;
var OP_MAX_OPPONENTS = 20;
// Oppstartsmøtet: innen 10 dager etter svar eller fristutløp (kalenderdager).
var OP_MEETING_DAYS = 10;
// Begge kontrollfristene er tre måneder.
var OP_CONTROL_MONTHS = 3;

// Planen fra inndatoen (Innstillinger → Frister): dager fra inndato til
// formalia er gjort og til patenthavers svarfrist. Standarden er hentet fra
// en virkelig sak (inndato 20.10., svarfrist 9.2. = 112 dager). Anslag — en
// faktisk dato fra SANT tar alltid over.
var OP_PLAN_DEFAULTS = { formaliaDays: 1, replyDays: 112 };
var OP_PLAN_MAX = 365;

// Datofeltene på en OP-sak, i den rekkefølgen saken går gjennom dem.
var OP_DATE_FIELDS = ['received', 'replyDue', 'replyDate', 'meetingDate', 'noticeDate',
  'decisionDate', 'protocolDate', 'sentDate', 'transferDate'];
var OP_TEXT_FIELDS = ['patentNo', 'holder', 'holderAgent', 'unit', 'voter2', 'voter3', 'jurist'];

function isOpCase(c) { return !!c && c.type === 'op'; }

// En patentsøknad: alt som ikke er et oppdrag eller en OP-sak. Bare søknader
// har krav, runder, mothold, CPC og medlesing.
function isApplication(c) { return !!c && c.type !== 'oppdrag' && c.type !== 'op'; }

function opPhaseIndex(status) {
  for (var i = 0; i < OP_PHASES.length; i++) if (OP_PHASES[i].status === status) return i;
  return -1;
}
function opPhase(status) {
  var i = opPhaseIndex(status);
  return i === -1 ? null : OP_PHASES[i];
}
function opPhaseLabel(status) {
  if (status === 'avsluttet') return 'Avsluttet';
  var p = opPhase(status);
  return p ? p.label : '';
}
function isOpWorkPhase(c) {
  if (!isOpCase(c)) return false;
  var p = opPhase(c.status);
  return !!p && p.work;
}
function isOpWaitPhase(c) {
  if (!isOpCase(c)) return false;
  var p = opPhase(c.status);
  return !!p && !p.work;
}

// Neste steg fra en fase; null når saken er avsluttet.
function opForwardAction(status) {
  var i = opPhaseIndex(status);
  if (i === -1) return null;
  var to = i + 1 < OP_PHASES.length ? OP_PHASES[i + 1].status : 'avsluttet';
  return { label: OP_PHASES[i].next, toStatus: to, choice: null };
}

// OP-saksnummer: «OP YYYY/xxxxx», der YYYY er året innsigelsen kom inn.
// Gir nummeret i fast form, eller null når det ikke er gyldig.
function normalizeOpNumber(raw) {
  if (typeof raw !== 'string') return null;
  var m = /^OP (\d{4})\/(\d{5})$/.exec(raw.trim().toUpperCase());
  if (!m) return null;
  var y = +m[1];
  if (y < 1900 || y > 2100) return null;
  return 'OP ' + m[1] + '/' + m[2];
}

function normalizeOpDate(v) {
  return typeof v === 'string' && isValidDate(v) ? parseDate(v) : '';
}
function normalizeOpText(v) {
  return typeof v === 'string' ? sanitizeText(v).trim().slice(0, OP_TEXT_MAX) : '';
}

// Et fullstendig og gyldig `op`-objekt fra lagrede eller importerte data.
// Ukjente datoer blir tomme; innsigere uten navn tas ikke med.
function normalizeOp(raw) {
  var src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  var out = {};
  OP_TEXT_FIELDS.forEach(function(k) { out[k] = normalizeOpText(src[k]); });
  OP_DATE_FIELDS.forEach(function(k) { out[k] = normalizeOpDate(src[k]); });
  out.replyKind = src.replyKind === 'svar' || src.replyKind === 'utlopt' ? src.replyKind : '';
  out.outcome = typeof src.outcome === 'string' && Object.prototype.hasOwnProperty.call(OP_OUTCOMES, src.outcome) ? src.outcome : '';
  out.dueManual = src.dueManual === true;
  out.opponents = (Array.isArray(src.opponents) ? src.opponents : [])
    .filter(function(o) { return o && typeof o === 'object'; })
    .map(function(o) { return { name: normalizeOpText(o.name), agent: normalizeOpText(o.agent) }; })
    .filter(function(o) { return !!o.name; })
    .slice(0, OP_MAX_OPPONENTS);
  return out;
}

// De to kontrollfristene, hver for seg:
//  (a) ubesvart svarfrist: saken skal tas opp til avgjørelse innen tre måneder
//      etter at fristen løp ut. Oppfylt når «tatt opp til avgjørelse» er satt.
//  (b) protokollen skal være ferdig innen tre måneder etter varselet om at
//      saken er tilstrekkelig opplyst. Oppfylt når «protokoll ferdig» er satt.
function opControlDeadlines(op) {
  var o = op || {};
  function plus(iso) { return iso ? addMonthsClamped(new Date(iso + 'T00:00:00'), OP_CONTROL_MONTHS) : ''; }
  var expired = o.replyKind === 'utlopt' ? (o.replyDue || o.replyDate || '') : '';
  return {
    a: { applies: !!expired, date: plus(expired), met: !!expired && !!o.decisionDate },
    b: { applies: !!o.noticeDate, date: plus(o.noticeDate), met: !!o.noticeDate && !!o.protocolDate }
  };
}

// Planinnstillingene, hver verdi for seg. Formalia kan være 0 dager (samme dag).
function normalizeOpPlan(raw) {
  var src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  function ok(v, min) { return typeof v === 'number' && isFinite(v) && v >= min && v <= OP_PLAN_MAX; }
  return {
    formaliaDays: ok(src.formaliaDays, 0) ? Math.floor(src.formaliaDays) : OP_PLAN_DEFAULTS.formaliaDays,
    replyDays:    ok(src.replyDays, 1)    ? Math.floor(src.replyDays)    : OP_PLAN_DEFAULTS.replyDays
  };
}

function _opPlusDays(iso, n) {
  return iso ? isoLocalDate(addDaysLocal(new Date(iso + 'T00:00:00'), n)) : '';
}
function _opPlusMonths(iso, n) {
  return iso ? addMonthsClamped(new Date(iso + 'T00:00:00'), n) : '';
}

// Fristen for hver fase, regnet fra inndatoen og de datoene som er kjent.
// { fase: { date, est } } — est (anslag) når datoen bygger på inndatoen og
// innstillingene i stedet for en faktisk dato fra SANT. Kalenderdager, som
// alle frister i appen. En faktisk dato tar over, og datoene etter den
// regnes fra den:
//   Formalia      inndato + formaliatid                         (anslag)
//   Venter på svar svarfrist, ellers inndato + svartid           (anslag)
//   Oppstart      svar/fristutløp + 10 dager
//   Skriftveksling ingen fast frist
//   Avgjørelse    kontrollfrist (a)/(b), ellers svar/fristutløp + 3 mnd. (anslag)
function opPlanDates(op) {
  var o = op || {};
  var plan = normalizeOpPlan(typeof opPlan !== 'undefined' ? opPlan : null);
  var formalia = { date: _opPlusDays(o.received, plan.formaliaDays), est: true };
  if (!formalia.date) formalia.est = false;
  var svar = o.replyDue ? { date: o.replyDue, est: false }
           : { date: _opPlusDays(o.received, plan.replyDays), est: !!o.received };
  // Svar eller fristutløp: oppstarten og avgjørelsen regnes herfra
  var base = o.replyKind === 'svar' && o.replyDate ? { date: o.replyDate, est: false }
           : o.replyKind === 'utlopt' && (o.replyDue || o.replyDate) ? { date: o.replyDue || o.replyDate, est: false }
           : svar;
  var oppstart = { date: _opPlusDays(base.date, OP_MEETING_DAYS), est: !!base.date && base.est };
  var ctl = opControlDeadlines(o);
  var open = [ctl.a, ctl.b].filter(function(x) { return x.applies && !x.met; }).map(function(x) { return x.date; }).sort();
  var avg = open.length ? { date: open[0], est: false }
          : ctl.b.applies ? { date: ctl.b.date, est: false }
          : ctl.a.applies ? { date: ctl.a.date, est: false }
          : { date: _opPlusMonths(base.date, OP_CONTROL_MONTHS), est: !!base.date };
  return {
    op_formalia: formalia, op_svar: svar, op_oppstart: oppstart,
    op_skrift: { date: '', est: false }, op_avgjorelse: avg
  };
}

// Fristen appen foreslår for fasen saken står i (se opPlanDates). Tom når
// fasen ikke har noen fast frist (Skriftveksling) — da setter du den selv.
function opSuggestedDue(c) {
  if (!isOpCase(c) || !opPhase(c.status)) return '';
  return opPlanDates(c.op)[c.status].date || '';
}

// Om fasens frist er et anslag: forslaget brukes, og det bygger på inndatoen.
// Den anslåtte Avgjørelse-blokken (opProvisionalCase) er alltid et anslag.
function opDueIsEstimate(c) {
  if (!isOpCase(c)) return false;
  if (c.provisional) return true;
  if (!opPhase(c.status) || (c.op && c.op.dueManual)) return false;
  // Bare når den lagrede fristen faktisk er planens anslag
  var p = opPlanDates(c.op)[c.status];
  return p.est && !!c.dueDate && c.dueDate === p.date;
}

// Datoen arbeidsvinduet slutter på (planen). For en OP-sak der den planlagte
// datoen har passert, men fristen ikke, gjelder fristen: arbeidet er ikke
// forfalt før fristen, så vinduet og belegget følger fristen så lenge.
// todayIso: 'YYYY-MM-DD'.
function opPlanDue(c, todayIso) {
  var eff = effDueFor(c);
  if (isOpCase(c) && eff && c.dueDate && eff < todayIso && c.dueDate >= todayIso) return c.dueDate;
  return eff;
}

// Lagrede frister på OP-sakene i takt med planen: saker lagret før planen fra
// inndatoen fantes, eller med andre planinnstillinger. En frist satt for hånd
// røres ikke. Samme objekt tilbake når ingenting endres.
function opResync(list) {
  return (list || []).map(function(c) {
    if (!isOpCase(c)) return c;
    var d = opSyncDue(c);
    return d === (c.dueDate || '') ? c : Object.assign({}, c, { dueDate: d });
  });
}

// Avgjørelse som anslått blokk mens saken er i en tidligere fase: en kopi av
// saken i fasen Avgjørelse, med planens frist. Tidslinjen og belegget regner
// den som arbeid fra første dag, så tiden kan planlegges lenge før saken
// kommer dit. Bufferen (sakens planlegging av Avgjørelse) følger med. null når
// saken alt er i Avgjørelse, er avsluttet, eller ingen dato er kjent.
function opProvisionalCase(c) {
  if (!isOpCase(c) || !opPhase(c.status) || c.status === 'op_avgjorelse') return null;
  var due = opPlanDates(c.op).op_avgjorelse.date;
  if (!due) return null;
  return Object.assign({}, c, { status: 'op_avgjorelse', dueDate: due, duration: null, provisional: true });
}
function opProvisionalCases(list) {
  return (list || []).map(opProvisionalCase).filter(Boolean);
}

// Fasens frist slik den skal lagres: forslaget, med mindre du har satt den selv.
function opSyncDue(c) {
  if (!isOpCase(c)) return c ? c.dueDate || '' : '';
  if ((c.op && c.op.dueManual) || c.status === 'avsluttet') return c.dueDate || '';
  return opSuggestedDue(c);
}

// Feltene som endres når en OP-sak bytter fase: fasens frist foreslås på nytt
// (den gamle fasens frist er behandlet), og sakens eget vindu gjaldt den gamle
// fasen. Avsluttet beholder fristen den hadde, og får utfallet som ble valgt
// i avslutningsdialogen (outcome, en nøkkel i OP_OUTCOMES).
function opStatusPatch(c, toStatus, outcome) {
  var op = Object.assign(normalizeOp(c && c.op), { dueManual: false });
  if (toStatus === 'avsluttet' && outcome !== undefined && outcome !== null) {
    op.outcome = Object.prototype.hasOwnProperty.call(OP_OUTCOMES, outcome) ? outcome : '';
  }
  var next = Object.assign({}, c, { status: toStatus, op: op });
  // Bufferen er planen for Avgjørelse og følger saken gjennom fasene
  return { op: op, duration: null, caseBuffer: c.caseBuffer != null ? c.caseBuffer : null,
    dueDate: toStatus === 'avsluttet' ? (c.dueDate || '') : opSuggestedDue(next) };
}

// Feltene som endres når OP-dataene redigeres på sakssiden. changes kan ha
// OP-feltene, `dueDate` (fasens frist satt for hånd) og `dueManual: false`
// (tilbake til forslaget). Gir { op, dueDate }, eller null når endringen ikke
// er gyldig (ikke en OP-sak, eller inndatoen tømmes — den er obligatorisk).
function opApplyUpdate(c, changes) {
  if (!isOpCase(c) || !changes || typeof changes !== 'object') return null;
  var cur = normalizeOp(c.op);
  var merged = Object.assign({}, cur);
  OP_TEXT_FIELDS.concat(OP_DATE_FIELDS, ['replyKind', 'outcome', 'opponents']).forEach(function(k) {
    if (Object.prototype.hasOwnProperty.call(changes, k)) merged[k] = changes[k];
  });
  var op = normalizeOp(merged);
  if (Object.prototype.hasOwnProperty.call(changes, 'received') && !op.received) return null;
  var dueDate = c.dueDate || '';
  if (Object.prototype.hasOwnProperty.call(changes, 'dueDate')) {
    dueDate = normalizeOpDate(changes.dueDate);
    op.dueManual = true;
  } else if (changes.dueManual === false) {
    op.dueManual = false;
  }
  var next = Object.assign({}, c, { op: op, dueDate: dueDate });
  return { op: op, dueDate: opSyncDue(next) };
}

// Feltene fra «Legg til sak» / «Rediger sak» for en OP-sak. Ny sak: bare
// nummer og inndato kreves; alt annet er valgfritt. Redigering: bare nummer, fasens frist, eget vindu
// (og tittel, notater, stikkord, som leses av dialogen selv); resten endres på
// sakssiden. Gir { error } eller { caseNumber, dueDate, duration, op? }.
function opModalPayload(f, editing) {
  f = f || {};
  var cn = normalizeOpNumber(f.number || '');
  if (!cn) return { error: 'OP-saksnummer må ha formen OP ÅÅÅÅ/xxxxx, f.eks. OP 2026/00123.' };
  var due = (f.due || '').trim();
  if (due && !isValidDate(due)) return { error: 'Ugyldig frist — bruk formatet åååå.mm.dd.' };
  var durRaw = String(f.duration == null ? '' : f.duration).trim();
  var dur = durRaw === '' ? null : parseInt(durRaw, 10);
  if (durRaw !== '' && !(dur >= 1 && dur <= WORK_WINDOW_MAX)) return { error: 'Eget vindu må være minst 1 arbeidsdag — eller tomt for standarden.' };
  var out = { caseNumber: cn, dueDate: due ? parseDate(due) : '', duration: dur };
  if (editing) return out;
  var received = (f.received || '').trim();
  if (!received) return { error: 'Skriv inn inndatoen (da innsigelsen kom inn).' };
  if (!isValidDate(received)) return { error: 'Ugyldig inndato — bruk formatet åååå.mm.dd.' };
  var op = normalizeOp({ patentNo: f.patentNo, holder: f.holder, received: parseDate(received),
    opponents: [{ name: f.opponent, agent: f.opponentAgent }] });
  out.op = op;
  return out;
}

// Forløpssporet for en OP-sak: ett steg per fase, i samme form som caseTrack
// ({ label, state }). null for andre saker.
function opTrack(c) {
  if (!isOpCase(c)) return null;
  var cur = c.status === 'avsluttet' ? OP_PHASES.length : opPhaseIndex(c.status);
  return OP_PHASES.map(function(p, i) {
    var state = i < cur ? 'done' : i > cur ? 'future' : p.work ? 'active' : 'wait';
    var slot = { label: p.label, state: state };
    // OP-saker har ingen søker: det er partene saken venter på
    if (state === 'wait') slot.stateText = 'venter på partene';
    return slot;
  });
}

// Tittelen i lister: sakens egen tittel, ellers patentnummer og patenthaver.
function opCaseTitle(c) {
  if (c && c.title) return c.title;
  var op = (c && c.op) || {};
  return [op.patentNo, op.holder].filter(Boolean).join(' · ');
}

// ── Sakssiden: OP-panelet ──────────────────────────
var OP_DATE_LABELS = {
  received:     'Mottatt',
  replyDue:     'Svarfrist patenthaver',
  replyDate:    'Svar mottatt / bekreftet fristutløp',
  meetingDate:  'Oppstartsmøte',
  noticeDate:   'Varsel: tilstrekkelig opplyst',
  decisionDate: 'Tatt opp til avgjørelse',
  protocolDate: 'Protokoll ferdig',
  sentDate:     'Utsendt',
  transferDate: 'Overført til klageoppfølging'
};
var OP_TEXT_LABELS = {
  patentNo: 'Patentnummer', holder: 'Patenthaver', holderAgent: 'Patenthavers fullmektig',
  unit: 'Ansvarlig enhet', voter2: '2. voterende', voter3: '3. voterende', jurist: 'Patentjurist'
};

// Linjen for én kontrollfrist: datoen, «oppfylt» eller hvorfor den ikke gjelder.
function opControlText(x, notApplies) {
  if (!x.applies) return { text: notApplies, tone: 'na' };
  if (x.met) return { text: toDisplay(x.date) + ' · oppfylt', tone: 'met' };
  return { text: toDisplay(x.date), tone: 'open' };
}

// HTML for OP-panelet. All tekst fra saken går gjennom esc. Ren funksjon — se test/opCases.test.js.
function opPanelHtml(c) {
  if (!isOpCase(c)) return '';
  var op = normalizeOp(c.op);
  function input(attr, val, extra) {
    return '<input class="field-input op-input" type="text" ' + attr + ' value="' + esc(val || '') + '"' + (extra || '') + ' />';
  }
  function text(k) {
    return '<div class="op-kv-k"><label for="op-f-' + k + '">' + esc(OP_TEXT_LABELS[k]) + '</label></div>' +
      '<div class="op-kv-v">' + input('id="op-f-' + k + '" data-op-field="' + k + '" maxlength="' + OP_TEXT_MAX + '"', op[k]) + '</div>';
  }
  function dateRow(k) {
    var extra = k === 'replyDate'
      ? '<select class="field-input op-reply-kind" data-feature="op-reply-kind" data-op-field="replyKind" aria-label="Hva skjedde ved svarfristen">' +
          '<option value=""' + (op.replyKind === '' ? ' selected' : '') + '>—</option>' +
          '<option value="svar"' + (op.replyKind === 'svar' ? ' selected' : '') + '>Svar mottatt</option>' +
          '<option value="utlopt"' + (op.replyKind === 'utlopt' ? ' selected' : '') + '>Fristen løp ut uten svar</option>' +
        '</select>'
      : '';
    return '<tr><th scope="row"><label for="op-d-' + k + '">' + esc(OP_DATE_LABELS[k]) + '</label></th>' +
      '<td class="op-date-cell">' + input('id="op-d-' + k + '" data-op-date="' + k + '" placeholder="åååå.mm.dd" maxlength="10" autocomplete="off"', toDisplay(op[k]), ' data-op-dp="1"') +
      extra + '</td></tr>';
  }
  var opps = op.opponents.map(function(o, i) {
    return '<div class="op-opp" data-op-opp="' + i + '">' +
      input('data-op-opp-key="name" aria-label="Innsiger ' + (i + 1) + '" maxlength="' + OP_TEXT_MAX + '"', o.name) +
      input('data-op-opp-key="agent" aria-label="Fullmektig for innsiger ' + (i + 1) + '" placeholder="Fullmektig" maxlength="' + OP_TEXT_MAX + '"', o.agent) +
      '<button type="button" class="btn-icon btn-icon-sm op-opp-del" data-feature="op-remove-opponent" data-op-remove="' + i + '" title="Fjern innsiger"' +
        ' aria-label="Fjern innsiger ' + (i + 1) + '"><svg class="ti" aria-hidden="true"><use href="#ti-x"/></svg></button>' +
    '</div>';
  }).join('') +
    '<div class="op-opp op-opp-new">' +
      input('data-op-opp-new="name" aria-label="Ny innsiger" placeholder="+ Legg til innsiger" maxlength="' + OP_TEXT_MAX + '"', '') +
    '</div>';
  var outcome = '<select class="field-input" id="op-f-outcome" data-op-field="outcome">' +
    '<option value="">— ikke valgt —</option>' +
    Object.keys(OP_OUTCOMES).map(function(k) {
      return '<option value="' + k + '"' + (op.outcome === k ? ' selected' : '') + '>' + esc(OP_OUTCOMES[k]) + '</option>';
    }).join('') + '</select>';

  var ctl = opControlDeadlines(op);
  var a = opControlText(ctl.a, op.replyKind === 'svar' ? 'ikke aktuell (svar mottatt)' : 'gjelder bare når fristen løper ut uten svar');
  var b = opControlText(ctl.b, 'starter når varselet er sendt');
  var phase = opPhase(c.status);
  var sugg = opSuggestedDue(c);
  var avgPlan = opPlanDates(op).op_avgjorelse;
  var dueNote = !phase ? ''
    : op.dueManual
      ? 'satt for hånd' + (sugg && sugg !== c.dueDate ? ' · forslag ' + toDisplay(sugg) +
          ' <button type="button" class="op-link" data-feature="op-use-suggestion" data-op-action="use-suggestion">Bruk forslag</button>' : '')
      : sugg ? (opDueIsEstimate(c) ? 'anslag · regnet fra inndatoen' : 'forslag · kontroller i SANT')
      : 'ingen fast frist i denne fasen — sett den selv';
  var dueRow = phase
    ? '<div class="op-due"><label for="op-due-input">Frist for fasen «' + esc(phase.label) + '»</label>' +
        input('id="op-due-input" data-op-due="1" placeholder="åååå.mm.dd" maxlength="10" autocomplete="off"', toDisplay(c.dueDate), ' data-op-dp="1"') +
        '<span class="op-due-note">' + dueNote + '</span></div>'
    : '';

  return '<div class="op-grid">' +
    '<div class="op-card"><h3 class="op-card-title">Parter og utvalg</h3><div class="op-kv">' +
      text('patentNo') + text('holder') + text('holderAgent') +
      '<div class="op-kv-k">Innsigere</div><div class="op-kv-v">' + opps + '</div>' +
      text('unit') +
      '<div class="op-kv-k">1. voterende</div><div class="op-kv-v op-kv-plain">Deg</div>' +
      text('voter2') + text('voter3') + text('jurist') +
      '<div class="op-kv-k"><label for="op-f-outcome">Utfall</label></div><div class="op-kv-v">' + outcome + '</div>' +
    '</div></div>' +
    '<div class="op-card"><h3 class="op-card-title">Saksdatoer <span class="op-card-sub">fra SANT</span></h3>' +
      dueRow +
      '<table class="op-dates">' + OP_DATE_FIELDS.map(dateRow).join('') + '</table>' +
      '<div class="op-ctrl">' +
        '<div class="op-ctrl-row"><span>(a) Tatt opp til avgjørelse — ubesvart frist + 3 mnd.</span><span class="op-ctrl-' + a.tone + '">' + esc(a.text) + '</span></div>' +
        '<div class="op-ctrl-row"><span>(b) Protokoll ferdig — varsel + 3 mnd.</span><span class="op-ctrl-' + b.tone + '">' + esc(b.text) + '</span></div>' +
        (avgPlan.date && c.status !== 'op_avgjorelse' && c.status !== 'avsluttet'
          ? '<div class="op-ctrl-row op-ctrl-plan"><span>Avgjørelse (plan, i tidslinjen og belegget)</span><span class="op-ctrl-' + (avgPlan.est ? 'na' : 'open') + '">' +
              esc(toDisplay(avgPlan.date) + (avgPlan.est ? ' · anslag' : '')) + '</span></div>' : '') +
        '<div class="op-ctrl-hint">Utregnet av appen. SANT er fasit.</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}
