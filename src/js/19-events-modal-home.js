// ── Modal-faner ────────────────────────────────────
function _modalSwitchTab(tab) {
  var isBulk = tab === 'bulk';
  document.getElementById('modal-pane-sak').style.display    = isBulk ? 'none' : '';
  document.getElementById('modal-pane-bulk').style.display   = isBulk ? '' : 'none';
  document.getElementById('modal-tab-sak').className  = 'modal-tab' + (!isBulk ? ' modal-tab-sak-on'  : '');
  document.getElementById('modal-tab-bulk').className = 'modal-tab' + (isBulk  ? ' modal-tab-bulk-on' : '');
  document.getElementById('modal-bulk-count').style.display  = isBulk ? '' : 'none';
  document.getElementById('btn-save').textContent = isBulk ? 'Legg til saker' : 'Lagre sak';
  if (!editIdEl.value) document.getElementById('modal-title').textContent = isBulk ? 'Legg til saker' : 'Legg til sak';
  if (isBulk) {
    _modalBulkParsed = [];
    _modalBulkDupInfo = null;
    _renderModalBulkDupNotice(null);
    document.getElementById('modal-bulk-paste').value = '';
    document.getElementById('modal-bulk-preview').innerHTML = '';
    document.getElementById('f-bulk-unassigned').checked = UNASSIGNED_NEW_DEFAULT;
    _updateModalBulkCount();
  }
}

document.getElementById('modal-tab-sak').addEventListener('click', function() { _modalSwitchTab('sak'); });
document.getElementById('modal-tab-bulk').addEventListener('click', function() { _modalSwitchTab('bulk'); });

// ── Avansert-toggle ────────────────────────────────
document.getElementById('modal-adv-toggle').addEventListener('click', function() {
  this.classList.toggle('open');
  document.getElementById('modal-adv-body').classList.toggle('open');
});

// ── Status radioknapper ────────────────────────────
document.querySelectorAll('input[name="status"]').forEach(function(r) {
  r.addEventListener('change', function() {
    _setModalOppdrag(this.value === 'oppdrag');
  });
});

// ── Knapp: Legg til sak ───────────────────────────
document.getElementById('btn-open-modal').addEventListener('click', function() { openModal(null); });
document.getElementById('btn-home-add').addEventListener('click', function() { openModal(null); });
document.getElementById('btn-close-modal').addEventListener('click', closeModal);
document.getElementById('btn-cancel').addEventListener('click', closeModal);
document.getElementById('modal-backdrop').addEventListener('click', function(e) { if (e.target === this) closeModal(); });

// ── Modal-tidslinje: horizon og axis ──────────────
document.querySelectorAll('[data-modal-horizon]').forEach(function(btn) {
  btn.addEventListener('click', function() {
    _tlConfig['modal-timeline'].horizon = parseInt(this.dataset.modalHorizon, 10);
    saveTlView();
    _syncModalTimelineControls();
    renderTimeline({ target: 'modal-timeline' });
  });
});

// Knappene i HTML-en starter på 3 mnd / mnd; vis den lagrede visningen.
function _syncModalTimelineControls() {
  var cfg = _tlConfig['modal-timeline'];
  var isWeek = cfg.axisMode === 'week';
  document.querySelectorAll('[data-modal-horizon]').forEach(function(b) {
    b.classList.toggle('active', parseInt(b.dataset.modalHorizon, 10) === cfg.horizon);
  });
  var tgl = document.getElementById('modal-axis-toggle');
  if (tgl) tgl.classList.toggle('on', isWeek);
  var lm = document.getElementById('modal-lbl-mnd'), lu = document.getElementById('modal-lbl-uke');
  if (lm) lm.classList.toggle('active', !isWeek);
  if (lu) lu.classList.toggle('active', isWeek);
}
_syncModalTimelineControls();

var modalAxisToggle = document.getElementById('modal-axis-toggle');
if (modalAxisToggle) {
  modalAxisToggle.addEventListener('click', function() {
    _tlConfig['modal-timeline'].axisMode = _tlConfig['modal-timeline'].axisMode === 'month' ? 'week' : 'month';
    saveTlView();
    _syncModalTimelineControls();
    renderTimeline({ target: 'modal-timeline' });
  });
}

// ── Bulk i modal ───────────────────────────────────
function _updateModalBulkCount() {
  var checked = _modalBulkParsed.filter(function(r) { return r.checked; }).length;
  var lbl = document.getElementById('modal-bulk-count');
  var btn = document.getElementById('btn-save');
  if (lbl) lbl.textContent = checked + ' av ' + _modalBulkParsed.length + ' saker valgt';
  if (btn && document.getElementById('modal-pane-bulk').style.display !== 'none') {
    btn.textContent = checked > 0 ? 'Legg til ' + checked + ' saker' : 'Legg til saker';
    btn.disabled = checked === 0;
  }
}

