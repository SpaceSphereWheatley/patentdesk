// ════════════════════════════════════════════════════════════════════════════
// SEKSJON 6 · EVENT-HÅNDTERING
// Alle addEventListener-kall og navigasjonslogikk
// Kaller dispatch() — ingen direkte DOM-skriv eller localStorage
// ════════════════════════════════════════════════════════════════════════════

// ── Utklippstavle ──────────────────────────────────
function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(function() {
    var orig = btn.textContent;
    btn.textContent = '✓';
    setTimeout(function() { btn.textContent = orig; }, 1500);
  }).catch(function() {
    showToast('✗ Kunne ikke kopiere til utklippstavlen', true);
  });
}

// ── Hash-routing ───────────────────────────────────
var VALID_PAGES = ['hjem','ny','fristarkiv','viderebehandling','avsluttet','statistikk','innstillinger','oppdrag','medlesing'];

var activeSakId = null;

function caseNumberToSlug(cn) {
  return (cn || '').replace(/\s+/g, '-');
}
function slugToCaseId(slug) {
  var cn = (slug || '').replace(/-/g, ' ');
  var match = cases.find(function(c) { return c.caseNumber === cn; });
  if (!match) match = cases.find(function(c) { return c.caseNumber.replace(/\s+/g, '-') === slug; });
  return match ? match.id : null;
}

// «Antall krav» og kravetiketten kan ikke lagre per tastetrykk: antall krav
// fordi SAK_CLAIM_COUNT_CHANGE kaller ensureClaims, som kutter kravlista — å
// skrive «12» ville lagret «1» og slettet krav 2–12 underveis — og etiketten
// fordi feltet byttes tilbake til tekst ved blur. De får i stedet en flush
// rett før visningen forlates.
function flushPendingSakEdits() {
  var el = document.activeElement;
  if (!el || !_isTypingTarget(el)) return;
  if (!el.closest || !el.closest('#view-sak')) return;
  clearTimeout(_sakTypingTimer);
  el.dispatchEvent(new Event('change', { bubbles: true }));
  if (el.blur) el.blur();
}

// Lukking og oppdatering av fanen går ikke via navigateTo, så de trenger sin
// egen flush. visibilitychange fanger også fanebytte, der beforeunload ikke
// alltid fyrer.
window.addEventListener('beforeunload', flushPendingSakEdits);
document.addEventListener('visibilitychange', function() {
  if (document.hidden) flushPendingSakEdits();
});

// Hvor mange sider i appen som ligger bak denne i historikken. Hver historikk-
// oppføring appen skriver bærer tallet (første er 0), så det overlever en
// omlasting. 0 = ingen side i appen å gå tilbake til (siden ble åpnet direkte).
function navDepth() {
  var s = history.state;
  return (s && typeof s === 'object' && Number.isInteger(s.idx) && s.idx > 0) ? s.idx : 0;
}

function navigateTo(page, addToHistory) {
  flushPendingSakEdits();
  if (activePage === 'sak') document.title = 'PatentDesk — Sakslogg';
  // Saksliste-filteret nullstilles ved sidebytte (gjelder nå alle sakslister).
  if (page !== activePage) {
    AppState.ui.tagFilter = '';
    var fi = document.getElementById('tag-filter-input');
    if (fi) fi.value = '';
    var fc = document.getElementById('btn-filter-clear');
    if (fc) fc.style.display = 'none';
  }
  if (typeof page === 'string' && page.indexOf('sak/') === 0) {
    var sakId = page.slice(4);
    var cas   = cases.find(function(c) { return c.id === sakId; });
    var slug  = cas ? caseNumberToSlug(cas.caseNumber) : sakId;
    AppState.activeSakId = sakId;
    AppState.activePage  = 'sak';
    if (addToHistory !== false) history.pushState({ page: 'sak', sakId: sakId, idx: navDepth() + 1 }, '', '#sak/' + slug);
    render();
    return;
  }
  if (typeof page === 'string' && page.indexOf('medlesing/') === 0) {
    var medlesingId = page.slice(10);
    AppState.activeMedlesingId = medlesingId;
    AppState.activePage        = 'medlesing';
    if (addToHistory !== false) history.pushState({ page: 'medlesing', medlesingId: medlesingId, idx: navDepth() + 1 }, '', '#medlesing/' + medlesingId);
    render();
    return;
  }
  if (VALID_PAGES.indexOf(page) === -1) page = 'hjem';
  AppState.activePage  = page;
  AppState.activeSakId = null;
  AppState.activeMedlesingId = null;
  if (addToHistory !== false) {
    var urlSlug = page === 'avsluttet' ? 'alle-saker' : page;
    history.pushState({ page: page, idx: navDepth() + 1 }, '', '#' + urlSlug);
  }
  render();
}

