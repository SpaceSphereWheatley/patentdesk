// ════════════════════════════════════════════════════════════════════════════
// SEKSJON 2 · DOMENEFUNKSJONER
// Rene funksjoner uten sideeffekter — ingen DOM, ingen localStorage
// Dato, frist, kravregler, statistikkberegning, eksport/import-formatering
// ════════════════════════════════════════════════════════════════════════════

// ── Hjelpefunksjoner ───────────────────────────────
function daysUntil(dateStr) {
  var today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((new Date(dateStr + 'T00:00:00') - today) / 86400000);
}

// Beregner påskedag via Meeus/Jones/Butcher-algoritmen.
// Variabelnavnene (a–m) er algoritmens egne — se https://en.wikipedia.org/wiki/Date_of_Easter#Anonymous_Gregorian_algorithm
function easterSunday(year) {
  var a = year % 19, b = Math.floor(year / 100), c = year % 100;
  var d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  var g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  var i = Math.floor(c / 4), k = c % 4;
  var l = (32 + 2 * e + 2 * i - h - k) % 7;
  var m = Math.floor((a + 11 * h + 22 * l) / 451);
  var month = Math.floor((h + l - 7 * m + 114) / 31);
  var day   = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

var _holidayCache = {};
// Returns [{date:'YYYY-MM-DD', name:'...'}] for offentlige fridager og fri-aftener.
function getNorwegianHolidays(year) {
  if (_holidayCache[year]) return _holidayCache[year];
  var e = easterSunday(year);
  function addDays(d, n) { var r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function fmt(d) { return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
  var days = [
    {date: fmt(new Date(year,0,1)),   name: 'Nyttårsdag'},
    {date: fmt(addDays(e,-3)),        name: 'Skjærtorsdag'},
    {date: fmt(addDays(e,-2)),        name: 'Langfredag'},
    {date: fmt(e),                    name: '1. påskedag'},
    {date: fmt(addDays(e,1)),         name: '2. påskedag'},
    {date: fmt(new Date(year,4,1)),   name: 'Arbeidernes dag'},
    {date: fmt(new Date(year,4,17)),  name: 'Grunnlovsdagen'},
    {date: fmt(addDays(e,39)),        name: 'Kristi himmelfartsdag'},
    {date: fmt(addDays(e,49)),        name: '1. pinsedag'},
    {date: fmt(addDays(e,50)),        name: '2. pinsedag'},
    {date: fmt(new Date(year,11,24)), name: 'Julaften'},
    {date: fmt(new Date(year,11,25)), name: '1. juledag'},
    {date: fmt(new Date(year,11,26)), name: '2. juledag'},
    {date: fmt(new Date(year,11,31)), name: 'Nyttårsaften'}
  ];
  _holidayCache[year] = days;
  return days;
}

// holidayYearOffsets: hvilke år (relativt til inneværende år, 0) man må
// hente helligdager for, gitt hvor mange dager tilbake (pastDays) og frem
// (horizonDays) tidslinjen strekker seg. Går tilbake til -1 (i fjor) så
// snart pastDays strekker seg over årsskiftet — ellers mangler helligdager
// fra desember/november i tidslinjens fortidsvindu.
function holidayYearOffsets(pastDays, horizonDays) {
  var from = 0 - Math.ceil(pastDays / 365); // 0 - x (not -x) to avoid a -0 result when pastDays is 0
  var to   = Math.ceil(horizonDays / 365);
  var offsets = [];
  for (var yi = from; yi <= to; yi++) offsets.push(yi);
  return offsets;
}

function isNonWorkday(date) {
  var dow = date.getDay();
  if (dow === 0 || dow === 6) return true;
  var dateStr = date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0');
  if (getNorwegianHolidays(date.getFullYear()).some(function(h) { return h.date === dateStr; })) return true;
  if (vacations && vacations.some(function(v) { return dateStr >= v.from && dateStr <= v.to; })) return true;
  return false;
}

// Finner neste fridag (offentlig fridag eller ferie) fra og med i dag.
// Returnerer {days, label, date} eller null hvis ingen funnet innen 2 år.
function getNextHoliday() {
  var today = new Date(); today.setHours(0,0,0,0);
  function fmt(d) { return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
  for (var i = 0; i <= 730; i++) {
    var d = new Date(today); d.setDate(d.getDate() + i);
    if (d.getDay() === 0 || d.getDay() === 6) continue; // vanlige helger teller ikke
    var dateStr = fmt(d);
    var holiday = getNorwegianHolidays(d.getFullYear()).find(function(h) { return h.date === dateStr; });
    if (holiday) return { days: i, label: holiday.name, date: dateStr };
    var vac = vacations.find(function(v) { return dateStr >= v.from && dateStr <= v.to; });
    if (vac) return { days: i, label: vac.label || 'Ferie', date: dateStr };
  }
  return null;
}

function workDaysUntil(dateStr) {
  var today = new Date(); today.setHours(0,0,0,0);
  var target = new Date(dateStr + 'T00:00:00');
  if (target <= today) return 0;
  var count = 0;
  var cur = new Date(today);
  cur.setDate(cur.getDate() + 1);
  while (cur <= target) {
    if (!isNonWorkday(cur)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function formatDate(dateStr) {
  var d = new Date(dateStr + 'T00:00:00');
  return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
}

// Inclusive antall dager mellom to YYYY-MM-DD-datoer (f.eks. 1.–3. = 3 dager).
function vacationDurationDays(from, to) {
  return Math.round((new Date(to + 'T00:00:00') - new Date(from + 'T00:00:00')) / 86400000) + 1;
}

function formatDateTime(isoStr) {
  var d = new Date(isoStr);
  return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
}

function monthKey(isoStr) {
  var d = new Date(isoStr);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Notatet («Notater», synlig i oversikten) på én linje: linjeskift og ekstra
// mellomrom slås sammen. Ren funksjon — se test/caseNote.test.js.
function caseNotePreview(notes) {
  return String(notes || '').replace(/\s+/g, ' ').trim();
}

// Notatlinjen under tittelen i sakslistene og fristlista. Teksten kuttes med
// «…» i CSS; hele notatet, med linjeskift, står i verktøytipset. Saker uten
// notat får ingen linje. Ren funksjon — se test/caseNote.test.js.
function caseNoteHtml(c) {
  var preview = caseNotePreview(c && c.notes);
  if (!preview) return '';
  return '<span class="case-note" title="' + esc(String(c.notes).trim()) + '">' +
    '<svg class="ti" aria-hidden="true"><use href="#ti-file-text"/></svg>' +
    '<span class="case-note-text">' + esc(preview) + '</span></span>';
}

// Escaper tekst og markerer søketreffet med <mark> — trygg mot HTML i lagrede stikkord
function highlightMatch(text, term) {
  text = String(text || ''); term = String(term || '');
  var i = term ? text.toLowerCase().indexOf(term.toLowerCase()) : -1;
  if (i === -1) return esc(text);
  return esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + term.length)) + '</mark>' + esc(text.slice(i + term.length));
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function parseDate(str)      { return str ? str.replace(/\./g, '-') : ''; }
function toDisplay(dateStr)  { return dateStr ? dateStr.replace(/-/g, '.') : ''; }
function normaliseTags(str)  { return (str || '').split(',').map(function(t){ return t.trim(); }).filter(Boolean).join(', '); }
function sanitizeText(str)   { return (str || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); }

// Datoen må finnes: new Date('2026-02-31') ruller over til 3. mars i stedet
// for å feile, så dag og måned sjekkes mot det Date faktisk ga.
function isValidDate(str) {
  var norm = parseDate(str);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(norm)) return false;
  var d = new Date(norm + 'T00:00:00');
  if (isNaN(d.getTime())) return false;
  return d.getFullYear() === +norm.slice(0, 4) && d.getMonth() + 1 === +norm.slice(5, 7) && d.getDate() === +norm.slice(8, 10);
}

// filingDateFromInput: innleveringsdato fra modalfeltet. Tomt felt fjerner
// datoen (''), en gyldig dato gis i ISO-form, og en ugyldig gir null.
function filingDateFromInput(raw) {
  var t = (raw || '').trim();
  if (!t) return '';
  return isValidDate(t) ? parseDate(t) : null;
}

function monthsFromToday(n) { return addMonthsClamped(new Date(), n); }

// Samme dag n måneder senere, som YYYY-MM-DD. Finnes ikke dagen i den
// måneden, blir det månedens siste dag: 31. august + 6 mnd = 28. februar, ikke
// 3. mars. Ren funksjon — se test/logicFixes.test.js.
function addMonthsClamped(date, n) {
  var y = date.getFullYear(), m = date.getMonth() + n;
  var last = new Date(y, m + 1, 0).getDate();
  return isoLocalDate(new Date(y, m, Math.min(date.getDate(), last)));
}

function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// dayRolloverDue: om siden skal tegnes på nytt fordi datoen har skiftet siden
// den sist ble tegnet. Appen står gjerne åpen over natten, og da ville «i
// dag»-linjen, forfalt-markeringen og belegget ellers ligget en dag etter.
// Venter mens brukeren holder på med noe (busy), så ingenting som skrives inn
// går tapt — det sjekkes igjen litt senere.
// Ren funksjon — se test/dayRollover.test.js.
function dayRolloverDue(renderedDay, today, busy) {
  if (!renderedDay || renderedDay === today) return false;
  return !busy;
}

function encodeCase(c) {
  var cfg = STATUS_CONFIG[c.status];
  return Object.assign({}, c, { status: cfg !== undefined ? cfg.int : c.status });
}

function decodeCase(c) {
  var s = typeof c.status === 'number' ? (INT_TO_STATUS[c.status] || 'ny') : (c.status || 'ny');
  return Object.assign({}, c, { status: s });
}

function _stripClassDesc(sakData) {
  if (!sakData || !Array.isArray(sakData.classes)) return sakData;
  var out = Object.assign({}, sakData);
  out.classes = sakData.classes.map(function(cls) {
    return { code: cls.code, inUse: cls.inUse };
  });
  return out;
}

function makeExportPayload() {
  // Samle alle pt_sak_*-nøkler
  var sakDetails = {};
  cases.forEach(function(c) {
    var sd = loadSakData(c.id);
    if (sd) { try { sakDetails[c.id] = _stripClassDesc(sd); } catch(e) {} }
  });
  return {
    version: 2, exported: new Date().toISOString(),
    statusMap: { '0':'ny','1':'viderebehandling','2':'fristarkiv','3':'avsluttet' },
    cases:      cases.map(encodeCase),
    stats:      stats,
    sakDetails: sakDetails,
    vacations:  vacations,
    goal:       productionGoal,
    beleggHorizon: beleggHorizon,
    docRoot:    loadDocRoot() || null,
    userName:   loadUserName() || null,
    caseSource: loadCaseSource().url ? loadCaseSource() : null,
    // Bare en egendefinert mal eksporteres; null = standardmalen, så den
    // fortsatt følger med når standardmalen endres i en ny versjon
    checklistTemplate: _customChecklistTemplate(),
    typeBuffers: typeBuffers,
    workWindows: workWindows,
    workWindowUnit: 'workdays',
    deadlines:  deadlines,
    homeDeadlineFilter: homeDeadlineFilter,
    docLayout:  docLayout,
    activeCase: activeCase,
    unassignedReminder: unassignedReminder,
    medlesing:  medlesing,
    medlesere:  medleserList,
    medlLog:    medlLog
  };
}

function isValidChecklistTemplate(tpl) {
  return Array.isArray(tpl) && tpl.length > 0 && tpl.every(function(p) {
    return p && typeof p.phase === 'string' && Array.isArray(p.items) && p.items.every(function(i) {
      return i && typeof i.id === 'string' && typeof i.label === 'string';
    });
  });
}

function _customChecklistTemplate() {
  try {
    var tpl = JSON.parse(localStorage.getItem(CHECKLIST_KEY));
    return isValidChecklistTemplate(tpl) ? tpl : null;
  } catch(e) { return null; }
}

// Navn, sjekkliste-mal, fristbuffer, medlesinger, fristfilteret på Oversikt,
// pågående sak og medleserlista med utsendingsloggen fra en eksportfil, validert.
// Bare felt som finnes og er gyldige tas med, så eldre filer uten feltene ikke
// endrer noe. checklistTemplate: null betyr «bruk standardmalen»;
// activeCase: null betyr «ingen sak markert». Påminnelsen for saker som ikke
// er fordelt, tas bare med når verdien er gyldig.
function readImportSettings(d) {
  var out = {};
  if (typeof d.userName === 'string') out.userName = d.userName.trim();
  if (d.checklistTemplate === null) out.checklistTemplate = null;
  else if (isValidChecklistTemplate(d.checklistTemplate)) out.checklistTemplate = d.checklistTemplate;
  // Eldre eksportfiler har bare én global fristbuffer; den fyller begge typene.
  var legacyBuf = (typeof d.fristBuffer === 'number' && isFinite(d.fristBuffer) && d.fristBuffer >= 0) ? d.fristBuffer : undefined;
  if ((d.typeBuffers && typeof d.typeBuffers === 'object' && !Array.isArray(d.typeBuffers)) || legacyBuf !== undefined) {
    out.typeBuffers = normalizeTypeBuffers(d.typeBuffers, legacyBuf);
  }
  if (d.workWindows && typeof d.workWindows === 'object' && !Array.isArray(d.workWindows)) {
    // Eksport fra før v4.42.0 har varigheter i kalenderdager
    out.workWindows = normalizeWorkWindows(d.workWindowUnit === 'workdays' ? d.workWindows : migrateWorkWindowsToWorkdays(d.workWindows));
  }
  if (d.deadlines && typeof d.deadlines === 'object' && !Array.isArray(d.deadlines)) {
    out.deadlines = normalizeDeadlines(d.deadlines);
  }
  if (Array.isArray(d.medlesing)) {
    out.medlesing = d.medlesing.filter(function(m) {
      return m && typeof m === 'object' && typeof m.id === 'string' && m.id !== '';
    });
  }
  if (d.homeDeadlineFilter && typeof d.homeDeadlineFilter === 'object') {
    out.homeDeadlineFilter = normalizeHomeDeadlineFilter(d.homeDeadlineFilter);
  }
  if (d.docLayout && typeof d.docLayout === 'object' && !Array.isArray(d.docLayout)) {
    out.docLayout = normalizeDocLayout(d.docLayout);
  }
  if (d.activeCase === null) out.activeCase = null;
  else if (d.activeCase !== undefined && normalizeActiveCase(d.activeCase)) out.activeCase = normalizeActiveCase(d.activeCase);
  if (typeof d.unassignedReminder === 'number' && normalizeUnassignedReminder(d.unassignedReminder) === Math.floor(d.unassignedReminder)) {
    out.unassignedReminder = normalizeUnassignedReminder(d.unassignedReminder);
  }
  // Belegg-horisonten har bare tre gyldige valg; målet er et helt tall ≥ 0.
  if ([30, 60, 90].indexOf(d.beleggHorizon) !== -1) out.beleggHorizon = d.beleggHorizon;
  if (typeof d.goal === 'number' && isFinite(d.goal) && d.goal >= 0 && Math.floor(d.goal) === d.goal) out.goal = d.goal;
  if (Array.isArray(d.medlesere)) out.medlesere = normalizeMedleserList(d.medlesere);
  if (Array.isArray(d.medlLog))   out.medlLog   = normalizeMedlLog(d.medlLog);
  // null = ingen lenke satt
  if (d.caseSource === null || (d.caseSource && typeof d.caseSource === 'object')) out.caseSource = normalizeCaseSource(d.caseSource);
  return out;
}

// ── Pågående sak ───────────────────────────────────
// En markering for å huske hvilken sak du holder på med. Den er ikke en
// status og påvirker verken belegg eller frister. Maks én sak om gangen, så
// den lagres som én innstilling ({ id, since }) og ikke som et felt på sakene.
// Bare egen arbeid kan markeres: Ny, Viderebehandling og aktive oppdrag. I
// Fristarkiv er brevet sendt og fristen søkerens, og en sak som ikke er
// fordelt ennå er ikke din.
// Rene funksjoner — se test/activeCase.test.js.
function canBeActiveCase(c) {
  if (!c || c.status === 'avsluttet') return false;
  if (isUnassigned(c)) return false;
  if (c.type === 'oppdrag') return true;
  return c.status === 'ny' || c.status === 'viderebehandling';
}

function normalizeActiveCase(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof raw.id !== 'string' || raw.id === '') return null;
  return { id: raw.id, since: typeof raw.since === 'string' ? raw.since : null };
}

// Samme sak igjen fjerner markeringen; en annen sak flytter den.
function toggleActiveCase(mark, id, nowIso) {
  if (mark && mark.id === id) return null;
  return { id: id, since: nowIso };
}

// Markeringen etter angre. Handlingen som angres kan ha fjernet den (sendt
// til Fristarkiv, avsluttet, slettet), og da kommer den tilbake. Har du
// markert en annen sak i mellomtiden, er det det nyeste valget som gjelder.
function activeCaseAfterUndo(snapshot, current) {
  if (current) return current;
  return (snapshot && snapshot.activeCase) || null;
}

// «Angre» for slettet sitering / færre krav gjenoppretter hele docs/claims.
// Endres sakens krav eller siteringer etterpå, må øyeblikksbildet forkastes,
// ellers ville «Angre» overskrive de senere endringene.
function undoInvalidatedBy(snapshot, actionType, payload) {
  if (!snapshot || (snapshot.mode !== 'docs' && snapshot.mode !== 'claims')) return false;
  if (!payload || payload.id !== snapshot.caseId) return false;
  return ['CLAIM_TOGGLE', 'CLAIM_SET', 'CLAIM_DOC_TOGGLE', 'CLAIM_DEP_CHANGE',
    'CLAIM_LABEL_CHANGE', 'CLAIM_NOTE_CHANGE',
    'DOC_ADD', 'DOC_REMOVE', 'DOC_RESTORE', 'DOC_FIELD_CHANGE',
    'SAK_CLAIM_COUNT_CHANGE', 'CLAIM_MAPPING_CHANGE'].indexOf(actionType) !== -1;
}

// «Angre» for en endring på én sak: verdiene feltene i patch hadde før.
// extra er resten av øyeblikksbildet (pågående sak, medlesingsloggen).
function undoPatchSnapshot(c, patch, extra) {
  var before = {};
  Object.keys(patch).forEach(function(k) { before[k] = Object.prototype.hasOwnProperty.call(c, k) ? c[k] : undefined; });
  return Object.assign({ mode: 'patch', caseId: c.id, before: before, logIds: [], label: c.caseNumber }, extra);
}

// Sakslista etter «Angre». Bare saken handlingen gjaldt røres: en endring
// får tilbake feltene den overskrev, en slettet sak settes inn igjen der den
// sto. Andre saker, og andre felt på samme sak, endret mens varselet sto
// framme, blir stående. Samme array tilbake når det ikke er noe å angre.
// Ren funksjon — se test/logicFixes.test.js.
function casesAfterUndo(current, snap) {
  if (snap.mode !== 'patch' && snap.mode !== 'reinsert') return current; // f.eks. krav: ikke i sakslista
  var idx = current.findIndex(function(c) { return c.id === snap.caseId; });
  if (snap.mode === 'reinsert') {
    if (idx !== -1) return current;
    var out = current.slice();
    out.splice(Math.min(snap.index, out.length), 0, snap.before);
    return out;
  }
  if (idx === -1) return current;
  return current.map(function(c) {
    if (c.id !== snap.caseId) return c;
    var next = Object.assign({}, c);
    Object.keys(snap.before).forEach(function(k) {
      if (snap.before[k] === undefined) delete next[k]; else next[k] = snap.before[k];
    });
    return next;
  });
}

// Hendelsesloggen etter «Angre»: bare hendelsene handlingen skrev fjernes.
// Ren funksjon — se test/logicFixes.test.js.
function statsLogAfterUndo(log, logIds) {
  var ids = logIds || [];
  return (log || []).filter(function(e) { return ids.indexOf(e.id) === -1; });
}

// Saken markeringen peker på — eller null når den er slettet eller ikke
// lenger kan markeres (sendt til Fristarkiv, avsluttet).
function resolveActiveCase(mark, cases) {
  if (!mark) return null;
  var c = cases.find(function(x) { return x.id === mark.id; });
  return canBeActiveCase(c) ? c : null;
}

// ── Ikke fordelt ───────────────────────────────────
// En sak du har meldt deg på, men ikke fått fordelt ennå. Den er et felt på
// saken ({ unassigned, unassignedSince }), ikke en status: saken er en vanlig
// Ny søknad med frist, og det eneste som er usikkert er om den blir din.
// Til den er bekreftet teller den ikke i belegg, forfalt-tallet eller
// sakstellingene, og den vises grå i lister og tidslinjer.
// Bare Ny søknader kan vente på fordeling. Et flagg som står igjen etter et
// statusbytte, ignoreres — da er saken din.
// Rene funksjoner — se test/unassigned.test.js.
var UNASSIGNED_REMINDER_DEFAULT = 14;
var UNASSIGNED_REMINDER_MAX = 365;
// Nye saker legges inn som ikke fordelt med mindre du fjerner haken —
// gjelder både én sak og «Flere saker». Redigering beholder sakens verdi.
var UNASSIGNED_NEW_DEFAULT = true;

function canBeUnassigned(c) {
  return !!c && c.type !== 'oppdrag' && (c.status || 'ny') === 'ny';
}

function isUnassigned(c) {
  return canBeUnassigned(c) && c.unassigned === true;
}

// Feltene som settes når saken markeres eller bekreftes. Tidspunktet for
// markeringen beholdes når en sak som allerede venter, lagres på nytt.
function unassignedPatch(c, on, nowIso) {
  if (!on || !canBeUnassigned(c)) return { unassigned: false, unassignedSince: null };
  return { unassigned: true, unassignedSince: isUnassigned(c) && c.unassignedSince ? c.unassignedSince : nowIso };
}

// Påminnelsen: antall dager før en sak som venter, merkes. 0 = av.
function normalizeUnassignedReminder(v) {
  return (typeof v === 'number' && isFinite(v) && v >= 0 && v <= UNASSIGNED_REMINDER_MAX)
    ? Math.floor(v) : UNASSIGNED_REMINDER_DEFAULT;
}

// Kalenderdager siden saken ble markert. Saker uten tidspunkt måles fra
// opprettelsen; mangler begge, er ventetiden ukjent (null). Et tidspunkt
// regnes om til lokal dato, så en sak markert like over midnatt får riktig dag.
function unassignedWaitDays(c, todayIso) {
  var since = (c && (c.unassignedSince || c.createdAt)) || '';
  if (typeof since !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(since)) return null;
  if (since.indexOf('T') > -1 && !isNaN(new Date(since))) {
    var d = new Date(since);
    since = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function utc(iso) { return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)); }
  return Math.round((utc(todayIso) - utc(since)) / 86400000);
}

function isUnassignedStale(c, reminderDays, todayIso) {
  if (!reminderDays || !isUnassigned(c)) return false;
  var d = unassignedWaitDays(c, todayIso);
  return d !== null && d >= reminderDays;
}

// Saker som ville kommet i tillegg i belegget om du får dem.
function countsAsPotentialBelegg(c) {
  return !!c && !!c.dueDate && isUnassigned(c);
}

// ── Hos medleser ───────────────────────────────────
// Din egen sak er sendt til en kollega for medlesing. Ikke en status: belegg
// og frist er uendret, saken er fortsatt ditt arbeid. Hver utsending lagres i
// en egen logg ({ id, caseId, caseNumber, reader, sent, returned }), så
// statistikken over hvem som har lest overlever at saken slettes. Åpen
// utsending = returned er null. (Fanen «Medlesing» er det motsatte: saker
// du selv leser for andre.)
// Rene funksjoner — se test/hosMedleser.test.js.
function canSendToMedleser(c) {
  // En sak som ikke er fordelt ennå, er ikke din å sende.
  if (!c || c.type === 'oppdrag' || isUnassigned(c)) return false;
  return c.status === 'ny' || c.status === 'viderebehandling';
}

function _medlKey(name) { return String(name || '').trim().toLowerCase(); }

function normalizeMedleserList(raw) {
  if (!Array.isArray(raw)) return [];
  var seen = {};
  return raw.reduce(function(out, m) {
    var name = m && typeof m.name === 'string' ? m.name.trim() : '';
    if (!name || seen[_medlKey(name)]) return out;
    seen[_medlKey(name)] = true;
    out.push({ name: name, active: m.active !== false });
    return out;
  }, []);
}

function addMedleser(list, name) {
  var n = String(name || '').trim();
  if (!n || list.some(function(m) { return _medlKey(m.name) === _medlKey(n); })) return list;
  return list.concat([{ name: n, active: true }]);
}

function normalizeMedlLog(raw) {
  if (!Array.isArray(raw)) return [];
  var iso = /^\d{4}-\d{2}-\d{2}$/;
  return raw.filter(function(x) {
    return x && typeof x === 'object' && typeof x.id === 'string' && x.id !== '' &&
      typeof x.reader === 'string' && x.reader.trim() !== '' &&
      typeof x.sent === 'string' && iso.test(x.sent);
  }).map(function(x) {
    return {
      id: x.id, caseId: typeof x.caseId === 'string' ? x.caseId : '',
      caseNumber: typeof x.caseNumber === 'string' ? x.caseNumber : '',
      reader: x.reader.trim(), sent: x.sent,
      returned: typeof x.returned === 'string' && iso.test(x.returned) ? x.returned : null
    };
  });
}

// Åpne utsendinger, eldst først (den som har ventet lengst står øverst), så
// saksnummer. Lager en ny liste; loggen røres ikke. Brukt av Medlesing-siden.
function openMedlEntries(log) {
  return (Array.isArray(log) ? log : []).filter(function(x) { return !x.returned; }).sort(function(a, b) {
    return a.sent < b.sent ? -1 : a.sent > b.sent ? 1 : String(a.caseNumber).localeCompare(String(b.caseNumber));
  });
}

// Hele historikken for Medlesing-siden: åpne utsendinger først (den som har
// ligget lengst øverst), så de som er kommet tilbake, nyeste først. days er
// tid hos medleser: sendt til tilbake, eller sendt til i dag for en åpen.
// Rene funksjoner — se test/medlesingBothWays.test.js.
function medlHistoryRows(log, today) {
  return (Array.isArray(log) ? log : []).map(function(x) {
    var open = !x.returned;
    var d = daysBetweenIso(x.sent, open ? today : x.returned);
    // Ugyldig dato gir null (vises som «—»); en dato frem i tid gir 0, ikke negativt.
    return Object.assign({}, x, { open: open, days: isFinite(d) ? Math.max(0, d) : null });
  }).sort(function(a, b) {
    if (a.open !== b.open) return a.open ? -1 : 1;
    if (a.open) return a.sent < b.sent ? -1 : a.sent > b.sent ? 1 : String(a.caseNumber).localeCompare(String(b.caseNumber));
    if (a.returned !== b.returned) return a.returned < b.returned ? 1 : -1;
    return a.sent < b.sent ? 1 : a.sent > b.sent ? -1 : 0;
  });
}

// Tallet ved «Medlesing» i menyen: alt som er åpent i begge retninger —
// lesinger du selv gjør for andre og dine saker som ligger ute hos en medleser.
function medlNavCount(readings, log) {
  var reading = (Array.isArray(readings) ? readings : []).filter(function(m) { return !m.completed; }).length;
  return reading + openMedlEntries(log).length;
}

function openMedlFor(log, caseId) {
  return log.find(function(x) { return x.caseId === caseId && !x.returned; }) || null;
}

// Er saken allerede ute, rettes den åpne utsendingen («Endre medlesing»).
function sendToMedleser(log, c, reader, sent, newId) {
  var open = openMedlFor(log, c.id);
  if (open) {
    return log.map(function(x) { return x === open ? Object.assign({}, x, { reader: reader, sent: sent }) : x; });
  }
  return log.concat([{ id: newId, caseId: c.id, caseNumber: c.caseNumber, reader: reader, sent: sent, returned: null }]);
}

function returnFromMedleser(log, caseId, date) {
  return log.map(function(x) {
    return x.caseId === caseId && !x.returned ? Object.assign({}, x, { returned: date }) : x;
  });
}

// Medlesingen saken vises med i «Rediger sak» og på sakssiden: den siste.
function caseMedlFor(log, caseId) {
  return log.reduce(function(best, x) {
    return x.caseId === caseId && (!best || x.sent >= best.sent) ? x : best;
  }, null);
}

// «Rediger sak»: fører inn, retter eller fjerner sakens medlesing i ettertid,
// uansett status. Én per sak: tomt navn fjerner sakens utsendinger. Finnes en,
// rettes den siste (en åpen forblir åpen); ellers legges en lukket til, for
// saken er allerede lest. Samme array tilbake når ingenting endres.
// Rene funksjoner — se test/caseMedlesing.test.js.
function setCaseMedlesing(log, c, reader, date, newId) {
  var r = String(reader || '').trim();
  if (!r) {
    var kept = log.filter(function(x) { return x.caseId !== c.id; });
    return kept.length === log.length ? log : kept;
  }
  var cur = caseMedlFor(log, c.id);
  if (!cur) return log.concat([{ id: newId, caseId: c.id, caseNumber: c.caseNumber, reader: r, sent: date, returned: date }]);
  if (cur.reader === r && cur.sent === date) return log;
  var returned = cur.returned && cur.returned < date ? date : cur.returned;
  return log.map(function(x) { return x === cur ? Object.assign({}, x, { reader: r, sent: date, returned: returned }) : x; });
}

// Valgene i «Rediger sak»: aktive først, så inaktive. Den som står på saken
// tas med selv om vedkommende er fjernet fra lista.
function medlReaderChoices(list, current) {
  var out = list.filter(function(m) { return m.active; }).concat(list.filter(function(m) { return !m.active; }))
    .map(function(m) { return { name: m.name, active: m.active }; });
  if (current && !out.some(function(m) { return _medlKey(m.name) === _medlKey(current); })) {
    out.push({ name: current, active: false });
  }
  return out;
}

// Lukker utsendinger for saker som er slettet eller ikke lenger er ditt
// arbeid (Fristarkiv, Avsluttet). Samme array tilbake når ingenting endres.
function pruneMedlLog(log, cases, today) {
  var changed = false;
  var out = log.map(function(x) {
    if (x.returned) return x;
    var c = cases.find(function(k) { return k.id === x.caseId; });
    if (canSendToMedleser(c)) return x;
    changed = true;
    return Object.assign({}, x, { returned: today });
  });
  return changed ? out : log;
}

// Etter angre: det handlingen lukket (saken gikk til Fristarkiv, ble avsluttet
// eller slettet) åpnes igjen. Endringer gjort etterpå beholdes.
function medlLogAfterUndo(snapshot, current) {
  if (!Array.isArray(snapshot)) return current;
  var wasOpen = {};
  snapshot.forEach(function(x) { if (!x.returned) wasOpen[x.id] = true; });
  return current.map(function(x) {
    return x.returned && wasOpen[x.id] ? Object.assign({}, x, { returned: null }) : x;
  });
}

// Samme dato ett år tilbake (29. februar blir 28.).
function medlCutoff12m(today) {
  var p = today.split('-').map(Number);
  var y = p[0] - 1;
  var last = new Date(Date.UTC(y, p[1], 0)).getUTCDate();
  return y + '-' + String(p[1]).padStart(2, '0') + '-' + String(Math.min(p[2], last)).padStart(2, '0');
}

function daysBetweenIso(from, to) {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
}

// Per medleser: antall siste 12 måneder, totalt og sist brukt. Medlesere på
// lista som aldri er brukt tas med (med 0). Flest siste 12 mnd først.
function medleserStats(log, today, list) {
  var cutoff = medlCutoff12m(today);
  var by = {};
  function row(name) {
    var k = _medlKey(name);
    if (!by[k]) by[k] = { name: String(name).trim(), last12: 0, total: 0, lastSent: null };
    return by[k];
  }
  (list || []).forEach(function(m) { row(m.name); });
  log.forEach(function(x) {
    var r = row(x.reader);
    r.total++;
    if (x.sent > cutoff) r.last12++;
    if (!r.lastSent || x.sent > r.lastSent) r.lastSent = x.sent;
  });
  return Object.keys(by).map(function(k) { return by[k]; }).sort(function(a, b) {
    return b.last12 - a.last12 || b.total - a.total || a.name.localeCompare(b.name, 'nb');
  });
}

// Forslaget: den aktive medleseren med færrest medlesinger siste 12 mnd. Ved
// likhet den det er lengst siden du brukte (aldri brukt først), så navn.
function suggestMedleser(list, log, today) {
  var stats = medleserStats(log, today);
  var active = list.filter(function(m) { return m.active; }).map(function(m) {
    var s = stats.find(function(r) { return _medlKey(r.name) === _medlKey(m.name); });
    return { name: m.name, last12: s ? s.last12 : 0, lastSent: s ? s.lastSent : null };
  });
  if (!active.length) return null;
  active.sort(function(a, b) {
    if (a.last12 !== b.last12) return a.last12 - b.last12;
    if (a.lastSent !== b.lastSent) {
      if (!a.lastSent) return -1;
      if (!b.lastSent) return 1;
      return a.lastSent < b.lastSent ? -1 : 1;
    }
    return a.name.localeCompare(b.name, 'nb');
  });
  return active[0].name;
}

// ── Fristlista på Oversikt ─────────────────────────
// Én liste med de fristene du selv velger: per sakstype kan forfalte og
// kommende slås av og på hver for seg. Fristarkiv er søkerens svarfrist og er
// derfor av som standard. horizon begrenser bare kommende (0 = ingen grense) —
// forfalte vises alltid, så en glemt frist ikke kan gjemme seg bak grensen.
// Rene funksjoner — se test/homeDeadlines.test.js.
var HOME_DEADLINE_KINDS    = ['ny', 'viderebehandling', 'fristarkiv', 'oppdrag'];
var HOME_DEADLINE_HORIZONS = [0, 14, 30, 60, 90];

function defaultHomeDeadlineFilter() {
  return {
    ny:               { overdue: true,  upcoming: true },
    viderebehandling: { overdue: true,  upcoming: true },
    fristarkiv:       { overdue: false, upcoming: false },
    oppdrag:          { overdue: true,  upcoming: true },
    horizon: 0
  };
}

function normalizeHomeDeadlineFilter(raw) {
  var f = defaultHomeDeadlineFilter();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return f;
  HOME_DEADLINE_KINDS.forEach(function(k) {
    var r = raw[k];
    if (!r || typeof r !== 'object') return;
    if (typeof r.overdue === 'boolean')  f[k].overdue  = r.overdue;
    if (typeof r.upcoming === 'boolean') f[k].upcoming = r.upcoming;
  });
  if (HOME_DEADLINE_HORIZONS.indexOf(raw.horizon) !== -1) f.horizon = raw.horizon;
  return f;
}

// Hvilken rad i filteret en sak hører til; null for avsluttede saker og oppdrag
function homeDeadlineKind(c) {
  if (!c || c.status === 'avsluttet') return null;
  if (c.type === 'oppdrag') return 'oppdrag';
  return HOME_DEADLINE_KINDS.indexOf(c.status) !== -1 ? c.status : null;
}

// daysFn(c) gir dager til sakens frist (negativt = forfalt). Gir [{c, d, kind}]
// sortert etter frist, eldste forfalte først.
function selectHomeDeadlines(list, filter, daysFn) {
  var rows = [];
  list.forEach(function(c) {
    var kind = homeDeadlineKind(c);
    if (!kind) return;
    var d = daysFn(c);
    if (typeof d !== 'number' || !isFinite(d)) return;
    var sel = filter[kind];
    if (d < 0 ? !sel.overdue : (!sel.upcoming || (filter.horizon && d > filter.horizon))) return;
    rows.push({ c: c, d: d, kind: kind });
  });
  rows.sort(function(a, b) { return a.d - b.d; });
  return rows;
}

// Kort tekst som sier hva lista viser, så et skjult valg ikke glemmes
function homeDeadlineFilterSummary(filter) {
  var names = { ny: 'Førstesøknader', viderebehandling: 'Viderebehandlinger', fristarkiv: 'Svarfrister', oppdrag: 'Oppdrag' };
  var parts = [];
  HOME_DEADLINE_KINDS.forEach(function(k) {
    var s = filter[k];
    if (s.overdue && s.upcoming) parts.push(names[k]);
    else if (s.overdue)          parts.push(names[k] + ' (forfalte)');
    else if (s.upcoming)         parts.push(names[k] + ' (kommende)');
  });
  if (!parts.length) return 'Ingenting valgt';
  if (filter.horizon) parts.push('kommende innen ' + filter.horizon + ' dager');
  return parts.join(' · ');
}

// ── Saksmappe ──────────────────────────────────────
function getDocRoot() { return loadDocRoot(); }
function buildCasePath(caseNumber) {
  var root = getDocRoot().replace(/\//g, '\\').replace(/\\+$/, ''); // normalize slashes, trim trailing
  return root + '\\' + caseNumber;
}


// ── Dokumentpaneler ────────────────────────────────
// Visningen «Dokumenter» på saksiden: 1–3 paneler side om side med saksfilene
// og et kravpanel som kan flyttes, byttes og skjules. Oppsettet er felles for
// alle saker (localStorage, pt_doc_layout) og følger med i eksport og
// sikkerhetskopi. Plassreglene bestemmer hvilken fil som havner i hvilket
// panel: første PDF der filnavnet (uten .pdf) inneholder teksten. Rene
// funksjoner — se test/docPanes.test.js.
var DOC_PANE_MAX = 3;
var DOC_PANE_MIN = 0.15;
var DOC_CLAIMS_MODES = ['overview'];
var DOC_CLAIMS_SIDES = ['left', 'right'];
var DOC_RULE_MAX = 40;
var DOC_CLAIMS_W_MIN = 160;
var DOC_CLAIMS_W_MAX = 480;

function defaultDocLayout() {
  return {
    count: 2,
    claimsVisible: true,
    claimsSide: 'left',
    claimsMode: 'overview',
    claimsWidth: 250,
    rules: ['claims', 'figures', ''],
    widths: { 1: [1], 2: [0.5, 0.5], 3: [1 / 3, 1 / 3, 1 / 3] }
  };
}

// Bredder som andeler av panelflaten: n tall som summerer til 1, hver minst
// DOC_PANE_MIN. Ugyldig inndata gir like brede paneler.
function normalizePaneWidths(raw, count) {
  var n = count;
  if (n <= 1) return [1];
  var equal = [];
  for (var e = 0; e < n; e++) equal.push(1 / n);
  if (!Array.isArray(raw) || raw.length !== n) return equal;
  var total = 0;
  for (var i = 0; i < n; i++) {
    if (typeof raw[i] !== 'number' || !isFinite(raw[i]) || raw[i] <= 0) return equal;
    total += raw[i];
  }
  if (!isFinite(total) || total <= 0) return equal; // summen kan flyte over selv om hvert tall er endelig
  var w = raw.map(function(x) { return x / total; });
  var out = w.slice(), fixed = [], rem = 1;
  for (var pass = 0; pass <= n; pass++) {
    var free = [], freeSum = 0;
    for (var k = 0; k < n; k++) { if (!fixed[k]) { free.push(k); freeSum += w[k]; } }
    if (!free.length) break;
    var scale = rem / freeSum, again = false;
    free.forEach(function(j) {
      if (w[j] * scale < DOC_PANE_MIN - 1e-12) { out[j] = DOC_PANE_MIN; fixed[j] = true; rem -= DOC_PANE_MIN; again = true; }
    });
    if (!again) { free.forEach(function(j) { out[j] = w[j] * scale; }); break; }
  }
  return out;
}

// Skillelinje i mellom panel i og i+1 flyttes delta (andel). Ingen av de to
// går under minstebredden; resten røres ikke.
function dragPaneWidths(widths, i, delta) {
  if (!Array.isArray(widths)) return [];
  var w = widths.slice();
  if (!Number.isInteger(i) || i < 0 || i + 1 >= w.length || typeof delta !== 'number' || !isFinite(delta)) return w;
  var total = w[i] + w[i + 1];
  var a = Math.min(Math.max(w[i] + delta, DOC_PANE_MIN), total - DOC_PANE_MIN);
  w[i] = a;
  w[i + 1] = total - a;
  return w;
}

function normalizeDocLayout(raw) {
  var d = defaultDocLayout();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d;
  if (Number.isInteger(raw.count) && raw.count >= 1 && raw.count <= DOC_PANE_MAX) d.count = raw.count;
  if (typeof raw.claimsVisible === 'boolean') d.claimsVisible = raw.claimsVisible;
  if (DOC_CLAIMS_SIDES.indexOf(raw.claimsSide) !== -1) d.claimsSide = raw.claimsSide;
  if (DOC_CLAIMS_MODES.indexOf(raw.claimsMode) !== -1) d.claimsMode = raw.claimsMode;
  if (typeof raw.claimsWidth === 'number' && isFinite(raw.claimsWidth)) {
    d.claimsWidth = Math.round(Math.min(Math.max(raw.claimsWidth, DOC_CLAIMS_W_MIN), DOC_CLAIMS_W_MAX));
  }
  if (Array.isArray(raw.rules)) {
    d.rules = [0, 1, 2].map(function(i) {
      var r = raw.rules[i];
      return typeof r === 'string' ? r.trim().slice(0, DOC_RULE_MAX) : '';
    });
  }
  var rw = (raw.widths && typeof raw.widths === 'object' && !Array.isArray(raw.widths)) ? raw.widths : {};
  [1, 2, 3].forEach(function(n) { d.widths[n] = normalizePaneWidths(rw[n], n); });
  return d;
}

// Indeksen til første PDF i files der navnet (uten .pdf) inneholder regelen,
// uten forskjell på store og små bokstaver. Filer i skip hoppes over. -1 = ingen.
function docSlotMatch(files, rule, skip) {
  var r = (typeof rule === 'string' ? rule : '').trim().toLowerCase();
  if (!r || !Array.isArray(files)) return -1;
  var skipped = Array.isArray(skip) ? skip : [];
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (skipped.indexOf(i) !== -1) continue;
    if (!f || typeof f.name !== 'string' || !_fileIsPdf(f.name)) continue;
    if (_fileDisplayName(f.name).toLowerCase().indexOf(r) !== -1) return i;
  }
  return -1;
}

// Filindeks per panel (-1 = tomt). manual[i] er et valg brukeren har gjort i
// panel i og går foran regelen; regler plasserer aldri samme fil to ganger.
function docSlotAssign(files, rules, count, manual) {
  var n = (Number.isInteger(count) && count >= 1 && count <= DOC_PANE_MAX) ? count : 2;
  var list = Array.isArray(files) ? files : [];
  var picks = Array.isArray(manual) ? manual : [];
  var rl = Array.isArray(rules) ? rules : [];
  var out = [], used = [], pending = [];
  for (var i = 0; i < n; i++) {
    var m = picks[i], f = list[m];
    if (Number.isInteger(m) && m >= 0 && m < list.length && f && typeof f.name === 'string' && _fileIsPdf(f.name)) {
      out.push(m); used.push(m);
    } else {
      out.push(-1); pending.push(i);
    }
  }
  pending.forEach(function(s) {
    var hit = docSlotMatch(list, rl[s], used);
    if (hit >= 0) { out[s] = hit; used.push(hit); }
  });
  return out;
}

// Raden per krav i kravpanelets oversikt: nummer, avhengighet, nyhet og
// oppfinnelseshøyde (true / false / null = ikke vurdert).
function claimOverviewRows(claims) {
  if (!Array.isArray(claims)) return [];
  var rows = [];
  claims.forEach(function(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return;
    if (!Number.isInteger(c.num) || c.num < 1) return;
    rows.push({
      num: c.num,
      dep: (Number.isInteger(c.dep) && c.dep >= 1) ? c.dep : null,
      novelty: roundTriState(c.novelty),
      inventive: roundTriState(c.inventive)
    });
  });
  return rows.sort(function(a, b) { return a.num - b.num; });
}

// Adressen et panel laster, eller null når appen ikke er åpnet via den lokale
// serveren — da stopper nettleseren file:///-adresser i en iframe.
function docPaneUrl(root, caseNumber, name, loc) {
  return _docServedLocally(loc) ? _docFileUrl(root, caseNumber, name, loc) : null;
}
