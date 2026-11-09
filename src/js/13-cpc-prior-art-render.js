// ── CPC-UI ─────────────────────────────────────────
function _cpcSetBanner(html) {
  var banner = document.getElementById('cpc-load-banner');
  if (banner) banner.innerHTML = html;
}

function _cpcSetLoaded() {
  _cpcSetBanner(
    '<span class="cpc-banner-loaded">✓ ' + _cpcKeys.length.toLocaleString('no') + ' klasser lastet</span>' +
    '<button class="cpc-load-banner-btn cpc-load-banner-btn-ml" id="btn-cpc-reload">Last inn på nytt</button>'
  );
  var rb = document.getElementById('btn-cpc-reload');
  if (rb) rb.addEventListener('click', function() { document.getElementById('cpc-file-input').click(); });
  _cpcUpdateSettingsStatus();
}

var CPC_NOTICE_DISMISSED_KEY = 'pt_cpc_notice_dismissed';

// Banneret på Oversikt vises mens CPC-databasen mangler, til du lukker det.
// Innlasting ligger fortsatt i Innstillinger. Ren funksjon — se test/cpcNotice.test.js.
function shouldShowCpcNotice(loaded, dismissed) {
  return !loaded && !dismissed;
}

function _cpcShowNotice() {
  var notice = document.getElementById('cpc-home-notice');
  if (!notice) return;
  if (!shouldShowCpcNotice(false, _lsGet(CPC_NOTICE_DISMISSED_KEY) === '1')) { notice.style.display = 'none'; return; }
  notice.className = 'cpc-home-notice';
  notice.innerHTML =
    '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" class="cpc-notice-icon">' +
      '<circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.2"/>' +
      '<line x1="8" y1="5" x2="8" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
      '<circle cx="8" cy="11.5" r="0.8" fill="currentColor"/>' +
    '</svg>' +
    '<span>CPC-databasen er ikke lastet. Autofullfør for klasser er ikke tilgjengelig.</span>' +
    '<button class="cpc-load-banner-btn" id="btn-cpc-notice-load">Last inn</button>' +
    '<button type="button" class="cpc-notice-dismiss" id="btn-cpc-notice-dismiss" title="Skjul — CPC-databasen lastes inn under Innstillinger → Saksbehandling" aria-label="Skjul varselet">' +
      '<svg class="ti" aria-hidden="true"><use href="#ti-x"/></svg></button>';
  notice.style.display = 'flex';
  document.getElementById('btn-cpc-notice-dismiss').addEventListener('click', function() {
    _lsSet(CPC_NOTICE_DISMISSED_KEY, '1');
    _cpcHideNotice();
  });
  document.getElementById('btn-cpc-notice-load').addEventListener('click', function() {
    document.getElementById('cpc-file-input').click();
  });
}

function _cpcHideNotice() {
  var notice = document.getElementById('cpc-home-notice');
  if (notice) notice.style.display = 'none';
}

function _cpcCheckFirstTime() {
  if (!localStorage.getItem(ONBOARDING_KEY)) {
    openBackdrop('onboarding-backdrop');
  } else {
    _cpcShowNotice();
  }
}

function _cpcUpdateSettingsStatus() {
  var el = document.getElementById('settings-cpc-status');
  if (!el) return;
  if (_cpcDb && _cpcKeys) {
    el.textContent = '✓ ' + _cpcKeys.length.toLocaleString('no') + ' klasser lastet';
    el.style.color = 'var(--color-ok)';
  } else {
    el.textContent = 'Ikke lastet — velg cpc_v2.json';
    el.style.color = '';
  }
}

// Nullstiller CPC-databasen helt: minne, IndexedDB og UI
function _cpcResetState() {
  _cpcDb = null;
  _cpcKeys = null;
  _cpcKeysNorm = null;
  try { indexedDB.deleteDatabase(_CPC_DB_NAME); } catch(e) {}
  _cpcSetBanner(
    '<span class="cpc-banner-text">Autofullfør ikke tilgjengelig</span>' +
    '<button class="cpc-load-banner-btn" id="btn-cpc-load">Last inn</button>'
  );
  _initCpcLoadButton();
  _cpcUpdateSettingsStatus();
  _cpcHideNotice();
}

function renderSakClasses(data) {
  var el = document.getElementById('sak-classes-list');
  var arr = data.classes || [];
  if (!arr.length) {
    el.innerHTML = '<button type="button" class="sak-empty-action" id="btn-cpc-empty-add">' +
      '<svg class="ti" aria-hidden="true"><use href="#ti-plus"/></svg> Ingen klasser lagt til — legg til den første</button>';
    return;
  }
  el.innerHTML = arr.map(function(cls, i) {
    var desc = (_cpcDb && _cpcDb[cls.code]) ? _cpcDb[cls.code].t : '';
    return cpcRowHtml(cls, i, desc, cpcTooltipHtml(cls.code, 2));
  }).join('');
}

// Hierarki-tooltipen for en CPC-klasse, eller '' når databasen ikke er lastet
// eller klassen ikke finnes. minRows: hvor mange nivåer som må til før den
// vises (sakens klasser viser beskrivelsen i raden, så der trengs to).
function cpcTooltipHtml(code, minRows) {
  if (!_cpcDb || !_cpcDb[code]) return '';
  var hier = _cpcHierarchy(code);
  if (hier.length < (minRows || 1)) return '';
  var rows = hier.map(function(item) {
    var isCurrent = item.code === code;
    var dots = '';
    for (var d = 0; d <= item.indent; d++) dots += (d > 0 ? ' ●' : '●');
    var sep = isCurrent && hier.length > 1 ? '<div class="sak-class-tooltip-sep"></div>' : '';
    return sep + '<div class="sak-class-tooltip-row">' +
      '<span class="sak-class-tooltip-dots">' + dots + '</span>' +
      '<span class="sak-class-tooltip-code">' + esc(item.code) + '</span>' +
      '<span class="sak-class-tooltip-desc' + (isCurrent ? ' is-current' : '') + '">' + esc(item.entry.t) + '</span>' +
    '</div>';
  }).join('');
  return '<div class="sak-class-tooltip" role="tooltip">' +
    '<div class="sak-class-tooltip-title">Hierarki</div>' +
    rows +
  '</div>';
}

// Raden ligger i et rutenett med fire faste kolonner. Beskrivelsen ble
// tidligere bare skrevet ut når den fantes, og da gled slettekrysset inn i dens
// plass. Kolonnen skrives derfor alltid — og når CPC-databasen ikke er lastet
// sier den det, i stedet for å stå tom og se ut som en mangel ved klassen.
// Ren funksjon — se test/sakRender.test.js.
function cpcRowHtml(cls, i, desc, tooltipHtml) {
  var descHtml = desc
    ? '<span class="sak-class-desc">' + esc(desc) + '</span>'
    : '<span class="sak-class-desc sak-class-desc-missing">beskrivelse ikke tilgjengelig</span>';
  return '<div class="sak-class-row">' +
    (tooltipHtml || '') +
    '<label class="sak-class-inuse-label" title="I bruk">' +
      '<input type="checkbox" class="sak-class-inuse-cb" data-idx="' + i + '"' + (cls.inUse ? ' checked' : '') + ' />' +
    '</label>' +
    '<span class="sak-class-tag' + (cls.inUse ? ' sak-class-tag-active' : '') + '">' + esc(cls.code) + '</span>' +
    descHtml +
    '<button class="btn-icon btn-sak-class-del" data-idx="' + i + '" title="Fjern" aria-label="Fjern klasse"><svg class="ti" aria-hidden="true"><use href="#ti-x"/></svg></button>' +
  '</div>';
}

function triButtonClass(val, isFormal) {
  // For formal: true = negativ (feil finnes), false/null = positiv/nøytral
  if (isFormal) {
    if (val === true)  return 'sak-tri-btn sak-tri-btn-no';
    if (val === false) return 'sak-tri-btn sak-tri-btn-ok';
    return 'sak-tri-btn sak-tri-btn-null';
  }
  if (val === true)  return 'sak-tri-btn sak-tri-btn-ok';
  if (val === false) return 'sak-tri-btn sak-tri-btn-no';
  return 'sak-tri-btn sak-tri-btn-null';
}

function claimRowClass(c) {
  if (c.novelty === true && c.inventive === true && c.formal === true)  return 'claim-row-formal';
  if (c.novelty === true && c.inventive === true)                        return 'claim-row-ok';
  if (c.novelty === false || c.inventive === false)                      return 'claim-row-no';
  return '';
}

