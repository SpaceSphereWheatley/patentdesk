// ── UI ─────────────────────────────────────────────
function _bkFmtTime(iso) {
  var d = new Date(iso);
  if (isNaN(d)) return iso;
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ' kl. ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

// Hva Datamappe-raden skal si når dataene bare ligger i nettleseren. Gir null
// når en mappe er valgt og tilgang er gitt — da viser raden mappestatusen.
// Ren funksjon — se test/dataFolderNotice.test.js.
function dataFolderNotice(supported, dirName, permGranted) {
  var risk = 'Data lagres kun i nettleseren. Tømmes nettleserdata, er alt borte.';
  if (!supported) return { warn: true, sub: risk,
    sub2: 'Denne nettleseren kan ikke lagre til en mappe — eksporter JSON jevnlig.', btn: null };
  if (!dirName) return { warn: true, sub: risk,
    sub2: 'Velg en mappe for arbeidsfil og daglige kopier', btn: 'Velg mappe' };
  if (!permGranted) return { warn: true,
    sub: 'Tilgang ikke gitt til ' + dirName + ' — data lagres foreløpig kun i nettleseren.',
    sub2: 'Arbeidsfilen oppdateres når tilgang er gitt', btn: 'Gi tilgang' };
  return null;
}

function _bkUpdateSettingsUI() {
  var cb = document.getElementById('backup-enabled-cb');
  if (!cb) return;
  cb.checked = backupEnabled();
  var sub = document.getElementById('backup-status-sub');
  var last = localStorage.getItem(BACKUP_LAST_KEY);
  if (sub) {
    var daily = _bkFsaSupported() ? ' + daglig kopi' : '';
    sub.textContent = !backupEnabled()
      ? 'Avslått — ingen øyeblikksbilder eller daglige kopier tas'
      : last
        ? 'Siste øyeblikksbilde: ' + _bkFmtTime(last) + ' (de ' + _BK_MAX_SNAPSHOTS + ' siste)' + daily
        : 'Øyeblikksbilder etter hver endring (de ' + _BK_MAX_SNAPSHOTS + ' siste)' + daily;
  }
  var row = document.getElementById('backup-folder-row');
  if (!row) return;
  row.style.display = '';
  var sub1 = document.getElementById('backup-folder-sub');
  var sub2 = document.getElementById('backup-folder-sub2');
  var btn  = document.getElementById('btn-backup-folder');
  function setBtn(label) {
    if (!btn) return;
    btn.style.display = label ? '' : 'none';
    if (label) btn.innerHTML = '<svg class="ti" aria-hidden="true"><use href="#ti-folder"/></svg> ' + label;
  }
  function show(n) {
    row.classList.toggle('is-data-risk', !!(n && n.warn));
    if (!n) return;
    if (sub1) sub1.textContent = n.sub;
    if (sub2) sub2.textContent = n.sub2;
    setBtn(n.btn);
  }
  if (!_bkFsaSupported() || !_bkDirHandle) { show(dataFolderNotice(_bkFsaSupported(), null, false)); return; }
  var dirName = _bkDirHandle.name;
  _bkDirHandle.queryPermission({ mode: 'readwrite' }).then(function(perm) {
    var notice = dataFolderNotice(true, dirName, perm === 'granted');
    show(notice);
    if (notice) return;
    var wfLast = _lsGet(WORKFILE_LAST_KEY), dayLast = _lsGet(BACKUP_LAST_FILE_KEY);
    if (sub1) sub1.textContent = dirName + (wfLast ? ' — arbeidsfil lagret ' + _bkFmtTime(wfLast) : ' — arbeidsfil ikke skrevet ennå');
    if (sub2) {
      sub2.textContent = !backupEnabled()
        ? 'Daglige kopier er avslått'
        : 'Daglige kopier i ' + DAILY_BACKUP_DIR + '/ (' + DAILY_BACKUP_KEEP + ' siste beholdes)' +
          (dayLast ? ' · siste: ' + _bkFmtTime(dayLast).split(' kl.')[0] : '');
    }
    setBtn('Bytt mappe');
  }).catch(function() {});
}

function _bkOpenRestoreModal() {
  var list = document.getElementById('backup-snapshot-list');
  list.innerHTML = '<p class="bk-snap-empty"><span class="spinner" aria-hidden="true"></span> Laster…</p>';
  openBackdrop('backup-restore-backdrop');
  _bkListSnapshots(function(err, snaps) {
    if (err || !snaps.length) {
      list.innerHTML = '<p class="bk-snap-empty">Ingen automatiske sikkerhetskopier ennå. Kopier tas noen sekunder etter hver endring.</p>';
      return;
    }
    list.innerHTML = snaps.map(function(s) {
      var n = Array.isArray(s.cases) ? s.cases.length : 0;
      return '<div class="bk-snap-row">' +
        '<span class="bk-snap-time">' + esc(_bkFmtTime(s.exported)) + '</span>' +
        '<span class="bk-snap-count">' + n + ' sak' + (n !== 1 ? 'er' : '') + '</span>' +
        '<button class="s-btn" data-bk-key="' + esc(s.exported) + '">Gjenopprett</button>' +
      '</div>';
    }).join('');
  });
}

function _bkRestoreSnapshot(key, btn) {
  function resetBtn() {
    if (btn) { btn.disabled = false; btn.innerHTML = 'Gjenopprett'; }
  }
  _bkListSnapshots(function(err, snaps) {
    var snap = snaps.find(function(s) { return s.exported === key; });
    if (!snap) { resetBtn(); showToast('✗ Fant ikke sikkerhetskopien', true); return; }
    try {
      pendingImportData = prepareImportData(JSON.parse(JSON.stringify(snap))).data;
      _prepareImportModal(0);
      closeBackdrop('backup-restore-backdrop');
      openBackdrop('import-backdrop');
    } catch(e) { resetBtn(); showToast('✗ Kunne ikke lese sikkerhetskopien', true); }
  });
}

document.getElementById('backup-enabled-cb').addEventListener('change', function() {
  try { localStorage.setItem(BACKUP_ENABLED_KEY, this.checked ? '1' : '0'); } catch(e) {}
  _backupEnabledCache = this.checked;
  _bkUpdateSettingsUI();
  if (this.checked) { showToast('✓ Automatisk sikkerhetskopi på'); scheduleAutoBackup(); }
  else showToast('Automatisk sikkerhetskopi avslått');
});

document.getElementById('btn-backup-folder').addEventListener('click', function() {
  if (!_bkFsaSupported()) return;
  var pick = function() {
    window.showDirectoryPicker({ mode: 'readwrite' }).then(function(handle) {
      _bkDirHandle = handle;
      _bkSaveDirHandle(handle);
      // Ny mappe: ingen kjent arbeidsfil eller daglig kopi ennå
      try {
        localStorage.removeItem(BACKUP_LAST_FILE_KEY);
        localStorage.removeItem(WORKFILE_LAST_KEY);
        localStorage.removeItem(WORKFILE_SYNCED_KEY);
      } catch(e) {}
      _wfDailyDoneFor = null;
      _wfHidePermBar();
      _bkUpdateSettingsUI();
      showToast('✓ Datamappe valgt: ' + handle.name);
      _wfSync();
    }).catch(function() {}); // avbrutt av bruker
  };
  if (_bkDirHandle) {
    _bkDirHandle.queryPermission({ mode: 'readwrite' }).then(function(perm) {
      if (perm === 'granted') { pick(); return; } // bytt mappe
      _wfPermAsked = true; // ingen ny automatisk forespørsel etter denne
      _bkDirHandle.requestPermission({ mode: 'readwrite' }).then(function(p2) {
        if (p2 === 'granted') { _wfHidePermBar(); _bkUpdateSettingsUI(); _wfSync(); }
        else pick();
      }).catch(pick);
    }).catch(pick);
  } else pick();
});

document.getElementById('btn-backup-restore').addEventListener('click', _bkOpenRestoreModal);
document.getElementById('btn-backup-restore-close').addEventListener('click', function() { closeBackdrop('backup-restore-backdrop'); });
document.getElementById('backup-restore-backdrop').addEventListener('click', function(e) { if (e.target === this) closeBackdrop('backup-restore-backdrop'); });
document.getElementById('backup-snapshot-list').addEventListener('click', function(e) {
  var btn = e.target.closest('[data-bk-key]');
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner" aria-hidden="true"></span>';
  _bkRestoreSnapshot(btn.dataset.bkKey, btn);
});

// Ta ventende kopi og skriv arbeidsfilen umiddelbart når fanen skjules/lukkes
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState !== 'hidden') return;
  if (_bkTimer) { clearTimeout(_bkTimer); runAutoBackup(); }
  if (_wfTimer) { clearTimeout(_wfTimer); _wfFlush(); }
});

