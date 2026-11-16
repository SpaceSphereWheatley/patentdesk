// ── Popup-hjelpere ─────────────────────────────────
// ── Focus trap ─────────────────────────────────────
var _focusTrapHandler = null;
var _focusTrapPrevEl  = null;
var FOCUSABLE_SEL = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function _installFocusTrap(el) {
  _removeFocusTrap();
  _focusTrapPrevEl = document.activeElement;
  var focusable = Array.prototype.slice.call(el.querySelectorAll(FOCUSABLE_SEL));
  if (focusable.length) focusable[0].focus();
  _focusTrapHandler = function(e) {
    if (e.key !== 'Tab') return;
    var items = Array.prototype.slice.call(el.querySelectorAll(FOCUSABLE_SEL)).filter(function(n) {
      return n.offsetParent !== null;
    });
    if (!items.length) { e.preventDefault(); return; }
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
    else            { if (document.activeElement === last)  { e.preventDefault(); first.focus(); } }
  };
  el.addEventListener('keydown', _focusTrapHandler);
}

function _removeFocusTrap() {
  if (_focusTrapHandler) {
    document.querySelectorAll('.modal-backdrop').forEach(function(el) {
      el.removeEventListener('keydown', _focusTrapHandler);
    });
    _focusTrapHandler = null;
  }
  if (_focusTrapPrevEl && typeof _focusTrapPrevEl.focus === 'function') {
    try { _focusTrapPrevEl.focus(); } catch(e) {}
    _focusTrapPrevEl = null;
  }
}

function openBackdrop(id) {
  var el = document.getElementById(id);
  el.classList.add('open');
  el.setAttribute('aria-hidden', 'false');
  _installFocusTrap(el);
}
function closeBackdrop(id) {
  var el = document.getElementById(id);
  el.classList.remove('open');
  el.setAttribute('aria-hidden', 'true');
  _removeFocusTrap();
}

// Dialogene Esc lukker: alle unntatt konfliktdialogen for arbeidsfilen, som
// krever et valg før noe skrives til datamappen. Se test/exportSearch.test.js.
var CLOSABLE_BACKDROPS = ['cle-backdrop','modal-backdrop','confirm-backdrop','complete-backdrop','fristarkiv-choice-backdrop',
   'videre-choice-backdrop','reset-backdrop','import-backdrop','tag-backdrop','frist-backdrop',
   'delete-all-backdrop-1','delete-all-backdrop-2','about-backdrop','onboarding-backdrop',
   'history-backdrop','backup-restore-backdrop','cle-reset-backdrop','search-backdrop',
   'shortcuts-backdrop','medl-send-backdrop','claims-reduce-backdrop','mh-replace-backdrop'];

function closeAllBackdrops() {
  // Esc på «Fjerne krav?» betyr behold: antall krav settes tilbake i feltet
  if (_claimsReduce) closeClaimsReduce(false);
  // Esc på «Nummeret er endret» betyr behold, og fokus går tilbake til nummeret
  if (_mhReplace) closeMhReplace(false);
  CLOSABLE_BACKDROPS.forEach(function(id) {
    var el = document.getElementById(id);
    el.classList.remove('open');
    el.setAttribute('aria-hidden', 'true');
  });
  _removeFocusTrap();
  // Står konfliktdialogen fortsatt åpen, skal tastaturet bli i den
  var wf = document.getElementById('workfile-conflict-backdrop');
  if (wf && wf.classList.contains('open')) _installFocusTrap(wf);
  pendingConfirmId = pendingConfirmCallback = pendingSvar = pendingVidereId =
  pendingDeleteId = pendingTagId = pendingTagStatus = pendingTagCallback =
  pendingFristCallback = pendingMedlId = null;
}

// ── Frist-modal ────────────────────────────────────
var pendingFristCallback = null;