// Prikken i kravtreet. Et krav uten nyhet er avgjort (oppfinnelseshøyden er
// låst til nei); ellers er kravet uvurdert til begge er satt — en tom
// oppfinnelseshøyde er ikke et nei. Ren funksjon — se test/logicFixes.test.js.
function claimDotClass(c, claims) {
  var effN = claims ? effectiveClaimValue(claims, c, 'novelty') : c.novelty;
  var effI = claims ? effectiveClaimValue(claims, c, 'inventive') : c.inventive;
  if (effN === false) return 'kt-dot-no';
  if (effN === null || effI === null || effI === undefined) return 'kt-dot-null';
  if (effI === false) return 'kt-dot-no';
  if (c.formal) return 'kt-dot-formal';
  return 'kt-dot-ok';
}

var _ktCollapsed = {};

function ktGroupClass(c, claims) {
  var dot = claimDotClass(c, claims);
  if (dot === 'kt-dot-ok')     return 'kt-group kt-group-ok';
  if (dot === 'kt-dot-no')     return 'kt-group kt-group-no';
  if (dot === 'kt-dot-formal') return 'kt-group kt-group-formal';
  return 'kt-group kt-group-null';
}

function renderSakClaimsTree(data, activeClaim) {
  var el = document.getElementById('sak-claims-tree');
  if (!el) return;
  if (!data.numClaims || data.numClaims < 1) {
    el.innerHTML = '<div class="kt-empty">\u2014</div>';
    return;
  }
  function kids(num) { return data.claims.filter(function(c) { return c.dep === num; }); }
  function renderChildren(parentNum, depth, isCollapsed) {
    var children = kids(parentNum);
    if (!children.length) return '';
    var rows = children.map(function(c) {
      var childActive = c.num === activeClaim ? ' kt-active' : '';
      var childTag = c.label ? '<span class="kt-tag-chip">' + esc(c.label) + '</span>' : '';
      var indent = 'padding-left:' + (10 + depth * 12) + 'px';
      var row = '<div class="kt-child-row' + childActive + '" data-kt-num=\"' + esc(c.num) + '\" style="' + indent + '">' +
        '<span class="kt-connector">&#9492;</span>' +
        '<div class="kt-dot ' + claimDotClass(c, data.claims) + '"></div>' +
        '<span class="kt-lbl">' + esc(c.num) + '</span>' + childTag +
      '</div>';
      return row + renderChildren(c.num, depth + 1, false);
    }).join('');
    return '<div class="kt-group-children"' + (isCollapsed ? ' style="display:none"' : '') + '>' + rows + '</div>';
  }
  var roots = data.claims.filter(function(c) { return !c.dep; });
  var groups = roots.map(function(root) {
    var hasKids = kids(root.num).length > 0;
    var isCollapsed = !!_ktCollapsed[root.num];
    var tagHtml = root.label ? '<span class="kt-tag-chip">' + esc(root.label) + '</span>' : '';
    var chevHtml = hasKids
      ? '<span class="kt-group-chevron' + (isCollapsed ? '' : ' kt-open') + '">&#9658;</span>'
      : '<span class="kt-group-chevron" style="opacity:0;pointer-events:none">&#9658;</span>';
    var headerActive = root.num === activeClaim ? ' kt-active' : '';
    var header = '<div class="kt-group-header' + headerActive + '" data-kt-num=\"' + esc(root.num) + '\" data-kt-toggle=\"' + esc(root.num) + '\">' +
      chevHtml +
      '<div class="kt-dot ' + claimDotClass(root, data.claims) + '"></div>' +
      '<span class="kt-lbl">' + esc(root.num) + '</span>' + tagHtml +
    '</div>';
    var childrenHtml = renderChildren(root.num, 1, isCollapsed);
    return '<div class="' + ktGroupClass(root, data.claims) + '">' + header + childrenHtml + '</div>';
  }).join('');
  el.innerHTML = '<div class="kt-outer">' + groups + '</div>';
}

var _sakActiveClaimNum = null;
// Åpen mothold-velger i kravstabellen: { claimNum, field } eller null
var _sakOpenDocPop = null;

// Én kravrad. Trukket ut som egen funksjon slik at en endring kan tegne bare
// radene den faktisk påvirker, i stedet for å bytte ut hele tabellkroppen —
// det siste tok fokus og markørposisjon fra notat- og etikettfeltene.
function claimRowHtml(data, c) {
    var effNovelty   = effectiveClaimValue(data.claims, c, 'novelty');
    var effInventive = effectiveClaimValue(data.claims, c, 'inventive');
    var noveltyIsCascade   = c.novelty === null && effNovelty === true;
    var inventiveIsCascade = c.inventive === null && effInventive === true;

    // Knappene viser bare en glyf, så hver av dem må si hvilket krav og hvilken
    // kolonne den hører til — ellers leser en skjermleser sju like knapper.
    function ariaFor(field, val, isCascade, isLocked) {
      return ' aria-label="' + esc(triAriaLabel(c.num, field, val, isCascade, isLocked)) + '"';
    }

    // Nyhet-knapp
    var noveltyBtn;
    if (noveltyIsCascade) {
      noveltyBtn = '<button class="sak-tri-btn sak-tri-btn-cascade" data-claim=\"' + esc(c.num) + '\" data-field="novelty" title="Arvet fra overordnet krav"' + ariaFor('novelty', true, true, false) + '>' + triLabel(true, false) + '</button>';
    } else {
      noveltyBtn = '<button class="' + triButtonClass(c.novelty, false) + '" data-claim=\"' + esc(c.num) + '\" data-field="novelty"' + ariaFor('novelty', c.novelty, false, false) + '>' + triLabel(c.novelty, false) + '</button>';
    }

    // Oppfinnelseshøyde-knapp
    var inventiveLocked = effNovelty === false;
    var inventiveBtn;
    if (inventiveLocked) {
      inventiveBtn = '<button class="sak-tri-btn sak-tri-btn-no sak-tri-locked" disabled title="Låst: krav mangler nyhet"' + ariaFor('inventive', false, false, true) + '>' + triLabel(false, false) + '</button>';
    } else if (inventiveIsCascade) {
      inventiveBtn = '<button class="sak-tri-btn sak-tri-btn-cascade" data-claim=\"' + esc(c.num) + '\" data-field="inventive" title="Arvet fra overordnet krav"' + ariaFor('inventive', true, true, false) + '>' + triLabel(true, false) + '</button>';
    } else {
      inventiveBtn = '<button class="' + triButtonClass(c.inventive, false) + '" data-claim=\"' + esc(c.num) + '\" data-field="inventive"' + ariaFor('inventive', c.inventive, false, false) + '>' + triLabel(c.inventive, false) + '</button>';
    }

    // Radklasse basert på effektive verdier
    var cEff = Object.assign({}, c, { novelty: effNovelty, inventive: effInventive });
    var rowCls = claimRowClass(cEff);
    var isIndependent = !c.dep;
    if (isIndependent) rowCls = (rowCls ? rowCls + ' ' : '') + 'claim-row-independent';
    if (c.num === _sakActiveClaimNum) rowCls = (rowCls ? rowCls + ' ' : '') + 'sak-claim-active-row';

    // Kravkobling: en underrad bare når saken er i en runde med endrede krav.
    // Uten den er raden nøyaktig som før.
    var kmRound = claimMappingRoundFor(data);
    var kmSub = '';
    if (kmRound) {
      var kmMap = claimMapping(c, kmRound);
      var kmState = kmMap ? 'km-' + kmMap.change : 'km-unset';
      kmSub = claimMappingRowHtml(data, c, kmRound, kmMap, kmState, claimRowClass(cEff));
      rowCls = 'km-has-sub ' + kmState + (rowCls ? ' ' + rowCls : '');
    }

    // Dep input
    // Feltet og ↺ står i et rutenett med fast plass til knappen, så feltene
    // står likt på manuelle og automatiske rader.
    var depCell = '<span class="sak-dep-wrap"><input type="number" class="sak-dep-inp' + (c.depManual ? ' dep-manual' : '') + '" data-claim-dep=\"' + esc(c.num) + '\" min="1" placeholder="—" aria-label="' + esc(claimFieldAriaLabel(c.num, 'dep')) + '" value="' + (c.dep !== null ? c.dep : '') + '" />' +
      depResetHtml(c) + '</span>';

    // Kravnummeret er selv bryteren for selvstendig/uselvstendig: fet i
    // ramme = selvstendig, dempet = uselvstendig. Krav 1 kan ikke byttes.
    var numCell = '<button type="button" class="sak-num-tog' + (isIndependent ? ' is-indep' : '') + '" data-claim-dep-tog=\"' + esc(c.num) + '\"' +
      (c.num === 1 ? ' disabled' : '') +
      ' aria-label="' + esc(depToggleAriaLabel(c.num, isIndependent, c.depManual)) + '"' +
      ' title="' + esc(c.num === 1 ? 'Selvstendig' : isIndependent ? 'Selvstendig — klikk (eller S) for uselvstendig' : 'Uselvstendig — klikk (eller S) for selvstendig') + '">' +
      esc(c.num) + '</button>';

    // Label cell
    var labelCell = (c.num === _sakEditingLabelNum)
      ? '<input class="sak-tag-input" type="text" data-claim=\"' + esc(c.num) + '\" value="' + esc(c.label || '') + '" placeholder="Etikett…" aria-label="' + esc(claimFieldAriaLabel(c.num, 'label')) + '" />'
      : '<span class="sak-tag-display' + (!c.label ? ' sak-tag-empty' : '') + '" data-claim-label=\"' + esc(c.num) + '\"' +
        ' tabindex="0" role="button" aria-label="' + esc(claimLabelAriaLabel(c.num, c.label)) + '">' + esc(c.label || 'etikett') + '</span>';

    return '<tr' + (rowCls ? ' class="' + rowCls + '"' : '') + ' data-claim=\"' + esc(c.num) + '\">' +
      '<td class="sak-td-krav">' + numCell + '</td>' +
      '<td>' + labelCell + '</td>' +
      '<td class="sak-td-check sak-td-dep">' + depCell + '</td>' +
      '<td class="sak-td-check"><span class="claim-doc-wrap">' + noveltyBtn + claimDocChipHtml(data, c, 'novelty', effNovelty) + '</span></td>' +
      '<td class="sak-td-check"><span class="claim-doc-wrap">' + inventiveBtn + claimDocChipHtml(data, c, 'inventive', effNovelty) + '</span></td>' +
      '<td class="sak-td-check"><button class="' + triButtonClass(c.formal, true)    + '" data-claim=\"' + esc(c.num) + '\" data-field="formal"' + ariaFor('formal', c.formal, false, false) + '>' + triLabel(c.formal,   true)  + '</button></td>' +
      '<td class="sak-td-notes"><input class="sak-claim-note" type="text" data-claim=\"' + esc(c.num) + '\" value="' + esc(c.notes || '') + '" placeholder="Notat…" aria-label="' + esc(claimFieldAriaLabel(c.num, 'note')) + '" /></td>' +
    '</tr>' + kmSub;
}

