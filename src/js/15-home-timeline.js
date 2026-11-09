// ── Hjem-side ──────────────────────────────────────
// Fristene på Hjem som er dine: Ny, Viderebehandling og aktive oppdrag med
// frist. Fristarkiv er søkerens frist, og en sak som ikke er fordelt er ikke
// din ennå. daysFn(c) gir dager til fristen som gjelder (negativt = forfalt).
// next er antall dager til nærmeste frist som ikke er passert, eller null.
// Ren funksjon — se test/homeDock.test.js.
function homeDeadlineSummary(list, daysFn) {
  var s = { total: 0, ny: 0, videre: 0, oppdrag: 0, next: null };
  (list || []).forEach(function(c) {
    if (!c || !c.dueDate || c.status === 'avsluttet' || c.status === 'fristarkiv' || isUnassigned(c)) return;
    var d = daysFn(c);
    if (typeof d !== 'number' || !isFinite(d)) return;
    if (d < 0) {
      s.total++;
      if (c.type === 'oppdrag') s.oppdrag++;
      else if (c.status === 'viderebehandling') s.videre++;
      else s.ny++;
    } else if (s.next === null || d < s.next) {
      s.next = d;
    }
  });
  return s;
}

// Linja under tallet på Forfalt-kortet. Ren funksjon — se test/homeDock.test.js.
function homeOverdueSubText(s) {
  if (!s.total) return 'ingen saker over fristen';
  var parts = [];
  if (s.ny)      parts.push(s.ny + (s.ny === 1 ? ' ny' : ' nye'));
  if (s.videre)  parts.push(s.videre + (s.videre === 1 ? ' viderebehandling' : ' viderebehandlinger'));
  if (s.oppdrag) parts.push(s.oppdrag + ' oppdrag');
  return parts.join(' · ');
}

// Stripa når Arbeidsplan er slått sammen: forfalte og neste frist.
// Ren funksjon — se test/homeDock.test.js.
function homeDockText(s) {
  var over = s.total ? s.total + ' forfalt' : 'Ingen forfalte';
  var next = s.next === null ? 'ingen kommende frister'
           : s.next === 0 ? 'neste frist i dag'
           : s.next === 1 ? 'neste frist i morgen'
           : 'neste frist om ' + s.next + ' dager';
  return over + ' · ' + next;
}

// Merkene i overskriften på fristlista: radene lista viser, uten søkerens
// frister i Fristarkiv. Ren funksjon — se test/homeDock.test.js.
function homeListBadges(rows) {
  var b = { overdue: 0, soon: 0 };
  (rows || []).forEach(function(r) {
    if (r.kind === 'fristarkiv') return;
    if (r.d < 0) b.overdue++;
    else if (r.d <= 7) b.soon++;
  });
  return b;
}

// ── Arbeidsplan fast nederst ───────────────────────
var HOME_DOCK_KEY = 'pt_home_dock_collapsed';
function loadHomeDockCollapsed() { return _lsGet(HOME_DOCK_KEY) === '1'; }

// Arbeidsplan på sakslistene: samme valg som Hjem, men egen nøkkel — og huskes
// på tvers av listene (Ny, Viderebehandling, Fristarkiv, Oppdrag). Åpen som standard.
var CASES_TL_KEY = 'pt_cases_tl_collapsed';
function casesTlCollapsed() { return _lsGet(CASES_TL_KEY) === '1'; }
function setCasesTlCollapsed(collapsed) { _lsSet(CASES_TL_KEY, collapsed ? '1' : '0'); }

function applyCasesTlCollapsed() {
  var collapsed = casesTlCollapsed();
  var dock = document.getElementById('cases-tl-dock');
  var btn  = document.getElementById('cases-tl-toggle');
  if (!dock || !btn) return;
  dock.classList.toggle('is-collapsed', collapsed);
  btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  btn.querySelector('.home-dock-chevron').textContent = collapsed ? '▸' : '▾';
}

document.getElementById('cases-tl-toggle').addEventListener('click', function() {
  setCasesTlCollapsed(!casesTlCollapsed());
  applyCasesTlCollapsed();
  // En skjult tidslinje har ingen bredde å regne utsnittet fra; tegn den på nytt
  if (!casesTlCollapsed()) renderTimeline({ target: 'cases-timeline' });
});

// Varslene nederst løftes over Arbeidsplan-feltet mens Hjem er åpen, og Hjem
// får like mye luft nederst, så feltet ikke dekker de siste radene.
function syncToastLift() {
  var dock = document.getElementById('home-dock');
  // offsetParent er alltid null for et fast element; getClientRects er tom når det er skjult.
  var on = activePage === 'hjem' && dock && dock.getClientRects().length > 0;
  var h = on ? dock.offsetHeight + 'px' : '0px';
  document.documentElement.style.setProperty('--toast-lift', h);
  document.documentElement.style.setProperty('--home-dock-h', h);
}

function renderHomeDock(due) {
  var dock = document.getElementById('home-dock');
  if (!dock) return;
  var collapsed = loadHomeDockCollapsed();
  dock.classList.toggle('is-collapsed', collapsed);
  var btn = document.getElementById('home-dock-toggle');
  btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  btn.querySelector('.home-dock-chevron').textContent = collapsed ? '▸' : '▾';
  var sum = document.getElementById('home-dock-summary');
  sum.hidden = !collapsed;
  sum.textContent = homeDockText(due);
  syncToastLift();
}

document.getElementById('home-dock-toggle').addEventListener('click', function() {
  var collapsed = !loadHomeDockCollapsed();
  _lsSet(HOME_DOCK_KEY, collapsed ? '1' : '0');
  renderHomeDock(homeDeadlineSummary(cases, function(c) { return daysUntil(deadlineFor(c)); }));
  // En skjult tidslinje har ingen bredde å regne utsnittet fra; tegn den på nytt
  if (!collapsed) renderTimeline();
});

if (typeof ResizeObserver === 'function') {
  new ResizeObserver(syncToastLift).observe(document.getElementById('home-dock'));
}


// Forfalt-kortet hopper ned til fristlista
_bindCardActivate(document.getElementById('home-card-forfalt'), function() {
  var sec = document.getElementById('home-frister');
  if (!sec) return;
  sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  var title = document.getElementById('home-frister-title');
  if (title) title.focus({ preventScroll: true });
});

