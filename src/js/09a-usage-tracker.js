// ── Bruksstatistikk ────────────────────────────────
// Valgfri (av som standard): teller klikk per funksjon og dag, og skriver
// tellerne til usage.json i datamappen. Bare funksjons-ID og antall lagres —
// aldri saksinnhold. Funksjons-ID-en utledes fra markeringen (data-feature,
// id, data-page, data-settings-tab, data-sak-section m.fl.), så nye knapper blir
// med uten et eget register. Tellere som ikke kan skrives ennå (ingen
// datamappe eller tilgang) venter i localStorage (pt_usage_buf).
var USAGE_ENABLED_KEY = 'pt_usage_enabled';
var USAGE_BUF_KEY     = 'pt_usage_buf';
var USAGE_INFLIGHT_KEY = 'pt_usage_inflight'; // det som skrives akkurat nå, til skrivingen er bekreftet
var USAGE_FILE_NAME   = 'usage.json';
var USAGE_STATIC_SEL  = 'button, a[href], select, summary, [role="tab"], input[type="checkbox"], input[type="radio"], [data-feature]';
var _USAGE_FLUSH_MS   = 5000;
// Funksjoner som tegnes av koden og derfor ikke finnes i markeringen når «Bruk»
// åpnes. Listen gir dem et navn i «Aldri brukt». Den holdes i takt med koden av
// test/usage.test.js: en ny tegnet knapp uten oppføring (eller en oppføring uten
// knapp) stopper testene. Nøkkelen er funksjons-ID-en, verdien visningsnavnet.
var USAGE_DYNAMIC_FEATURES = {
  'home-row-more': 'Hjem: Flere handlinger (⋯)',
  'log-edit-date': 'Sakslogg: Endre dato',
  'priorart-delete': 'Mothold: Merk ikke lenger relevant (slett)',
  'backup-restore-snapshot': 'Gjenopprett øyeblikksbilde',
  'btn-cpc-empty-add': 'CPC: Legg til klasse (tom liste)',
  'btn-cpc-notice-dismiss': 'CPC-varsel: Lukk',
  'btn-cpc-notice-load': 'CPC-varsel: Last inn',
  'btn-cpc-reload': 'CPC: Last inn på nytt',
  'btn-empty-clear-filter': 'Tom liste: Tøm filter',
  'btn-mh-empty-add': 'Mothold: Legg til (tom liste)',
  'btn-undo-action': 'Angre',
  'bulk-delete-row': 'Bulk-import: Fjern rad',
  'bulk-select-row': 'Bulk-import: Velg rad',
  'checklist-add-item': 'Sjekkliste: Legg til punkt',
  'checklist-delete-item': 'Sjekkliste: Slett punkt',
  'checklist-toggle-item': 'Sjekkliste: Kryss av punkt',
  'claim-change-changed': 'Krav: Endret',
  'claim-change-unchanged': 'Krav: Uendret',
  'claim-dependency-reset': 'Krav: Tilbake til automatisk tilhørighet',
  'claim-dependency-toggle': 'Krav: Selvstendig/uselvstendig',
  'claim-doc-popover': 'Krav: Velg mothold',
  'claim-doc-popover-copy': 'Krav: Kopier mothold fra forrige krav',
  'claim-doc-popover-option': 'Krav: Velg ett mothold i listen',
  'claim-formal': 'Krav: Formell vurdering',
  'claim-inventive': 'Krav: Oppfinnelseshøyde',
  'claim-inventive-inherited': 'Krav: Oppfinnelseshøyde (arvet)',
  'claim-novelty': 'Krav: Nyhet',
  'claim-novelty-inherited': 'Krav: Nyhet (arvet)',
  'claim-origin': 'Krav: Opphav i brev',
  'claim-p13': 'Krav: § 13-grunnlag',
  'class:btn-active-toggle': 'Meny: Marker som pågående / fjern markering',
  'class:btn-card-hist': 'Sakskort: Historikk',
  'class:btn-card-more': 'Sakskort: Flere handlinger (⋯)',
  'class:btn-copy-path': 'Meny: Kopier sti',
  'class:btn-del': 'Meny: Slett sak',
  'class:btn-edit': 'Meny: Rediger sak',
  'class:btn-home-del': 'Hjem: Slett',
  'class:btn-home-edit': 'Hjem: Rediger',
  'class:btn-medl-return': 'Medlesing: Tilbake fra medlesing',
  'class:btn-medl-send': 'Medlesing: Send/endre medlesing',
  'class:btn-medleser-del': 'Medlesere: Fjern fra lista',
  'class:btn-row-action': 'Kortmeny: Statushandling (Brev sendt / Svar mottatt / Avgjør / Utført)',
  'class:btn-row-outcome': 'Kortmeny: Endre utfall',
  'class:btn-sak-class-del': 'Saken: Fjern CPC-klasse',
  'class:btn-sak-copy-path': 'Saken: Kopier sti',
  'class:btn-sak-del': 'Saken: Slett',
  'class:btn-sak-edit': 'Saken: Rediger',
  'class:btn-sak-outcome': 'Saken: Utfall',
  'class:btn-unassigned-drop': 'Ikke fordelt: Fikk den ikke (slett)',
  'class:btn-unassigned-off': 'Ikke fordelt: Bekreft fordelt',
  'class:btn-unassigned-on': 'Ikke fordelt: Marker som ikke fordelt',
  'class:btn-vac-del': 'Ferie: Slett',
  'class:btn-vac-edit': 'Ferie: Rediger',
  'cpc-in-use': 'CPC: I bruk',
  'datepicker-next-month': 'Datovelger: Neste måned',
  'datepicker-open': 'Datovelger: Åpne',
  'datepicker-pick-day': 'Datovelger: Velg dag',
  'datepicker-prev-month': 'Datovelger: Forrige måned',
  'doc-copy-path': 'Dokument: Kopier sti',
  'doc-delete': 'Dokument: Slett',
  'doc-open': 'Dokument: Åpne',
  'doc-rename': 'Dokument: Endre navn',
  'docpane-file-pick': 'Dokumentpanel: Velg fil',
  'history-cancel-date': 'Historikk: Avbryt datoendring',
  'history-edit-date': 'Historikk: Endre dato',
  'history-save-date': 'Historikk: Lagre dato',
  'list-sort-column': 'Liste: Sorter kolonne',
  'medlesing-open-case': 'Medlesing: Åpne sak',
  'medlesing-reader-active': 'Medlesere: Aktiv',
  'medlesing-toggle-item': 'Medlesing: Kryss av punkt',
  'objection-add': 'Innvending: Legg til',
  'objection-backfill': 'Innvending: Lagre nåværende vurdering som runde',
  'objection-cancel': 'Innvending: Avbryt',
  'objection-delete': 'Innvending: Slett',
  'objection-is-new': 'Innvending: Ny i denne runden',
  'objection-state': 'Innvending: Endre status',
  'objection-submit': 'Innvending: Legg til (send skjema)',
  'priorart-cited-elsewhere': 'Mothold: Også mothold i andre saker',
  'priorart-cited-open': 'Mothold: Åpne sak der det er mothold',
  'priorart-edit': 'Mothold: Rediger',
  'priorart-flag': 'Mothold: P/E/D-markering',
  'priorart-goto-details': 'Mothold: Vis i Detaljer',
  'priorart-ops': 'Mothold: Hent fra EPO OPS',
  'priorart-restore': 'Mothold: Gjenopprett',
  'reply-toggle-item': 'Svar: Kryss av punkt',
  'sak-frist-unpostpone': 'Saken: Fjern utsettelse',
  'section-fold': 'Saken: Brett ut/sammen seksjon',
  'tag-remove': 'Stikkord: Fjern',
  'timeline-chip': 'Tidslinje: Filterchip',
  'timeline-horizon': 'Tidslinje: Horisont',
  'timeline-pin': 'Tidslinje: Forfalte saker utenfor bildet',
  'update-download-link': 'Oppdatering: Last ned',
  'workfile-grant-access': 'Arbeidsfil: Gi tilgang',
  'workfile-grant-later': 'Arbeidsfil: Senere',
};
var _usageTimer    = null;
var _usageFlushing = false;
var _usageRange    = '30';
var _usageResetArmed = null;
var _usageRenderSeq = 0;