function openFristModal(caseNumber, suggestedDate, descText, callback) {
  pendingFristCallback = callback;
  document.getElementById('frist-case-number').textContent = caseNumber;
  document.getElementById('frist-desc').textContent = descText;
  document.getElementById('f-frist').value = toDisplay(suggestedDate);
  openBackdrop('frist-backdrop');
  setTimeout(function() { document.getElementById('f-frist').focus(); }, 50);
}
function closeFristModal() { closeBackdrop('frist-backdrop'); pendingFristCallback = null; }

document.getElementById('btn-frist-cancel').addEventListener('click', closeFristModal);
document.getElementById('frist-backdrop').addEventListener('click', function(e) { if (e.target === this) closeFristModal(); });
document.getElementById('btn-frist-confirm').addEventListener('click', function() {
  var date = parseDate(document.getElementById('f-frist').value.trim());
  if (!date || !isValidDate(date)) return;
  var cb = pendingFristCallback;
  closeFristModal();
  if (cb) cb(date);
});

// ── Send til medlesing ─────────────────────────────
document.getElementById('btn-medl-send-cancel').addEventListener('click', closeMedlSendModal);
document.getElementById('medl-send-backdrop').addEventListener('click', function(e) { if (e.target === this) closeMedlSendModal(); });
document.getElementById('btn-medl-send-confirm').addEventListener('click', function() {
  var reader = document.getElementById('medl-send-reader').value;
  var date = parseDate(document.getElementById('medl-send-date').value.trim());
  if (!isValidDate(date)) {
    document.getElementById('medl-send-error').textContent = 'Ugyldig dato — bruk åååå.mm.dd.';
    return;
  }
  var id = pendingMedlId;
  closeMedlSendModal();
  if (id && reader) dispatch('MEDL_SEND', { id: id, reader: reader, sent: date });
});

// Knappene i «Hos medleser»-linjen på sakssiden, Oversikt og Medlesing.
['sak-medl-out', 'home-medl-out', 'medl-out-list'].forEach(function(elId) {
  document.getElementById(elId).addEventListener('click', function(e) {
    var link = e.target.closest('.medl-out-case');
    if (link) { e.preventDefault(); navigateTo('sak/' + link.dataset.id); return; }
    var btn = e.target.closest('button');
    if (btn) handleMedlMenuClick(btn);
  });
});

document.getElementById('btn-medleser-add').addEventListener('click', function() {
  var inp = document.getElementById('medleser-new-name');
  if (!inp.value.trim()) return;
  dispatch('MEDLESER_ADD', { name: inp.value });
  inp.value = '';
  inp.focus();
});
document.getElementById('medleser-new-name').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') { e.preventDefault(); document.getElementById('btn-medleser-add').click(); }
});
document.getElementById('medleser-list').addEventListener('change', function(e) {
  var t = e.target.closest('.medleser-toggle');
  if (t) dispatch('MEDLESER_TOGGLE', { idx: parseInt(t.dataset.idx, 10) });
});
document.getElementById('medleser-list').addEventListener('click', function(e) {
  var del = e.target.closest('.btn-medleser-del');
  if (del) dispatch('MEDLESER_DELETE', { idx: parseInt(del.dataset.idx, 10) });
});

// ── Stikkord-modal ─────────────────────────────────
var pendingTagId = null, pendingTagStatus = null, pendingTagCallback = null, pendingTagNeedsOutcome = false;