function _bkInit() {
  _bkLoadDirHandle(function() {
    _bkUpdateSettingsUI();
    if (backupEnabled()) scheduleAutoBackup();
    if (!_bkDirHandle || !_bkFsaSupported()) return;
    // Arbeidsfilen avstemmes mot nettleseren før noe skrives til den
    _bkDirHandle.queryPermission({ mode: 'readwrite' }).then(function(perm) {
      if (perm === 'granted') _wfSync();
      else _wfShowPermBar();
    }).catch(function() {});
  });
}

// ── Eksport ────────────────────────────────────────
document.getElementById('btn-export').addEventListener('click', function() {
  var blob = new Blob([JSON.stringify(makeExportPayload(), null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'patentdesk-' + todayStr() + '.json'; a.click();
  URL.revokeObjectURL(a.href);
  showToast('✓ Lagret til ' + a.download);
});

document.getElementById('btn-export-csv').addEventListener('click', function() {
  function csvCell(val) { return '"' + String(val || '').replace(/"/g, '""') + '"'; }
  var rows = caseCsvRows(cases, loadSakData).map(function(r) { return r.map(csvCell).join(';'); });
  var blob = new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'patentdesk-' + todayStr() + '.csv'; a.click();
  URL.revokeObjectURL(a.href);
  showToast('✓ Eksportert til ' + a.download);
});

// Radene i CSV-eksporten, med overskrift først. detailsFn(id) gir
// saksdetaljene, der innleveringsdatoen ligger. Oppdrag er «Aktiv» eller
// «Utført» — de har ingen saksflyt. Ren funksjon — se test/exportSearch.test.js.
function caseCsvRows(list, detailsFn) {
  var rows = [['Saksnummer', 'Type', 'Status', 'Utfall', 'Forfallsdato', 'Tittel', 'Notater', 'Stikkord', 'Innleveringsdato', 'Ikke fordelt']];
  (list || []).forEach(function(c) {
    var isOp = c.type === 'oppdrag';
    var status = isOp ? (c.status === 'avsluttet' ? 'Utført' : 'Aktiv') : ((STATUS_CONFIG[c.status] || {}).label || c.status || '');
    var outcome = !isOp && Object.prototype.hasOwnProperty.call(OUTCOMES, c.outcome) ? OUTCOMES[c.outcome].label : '';
    var d = isOp ? null : detailsFn(c.id);
    rows.push([c.caseNumber || '', isOp ? 'Oppdrag' : 'Søknad', status, outcome, toDisplay(c.dueDate || ''),
      c.title || '', c.notes || '', c.tags || '', toDisplay((d && d.filingDate) || ''), isUnassigned(c) ? 'Ja' : '']);
  });
  return rows;
}

// ── Import ─────────────────────────────────────────
var pendingImportData = null;

// Dekoder, migrerer og validerer en eksportfil før den lastes inn — felles for
// filimport, øyeblikksbilder og arbeidsfilen. Kaster ved ugyldig format.
// skipped = antall saker forkastet ved validering.
function prepareImportData(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.cases)) throw new Error('Ugyldig format');
  var migrated = migrateCases(data.cases.map(decodeCase));
  var valid    = migrated.filter(_validateImportCase);
  data.cases   = valid;
  // Saksdetaljene skrives rått til pt_sak_* ved import — rundene normaliseres her
  if (data.sakDetails && typeof data.sakDetails === 'object' && !Array.isArray(data.sakDetails)) {
    // Oppføringer som ikke er rene objekter forkastes, så lokale detaljer beholdes
    Object.keys(data.sakDetails).forEach(function(id) {
      var sd = data.sakDetails[id];
      if (!sd || typeof sd !== 'object' || Array.isArray(sd)) { delete data.sakDetails[id]; return; }
      data.sakDetails[id] = normalizeImportSakDetails(sd);
    });
  }
  // Validate stats structure — ignore if malformed
  if (data.stats && (typeof data.stats !== 'object' || !Array.isArray(data.stats.log))) {
    delete data.stats;
  }
  return { data: data, skipped: migrated.length - valid.length };
}

// Velger hvilke saksdetaljer DATA_IMPORT skriver til pt_sak_*. Flett: bare for
// saker som besto valideringen i samme import. Erstatt: som før, alle
// oppføringer. Aldri en oppføring som ikke er et rent objekt. Ren funksjon —
// se test/roundsFixes.test.js.
function importSakDetailsToWrite(sakDetails, validCases, mode) {
  var out = {};
  if (!sakDetails || typeof sakDetails !== 'object' || Array.isArray(sakDetails)) return out;
  var ok = {};
  (Array.isArray(validCases) ? validCases : []).forEach(function(c) { if (c && c.id != null) ok[c.id] = true; });
  Object.keys(sakDetails).forEach(function(id) {
    var sd = sakDetails[id];
    if (!sd || typeof sd !== 'object' || Array.isArray(sd)) return;
    if (mode === 'merge' && !Object.prototype.hasOwnProperty.call(ok, id)) return;
    out[id] = sd;
  });
  return out;
}

// Fyller import-modalen med antall og fletteforklaring (matcher på sakens id),
// og nullstiller modus til «Erstatt alt». skipped = antall rader forkastet ved validering.
function _prepareImportModal(skipped) {
  var n = pendingImportData ? pendingImportData.cases.length : 0;
  var countTxt = n + ' sak' + (n !== 1 ? 'er' : '');
  if (skipped > 0) countTxt += ' (' + skipped + ' hoppet over — ugyldig format)';
  document.getElementById('import-count').textContent = countTxt;

  var existing = {};
  cases.forEach(function(c) { existing[c.id] = true; });
  var matched = pendingImportData ? pendingImportData.cases.filter(function(c) { return existing[c.id]; }).length : 0;
  var fresh = n - matched;
  var desc = document.getElementById('import-merge-desc');
  if (desc) {
    desc.textContent = 'Beholder nåværende saker. ' +
      matched + ' oppdateres (finnes allerede), ' + fresh + ' ny' + (fresh !== 1 ? 'e' : '') + ' legges til.';
  }
  var replaceRadio = document.querySelector('input[name="import-mode"][value="replace"]');
  if (replaceRadio) replaceRadio.checked = true;
}

function _selectedImportMode() {
  var sel = document.querySelector('input[name="import-mode"]:checked');
  return sel ? sel.value : 'replace';
}

document.getElementById('btn-import').addEventListener('click', function() {
  document.getElementById('import-file-input').value = '';
  document.getElementById('import-file-input').click();
});
document.getElementById('import-file-input').addEventListener('change', function(e) {
  var file = e.target.files[0]; if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    try {
      var prep = prepareImportData(JSON.parse(ev.target.result));
      pendingImportData = prep.data;
      _prepareImportModal(prep.skipped);
      openBackdrop('import-backdrop');
    } catch(err) { showToast('✗ Kunne ikke lese filen — ugyldig format', true); }
  };
  reader.readAsText(file);
});
document.getElementById('btn-import-cancel').addEventListener('click', function() { closeBackdrop('import-backdrop'); pendingImportData = null; });
document.getElementById('import-backdrop').addEventListener('click', function(e) { if (e.target === this) { closeBackdrop('import-backdrop'); pendingImportData = null; } });
document.getElementById('btn-import-confirm').addEventListener('click', function() {
  if (!pendingImportData) return;
  dispatch('DATA_IMPORT', { data: pendingImportData, mode: _selectedImportMode() });
  pendingImportData = null;
});

// Hendelsens tidspunkt med ny dato (YYYY-MM-DD) og samme klokkeslett, i lokal
// tid. Ren funksjon — se test/dataIntegrity.test.js.
function replaceDatePart(iso, ymd) {
  var d = new Date(iso), p = ymd.split('-');
  d.setFullYear(+p[0], +p[1] - 1, +p[2]);
  return d.toISOString();
}

// ── Hendelseslogg: klikk ──────────────────────────
document.getElementById('log-tbody').addEventListener('click', function(e) {
  var btn = e.target.closest('.btn-log-edit');
  if (btn) {
    var logId = btn.dataset.logId;
    var idx   = (logId && isNaN(+logId))
      ? stats.log.findIndex(function(entry) { return entry.id === logId; })
      : parseInt(logId, 10);
    var entry = stats.log[idx];
    if (!entry) return;
    openFristModal(
      entry.caseNumber, formatDateTime(entry.date),
      'Endre datoen for denne hendelsen (' + (entry.type || '') + ').',
      function(newDate) {
        dispatch('STATS_LOG_DATE_EDIT', { idx: idx, date: newDate });
      }
    );
    return;
  }
  var card = e.target.closest('.log-card');
  if (card && card.dataset.sakId) { navigateTo('sak/' + card.dataset.sakId); }
});

// ── Belegg-beregning ───────────────────────────────
function computeBelegg(horizonDays) {
  var today = new Date(); today.setHours(0, 0, 0, 0);

  // Beregn arbeidsdager i perioden (ekskl. helger, røde dager, ferie)
  function workdaysInRange(startOffset, endOffset) {
    var count = 0;
    for (var i = startOffset; i < endOffset; i++) {
      if (!isNonWorkday(addDaysLocal(today, i))) count++;
    }
    return count;
  }

  var period1Work = workdaysInRange(0, horizonDays);
  var period2Work = workdaysInRange(horizonDays, horizonDays * 2);

  // Opptatte dager = summen av arbeidsdager i arbeidsvinduet til hver sak som
  // faktisk er ditt arbeid (se countsInBelegg).
  //
  // Merk: dette er en sum, ikke et sett med unike datoer — to saker med
  // overlappende vinduer teller den samme datoen to ganger. Det er med vilje.
  // Arbeidsvinduet er et estimat på arbeidsmengde (se workWindowDays),
  // og belegg = estimert arbeid / tilgjengelig kapasitet. Med unike datoer
  // ville ti saker med frist samme dag gitt samme belegg som én sak — altså
  // stille i det ene tilfellet der du mest trenger et varsel. Derfor kan
  // prosenten passere 100, og skal gjøre det: det betyr overbooket.
  function busyWorkdays(startOffset, endOffset, counts) {
    var busyCount = 0;
    cases.filter(counts || countsInBelegg).forEach(function(c) {
      var due      = new Date(effDueFor(c) + 'T00:00:00');
      var dueOff   = Math.round((due - today) / 86400000);

      // Forfalt: vinduet ligger i fortiden, men arbeidet er fortsatt ugjort.
      // Bokfør straffen på de nærmeste arbeidsdagene fra i dag — det er der
      // arbeidet må presses inn. Den treffer derfor bare periode 1; er saken
      // fortsatt forfalt i neste periode, er det neste periodes problem.
      if (dueOff < 0) {
        overduePenaltyOffsets(today, OVERDUE_PENALTY_WORKDAYS).forEach(function(j) {
          if (j >= startOffset && j < endOffset) busyCount++;
        });
        return;
      }

      // Vinduet er workWindowDays arbeidsdager og slutter på (og inkluderer)
      // fristen; fridager inni det strekker det bakover (workWindowStart).
      var ws       = new Date(workWindowStart(effDueFor(c), workWindowDays(c)) + 'T00:00:00');
      var winStart = Math.round((ws - today) / 86400000);
      var winEnd   = dueOff;
      for (var i = Math.max(startOffset, winStart); i < Math.min(endOffset, winEnd + 1); i++) {
        if (!isNonWorkday(addDaysLocal(today, i))) busyCount++;
      }
    });
    return busyCount;
  }

  var busy1 = busyWorkdays(0, horizonDays);
  var busy2 = busyWorkdays(horizonDays, horizonDays * 2);

  var pct1 = period1Work > 0 ? Math.round((busy1 / period1Work) * 100) : 0;
  var pct2 = period2Work > 0 ? Math.round((busy2 / period2Work) * 100) : 0;

  // Det saker du har meldt deg på, men ikke fått ennå, ville lagt til i
  // periode 1. Holdes utenfor pct1 og vises som et eget tillegg.
  var potentialBusy = busyWorkdays(0, horizonDays, countsAsPotentialBelegg);
  var potentialPct  = period1Work > 0 ? Math.round((potentialBusy / period1Work) * 100) : 0;

  // Feriedager i periode 1
  var vacDays = 0;
  for (var i = 0; i < horizonDays; i++) {
    var d = addDaysLocal(today, i);
    var ds = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    if (vacations.some(function(v) { return ds >= v.from && ds <= v.to; })) vacDays++;
  }

  return { pct1: pct1, pct2: pct2, busy: busy1, avail: period1Work, vac: vacDays,
           potentialBusy: potentialBusy, potentialPct: potentialPct };
}

// Belegg-søylen i prosent av sin egen bredde. Over 100 % vokser skalaen, så
// det som går over kapasiteten, blir et eget felt etter 100 %-merket; skalaen
// stopper på 200 % så merket ikke krymper bort. overPct er alltid det sanne
// overskuddet. Ren funksjon — se test/beleggBar.test.js.
function beleggBar(pct) {
  var p = (typeof pct === 'number' && isFinite(pct) && pct > 0) ? pct : 0;
  var scale = Math.min(Math.max(p, 100), 200);
  var fill  = Math.round(Math.min(p, 100) / scale * 100);
  var over  = p > 100 ? 100 - fill : 0;
  return { fill: fill, over: over, mark: Math.round(100 / scale * 100), overPct: Math.max(p - 100, 0) };
}

function renderBeleggCard() {
  var res   = computeBelegg(beleggHorizon);
  var pct   = res.pct1;
  var pct2  = res.pct2;
  var card  = document.getElementById('home-card-belegg');
  var pctEl = document.getElementById('belegg-pct');
  var subEl = document.getElementById('belegg-sub');
  if (!pctEl || !subEl) return;

  var color = pct < 60 ? 'var(--belegg-low)' : pct < 80 ? 'var(--belegg-mid)' : 'var(--danger)';
  if (card) card.style.borderLeftColor = color;
  pctEl.textContent = pct + '%';
  pctEl.style.color = color;
  var hzEl = document.getElementById('belegg-horizon');
  if (hzEl) hzEl.textContent = 'neste ' + beleggHorizon + ' dager';

  var bar = beleggBar(pct);
  var fillEl = document.getElementById('belegg-bar-fill');
  var overEl = document.getElementById('belegg-bar-over');
  var markEl = document.getElementById('belegg-bar-mark');
  if (fillEl) { fillEl.style.width = bar.fill + '%'; fillEl.style.background = color;
                fillEl.style.borderRadius = bar.over ? '3px 0 0 3px' : '3px'; }
  if (overEl) overEl.style.width = bar.over + '%';
  if (markEl) markEl.style.left = bar.mark + '%';

  var diff = pct2 - pct;
  var arrow = diff > 2 ? '↑' : diff < -2 ? '↓' : '→';
  var cls2  = diff > 2 ? 'belegg-sub-up' : diff < -2 ? 'belegg-sub-down' : 'belegg-sub-same';
  subEl.innerHTML = (bar.overPct ? '<span class="belegg-over">' + bar.overPct + '% over kapasitet</span>&nbsp;·&nbsp;' : '') +
    '<span class="' + cls2 + '">' + arrow + ' ' + pct2 + '%</span> neste periode' +
    (res.potentialPct > 0
      ? '&nbsp;·&nbsp;<span class="belegg-potential" title="Saker du har meldt deg på, men ikke fått fordelt ennå">+' + res.potentialPct + '% hvis du får de ikke-fordelte</span>'
      : '');
}

// ── Hjem: saksflyt ─────────────────────────────────
// Fyller de fire chevronkortene på Oversikt fra pipelineCounts. «Avgjort» er
// kalenderåret; saker avsluttet uten registrert utfall telles ikke med.
function renderPipeline() {
  var now  = new Date();
  var year = now.getFullYear();
  var p    = pipelineCounts(cases, year, todayStr());
  function set(id, txt) { var el = document.getElementById(id); if (el) el.textContent = txt; }
  function setHtml(id, html) { var el = document.getElementById(id); if (el) el.innerHTML = html; }

  set('home-count-ny', p.ny);
  set('home-pipe-ny-sub', 'til 1. brev' +
    (p.nyUnassigned > 0 ? ' · ' + p.nyUnassigned + ' ikke fordelt' : ''));

  set('home-count-fristarkiv', p.fristarkiv);
  set('home-pipe-frist-sub', p.fristarkivSoon > 0
    ? 'venter på svar · ' + p.fristarkivSoon + ' innen 30 dager'
    : 'venter på søkerens svar');

  set('home-count-videre', p.videre);
  setHtml('home-pipe-videre-sub', 'svar til behandling' +
    (p.videreLate > 0 ? ' <span class="home-pipe-flag">' + p.videreLate + ' i 3.+ runde</span>' : ''));

  var d = p.decided;
  set('home-pipe-done-label', 'Avgjort i ' + year);
  set('home-count-decided', d.total);
  setHtml('home-pipe-bar', d.total
    ? ['meddelt', 'avslatt', 'henlagt'].map(function(k) {
        return d[k] ? '<span style="flex:' + d[k] + ' 1 0;background:var(--trk-' + OUTCOMES[k].state + ')"></span>' : '';
      }).join('')
    : '');
  set('home-pipe-done-sub', d.total
    ? d.meddelt + ' meddelt · ' + d.avslatt + ' avslått · ' + d.henlagt + ' henlagt'
    : 'Ingen avgjørelser registrert ennå');
}

// ── Hjem: status-kort klikk/tastatur → side ───────
function _bindCardActivate(card, fn) {
  if (!card) return;
  card.addEventListener('click', fn);
  card.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
  });
}
['ny','fristarkiv','viderebehandling','avsluttet','oppdrag'].forEach(function(page) {
  _bindCardActivate(document.getElementById('home-card-' + page), function() { navigateTo(page); });
});

