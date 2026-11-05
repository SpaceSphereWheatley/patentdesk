// ── EPO OPS-innstilling ────────────────────────────
(function() {
  var keyInp = document.getElementById('input-ops-key');
  var secInp = document.getElementById('input-ops-secret');
  var status = document.getElementById('ops-status');
  if (!keyInp || !secInp) return;
  function showSaved() {
    status.textContent = hasOpsCreds() ? 'Nøkler lagret' : 'Ikke satt opp';
  }
  var c = loadOpsCreds();
  keyInp.value = c.key; secInp.value = c.secret;
  showSaved();
  function save() {
    saveOpsCreds({ key: keyInp.value.trim(), secret: secInp.value.trim() });
    showSaved();
  }
  keyInp.addEventListener('change', save);
  secInp.addEventListener('change', save);
  document.getElementById('btn-ops-test').addEventListener('click', function() {
    save();
    var btn = this;
    btn.disabled = true;
    status.textContent = 'Tester …';
    opsAccessToken(true).then(function() {
      status.textContent = '✓ Tilkoblet';
    }).catch(function(err) {
      status.textContent = opsErrorMessage(err && err.kind);
    }).then(function() { btn.disabled = false; });
  });
})();

// ── Saksmappe-innstilling ──────────────────────────
(function() {
  var inp = document.getElementById('input-doc-root');
  if (!inp) return;
  var preview = document.getElementById('docroot-preview');
  var saved = loadDocRoot();
  if (saved && saved !== DEFAULT_DOC_ROOT) inp.value = saved;
  function updatePreview() { if (preview) preview.innerHTML = _docRootPreviewHtml(inp.value); }
  updatePreview();
  inp.addEventListener('input', updatePreview);
  inp.addEventListener('change', function() {
    var normalized = _docRootNormalize(this.value);
    this.value = normalized;
    updatePreview();
    dispatch('SETTINGS_DOC_ROOT_CHANGE', { value: normalized });
  });
})();

// ── Lenke til nye saker ────────────────────────────
function renderCaseSourceLinks() {
  var src = loadCaseSource();
  ['case-source-link-home', 'case-source-link-cases'].forEach(function(id) {
    var a = document.getElementById(id);
    if (!a) return;
    a.hidden = !src.url;
    if (src.url) {
      a.href = src.url;
      a.title = caseSourceTitle(src);
      a.setAttribute('aria-label', caseSourceTitle(src));
    } else {
      a.removeAttribute('href');
    }
  });
}
function _caseSourceFillInputs() {
  var src = loadCaseSource();
  var u = document.getElementById('input-case-source-url');
  var l = document.getElementById('input-case-source-label');
  if (u) u.value = src.url;
  if (l) l.value = src.label;
}
(function() {
  var u = document.getElementById('input-case-source-url');
  var l = document.getElementById('input-case-source-label');
  var err = document.getElementById('case-source-error');
  if (!u || !l) return;
  _caseSourceFillInputs();
  renderCaseSourceLinks();
  function commit() {
    var url = normalizeCaseSourceUrl(u.value);
    if (url === null) {
      if (err) err.textContent = 'Lenken må begynne med https://';
      return;
    }
    if (err) err.textContent = '';
    var src = normalizeCaseSource({ url: url, label: l.value });
    u.value = src.url;
    l.value = src.label;
    var cur = loadCaseSource();
    if (cur.url === src.url && cur.label === src.label) return;
    dispatch('SETTINGS_CASE_SOURCE_CHANGE', { value: src });
  }
  u.addEventListener('change', commit);
  l.addEventListener('change', commit);
})();

// ── Produksjonsmål ─────────────────────────────────
(function() {
  var inp = document.getElementById('input-production-goal');
  if (!inp) return;
  if (productionGoal > 0) inp.value = productionGoal;
  inp.addEventListener('change', function() {
    dispatch('SETTINGS_GOAL_CHANGE', { value: parseInt(this.value, 10) });
  });
})();