// ── Rene funksjoner ────────────────────────────────
// Funksjons-ID for ett element, eller null. Aldri innhold fra saker: bare
// faste navn og verdier fra markeringen. Se test/usage.test.js.
function usageFeatureKey(el) {
  if (!el) return null;
  var ds = el.dataset || {};
  if (ds.feature) return String(ds.feature);
  if (el.id) return String(el.id);
  if (ds.page) return 'page:' + ds.page;
  if (ds.settingsTab) return 'tab:' + ds.settingsTab;
  if (ds.sakSection) return 'section:' + ds.sakSection;
  if (ds.gotoSettingsTab) return 'goto-tab:' + ds.gotoSettingsTab;
  if (ds.anchor) return 'anchor:' + ds.anchor;
  if (ds.status) return 'status:' + ds.status;
  if (ds.kind && ds.when) return 'filter:' + ds.kind + ':' + ds.when;
  if (el.type === 'radio' && el.name) return 'radio:' + el.name + ':' + el.value;
  // Dynamisk tegnede knapper bærer saksdata i data-attributtene (data-id,
  // data-cn …) — de brukes ALDRI. Klassen btn-… er innholdsfri og skiller dem.
  // Generelle stilklasser (btn-primary …) slår mange ulike knapper sammen og teller ikke.
  var cls = typeof el.className === 'string' ? el.className.split(/\s+/) : [];
  for (var i = 0; i < cls.length; i++) {
    if (/^btn-[a-z0-9-]+$/.test(cls[i]) && !/^btn-(primary|secondary|danger|icon|sm)$/.test(cls[i])) return 'class:' + cls[i];
  }
  return null;
}

