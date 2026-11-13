// ── Bruksstatistikk ────────────────────────────────
// Valgfri (av som standard): teller klikk per funksjon og dag, og skriver
// tellerne til usage.json i datamappen. Bare funksjons-ID og antall lagres —
// aldri saksinnhold. Funksjons-ID-en utledes fra markeringen (data-feature,
// id, data-page, data-settings-tab, data-sak-section m.fl.), så nye knapper blir
// med uten et eget register. Tellere som ikke kan skrives ennå (ingen
// datamappe eller tilgang) venter i localStorage (pt_usage_buf).
var USAGE_ENABLED_KEY = 'pt_usage_enabled';
var USAGE_BUF_KEY     = 'pt_usage_buf';
var USAGE_FILE_NAME   = 'usage.json';
var USAGE_STATIC_SEL  = 'button, a[href], select, summary, [role="tab"], input[type="checkbox"], input[type="radio"], [data-feature]';
var _USAGE_FLUSH_MS   = 5000;
var _usageEnabledCache = null;
var _usageDelta    = null;
var _usageTimer    = null;
var _usageFlushing = false;
var _usageRange    = '30';
var _usageResetArmed = null;

// ── Rene funksjoner ────────────────────────────────
// Funksjons-ID for ett element, eller null. Se test/usage.test.js.
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
  // Øvrige data-attributter (f.eks. data-mh-view="full"): første som ikke bare er hjelpetekst
  var keys = Object.keys(ds).filter(function(k) { return k !== 'tooltip'; });
  if (keys.length) return 'data:' + keys[0] + ':' + ds[keys[0]];
  return null;
}

function usageIsEmpty(log) {
  return !log || !log.days || Object.keys(log.days).length === 0;
}

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
      if (typeof n !== 'number' || n < 1 || Math.floor(n) !== n) return;
      if (!out.days[day]) out.days[day] = {};
      out.days[day][id] = n;
    });
  });
  if (p.versions && typeof p.versions === 'object' && !Array.isArray(p.versions)) {
    Object.keys(p.versions).forEach(function(ver) {
      if (typeof p.versions[ver] === 'string' && re.test(p.versions[ver])) out.versions[ver] = p.versions[ver];
    });
  }
  return out;
}

// Summerer to logger uten å endre dem; versjonsdatoen er den tidligste.
function usageMerge(a, b) {
  var out = { v: 1, days: {}, versions: {} };
  [a, b].forEach(function(log) {
    if (!log) return;
    Object.keys(log.days || {}).forEach(function(day) {
      if (!out.days[day]) out.days[day] = {};
      Object.keys(log.days[day]).forEach(function(id) {
        out.days[day][id] = (out.days[day][id] || 0) + log.days[day][id];
      });
    });
    Object.keys(log.versions || {}).forEach(function(ver) {
      if (!out.versions[ver] || log.versions[ver] < out.versions[ver]) out.versions[ver] = log.versions[ver];
    });
  });
  return out;
}

function usageBump(log, day, id, version) {
  if (!log.days[day]) log.days[day] = {};
  log.days[day][id] = (log.days[day][id] || 0) + 1;
  if (version && !log.versions[version]) log.versions[version] = day;
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
  var inWin = {}, lastIn = {}, lastAll = {};
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
  var never = (ids || []).filter(function(id, i, arr) { return !lastAll[id] && arr.indexOf(id) === i; }).sort();
  return { used: used, idle: idle, never: never };
}

// ── Innstilling og innsamling ──────────────────────
function usageEnabled() {
  if (_usageEnabledCache === null) _usageEnabledCache = _lsGet(USAGE_ENABLED_KEY) === '1';
  return _usageEnabledCache;
}

function _usageEmpty() { return { v: 1, days: {}, versions: {} }; }

function _usageLoadDelta() {
  if (_usageDelta) return _usageDelta;
  var raw = _lsGet(USAGE_BUF_KEY), parsed = null;
  try { parsed = raw ? usageNormalizeLog(JSON.parse(raw)) : null; } catch(e) { parsed = null; }
  _usageDelta = parsed || _usageEmpty();
  return _usageDelta;
}

