// ── Automatisk sikkerhetskopi og datamappe ─────────
// Tre lag: (1) øyeblikksbilder i IndexedDB (alle nettlesere), og i en valgt
// datamappe via File System Access API (Chromium): (2) arbeidsfilen, som
// speiler dataene etter hver endring og leses ved oppstart, og (3) én fast
// daglig kopi i backup/.
var BACKUP_ENABLED_KEY   = 'pt_backup_enabled';
var BACKUP_LAST_KEY      = 'pt_backup_last';
var BACKUP_LAST_FILE_KEY = 'pt_backup_last_file_date';
var SAVED_AT_KEY         = 'pt_saved_at';        // når nettleserens data sist ble endret
var WORKFILE_LAST_KEY    = 'pt_workfile_last';   // når arbeidsfilen sist ble skrevet
var WORKFILE_SYNCED_KEY  = 'pt_workfile_synced'; // arbeidsfilens savedAt sist denne nettleseren skrev/leste den
var WORKFILE_NAME        = 'patentdesk-data.json';
var DAILY_BACKUP_DIR     = 'backup';
var DAILY_BACKUP_KEEP    = 30;
var _WF_DEBOUNCE_MS      = 1500;
var _wfTimer        = null;
var _wfReady        = false; // true når arbeidsfilen er avstemt mot nettleseren denne økten
var _wfDailyDoneFor = null;  // dato dagens daglige kopi er bekreftet tatt
var _wfPendingFile  = null;  // arbeidsfil som venter på brukerens valg i konfliktdialogen
var _BK_DB_NAME       = 'patentdesk_backups';
var _BK_VERSION       = 1; // øk ved framtidige endringer i backup-lagerets struktur
var _BK_SNAP_STORE    = 'snapshots';
var _BK_MISC_STORE    = 'misc';
var _BK_MAX_SNAPSHOTS = 20;
var _BK_DEBOUNCE_MS   = 5000;
var _bkTimer     = null;
var _bkLastSig   = null;
var _bkDirHandle = null;

// Caches localStorage-oppslaget — kalles i hver auto-backup-syklus.
// null = ikke lest ennå; invalideres når bryteren endres.
var _backupEnabledCache = null;
function backupEnabled() {
  if (_backupEnabledCache === null) {
    try { _backupEnabledCache = localStorage.getItem(BACKUP_ENABLED_KEY) !== '0'; }
    catch(e) { _backupEnabledCache = true; }
  }
  return _backupEnabledCache;
}

function _bkOpenDb(cb) {
  var req;
  // indexedDB.open kan kaste synkront (privat modus, blokkert lagring)
  try { req = indexedDB.open(_BK_DB_NAME, _BK_VERSION); }
  catch(e) { cb(e); return; }
  req.onupgradeneeded = function(e) {
    var db = e.target.result;
    if (!db.objectStoreNames.contains(_BK_SNAP_STORE)) db.createObjectStore(_BK_SNAP_STORE);
    if (!db.objectStoreNames.contains(_BK_MISC_STORE)) db.createObjectStore(_BK_MISC_STORE);
  };
  req.onsuccess = function(e) { cb(null, e.target.result); };
  req.onerror   = function()  { cb(req.error || new Error('IndexedDB utilgjengelig')); };
}

function scheduleAutoBackup() {
  if (!backupEnabled()) return;
  if (_bkTimer) clearTimeout(_bkTimer);
  _bkTimer = setTimeout(runAutoBackup, _BK_DEBOUNCE_MS);
}

function runAutoBackup() {
  _bkTimer = null;
  if (!backupEnabled()) return;
  var payload;
  try { payload = makeExportPayload(); } catch(e) { return; }
  var sig = workFileSignature(payload);
  if (sig !== _bkLastSig) {
    _bkLastSig = sig;
    _bkSaveSnapshot(payload);
  }
}

var _bkWarnedFail = false;
function _bkWarnSaveFailed() {
  if (_bkWarnedFail) return; // varsle kun én gang per feilperiode
  _bkWarnedFail = true;
  showToast('✗ Automatisk sikkerhetskopi feilet — eksporter manuelt fra innstillinger', true);
}

