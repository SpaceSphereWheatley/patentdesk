// ════════════════════════════════════════════════════════════════════════════
// SEKSJON 5 · UI-KOMPONENTER
// Renderfunksjoner: leser AppState, skriver til DOM
// Ingen localStorage-kall, ingen forretningslogikk
// ════════════════════════════════════════════════════════════════════════════

// ── Navigasjon ─────────────────────────────────────
// Sider uten tellemerke i menyen. Alle saker lister hver sak, så et tall der
// sier ikke noe du kan handle på (og telte tidligere bare de avsluttede).
var NAV_PAGES_WITHOUT_BADGE = ['hjem', 'statistikk', 'innstillinger', 'avsluttet'];

// Ren funksjon — se test/navBadge.test.js.
function navHasBadge(page) {
  return NAV_PAGES_WITHOUT_BADGE.indexOf(page) === -1;
}

function updateNav() {
  // Grupper saker per side i én gjennomgang i stedet for ett filter per fane
  var byPage = { ny: [], viderebehandling: [], fristarkiv: [], avsluttet: [], oppdrag: [] };
  cases.forEach(function(c) {
    if (c.type === 'oppdrag') { if (c.status !== 'avsluttet') byPage.oppdrag.push(c); return; }
    var s = c.status || 'ny';
    if (byPage[s]) byPage[s].push(c);
  });
  document.querySelectorAll('.nav-tab').forEach(function(tab) {
    var page = tab.dataset.page;
    tab.classList.toggle('active', page === activePage);
    var badge = tab.querySelector('.nav-count');
    if (!navHasBadge(page)) { if (badge) badge.remove(); return; }
    if (!badge) { badge = document.createElement('span'); badge.className = 'nav-count'; tab.appendChild(badge); }
    if (page === 'medlesing') {
      badge.textContent = medlNavCount(medlesing, medlLog);
      return;
    }
    var list = byPage[page] || casesForPage(page);
    // Saker som ikke er fordelt, er ikke dine ennå og telles ikke i merket
    var waiting = page === 'ny' ? list.filter(isUnassigned).length : 0;
    badge.textContent = list.length - waiting;
    if (page === 'ny') badge.title = waiting ? '+ ' + waiting + ' ikke fordelt' : '';
    // Oppdrag: farg badge etter alvorlighetsgrad
    if (page === 'oppdrag') {
      badge.classList.remove('nav-count-urgent', 'nav-count-soon');
      var minDays = list.reduce(function(m, c) { return Math.min(m, daysUntil(c.dueDate)); }, Infinity);
      if (list.length && minDays < 0)       badge.classList.add('nav-count-urgent');
      else if (list.length && minDays <= 7) badge.classList.add('nav-count-soon');
    }
  });
}

function showView(page) {
  var isHjem     = page === 'hjem';
  var isStat     = page === 'statistikk';
  var isSettings = page === 'innstillinger';
  var isSak      = page === 'sak';
  var isMedlesing= page === 'medlesing';
  var isCases    = !isHjem && !isStat && !isSettings && !isSak && !isMedlesing;
  document.getElementById('view-hjem').style.display          = isHjem     ? 'block' : 'none';
  document.getElementById('view-cases').style.display         = isCases    ? 'block' : 'none';
  document.getElementById('view-statistikk').style.display    = isStat     ? 'block' : 'none';
  document.getElementById('view-innstillinger').style.display = isSettings ? 'block' : 'none';
  document.getElementById('view-sak').style.display           = isSak      ? 'block' : 'none';
  document.getElementById('view-medlesing').style.display     = isMedlesing? 'block' : 'none';
  document.body.setAttribute('data-page', page);
  syncToastLift();
  // Close any open history rows when navigating away
  document.querySelectorAll('.hist-row.hist-open').forEach(function(r) { r.classList.remove('hist-open'); });
}

function updateCaseStats() {
  var list = casesForPage(activePage);
  var isOversikt = !!(PAGES[activePage] && PAGES[activePage].showAll);
  document.getElementById('case-count').textContent = caseCountText(list, isOversikt);
}

// Tellingen i sidehodet. Saker som ikke er fordelt, er ikke dine ennå og
// telles for seg; i Alle saker er de med i totalen.
// Ren funksjon — se test/unassigned.test.js.
function caseCountText(list, isOversikt) {
  var waiting = list.filter(isUnassigned).length;
  var suffix  = waiting ? ' · ' + waiting + ' ikke fordelt' : '';
  if (isOversikt) return list.length + ' saker totalt' + suffix;
  var n = list.length - waiting;
  return n + ' sak' + (n !== 1 ? 'er' : '') + suffix;
}

// ── Hendelseslogg ──────────────────────────────────
// Fører en hendelse i statistikken og gir id-en tilbake, så «Angre» kan
// fjerne akkurat den.
function logEvent(type, caseNumber, title) {
  var id = uid();
  stats.log.push({ id: id, type: type, caseNumber: caseNumber, title: title || '', date: new Date().toISOString() });
  saveStats();
  return id;
}

