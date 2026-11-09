// ── CPC-event-håndtering ──────────────────────────
function _initCpcLoadButton() {
  var btn = document.getElementById('btn-cpc-load');
  if (!btn) return;
  btn.addEventListener('click', function() { document.getElementById('cpc-file-input').click(); });
}

function initOnboarding() {
  var backdrop = document.getElementById('onboarding-backdrop');
  if (!backdrop) return;
  var steps = Array.prototype.slice.call(backdrop.querySelectorAll('.onb-step'));
  var dots  = Array.prototype.slice.call(backdrop.querySelectorAll('.onb-dot'));
  var btnBack = document.getElementById('btn-onb-back');
  var btnNext = document.getElementById('btn-onb-next');
  var btnSkip = document.getElementById('btn-onb-skip');
  var btnClose = document.getElementById('btn-onb-close');
  var nameInput = document.getElementById('input-onb-name');
  var docRootInput = document.getElementById('input-onb-docroot');
  var docRootPreview = document.getElementById('onb-docroot-preview');
  var current = 0;

  function updateDocRootPreview() { if (docRootPreview) docRootPreview.innerHTML = _docRootPreviewHtml(docRootInput.value); }
  docRootInput.addEventListener('input', updateDocRootPreview);

  function showStep(n) {
    current = n;
    steps.forEach(function(el, i) { el.classList.toggle('onb-step-active', i === n); });
    dots.forEach(function(el, i) { el.classList.toggle('onb-dot-active', i === n); });
    btnBack.style.visibility = n === 0 ? 'hidden' : 'visible';
    if (n === steps.length - 1) {
      btnSkip.textContent = 'Senere';
      btnNext.textContent = 'Last inn cpc.json';
    } else {
      btnSkip.textContent = 'Hopp over';
      btnNext.textContent = 'Neste';
    }
  }

  function persistStep(n) {
    if (n === 0) saveUserName(nameInput.value.trim());
    if (n === 1) {
      var normalized = _docRootNormalize(docRootInput.value) || DEFAULT_DOC_ROOT;
      docRootInput.value = normalized;
      updateDocRootPreview();
      saveDocRoot(normalized);
    }
  }

  function finish() {
    localStorage.setItem(ONBOARDING_KEY, '1');
    closeBackdrop('onboarding-backdrop');
    _cpcShowNotice();
  }

  btnBack.addEventListener('click', function() {
    if (current > 0) showStep(current - 1);
  });
  btnNext.addEventListener('click', function() {
    persistStep(current);
    if (current === steps.length - 1) {
      localStorage.setItem(ONBOARDING_KEY, '1');
      closeBackdrop('onboarding-backdrop');
      document.getElementById('cpc-file-input').click();
    } else {
      showStep(current + 1);
    }
  });
  btnSkip.addEventListener('click', function() {
    persistStep(current);
    if (current === steps.length - 1) {
      finish();
    } else {
      showStep(current + 1);
    }
  });
  btnClose.addEventListener('click', function() {
    persistStep(current);
    finish();
  });

  nameInput.value = loadUserName();
  var savedRoot = loadDocRoot();
  if (savedRoot && savedRoot !== DEFAULT_DOC_ROOT) docRootInput.value = savedRoot;
  updateDocRootPreview();
  showStep(0);
}

function initCpcLoadButton() {
  // Innstillinger-knapp
  document.getElementById('btn-settings-cpc-load').addEventListener('click', function() {
    document.getElementById('cpc-file-input').click();
  });

  // Bind file input change alltid ved oppstart — uavhengig av IndexedDB-tilstand
  document.getElementById('cpc-file-input').addEventListener('change', function(e) {
    var file = e.target.files[0]; if (!file) return;
    _cpcLoadFile(file);
    e.target.value = '';
  });

  // Dra-og-slipp på CPC-raden i innstillinger
  var cpcRow = document.getElementById('settings-cpc-row');
  ['dragover', 'dragenter'].forEach(function(evt) {
    cpcRow.addEventListener(evt, function(e) {
      e.preventDefault();
      cpcRow.classList.add('cpc-drop-active');
    });
  });
  ['dragleave', 'dragend', 'drop'].forEach(function(evt) {
    cpcRow.addEventListener(evt, function(e) {
      if (evt === 'dragleave' && cpcRow.contains(e.relatedTarget)) return;
      cpcRow.classList.remove('cpc-drop-active');
    });
  });
  cpcRow.addEventListener('drop', function(e) {
    e.preventDefault();
    var file = e.dataTransfer.files[0];
    if (file) _cpcLoadFile(file);
  });

  _cpcTryLoadFromDb();
}