// Samler inn stikkord — og utfall når en sak avsluttes — og gir dem videre til
// callback(tags, outcome). Modalen avgjør ikke selv hva som skjer etterpå — det
// eier runStatusTransition. opts.editOutcome brukes for å endre utfallet på en
// sak som allerede er avsluttet.
function openTagModal(id, toStatus, callback, opts) {
  opts = opts || {};
  pendingTagId       = id;
  pendingTagStatus   = toStatus || 'avsluttet';
  pendingTagCallback = callback || null;
  var theCase   = cases.find(function(c) { return c.id === id; });
  var isClosing = pendingTagStatus === 'avsluttet';
  pendingTagNeedsOutcome = isClosing && !!theCase && theCase.type !== 'oppdrag';
  document.getElementById('tag-case-number').textContent = theCase ? theCase.caseNumber : '';
  document.getElementById('f-tags').value = (theCase && theCase.tags) ? theCase.tags : '';
  document.getElementById('tag-modal-title').childNodes[0].textContent =
    opts.editOutcome ? 'Endre utfall — ' : isClosing ? 'Avslutt sak — ' : 'Brev sendt — ';
  document.getElementById('tag-modal-desc').textContent = pendingTagNeedsOutcome
    ? 'Velg utfall, og legg eventuelt til stikkord.'
    : isClosing
      ? 'Legg til stikkord for denne saken (valgfritt).'
      : 'Legg til stikkord for denne saken (valgfritt). Saken sendes til Fristarkiv.';
  document.getElementById('btn-tag-confirm').textContent =
    opts.editOutcome ? 'Lagre' : isClosing ? 'Avslutt sak' : 'Brev sendt';
  document.getElementById('tag-outcome-group').style.display = pendingTagNeedsOutcome ? '' : 'none';
  var current = opts.editOutcome && theCase ? theCase.outcome : (opts.presetOutcome || null);
  document.querySelectorAll('#tag-outcome-group input[name="outcome"]').forEach(function(r) { r.checked = r.value === current; });
  syncTagConfirm();
  openBackdrop('tag-backdrop');
  setTimeout(function() {
    var first = pendingTagNeedsOutcome && !current
      ? document.querySelector('#tag-outcome-group input[name="outcome"]')
      : document.getElementById('f-tags');
    if (first) first.focus();
  }, 50);
}
function selectedOutcome() {
  var r = document.querySelector('#tag-outcome-group input[name="outcome"]:checked');
  return r ? r.value : null;
}
// Utfallet er påkrevd når en sak avsluttes: uten det blir saksflyten på
// Oversikt feil.
function syncTagConfirm() {
  document.getElementById('btn-tag-confirm').disabled = pendingTagNeedsOutcome && !selectedOutcome();
}
function closeTagModal() {
  closeBackdrop('tag-backdrop');
  pendingTagId = pendingTagStatus = pendingTagCallback = null;
  pendingTagNeedsOutcome = false;
}
document.querySelectorAll('#tag-outcome-group input[name="outcome"]').forEach(function(r) {
  r.addEventListener('change', syncTagConfirm);
});

document.getElementById('btn-tag-cancel').addEventListener('click', closeTagModal);
document.getElementById('tag-backdrop').addEventListener('click', function(e) { if (e.target === this) closeTagModal(); });
document.getElementById('f-tags').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') document.getElementById('btn-tag-confirm').click();
});

document.getElementById('btn-tag-confirm').addEventListener('click', function() {
  if (!pendingTagId) return;
  if (pendingTagNeedsOutcome && !selectedOutcome()) return;
  var tags    = normaliseTags(document.getElementById('f-tags').value);
  var outcome = pendingTagNeedsOutcome ? selectedOutcome() : null;
  var cb      = pendingTagCallback;
  if (fModalTags) fModalTags.value = tags;
  closeTagModal();
  if (cb) cb(tags, outcome);
});

// ── Bekreft fullføring (Ny → Fristarkiv) ──────────
var pendingConfirmId = null, pendingConfirmCallback = null;

// Teksten kommer fra overgangen, ikke fra hvilken side man tilfeldigvis står
// på — modalen brukes nå også fra sakssiden, der PAGES[activePage] er «sak».
function openCompleteConfirm(id, caseNumber, desc, callback) {
  pendingConfirmId       = id;
  pendingConfirmCallback = callback || null;
  document.getElementById('complete-case-number').textContent = caseNumber;
  document.getElementById('complete-action-desc').textContent = desc || '';
  openBackdrop('complete-backdrop');
}
function closeCompleteConfirm() {
  closeBackdrop('complete-backdrop');
  pendingConfirmId = pendingConfirmCallback = null;
}
document.getElementById('btn-complete-cancel').addEventListener('click', closeCompleteConfirm);
document.getElementById('complete-backdrop').addEventListener('click', function(e) { if (e.target === this) closeCompleteConfirm(); });
document.getElementById('btn-complete-confirm').addEventListener('click', function() {
  if (!pendingConfirmId) { closeCompleteConfirm(); return; }
  var cb = pendingConfirmCallback;
  closeCompleteConfirm();
  if (cb) cb();
});