function lookupTitle(logEntry) {
  var match = cases.find(function(c) { return c.caseNumber === logEntry.caseNumber; });
  return (match && match.title) || logEntry.title || '';
}

// Hvilken hendelse i statistikken en statusovergang i historikken skrev, så
// en endret dato flyttes på riktig hendelse. Statistikken føres på selve
// overgangen (se statusTransition): realitetsbrev ut fra Ny er en
// nybehandling, fra Viderebehandling en viderebehandling, og en avslutning
// er «avsluttet» — eller «oppdrag» for oppdrag. Andre overganger, og eldre
// historikk uten from, førte ingenting. Ren funksjon — se test/dataIntegrity.test.js.
function historyLogType(h, isOppdrag) {
  if (!h || (h.type && h.type !== 'status')) return null;
  if (h.to === 'avsluttet') return isOppdrag ? 'oppdrag' : 'avsluttet';
  if (h.to === 'fristarkiv' && !isOppdrag) {
    if (h.from === 'ny') return 'ny';
    if (h.from === 'viderebehandling') return 'videre';
  }
  return null;
}

// ── Historikk-hjelper ──────────────────────────────
function appendHistory(c, fromStatus, toStatus, type, fromVal, toVal) {
  var hist = Array.isArray(c.history) ? c.history.slice() : [];
  var t = type || 'status';
  if (t === 'frist') {
    hist.push({ type: 'frist', date: new Date().toISOString(), from: fromVal || null, to: toVal || null });
  } else {
    hist.push({ type: 'status', date: new Date().toISOString(), from: fromStatus || null, to: toStatus });
  }
  return hist;
}

// ── Historikk-modal ─────────────────────────────────
function openHistoryModal(id) {
  var cas = cases.find(function(c) { return c.id === id; });
  if (!cas) return;
  document.getElementById('history-modal-cn').textContent = cas.caseNumber;
  var body = document.getElementById('history-modal-body');
  function renderHistBody() {
    var hist2 = Array.isArray(cas.history) ? cas.history.slice().reverse() : [];
    if (!hist2.length) {
      body.innerHTML = '<p class="hist-modal-empty">Ingen historikk registrert.</p>';
      return;
    }
    body.innerHTML = hist2.map(function(h, ri) {
      var origIdx = hist2.length - 1 - ri;
      var isStatus = !h.type || h.type === 'status';
      var iconCls  = isStatus ? 'hist-modal-icon' : 'hist-modal-icon hist-modal-icon-frist';
      var icon, mainHtml;
      if (isStatus) {
        var cfgTo = STATUS_CONFIG[h.to || h.status] || {};
        icon = cfgTo.histIcon || '•';
        mainHtml = !h.from
          ? 'Opprettet som ' + _histPill(h.to || h.status)
          : _histPill(h.from) + ' <span class="hist-modal-arrow">→</span> ' + _histPill(h.to);
      } else {
        icon = '📅';
        mainHtml = 'Frist endret <span class="hist-modal-arrow">' + esc(toDisplay(h.from || '')) + ' → ' + esc(toDisplay(h.to || '')) + '</span>';
      }
      var dt = h.date ? new Date(h.date) : null;
      var displayDate = dt ? (
        dt.getFullYear() + '.' + String(dt.getMonth()+1).padStart(2,'0') + '.' + String(dt.getDate()).padStart(2,'0') +
        '  ' + String(dt.getHours()).padStart(2,'0') + ':' + String(dt.getMinutes()).padStart(2,'0')
      ) : '—';
      var isoDate = dt ? (dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0')) : '';
      return '<div class="hist-modal-item">' +
        '<div class="' + iconCls + '">' + icon + '</div>' +
        '<div class="hist-modal-text">' +
          '<div class="hist-modal-main">' + mainHtml + '</div>' +
          '<div class="hist-modal-date">' +
            '<span class="hist-date-display">' + displayDate + '</span>' +
            ' <button class="hist-date-edit-btn" data-idx="' + origIdx + '" title="Endre dato">✎</button>' +
            '<span class="hist-date-input-wrap" style="display:none;">' +
              '<input class="field-input hist-date-input" type="text" placeholder="åååå.mm.dd" maxlength="10" value="' + (isoDate ? toDisplay(isoDate) : '') + '" data-idx="' + origIdx + '" />' +
              '<button class="hist-date-save-btn btn-secondary btn-sm" data-idx="' + origIdx + '">Lagre</button>' +
              '<button class="hist-date-cancel-btn btn-secondary btn-sm" data-idx="' + origIdx + '">Avbryt</button>' +
            '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    // Wire up edit/save/cancel
    body.querySelectorAll('.hist-date-edit-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var item = btn.closest('.hist-modal-item');
        item.querySelector('.hist-date-display').style.display = 'none';
        btn.style.display = 'none';
        item.querySelector('.hist-date-input-wrap').style.display = '';
        item.querySelector('.hist-date-input').focus();
      });
    });
    body.querySelectorAll('.hist-date-cancel-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var item = btn.closest('.hist-modal-item');
        item.querySelector('.hist-date-display').style.display = '';
        item.querySelector('.hist-date-edit-btn').style.display = '';
        item.querySelector('.hist-date-input-wrap').style.display = 'none';
      });
    });
    body.querySelectorAll('.hist-date-save-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var idx  = parseInt(btn.dataset.idx, 10);
        var inp  = body.querySelector('.hist-date-input[data-idx="' + idx + '"]');
        var val  = inp ? inp.value.trim() : '';
        if (!isValidDate(val)) { inp.style.borderColor = 'var(--danger)'; return; }
        var d       = new Date(parseDate(val) + 'T12:00:00');
        var newIso  = d.toISOString();
        var origH   = cas.history ? cas.history[idx] : null;
        var origDate = origH ? origH.date : newIso;
        dispatch('HIST_DATE_EDIT', { caseId: id, histIdx: idx, newDate: newIso, originalDate: origDate });
        cas = cases.find(function(c) { return c.id === id; });
        renderHistBody();
      });
    });
  }

  renderHistBody();
  openBackdrop('history-backdrop');
}