function _cpcLoadFile(file) {
  _cpcSetBanner('<span class="cpc-banner-loading"><span class="spinner" aria-hidden="true"></span>Lagrer…</span>');
  var reader = new FileReader();
  reader.onload = function(ev) {
    try {
      var data = JSON.parse(ev.target.result);
      _cpcLoaded(data);
      _cpcSaveToDb(data, function(err) {
        if (err) showToast('Lastet, men kunne ikke lagre til database.');
        else showToast('CPC-database lagret — lastes automatisk neste gang.');
      });
    } catch(err) {
      showToast('Kunne ikke lese filen — ugyldig format.');
      _cpcTryLoadFromDb();
    }
  };
  reader.readAsText(file, 'utf-8');
}

function initCpcAutocomplete() {
  var inp  = document.getElementById('sak-class-assumed-input');
  var box  = document.getElementById('cpc-suggestions');
  var activeIdx = -1;

  function hideSug() { box.style.display = 'none'; box.innerHTML = ''; activeIdx = -1; }

  function showSug(items) {
    if (!items.length) { hideSug(); return; }
    activeIdx = -1;
    box.innerHTML = items.map(function(item, i) {
      return '<div class="cpc-suggestion" data-idx="' + i + '" data-code="' + esc(item.code) + '" data-title="' + esc(item.title) + '">' +
        '<span class="cpc-sug-code">' + esc(item.code) + '</span>' +
        ' <span class="cpc-sug-title">' + esc(item.title) + '</span>' +
        '</div>';
    }).join('');
    box.style.display = 'block';
  }

  function selectSug(code) {
    inp.value = code;
    hideSug();
    inp.focus();
  }

  inp.addEventListener('input', function() { showSug(cpcSearch(inp.value)); });

  inp.addEventListener('keydown', function(e) {
    var items = box.querySelectorAll('.cpc-suggestion');
    if (!items.length) return;
    if      (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, items.length - 1); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); selectSug(items[activeIdx].dataset.code); return; }
    else if (e.key === 'Escape') { hideSug(); return; }
    items.forEach(function(el, i) { el.classList.toggle('active', i === activeIdx); });
  });

  box.addEventListener('mousedown', function(e) {
    var item = e.target.closest('.cpc-suggestion');
    if (item) { e.preventDefault(); selectSug(item.dataset.code); }
  });

  document.addEventListener('click', function(e) {
    if (!inp.contains(e.target) && !box.contains(e.target)) hideSug();
  });
}

// ── Stikkord-autocomplete ──────────────────────────
function getAllTags() {
  var freq = {};
  cases.forEach(function(c) {
    if (!c.tags) return;
    c.tags.split(',').forEach(function(t) { var tag = t.trim().toLowerCase(); if (tag) freq[tag] = (freq[tag] || 0) + 1; });
  });
  return Object.keys(freq).sort(function(a, b) { return freq[b] - freq[a] || a.localeCompare(b, 'nb'); });
}