// ── Statusoverganger: én vei inn ───────────────────
// Kjører en overgang med de dialogene den krever — bekreftelse, stikkord og ny
// frist, i den rekkefølgen — og bokfører den til slutt. Både sakslista og
// statusknappene på sakssiden går gjennom denne, slik at en sak ikke kan skifte
// status uten at fristen blir tatt stilling til. Hva som kreves avgjøres av
// statusTransition; her håndteres bare dialogkjeden.
function runStatusTransition(id, toStatus, opts) {
  opts = opts || {};
  var theCase = cases.find(function(c) { return c.id === id; });
  if (!theCase) return;
  var isOppdrag = theCase.type === 'oppdrag';
  var t = statusTransition(theCase.status, toStatus, isOppdrag, deadlines);
  if (!t) return;

  // Oppdrag har sin egen avslutning, som også fører statistikken.
  if (isOppdrag && toStatus === 'avsluttet') { completeOppdrag(id); return; }

  var steps = [];
  if (t.needsConfirm && !opts.skipConfirm) steps.push('confirm');
  if (t.needsTags)    steps.push('tags');
  if (t.needsDueDate) steps.push('due');

  var tags = null, outcome = null;
  // Søkerens svar registreres i «Svar mottatt», som også tar egen frist.
  var isResponse = theCase.status === 'fristarkiv' && toStatus === 'viderebehandling' && !isOppdrag;

  function commit(dueDate, historyExtra) {
    dispatch('CASE_STATUS_CHANGE', {
      id: id, toStatus: toStatus, logType: t.logType, newDueDate: dueDate || null, outcome: outcome,
      tags: tags, historyExtra: historyExtra || null
    });
  }

  // Hvert steg kaller next() når brukeren har fullført det. Avbryter brukeren
  // en dialog, stopper kjeden der — ingenting er lagret underveis.
  function next() {
    var step = steps.shift();
    if (step === 'confirm') {
      openCompleteConfirm(id, theCase.caseNumber, t.confirmDesc, next);
    } else if (step === 'tags') {
      openTagModal(id, toStatus, function(chosenTags, chosenOutcome) { tags = chosenTags; outcome = chosenOutcome; next(); },
        { presetOutcome: opts.outcome || null });
    } else if (step === 'due' && isResponse) {
      openSvarModal(id, commit);
    } else if (step === 'due') {
      openFristModal(theCase.caseNumber, monthsFromToday(t.suggestMonths), t.dueDateDesc, commit);
    } else {
      commit(null);
    }
  }
  next();
}

// ── «Svar mottatt» ─────────────────────────────────
// Registrerer søkerens svar: mottaksdato, hva som kom inn og egen frist, som
// foreslås fra mottaksdatoen. Fullført går saken til Viderebehandling og neste
// runde starter. runStatusTransition eier selve overgangen.
var pendingSvar = null;   // { id, callback, dueTouched }

function openSvarModal(id, callback) {
  var c = cases.find(function(x) { return x.id === id; });
  if (!c) return;
  pendingSvar = { id: id, callback: callback, dueTouched: false };
  var nextRound = examinationRound(c) + 1;
  document.getElementById('fristarkiv-case-number').textContent = c.caseNumber;
  document.getElementById('f-svar-received').value = toDisplay(todayStr());
  document.getElementById('f-svar-claims').checked = false;
  document.getElementById('f-svar-description').checked = false;
  document.getElementById('svar-error').textContent = '';
  document.getElementById('btn-fristarkiv-videre').textContent = 'Start runde ' + nextRound;
  _syncSvarDue();
  openBackdrop('fristarkiv-choice-backdrop');
  setTimeout(function() { document.getElementById('f-svar-received').focus(); }, 50);
}
function closeFristarkivChoice() { closeBackdrop('fristarkiv-choice-backdrop'); pendingSvar = null; }