function usageIsEmpty(log) {
  return !log || !log.days || Object.keys(log.days).length === 0;
}

// Nøkler som finnes på alle objekter ('constructor', '__proto__' …) kan ikke
// brukes som teller-ID.
function _usageBadKey(k) { return k in Object.prototype; }

// Gyldig logg ut, eller null hvis innholdet ikke er en bruksfil. Ugyldige
// datoer og tellere (ikke-heltall, ≤ 0) kastes bort.
function usageNormalizeLog(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  if (!p.days || typeof p.days !== 'object' || Array.isArray(p.days)) return null;
  var re = /^\d{4}-\d{2}-\d{2}$/;
  var out = { v: 1, days: {}, versions: {} };
  Object.keys(p.days).forEach(function(day) {
    if (!re.test(day) || !p.days[day] || typeof p.days[day] !== 'object') return;
    Object.keys(p.days[day]).forEach(function(id) {
      var n = p.days[day][id];
      if (_usageBadKey(id) || typeof n !== 'number' || n < 1 || Math.floor(n) !== n) return;
      if (!out.days[day]) out.days[day] = {};
      out.days[day][id] = n;
    });
  });
  if (p.versions && typeof p.versions === 'object' && !Array.isArray(p.versions)) {
    Object.keys(p.versions).forEach(function(ver) {
      if (!_usageBadKey(ver) && typeof p.versions[ver] === 'string' && re.test(p.versions[ver])) out.versions[ver] = p.versions[ver];
    });
  }
  return out;
}

// Sant hvis normaliseringen ikke kaster bort noe: ukjent versjon, ukjente felt
// eller ugyldige oppføringer gjør at filen må sikkerhetskopieres før den skrives om.
function usageIsLossless(p) {
  var n = usageNormalizeLog(p);
  if (!n || p.v !== 1) return false;
  if (Object.keys(p).some(function(k) { return k !== 'v' && k !== 'days' && k !== 'versions'; })) return false;
  return JSON.stringify(n.days) === JSON.stringify(p.days) &&
    JSON.stringify(n.versions) === JSON.stringify(p.versions || {});
}

