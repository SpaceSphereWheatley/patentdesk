// ── Saksdetaljer: event handlers ───────────────────
document.getElementById('btn-sak-back').addEventListener('click', function() {
  history.back();
});

// ── Saksdetaljer: cases-felt (lagrer til cases[]) ──
function updateCaseField(id, patch) {
  dispatch('CASE_FIELD_UPDATE', { id: id, patch: patch });
  // Oppdater topptekst
  var updated = cases.find(function(c) { return c.id === id; });
  if (updated) {
    document.getElementById('sak-page-title').textContent = updated.caseNumber;
    document.getElementById('sak-page-sub').textContent = sakSubtitle(updated);
    document.getElementById('sak-sticky-cn').textContent = updated.caseNumber;
    document.title = updated.caseNumber + (updated.title ? ' — ' + updated.title : '') + ' — PatentDesk';
  }
}


document.getElementById('sak-case-notes').addEventListener('input', function() {
  var id = activeSakId; if (!id) return;
  updateCaseField(id, { notes: sanitizeText(this.value) });
});

function getTagPillTags() {
  var pills = document.querySelectorAll('#sak-tags-pills .tag-pill-item');
  return Array.from(pills).map(function(p) { return p.dataset.tag; }).filter(Boolean);
}

function addTagPill(tag) {
  var list = document.getElementById('sak-tags-pills');
  if (!list) return;
  var existing = getTagPillTags().map(function(t) { return t.toLowerCase(); });
  if (!tag || existing.indexOf(tag.toLowerCase()) !== -1) return;
  var pill = document.createElement('span');
  pill.className = 'tag-pill-item';
  pill.dataset.tag = tag;
  pill.innerHTML = esc(tag) + '<button class="tag-pill-del" title="Fjern" tabindex="-1">✕</button>';
  pill.querySelector('.tag-pill-del').addEventListener('click', function(e) {
    e.stopPropagation();
    pill.remove();
    saveTagPills();
  });
  list.appendChild(pill);
}

function saveTagPills() {
  var id = activeSakId; if (!id) return;
  var tags = getTagPillTags().join(', ');
  updateCaseField(id, { tags: tags || '' });
}

function renderTagPills(val) {
  var list = document.getElementById('sak-tags-pills');
  if (!list) return;
  list.innerHTML = '';
  (val || '').split(',').map(function(t) { return t.trim(); }).filter(Boolean).forEach(addTagPill);
}

document.getElementById('sak-tags').addEventListener('keydown', function(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    var val = this.value.trim().replace(/,+$/, '');
    if (val) { addTagPill(val); saveTagPills(); this.value = ''; }
  } else if (e.key === 'Backspace' && !this.value) {
    var pills = document.querySelectorAll('#sak-tags-pills .tag-pill-item');
    if (pills.length) { pills[pills.length - 1].remove(); saveTagPills(); }
  }
});

document.getElementById('sak-tags').addEventListener('blur', function() {
  var val = this.value.trim().replace(/,+$/, '');
  if (val) { addTagPill(val); saveTagPills(); this.value = ''; }
});

document.getElementById('sak-tags-editor').addEventListener('click', function() {
  document.getElementById('sak-tags').focus();
});

// ── Stikkord: autofullfør med pill-støtte ──────────
(function() {
  var inp = document.getElementById('sak-tags');
  if (!inp) return;
  var wrap = document.getElementById('sak-tags-wrap');
  var suggBox = document.createElement('div');
  suggBox.className = 'tag-suggestions';
  suggBox.style.display = 'none';
  wrap.appendChild(suggBox);
  var activeIdx = -1;

  function hideSugg() { suggBox.style.display = 'none'; suggBox.innerHTML = ''; activeIdx = -1; }
  function showSugg() {
    var term = inp.value.trim().toLowerCase();
    if (!term) { hideSugg(); return; }
    var existing = getTagPillTags().map(function(t) { return t.toLowerCase(); });
    var matches = getAllTags().filter(function(t) {
      return t.indexOf(term) !== -1 && existing.indexOf(t.toLowerCase()) === -1;
    }).slice(0, 8);
    if (!matches.length) { hideSugg(); return; }
    suggBox.innerHTML = matches.map(function(t) {
      return '<div class="tag-suggestion-item">' + highlightMatch(t, term) + '</div>';
    }).join('');
    suggBox.style.display = 'block'; activeIdx = -1;
  }
  function selectSugg(val) {
    addTagPill(val); saveTagPills(); inp.value = ''; hideSugg(); inp.focus();
  }

  inp.addEventListener('input', showSugg);
  inp.addEventListener('keydown', function(e) {
    var items = suggBox.querySelectorAll('.tag-suggestion-item');
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, items.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); }
    else if (e.key === 'Enter' && activeIdx >= 0) { e.preventDefault(); e.stopPropagation(); selectSugg(items[activeIdx].textContent); return; }
    else if (e.key === 'Escape') { hideSugg(); return; }
    items.forEach(function(el, i) { el.classList.toggle('active', i === activeIdx); });
  });
  suggBox.addEventListener('mousedown', function(e) {
    var item = e.target.closest('.tag-suggestion-item');
    if (item) { e.preventDefault(); selectSugg(item.textContent); }
  });
  document.addEventListener('click', function(e) { if (!wrap.contains(e.target)) hideSugg(); });
})();

// Statusmenyen i sakshodet
function setSakStatusMenu(open) {
  var menu = document.getElementById('sak-status-menu');
  var chip = document.getElementById('sak-status-chip');
  if (!menu || !chip) return;
  menu.hidden = !open;
  chip.setAttribute('aria-expanded', open ? 'true' : 'false');
}
document.getElementById('sak-status-chip').addEventListener('click', function() {
  var menu = document.getElementById('sak-status-menu');
  setSakStatusMenu(menu.hidden);
  if (!menu.hidden) {
    var cur = menu.querySelector('.sak-status-btn[class*="active-"]') || menu.querySelector('.sak-status-btn');
    if (cur) cur.focus();
  }
});
document.addEventListener('click', function(e) {
  var wrap = document.getElementById('sak-status-wrap');
  if (wrap && !wrap.contains(e.target)) setSakStatusMenu(false);
});
document.getElementById('sak-status-wrap').addEventListener('keydown', function(e) {
  if (e.key === 'Escape') { setSakStatusMenu(false); document.getElementById('sak-status-chip').focus(); }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    var items = Array.prototype.slice.call(document.querySelectorAll('#sak-status-btns .sak-status-btn'));
    var i = items.indexOf(document.activeElement);
    if (i === -1) return;
    e.preventDefault();
    items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
  }
});

