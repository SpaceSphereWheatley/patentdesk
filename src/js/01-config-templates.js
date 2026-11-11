// ════════════════════════════════════════════════════════════════════════════
// SEKSJON 1 · KONSTANTER OG KONFIGURASJON
// APP_VERSION, SCHEMA_VERSION, localStorage-nøkler, domene-enums, datepicker
// ════════════════════════════════════════════════════════════════════════════
// PatentDesk — app.js
var APP_VERSION    = 'v4.64.2';
var SCHEMA_VERSION = 8;
var STORAGE_KEY  = 'pt_cases';
var DOC_ROOT_KEY = 'pt_doc_root';
var DEFAULT_DOC_ROOT = 'C:\\Users\\brukernavn\\Dokumenter\\Saksdokumenter';
var DEFAULT_FILES = ['Claims.pdf', 'Description.pdf', 'Abstract.pdf', 'Figures.pdf', 'Application.pdf']
  .map(function(n) { return { name: n }; });
var ONBOARDING_KEY = 'pt_onboarding_completed';
var USER_NAME_KEY  = 'pt_user_name';
var VACATION_KEY = 'pt_vacations';
var STATS_KEY    = 'pt_stats';
var GOAL_KEY     = 'pt_goal';
var BELEGG_KEY   = 'pt_belegg_horizon';
var BUFFER_KEY   = 'pt_frist_buffer';   // gammel global buffer, leses bare ved oppgradering
var TYPE_BUFFER_KEY = 'pt_type_buffers';
var WORK_WINDOW_KEY = 'pt_work_windows';
var DEADLINES_KEY   = 'pt_deadlines';
var HOME_DEADLINE_KEY = 'pt_home_frister';
var DOC_LAYOUT_KEY    = 'pt_doc_layout';
var ACTIVE_CASE_KEY   = 'pt_active_case';
var UNASSIGNED_REMINDER_KEY = 'pt_unassigned_reminder';
var MEDLESERE_KEY     = 'pt_medlesere';
var MEDL_LOG_KEY      = 'pt_medl_log';
var SETTINGS_TAB_KEY  = 'pt_settings_tab';
var TL_VIEW_KEY       = 'pt_tl_view';
var MH_VIEW_KEY       = 'pt_mh_view';   // Detaljer | Rapport under Mothold
var CASE_SOURCE_KEY   = 'pt_case_source';
// EPO OPS-nøklene. Bare i denne nettleseren: de er bevisst utelatt fra
// makeExportPayload(), så de havner aldri i eksport, backup eller arbeidsfil.
var OPS_KEY_KEY       = 'pt_ops_key';
var OPS_SECRET_KEY    = 'pt_ops_secret';
var AUTOSAVE_KEY = 'pt_autosave';
var SAK_KEY_PREFIX = 'pt_sak_';

// ── Sjekkliste-mal ─────────────────────────────────
var CHECKLIST_KEY = 'pt_checklist_tpl';