function initTagFilterAutocomplete() {
  var inp = document.getElementById('tag-filter-input');
  if (!inp) return;
  var wrap = inp.parentNode;
  if (!wrap.classList.contains('tag-input-wrap')) {
    var w = document.createElement('div'); w.className = 'tag-input-wrap';
    inp.parentNode.insertBefore(w, inp); w.appendChild(inp); wrap = w;
  }
  var suggBox = document.createElement('div'); suggBox.className = 'tag-suggestions'; suggBox.style.display = 'none';
  wrap.appendChild(suggBox);
  var activeIdx = -1;

  function hideSugg() { suggBox.style.display = 'none'; suggBox.innerHTML = ''; activeIdx = -1; }
  function showSugg() {
    var term = inp.value.trim().toLowerCase();
    if (!term) { hideSugg(); return; }
    var matches = getAllTags().filter(function(t) { return t.indexOf(term) !== -1 && t !== term; }).slice(0, 8);
    if (!matches.length) { hideSugg(); return; }
    suggBox.innerHTML = matches.map(function(t) {
      return '<div class="tag-suggestion-item">' + highlightMatch(t, term) + '</div>';
    }).join('');
    suggBox.style.display = 'block'; activeIdx = -1;
  }
  function selectSugg(val) {
    inp.value = val;
    dispatch('TAG_FILTER_SET', { tag: val });
    hideSugg(); inp.focus();
  }

  inp.addEventListener('input', showSugg);
  inp.addEventListener('keydown', function(e) {
    var items = suggBox.querySelectorAll('.tag-suggestion-item');
    if (!items.length) return;
    if      (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, items.length - 1); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); selectSugg(items[activeIdx].textContent); return; }
    else if (e.key === 'Escape') { hideSugg(); return; }
    items.forEach(function(el, i) { el.classList.toggle('active', i === activeIdx); });
  });
  suggBox.addEventListener('mousedown', function(e) {
    var item = e.target.closest('.tag-suggestion-item');
    if (item) { e.preventDefault(); selectSugg(item.textContent); }
  });
  document.addEventListener('click', function(e) { if (!wrap.contains(e.target)) hideSugg(); });
}

function initTagAutocomplete(inputEl) {
  if (!inputEl || inputEl.dataset.autocompleteInit) return;
  inputEl.dataset.autocompleteInit = '1';
  var wrap = inputEl.parentNode;
  if (!wrap.classList.contains('tag-input-wrap') && !wrap.classList.contains('tag-pill-editor')) {
    var w = document.createElement('div'); w.className = 'tag-input-wrap';
    inputEl.parentNode.insertBefore(w, inputEl); w.appendChild(inputEl); wrap = w;
  }
  var suggBox = document.createElement('div'); suggBox.className = 'tag-suggestions'; suggBox.style.display = 'none';
  wrap.appendChild(suggBox);
  var activeIdx = -1;

  function getLastTerm() { var parts = inputEl.value.split(','); return parts[parts.length - 1].trim().toLowerCase(); }
  function replaceLastTerm(chosen) {
    var parts = inputEl.value.split(',');
    parts[parts.length - 1] = ' ' + chosen;
    inputEl.value = parts.join(',').replace(/^\s*,\s*/, '') + ', ';
    inputEl.value = inputEl.value.replace(/^\s+/, '');
    hideSuggestions(); inputEl.focus();
  }
  function hideSuggestions() { suggBox.style.display = 'none'; suggBox.innerHTML = ''; activeIdx = -1; }
  function showSuggestions(term) {
    if (!term) { hideSuggestions(); return; }
    var matches = getAllTags().filter(function(t) { return t.indexOf(term) !== -1 && t !== term; }).slice(0, 8);
    if (!matches.length) { hideSuggestions(); return; }
    suggBox.innerHTML = matches.map(function(t) {
      return '<div class="tag-suggestion-item">' + highlightMatch(t, term) + '</div>';
    }).join('');
    suggBox.style.display = 'block'; activeIdx = -1;
  }

  inputEl.addEventListener('input', function() { showSuggestions(getLastTerm()); });
  inputEl.addEventListener('keydown', function(e) {
    var items = suggBox.querySelectorAll('.tag-suggestion-item');
    if (!items.length) return;
    if      (e.key === 'ArrowDown')                  { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, items.length - 1); }
    else if (e.key === 'ArrowUp')                    { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); }
    else if (e.key === 'Enter' && activeIdx >= 0)    { e.preventDefault(); e.stopPropagation(); replaceLastTerm(items[activeIdx].textContent); return; }
    else if (e.key === 'Escape')                     { hideSuggestions(); return; }
    items.forEach(function(el, i) { el.classList.toggle('active', i === activeIdx); });
  });
  suggBox.addEventListener('mousedown', function(e) {
    var item = e.target.closest('.tag-suggestion-item');
    if (item) { e.preventDefault(); replaceLastTerm(item.textContent); }
  });
  document.addEventListener('click', function(e) { if (!wrap.contains(e.target)) hideSuggestions(); });
}

// ── Escape ─────────────────────────────────────────
document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeAllBackdrops(); });