// Runden kravene i den åpne saken kobles mot, eller null.
function claimMappingRoundFor(data) {
  if (typeof activeSakId === 'undefined' || !activeSakId || typeof cases === 'undefined') return null;
  var c = cases.find(function(x) { return x.id === activeSakId; });
  return c ? mappingRound(c, roundsOf(data)) : null;
}

// Kravet hvis opphavsfelt er åpent: { num, value, error } eller null
var _kmEditingOrigin = null;

var KM_P13_TITLE = 'Endringen har grunnlag i søknaden som innlevert (patentloven § 13)';

// Underraden med opphav, endret/uendret, forrige vurdering og § 13.
// All tekst som kan komme fra brukeren går gjennom esc.
function claimMappingRowHtml(data, c, round, m, stateCls, verdictCls) {
  var n = c.num;
  // Nummer går alltid gjennom esc, også om de er rare etter en import
  var nh = esc(n), rn = esc(round.n);
  var html = '<div class="km-line">';
  if (_kmEditingOrigin && _kmEditingOrigin.num === n) {
    var err = _kmEditingOrigin.error;
    html += '<input class="km-origin-inp' + (err ? ' km-inp-err' : '') + '" type="text" maxlength="200" data-claim-origin-inp="' + nh + '"' +
      ' value="' + esc(_kmEditingOrigin.value) + '" placeholder="f.eks. 1+4 eller ny"' +
      ' aria-label="Opphav i brev ' + rn + ', krav ' + nh + '"' + (err ? ' aria-invalid="true"' : '') + ' />' +
      (err ? '<span class="km-err" role="alert">' + esc(err) + '</span>' : '');
  } else if (!m) {
    html += '<button class="km-origin km-origin-unset" data-claim-origin="' + nh + '" title="Angi hvilket krav i brev ' + rn + ' dette kom fra">← ?</button>' +
      '<span class="km-prev">angi opphav</span>';
  } else {
    html += '<button class="km-origin" data-claim-origin="' + nh + '" title="' + esc(claimOriginHint(c, round, data.docs || [])) + ' — klikk for å endre opphav">' + esc(claimOriginLabel(m)) + '</button>';
  }
  if (m && !(_kmEditingOrigin && _kmEditingOrigin.num === n)) {
    if (m.origin.length === 1) {
      html += '<span class="km-seg" role="group" aria-label="Endring, krav ' + nh + '">' +
        '<button type="button" data-claim-change="' + nh + '" data-change="endret" aria-pressed="' + (m.change === 'endret') + '">Endret</button>' +
        '<button type="button" data-claim-change="' + nh + '" data-change="uendret" aria-pressed="' + (m.change === 'uendret') + '">Uendret</button>' +
        '</span>';
    } else if (m.origin.length > 1) {
      html += '<span class="km-chip km-chip-endret">Endret</span>';
    }
    var prev = claimPrevVerdictText(m, round, data.docs || []);
    if (prev) html += '<span class="km-prev" title="' + esc(prev) + '">' + esc(prev) + '</span>';
    if (m.change !== 'uendret') {
      var p13Cls = m.p13 === true ? 'sak-tri-btn-ok' : m.p13 === false ? 'sak-tri-btn-no' : 'sak-tri-btn-null';
      var p13Txt = m.p13 === true ? '§13 ✓' : m.p13 === false ? '§13 ✗ mangler grunnlag' : '§13 —';
      html += '<button type="button" class="sak-tri-btn ' + p13Cls + ' km-p13-btn" data-claim-p13="' + nh + '" title="' + KM_P13_TITLE + '"' +
        ' aria-label="§ 13-grunnlag, krav ' + nh + ': ' + p13Txt + '">' + p13Txt + '</button>' +
        '<input class="km-basis" type="text" maxlength="' + CLAIM_MAPPING_BASIS_MAX + '" data-claim-basis="' + nh + '" value="' + esc(m.basis) + '"' +
        ' placeholder="Grunnlag (side, linje) …" aria-label="Grunnlag § 13, krav ' + nh + '" />';
    }
  }
  html += '</div>';
  return '<tr class="km-row ' + stateCls + (verdictCls ? ' ' + verdictCls : '') + '"><td colspan="7">' + html + '</td></tr>';
}

// Endres ett krav, arver alle krav som henger under det den nye verdien. Det er
// nøyaktig de radene som må tegnes på nytt. Ren funksjon — se
// test/sakRender.test.js.
function claimsAffectedBy(claims, claimNum) {
  var out = [claimNum], queue = [claimNum];
  while (queue.length) {
    var cur = queue.shift();
    (claims || []).forEach(function(c) {
      if (c.dep === cur && out.indexOf(c.num) === -1) { out.push(c.num); queue.push(c.num); }
    });
  }
  return out.sort(function(a, b) { return a - b; });
}

// Uten krav er det ingenting å vise i tabellen: tomtilstanden tar over.
function claimsTableShown(data) {
  return !!(data && data.numClaims && data.numClaims >= 1);
}

function renderSakClaimsTable(data) {
  var tbody = document.getElementById('sak-claims-tbody');
  var shown = claimsTableShown(data);
  var wrap = document.querySelector('#view-sak .krav-wrap');
  var empty = document.getElementById('sak-claims-empty');
  if (wrap) wrap.hidden = !shown;
  if (empty) empty.hidden = shown;
  if (!shown) {
    tbody.innerHTML = '';
    renderSakClaimsTree(data, null);
    return;
  }
  tbody.innerHTML = data.claims.map(function(c) { return claimRowHtml(data, c); }).join('');
  renderSakClaimsTree(data, _sakActiveClaimNum);
  positionDocPop();
}