function renderHjem() {
  var now = new Date(); now.setHours(0,0,0,0);

  // ── Statskort ──────────────────────────────────────
  var countOppdrag = cases.filter(function(c) { return c.type === 'oppdrag' && c.status !== 'avsluttet'; }).length;
  var due = homeDeadlineSummary(cases, function(c) { return daysUntil(deadlineFor(c)); });
  renderHomeMedl();

  var elOpp    = document.getElementById('home-count-oppdrag');
  var elForf   = document.getElementById('home-count-forfalt');
  var elForfSub = document.getElementById('home-forfalt-sub');
  if (elOpp)   elOpp.textContent   = countOppdrag;
  renderPipeline();
  // Forfalt-kortet er det ene stedet på Hjem som teller forfalte frister;
  // fristlista under viser hvilke de er.
  if (elForf) {
    elForf.textContent = due.total;
    elForf.style.color = due.total > 0 ? 'var(--danger)' : '';
  }
  if (elForfSub) elForfSub.textContent = homeOverdueSubText(due);
  var forfaltCard = document.getElementById('home-card-forfalt');
  if (forfaltCard) forfaltCard.classList.toggle('home-card-overdue-active', due.total > 0);
  renderHomeDock(due);

  // ── Neste fridag-linje ─────────────────────────────
  var elFridagLine = document.getElementById('home-fridag-line');
  var elFridagLead = document.getElementById('home-fridag-lead');
  var elFridagSub  = document.getElementById('home-fridag-sub');
  var nextHoliday  = getNextHoliday();
  if (elFridagLine) elFridagLine.hidden = !nextHoliday;
  if (nextHoliday && elFridagLead && elFridagSub) {
    elFridagLead.innerHTML = fridagLead(nextHoliday.days);
    var hd = new Date(nextHoliday.date + 'T00:00:00');
    elFridagSub.textContent = hd.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' }) + ' · ' + nextHoliday.label;
  }

  // ── Tidslinje + belegg ────────────────────────────
  renderTimeline();
  renderBeleggCard();

  renderHomeDeadlines();
}

// ── Fristlista på Oversikt ─────────────────────────
// Én liste sortert etter frist. Hva som er med, styres av homeDeadlineFilter
// (se selectHomeDeadlines); forfalte står i rødt der de er i lista.
// Starten på fridag-linja på Oversikt (HTML, tallet i fet skrift).
// Ren funksjon — se test/beleggBar.test.js.
function fridagLead(days) {
  if (days === 0) return 'Fridag i dag';
  if (days === 1) return 'Neste fridag i morgen';
  return 'Neste fridag om <strong>' + days + ' dager</strong>';
}

function renderHomeDeadlines() {
  var list    = document.getElementById('home-upcoming-list');
  var countEl = document.getElementById('home-dl-count');
  var sumEl   = document.getElementById('home-dl-summary');
  if (!list) return;
  var rows = selectHomeDeadlines(cases, homeDeadlineFilter, function(c) {
    return c.dueDate ? daysUntil(deadlineFor(c)) : NaN;
  });
  if (countEl) countEl.textContent = rows.length ? '(' + rows.length + ')' : '';
  if (sumEl)   sumEl.textContent   = 'Viser: ' + homeDeadlineFilterSummary(homeDeadlineFilter);
  var badges = homeListBadges(rows);
  var bOver = document.getElementById('home-dl-badge-overdue');
  var bSoon = document.getElementById('home-dl-badge-soon');
  if (bOver) { bOver.hidden = !badges.overdue; bOver.textContent = badges.overdue + ' forfalt'; }
  if (bSoon) { bSoon.hidden = !badges.soon; bSoon.textContent = badges.soon + ' innen 7 dager'; }

  function renderRow(r) {
    var c = r.c, d = r.d;
    var isOppdrag = r.kind === 'oppdrag';
    var cls  = d < 0 ? 'overdue' : d <= 3 ? 'urgent' : d <= 14 ? 'soon' : 'ok';
    var tips = [];
    // I Fristarkiv er fristen søkerens: stiplet og nøytral, men rød når den er passert
    if (r.kind === 'fristarkiv') {
      cls = 'theirs' + (d < 0 ? ' theirs-overdue' : '');
      tips.push(d < 0 ? 'Søkerens svarfrist er passert' : 'Søkerens svarfrist — ikke din arbeidsfrist');
    }
    if (isUnassigned(c)) tips.push('Ikke fordelt ennå — teller ikke i belegget');
    if (periodOverlapsVacation(c)) tips.push(vacationTipText(c));
    var vacBadge = periodOverlapsVacation(c)
      ? '<span class="vac-badge' + (isUnassigned(c) ? ' vac-badge-soft' : '') + '" title="' + esc(vacationTipText(c)) + '">⛱</span>' : '';
    return '<div class="home-upcoming-row' + (isActiveCaseId(c.id) ? ' is-active-case' : '') + (isUnassigned(c) ? ' is-unassigned' : '') + '" data-id="' + c.id + '" data-page="' + (isOppdrag ? 'oppdrag' : c.status) + '">' +
      '<span class="days-badge ' + cls + '"' + (tips.length ? ' title="' + esc(tips.join(' · ')) + '"' : '') + '>' +
        (d < 0 ? Math.abs(d)+'d forfalt' : d === 0 ? 'I dag' : d+'d') + '</span>' +
      '<span class="home-upcoming-cn' + (isOppdrag ? ' case-card-cn-oppdrag' : '') + '">' + esc(c.caseNumber) + '</span>' +
      '<span class="case-card-main"><span class="home-upcoming-title">' + esc(c.title) + '</span>' + caseNoteHtml(c) + '</span>' +
      activeCasePillHtml(c) +
      unassignedPillHtml(c) +
      postponePillHtml(c) +
      medlPillHtml(c) +
      vacBadge +
      trackHtml(c, true) +
      '<div class="home-row-more" style="position:relative;flex-shrink:0;margin-left:var(--space-1);">' +
        '<button class="btn-card-more home-row-more-btn" data-id="' + c.id + '" title="Handlinger" aria-label="Handlinger">⋯</button>' +
      '</div>' +
    '</div>';
  }

  if (!rows.length) {
    var nothing = homeDeadlineFilterSummary(homeDeadlineFilter) === 'Ingenting valgt';
    list.innerHTML = '<p class="home-empty">' + (nothing
      ? 'Ingen fristtyper er valgt. Åpne «Filter» for å velge hva som skal vises.'
      : 'Ingen frister med dette filteret.') + '</p>';
    return;
  }
  list.innerHTML = rows.map(renderRow).join('');
}