// ── Påminnelse for saker som ikke er fordelt ───────
(function() {
  var inp = document.getElementById('input-unassigned-reminder');
  if (!inp) return;
  inp.value = String(unassignedReminder);
  inp.addEventListener('change', function() {
    dispatch('SETTINGS_UNASSIGNED_REMINDER_CHANGE', { value: this.value === '' ? NaN : Number(this.value) });
  });
})();

// ── Belegg-horisont ────────────────────────────────
(function() {
  var sel = document.getElementById('input-belegg-horizon');
  if (!sel) return;
  sel.value = String(beleggHorizon);
  sel.addEventListener('change', function() {
    dispatch('SETTINGS_BELEGG_CHANGE', { value: parseInt(this.value, 10) });
  });
})();

// ── Frister (måneder som foreslås i dialogene) ─────
function _renderDeadlineInputs() {
  document.querySelectorAll('[data-dl-key]').forEach(function(inp) {
    var k = inp.dataset.dlKey;
    inp.value = String(deadlines[k]);
    inp.placeholder = String(DEADLINE_DEFAULTS[k]);
  });
}
(function() {
  document.querySelectorAll('[data-dl-key]').forEach(function(inp) {
    inp.addEventListener('change', function() {
      var raw = this.value.trim();
      var v = parseInt(raw, 10);
      // Tomt felt = standard; et ugyldig tall avvises og feltet tilbakestilles
      if (raw !== '' && !(v >= 1 && v <= DEADLINE_MAX)) { _renderDeadlineInputs(); return; }
      dispatch('SETTINGS_DEADLINE_CHANGE', { key: this.dataset.dlKey, value: raw === '' ? null : v });
      _renderDeadlineInputs();
    });
  });
  var reset = document.getElementById('btn-dl-reset');
  if (reset) reset.addEventListener('click', function() {
    dispatch('SETTINGS_DEADLINE_CHANGE', { key: null });
    _renderDeadlineInputs();
  });
  document.querySelectorAll('[data-goto-settings-tab]').forEach(function(a) {
    a.addEventListener('click', function(e) { e.preventDefault(); showSettingsTab(this.dataset.gotoSettingsTab, true); });
  });
  _renderDeadlineInputs();
})();

// ── Standard per sakstype (varighet + buffer) ──────
function _renderWorkWindowInputs() {
  document.querySelectorAll('[data-ww-key]').forEach(function(inp) {
    var k = inp.dataset.wwKey;
    inp.value = String(workWindows[k]);
    inp.placeholder = String(WORK_WINDOW_DEFAULTS[k]);
  });
  document.querySelectorAll('[data-tb-key]').forEach(function(inp) {
    var k = inp.dataset.tbKey;
    inp.value = String(typeBuffers[k]);
    inp.placeholder = String(TYPE_BUFFER_DEFAULTS[k]);
  });
  if (fDuration) fDuration.placeholder = 'Standard: ' + workWindows.oppdrag;
}
(function() {
  document.querySelectorAll('[data-ww-key]').forEach(function(inp) {
    inp.addEventListener('change', function() {
      var raw = this.value.trim();
      var v = parseInt(raw, 10);
      // Tomt felt = standard; et ugyldig tall avvises og feltet tilbakestilles
      if (raw !== '' && !(v >= 1 && v <= WORK_WINDOW_MAX)) { _renderWorkWindowInputs(); return; }
      dispatch('SETTINGS_WORK_WINDOW_CHANGE', { key: this.dataset.wwKey, value: raw === '' ? null : v });
      _renderWorkWindowInputs();
    });
  });
  document.querySelectorAll('[data-tb-key]').forEach(function(inp) {
    inp.addEventListener('change', function() {
      var raw = this.value.trim();
      var v = parseInt(raw, 10);
      if (raw !== '' && !(v >= 0 && v <= TYPE_BUFFER_MAX)) { _renderWorkWindowInputs(); return; }
      dispatch('SETTINGS_TYPE_BUFFER_CHANGE', { key: this.dataset.tbKey, value: raw === '' ? null : v });
      _renderWorkWindowInputs();
    });
  });
  var reset = document.getElementById('btn-ww-reset');
  if (reset) reset.addEventListener('click', function() {
    dispatch('SETTINGS_WORK_WINDOW_CHANGE', { key: null });
    _renderWorkWindowInputs();
  });
  _renderWorkWindowInputs();
})();