// Bytter ut de oppgitte radene uten å røre resten av tabellen. Feltet som har
// fokus beholder det, med markøren der den sto.
function renderClaimRows(data, claimNums) {
  var tbody = document.getElementById('sak-claims-tbody');
  if (!tbody || !data.numClaims) { renderSakClaimsTable(data); return; }

  var active = document.activeElement;
  var keep = active && tbody.contains(active) && active.dataset && active.dataset.claim
    ? { claim: active.dataset.claim, field: active.dataset.field || null,
        cls: (active.className || '').split(' ')[0],
        start: active.selectionStart, end: active.selectionEnd }
    : null;

  claimNums.forEach(function(num) {
    var c  = data.claims.find(function(x) { return x.num === num; });
    var tr = tbody.querySelector('tr[data-claim="' + claimSelVal(num) + '"]');
    if (!c || !tr) return;
    var tmp = document.createElement('tbody');
    tmp.innerHTML = claimRowHtml(data, c);
    // Kravkoblingens underrad hører til raden og byttes sammen med den
    var sub = tr.nextElementSibling;
    if (sub && sub.classList.contains('km-row')) sub.parentNode.removeChild(sub);
    var frag = document.createDocumentFragment();
    while (tmp.firstChild) frag.appendChild(tmp.firstChild);
    tr.replaceWith(frag);
  });

  if (keep) {
    var sel = '[data-claim="' + claimSelVal(keep.claim) + '"]' + (keep.cls ? '.' + keep.cls : '') +
              (keep.field ? '[data-field="' + keep.field + '"]' : '');
    var again = tbody.querySelector(sel);
    if (again) {
      again.focus();
      if (again.setSelectionRange && keep.start !== null && keep.start !== undefined) {
        try { again.setSelectionRange(keep.start, keep.end); } catch(e) {}
      }
    }
  }

  renderSakClaimsTree(data, _sakActiveClaimNum);
  positionDocPop();
}


// ── Mothold: render ────────────────────────────────
function renderSakDocs(data) {
  var el = document.getElementById('sak-docs-mothold');
  if (!el) return;
  var docs = data.docs || [];

  // Advarselen om uvurderte krav hører til hele seksjonen, ikke til én rad.
  var warn = document.getElementById('sak-gr-warn');
  if (warn) {
    var unassessed = (data.claims || []).filter(function(c) {
      return effectiveClaimValue(data.claims, c, 'novelty')   === null ||
             effectiveClaimValue(data.claims, c, 'inventive') === null;
    }).map(function(c) { return c.num; });
    if (docs.length && unassessed.length) {
      warn.textContent = 'Krav ' + formatClaimRanges(unassessed) + ' ikke ferdig vurdert';
      warn.style.display = '';
    } else {
      warn.style.display = 'none';
    }
  }

  if (!docs.length) {
    el.innerHTML = '<button type="button" class="sak-empty-action" id="btn-mh-empty-add">' +
      '<svg class="ti" aria-hidden="true"><use href="#ti-plus"/></svg> Ingen mothold lagt til — legg til det første</button>';
    return;
  }

  // Kategoriene utledes av kravsvurderingen (buildSearchReport).
  var rows = buildSearchReport(data.claims || [], docs);
  var app  = { filingDate: data.filingDate, priorityDate: data.priorityDate };
  var docsCase = cases.find(function(c) { return c.id === activeSakId; });
  var locked = docRemoveWithdraws(docsCase);
  var docRounds = visibleRounds(docsCase, roundsOf(data));
  var cited = citationIndex();
  // Et mothold du står og skriver i, blir stående i redigering selv om det
  // nå har opplysninger — ellers ville feltet forsvinne under markøren.
  var act = document.activeElement;
  var focusRow = act && act.closest && act.closest('#sak-docs-mothold .mh-details');
  var focusIdx = focusRow ? parseInt(focusRow.dataset.idx, 10) : -1;

  el.innerHTML = docs.map(function(d, i) {
    var row  = rows[i];

    if (d.withdrawn) {
      return '<div class="mh-row mh-row-withdrawn" data-idx="' + i + '">' +
        '<span class="mh-id">' + esc(d.id) + '</span>' +
        '<span class="mh-ref"><span class="mh-ref-struck">' + esc(d.ref || '—') + '</span></span>' +
        '<span class="mh-cats"><span class="mh-withdrawn-label">Ikke lenger relevant</span></span>' +
        '<span class="mh-flags"></span><span></span><span></span>' +
        '<button type="button" class="mh-bg-toggle mh-restore" data-mh-restore="' + i + '"' +
          ' title="Gjør motholdet relevant igjen. Kravkoblingene må settes på nytt.">Gjenopprett</button>' +
      '</div>';
    }

    _mhEditing[i] = mhEditStateOnRender(d, _mhEditing[i]);
    var editing = i === focusIdx || mhIsEditing(d, _mhEditing[i]);
    var cats = ['X', 'Y', 'A'].filter(function(cat) { return row[cat].length; })
      .map(function(cat) {
        return '<span class="mh-cat mh-cat-' + cat.toLowerCase() + '">' +
          '<b>' + esc(docCategoryLabel(d, cat)) + '</b> ' + esc(formatClaimRanges(row[cat])) +
        '</span>';
      }).join('');

    return '<div class="mh-row' + (d.background ? ' mh-row-bg' : '') + '" data-idx="' + i + '">' +
      '<span class="mh-id">' + esc(d.id) + '</span>' +
      '<span class="mh-ref">' +
        '<input class="mh-ref-inp" type="text" data-idx="' + i + '" value="' + esc(d.ref) + '" placeholder="f.eks. WO 2020/123456 A1" aria-label="Publikasjonsnummer for ' + esc(d.id) + '" />' +
        mhExtLinkHtml(d) +
        mhOpsBtnHtml(d, i) +
      '</span>' +
      '<span class="mh-cats">' + '<span class="mh-cited-slot" data-idx="' + i + '">' + mhCitedHtml(citedElsewhere(cited, d.ref, activeSakId)) + '</span>' +
        mhRoundBadgeHtml(docRounds, d.id) + (cats || '<span class="mh-cats-none">ingen vurderte krav</span>') + '</span>' +
      '<span class="mh-flags">' + mhFlagsHtml(d, i, app) + '</span>' +
      '<button class="mh-bg-toggle" data-bg="' + i + '" aria-pressed="' + (d.background ? 'true' : 'false') + '" title="Kun bakgrunn — gir A på alle vurderte krav">Bakgrunn</button>' +
      mhEditBtnHtml(d, i, editing) +
      '<button class="btn-icon btn-sak-class-del" data-mh-del="' + i + '"' +
        ' title="' + (locked ? 'Ikke lenger relevant – brev er sendt, motholdet beholder nummeret sitt' : 'Fjern') + '"' +
        ' aria-label="' + esc((locked ? 'Merk ikke lenger relevant: ' : 'Fjern ') + d.id) + '"><svg class="ti" aria-hidden="true"><use href="#ti-x"/></svg></button>' +
      '<div class="mh-details" data-idx="' + i + '">' +
        mhDetailsInnerHtml(d, i, editing) +
      '</div>' +
    '</div>';
  }).join('');
  el.querySelectorAll('.mh-date-inp').forEach(autoFormatDateInput);
}

// ── Motholdets opplysninger: tekst, eller felt etter «Rediger» ──
// _mhEditing[idx]: true etter «Rediger», false etter «Ferdig», 'pinned' når
// motholdet ble tegnet tomt (se mhEditStateOnRender), ellers ikke satt.
// Nullstilles når en sak åpnes og når et mothold fjernes.
var _mhEditing = {};

// Et mothold som tegnes uten opplysninger, låses i redigering til «Ferdig»
// eller til saken åpnes på nytt — ellers ville det hoppe til tekst ved neste
// tegning så snart én dato er skrevet inn.
function mhEditStateOnRender(d, explicit) {
  if (explicit === undefined && !docHasDetails(d)) return 'pinned';
  return explicit;
}

// Etter et OPS-oppslag: tilbake til tekst bare når redigeringen kom av at
// motholdet var tomt — ikke når du selv valgte «Rediger», og ikke mens du
// står i feltene.
function mhLeaveAfterFill(state, focusInFields) {
  return state === 'pinned' && !focusInFields;
}