document.getElementById('sak-status-btns').addEventListener('click', function(e) {
  var btn = e.target.closest('.sak-status-btn'); if (!btn) return;
  setSakStatusMenu(false);
  var id  = activeSakId; if (!id) return;
  var theCase = cases.find(function(c) { return c.id === id; });
  if (!theCase) return;
  // Et nytt trykk på «Avsluttet» på en avsluttet sak endrer utfallet.
  if (theCase.status === 'avsluttet' && btn.dataset.status === 'avsluttet' && theCase.type !== 'oppdrag') {
    editOutcome(id);
    return;
  }
  if (theCase.status === btn.dataset.status) return;
  // Samme flyt som fra sakslista — inkludert fristdialogen. Å trykke på en
  // statusknapp er i seg selv en bekreftelse, så bekreftelsesmodalen hoppes
  // over; stikkord og frist spørres det fortsatt om.
  runStatusTransition(id, btn.dataset.status, { skipConfirm: true });
});

document.getElementById('sak-num-claims').addEventListener('change', function() {
  var id = activeSakId; if (!id) return;
  var cas = cases.find(function(c) { return c.id === id; });
  if (!cas || cas.type === 'oppdrag') return;
  var count = Math.max(0, parseInt(this.value, 10) || 0);
  var data = loadSakData(id) || defaultSakData(0);
  var sum = claimsRemovalSummary(data.claims || [], count);
  // Krav uten innhold fjernes uten å spørre; ellers bekreftes det først.
  if (!sum.hasData) { dispatch('SAK_CLAIM_COUNT_CHANGE', { id: id, count: count }); return; }
  openClaimsReduceConfirm(id, data.numClaims || 0, count, sum);
});

// ── Færre krav: bekreftelse ───────────────────────
// Hva som går tapt når kravene over newCount fjernes. assessed = krav med
// nyhet, oppfinnelseshøyde eller formelle feil satt; docClaims/docIds = krav
// med motholdsvalg og hvilke mothold. hasData er false når ingenting går tapt.
// Ren funksjon — se test/newFeatures.test.js.
function claimsRemovalSummary(claims, newCount) {
  var list = claims || [];
  var removed = list.filter(function(c) { return c && c.num > newCount; });
  var to = list.reduce(function(m, c) { return Math.max(m, c ? c.num : 0); }, 0);
  var nums = function(f) { return removed.filter(f).map(function(c) { return c.num; }); };
  var docIds = [];
  removed.forEach(function(c) {
    [c.noveltyDoc].concat(c.inventiveDocs || []).forEach(function(d) {
      if (d && docIds.indexOf(d) === -1) docIds.push(d);
    });
  });
  docIds.sort(function(a, b) { return parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10); });
  var out = {
    from: newCount + 1, to: to,
    assessed:  nums(function(c) { return c.novelty !== null || c.inventive !== null || c.formal !== null; }),
    notes:     nums(function(c) { return !!String(c.notes || '').trim(); }),
    labels:    nums(function(c) { return !!String(c.label || '').trim(); }),
    docClaims: nums(function(c) { return !!c.noveltyDoc || (c.inventiveDocs || []).length > 0; }),
    docIds:    docIds
  };
  out.hasData = !!(out.assessed.length || out.notes.length || out.labels.length || out.docClaims.length);
  return out;
}

// Linjene i bekreftelsen, én per slags innhold. Ren funksjon — se
// test/newFeatures.test.js.
function claimsRemovalLines(sum) {
  var lines = [];
  if (sum.assessed.length)  lines.push('Vurdering på krav ' + formatClaimRanges(sum.assessed));
  if (sum.docClaims.length) lines.push('Motholdsvalg (' + sum.docIds.join(', ') + ') på krav ' + formatClaimRanges(sum.docClaims));
  if (sum.notes.length)     lines.push('Notater på krav ' + formatClaimRanges(sum.notes));
  if (sum.labels.length)    lines.push('Etikett' + (sum.labels.length > 1 ? 'er' : '') + ' på krav ' + formatClaimRanges(sum.labels));
  return lines;
}

var _claimsReduce = null; // { id, from, to, count } mens bekreftelsen er åpen

function _claimsRangeText(from, to) { return from === to ? String(from) : from + '–' + to; }

function openClaimsReduceConfirm(id, oldCount, newCount, sum) {
  _claimsReduce = { id: id, oldCount: oldCount, count: newCount, range: _claimsRangeText(sum.from, sum.to) };
  document.getElementById('claims-reduce-title').textContent = 'Fjerne krav ' + _claimsReduce.range + '?';
  document.getElementById('claims-reduce-intro').textContent =
    'Du endrer antall krav fra ' + oldCount + ' til ' + newCount + '. Dette forsvinner fra kravene som fjernes:';
  document.getElementById('claims-reduce-list').innerHTML = claimsRemovalLines(sum).map(function(l) {
    return '<li>' + esc(l) + '</li>';
  }).join('');
  document.getElementById('btn-claims-reduce-keep').textContent = 'Behold ' + oldCount + ' krav';
  document.getElementById('btn-claims-reduce-confirm').textContent = 'Fjern krav ' + _claimsReduce.range;
  openBackdrop('claims-reduce-backdrop');
}

function closeClaimsReduce(confirmed) {
  var p = _claimsReduce;
  _claimsReduce = null;
  closeBackdrop('claims-reduce-backdrop');
  if (!p) return;
  if (!confirmed) {
    var inp = document.getElementById('sak-num-claims');
    if (inp && activeSakId === p.id) inp.value = p.oldCount || '';
    return;
  }
  dispatch('SAK_CLAIM_COUNT_CHANGE', { id: p.id, count: p.count, undoable: true, toast: 'Krav ' + p.range + ' fjernet' });
}

document.getElementById('btn-claims-reduce-keep').addEventListener('click', function() { closeClaimsReduce(false); });
document.getElementById('btn-claims-reduce-confirm').addEventListener('click', function() { closeClaimsReduce(true); });
document.getElementById('claims-reduce-backdrop').addEventListener('click', function(e) { if (e.target === this) closeClaimsReduce(false); });

