// ── Dokumentpaneler: fanen «Dokumenter» ─────────────
// Tegner kravpanelet og 1–3 PDF-paneler på saksiden. Hvilke filer som havner
// hvor, avgjøres av de rene funksjonene docSlotAssign og docPaneUrl
// (test/docPanes.test.js); her er bare DOM og hendelser. Oppsettet (antall,
// kravpanelets side og bredde, plassregler, panelbredder) ligger i docLayout.
var _dpTab    = 'overview';        // 'overview' | 'docs'
var _dpCaseId = null;
var _dpManual = [null, null, null]; // filnavn valgt for hånd, per panel; gjelder bare denne saken (navn, ikke plass i listen, så slette/legge til filer ikke flytter valget)
var _dpBuilt  = false;
var _dpDrag   = null;

function _dpActiveCase() {
  return activeSakId && cases.find(function(c) { return c.id === activeSakId; }) || null;
}

// Saksiden ble tegnet. Bytter vi sak, starter vi på Oversikt med tomme filvalg.
function dpOnSakRendered(id) {
  var syncKey = _dpFolderKey(cases.find(function(c) { return c.id === id; }));
  if (syncKey && _folderSyncKey !== syncKey) { _folderSyncKey = syncKey; dpSyncFolder(id); }
  if (id !== _dpCaseId) {
    _dpCaseId = id;
    _dpManual = [null, null, null];
    _dpTab = 'overview';
    _dpResetFrames();
  }
  dpApplyTab();
  if (_dpTab === 'docs') renderDocPanes();
}

// Alt data er slettet: tilbake til start, så ingen PDF fra de slettede sakene
// blir stående lastet og innstillingsfeltene viser reglene som faktisk gjelder.
function dpReset() {
  _folderListing = {};
  _folderSyncKey = null;
  _dpCaseId = null;
  _dpManual = [null, null, null];
  _dpTab = 'overview';
  _dpResetFrames();
  dpApplyTab();
  _dpFillRuleInputs();
}

function _dpResetFrames() {
  [0, 1, 2].forEach(function(i) {
    var f = document.getElementById('dp-frame-' + i);
    if (f) {
      if (f._dpLoad) { f.removeEventListener('load', f._dpLoad); f._dpLoad = null; }
      f.removeAttribute('src'); f.hidden = true; f.dataset.url = '';
    }
  });
}

// Sidemenyen trekkes inn mens fanen Dokumenter er åpen, og kommer tilbake når
// du forlater den — bare hvis det var vi som trakk den inn. Valget i menyen
// (pt_drawer_collapsed) røres ikke.
var _dpDrawerAuto = false;
var _dpWasDocs = false;
function _dpDrawerSet(collapse) {
  var drawer = document.getElementById('main-drawer');
  var btn = document.getElementById('drawer-toggle-btn');
  if (!drawer) return;
  if (collapse && !drawer.classList.contains('collapsed')) {
    drawer.classList.add('collapsed');
    _dpDrawerAuto = true;
  } else if (!collapse && _dpDrawerAuto) {
    drawer.classList.remove('collapsed');
    _dpDrawerAuto = false;
  } else {
    return;
  }
  if (btn) {
    var c = drawer.classList.contains('collapsed');
    btn.innerHTML = c ? '&#8250;' : '&#8249;';
    btn.title = c ? 'Vis navigasjon' : 'Skjul navigasjon';
  }
  // Festeregelen til rundeskuffen avhenger av sidemenyens bredde: sjekk på nytt
  // når overgangen er ferdig, som ved et vanlig trykk på menyknappen.
  setTimeout(function() {
    if (typeof _roundDrawer !== 'undefined' && _roundDrawer.open) renderRoundDrawer();
  }, 450);
}