// ── Årsnavigering ──────────────────────────────────
document.getElementById('btn-year-prev').addEventListener('click', function() { statYear--; renderStats(); });
document.getElementById('btn-year-next').addEventListener('click', function() {
  if (statYear < new Date().getFullYear()) { statYear++; renderStats(); }
});

// ── Toast ──────────────────────────────────────────
// Avstand fra bunnen for det n-te samtidige varselet (0-indeksert), så flere
// varsler i rask rekkefølge stables i stedet for å overlappe hverandre.
function toastStackOffset(existingCount) {
  return 24 + existingCount * 54;
}

function showToast(msg, isError) {
  var existingCount = document.querySelectorAll('.save-toast').length;
  var t = document.createElement('div');
  t.className = 'save-toast' + (isError ? ' toast-error' : '');
  t.textContent = msg;
  t.style.bottom = 'calc(' + toastStackOffset(existingCount) + 'px + var(--toast-lift, 0px))';
  document.body.appendChild(t);
  setTimeout(function() {
    t.style.transition = 'opacity 0.3s'; t.style.opacity = '0';
    setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
  }, 2800);
  // Announce to screen readers via aria-live region
  var announcer = document.getElementById('toast-announcer');
  if (announcer) { announcer.textContent = ''; setTimeout(function() { announcer.textContent = msg; }, 50); }
}