function pageFromHash() {
  var hash = location.hash.replace('#', '').trim();
  if (hash.indexOf('sak/') === 0) {
    var slug = hash.slice(4);
    var id   = slugToCaseId(slug);
    AppState.activeSakId = id;
    return 'sak';
  }
  if (hash.indexOf('medlesing/') === 0) {
    AppState.activeMedlesingId = hash.slice(10);
    return 'medlesing';
  }
  if (hash === 'alle-saker') return 'avsluttet';
  return VALID_PAGES.indexOf(hash) !== -1 ? hash : 'hjem';
}

// Historikkoppføringen siden åpnes med. Adressen beholdes for en saksside og
// en åpen medlesing — ellers ble den «#sak», og en omlasting mistet saken.
// En ukjent sak åpner Hjem. Ren funksjon — se test/logicFixes.test.js.
function initialHistoryEntry(page, sakId, medlesingId, hash) {
  if (page === 'sak') {
    if (!sakId) return { page: 'hjem', state: { page: 'hjem' }, url: '#hjem' };
    return { page: 'sak', state: { page: 'sak', sakId: sakId }, url: '#' + hash };
  }
  if (page === 'medlesing' && medlesingId) {
    return { page: 'medlesing', state: { page: 'medlesing', medlesingId: medlesingId }, url: '#' + hash };
  }
  return { page: page, state: { page: page }, url: '#' + (page === 'avsluttet' ? 'alle-saker' : page) };
}

window.addEventListener('popstate', function(e) {
  flushPendingSakEdits();
  if (e.state && e.state.page === 'sak') {
    AppState.activeSakId = e.state.sakId || null;
    AppState.activePage  = 'sak';
  } else if (e.state && e.state.page === 'medlesing' && e.state.medlesingId) {
    AppState.activeMedlesingId = e.state.medlesingId;
    AppState.activePage        = 'medlesing';
  } else {
    var page = (e.state && e.state.page) || pageFromHash() || 'hjem';
    AppState.activePage        = page;
    AppState.activeSakId       = null;
    AppState.activeMedlesingId = null;
  }
  render();
});

// ── Kortliste-klikk ────────────────────────────────
var _openDropdownId = null;

function closeAllDropdowns() {
  document.querySelectorAll('.card-dropdown').forEach(function(d) { d.parentNode && d.parentNode.removeChild(d); });
  _openDropdownId = null;
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.case-card-menu') && !e.target.closest('.sak-more-wrap') && !e.target.closest('.home-row-more')) closeAllDropdowns();
});

