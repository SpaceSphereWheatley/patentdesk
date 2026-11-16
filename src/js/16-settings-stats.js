// ── Innstillinger ──────────────────────────────────
// ── Innstillinger: venstremeny ─────────────────────
// Rekkefølgen følger menyen; piltastene går i denne rekkefølgen.
var SETTINGS_TABS = ['arbeidsmengde', 'frister', 'saksbehandling', 'data', 'bruk'];
// v4.35.0 lagret underseksjonen; den åpner nå hovedseksjonen den hører til.
var SETTINGS_TAB_LEGACY = { produksjon: 'arbeidsmengde', sakstype: 'arbeidsmengde', ferie: 'arbeidsmengde', medlesere: 'saksbehandling', sjekkliste: 'saksbehandling', saksmappe: 'saksbehandling', cpc: 'saksbehandling', sikkerhetskopi: 'data', eksport: 'data', faresone: 'data', om: 'data' };

function normalizeSettingsTab(id) {
  if (SETTINGS_TABS.indexOf(id) !== -1) return id;
  if (typeof id === 'string' && Object.prototype.hasOwnProperty.call(SETTINGS_TAB_LEGACY, id)) return SETTINGS_TAB_LEGACY[id];
  return SETTINGS_TABS[0];
}

function stepSettingsTab(id, delta) {
  var n = SETTINGS_TABS.length;
  var i = Math.max(0, SETTINGS_TABS.indexOf(id));
  return SETTINGS_TABS[((i + delta) % n + n) % n];
}

function loadSettingsTab() {
  try { return normalizeSettingsTab(localStorage.getItem(SETTINGS_TAB_KEY)); } catch(e) { return SETTINGS_TABS[0]; }
}

function showSettingsTab(id, focus) {
  id = normalizeSettingsTab(id);
  try { localStorage.setItem(SETTINGS_TAB_KEY, id); } catch(e) {}
  document.querySelectorAll('[data-settings-tab]').forEach(function(btn) {
    var on = btn.dataset.settingsTab === id;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
    btn.tabIndex = on ? 0 : -1;
    if (on && focus) btn.focus();
  });
  document.querySelectorAll('[data-settings-pane]').forEach(function(pane) {
    pane.classList.toggle('is-active', pane.dataset.settingsPane === id);
  });
  if (id === 'bruk') renderUsageView();
}

(function() {
  var nav = document.querySelector('.settings-nav');
  if (!nav) return;
  nav.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-settings-tab]');
    if (btn) showSettingsTab(btn.dataset.settingsTab);
  });
  nav.addEventListener('keydown', function(e) {
    var btn = e.target.closest('[data-settings-tab]');
    if (!btn) return;
    var cur = btn.dataset.settingsTab, next = null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = stepSettingsTab(cur, 1);
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = stepSettingsTab(cur, -1);
    else if (e.key === 'Home') next = SETTINGS_TABS[0];
    else if (e.key === 'End') next = SETTINGS_TABS[SETTINGS_TABS.length - 1];
    if (!next) return;
    e.preventDefault();
    showSettingsTab(next, true);
  });
})();

function renderInnstillinger() {
  showSettingsTab(loadSettingsTab());
  var beleggSel = document.getElementById('input-belegg-horizon');
  if (beleggSel) beleggSel.value = String(beleggHorizon);
  var remInp = document.getElementById('input-unassigned-reminder');
  if (remInp) remInp.value = String(unassignedReminder);
  _renderWorkWindowInputs();
  _renderDeadlineInputs();
  _bkUpdateSettingsUI();
  renderVacationList();
  renderMedleserList();
}