// ── Angre ──────────────────────────────────────────
var undoSnapshot = null, undoToastTimer = null;

function showUndoToast(msg) {
  var old = document.getElementById('undo-toast');
  if (old) old.parentNode.removeChild(old);
  clearTimeout(undoToastTimer);
  var t = document.createElement('div');
  t.id = 'undo-toast'; t.className = 'undo-toast';
  // Bygg trygt: msg inneholder brukerangitt saksnummer, så det settes via textContent
  var span = document.createElement('span');
  span.textContent = msg;
  var undoBtn = document.createElement('button');
  undoBtn.id = 'btn-undo-action';
  undoBtn.textContent = 'Angre';
  t.appendChild(span);
  t.appendChild(undoBtn);
  document.body.appendChild(t);
  undoBtn.addEventListener('click', function() {
    if (!undoSnapshot) return;
    dispatch('CASE_UNDO');
    clearTimeout(undoToastTimer);
    if (t.parentNode) t.parentNode.removeChild(t);
  });
  undoToastTimer = setTimeout(function() {
    if (t.parentNode) { t.style.transition = 'opacity 0.4s'; t.style.opacity = '0'; setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 400); }
    undoSnapshot = null;
  }, 6000);
}

// Forkast «Angre»: øyeblikksbildet tømmes og toasten fjernes.
function dropUndo() {
  undoSnapshot = null;
  clearTimeout(undoToastTimer);
  var t = document.getElementById('undo-toast');
  if (t && t.parentNode) t.parentNode.removeChild(t);
}