// Summerer to logger uten å endre dem; versjonsdatoen er den tidligste.
function usageMerge(a, b) {
  var out = { v: 1, days: {}, versions: {} };
  [a, b].forEach(function(log) {
    if (!log) return;
    Object.keys(log.days || {}).forEach(function(day) {
      if (!out.days[day]) out.days[day] = {};
      Object.keys(log.days[day]).forEach(function(id) {
        if (_usageBadKey(id)) return;
        out.days[day][id] = (out.days[day][id] || 0) + log.days[day][id];
      });
    });
    Object.keys(log.versions || {}).forEach(function(ver) {
      if (_usageBadKey(ver)) return;
      if (!out.versions[ver] || log.versions[ver] < out.versions[ver]) out.versions[ver] = log.versions[ver];
    });
  });
  return out;
}

function usageBump(log, day, id, version) {
  if (_usageBadKey(id)) return log;
  if (!log.days[day]) log.days[day] = {};
  log.days[day][id] = (log.days[day][id] || 0) + 1;
  if (version && !_usageBadKey(version) && !log.versions[version]) log.versions[version] = day;
  return log;
}

// Første dag i vinduet (inkludert i dag), eller '' for «alt».
function usageRangeStart(today, range) {
  var n = parseInt(range, 10);
  if (!(n > 0)) return '';
  var p = today.split('-');
  var d = new Date(+p[0], +p[1] - 1, +p[2] - (n - 1));
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// used: brukt i perioden (flest først). idle: brukt tidligere, men ikke i
// perioden. never: kjent funksjon som aldri er logget.
function usageSummarize(log, ids, today, range) {
  var start = usageRangeStart(today, range);
  var inWin = Object.create(null), lastIn = Object.create(null), lastAll = Object.create(null);
  Object.keys(log.days || {}).forEach(function(day) {
    Object.keys(log.days[day]).forEach(function(id) {
      if (!lastAll[id] || day > lastAll[id]) lastAll[id] = day;
      if (day < start) return;
      inWin[id] = (inWin[id] || 0) + log.days[day][id];
      if (!lastIn[id] || day > lastIn[id]) lastIn[id] = day;
    });
  });
  var used = Object.keys(inWin).map(function(id) { return { id: id, count: inWin[id], last: lastIn[id] }; });
  used.sort(function(a, b) { return b.count - a.count || (a.id < b.id ? -1 : 1); });
  var idle = Object.keys(lastAll).filter(function(id) { return !inWin[id]; })
    .map(function(id) { return { id: id, last: lastAll[id] }; });
  idle.sort(function(a, b) { return a.last < b.last ? 1 : a.last > b.last ? -1 : (a.id < b.id ? -1 : 1); });
  var never = (ids || []).filter(function(id, i, arr) { return !_usageBadKey(id) && !lastAll[id] && arr.indexOf(id) === i; }).sort();
  return { used: used, idle: idle, never: never };
}

// ── Innstilling og innsamling ──────────────────────
// Tellerne leses fra og skrives til localStorage hver gang (ingen kopi i
// minnet), så flere faner ikke overskriver hverandres tellere.
function usageEnabled() {
  try { return localStorage.getItem(USAGE_ENABLED_KEY) === '1'; } catch(e) { return false; }
}

function _usageEmpty() { return { v: 1, days: {}, versions: {} }; }

function _usageBufRead(key) {
  var raw = null, parsed = null;
  try { raw = localStorage.getItem(key); } catch(e) { raw = null; }
  try { parsed = raw ? usageNormalizeLog(JSON.parse(raw)) : null; } catch(e) { parsed = null; }
  return parsed || _usageEmpty();
}

function _usageBufWrite(key, log) {
  try {
    if (usageIsEmpty(log)) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(log));
  } catch(e) {}
}

function usageRecord(id) {
  if (!usageEnabled()) return;
  var d = _usageBufRead(USAGE_BUF_KEY);
  usageBump(d, todayStr(), id, APP_VERSION);
  _usageBufWrite(USAGE_BUF_KEY, d);
  usageScheduleFlush();
}