// ── Ferieperioder ──────────────────────────────────
(function() {
  var btnAdd      = document.getElementById('btn-vac-add');
  var btnCancel   = document.getElementById('btn-vac-cancel');
  var btnAddOpen  = document.getElementById('btn-vac-add-open');
  var addForm     = document.getElementById('vac-add-form');
  var inpFrom     = document.getElementById('vac-from');
  var inpTo       = document.getElementById('vac-to');
  var inpLabel    = document.getElementById('vac-label');
  var errEl       = document.getElementById('vac-error');
  if (!btnAdd) return;

  var editIdx = null; // null = legg-til-modus, ellers indeks som redigeres

  _dp.init(inpFrom);
  _dp.init(inpTo);

  function resetForm() {
    editIdx = null;
    inpFrom.value = inpTo.value = inpLabel.value = '';
    if (errEl) errEl.textContent = '';
    btnAdd.textContent = '+ Legg til';
    if (btnCancel) btnCancel.style.display = 'none';
    if (addForm) addForm.style.display = 'none';
  }

  function openForm() {
    if (addForm) addForm.style.display = 'flex';
  }

  // Åpne legg-til-skjema
  if (btnAddOpen && addForm) {
    btnAddOpen.addEventListener('click', function() {
      resetForm();
      openForm();
      if (inpFrom) inpFrom.focus();
    });
  }

  if (btnCancel) btnCancel.addEventListener('click', resetForm);

  btnAdd.addEventListener('click', function() {
    if (errEl) errEl.textContent = '';
    var from  = parseDate(inpFrom.value.trim());
    var to    = parseDate(inpTo.value.trim());
    var label = (inpLabel.value.trim() || 'Ferie');
    if (!from || !isValidDate(inpFrom.value.trim())) { if (errEl) errEl.textContent = 'Ugyldig fra-dato.'; return; }
    if (!to   || !isValidDate(inpTo.value.trim()))   { if (errEl) errEl.textContent = 'Ugyldig til-dato.'; return; }
    if (to < from) { if (errEl) errEl.textContent = 'Til-dato må være etter fra-dato.'; return; }
    if (editIdx !== null) {
      dispatch('VACATION_EDIT', { idx: editIdx, from: from, to: to, label: label });
    } else {
      dispatch('VACATION_ADD', { from: from, to: to, label: label });
    }
    resetForm();
  });

  document.getElementById('vacation-list').addEventListener('click', function(e) {
    var delBtn = e.target.closest('.btn-vac-del');
    if (delBtn) { dispatch('VACATION_DELETE', { idx: parseInt(delBtn.dataset.idx, 10) }); return; }
    var editBtn = e.target.closest('.btn-vac-edit');
    if (editBtn) {
      var idx = parseInt(editBtn.dataset.idx, 10);
      var v = vacations[idx];
      if (!v) return;
      editIdx = idx;
      inpFrom.value  = toDisplay(v.from);
      inpTo.value    = toDisplay(v.to);
      inpLabel.value = v.label || '';
      btnAdd.textContent = 'Lagre';
      if (btnCancel) btnCancel.style.display = '';
      openForm();
      inpFrom.focus();
    }
  });
})();