document.getElementById('case-list').addEventListener('click', function(e) {
  var histBtn  = e.target.closest('.btn-card-hist');
  var moreBtn  = e.target.closest('.btn-card-more');
  var card     = e.target.closest('.case-card');

  if (histBtn) {
    e.stopPropagation();
    openHistoryModal(histBtn.dataset.id);
    return;
  }

  if (moreBtn) {
    e.stopPropagation();
    var id = moreBtn.dataset.id;
    if (_openDropdownId === id) { closeAllDropdowns(); return; }
    closeAllDropdowns();
    _openDropdownId = id;
    var c = cases.find(function(x) { return x.id === id; });
    if (!c) return;
    var dropdown = document.createElement('div');
    dropdown.className = 'card-dropdown';
    var act = rowAction(c.status || 'ny', c.type === 'oppdrag');
    dropdown.innerHTML =
      (act ? '<button class="card-dropdown-item btn-row-action" data-id="' + id + '"><svg class="ti" aria-hidden="true"><use href="#ti-check"/></svg> ' + esc(act.label) + '</button>' : '') +
      activeCaseMenuItemHtml(c) +
      unassignedMenuItemsHtml(c) +
      medlMenuItemsHtml(c) +
      (c.status === 'avsluttet' && c.type !== 'oppdrag'
        ? '<button class="card-dropdown-item btn-row-outcome" data-id="' + id + '"><svg class="ti" aria-hidden="true"><use href="#ti-check"/></svg> Endre utfall</button>'
        : '') +
      '<button class="card-dropdown-item btn-copy-path" data-cn="' + esc(c.caseNumber) + '"><svg class="ti" aria-hidden="true"><use href="#ti-copy"/></svg> Kopier mappe-sti</button>' +
      '<button class="card-dropdown-item btn-edit" data-id="' + id + '"><svg class="ti" aria-hidden="true"><use href="#ti-pencil"/></svg> Rediger</button>' +
      '<button class="card-dropdown-item danger btn-del" data-id="' + id + '"><svg class="ti" aria-hidden="true"><use href="#ti-x"/></svg> Slett</button>';
    moreBtn.closest('.case-card-menu').appendChild(dropdown);

    dropdown.addEventListener('click', function(ev) {
      var btn = ev.target.closest('button');
      if (!btn) return;
      ev.stopPropagation();
      closeAllDropdowns();
      if (handleUnassignedMenuClick(btn)) {
        // håndtert
      } else if (handleMedlMenuClick(btn)) {
        // håndtert
      } else if (btn.classList.contains('btn-row-action')) {
        runRowAction(btn.dataset.id);
      } else if (btn.classList.contains('btn-active-toggle')) {
        dispatch('ACTIVE_CASE_TOGGLE', { id: btn.dataset.id });
      } else if (btn.classList.contains('btn-row-outcome')) {
        editOutcome(btn.dataset.id);
      } else if (btn.classList.contains('btn-copy-path')) {
        copyToClipboard(buildCasePath(btn.dataset.cn), btn);
      } else if (btn.classList.contains('btn-edit')) {
        var c2 = cases.find(function(x) { return x.id === btn.dataset.id; });
        if (c2) openModal(c2);
      } else if (btn.classList.contains('btn-del')) {
        openConfirm(btn.dataset.id);
      }
    });
    return;
  }

  // Klikk på kortet (ikke knapper) → sakssiden
  if (card && !e.target.closest('button')) {
    navigateTo('sak/' + card.dataset.id);
  }
});

// ── Pågående sak i drawer ──────────────────────────
document.getElementById('drawer-active-open').addEventListener('click', function() {
  if (this.dataset.id) navigateTo('sak/' + this.dataset.id);
});
document.getElementById('drawer-active-clear').addEventListener('click', function() {
  if (activeCase) dispatch('ACTIVE_CASE_TOGGLE', { id: activeCase.id });
});

// ── Logo → hjem ────────────────────────────────────
document.getElementById('logo-home-link').addEventListener('click', function(e) {
  e.preventDefault(); navigateTo('hjem');
});

// ── Sortering ──────────────────────────────────────
document.getElementById('case-list-head').addEventListener('click', function(e) {
  var btn = e.target.closest('.clh[data-sort]'); if (!btn) return;
  _lsSet(ALL_SORT_STORE_KEY, JSON.stringify(nextAllSort(loadAllSort(), btn.dataset.sort)));
  render();
  var again = document.querySelector('#case-list-head .clh[data-sort="' + btn.dataset.sort + '"]');
  if (again) again.focus();
});
document.querySelectorAll('th.sortable').forEach(function(th) {
  th.addEventListener('click', function() {
    var col = th.dataset.col;
    sortCol === col ? sortDir *= -1 : (sortCol = col, sortDir = 1);
    render();
  });
});

// ── Navigasjon-tabs ────────────────────────────────
document.querySelectorAll('.nav-tab').forEach(function(tab) {
  tab.addEventListener('click', function(e) { e.preventDefault(); navigateTo(tab.dataset.page); });
});

// ── Historikk-modal ────────────────────────────────
document.getElementById('btn-history-close').addEventListener('click', function() { closeBackdrop('history-backdrop'); });
document.getElementById('history-backdrop').addEventListener('click', function(e) { if (e.target === this) closeBackdrop('history-backdrop'); });
document.getElementById('btn-sak-history').addEventListener('click', function() {
  if (activeSakId) openHistoryModal(activeSakId);
});

document.getElementById('btn-sak-active').addEventListener('click', function() {
  if (activeSakId) dispatch('ACTIVE_CASE_TOGGLE', { id: activeSakId });
});