document.getElementById('view-sak').addEventListener('change', function(e) {
  var cb = e.target.closest('.sak-checkbox'); if (!cb) return;
  var id = activeSakId; if (!id) return;
  var label = cb.closest('.sak-check-row');
  if (label) label.classList.toggle('sak-check-done', cb.checked);
  dispatch('CHECKLIST_TOGGLE', { id: id, itemId: cb.dataset.itemId, checked: cb.checked });
});

// CPC-klasser: legg til (via Enter i inputfeltet)
document.getElementById('sak-class-assumed-input').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    var box = document.getElementById('cpc-suggestions');
    if (box.style.display !== 'none' && box.querySelector('.cpc-suggestion.active')) return;
    var codeInp = document.getElementById('sak-class-assumed-input');
    var code = codeInp.value.trim().toUpperCase(); if (!code) return;
    var id = activeSakId; if (!id) return;
    codeInp.value = '';
    dispatch('CPC_ADD', { id: id, code: code });
  }
});
// CPC-klasser: hierarki-tooltip.
// Med mus kommer den etter en liten forsinkelse, så den ikke blinker mens man
// beveger seg over lista. Med tastatur kommer den med én gang — der er
// fokuseringen allerede en bevisst handling. Raden har fokuserbare barn
// (avkryssingsboksen og fjern-knappen), så tabbing inn i raden holder; ingen
// nye tabbstopp er lagt til.
var _tooltipTimer = null;
var _cpcOpenTip   = null;

function showCpcTooltip(row, delay) {
  var tip = row && row.querySelector('.sak-class-tooltip');
  clearTimeout(_tooltipTimer);
  if (!tip) return;
  if (delay) {
    _tooltipTimer = setTimeout(function() { tip.style.display = 'block'; _cpcOpenTip = tip; }, delay);
  } else {
    tip.style.display = 'block';
    _cpcOpenTip = tip;
  }
}

function hideCpcTooltip(row) {
  clearTimeout(_tooltipTimer);
  var tip = row ? row.querySelector('.sak-class-tooltip') : _cpcOpenTip;
  if (tip) tip.style.display = 'none';
  if (tip === _cpcOpenTip) _cpcOpenTip = null;
}

(function() {
  var list = document.getElementById('sak-classes-list');
  list.addEventListener('mouseover', function(e) {
    var row = e.target.closest('.sak-class-row');
    if (row) showCpcTooltip(row, 600);
  });
  list.addEventListener('mouseout', function(e) {
    var row = e.target.closest('.sak-class-row');
    if (row) hideCpcTooltip(row);
  });
  list.addEventListener('focusin', function(e) {
    var row = e.target.closest('.sak-class-row');
    if (row) showCpcTooltip(row, 0);
  });
  list.addEventListener('focusout', function(e) {
    var row = e.target.closest('.sak-class-row');
    // Flyttes fokus innad i raden, skal tooltipen bli stående.
    if (row && !row.contains(e.relatedTarget)) hideCpcTooltip(row);
  });
})();

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && _cpcOpenTip) hideCpcTooltip(null);
});

// Tomtilstandene fører rett til handlingen de beskriver
document.getElementById('sak-classes-list').addEventListener('click', function(e) {
  if (!e.target.closest('#btn-cpc-empty-add')) return;
  var inp = document.getElementById('sak-class-assumed-input');
  if (inp) inp.focus();
});
document.getElementById('sak-docs-mothold').addEventListener('click', function(e) {
  if (!e.target.closest('#btn-mh-empty-add')) return;
  if (activeSakId) dispatch('DOC_ADD', { id: activeSakId });
});

// CPC-klasser: slett og toggle inUse (delegert)
document.getElementById('sak-classes-list').addEventListener('click', function(e) {
  var btn = e.target.closest('.btn-sak-class-del'); if (!btn) return;
  var id  = activeSakId; if (!id) return;
  dispatch('CPC_REMOVE', { id: id, idx: parseInt(btn.dataset.idx, 10) });
});
document.getElementById('sak-classes-list').addEventListener('change', function(e) {
  var cb = e.target.closest('.sak-class-inuse-cb'); if (!cb) return;
  var id = activeSakId; if (!id) return;
  dispatch('CPC_INUSE_TOGGLE', { id: id, idx: parseInt(cb.dataset.idx, 10), checked: cb.checked });
});

// CPC-klasser: kopier grovklasser (4 tegn)
document.getElementById('btn-copy-classes-rough').addEventListener('click', function() {
  var id = activeSakId; if (!id) return;
  var data = loadSakData(id) || defaultSakData(0);
  var arr = data.classes || [];
  if (!arr.length) { showToast('Ingen klasser å kopiere.'); return; }
  var seen = {};
  var parts = arr.reduce(function(acc, cls) {
    var code = (cls.code || '').replace(/\s+/g, '');
    var rough = code.slice(0, 4);
    if (rough && !seen[rough]) { seen[rough] = true; acc.push(rough); }
    return acc;
  }, []);
  if (!parts.length) { showToast('Ingen gyldige klasser.'); return; }
  var str = parts.join(', ');
  navigator.clipboard.writeText(str).then(function() {
    showToast('Grovklasser kopiert: ' + str);
  }).catch(function() { showToast('Kunne ikke kopiere til utklippstavle.'); });
});

// CPC-klasser: kopier til utklippstavle
document.getElementById('btn-copy-classes').addEventListener('click', function() {
  var id = activeSakId; if (!id) return;
  var data = loadSakData(id) || defaultSakData(0);
  var arr = data.classes || [];
  if (!arr.length) { showToast('Ingen klasser å kopiere.'); return; }
  // Fjern mellomrom, ta del foran '/', dedupliser, legg til '/low'
  var seen = {};
  var parts = arr.reduce(function(acc, cls) {
    var code = (cls.code || '').replace(/\s+/g, '');
    var base = code.split('/')[0];
    if (base && !seen[base]) { seen[base] = true; acc.push(base + '/low'); }
    return acc;
  }, []);
  if (!parts.length) { showToast('Ingen gyldige klasser.'); return; }
  var str = parts.join(', ');
  navigator.clipboard.writeText(str).then(function() {
    showToast('Klasser kopiert: ' + str);
  }).catch(function() {
    showToast('Kunne ikke kopiere til utklippstavle.');
  });
});