// Dokumentflaten får resten av vinduet under toppfeltet.
function _dpFitHeight() {
  var body = document.getElementById('dp-body');
  if (!body || body.hidden || _dpTab !== 'docs') return;
  var top = body.getBoundingClientRect().top;
  body.style.height = Math.max(360, Math.floor(window.innerHeight - top - 16)) + 'px';
}
window.addEventListener('resize', _dpFitHeight);
// Toppfeltet kan bytte linjer uten at vinduet endrer størrelse (sidemenyen
// glir inn, tittelen blir lengre), og da flytter dokumentflaten seg. Mål på nytt
// hver gang toppfeltet endrer høyde.
if (typeof ResizeObserver === 'function') {
  var _dpBarObserver = new ResizeObserver(function() { _dpFitHeight(); });
  ['.dp-bar', '#view-sak .top-bar'].forEach(function(sel) {
    var el = document.querySelector(sel);
    if (el) _dpBarObserver.observe(el);
  });
}
// Velger brukeren selv å åpne eller trekke inn menyen, er det hennes valg, ikke vårt.
document.getElementById('drawer-toggle-btn').addEventListener('click', function() { _dpDrawerAuto = false; });

// Forlot du saksiden (annen side)? Da er fanen Dokumenter ikke lenger åpen.
function dpOnPageChange(page) {
  if (page === 'sak') return;
  _folderSyncKey = null; // åpnes en sak igjen, leses mappen på nytt
  document.body.classList.remove('dp-docs-mode');
  document.body.classList.remove('dp-focus-mode');
  _dpDrawerSet(false);
  _dpWasDocs = false;
}

// Fokusmodus gjelder bare på fanen Dokumenter; Oversikt har alltid hele toppfeltet.
function _dpApplyFocus() {
  // Uten serveren er panelvalgene (og dermed «Avslutt fokus») skjult, så fokus
  // kan ikke slås på da — ellers ble toppfeltet borte uten vei tilbake.
  var on = _dpTab === 'docs' && !!docLayout.focus && _docServedLocally(window.location);
  var view = document.getElementById('view-sak');
  if (view) view.classList.toggle('is-focus', on);
  document.body.classList.toggle('dp-focus-mode', on);
  var b = document.getElementById('dp-focus-toggle');
  if (b) { b.textContent = docLayout.focus ? 'Avslutt fokus' : 'Fokus'; }
}

function dpApplyTab() {
  var docs = _dpTab === 'docs';
  var view = document.getElementById('view-sak');
  if (view) view.classList.toggle('is-docs-tab', docs);
  _dpApplyFocus();
  document.body.classList.toggle('dp-docs-mode', docs);
  // Sidemenyen trekkes inn bare idet fanen åpnes (ikke ved hver omtegning), så
  // en meny du selv åpner blir stående.
  if (docs !== _dpWasDocs) _dpDrawerSet(docs);
  _dpWasDocs = docs;
  var tb = document.getElementById('dp-toolbar');
  if (tb) tb.hidden = !docs || !_docServedLocally(window.location);
  var viewer = document.getElementById('sak-viewer');
  if (viewer) viewer.hidden = !docs;
  [['overview', 'sak-tab-overview'], ['docs', 'sak-tab-docs']].forEach(function(t) {
    var b = document.getElementById(t[1]);
    if (!b) return;
    var on = _dpTab === t[0];
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
  });
}

function setSakTab(tab) {
  _dpTab = tab === 'docs' ? 'docs' : 'overview';
  dpApplyTab();
  if (_dpTab === 'docs') renderDocPanes();
  else window.scrollTo(0, 0);
}

