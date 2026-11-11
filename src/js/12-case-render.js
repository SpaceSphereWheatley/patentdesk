// ── Saksdetaljer: render ───────────────────────────
// Hvilke seksjoner som hører til et oppdrag. Oppdrag har verken krav,
// klassifisering eller mothold — bare de administrative opplysningene.
var OPPDRAG_HIDDEN_SECTIONS = ['cpc', 'checklist', 'claims', 'mothold'];

function renderSak(id) {
  var cas = cases.find(function(c) { return c.id === id; });
  if (!cas) { navigateTo('hjem'); return; }

  var isOppdrag = cas.type === 'oppdrag';

  _sakActiveClaimNum  = null;
  _sakEditingLabelNum = null;
  _sakOpenDocPop      = null;
  _kmEditingOrigin    = null;
  _citedIndex         = null; // de andre sakene kan ha endret seg siden sist
  _mhEditing          = {};

  var data = loadSakData(id) || defaultSakData(0);
  ensureClaims(data);
  ensureSakDocs(data);
  if (!Array.isArray(data.files)) { ensureSakFiles(data, cas); saveSakData(id, data); }

  // Topptekst + fane-tittel
  document.getElementById('sak-page-title').textContent = cas.caseNumber;
  if (_roundDrawer.open && _roundDrawer.caseId !== id) closeRoundDrawer();
  renderSakRoundLine(cas, data);
  renderRoundDrawer();
  renderSakResponse(cas, data);
  document.title = cas.caseNumber + (cas.title ? ' — ' + cas.title : '') + ' — PatentDesk';
  document.getElementById('sak-sticky-cn').textContent = cas.caseNumber;

  renderSakFrist(cas);
  renderSakForwardButtons(cas);
  renderSakActiveButton(cas);
  renderSakUnassigned(cas);
  renderSakMedl(cas);
  if (typeof dpOnSakRendered === 'function') dpOnSakRendered(id);

  document.getElementById('btn-sak-back')._sakId = id;

  // Saksinformasjon — cases-felt (lesefelt; redigeres via «Rediger sak»)
  document.getElementById('sak-case-number').textContent = cas.caseNumber || '';
  document.getElementById('sak-title').textContent       = cas.title || '';
  document.getElementById('sak-case-notes').value        = cas.notes || '';
  document.getElementById('sak-tags').value              = '';
  renderTagPills(cas.tags || '');

  // Varighet (oppdrag-felt)
  var durField = document.getElementById('sak-duration-field');
  if (durField) durField.style.display = isOppdrag ? '' : 'none';
  var durInp = document.getElementById('sak-duration');
  if (durInp) durInp.textContent = cas.duration || (workWindowDays(cas) + ' (standard)');

  // Per-sak-buffer (skjules for oppdrag)
  var bufField = document.getElementById('sak-case-buffer-field');
  if (bufField) bufField.style.display = isOppdrag ? 'none' : '';
  var bufInp = document.getElementById('sak-case-buffer');
  if (bufInp) bufInp.textContent = caseBufferLabel(cas);

  // Medlesing (føres inn i «Rediger sak»; skjules for oppdrag)
  var medlField = document.getElementById('sak-medl-field');
  if (medlField) medlField.style.display = isOppdrag ? 'none' : '';
  var medlEntry = isOppdrag ? null : caseMedlFor(medlLog, cas.id);
  document.getElementById('sak-medl').textContent = medlEntry ? medlEntry.reader + ' · ' + toDisplay(medlEntry.sent) : '—';

  // Metalinjen i sakshodet (lesing; redigering skjer fortsatt i «Rediger sak»)
  renderSakMeta(cas);

  // Status-knapper — forenklet for oppdrag
  var statusBtns = document.getElementById('sak-status-btns');
  if (isOppdrag) {
    statusBtns.innerHTML =
      '<button class="sak-status-btn" data-status="ny"><svg class="ti" aria-hidden="true"><use href="#ti-flag"/></svg> Aktiv</button>' +
      '<button class="sak-status-btn" data-status="avsluttet"><svg class="ti" aria-hidden="true"><use href="#ti-check"/></svg> Avsluttet</button>';
  } else {
    statusBtns.innerHTML =
      '<button class="sak-status-btn" data-status="ny"><svg class="ti" aria-hidden="true"><use href="#ti-file-text"/></svg> Ny</button>' +
      '<button class="sak-status-btn" data-status="viderebehandling"><svg class="ti" aria-hidden="true"><use href="#ti-refresh"/></svg> Viderebehandling</button>' +
      '<button class="sak-status-btn" data-status="fristarkiv"><svg class="ti" aria-hidden="true"><use href="#ti-archive"/></svg> Fristarkiv</button>' +
      '<button class="sak-status-btn" data-status="avsluttet"' +
        (cas.status === 'avsluttet' ? ' title="Endre utfall"' : '') +
        '><svg class="ti" aria-hidden="true"><use href="#ti-check"/></svg> Avsluttet' +
        (cas.status === 'avsluttet' && OUTCOMES[cas.outcome] ? ' · ' + esc(OUTCOMES[cas.outcome].label) : '') +
        '</button>';
  }
  document.querySelectorAll('.sak-status-btn').forEach(function(btn) {
    btn.className = 'sak-status-btn';
    if (btn.dataset.status === (cas.status || 'ny')) {
      btn.classList.add(isOppdrag && btn.dataset.status === 'ny' ? 'active-oppdrag' : 'active-' + (cas.status || 'ny'));
    }
  });
  var chipInfo = sakStatusChip(cas.status, isOppdrag, cas.outcome);
  var chip = document.getElementById('sak-status-chip');
  if (chip) {
    chip.textContent = chipInfo.label;
    chip.className = 'sak-status-chip tone-' + chipInfo.tone;
    chip.setAttribute('aria-label', 'Status: ' + chipInfo.label + '. Endre status');
  }
  var hintEl = document.getElementById('sak-status-hint');
  if (hintEl) hintEl.textContent = statusMenuHint(cas.status, isOppdrag);
  setSakStatusMenu(false);

  renderSakChecklist(isOppdrag ? null : data);

  // Seksjoner skjules på data-sak-section, ikke på overskriftsteksten — den
  // endrer seg, attributtet gjør det ikke.
  document.querySelectorAll('.sak-section[data-sak-section]').forEach(function(sec) {
    var hide = isOppdrag && OPPDRAG_HIDDEN_SECTIONS.indexOf(sec.dataset.sakSection) !== -1;
    sec.style.display = hide ? 'none' : '';
  });
  // En fase uten synlige seksjoner skal ikke stå igjen som en tom flate.
  document.querySelectorAll('.sak-phase').forEach(function(phase) {
    var visible = Array.prototype.filter.call(
      phase.querySelectorAll('.sak-section[data-sak-section]'),
      function(sec) { return sec.style.display !== 'none'; }
    ).length;
    phase.style.display = visible ? '' : 'none';
  });
  applyPhaseCollapse();

  if (!isOppdrag) {
    document.getElementById('sak-num-claims').value        = data.numClaims || '';
    document.getElementById('sak-filing-date').textContent = toDisplay(data.filingDate) || '—';
    document.getElementById('sak-priority-date').textContent = toDisplay(data.priorityDate) || '—';

    renderSakClasses(data);
    renderSakAssessment(data);
  } else {
    // Nullstill søknad-spesifikke felt så stale verdi ikke forurenser oppdrag
    document.getElementById('sak-num-claims').value        = '';
    document.getElementById('sak-filing-date').textContent = '—';
    document.getElementById('sak-priority-date').textContent = '—';
  }

  // Sammendraget summerer krav — uten krav har det ingenting å vise.
  var showSummary = !isOppdrag && (data.numClaims || 0) > 0;
  var summarySection = document.getElementById('sak-summary-section');
  if (summarySection) summarySection.style.display = showSummary ? '' : 'none';
  var sentinel = document.getElementById('sak-summary-sentinel');
  if (sentinel) sentinel.style.display = showSummary ? '' : 'none';

  // Notater
  document.getElementById('sak-notes').value = data.sakNotes || '';
  setNotesView('vis');

  // Saksdokumenter
  renderSakFileList(data);

  var savedEl = document.getElementById('sak-saved');
  clearTimeout(_savedHideTimer);
  if (savedEl) { savedEl.textContent = ''; savedEl.classList.remove('is-on'); }

  // Sticky-bar: uten sammendrag finnes ingen sentinel å observere
  initSakStickyBar(!showSummary);
  updateSakAnchors();
}