var CHECKLIST_DEFAULT = [
  { phase: 'Forberedelse', items: [
    { id: 'formalia-2',     label: 'Formalia 2',                                     type: 'check' },
    { id: 'hent-sant',      label: 'Hent dokumenter fra SANT',                       type: 'check' },
    { id: 'les-soknad',     label: 'Les søknaden (krav, beskrivelse, tegninger)',     type: 'check' },
    { id: 'vesentlige',     label: 'Identifiser vesentlige trekk',                   type: 'check' },
    { id: 'kjent-teknikk',  label: 'Kjent teknikk angitt i beskrivelsen',            type: 'check' },
    { id: 'tidl-rapport',   label: 'Vurder tidligere granskingsrapporter',           type: 'check' },
    { id: 'formelle-mngl',  label: 'Sjekk formelle mangler',                         type: 'check' },
    { id: 'enhet',          label: 'Vurder enhetlighet og unntak',                   type: 'check' },
    { id: 'omfang',         label: 'Avklar omfang og tekniske områder',              type: 'check' }
  ]},
  { phase: 'Gransking', items: [
    { id: 'tolk-krav',      label: 'Tolk kravene med beskrivelse/tegninger',         type: 'check' },
    { id: 'gransk-gjenst',  label: 'Definer granskingsgjenstand',                   type: 'check' },
    { id: 'soketabell',     label: 'Sett opp søketabell',                            type: 'check' },
    { id: 'klasser',        label: 'Finn relevante klasser',                         type: 'check' },
    { id: 'iprrally',       label: 'Søk i IPRrally',                                 type: 'check' },
    { id: 'abs',            label: 'Søker- og oppfinnersøk i AbS',                  type: 'check' },
    { id: 'sant',           label: 'Søker- og oppfinnersøk i SANT',                 type: 'check' },
    { id: 'nordisk',        label: 'Utfør nordisk søk',                              type: 'check' },
    { id: 'ovrige-db',      label: 'Søk i øvrige databaser og evt. internett',       type: 'check' },
    { id: 'revider',        label: 'Revider søkeord og strategi',                    type: 'check' },
    { id: 'finn-treff',     label: 'Finn og vurder relevante treff',                 type: 'check' },
    { id: 'combi',          label: 'Utfør COMBI på treff',                           type: 'check' },
    { id: 'naerliggende',   label: 'Dekk nærliggende områder ved behov',             type: 'check' },
    { id: 'lopende',        label: 'Vurder nyhet og oppfinnelseshøyde løpende',      type: 'check' },
    { id: 'selvst-krav',    label: 'Ta hensyn til selvstendige og uselvstendige krav', type: 'check' },
    { id: 'markers',        label: 'Sett inn markeringer fra søketabell',            type: 'check' },
    { id: 'bestem-d1',      label: 'Bestem D1',                                      type: 'check' }
  ]},
  { phase: 'Rapport', items: [
    { id: 'fyll-rapport',   label: 'Fyll ut granskingsrapport',                      type: 'check' },
    { id: 'velg-dok',       label: 'Velg mest relevante dokumenter',                 type: 'check' },
    { id: 'suppl-dok',      label: 'Ta med supplerende dokumenter ved behov',        type: 'check' },
    { id: 'begrensninger',  label: 'Kommenter begrensninger',                        type: 'check' },
    { id: 'uttalelse-form', label: 'Skriv uttalelse - Formelle feil',                type: 'check' },
    { id: 'uttalelse-nyh',  label: 'Skriv uttalelse - Nyhet',                        type: 'check' },
    { id: 'uttalelse-oh',   label: 'Skriv uttalelse - Oppfinnelseshøyde',            type: 'check' },
    { id: 'utvalg',         label: 'Send utvalgsoppgave',                            type: 'check' },
    { id: 'send-brev',      label: 'Send brev',                                      type: 'check' }
  ]}
];

// Sjekkliste-lagring: se SEKSJON 3
// getChecklistTemplate(), saveChecklistTemplate(), resetChecklistTemplate() er definert i SEKSJON 3

// ── Medlesing-mal (RBS) ────────────────────────────
var MEDLESING_KEY = 'pt_medlesing';