// Byggeklossene (tre paneler, to skillelinjer) lages én gang og vises/skjules
// etterpå, så en iframe ikke lastes på nytt av at kravpanelet bytter side.
function _dpBuild() {
  if (_dpBuilt) return;
  var host = document.getElementById('dp-panes');
  if (!host) return;
  var html = '';
  for (var i = 0; i < DOC_PANE_MAX; i++) {
    if (i > 0) html += '<div class="dp-split" role="separator" aria-orientation="vertical" tabindex="0" data-dp-split="' + (i - 1) + '" aria-label="Bredde på panel ' + i + ' og ' + (i + 1) + '"></div>';
    html += '<section class="dp-pane" data-dp-pane="' + i + '" aria-label="Panel ' + (i + 1) + '">' +
      '<div class="dp-phead"><span class="dp-slot">' + (i + 1) + '</span>' +
      '<select class="dp-pick" data-dp-pick="' + i + '" aria-label="Fil i panel ' + (i + 1) + '"></select>' +
      '<span class="dp-pin" id="dp-pin-' + i + '"></span></div>' +
      '<iframe class="dp-frame" id="dp-frame-' + i + '" title="Dokument i panel ' + (i + 1) + '" hidden></iframe>' +
      '<div class="dp-empty" id="dp-empty-' + i + '"></div>' +
      '</section>';
  }
  host.innerHTML = html;
  _dpBuilt = true;
}

function _dpFiles() {
  var id = activeSakId;
  var data = id ? loadSakData(id) : null;
  return (data && Array.isArray(data.files)) ? data.files : [];
}

// Kravpanelet: samme knapper som kravtabellen (claimTriButtons), så arvede
// verdier vises, oppfinnelseshøyde er låst uten nyhet, og et trykk gjør nøyaktig
// det samme som i tabellen (CLAIM_TOGGLE).
function dpClaimsHtml(claims) {
  var rows = claimOverviewRows(claims);
  var head = '<h3 class="dp-claims-title">Krav</h3>';
  if (!rows.length) return head + '<p class="dp-claims-empty">Ingen krav er lagt inn ennå.</p>';
  var byNum = {};
  (claims || []).forEach(function(c) { if (c && typeof c === 'object') byNum[c.num] = c; });
  return head + '<table class="dp-ov"><thead><tr><th scope="col">Krav</th><th scope="col">Nyhet</th>' +
    '<th scope="col">Oppf.høyde</th></tr></thead><tbody>' +
    rows.map(function(r) {
      var tri = claimTriButtons(claims, byNum[r.num]);
      return '<tr><td>' + r.num + (r.dep ? ' <span class="dp-ov-dep">→ ' + r.dep + '</span>' : '') + '</td><td>' +
        tri.novelty + '</td><td>' + tri.inventive + '</td></tr>';
    }).join('') + '</tbody></table>';
}

// Tegner bare kravpanelet på nytt (kalles når et krav endres) og beholder fokus
// på knappen du trykket på.
function dpRenderClaims(data) {
  if (_dpTab !== 'docs' || !_dpBuilt) return;
  var el = document.getElementById('dp-claims');
  if (!el || !data) return;
  var a = document.activeElement;
  var keep = (a && el.contains(a) && a.dataset && a.dataset.field) ? a.dataset.claim + ':' + a.dataset.field : null;
  el.innerHTML = dpClaimsHtml(data.claims);
  if (keep) {
    var parts = keep.split(':');
    var again = el.querySelector('[data-claim="' + parts[0] + '"][data-field="' + parts[1] + '"]');
    if (again) again.focus();
  }
}

function _dpPaneWidths() {
  return docLayout.widths[docLayout.count];
}