function _histPill(status) {
  if (!status) return '?';
  var cfg = STATUS_CONFIG[status] || {};
  var cls = cfg.pill || '';
  return '<span class="hist-modal-pill ' + cls + '">' + esc(cfg.label || status) + '</span>';
}

// ════════════════════════════════════════════════════════════════════════════
// ── Pågående sak: visning ──────────────────────────
// Markeringen fjernes av seg selv når saken er slettet, sendt til Fristarkiv
// eller avsluttet. Det sjekkes ved hver render, så alle veier dit dekkes.
function pruneActiveCase() {
  if (activeCase && !resolveActiveCase(activeCase, cases)) {
    activeCase = null;
    saveActiveCase(null);
  }
}

function isActiveCaseId(id) {
  return !!activeCase && activeCase.id === id;
}

// Valget i ⋯-menyene; tomt for saker som ikke kan markeres.
function activeCaseMenuItemHtml(c) {
  if (!canBeActiveCase(c)) return '';
  var on = isActiveCaseId(c.id);
  return '<button class="card-dropdown-item btn-active-toggle" data-id="' + c.id + '">' +
    '<span class="active-dot' + (on ? '' : ' active-dot-off') + '" aria-hidden="true"></span> ' +
    (on ? 'Fjern pågående-markering' : 'Marker som pågående') + '</button>';
}

function activeCasePillHtml(c) {
  return isActiveCaseId(c.id) ? '<span class="active-pill" title="Saken du holder på med">Pågår</span>' : '';
}

// postponePillHtml: merket «Utsatt til …» på en utsatt viderebehandling i
// sakslistene og fristlista. Nedtellingen ved siden av måles mot fristen.
function postponePillHtml(c) {
  var n = postponedDaysFor(c);
  if (!n) return '';
  var tip = 'Planlagt ' + n + (n === 1 ? ' dag' : ' dager') + ' etter fristen ' + toDisplay(c.dueDate) +
            '. Fristen flytter seg ikke.';
  return '<span class="postpone-pill" title="' + esc(tip) + '">Utsatt til ' + esc(toDisplay(effDueFor(c))) + '</span>';
}

// ── Ikke fordelt: visning ──────────────────────────
function unassignedPillHtml(c) {
  if (!isUnassigned(c)) return '';
  var today = todayStr();
  var wait  = unassignedWaitDays(c, today);
  var stale = isUnassignedStale(c, unassignedReminder, today);
  var tip = 'Meldt på' + (wait !== null ? ' for ' + wait + (wait === 1 ? ' dag' : ' dager') + ' siden' : '') +
    ', ikke fordelt ennå. Teller ikke i belegget.' + (stale ? ' Har du fått svar?' : '');
  return '<span class="unassigned-pill' + (stale ? ' is-stale' : '') + '" title="' + esc(tip) + '">' +
    'Ikke fordelt' + (stale ? ' · ' + wait + 'd' : '') + '</span>';
}

// Ferie-merket for en sak. For en sak som ikke er fordelt er kollisjonen
// bare mulig, så merket er dempet og teksten sier det.
function vacationTipText(c) {
  return isUnassigned(c) ? 'Perioden overlapper ferie, hvis du får saken' : 'Perioden overlapper ferie';
}