// Rekkefølgen i ferielista: pågående og kommende perioder etter dato, så de
// ferdige med den siste først. Gir indekser i vacations, så Rediger og Slett
// fortsatt peker på riktig periode. Ren funksjon — se test/vacationList.test.js.
function vacationListOrder(vacs, today) {
  var idx = vacs.map(function(v, i) { return i; });
  var open = idx.filter(function(i) { return vacs[i].to >= today; });
  var done = idx.filter(function(i) { return vacs[i].to < today; });
  open.sort(function(a, b) { return vacs[a].from < vacs[b].from ? -1 : vacs[a].from > vacs[b].from ? 1 : a - b; });
  done.sort(function(a, b) { return vacs[a].from > vacs[b].from ? -1 : vacs[a].from < vacs[b].from ? 1 : a - b; });
  return open.concat(done);
}

// Perioder som deler minst én dag med from–to. skipIdx er perioden som
// redigeres, så den ikke overlapper seg selv.
function vacationClashes(vacs, from, to, skipIdx) {
  return vacs.filter(function(v, i) { return i !== skipIdx && v.from <= to && from <= v.to; });
}

// Tillegget i varselet når en ny eller endret periode overlapper andre.
function vacationClashText(clashes) {
  if (!clashes.length) return '';
  return ' · overlapper ' + clashes.map(function(v) {
    return (v.label || 'Ferie') + ' (' + toDisplay(v.from) + '–' + toDisplay(v.to) + ')';
  }).join(', ');
}

function renderVacationList() {
  var list = document.getElementById('vacation-list');
  if (!list) return;
  var today = todayStr();
  if (!vacations.length) {
    list.innerHTML = '<p class="vac-empty">Ingen ferieperioder registrert.</p>';
    return;
  }
  list.innerHTML = vacationListOrder(vacations, today).map(function(i) {
    var v = vacations[i];
    var status = v.to < today ? 'done' : (v.from <= today ? 'active' : 'upcoming');
    var badge = status === 'done'
      ? '<span class="vac-status-badge done">Ferdig</span>'
      : status === 'active'
        ? '<span class="vac-status-badge active">Pågår</span>'
        : '';
    return '<div class="vac-status-row vac-' + status + '">' +
      '<span class="vac-status-dot ' + status + '"></span>' +
      '<span class="vac-status-name ' + status + '">' + esc(v.label || 'Ferie') + '</span>' +
      '<span class="vac-status-dates ' + status + '">' + toDisplay(v.from) + ' – ' + toDisplay(v.to) + '</span>' +
      badge +
      '<button class="btn-icon btn-vac-edit" data-idx="' + i + '" title="Rediger" aria-label="Rediger ferie">✎</button>' +
      '<button class="btn-icon btn-vac-del" data-idx="' + i + '" title="Slett" aria-label="Slett ferie">✕</button>' +
    '</div>';
  }).join('');
}

// ── Statistikk ─────────────────────────────────────
function buildByMonth() {
  var byMonth = {};
  function ensureKey(k) {
    if (!byMonth[k]) byMonth[k] = { ny: 0, videre: 0, oppdrag: 0 };
  }
  stats.log.forEach(function(e) {
    var k = monthKey(e.date);
    ensureKey(k);
    if (e.type === 'ny')      byMonth[k].ny++;
    if (e.type === 'videre')  byMonth[k].videre++;
    if (e.type === 'oppdrag') byMonth[k].oppdrag++;
  });
  return byMonth;
}

function renderMonthTable(MONTHS_YEAR, byMonth, decisions) {
  var totNy = 0, totVidere = 0, totOppdrag = 0;
  function cell(n, extra) {
    return '<td class="stat-col-num' + (n ? '' : ' month-zero') + (extra || '') + '">' + (n || '—') + '</td>';
  }
  document.getElementById('year-tbody').innerHTML = MONTHS_YEAR.map(function(key, i) {
    var d = byMonth[key] || { ny: 0, videre: 0, oppdrag: 0 };
    totNy      += d.ny;
    totVidere  += (d.videre || 0);
    totOppdrag += (d.oppdrag || 0);
    return '<tr><td>' + MONTHS[i].name + '</td>' +
      cell(d.ny) + cell(d.videre || 0, ' stat-col-new') + cell(decisions.months[i], ' stat-col-new') +
      cell(d.oppdrag || 0, ' stat-col-oppdrag') +
      '</tr>';
  }).join('');
  document.getElementById('year-tfoot').innerHTML =
    '<tr><td>Totalt ' + statYear + '</td>' +
    '<td class="stat-col-num">' + totNy + '</td>' +
    '<td class="stat-col-num stat-col-new">' + totVidere + '</td>' +
    '<td class="stat-col-num stat-col-new">' + decisions.total + '</td>' +
    '<td class="stat-col-num stat-col-oppdrag">' + totOppdrag + '</td>' +
    '</tr>';
}