// Delt mellom begge medvirkningstyper, slik at et endret spørsmål her slår ut begge steder
var MEDLESING_FASER_FELLES = [
  { phase: 'Granskingsrapport', items: [
    { id: 'mg-klassifisert',  label: 'Er søknaden klassifisert?' },
    { id: 'mg-relevante',     label: 'Er det gransket i relevante klasser, databaser og evt. i ikke-patent litteratur?' },
    { id: 'mg-hvor-klasser',  label: 'Er klasser angitt?',                                     group: 'Er det korrekt angitt hvor det er gransket?' },
    { id: 'mg-hvor-baser',    label: 'Er elektroniske baser angitt?',                           group: 'Er det korrekt angitt hvor det er gransket?' },
    { id: 'mg-dok-pat',       label: 'Patentlitteratur?',                                       group: 'Er dokumentene i granskingsrapporten riktig angitt?' },
    { id: 'mg-dok-ikkepat',   label: 'Ikke-patentlitteratur?',                                  group: 'Er dokumentene i granskingsrapporten riktig angitt?' },
    { id: 'mg-dok-deler',     label: 'Henvisning til relevante deler?',                         group: 'Er dokumentene i granskingsrapporten riktig angitt?' },
    { id: 'mg-dok-krav',      label: 'Henvisning til relevante krav?',                          group: 'Er dokumentene i granskingsrapporten riktig angitt?' },
    { id: 'mg-tilordnet',     label: 'Er alle krav som er gransket tilordnet et dokument?' },
    { id: 'mg-ikke-gransket', label: 'Dersom noen krav ikke er gransket; er dette angitt?' }
  ]},
  { phase: 'Realitetsuttalelse', items: [
    { id: 'mr-sprak-mal',     label: 'Språkvalg og mal — Riktig mal og språkvalg i rapport (Engelsk/Norsk)' },
    { id: 'mr-konklusjon',    label: 'Konklusjonen — Er det overensstemmelse mellom konklusjonen og resten av uttalelsen?' },
    { id: 'mr-vesentlige',    label: 'Vesentlige mangler av betydning for vurdering av patenterbarhet — Dersom noen krav ikke er gransket: er dette angitt? Hvis ja, er det skrevet en begrunnelse for det?' },
    { id: 'mr-nyhet',         label: 'Nyhet — Er nyhetsvurdering angitt for alle krav.' },
    { id: 'mr-oh-tilnaerm',   label: 'Er oppfinnelseshøyde vurdert ved hjelp av «problem-løsning»-tilnærming?',                                                          group: 'Oppfinnelseshøyde' },
    { id: 'mr-oh-begrunn',    label: 'Er begrunnelsen for vurderingen av oppfinnelseshøyde fullstendig og tilstrekkelig klar til at medleser kan følge saksbehandlerens argumentasjon?', group: 'Oppfinnelseshøyde' },
    { id: 'mr-oh-alle-krav',  label: 'Er oppfinnelseshøyde vurdert for alle krav som tilfredsstiller betingelsen til nyhet?',                                            group: 'Oppfinnelseshøyde' },
    { id: 'mr-end-uenh',      label: 'Er evt. uenhetlighet kommentert?',                                                        group: 'Endringer i krav eller beskrivelse' },
    { id: 'mr-end-pf2021',    label: 'Har saksbehandler henvist til pf §§20 og/eller 21 i tilfeller hvor endringer er foreslått eller sannsynlig?', group: 'Endringer i krav eller beskrivelse' },
    { id: 'mr-palegg',        label: 'Pålegg — Kommer det klart frem hva søker må gjøre for å bringe søknaden nærmere en avgjørelse?' },
    { id: 'mr-samsvar-dok',   label: 'Er det samsvar mellom anførte dokumenter i uttalelsen og det som fremgår av granskingsrapporten?', group: 'Samsvar med granskingsrapport' },
    { id: 'mr-samsvar-arg',   label: 'Er det samsvar mellom argumentasjonen i uttalelsen og de angitte kategorier i rapporten?',         group: 'Samsvar med granskingsrapport' },
    { id: 'mr-sprak',         label: 'Språk — Klart språk, lett å forstå' }
  ]}
];

var MEDLESING_TEMPLATE_NORMAL = MEDLESING_FASER_FELLES;