// ── EPO OPS: nøkler og oppslag ─────────────────────
var OPS_BASE = 'https://ops.epo.org/3.2';

function loadOpsCreds() {
  try { return { key: localStorage.getItem(OPS_KEY_KEY) || '', secret: localStorage.getItem(OPS_SECRET_KEY) || '' }; }
  catch(e) { return { key: '', secret: '' }; }
}
function saveOpsCreds(c) {
  lsSetSafe(OPS_KEY_KEY, c.key); lsSetSafe(OPS_SECRET_KEY, c.secret);
  _opsToken = null; // nye nøkler — det gamle tokenet hører til de forrige
}
function hasOpsCreds() { var c = loadOpsCreds(); return !!(c.key && c.secret); }

// Feil fra OPS-kallene bærer en kind som opsErrorMessage() kjenner.
function OpsError(kind) { this.kind = kind; }

// Tokenet varer ca. 20 minutter; det gjenbrukes til ett minutt før det går ut.
var _opsToken = null; // { value, expires }
function opsAccessToken(force) {
  if (!force && _opsToken && Date.now() < _opsToken.expires) return Promise.resolve(_opsToken.value);
  var c = loadOpsCreds();
  if (!c.key || !c.secret) return Promise.reject(new OpsError('nocreds'));
  return fetch(OPS_BASE + '/auth/accesstoken', {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + btoa(c.key + ':' + c.secret),
               'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  }).then(function(r) {
    if (r.status === 400 || r.status === 401) throw new OpsError('auth');
    if (r.status === 403) throw new OpsError('quota');
    if (!r.ok) throw new OpsError('http');
    return r.json();
  }).then(function(j) {
    var secs = parseInt(j.expires_in, 10) || 1200;
    _opsToken = { value: j.access_token, expires: Date.now() + (secs - 60) * 1000 };
    return _opsToken.value;
  });
}

