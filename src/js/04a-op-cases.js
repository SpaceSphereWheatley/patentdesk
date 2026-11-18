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
// Oppstartsmøtet: helst innen 10 virkedager etter svar eller fristutløp.
var OP_MEETING_WORKDAYS = 10;
// Begge kontrollfristene er tre måneder.
var OP_CONTROL_MONTHS = 3;

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

// Datoen n arbeidsdager etter iso (iso selv telles ikke). nonWorkday: helg,
// røde dager og ferie (standard isNonWorkday).
function opAddWorkdays(iso, n, nonWorkday) {
  if (!iso) return '';
  nonWorkday = nonWorkday || isNonWorkday;
  var d = new Date(iso + 'T00:00:00');
  var left = n;
  for (var i = 0; i < 3660 && left > 0; i++) {
    d = addDaysLocal(d, 1);
    if (!nonWorkday(d)) left--;
  }
  return isoLocalDate(d);
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

// Fristen for oppstartsmøtet: 10 arbeidsdager etter svaret, eller etter at
// svarfristen løp ut. Tom før noen av dem er kjent.
function opMeetingDue(op, nonWorkday) {
  var o = op || {};
  var base = o.replyKind === 'svar' ? o.replyDate
           : o.replyKind === 'utlopt' ? (o.replyDue || o.replyDate) : '';
  return base ? opAddWorkdays(base, OP_MEETING_WORKDAYS, nonWorkday) : '';
}

// Fristen appen foreslår for fasen saken står i. Tom når fasen ikke har noen
// fast frist (Formalia, Skriftveksling) — da setter du den selv.
function opSuggestedDue(c, nonWorkday) {
  if (!isOpCase(c)) return '';
  var op = c.op || {};
  switch (c.status) {
    case 'op_svar':     return op.replyDue || '';
    case 'op_oppstart': return opMeetingDue(op, nonWorkday);
    case 'op_avgjorelse': {
      var ctl = opControlDeadlines(op);
      var open = [ctl.a, ctl.b].filter(function(x) { return x.applies && !x.met; }).map(function(x) { return x.date; });
      open.sort();
      return open[0] || '';
    }
    default: return '';
  }
}

// Fasens frist slik den skal lagres: forslaget, med mindre du har satt den selv.
function opSyncDue(c, nonWorkday) {
  if (!isOpCase(c)) return c ? c.dueDate || '' : '';
  if ((c.op && c.op.dueManual) || c.status === 'avsluttet') return c.dueDate || '';
  return opSuggestedDue(c, nonWorkday);
}

// Feltene som endres når en OP-sak bytter fase: fasens frist foreslås på nytt
// (den gamle fasens frist er behandlet), og sakens eget vindu gjaldt den gamle
// fasen. Avsluttet beholder fristen den hadde.
function opStatusPatch(c, toStatus, nonWorkday) {
  var op = Object.assign(normalizeOp(c && c.op), { dueManual: false });
  var next = Object.assign({}, c, { status: toStatus, op: op });
  return { op: op, duration: null, dueDate: toStatus === 'avsluttet' ? (c.dueDate || '') : opSuggestedDue(next, nonWorkday) };
}

// Feltene som endres når OP-dataene redigeres på sakssiden. changes kan ha
// OP-feltene, `dueDate` (fasens frist satt for hånd) og `dueManual: false`
// (tilbake til forslaget). Gir { op, dueDate }, eller null når endringen ikke
// er gyldig (ikke en OP-sak, eller den siste innsigeren fjernes).
function opApplyUpdate(c, changes, nonWorkday) {
  if (!isOpCase(c) || !changes || typeof changes !== 'object') return null;
  var cur = normalizeOp(c.op);
  var merged = Object.assign({}, cur);
  OP_TEXT_FIELDS.concat(OP_DATE_FIELDS, ['replyKind', 'outcome', 'opponents']).forEach(function(k) {
    if (Object.prototype.hasOwnProperty.call(changes, k)) merged[k] = changes[k];
  });
  var op = normalizeOp(merged);
  if (Object.prototype.hasOwnProperty.call(changes, 'opponents') && !op.opponents.length) return null;
  var dueDate = c.dueDate || '';
  if (Object.prototype.hasOwnProperty.call(changes, 'dueDate')) {
    dueDate = normalizeOpDate(changes.dueDate);
    op.dueManual = true;
  } else if (changes.dueManual === false) {
    op.dueManual = false;
  }
  var next = Object.assign({}, c, { op: op, dueDate: dueDate });
  return { op: op, dueDate: opSyncDue(next, nonWorkday) };
}

// Feltene fra «Legg til sak» / «Rediger sak» for en OP-sak. Ny sak: nummer og
// minst én innsiger kreves. Redigering: bare nummer, fasens frist, eget vindu
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
  if (received && !isValidDate(received)) return { error: 'Ugyldig mottaksdato — bruk formatet åååå.mm.dd.' };
  var op = normalizeOp({ patentNo: f.patentNo, holder: f.holder, received: received ? parseDate(received) : '',
    opponents: [{ name: f.opponent, agent: f.opponentAgent }] });
  if (!op.opponents.length) return { error: 'Skriv inn minst én innsiger.' };
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
    return { label: p.label, state: state };
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

// HTML for OP-panelet. All tekst fra saken går gjennom esc. nonWorkday som i
// opSuggestedDue. Ren funksjon — se test/opCases.test.js.
function opPanelHtml(c, nonWorkday) {
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
      '<button type="button" class="btn-icon btn-icon-sm op-opp-del" data-feature="op-remove-opponent" data-op-remove="' + i + '"' +
        (op.opponents.length <= 1 ? ' disabled title="En OP-sak må ha minst én innsiger"' : ' title="Fjern innsiger"') +
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
  var sugg = opSuggestedDue(c, nonWorkday);
  var dueNote = !phase ? ''
    : op.dueManual
      ? 'satt for hånd' + (sugg && sugg !== c.dueDate ? ' · forslag ' + toDisplay(sugg) +
          ' <button type="button" class="op-link" data-feature="op-use-suggestion" data-op-action="use-suggestion">Bruk forslag</button>' : '')
      : sugg ? 'forslag · kontroller i SANT' : 'ingen fast frist i denne fasen — sett den selv';
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
        '<div class="op-ctrl-hint">Utregnet av appen. SANT er fasit.</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}