function syncHomeDeadlineFilterUi() {
  var panel = document.getElementById('home-dl-filter');
  if (!panel) return;
  panel.querySelectorAll('input[data-kind]').forEach(function(inp) {
    inp.checked = !!homeDeadlineFilter[inp.dataset.kind][inp.dataset.when];
  });
  document.getElementById('home-dl-horizon').value = String(homeDeadlineFilter.horizon);
}

// ── Arbeidsplan-tidslinje ──────────────────────────
// targetId: id på container-elementet som skal fylles
// draftRows: valgfri liste med utkast-saker (bulk-modal), tegnes som tl-bar-draft
// setPostponedPart: skraverer delen av en utsatt bjelke som ligger etter den
// faktiske fristen (actualEnd). Alle verdier er dager relativt til i dag, som
// bjelkens synlige start og slutt. Brukes når bjelken tegnes og mens den dras.
function setPostponedPart(bar, visStart, visEnd, actualEnd) {
  var el = bar.querySelector('.tl-bar-postponed');
  var from = Math.max(visStart, actualEnd);
  if (visEnd <= visStart || from >= visEnd) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.className = 'tl-bar-postponed';
    bar.insertBefore(el, bar.querySelector('.tl-bar-label'));
  }
  el.style.left  = ((from - visStart) / (visEnd - visStart) * 100).toFixed(4) + '%';
  el.style.width = ((visEnd - from) / (visEnd - visStart) * 100).toFixed(4) + '%';
  el.classList.toggle('is-whole', from <= visStart);
}