// Legger oppsettet (antall, side, bredder, synlighet) på DOM-en uten å røre iframene.
function _dpApplyLayout() {
  var body = document.getElementById('dp-body');
  if (!body) return;
  var l = docLayout;
  body.classList.toggle('is-claims-left',  l.claimsSide === 'left');
  body.classList.toggle('is-claims-right', l.claimsSide === 'right');
  var claims = document.getElementById('dp-claims');
  var csplit = document.getElementById('dp-csplit');
  claims.hidden = !l.claimsVisible;
  csplit.hidden = !l.claimsVisible;
  claims.style.width = l.claimsWidth + 'px';
  var tog = document.getElementById('dp-claims-toggle');
  tog.textContent = l.claimsVisible ? 'Skjul krav' : 'Vis krav';
  var tools = document.getElementById('dp-tools-toggle');
  tools.textContent = l.hideToolbar ? 'Vis PDF-verktøy' : 'Skjul PDF-verktøy';
  _dpApplyFocus();
  document.querySelectorAll('[data-dp-count]').forEach(function(b) {
    b.setAttribute('aria-pressed', Number(b.dataset.dpCount) === l.count ? 'true' : 'false');
  });
  document.querySelectorAll('[data-dp-side]').forEach(function(b) {
    b.setAttribute('aria-pressed', b.dataset.dpSide === l.claimsSide ? 'true' : 'false');
  });
  var w = _dpPaneWidths();
  document.querySelectorAll('.dp-pane').forEach(function(p) {
    var i = Number(p.dataset.dpPane);
    p.hidden = i >= l.count;
    if (i < l.count) p.style.flex = (w[i] * 1000) + ' 1 0';
  });
  document.querySelectorAll('.dp-split[data-dp-split]').forEach(function(s) {
    var i = Number(s.dataset.dpSplit);
    s.hidden = i + 1 >= l.count;
    s.setAttribute('aria-valuenow', String(Math.round(w[i] * 100)));
    s.setAttribute('aria-valuemin', String(Math.round(DOC_PANE_MIN * 100)));
    s.setAttribute('aria-valuemax', String(Math.round((1 - DOC_PANE_MIN) * 100)));
  });
  csplit.setAttribute('aria-valuenow', String(l.claimsWidth));
  csplit.setAttribute('aria-valuemin', String(DOC_CLAIMS_W_MIN));
  csplit.setAttribute('aria-valuemax', String(DOC_CLAIMS_W_MAX));
}

function _dpFillRuleInputs() {
  document.querySelectorAll('[data-dp-rule]').forEach(function(inp) {
    inp.value = docLayout.rules[Number(inp.dataset.dpRule)] || '';
  });
}

function _dpShowNotice(text) {
  var n = document.getElementById('dp-notice');
  if (!n) return;
  n.hidden = !text;
  n.innerHTML = text || '';
}

function renderDocPanes() {
  _dpFillRuleInputs();
  if (_dpTab !== 'docs') return;
  var cas = _dpActiveCase();
  if (!cas) return;
  _dpBuild();
  var served = _docServedLocally(window.location);
  var body = document.getElementById('dp-body');
  document.getElementById('dp-toolbar').hidden = !served;
  if (!served) {
    body.hidden = true;
    _dpShowNotice('Dokumentpaneler krever den lokale serveren. Start <strong>Start-PatentDesk.ps1</strong> og åpne PatentDesk via <strong>http://localhost:8080</strong>. Filene kan fortsatt åpnes fra listen «Dokumenter» øverst.');
    return;
  }
  body.hidden = false;
  _dpShowNotice('');
  _dpApplyLayout();
  _dpFitHeight();

  var data = loadSakData(cas.id);
  document.getElementById('dp-claims').innerHTML = dpClaimsHtml(data && data.claims);

  var files = _dpFiles();
  var picks = _dpManual.map(function(name) {
    if (typeof name !== 'string') return null;
    for (var k = 0; k < files.length; k++) { if (files[k] && files[k].name === name) return k; }
    return null; // filen er slettet eller omdøpt: valget faller bort, regelen gjelder igjen
  });
  var assigned = docSlotAssign(files, docLayout.rules, docLayout.count, picks);
  var listing = dpFolderListing(cas);
  var gone = {};
  if (listing && listing.exists) missingFileIndexes(files, listing.files).forEach(function(k) { gone[k] = true; });
  var root = loadDocRoot();
  for (var i = 0; i < DOC_PANE_MAX; i++) {
    var visible = i < docLayout.count;
    var sel = document.querySelector('[data-dp-pick="' + i + '"]');
    var pin = document.getElementById('dp-pin-' + i);
    var frame = document.getElementById('dp-frame-' + i);
    var empty = document.getElementById('dp-empty-' + i);
    if (!visible) { _dpSetFrame(frame, ''); continue; }
    var idx = assigned[i];
    var manual = Number.isInteger(picks[i]) && idx === picks[i];
    var rule = docLayout.rules[i];
    var opts = '<option value="">' + (manual ? 'Automatisk' : (idx >= 0 ? 'Automatisk: ' + esc(_fileDisplayName(files[idx].name)) : 'Velg fil …')) + '</option>';
    files.forEach(function(f, k) {
      if (!_fileIsPdf(f.name)) return;
      opts += '<option value="' + k + '"' + (manual && k === idx ? ' selected' : '') + '>' + esc(fileListLabel(f)) + (gone[k] ? ' (mangler)' : '') + '</option>';
    });
    sel.innerHTML = opts;
    pin.textContent = manual ? 'valgt for hånd' : (rule ? 'regel: ' + rule : '');
    var url = idx >= 0 ? docPaneUrl(root, cas.caseNumber, files[idx].name, window.location, docLayout.hideToolbar) : '';
    _dpSetFrame(frame, url || '');
    if (url) {
      empty.hidden = true;
    } else {
      empty.hidden = false;
      empty.textContent = !files.length ? 'Ingen filer registrert på saken.'
        : (rule && !manual ? 'Ingen fil passer regelen «' + rule + '». Velg en fil over.' : 'Velg en fil over.');
    }
  }
}