document.getElementById('btn-sak-unassigned-confirm').addEventListener('click', function() {
  if (activeSakId) dispatch('CASE_UNASSIGNED_SET', { id: activeSakId, value: false });
});
document.getElementById('btn-sak-unassigned-drop').addEventListener('click', function() {
  if (activeSakId) dropUnassignedCase(activeSakId);
});

document.getElementById('btn-sak-more').addEventListener('click', function(e) {
  e.stopPropagation();
  var id = activeSakId; if (!id) return;
  if (_openDropdownId === 'sak-more') { closeAllDropdowns(); return; }
  closeAllDropdowns();
  _openDropdownId = 'sak-more';
  var c = cases.find(function(x) { return x.id === id; });
  if (!c) return;
  var dropdown = document.createElement('div');
  dropdown.className = 'card-dropdown';
  dropdown.innerHTML =
    '<button class="card-dropdown-item btn-sak-edit"><svg class="ti" aria-hidden="true"><use href="#ti-pencil"/></svg> Rediger sak</button>' +
    activeCaseMenuItemHtml(c) +
    unassignedMenuItemsHtml(c) +
    medlMenuItemsHtml(c) +
    (c.status === 'avsluttet' && c.type !== 'oppdrag'
      ? '<button class="card-dropdown-item btn-sak-outcome"><svg class="ti" aria-hidden="true"><use href="#ti-check"/></svg> Endre utfall</button>'
      : '') +
    '<button class="card-dropdown-item btn-sak-copy-path" data-cn="' + esc(c.caseNumber) + '"><svg class="ti" aria-hidden="true"><use href="#ti-copy"/></svg> Kopier mappe-sti</button>' +
    '<button class="card-dropdown-item danger btn-sak-del" data-id="' + id + '"><svg class="ti" aria-hidden="true"><use href="#ti-x"/></svg> Slett sak</button>';
  this.closest('.sak-more-wrap').appendChild(dropdown);
  dropdown.addEventListener('click', function(ev) {
    var btn = ev.target.closest('button');
    if (!btn) return;
    ev.stopPropagation();
    closeAllDropdowns();
    if (handleUnassignedMenuClick(btn)) {
      // håndtert
    } else if (handleMedlMenuClick(btn)) {
      // håndtert
    } else if (btn.classList.contains('btn-sak-edit')) {
      openModal(c);
    } else if (btn.classList.contains('btn-active-toggle')) {
      dispatch('ACTIVE_CASE_TOGGLE', { id: btn.dataset.id });
    } else if (btn.classList.contains('btn-sak-outcome')) {
      editOutcome(id);
    } else if (btn.classList.contains('btn-sak-copy-path')) {
      copyToClipboard(buildCasePath(btn.dataset.cn), btn);
    } else if (btn.classList.contains('btn-sak-del')) {
      openConfirm(btn.dataset.id);
    }
  });
});