function _bkSaveSnapshot(payload) {
  _bkOpenDb(function(err, db) {
    if (err) { _bkWarnSaveFailed(); return; }
    var tx = db.transaction(_BK_SNAP_STORE, 'readwrite');
    var store = tx.objectStore(_BK_SNAP_STORE);
    store.put(payload, payload.exported);
    var keysReq = store.getAllKeys();
    keysReq.onsuccess = function() {
      var keys = keysReq.result.slice().sort();
      while (keys.length > _BK_MAX_SNAPSHOTS) store.delete(keys.shift());
    };
    tx.onerror = function() { _bkWarnSaveFailed(); };
    tx.oncomplete = function() {
      _bkWarnedFail = false; // vellykket lagring → varsle igjen ved senere feil
      try { localStorage.setItem(BACKUP_LAST_KEY, payload.exported); } catch(e) {}
      _bkUpdateSettingsUI();
    };
  });
}

function _bkListSnapshots(cb) {
  _bkOpenDb(function(err, db) {
    if (err) { cb(err, []); return; }
    var store = db.transaction(_BK_SNAP_STORE, 'readonly').objectStore(_BK_SNAP_STORE);
    var req = store.getAll();
    req.onsuccess = function() {
      var snaps = (req.result || []).slice().sort(function(a, b) {
        return a.exported < b.exported ? 1 : -1;
      });
      cb(null, snaps);
    };
    req.onerror = function() { cb(req.error, []); };
  });
}

// ── Mappe-sikkerhetskopi (File System Access API, Chromium) ──
function _bkFsaSupported() { return typeof window.showDirectoryPicker === 'function'; }

function _bkSaveDirHandle(handle) {
  _bkOpenDb(function(err, db) {
    if (err) return;
    db.transaction(_BK_MISC_STORE, 'readwrite').objectStore(_BK_MISC_STORE).put(handle, 'dirHandle');
  });
}

function _bkLoadDirHandle(cb) {
  _bkOpenDb(function(err, db) {
    if (err) { cb(); return; }
    var req = db.transaction(_BK_MISC_STORE, 'readonly').objectStore(_BK_MISC_STORE).get('dirHandle');
    req.onsuccess = function() { _bkDirHandle = req.result || null; cb(); };
    req.onerror   = function() { cb(); };
  });
}

// ── Arbeidsfil: rene hjelpere ──────────────────────
// Hva som skal skje ved oppstart når arbeidsfilen er lest.
// local = { savedAt, caseCount, syncedAt } fra nettleseren; syncedAt er filens
// savedAt sist denne nettleseren skrev eller leste den.
// file  = null (ingen fil) eller { savedAt, caseCount, identical }.
// 'write' = skriv nettleserens data til filen, 'load' = hent inn filen uten å
// spørre, 'ask' = la brukeren velge, 'none' = ingenting å gjøre.
function workFileStartupAction(local, file) {
  if (!file) return 'write';
  if (file.identical) return 'none';
  // Tom nettleser (aldri lagret, ingen saker): ingenting kan gå tapt
  if (!local.savedAt && !local.caseCount) return 'load';
  // Filen bærer fortsatt stempelet vi sist så: ingen andre har rørt den
  if (local.syncedAt && file.savedAt === local.syncedAt) return 'write';
  return 'ask';
}

// Sammenligningsnøkkel for en eksportfil som ser bort fra tidsstemplene.
function workFileSignature(payload) {
  return JSON.stringify(Object.assign({}, payload, { exported: null, savedAt: null }));
}

// Antall saker som finnes bare på én side, eller er ulike (inkl. saksdetaljer).
function countDifferingCases(a, b) {
  function index(p) {
    var m = {};
    (p.cases || []).forEach(function(c) {
      m[c.id] = JSON.stringify([c, (p.sakDetails || {})[c.id] || null]);
    });
    return m;
  }
  var ia = index(a), ib = index(b), n = 0;
  var has = Object.prototype.hasOwnProperty;
  Object.keys(ia).forEach(function(id) { if (ia[id] !== ib[id]) n++; });
  Object.keys(ib).forEach(function(id) { if (!has.call(ia, id)) n++; });
  return n;
}

// Daglige kopier som skal slettes for å beholde de `keep` nyeste. Rører bare
// filer som heter nøyaktig patentdesk-backup-ÅÅÅÅ-MM-DD.json.
function dailyBackupsToPrune(names, keep) {
  var daily = names.filter(function(n) {
    return /^patentdesk-backup-\d{4}-\d{2}-\d{2}\.json$/.test(n);
  }).sort();
  return daily.slice(0, Math.max(0, daily.length - keep));
}