// Notater: ett felt om gangen. Begge ligger i DOM-en og lagres som før; bare
// visningen byttes. En prikk på den skjulte fanen viser at den har tekst.
function setNotesView(which) {
  var grid = document.querySelector('.sak-notes-grid');
  if (grid) grid.dataset.notesShow = which;
  document.querySelectorAll('.sak-seg-btn[data-notes]').forEach(function(b) {
    var on = b.dataset.notes === which;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  syncNotesDots();
}
function syncNotesDots() {
  var vis = document.getElementById('sak-case-notes');
  var int = document.getElementById('sak-notes');
  var visBtn = document.querySelector('.sak-seg-btn[data-notes="vis"]');
  var intBtn = document.querySelector('.sak-seg-btn[data-notes="int"]');
  if (visBtn && vis) visBtn.classList.toggle('has-text', !!vis.value.trim());
  if (intBtn && int) intBtn.classList.toggle('has-text', !!int.value.trim());
}

function renderSakMeta(cas) {
  var el = document.getElementById('sak-meta-line'); if (!el) return;
  var isOppdrag = cas.type === 'oppdrag';
  var data = loadSakData(cas.id) || {};
  var medlEntry = isOppdrag ? null : caseMedlFor(medlLog, cas.id);
  var parts = sakMetaLine({
    title: cas.title || '', isOppdrag: isOppdrag,
    durationLabel: cas.duration ? cas.duration + ' arb.dager' : workWindowDays(cas) + ' arb.dager (standard)',
    filing: data.filingDate, priority: data.priorityDate,
    bufferLabel: metaBufferLabel(cas),
    medl: medlEntry ? medlEntry.reader + ' · ' + toDisplay(medlEntry.sent) : ''
  });
  el.textContent = '';
  var hasTitle = !!String(cas.title == null ? '' : cas.title).trim();
  parts.forEach(function(t, i) {
    var sp = document.createElement('span'); sp.textContent = t;
    if (hasTitle && i === 0) sp.className = 'sak-meta-title';
    el.appendChild(sp);
  });
}

// ── Faser: kollaps ────────────────────────────────
// Valget huskes globalt, ikke per sak: kollapser du «Saken» én gang fordi du
// sjelden trenger den, skal den være lukket på neste sak også.
// Ikke pt_sak_-prefikset: det het tidligere pt_sak_phases_collapsed, og
// oppryddingen av foreldreløse saksdetaljer slettet det ved hver oppstart.
var PHASE_COLLAPSE_KEY = 'pt_phases_collapsed';

function loadPhaseCollapse() {
  try { return JSON.parse(localStorage.getItem(PHASE_COLLAPSE_KEY)) || {}; }
  catch(e) { return {}; }
}
function savePhaseCollapse(state) { lsSetSafe(PHASE_COLLAPSE_KEY, JSON.stringify(state)); }

function _activeSakStatus() {
  var c = activeSakId && cases.find(function(x) { return x.id === activeSakId; });
  return c ? (c.status || 'ny') : 'ny';
}

function applyPhaseCollapse() {
  var state = loadPhaseCollapse();
  var status = _activeSakStatus();
  document.querySelectorAll('.sak-phase').forEach(function(phase) {
    var collapsed = isPhaseCollapsed(state, phase.dataset.phase, status);
    phase.classList.toggle('sak-phase-collapsed', collapsed);
    var head = phase.querySelector('.sak-phase-head');
    if (head) head.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  });
}

document.querySelectorAll('.sak-phase-head').forEach(function(head) {
  head.addEventListener('click', function() {
    var phase = head.closest('.sak-phase');
    if (!phase) return;
    var state = loadPhaseCollapse();
    var status = _activeSakStatus();
    state[phaseCollapseKey(phase.dataset.phase, status)] = !isPhaseCollapsed(state, phase.dataset.phase, status);
    savePhaseCollapse(state);
    applyPhaseCollapse();
    updateSakAnchors();
  });
});

// ── Sticky-bar: ankere ────────────────────────────
function updateSakAnchors() {
  document.querySelectorAll('.sak-anchor').forEach(function(a) {
    var phase = document.getElementById('sak-phase-' + a.dataset.anchor);
    a.style.display = (phase && phase.style.display !== 'none') ? '' : 'none';
  });
  initSakAnchorSpy();
}

// Ankeret skal vise hvor du er, ikke bare hvor du sist klikket. Observeren
// følger fasene og markerer den øverste som er i syne. Den kobles ned og opp
// per sak, slik sticky-observeren allerede gjør, så den ikke lekker.
var _sakAnchorObserver = null;

function setActiveAnchor(name) {
  document.querySelectorAll('.sak-anchor').forEach(function(a) {
    a.classList.toggle('active', a.dataset.anchor === name);
  });
}

function initSakAnchorSpy() {
  if (_sakAnchorObserver) _sakAnchorObserver.disconnect();
  var phases = Array.prototype.filter.call(
    document.querySelectorAll('.sak-phase'),
    function(ph) { return ph.style.display !== 'none'; }
  );
  if (!phases.length) { setActiveAnchor(null); return; }

  var visible = {};
  _sakAnchorObserver = new IntersectionObserver(function(entries) {
    entries.forEach(function(en) { visible[en.target.dataset.phase] = en.isIntersecting; });
    // Øverste fase som er i syne vinner, slik at ankeret følger lesretningen.
    for (var i = 0; i < phases.length; i++) {
      if (visible[phases[i].dataset.phase]) { setActiveAnchor(phases[i].dataset.phase); return; }
    }
  }, { threshold: 0, rootMargin: '-80px 0px -60% 0px' });
  phases.forEach(function(ph) { _sakAnchorObserver.observe(ph); });
}

document.getElementById('sak-anchors').addEventListener('click', function(e) {
  var btn = e.target.closest('.sak-anchor'); if (!btn) return;
  var phase = document.getElementById('sak-phase-' + btn.dataset.anchor);
  if (!phase) return;
  // Et anker som peker inn i en lukket fase åpner den, ellers hopper man til
  // en overskrift uten innhold.
  var state = loadPhaseCollapse();
  var status = _activeSakStatus();
  if (isPhaseCollapsed(state, phase.dataset.phase, status)) {
    state[phaseCollapseKey(phase.dataset.phase, status)] = false;
    savePhaseCollapse(state);
    applyPhaseCollapse();
  }
  phase.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setActiveAnchor(btn.dataset.anchor);
});

// Sjekklistene: klikk på raden åpner/lukker. Delegert, siden radene tegnes på nytt per sak.
document.getElementById('view-sak').addEventListener('click', function(e) {
  var head = e.target.closest('.sak-fold-head'); if (!head) return;
  var sec = head.closest('.sak-fold'); if (!sec) return;
  var open = !sec.classList.contains('is-open');
  sec.classList.toggle('is-open', open);
  head.setAttribute('aria-expanded', open ? 'true' : 'false');
  sec.querySelector('.sak-fold-body').hidden = !open;
  var state = loadChecklistOpen();
  state[sec.dataset.fold] = open;
  lsSetSafe(CHECKLIST_OPEN_KEY, JSON.stringify(state));
});

// ── Framoverknappen ───────────────────────────────
// Etiketten og målet leses ut av statusmodellen, slik at knappen aldri kan
// komme i utakt med hva overgangen faktisk gjør.
function renderSakForwardButtons(cas) {
  var action = forwardAction(cas.status || 'ny', cas.type === 'oppdrag');
  ['btn-sak-forward', 'btn-sak-forward-sticky'].forEach(function(btnId) {
    var btn = document.getElementById(btnId);
    if (!btn) return;
    if (!action) { btn.style.display = 'none'; return; }
    btn.innerHTML = '<svg class="ti" aria-hidden="true"><use href="#ti-check"/></svg> ' +
                    '<span class="btn-label">' + esc(action.label) + '</span>';
    btn.setAttribute('aria-label', action.label);
    btn.style.display = '';
  });
}

function runForwardAction() {
  var id  = activeSakId; if (!id) return;
  var cas = cases.find(function(c) { return c.id === id; }); if (!cas) return;
  var action = forwardAction(cas.status || 'ny', cas.type === 'oppdrag');
  if (!action) return;
  if (action.choice === 'videre') { openVidereChoice(id, cas.caseNumber); return; }
  // Selve trykket er bekreftelsen; stikkord og frist spørres det fortsatt om.
  runStatusTransition(id, action.toStatus, { skipConfirm: true });
}

document.getElementById('btn-sak-forward').addEventListener('click', runForwardAction);
document.getElementById('btn-sak-forward-sticky').addEventListener('click', runForwardAction);

// «Rediger sak» åpner den samme modalen som ⋯-menyen bruker.
document.getElementById('btn-sak-edit-fields').addEventListener('click', function() {
  var cas = activeSakId && cases.find(function(c) { return c.id === activeSakId; });
  if (cas) openModal(cas);
});

// «Fjern utsettelse» gir saken standardbufferen for typen tilbake.
document.getElementById('sak-frist').addEventListener('click', function(e) {
  if (!e.target.closest('#sak-frist-unpostpone')) return;
  var cas = activeSakId && cases.find(function(c) { return c.id === activeSakId; });
  if (!cas) return;
  dispatch('CASE_FIELD_UPDATE', { id: cas.id, patch: { caseBuffer: null } });
  render();
});

// Fristblokken: én visning av fristen, som sier hvem den tilhører.
function renderSakFrist(cas) {
  var box = document.getElementById('sak-frist');
  if (!box) return;
  if (!cas.dueDate) { box.style.display = 'none'; return; }

  // En utsatt sak måles mot den faktiske fristen; planen står under.
  // En avsluttet sak viser alltid den faktiske fristen.
  var effDue    = fristDisplayDate(cas);
  var days      = daysUntil(effDue);
  var postponed = postponedDaysFor(cas);
  var isApplicant = cas.type !== 'oppdrag' && cas.status === 'fristarkiv';

  box.className = 'sak-frist' + (isApplicant ? ' sak-frist-applicant' : '');
  document.getElementById('sak-frist-owner').textContent = fristOwnerLabel(cas);
  document.getElementById('sak-frist-date').textContent  = toDisplay(effDue);

  var left = document.getElementById('sak-frist-left');
  left.textContent = fristCountdownLabel(cas, days, workDaysUntil(effDue));
  var tone = fristCountdownTone(cas, days);
  left.className = 'sak-frist-left' + (tone ? ' ' + tone : '');

  var meta = document.getElementById('sak-frist-meta');
  var metaMode = fristMetaMode(cas);
  if (metaMode === 'postponed') {
    meta.innerHTML = '<span class="sak-frist-postponed">Planlagt ' + esc(toDisplay(effDueFor(cas))) + '  ·  utsatt ' +
      postponed + (postponed === 1 ? ' dag' : ' dager') + ' etter fristen</span> ' +
      '<button type="button" class="sak-frist-unpostpone" id="sak-frist-unpostpone">Fjern utsettelse</button>';
    meta.style.display = '';
  } else if (metaMode === 'buffer') {
    var bd = bufferDaysFor(cas);
    meta.textContent = 'Faktisk frist ' + toDisplay(cas.dueDate) + '  ·  ' + bd + (bd === 1 ? ' dags' : ' dagers') + ' buffer trukket fra';
    meta.style.display = '';
  } else {
    meta.style.display = 'none';
  }

  var note = document.getElementById('sak-frist-note');
  var noteText = fristOwnerNote(cas);
  note.textContent = noteText;
  note.style.display = noteText ? '' : 'none';
  box.style.display = '';
}


// Kravstabellen, kravtreet, resultatsammendraget, granskingsrapporten og
// progressbarene er alle avledet av de samme kravdataene — og av cascaden
// mellom dem. Endres ett krav kan alle fem bli utdaterte, så de tegnes under
// ett i stedet for at hvert kallsted må huske hele settet.
function renderSakAssessment(data) {
  renderSakClaimsTable(data);   // tegner også kravtreet
  renderSakResultSummary(data);
  renderSakDocs(data);          // kategoriene per mothold er avledet av kravene
  updateSakProgress(data);
  if (typeof dpRenderClaims === 'function') dpRenderClaims(data);
}

// Samme som over, men bytter bare ut de oppgitte kravradene. De avledede
// visningene må uansett regnes om — de summerer alle krav.
function renderSakAssessmentRows(data, claimNums) {
  renderClaimRows(data, claimNums);
  renderSakResultSummary(data);
  renderSakDocs(data);
  updateSakProgress(data);
  if (typeof dpRenderClaims === 'function') dpRenderClaims(data);
}

// Én rad i dokumentlisten. Ren — se test/fileLabel.test.js. missing = filen
// finnes ikke i saksmappen på disk (se test/folderSync.test.js).
function sakFileRowHtml(f, i, fileUrl, missing) {
  return '<div class="sak-docs-dropdown-row' + (missing ? ' sak-docs-missing' : '') + '" data-idx="' + i + '">' +
    '<a class="sak-docs-open" data-idx="' + i + '" href="' + esc(fileUrl) + '" target="_blank" rel="noopener" title="' + esc(_fileResolvedName(f.name)) + '"><span class="sak-docs-file-icon">' + _fileIcon(f.name) + '</span><span class="sak-docs-open-label">' + esc(fileListLabel(f)) + '</span>' +
      (missing ? '<span class="sak-docs-missing-tag" title="Filen finnes ikke i saksmappen">mangler</span>' : '') + '</a>' +
    '<button class="sak-docs-copy" data-idx="' + i + '" title="Kopier sti" aria-label="Kopier sti"><svg class="ti" aria-hidden="true"><use href="#ti-copy"/></svg></button>' +
    '<button class="sak-docs-rename" data-idx="' + i + '" title="Endre navn" aria-label="Endre navn"><svg class="ti" aria-hidden="true"><use href="#ti-pencil"/></svg></button>' +
    '<button class="sak-docs-del" data-idx="' + i + '" title="Slett" aria-label="Slett"><svg class="ti" aria-hidden="true"><use href="#ti-x"/></svg></button>' +
  '</div>';
}

function renderSakFileList(data) {
  var list = document.getElementById('sak-docs-list');
  if (!list) return;
  var files = data.files || [];
  var cas = activeSakId && cases.find(function(c) { return c.id === activeSakId; });
  var root = loadDocRoot();
  // Mappen på disk (lest av serveren når saken ble åpnet): filer som ikke
  // finnes der merkes. Finnes ikke selve saksmappen, står det én melding i
  // stedet for en merking på hver fil.
  var listing = cas && typeof dpFolderListing === 'function' ? dpFolderListing(cas) : null;
  var missing = {};
  if (listing && listing.exists) missingFileIndexes(files, listing.files).forEach(function(k) { missing[k] = true; });
  var note = (listing && !listing.exists)
    ? '<p class="sak-docs-note">Saksmappen finnes ikke på disk (' + esc(_docRootJoin(root, cas.caseNumber, '').replace(/\\$/, '')) + ').</p>'
    : '';
  if (!files.length) {
    list.innerHTML = note + '<p class="sak-docs-empty">Ingen filer registrert.</p>';
    return;
  }
  list.innerHTML = note + files.map(function(f, i) {
    var fileUrl = cas
      ? _docFileUrl(root, cas.caseNumber, f.name, window.location)
      : '#';
    return sakFileRowHtml(f, i, fileUrl, !!missing[i]);
  }).join('');
}

// Sjekklistens egne grupper — Forberedelse, Gransking, Rapport — er de samme
// stegene som sakssiden deler seg inn i som fase 1–3. Lå hele listen i
// Gransking, sto «Rapport»-punktene en fase unna rapporten de gjelder. Gruppene
// legges derfor i fasen de hører til. Malen er brukerens egen, så en gruppe vi
// ikke kjenner igjen havner samlet i Gransking, der hele listen lå før — ingen
// punkter forsvinner av at noen har døpt om en gruppe.
var CHECKLIST_PHASE_MAP = {
  'forberedelse': 'saken',
  'gransking':    'gransking',
  'rapport':      'vurdering'
};

function checklistGroupPhase(name) {
  var key = String(name == null ? '' : name).trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(CHECKLIST_PHASE_MAP, key)
    ? CHECKLIST_PHASE_MAP[key] : null;
}

function groupChecklistByPhase(template) {
  var out = { saken: [], gransking: [], vurdering: [], rest: [] };
  (template || []).forEach(function(g) {
    out[checklistGroupPhase(g.phase) || 'rest'].push(g);
  });
  return out;
}

// Fasene står i denne rekkefølgen i src/index.html og i ankerne: det du jobber
// mest med (Vurdering) øverst. test/caseLayout.test.js leser rekkefølgen derfra.

// Sjekklistene er oppslagsverk, ikke hovedarbeidet: de står lukket med én linje
// (navn + framdrift) til du åpner dem. Valget huskes globalt, som fasene.
// Ikke pt_sak_-prefikset, så oppryddingen av foreldreløse saksdetaljer lar det stå.
var CHECKLIST_OPEN_KEY = 'pt_checklists_open';

function checklistGroupCounts(data, group) {
  var items = (group && Array.isArray(group.items)) ? group.items : [];
  var checks = (data && data.checklist) || {};
  var done = items.filter(function(it) { return checks[it.id] === true; }).length;
  return { done: done, total: items.length };
}
function checklistOpenKey(name) { return String(name == null ? '' : name).trim().toLowerCase(); }
function isChecklistOpen(state, name) {
  var key = checklistOpenKey(name);
  return !!(state && Object.prototype.hasOwnProperty.call(state, key) && state[key]);
}
function loadChecklistOpen() {
  try { return JSON.parse(localStorage.getItem(CHECKLIST_OPEN_KEY)) || {}; }
  catch(e) { return {}; }
}

// Metalinjen under saksnummeret. Ren funksjon: returnerer delene i rekkefølge,
// uten HTML — kalleren setter dem inn som tekst.
// Bufferen vises bare når saken har en egen verdi. Standarden for typen står i
// Innstillinger og er ikke noe som er satt på saken; i Fristarkiv er bufferen ikke aktiv.
function metaBufferLabel(c) {
  if (!c || c.status === 'fristarkiv' || c.caseBuffer == null) return '';
  return caseBufferLabel(c);
}

function sakMetaLine(o) {
  var parts = [];
  var title = String(o.title == null ? '' : o.title).trim();
  if (title) parts.push(title);
  if (o.isOppdrag) {
    parts.push('Varighet ' + o.durationLabel);
    return parts;
  }
  // Bare felt som har data: et tomt felt viser ingenting, ikke en «—».
  var filing   = toDisplay(o.filing);
  var priority = toDisplay(o.priority);
  var medl     = String(o.medl == null ? '' : o.medl).trim();
  if (filing)   parts.push('Innlevert ' + filing);
  if (priority) parts.push('Prioritet ' + priority);
  if (o.bufferLabel) parts.push('Buffer ' + o.bufferLabel);
  if (medl)     parts.push('Medlesing ' + medl);
  return parts;
}

function _checklistItemsHtml(data, group) {
  return group.items.map(function(item) {
    var checked = data.checklist[item.id] === true;
    return '<label class="sak-check-row sak-check-clickable' + (checked ? ' sak-check-done' : '') + '">' +
      '<input type="checkbox" class="sak-checkbox" data-item-id="' + item.id + '"' + (checked ? ' checked' : '') + ' />' +
      '<span class="sak-check-label">' + esc(item.label) + '</span>' +
    '</label>';
  }).join('');
}

// Hver gruppe er en sammenleggbar rad: navn, framdrift og en pil. Innholdet er
// alltid i DOM-en (lukket via hidden), så avkryssing og tellere virker uendret.
function _checklistFoldHtml(data, g, titleHtml, bodyHtml, open) {
  var c = checklistGroupCounts(data, g);
  var key = esc(checklistOpenKey(g.phase));
  var bodyId = 'sak-fold-body-' + key.replace(/[^a-z0-9]+/g, '-');
  var pct = c.total ? Math.round(c.done / c.total * 100) : 0;
  return '<section class="sak-section sak-fold' + (open ? ' is-open' : '') + '" data-sak-section="checklist" data-fold="' + key + '">' +
    '<h2 class="sak-fold-h"><button type="button" class="sak-fold-head" aria-expanded="' + (open ? 'true' : 'false') + '" aria-controls="' + bodyId + '">' +
      '<span class="sak-fold-title">' + titleHtml + '</span>' +
      '<span class="sak-fold-bar" aria-hidden="true"><span style="width:' + pct + '%"></span></span>' +
      '<span class="sak-fold-count">' + c.done + ' / ' + c.total + '</span>' +
      '<span class="sak-fold-chev" aria-hidden="true">▸</span>' +
    '</button></h2>' +
    '<div class="sak-fold-body" id="' + bodyId + '"' + (open ? '' : ' hidden') + '>' + bodyHtml + '</div>' +
  '</section>';
}

// Én gruppe per fase er normalen, og da er gruppenavnet radens overskrift.
// Reserveplassen i Gransking kan ha flere, og beholder da gruppetitlene inni.
function _checklistSlotHtml(data, groups, fallbackTitle) {
  if (!groups.length) return '';
  var state = loadChecklistOpen();
  if (fallbackTitle) {
    var inner = groups.map(function(g) {
      return '<div class="sak-check-phase">' +
        '<div class="sak-check-phase-title">' + esc(g.phase) + '</div>' +
        _checklistItemsHtml(data, g) +
      '</div>';
    }).join('');
    var all = { phase: fallbackTitle, items: [] };
    groups.forEach(function(g) { all.items = all.items.concat(g.items); });
    return _checklistFoldHtml(data, all, esc(fallbackTitle),
      '<div class="sak-checklist">' + inner + '</div>', isChecklistOpen(state, fallbackTitle));
  }
  return groups.map(function(g) {
    return _checklistFoldHtml(data, g, esc(g.phase),
      '<div class="sak-checklist sak-checklist-flat">' + _checklistItemsHtml(data, g) + '</div>',
      isChecklistOpen(state, g.phase));
  }).join('');
}

// «Svar og endringer»: sjekklisten for søkerens svar, øverst i Vurdering.
// Vises bare i Viderebehandling, og starter tom i hver runde.
// ── Rundeskuff ─────────────────────────────────────
// «Runde N ⇥» på rundelinjen åpner forrige runde slik den ble frosset. Skuffen
// er et overlegg som lukkes med Esc, klikk utenfor og når saken forlates;
// festet blir den en kolonne ved siden av innholdet. Festet-tilstanden ligger
// bare i minnet. All tekst fra runden settes med textContent.
var _roundDrawer = { open: false, caseId: null, n: null, pinned: false };

// Festing krever plass til innholdet ved siden av sidemenyen: vindu − sidemeny
// ≥ ROUND_PIN_MIN_CONTENT px (≈ 1320 px vindu med utvidet sidemeny, ≈ 1110 px
// med kollapset). Sidemenyen kollapses ikke automatisk. Ren med argumenter —
// se test/roundsFixes.test.js; uten argumenter leses vindu og sidemeny.
var ROUND_PIN_MIN_CONTENT = 1060;
function roundPinAllowed(winWidth, sidebarWidth) {
  if (winWidth == null) winWidth = window.innerWidth;
  if (sidebarWidth == null) {
    var nav = document.querySelector('.drawer');
    sidebarWidth = nav ? nav.getBoundingClientRect().width : 0;
  }
  return winWidth - sidebarWidth >= ROUND_PIN_MIN_CONTENT;
}

// Runden har ingen lagret vurdering: ingen krav, eller nyhet og
// oppfinnelseshøyde er uvurdert på alle. Ren funksjon — se test/roundsFixes.test.js.
function roundIsUnassessed(round) {
  var claims = round && Array.isArray(round.claims) ? round.claims : [];
  return claims.every(function(c) { return !c || (c.novelty == null && c.inventive == null); });
}

function rdEl(tag, cls, text) {
  var el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}

function renderSakRoundLine(cas, data) {
  var el = document.getElementById('sak-page-round');
  el.textContent = '';
  var text = sakRoundLine(cas);
  if (!text) return;
  el.appendChild(rdEl('span', null, text));
  var rounds = visibleRounds(cas, roundsOf(data));
  if (rounds.length) {
    var n = rounds[rounds.length - 1].n;
    var btn = rdEl('button', 'btn-round', 'Runde ' + n + ' ⇥');
    btn.type = 'button';
    btn.setAttribute('aria-controls', 'round-drawer');
    btn.setAttribute('aria-expanded', _roundDrawer.open && _roundDrawer.caseId === cas.id ? 'true' : 'false');
    btn.title = 'Vis vurderingen fra runde ' + n + ' slik den var da brevet ble sendt';
    el.appendChild(btn);
  } else if (canBackfillRound(cas, rounds)) {
    var sent = lettersSent(cas.history);
    var link = rdEl('button', 'rd-link', 'Lagre nåværende vurdering som runde ' + sent);
    link.type = 'button';
    link.title = 'Lagrer kravene slik de står nå, som runde ' + sent;
    el.appendChild(link);
  }
}

function openRoundDrawer(caseId) {
  _roundDrawer = { open: true, caseId: caseId, n: null, pinned: false };
  renderRoundDrawer();
  var close = document.querySelector('#round-drawer button[aria-label="Lukk"]');
  if (close) close.focus();
}

function closeRoundDrawer() {
  var wasOpen = _roundDrawer.open;
  _roundDrawer = { open: false, caseId: null, n: null, pinned: false };
  renderRoundDrawer();
  return wasOpen;
}

function roundMetaText(round) {
  var parts = [];
  if (round.letter && round.letter.date) parts.push('Brev ' + toDisplay(round.letter.date));
  if (round.letter && round.letter.deadline) parts.push('frist ' + toDisplay(round.letter.deadline));
  if (round.response) {
    var what = responseChangesLabel(round.response.changes);
    parts.push('svar ' + (round.response.date ? toDisplay(round.response.date) : 'mottatt') + (what ? ' (' + what + ')' : ''));
  }
  if (round.backfilled) parts.push('lagret i ettertid');
  return parts.join(' · ');
}

function renderRoundDrawer() {
  var el = document.getElementById('round-drawer');
  if (!el) return;
  var btn = document.querySelector('#sak-page-round .btn-round');
  var cas = _roundDrawer.open ? cases.find(function(c) { return c.id === _roundDrawer.caseId; }) : null;
  var rounds = cas ? visibleRounds(cas, roundsOf(loadSakData(cas.id))) : [];
  if (!_roundDrawer.open || !rounds.length) {
    _roundDrawer = { open: false, caseId: null, n: null, pinned: false };
    el.hidden = true;
    el.textContent = '';
    el.classList.remove('rd-is-pinned');
    document.body.classList.remove('rd-pinned');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    return;
  }
  var round = rounds.find(function(r) { return r.n === _roundDrawer.n; }) || rounds[rounds.length - 1];
  _roundDrawer.n = round.n;
  if (!roundPinAllowed()) _roundDrawer.pinned = false;
  var pinned = _roundDrawer.pinned;

  el.textContent = '';
  var head = rdEl('div', 'rd-head');
  head.appendChild(rdEl('span', 'rd-title', 'Runde ' + round.n));
  if (roundPinAllowed()) {
    var pin = rdEl('button', 'rd-ib rd-pin', pinned ? 'Festet' : 'Fest');
    pin.type = 'button';
    pin.setAttribute('aria-pressed', pinned ? 'true' : 'false');
    pin.title = pinned ? 'Løsne – lukkes igjen med Esc eller klikk utenfor' : 'Hold åpen mens du arbeider';
    head.appendChild(pin);
  }
  var close = rdEl('button', 'rd-ib rd-close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'Lukk');
  close.title = pinned ? 'Lukk' : 'Lukk (Esc)';
  head.appendChild(close);
  el.appendChild(head);

  if (rounds.length >= 2) {
    var tabs = rdEl('div', 'rd-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Velg runde');
    rounds.forEach(function(r) {
      var t = rdEl('button', 'rd-tab' + (r.n === round.n ? ' on' : ''), 'Runde ' + r.n);
      t.type = 'button';
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-selected', r.n === round.n ? 'true' : 'false');
      t.dataset.round = String(r.n);
      tabs.appendChild(t);
    });
    el.appendChild(tabs);
  }

  var meta = rdEl('div', 'rd-meta', roundMetaText(round));
  if (!round.backfilled) meta.appendChild(rdEl('span', 'rd-frozen', 'Frosset da brevet ble sendt. Endres ikke av senere arbeid.'));
  el.appendChild(meta);

  var body = rdEl('div', 'rd-body');
  var lines = roundDrawerLines(round);
  if (roundIsUnassessed(round)) body.appendChild(rdEl('div', 'rd-empty', 'Ingen vurdering lagret'));
  if (lines.length) {
    body.appendChild(rdEl('div', 'rd-sec', 'Krav'));
    lines.forEach(function(l) {
      var line = rdEl('div', 'rd-line');
      line.appendChild(rdEl('b', null, String(l.num)));
      var v = rdEl('span', 'rd-v');
      [l.novelty, l.inventive].forEach(function(mark, i) {
        if (i) v.appendChild(document.createTextNode(' '));
        v.appendChild(rdEl('span', mark.indexOf('✓') !== -1 ? 'rd-y' : mark.indexOf('✗') !== -1 ? 'rd-n' : 'rd-na', mark));
      });
      line.appendChild(v);
      var d = l.docs.join(', ');
      line.appendChild(rdEl('span', 'rd-d', [d, l.label].filter(Boolean).join(' · ')));
      body.appendChild(line);
    });
    body.appendChild(rdEl('div', 'rd-legend', 'N = nyhet, O = oppfinnelseshøyde'));
  }
  body.appendChild(rdEl('div', 'rd-sec', 'Dokumenter i runden'));
  var ids = Array.isArray(round.docIds) ? round.docIds : [];
  if (ids.length) {
    var chips = rdEl('div', 'rd-docs');
    ids.forEach(function(id) { chips.appendChild(rdEl('span', 'rd-doc', id)); });
    body.appendChild(chips);
  } else {
    body.appendChild(rdEl('div', 'rd-legend', 'Ingen dokumenter'));
  }
  el.appendChild(body);
  el.appendChild(rdEl('div', 'rd-foot', pinned ? 'Skrivebeskyttet · Festet til du lukker' : 'Skrivebeskyttet · Esc lukker'));

  el.classList.toggle('rd-is-pinned', pinned);
  document.body.classList.toggle('rd-pinned', pinned);
  el.hidden = false;
  if (btn) btn.setAttribute('aria-expanded', 'true');
}

var OBJECTION_STATE_LABEL = { open: 'Åpen', resolved: 'Løst', maintained: 'Opprettholdt', dropped: 'Frafalt' };

// Innvendingsblokken under sjekklisten i «Svar og endringer».
function sakObjectionsHtml(cas, data) {
  var rounds = roundsOf(data);
  var L = objectionRound(cas, rounds);
  var k = examinationRound(cas);
  var sent = lettersSent(cas.history);
  if (!L) {
    var link = canBackfillRound(cas, visibleRounds(cas, rounds))
      ? '<button type="button" class="ob-link" data-ob-backfill="1">Lagre nåværende vurdering som runde ' + sent + '</button>' : '';
    return '<div class="ob-list"><div class="ob-head"><span class="ob-title">Innvendinger fra brev ' + sent + '</span></div>' +
      '<p class="ob-empty">Ingen lagret runde for brev ' + sent + link + '</p></div>';
  }
  var groups = groupObjections(shownObjections(cas, data));
  var claims = Array.isArray(data && data.claims) ? data.claims : [];
  var targets = {};
  groups.forEach(function(g) {
    g.claims.forEach(function(n) { if (!(n in targets)) targets[n] = objectionTargets(n, L, claims); });
  });
  var prog = objectionProgress(groups);
  var rowsHtml = groups.map(function(g) {
    var ids = g.ids.filter(isObjectionId);
    var p = objectionRowParts(g, L.n, targets);
    var struck = !g.manual && p.map === ' → strøket';
    var cls = 'ob-row' + (g.manual ? ' ob-manual' : '') + (!g.isNew && g.state === 'open' ? ' ob-open' : '') + (struck ? ' ob-struck' : '');
    var text = g.manual ? esc(p.ground)
      : '<b>' + esc(p.head) + '</b> · ' + esc(p.ground) +
        (p.map ? ' <span class="ob-map' + (struck ? ' ob-map-struck' : '') + '">' + esc(p.map.replace(/^ /, '')) + '</span>' : '');
    var ctrl = g.isNew
      ? '<span class="ob-new">Ny – tas med i brev ' + k + '</span>'
      : '<span class="ob-seg ob-state" role="group" aria-label="Vurdering">' + OBJECTION_STATES.map(function(s) {
          return '<button type="button" class="ob-st ob-st-' + s + '" data-state="' + s + '" aria-pressed="' + (g.state === s ? 'true' : 'false') + '">' +
            OBJECTION_STATE_LABEL[s] + '</button>';
        }).join('') + '</span>';
    var del = g.manual ? '<button type="button" class="ob-del" aria-label="Slett innvending" title="Slett innvending">×</button>' : '<span class="ob-del"></span>';
    return '<div class="' + cls + '" data-obj-ids="' + esc(ids.join(' ')) + '">' +
      '<span class="ob-text">' + text + '</span>' + (g.manual ? '<span class="ob-tag">Egen</span>' : '') + ctrl + del + '</div>';
  }).join('');
  var empty = groups.length ? '' : '<p class="ob-empty">Ingen innvendinger i brev ' + L.n + '</p>';
  return '<div class="ob-list" data-ob-round="' + k + '">' +
    '<div class="ob-head"><span class="ob-title">Innvendinger fra brev ' + L.n + '</span>' +
      (prog.y ? '<span class="sak-svar-count ob-progress" title="Innvendinger som er vurdert (ikke Åpen). Nye innvendinger (Ny – tas med i brev ' + k + ') telles ikke.">' +
        prog.x + ' / ' + prog.y + ' vurdert</span>' : '') + '</div>' +
    (L.backfilled ? '<p class="ob-note ob-backfilled">Runden er lagret i ettertid – innvendingene kan avvike fra brevet som ble sendt.</p>' : '') +
    empty + rowsHtml +
    '<button type="button" class="ob-add">+ Innvending</button>' +
    '<form class="ob-form" hidden novalidate>' +
      '<label class="field-label" for="ob-input">Innvending</label>' +
      '<input class="field-input ob-input" id="ob-input" type="text" maxlength="' + OBJECTION_TEXT_MAX + '" autocomplete="off" />' +
      '<div class="ob-form-foot">' +
        '<label class="svar-change"><input type="checkbox" class="ob-isnew" /> Ny i denne runden</label>' +
        '<span class="ob-count">0 / ' + OBJECTION_TEXT_MAX + '</span><span class="ob-spacer"></span>' +
        '<button type="button" class="btn-secondary ob-cancel">Avbryt</button>' +
        '<button type="submit" class="btn-primary ob-submit">Legg til</button>' +
      '</div>' +
    '</form>' +
  '</div>';
}

// Et åpent «+ Innvending»-skjema i blokken: { caseId, text, isNew } eller null
function obOpenFormState(el) {
  var form = el && el.querySelector('.ob-form');
  if (!form || form.hidden) return null;
  return { caseId: el.dataset.obCase || null, text: form.querySelector('.ob-input').value,
    isNew: form.querySelector('.ob-isnew').checked };
}
function obRestoreForm(el, st) {
  var form = el.querySelector('.ob-form'), add = el.querySelector('.ob-add');
  if (!form || !add) return;
  form.hidden = false;
  add.hidden = true;
  form.querySelector('.ob-input').value = st.text;
  form.querySelector('.ob-isnew').checked = st.isNew;
  form.querySelector('.ob-count').textContent = st.text.length + ' / ' + OBJECTION_TEXT_MAX;
}

// opts.closeForm: skjemaet lukkes (etter «Legg til»); ellers overlever et
// åpent skjema at blokken tegnes på nytt i samme sak.
function renderSakResponse(cas, data, opts) {
  var el = document.getElementById('sak-svar');
  if (!el) return;
  var keepForm = !(opts && opts.closeForm) ? obOpenFormState(el) : null;
  if (!cas || cas.type === 'oppdrag' || cas.status !== 'viderebehandling') { el.innerHTML = ''; delete el.dataset.obCase; return; }
  var round = examinationRound(cas);
  var done = responseChecked(data, round);
  var rows = RESPONSE_CHECKLIST.map(function(item) {
    var on = done.indexOf(item.id) !== -1;
    return '<label class="sak-check-row sak-check-clickable' + (on ? ' sak-check-done' : '') + '">' +
      '<input type="checkbox" class="sak-checkbox" data-svar-id="' + item.id + '"' + (on ? ' checked' : '') + ' />' +
      '<span class="sak-check-label">' + esc(item.label) + '</span>' +
    '</label>';
  }).join('');
  el.innerHTML = '<section class="sak-section" data-sak-section="svar">' +
    '<h2 class="sak-section-title sak-section-title-row">' +
      '<span class="sak-section-title-left">Svar og endringer – runde ' + round + '</span>' +
      '<span class="sak-svar-count">' + done.length + ' / ' + RESPONSE_CHECKLIST.length + '</span>' +
    '</h2>' +
    '<div class="sak-checklist sak-checklist-flat">' + rows + '</div>' +
    sakObjectionsHtml(cas, data) +
  '</section>';
  if (keepForm && keepForm.caseId === cas.id) obRestoreForm(el, keepForm);
  el.dataset.obCase = cas.id;
}
document.getElementById('sak-svar').addEventListener('change', function(e) {
  var box = e.target.closest('[data-svar-id]');
  if (!box || !activeSakId) return;
  dispatch('RESPONSE_CHECK_TOGGLE', { id: activeSakId, item: box.dataset.svarId });
});
function obToggleForm(list, open) {
  var form = list.querySelector('.ob-form'), add = list.querySelector('.ob-add');
  if (!form || !add) return;
  form.hidden = !open;
  add.hidden = open;
  if (open) {
    form.reset();
    form.querySelector('.ob-count').textContent = '0 / ' + OBJECTION_TEXT_MAX;
    form.querySelector('.ob-input').focus();
  } else {
    add.focus();
  }
}
document.getElementById('sak-svar').addEventListener('click', function(e) {
  var list = e.target.closest('.ob-list');
  if (!list || !activeSakId) return;
  if (e.target.closest('[data-ob-backfill]')) { dispatch('ROUND_BACKFILL', { id: activeSakId }); return; }
  if (e.target.closest('.ob-add')) { obToggleForm(list, true); return; }
  if (e.target.closest('.ob-cancel')) { obToggleForm(list, false); return; }
  var row = e.target.closest('.ob-row');
  if (!row) return;
  var ids = (row.dataset.objIds || '').split(' ').filter(isObjectionId);
  var stBtn = e.target.closest('.ob-state button[data-state]');
  if (stBtn && ids.length) {
    dispatch('OBJECTION_STATE_SET', { id: activeSakId, round: parseInt(list.dataset.obRound, 10), objIds: ids, state: stBtn.dataset.state });
    return;
  }
  if (e.target.closest('button.ob-del') && ids.length === 1) dispatch('OBJECTION_DELETE', { id: activeSakId, objId: ids[0] });
});
document.getElementById('sak-svar').addEventListener('submit', function(e) {
  var form = e.target.closest('.ob-form');
  if (!form) return;
  e.preventDefault();
  var input = form.querySelector('.ob-input');
  if (!activeSakId || !cleanObjectionText(input.value)) { input.focus(); return; }
  dispatch('OBJECTION_ADD', { id: activeSakId, text: input.value, isNew: form.querySelector('.ob-isnew').checked });
});
document.getElementById('sak-svar').addEventListener('input', function(e) {
  if (!e.target.classList.contains('ob-input')) return;
  var count = e.target.closest('.ob-form').querySelector('.ob-count');
  if (count) count.textContent = e.target.value.length + ' / ' + OBJECTION_TEXT_MAX;
});
document.getElementById('sak-svar').addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && e.target.closest('.ob-form')) {
    e.stopPropagation();
    obToggleForm(e.target.closest('.ob-list'), false);
  }
});