// ── Saksdokumenter dropdown ─────────────────────────
(function() {
  var dd = document.getElementById('sak-docs-dropdown');

  // Dokumenter finnes to steder — i topplinja og i sticky-baren — men det er
  // ett nedtrekk. Det flyttes inn i wrapperen til knappen som åpnet det, slik
  // at den absolutte plasseringen og lytterne under fortsetter å virke uendret.
  document.addEventListener('click', function(e) {
    var trigger = e.target.closest('.btn-sak-docs');
    if (trigger) {
      e.stopPropagation();
      var wrap = trigger.closest('.sak-docs-wrap');
      if (!wrap) return;
      if (dd.style.display !== 'none' && wrap.contains(dd)) { dd.style.display = 'none'; return; }
      if (!wrap.contains(dd)) wrap.appendChild(dd);
      dd.style.display = '';
      return;
    }
    if (!dd.contains(e.target)) dd.style.display = 'none';
  });

  function activeSakFile(idx) {
    var cas = activeSakId && cases.find(function(c) { return c.id === activeSakId; });
    if (!cas) return null;
    var data = loadSakData(cas.id);
    if (!data || !Array.isArray(data.files) || !data.files[idx]) return null;
    return { cas: cas, data: data, file: data.files[idx] };
  }

  dd.addEventListener('click', function(e) {
    // Venstreklikk på en dokumentlenke: la nettleseren navigere (target=_blank),
    // og lukk nedtrekket. Midtklikk gir auxclick (ikke click) og håndteres nativt
    // av nettleseren som bakgrunnsfane uten å lukke nedtrekket.
    var openLink = e.target.closest('.sak-docs-open');
    if (openLink) {
      dd.style.display = 'none';
      return;
    }

    var copyBtn = e.target.closest('.sak-docs-copy');
    if (copyBtn) {
      var ctx2 = activeSakFile(parseInt(copyBtn.getAttribute('data-idx'), 10));
      if (!ctx2) return;
      var path = _docRootJoin(loadDocRoot(), ctx2.cas.caseNumber, _fileResolvedName(ctx2.file.name));
      navigator.clipboard.writeText(path).then(function() {
        var orig = copyBtn.innerHTML;
        copyBtn.innerHTML = '<svg class="ti" aria-hidden="true"><use href="#ti-check"/></svg>';
        copyBtn.classList.add('copied');
        setTimeout(function() {
          copyBtn.innerHTML = orig;
          copyBtn.classList.remove('copied');
        }, 2000);
      });
      return;
    }

    var delBtn = e.target.closest('.sak-docs-del');
    if (delBtn) {
      if (!activeSakId) return;
      dispatch('FILE_DELETE', { id: activeSakId, idx: parseInt(delBtn.getAttribute('data-idx'), 10) });
      return;
    }

    var renameBtn = e.target.closest('.sak-docs-rename');
    if (renameBtn) {
      var idx = parseInt(renameBtn.getAttribute('data-idx'), 10);
      var ctx3 = activeSakFile(idx);
      if (!ctx3) return;
      var row = renameBtn.closest('.sak-docs-dropdown-row');
      var openBtnEl = row.querySelector('.sak-docs-open');
      // To felt: visningsnavn (bare i listen) og filnavn (lenken).
      var mkInput = function(cls, value, placeholder, label) {
        var el = document.createElement('input');
        el.type = 'text';
        el.className = 'sak-docs-rename-input ' + cls;
        el.maxLength = FILE_LABEL_MAX;
        el.value = value;
        el.placeholder = placeholder;
        el.setAttribute('aria-label', label);
        return el;
      };
      var labelInput = mkInput('sak-docs-label-input', ctx3.file.label || '', _fileDisplayName(ctx3.file.name), 'Navn i PatentDesk');
      var input = mkInput('sak-docs-name-input', ctx3.file.name, 'Filnavn', 'Filnavn');
      labelInput.title = 'Navn i PatentDesk (tomt = filnavnet)';
      input.title = 'Filnavn i saksmappen';
      var edit = document.createElement('div');
      edit.className = 'sak-docs-edit';
      edit.appendChild(labelInput);
      edit.appendChild(input);
      openBtnEl.replaceWith(edit);
      labelInput.focus();
      labelInput.select();
      var done = false;
      var commit = function() {
        if (done) return;
        done = true;
        var next = applyFileEdit(ctx3.file, input.value, labelInput.value);
        if (next.name !== ctx3.file.name || (next.label || '') !== (ctx3.file.label || '')) {
          dispatch('FILE_RENAME', { id: activeSakId, idx: idx, name: input.value, label: labelInput.value });
        } else {
          renderSakFileList(ctx3.data);
        }
      };
      var cancel = function() {
        if (done) return;
        done = true;
        renderSakFileList(ctx3.data);
      };
      [labelInput, input].forEach(function(el) {
        el.addEventListener('keydown', function(ev) {
          if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
          else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); cancel(); }
        });
        // Lagre når fokus forlater begge feltene, ikke ved bytte mellom dem.
        el.addEventListener('blur', function() {
          setTimeout(function() { if (!edit.contains(document.activeElement)) commit(); }, 0);
        });
      });
      return;
    }
  });

  var addInput = document.getElementById('sak-docs-add-input');
  var addBtn   = document.getElementById('btn-sak-docs-add');
  addBtn.addEventListener('click', function() {
    var name = addInput.value.trim();
    if (!name || !activeSakId) return;
    dispatch('FILE_ADD', { id: activeSakId, name: name });
    addInput.value = '';
  });
  addInput.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); addBtn.click(); }
  });

  var folderBtn = document.getElementById('btn-sak-docs-folder');
  folderBtn.addEventListener('click', function() {
    var cas = activeSakId && cases.find(function(c) { return c.id === activeSakId; });
    if (!cas) return;
    copyToClipboard(buildCasePath(cas.caseNumber), folderBtn);
  });

  var openAllBtn = document.getElementById('btn-sak-docs-openall');
  openAllBtn.addEventListener('click', function() {
    var cas = activeSakId && cases.find(function(c) { return c.id === activeSakId; });
    if (!cas) return;
    var data = loadSakData(cas.id);
    var files = (data && data.files) || [];
    var root = loadDocRoot();
    var pdfs = files.filter(function(f) { return _fileIsPdf(f.name); });
    if (!pdfs.length) { showToast('Ingen PDF-dokumenter å åpne.'); return; }
    pdfs.forEach(function(f) {
      var fileUrl = _docFileUrl(root, cas.caseNumber, f.name, window.location);
      window.open(fileUrl, '_blank');
    });
    dd.style.display = 'none';
  });
})();