// ── Arbeidsfil: filoperasjoner ─────────────────────
function _fsWriteText(dir, name, text) {
  return dir.getFileHandle(name, { create: true }).then(function(fh) {
    return fh.createWritable();
  }).then(function(w) {
    return w.write(text).then(function() { return w.close(); });
  });
}

// Gir null hvis filen ikke finnes
function _fsReadText(dir, name) {
  return dir.getFileHandle(name).then(function(fh) {
    return fh.getFile();
  }).then(function(f) {
    return f.text();
  }).catch(function(e) {
    if (e && e.name === 'NotFoundError') return null;
    throw e;
  });
}

function _fsListNames(dir) {
  var it = dir.keys(), names = [];
  function step() {
    return it.next().then(function(r) {
      if (r.done) return names;
      names.push(r.value);
      return step();
    });
  }
  return step();
}

function _lsGet(key) { try { return localStorage.getItem(key); } catch(e) { return null; } }
function _lsSet(key, v) { try { localStorage.setItem(key, v); } catch(e) {} }

function _wfStampSaved() { _lsSet(SAVED_AT_KEY, new Date().toISOString()); }

function _wfPayload() {
  return Object.assign(makeExportPayload(), { savedAt: _lsGet(SAVED_AT_KEY) || new Date().toISOString() });
}

function scheduleWorkFileWrite() {
  if (!_bkDirHandle || !_bkFsaSupported()) return;
  if (_wfTimer) clearTimeout(_wfTimer);
  _wfTimer = setTimeout(_wfFlush, _WF_DEBOUNCE_MS);
}

function _wfFlush() {
  _wfTimer = null;
  // Ikke avstemt ennå (tilgang mangler eller konfliktdialogen er åpen): filen
  // skrives først når oppstartsavstemmingen er gjort
  if (!_wfReady || !_bkDirHandle) return;
  _bkDirHandle.queryPermission({ mode: 'readwrite' }).then(function(perm) {
    if (perm !== 'granted') { _wfReady = false; _wfShowPermBar(); _bkUpdateSettingsUI(); return; }
    return _wfWrite();
  }).catch(function() {});
}

var _wfWarnedFail = false;
function _wfWrite() {
  var dir = _bkDirHandle;
  var payload;
  return _wfEnsureDailyCopy(dir).then(function() {
    payload = _wfPayload(); // etter dagens kopi, så den rekker å fange filen slik den lå
    return _fsWriteText(dir, WORKFILE_NAME, JSON.stringify(payload, null, 2));
  }).then(function() {
    _lsSet(WORKFILE_LAST_KEY, new Date().toISOString());
    _lsSet(WORKFILE_SYNCED_KEY, payload.savedAt);
    _wfWarnedFail = false;
    _bkUpdateSettingsUI();
  }).catch(function() {
    if (_wfWarnedFail) return; // varsle kun én gang per feilperiode
    _wfWarnedFail = true;
    showToast('✗ Kunne ikke skrive arbeidsfilen i datamappen', true);
  });
}

// Før arbeidsfilen skrives første gang hver dag, kopieres den slik den lå til
// backup/patentdesk-backup-ÅÅÅÅ-MM-DD.json. Dagens kopi endres ikke etterpå.
var _wfDailyWarned = false;
function _wfEnsureDailyCopy(dir) {
  var today = todayStr();
  if (!backupEnabled() || _wfDailyDoneFor === today) return Promise.resolve();
  var name = 'patentdesk-backup-' + today + '.json';
  return dir.getDirectoryHandle(DAILY_BACKUP_DIR, { create: true }).then(function(bdir) {
    return bdir.getFileHandle(name).then(function() {
      _wfDailyDoneFor = today; // finnes allerede
    }, function(e) {
      if (!e || e.name !== 'NotFoundError') throw e;
      return _fsReadText(dir, WORKFILE_NAME).then(function(text) {
        return _fsWriteText(bdir, name, text || JSON.stringify(_wfPayload(), null, 2));
      }).then(function() {
        _wfDailyDoneFor = today;
        _lsSet(BACKUP_LAST_FILE_KEY, new Date().toISOString());
        return _fsListNames(bdir).then(function(names) {
          return Promise.all(dailyBackupsToPrune(names, DAILY_BACKUP_KEEP).map(function(n) {
            return bdir.removeEntry(n);
          }));
        }).catch(function() {}); // mislykket opprydding er ikke kritisk
      });
    });
  }).catch(function() {
    // Arbeidsfilen skal skrives selv om dagens kopi feilet
    if (_wfDailyWarned) return;
    _wfDailyWarned = true;
    showToast('✗ Kunne ikke ta daglig kopi i backup-mappen', true);
  });
}