function renderSakChecklist(data) {
  if (!data) {
    ['saken', 'gransking', 'vurdering', 'rest'].forEach(function(slot) {
      var el = document.getElementById('sak-checklist-' + slot);
      if (el) el.innerHTML = '';
    });
    return;
  }
  var g = groupChecklistByPhase(getChecklistTemplate());
  ['saken', 'gransking', 'vurdering'].forEach(function(phase) {
    var el = document.getElementById('sak-checklist-' + phase);
    if (el) el.innerHTML = _checklistSlotHtml(data, g[phase], null);
  });
  var rest = document.getElementById('sak-checklist-rest');
  if (rest) rest.innerHTML = _checklistSlotHtml(data, g.rest, 'Sjekkliste');
}

// ── Medlesing ───────────────────────────────────────
function renderMedlesing() {
  if (activeMedlesingId) { renderMedlesingDetail(activeMedlesingId); return; }
  renderMedlesingList();
}

function _medlesingTypeLabel(type) {
  return type === 'medium_stor' ? 'Medium/stor' : 'Normal';
}

function renderMedlesingList() {
  document.getElementById('medl-list-view').style.display = 'block';
  document.getElementById('medl-detail-view').style.display = 'none';

  var sorted = medlesing.slice().sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });
  var outCount = renderMedlOutList();
  document.getElementById('medl-count').textContent = sorted.length + ' medlesing' + (sorted.length !== 1 ? 'er' : '') +
    (outCount ? ' · ' + outCount + ' ute hos medleser' : '');
  document.getElementById('medl-empty').style.display = sorted.length ? 'none' : 'block';

  document.getElementById('medl-tbody').innerHTML = sorted.map(function(rec) {
    var prog = medlesingProgress(medlesingTemplateFor(rec.type), rec.checklist);
    var pct = prog.total ? Math.round(prog.checked / prog.total * 100) : 0;
    return '<tr class="medl-row" data-id="' + rec.id + '">' +
      // Lesingens eget notat (redigeres i detaljvisningen) står under saksnummeret;
      // caseNoteHtml tar {notes}.
      '<td class="case-no">' + esc(rec.caseNumber) +
        '<div class="medl-note-cell">' + caseNoteHtml({ notes: rec.notat }) + '</div></td>' +
      '<td>' + esc(rec.saksbehandler) + '</td>' +
      '<td><span class="medl-type-pill medl-type-' + rec.type + '">' + _medlesingTypeLabel(rec.type) + '</span></td>' +
      '<td class="medl-date-cell">' + esc(toDisplay(rec.date)) + '</td>' +
      '<td>' +
        '<div class="medl-progress-cell">' +
          '<div class="medl-progress-track"><div class="medl-progress-fill" style="width:' + pct + '%"></div></div>' +
          '<span class="medl-progress-txt">' + prog.checked + '/' + prog.total + '</span>' +
        '</div>' +
      '</td>' +
      '<td><span class="medl-status-pill' + (rec.completed ? ' medl-status-done' : '') + '">' + (rec.completed ? 'Fullført' : 'Pågår') + '</span></td>' +
    '</tr>';
  }).join('');
}