// ── Slett sak ──────────────────────────────────────
var pendingDeleteId   = null;
var pendingDeleteType = 'case';
function openConfirm(id, type)  {
  pendingDeleteId = id;
  pendingDeleteType = type || 'case';
  var isMedl = pendingDeleteType === 'medlesing';
  document.getElementById('confirm-modal-title').textContent = isMedl ? 'Slett medlesing' : 'Slett sak';
  var textEl = document.querySelector('#confirm-backdrop .modal-text');
  if (textEl) textEl.textContent = isMedl
    ? 'Er du sikker på at du vil slette denne medlesingen? Dette kan ikke angres.'
    : 'Er du sikker på at du vil slette denne saken? Dette kan ikke angres.';
  openBackdrop('confirm-backdrop');
}
function closeConfirm()   { pendingDeleteId = null; pendingDeleteType = 'case'; closeBackdrop('confirm-backdrop'); }
document.getElementById('btn-confirm-cancel').addEventListener('click', closeConfirm);
document.getElementById('confirm-backdrop').addEventListener('click', function(e) { if (e.target === this) closeConfirm(); });
document.getElementById('btn-confirm-delete').addEventListener('click', function() {
  if (pendingDeleteId) {
    dispatch(pendingDeleteType === 'medlesing' ? 'MEDLESING_DELETE' : 'CASE_DELETE', { id: pendingDeleteId });
  }
  closeConfirm();
});

// ── Legg til / Rediger sak ─────────────────────────
var editIdEl   = document.getElementById('edit-id');
var fCaseNum   = document.getElementById('f-case-number');
var fDueDate   = document.getElementById('f-due-date');
var fTitle     = document.getElementById('f-title');
var fNotes     = document.getElementById('f-notes');
var fModalTags = document.getElementById('f-modal-tags');
var fieldError = document.getElementById('field-error');
var fieldWarn  = document.getElementById('field-warn');
var _dupWarnPending = false;
var fDuration   = document.getElementById('f-duration');
var fCaseBuffer = document.getElementById('f-case-buffer');
var fFilingDate = document.getElementById('f-filing-date');
var fPriorityDate = document.getElementById('f-priority-date');

// Modal-tidslinje state
// _tlModalHorizon / _tlModalAxisMode er nå i _tlConfig['modal-timeline']

// Bulk-mode i modal
var _modalBulkMode = 'auto'; // 'auto' | 'fast'
var _modalBulkParsed = [];

function _setModalOppdrag(isOppdrag) {
  document.getElementById('modal-row-sak').style.display     = isOppdrag ? 'none' : '';
  document.getElementById('modal-row-oppdrag').style.display = isOppdrag ? '' : 'none';
  _syncModalBuffer();
  _syncModalUnassigned();
  _syncModalMedl();
}

// ── Medlesing i «Rediger sak» ──────────────────────
var MEDL_NEW_OPTION = '__ny__';
var fMedlReader = document.getElementById('f-medl-reader');
var fMedlNew    = document.getElementById('f-medl-new');
var fMedlDate   = document.getElementById('f-medl-date');

// Bare når en eksisterende søknad redigeres — ikke for oppdrag eller nye saker.
function _syncModalMedl() {
  var row = document.getElementById('modal-row-medl');
  if (row) row.style.display = editIdEl.value && getSelectedStatus() !== 'oppdrag' ? '' : 'none';
}