// Rader fra «Flere saker» som allerede finnes. Saksnummeret sammenlignes uten
// mellomrom rundt og uten forskjell på store og små bokstaver. En rad som
// finnes fra før, får dup ({ id, status, type } for saken som ligger inne) og
// krysses av; samme saksnummer limt inn flere ganger tas med bare første gang.
// Rader uten saksnummer røres ikke. Ren funksjon — se test/newFeatures.test.js.
function markBulkDuplicates(rows, existing) {
  var byCn = {};
  (existing || []).forEach(function(c) {
    var k = String(c.caseNumber || '').trim().toLowerCase();
    if (k && !byCn[k]) byCn[k] = c;
  });
  var seen = {}, out = [], dupCount = 0, droppedInPaste = 0;
  (rows || []).forEach(function(r) {
    var k = String(r.cn || '').trim().toLowerCase();
    if (k && seen[k]) { droppedInPaste++; return; }
    if (k) seen[k] = true;
    var c = k ? byCn[k] : null;
    if (c) dupCount++;
    out.push(Object.assign({}, r, {
      dup: c ? { id: c.id, status: c.status, type: c.type } : null,
      checked: c ? false : r.checked
    }));
  });
  return { rows: out, dupCount: dupCount, droppedInPaste: droppedInPaste };
}

function _bulkDupLabel(dup) {
  if (dup.type === 'oppdrag') return 'Oppdrag';
  return (STATUS_CONFIG[dup.status] || {}).label || dup.status;
}

// Varselet over forhåndsvisningen. Teksten følger antallet som finnes fra før
// og som ble limt inn flere ganger.
function _renderModalBulkDupNotice(info) {
  var el = document.getElementById('modal-bulk-dups');
  if (!el) return;
  var parts = [];
  if (info && info.dupCount) {
    parts.push('<strong>' + info.dupCount + ' av ' + _modalBulkParsed.length + ' saker finnes allerede</strong> og er tatt bort. Kryss av hvis du vil legge dem inn likevel.');
  }
  if (info && info.droppedInPaste) {
    parts.push(info.droppedInPaste + (info.droppedInPaste === 1 ? ' saksnummer var' : ' saksnumre var') + ' limt inn flere ganger og er tatt med bare én gang.');
  }
  el.hidden = !parts.length;
  el.innerHTML = parts.length
    ? '<svg class="ti" aria-hidden="true"><use href="#ti-alert-triangle"/></svg><span>' + parts.join(' ') + '</span>'
    : '';
}

var _modalBulkDupInfo = null;

// Leser inn nye rader: merker dem som finnes, og tegner forhåndsvisningen.
function _setModalBulkRows(rows) {
  var res = markBulkDuplicates(rows, cases);
  _modalBulkParsed = res.rows;
  _modalBulkDupInfo = res;
  _renderModalBulkPreview();
}

function _renderModalBulkPreview() {
  var container = document.getElementById('modal-bulk-preview');
  if (!container) return;
  _renderModalBulkDupNotice(_modalBulkParsed.length ? _modalBulkDupInfo : null);
  if (!_modalBulkParsed.length) { container.innerHTML = ''; return; }
  var hdr = '<div class="bulk-preview-hdr"><div></div><div>Saksnummer</div><div>Tittel</div><div>Forfallsdato</div><div></div></div>';
  var rows = _modalBulkParsed.map(function(row) {
    var dateOk   = row.date && isValidDate(row.date);
    var cnOk     = !!row.cn;
    var dateDisp = dateOk ? toDisplay(row.date) : (row.date || '—');
    var titleHtml = row.dup
      ? '<div class="bulk-preview-cell bulk-dup-title"><span>' + esc(row.title || '') + '</span>' +
          '<span class="bulk-dup-tag" title="Saken ligger allerede inne">Finnes · ' + esc(_bulkDupLabel(row.dup)) + '</span></div>'
      : '<div class="bulk-preview-cell">' + esc(row.title || '') + '</div>';
    var checkLabel = row.dup ? 'Legg inn ' + (row.cn || '') + ' likevel' : 'Velg ' + (row.cn || 'rad');
    return '<div class="bulk-preview-row' + (row.dup ? ' is-dup' : '') + '" data-rid="' + row.id + '">' +
      '<div class="bulk-check-cell"><input type="checkbox" class="bulk-check" data-rid="' + row.id + '"' + (row.checked ? ' checked' : '') + ' aria-label="' + esc(checkLabel) + '"/></div>' +
      '<div class="bulk-preview-cell' + (cnOk ? '' : ' err') + '">' + esc(row.cn || '—') + '</div>' +
      titleHtml +
      '<div class="bulk-preview-cell' + (dateOk ? '' : ' err') + '">' + esc(dateDisp) + '</div>' +
      '<button class="bulk-del" data-rid="' + row.id + '" title="Fjern rad">×</button>' +
    '</div>';
  }).join('');
  container.innerHTML = hdr + rows;
  renderTimeline({ target: 'modal-timeline', draftRows: _modalBulkParsed.filter(function(r){ return r.checked; }) });
  _updateModalBulkCount();
}

