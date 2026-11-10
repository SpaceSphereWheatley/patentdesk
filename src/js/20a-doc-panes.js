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
    if (f) { f.removeAttribute('src'); f.hidden = true; f.dataset.url = ''; }
  });
}

function dpApplyTab() {
  var docs = _dpTab === 'docs';
  var view = document.getElementById('view-sak');
  if (view) view.classList.toggle('is-docs-tab', docs);
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

function _dpMarkClaim(v) {
  if (v === true)  return '<span class="dp-yes" aria-label="Ja">✓</span>';
  if (v === false) return '<span class="dp-no" aria-label="Nei">✗</span>';
  return '<span class="dp-unk" aria-label="Ikke vurdert">–</span>';
}

// Oversikten over kravene: samme data som kravtabellen, bare lesevisning.
function dpClaimsHtml(claims) {
  var rows = claimOverviewRows(claims);
  var head = '<h3 class="dp-claims-title">Krav</h3>';
  if (!rows.length) return head + '<p class="dp-claims-empty">Ingen krav er lagt inn ennå.</p>';
  return head + '<table class="dp-ov"><thead><tr><th scope="col">Krav</th><th scope="col">Nyhet</th>' +
    '<th scope="col">Oppf.høyde</th></tr></thead><tbody>' +
    rows.map(function(r) {
      return '<tr><td>' + r.num + (r.dep ? ' <span class="dp-ov-dep">→ ' + r.dep + '</span>' : '') + '</td><td>' +
        _dpMarkClaim(r.novelty) + '</td><td>' + _dpMarkClaim(r.inventive) + '</td></tr>';
    }).join('') + '</tbody></table>';
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
  tog.setAttribute('aria-pressed', l.claimsVisible ? 'true' : 'false');
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

  var data = loadSakData(cas.id);
  document.getElementById('dp-claims').innerHTML = dpClaimsHtml(data && data.claims);

  var files = _dpFiles();
  var picks = _dpManual.map(function(name) {
    if (typeof name !== 'string') return null;
    for (var k = 0; k < files.length; k++) { if (files[k] && files[k].name === name) return k; }
    return null; // filen er slettet eller omdøpt: valget faller bort, regelen gjelder igjen
  });
  var assigned = docSlotAssign(files, docLayout.rules, docLayout.count, picks);
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
      opts += '<option value="' + k + '"' + (manual && k === idx ? ' selected' : '') + '>' + esc(fileListLabel(f)) + '</option>';
    });
    sel.innerHTML = opts;
    pin.textContent = manual ? 'valgt for hånd' : (rule ? 'regel: ' + rule : '');
    var url = idx >= 0 ? docPaneUrl(root, cas.caseNumber, files[idx].name, window.location) : '';
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
  if ((frame.dataset.url || '') === url) { frame.hidden = !url; return; }
  frame.dataset.url = url;
  if (url) { frame.src = url; frame.hidden = false; }
  else { frame.removeAttribute('src'); frame.hidden = true; }
}

function _dpSetLayout(patch) {
  dispatch('DOC_LAYOUT_SET', { layout: Object.assign({}, docLayout, patch) });
  renderDocPanes();
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
  var c = e.target.closest('[data-dp-count]');
  if (c) { _dpSetLayout({ count: Number(c.dataset.dpCount) }); return; }
  var s = e.target.closest('[data-dp-side]');
  if (s) { _dpSetLayout({ claimsSide: s.dataset.dpSide }); return; }
  if (e.target.closest('#dp-claims-toggle')) _dpSetLayout({ claimsVisible: !docLayout.claimsVisible });
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
    kind: kind, index: index, x: e.clientX,
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
  if (!_dpDrag) return;
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