// Fristen følger mottaksdatoen til brukeren selv har endret den.
function _syncSvarDue() {
  var received = parseDate(document.getElementById('f-svar-received').value.trim());
  var hint = document.getElementById('svar-due-hint');
  hint.textContent = deadlines.response + (deadlines.response === 1 ? ' måned' : ' måneder') +
    ' fra mottatt (endres under Innstillinger → Frister)';
  if (pendingSvar && !pendingSvar.dueTouched && isValidDate(received)) {
    document.getElementById('f-svar-due').value = toDisplay(responseDueDate(received, deadlines.response));
  }
}
['f-svar-received', 'f-svar-due'].forEach(function(elId) { autoFormatDateInput(document.getElementById(elId)); });
document.getElementById('f-svar-received').addEventListener('input', _syncSvarDue);
document.getElementById('f-svar-due').addEventListener('input', function() { if (pendingSvar) pendingSvar.dueTouched = true; });

document.getElementById('btn-fristarkiv-cancel').addEventListener('click', closeFristarkivChoice);
document.getElementById('fristarkiv-choice-backdrop').addEventListener('click', function(e) { if (e.target === this) closeFristarkivChoice(); });
document.getElementById('btn-fristarkiv-videre').addEventListener('click', function() {
  if (!pendingSvar) return;
  var received = parseDate(document.getElementById('f-svar-received').value.trim());
  var due      = parseDate(document.getElementById('f-svar-due').value.trim());
  var err = document.getElementById('svar-error');
  if (!isValidDate(received)) { err.textContent = 'Ugyldig mottaksdato — bruk åååå.mm.dd.'; return; }
  if (!isValidDate(due))      { err.textContent = 'Ugyldig frist — bruk åååå.mm.dd.'; return; }
  var changes = ['f-svar-claims', 'f-svar-description']
    .filter(function(elId) { return document.getElementById(elId).checked; })
    .map(function(elId) { return document.getElementById(elId).value; });
  var cb = pendingSvar.callback;
  closeFristarkivChoice();
  if (cb) cb(due, { received: received, changes: changes });
});
document.getElementById('btn-fristarkiv-avslutt').addEventListener('click', function() {
  if (!pendingSvar) return;
  var id = pendingSvar.id; closeFristarkivChoice(); runStatusTransition(id, 'avsluttet');
});

// ── Viderebehandling-valgpopup ─────────────────────
var pendingVidereId = null;

function openVidereChoice(id, caseNumber) {
  pendingVidereId = id;
  var c = cases.find(function(x) { return x.id === id; });
  document.getElementById('videre-case-number').textContent =
    caseNumber + (c ? ' · runde ' + examinationRound(c) : '');
  document.getElementById('videre-letter-sub').textContent = 'Til Fristarkiv med søkers frist (' +
    deadlines.laterLetter + (deadlines.laterLetter === 1 ? ' måned' : ' måneder') + ')';
  renderAvslagWarnings(c);
  openBackdrop('videre-choice-backdrop');
}
// Merknader under «Avslag» (tekst, aldri markup). Avslag kan alltid velges.
function renderAvslagWarnings(c) {
  var box = document.getElementById('videre-avslag-warn');
  var ul = box.querySelector('ul');
  ul.textContent = '';
  var data = c ? loadSakData(c.id) : null;
  var lines = c ? refusalWarnings(c, data || {}, roundsOf(data)) : [];
  lines.forEach(function(t) {
    var li = document.createElement('li');
    li.textContent = t;
    ul.appendChild(li);
  });
  box.hidden = !lines.length;
}
function closeVidereChoice() { closeBackdrop('videre-choice-backdrop'); pendingVidereId = null; }