// iframen får ny adresse bare når den faktisk er en annen — ellers mister
// leseren sted og zoom hver gang oppsettet endres.
function _dpSetFrame(frame, url) {
  if (!frame) return;
  var old = frame.dataset.url || '';
  if (old === url) { frame.hidden = !url; return; }
  frame.dataset.url = url;
  if (!url) { frame.removeAttribute('src'); frame.hidden = true; return; }
  frame.hidden = false;
  // Samme fil med bare en annen #-del (verktøylinjen skjules eller vises) er for
  // nettleseren bare en hopp-til-sted i samme dokument, og leseren leser ikke
  // verktøylinje-valgene på nytt. Gå via en tom side, så filen lastes på nytt.
  if (frame._dpLoad) { frame.removeEventListener('load', frame._dpLoad); frame._dpLoad = null; }
  if (old && old.split('#')[0] === url.split('#')[0]) {
    frame._dpLoad = function() {
      frame.removeEventListener('load', frame._dpLoad);
      frame._dpLoad = null;
      if (frame.dataset.url === url) frame.src = url;
    };
    frame.addEventListener('load', frame._dpLoad);
    frame.src = 'about:blank';
    return;
  }
  frame.src = url;
}

function _dpSetLayout(patch) {
  dispatch('DOC_LAYOUT_SET', { layout: Object.assign({}, docLayout, patch) });
  renderDocPanes();
}

// ── Saksmappen på disk ─────────────────────────────
// Når en sak åpnes via den lokale serveren, leses filene i saksmappen
// (/docs/list). Nye filer legges til i fillisten; filer i listen som ikke
// finnes på disk merkes «mangler» (aldri slettet). Svaret lagres ikke — det
// leses på nytt neste gang saken åpnes. Feil (server uten /docs/list, nettverk,
// uventet svar) gjør ingenting.
var _folderListing = {};   // saks-id → { key, exists, files } fra siste lesing
var _folderSyncKey = null; // nøkkelen til lesingen som er gjort i denne åpningen

// Hva en lesing gjelder: saken, saksnummeret (mappenavnet) og dokumentroten.
// Endres noe av det, er en gammel lesing ikke lenger riktig og leses på nytt.
function _dpFolderKey(cas) {
  return cas ? cas.id + '|' + cas.caseNumber + '|' + _docRootNormalize(loadDocRoot()) : null;
}
// Lesingen for saken slik den står nå, eller null hvis den gjelder noe annet.
function dpFolderListing(cas) {
  var l = cas ? _folderListing[cas.id] : null;
  return (l && l.key === _dpFolderKey(cas)) ? l : null;
}