var MEDLESING_TEMPLATE_MEDIUM_STOR = [
  { phase: 'Innledende sparring', items: [
    { id: 'mi-sparre-konsult', label: 'Dersom patentsøknaden er så ufullstendig at den ikke kan behandles kan sparrer eller patentfaglig konsulteres.' },
    { id: 'mi-vesentlige',     label: 'Vurder om søknaden inneholder vesentlige mangler av betydning for vurdering av patenterbarhet (f.eks. er så kompleks at den ikke kan granskes fullstendig.) Hvis ja, se kapittel 2.1 Vesentlige mangler av betydning for vurdering av patenterbarhet.' },
    { id: 'mi-strategi',      label: 'Forslag til granskingsstrategi drøftes med sparringspartner' },
    { id: 'mi-notat',         label: 'Ved behov lages det et internt notat etter innledende møte i SANT' }
  ]},
  { phase: 'Vesentlige mangler av betydning for vurdering', items: [
    { id: 'mv-delvis-gransk',   label: 'Dersom søknaden er så kompleks at det ikke er mulig å gjøre en fullstendig gransking, bli enige om grunnlaget for delvis gransking basert på konkrete utførelsesformer angitt i beskrivelsen eller en rimelig generalisering av disse.' },
    { id: 'mv-ingen-utforelse', label: 'Dersom søknaden er så kompleks at det ikke er mulig å gjøre en fullstendig gransking, og ingen konkrete utførelsesformer er angitt i beskrivelsen, eller kravene er for generelle, bli enige om innholdet i uttalelsen før gransking.' },
    { id: 'mv-uklar-oppf',      label: 'Dersom oppfinnelsen er så uklart angitt, enten søknaden inneholder krav eller ikke, at det er tvil om hvordan oppfinnelsen skal forstås (patl. § 8 andre ledd første setning) bli enige om hvordan dette uttrykkes i første realitetsuttalelse' },
    { id: 'mv-manglende-stotte', label: 'Dersom kravene mangler helt eller delvis støtte i beskrivelsen (patl. § 8 andre ledd tredje setning) bli enige om hvordan dette uttrykkes i første realitetsuttalelse' }
  ]},
  { phase: 'Granskingsstrategi og resultater', items: [
    { id: 'mst-kun-a',    label: 'Hvis saksbehandler bare finner dokumenter av kategori A skal det sparres på resultat og granskingsstrategi.' },
    { id: 'mst-dok-sparr', label: 'Gjennomført sparring dokumenteres ved å sende en utvalgsavgjørelse fra saksbehandler som så godkjennes av medleser når sparring er gjennomført' }
  ]},
  { phase: 'Drøfting av resultat fra gransking', items: [
    { id: 'md-naermeste',  label: 'Vurdere hvilket dokument som utgjør nærmeste kjente teknikk' },
    { id: 'md-problem',    label: 'Med utgangspunkt i nærmeste kjente teknikk, drøft formulering av det objektive tekniske problem' }
  ]}
].concat(MEDLESING_FASER_FELLES);

function medlesingTemplateFor(type) {
  return type === 'medium_stor' ? MEDLESING_TEMPLATE_MEDIUM_STOR : MEDLESING_TEMPLATE_NORMAL;
}

function medlesingProgress(template, checklist) {
  checklist = checklist || {};
  var total = 0, checked = 0;
  template.forEach(function(phase) {
    phase.items.forEach(function(item) {
      total++;
      if (checklist[item.id] === true) checked++;
    });
  });
  return { checked: checked, total: total, done: total > 0 && checked === total };
}

// Fristene som foreslås i dialogene, i måneder. Kan endres under
// Innstillinger → Frister. firstLetter/laterLetter er søkerens frist etter
// første og senere realitetsbrev; response er egen frist for å behandle svaret.
var DEADLINE_DEFAULTS = { firstLetter: 3, laterLetter: 3, response: 3 };
var DEADLINE_MAX = 24;

// Tar lagrede/importerte frister og returnerer et fullstendig sett. Hver verdi
// valideres for seg — en ugyldig faller tilbake til standarden.
// Ren funksjon — se test/deadlineSettings.test.js.
function normalizeDeadlines(raw) {
  var src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  var out = {};
  Object.keys(DEADLINE_DEFAULTS).forEach(function(k) {
    var v = src[k];
    out[k] = (typeof v === 'number' && isFinite(v) && v >= 1 && v <= DEADLINE_MAX)
      ? Math.floor(v) : DEADLINE_DEFAULTS[k];
  });
  return out;
}