document.getElementById('btn-videre-cancel').addEventListener('click', closeVidereChoice);
document.getElementById('videre-choice-backdrop').addEventListener('click', function(e) { if (e.target === this) closeVidereChoice(); });
document.getElementById('btn-videre-fristarkiv').addEventListener('click', function() {
  if (!pendingVidereId) return;
  var id = pendingVidereId;
  closeVidereChoice();
  runStatusTransition(id, 'fristarkiv');
});
document.getElementById('btn-videre-avslutt').addEventListener('click', function() {
  if (!pendingVidereId) return;
  var id = pendingVidereId; closeVidereChoice(); runStatusTransition(id, 'avsluttet');
});
[['btn-videre-godkjenning', 'meddelt'], ['btn-videre-avslag', 'avslatt']].forEach(function(pair) {
  document.getElementById(pair[0]).addEventListener('click', function() {
    if (!pendingVidereId) return;
    var id = pendingVidereId; closeVidereChoice();
    runStatusTransition(id, 'avsluttet', { outcome: pair[1] });
  });
});

// ── Fullfør oppdrag ────────────────────────────────
function completeOppdrag(id) { dispatch('CASE_COMPLETE_OPPDRAG', { id: id }); }

// ── Endre utfall på en avsluttet sak ───────────────
function editOutcome(id) {
  openTagModal(id, 'avsluttet', function(tags, outcome) {
    dispatch('CASE_FIELD_UPDATE', { id: id, patch: { tags: tags, outcome: outcome } });
    render();
    if (activeSakId === id) renderSak(id);
  }, { editOutcome: true });
}

// Kjører radhandlingen (⋯ → neste steg) for en sak, fra hvilken som helst liste.
function runRowAction(id) {
  var c = cases.find(function(x) { return x.id === id; });
  if (!c) return;
  var a = rowAction(c.status || 'ny', c.type === 'oppdrag');
  if (!a) return;
  if      (a.type === 'confirm')           runStatusTransition(id, 'fristarkiv');
  else if (a.type === 'response')          runStatusTransition(id, 'viderebehandling');
  else if (a.type === 'choice-videre')     openVidereChoice(id, c.caseNumber);
  else if (a.type === 'complete-oppdrag')  completeOppdrag(id);
}

// ════════════════════════════════════════════════════════════════════════════

function cleUid() { return 'ci' + Math.random().toString(36).slice(2, 8); }

function renderCle() {
  var tpl = getChecklistTemplate();
  var container = document.getElementById('cle-phases');
  if (!container) return;

  container.innerHTML = tpl.map(function(phase, pi) {
    var itemsHtml = phase.items.map(function(item) {
      return '<div class="cle-item" data-pi="' + pi + '" data-id="' + esc(item.id) + '">' +
        '<input class="cle-item-label" type="text" value="' + esc(item.label) + '" placeholder="Punkt…" />' +
        '<button class="cle-btn-del-item" title="Slett punkt" data-feature="checklist-delete-item">✕</button>' +
      '</div>';
    }).join('');
    return '<div class="cle-phase" data-pi="' + pi + '">' +
      '<div class="cle-phase-header">' +
        '<input class="cle-phase-name" type="text" value="' + esc(phase.phase) + '" placeholder="Fasenavn…" />' +
      '</div>' +
      '<div class="cle-items">' + itemsHtml + '</div>' +
      '<div class="cle-add-item-row">' +
        '<input class="cle-add-item-input" type="text" placeholder="Legg til punkt…" />' +
        '<button class="cle-btn-add-item" data-feature="checklist-add-item">+ Legg til</button>' +
      '</div>' +
    '</div>';
  }).join('');

  // Legg til punkt
  container.querySelectorAll('.cle-btn-add-item').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var phaseEl = btn.closest('.cle-phase');
      var inp = phaseEl.querySelector('.cle-add-item-input');
      var label = inp.value.trim();
      if (!label) { inp.focus(); return; }
      var pi = parseInt(phaseEl.dataset.pi, 10);
      var itemsEl = phaseEl.querySelector('.cle-items');
      var newId = cleUid();
      var div = document.createElement('div');
      div.className = 'cle-item';
      div.dataset.pi = pi;
      div.dataset.id = newId;
      div.innerHTML = '<input class="cle-item-label" type="text" value="' + esc(label) + '" placeholder="Punkt…" />' +
        '<button class="cle-btn-del-item" title="Slett punkt" data-feature="checklist-delete-item">✕</button>';
      div.querySelector('.cle-btn-del-item').addEventListener('click', function() { div.remove(); });
      itemsEl.appendChild(div);
      inp.value = '';
      inp.focus();
    });
    btn.previousElementSibling.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); btn.click(); }
    });
  });

  // Slett punkt
  container.querySelectorAll('.cle-btn-del-item').forEach(function(btn) {
    btn.addEventListener('click', function() { btn.closest('.cle-item').remove(); });
  });
}