function renderMedlesingDetail(id) {
  var rec = medlesing.find(function(m) { return m.id === id; });
  if (!rec) { navigateTo('medlesing'); return; }

  document.getElementById('medl-list-view').style.display = 'none';
  document.getElementById('medl-detail-view').style.display = 'block';

  document.getElementById('medl-d-casenumber').textContent   = rec.caseNumber;
  document.getElementById('medl-d-saksbehandler').textContent = rec.saksbehandler;
  document.getElementById('medl-d-date').textContent          = toDisplay(rec.date);
  document.getElementById('medl-d-type').value                = rec.type;
  document.getElementById('medl-d-notat').value                = rec.notat || '';

  var template = medlesingTemplateFor(rec.type);
  var prog = medlesingProgress(template, rec.checklist);
  document.getElementById('medl-d-progress-num').textContent = prog.checked + '/' + prog.total;

  var statusEl = document.getElementById('medl-d-status');
  statusEl.textContent = rec.completed ? 'Fullført' : 'Pågår';
  statusEl.className = 'medl-status-pill' + (rec.completed ? ' medl-status-done' : '');

  var btnComplete = document.getElementById('btn-medl-complete');
  btnComplete.textContent = rec.completed ? 'Gjenåpne' : 'Merk som fullført';
  btnComplete.classList.toggle('s-btn-accent', !rec.completed);

  var missing = prog.total - prog.checked;
  var hintEl = document.getElementById('medl-incomplete-hint');
  if (missing === 0) {
    hintEl.style.display = 'none';
  } else {
    hintEl.style.display = 'block';
    hintEl.textContent = rec.completed
      ? 'Fullført med ' + missing + ' punkt' + (missing !== 1 ? 'er' : '') + ' som ikke er krysset av — merket «Mangler» under.'
      : 'Ikke alle punkter er krysset av. Noter eventuelle mangler over — medlesingen kan likevel merkes fullført.';
  }

  document.getElementById('medl-phases').innerHTML = template.map(function(phase) {
    var lastGroup = null;
    var items = phase.items.map(function(item) {
      var checked = rec.checklist[item.id] === true;
      var missingItem = rec.completed && !checked;
      var groupHtml = '';
      if (item.group && item.group !== lastGroup) {
        groupHtml = '<div class="medl-check-group">' + esc(item.group) + '</div>';
      }
      lastGroup = item.group || null;
      return groupHtml +
        '<label class="medl-check-row' + (item.group ? ' medl-check-sub' : '') + (checked ? ' medl-check-done' : '') + (missingItem ? ' medl-check-missing' : '') + '">' +
          '<input type="checkbox" class="medl-checkbox" data-item-id="' + item.id + '"' + (checked ? ' checked' : '') + ' />' +
          '<span class="medl-check-label">' + esc(item.label) + '</span>' +
          (missingItem ? '<span class="medl-check-missing-tag">Mangler</span>' : '') +
        '</label>';
    }).join('');
    return '<div class="medl-phase">' +
      '<div class="medl-phase-title">' + esc(phase.phase) + '</div>' +
      items +
    '</div>';
  }).join('');
}