// Henter { pubDate, effDate, kind } for en referanse. Ved 401 er tokenet
// gått ut på serversiden — da hentes et nytt én gang.
function opsFetchDates(ref) {
  var pn = opsPubNumber(ref);
  if (!pn) return Promise.reject(new OpsError('badref'));
  function get(retry) {
    return opsAccessToken(retry).then(function(token) {
      return fetch(OPS_BASE + '/rest-services/published-data/publication/epodoc/' +
                   encodeURIComponent(pn.epodoc) + '/biblio',
                   { headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' } });
    }).then(function(r) {
      if (r.status === 401 && !retry) return get(true);
      if (r.status === 404) throw new OpsError('notfound');
      if (r.status === 403) throw new OpsError('quota');
      if (!r.ok) throw new OpsError('http');
      return r.json().catch(function() { throw new OpsError('parse'); }).then(function(j) {
        var dates = parseOpsBiblio(j, pn.kind);
        if (!dates) throw new OpsError('parse');
        return dates;
      });
    });
  }
  return get(false).catch(function(e) {
    // fetch() kaster TypeError når nettet eller brannmuren stopper kallet
    throw e instanceof OpsError ? e : new OpsError('network');
  });
}

// ── Mothold ────────────────────────────────────────
var MH_PARTY_FIELDS = ['applicants', 'inventors'];

// Lista «også i N saker» lukkes ved klikk utenfor og med Esc.
document.addEventListener('click', function(e) {
  document.querySelectorAll('#sak-docs-mothold details.mh-cited[open]').forEach(function(d) {
    if (!d.contains(e.target)) d.removeAttribute('open');
  });
});
document.getElementById('sak-docs-mothold').addEventListener('keydown', function(e) {
  if (e.key !== 'Escape') return;
  var open = e.target.closest && e.target.closest('details.mh-cited[open]');
  if (!open) return;
  e.stopPropagation();
  open.removeAttribute('open');
  var sum = open.querySelector('summary'); if (sum) sum.focus();
});

document.getElementById('btn-mothold-add').addEventListener('click', function() {
  var id = activeSakId; if (!id) return;
  dispatch('DOC_ADD', { id: id });
});

document.getElementById('sak-docs-mothold').addEventListener('click', function(e) {
  var id = activeSakId; if (!id) return;
  var del = e.target.closest('[data-mh-del]');
  if (del) { dispatch('DOC_REMOVE', { id: id, idx: parseInt(del.dataset.mhDel, 10) }); return; }
  var restore = e.target.closest('[data-mh-restore]');
  if (restore) { dispatch('DOC_RESTORE', { id: id, idx: parseInt(restore.dataset.mhRestore, 10) }); return; }
  var citedOpen = e.target.closest('[data-cited-open]');
  if (citedOpen) { navigateTo('sak/' + citedOpen.dataset.citedOpen); return; }
  var ops = e.target.closest('.mh-ops');
  if (ops) { mhOpsFetch(id, parseInt(ops.dataset.ops, 10), ops); return; }
  var flag = e.target.closest('.mh-flag');
  if (flag) {
    dispatch('DOC_FIELD_CHANGE', { id: id, idx: parseInt(flag.dataset.idx, 10),
      field: flag.dataset.flag, value: flag.getAttribute('aria-pressed') !== 'true' });
    return;
  }
  var bg = e.target.closest('.mh-bg-toggle');
  if (bg) {
    dispatch('DOC_FIELD_CHANGE', { id: id, idx: parseInt(bg.dataset.bg, 10),
      field: 'background', value: bg.getAttribute('aria-pressed') !== 'true' });
  }
});

// Henter datoene for mothold idx og fyller de tomme feltene. Referansen tas
// fra feltet slik det står nå, og lagres først så oppslaget og saken er enige.
function mhOpsFetch(id, idx, btn) {
  if (btn.getAttribute('aria-disabled') === 'true' || btn.getAttribute('aria-busy') === 'true') return;
  var inp = btn.parentNode.querySelector('.mh-ref-inp');
  var ref = inp ? inp.value.trim() : '';
  clearTimeout(_sakTypingTimer);
  dispatch('DOC_FIELD_CHANGE', { id: id, idx: idx, field: 'ref', value: ref });
  btn.setAttribute('aria-busy', 'true');
  opsFetchDates(ref).then(function(dates) {
    var data = loadSakData(id) || defaultSakData(0);
    ensureSakDocs(data);
    var doc = data.docs[idx];
    // Motholdet kan ha blitt fjernet eller endret mens vi ventet
    if (!doc || doc.ref !== sanitizeText(ref)) { showToast('Motholdet er endret — oppslaget ble forkastet.'); return; }
    var plan = opsFillPlan(doc, dates);
    Object.keys(plan.patch).forEach(function(f) {
      dispatch('DOC_FIELD_CHANGE', { id: id, idx: idx, field: f, value: plan.patch[f] });
    });
    if (activeSakId === id) renderSakDocs(loadSakData(id));
    showToast(opsFillMessage(plan, dates));
  }).catch(function(err) {
    showToast(opsErrorMessage(err && err.kind));
  }).then(function() {
    // Knappen kan være tegnet på nytt; finn den igjen før den låses opp
    var b = document.querySelector('#sak-docs-mothold .mh-ops[data-ops="' + idx + '"]');
    if (b) b.removeAttribute('aria-busy');
  });
}

document.getElementById('sak-docs-mothold').addEventListener('input', function(e) {
  var id = activeSakId; if (!id) return;
  var partyInp = e.target.closest('.mh-party-inp');
  if (partyInp && MH_PARTY_FIELDS.indexOf(partyInp.dataset.field) > -1) {
    partyInp.title = partyInp.value;
    var pIdx = parseInt(partyInp.dataset.idx, 10), pField = partyInp.dataset.field, pVal = partyInp.value;
    debounceSakEdit(function() {
      dispatch('DOC_FIELD_CHANGE', { id: id, idx: pIdx, field: pField, value: pVal });
    });
    return;
  }
  var titleInp = e.target.closest('.mh-title-inp');
  if (titleInp) {
    titleInp.title = titleInp.value; // hele tittelen ved hover når den er kuttet
    var tIdx = parseInt(titleInp.dataset.idx, 10), tVal = titleInp.value;
    debounceSakEdit(function() {
      dispatch('DOC_FIELD_CHANGE', { id: id, idx: tIdx, field: 'title', value: tVal.trim() });
    });
    return;
  }
  var inp = e.target.closest('.mh-ref-inp'); if (!inp) return;
  syncMhExtLink(inp);
  var idx = parseInt(inp.dataset.idx, 10), val = inp.value;
  debounceSakEdit(function() {
    dispatch('DOC_FIELD_CHANGE', { id: id, idx: idx, field: 'ref', value: val.trim() });
  });
});
document.getElementById('sak-docs-mothold').addEventListener('change', function(e) {
  var id = activeSakId; if (!id) return;
  var dateInp = e.target.closest('.mh-date-inp');
  if (dateInp) {
    // Ugyldig dato lagres ikke; feltet markeres til den rettes
    var iso = filingDateFromInput(dateInp.value);
    if (iso === null) { dateInp.setAttribute('aria-invalid', 'true'); return; }
    dateInp.removeAttribute('aria-invalid');
    dispatch('DOC_FIELD_CHANGE', { id: id, idx: parseInt(dateInp.dataset.idx, 10),
      field: dateInp.dataset.field, value: iso });
    return;
  }
  var partyInp = e.target.closest('.mh-party-inp');
  if (partyInp && MH_PARTY_FIELDS.indexOf(partyInp.dataset.field) > -1) {
    clearTimeout(_sakTypingTimer);
    dispatch('DOC_FIELD_CHANGE', { id: id, idx: parseInt(partyInp.dataset.idx, 10),
      field: partyInp.dataset.field, value: partyInp.value });
    return;
  }
  var titleInp = e.target.closest('.mh-title-inp');
  if (titleInp) {
    clearTimeout(_sakTypingTimer);
    dispatch('DOC_FIELD_CHANGE', { id: id, idx: parseInt(titleInp.dataset.idx, 10),
      field: 'title', value: titleInp.value.trim() });
    return;
  }
  var inp = e.target.closest('.mh-ref-inp'); if (!inp) return;
  clearTimeout(_sakTypingTimer);
  dispatch('DOC_FIELD_CHANGE', { id: id, idx: parseInt(inp.dataset.idx, 10),
    field: 'ref', value: inp.value.trim() });
});

// Granskingsrapport: kopier til utklippstavle
document.getElementById('btn-copy-search-report').addEventListener('click', function() {
  var id = activeSakId; if (!id) return;
  var data = loadSakData(id) || defaultSakData(0);
  ensureSakDocs(data);
  if (!(data.docs || []).length) { showToast('Ingen mothold å rapportere.'); return; }
  navigator.clipboard.writeText(formatSearchReport(data.claims || [], data.docs)).then(function() {
    showToast('✓ Granskingsrapport kopiert');
  }).catch(function() { showToast('Kunne ikke kopiere til utklippstavle.'); });
});

// Kravsvurdering: mothold-velger
document.getElementById('sak-claims-tbody').addEventListener('click', function(e) {
  var id = activeSakId; if (!id) return;
  var pick = e.target.closest('[data-doc-pick]');
  if (pick && !pick.disabled) {
    dispatch('CLAIM_DOC_TOGGLE', { id: id, claimNum: parseInt(pick.dataset.claim, 10),
      field: pick.dataset.field, docId: pick.dataset.docPick });
    return;
  }
  var chip = e.target.closest('[data-doc-pop]');
  if (chip) {
    var num = parseInt(chip.dataset.docPop, 10), field = chip.dataset.field;
    _sakOpenDocPop = (_sakOpenDocPop && _sakOpenDocPop.claimNum === num && _sakOpenDocPop.field === field)
      ? null : { claimNum: num, field: field };
    renderSakClaimsTable(loadSakData(id) || defaultSakData(0));
  }
});

// Klikk utenfor eller Escape lukker mothold-velgeren
document.addEventListener('click', function(e) {
  if (!_sakOpenDocPop) return;
  if (e.target.closest('.claim-doc-wrap')) return;
  _sakOpenDocPop = null;
  var id = activeSakId; if (!id) return;
  renderSakClaimsTable(loadSakData(id) || defaultSakData(0));
});

document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape' || !_sakOpenDocPop) return;
  _sakOpenDocPop = null;
  var id = activeSakId; if (!id) return;
  renderSakClaimsTable(loadSakData(id) || defaultSakData(0));
});