function cleCollect() {
  var phases = [];
  document.querySelectorAll('#cle-phases .cle-phase').forEach(function(phaseEl) {
    var phaseName = phaseEl.querySelector('.cle-phase-name').value.trim();
    if (!phaseName) return;
    var items = [];
    phaseEl.querySelectorAll('.cle-item').forEach(function(itemEl) {
      var label = itemEl.querySelector('.cle-item-label').value.trim();
      var id    = itemEl.dataset.id || cleUid();
      if (label) items.push({ id: id, label: label, type: 'check' });
    });
    phases.push({ phase: phaseName, items: items });
  });
  return phases;
}

function _cleUpdateSummary() {
  var tpl = getChecklistTemplate();
  var el = document.getElementById('cle-settings-summary');
  if (!el) return;
  var phases = tpl.length;
  var items = tpl.reduce(function(n, p) { return n + p.items.length; }, 0);
  el.textContent = phases + ' fase' + (phases !== 1 ? 'r' : '') + ' · ' + items + ' punkt' + (items !== 1 ? 'er' : '');
}

document.getElementById('btn-cle-open').addEventListener('click', function() {
  renderCle();
  openBackdrop('cle-backdrop');
});
document.getElementById('btn-cle-close').addEventListener('click', function() {
  closeBackdrop('cle-backdrop');
});
document.getElementById('btn-cle-cancel').addEventListener('click', function() {
  closeBackdrop('cle-backdrop');
});
document.getElementById('cle-backdrop').addEventListener('click', function(e) {
  if (e.target === this) closeBackdrop('cle-backdrop');
});

document.getElementById('btn-cle-save').addEventListener('click', function() {
  var tpl = cleCollect();
  dispatch('CHECKLIST_TEMPLATE_SAVE', { template: tpl });
});

document.getElementById('btn-cle-reset').addEventListener('click', function() { openBackdrop('cle-reset-backdrop'); });
document.getElementById('btn-cle-reset-cancel').addEventListener('click', function() { closeBackdrop('cle-reset-backdrop'); });
document.getElementById('cle-reset-backdrop').addEventListener('click', function(e) { if (e.target === this) closeBackdrop('cle-reset-backdrop'); });
document.getElementById('btn-cle-reset-confirm').addEventListener('click', function() {
  closeBackdrop('cle-reset-backdrop');
  dispatch('CHECKLIST_TEMPLATE_RESET');
});

// ── Slett alt ──────────────────────────────────────
document.getElementById('btn-delete-all').addEventListener('click', function() { openBackdrop('delete-all-backdrop-1'); });
document.getElementById('btn-delete-all-cancel1').addEventListener('click', function() { closeBackdrop('delete-all-backdrop-1'); });
document.getElementById('btn-delete-all-step1').addEventListener('click', function() { closeBackdrop('delete-all-backdrop-1'); openBackdrop('delete-all-backdrop-2'); });
document.getElementById('btn-delete-all-cancel2').addEventListener('click', function() { closeBackdrop('delete-all-backdrop-2'); });
document.getElementById('btn-delete-all-final').addEventListener('click', function() {
  dispatch('DATA_DELETE_ALL');
});