function _fillModalMedl(c) {
  var cur = c ? caseMedlFor(medlLog, c.id) : null;
  var choices = medlReaderChoices(medleserList, cur ? cur.reader : '');
  fMedlReader.innerHTML = '<option value="">— Ingen —</option>' +
    choices.map(function(m) {
      return '<option value="' + esc(m.name) + '">' + esc(m.name) + (m.active ? '' : ' (inaktiv)') + '</option>';
    }).join('') +
    '<option value="' + MEDL_NEW_OPTION + '">+ Ny medleser…</option>';
  fMedlReader.value = cur ? (choices.find(function(m) { return _medlKey(m.name) === _medlKey(cur.reader); }) || {}).name : '';
  fMedlNew.value = '';
  fMedlDate.value = cur ? toDisplay(cur.sent) : '';
  _syncModalMedlInputs();
}

function _syncModalMedlInputs() {
  var v = fMedlReader.value;
  fMedlNew.style.display = v === MEDL_NEW_OPTION ? '' : 'none';
  fMedlDate.disabled = !v;
  if (v && !fMedlDate.value) fMedlDate.value = toDisplay(todayStr());
}

fMedlReader.addEventListener('change', function() {
  _syncModalMedlInputs();
  if (this.value === MEDL_NEW_OPTION) fMedlNew.focus();
});

// Leser feltene; { error } ved feil, ellers { reader, date, addToList }.
function _readModalMedl() {
  var v = fMedlReader.value;
  if (!v) return { reader: '', date: '', addToList: false };
  var isNew = v === MEDL_NEW_OPTION;
  var reader = isNew ? fMedlNew.value.trim() : v;
  if (!reader) return { error: 'Skriv navnet på den nye medleseren.' };
  var date = filingDateFromInput(fMedlDate.value);
  if (!date) return { error: 'Ugyldig dato for medlesing — bruk formatet åååå.mm.dd.' };
  return { reader: reader, date: date, addToList: isNew };
}

// «Ikke fordelt» gjelder bare Ny søknader; avkrysningen skjules ellers.
function _syncModalUnassigned() {
  var row = document.getElementById('modal-row-unassigned');
  if (row) row.style.display = getSelectedStatus() === 'ny' ? '' : 'none';
}

// Bufferfeltet følger valgt status: skjult der buffer ikke gjelder (oppdrag,
// Fristarkiv), og plassholderen viser standarden for typen. Byttes statusen
// bort fra sakens nåværende, tømmes feltet — egen buffer følger ikke med til
// en ny frist (se modalCaseBuffer). Tilbake til opprinnelig status gir den
// tilbake.
function _syncModalBuffer() {
  if (!fCaseBuffer) return;
  var st = getSelectedStatus();
  var applies = st !== 'oppdrag' && st !== 'fristarkiv' && st !== 'avsluttet';
  fCaseBuffer.closest('.field-group').style.display = applies ? '' : 'none';
  fCaseBuffer.placeholder = 'Standard: ' + typeBufferFor({ status: st });
  // Bare viderebehandling kan utsettes etter fristen (canPostpone)
  var late = st === 'viderebehandling';
  if (late) fCaseBuffer.removeAttribute('min'); else fCaseBuffer.min = '0';
  var hint = document.getElementById('f-case-buffer-hint');
  if (hint) hint.hidden = !late;
  var orig = editIdEl.value ? cases.find(function(c) { return c.id === editIdEl.value; }) : null;
  if (orig && orig.type !== 'oppdrag') {
    fCaseBuffer.value = (st === orig.status && orig.caseBuffer != null) ? String(orig.caseBuffer) : '';
  }
}

function getSelectedStatus() {
  var radios = document.querySelectorAll('input[name="status"]');
  for (var i = 0; i < radios.length; i++) { if (radios[i].checked) return radios[i].value; }
  return modalFallbackStatus(editIdEl.value ? cases.find(function(c) { return c.id === editIdEl.value; }) : null);
}