// sakKey(), loadSakData(), saveSakData() er definert i SEKSJON 3

function defaultSakData(numClaims) {
  var n = numClaims || 0;
  var checklist = {};
  getChecklistTemplate().forEach(function(phase) {
    phase.items.forEach(function(item) { checklist[item.id] = null; });
  });
  var claims = [];
  for (var i = 1; i <= n; i++) {
    claims.push({ num: i, novelty: null, inventive: null, formal: null, notes: '', independent: false, dep: nearestIndependentClaim(claims, claims.length), depManual: false, label: '', noveltyDoc: null, inventiveDocs: [] });
  }
  return { numClaims: n, filingDate: '', priorityDate: '', checklist: checklist, classes: [], docs: [], claims: claims, rounds: [] };
}

function ensureClaims(data) {
  var n = data.numClaims || 0;
  if (!Array.isArray(data.claims)) data.claims = [];
  while (data.claims.length < n) {
    var i = data.claims.length + 1;
    data.claims.push({ num: i, novelty: null, inventive: null, formal: null, notes: '', independent: false, dep: nearestIndependentClaim(data.claims, data.claims.length), depManual: false, label: '', noveltyDoc: null, inventiveDocs: [] });
  }
  if (data.claims.length > n) data.claims = data.claims.slice(0, n);
  return data;
}