function _parseModalBulkRow(cols) {
  if (_modalBulkMode === 'fast') {
    return { id: _bulkRowId(), cn: (cols[0]||'').trim(), title: (cols[1]||'').trim(), date: _normDate((cols[2]||'').trim()), checked: true };
  }
  var cn='', date='', rest=[];
  var reNr   = /^\d{8}P?$/i;
  var reDate = /^\d{2}\.\d{2}\.\d{4}$|^\d{4}[.\-]\d{2}[.\-]\d{2}$/;
  cols.forEach(function(c) {
    var t = c.trim();
    if (!cn   && reNr.test(t))   cn = t;
    else if (!date && reDate.test(t)) date = _normDate(t);
    else rest.push(t);
  });
  return { id: _bulkRowId(), cn: cn, title: rest.join(' '), date: date, checked: true };
}

// Saksoversikt kopiert med én verdi per linje (ingen tab). Hver sak starter
// med saksnummeret, deretter: sakstype, tittel, fagområde, null eller flere
// interessenter, frist for tilbakemelding, frist for saken og CPC-klasse.
// Fagområdet blir stikkord; frist for saken blir forfallsdato. Mangler en av
// de to fristene, blir datoen tom så raden vises som ugyldig — den første
// datoen alene er tilbakemeldingsfristen og må ikke tolkes som saksfristen.
function parseBulkBlocks(text) {
  var reNr   = /^\d{8}P?$/i;
  var reDate = /^\d{2}\.\d{2}\.\d{4}$|^\d{4}[.\-]\d{2}[.\-]\d{2}$/;
  var lines = String(text || '').split(/\r\n|\r|\n/)
    .map(function(l) { return l.trim(); })
    .filter(function(l) { return l; });
  var blocks = [];
  lines.forEach(function(l) {
    if (reNr.test(l)) blocks.push({ cn: l, lines: [] });
    else if (blocks.length) blocks[blocks.length - 1].lines.push(l);
  });
  return blocks.map(function(b) {
    var firstDate = -1;
    b.lines.some(function(l, i) { if (reDate.test(l)) { firstDate = i; return true; } return false; });
    var head  = firstDate === -1 ? b.lines : b.lines.slice(0, firstDate);
    var dates = firstDate === -1 ? [] : b.lines.slice(firstDate).filter(function(l) { return reDate.test(l); });
    return {
      cn:    b.cn,
      title: head[1] || '',
      date:  dates.length >= 2 ? _normDate(dates[1]) : '',
      tags:  head[2] || ''
    };
  });
}

document.getElementById('modal-bulk-paste').addEventListener('input', function() {
  if (this.value.indexOf('\t') === -1) {
    // Ingen tab = ikke Excel, men saksoversikten med én verdi per linje
    _setModalBulkRows(parseBulkBlocks(this.value).map(function(r) {
      return { id: _bulkRowId(), cn: r.cn, title: r.title, date: r.date, tags: r.tags, checked: true };
    }));
    return;
  }
  var lines = this.value.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').filter(function(l){return l.trim();});
  _setModalBulkRows(lines.map(function(l) { return _parseModalBulkRow(l.split('\t')); }));
});

document.getElementById('modal-bulk-preview').addEventListener('change', function(e) {
  if (!e.target.classList.contains('bulk-check')) return;
  var row = _modalBulkParsed.find(function(r) { return r.id === e.target.dataset.rid; });
  if (row) { row.checked = e.target.checked; _updateModalBulkCount(); renderTimeline({ target: 'modal-timeline', draftRows: _modalBulkParsed.filter(function(r){return r.checked;}) }); }
});
document.getElementById('modal-bulk-preview').addEventListener('click', function(e) {
  var del = e.target.closest('.bulk-del');
  if (!del) return;
  _modalBulkParsed = _modalBulkParsed.filter(function(r) { return r.id !== del.dataset.rid; });
  _renderModalBulkPreview();
});

document.getElementById('modal-pill-auto').addEventListener('click', function() {
  _modalBulkMode = 'auto';
  this.classList.add('on');
  document.getElementById('modal-pill-fast').classList.remove('on');
  document.getElementById('modal-bulk-hint').textContent = 'Gjenkjenner saksnummer (8 siffer, evt. med P til slutt), dato (DD.MM.ÅÅÅÅ eller ÅÅÅÅ.MM.DD) og tittel automatisk. Saksoversikten med én verdi per linje kan også limes inn direkte.';
  var inp = document.getElementById('modal-bulk-paste');
  if (inp.value) inp.dispatchEvent(new Event('input'));
});
document.getElementById('modal-pill-fast').addEventListener('click', function() {
  _modalBulkMode = 'fast';
  this.classList.add('on');
  document.getElementById('modal-pill-auto').classList.remove('on');
  document.getElementById('modal-bulk-hint').textContent = 'Fast rekkefølge: saksnummer [tab] tittel [tab] forfallsdato';
  var inp = document.getElementById('modal-bulk-paste');
  if (inp.value) inp.dispatchEvent(new Event('input'));
});

