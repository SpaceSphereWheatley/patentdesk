// ════════════════════════════════════════════════════════════════════════════
// SEKSJON 3 · STORAGE-LAG
// Eneste sted som leser/skriver localStorage
// migrate(), load*(), save*(), reset()
// ════════════════════════════════════════════════════════════════════════════

// ── Migrasjon v3 → v4 ──────────────────────────────
// Migrasjoner kjøres sekvensielt: SCHEMA_MIGRATIONS[n] løfter data fra
// schema-versjon n til n+1. Legg til nye steg her når SCHEMA_VERSION økes —
// f.eks. SCHEMA_MIGRATIONS[4] for v4 → v5. Hvert steg kaster ved feil; da
// stopper kjeden og versjonen blir stående på siste vellykkede steg, slik at
// den prøves på nytt ved neste oppstart.
var SCHEMA_MIGRATIONS = {
  // v3 → v4: history[] { status, date } → { type, date, from, to }; rydd utdaterte nøkler
  3: function() {
    var rawCases = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    var upgraded = rawCases.map(function(c) {
      if (!Array.isArray(c.history)) return c;
      c.history = c.history.map(function(h) {
        if (h.type) return h; // allerede v4-format
        return { type: 'status', date: h.date || new Date().toISOString(), from: null, to: h.status || 'ny' };
      });
      return c;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(upgraded));
    localStorage.removeItem(AUTOSAVE_KEY);
    localStorage.removeItem('pt_cpc_welcomed');
  },
  // v4 → v5: kravnotater lagret på `note` flyttes til `notes`, som er feltet
  // kravstabellen faktisk leser. Notatene har ligget der hele tiden uten å bli
  // vist; her hentes de tilbake.
  4: function() {
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (!key || key.indexOf(SAK_KEY_PREFIX) !== 0) continue;
      var raw = localStorage.getItem(key);
      if (!raw) continue;
      var data;
      try { data = JSON.parse(raw); } catch(e) { continue; } // ugyldig JSON røres ikke
      if (migrateClaimNotes(data)) localStorage.setItem(key, JSON.stringify(data));
    }
  },
  // v5 → v6: motholdenes tittelfelt er fjernet fra saksvisningen. En tittel
  // uten referanse blir referansen, slik at ingen skrevet tekst blir liggende
  // usynlig og uredigerbar.
  5: function() {
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (!key || key.indexOf(SAK_KEY_PREFIX) !== 0) continue;
      var raw = localStorage.getItem(key);
      if (!raw) continue;
      var data;
      try { data = JSON.parse(raw); } catch(e) { continue; } // ugyldig JSON røres ikke
      if (migrateDocTitles(data)) localStorage.setItem(key, JSON.stringify(data));
    }
  },
  // v6 → v7: avsluttede saker kan ha `outcome` (meddelt/avslått/henlagt). Feltet
  // er valgfritt, og migrateCases normaliserer det ved hver lasting, så
  // eksisterende data trenger ingen omskriving — eldre avsluttede saker står
  // uten utfall og vises som «Avsluttet».
  // v7 → v8: saksdetaljene får rounds[] (øyeblikksbilder av vurderingen ved
  // hvert realitetsbrev). Eksisterende saker starter tomme; lettersSent er
  // urørt, og en sak forbi første brev kan lagre dagens vurdering i ettertid.
  // Bare pt_sak_* røres — pt_cases har aldri runder. Idempotent.
  7: function() {
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (!key || key.indexOf(SAK_KEY_PREFIX) !== 0) continue;
      var raw = localStorage.getItem(key);
      if (!raw) continue;
      var data;
      try { data = JSON.parse(raw); } catch(e) { continue; } // ugyldig JSON røres ikke
      if (!data || typeof data !== 'object' || Array.isArray(data) || Array.isArray(data.rounds)) continue;
      data.rounds = [];
      localStorage.setItem(key, JSON.stringify(data));
    }
  }
};

function migrateAll() {
  var v = parseInt(localStorage.getItem('pt_schema_version') || '0', 10);
  // Data uten versjonsnøkkel er pre-v4 (formatet før schema-versjonering): behandles som v3.
  if (!v) v = 3;
  while (v < SCHEMA_VERSION) {
    var step = SCHEMA_MIGRATIONS[v];
    if (step) {
      try {
        step();
      } catch(e) {
        console.warn('PatentDesk: Migrasjon v' + v + ' → v' + (v + 1) + ' feilet', e);
        showToast('✗ Datamigrering feilet — eldre data er urørt, prøver igjen neste gang', true);
        return; // stopp; versjonen blir stående på siste vellykkede steg
      }
    }
    v++;
    try { localStorage.setItem('pt_schema_version', String(v)); } catch(e) {}
  }
  console.log('PatentDesk: Schema på v' + SCHEMA_VERSION);
}

// ── Saksdetaljer ───────────────────────────────────
function sakKey(id) { return SAK_KEY_PREFIX + id; }

// Felles localStorage-skriving med brukervarsel ved feil
function lsSetSafe(key, value) {
  try { localStorage.setItem(key, value); return true; }
  catch(e) {
    showToast(e && e.name === 'QuotaExceededError'
      ? '✗ Lagring feilet — lagringsplass full'
      : '✗ Lagring feilet', true);
    return false;
  }
}

var _warnedCorruptSak = {};

function loadSakData(id) {
  var raw = null;
  try { raw = localStorage.getItem(sakKey(id)); } catch(e) { return null; }
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch(e) {
    // Korrupt JSON: bevar råteksten under egen nøkkel så senere lagring ikke overskriver den
    try { localStorage.setItem('pt_korrupt_' + id, raw); } catch(e2) {}
    if (!_warnedCorruptSak[id]) {
      _warnedCorruptSak[id] = true;
      console.warn('PatentDesk: Korrupte saksdetaljer for ' + id + ' — råtekst bevart under pt_korrupt_' + id, e);
      showToast('✗ Saksdetaljer kunne ikke leses — rådata er bevart', true);
    }
    return null;
  }
}

function saveSakData(id, data) {
  // Domeneregel håndheves også ved lagring: krav uten nyhet kan aldri ha oppfinnelseshøyde
  if (data && Array.isArray(data.claims)) {
    data.claims.forEach(function(c) {
      if (c && c.novelty === false && c.inventive !== false) c.inventive = false;
    });
  }
  return lsSetSafe(sakKey(id), JSON.stringify(data));
}