// Et krav kan bare avhenge av et krav som kommer før det. null betyr at
// kravet er selvstendig. Ren funksjon — se test/claimMutations.test.js.
function isValidDep(claimNum, val) {
  if (val === null) return true;
  return typeof val === 'number' && !isNaN(val) && val >= 1 && val < claimNum;
}

// Nummeret på nærmeste selvstendige krav (dep === null) før posisjon idx i
// claims, eller null hvis det ikke finnes noe. Brukes som standardavhengighet:
// et nytt eller kaskadert krav henger på det selvstendige kravet det står
// under, ikke på kravet rett over. Ren funksjon — se test/claimMutations.test.js.
function nearestIndependentClaim(claims, idx) {
  for (var i = Math.min(idx, claims.length) - 1; i >= 0; i--) {
    if (claims[i] && claims[i].dep === null) return claims[i].num;
  }
  return null;
}

// Setter avhengigheten på ett krav og lar den renne nedover til etterfølgende
// krav som ikke er satt manuelt — kravsett er som regel skrevet slik at en
// hel hale av uselvstendige krav henger på det samme selvstendige kravet.
// Kravene i halen peker på nærmeste selvstendige krav over seg, ikke på
// kravet over. Et krav brukeren setter (også til selvstendig) er manuelt og
// stopper kaskaden, slik at et nytt kravsett ikke viskes ut av en endring
// lenger opp. Muterer claims og returnerer kravnumrene som ble berørt.
function applyDepChange(claims, claimNum, val) {
  var idx = claims.findIndex(function(c) { return c.num === claimNum; });
  if (idx < 0) return [];
  var touched = [claimNum];
  claims[idx].dep = val;
  claims[idx].depManual = true;
  for (var i = idx + 1; i < claims.length; i++) {
    if (claims[i].depManual) break;
    claims[i].dep = nearestIndependentClaim(claims, i);
    touched.push(claims[i].num);
  }
  return touched;
}