// Et felt under nummeret (dato, søker, oppfinner, tittel) — ikke nummerfeltet.
function isMhDetailInput(el) {
  return !!el && el.matches('input') && !!el.closest('.mh-details');
}

// Pågående OPS-oppslag, nøkkel «saks-id|idx» (se opsBusyStart).
var _mhOpsBusy = {};
function mhOpsBusyKey(idx) { return activeSakId + '|' + idx; }

function mhDetailsInnerHtml(d, i, editing) {
  var busy = !!_mhOpsBusy[mhOpsBusyKey(i)];
  return (editing ? mhEditHtml(d, i) : mhReadHtml(d, i)) +
    '<span class="mh-busy"' + (busy ? '' : ' hidden') + '>Henter fra OPS…</span>';
}

// Oppdaterer opplysningene på én rad etter et oppslag, uten å tegne lista på
// nytt: står du og skriver et annet sted, beholder du markøren og teksten.
// Står du i et felt på denne raden, fylles bare de andre feltene.
function refreshMhDetails(data, idx) {
  var el = document.querySelector('#sak-docs-mothold .mh-details[data-idx="' + idx + '"]');
  var d = data && data.docs && data.docs[idx];
  if (!el || !d) return;
  var act = document.activeElement;
  if (act && el.contains(act) && isMhDetailInput(act)) {
    el.querySelectorAll('input').forEach(function(inp) {
      if (inp === act) return;
      var f = inp.dataset.field || (inp.classList.contains('mh-title-inp') ? 'title' : '');
      if (!f) return;
      var v = (f === 'pubDate' || f === 'effDate') ? toDisplay(d[f]) : (d[f] || '');
      inp.value = v; inp.title = v;
    });
  } else {
    var editing = mhIsEditing(d, _mhEditing[idx]);
    // Sto fokus på en verdi, får samme plass fokus igjen etter oppdateringen
    var vals = Array.prototype.slice.call(el.querySelectorAll('.mh-v'));
    var vPos = act && el.contains(act) ? vals.indexOf(act) : -1;
    el.innerHTML = mhDetailsInnerHtml(d, idx, editing);
    if (vPos > -1) { var nv = el.querySelectorAll('.mh-v')[vPos]; if (nv && nv.hasAttribute('tabindex')) nv.focus(); }
    el.querySelectorAll('.mh-date-inp').forEach(autoFormatDateInput);
    // Knappen skal si det samme som visningen
    var eb = document.querySelector('#sak-docs-mothold [data-mh-edit="' + idx + '"]');
    if (eb) {
      var hadFocus = eb === document.activeElement;
      eb.outerHTML = mhEditBtnHtml(d, idx, editing);
      if (hadFocus) { var nb = document.querySelector('#sak-docs-mothold [data-mh-edit="' + idx + '"]'); if (nb) nb.focus(); }
    }
  }
  refreshMhFlags(data);
}

// Et mothold uten opplysninger står i redigering til du sier «Ferdig».
function mhIsEditing(d, explicit) {
  if (explicit === 'pinned') return true;
  if (explicit === true || explicit === false) return explicit;
  return !docHasDetails(d);
}

function mhEditBtnHtml(d, i, editing) {
  return '<button type="button" class="mh-edit" data-mh-edit="' + i + '" aria-pressed="' + (editing ? 'true' : 'false') + '"' +
    ' title="' + (editing ? 'Vis opplysningene som tekst (Esc)' : 'Rediger datoer, søker, oppfinner og tittel') + '"' +
    ' aria-label="' + esc((editing ? 'Ferdig med ' : 'Rediger ') + d.id) + '">' +
    (editing ? '✓ Ferdig' : '✎ Rediger') + '</button>';
}

// Én verdi i lesevisningen. Klikk (eller Enter) kopierer den; en tom verdi
// er «—» og kopierer ingenting.
function mhReadValueHtml(value, label, cls) {
  var c = 'mh-v' + (cls ? ' ' + cls : '');
  if (!value) return '<span class="' + c + ' mh-v-empty">—</span>';
  return '<span class="' + c + '" data-copy role="button" tabindex="0"' +
    ' title="Klikk for å kopiere" aria-label="' + esc(label + ': ' + value + ' – klikk for å kopiere') + '">' + esc(value) + '</span>';
}

// Lesevisningen: datoene, så søker og oppfinner, så tittelen sist. Ingenting
// kuttes; en lang tittel brytes.
function mhReadHtml(d, i) {
  var k = function(t) { return '<span class="mh-k">' + esc(t) + '</span>'; };
  return '<div class="mh-read" data-idx="' + i + '">' +
    k('Publisert') + mhReadValueHtml(toDisplay(d.pubDate), 'Publisert') +
    k('Prioritet/inng.') + mhReadValueHtml(toDisplay(d.effDate), 'Prioritet/inng.') +
    k('Søker') + mhReadValueHtml(d.applicants, 'Søker') +
    k('Oppfinner') + mhReadValueHtml(d.inventors, 'Oppfinner') +
    k('CPC') + (d.cpc ? '<span class="mh-v-wide mh-cpc-list">' + mhCpcHtml(d.cpc) + '</span>'
                      : '<span class="mh-v mh-v-wide mh-v-empty">—</span>') +
    k('Tittel') + mhReadValueHtml(d.title, 'Tittel', 'mh-v-wide') +
  '</div>';
}

// Feltene, i samme rekkefølge som teksten.
function mhEditHtml(d, i) {
  return '<span class="mh-dates">' +
      mhDateHtml(d, i, 'pubDate', 'Publisert') +
      mhDateHtml(d, i, 'effDate', 'Prioritet/inng.') +
    '</span>' +
    '<span class="mh-parties">' +
      mhPartyHtml(d, i, 'applicants', 'Søker') +
      mhPartyHtml(d, i, 'inventors', 'Oppfinner') +
    '</span>' +
    '<span class="mh-parties">' +
      mhPartyHtml(d, i, 'cpc', 'CPC', CPC_MAX_LEN, 'f.eks. G01F25/15; G01N33/0006') +
    '</span>' +
    '<label class="mh-title">Tittel ' +
      '<input class="mh-title-inp" type="text" data-idx="' + i + '" value="' + esc(d.title) + '"' +
      ' title="' + esc(d.title) + '" placeholder="hentes med ⤓, eller skriv selv" autocomplete="off"' +
      ' aria-label="' + esc('Tittel for ' + d.id) + '" /></label>';
}

// Klassene i CPC-feltet, hver for seg: klikk kopierer én klasse, og hover
// eller fokus viser hierarkiet fra CPC-databasen når den er lastet — som for
// sakens egne klasser.
function mhCpcHtml(text) {
  return String(text || '').split(';').map(function(c) { return c.trim(); }).filter(Boolean)
    .map(function(code) {
      return '<span class="mh-cpc-item">' + mhReadValueHtml(code, 'CPC', 'mh-cpc') +
        cpcTooltipHtml(code.replace(/\s+/g, ''), 1) + '</span>';
    }).join('<span class="mh-cpc-sep" aria-hidden="true"> · </span>');
}

// «✓ Kopiert: …» — en lang tittel kortes i meldingen (ikke i det som kopieres).
function copyToastText(v) {
  v = String(v || '');
  return '✓ Kopiert: ' + (v.length > 60 ? v.slice(0, 59) + '…' : v);
}

function mhPartyHtml(d, i, field, label, maxLen, placeholder) {
  return '<label class="mh-party">' + esc(label) + ' ' +
    '<input class="mh-party-inp" type="text" data-idx="' + i + '" data-field="' + field + '"' +
    ' value="' + esc(d[field]) + '" title="' + esc(d[field]) + '" maxlength="' + (maxLen || PARTY_MAX_LEN) + '"' +
    ' placeholder="' + esc(placeholder || 'hentes med ⤓, eller skriv selv') + '" autocomplete="off"' +
    ' aria-label="' + esc(label + ' for ' + d.id) + '" /></label>';
}

// ── Sitert i andre saker ──
// Indeksen bygges når en sak åpnes (renderSak nullstiller den) og gjenbrukes
// til saken forlates: de andre sakene endrer seg ikke mens du står her, og
// denne saken selv er aldri med i treffene.
var _citedIndex = null; // { forId, index }
function citationIndex() {
  if (!_citedIndex || _citedIndex.forId !== activeSakId) {
    _citedIndex = { forId: activeSakId, index: buildCitationIndex(cases, loadSakDataQuiet) };
  }
  return _citedIndex.index;
}