function dpSyncFolder(id) {
  if (!_docServedLocally(window.location) || typeof fetch !== 'function') return;
  var cas = cases.find(function(c) { return c.id === id; });
  if (!cas) return;
  var key = _dpFolderKey(cas);
  var url = window.location.origin + '/docs/list?root=' + encodeURIComponent(_docRootNormalize(loadDocRoot())) +
    '&case=' + encodeURIComponent(cas.caseNumber);
  fetch(url, { cache: 'no-store' }).then(function(r) { return r.ok ? r.json() : null; }).then(function(raw) {
    var listing = normalizeFolderListing(raw);
    if (!listing) return;
    // Saken kan være slettet, ha fått nytt saksnummer eller ny dokumentrot mens vi
    // ventet: da gjelder svaret en annen mappe, og skal ikke brukes.
    if (_dpFolderKey(cases.find(function(c) { return c.id === id; })) !== key) return;
    listing.key = key;
    _folderListing[id] = listing;
    var data = loadSakData(id);
    var current = (data && Array.isArray(data.files)) ? data.files : [];
    var add = listing.exists ? folderFilesToAdd(current, listing.files) : [];
    if (add.length) {
      dispatch('FILES_SYNC', { id: id, names: add });
    } else if (activeSakId === id && data) {
      renderSakFileList(Object.assign({}, data, { files: current }));
      renderDocPanes();
    }
  }).catch(function() {});
}

// ── Hendelser ──────────────────────────────────────
document.getElementById('sak-tabs').addEventListener('click', function(e) {
  var b = e.target.closest('[data-sak-tab]');
  if (b) setSakTab(b.dataset.sakTab);
});
document.getElementById('sak-tabs').addEventListener('keydown', function(e) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  setSakTab(_dpTab === 'docs' ? 'overview' : 'docs');
  var b = document.getElementById(_dpTab === 'docs' ? 'sak-tab-docs' : 'sak-tab-overview');
  if (b) b.focus();
});

document.getElementById('dp-toolbar').addEventListener('click', function(e) {
  if (e.target.closest('#dp-focus-toggle')) { _dpSetLayout({ focus: !docLayout.focus }); return; }
  if (e.target.closest('#dp-tools-toggle')) { _dpSetLayout({ hideToolbar: !docLayout.hideToolbar }); return; }
  var c = e.target.closest('[data-dp-count]');
  if (c) { _dpSetLayout({ count: Number(c.dataset.dpCount) }); return; }
  var s = e.target.closest('[data-dp-side]');
  if (s) { _dpSetLayout({ claimsSide: s.dataset.dpSide }); return; }
  if (e.target.closest('#dp-claims-toggle')) _dpSetLayout({ claimsVisible: !docLayout.claimsVisible });
});

document.getElementById('dp-claims').addEventListener('click', function(e) {
  var btn = e.target.closest('.sak-tri-btn[data-field]');
  if (!btn || btn.disabled || !activeSakId) return;
  dispatch('CLAIM_TOGGLE', { id: activeSakId, claimNum: parseInt(btn.dataset.claim, 10), field: btn.dataset.field });
});

document.getElementById('dp-panes').addEventListener('change', function(e) {
  var sel = e.target.closest('[data-dp-pick]');
  if (!sel) return;
  var chosen = sel.value === '' ? null : _dpFiles()[Number(sel.value)];
  _dpManual[Number(sel.dataset.dpPick)] = chosen ? chosen.name : null;
  renderDocPanes();
});

// Plassreglene i Innstillinger
document.querySelectorAll('[data-dp-rule]').forEach(function(inp) {
  inp.addEventListener('change', function() {
    var rules = docLayout.rules.slice();
    rules[Number(inp.dataset.dpRule)] = inp.value;
    dispatch('DOC_LAYOUT_SET', { layout: Object.assign({}, docLayout, { rules: rules }) });
    inp.value = docLayout.rules[Number(inp.dataset.dpRule)];
    showToast('✓ Plassregel lagret');
  });
});