// Kravnotater ble en periode skrevet til `note` mens de ble lest fra `notes`,
// så de forsvant ved neste tegning av kravstabellen. Teksten ligger fortsatt
// lagret, og hentes tilbake her. Returnerer true hvis noe ble endret.
function migrateClaimNotes(sakData) {
  if (!sakData || !Array.isArray(sakData.claims)) return false;
  var changed = false;
  sakData.claims.forEach(function(c) {
    if (!c || typeof c.note !== 'string') return;
    if (c.note && !c.notes) c.notes = c.note;
    delete c.note;
    changed = true;
  });
  return changed;
}

// Motholdene hadde tidligere et eget tittelfelt ved siden av referansen. Det
// er fjernet fra raden — publikasjonsnummeret er det som brukes — men tekst som
// allerede er skrevet skal ikke bli liggende usynlig: en tittel uten referanse
// blir referansen. Returnerer true hvis noe ble endret.
function migrateDocTitles(sakData) {
  if (!sakData || !Array.isArray(sakData.docs)) return false;
  var changed = false;
  sakData.docs.forEach(function(d) {
    if (!d || typeof d.title !== 'string') return;
    if (d.title && !d.ref) d.ref = d.title;
    delete d.title;
    changed = true;
  });
  return changed;
}

// Feltene i kravtabellen har bare plassholdere («—», «Notat…»), så de trenger
// et navn som sier hvilket krav og hvilken kolonne de står i.
// Ren funksjon — se test/sakFristCountdown.test.js.
function claimFieldAriaLabel(claimNum, kind) {
  var what = kind === 'dep'   ? 'avhengig av'
           : kind === 'note'  ? 'notat'
           : kind === 'label' ? 'etikett' : '';
  return 'Krav ' + claimNum + (what ? ' — ' + what : '');
}