// ── Sjekkliste-mal ─────────────────────────────────
function getChecklistTemplate() {
  try {
    var raw = localStorage.getItem(CHECKLIST_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return CHECKLIST_DEFAULT;
}

function saveChecklistTemplate(tpl) {
  lsSetSafe(CHECKLIST_KEY, JSON.stringify(tpl));
}

// ── Medlesing ───────────────────────────────────────
function loadMedlesing() {
  try {
    var raw = localStorage.getItem(MEDLESING_KEY);
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return [];
}

function saveMedlesing(list) {
  lsSetSafe(MEDLESING_KEY, JSON.stringify(list));
}

function resetChecklistTemplate() {
  try { localStorage.removeItem(CHECKLIST_KEY); } catch(e) {}
}

// ── Tema og visning ────────────────────────────────

// ── Drawer ─────────────────────────────────────────
function loadDrawerCollapsed()    { return localStorage.getItem('pt_drawer_collapsed') === '1'; }
function saveDrawerCollapsed(v)   { try { localStorage.setItem('pt_drawer_collapsed', v ? '1' : '0'); } catch(e) {} }

// ── Saksdokumenter ─────────────────────────────────
function loadDocRoot() { return localStorage.getItem(DOC_ROOT_KEY) || DEFAULT_DOC_ROOT; }
function saveDocRoot(v) { lsSetSafe(DOC_ROOT_KEY, v); }

// ── Lenke til nye saker ────────────────────────────
// Siden der nye saker fordeles (f.eks. en SharePoint-side). Lenker som kopieres
// fra Teams har med seg sporingsparametere (og e-postadressen i ovuser) som
// utløper; de fjernes, mens andre parametere beholdes i tilfelle siden trenger dem.
var CASE_SOURCE_TRACKING_PARAMS = ['teamscid', 'or', 'ct', 'xsdata', 'sdata', 'ovuser', 'clickparams'];
var CASE_SOURCE_LABEL_MAX = 40;

// '' = ingen lenke, null = ugyldig (bare https:// godtas)
function normalizeCaseSourceUrl(v) {
  var s = String(v == null ? '' : v).trim();
  if (!s) return '';
  if (!/^https:\/\/[^\s\/?#]+/i.test(s)) return null;
  var hash = '', query = '';
  var hi = s.indexOf('#');
  if (hi !== -1) { hash = s.slice(hi); s = s.slice(0, hi); }
  var qi = s.indexOf('?');
  if (qi !== -1) { query = s.slice(qi + 1); s = s.slice(0, qi); }
  var kept = query.split('&').filter(function(p) {
    if (!p) return false;
    var k = p.split('=')[0];
    try { k = decodeURIComponent(k); } catch(e) {}
    return CASE_SOURCE_TRACKING_PARAMS.indexOf(k.toLowerCase()) === -1;
  });
  return (s + (kept.length ? '?' + kept.join('&') : '') + hash).replace(/ /g, '%20');
}
function normalizeCaseSource(o) {
  o = (o && typeof o === 'object' && !Array.isArray(o)) ? o : {};
  return {
    url:   normalizeCaseSourceUrl(o.url) || '',
    label: (typeof o.label === 'string' ? o.label.trim() : '').slice(0, CASE_SOURCE_LABEL_MAX)
  };
}
function caseSourceTitle(src) {
  return 'Åpne ' + (src.label || 'siden med nye saker');
}
function loadCaseSource() {
  try { return normalizeCaseSource(JSON.parse(localStorage.getItem(CASE_SOURCE_KEY))); }
  catch(e) { return normalizeCaseSource(null); }
}
function saveCaseSource(v) { lsSetSafe(CASE_SOURCE_KEY, JSON.stringify(v)); }

// Trim, drop trailing slashes, normalize "/" to "\" — root is always joined Windows-style
function _docRootNormalize(v) {
  return (v || '').trim().replace(/[\\\/]+$/, '').replace(/\//g, '\\');
}
function _docRootJoin(root, caseNumber, file) {
  return _docRootNormalize(root) + '\\' + caseNumber + '\\' + file;
}
// Åpnet via den lokale serveren (Start-PatentDesk.ps1)? Da stopper nettleseren
// file:///-lenker, og dokumentene hentes i stedet fra serverens /docs/-adresse.
function _docServedLocally(loc) {
  return !!loc && /^https?:$/.test(loc.protocol) && loc.hostname === 'localhost';
}
// Lenke til et saksdokument. loc er window.location (utelatt = file:///-lenke).
// Serveren får dokumentroten fra Innstillinger med i lenken, så mappen bare
// stilles inn ett sted.
function _docFileUrl(root, caseNumber, name, loc) {
  var file = _fileResolvedName(name);
  if (_docServedLocally(loc)) {
    return loc.origin + '/docs?root=' + encodeURIComponent(_docRootNormalize(root)) +
      '&case=' + encodeURIComponent(caseNumber) + '&file=' + encodeURIComponent(file);
  }
  return 'file:///' + _docRootJoin(root, caseNumber, file).replace(/\\/g, '/');
}
function _fileHasExt(name) {
  return /\.[a-zA-Z0-9]+$/.test(name || '');
}
function _fileResolvedName(name) {
  name = name || '';
  return _fileHasExt(name) ? name : (name + '.pdf');
}
function _fileDisplayName(name) {
  return _fileResolvedName(name).replace(/\.pdf$/i, '');
}
// Visningsnavnet (label) er bare det som står i listen. Lenken, «Kopier sti»
// og «Åpne alle» bruker alltid filnavnet (name). Ren — se test/fileLabel.test.js.
var FILE_LABEL_MAX = 80;
function fileListLabel(f) {
  var label = (f && typeof f.label === 'string') ? f.label.trim() : '';
  return label || _fileDisplayName(f && f.name);
}
function _fileLabelClean(v) {
  return sanitizeText(String(v == null ? '' : v)).trim().slice(0, FILE_LABEL_MAX);
}
// Ny filpost etter redigering. Tomt filnavn beholder det gamle; tomt
// visningsnavn fjerner feltet, så filnavnet vises igjen. Filnavnet kuttes
// aldri: et langt navn fra en import må fortsatt peke på filen.
function applyFileEdit(file, name, label) {
  var n = sanitizeText(String(name == null ? '' : name)).trim();
  var l = _fileLabelClean(label);
  var out = { name: n || file.name };
  if (l) out.label = l;
  return out;
}
// Import: visningsnavnet er fri tekst fra filen og får samme form som appen
// selv skriver (tekst, renset, maks lengde, ellers fjernet). Resten er som før.
function normalizeImportFiles(files) {
  if (!Array.isArray(files)) return files;
  return files.map(function(f) {
    if (!f || typeof f !== 'object' || Array.isArray(f)) return f;
    var copy = {};
    Object.keys(f).forEach(function(k) { if (k !== '__proto__') copy[k] = f[k]; });
    if (Object.prototype.hasOwnProperty.call(f, 'label')) {
      var l = typeof f.label === 'string' ? _fileLabelClean(f.label) : '';
      if (l) copy.label = l; else delete copy.label;
    }
    return copy;
  });
}
function _fileExt(name) {
  var m = _fileResolvedName(name).match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : '';
}
function _fileIsPdf(name) {
  return _fileExt(name) === 'pdf';
}
function _fileIcon(name) {
  switch (_fileExt(name)) {
    case 'pdf': return '📄';
    case 'doc': case 'docx': case 'odt': return '📝';
    case 'xls': case 'xlsx': case 'csv': return '📊';
    case 'ppt': case 'pptx': return '📽️';
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'bmp': case 'svg': return '🖼️';
    case 'zip': case 'rar': case '7z': return '🗄️';
    case 'txt': return '📃';
    default: return '📎';
  }
}
function _docRootPreviewHtml(root) {
  var path = _docRootJoin(root || DEFAULT_DOC_ROOT, 'NO20240001', 'Claims.pdf');
  return 'Eksempel: <code>' + path + '</code>';
}

// ── Onboarding ─────────────────────────────────────
function loadUserName()  { return localStorage.getItem(USER_NAME_KEY) || ''; }
function saveUserName(v) { lsSetSafe(USER_NAME_KEY, v); }

// ── Slett all data ─────────────────────────────────
// Alle appens nøkler begynner på pt_, så alt med det prefikset slettes — også
// nøkler som legges til senere, uten at noen må huske å føre dem opp her.
// Unntaket er bokføringen for sikkerhetskopi og datamappe: den beskriver
// mappen og kopiene, ikke dataene, og uten den ville neste oppstart tolket
// en tom nettleser som ny og hentet alt tilbake fra arbeidsfilen.
var DELETE_ALL_KEEP_KEYS = ['pt_backup_enabled', 'pt_backup_last', 'pt_backup_last_file_date',
  'pt_saved_at', 'pt_workfile_last', 'pt_workfile_synced'];

// Ren funksjon — se test/dataIntegrity.test.js.
function keysForDeleteAll(keys) {
  return keys.filter(function(k) {
    return typeof k === 'string' && k.indexOf('pt_') === 0 && DELETE_ALL_KEEP_KEYS.indexOf(k) === -1;
  });
}

function deleteAllData() {
  var keys = [];
  try { for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i)); } catch(e) {}
  keysForDeleteAll(keys).forEach(function(k) { try { localStorage.removeItem(k); } catch(e) {} });
  _cpcResetState();
}

// ── Import-validering ──────────────────────────────
var VALID_IMPORT_STATUSES = { ny:1, viderebehandling:1, fristarkiv:1, avsluttet:1 };
function _validateImportCase(c) {
  if (!c || typeof c !== 'object') return false;
  if (typeof c.id !== 'string' || !c.id.trim()) return false;
  if (typeof c.caseNumber !== 'string' || !c.caseNumber.trim()) return false;
  if (typeof c.dueDate !== 'string') return false;
  if (typeof c.title !== 'string') return false;
  if (!VALID_IMPORT_STATUSES[c.status]) return false;
  return true;
}

// ── Migrer sak-cases-array ─────────────────────────
function migrateCases(arr) {
  return arr.map(function(raw) {
    var n = Object.assign({}, raw, { dueDate: raw.dueDate ? parseDate(raw.dueDate) : '' });
    var hist = Array.isArray(n.history) ? n.history : [];
    if (!hist.length) {
      var seed = (n.createdAt && n.createdAt.indexOf('T') > -1)
        ? n.createdAt
        : (n.createdAt || n.dueDate || new Date().toISOString()).replace(/T.*/, '') + 'T00:00:00.000Z';
      hist = [{ status: 'ny', date: seed }];
    }
    // Migrer oppdrag: status='oppdrag' er nå ugyldig — normalize til 'ny'
    if (n.type === 'oppdrag' && n.status === 'oppdrag') n.status = 'ny';
    var out = {
      id:         n.id          || uid(),
      caseNumber: n.caseNumber  || '',
      status:     n.status      || 'ny',
      dueDate:    n.dueDate     || '',
      title:      n.title       || '',
      notes:      sanitizeText(n.notes  || ''),
      tags:       n.tags        || '',
      createdAt:  n.createdAt   || n.dueDate || new Date().toISOString(),
      history:    hist,
      type:       n.type        || 'sak',
      duration:   n.duration    || null,
      caseBuffer: n.caseBuffer  != null ? n.caseBuffer : null,
      outcome:    normaliseOutcome(n.status || 'ny', n.outcome)
    };
    // «Ikke fordelt» tas bare med når det er satt, så andre saker er uendret
    if (n.unassigned === true) {
      out.unassigned = true;
      out.unassignedSince = typeof n.unassignedSince === 'string' ? n.unassignedSince : null;
    }
    return out;
  });
}

function loadCases() {
  try { return migrateCases((JSON.parse(localStorage.getItem(STORAGE_KEY)) || []).map(decodeCase)); }
  catch(e) { return []; }
}

function saveCases() {
  lsSetSafe(STORAGE_KEY, JSON.stringify(cases.map(encodeCase)));
}

function loadStats() {
  try { return JSON.parse(localStorage.getItem(STATS_KEY)) || { log:[] }; }
  catch(e) { return { log:[] }; }
}

function saveStats() {
  lsSetSafe(STATS_KEY, JSON.stringify(stats));
}

function loadVacations() {
  try { return JSON.parse(localStorage.getItem(VACATION_KEY)) || []; }
  catch(e) { return []; }
}
function saveVacations() {
  lsSetSafe(VACATION_KEY, JSON.stringify(vacations));
}
function loadGoal() {
  var v = parseInt(localStorage.getItem(GOAL_KEY), 10);
  return isNaN(v) ? 0 : v;
}
function saveGoal(val) {
  lsSetSafe(GOAL_KEY, String(val));
}
function loadBeleggHorizon() {
  var v = parseInt(localStorage.getItem(BELEGG_KEY), 10);
  return [30, 60, 90].indexOf(v) !== -1 ? v : 60;
}
function saveBeleggHorizon(val) {
  lsSetSafe(BELEGG_KEY, String(val));
}
// Standardbuffer per type. Finnes ikke den nye nøkkelen ennå, brukes den gamle
// globale bufferen for begge typene, så oppgraderingen ikke flytter noen frister.
function loadTypeBuffers() {
  var raw = null, legacy;
  try { raw = JSON.parse(localStorage.getItem(TYPE_BUFFER_KEY)); } catch(e) {}
  if (!raw) {
    var v = parseInt(localStorage.getItem(BUFFER_KEY), 10);
    if (!isNaN(v)) legacy = v;
  }
  return normalizeTypeBuffers(raw, legacy);
}
function saveTypeBuffers(b) {
  lsSetSafe(TYPE_BUFFER_KEY, JSON.stringify(b));
}
function loadWorkWindows() {
  var raw = null;
  try { raw = JSON.parse(localStorage.getItem(WORK_WINDOW_KEY)); } catch(e) {}
  // Engangsoppgradering fra kalenderdager (se migrateWorkWindowsToWorkdays).
  // Flagget hindrer at en 14 brukeren velger senere, blir gjort om igjen.
  try {
    if (localStorage.getItem(WORK_WINDOW_UNIT_KEY) !== 'workdays') {
      var migrated = migrateWorkWindowsToWorkdays(raw);
      if (migrated !== raw) { raw = migrated; localStorage.setItem(WORK_WINDOW_KEY, JSON.stringify(raw)); }
      localStorage.setItem(WORK_WINDOW_UNIT_KEY, 'workdays');
    }
  } catch(e) {}
  return normalizeWorkWindows(raw);
}
function saveWorkWindows(w) {
  lsSetSafe(WORK_WINDOW_KEY, JSON.stringify(w));
}
function loadDeadlines() {
  var raw = null;
  try { raw = JSON.parse(localStorage.getItem(DEADLINES_KEY)); } catch(e) {}
  return normalizeDeadlines(raw);
}
function saveDeadlines(d) {
  lsSetSafe(DEADLINES_KEY, JSON.stringify(d));
}
function loadHomeDeadlineFilter() {
  try { return normalizeHomeDeadlineFilter(JSON.parse(localStorage.getItem(HOME_DEADLINE_KEY))); }
  catch(e) { return defaultHomeDeadlineFilter(); }
}
function saveHomeDeadlineFilter(f) {
  lsSetSafe(HOME_DEADLINE_KEY, JSON.stringify(f));
}
function loadDocLayout() {
  try { return normalizeDocLayout(JSON.parse(localStorage.getItem(DOC_LAYOUT_KEY))); }
  catch(e) { return defaultDocLayout(); }
}
function saveDocLayout(l) {
  lsSetSafe(DOC_LAYOUT_KEY, JSON.stringify(l));
}
function loadTlView() {
  try { return normalizeTlView(JSON.parse(localStorage.getItem(TL_VIEW_KEY))); }
  catch(e) { return normalizeTlView(null); }
}
// Lagrer tidslinjevisningen etter hver endring av horisont, akse eller
// sakstyper, så den er som du forlot den neste gang appen åpnes.
function saveTlView() {
  lsSetSafe(TL_VIEW_KEY, JSON.stringify(tlViewFromConfig(_tlConfig)));
}
function loadActiveCase() {
  try { return normalizeActiveCase(JSON.parse(localStorage.getItem(ACTIVE_CASE_KEY))); }
  catch(e) { return null; }
}
function loadUnassignedReminder() {
  var raw = null;
  try { raw = localStorage.getItem(UNASSIGNED_REMINDER_KEY); } catch(e) {}
  return normalizeUnassignedReminder(raw === null ? null : Number(raw));
}
function saveUnassignedReminder(days) {
  lsSetSafe(UNASSIGNED_REMINDER_KEY, String(days));
}
function saveActiveCase(mark) {
  if (mark) lsSetSafe(ACTIVE_CASE_KEY, JSON.stringify(mark));
  else { try { localStorage.removeItem(ACTIVE_CASE_KEY); } catch(e) {} }
}
function loadMedleserList() {
  try { return normalizeMedleserList(JSON.parse(localStorage.getItem(MEDLESERE_KEY))); }
  catch(e) { return []; }
}
function saveMedleserList(list) { lsSetSafe(MEDLESERE_KEY, JSON.stringify(list)); }
function loadMedlLog() {
  try { return normalizeMedlLog(JSON.parse(localStorage.getItem(MEDL_LOG_KEY))); }
  catch(e) { return []; }
}
function saveMedlLog(log) { lsSetSafe(MEDL_LOG_KEY, JSON.stringify(log)); }
// Standard fristbuffer per sakstype (Innstillinger → Standard per sakstype).
// Bare Ny og Viderebehandling har buffer: oppdrag bruker alltid faktisk frist,
// og i Fristarkiv er fristen søkerens. Kan overstyres per sak (caseBuffer).
var TYPE_BUFFER_DEFAULTS = { ny: 0, viderebehandling: 0 };
var TYPE_BUFFER_MAX = 90;

// normalizeTypeBuffers: et fullstendig sett bufferverdier fra lagrede eller
// importerte innstillinger. Hver type valideres for seg. legacy er den gamle
// globale fristbufferen (før v4.30.0): den fyller typene som mangler, slik at
// en oppgradering ikke endrer noen frister.
function normalizeTypeBuffers(raw, legacy) {
  var src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  var valid = function(v) { return typeof v === 'number' && isFinite(v) && v >= 0 && v <= TYPE_BUFFER_MAX; };
  var out = {};
  Object.keys(TYPE_BUFFER_DEFAULTS).forEach(function(k) {
    out[k] = valid(src[k]) ? Math.floor(src[k])
           : valid(legacy)  ? Math.floor(legacy)
           : TYPE_BUFFER_DEFAULTS[k];
  });
  return out;
}

// typeBufferFor: standardbufferen for sakens type (Ny når saken mangler).
function typeBufferFor(c) {
  return (c && c.status === 'viderebehandling') ? typeBuffers.viderebehandling : typeBuffers.ny;
}

// bufferDaysFor: bufferen som faktisk gjelder for saken — egen buffer om den
// har en, ellers standarden for typen, og 0 der buffer ikke gjelder. Negativ
// buffer (utsatt) gjelder bare der saken kan utsettes (canPostpone).
function bufferDaysFor(c) {
  if (!bufferAppliesTo(c)) return 0;
  var b = (c && c.caseBuffer != null) ? c.caseBuffer : typeBufferFor(c);
  return b < 0 && !canPostpone(c) ? 0 : b;
}

// bufferAppliesTo: om fristbufferen — standard eller per sak — skal gjelde for en
// sak. Oppdrag viser alltid faktisk frist. Det samme gjør saker i Fristarkiv:
// der er poenget nettopp å forholde seg til den reelle fristen, så verken den
// globale bufferen eller en per-sak-buffer trekkes fra.
function bufferAppliesTo(c) {
  if (!c) return true;
  if (c.type === 'oppdrag') return false;
  if (c.status === 'fristarkiv') return false;
  return true;
}
// getEffectiveDueDate: returnerer dueDate forskøvet med buffer dager tidligere.
// Brukes overalt utad unntatt inne i saksdetaljvisning og fristarkiv.
// Saker bufferen ikke gjelder for (se bufferAppliesTo) viser faktisk frist.
function getEffectiveDueDate(dueDateStr, caseObj) {
  if (!dueDateStr) return dueDateStr;
  if (!bufferAppliesTo(caseObj)) return dueDateStr;
  var buf = bufferDaysFor(caseObj);
  if (buf === 0) return dueDateStr;
  var d = new Date(dueDateStr + 'T00:00:00');
  d.setDate(d.getDate() - buf);
  return isoLocalDate(d);
}
// isoLocalDate: datoen som 'YYYY-MM-DD' i lokal tid. toISOString() gir
// UTC-datoen, og i Norge er lokal midnatt fortsatt gårsdagen i UTC — datoen
// ville glippet én dag bakover.
// addDaysLocal: n kalenderdager etter d, ved lokal midnatt. Å legge til
// n * 86400000 ms bommer med én dag etter overgangen fra sommertid, når et
// døgn har 25 timer. Ren funksjon — se test/dst.test.js.
function addDaysLocal(d, n) {
  var r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() + n);
  return r;
}
function isoLocalDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
// effDueFor: returns the effective due date for a case object.
// Oppdrag and cases in Fristarkiv always use their actual dueDate; other cases
// get the buffer-adjusted date.
function effDueFor(c) {
  return getEffectiveDueDate(c ? c.dueDate : '', c);
}

// Utsatt viderebehandling. Fristen for å behandle søkerens svar er mykere enn
// for nye søknader og oppdrag, så en viderebehandling kan legges etter fristen
// i arbeidsplanen — en negativ buffer. Fristen flytter seg ikke: saken er
// forfalt fra den faktiske fristen (deadlineFor). Bjelken og belegget følger
// planen (effDueFor), som for enhver annen sak, så en utsettelse koster ikke
// noe ekstra; straffen for forfalt kommer først når planen er passert.
// Rene funksjoner — se test/postpone.test.js.
// Dager etter fristen før dra-brikken varsler. Det er bare et varsel; det er
// ingen grense for hvor langt en sak kan utsettes.
var POSTPONE_WARN_DAYS = 14;

function canPostpone(c) {
  return !!c && c.type !== 'oppdrag' && c.status === 'viderebehandling';
}

// minBufferFor: den minste bufferen saken kan dras eller settes til.
function minBufferFor(c) {
  return canPostpone(c) ? -Infinity : 0;
}

// postponedDaysFor: hvor mange dager etter fristen saken er planlagt, ellers 0.
function postponedDaysFor(c) {
  if (!canPostpone(c)) return 0;
  var b = bufferDaysFor(c);
  return b < 0 ? -b : 0;
}

// deadlineFor: datoen som avgjør om saken er forfalt, og som nedtellingen
// måles mot — den bufrede datoen som før, men den faktiske fristen for en
// utsatt sak.
function deadlineFor(c) {
  return postponedDaysFor(c) > 0 ? c.dueDate : effDueFor(c);
}

// fristDisplayDate: datoen fristblokken viser. En avsluttet sak viser den
// faktiske fristen — bufferen er bare et planleggingsverktøy for åpne saker.
// Ren funksjon — se test/sakFristCountdown.test.js.
function fristDisplayDate(c) {
  return c.status === 'avsluttet' ? c.dueDate : deadlineFor(c);
}

// fristMetaMode: hvilken tilleggslinje fristblokken viser — 'postponed'
// (utsatt), 'buffer' (buffer trukket fra) eller '' (ingen). Avsluttet: ingen.
// Ren funksjon — se test/sakFristCountdown.test.js.
function fristMetaMode(c) {
  if (c.status === 'avsluttet') return '';
  if (postponedDaysFor(c) > 0) return 'postponed';
  if (c.type !== 'oppdrag' && effDueFor(c) !== c.dueDate) return 'buffer';
  return '';
}
// Hvem fristen tilhører avhenger av status, og det er den viktigste
// domeneregelen på sakssiden: i Fristarkiv er realitetsbrevet sendt, og datoen
// er søkerens frist til å svare oss — ikke vår egen. Den skilnaden skal stå
// skrevet i UI-et, ikke bare ligge i beleggberegningen.
// Rene funksjoner — se test/sakLayout.test.js.
function fristOwnerLabel(c) {
  if (!c || c.type === 'oppdrag') return 'Frist';
  if (c.status === 'fristarkiv') return 'Søkers frist';
  if (c.status === 'ny' || c.status === 'viderebehandling') return 'Din frist';
  return 'Frist';
}

// Hvor lang tid som gjenstår, målt i den enheten fristen faktisk bruker.
// Arbeidsdager er saksbehandlerens målestokk; søkeren svarer etter kalenderen,
// og en forfalt frist er forfalt i kalenderdager uansett hvem den tilhørte.
// Ren funksjon — se test/sakFristCountdown.test.js.
function fristCountdownLabel(c, days, workDays) {
  // Avsluttet: arbeidet er gjort, så en passert frist er ikke overtid.
  if (c && c.status === 'avsluttet') return c.type === 'oppdrag' ? 'Utført' : 'Avsluttet';
  if (days === 0) return 'i dag';
  if (days < 0) {
    var over = Math.abs(days);
    return over + (over === 1 ? ' dag' : ' dager') + ' på overtid';
  }
  var ownDeadline = c && c.type !== 'oppdrag' &&
                    (c.status === 'ny' || c.status === 'viderebehandling');
  if (ownDeadline) return workDays + (workDays === 1 ? ' arbeidsdag' : ' arbeidsdager') + ' igjen';
  return days + (days === 1 ? ' dag' : ' dager') + ' igjen';
}

// CSS-modifikator for nedtellingen. Avsluttet farges aldri, og søkerens frist
// (fristarkiv, ikke oppdrag) er ikke vårt etterslep, så den farges heller ikke.
// Ren funksjon — se test/sakFristCountdown.test.js.
function fristCountdownTone(c, days) {
  if (c && c.status === 'avsluttet') return '';
  if (c && c.type !== 'oppdrag' && c.status === 'fristarkiv') return '';
  if (days < 0) return 'overdue';
  if (days <= 14) return 'urgent';
  return '';
}

function fristOwnerNote(c) {
  if (!c || c.type === 'oppdrag') return 'Avtalt frist for oppdraget.';
  if (c.status === 'fristarkiv') {
    return 'Realitetsbrevet er sendt. Dette er søkerens frist til å svare oss — den koster deg ikke arbeid og teller ikke i belegget.';
  }
  if (c.status === 'ny')               return 'Din frist til å behandle søknaden. Teller i belegget.';
  if (c.status === 'viderebehandling') return 'Din frist til å behandle søkerens svar. Teller i belegget.';
  return '';
}

// caseBufferLabel: teksten i «Buffer (dager)»-feltet på sakssiden — bufferen som
// gjelder, og om den er sakens egen eller standarden for typen. Egen buffer
// fjernes ved statusbytte (statusChangePatch), så en sak i Fristarkiv har aldri
// noen.
function caseBufferLabel(c) {
  if (c && c.status === 'fristarkiv') return 'Ikke aktiv i Fristarkiv';
  var own = c && c.caseBuffer != null;
  var n = own ? c.caseBuffer : typeBufferFor(c);
  if (n < 0) return 'utsatt ' + (-n) + (n === -1 ? ' dag' : ' dager') + ' · egen';
  return n + (n === 1 ? ' dag' : ' dager') + (own ? ' · egen' : ' · standard');
}

// statusChangePatch: feltene som endres når en sak bytter status. Egen buffer
// gjelder fristen den ble satt for; når statusen endres er den fristen
// behandlet, så saken går tilbake til standarden for sin nye type. En sak som
// går videre, er din — «ikke fordelt» fjernes.
// Ren funksjon — se test/typeBuffers.test.js og test/unassigned.test.js.
// Kroken i CASE_STATUS_CHANGE: regner ut rundene etter overgangen og lagrer
// dem i pt_sak_{id} bare når de endres. Gir rundene før (for «Angre»), eller
// null når ingenting ble endret eller lagringen feilet (da varsles brukeren,
// og «Angre» skal ikke ta tilbake en skriving som aldri skjedde).
function applyRoundsTransition(theCase, fromStatus, toStatus, patch, respExtra) {
  var data = loadSakData(theCase.id);
  var before = roundsOf(data);
  var base = data || defaultSakData(0);
  var view = ensureClaims(Object.assign({}, base, { claims: Array.isArray(base.claims) ? base.claims.slice() : [] }));
  var after = roundsAfterTransition(before, {
    from: fromStatus, to: toStatus, isOppdrag: theCase.type === 'oppdrag',
    lettersAfter: lettersSent(patch.history), sakData: view, today: todayStr(),
    deadline: toStatus === 'fristarkiv' ? (patch.dueDate || theCase.dueDate || null) : null,
    response: respExtra
  });
  if (JSON.stringify(after) === JSON.stringify(before)) return null;
  var snapBefore = JSON.parse(JSON.stringify(before));
  base.rounds = after;
  if (!saveSakData(theCase.id, base)) {
    showToast('✗ Runden kunne ikke lagres – lagringsplassen er full', true);
    return null;
  }
  return snapBefore;
}

function statusChangePatch(toStatus, outcome, newDueDate) {
  var patch = { status: toStatus, outcome: normaliseOutcome(toStatus, outcome), caseBuffer: null,
                unassigned: false, unassignedSince: null };
  if (newDueDate) patch.dueDate = newDueDate;
  return patch;
}

// modalCaseBuffer: egen buffer fra «Rediger sak»-feltet. Byttes statusen i
// samme lagring, forkastes den gamle verdien som står igjen i feltet — bare en
// ny verdi skrevet inn nå beholdes. Fristarkiv har ingen buffer. Et negativt
// tall utsetter saken, og gjelder bare Viderebehandling (canPostpone).
// Ren funksjon — se test/typeBuffers.test.js.
function modalCaseBuffer(orig, newStatus, raw) {
  if (newStatus === 'fristarkiv') return null;
  var t = (raw == null ? '' : String(raw)).trim();
  var v = t === '' ? null : parseInt(t, 10) || 0;
  if (v !== null && v < 0 && newStatus !== 'viderebehandling') v = 0;
  if (orig && orig.status !== newStatus && v === (orig.caseBuffer != null ? orig.caseBuffer : null)) return null;
  return v;
}

// Arbeidsvinduet en sak legger beslag på: antall arbeidsdager fram mot fristen
// der saken regnes som arbeid. Helger, røde dager og ferie telles ikke, så
// vinduet strekker seg bakover forbi dem (se workWindowStart). Standardverdier
// per sakstype; brukeren kan endre dem under Innstillinger (workWindows).
// Oppdrag-verdien gjelder bare oppdrag uten egen varighet.
var WORK_WINDOW_DEFAULTS = { ny: 10, viderebehandling: 3, oppdrag: 2 };
var WORK_WINDOW_MAX = 365;

// Til og med v4.41.0 var vinduet kalenderdager, med 14 som standard for Ny.
// Varighetene lagres samlet, så en lagret 14 kan like gjerne være den gamle
// standarden som et eget valg — den regnes som standarden og blir 10
// arbeidsdager. Andre verdier har brukeren valgt selv og beholdes.
var WORK_WINDOW_UNIT_KEY = 'pt_work_window_unit';
function migrateWorkWindowsToWorkdays(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  if (raw.ny !== 14) return raw;
  return Object.assign({}, raw, { ny: 10 });
}

// workWindowStart: første dag i et arbeidsvindu på `days` arbeidsdager som
// slutter på dueStr. Fristdagen teller med når den er en arbeidsdag. Fridager
// (nonWorkday, standard isNonWorkday: helg, røde dager og ferie) hoppes over.
// Ren funksjon når nonWorkday gis — se test/workdayWindows.test.js.
function workWindowStart(dueStr, days, nonWorkday) {
  nonWorkday = nonWorkday || isNonWorkday;
  var d = new Date(dueStr + 'T00:00:00');
  var left = Math.max(1, days || 0);
  // Øvre grense, så løkken alltid stopper selv om hele kalenderen er fri
  for (var i = 0; i < 3660; i++) {
    if (!nonWorkday(d)) { left--; if (left === 0) break; }
    d.setDate(d.getDate() - 1);
  }
  return isoLocalDate(d);
}

// isPlainWeekendRun: om en rekke fridager ([første, siste]) bare er en vanlig
// helg. Et arbeidsvindu går nesten alltid over helger, så de skraveres ikke i
// bjelkene — bare ferie og røde dager på hverdager, der vinduet strekker seg
// lenger enn vanlig. En rekke på mer enn to dager har alltid en hverdag i seg.
function isPlainWeekendRun(run) {
  var a = new Date(run[0] + 'T00:00:00'), b = new Date(run[1] + 'T00:00:00');
  if (Math.round((b - a) / 86400000) > 1) return false;
  return [a, b].every(function(d) { return d.getDay() === 0 || d.getDay() === 6; });
}

// nonWorkdayRuns: sammenhengende fridager fra og med fromStr til og med toStr,
// som [første, siste]-par. Tidslinjen skraverer dem inne i bjelkene.
function nonWorkdayRuns(fromStr, toStr, nonWorkday) {
  nonWorkday = nonWorkday || isNonWorkday;
  var runs = [], cur = null;
  var d = new Date(fromStr + 'T00:00:00');
  for (var i = 0; i < 3660; i++) {
    var iso = isoLocalDate(d);
    if (iso > toStr) break;
    if (nonWorkday(d)) {
      if (cur) cur[1] = iso; else { cur = [iso, iso]; runs.push(cur); }
    } else cur = null;
    d.setDate(d.getDate() + 1);
  }
  return runs;
}

// normalizeWorkWindows: tar lagrede/importerte innstillinger og returnerer et
// fullstendig sett. Hver sakstype valideres for seg — ugyldige verdier faller
// tilbake til standarden uten å ta med seg de gyldige.
function normalizeWorkWindows(raw) {
  var out = {};
  var src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  Object.keys(WORK_WINDOW_DEFAULTS).forEach(function(k) {
    var v = src[k];
    out[k] = (typeof v === 'number' && isFinite(v) && v >= 1 && v <= WORK_WINDOW_MAX)
      ? Math.floor(v) : WORK_WINDOW_DEFAULTS[k];
  });
  return out;
}

// workWindowDays: arbeidsvinduet til en sak i dager. Delt av belegg-beregningen,
// tidslinjen og ferieoverlapp-sjekken, så de tre alltid modellerer samme
// arbeidsmengde. Oppdrag bruker sin egen varighet når den er satt.
function workWindowDays(c) {
  if (c && c.type === 'oppdrag') {
    var d = parseInt(c.duration, 10);
    return d >= 1 ? d : workWindows.oppdrag;
  }
  if (c && c.status === 'viderebehandling') return workWindows.viderebehandling;
  return workWindows.ny;
}

// Bredden på en milepælsbjelke på tidslinjen — en dato det skjer noe på, ikke
// en periode det jobbes i. .tl-bar har min-width, så den er synlig uansett.
var MILESTONE_DAYS = 1;

// Hva en forfalt sak koster i belegget, målt i arbeidsdager fra og med i dag.
//
// Arbeidsvinduet modellerer tiden som er igjen fram til fristen, så det krymper
// etter hvert som fristen nærmer seg og er tomt når fristen har passert. Uten
// en straff ville en forfalt sak derfor kostet null — og det å sprekke på en
// frist ville fått belegget til å se bedre ut, stikk i strid med hva tallet
// skal fortelle deg.
//
// Straffen er fast, ikke voksende: en sak som er ett år på overtid er ikke mer
// arbeid enn en som er én dag på overtid, og et etterslep skal ikke pinne
// måleren til 100 % for alltid. Tre arbeidsdager er valgt fordi en sak med
// frist i morgen allerede koster om lag én til to dager — straffen ligger like
// over, slik at belegget stiger litt når fristen ryker, i stedet for å hoppe
// eller falle.
var OVERDUE_PENALTY_WORKDAYS = 3;

// overduePenaltyOffsets: dagene (antall dager etter today) straffen for en
// forfalt sak bokføres på — de n nærmeste arbeidsdagene fra og med i dag.
// Delt av belegget og forfalt-båndet i tidslinjen, så de treffer samme dager.
// Ren funksjon når nonWorkday gis — se test/workdayWindows.test.js.
function overduePenaltyOffsets(today, n, nonWorkday) {
  nonWorkday = nonWorkday || isNonWorkday;
  var out = [];
  // Øvre grense på letingen slik at løkken alltid terminerer, uansett hvor
  // mange fridager som ligger på rad.
  for (var j = 0; j < 60 && out.length < n; j++) {
    if (!nonWorkday(addDaysLocal(today, j))) out.push(j);
  }
  return out;
}

// countsInBelegg: om saken legger beslag på arbeidstiden din i belegg-kortet.
// Bare de statusene som faktisk er ditt arbeid teller: Ny (førstegangs
// behandling) og Viderebehandling (behandle søkerens svar). Saker i Fristarkiv
// teller ikke — realitetsbrevet er sendt ut, og fristen er søkerens frist til
// å svare oss, ikke vår frist til å gjøre noe. Oppdrag holdes utenfor belegget
// som før. Saker som ikke er fordelt ennå, er ikke ditt arbeid; de vises bare
// som et mulig tillegg (se countsAsPotentialBelegg).
function countsInBelegg(c) {
  if (!c || !c.dueDate) return false;
  if (c.type === 'oppdrag') return false;
  if (isUnassigned(c)) return false;
  return c.status === 'ny' || c.status === 'viderebehandling';
}

// timelineSpanDays: hvor mange dager bjelken til en sak dekker på tidslinjen.
// Saker tegnes som arbeidsvinduet fram mot fristen (workWindowDays). Saker i
// Fristarkiv er ikke arbeid, så de tegnes som en milepæl på selve datoen — den
// markerer når saken kan komme tilbake, og legger dermed heller ikke beslag på
// en hel rad i tidslinjen. Oppdrag i Fristarkiv beholder varigheten sin.
function timelineSpanDays(c) {
  if (c && c.type !== 'oppdrag' && c.status === 'fristarkiv') return MILESTONE_DAYS;
  return workWindowDays(c);
}

// Returns true if any day in the case's working period overlaps a vacation.
// The period runs from the first day of the workday window (workWindowStart)
// to effDueDate (the buffered date for søknader, dueDate for oppdrag). The
// window skips the vacation itself, so this means the work has to be done
// around it.
// Fristarkiv-saker har ingen arbeidsperiode, så de kan aldri kollidere med ferie.
function periodOverlapsVacation(c) {
  if (!c || !c.dueDate) return false;
  if (c.status === 'fristarkiv') return false;
  var endStr  = effDueFor(c);  // buffer-justert for søknader, dueDate for oppdrag
  var sStr    = workWindowStart(endStr, workWindowDays(c));
  return vacations.some(function(v) {
    return sStr <= v.to && endStr >= v.from;
  });
}

// Sakstyper (nøkler) en sak kan filtreres på i tidslinjen: status for vanlige
// saker, eller 'oppdrag' for saker med type==='oppdrag' (uavhengig av status).
var TIMELINE_TYPES = ['ny', 'fristarkiv', 'viderebehandling', 'oppdrag'];

// Sakstypene modaltidslinjen viser. Den er en forhåndsvisning av
// arbeidsbelastningen du planlegger nye saker inn i, og fristarkivsaker ligger
// bare og venter på forfall — de krever ikke arbeid nå og er derfor ikke
// relevante når man legger inn nye saker. De utelates.
var MODAL_TIMELINE_TYPES = TIMELINE_TYPES.filter(function(t) { return t !== 'fristarkiv'; });

// Horisontene (dager fremover) tidslinjen kan zoomes til: 3 mnd, 6 mnd, 1 år.
var TL_HORIZONS = [90, 180, 365];

// normalizeTlView: visningen tidslinjen lagrer mellom øktene — horisont,
// måned/uke og sakstypevalget på Hjem (som saksliste-tidslinjen deler horisont
// og akse med), og horisont og akse i forhåndsvisningen i sak-dialogen. Hvert
// felt faller tilbake til standarden for seg, så én ugyldig verdi ikke koster
// resten. Saksliste-tidslinjens sakstyper lagres ikke; de følger siden.
function normalizeTlView(raw) {
  var src = raw && typeof raw === 'object' ? raw : {};
  function part(p, defaults, withTypes) {
    p = p && typeof p === 'object' ? p : {};
    var out = {
      horizon:  TL_HORIZONS.indexOf(p.horizon) !== -1 ? p.horizon : defaults.horizon,
      axisMode: p.axisMode === 'week' || p.axisMode === 'month' ? p.axisMode : defaults.axisMode
    };
    if (withTypes) {
      // Ukjente og doble sakstyper fjernes; et tomt valg er et gyldig valg.
      out.typeFilter = Array.isArray(p.typeFilter)
        ? p.typeFilter.filter(function(t, i) { return TIMELINE_TYPES.indexOf(t) !== -1 && p.typeFilter.indexOf(t) === i; })
        : defaults.typeFilter.slice();
    }
    return out;
  }
  return {
    home:  part(src.home,  { horizon: 90, axisMode: 'month', typeFilter: ['ny', 'oppdrag'] }, true),
    modal: part(src.modal, { horizon: 90, axisMode: 'month' }, false)
  };
}

// tlViewFromConfig: plukker ut det som lagres fra tidslinjenes levende
// konfigurasjon (_tlConfig).
function tlViewFromConfig(cfg) {
  var h = cfg['home-timeline'], m = cfg['modal-timeline'];
  return {
    home:  { horizon: h.horizon, axisMode: h.axisMode, typeFilter: (h.typeFilter || []).slice() },
    modal: { horizon: m.horizon, axisMode: m.axisMode }
  };
}

// Hvor mange dager tilbake i tid tidslinjen strekker seg, slik at man kan
// scrolle tilbake og se saker som er mer enn et par uker over frist i stedet
// for at de bare telles i "forfalt"-pinnen. Delt av buildTimelineDiv,
// _applyTimelineScroll og drag-håndteringen — de må alle bruke samme verdi
// for at posisjonene (pct/pxPerDay) skal stemme overens.
var TL_PAST_DAYS = 180;

// filterCasesForTimeline: returnerer sakene som matcher et fritt valgt sett
// av sakstyper (typeFilter, en liste av TIMELINE_TYPES-nøkler). Avsluttede
// oppdrag og saker uten forfallsdato er alltid ekskludert.
function filterCasesForTimeline(allCases, typeFilter) {
  var wanted = {};
  (typeFilter || []).forEach(function(t) { wanted[t] = true; });
  return (allCases || []).filter(function(cas) {
    if (!cas || !cas.dueDate) return false;
    if (cas.type === 'oppdrag') return !!wanted.oppdrag && cas.status !== 'avsluttet';
    return !!wanted[cas.status];
  });
}

// timelineRowPriority: hvor høyt en bjelke skal ligge når den overlapper andre.
// Eget arbeid først: Ny og oppdrag (0), så Viderebehandling (1), og
// Fristarkiv (2) nederst — der venter saken på søkeren.
function timelineRowPriority(r) {
  if (r.isOppdrag) return 0;
  if (r.status === 'viderebehandling') return 1;
  if (r.status === 'fristarkiv') return 2;
  return 0;
}

// holidayRuns: røde dager (dager etter i dag) slått sammen til sammenhengende
// felt [fra, til), så julaften–2. juledag blir ett felt og ikke tre streker.
function holidayRuns(days) {
  var sorted = (days || []).slice().sort(function(a, b) { return a - b; });
  var runs = [];
  sorted.forEach(function(d) {
    var last = runs[runs.length - 1];
    if (last && d <= last[1]) last[1] = Math.max(last[1], d + 1);
    else runs.push([d, d + 1]);
  });
  return runs;
}

// holidayLabel: navnene på de røde dagene i et felt, til popupen —
// «Julaften, 1. juledag og 2. juledag».
function holidayLabel(names) {
  var n = (names || []).filter(Boolean);
  if (!n.length) return 'Rød dag';
  if (n.length === 1) return n[0];
  return n.slice(0, -1).join(', ') + ' og ' + n[n.length - 1];
}

// assignTimelineRows: greedy intervall-fargelegging for overlappende
// tidslinje-bjelker. Tar en liste ranges ({start, end, ...}) og returnerer en
// ny liste (samme rekkefølge som input) der hvert element har fått en .row
// (0-indeksert rad), pluss laneCount — antall rader som faktisk trengs.
// Bjelkene plasseres etter prioritet (timelineRowPriority) og deretter start,
// så rekkefølgen på input påvirker ikke resultatet. En bjelke legges alltid
// under alle overlappende bjelker med høyere prioritet, men tar ellers den
// øverste ledige raden. Antall rader er ubegrenset, så tre eller flere
// samtidig overlappende saker stables i stedet for å tegnes oppå hverandre.
function assignTimelineRows(ranges) {
  var indexed = (ranges || []).map(function(r, i) {
    // laneStart: en utsatt sak trenger raden fra fristen, der streken starter
    return { start: r.laneStart != null ? r.laneStart : r.start, end: r.end, prio: timelineRowPriority(r), i: i };
  });
  var sorted = indexed.slice().sort(function(a, b) {
    return (a.prio - b.prio) || (a.start - b.start) || (a.end - b.end);
  });
  var rows = [];       // rows[n] = bjelkene som allerede ligger i rad n
  var rowByIndex = [];
  function overlaps(a, b) { return a.start < b.end && b.start < a.end; }
  sorted.forEach(function(item) {
    var row = 0;
    rows.forEach(function(placed, n) {
      if (placed.some(function(p) { return p.prio < item.prio && overlaps(p, item); })) row = Math.max(row, n + 1);
    });
    while (row < rows.length && rows[row].some(function(p) { return overlaps(p, item); })) row++;
    (rows[row] = rows[row] || []).push(item);
    rowByIndex[item.i] = row;
  });
  var out = (ranges || []).map(function(r, i) { return Object.assign({}, r, { row: rowByIndex[i] }); });
  return { ranges: out, laneCount: rows.length };
}

// tlDueOffset: dager (med brøk) fra `now` til kl. 16 på datoen — fristen gjelder
// til kl. 16. Bjelker, utkast og drag regner alle med denne, så de havner på
// nøyaktig samme sted.
function tlDueOffset(dateStr, now) {
  return (new Date(dateStr + 'T16:00:00') - now) / 86400000;
}

// timelineBarStart: hvor bjelken til en sak starter, i dager relativt til
// `now`, når den slutter på effDue. Arbeidsvinduet starter ved arbeidsslutt
// (kl. 16) dagen før første arbeidsdag i vinduet, så vinduet dekker hele
// arbeidsdager og fridager inni det tegnes med. En milepæl er én dag bred.
function timelineBarStart(cas, effDue, now) {
  var spanDays = timelineSpanDays(cas);
  if (spanDays === MILESTONE_DAYS && cas.type !== 'oppdrag') return tlDueOffset(effDue, now) - MILESTONE_DAYS;
  return tlDueOffset(workWindowStart(effDue, spanDays), now) - 1;
}

// timelineRange: bjelken til en sak, i dager relativt til `now`. start klemmes
// til fortidsvinduet (past) og end til horisonten; end klemmes ikke nedover,
// så en sak som er forfalt lenger enn fortidsvinduet fortsatt kan telles.
function timelineRange(cas, now, horizon, past) {
  var isOp     = cas.type === 'oppdrag';
  var effDue   = effDueFor(cas);
  var spanDays = timelineSpanDays(cas);
  var effEnd   = tlDueOffset(effDue, now);
  var postponed = postponedDaysFor(cas);
  return {
    start:       Math.max(-past, timelineBarStart(cas, effDue, now)),
    end:         Math.min(horizon, effEnd),
    actualEnd:   Math.min(horizon, tlDueOffset(cas.dueDate, now)),
    hasBuffer:   !isOp && cas.dueDate !== effDue,
    canBuffer:   bufferAppliesTo(cas),
    isMilestone: spanDays === MILESTONE_DAYS && !isOp,
    // Første dag i arbeidsvinduet — fridager mellom den og effDue skraveres
    windowStart: spanDays === MILESTONE_DAYS && !isOp ? null : workWindowStart(effDue, spanDays),
    effDue:      effDue,
    isOppdrag:   isOp,
    status:      cas.status,
    // Forfalt fra fristen (for en utsatt sak den faktiske); belegget og
    // forfalt-båndet følger planen (planOverdue).
    isOverdue:   (postponed ? tlDueOffset(cas.dueDate, now) : effEnd) < 0,
    planOverdue: effEnd < 0,
    postponed:   postponed,
    // Streken fra fristen bort til bjelken trenger plass i raden
    laneStart:   postponed ? Math.max(-past, Math.min(timelineBarStart(cas, effDue, now), tlDueOffset(cas.dueDate, now))) : null,
    unassigned:  isUnassigned(cas),
    id:          cas.id,
    caseNumber:  cas.caseNumber,
    title:       cas.title || '',
    dueDate:     cas.dueDate
  };
}

// Hvor mange dager før i dag tidslinjen høyst viser når den åpnes. Forfalte
// saker ligger til venstre for i dag og ville ellers havnet utenfor synsfeltet
// — nettopp de sakene som haster mest. Eldre forfalte saker telles i stedet i
// forfalt-pinnen i venstre kant.
var TL_OVERDUE_LEAD_MAX = 14;

// timelineLeadDays: hvor langt bak i dag synsfeltet skal starte. Nok til å vise
// hele bjelken til de nylig forfalte sakene, men aldri mer enn maxLead; saker
// som er forfalt lenger enn det, påvirker ikke utsnittet.
function timelineLeadDays(ranges, maxLead) {
  var lead = 0;
  (ranges || []).forEach(function(r) {
    if (!r.isOverdue || r.end < -maxLead) return;
    lead = Math.max(lead, Math.min(maxLead, Math.ceil(-r.start) + 1));
  });
  return lead;
}

// overdueLeftOf: forfalte saker som slutter til venstre for `day` (og dermed er
// skjult når synsfeltet starter der), eldste først.
function overdueLeftOf(ranges, day) {
  return (ranges || [])
    .filter(function(r) { return r.isOverdue && r.end < day; })
    .sort(function(a, b) { return a.end - b.end; });
}

// timelineDayAtPx: hvilken dag (relativt til i dag) et pikselpunkt i sporet
// svarer til. Sporet starter `past` dager før i dag.
function timelineDayAtPx(px, pxPerDay, past) {
  return px / pxPerDay - past;
}

// timelineDragBuffer: ny buffer når en bjelke dras dx piksler. Til venstre gir
// større buffer (tidligere frist), til høyre mindre. Holdes mellom min (0 når
// den ikke gis; se minBufferFor) og max.
function timelineDragBuffer(origBuffer, dx, pxPerDay, max, min) {
  var b = origBuffer - Math.round(dx / pxPerDay);
  return Math.max(min == null ? 0 : min, Math.min(max, b));
}

// Omtrentlig bredde per tegn i bjelke-etiketten og plassen rundt den (px).
var TL_LABEL_CHAR_PX = 7;
var TL_LABEL_PAD_PX  = 14;

// timelineBarLabel: etiketten en bjelke har plass til. Får ikke hele
// saksnummeret plass, vises de siste sifrene («…1005») — det er dem som skiller
// sakene fra hverandre, ikke årstallet foran. Er det ikke plass til fire
// sifre, vises ingenting; saksnummeret står uansett i popupen.
function timelineBarLabel(caseNumber, widthPx) {
  var cn = String(caseNumber || '');
  var room = Math.floor((widthPx - TL_LABEL_PAD_PX) / TL_LABEL_CHAR_PX);
  if (room >= cn.length) return cn;
  if (room < 5) return '';
  return '…' + cn.slice(-(room - 1));
}

// Hvor mange piksler av en bjelke som må synes før den regnes som synlig.
// En stripe på et par piksler i kanten ser du ikke, så da vises kantpilen.
var TL_EDGE_MIN_VISIBLE_PX = 6;

// timelineEdgeSide: hvilken side av synsfeltet en bjelke ligger utenfor
// ('left' / 'right'), eller null når den synes. Alle verdier er piksler i
// samme koordinatsystem.
function timelineEdgeSide(barLeft, barRight, viewLeft, viewRight) {
  if (barRight <= viewLeft + TL_EDGE_MIN_VISIBLE_PX) return 'left';
  if (barLeft >= viewRight - TL_EDGE_MIN_VISIBLE_PX) return 'right';
  return null;
}

// timelineEdgeLabel: teksten i kantpilen — saksnummeret med en pil mot siden
// bjelken ligger på.
function timelineEdgeLabel(caseNumber, side) {
  return side === 'left' ? '← ' + caseNumber : caseNumber + ' →';
}

// timelineDueInfo: frist-linjen i tidslinje-popupen. Viser den faktiske fristen,
// og når saken har buffer også datoen nedtellingen faktisk måles mot. For en
// utsatt sak (postponed dager) måles nedtellingen mot fristen, og datoen den
// er planlagt til står sist.
function timelineDueInfo(dueTxt, effTxt, days, wdays, postponed) {
  var parts = [];
  if (dueTxt) parts.push('frist ' + dueTxt);
  if (effTxt && !postponed) parts.push('buffret til ' + effTxt);
  if (days !== null && days !== undefined) parts.push(days < 0 ? Math.abs(days) + 'd forfalt' : days === 0 ? 'i dag' : days + 'd');
  if (wdays !== null && wdays !== undefined) parts.push(wdays + ' arb.dager');
  if (effTxt && postponed) parts.push('planlagt ' + effTxt + ' (+' + postponed + ' d)');
  return parts.join(' · ');
}

// Høyder i sporet (px). Én rad gir full bjelkehøyde; flere rader gir smalere,
// ensartede rader. Forfalt-båndene ligger under bjelkene.
var TL_LANE = { pad: 4, gap: 3, full: 40, lane: 18, band: 5, bandGap: 2, bandTop: 3 };

// timelineLaneGeometry: høydene sporet tegnes med for `lanes` rader og `bands`
// forfalt-bånd.
function timelineLaneGeometry(lanes, bands) {
  lanes = Math.max(1, lanes || 0);
  bands = Math.max(0, bands || 0);
  var barH     = lanes <= 1 ? TL_LANE.full : TL_LANE.lane;
  var contentH = lanes <= 1 ? TL_LANE.full : lanes * TL_LANE.lane + (lanes - 1) * TL_LANE.gap;
  var bandsH   = bands ? TL_LANE.bandTop + bands * TL_LANE.band + (bands - 1) * TL_LANE.bandGap : 0;
  return { barH: barH, contentH: contentH, bandsH: bandsH, trackH: TL_LANE.pad + contentH + bandsH + TL_LANE.pad };
}

// visibleLaneCount: hvor mange rader bjelkene i utsnittet fromDay–toDay
// bruker (minst én). Sporet får bare så mange rader, så en opphopning langt
// utenfor bildet ikke gjør bjelkene du ser, tynne.
function visibleLaneCount(ranges, fromDay, toDay) {
  var n = 1;
  (ranges || []).forEach(function(r) {
    if (r.end > fromDay && r.start < toDay) n = Math.max(n, r.row + 1);
  });
  return n;
}

// timelineOverdueBands: forfalt-båndene — ett per sak belegget straffer for
// forfalt (planen er passert; Ny og Viderebehandling, fordelt, ikke oppdrag).
// En utsatt sak er forfalt fra fristen, men straffes først når planen er
// passert, som belegget (planOverdue). Båndene ligger over de samme
// arbeidsdagene som belegget bokfører straffen på (penaltyOffsets, se
// overduePenaltyOffsets). Dagene slås sammen til sammenhengende stykker
// [fra, til) i dager etter i dag.
function timelineOverdueBands(ranges, penaltyOffsets) {
  var segs = [];
  (penaltyOffsets || []).forEach(function(d) {
    var last = segs[segs.length - 1];
    if (last && last[1] === d) last[1] = d + 1; else segs.push([d, d + 1]);
  });
  if (!segs.length) return [];
  return (ranges || []).filter(function(r) {
    return r.planOverdue && !r.isOppdrag && !r.unassigned && (r.status === 'ny' || r.status === 'viderebehandling');
  }).map(function(r) {
    return { id: r.id, caseNumber: r.caseNumber, segments: segs.map(function(s) { return s.slice(); }) };
  });
}

// bufferWord: en buffer i dra-brikken — negativ buffer er en utsettelse.
function bufferWord(n) {
  return n < 0 ? 'utsatt ' + (-n) : String(n);
}

// timelineDragChip: teksten i brikken over en bjelke som dras — bufferen før
// og nå, og datoene det gir. warn: saken er utsatt mer enn POSTPONE_WARN_DAYS.
// blocked: bjelken er dratt mot fristen og kan ikke gå forbi den.
function timelineDragChip(origBuffer, newBuffer, typeDefault, effTxt, dueTxt, blocked) {
  var head = 'Buffer ' + bufferWord(origBuffer) + ' → ' + bufferWord(newBuffer) +
             (Math.abs(newBuffer) === 1 ? ' dag' : ' dager') +
             (newBuffer === typeDefault ? ' · standard' : '');
  var warn = -newBuffer > POSTPONE_WARN_DAYS;
  var sub = blocked ? 'Bare viderebehandling kan flyttes etter fristen'
          : warn ? 'Over ' + POSTPONE_WARN_DAYS + ' dager etter fristen · planlagt ' + effTxt
          : newBuffer < 0 ? 'planlagt ' + effTxt + ' · frist ' + dueTxt
          : (newBuffer > 0 ? 'buffret til ' + effTxt + ' · ' : '') + 'frist ' + dueTxt;
  return { head: head, sub: sub, warn: warn };
}

// Popupen i tidslinjen venter litt før den vises, så den ikke blafrer når du
// bare fører musen over sporet. Står en popup allerede (eller ble den nettopp
// lukket), byttes den med en gang når du går videre til neste bjelke.
var TL_POPUP_DELAY_MS = 500;
var TL_POPUP_WARM_MS  = 300;
// Luft mellom popupen og sporet, og til vinduskanten (px); pilen står i den.
var TL_POPUP_GAP_PX   = 8;

// timelinePopupDelay: hvor lenge popupen skal vente (ms) — 0 når en popup
// står, eller ble lukket for under TL_POPUP_WARM_MS siden.
function timelinePopupDelay(isVisible, msSinceHidden) {
  return isVisible || msSinceHidden < TL_POPUP_WARM_MS ? 0 : TL_POPUP_DELAY_MS;
}

// timelinePopupPosition: hvor popupen står (vinduskoordinater). Over sporet
// (trackTop–trackBottom), så den ikke dekker bjelkene; under når det ikke er
// plass over; passer den ingen av stedene, på siden med mest plass, holdt
// innenfor vinduet. Vannrett midtstilt på anchorX (musen, eller midt på
// bjelken med tastaturet) og innenfor vinduet. arrowX er hvor pilen peker,
// målt fra popupens venstre kant; below sier at pilen peker opp.
function timelinePopupPosition(anchorX, trackTop, trackBottom, popupW, popupH, viewportW, viewportH) {
  var gap = TL_POPUP_GAP_PX;
  var left = Math.max(gap, Math.min(anchorX - popupW / 2, viewportW - popupW - gap));
  var arrowX = Math.max(10, Math.min(popupW - 10, anchorX - left));
  var roomAbove = trackTop - gap - gap;
  var roomBelow = viewportH - trackBottom - gap - gap;
  var below = popupH > roomAbove && (popupH <= roomBelow || roomBelow > roomAbove);
  var top = below
    ? Math.max(gap, Math.min(trackBottom + gap, viewportH - popupH - gap))
    : Math.max(gap, trackTop - gap - popupH);
  return { left: Math.round(left), top: Math.round(top), arrowX: Math.round(arrowX), below: below };
}

// timelineKeyBuffer: ny buffer når Alt + pil trykkes på en bjelke. Pil til
// venstre flytter bjelken tidligere (større buffer), til høyre senere — som
// når den dras, og med samme grenser. null for andre taster.
function timelineKeyBuffer(origBuffer, key, max, min) {
  var step = key === 'ArrowLeft' ? 1 : key === 'ArrowRight' ? -1 : 0;
  if (!step) return null;
  return Math.max(min == null ? 0 : min, Math.min(max, origBuffer + step));
}

var cases = loadCases();

// Saksdetaljer (pt_sak_<id>) for saker som ikke finnes lenger. Alt med
// prefikset regnes som saksdata, så innstillinger må aldri lagres under det.
// Ren funksjon — se test/dataIntegrity.test.js.
function orphanSakKeys(keys, ids, prefix) {
  return keys.filter(function(k) {
    return typeof k === 'string' && k.indexOf(prefix) === 0 && !ids[k.slice(prefix.length)];
  });
}

// Rydd opp foreldreløse pt_sak_*-nøkler (saker slettet før opprydding ble innført)
(function() {
  var raw = null;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch(e) { return; }
  if (!raw) return; // ingen sakliste — ikke rydd (kan være første oppstart)
  var ids = {};
  try { (JSON.parse(raw) || []).forEach(function(c) { if (c && c.id) ids[c.id] = true; }); }
  catch(e) { return; } // korrupt sakliste — ikke rydd
  var keys = [];
  for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
  orphanSakKeys(keys, ids, SAK_KEY_PREFIX).forEach(function(k) { try { localStorage.removeItem(k); } catch(e) {} });
})();

// ── CPC-database ───────────────────────────────────
var _cpcDb = null;
var _cpcKeys = null;
var _cpcKeysNorm = null; // nøkler uten whitespace, store bokstaver — for raskt prefikssøk
var _CPC_DB_NAME = 'PatentDeskCPC';
var _CPC_STORE   = 'classes';
var _CPC_KEY     = 'all';
var _CPC_VERSION = 1; // øk ved framtidige endringer i CPC-lagerets struktur

// ── CPC-søk ────────────────────────────────────────
function cpcSearch(query) {
  if (!_cpcDb || !query) return [];
  var q = query.replace(/\s+/g, '').toUpperCase();
  var results = [];
  for (var i = 0; i < _cpcKeys.length && results.length < 10; i++) {
    if (_cpcKeysNorm[i].indexOf(q) === 0) {
      results.push({ code: _cpcKeys[i], title: _cpcDb[_cpcKeys[i]].t });
    }
  }
  return results;
}

// ── CPC-UI-funksjoner er definert i SEKSJON 5 ──────
// _cpcSetBanner, _cpcSetLoaded, _cpcShowNotice, _cpcHideNotice,
// _cpcCheckFirstTime, _cpcUpdateSettingsStatus

function _cpcLoaded(data) {
  // Valider at det er nytt format ({t, l}) og ikke gammelt (streng-verdier)
  var keys = Object.keys(data);
  if (keys.length > 0 && typeof data[keys[0]] === 'string') {
    showToast('Gammelt CPC-format oppdaget — last inn ny cpc_v2.json.');
    return;
  }
  _cpcDb   = data;
  _cpcKeys = keys;
  // Forhåndsnormaliser nøklene én gang, så søk slipper replace/toUpperCase per nøkkel per tastetrykk
  _cpcKeysNorm = keys.map(function(k) { return k.replace(/\s+/g, '').toUpperCase(); });
  _cpcSetLoaded();
  _cpcHideNotice();
}

// ── IndexedDB helpers ──────────────────────────────
function _cpcOpenDb(cb) {
  var req;
  // indexedDB.open kan kaste synkront (privat modus, blokkert lagring)
  try { req = indexedDB.open(_CPC_DB_NAME, _CPC_VERSION); }
  catch(e) { cb(e); return; }
  req.onupgradeneeded = function(e) {
    // Idempotent oppretting, så fremtidige versjonsløft ikke kaster «store finnes allerede»
    var db = e.target.result;
    if (!db.objectStoreNames.contains(_CPC_STORE)) db.createObjectStore(_CPC_STORE);
  };
  req.onsuccess = function(e) { cb(null, e.target.result); };
  req.onerror   = function(e) { cb((e.target && e.target.error) || new Error('IndexedDB utilgjengelig')); };
}

function _cpcSaveToDb(data, cb) {
  _cpcOpenDb(function(err, db) {
    if (err) { cb(err); return; }
    var tx = db.transaction(_CPC_STORE, 'readwrite');
    tx.objectStore(_CPC_STORE).put(data, _CPC_KEY);
    tx.oncomplete = function() { cb(null); };
    tx.onerror    = function(e) { cb(e.target.error); };
  });
}

function _cpcLoadFromDb(cb) {
  _cpcOpenDb(function(err, db) {
    if (err) { cb(err); return; }
    var req = db.transaction(_CPC_STORE, 'readonly').objectStore(_CPC_STORE).get(_CPC_KEY);
    req.onsuccess = function(e) { cb(null, e.target.result || null); };
    req.onerror   = function(e) { cb(e.target.error); };
  });
}

function _cpcTryLoadFromDb() {
  _cpcSetBanner('<span class="cpc-banner-loading"><span class="spinner" aria-hidden="true"></span>Laster…</span>');
  _cpcLoadFromDb(function(err, data) {
    if (err || !data) {
      _cpcSetBanner(
        '<span class="cpc-banner-text">Autofullfør ikke tilgjengelig</span>' +
        '<button class="cpc-load-banner-btn" id="btn-cpc-load">Last inn</button>'
      );
      _initCpcLoadButton();
      _cpcCheckFirstTime();
      return;
    }
    _cpcLoaded(data);
    _cpcHideNotice();
  });
}

// Migrer pt_sak_*: fjern desc fra klasser i eksisterende data.
// Engangsjobb — flagget hindrer at alle nøkler itereres ved hver oppstart.
(function() {
  // NB: flagget må ikke starte med pt_sak_ — da ville oppryddingen av foreldreløse nøkler slettet det
  try { if (localStorage.getItem('pt_desc_stripped') === '1') return; } catch(e) { return; }
  for (var i = 0; i < localStorage.length; i++) {
    var key = localStorage.key(i);
    if (!key || key.indexOf(SAK_KEY_PREFIX) !== 0) continue;
    try {
      var d = JSON.parse(localStorage.getItem(key));
      if (d && Array.isArray(d.classes) && d.classes.some(function(c) { return c.desc !== undefined; })) {
        d.classes = d.classes.map(function(c) { return { code: c.code, inUse: c.inUse }; });
        localStorage.setItem(key, JSON.stringify(d));
      }
    } catch(e) {}
  }
  try { localStorage.setItem('pt_desc_stripped', '1'); } catch(e) {}
})();

var stats = loadStats();
var medlesing = loadMedlesing();
var activeMedlesingId = null;
var vacations = loadVacations();
var productionGoal = loadGoal();
var beleggHorizon  = loadBeleggHorizon();
var typeBuffers    = loadTypeBuffers();
var workWindows    = loadWorkWindows();
var deadlines      = loadDeadlines();
var homeDeadlineFilter = loadHomeDeadlineFilter();
var docLayout = loadDocLayout();
var activeCase = loadActiveCase();
var unassignedReminder = loadUnassignedReminder();
var medleserList = loadMedleserList();
var medlLog      = loadMedlLog();
var _tlView = loadTlView();
var _tlConfig = {
  'home-timeline':  { horizon: _tlView.home.horizon, axisMode: _tlView.home.axisMode, typeFilter: _tlView.home.typeFilter.slice() },
  'cases-timeline': { horizon: _tlView.home.horizon, axisMode: _tlView.home.axisMode, typeFilter: ['ny', 'oppdrag'] },
  'modal-timeline': { horizon: _tlView.modal.horizon, axisMode: _tlView.modal.axisMode, typeFilter: MODAL_TIMELINE_TYPES.slice() },
};
// Saksliste-tidslinjen forhåndskrysser av sakstypen(e) som svarer til siden du
// står på; brukeren kan fritt overstyre valget mens den står på siden.
// Nullstilles kun når aktiv side faktisk endres, ikke ved hver render().
var _tlPageDefaults = {
  ny:               ['ny', 'oppdrag'],
  fristarkiv:       ['fristarkiv'],
  viderebehandling: ['viderebehandling'],
  oppdrag:          ['oppdrag']
};
var _tlLastCasesPage = null;