function _cpcHierarchy(code) {
  // Bygg hierarki fra nærmeste nivå-0-forelder opp til (og med) gjeldende kode
  if (!_cpcDb) return [];
  var entry = _cpcDb[code];
  if (!entry) return [];
  var level = entry.l;
  if (level === 0) return [{ code: code, entry: entry, indent: 0 }];

  // Finn alle overordnede koder ved å lete bakover i _cpcKeys
  // Strategi: gå gjennom sorterte keys, finn forgjengere med lavere nivå
  var keys = _cpcKeys;
  var codeIdx = keys.indexOf(code);
  if (codeIdx < 0) return [{ code: code, entry: entry, indent: level }];

  var chain = [{ code: code, entry: entry, level: level }];
  var neededLevel = level - 1;
  for (var i = codeIdx - 1; i >= 0 && neededLevel >= 0; i--) {
    var k = keys[i];
    var e = _cpcDb[k];
    if (!e) continue;
    if (e.l === neededLevel) {
      chain.unshift({ code: k, entry: e, level: e.l });
      if (e.l === 0) break;
      neededLevel--;
    }
  }
  // Legg til innrykk basert på posisjon i chain
  return chain.map(function(item, idx) {
    return { code: item.code, entry: item.entry, indent: idx };
  });
}