// Som loadSakData, men uten varsel og uten å bevare råteksten: indeksen
// leser alle de andre sakene, og en korrupt sak skal meldes når den åpnes,
// ikke hver gang en annen sak åpnes.
function loadSakDataQuiet(id) {
  try { var raw = localStorage.getItem(sakKey(id)); return raw ? JSON.parse(raw) : null; }
  catch (e) { return null; }
}

// Statusen slik Ctrl+K skriver den: et ferdig oppdrag er «Avsluttet oppdrag».
function citedStatusLabel(e) {
  if (e.type === 'oppdrag') return e.status === 'avsluttet' ? 'Avsluttet oppdrag' : 'Oppdrag';
  return (STATUS_CONFIG[e.status] || {}).label || e.status;
}

function citedBadgeText(n) { return 'også i ' + n + (n === 1 ? ' sak' : ' saker'); }

// «D2 · X, Y», «D1 · ikke lenger relevant» eller «D3 · ikke vurdert».
function citedEntryWhat(e) {
  return e.docId + ' · ' + (e.withdrawn ? 'ikke lenger relevant' : e.cats.length ? e.cats.join(', ') : 'ikke vurdert');
}

function mhCitedHtml(entries) {
  if (!entries.length) return '';
  return '<details class="mh-cited"><summary title="Dokumentet er også mothold i andre saker">' +
    esc(citedBadgeText(entries.length)) + '</summary>' +
    '<ul class="mh-cited-list">' + entries.map(function(e) {
      var status = citedStatusLabel(e);
      return '<li><button type="button" class="mh-cited-open" data-cited-open="' + esc(e.caseId) + '">' +
        '<span class="mh-cited-cn">' + esc(e.caseNumber) + '</span>' +
        '<span class="mh-cited-t">' + esc(e.title) + '</span>' +
        '<span class="mh-cited-st">' + esc(status) + '</span>' +
        '<span class="mh-cited-what' + (e.withdrawn ? ' mh-cited-gone' : '') + '">' + esc(citedEntryWhat(e)) + '</span>' +
      '</button></li>';
    }).join('') + '</ul></details>';
}

// Etter at et publikasjonsnummer er endret: bare merkene byttes, så feltet
// du skriver i beholder fokus.
function refreshMhCited(data) {
  var cited = citationIndex();
  (data.docs || []).forEach(function(d, i) {
    var slot = document.querySelector('#sak-docs-mothold .mh-cited-slot[data-idx="' + i + '"]');
    if (slot) slot.innerHTML = mhCitedHtml(citedElsewhere(cited, d.ref, activeSakId));
  });
}

// «ny i runde N» på et mothold som ikke var med i første runde. Ingen merking
// når saken ikke har lagrede runder.
function mhRoundBadgeHtml(rounds, docId) {
  var first = docFirstRound(rounds, docId);
  if (!first || first <= 1) return '';
  return '<span class="mh-round-new" title="' + esc('Kom til i runde ' + first + ' – ikke med i tidligere brev') + '">' +
    esc('ny i runde ' + first) + '</span>';
}

// P/E-knappene. Et forslag vises som stiplet kant med begrunnelsen i
// verktøytipset, men bare så lenge flagget ikke er satt — klikk godtar det.
function mhFlagsHtml(d, i, app) {
  var sug = suggestDocFlags(d, app);
  return mhFlagHtml(i, 'p', d.p, sug.p, sug.pReason, 'P — mellomliggende dokument') +
         mhFlagHtml(i, 'e', d.e, sug.e, sug.eReason, 'E — eldre søknad publisert på eller etter inngivelsesdagen');
}

// En datoendring påvirker bare forslagene. Å tegne hele lista på nytt ville
// tatt fokus fra feltet du tabbet til.
function refreshMhFlags(data) {
  var app = { filingDate: data.filingDate, priorityDate: data.priorityDate };
  (data.docs || []).forEach(function(d, i) {
    var flags = document.querySelector('#sak-docs-mothold .mh-row[data-idx="' + i + '"] .mh-flags');
    if (flags) flags.innerHTML = mhFlagsHtml(d, i, app);
  });
}

function mhFlagHtml(i, flag, pressed, suggested, reason, title) {
  var hint = suggested && !pressed;
  return '<button class="mh-flag' + (hint ? ' mh-flag-suggest' : '') + '" data-flag="' + flag + '" data-idx="' + i + '"' +
    ' aria-pressed="' + (pressed ? 'true' : 'false') + '"' +
    ' title="' + esc(hint ? 'Foreslått ' + flag.toUpperCase() + ': ' + reason : title) + '">' + flag.toUpperCase() + '</button>';
}

function mhDateHtml(d, i, field, label) {
  return '<label class="mh-date">' + esc(label) +
    ' <input class="mh-date-inp" type="text" data-idx="' + i + '" data-field="' + field + '"' +
    ' value="' + esc(toDisplay(d[field])) + '" placeholder="åååå.mm.dd" maxlength="10" autocomplete="off"' +
    ' aria-label="' + esc(label + ' for ' + d.id) + '" /></label>';
}


// ↗-lenken etter referansefeltet. Den står der også når feltet er tomt, men
// er da grå og uten mål; syncMhExtLink() holder den à jour mens du skriver.
function mhExtLinkHtml(d) {
  var url = espacenetUrl(d.ref);
  return '<a class="mh-ext" ' + (url ? 'href="' + esc(url) + '"' : 'aria-disabled="true"') +
    ' target="_blank" rel="noopener noreferrer" title="Åpne i Espacenet" ' +
    'aria-label="Åpne ' + esc(d.id) + ' i Espacenet"><svg class="ti" aria-hidden="true"><use href="#ti-external-link"/></svg></a>';
}

function syncMhExtLink(inp) {
  var a = inp.parentNode && inp.parentNode.querySelector('.mh-ext');
  if (!a) return;
  var url = espacenetUrl(inp.value);
  if (url) { a.href = url; a.removeAttribute('aria-disabled'); }
  else     { a.removeAttribute('href'); a.setAttribute('aria-disabled', 'true'); }
  var btn = inp.parentNode.querySelector('.mh-ops');
  if (btn) btn.outerHTML = mhOpsBtnHtml({ id: btn.dataset.docId, ref: inp.value }, parseInt(btn.dataset.ops, 10));
}

// ⤓-knappen: henter datoene fra EPO OPS. Grå når referansen mangler eller
// nøklene ikke er lagt inn; verktøytipset sier hvorfor.
function mhOpsBtnHtml(d, i) {
  var why = !hasOpsCreds() ? 'Legg inn OPS-nøklene under Innstillinger for å hente datoer'
          : !opsPubNumber(d.ref) ? 'Skriv et publikasjonsnummer først'
          : '';
  return '<button type="button" class="mh-ops" data-ops="' + i + '" data-doc-id="' + esc(d.id) + '"' +
    (why ? ' aria-disabled="true"' : '') +
    (_mhOpsBusy[mhOpsBusyKey(i)] ? ' aria-busy="true"' : '') +
    ' title="' + esc(why || 'Hent datoer, søker, oppfinner og tittel fra EPO OPS igjen (fyller bare tomme felt). Skjer av seg selv når du fører inn et nytt nummer.') + '"' +
    ' aria-label="Hent opplysninger for ' + esc(d.id) + ' fra EPO OPS">' +
    '<svg class="ti" aria-hidden="true"><use href="#ti-download"/></svg></button>';
}

// Teksten etter et oppslag: hva som ble fylt inn, og hvor OPS er uenig med
// datoer du alt har ført inn (de røres ikke).
function opsFillMessage(plan, dates) {
  var label = { pubDate: 'publisert', effDate: 'prioritet/inng.' };
  // Tittelen er for lang for meldingen — den står i feltet
  var words = { title: 'tittel', applicants: 'søker', inventors: 'oppfinner', cpc: 'CPC' };
  var filled = Object.keys(plan.patch).map(function(f) {
    return words[f] || label[f] + ' ' + toDisplay(plan.patch[f]);
  });
  var parts = [];
  parts.push(filled.length ? '✓ Hentet fra OPS (' + dates.kind + '): ' + filled.join(', ')
                           : 'Ingen tomme datofelt å fylle (OPS ' + dates.kind + ')');
  // Bare når oppslaget faktisk lette etter navn (parseOpsBiblio setter feltene)
  if ('applicants' in dates || 'inventors' in dates) {
    var missing = [dates.applicants ? '' : 'søker', dates.inventors ? '' : 'oppfinner'].filter(Boolean);
    if (missing.length) parts.push('OPS har ikke ' + missing.join(' eller '));
  }
  plan.conflicts.forEach(function(c) {
    parts.push('OPS sier ' + label[c.field] + ' ' + toDisplay(c.ops) + ', du har ' + toDisplay(c.mine) + ' — ikke endret');
  });
  return parts.join('. ') + '.';
}