// Sidevisning, kalt fra navigateTo. Bare sidetypen (sak/<id> blir «sak»).
function usageRecordNav(page) {
  if (typeof page !== 'string' || !page) return;
  try { usageRecord('page:' + page.split('/')[0]); } catch(e) {}
}

function usageSetEnabled(on) {
  try { localStorage.setItem(USAGE_ENABLED_KEY, on ? '1' : '0'); } catch(e) {}
  return on ? Promise.resolve() : usageFlush(); // det som er talt hittil, skal ikke gå tapt
}

document.addEventListener('click', function(e) {
  if (!usageEnabled() || e.isTrusted === false) return; // skript-klikk er ikke bruk
  try {
    var t = e.target && e.target.closest ? e.target.closest(USAGE_STATIC_SEL) : null;
    var key = usageFeatureKey(t);
    // Sidevisninger telles i navigateTo (også saker som åpnes fra kort og rader)
    if (key && key.indexOf('usage-') !== 0 && key.indexOf('page:') !== 0) usageRecord(key);
  } catch(err) {}
}, true);

// ── Fil ────────────────────────────────────────────
function usageScheduleFlush() {
  if (_usageTimer) return;
  _usageTimer = setTimeout(function() { _usageTimer = null; usageFlush(); }, _USAGE_FLUSH_MS);
}

function _usageDirReady() {
  if (!_bkDirHandle || !_bkFsaSupported()) return Promise.resolve(false);
  return _bkDirHandle.queryPermission({ mode: 'readwrite' }).then(function(p) { return p === 'granted'; }).catch(function() { return false; });
}

// Filskriving går i kø på tvers av faner når nettleseren har Web Locks
function _usageWithLock(fn) {
  if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
    return navigator.locks.request('pt_usage_file', fn);
  }
  return new Promise(function(resolve) { resolve(fn()); });
}

// Filens logg (tom hvis den ikke finnes). Bare for skriving (forFlush) legges
// en ulesbar eller delvis ugyldig fil i backup/ før den skrives om; visningen
// leser stille og skriver aldri.
function _usageReadFile(dir, forFlush) {
  return _fsReadText(dir, USAGE_FILE_NAME).then(function(text) {
    if (!text || !text.trim()) return _usageEmpty();
    var parsed = null, log = null;
    try { parsed = JSON.parse(text); log = usageNormalizeLog(parsed); } catch(e) { log = null; }
    if (!forFlush) return log || _usageEmpty();
    if (log && usageIsLossless(parsed)) return log;
    return dir.getDirectoryHandle(DAILY_BACKUP_DIR, { create: true }).then(function(bdir) {
      return _fsWriteText(bdir, 'usage-ulesbar-' + todayStr() + '-' + Date.now() + '.json', text);
    }).then(function() {
      showToast('✗ usage.json hadde uventet innhold — kopi er lagt i backup/', true);
      return log || _usageEmpty();
    });
  });
}

var _usageFlushing = false;
function usageFlush() {
  if (_usageFlushing) return Promise.resolve();
  if (usageIsEmpty(_usageBufRead(USAGE_BUF_KEY)) && usageIsEmpty(_usageBufRead(USAGE_INFLIGHT_KEY))) return Promise.resolve();
  _usageFlushing = true;
  return _usageWithLock(_usageFlushLocked).then(function(written) {
    _usageFlushing = false;
    // Telt noe under skrivingen, kommer en ny runde. Etter en feil venter vi
    // på neste klikk, oppstart eller tilgang i stedet for å prøve i ring.
    if (written && !usageIsEmpty(_usageBufRead(USAGE_BUF_KEY))) usageScheduleFlush();
  }, function() { _usageFlushing = false; });
}