// Avgjørelser i kalenderåret `year`: per måned (0–11) og per utfall. Samme
// kilde som saksflyten på Hjem — avsluttede saker med registrert utfall, på
// datoen de sist ble avsluttet. Oppdrag har ikke utfall og telles ikke.
// Ren funksjon — se test/newFeatures.test.js.
function decisionsByMonth(list, year) {
  var out = { months: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], meddelt: 0, avslatt: 0, henlagt: 0, total: 0 };
  (list || []).forEach(function(c) {
    if (!c || c.type === 'oppdrag' || c.status !== 'avsluttet') return;
    if (!Object.prototype.hasOwnProperty.call(OUTCOMES, c.outcome)) return;
    var when = closedDate(c);
    if (!when) return;
    var d = new Date(when);
    if (d.getFullYear() !== year) return;
    out.months[d.getMonth()]++;
    out[c.outcome]++;
    out.total++;
  });
  return out;
}

// Totaler for alle år: behandlinger fra hendelsesloggen, avgjørelser fra
// sakene med utfall. Ren funksjon — se test/newFeatures.test.js.
function allTimeTotals(log, list) {
  var t = { ny: 0, videre: 0, decided: 0 };
  (log || []).forEach(function(e) {
    if (e && e.type === 'ny') t.ny++;
    else if (e && e.type === 'videre') t.videre++;
  });
  (list || []).forEach(function(c) {
    if (c && c.type !== 'oppdrag' && c.status === 'avsluttet' &&
        Object.prototype.hasOwnProperty.call(OUTCOMES, c.outcome) && closedDate(c)) t.decided++;
  });
  return t;
}

function renderStatSummary(decisions) {
  document.getElementById('stat-decided-title').textContent = 'Avgjort i ' + statYear;
  document.getElementById('stat-decided-total').textContent = decisions.total;
  document.getElementById('stat-decided-bar').innerHTML = decisions.total
    ? ['meddelt', 'avslatt', 'henlagt'].map(function(k) {
        return decisions[k] ? '<span style="flex:' + decisions[k] + ' 1 0;background:var(--trk-' + OUTCOMES[k].state + ')"></span>' : '';
      }).join('')
    : '';
  document.getElementById('stat-decided-legend').innerHTML = decisions.total
    ? ['meddelt', 'avslatt', 'henlagt'].map(function(k) {
        return '<span><span class="stat-card-swatch" style="background:var(--trk-' + OUTCOMES[k].state + ')" aria-hidden="true"></span>' +
          decisions[k] + ' ' + OUTCOMES[k].label.toLowerCase() + '</span>';
      }).join('')
    : '<span>Ingen avgjørelser med utfall registrert i ' + statYear + '</span>';
  var all = allTimeTotals(stats.log, cases);
  document.getElementById('stat-all-ny').textContent = all.ny;
  document.getElementById('stat-all-videre').textContent = all.videre;
  document.getElementById('stat-all-decided').textContent = all.decided;
}

// Ingen nybehandlinger i året og ingen prognose: grafen ville bare vist en flat linje.
function chartIsEmpty(nyRaw, hasForecast) {
  var total = (nyRaw || []).reduce(function(a, b) { return a + b; }, 0);
  return total === 0 && !hasForecast;
}