document.getElementById('btn-save').addEventListener('click', function() {
  var isBulk = document.getElementById('modal-pane-bulk').style.display !== 'none';

  if (isBulk) {
    var toAdd = _modalBulkParsed.filter(function(r) { return r.checked && r.cn.trim() && r.date && isValidDate(r.date); });
    if (!toAdd.length) { document.getElementById('modal-bulk-error').textContent = 'Ingen gyldige saker valgt. Sjekk at saksnummer og dato er fylt ut.'; return; }
    var bulkUnassigned = document.getElementById('f-bulk-unassigned').checked;
    var skipped = _modalBulkParsed.filter(function(r) { return r.checked && (!r.cn.trim() || !r.date || !isValidDate(r.date)); }).length;
    toAdd.forEach(function(row) {
      dispatch('CASE_CREATE', { caseNumber: row.cn.trim(), dueDate: row.date, status: 'ny', title: row.title.trim(), notes: '', tags: row.tags || '', type: 'sak', unassigned: bulkUnassigned });
    });
    closeModal();
    navigateTo('ny');
    showToast('\u2713 ' + toAdd.length + ' saker lagt til' + (bulkUnassigned ? ' som ikke fordelt' : '') + (skipped ? ' (' + skipped + ' hoppet over)' : ''));
    return;
  }

  // Én sak
  fieldError.textContent = '';
  fieldWarn.textContent  = '';
  var st = getSelectedStatus();
  var isOppdrag = st === 'oppdrag';
  var cnEl = isOppdrag ? document.getElementById('f-case-number-op') : fCaseNum;
  var ddEl = isOppdrag ? document.getElementById('f-due-date-op')    : fDueDate;
  var cn = cnEl.value.trim(), dd = ddEl.value, ti = fTitle.value.trim();
  if (!cn || !dd || !ti) { fieldError.textContent = 'Saksnummer, forfallsdato og tittel er påkrevd.'; _dupWarnPending = false; return; }
  if (!isValidDate(dd))  { fieldError.textContent = 'Ugyldig dato — bruk formatet åååå.mm.dd.'; _dupWarnPending = false; return; }
  var id = editIdEl.value;
  var cnLower = cn.toLowerCase();
  var duplicate = cases.find(function(c) { return c.caseNumber.toLowerCase() === cnLower && c.id !== id; });
  if (duplicate && !_dupWarnPending) {
    fieldWarn.textContent = '⚠ Saksnummer «' + cn + '» finnes allerede. Klikk Lagre igjen for å opprette likevel.';
    _dupWarnPending = true; return;
  }
  fieldWarn.textContent = '';
  _dupWarnPending = false;
  var filingDate = isOppdrag ? undefined : filingDateFromInput(fFilingDate.value);
  if (filingDate === null) { fieldError.textContent = 'Ugyldig innleveringsdato — bruk formatet åååå.mm.dd.'; _dupWarnPending = false; return; }
  // Samme regler som innleveringsdatoen: tom = ingen, ugyldig = null
  var priorityDate = isOppdrag ? undefined : filingDateFromInput(fPriorityDate.value);
  if (priorityDate === null) { fieldError.textContent = 'Ugyldig prioritetsdato — bruk formatet åååå.mm.dd.'; _dupWarnPending = false; return; }
  var datesError = isOppdrag ? '' : applicationDatesError(filingDate, priorityDate);
  if (datesError) { fieldError.textContent = datesError; _dupWarnPending = false; return; }
  var medl = id && !isOppdrag ? _readModalMedl() : null;
  if (medl && medl.error) { fieldError.textContent = medl.error; _dupWarnPending = false; return; }
  var internalDate = parseDate(dd);
  // Tomt felt = ingen egen varighet; standarden fra Innstillinger gjelder da
  var duration = isOppdrag ? (parseInt(fDuration.value, 10) >= 1 ? parseInt(fDuration.value, 10) : null) : undefined;
  var origCase = id ? cases.find(function(c) { return c.id === id; }) : null;
  // Et statusbytte lagres ikke her, men kjøres gjennom saksflyten etterpå
  var plan = editStatusPlan(origCase, st);
  // Venter et statusbytte, beholdes sakens egen buffer til overgangen fjerner
  // den — avbrytes overgangen, er saken som før.
  var caseBuffer = isOppdrag ? null
    : plan.transitionTo ? (origCase.caseBuffer != null ? origCase.caseBuffer : null)
    : modalCaseBuffer(origCase, st, fCaseBuffer ? fCaseBuffer.value : '');
  // For oppdrag: bevar eksisterende status ved redigering, sett 'ny' for nye
  var existingOppdragStatus = id ? ((cases.find(function(c){return c.id===id;})||{}).status || null) : null;
  var oppdragStatus = (existingOppdragStatus && existingOppdragStatus !== 'oppdrag') ? existingOppdragStatus : 'ny';
  var payload = { caseNumber: cn, dueDate: internalDate, title: ti,
    notes: fNotes.value.trim(), tags: fModalTags.value,
    type: isOppdrag ? 'oppdrag' : 'sak', status: isOppdrag ? oppdragStatus : plan.status, duration: duration, caseBuffer: caseBuffer, filingDate: filingDate,
    priorityDate: priorityDate, unassigned: plan.status === 'ny' && document.getElementById('f-unassigned').checked };
  if (id) { payload.id = id; dispatch('CASE_EDIT', payload); }
  else    { dispatch('CASE_CREATE', payload); }
  if (medl) dispatch('MEDL_SET', { id: id, reader: medl.reader, date: medl.date, addToList: medl.addToList });
  var dest = isOppdrag ? 'oppdrag' : st;
  if (activePage === 'sak' || plan.transitionTo) {
    render();
  } else if (activePage !== 'statistikk' && activePage !== 'innstillinger' && activePage !== 'hjem') {
    navigateTo(dest);
  } else {
    render();
  }
  closeModal();
  // Samme vei som statusknappene på sakssiden: stikkord, utfall og ny frist
  // spørres det om, og overgangen føres i historikken og statistikken. Lagre
  // er selve bekreftelsen.
  if (plan.transitionTo) runStatusTransition(id, plan.transitionTo, { skipConfirm: true });
});