// Visningen av etiketten er en knapp som åpner redigering. Et rent «Krav 2 —
// etikett» ville overstyrt teksten i knappen, slik at en utfylt etikett aldri
// ble lest opp — så verdien må være med i navnet.
function claimLabelAriaLabel(claimNum, label) {
  var v = (label || '').trim();
  return claimFieldAriaLabel(claimNum, 'label') + (v ? ': ' + v : ' (ikke satt)');
}

// Tri-state-knappene i kravstabellen viser bare en glyf, så de trenger et
// tilgjengelig navn som sier hvilket krav og hvilken kolonne de hører til.
function triAriaLabel(claimNum, field, val, isCascade, isLocked) {
  var fieldLabel = field === 'novelty'   ? 'nyhet'
                 : field === 'inventive' ? 'oppfinnelseshøyde'
                 : 'formelle feil';
  var valLabel = val === true ? 'ja' : val === false ? 'nei' : 'ikke vurdert';
  var label = 'Krav ' + claimNum + ' — ' + fieldLabel + ': ' + valLabel;
  if (isLocked)       label += ' (låst, krav mangler nyhet)';
  else if (isCascade) label += ' (arvet fra overordnet krav)';
  return label;
}

function ensureSakFiles(data, cas) {
  if (!Array.isArray(data.files)) {
    var isOppdrag = cas && cas.type === 'oppdrag';
    data.files = isOppdrag ? [] : DEFAULT_FILES.map(function(f) { return { name: f.name }; });
  }
  return data;
}