// Velgeren er plassert i viewporten, så den må følge chipen når noe ruller
// eller vinduet endrer størrelse.
window.addEventListener('scroll', function() { if (_sakOpenDocPop) positionDocPop(); }, true);
window.addEventListener('resize', function() { if (_sakOpenDocPop) positionDocPop(); });

// ── Rundeskuff: hendelser ──────────────────────────
document.getElementById('sak-page-round').addEventListener('click', function(e) {
  if (e.target.closest('.btn-round')) {
    if (_roundDrawer.open) closeRoundDrawer(); else openRoundDrawer(activeSakId);
    return;
  }
  if (e.target.closest('.rd-link') && activeSakId) dispatch('ROUND_BACKFILL', { id: activeSakId });
});
document.getElementById('round-drawer').addEventListener('click', function(e) {
  var tab = e.target.closest('.rd-tab');
  if (tab) { _roundDrawer.n = parseInt(tab.dataset.round, 10); renderRoundDrawer(); return; }
  if (e.target.closest('.rd-pin')) {
    _roundDrawer.pinned = !_roundDrawer.pinned && roundPinAllowed();
    renderRoundDrawer();
    var pinBtn = this.querySelector('.rd-pin');
    if (pinBtn) pinBtn.focus();
    return;
  }
  if (e.target.closest('.rd-close')) {
    closeRoundDrawer();
    var rb = document.querySelector('#sak-page-round .btn-round');
    if (rb) rb.focus();
  }
});
// Klikk utenfor lukker et overlegg (ikke en festet skuff). mousedown, så et
// klikk som tegner skuffen på nytt ikke regnes som «utenfor».
document.addEventListener('mousedown', function(e) {
  if (!_roundDrawer.open || _roundDrawer.pinned) return;
  if (e.target.closest('#round-drawer') || e.target.closest('#sak-page-round .btn-round')) return;
  // Å skjule/vise sidemenyen lukker ikke skuffen — festeregelen sjekkes på nytt
  if (e.target.closest('#drawer-toggle-btn')) return;
  closeRoundDrawer();
});
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Escape' || !_roundDrawer.open || _roundDrawer.pinned) return;
  // Esc i en åpen dialog lukker bare dialogen
  if (document.querySelector('.modal-backdrop.open')) return;
  closeRoundDrawer();
  var rb = document.querySelector('#sak-page-round .btn-round');
  if (rb) rb.focus();
});
window.addEventListener('resize', function() { if (_roundDrawer.open) renderRoundDrawer(); });

// Kravsvurdering: tri-toggle knapper
document.getElementById('sak-claims-tbody').addEventListener('click', function(e) {
  // § 13-knappen i kravkoblingen ser lik ut, men har ikke data-field
  var btn = e.target.closest('.sak-tri-btn[data-field]'); if (!btn) return;
  if (btn.disabled) return;
  var id = activeSakId; if (!id) return;
  dispatch('CLAIM_TOGGLE', {
    id: id,
    claimNum: parseInt(btn.dataset.claim, 10),
    field: btn.dataset.field
  });
});

// Kravsnote og motholdreferanse lagres mens du skriver, ikke først når du
// forlater feltet: navigerer du bort uten å blurre, fjernes elementet fra
// DOM-en og change rekker aldri å fyre. Begge dispatchene tegner ingenting, så
// det koster ikke noe å lagre ofte.
var SAK_TYPING_DEBOUNCE_MS = 400;
var _sakTypingTimer = null;

function debounceSakEdit(fn) {
  clearTimeout(_sakTypingTimer);
  _sakTypingTimer = setTimeout(fn, SAK_TYPING_DEBOUNCE_MS);
}

document.getElementById('sak-claims-tbody').addEventListener('input', function(e) {
  var inp = e.target.closest('.sak-claim-note'); if (!inp) return;
  var id  = activeSakId; if (!id) return;
  var num = parseInt(inp.dataset.claim, 10), val = inp.value;
  debounceSakEdit(function() {
    dispatch('CLAIM_NOTE_CHANGE', { id: id, claimNum: num, note: val.trim() });
  });
});
document.getElementById('sak-claims-tbody').addEventListener('change', function(e) {
  var inp = e.target.closest('.sak-claim-note'); if (!inp) return;
  var id  = activeSakId; if (!id) return;
  clearTimeout(_sakTypingTimer);
  dispatch('CLAIM_NOTE_CHANGE', { id: id, claimNum: parseInt(inp.dataset.claim, 10), note: inp.value.trim() });
});

// ── Kravtabellen: tastaturmarkør ──────────────────
// Markøren aktiveres ved å fokusere en ja/nei-knapp — altså ved å tabbe inn i
// tabellen eller klikke i den — og forlates med Escape. Så lenge den er aktiv
// eier kravtabellen tastene; ellers gjelder de globale snarveiene som før.
var _sakKeyField = 'novelty';

function sakClaimCursorActive() {
  if (activePage !== 'sak' || _sakActiveClaimNum === null) return false;
  // Et uthevet krav er ikke nok: så lenge fokus står utenfor tabellen skal
  // 1–5 og ? bety det de betyr ellers i appen. Dette er også det
  // snarveismodalen lover — «tabb inn i den eller klikk en ja/nei-knapp».
  var tbody = document.getElementById('sak-claims-tbody');
  var el    = document.activeElement;
  if (!tbody || !el || !tbody.contains(el)) return false;
  // Etikettvisningen svarer selv på Enter og mellomrom. Står fokus der, skal
  // ikke markøren i tillegg slå om en verdi på raden den tilfeldigvis står på.
  return !(el.closest && el.closest('.sak-tag-display'));
}

function paintClaimCursor() {
  var tbody = document.getElementById('sak-claims-tbody');
  if (!tbody) return;
  tbody.querySelectorAll('.sak-claim-active-cell').forEach(function(td) {
    td.classList.remove('sak-claim-active-cell');
  });
  tbody.querySelectorAll('tr').forEach(function(tr) {
    tr.classList.toggle('sak-claim-active-row', +tr.dataset.claim === _sakActiveClaimNum);
  });
  if (_sakActiveClaimNum === null) return;
  var btn = tbody.querySelector('[data-claim="' + claimSelVal(_sakActiveClaimNum) + '"][data-field="' + _sakKeyField + '"]');
  var td  = btn && btn.closest('td');
  if (td) td.classList.add('sak-claim-active-cell');
}