function renderChart(MONTHS_YEAR, byMonth) {
  var now      = new Date();
  var curYear  = now.getFullYear();
  var curMonth = now.getMonth();
  var cutoff   = curYear === statYear ? curMonth : 11;

  var rootStyle  = getComputedStyle(document.documentElement);
  var chartBlue  = rootStyle.getPropertyValue('--chart-ny').trim()  || '#63b3ed';
  var chartGold  = rootStyle.getPropertyValue('--accent').trim()    || '#c8a96e';

  var nyRaw = MONTHS_YEAR.map(function(k) { return (byMonth[k] || { ny: 0 }).ny; });

  var nyVals = [], cumNy = 0;
  for (var mi = 0; mi < 12; mi++) {
    if (mi <= cutoff) cumNy += nyRaw[mi];
    nyVals.push(mi <= cutoff ? cumNy : null);
  }

  // Lineær ekstrapolasjon
  var projCutoff = curYear === statYear ? curMonth - 1 : 11;
  var daysInYear = (statYear % 4 === 0) ? 366 : 365;
  var totalSoFar = 0;
  for (var ci = 0; ci <= projCutoff; ci++) { if (ci >= 0) totalSoFar += nyRaw[ci]; }
  var projDays = projCutoff >= 0 ? Math.round((new Date(statYear, projCutoff + 1, 1) - new Date(statYear, 0, 1)) / 86400000) : 0;
  var projected = (projCutoff >= 1 && totalSoFar && projDays)
    ? Math.round((totalSoFar / projDays) * daysInYear) : 0;

  // Tidslinjeprognose: nybehandlinger som gjenstår i statYear
  var forecast = forecastByMonth(cases, statYear, new Date(), effDueFor);

  var forecastVals = [];
  var cumForecast = cumNy;
  for (var fi = 0; fi < 12; fi++) {
    if (fi < cutoff) {
      forecastVals.push(null);
    } else {
      cumForecast += (forecast[fi] || 0);
      forecastVals.push(cumForecast);
    }
  }
  var forecastTotal = cumForecast;
  var hasForecast = forecastTotal > cumNy;
  var chartEmpty = chartIsEmpty(nyRaw, hasForecast);
  var emptyEl = document.getElementById('chart-empty');
  if (emptyEl) {
    emptyEl.textContent = 'Ingen nybehandlinger registrert i ' + statYear + '.';
    emptyEl.hidden = !chartEmpty;
  }
  var canvasWrap = document.getElementById('chart-canvas-wrap');
  if (canvasWrap) canvasWrap.hidden = chartEmpty;

  // Anslagsverdi: tidslinje hvis den har noe, ellers lineær
  var anslagVerdi = hasForecast ? forecastTotal : projected;

  var rawMax = Math.max(cumNy, forecastTotal, projected, productionGoal || 0);
  var yMax = rawMax <= 0 ? 20 : Math.ceil((rawMax + 1) / 5) * 5;

  var goalLineData = productionGoal > 0
    ? MONTHS_YEAR.map(function(_, i) { return productionGoal * (i + 1) / 12; })
    : null;

  var trendData = (totalSoFar && projected)
    ? MONTHS_YEAR.map(function(_, i) { return projected * i / 11; })
    : null;

  var gridC = 'rgba(0,0,0,0.06)';
  var tickC = 'rgba(0,0,0,0.45)';
  var labels = MONTHS.map(function(m) { return m.label; });

  var datasets = [
    {
      label: 'Produksjon',
      data: nyVals,
      borderColor: chartBlue,
      borderWidth: 2,
      backgroundColor: 'rgba(99,179,237,0.10)',
      fill: true,
      tension: 0.35,
      pointRadius: 4,
      pointBackgroundColor: chartBlue,
      spanGaps: false,
      order: 1
    }
  ];

  if (hasForecast) {
    datasets.push({
      label: 'Prognose (tidslinjen)',
      data: forecastVals,
      borderColor: chartBlue,
      borderWidth: 1.5,
      borderDash: [5, 4],
      backgroundColor: 'transparent',
      fill: false,
      tension: 0.35,
      pointRadius: 3,
      pointBackgroundColor: 'transparent',
      pointBorderColor: chartBlue,
      pointBorderWidth: 1.5,
      spanGaps: false,
      order: 2
    });
  }

  if (goalLineData) {
    datasets.push({
      label: 'Mål (' + productionGoal + ')',
      data: goalLineData,
      borderColor: chartGold,
      borderWidth: 1.5,
      borderDash: [5, 4],
      backgroundColor: 'transparent',
      fill: false,
      tension: 0,
      pointRadius: 0,
      order: 3
    });
  }

  if (trendData) {
    datasets.push({
      label: 'Trend',
      data: trendData,
      borderColor: 'rgba(0,0,0,0.15)',
      borderWidth: 1,
      borderDash: [3, 3],
      backgroundColor: 'transparent',
      fill: false,
      tension: 0,
      pointRadius: 0,
      order: 4
    });
  }

  if (window._chartInstance) { window._chartInstance.destroy(); window._chartInstance = null; }

  var canvas = document.getElementById('chart-canvas');
  window._chartInstance = new Chart(canvas, {
    type: 'line',
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index', intersect: false,
          callbacks: {
            label: function(ctx) {
              return ctx.dataset.label + ': ' + (ctx.parsed.y !== null ? Math.round(ctx.parsed.y) : '—');
            }
          }
        }
      },
      scales: {
        x: { grid: { color: gridC }, ticks: { color: tickC, font: { size: 11 } } },
        y: {
          grid: { color: gridC },
          ticks: { color: tickC, font: { size: 11 }, precision: 0, stepSize: 5 },
          beginAtZero: true,
          max: yMax
        }
      }
    }
  });

  // Legend
  var leg = document.getElementById('chart-legend');
  var legItems = [{ color: chartBlue, label: 'Produksjon' }];
  if (hasForecast) legItems.push({ color: chartBlue, label: 'Prognose (tidslinjen)', dash: true, dim: true });
  if (goalLineData) legItems.push({ color: chartGold, label: 'Mål (' + productionGoal + ')', dash: true });
  leg.innerHTML = legItems.map(function(item) {
    var dot = item.dash
      ? '<span class="legend-dot-line" style="background:' + item.color + ';opacity:' + (item.dim ? '0.5' : '1') + '"></span>'
      : '<span class="legend-dot" style="background:' + item.color + ';"></span>';
    return '<span class="legend-item"' + (item.dim ? ' style="opacity:0.7"' : '') + '>' + dot + item.label + '</span>';
  }).join('');

  // Anslag badge
  var anslagWrap = document.getElementById('chart-anslag');
  if (anslagVerdi && productionGoal > 0) {
    var r = anslagVerdi / productionGoal;
    var badgeText, badgeBg, badgeFg;
    if (r >= 1)        { badgeText = '● På sporet';  badgeBg = '#dcfce7'; badgeFg = '#15803d'; }
    else if (r >= 0.9) { badgeText = '● Nær målet';  badgeBg = '#fef3c7'; badgeFg = '#92400e'; }
    else               { badgeText = '● Under mål';  badgeBg = '#fee2e2'; badgeFg = '#991b1b'; }
    var anslagTekst = hasForecast
      ? 'Anslag: ' + forecastTotal + ' (tidslinje)'
        + (projected && projected !== forecastTotal ? ' · ' + projected + ' (lineær)' : '')
      : 'Anslag: ' + projected + ' (lineær)';
    anslagWrap.innerHTML = '<div style="display:inline-block;font-size:11px;font-weight:500;color:' + badgeFg + ';background:' + badgeBg + ';padding:2px var(--space-3);border-radius:4px;">' + badgeText + ' — ' + anslagTekst + '</div>';
  } else if (anslagVerdi) {
    anslagWrap.innerHTML = '<div style="display:inline-block;font-size:11px;color:#6b7280;background:#f3f4f6;padding:2px var(--space-3);border-radius:4px;">Anslag: ' + anslagVerdi + (hasForecast ? ' (tidslinje)' : ' (lineær)') + '</div>';
  } else {
    anslagWrap.innerHTML = '';
  }
}
// Prognosen i Statistikk: nybehandlinger som gjenstår, per måned (0–11) i
// `year`. Bare Ny søknader som er dine blir en nybehandling — Fristarkiv er
// søkerens frist, Viderebehandling teller som viderebehandling, og saker som
// ikke er fordelt er ikke dine ennå. Forfalte saker skal fortsatt gjøres og
// legges i inneværende måned. dueFn gir fristen som gjelder (med buffer).
// Ren funksjon — se test/logicFixes.test.js.
function forecastByMonth(list, year, now, dueFn) {
  var out = {};
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  (list || []).forEach(function(c) {
    if (!c || c.type === 'oppdrag' || c.status !== 'ny' || isUnassigned(c)) return;
    var due = dueFn(c);
    if (!due) return;
    var d = new Date(due + 'T00:00:00');
    if (d < today) d = today;
    if (d.getFullYear() !== year) return;
    out[d.getMonth()] = (out[d.getMonth()] || 0) + 1;
  });
  return out;
}