// Tastaturkartet for kravtabellen. Rent oppslag — lytteren under gjør resten.
// Se test/claimKeyboard.test.js.
function claimKeyAction(key) {
  switch (key) {
    case 'j': case 'J': case 'ArrowDown': return { type: 'move', delta: 1 };
    case 'k': case 'K': case 'ArrowUp':   return { type: 'move', delta: -1 };
    case '1': return { type: 'field', field: 'novelty' };
    case '2': return { type: 'field', field: 'inventive' };
    case '3': return { type: 'field', field: 'formal' };
    case 'y': case 'Y': return { type: 'set', value: true };
    case 'n': case 'N': return { type: 'set', value: false };
    case '?': return { type: 'set', value: null };
    case ' ': return { type: 'toggle' };
    case 'c': case 'C': return { type: 'copyDocs' };
    case 'Escape': return { type: 'exit' };
    default: return null;
  }
}

// ── Tastatursnarveier ──────────────────────────────
function _isTypingTarget(el) {
  if (!el) return false;
  var tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
function _anyBackdropOpen() { return !!document.querySelector('.modal-backdrop.open'); }

document.addEventListener('keydown', function(e) {
  // Hopp over når en modifikator holdes (Ctrl+K m.fl. håndteres separat),
  // når man skriver i et felt, eller når en dialog allerede er åpen.
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (_isTypingTarget(e.target)) return;
  if (_anyBackdropOpen()) return;
  // Står markøren i kravtabellen, eier den 1–5 og ?; sidenavigasjonen viker.
  if (sakClaimCursorActive()) return;
  switch (e.key) {
    case '?': e.preventDefault(); openBackdrop('shortcuts-backdrop'); break;
    case 'n': case 'N': e.preventDefault(); openModal(null); break;
    case '1': e.preventDefault(); navigateTo('hjem'); break;
    case '2': e.preventDefault(); navigateTo('ny'); break;
    case '3': e.preventDefault(); navigateTo('viderebehandling'); break;
    case '4': e.preventDefault(); navigateTo('fristarkiv'); break;
    case '5': e.preventDefault(); navigateTo('oppdrag'); break;
    case '6': e.preventDefault(); navigateTo('avsluttet'); break;
    case '7': e.preventDefault(); navigateTo('medlesing'); break;
  }
});
document.getElementById('btn-shortcuts-close').addEventListener('click', function() { closeBackdrop('shortcuts-backdrop'); });
document.getElementById('shortcuts-backdrop').addEventListener('click', function(e) { if (e.target === this) closeBackdrop('shortcuts-backdrop'); });

// ── Flerfane-vakt ──────────────────────────────────
// storage-eventet fyrer kun i ANDRE faner enn den som skrev. Endres saksdata i
// en annen fane, er denne fanens minne utdatert — og en lagring herfra ville
// overskrevet den andre fanens endringer (siste-skriver-vinner). Vi varsler
// (én gang) i stedet for å auto-laste på nytt, for ikke å forkaste pågående
// redigering i denne fanen.
var _multiTabWarned = false;

// Nøklene som holder egentlig data — saker, statistikk, ferier, saksdetaljer
// og medlesinger — ikke backup-status, schema-flagg e.l.
// Ren funksjon — se test/exportSearch.test.js.
function isDataStorageKey(key) {
  if (typeof key !== 'string' || !key) return false;
  return key === STORAGE_KEY || key === STATS_KEY || key === VACATION_KEY ||
         key === MEDLESING_KEY || key === MEDL_LOG_KEY || key === MEDLESERE_KEY ||
         key.indexOf(SAK_KEY_PREFIX) === 0;
}
window.addEventListener('storage', function(e) {
  if (_multiTabWarned || !e.key) return;
  if (!isDataStorageKey(e.key)) return;
  _multiTabWarned = true;
  showToast('⚠ Dataene ble endret i en annen fane. Last inn siden på nytt for å unngå å overskrive.', true);
});

// ── Globalt søk (Ctrl+K) ───────────────────────────
var _searchHits = [], _searchSel = 0;

function openGlobalSearch() {
  var inp = document.getElementById('global-search-input');
  inp.value = '';
  _searchHits = []; _searchSel = 0;
  _renderSearchResults('');
  openBackdrop('search-backdrop');
  inp.focus();
}

// Rangering: saksnummer-prefiks > saksnummer > tittel > stikkord > notater
// > saksdetaljene (motholdsnumre, søkere og oppfinnere, CPC-klasser, saksnotater).
function searchCases(q) { return searchCaseList(q, cases, loadSakData); }

// Treff i en saks detaljer. Publikasjonsnumre og klasser sammenlignes uten
// mellomrom og skilletegn, så «WO 2020/1234» finner WO2020123456A1.
function _detailsMatch(q, d) {
  if (!d) return false;
  var qn = normalizePubNumber(q);
  var docs = Array.isArray(d.docs) ? d.docs : [];
  if (docs.some(function(x) {
    var ref = String((x && x.ref) || '');
    if (ref.toLowerCase().indexOf(q) > -1 || (qn.length >= 3 && normalizePubNumber(ref).indexOf(qn) > -1)) return true;
    // Søker og oppfinner på motholdet
    if (['applicants', 'inventors'].some(function(f) {
      return typeof (x && x[f]) === 'string' && x[f].toLowerCase().indexOf(q) > -1;
    })) return true;
    // CPC-klassene på motholdet, sammenlignet uten mellomrom
    return qn.length >= 3 && typeof (x && x.cpc) === 'string' && normalizePubNumber(x.cpc).indexOf(qn) > -1;
  })) return true;
  var classes = Array.isArray(d.classes) ? d.classes : [];
  if (qn.length >= 3 && classes.some(function(x) { return normalizePubNumber((x && x.code) || '').indexOf(qn) > -1; })) return true;
  return String(d.sakNotes || '').toLowerCase().indexOf(q) > -1;
}

// detailsFn(id) gir saksdetaljene (pt_sak_*). De leses bare når søket har
// minst tre tegn og saken ikke allerede traff på feltene i sakslista.
// Ren funksjon — se test/exportSearch.test.js.
function searchCaseList(q, list, detailsFn) {
  q = (q || '').trim().toLowerCase();
  if (!q) return [];
  var hits = [];
  (list || []).forEach(function(c) {
    var cn = (c.caseNumber || '').toLowerCase();
    var score = -1;
    if      (cn.indexOf(q) === 0)                                  score = 0;
    else if (cn.indexOf(q) > -1)                                   score = 1;
    else if ((c.title || '').toLowerCase().indexOf(q) > -1)        score = 2;
    else if ((c.tags  || '').toLowerCase().indexOf(q) > -1)        score = 3;
    else if ((c.notes || '').toLowerCase().indexOf(q) > -1)        score = 4;
    else if (q.length >= 3 && _detailsMatch(q, detailsFn(c.id)))   score = 5;
    if (score >= 0) hits.push({ c: c, score: score });
  });
  hits.sort(function(a, b) {
    if (a.score !== b.score) return a.score - b.score;
    return (a.c.caseNumber || '') < (b.c.caseNumber || '') ? -1 : 1;
  });
  return hits.slice(0, 10).map(function(h) { return h.c; });
}

function _searchHitMeta(c) {
  var label;
  if (c.type === 'oppdrag') label = c.status === 'avsluttet' ? 'Avsluttet oppdrag' : 'Oppdrag';
  else                      label = (STATUS_CONFIG[c.status] || {}).label || c.status || '';
  if (c.status === 'avsluttet' || !c.dueDate) return label;
  var d = daysUntil(deadlineFor(c));
  return label + ' · ' + (d < 0 ? Math.abs(d) + ' d forfalt' : d === 0 ? 'frist i dag' : d + ' d igjen');
}

function _renderSearchResults(q) {
  var box = document.getElementById('global-search-results');
  _searchHits = searchCases(q);
  if (_searchSel >= _searchHits.length) _searchSel = 0;
  if (!q.trim()) { box.innerHTML = ''; return; }
  if (!_searchHits.length) {
    box.innerHTML = '<div class="search-empty">Ingen treff</div>';
    return;
  }
  box.innerHTML = _searchHits.map(function(c, i) {
    return '<div class="search-hit' + (i === _searchSel ? ' search-hit-sel' : '') + '" data-id="' + esc(c.id) + '" role="option"' + (i === _searchSel ? ' aria-selected="true"' : '') + '>' +
      '<span class="search-hit-cn">' + esc(c.caseNumber) + '</span>' +
      '<span class="search-hit-t">' + esc(c.title || '') + '</span>' +
      '<span class="search-hit-meta">' + esc(_searchHitMeta(c)) + '</span>' +
    '</div>';
  }).join('');
  box.querySelectorAll('.search-hit').forEach(function(row) {
    row.addEventListener('click', function() { _openSearchHit(row.dataset.id); });
  });
}

function _openSearchHit(id) {
  closeBackdrop('search-backdrop');
  navigateTo('sak/' + id);
}

document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
    e.preventDefault();
    openGlobalSearch();
  }
});