// Hva «Lagre» i «Rediger sak» gjør med statusen. Et statusbytte på en
// eksisterende søknad lagres ikke direkte — da ville saken havnet i
// Fristarkiv uten søkerens frist, og overgangen manglet i historikken og
// statistikken. De andre feltene lagres med uendret status, og byttet kjøres
// etterpå gjennom runStatusTransition. Nye saker og oppdrag har ingen
// saksflyt og lagres som før. Ren funksjon — se test/dataIntegrity.test.js.
function editStatusPlan(orig, selected) {
  if (!orig || orig.type === 'oppdrag' || selected === 'oppdrag' || selected === orig.status) {
    return { status: selected, transitionTo: null };
  }
  return { status: orig.status, transitionTo: selected };
}

// ── Stikkord-filter ────────────────────────────────
document.getElementById('tag-filter-input').addEventListener('input', function() {
  dispatch('TAG_FILTER_SET', { tag: this.value.trim() });
});
document.getElementById('btn-filter-clear').addEventListener('click', function() {
  dispatch('TAG_FILTER_SET', { tag: '' });
});
document.getElementById('card-list-empty').addEventListener('click', function(e) {
  if (e.target.closest('#btn-empty-clear-filter')) dispatch('TAG_FILTER_SET', { tag: '' });
});

// ── Hjem: klikk på kommende forfall ───────────────
function handleHomeListClick(e) {
  var moreBtn = e.target.closest('.home-row-more-btn');
  if (moreBtn) {
    e.stopPropagation();
    var id = moreBtn.dataset.id;
    if (_openDropdownId === 'home-' + id) { closeAllDropdowns(); return; }
    closeAllDropdowns();
    _openDropdownId = 'home-' + id;
    var c = cases.find(function(x) { return x.id === id; });
    if (!c) return;
    var dropdown = document.createElement('div');
    dropdown.className = 'card-dropdown';
    dropdown.innerHTML =
      activeCaseMenuItemHtml(c) +
      unassignedMenuItemsHtml(c) +
      medlMenuItemsHtml(c) +
      '<button class="card-dropdown-item btn-home-edit" data-id="' + id + '"><svg class="ti" aria-hidden="true"><use href="#ti-pencil"/></svg> Rediger sak</button>' +
      '<button class="card-dropdown-item danger btn-home-del" data-id="' + id + '"><svg class="ti" aria-hidden="true"><use href="#ti-x"/></svg> Slett sak</button>';
    moreBtn.closest('.home-row-more').appendChild(dropdown);
    dropdown.addEventListener('click', function(ev) {
      var btn = ev.target.closest('button');
      if (!btn) return;
      ev.stopPropagation();
      closeAllDropdowns();
      if (handleUnassignedMenuClick(btn)) {
        // håndtert
      } else if (handleMedlMenuClick(btn)) {
        // håndtert
      } else if (btn.classList.contains('btn-active-toggle')) {
        dispatch('ACTIVE_CASE_TOGGLE', { id: btn.dataset.id });
      } else if (btn.classList.contains('btn-home-edit')) {
        var c2 = cases.find(function(x) { return x.id === btn.dataset.id; });
        if (c2) openModal(c2);
      } else if (btn.classList.contains('btn-home-del')) {
        openConfirm(btn.dataset.id);
      }
    });
    return;
  }
  var row = e.target.closest('.home-upcoming-row');
  if (!row || !row.dataset.id) return;
  navigateTo('sak/' + row.dataset.id);
}
document.getElementById('home-upcoming-list').addEventListener('click', handleHomeListClick);