// ── Arbeidsfil: avstemming ved oppstart ────────────
function _wfSync() {
  var dir = _bkDirHandle;
  if (!dir) return;
  _wfReady = false;
  _fsReadText(dir, WORKFILE_NAME).then(function(text) {
    var file = null;
    if (text && text.trim()) {
      try { file = JSON.parse(text); } catch(e) { file = undefined; }
      if (file && (typeof file !== 'object' || !Array.isArray(file.cases))) file = undefined;
    }
    if (file === undefined) {
      // Ulesbar arbeidsfil: ta vare på den før den overskrives
      var keep = 'patentdesk-data-ulesbar-' + todayStr() + '.json';
      return dir.getDirectoryHandle(DAILY_BACKUP_DIR, { create: true }).then(function(bdir) {
        return _fsWriteText(bdir, keep, text);
      }).then(function() {
        showToast('✗ Arbeidsfilen kunne ikke leses — den er lagt i backup/' + keep + ' og skrevet på nytt', true);
        _wfReady = true;
        return _wfWrite();
      });
    }
    var localPayload = makeExportPayload();
    var info = file && {
      savedAt:   file.savedAt || null,
      caseCount: file.cases.length,
      identical: workFileSignature(file) === workFileSignature(localPayload)
    };
    var action = workFileStartupAction({
      savedAt:   _lsGet(SAVED_AT_KEY),
      caseCount: cases.length,
      syncedAt:  _lsGet(WORKFILE_SYNCED_KEY)
    }, info);

    if (action === 'none') {
      if (file.savedAt) { _lsSet(SAVED_AT_KEY, file.savedAt); _lsSet(WORKFILE_SYNCED_KEY, file.savedAt); }
      _wfReady = true;
      _bkUpdateSettingsUI();
    } else if (action === 'write') {
      _wfReady = true;
      return _wfWrite();
    } else if (action === 'load') {
      var n = file.cases.length;
      _wfLoad(file, '✓ Hentet ' + n + ' sak' + (n !== 1 ? 'er' : '') + ' fra ' + WORKFILE_NAME);
      _wfReady = true; // først etter vellykket innlasting, så en tom nettleser aldri overskriver filen
    } else {
      _wfOpenConflict(file, localPayload);
    }
  }).catch(function() {
    showToast('✗ Kunne ikke lese arbeidsfilen i datamappen', true);
  });
}

function _wfLoad(file, toast) {
  var data = prepareImportData(JSON.parse(JSON.stringify(file))).data;
  dispatch('DATA_IMPORT', { data: data, mode: 'replace', toast: toast,
    page: activePage === 'sak' ? 'hjem' : activePage });
}

function _wfFmtShort(iso) {
  var d = new Date(iso);
  if (!iso || isNaN(d)) return '—';
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return p(d.getDate()) + '.' + p(d.getMonth() + 1) +
    (d.getFullYear() !== new Date().getFullYear() ? '.' + d.getFullYear() : '') +
    ' kl. ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function _wfOpenConflict(file, localPayload) {
  _wfPendingFile = file;
  var localSaved = _lsGet(SAVED_AT_KEY);
  var newer = (Date.parse(file.savedAt) || 0) > (Date.parse(localSaved) || 0);
  document.getElementById('workfile-conflict-title').textContent =
    newer ? 'Arbeidsfilen er nyere' : 'Arbeidsfilen er endret';
  document.getElementById('wf-file-saved').textContent  = _wfFmtShort(file.savedAt);
  document.getElementById('wf-local-saved').textContent = _wfFmtShort(localSaved);
  document.getElementById('wf-file-count').textContent  = file.cases.length;
  document.getElementById('wf-local-count').textContent = cases.length;
  var diff = countDifferingCases(localPayload, file);
  document.getElementById('wf-diff-text').textContent =
    (diff === 0
      ? 'Sakene er like, men annen data (statistikk, ferier eller innstillinger) er ulik. '
      : diff + (diff !== 1 ? ' saker er ulike. ' : ' sak er ulik. ')) +
    'Det du velger bort, lagres som et øyeblikksbilde og kan hentes tilbake.';
  openBackdrop('workfile-conflict-backdrop');
}