document.getElementById('global-search-input').addEventListener('input', function() {
  _searchSel = 0;
  _renderSearchResults(this.value);
});

document.getElementById('global-search-input').addEventListener('keydown', function(e) {
  if (e.key === 'ArrowDown')      { e.preventDefault(); if (_searchHits.length) { _searchSel = (_searchSel + 1) % _searchHits.length; _renderSearchResults(this.value); } }
  else if (e.key === 'ArrowUp')   { e.preventDefault(); if (_searchHits.length) { _searchSel = (_searchSel - 1 + _searchHits.length) % _searchHits.length; _renderSearchResults(this.value); } }
  else if (e.key === 'Enter')     { e.preventDefault(); if (_searchHits[_searchSel]) _openSearchHit(_searchHits[_searchSel].id); }
});

document.getElementById('search-backdrop').addEventListener('click', function(e) {
  if (e.target === this) closeBackdrop('search-backdrop');
});

// ── Se etter oppdatering ───────────────────────────
// Leser APP_VERSION fra main på GitHub og sammenligner. Ren GET uten data ut;
// ingenting lagres, og ingenting lastes ned automatisk.
// NB: stien under er en offentlig kontrakt for utgitte kopier. Flyttes eller
// omdøpes filen på main, får alle installerte kopier 404 og viser «frakoblet».
var UPDATE_CHECK_URL = 'https://raw.githubusercontent.com/SpaceSphereWheatley/patentdesk/main/src/js/01-config-templates.js';
var UPDATE_DOWNLOAD_URL = 'https://github.com/SpaceSphereWheatley/patentdesk/blob/main/PatentDesk.html';
var UPDATE_TIMEOUT_MS = 8000;