// ── Hjem: filter for fristlista ───────────────────
(function() {
  var btn   = document.getElementById('home-dl-filter-btn');
  var panel = document.getElementById('home-dl-filter');
  function setOpen(open) {
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) syncHomeDeadlineFilterUi();
  }
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    setOpen(panel.hidden);
  });
  // Hver endring gjelder med én gang; panelet blir stående åpent
  panel.addEventListener('change', function(e) {
    var f = normalizeHomeDeadlineFilter(homeDeadlineFilter);
    var t = e.target;
    if (t.dataset.kind) f[t.dataset.kind][t.dataset.when] = t.checked;
    else if (t.id === 'home-dl-horizon') f.horizon = parseInt(t.value, 10);
    dispatch('HOME_DEADLINE_FILTER_SET', { filter: f });
  });
  document.getElementById('home-dl-reset').addEventListener('click', function() {
    dispatch('HOME_DEADLINE_FILTER_SET', { filter: defaultHomeDeadlineFilter() });
    syncHomeDeadlineFilterUi();
  });
  document.addEventListener('click', function(e) {
    if (!panel.hidden && !e.target.closest('.home-dl-filter-wrap')) setOpen(false);
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && !panel.hidden) { setOpen(false); btn.focus(); }
  });
})();

// ── Tidslinje ↔ saksliste: markering ved hover og fokus ─────
// Peker eller fokus på en rad i Frister-listen eller kortlisten markerer
// sakens bjelke i tidslinjen (og demper de andre); peker på en bjelke markerer
// raden. Ligger bjelken utenfor synsfeltet, vises en pil med saksnummeret i
// kanten — tidslinjen flytter seg ikke. Forhåndsvisningen i sak-dialogen er
// ikke med.
var TL_LINK_ROWS = '.home-upcoming-row[data-id], .case-card[data-id]';
var TL_LINK_TIMELINES = ['home-timeline', 'cases-timeline'];
var _tlLinkedId = null;

function _clearTimelineLink() {
  document.querySelectorAll('.tl-bar-linked').forEach(function(el) { el.classList.remove('tl-bar-linked'); });
  document.querySelectorAll('.tl-track.has-linked').forEach(function(el) { el.classList.remove('has-linked'); });
  document.querySelectorAll('.is-linked-row').forEach(function(el) { el.classList.remove('is-linked-row'); });
  document.querySelectorAll('.tl-edge-hint').forEach(function(el) { el.remove(); });
}

// Markerer saken med id (null fjerner markeringen). force tegner markeringen
// på nytt selv om id er uendret — brukt etter at tidslinjen er tegnet på nytt.
function applyTimelineLink(id, force) {
  if (id === _tlLinkedId && !force) return;
  _tlLinkedId = id;
  _clearTimelineLink();
  if (!id) return;
  var sel = '[data-id="' + CSS.escape(id) + '"]';
  document.querySelectorAll(TL_LINK_ROWS).forEach(function(row) {
    if (row.dataset.id === id) row.classList.add('is-linked-row');
  });
  TL_LINK_TIMELINES.forEach(function(tlId) {
    var tlDiv = document.getElementById(tlId);
    var track = tlDiv && tlDiv.querySelector('.tl-track');
    var bar = track && track.querySelector('.tl-bar' + sel);
    if (!bar) return;
    track.classList.add('has-linked');
    bar.classList.add('tl-bar-linked');
    var scrollEl = tlDiv.closest('.tl-scroll-wrap');
    var host = scrollEl && scrollEl.parentElement;
    if (!host || !scrollEl.clientWidth) return; // skjult tidslinje
    var b = bar.getBoundingClientRect(), v = scrollEl.getBoundingClientRect(), h = host.getBoundingClientRect();
    var side = timelineEdgeSide(b.left, b.right, v.left, v.right);
    if (!side) return;
    var hint = document.createElement('div');
    hint.className = 'tl-edge-hint tl-edge-hint-' + side;
    hint.textContent = timelineEdgeLabel(bar.dataset.cn, side);
    hint.style.top = (b.top - h.top) + 'px';
    hint.style.height = b.height + 'px';
    if (side === 'right') hint.style.right = (h.right - v.right + 2) + 'px';
    else {
      // Gå forbi forfalt-pinnen når den står i venstre kant
      var anchor = scrollEl.querySelector('.tl-pin-anchor');
      var pinW = anchor && !anchor.hidden ? TL_PIN_PX : 0;
      hint.style.left = (v.left - h.left + 2 + pinW) + 'px';
    }
    host.appendChild(hint);
  });
}

(function() {
  function idFor(target) {
    if (!target || !target.closest) return null;
    var row = target.closest(TL_LINK_ROWS);
    if (row) return row.dataset.id;
    var bar = target.closest('.tl-bar[data-id]');
    if (bar && TL_LINK_TIMELINES.some(function(id) { var el = document.getElementById(id); return el && el.contains(bar); })) {
      return bar.dataset.id;
    }
    return null;
  }
  document.addEventListener('mouseover', function(e) { applyTimelineLink(idFor(e.target)); });
  document.addEventListener('focusin',   function(e) { applyTimelineLink(idFor(e.target)); });
  // Pekeren forlater vinduet
  document.addEventListener('mouseout', function(e) { if (!e.relatedTarget) applyTimelineLink(null); });
  // Scrolles tidslinjen sideveis, stemmer ikke kantpilen lenger; tegn
  // markeringen på nytt.
  document.addEventListener('scroll', function(e) {
    var el = e.target;
    if (_tlLinkedId && el && el.classList && el.classList.contains('tl-scroll-wrap')) applyTimelineLink(_tlLinkedId, true);
  }, true);
})();