function _usageFlushLocked() {
  return _usageDirReady().then(function(ok) {
    if (!ok) return false;
    var dir = _bkDirHandle;
    // Det som venter, flyttes til «under skriving» og blir der til filen er
    // bekreftet skrevet (en avbrutt skriving plukkes opp igjen neste gang)
    var snap = usageMerge(_usageBufRead(USAGE_INFLIGHT_KEY), _usageBufRead(USAGE_BUF_KEY));
    if (usageIsEmpty(snap)) return false;
    _usageBufWrite(USAGE_INFLIGHT_KEY, snap);
    _usageBufWrite(USAGE_BUF_KEY, _usageEmpty());
    return _usageReadFile(dir, true).then(function(base) {
      return _fsWriteText(dir, USAGE_FILE_NAME, JSON.stringify(usageMerge(base, snap), null, 1));
    }).then(function() {
      _usageBufWrite(USAGE_INFLIGHT_KEY, _usageEmpty());
      return true;
    }, function() {
      _usageBufWrite(USAGE_BUF_KEY, usageMerge(_usageBufRead(USAGE_INFLIGHT_KEY), _usageBufRead(USAGE_BUF_KEY)));
      _usageBufWrite(USAGE_INFLIGHT_KEY, _usageEmpty());
      return false;
    });
  });
}

document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'hidden') usageFlush();
});

// Hele loggen: filen pluss det som venter. hasFile er false uten datamappe.
function usageLoadAll() {
  return _usageDirReady().then(function(ok) {
    return ok ? _usageReadFile(_bkDirHandle, false) : null;
  }).catch(function() { return null; }).then(function(file) {
    var waiting = usageMerge(_usageBufRead(USAGE_INFLIGHT_KEY), _usageBufRead(USAGE_BUF_KEY));
    return { log: usageMerge(file, waiting), hasFile: !!file };
  });
}

// ── Visning ────────────────────────────────────────
function _usageCollectIds() {
  var ids = [], labels = {};
  document.querySelectorAll(USAGE_STATIC_SEL).forEach(function(el) {
    var key = usageFeatureKey(el);
    if (!key || key.indexOf('usage-') === 0) return;
    if (ids.indexOf(key) === -1) ids.push(key);
    if (labels[key]) return;
    var txt = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || el.getAttribute('data-tooltip') || '').replace(/\s+/g, ' ').trim();
    if (txt) labels[key] = txt.length > 48 ? txt.slice(0, 47) + '…' : txt;
  });
  return usageWithRegistry({ ids: ids, labels: labels }, USAGE_DYNAMIC_FEATURES);
}

// Legger de tegnede funksjonene til DOM-funksjonene. Listens navn går foran
// teksten i DOM-en (som for tegnede lenker kan være et saksnummer).
function usageWithRegistry(reg, registry) {
  var ids = reg.ids.slice(), labels = {};
  Object.keys(reg.labels).forEach(function(k) { labels[k] = reg.labels[k]; });
  Object.keys(registry).forEach(function(k) {
    if (ids.indexOf(k) === -1) ids.push(k);
    labels[k] = registry[k];
  });
  return { ids: ids, labels: labels };
}

function _usageRow(id, labels, right) {
  var label = labels[id] && labels[id] !== id ? labels[id] : id;
  return '<div class="us-row"><span class="us-name">' + esc(label) + '<span class="us-id">' + esc(id) + '</span></span>' + right + '</div>';
}