document.getElementById('btn-wf-use-file').addEventListener('click', function() {
  var file = _wfPendingFile;
  if (!file) return;
  _wfPendingFile = null;
  _bkSaveSnapshot(makeExportPayload()); // nettleserens data kan hentes tilbake
  closeBackdrop('workfile-conflict-backdrop');
  try { _wfLoad(file, '✓ Arbeidsfilen er lastet inn'); _wfReady = true; }
  catch(e) { showToast('✗ Kunne ikke lese arbeidsfilen', true); }
});

document.getElementById('btn-wf-keep-local').addEventListener('click', function() {
  var file = _wfPendingFile;
  if (!file) return;
  _wfPendingFile = null;
  // Arbeidsfilens data kan hentes tilbake. Stemples nå, så øyeblikksbildet ikke
  // ryddes bort med en gang fordi filen er eldre enn de andre.
  _bkSaveSnapshot(Object.assign({}, file, { exported: new Date().toISOString() }));
  closeBackdrop('workfile-conflict-backdrop');
  _wfStampSaved();
  _wfReady = true;
  _wfWrite();
  showToast('✓ Beholdt nettleserens data');
});

// ── Arbeidsfil: tilgang ────────────────────────────
// Chrome krever et klikk for å gi tilgang igjen etter omstart av nettleseren.
function _wfShowPermBar() {
  if (document.getElementById('wf-perm-bar')) return;
  var bar = document.createElement('div');
  bar.id = 'wf-perm-bar';
  bar.className = 'undo-toast wf-perm-bar';
  bar.setAttribute('role', 'status');
  var span = document.createElement('span');
  span.textContent = 'Datamappen er ikke tilkoblet';
  var grant = document.createElement('button');
  grant.textContent = 'Gi tilgang';
  var later = document.createElement('button');
  later.className = 'wf-later';
  later.textContent = 'Senere';
  bar.appendChild(span);
  bar.appendChild(grant);
  bar.appendChild(later);
  document.body.appendChild(bar);
  grant.addEventListener('click', _wfRequestAccess);
  later.addEventListener('click', function() { _wfPermDismissed = true; _wfHidePermBar(); });
}

function _wfHidePermBar() {
  var bar = document.getElementById('wf-perm-bar');
  if (bar) bar.parentNode.removeChild(bar);
}

function _wfRequestAccess() {
  if (!_bkDirHandle) return;
  _wfPermAsked = true; // høyst én automatisk forespørsel per sidelasting
  _bkDirHandle.requestPermission({ mode: 'readwrite' }).then(function(p) {
    if (p !== 'granted') { showToast('Tilgang ble ikke gitt'); return; }
    _wfHidePermBar();
    _bkUpdateSettingsUI();
    usageScheduleFlush();
    _wfSync();
  }).catch(function() {});
}

// Første klikk i appen ber også om tilgang, så brukeren slipper å treffe linjen.
// Ren funksjon — se test/wfShouldAutoAsk.test.js.
function wfShouldAutoAsk(s) {
  return !!(s.supported && s.hasHandle && !s.permGranted && !s.attempted && !s.dismissed && !s.onPermBar);
}

var _wfPermAsked = false;     // tilgang er bedt om denne økten, automatisk eller manuelt
var _wfPermDismissed = false; // «Senere» trykket denne sidelastingen

// Fangstfase, så den kjører selv om andre lyttere stopper klikket. Endrer ikke klikket.
function _wfAutoAskOnClick(e) {
  if (_wfPermAsked || _wfPermDismissed || !_bkDirHandle || !_bkFsaSupported()) return;
  var bar = document.getElementById('wf-perm-bar');
  var folderBtn = document.getElementById('btn-backup-folder');
  // Mappeknappen har sin egen tilgangsflyt — behandles som linjen (ingen dobbel forespørsel)
  var onPermBar = !!(e.target && ((bar && bar.contains(e.target)) || (folderBtn && folderBtn.contains(e.target))));
  _bkDirHandle.queryPermission({ mode: 'readwrite' }).then(function(perm) {
    var granted = perm === 'granted';
    if (granted) { document.removeEventListener('click', _wfAutoAskOnClick, true); return; }
    if (!wfShouldAutoAsk({ supported: _bkFsaSupported(), hasHandle: !!_bkDirHandle, permGranted: granted,
      attempted: _wfPermAsked, dismissed: _wfPermDismissed, onPermBar: onPermBar })) return;
    _wfRequestAccess(); // setter _wfPermAsked før requestPermission
  }).catch(function() {});
}
document.addEventListener('click', _wfAutoAskOnClick, true);