// Avsluttet har ingen knapp i «Rediger sak» (settes når saken lukkes). Uten
// avkrysset knapp beholder en avsluttet sak statusen sin i stedet for å bli Ny.
// Ren funksjon — se test/caseMedlesing.test.js.
function modalFallbackStatus(orig) {
  return orig && orig.status === 'avsluttet' ? 'avsluttet' : 'ny';
}
function setSelectedStatus(val) {
  document.querySelectorAll('input[name="status"]').forEach(function(r) { r.checked = (r.value === val); });
  _setModalOppdrag(val === 'oppdrag');
}
// Fanen «Legg til» åpner på når en ny sak legges til. «Flere saker» er
// standard, men den legger alltid inn Ny søknader, og oppdrag legges inn ett
// og ett — derfor åpner Fristarkiv, Viderebehandling og Oppdrag på «Én sak».
// Rene funksjoner — se test/addModalTab.test.js.
function defaultAddTab(page) {
  return ['fristarkiv', 'viderebehandling', 'oppdrag'].indexOf(page) >= 0 ? 'sak' : 'bulk';
}
function addButtonLabel(page) {
  return defaultAddTab(page) === 'bulk' ? '+ Legg til saker' : '+ Legg til sak';
}
function openModal(c) {
  fieldError.textContent = '';
  fieldWarn.textContent  = '';
  _dupWarnPending = false;

  // Determine context
  var defaultOppdrag = !c && activePage === 'oppdrag';
  var isOppdrag = (c && c.type === 'oppdrag') || defaultOppdrag;

  document.getElementById('modal-title').textContent = c
    ? (isOppdrag ? 'Rediger oppdrag' : 'Rediger sak')
    : 'Legg til sak';

  // Reset adv toggle
  document.getElementById('modal-adv-toggle').classList.remove('open');
  document.getElementById('modal-adv-body').classList.remove('open');

  // Switch to sak pane. Saks-id settes først: fanebyttet bruker den til å
  // avgjøre om tittelen er «Legg til» eller «Rediger».
  editIdEl.value = c ? c.id : '';
  _modalSwitchTab('sak');

  if (c) {
    editIdEl.value   = c.id;
    fCaseNum.value   = c.caseNumber;
    document.getElementById('f-case-number-op').value = c.caseNumber;
    fDueDate.value   = toDisplay(parseDate(c.dueDate || ''));
    document.getElementById('f-due-date-op').value = toDisplay(parseDate(c.dueDate || ''));
    fTitle.value     = c.title;
    fNotes.value     = c.notes || '';
    fModalTags.value = c.tags  || '';
    fDuration.value   = c.duration || '';
    fCaseBuffer.value = c.caseBuffer != null ? String(c.caseBuffer) : '';
    fFilingDate.value = c.type === 'oppdrag' ? '' : toDisplay((loadSakData(c.id) || {}).filingDate || '');
    fPriorityDate.value = c.type === 'oppdrag' ? '' : toDisplay((loadSakData(c.id) || {}).priorityDate || '');
    if (c.notes || c.tags) {
      document.getElementById('modal-adv-toggle').classList.add('open');
      document.getElementById('modal-adv-body').classList.add('open');
    }
    document.getElementById('f-unassigned').checked = isUnassigned(c);
    _fillModalMedl(c);
    setSelectedStatus(isOppdrag ? 'oppdrag' : (c.status || 'ny'));
  } else {
    document.getElementById('f-unassigned').checked = UNASSIGNED_NEW_DEFAULT;
    _fillModalMedl(null);
    editIdEl.value = fCaseNum.value = fDueDate.value = fTitle.value = fNotes.value = fModalTags.value = fDuration.value = fCaseBuffer.value = fFilingDate.value = fPriorityDate.value = '';
    document.getElementById('f-case-number-op').value = '';
    document.getElementById('f-due-date-op').value = '';
    var defStatus = defaultOppdrag ? 'oppdrag'
      : (['statistikk','innstillinger','hjem'].indexOf(activePage) >= 0 ? 'ny' : activePage);
    setSelectedStatus(defStatus);
  }

  var openBulk = !c && defaultAddTab(activePage) === 'bulk';
  if (openBulk) _modalSwitchTab('bulk');

  renderTimeline({ target: 'modal-timeline' });
  openBackdrop('modal-backdrop');
  setTimeout(function() {
    (openBulk ? document.getElementById('modal-bulk-paste')
      : isOppdrag ? document.getElementById('f-case-number-op') : fCaseNum).focus();
  }, 50);
}
function closeModal() { closeBackdrop('modal-backdrop'); }