// Valgene i ⋯-menyene; tomt for saker som ikke kan vente på fordeling.
function unassignedMenuItemsHtml(c) {
  if (!canBeUnassigned(c)) return '';
  if (!isUnassigned(c)) {
    return '<button class="card-dropdown-item btn-unassigned-on" data-id="' + c.id + '"><svg class="ti" aria-hidden="true"><use href="#ti-clock"/></svg> Marker som ikke fordelt</button>';
  }
  return '<button class="card-dropdown-item btn-unassigned-off" data-id="' + c.id + '"><svg class="ti" aria-hidden="true"><use href="#ti-check"/></svg> Bekreft fordelt</button>' +
    '<button class="card-dropdown-item danger btn-unassigned-drop" data-id="' + c.id + '"><svg class="ti" aria-hidden="true"><use href="#ti-x"/></svg> Fikk den ikke (slett)</button>';
}

// Klikk på et av valgene over. Returnerer true når klikket er håndtert.
function handleUnassignedMenuClick(btn) {
  var id = btn.dataset.id;
  if (btn.classList.contains('btn-unassigned-on'))  { dispatch('CASE_UNASSIGNED_SET', { id: id, value: true });  return true; }
  if (btn.classList.contains('btn-unassigned-off')) { dispatch('CASE_UNASSIGNED_SET', { id: id, value: false }); return true; }
  if (btn.classList.contains('btn-unassigned-drop')) { dropUnassignedCase(id); return true; }
  return false;
}

// «Fikk den ikke»: saken slettes, med angre i varselet.
function dropUnassignedCase(id) {
  var leaveSak = activePage === 'sak' && activeSakId === id;
  dispatch('CASE_DELETE', { id: id });
  if (leaveSak) navigateTo('ny');
}

// Linjen over fristblokken på sakssiden.
function renderSakUnassigned(cas) {
  var box = document.getElementById('sak-unassigned');
  if (!box) return;
  var on = isUnassigned(cas);
  box.hidden = !on;
  if (!on) return;
  var today = todayStr();
  var wait  = unassignedWaitDays(cas, today);
  var stale = isUnassignedStale(cas, unassignedReminder, today);
  box.classList.toggle('is-stale', stale);
  var since = cas.unassignedSince || cas.createdAt;
  document.getElementById('sak-unassigned-text').innerHTML =
    '<strong>Ikke fordelt ennå</strong>' +
    (wait !== null ? ' · meldt på ' + esc(formatDateTime(since)) + ' (' + wait + (wait === 1 ? ' dag' : ' dager') + ' siden)' : '') +
    '<small>' + (stale ? 'Saken har ventet lenge. Har du fått svar? ' : '') +
    'Saken teller ikke i belegget før du bekrefter at du har fått den.</small>';
}

function renderActiveCaseChip() {
  var chip = document.getElementById('drawer-active');
  if (!chip) return;
  var c = resolveActiveCase(activeCase, cases);
  chip.hidden = !c;
  if (!c) return;
  var since = activeCase.since ? ' · markert ' + formatDateTime(activeCase.since) : '';
  var open = document.getElementById('drawer-active-open');
  open.dataset.id = c.id;
  open.title = 'Pågår: ' + c.caseNumber + (c.title ? ' – ' + c.title : '') + since;
  document.getElementById('drawer-active-cn').textContent = c.caseNumber;
  document.getElementById('drawer-active-title').textContent = c.title || '';
}

// Knappen i hodet på sakssiden.
function renderSakActiveButton(cas) {
  var btn = document.getElementById('btn-sak-active');
  if (!btn) return;
  var can = canBeActiveCase(cas);
  btn.style.display = can ? '' : 'none';
  if (!can) return;
  var on = isActiveCaseId(cas.id);
  btn.classList.toggle('is-on', on);
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.title = on ? 'Fjern markeringen' : 'Marker saken som den du holder på med';
  btn.innerHTML = '<span class="active-dot' + (on ? '' : ' active-dot-off') + '" aria-hidden="true"></span> ' +
    (on ? 'Pågår' : 'Marker som pågående');
}

// ════════════════════════════════════════════════════════════════════════════
// ── Hos medleser: visning ──────────────────────────
// Som pågående sak: utsendinger for saker som er slettet, sendt til
// Fristarkiv eller avsluttet lukkes ved hver render.
function pruneMedl() {
  var next = pruneMedlLog(medlLog, cases, todayStr());
  if (next !== medlLog) { medlLog = next; saveMedlLog(medlLog); }
}

function _medlSinceTxt(entry) {
  var d = daysBetweenIso(entry.sent, todayStr());
  return 'sendt ' + toDisplay(entry.sent) + (d > 0 ? ' (' + d + (d === 1 ? ' dag' : ' dager') + ')' : ' (i dag)');
}