// Beskriver hva en statusovergang krever av dialoger, og hvordan den skal
// bokføres. Dette er den ene fasiten for saksflyten: både sakslista og
// statusknappene på sakssiden kjører overgangene gjennom den, slik at en sak
// ikke kan havne i Fristarkiv med saksbehandlerens egen frist stående som om
// den var søkerens. Returnerer null når det ikke er noen reell overgang.
// Ren funksjon — se test/caseStatus.test.js.
function statusTransition(fromStatus, toStatus, isOppdrag, deadlines) {
  if (!toStatus || fromStatus === toStatus) return null;
  var dl = deadlines || DEADLINE_DEFAULTS;
  function months(n) { return n + (n === 1 ? ' måned' : ' måneder'); }

  var t = {
    needsConfirm:  false,
    needsTags:     false,
    needsDueDate:  false,
    suggestMonths: 0,
    logType:       null,
    confirmDesc:   '',
    dueDateDesc:   ''
  };

  // Oppdrag har ingen saksflyt — de er enten aktive eller utført.
  if (isOppdrag) {
    if (toStatus === 'avsluttet') t.logType = 'oppdrag';
    return t;
  }

  // Avslutning: stikkord, men ingen ny frist — saken skal ikke tilbake.
  if (toStatus === 'avsluttet') {
    t.needsTags = true;
    t.logType   = 'avsluttet';
    return t;
  }

  // Realitetsbrevet sendes ut. Fristen som settes nå er søkerens frist til å
  // svare, ikke vår egen, og må derfor alltid oppgis eksplisitt.
  if (toStatus === 'fristarkiv' && (fromStatus === 'ny' || fromStatus === 'viderebehandling')) {
    var fromNy = fromStatus === 'ny';
    t.needsConfirm  = fromNy;
    t.needsTags     = fromNy;
    t.needsDueDate  = true;
    t.suggestMonths = fromNy ? dl.firstLetter : dl.laterLetter;
    t.logType       = fromNy ? 'ny' : 'videre';
    t.confirmDesc   = 'registreres som nybehandlet og sendes til Fristarkiv';
    t.dueDateDesc   = fromNy
      ? 'Saken markeres som fullført og sendes til Fristarkiv. Foreslått frist er ' + months(dl.firstLetter) + ' fra i dag.'
      : 'Saken sendes tilbake til Fristarkiv. Foreslått frist er ' + months(dl.laterLetter) + ' fra i dag.';
    return t;
  }

  // Søkeren har svart, og svaret skal behandles. Ny frist er vår egen.
  if (toStatus === 'viderebehandling' && fromStatus === 'fristarkiv') {
    t.needsDueDate  = true;
    t.suggestMonths = dl.response;
    t.dueDateDesc   = 'Saken sendes til Viderebehandling. Foreslått frist er ' + months(dl.response) + ' fra i dag.';
    return t;
  }

  // Alt annet er en korreksjon av en feilplassert sak — bakover i flyten, eller
  // et hopp som ikke finnes i den. Slike flyttinger skal verken kreve en ny
  // frist eller blåse opp statistikken.
  return t;
}

// Den framoverrettede handlingen fra en gitt status: det ene trykket som
// bringer saken videre i flyten. Gir «Brev sendt»-knappen etikett og
// mål, slik at knappen er en avledning av statusmodellen og ikke enda en
// hardkodet overgang. null betyr at saken ikke har noe neste steg.
// Ren funksjon — se test/sakLayout.test.js.
function forwardAction(status, isOppdrag) {
  if (status === 'avsluttet') return null;

  // Et oppdrag er enten aktivt eller utført — ingen mellomstasjoner.
  if (isOppdrag) return { label: 'Merk som utført', toStatus: 'avsluttet', choice: null };

  if (status === 'ny') return { label: 'Brev sendt', toStatus: 'fristarkiv', choice: null };
  // Etter behandlet svar: nytt realitetsbrev, godkjenning eller avslag.
  if (status === 'viderebehandling') return { label: 'Avgjør', toStatus: null, choice: 'videre' };
  // Søkeren har svart: «Svar mottatt»-dialogen starter neste runde.
  if (status === 'fristarkiv') return { label: 'Svar mottatt', toStatus: 'viderebehandling', choice: null };
  return null;
}