function moveClaimCursor(delta, data) {
  var n = data.numClaims || 0;
  if (!n) return;
  var next = (_sakActiveClaimNum || 0) + delta;
  _sakActiveClaimNum = Math.min(n, Math.max(1, next));
  var btn = document.querySelector('#sak-claims-tbody [data-claim="' + claimSelVal(_sakActiveClaimNum) + '"][data-field="' + _sakKeyField + '"]');
  if (btn && !btn.disabled) btn.focus();
  paintClaimCursor();
  renderSakClaimsTree(data, _sakActiveClaimNum);
}

document.getElementById('sak-claims-tbody').addEventListener('focusin', function(e) {
  var btn = e.target.closest('.sak-tri-btn[data-claim][data-field]');
  if (!btn) return;
  _sakActiveClaimNum = parseInt(btn.dataset.claim, 10);
  _sakKeyField       = btn.dataset.field;
  paintClaimCursor();
});

document.addEventListener('keydown', function(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (_isTypingTarget(e.target)) return;
  if (_anyBackdropOpen()) return;
  if (!sakClaimCursorActive()) return;

  var action = claimKeyAction(e.key);
  if (!action) return;
  var id = activeSakId; if (!id) return;
  var data = loadSakData(id) || defaultSakData(0);
  if (!data.numClaims) return;
  e.preventDefault();

  if (action.type === 'move')  { moveClaimCursor(action.delta, data); return; }
  if (action.type === 'exit')  {
    _sakActiveClaimNum = null;
    paintClaimCursor();
    renderSakClaimsTree(data, null);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    return;
  }
  if (action.type === 'field') {
    _sakKeyField = action.field;
    var b = document.querySelector('#sak-claims-tbody [data-claim="' + claimSelVal(_sakActiveClaimNum) + '"][data-field="' + _sakKeyField + '"]');
    if (b && !b.disabled) b.focus();
    paintClaimCursor();
    return;
  }
  if (action.type === 'toggle') {
    dispatch('CLAIM_TOGGLE', { id: id, claimNum: _sakActiveClaimNum, field: _sakKeyField });
  } else if (action.type === 'set') {
    dispatch('CLAIM_SET', { id: id, claimNum: _sakActiveClaimNum, field: _sakKeyField, value: action.value });
  }
  paintClaimCursor();
});

// ── Kravtre: klikk på node ─────────────────────────
var _sakEditingLabelNum = null;

document.getElementById('sak-claims-tree').addEventListener('click', function(e) {
  var header = e.target.closest('[data-kt-toggle]');
  var node   = !header && e.target.closest('[data-kt-num]');
  if (!header && !node) return;
  var id = activeSakId; if (!id) return;
  var data = loadSakData(id) || defaultSakData(0);
  if (header) {
    var rootNum = parseInt(header.dataset.ktToggle, 10);
    var children = data.claims.filter(function(c) { return c.dep === rootNum; });
    if (children.length) {
      _ktCollapsed[rootNum] = !_ktCollapsed[rootNum];
    }
    _sakActiveClaimNum = rootNum;
  } else {
    _sakActiveClaimNum = parseInt(node.dataset.ktNum, 10);
  }
  renderSakClaimsTable(data);
});

// ── Etikett: klikk for redigering ─────────────────
document.getElementById('sak-claims-tbody').addEventListener('click', function(e) {
  var span = e.target.closest('.sak-tag-display'); if (!span) return;
  _sakEditingLabelNum = parseInt(span.dataset.claimLabel, 10);
  var id = activeSakId; if (!id) return;
  var data = loadSakData(id) || defaultSakData(0);
  renderSakClaimsTable(data);
  setTimeout(function() { var inp = document.querySelector('.sak-tag-input'); if (inp) inp.focus(); }, 0);
});

document.getElementById('sak-claims-tbody').addEventListener('blur', function(e) {
  var inp = e.target.closest('.sak-tag-input'); if (!inp) return;
  var id = activeSakId; if (!id) return;
  _sakEditingLabelNum = null;
  dispatch('CLAIM_LABEL_CHANGE', {
    id: id, claimNum: parseInt(inp.dataset.claim, 10), label: inp.value.trim()
  });
}, true);

document.getElementById('sak-claims-tbody').addEventListener('keydown', function(e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  var span = e.target.closest('.sak-tag-display'); if (!span) return;
  e.preventDefault();
  span.click();
});

document.getElementById('sak-claims-tbody').addEventListener('keydown', function(e) {
  if (e.key !== 'Enter') return;
  var inp = e.target.closest('.sak-tag-input'); if (!inp) return;
  inp.blur();
});

// ── Avhengig av: change ────────────────────────────
document.getElementById('sak-claims-tbody').addEventListener('change', function(e) {
  var inp = e.target.closest('.sak-dep-inp'); if (!inp) return;
  var id = activeSakId; if (!id) return;
  var claimNum = parseInt(inp.dataset.claimDep, 10);
  var val = inp.value.trim() === '' ? null : parseInt(inp.value, 10);
  if (!isValidDep(claimNum, val)) {
    // Ugyldig verdi: sett feltet tilbake til det som faktisk er lagret.
    var data = loadSakData(id) || defaultSakData(0);
    var claim = data.claims.find(function(c) { return c.num === claimNum; });
    inp.value = (claim && claim.dep) || '';
    return;
  }
  dispatch('CLAIM_DEP_CHANGE', { id: id, claimNum: claimNum, dep: val });
});

// ── Kravkobling: opphav, endret/uendret, § 13 ─────
// Koblingen slik den gjelder nå for krav num i den åpne saken: { data, round, claim, m }
function kmContext(num) {
  var id = activeSakId; if (!id) return null;
  var data = loadSakData(id);
  var c = cases.find(function(x) { return x.id === id; });
  if (!data || !c || !Array.isArray(data.claims)) return null;
  var round = mappingRound(c, roundsOf(data));
  var claim = data.claims.find(function(x) { return x && x.num === num; });
  if (!round || !claim) return null;
  return { id: id, data: data, round: round, claim: claim, m: claimMapping(claim, round) };
}