function renderEventLog() {
  var logItems = stats.log
    .map(function(e, i) { return { entry: e, origIdx: i }; })
    .filter(function(item) { return new Date(item.entry.date).getFullYear() === statYear; })
    .reverse();
  var logList  = document.getElementById('log-tbody');
  var logEmpty = document.getElementById('log-empty');
  if (!logItems.length) { logList.innerHTML = ''; logEmpty.style.display = 'block'; return; }
  logEmpty.style.display = 'none';
  logList.innerHTML = logItems.map(function(item) {
    var e = item.entry;
    var caseObj = cases.find(function(c) { return c.caseNumber === e.caseNumber; });
    var caseId = caseObj ? caseObj.id : null;
    var notes  = caseObj ? (caseObj.notes || '') : '';
    return '<div class="case-card log-card"' + (caseId ? ' data-sak-id="' + caseId + '"' : '') + '>' +
      '<span class="log-badge log-col-type ' + (LOG_CLS[e.type] || 'log-videre') + '">' + (LOG_LABELS[e.type] || e.type) + '</span>' +
      '<span class="log-date log-col-date">' + formatDateTime(e.date) + '</span>' +
      '<span class="case-card-cn log-col-cn">' + esc(e.caseNumber) + '</span>' +
      '<span class="case-card-title">' + esc(lookupTitle(e)) + '</span>' +
      '<span class="case-card-notes">' + esc(notes) + '</span>' +
      '<div class="case-card-menu">' +
        '<button class="btn-card-more btn-log-edit" data-feature="log-edit-date" data-log-id="' + (e.id || item.origIdx) + '" title="Endre dato" aria-label="Endre dato"><svg class="ti" aria-hidden="true"><use href="#ti-pencil"/></svg></button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function renderStats() {
  var MONTHS_YEAR = monthsForYear(statYear);
  var yearEl = document.getElementById('year-heading');
  if (yearEl) yearEl.textContent = String(statYear);
  var btnNext = document.getElementById('btn-year-next');
  if (btnNext) btnNext.disabled = statYear >= new Date().getFullYear();

  var byMonth = buildByMonth();
  var decisions = decisionsByMonth(cases, statYear);
  renderStatSummary(decisions);
  renderMonthTable(MONTHS_YEAR, byMonth, decisions);
  renderChart(MONTHS_YEAR, byMonth);
  renderEventLog();
  renderMedleserStats();
}