// ── Forløpsspor: fire faste steg per sak ─────────
// Hver sak vises som fire steg: Formalia → 1. brev → Svar → Avgjørelse. Hvert
// status har sitt eget steg (Ny → 2, Fristarkiv/Viderebehandling → 3,
// Avsluttet → 4); alle svarrunder deler det tredje steget, som bytter etikett
// etter runden. Utfallet lagres på saken som `outcome` ved avslutning.
// Statusknappen i sakshodet: navnet som i menyen og fargetonen for statusen.
// Ren funksjon — se test/sakStatusMenu.test.js.
function sakStatusChip(status, isOppdrag, outcome) {
  var s = status || 'ny';
  if (s === 'avsluttet') {
    var o = (!isOppdrag && outcome && Object.prototype.hasOwnProperty.call(OUTCOMES, outcome)) ? OUTCOMES[outcome].label : '';
    return { label: 'Avsluttet' + (o ? ' · ' + o : ''), tone: 'avsl' };
  }
  if (isOppdrag) return { label: 'Aktiv', tone: 'oppdrag' };
  if (s === 'viderebehandling') return { label: 'Viderebehandling', tone: 'videre' };
  if (s === 'fristarkiv')       return { label: 'Fristarkiv', tone: 'frist' };
  return { label: 'Ny', tone: 'ny' };
}

// Undertittelen i sakshodet er bare tittelen; statusen har egen knapp.
// Ren funksjon — se test/sakStatusMenu.test.js.
function sakSubtitle(cas) {
  return (cas && cas.title) || '';
}

// Hint nederst i statusmenyen: det vanlige steget er hovedknappen.
// Ren funksjon — se test/sakStatusMenu.test.js.
function statusMenuHint(status, isOppdrag) {
  var a = forwardAction(status || 'ny', isOppdrag);
  return a ? 'Vanligste steg er knappen til høyre: «' + a.label.replace(/\s*…$/, '') + '».' : '';
}

var OUTCOMES = {
  meddelt: { label: 'Meddelt', state: 'granted' },
  avslatt: { label: 'Avslått', state: 'refused' },
  henlagt: { label: 'Henlagt', state: 'closed' }
};

// Antall realitetsbrev som er sendt: hver overgang inn i Fristarkiv fra Ny
// eller Viderebehandling. En korreksjon tilbake fra Fristarkiv til Ny trekker
// brevet fra igjen, så en feilplassert sak ikke teller dobbelt.
// Ren funksjon — se test/caseTrack.test.js.
function lettersSent(history) {
  if (!Array.isArray(history)) return 0;
  var n = 0;
  history.forEach(function(h) {
    if (!h || h.type !== 'status') return;
    if (h.to === 'fristarkiv' && (h.from === 'ny' || h.from === 'viderebehandling')) n++;
    else if (h.from === 'fristarkiv' && h.to === 'ny' && n > 0) n--;
  });
  return n;
}

// ── Senere runder ──────────────────────────────────
// Brevet og svaret som hører til runden saken er i nå. letter er datoen siste
// realitetsbrev gikk ut; received/changes er fra «Svar mottatt» (eldre data
// uten dem faller tilbake til datoen for overgangen). Ren funksjon — se
// test/laterRounds.test.js.
function responseRoundInfo(c) {
  var hist = (c && Array.isArray(c.history)) ? c.history : [];
  var info = { round: examinationRound(c), letter: null, received: null, changes: null };
  var letterIdx = -1;
  hist.forEach(function(h, i) {
    if (h && h.type === 'status' && h.to === 'fristarkiv' && (h.from === 'ny' || h.from === 'viderebehandling')) letterIdx = i;
  });
  if (letterIdx === -1) return info;
  info.letter = String(hist[letterIdx].date || '').slice(0, 10) || null;
  for (var i = letterIdx + 1; i < hist.length; i++) {
    var h = hist[i];
    if (h && h.type === 'status' && h.from === 'fristarkiv' && h.to === 'viderebehandling') {
      // Lagret/importert data kan ha hva som helst i received — bare en
      // gyldig ISO-dato brukes, ellers datoen for overgangen.
      // Strengt ISO-format kreves: isValidDate godtar også punktum-datoer.
      var rec = (typeof h.received === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(h.received) &&
                 isValidDate(h.received)) ? h.received : null;
      info.received = rec || String(h.date || '').slice(0, 10) || null;
      info.changes  = Array.isArray(h.changes) ? h.changes.slice() : null;
    }
  }
  return info;
}