function compareVersions(a, b) {
  var pa = String(a).replace(/^v/, '').split('.').map(Number);
  var pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (var i = 0; i < 3; i++) {
    var d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

function parseRemoteVersion(text) {
  if (typeof text !== 'string') return null;
  var m = /var\s+APP_VERSION\s*=\s*'(v\d+\.\d+\.\d+)'/.exec(text);
  return m ? m[1] : null;
}

// Returnerer { kind: 'new' | 'current' | 'error', remote? }. Kaster aldri og
// henger aldri: forespørselen avbrytes etter timeoutMs selv uten AbortSignal.timeout.
function runUpdateCheck(fetchFn, timeoutMs) {
  var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  var timer;
  var timeout = new Promise(function(resolve) {
    timer = setTimeout(function() {
      if (ctrl) ctrl.abort();
      resolve({ kind: 'error' });
    }, timeoutMs === undefined ? UPDATE_TIMEOUT_MS : timeoutMs);
  });
  var request = Promise.resolve().then(function() {
    // ?t=<nå>: GitHubs CDN og proxyer på jobbnettet mellomlagrer filen; et
    // unikt tillegg tvinger frem en fersk kopi (cache: 'no-store' gjelder bare nettleseren).
    return fetchFn(UPDATE_CHECK_URL + '?t=' + Date.now(), {
      method: 'GET', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
      signal: ctrl ? ctrl.signal : undefined
    });
  }).then(function(res) {
    if (!res || !res.ok) return { kind: 'error' };
    return res.text().then(function(text) {
      var remote = parseRemoteVersion(text);
      if (!remote) return { kind: 'error' };
      return { kind: compareVersions(remote, APP_VERSION) > 0 ? 'new' : 'current', remote: remote };
    });
  }).catch(function() { return { kind: 'error' }; });
  return Promise.race([request, timeout]).then(function(r) { clearTimeout(timer); return r; });
}

function renderUpdateStatus(el, result) {
  el.textContent = '';
  el.className = 'upd-status upd-' + result.kind;
  if (result.kind === 'new') {
    el.appendChild(document.createTextNode(result.remote + ' er tilgjengelig '));
    var a = document.createElement('a');
    a.href = UPDATE_DOWNLOAD_URL; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.textContent = 'Last ned';
    el.appendChild(a);
  } else if (result.kind === 'current') {
    el.textContent = 'Du har nyeste versjon';
  } else {
    el.textContent = 'Kunne ikke sjekke (frakoblet?)';
  }
}

// Klikk-håndterer: én sjekk om gangen, knappen låses mens den pågår.
function startUpdateCheck(btn, out, fetchFn) {
  if (btn.disabled) return Promise.resolve(null);
  btn.disabled = true;
  out.className = 'upd-status'; out.textContent = 'Sjekker …';
  return runUpdateCheck(fetchFn).then(function(result) {
    renderUpdateStatus(out, result);
    btn.disabled = false;
    return result;
  });
}

// Kobler knappen til sjekken. Gjør ingenting før knappen klikkes.
function wireUpdateCheck(doc, fetchFn) {
  var btn = doc.getElementById('btn-check-update');
  var out = doc.getElementById('update-status');
  if (!btn || !out) return;
  btn.addEventListener('click', function() { startUpdateCheck(btn, out, fetchFn); });
}
wireUpdateCheck(document, function(url, opts) { return fetch(url, opts); });

// ── Konsoll-melding ────────────────────────────────
(function() {
  console.log('PatentDesk ' + APP_VERSION);
})();

// ── Fun facts ──────────────────────────────────────
var FUN_FACTS = [
  'Det første patentet i moderne forstand ble gitt i Venezia i 1474 — over 550 år før EPO.',
  'Albert Einstein jobbet som patentgransker i Bern da han publiserte spesiell relativitetsteori i 1905.',
  'En patentsøknad kan ha hundrevis av krav, men det er som regel krav 1 som avgjør om du får patent.',
  'USPTO mottar over 600 000 patentsøknader i året — omtrent én hvert 52. sekund.',
  'Det mest omstridte patentet i historien er kanskje US-patentet på en «fremgangsmåte for å svinge på en huske» fra 2002.',
  'En patentgransker leser i snitt 50–80 sider teknisk dokumentasjon per søknad.',
  'Prior art kan være hva som helst: en vitenskapelig artikkel, en YouTube-video, eller en gammel produktkatalog.',
  'Det finnes et patent på en treningssykkel for katter. Søknadsnummer US6701872B2.',
  'EPO har over 100 millioner patentdokumenter i sin database — den største åpne teknologidatabasen i verden.',
  'En europeisk patent-søknad gir deg i utgangspunktet 31 måneder fra prioritetsdato på å velge land.',
  'Japan var lenge verdensrekordholderen i antall patentsøknader per innbygger.',
  'Patentbeskyttelse varer som regel 20 år fra søknadsdato — ikke fra innvilgelsesdato.',
  'Omtrent 50 % av alle patentsøknader som granskes får avslag i første runde.',
  'Thomas Edison hadde 1 093 amerikanske patenter — et rekord som stod i over 80 år.',
  'Noen land tillater patent på forretningsmetoder; andre, som Norge, er langt mer restriktive.',
  'Patentlitteratur er den eneste tekniske litteraturen som juridisk sett må beskrive oppfinnelsen godt nok til at en fagperson kan gjenskape den.',
  'Begrepet «patent troll» ble visstnok brukt første gang i 1993 av en advokat i Detroits bilindustri.',
  'En PCT-søknad gir deg inngang til over 150 land med én enkelt internasjonal søknad.',
  'Bredden på kravene er en kunst: for brede krav faller mot prior art, for smale krav er lette å omgå.',
  'Den gjennomsnittlige behandlingstiden for en patentsøknad i Europa er 3–5 år fra innlevering til innvilgelse.'
];

// ── Bulk-legg til saker ────────────────────────────
function _bulkRowId() { return 'br_' + uid(); }

function _normDate(s) {
  s = s.trim();
  if (/^\d{4}[.-]\d{2}[.-]\d{2}$/.test(s)) return s.replace(/\./g, '-');
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
    var p = s.split('.'); return p[2] + '-' + p[1] + '-' + p[0];
  }
  return s;
}