// Valgene i ⋯-menyene; tomt for saker som ikke kan sendes.
function medlMenuItemsHtml(c) {
  if (!canSendToMedleser(c)) return '';
  var icon = '<svg class="ti" aria-hidden="true"><use href="#ti-users"/></svg> ';
  if (openMedlFor(medlLog, c.id)) {
    return '<button class="card-dropdown-item btn-medl-send" data-id="' + c.id + '">' + icon + 'Endre medlesing…</button>' +
      '<button class="card-dropdown-item btn-medl-return" data-id="' + c.id + '"><svg class="ti" aria-hidden="true"><use href="#ti-check"/></svg> Tilbake fra medlesing</button>';
  }
  return '<button class="card-dropdown-item btn-medl-send" data-id="' + c.id + '">' + icon + 'Send til medlesing…</button>';
}

// Felles for alle ⋯-menyene; true når klikket var et medlesingsvalg.
function handleMedlMenuClick(btn) {
  if (btn.classList.contains('btn-medl-send'))   { openMedlSendModal(btn.dataset.id); return true; }
  if (btn.classList.contains('btn-medl-return')) { dispatch('MEDL_RETURN', { id: btn.dataset.id }); return true; }
  return false;
}

function medlPillHtml(c) {
  var m = openMedlFor(medlLog, c.id);
  if (!m) return '';
  return '<span class="medl-out-pill" title="' + esc('Hos medleser: ' + m.reader + ' · ' + _medlSinceTxt(m)) + '">Hos ' + esc(m.reader) + '</span>';
}

// Linjen på sakssiden, Oversikt og Medlesing. withCase: vis saksnummer og lenke.
// withEdit: vis «Endre» (standard: bare når saksnummeret ikke vises).
function medlOutHtml(entry, withCase, withEdit) {
  if (withEdit === undefined) withEdit = !withCase;
  return '<div class="medl-out" data-id="' + esc(entry.caseId) + '">' +
    '<svg class="ti" aria-hidden="true"><use href="#ti-users"/></svg>' +
    '<span class="medl-out-text">Hos medleser: ' +
      (withCase ? '<a href="#" class="medl-out-case" data-id="' + esc(entry.caseId) + '">' + esc(entry.caseNumber) + '</a> – ' : '') +
      '<strong>' + esc(entry.reader) + '</strong> · ' + esc(_medlSinceTxt(entry)) + '</span>' +
    '<span class="medl-out-actions">' +
      (withEdit ? '<button class="s-btn btn-medl-send" data-id="' + esc(entry.caseId) + '">Endre</button>' : '') +
      '<button class="s-btn s-btn-accent btn-medl-return" data-id="' + esc(entry.caseId) + '">Tilbake ✓</button>' +
    '</span></div>';
}

function renderSakMedl(cas) {
  var el = document.getElementById('sak-medl-out');
  if (!el) return;
  var m = canSendToMedleser(cas) ? openMedlFor(medlLog, cas.id) : null;
  el.innerHTML = m ? medlOutHtml(m, false) : '';
  el.hidden = !m;
}

// Medlesing-siden: dine saker som ligger ute hos en medleser, med samme knapper som på Hjem.
function renderMedlOutList() {
  var el = document.getElementById('medl-out-list');
  var empty = document.getElementById('medl-out-empty');
  if (!el) return 0;
  var open = openMedlEntries(medlLog);
  el.innerHTML = open.map(function(x) { return medlOutHtml(x, true, true); }).join('');
  if (empty) empty.style.display = open.length ? 'none' : 'block';
  return open.length;
}

function renderHomeMedl() {
  var el = document.getElementById('home-medl-out');
  if (!el) return;
  var open = medlLog.filter(function(x) { return !x.returned; });
  el.innerHTML = open.map(function(x) { return medlOutHtml(x, true); }).join('');
  el.hidden = !open.length;
}

// ── Send til medlesing: dialog ─────────────────────
var pendingMedlId = null;