function renderUsageView() {
  var host = document.getElementById('usage-view');
  if (!host) return;
  var cb = document.getElementById('usage-enabled-cb');
  if (cb) cb.checked = usageEnabled();
  document.querySelectorAll('[data-usage-range]').forEach(function(b) {
    var on = b.dataset.usageRange === _usageRange;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  var seq = ++_usageRenderSeq;
  usageLoadAll().then(function(res) {
    if (seq !== _usageRenderSeq) return; // et nyere valg er allerede tegnet
    var reg = _usageCollectIds();
    var s = usageSummarize(res.log, reg.ids, todayStr(), _usageRange);
    var html = '';
    if (!res.hasFile) html += '<div class="us-note">Ingen tilgang til datamappen — tellerne vises fra nettleseren og skrives til usage.json når tilgang er gitt.</div>';
    var vers = Object.keys(res.log.versions).sort(function(a, b) { return res.log.versions[a] < res.log.versions[b] ? -1 : 1; });
    if (vers.length) html += '<div class="us-note">Logg siden ' + esc(formatDate(res.log.versions[vers[0]])) + ' · versjoner: ' +
      esc(vers.map(function(v) { return v + ' (fra ' + formatDate(res.log.versions[v]) + ')'; }).join(', ')) + '</div>';
    function section(title, rows, empty) {
      return '<h3 class="us-title">' + esc(title) + ' <span class="us-count">' + rows.length + '</span></h3>' +
        (rows.length ? rows.join('') : '<div class="us-empty">' + esc(empty) + '</div>');
    }
    html += section('Brukt i perioden', s.used.map(function(u) {
      return _usageRow(u.id, reg.labels, '<span class="us-num">' + u.count + '</span><span class="us-last">' + esc(formatDate(u.last)) + '</span>');
    }), 'Ingen data ennå');
    html += section('Ikke brukt i perioden', s.idle.map(function(u) {
      return _usageRow(u.id, reg.labels, '<span class="us-num"></span><span class="us-last">sist ' + esc(formatDate(u.last)) + '</span>');
    }), 'Ingen');
    html += section('Aldri brukt', s.never.map(function(id) { return _usageRow(id, reg.labels, ''); }), 'Ingen');
    host.innerHTML = html;
  });
}

function _usageDownload(log) {
  var blob = new Blob([JSON.stringify(log, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'patentdesk-bruk-' + todayStr() + '.json'; a.click();
  URL.revokeObjectURL(a.href);
  showToast('✓ Lagret til ' + a.download);
}

// Nullstilling går i kø bak en skriving som pågår, og nekter heller enn å late
// som når datamappen ikke kan nås (da ville den gamle filen dukket opp igjen).
function _usageReset() {
  if (_usageFlushing) { showToast('Vent et øyeblikk — tellerne skrives akkurat nå'); return Promise.resolve(); }
  return _usageWithLock(function() {
    function clearBuffers() { _usageBufWrite(USAGE_BUF_KEY, _usageEmpty()); _usageBufWrite(USAGE_INFLIGHT_KEY, _usageEmpty()); }
    if (!_bkDirHandle || !_bkFsaSupported()) { clearBuffers(); return true; } // ingen fil å tømme
    return _usageDirReady().then(function(ok) {
      if (!ok) { showToast('✗ Ingen tilgang til datamappen — usage.json kan ikke nullstilles nå', true); return false; }
      return _fsWriteText(_bkDirHandle, USAGE_FILE_NAME, JSON.stringify(_usageEmpty())).then(function() { clearBuffers(); return true; });
    });
  }).then(function(done) {
    if (done) showToast('✓ Bruksstatistikken er nullstilt');
    renderUsageView();
  }, function() { showToast('✗ Kunne ikke nullstille usage.json', true); });
}

(function() {
  var cb = document.getElementById('usage-enabled-cb');
  if (!cb) return;
  cb.addEventListener('change', function() { usageSetEnabled(this.checked); renderUsageView(); });
  document.querySelectorAll('[data-usage-range]').forEach(function(b) {
    b.addEventListener('click', function() { _usageRange = this.dataset.usageRange; renderUsageView(); });
  });
  document.getElementById('usage-export').addEventListener('click', function() {
    usageLoadAll().then(function(res) { _usageDownload(res.log); });
  });
  var reset = document.getElementById('usage-reset');
  reset.addEventListener('click', function() {
    // To trykk: første trykk ber om bekreftelse, så slipper vi en egen dialog
    if (_usageResetArmed) { clearTimeout(_usageResetArmed); _usageResetArmed = null; reset.textContent = 'Nullstill'; _usageReset(); return; }
    reset.textContent = 'Trykk igjen for å bekrefte';
    _usageResetArmed = setTimeout(function() { _usageResetArmed = null; reset.textContent = 'Nullstill'; }, 4000);
  });
})();