// ── Medlesing ───────────────────────────────────────
(function() {
  var btnNew       = document.getElementById('btn-medl-new');
  var btnNewSave   = document.getElementById('btn-medl-new-save');
  var btnNewCancel = document.getElementById('btn-medl-new-cancel');
  var newForm      = document.getElementById('medl-new-form');
  var inpCaseNum   = document.getElementById('medl-new-casenumber');
  var inpSaksb     = document.getElementById('medl-new-saksbehandler');
  var inpType      = document.getElementById('medl-new-type');
  var inpDate      = document.getElementById('medl-new-date');
  var errEl        = document.getElementById('medl-new-error');
  if (!btnNew) return;

  _dp.init(inpDate);

  function resetNewForm() {
    inpCaseNum.value = inpSaksb.value = '';
    inpType.value = 'normal';
    inpDate.value = toDisplay(todayStr());
    if (errEl) errEl.textContent = '';
    newForm.style.display = 'none';
  }

  btnNew.addEventListener('click', function() {
    resetNewForm();
    newForm.style.display = 'flex';
    inpCaseNum.focus();
  });
  btnNewCancel.addEventListener('click', resetNewForm);

  btnNewSave.addEventListener('click', function() {
    if (errEl) errEl.textContent = '';
    var caseNumber    = inpCaseNum.value.trim();
    var saksbehandler = inpSaksb.value.trim();
    var date          = parseDate(inpDate.value.trim());
    if (!caseNumber)                       { errEl.textContent = 'Saksnummer må fylles ut.'; return; }
    if (!saksbehandler)                    { errEl.textContent = 'Saksbehandler må fylles ut.'; return; }
    if (!date || !isValidDate(inpDate.value.trim())) { errEl.textContent = 'Ugyldig dato.'; return; }
    dispatch('MEDLESING_CREATE', { caseNumber: caseNumber, saksbehandler: saksbehandler, type: inpType.value, date: date });
    resetNewForm();
  });

  document.getElementById('medl-tbody').addEventListener('click', function(e) {
    var row = e.target.closest('.medl-row');
    if (row) navigateTo('medlesing/' + row.dataset.id);
  });

  document.getElementById('medl-back-link').addEventListener('click', function(e) {
    e.preventDefault();
    navigateTo('medlesing');
  });

  document.getElementById('medl-phases').addEventListener('change', function(e) {
    var cb = e.target.closest('.medl-checkbox');
    if (!cb || !activeMedlesingId) return;
    dispatch('MEDLESING_ITEM_TOGGLE', { id: activeMedlesingId, itemId: cb.dataset.itemId, checked: cb.checked });
  });

  document.getElementById('medl-d-type').addEventListener('change', function(e) {
    if (!activeMedlesingId) return;
    dispatch('MEDLESING_TYPE_CHANGE', { id: activeMedlesingId, type: e.target.value });
  });

  document.getElementById('medl-d-notat').addEventListener('change', function(e) {
    if (!activeMedlesingId) return;
    dispatch('MEDLESING_NOTAT_CHANGE', { id: activeMedlesingId, notat: e.target.value });
  });

  document.getElementById('btn-medl-complete').addEventListener('click', function() {
    if (!activeMedlesingId) return;
    dispatch('MEDLESING_COMPLETE_TOGGLE', { id: activeMedlesingId });
  });

  document.getElementById('btn-medl-delete').addEventListener('click', function() {
    if (activeMedlesingId) openConfirm(activeMedlesingId, 'medlesing');
  });
})();

// ── Nullstill statistikk ───────────────────────────
document.getElementById('btn-reset-stats').addEventListener('click', function() { openBackdrop('reset-backdrop'); });
document.getElementById('btn-reset-cancel').addEventListener('click', function() { closeBackdrop('reset-backdrop'); });
document.getElementById('reset-backdrop').addEventListener('click', function(e) { if (e.target === this) closeBackdrop('reset-backdrop'); });
document.getElementById('btn-reset-confirm').addEventListener('click', function() {
  dispatch('STATS_RESET');
});