// ── Felles tidslinje-bygger (div-basert) ─────────────
function buildTimelineDiv(opts) {
  var HORIZON   = opts.horizon || 365;
  var PAST      = TL_PAST_DAYS;
  var TOTAL     = PAST + HORIZON;
  var axisMode  = opts.axisMode || 'month';
  var now       = new Date(); // real-time — not midnight-snapped
  var today     = new Date(now); today.setHours(0,0,0,0); // midnight, for tick/label calculations
  // Fractional days elapsed since midnight — offsets grid ticks relative to now
  var todayOffset = (now - today) / 86400000;

  // days (fractional) relative to now; -PAST..HORIZON → 0..100%
  function pct(days) {
    return ((Math.max(-PAST, Math.min(HORIZON, days)) + PAST) / TOTAL * 100).toFixed(4) + '%';
  }
  function pctW(days) {
    return (Math.max(0, Math.min(TOTAL, days)) / TOTAL * 100).toFixed(4) + '%';
  }
  // For grid elements (ticks, labels, holidays) whose offset is relative to midnight
  function pctDay(dayOffset) {
    return pct(dayOffset - todayOffset);
  }
  function getWeekNumber(d) {
    var date = new Date(d.getTime()); date.setHours(0,0,0,0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    var week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  }

  var typeFilter  = opts.typeFilter || [];
  var activeCases = filterCasesForTimeline(cases, typeFilter);

  var allRanges = activeCases.map(function(cas) { return timelineRange(cas, now, HORIZON, PAST); });

  var busyRanges = allRanges.filter(function(r) { return r.end >= -PAST && r.start <= HORIZON; });

  var holidays = [];
  var holidayByDay = {}; // dag → helligdagen, for popupen
  holidayYearOffsets(PAST, HORIZON).forEach(function(yi) {
    getNorwegianHolidays(today.getFullYear() + yi).forEach(function(h) {
      var day = Math.round((new Date(h.date + 'T00:00:00') - today) / 86400000);
      if (day >= -PAST && day <= HORIZON) { holidays.push(day); holidayByDay[day] = h; }
    });
  });

  var majorDays = [], majorLabels = [];
  var d = new Date(today); d.setDate(1); d.setMonth(d.getMonth() - 1);
  while ((d - today) / 86400000 <= HORIZON) {
    var _dayOff = Math.round((d - today) / 86400000);
    if (_dayOff >= -PAST) {
      majorDays.push(_dayOff);
      majorLabels.push(d.toLocaleDateString('nb-NO', { month: 'short' }));
    }
    d.setMonth(d.getMonth() + 1);
  }

  var track = document.createElement('div');
  track.className = 'tl-track';

  // Rad-tildeling: ubegrenset antall rader (assignTimelineRows). Ny og oppdrag
  // øverst, så Viderebehandling, Fristarkiv nederst; kronologisk innenfor hver.
  // Høyden settes av _layoutTimelineLanes etter hvor mange rader som synes.
  var rowResult = assignTimelineRows(busyRanges);
  busyRanges = rowResult.ranges;
  var laneCount = Math.max(1, rowResult.laneCount);

  // Forfalt-bånd: arbeidsdagene belegget bokfører straffen for forfalte saker
  // på, så tidslinjen og belegget forteller det samme.
  var bands = timelineOverdueBands(busyRanges, overduePenaltyOffsets(today, OVERDUE_PENALTY_WORKDAYS));

  // Røde dager som henger sammen (jul, påske) tegnes som ett felt, under
  // bjelkene
  holidayRuns(holidays).forEach(function(run) {
    var el = document.createElement('div');
    el.className = 'tl-holiday';
    el.style.left   = pctDay(run[0]);
    el.style.width  = pctW(Math.min(HORIZON, run[1]) - run[0]);
    el.style.height = '100%';
    var names = [];
    for (var hd = run[0]; hd < run[1]; hd++) if (holidayByDay[hd]) names.push(holidayByDay[hd].name);
    el.dataset.label = holidayLabel(names);
    el.dataset.from  = holidayByDay[run[0]].date;
    el.dataset.to    = holidayByDay[run[1] - 1].date;
    track.appendChild(el);
  });

  vacations.forEach(function(v) {
    var vFrom = new Date(v.from + 'T00:00:00');
    var vTo   = new Date(v.to   + 'T00:00:00');
    var ds = Math.round((vFrom - today) / 86400000);
    var de = Math.round((vTo   - today) / 86400000) + 1; // til og med siste feriedag
    if (de < -PAST || ds > HORIZON) return;
    var vs = Math.max(-PAST, ds), ve = Math.min(HORIZON, de);
    var el = document.createElement('div');
    el.className = 'tl-bar-vacation';
    el.style.left   = pctDay(vs);
    el.style.width  = pctW(ve - vs);
    el.style.height = '100%';
    el.dataset.label = v.label || 'Ferie';
    el.dataset.from  = v.from;
    el.dataset.to    = v.to;
    track.appendChild(el);
  });

  busyRanges.forEach(function(r) {
    var bar = document.createElement('div');
    var typeCls = r.isOppdrag ? 'tl-bar-oppdrag' : 'tl-bar-' + r.status;
    bar.className = 'tl-bar ' + typeCls + (r.isMilestone ? ' tl-bar-milestone' : '') + (opts.draggable && r.canBuffer ? ' draggable' : '') + (r.isOverdue ? ' tl-bar-overdue' : '') + (opts.activeId && r.id === opts.activeId ? ' tl-bar-active' : '') + (r.unassigned ? ' tl-bar-unassigned' : '');
    var visStart = Math.max(-PAST, r.start);
    var visEnd   = Math.min(HORIZON, r.end);
    bar.style.left   = pct(visStart);
    bar.style.width  = pctW(visEnd - visStart);
    bar.dataset.row   = String(r.row);
    bar.dataset.cn    = r.caseNumber;
    bar.dataset.title = r.title;
    bar.dataset.id    = r.id;
    bar.dataset.due   = r.dueDate;
    bar.dataset.spanDays = String(Math.max(0, visEnd - visStart)); // etiketten tilpasses bredden i _applyTimelineScroll
    if (opts.interactive) {
      bar.tabIndex = 0;
      bar.setAttribute('role', 'button');
      bar.setAttribute('aria-label', r.caseNumber + (r.title ? ' — ' + r.title : '') + ', frist ' + formatDate(r.dueDate) + (r.isOverdue ? ', forfalt' : '') +
        (r.postponed ? ', planlagt ' + formatDate(r.effDue) + ', utsatt ' + r.postponed + (r.postponed === 1 ? ' dag' : ' dager') : ''));
    }
    // Ferie og røde dager inne i arbeidsvinduet skraveres: vinduet er
    // arbeidsdager, og bjelken strekker seg forbi dem. Vanlige helger
    // skraveres ikke — de er i hver bjelke og ville bare blitt støy.
    if (r.windowStart && visEnd > visStart) {
      nonWorkdayRuns(r.windowStart, r.effDue).forEach(function(run) {
        if (isPlainWeekendRun(run)) return;
        var gs = Math.max(visStart, tlDueOffset(run[0], now) - 16 / 24);
        var ge = Math.min(visEnd,   tlDueOffset(run[1], now) + 8 / 24);
        if (ge <= gs) return;
        var gap = document.createElement('div');
        gap.className = 'tl-bar-gap';
        gap.style.left  = ((gs - visStart) / (visEnd - visStart) * 100).toFixed(4) + '%';
        gap.style.width = ((ge - gs) / (visEnd - visStart) * 100).toFixed(4) + '%';
        bar.appendChild(gap);
      });
    }
    // Utsatt: delen av bjelken etter fristen skraveres
    if (r.postponed) setPostponedPart(bar, visStart, visEnd, r.actualEnd);
    var lbl = document.createElement('span');
    lbl.className = 'tl-bar-label';
    lbl.textContent = r.caseNumber;
    bar.appendChild(lbl);
    track.appendChild(bar);

    // Utsatt: merket «+N d» ved enden, og strek fra fristen bort til bjelken
    if (r.postponed && visEnd > visStart) {
      var tag = document.createElement('div');
      tag.className = 'tl-postpone-tag' + (r.isOverdue ? ' is-overdue' : '');
      tag.dataset.row = String(r.row);
      tag.dataset.id  = r.id;
      tag.style.left  = pct(visEnd);
      tag.innerHTML   = '<span>+' + r.postponed + ' d' + (r.isOverdue ? ' · forfalt' : '') + '</span>';
      tag.setAttribute('aria-hidden', 'true');
      track.appendChild(tag);
      if (r.actualEnd >= -PAST) {
        if (r.start > r.actualEnd) {
          var pline = document.createElement('div');
          pline.className = 'tl-actual-line' + (r.isOverdue ? ' is-overdue' : '');
          pline.dataset.id  = r.id;
          pline.dataset.row = String(r.row);
          pline.style.left  = pct(r.actualEnd);
          pline.style.width = pctW(Math.max(-PAST, r.start) - r.actualEnd);
          track.appendChild(pline);
        }
        var pmark = document.createElement('div');
        pmark.className = 'tl-actual-mark';
        pmark.dataset.id  = r.id;
        pmark.dataset.row = String(r.row);
        pmark.style.left  = 'calc(' + pct(r.actualEnd) + ' - 1px)';
        track.appendChild(pmark);
      }
    }

    if (r.hasBuffer && r.actualEnd > r.end && r.actualEnd <= HORIZON) {
      var line = document.createElement('div');
      line.className = 'tl-actual-line';
      line.dataset.id  = r.id;
      line.dataset.row = String(r.row);
      line.style.left  = pct(r.end);
      line.style.width = pctW(r.actualEnd - r.end);
      track.appendChild(line);
      var mark = document.createElement('div');
      mark.className = 'tl-actual-mark';
      mark.dataset.id  = r.id;
      mark.dataset.row = String(r.row);
      mark.style.left  = 'calc(' + pct(r.actualEnd) + ' - 1px)';
      track.appendChild(mark);
    }
  });

  bands.forEach(function(b, i) {
    b.segments.forEach(function(seg) {
      var el = document.createElement('div');
      el.className = 'tl-overdue-band';
      el.style.left   = pctDay(seg[0]);
      el.style.width  = pctW(seg[1] - seg[0]);
      el.style.bottom = (TL_LANE.pad + (bands.length - 1 - i) * (TL_LANE.band + TL_LANE.bandGap)) + 'px';
      el.dataset.id = b.id;
      el.dataset.cn = b.caseNumber;
      var c = cases.find(function(x) { return x.id === b.id; });
      el.dataset.title = (c && c.title) || '';
      el.dataset.due   = (c && c.dueDate) || '';
      track.appendChild(el);
    });
  });

  if (opts.draftRows) {
    opts.draftRows.forEach(function(row) {
      if (!row.checked || !row.date || !isValidDate(row.date)) return;
      // Saker fra «Flere saker» opprettes alltid som Ny, så de får samme
      // arbeidsvindu og samme frist-tidspunkt som de lagrede Ny-bjelkene.
      var e2 = tlDueOffset(row.date, now);
      var s  = timelineBarStart({ type: 'sak', status: 'ny' }, row.date, now);
      if (e2 < -PAST || s > HORIZON) return;
      s  = Math.max(-PAST, s);
      e2 = Math.min(HORIZON, e2);
      var draft = document.createElement('div');
      draft.className = 'tl-bar-draft';
      draft.style.left  = pct(s);
      draft.style.width = pctW(e2 - s);
      // Utkastet dekker alle radene: det viser hvor det nye arbeidet havner,
      // ikke en egen rad. Høyden settes av _layoutTimelineLanes.
      draft.dataset.cn    = row.cn || '?';
      draft.dataset.title = row.title || '';
      track.appendChild(draft);
    });
  }

  majorDays.forEach(function(day, i) {
    var line = document.createElement('div');
    line.className = 'tl-tick-major';
    line.style.left   = pctDay(day);
    line.style.height = '100%';
    track.appendChild(line);
    if (axisMode === 'month') {
      var lbl = document.createElement('div');
      lbl.className = 'tl-tick-lbl';
      lbl.style.left = pctDay(day);
      lbl.textContent = majorLabels[i];
      track.appendChild(lbl);
    } else if (axisMode === 'week') {
      // If this major tick (month boundary) also falls on a Monday, show week number
      var majorDate = addDaysLocal(today, day);
      if (majorDate.getDay() === 1) { // 1 = Monday
        var wlbl = document.createElement('div');
        wlbl.className = 'tl-tick-lbl-minor';
        wlbl.style.left = pctDay(day);
        wlbl.textContent = String(getWeekNumber(majorDate));
        track.appendChild(wlbl);
      }
    }
  });

  // Find the most recent Monday at or before today (day 0), then step back into PAST
  var _todayDow = today.getDay(); // 0=Sun,1=Mon,...,6=Sat
  var _daysSinceMonday = (_todayDow + 6) % 7; // 0 on Monday, 1 on Tuesday, ...
  var _wStart = -_daysSinceMonday; // day offset of this week's Monday
  while (_wStart > -PAST) _wStart -= 7; // step back until we cover PAST
  for (var w = _wStart; w < HORIZON; w += 7) {
    if (w < -PAST) continue;
    if (majorDays.indexOf(w) !== -1) continue;
    var minor = document.createElement('div');
    minor.className = 'tl-tick-minor';
    minor.style.left   = pctDay(w);
    minor.style.height = '12px';
    track.appendChild(minor);
    if (axisMode === 'week') {
      var lbl = document.createElement('div');
      lbl.className = 'tl-tick-lbl-minor';
      lbl.style.left = pctDay(w);
      lbl.textContent = String(getWeekNumber(addDaysLocal(today, w)));
      track.appendChild(lbl);
    }
  }

  var todayLine = document.createElement('div');
  todayLine.className = 'tl-today-line';
  todayLine.style.left   = pct(0);
  todayLine.style.height = '100%';
  var todayLbl = document.createElement('div');
  todayLbl.className = 'tl-today-lbl';
  todayLbl.textContent = 'i dag';
  todayLine.appendChild(todayLbl);
  track.appendChild(todayLine);

  if (!typeFilter.length) {
    var emptyMsg = document.createElement('div');
    emptyMsg.className = 'tl-empty-msg';
    emptyMsg.textContent = 'Ingen sakstyper valgt';
    track.appendChild(emptyMsg);
  }

  // Geometrien sporet ble tegnet med — brukes av scroll-utsnittet,
  // forfalt-pinnen og drag-håndteringen, så de regner likt med bjelkene.
  var overdue = allRanges.filter(function(r) { return r.isOverdue; });
  track._tl = {
    now: now, past: PAST, horizon: HORIZON, pct: pct, pctW: pctW,
    overdue: overdue,
    lead: timelineLeadDays(overdue, TL_OVERDUE_LEAD_MAX),
    ranges: busyRanges, bands: bands.length, lanes: null
  };
  // Alle radene til utsnittet er kjent (_layoutTimelineLanes)
  _setTimelineLanes(track, laneCount);

  return track;
}

// _setTimelineLanes: gir sporet høyde til `lanes` rader og plasserer bjelkene
// og det som hører til dem (data-row) i sin rad. Bjelker i rader under det
// ligger utenfor utsnittet og synes ikke.
function _setTimelineLanes(track, lanes) {
  var g = track._tl;
  if (!g || g.lanes === lanes) return;
  g.lanes = lanes;
  var geo = timelineLaneGeometry(lanes, g.bands);
  track.style.height = geo.trackH + 'px';
  track.querySelectorAll('[data-row]').forEach(function(el) {
    var top = TL_LANE.pad + parseInt(el.dataset.row, 10) * (geo.barH + TL_LANE.gap);
    if (el.classList.contains('tl-actual-line')) {
      el.style.top = (top + Math.round(geo.barH / 2)) + 'px';
    } else if (el.classList.contains('tl-actual-mark')) {
      el.style.top = (top + 3) + 'px';
      el.style.height = (geo.barH - 6) + 'px';
    } else {
      el.style.top = top + 'px';
      el.style.height = geo.barH + 'px';
    }
  });
  track.querySelectorAll('.tl-bar-draft').forEach(function(el) {
    el.style.top = TL_LANE.pad + 'px';
    el.style.height = geo.contentH + 'px';
  });
  g.pinHeight = geo.trackH - 8;
}

// _layoutTimelineLanes: så mange rader som bjelkene i utsnittet bruker
// (visibleLaneCount). Kalles når sporet er tegnet og når det scrolles.
function _layoutTimelineLanes(scrollEl) {
  var track = scrollEl.querySelector('.tl-track');
  var ppd = scrollEl._tlPxPerDay;
  if (!track || !track._tl || !ppd) return;
  var from = timelineDayAtPx(scrollEl.scrollLeft, ppd, track._tl.past);
  var to   = timelineDayAtPx(scrollEl.scrollLeft + scrollEl.clientWidth, ppd, track._tl.past);
  _setTimelineLanes(track, visibleLaneCount(track._tl.ranges, from, to));
}

function _applyTimelineScroll(scrollEl, trackEl, horizon) {
  var FULL = 365 + TL_PAST_DAYS;   // sporet dekker alltid 1 år fremover + fortid
  var containerW = scrollEl.clientWidth;
  if (!containerW) {
    requestAnimationFrame(function() { _applyTimelineScroll(scrollEl, trackEl, horizon); });
    return;
  }
  // Zoom styres kun av horizon (dager fremover) — fortiden (TL_PAST_DAYS)
  // legges til ved samme tetthet i stedet for å presses inn i samme
  // containerbredde, slik at f.eks. "3 mnd" alltid viser 90 dager i samme
  // størrelse uavhengig av hvor langt tilbake sporet strekker seg.
  var pxPerDay = containerW / horizon;
  var totalPx  = Math.round(pxPerDay * FULL);
  trackEl.style.width    = totalPx + 'px';
  trackEl.style.minWidth = totalPx + 'px';
  // Forelderen må være like bred som sporet, ellers slutter den klebrige
  // forfalt-pinnen å følge med når man scroller forbi første skjermbredde.
  if (trackEl.parentElement) trackEl.parentElement.style.width = totalPx + 'px';
  scrollEl._tlPxPerDay = pxPerDay;
  // Scroll så i dag er nær venstre kant — eller litt bak i dag når saker
  // nylig har forfalt, så de synes. Resten av fortiden ligger til venstre,
  // tilgjengelig ved å scrolle bakover.
  var lead = trackEl._tl ? trackEl._tl.lead : 0;
  scrollEl.scrollLeft = Math.max(0, Math.round(pxPerDay * (TL_PAST_DAYS - lead)) - 20);
  trackEl.querySelectorAll('.tl-bar').forEach(function(bar) {
    var lbl = bar.querySelector('.tl-bar-label');
    // Den pågående saken har en markørprikk foran saksnummeret
    var reserved = bar.classList.contains('tl-bar-active') ? 2 * TL_LABEL_CHAR_PX : 0;
    if (lbl) lbl.textContent = timelineBarLabel(bar.dataset.cn, parseFloat(bar.dataset.spanDays) * pxPerDay - reserved);
  });
  _placePostponeTags(trackEl);
  _layoutTimelineLanes(scrollEl);
  _updateOverduePin(scrollEl);
}

// _placePostponeTags: viser «+N d»-merket bare der det er ledig plass til
// høyre for bjelken, så det aldri dekker en annen sak. Bredden er først kjent
// når sporet har fått sin bredde. Utsettelsen står uansett i skraveringen og
// popupen.
function _placePostponeTags(trackEl) {
  var tags = Array.prototype.slice.call(trackEl.querySelectorAll('.tl-postpone-tag'));
  if (!tags.length) return;
  var byRow = {};
  trackEl.querySelectorAll('.tl-bar').forEach(function(bar) {
    (byRow[bar.dataset.row] = byRow[bar.dataset.row] || []).push([bar.offsetLeft, bar.offsetLeft + bar.offsetWidth]);
  });
  tags.forEach(function(tag) { tag.style.display = ''; });
  var placed = tags.map(function(tag) {
    var pill = tag.firstElementChild;
    var left = tag.offsetLeft + (parseFloat(getComputedStyle(tag).marginLeft) || 0);
    return { tag: tag, row: tag.dataset.row, left: left, right: left + (pill ? pill.offsetWidth : 0) };
  }).sort(function(a, b) { return a.left - b.left; });
  placed.forEach(function(p) {
    var taken = byRow[p.row] || (byRow[p.row] = []);
    var fits = postponeTagFits(p.left, p.right, taken);
    p.tag.style.display = fits ? '' : 'none';
    if (fits) taken.push([p.left, p.right]);
  });
}

// postponeTagFits: om merket [left, right) (px) får plass uten å overlappe
// noe av det som allerede ligger i raden (taken: [venstre, høyre]-par), med
// litt luft. Ren funksjon — se test/postpone.test.js.
var TL_TAG_GAP_PX = 2;
function postponeTagFits(left, right, taken) {
  return !(taken || []).some(function(t) {
    return left < t[1] + TL_TAG_GAP_PX && t[0] < right + TL_TAG_GAP_PX;
  });
}

// Bredden pinnen dekker i venstre kant (px) — en sak bak den regnes som skjult.
var TL_PIN_PX = 28;

// Forfalt-pinnen: teller forfalte saker som ligger til venstre for
// synsfeltet. Den klistrer seg til venstre kant (position: sticky) og
// oppdateres når man scroller; klikk scroller tilbake til den nyeste av dem.
function _updateOverduePin(scrollEl) {
  var track  = scrollEl.querySelector('.tl-track');
  var anchor = scrollEl.querySelector('.tl-pin-anchor');
  if (!track || !track._tl || !scrollEl._tlPxPerDay) return;
  if (!anchor) {
    anchor = document.createElement('div');
    anchor.className = 'tl-pin-anchor';
    var pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'tl-overdue-pin';
    anchor.appendChild(pin);
    track.parentElement.insertBefore(anchor, track);
  }
  var pinEl = anchor.firstChild;
  var leftDay = timelineDayAtPx(scrollEl.scrollLeft + TL_PIN_PX, scrollEl._tlPxPerDay, track._tl.past);
  var hidden = overdueLeftOf(track._tl.overdue, leftDay);
  anchor.hidden = !hidden.length;
  if (!hidden.length) return;
  pinEl.style.height = track._tl.pinHeight + 'px';
  pinEl.textContent = '‹' + hidden.length;
  var lines = hidden.map(function(r) { return r.caseNumber + ' — ' + Math.abs(Math.floor(r.end)) + 'd forfalt'; });
  var head = hidden.length === 1 ? '1 forfalt sak utenfor bildet' : hidden.length + ' forfalte saker utenfor bildet';
  pinEl.title = head + ':\n' + lines.join('\n');
  pinEl.setAttribute('aria-label', head + '. Vis dem.');
}

document.addEventListener('click', function(e) {
  var pin = e.target.closest('.tl-overdue-pin');
  if (!pin) return;
  var scrollEl = pin.closest('.tl-scroll-wrap');
  var track = scrollEl && scrollEl.querySelector('.tl-track');
  if (!track || !track._tl || !scrollEl._tlPxPerDay) return;
  var past = track._tl.past;
  var leftDay = timelineDayAtPx(scrollEl.scrollLeft + TL_PIN_PX, scrollEl._tlPxPerDay, past);
  var hidden = overdueLeftOf(track._tl.overdue, leftDay);
  if (!hidden.length) return;
  // Den nyeste av de skjulte sakene; saker eldre enn fortidsvinduet kan ikke
  // vises som bjelke, så da går vi helt til start.
  var target = hidden[hidden.length - 1];
  var day = target.end < -past ? -past : Math.max(-past, target.start - 1);
  scrollEl.scrollTo({ left: Math.max(0, (day + past) * scrollEl._tlPxPerDay - TL_PIN_PX), behavior: 'smooth' });
});

document.addEventListener('scroll', function(e) {
  var el = e.target;
  if (!el || !el.classList || !el.classList.contains('tl-scroll-wrap')) return;
  _layoutTimelineLanes(el);
  _updateOverduePin(el);
}, true);

// ── Widget-bygger: én funksjon for alle tidslinje-widgets ──────────────────
// opts: { tlId, scrollId, configKey, syncKeys, onHorizonChange }
// syncKeys: andre _tlConfig-nøkler som skal følge samme horizon/axisMode
// onHorizonChange: valgfri callback etter horizon-endring (f.eks. re-scroll)
// Farge og etikett per sakstype, brukt av filterchipsene i tidslinje-headeren.
// Fargene svarer til de samme statusfargene som brukes på status-pillene
// (STATUS_CONFIG) ellers i appen, slik at tidslinjen og saklistene stemmer
// visuelt overens. Oppdrag beholder appens etablerte cyan-farge (samme som
// .tl-bar-oppdrag, .case-card-oppdrag og .oppdrag-duration-pill).
var TIMELINE_TYPE_META = {
  ny:               { label: 'Ny',               color: '#185fa5' },
  fristarkiv:       { label: 'Fristarkiv',        color: '#6b7280' },
  viderebehandling: { label: 'Viderebehandling',  color: '#4338ca' },
  oppdrag:          { label: 'Oppdrag',           color: '#06b6d4' }
};

function buildTimelineWidget(hostEl, opts) {
  var tlId      = opts.tlId;
  var scrollId  = opts.scrollId;
  var cfgKey    = opts.configKey;
  var syncKeys  = opts.syncKeys || [];
  var lblBufId  = opts.legendBufferId || null;

  var wrap = document.createElement('div');
  wrap.className = 'home-timeline-wrap';

  // Header: sakstype-filter til venstre, horisont-valg til høyre
  var header = document.createElement('div');
  header.className = 'tl-header';
  header.style.justifyContent = 'space-between';

  var typeWrap = document.createElement('div');
  typeWrap.className = 'tl-type-toggle';
  typeWrap.setAttribute('role', 'group');
  typeWrap.setAttribute('aria-label', 'Filtrer sakstyper');
  TIMELINE_TYPES.forEach(function(t) {
    var meta = TIMELINE_TYPE_META[t];
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tl-type-chip';
    chip.dataset.type = t;
    chip.setAttribute('aria-pressed', 'false');
    var dot = document.createElement('span');
    dot.className = 'tl-type-dot';
    dot.style.background = meta.color;
    chip.appendChild(dot);
    chip.appendChild(document.createTextNode(meta.label));
    typeWrap.appendChild(chip);
  });
  header.appendChild(typeWrap);

  var horizonWrap = document.createElement('div');
  horizonWrap.className = 'tl-horizon-group';
  TL_HORIZONS.forEach(function(h) {
    var btn = document.createElement('button');
    btn.className = 'tl-horizon-btn';
    btn.dataset.tlHorizon = String(h);
    btn.textContent = h === 90 ? '3 mnd' : h === 180 ? '6 mnd' : '1 år';
    horizonWrap.appendChild(btn);
  });
  header.appendChild(horizonWrap);
  wrap.appendChild(header);

  // Scroll wrap + timeline div
  var scrollWrap = document.createElement('div');
  scrollWrap.className = 'tl-scroll-wrap';
  scrollWrap.id = scrollId;
  var tlDiv = document.createElement('div');
  tlDiv.id = tlId;
  scrollWrap.appendChild(tlDiv);
  wrap.appendChild(scrollWrap);

  // Footer
  var footer = document.createElement('div');
  footer.className = 'tl-footer';

  var legend = document.createElement('div');
  legend.className = 'tl-legend';
  legend.innerHTML =
    '<span class="tl-legend-item"><span class="tl-legend-swatch tl-legend-swatch-vac"></span>Ferie</span>' +
    '<span class="tl-legend-item"><span class="tl-legend-swatch tl-legend-swatch-buffer"></span>Fridag</span>' +
    '<span class="tl-legend-item"><span class="tl-legend-swatch tl-legend-swatch-overdue"></span>Forfalt</span>';
  if (lblBufId) {
    var bufItem = document.createElement('span');
    bufItem.className = 'tl-legend-item';
    bufItem.id = lblBufId;
    bufItem.style.display = 'none';
    bufItem.innerHTML =
      '<span class="tl-legend-today-wrap">' +
        '<span class="tl-legend-today-line"></span>' +
        '<span class="tl-legend-today-bar"></span>' +
      '</span> Faktisk frist';
    legend.appendChild(bufItem);
    var lateItem = document.createElement('span');
    lateItem.className = 'tl-legend-item';
    lateItem.id = lblBufId + '-late';
    lateItem.style.display = 'none';
    lateItem.innerHTML = '<span class="tl-legend-swatch tl-legend-swatch-postponed"></span>Utsatt etter fristen';
    legend.appendChild(lateItem);
  }
  footer.appendChild(legend);

  var axisToggleWrap = document.createElement('div');
  axisToggleWrap.className = 'tl-axis-toggle';
  var lblMnd = document.createElement('span');
  lblMnd.className = 'tl-axis-lbl active';
  var toggleTrack = document.createElement('div');
  toggleTrack.className = 'tl-toggle-track';
  toggleTrack.innerHTML = '<div class="tl-toggle-thumb"></div>';
  var lblUke = document.createElement('span');
  lblUke.className = 'tl-axis-lbl';
  lblMnd.textContent = 'mnd';
  lblUke.textContent = 'uke';
  axisToggleWrap.appendChild(lblMnd);
  axisToggleWrap.appendChild(toggleTrack);
  axisToggleWrap.appendChild(lblUke);
  footer.appendChild(axisToggleWrap);
  wrap.appendChild(footer);

  hostEl.appendChild(wrap);

  // ── Event-handlere ──────────────────────────────
  // Horisont og mnd/uke deles mellom home- og cases-timeline (via cfgKey +
  // syncKeys, som før). Sakstypefilteret er derimot alltid eget per
  // tidslinje-instans (nøkkel = tlId), slik at cases-timeline kan følge
  // aktiv side uavhengig av hva som er valgt i Arbeidsplan på Hjem.
  function _syncVisual() {
    var cfg = _tlConfig[cfgKey];
    var isWeek = cfg.axisMode === 'week';
    var h = cfg.horizon;
    horizonWrap.querySelectorAll('[data-tl-horizon]').forEach(function(b) {
      b.classList.toggle('active', parseInt(b.dataset.tlHorizon, 10) === h);
    });
    toggleTrack.classList.toggle('on', isWeek);
    lblMnd.classList.toggle('active', !isWeek);
    lblUke.classList.toggle('active', isWeek);

    var active = {};
    (_tlConfig[tlId].typeFilter || []).forEach(function(t) { active[t] = true; });
    typeWrap.querySelectorAll('.tl-type-chip').forEach(function(c) {
      var on = !!active[c.dataset.type];
      c.classList.toggle('active', on);
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  header.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-tl-horizon]');
    if (!btn) return;
    var h = parseInt(btn.dataset.tlHorizon, 10);
    _tlConfig[cfgKey].horizon = h;
    syncKeys.forEach(function(k) { _tlConfig[k].horizon = h; });
    saveTlView();
    _syncAllWidgets([cfgKey].concat(syncKeys));
    renderTimeline({ target: tlId });
  });

  toggleTrack.addEventListener('click', function() {
    var mode = _tlConfig[cfgKey].axisMode === 'month' ? 'week' : 'month';
    _tlConfig[cfgKey].axisMode = mode;
    syncKeys.forEach(function(k) { _tlConfig[k].axisMode = mode; });
    saveTlView();
    _syncAllWidgets([cfgKey].concat(syncKeys));
    renderTimeline({ target: tlId });
  });

  typeWrap.addEventListener('click', function(e) {
    var chip = e.target.closest('.tl-type-chip');
    if (!chip) return;
    var t = chip.dataset.type;
    var set = _tlConfig[tlId].typeFilter || [];
    var idx = set.indexOf(t);
    _tlConfig[tlId].typeFilter = idx === -1 ? set.concat([t]) : set.slice(0, idx).concat(set.slice(idx + 1));
    if (tlId === 'home-timeline') saveTlView();
    _syncVisual();
    renderTimeline({ target: tlId });
  });

  // Eksponér _syncVisual så _syncAllWidgets (og sidebytte-logikken i render())
  // kan nå den
  wrap._syncVisual = _syncVisual;
  wrap._cfgKeys = [cfgKey].concat(syncKeys);

  _syncVisual();
  return wrap;
}

// Oppdater alle widget-wrappers som deler minst én av de oppgitte nøklene
function _syncAllWidgets(keys) {
  document.querySelectorAll('.home-timeline-wrap').forEach(function(w) {
    if (w._cfgKeys && w._cfgKeys.some(function(k) { return keys.indexOf(k) >= 0; })) {
      w._syncVisual();
    }
  });
}

function renderTimeline(opts) {
  // Bakoverkompatibilitet: renderTimeline() eller renderTimeline('id') eller renderTimeline('id', rows)
  if (typeof opts === 'string' || opts === undefined || opts === null) {
    var _id   = opts || null;
    var _rows = arguments[1] || null;
    opts = _id ? { target: _id } : {};
    if (_rows) opts.draftRows = _rows;
  }
  var ids = Array.isArray(opts.target)
    ? opts.target
    : opts.target
      ? [opts.target]
      : ['home-timeline'];
  ids.forEach(function(id) {
    var cfg = Object.assign({}, _tlConfig[id] || _tlConfig['home-timeline'] || {}, opts);
    var wrap = document.getElementById(id);
    if (!wrap) return;
    var track = buildTimelineDiv({
      horizon:     365,
      typeFilter:  cfg.typeFilter || [],
      axisMode:    cfg.axisMode   || 'month',
      draftRows:   cfg.draftRows  || null,
      draggable:   id !== 'modal-timeline',
      // Forhåndsvisningen i sak-dialogen er bare til å se på: klikk der ville
      // lukket dialogen og kastet det som er skrevet inn.
      interactive: id !== 'modal-timeline',
      // Datovelgeren i sak-dialogen trenger ikke markeringen
      activeId:    id === 'modal-timeline' ? null : (activeCase && activeCase.id),
    });
    var existing = wrap.querySelector('.tl-track');
    if (existing) wrap.replaceChild(track, existing);
    else          wrap.appendChild(track);
    var scrollEl = wrap.closest('.tl-scroll-wrap');
    if (scrollEl) _applyTimelineScroll(scrollEl, track, cfg.horizon || 365);
  });
  // Sporet er tegnet på nytt; behold markeringen fra sakslisten
  if (_tlLinkedId) applyTimelineLink(_tlLinkedId, true);
  var legendOn = showBufferLegend(cases);
  var lateOn   = cases.some(function(c) { return postponedDaysFor(c) > 0; });
  ['home-legend-buffer', 'cases-legend-buffer'].forEach(function(lid) {
    var el = document.getElementById(lid); if (el) el.style.display = legendOn ? '' : 'none';
    var late = document.getElementById(lid + '-late'); if (late) late.style.display = lateOn ? '' : 'none';
  });
}

// Forklaringen «Faktisk frist» vises når minst én aktiv sak har en buffer,
// altså når streken den forklarer faktisk kan stå i tidslinjen. Ble før
// avgjort én gang ved oppstart. Ren funksjon — se test/logicFixes.test.js.
function showBufferLegend(list) {
  return (list || []).some(function(c) {
    return !!c && !!c.dueDate && c.status !== 'avsluttet' && bufferDaysFor(c) !== 0;
  });
}