// ── Tidslinje: hover-popup + klikk-navigasjon ──────
(function() {
  var popup = document.createElement('div');
  popup.className = 'tl-popup';
  popup.style.display = 'none';
  popup.style.pointerEvents = 'none';
  document.body.appendChild(popup);
  // Drag-koden skjuler popupen (og en som venter) når et drag starter
  popup.addEventListener('tl-popup-hide', function() { handleLeave(); });

  // Popupen står ved sporet (timelinePopupPosition), så den ikke dekker
  // bjelkene, og kommer etter en kort forsinkelse (timelinePopupDelay).
  var visibleFor = null;   // elementet popupen vises for nå
  var pendingFor = null;   // elementet en ventende popup gjelder
  var pendingX = 0;        // hvor musen sist var over det
  var timer = null;
  var hiddenAt = -Infinity;

  // Fyller popupen for en saksbjelke eller ferie og plasserer den ved sporet,
  // vannrett ved anchorX (vinduskoordinat).
  // vl er et ferie- eller rød dag-felt; begge har label, from og to.
  function showFor(el, vl, anchorX) {
    if (vl) {
      var vFrom = vl.dataset.from, vTo = vl.dataset.to;
      var isHoliday = vl.classList.contains('tl-holiday');
      var vDatesTxt = vFrom && vTo ? (vFrom === vTo ? toDisplay(vFrom) : toDisplay(vFrom) + ' – ' + toDisplay(vTo)) : '';
      var vDur = vFrom && vTo ? vacationDurationDays(vFrom, vTo) : null;
      var vDurTxt = vDur !== null ? vDur + (vDur === 1 ? ' dag' : ' dager') : '';
      popup.innerHTML = '<span class="tl-popup-cn">' + (isHoliday ? '' : '⛱ ') + esc(vl.dataset.label || (isHoliday ? 'Rød dag' : 'Ferie')) + '</span>' +
        (vDatesTxt ? '<span class="tl-popup-sep"> — </span><span class="tl-popup-title">' + esc(vDatesTxt) + '</span>' : '') +
        (vDurTxt ? '<span class="tl-popup-sep"> · </span><span class="tl-popup-title">' + esc(vDurTxt) + '</span>' : '');
    } else {
      var cn    = el.dataset.cn    || '';
      var title = el.dataset.title || '';
      var due   = el.dataset.due   || '';
      var caseId = el.dataset.id   || '';
      var caseObj = caseId ? cases.find(function(c) { return c.id === caseId; }) : null;
      var effDue = caseObj ? effDueFor(caseObj) : getEffectiveDueDate(due);
      // Nedtellingen måles mot den bufrede fristen — for en utsatt sak mot den
      // faktiske; vis den andre datoen også, så tallene ikke ser ut til å
      // stride mot fristen som står foran dem.
      var cdDue = caseObj ? deadlineFor(caseObj) : effDue;
      var postponed = postponedDaysFor(caseObj);
      var days  = cdDue ? daysUntil(cdDue) : null;
      var wdays = cdDue ? workDaysUntil(cdDue) : null;
      var effTxt = effDue && due && effDue !== due ? formatDate(effDue) : '';
      var infoTxt = timelineDueInfo(due ? formatDate(due) : '', effTxt, days, wdays, postponed) +
        (isUnassigned(caseObj) ? ' · ikke fordelt ennå' : '');
      popup.innerHTML = '<span class="tl-popup-cn">' + esc(cn) + '</span>' +
        (title ? '<span class="tl-popup-sep"> — </span><span class="tl-popup-title">' + esc(title) + '</span>' : '') +
        (infoTxt ? '<span class="tl-popup-sep"> · </span><span class="tl-popup-title">' + esc(infoTxt) + '</span>' : '') +
        (caseObj && caseNotePreview(caseObj.notes) ? '<span class="tl-popup-note">' + esc(String(caseObj.notes).trim()) + '</span>' : '') +
        // Forfalt-båndet: det er her belegget bokfører arbeidet
        (el.classList.contains('tl-overdue-band') ? '<span class="tl-popup-hint">' + OVERDUE_PENALTY_WORKDAYS + ' arb.dager bokført i belegget fra i dag</span>' : '') +
        (postponed && !el.classList.contains('tl-overdue-band') ? '<span class="tl-popup-hint">Utsatt ' + postponed + (postponed === 1 ? ' dag' : ' dager') + ' etter fristen. Fristen flytter seg ikke.</span>' : '') +
        (el.classList.contains('draggable') ? '<span class="tl-popup-hint">Dra for å endre bufferen' + (canPostpone(caseObj) ? ', også forbi fristen' : '') + ' · <kbd>Alt</kbd> + <kbd>←</kbd>/<kbd>→</kbd></span>' : '');
    }
    popup.style.display = 'block';
    visibleFor = el || vl;
    place(anchorX);
  }

  function place(anchorX) {
    var track = visibleFor && visibleFor.closest('.tl-track');
    if (!track) return;
    // Faktiske mål, ikke offsetHeight (avrundet), så luften blir hele 8 px
    var r = track.getBoundingClientRect(), pr = popup.getBoundingClientRect();
    var pos = timelinePopupPosition(anchorX, r.top, r.bottom, pr.width, pr.height,
      document.documentElement.clientWidth, document.documentElement.clientHeight);
    popup.style.left = pos.left + 'px';
    popup.style.top  = pos.top + 'px';
    popup.style.setProperty('--tl-popup-arrow-x', pos.arrowX + 'px');
    popup.classList.toggle('is-below', pos.below);
  }

  function cancelPending() {
    if (timer) clearTimeout(timer);
    timer = null;
    pendingFor = null;
  }

  function handleLeave() {
    cancelPending();
    if (visibleFor) hiddenAt = Date.now();
    visibleFor = null;
    popup.style.display = 'none';
  }

  // Viser popupen for el/vl ved anchorX — med en gang når en popup allerede
  // står (eller nettopp ble lukket), ellers etter forsinkelsen.
  function request(el, vl, anchorX) {
    var target = el || vl;
    if (target === visibleFor) { place(anchorX); return; }
    if (target === pendingFor) { pendingX = anchorX; return; }
    cancelPending();
    var wait = timelinePopupDelay(!!visibleFor, Date.now() - hiddenAt);
    if (!wait) { showFor(el, vl, anchorX); return; }
    pendingFor = target;
    pendingX = anchorX;
    timer = setTimeout(function() {
      var t = pendingFor;
      timer = null;
      pendingFor = null;
      // Bjelken kan ha forsvunnet (ny tegning) eller blitt dratt i mellomtiden
      if (!t || !t.isConnected || document.querySelector('.tl-bar.dragging')) return;
      showFor(el, vl, pendingX);
    }, wait);
  }

  function handleMove(e) {
    var el = e.target.closest('.tl-bar, .tl-overdue-band');
    var vl = e.target.closest('.tl-bar-vacation, .tl-holiday');
    // Under drag viser brikken over bjelken det som skjer
    if ((!el && !vl) || (el && el.classList.contains('dragging'))) { handleLeave(); return; }
    request(el, vl, e.clientX);
  }

  // Forhåndsvisningen i sak-dialogen er bare til å se på — et klikk der ville
  // lukket dialogen og kastet det som er skrevet inn.
  function inModal(target) {
    var m = document.getElementById('modal-timeline');
    return !!(m && m.contains(target));
  }

  function openBar(el) {
    closeAllBackdrops();
    navigateTo('sak/' + el.dataset.id);
  }

  function handleClick(e) {
    var el = e.target.closest('.tl-bar');
    if (!el || !el.dataset.id || inModal(el)) return;
    if (el.classList.contains('draggable')) return; // håndteres av drag-IIFE
    openBar(el);
  }

  var TL_IDS = ['home-timeline', 'modal-timeline', 'cases-timeline'];
  function inTimeline(target) {
    return TL_IDS.some(function(id) {
      var wrap = document.getElementById(id);
      return wrap && wrap.contains(target);
    });
  }

  document.addEventListener('mousemove', function(e) {
    if (!inTimeline(e.target)) { if (visibleFor || pendingFor) handleLeave(); return; }
    handleMove(e);
  });
  document.addEventListener('mouseout', function(e) {
    if (!inTimeline(e.target)) return;
    if (!e.relatedTarget || !inTimeline(e.relatedTarget)) handleLeave();
  });
  document.addEventListener('click', function(e) {
    if (!inTimeline(e.target)) return;
    handleClick(e);
  });

  // Tastatur: bjelkene kan nås med Tab; popupen vises over den som har fokus,
  // og Enter eller mellomrom åpner saken.
  document.addEventListener('focusin', function(e) {
    var el = e.target.closest && e.target.closest('.tl-bar');
    if (!el || !inTimeline(el)) return;
    // Med tastaturet vises popupen med en gang, midt ved bjelken
    var r = el.getBoundingClientRect();
    cancelPending();
    showFor(el, null, r.left + r.width / 2);
  });
  document.addEventListener('focusout', function(e) {
    if (e.target.closest && e.target.closest('.tl-bar')) handleLeave();
  });
  // Popupen står fast i vinduet; scrolles siden eller tidslinjen, ville den
  // blitt stående igjen mens sporet flytter seg. Skjul den til neste musebevegelse.
  document.addEventListener('scroll', function() {
    if (visibleFor || pendingFor) handleLeave();
  }, true);
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var el = e.target.closest && e.target.closest('.tl-bar');
    if (!el || !el.dataset.id || !inTimeline(el) || inModal(el)) return;
    e.preventDefault();
    handleLeave();
    openBar(el);
  });

})();