function openMedlSendModal(id) {
  var c = cases.find(function(x) { return x.id === id; });
  if (!canSendToMedleser(c)) return;
  pendingMedlId = id;
  var open = openMedlFor(medlLog, id);
  var today = todayStr();
  var stats = medleserStats(medlLog, today, medleserList);
  var suggested = suggestMedleser(medleserList, medlLog, today);
  var active = medleserList.filter(function(m) { return m.active; });
  // Den som allerede har saken står i lista selv om vedkommende er satt inaktiv.
  if (open && !active.some(function(m) { return _medlKey(m.name) === _medlKey(open.reader); })) {
    active = active.concat([{ name: open.reader, active: false }]);
  }
  function statFor(name) {
    return stats.find(function(r) { return _medlKey(r.name) === _medlKey(name); }) || { last12: 0, lastSent: null };
  }
  document.getElementById('medl-send-title').textContent = open ? 'Endre medlesing' : 'Send til medlesing';
  document.getElementById('medl-send-case').textContent = c.caseNumber;
  var sel = document.getElementById('medl-send-reader');
  sel.innerHTML = active.map(function(m) {
    var s = statFor(m.name);
    return '<option value="' + esc(m.name) + '">' + (m.name === suggested ? '★ ' : '') + esc(m.name) +
      ' · ' + s.last12 + ' siste 12 mnd</option>';
  }).join('');
  sel.value = open ? (active.find(function(m) { return _medlKey(m.name) === _medlKey(open.reader); }) || {}).name : (suggested || '');
  if (active.length && sel.selectedIndex < 0) sel.selectedIndex = 0;
  sel.style.display = active.length ? '' : 'none';
  document.getElementById('medl-send-empty').style.display = active.length ? 'none' : '';
  var sug = document.getElementById('medl-send-suggest');
  if (suggested && !open) {
    var s = statFor(suggested);
    sug.textContent = '★ Foreslått: ' + suggested + ' — ' + s.last12 + ' medlesing' + (s.last12 === 1 ? '' : 'er') +
      ' siste 12 mnd' + (s.lastSent ? ' · sist ' + toDisplay(s.lastSent) : ' · aldri brukt');
    sug.style.display = '';
  } else {
    sug.style.display = 'none';
  }
  document.getElementById('medl-send-date').value = toDisplay(open ? open.sent : today);
  document.getElementById('medl-send-error').textContent = '';
  document.getElementById('btn-medl-send-confirm').disabled = !active.length;
  document.getElementById('btn-medl-send-confirm').textContent = open ? 'Lagre' : 'Send';
  openBackdrop('medl-send-backdrop');
}

function closeMedlSendModal() { closeBackdrop('medl-send-backdrop'); pendingMedlId = null; }

// ── Medlesere i Innstillinger og Statistikk ────────
function renderMedleserList() {
  var el = document.getElementById('medleser-list');
  if (!el) return;
  if (!medleserList.length) {
    el.innerHTML = '<p class="vac-empty">Ingen medlesere registrert ennå.</p>';
    return;
  }
  el.innerHTML = medleserList.map(function(m, i) {
    return '<div class="vac-row medleser-row' + (m.active ? '' : ' medleser-inactive') + '">' +
      '<span class="vac-label">' + esc(m.name) + '</span>' +
      '<label class="medleser-active"><input type="checkbox" class="medleser-toggle" data-idx="' + i + '"' + (m.active ? ' checked' : '') + ' /> aktiv</label>' +
      '<button class="btn-icon btn-medleser-del" data-idx="' + i + '" title="Fjern fra lista" aria-label="Fjern ' + esc(m.name) + '">✕</button>' +
    '</div>';
  }).join('');
}

function renderMedleserStats() {
  var el = document.getElementById('medleser-stats');
  if (!el) return;
  var rows = medleserStats(medlLog, todayStr(), medleserList);
  var empty = document.getElementById('medleser-stats-empty');
  empty.style.display = medlLog.length ? 'none' : '';
  if (!medlLog.length) { el.innerHTML = ''; return; }
  var max = rows.reduce(function(m, r) { return Math.max(m, r.last12); }, 0) || 1;
  el.innerHTML = '<table class="case-table medleser-stats-table"><thead><tr>' +
    '<th>Medleser</th><th class="medleser-bar-col" aria-hidden="true"></th>' +
    '<th class="stat-col-num">Siste 12 mnd</th><th class="stat-col-num">Totalt</th><th>Sist brukt</th>' +
    '</tr></thead><tbody>' +
    rows.map(function(r) {
      return '<tr><td>' + esc(r.name) + '</td>' +
        '<td class="medleser-bar-col" aria-hidden="true"><span class="medleser-bar" style="width:' + Math.round(r.last12 / max * 100) + '%"></span></td>' +
        '<td class="stat-col-num">' + r.last12 + '</td><td class="stat-col-num">' + r.total + '</td>' +
        '<td>' + (r.lastSent ? toDisplay(r.lastSent) : '—') + '</td></tr>';
    }).join('') + '</tbody></table>';
}