// Neste kobling med ett felt endret; uten gjeldende kobling starter den tom.
function kmNextMapping(ctx, patch) {
  var m = ctx.m || { round: ctx.round.n, origin: [], change: null, p13: null, basis: '' };
  return Object.assign({ round: ctx.round.n, origin: m.origin, change: m.change, p13: m.p13, basis: m.basis }, patch);
}

function kmOriginText(m) {
  if (!m) return '';
  return m.origin.length ? m.origin.join('+') : 'ny';
}

// Lukker opphavsfeltet uten å lagre og viser koblingen slik den var.
function kmCancelOrigin(inp) {
  if (inp.dataset.done) return;
  inp.dataset.done = '1';
  _kmEditingOrigin = null;
  var num = parseInt(inp.dataset.claimOriginInp, 10);
  var data = activeSakId && loadSakData(activeSakId);
  if (data && inp.isConnected) renderClaimRows(data, [num]);
}

// onBlur: et ugyldig opphav lukker feltet uten å lagre i stedet for å vise feil.
function kmCommitOrigin(inp, onBlur) {
  if (inp.dataset.done) return;
  var num = parseInt(inp.dataset.claimOriginInp, 10);
  var ctx = kmContext(num);
  if (!ctx) { _kmEditingOrigin = null; return; }
  var res = parseOrigin(inp.value, ctx.round.claims.length, ctx.round.n);
  if (res && res.error && onBlur) { kmCancelOrigin(inp); return; }
  if (res && res.error) {
    // Feilen vises ved feltet; ingenting lagres, og feltet beholder fokus
    _kmEditingOrigin = { num: num, value: inp.value, error: res.error };
    inp.classList.add('km-inp-err');
    inp.setAttribute('aria-invalid', 'true');
    var errEl = inp.parentNode.querySelector('.km-err');
    if (!errEl) {
      errEl = document.createElement('span');
      errEl.className = 'km-err';
      errEl.setAttribute('role', 'alert');
      inp.parentNode.insertBefore(errEl, inp.nextSibling);
    }
    errEl.textContent = res.error;
    return;
  }
  inp.dataset.done = '1';
  _kmEditingOrigin = null;
  dispatch('CLAIM_MAPPING_CHANGE', { id: ctx.id, claimNum: num,
    mapping: res === null ? null : kmNextMapping(ctx, { origin: res }) });
  if (inp.isConnected) renderClaimRows(loadSakData(ctx.id) || ctx.data, [num]);
}

document.getElementById('sak-claims-tbody').addEventListener('click', function(e) {
  var originBtn = e.target.closest('[data-claim-origin]');
  if (originBtn) {
    var num = parseInt(originBtn.dataset.claimOrigin, 10);
    var ctx = kmContext(num); if (!ctx) return;
    // Et annet krav sitt åpne felt (og feilen der) lukkes uten å lagre
    var stale = _kmEditingOrigin && _kmEditingOrigin.num !== num ? [_kmEditingOrigin.num] : [];
    _kmEditingOrigin = { num: num, value: kmOriginText(ctx.m), error: null };
    renderClaimRows(ctx.data, stale.concat([num]));
    var inp = document.querySelector('#sak-claims-tbody [data-claim-origin-inp="' + claimSelVal(num) + '"]');
    if (inp) { inp.focus(); inp.select(); }
    return;
  }
  var seg = e.target.closest('[data-claim-change]');
  if (seg) {
    var sctx = kmContext(parseInt(seg.dataset.claimChange, 10));
    if (!sctx || !sctx.m || sctx.m.change === seg.dataset.change) return;
    var segChange = seg.dataset.change;
    dispatch('CLAIM_MAPPING_CHANGE', { id: sctx.id, claimNum: sctx.claim.num,
      mapping: kmNextMapping(sctx, { change: segChange }) });
    // Tabellen er tegnet på nytt; fokus tilbake til samme knapp
    var segAgain = document.querySelector('#sak-claims-tbody [data-claim-change="' + claimSelVal(sctx.claim.num) + '"][data-change="' + segChange + '"]');
    if (segAgain) segAgain.focus();
    return;
  }
  var p13 = e.target.closest('[data-claim-p13]');
  if (p13) {
    var pctx = kmContext(parseInt(p13.dataset.claimP13, 10));
    if (!pctx || !pctx.m) return;
    var nextP13 = pctx.m.p13 === null ? true : pctx.m.p13 === true ? false : null;
    dispatch('CLAIM_MAPPING_CHANGE', { id: pctx.id, claimNum: pctx.claim.num,
      mapping: kmNextMapping(pctx, { p13: nextP13 }) });
    var again = document.querySelector('#sak-claims-tbody [data-claim-p13="' + claimSelVal(pctx.claim.num) + '"]');
    if (again) again.focus();
  }
});

document.getElementById('sak-claims-tbody').addEventListener('keydown', function(e) {
  var inp = e.target.closest('.km-origin-inp'); if (!inp) return;
  if (e.key === 'Enter') { e.preventDefault(); kmCommitOrigin(inp); return; }
  if (e.key === 'Escape') {
    e.preventDefault(); e.stopPropagation();
    kmCancelOrigin(inp);
  }
});

document.getElementById('sak-claims-tbody').addEventListener('blur', function(e) {
  var inp = e.target.closest && e.target.closest('.km-origin-inp'); if (!inp) return;
  kmCommitOrigin(inp, true);
}, true);

document.getElementById('sak-claims-tbody').addEventListener('change', function(e) {
  var inp = e.target.closest('.km-basis'); if (!inp) return;
  var ctx = kmContext(parseInt(inp.dataset.claimBasis, 10));
  if (!ctx || !ctx.m) return;
  var basis = sanitizeText(inp.value).trim().slice(0, CLAIM_MAPPING_BASIS_MAX);
  if (basis === ctx.m.basis) return;
  dispatch('CLAIM_MAPPING_CHANGE', { id: ctx.id, claimNum: ctx.claim.num,
    mapping: kmNextMapping(ctx, { basis: basis }), quiet: true });
});

// Saksnotater: auto-lagre ved input
document.getElementById('sak-notes').addEventListener('input', function() {
  var id = activeSakId; if (!id) return;
  dispatch('SAK_NOTES_CHANGE', { id: id, notes: this.value });
});