// Chip ved siden av tri-state-knappen: vises bare når vurderingen er ✗, altså
// når et mothold faktisk har tatt nyheten eller oppfinnelseshøyden.
function claimDocChipHtml(data, c, field, effNovelty) {
  var isNovelty = field === 'novelty';
  var val = isNovelty ? effNovelty : effectiveClaimValue(data.claims, c, 'inventive');
  // Reserverer chipens plass selv når den ikke er aktuell ennå, slik at
  // tri-state-knappen ikke hopper sidelengs når chipen dukker opp/forsvinner
  // (cellen sentrerer wrapperen, så totalbredden må holdes stabil).
  if (val !== false) {
    return '<span class="claim-doc-chip claim-doc-chip-empty claim-doc-chip-placeholder" aria-hidden="true">velg</span>';
  }

  // Krav uten nyhet har låst oppfinnelseshøyde og arver nyhetsmotholdet.
  if (!isNovelty && effNovelty === false) {
    return '<span class="claim-doc-chip claim-doc-chip-inherit" title="Arvet fra nyhetsvurderingen">' +
      esc(c.noveltyDoc || '—') + '</span>';
  }

  var ids  = isNovelty ? (c.noveltyDoc ? [c.noveltyDoc] : []) : (c.inventiveDocs || []);
  var open = _sakOpenDocPop && _sakOpenDocPop.claimNum === c.num && _sakOpenDocPop.field === field;
  var cls  = 'claim-doc-chip' + (ids.length ? '' : ' claim-doc-chip-empty');
  return '<span class="claim-doc-wrap">' +
    '<button class="' + cls + '" data-doc-pop=\"' + esc(c.num) + '\" data-field="' + field + '" title="Velg mothold">' +
      (ids.length ? esc(ids.join('+')) : 'velg') +
    '</button>' +
    (open ? claimDocPopHtml(data, c, field, ids) : '') +
  '</span>';
}

function claimDocPopHtml(data, c, field, ids) {
  var isNovelty  = field === 'novelty';
  var selectable = claimDocSelectable(data.docs, field);
  if (!selectable.length) {
    var onlyE = !isNovelty && claimDocSelectable(data.docs, 'novelty').length > 0;
    return '<span class="doc-pop"><span class="doc-pop-hint" style="border-top:none;margin-top:0;">' +
      (onlyE ? 'E-dokumenter teller bare for nyhet, ikke for oppfinnelseshøyde.'
             : 'Ingen mothold registrert ennå.') + '</span></span>';
  }
  var opts = selectable.map(function(d) {
    var on   = ids.indexOf(d.id) !== -1;
    var full = !isNovelty && !on && ids.length >= MAX_INVENTIVE_DOCS;
    return '<button class="doc-pop-opt" role="checkbox" aria-checked="' + (on ? 'true' : 'false') + '"' +
      (full ? ' disabled' : '') +
      ' data-doc-pick="' + esc(d.id) + '" data-claim=\"' + esc(c.num) + '\" data-field="' + field + '">' +
      '<span class="doc-pop-box">' + (on ? '✓' : '') + '</span>' +
      '<strong>' + esc(d.id) + '</strong><span>' + esc(d.ref || '') + '</span>' +
    '</button>';
  }).join('');
  var copyIds = claimDocCopySource(data.claims, c.num, field, data.docs);
  var copy = copyIds
    ? '<button class="doc-pop-copy" data-doc-copy=\"' + esc(c.num) + '\" data-field="' + field + '"' +
        ' title="Erstatt valget med motholdene fra krav ' + esc(c.num - 1) + ' (hurtigtast C)">' +
        '⧉ Som krav ' + esc(c.num - 1) + ' (' + esc(copyIds.join('+')) + ')</button>'
    : '';
  return '<span class="doc-pop">' + copy +
    '<span class="doc-pop-title">' + (isNovelty ? 'Nyheten tas av' : 'Oppfinnelseshøyden tas av') + '</span>' +
    opts +
    '<span class="doc-pop-hint">' + (isNovelty
      ? 'Ett mothold.'
      : 'Ett mothold gir X, to gir Y. Maks ' + MAX_INVENTIVE_DOCS + '.') + '</span>' +
  '</span>';
}

// Plasserer den åpne mothold-velgeren under chipen, og over den hvis det er
// for lite plass under. Kalles etter hver tegning av kravstabellen.
function positionDocPop() {
  var pop = document.querySelector('.doc-pop');
  if (!pop) return;
  var chip = pop.parentNode.querySelector('[data-doc-pop]');
  if (!chip) return;
  var r = chip.getBoundingClientRect();
  var w = pop.offsetWidth, h = pop.offsetHeight, gap = 6, edge = 8;
  var left = r.left + (r.width - w) / 2;
  left = Math.max(edge, Math.min(left, window.innerWidth - w - edge));
  var top = r.bottom + gap;
  if (top + h > window.innerHeight - edge) top = Math.max(edge, r.top - h - gap);
  pop.style.left = left + 'px';
  pop.style.top  = top + 'px';
}

function formatClaimRanges(nums) {
  if (!nums.length) return '—';
  nums = nums.slice().sort(function(a,b){ return a-b; });
  var ranges = [], start = nums[0], end = nums[0];
  for (var i = 1; i < nums.length; i++) {
    if (nums[i] === end + 1) { end = nums[i]; }
    else { ranges.push(start === end ? String(start) : start + '–' + end); start = end = nums[i]; }
  }
  ranges.push(start === end ? String(start) : start + '–' + end);
  return ranges.join(', ');
}

function renderSakResultSummary(data) {
  var el = document.getElementById('sak-result-summary');
  if (!data.numClaims || data.numClaims < 1) {
    el.innerHTML = '';
    return;
  }

  var noveltyYes = [], noveltyNo = [], noveltyNull = [];
  var inventiveYes = [], inventiveNo = [], inventiveNull = [];
  var formalNo = [], formalYes = [];
  var patentable = [], patentableFormal = [], notPatentable = [], notAssessed = [];

  data.claims.forEach(function(c) {
    var effN = effectiveClaimValue(data.claims, c, 'novelty');
    var effI = effectiveClaimValue(data.claims, c, 'inventive');
    var unassessed = effN === null || effI === null;

    // Nyhet
    if (effN === true)       noveltyYes.push(c.num);
    else if (effN === false) noveltyNo.push(c.num);
    else                     noveltyNull.push(c.num);

    // Oppfinnelseshøyde
    if (effN === false) {
      inventiveNo.push(c.num);
    } else if (effN === true) {
      if (effI === true)       inventiveYes.push(c.num);
      else if (effI === false) inventiveNo.push(c.num);
      else                     inventiveNull.push(c.num);
    }

    // Formelle feil — kun på vurderte krav
    if (!unassessed) {
      if (c.formal === false || c.formal === null) formalNo.push(c.num);
      if (c.formal === true)  formalYes.push(c.num);
    }

    // Resultat
    if (unassessed) { notAssessed.push(c.num); return; }
    var patentOk = effN === true && effI === true;
    if (patentOk && !c.formal)       patentable.push(c.num);
    else if (patentOk && c.formal)   patentableFormal.push(c.num);
    else                             notPatentable.push(c.num);
  });

  var sections = [
    {
      title: 'Nyhet',
      rows: [
        { label: 'Ja',           nums: noveltyYes,  cls: 'res-ok' },
        { label: 'Nei',          nums: noveltyNo,   cls: 'res-no' },
        { label: 'Ikke vurdert', nums: noveltyNull, cls: 'res-unassessed' }
      ]
    },
    {
      title: 'Oppfinnelseshøyde',
      rows: [
        { label: 'Ja',           nums: inventiveYes,  cls: 'res-ok' },
        { label: 'Nei',          nums: inventiveNo,   cls: 'res-no' },
        { label: 'Ikke vurdert', nums: inventiveNull, cls: 'res-unassessed' }
      ]
    },
    {
      title: 'Formelle feil',
      rows: [
        { label: 'Nei', nums: formalNo,  cls: 'res-ok' },
        { label: 'Ja',  nums: formalYes, cls: 'res-formal-yes' }
      ]
    },
    {
      title: 'Resultat',
      rows: [
        { label: 'Patenterbar',              nums: patentable,       cls: 'res-patent' },
        { label: 'Patenterbar (form. feil)', nums: patentableFormal, cls: 'res-patent-formal' },
        { label: 'Ikke patenterbar',         nums: notPatentable,    cls: 'res-no' },
        { label: 'Ikke vurdert',             nums: notAssessed,      cls: 'res-unassessed' }
      ]
    }
  ];

  var noteHtml = patentableFormal.length
    ? '<div class="res-footnote">* patenterbar, men med formelle feil</div>' : '';

  el.innerHTML = '<div class="sak-result-cols">' +
    sections.map(function(sec) {
      return '<div class="sak-result-col">' +
        '<div class="sak-result-col-title">' + sec.title + '</div>' +
        sec.rows.map(function(r) {
          return '<div class="res-row ' + r.cls + (r.nums.length === 0 ? ' res-row-empty' : '') + '">' +
            '<span class="res-label">' + r.label + ':</span>' +
            '<span class="res-nums">' + (r.nums.length ? formatClaimRanges(r.nums) : '—') + '</span>' +
          '</div>';
        }).join('') +
      '</div>';
    }).join('') +
  '</div>' + noteHtml;
}