function render() {
  pruneActiveCase();
  pruneMedl();
  updateNav();
  renderActiveCaseChip();
  showView(activePage);
  if (activePage !== 'sak' && _roundDrawer.open) closeRoundDrawer();
  if (activePage === 'hjem')          { renderHjem();          return; }
  if (activePage === 'statistikk')    { renderStats();         return; }
  if (activePage === 'innstillinger') { renderInnstillinger(); return; }
  if (activePage === 'sak')           { renderSak(activeSakId); return; }
  if (activePage === 'medlesing')     { renderMedlesing();      return; }

  var cfg    = PAGES[activePage];
  var sorted = sortedForPage(activePage);
  document.getElementById('page-title').textContent = cfg.title;
  document.getElementById('btn-open-modal').textContent = addButtonLabel(activePage);
  updateCaseStats();

  var isOversikt = !!cfg.showAll;

  // Tidslinje: vis på alle sakssider unntatt avsluttet og oversikt (alle saker).
  // Er den slått sammen, tegnes den ikke — den har ingen bredde å regne fra.
  var tlDock = document.getElementById('cases-tl-dock');
  var tlHost = document.getElementById('cases-tl-host');
  var showTl = activePage !== 'avsluttet' && !isOversikt;
  if (tlDock) tlDock.hidden = !showTl;
  if (showTl) {
    applyCasesTlCollapsed();
    if (_tlLastCasesPage !== activePage && _tlPageDefaults[activePage]) {
      _tlConfig['cases-timeline'].typeFilter = _tlPageDefaults[activePage].slice();
      _tlLastCasesPage = activePage;
      var casesTlWrap = tlHost.querySelector('.home-timeline-wrap');
      if (casesTlWrap && casesTlWrap._syncVisual) casesTlWrap._syncVisual();
    }
    if (!casesTlCollapsed()) renderTimeline({ target: 'cases-timeline' });
  }

  // Oversikt (Alle saker) → tabell; øvrige → kortliste
  var tableSection = document.querySelector('#view-cases .table-section');
  var caseList     = document.getElementById('case-list');
  var cardEmpty    = document.getElementById('card-list-empty');

  var filterBar = document.getElementById('avsluttet-filter-bar');
  tableSection.style.display = 'none';
  caseList.style.display     = '';
  // Filterlinjen vises nå på alle sakslister, ikke bare oversikten.
  if (filterBar) filterBar.style.display = 'block';
  // Alle sakslister viser samme rad: frist, saksnummer, tittel og forløpsspor.
  // Neste steg ligger i ⋯-menyen.
  renderAllSortHead(isOversikt && sorted.length > 0);
  renderCaseList(sorted, { filter: tagFilter }, caseList, cardEmpty);
}

// ── Kortliste (ny / fristarkiv / viderebehandling) ─
// Tomtilstand: skiller mellom "ingen saker i det hele tatt" og "filteret ga
// null treff", så brukeren vet om løsningen er å opprette en sak eller å
// tømme søket.
function emptyStateMessage(filter, page) {
  var trimmed = (filter || '').trim();
  if (trimmed) return { text: 'Ingen saker matcher «' + trimmed + '».', clearable: true };
  return { text: 'Ingen saker her. Bruk «' + addButtonLabel(page) + '» for å opprette en ny.', clearable: false };
}

// ── Forløpsspor: HTML ──────────────────────────────
var TRK_ICONS = { done: 'ti-check', granted: 'ti-check', refused: 'ti-x', closed: 'ti-minus', wait: 'ti-clock', caution: 'ti-alert-triangle' };
var TRK_STATE_TEXT = { done: 'fullført', active: 'pågår', videre: 'pågår', future: 'ikke startet', wait: 'venter på søker',
                       caution: 'pågår, mange runder', granted: 'meddelt', refused: 'avslått', closed: 'henlagt' };

// Steget saken står på nå: det siste som ikke er «future».
// Ren funksjon — se test/caseTrack.test.js.
function currentTrackSlot(slots) {
  if (!slots || !slots.length) return null;
  for (var i = slots.length - 1; i >= 0; i--) {
    if (slots[i].state !== 'future') return slots[i];
  }
  return slots[0];
}

function trackStepHtml(s) {
  var ico = TRK_ICONS[s.state];
  return '<span class="trk-step trk-' + s.state + '" title="' + esc(s.label + ' — ' + TRK_STATE_TEXT[s.state]) + '">' +
    (ico ? '<svg class="ti" aria-hidden="true"><use href="#' + ico + '"/></svg>' : '') +
    '<span>' + esc(s.label) + '</span></span>';
}

// Fullt spor (sakslister) eller minispor (Oversikt). Oppdrag har ingen
// saksflyt og får én bjelke i sporets sted.
function trackHtml(c, mini) {
  var slots = caseTrack(c);
  if (!slots) {
    var done = c.status === 'avsluttet';
    var text = done ? 'Oppdrag · utført' : 'Oppdrag' + (c.duration ? ' · ' + c.duration + ' dager' : '');
    if (mini) {
      return '<span class="trk-mini"><span class="trk-mini-bar" aria-hidden="true"><span class="trk-mini-seg trk-opp"></span></span>' +
        '<span class="trk-mini-label trk-opp">' + esc(done ? 'Utført' : (c.duration ? c.duration + ' dager' : 'Oppdrag')) + '</span></span>';
    }
    return '<div class="trk-oppdrag"><svg class="ti" aria-hidden="true"><use href="#' + (done ? 'ti-check' : 'ti-clock') + '"/></svg>' + esc(text) + '</div>';
  }
  var cur = currentTrackSlot(slots);
  if (mini) {
    return '<span class="trk-mini" title="' + esc(slots.map(function(s) { return s.label; }).join(' → ')) + '">' +
      '<span class="trk-mini-bar" aria-hidden="true">' +
        slots.map(function(s) { return '<span class="trk-mini-seg trk-' + s.state + '"></span>'; }).join('') +
      '</span>' +
      '<span class="trk-mini-label trk-' + cur.state + '">' + esc(cur.label) + '</span></span>';
  }
  return '<div class="trk" role="group" aria-label="Forløp: ' + esc(cur.label) + '">' + slots.map(trackStepHtml).join('') + '</div>';
}