// Skillelinjer: dra, eller piltaster på en skillelinje i fokus. Mens du drar,
// får iframene pointer-events: none (is-dragging), ellers sluker PDF-visningen
// musehendelsene og draget setter seg fast.
function _dpStartDrag(e, el, kind, index) {
  var body = document.getElementById('dp-body');
  var panes = document.getElementById('dp-panes');
  _dpDrag = {
    kind: kind, index: index, x: e.clientX, pointerId: e.pointerId,
    widths: _dpPaneWidths().slice(), claimsWidth: docLayout.claimsWidth,
    panesPx: panes.getBoundingClientRect().width || 1,
    el: el
  };
  body.classList.add('is-dragging');
  el.classList.add('is-active');
  el.setPointerCapture(e.pointerId); // på selve skillelinjen, så klikk og dobbeltklikk også treffer den
  e.preventDefault();
}
function _dpMoveDrag(e) {
  if (!_dpDrag || e.pointerId !== _dpDrag.pointerId) return;
  if (e.buttons === 0) { _dpEndDrag(); return; } // slippet gikk tapt (f.eks. en kontekstmeny): ingen knapp er nede, så draget er over
  var dx = e.clientX - _dpDrag.x;
  if (_dpDrag.kind === 'panes') {
    var w = dragPaneWidths(_dpDrag.widths, _dpDrag.index, dx / _dpDrag.panesPx);
    docLayout.widths[docLayout.count] = w;
  } else {
    var sign = docLayout.claimsSide === 'left' ? 1 : -1;
    docLayout.claimsWidth = Math.round(Math.min(Math.max(_dpDrag.claimsWidth + sign * dx, DOC_CLAIMS_W_MIN), DOC_CLAIMS_W_MAX));
  }
  _dpApplyLayout();
}
function _dpEndDrag() {
  if (!_dpDrag) return;
  _dpDrag.el.classList.remove('is-active');
  document.getElementById('dp-body').classList.remove('is-dragging');
  _dpDrag = null;
  dispatch('DOC_LAYOUT_SET', { layout: docLayout });
}
document.getElementById('dp-body').addEventListener('pointerdown', function(e) {
  if (e.button !== 0) return; // bare venstre knapp drar; høyreklikk og andre knapper gjør ingenting
  var cs = e.target.closest('#dp-csplit');
  if (cs) { _dpStartDrag(e, cs, 'claims', 0); return; }
  var s = e.target.closest('[data-dp-split]');
  if (s) _dpStartDrag(e, s, 'panes', Number(s.dataset.dpSplit));
});
document.getElementById('dp-body').addEventListener('pointermove', _dpMoveDrag);
document.getElementById('dp-body').addEventListener('pointerup', _dpEndDrag);
document.getElementById('dp-body').addEventListener('pointercancel', _dpEndDrag);
document.getElementById('dp-body').addEventListener('dblclick', function(e) {
  if (e.target.closest('#dp-csplit')) {
    _dpSetLayout({ claimsWidth: defaultDocLayout().claimsWidth });
  } else if (e.target.closest('[data-dp-split]')) {
    var widths = {}; [1, 2, 3].forEach(function(n) { widths[n] = docLayout.widths[n]; });
    widths[docLayout.count] = normalizePaneWidths(null, docLayout.count);
    _dpSetLayout({ widths: widths });
  }
});
document.getElementById('dp-body').addEventListener('keydown', function(e) {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  var step = (e.key === 'ArrowRight' ? 1 : -1) * 0.02;
  var cs = e.target.closest('#dp-csplit');
  var s = e.target.closest('[data-dp-split]');
  if (cs) {
    var sign = docLayout.claimsSide === 'left' ? 1 : -1;
    _dpSetLayout({ claimsWidth: docLayout.claimsWidth + sign * step * 500 });
  } else if (s) {
    var widths = {}; [1, 2, 3].forEach(function(n) { widths[n] = docLayout.widths[n]; });
    widths[docLayout.count] = dragPaneWidths(docLayout.widths[docLayout.count], Number(s.dataset.dpSplit), step);
    _dpSetLayout({ widths: widths });
  } else return;
  e.preventDefault();
});

_dpFillRuleInputs();