function _usageSaveBuf() {
  try {
    if (usageIsEmpty(_usageDelta)) localStorage.removeItem(USAGE_BUF_KEY);
    else localStorage.setItem(USAGE_BUF_KEY, JSON.stringify(_usageDelta));
  } catch(e) {}
}

function usageRecord(id) {
  if (!usageEnabled()) return;
  usageBump(_usageLoadDelta(), todayStr(), id, APP_VERSION);
  _usageSaveBuf();
  usageScheduleFlush();
}

function usageSetEnabled(on) {
  _usageEnabledCache = !!on;
  _lsSet(USAGE_ENABLED_KEY, on ? '1' : '0');
  if (!on) usageFlush(); // det som er talt hittil, skal ikke gå tapt
}

document.addEventListener('click', function(e) {
  if (!usageEnabled() || e.isTrusted === false) return; // skript-klikk er ikke bruk
  try {
    var t = e.target && e.target.closest ? e.target.closest(USAGE_STATIC_SEL) : null;
    var key = usageFeatureKey(t);
    if (key && key.indexOf('usage-') !== 0) usageRecord(key); // ikke tell visningen selv
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

// Filens logg (tom hvis den ikke finnes). En ulesbar fil legges i backup/ før
// den overskrives, som med arbeidsfilen.
function _usageReadFile(dir) {
  return _fsReadText(dir, USAGE_FILE_NAME).then(function(text) {
    if (!text || !text.trim()) return _usageEmpty();
    var log = null;
    try { log = usageNormalizeLog(JSON.parse(text)); } catch(e) { log = null; }
    if (log) return log;
    return dir.getDirectoryHandle(DAILY_BACKUP_DIR, { create: true }).then(function(bdir) {
      return _fsWriteText(bdir, 'usage-ulesbar-' + todayStr() + '.json', text);
    }).then(function() {
      showToast('✗ usage.json kunne ikke leses — lagt i backup/ og startet på nytt', true);
      return _usageEmpty();
    });
  });
}

function usageFlush() {
  if (_usageFlushing) return Promise.resolve();
  var snap = _usageLoadDelta();
  if (usageIsEmpty(snap)) return Promise.resolve();
  _usageFlushing = true;
  _usageDelta = _usageEmpty();
  var dir = null;
  return _usageDirReady().then(function(ok) {
    if (!ok) throw new Error('no-access');
    dir = _bkDirHandle;
    return _usageReadFile(dir);
  }).then(function(base) {
    return _fsWriteText(dir, USAGE_FILE_NAME, JSON.stringify(usageMerge(base, snap), null, 1));
  }).then(function() {
    _usageSaveBuf();
    return true;
  }, function() {
    _usageDelta = usageMerge(snap, _usageDelta); // ikke skrevet: tellerne venter
    _usageSaveBuf();
    return false;
  }).then(function(written) {
    _usageFlushing = false;
    // Telt noe under skrivingen, kommer en ny runde. Etter en feil venter vi
    // på neste klikk, oppstart eller tilgang i stedet for å prøve i ring.
    if (written && !usageIsEmpty(_usageDelta)) usageScheduleFlush();
  });
}

document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'hidden' && _usageDelta && !usageIsEmpty(_usageDelta)) usageFlush();
});

// Hele loggen: filen pluss det som venter. file er null uten datamappe.
function usageLoadAll() {
  return _usageDirReady().then(function(ok) {
    return ok ? _usageReadFile(_bkDirHandle) : null;
  }).catch(function() { return null; }).then(function(file) {
    return { log: usageMerge(file, _usageLoadDelta()), hasFile: !!file };
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
    b.classList.toggle('is-active', b.dataset.usageRange === _usageRange);
  });
  usageLoadAll().then(function(res) {
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

function _usageReset() {
  _usageDelta = _usageEmpty();
  _usageSaveBuf();
  return _usageDirReady().then(function(ok) {
    if (!ok) return;
    return _fsWriteText(_bkDirHandle, USAGE_FILE_NAME, JSON.stringify(_usageEmpty()));
  }).then(function() {
    showToast('✓ Bruksstatistikken er nullstilt');
    renderUsageView();
  }).catch(function() { showToast('✗ Kunne ikke nullstille usage.json', true); });
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