// Hva søkeren sendte inn, som tekst i rundelinjen. Tom streng = ukjent.
function responseChangesLabel(changes) {
  if (!Array.isArray(changes)) return '';
  var claims = changes.indexOf('claims') !== -1, descr = changes.indexOf('description') !== -1;
  if (claims && descr) return 'endrede krav og beskrivelse';
  if (claims) return 'endrede krav';
  if (descr)  return 'endret beskrivelse';
  return 'kun argumenter';
}

// Linjen under tittelen på sakssiden. Tom for Ny, avsluttede saker og oppdrag.
function sakRoundLine(c) {
  if (!c || c.type === 'oppdrag') return '';
  var status = c.status || 'ny';
  if (status !== 'fristarkiv' && status !== 'viderebehandling') return '';
  var info = responseRoundInfo(c);
  var parts = ['Runde ' + info.round];
  if (status === 'fristarkiv') {
    if (info.letter) parts.push('brev sendt ' + toDisplay(info.letter));
    parts.push('venter på svar');
  } else {
    if (info.letter) parts.push('brev ' + toDisplay(info.letter));
    if (info.received) {
      var what = responseChangesLabel(info.changes);
      parts.push('svar ' + toDisplay(info.received) + (what ? ' (' + what + ')' : ''));
    }
  }
  return parts.join(' · ');
}

// «Svar mottatt»-tillegget til historikken, renset: received bare som gyldig
// ISO-dato, changes bare 'claims'/'description'. Andre nøkler tas ikke med.
function sanitizeResponseExtra(extra) {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return null;
  var r = extra.received;
  return {
    received: (typeof r === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r) && isValidDate(r)) ? r : undefined,
    changes: Array.isArray(extra.changes) ? extra.changes.filter(function(x) {
      return x === 'claims' || x === 'description';
    }) : undefined
  };
}

// ── Rundeøyeblikksbilder (schema 8) ────────────────
// Vurderingen slik den var da et realitetsbrev gikk ut, lagret i
// saksdetaljene (pt_sak_{id}.rounds) — aldri i pt_cases, så belegg og frister
// er uberørt. En runde: { n, letter: { date, deadline }, response: { date,
// changes } | null, claims: [normalizeClaim], docIds: ['D1', …], backfilled? }.
// Alle funksjonene her er rene og muterer ikke input — se test/rounds.test.js.
function roundIsoDate(v) {
  return (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && isValidDate(v)) ? v : null;
}
function isRoundDocId(v) {
  return typeof v === 'string' && /^D\d+$/.test(v);
}
function roundTriState(v) {
  return v === true || v === false ? v : null;
}

// Hvitlistet kopi av ett krav. Ukjente nøkler (også __proto__) tas ikke med,
// og krav uten nyhet låses til ingen oppfinnelseshøyde.
function normalizeClaim(raw, i) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  var num = (typeof raw.num === 'number' && Number.isInteger(raw.num) && raw.num >= 1) ? raw.num : (i + 1);
  var novelty = roundTriState(raw.novelty);
  var inventive = novelty === false ? false : roundTriState(raw.inventive);
  var dep = (typeof raw.dep === 'number' && Number.isInteger(raw.dep) && raw.dep >= 1 && raw.dep < num) ? raw.dep : null;
  var out = {
    num: num, novelty: novelty, inventive: inventive, formal: roundTriState(raw.formal),
    independent: raw.independent === true, dep: dep, depManual: raw.depManual === true,
    label: typeof raw.label === 'string' ? raw.label : '',
    noveltyDoc: isRoundDocId(raw.noveltyDoc) ? raw.noveltyDoc : null,
    inventiveDocs: Array.isArray(raw.inventiveDocs) ? raw.inventiveDocs.filter(isRoundDocId) : []
  };
  // Kravkoblingen tas bare med når den er gyldig, så krav uten kobling har
  // nøyaktig samme form som før.
  var mapping = normalizeClaimMapping(raw.mapping);
  if (mapping) out.mapping = mapping;
  return out;
}