// Sakslister med én status viser det kompakte forløpet (som på Oversikt), så
// tittelen får plassen; rundenummeret står fortsatt i etiketten. Alle saker
// beholder hele forløpet, for der er statusene ulike fra rad til rad.
// Ren funksjon — se test/listTrack.test.js.
function listTrackMini(page) {
  return ['ny', 'viderebehandling', 'fristarkiv', 'oppdrag'].indexOf(page) !== -1;
}

// ── Felles kortliste-renderer ──────────────────────
function renderCaseList(sorted, opts, listEl, emptyEl) {
  var filter      = opts.filter || null;

  var rows = sorted;
  if (filter) {
    var terms = filter.toLowerCase().split(',').map(function(t) { return t.trim(); }).filter(Boolean);
    rows = sorted.filter(function(c) {
      var hay = ((c.caseNumber || '') + ' ' + (c.title || '') + ' ' + (c.tags || '') + ' ' + (c.notes || '')).toLowerCase();
      return terms.every(function(term) { return hay.indexOf(term) !== -1; });
    });
  }

  if (!rows.length) {
    listEl.innerHTML = '';
    if (emptyEl) {
      var empty = emptyStateMessage(filter, activePage);
      emptyEl.innerHTML = esc(empty.text) +
        (empty.clearable ? ' <button type="button" class="table-empty-clear" id="btn-empty-clear-filter">Tøm filter</button>' : '');
      emptyEl.style.display = 'block';
    }
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  listEl.innerHTML = rows.map(function(c) {
    var isOppdrag   = c.type === 'oppdrag';
    var isAvsluttet = c.status === 'avsluttet';
    var days        = daysUntil(deadlineFor(c));
    var cls         = days < 0 ? 'overdue' : days <= 3 ? 'urgent' : days <= 14 ? 'soon' : 'ok';
    // I Fristarkiv er fristen søkerens: nøytral og stiplet, uansett hvor nær.
    if (!isOppdrag && c.status === 'fristarkiv') cls = 'theirs';
    var daysTxt     = days < 0 ? Math.abs(days) + 'd forfalt' : days === 0 ? 'I dag' : days + 'd';
    var tips        = [];
    if (cls === 'theirs') tips.push('Søkerens svarfrist — ikke din arbeidsfrist');
    if (isUnassigned(c)) tips.push('Ikke fordelt ennå — teller ikke i belegget');
    if (periodOverlapsVacation(c)) tips.push(vacationTipText(c));
    var closedAgo   = isAvsluttet ? closedDaysAgo(c, todayStr()) : null;
    var daysBadge   = !isAvsluttet
      ? '<span class="days-badge ' + cls + '"' + (tips.length ? ' title="' + esc(tips.join(' · ')) + '"' : '') + '>' +
          esc(daysTxt) + '</span>'
      : closedAgo !== null
        ? '<span class="days-badge days-badge-closed" title="Avsluttet ' + esc(toDisplay(String(closedDate(c)).slice(0, 10))) + '">' +
            (closedAgo === 0 ? 'I dag' : closedAgo + 'd siden') + '</span>'
        : '<span class="days-badge days-badge-placeholder"></span>';
    var tooltip     = c.tags ? ' title="' + esc(c.tags) + '"' : '';
    var cardCls     = (isOppdrag ? ' case-card-oppdrag' : '') + (isActiveCaseId(c.id) ? ' is-active-case' : '') + (isUnassigned(c) ? ' is-unassigned' : '');
    var cnCls       = isOppdrag ? ' case-card-cn-oppdrag' : '';
    return '<div class="case-card' + cardCls + '" data-id="' + c.id + '">' +
      daysBadge +
      '<span class="case-card-cn' + cnCls + '"' + tooltip + '>' + esc(c.caseNumber) + '</span>' +
      '<span class="case-card-main"><span class="case-card-title">' + esc(c.title) + '</span>' + caseNoteHtml(c) + '</span>' +
      activeCasePillHtml(c) +
      unassignedPillHtml(c) +
      postponePillHtml(c) +
      medlPillHtml(c) +
      trackHtml(c, listTrackMini(activePage)) +
      '<div class="case-card-menu">' +
        '<button class="btn-card-hist" data-id="' + c.id + '" title="Historikk" aria-label="Historikk">⏱</button>' +
        '<button class="btn-card-more" data-id="' + c.id + '" title="Mer" aria-label="Flere handlinger">⋯</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