function updateSakProgress(data) {
  // Sjekkliste-progress (i Viderebehandling: sjekklisten for svaret)
  var progCase = activeSakId && cases.find(function(c) { return c.id === activeSakId; });
  var prog    = sakChecklistProgress(progCase, data, getChecklistTemplate());
  var total   = prog.total;
  var done    = prog.done;
  var clPct   = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('sak-prog-checklist-label').textContent = prog.label;
  document.getElementById('sak-sticky-cl-label').textContent = prog.label;
  document.getElementById('sak-prog-checklist-pct').textContent = done + ' / ' + total;
  document.getElementById('sak-prog-checklist-bar').style.width  = clPct + '%';

  // Kravsvurdering-progress — vurdert = effektiv nyhet OG effektiv oppfinnelseshøyde er satt
  var numC    = data.numClaims || 0;
  var assessed = (data.claims || []).filter(function(c) {
    return effectiveClaimValue(data.claims, c, 'novelty') !== null &&
           effectiveClaimValue(data.claims, c, 'inventive') !== null;
  }).length;
  var crPct   = numC ? Math.round((assessed / numC) * 100) : 0;
  document.getElementById('sak-prog-claims-pct').textContent = assessed + ' / ' + numC;
  document.getElementById('sak-prog-claims-bar').style.width  = crPct + '%';

  // Sync sticky bar
  document.getElementById('sak-sticky-cl-pct').textContent = done + ' / ' + total;
  document.getElementById('sak-sticky-cl-bar').style.width  = clPct + '%';
  document.getElementById('sak-sticky-cr-pct').textContent = assessed + ' / ' + numC;
  document.getElementById('sak-sticky-cr-bar').style.width  = crPct + '%';

  // Kolonneoverskrifter — fremdrift per kolonne
  if (numC > 0) {
    var noveltyDone    = (data.claims || []).filter(function(c) { return effectiveClaimValue(data.claims, c, 'novelty') !== null; }).length;
    var inventiveDone  = (data.claims || []).filter(function(c) {
      var en = effectiveClaimValue(data.claims, c, 'novelty');
      var ei = effectiveClaimValue(data.claims, c, 'inventive');
      return en === false || ei !== null;
    }).length;
    var inventiveTotal = numC;
    var formalDone     = (data.claims || []).filter(function(c) { return c.formal !== null; }).length;

    function thHtml(label, doneCount, totalCount) {
      var allDone = doneCount >= totalCount;
      var sub = allDone
        ? '<span class="th-col-progress th-col-done">✓ Ferdig</span>'
        : '<span class="th-col-progress">' + doneCount + ' / ' + totalCount + '</span>';
      return '<span class="th-col-label">' + label + '</span>' + sub;
    }

    var thN = document.getElementById('sak-th-novelty');
    var thI = document.getElementById('sak-th-inventive');
    var thF = document.getElementById('sak-th-formal');
    if (thN) thN.innerHTML = thHtml('Nyhet', noveltyDone, numC);
    if (thI) thI.innerHTML = thHtml('Oppfinnelses&shy;høyde', inventiveDone, inventiveTotal || numC);
    if (thF) thF.innerHTML = thHtml('Formelle feil', formalDone, numC);
  }

  updateStickySummary(data);
}

function updateStickySummary(data) {
  var el = document.getElementById('sak-sticky-summary');
  if (!el || !data.numClaims) { if (el) el.innerHTML = ''; return; }

  var noveltyYes = [], noveltyNo = [];
  var inventiveYes = [], inventiveNo = [];
  var patentable = [], patentableFormal = [], notPatentable = [], notAssessed = [];

  data.claims.forEach(function(c) {
    var effN = effectiveClaimValue(data.claims, c, 'novelty');
    var effI = effectiveClaimValue(data.claims, c, 'inventive');
    var unassessed = effN === null || effI === null;
    if (effN === true)  noveltyYes.push(c.num);
    if (effN === false) noveltyNo.push(c.num);
    if (effN === false)                                    inventiveNo.push(c.num);
    else if (effN === true && effI === true)        inventiveYes.push(c.num);
    else if (effN === true && effI === false)       inventiveNo.push(c.num);
    if (!unassessed) {
      var ok = effN === true && effI === true;
      if (ok && !c.formal)     patentable.push(c.num);
      else if (ok && c.formal) patentableFormal.push(c.num);
      else                     notPatentable.push(c.num);
    } else {
      notAssessed.push(c.num);
    }
  });

  function badge(lbl, nums, cls) {
    if (!nums.length) return '';
    return '<span class="ss-badge ' + cls + '"><span class="ss-badge-lbl">' + lbl + '</span>' + formatClaimRanges(nums) + '</span>';
  }
  var sep = '<div class="ss-col-sep"></div>';

  // Rad 1: ✓-rader
  var row1 =
    '<span class="ss-row-lbl"></span>' +
    '<div class="ss-cell">' + badge('N✓', noveltyYes, 'ss-badge-ok') + '</div>' +
    sep +
    '<div class="ss-cell">' + badge('OH✓', inventiveYes, 'ss-badge-ok') + '</div>' +
    sep +
    '<div class="ss-cell">' +
      badge('✓', patentable, 'ss-badge-ok') +
      badge('✓*', patentableFormal, 'ss-badge-patf') +
    '</div>';

  // Rad 2: ✗-rader
  var row2 =
    '<span class="ss-row-lbl"></span>' +
    '<div class="ss-cell">' + badge('N✗', noveltyNo, 'ss-badge-no') + '</div>' +
    sep +
    '<div class="ss-cell">' + badge('OH✗', inventiveNo, 'ss-badge-no') + '</div>' +
    sep +
    '<div class="ss-cell">' +
      badge('✗', notPatentable, 'ss-badge-no') +
      badge('?', notAssessed, 'ss-badge-null') +
    '</div>';

  el.innerHTML = '<div class="sak-sticky-grid">' + row1 + row2 + '</div>';
}

// ── Sticky-bar: IntersectionObserver ──────────────
var _sakStickyObserver = null;

function initSakStickyBar(hideBar) {
  var bar      = document.getElementById('sak-sticky-bar');
  var sentinel = document.getElementById('sak-summary-sentinel');
  if (!bar || !sentinel) return;
  if (_sakStickyObserver) _sakStickyObserver.disconnect();
  if (hideBar) {
    bar.classList.remove('sak-sticky-visible');
    bar.setAttribute('aria-hidden', 'true');
    return;
  }
  _sakStickyObserver = new IntersectionObserver(function(entries) {
    var hidden = !entries[0].isIntersecting;
    bar.classList.toggle('sak-sticky-visible', hidden);
    bar.setAttribute('aria-hidden', hidden ? 'false' : 'true');
  }, { threshold: 0, rootMargin: '-64px 0px 0px 0px' });
  _sakStickyObserver.observe(sentinel);
}

