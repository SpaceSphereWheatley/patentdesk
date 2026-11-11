// ── Sjekkliste-editor ──────────────────────────────
// SEKSJON 7 · BOOTSTRAP
// init()-kall, migrasjon, første render
// ════════════════════════════════════════════════════════════════════════════

// ── Init ───────────────────────────────────────────
function init() {
  // Sync versjonsnummer til DOM
  document.querySelectorAll('.logo-version, .settings-version, .drawer-version, .about-version').forEach(function(el) { el.textContent = APP_VERSION; });
  // Dato-visning i drawer
  var dateEl = document.getElementById('current-date');
  function _showCurrentDate() {
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString('nb-NO', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  }
  _showCurrentDate();
  // Datoskifte: tegn siden på nytt når en ny dag har startet. Sjekkes hvert
  // minutt og når fanen blir synlig igjen (maskinen kan ha sovet over natten).
  // Venter mens en dialog er åpen eller et felt har fokus.
  var _renderedDay = todayStr();
  function _checkDayRollover() {
    var busy = _anyBackdropOpen() || _isTypingTarget(document.activeElement);
    var today = todayStr();
    if (!dayRolloverDue(_renderedDay, today, busy)) return;
    _renderedDay = today;
    _showCurrentDate();
    render();
  }
  setInterval(_checkDayRollover, 60000);
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') _checkDayRollover();
  });
  _dp.init(document.getElementById('f-due-date'));
  _dp.init(document.getElementById('f-due-date-op'));
  _dp.init(document.getElementById('f-filing-date'));
  _dp.init(document.getElementById('f-priority-date'));
  autoFormatDateInput(document.getElementById('f-due-date-op'));
  _dp.init(document.getElementById('f-frist'));
  initTagAutocomplete(document.getElementById('f-tags'));
  initTagAutocomplete(document.getElementById('f-modal-tags'));
  initTagFilterAutocomplete();
  initCpcAutocomplete();
  initCpcLoadButton();
  initOnboarding();
  _cleUpdateSummary();
  // Drawer collapse
  var _drawer = document.getElementById('main-drawer');
  var _toggleBtn = document.getElementById('drawer-toggle-btn');
  if (_drawer && _toggleBtn) {
    if (loadDrawerCollapsed()) {
      _drawer.classList.add('collapsed');
      _toggleBtn.innerHTML = '&#8250;';
      _toggleBtn.title = 'Vis navigasjon';
    }
    _toggleBtn.addEventListener('click', function() {
      var collapsed = _drawer.classList.toggle('collapsed');
      saveDrawerCollapsed(collapsed);
      _toggleBtn.innerHTML = collapsed ? '&#8250;' : '&#8249;';
      _toggleBtn.title = collapsed ? 'Vis navigasjon' : 'Skjul navigasjon';
      // Festeregelen avhenger av sidemenyens bredde: sjekk på nytt når
      // overgangen er ferdig (og som reserve om den ikke fyrer)
      setTimeout(function() { if (_roundDrawer.open) renderRoundDrawer(); }, 450);
    });
    _drawer.addEventListener('transitionend', function(e) {
      if (e.target === _drawer && e.propertyName === 'width' && _roundDrawer.open) renderRoundDrawer();
    });
  }

  // Kjør migrasjon (v3 → v4)
  migrateAll();

  // Automatisk sikkerhetskopi: last mappehåndtak og ta oppstartskopi
  _bkInit();

  // Start på riktig side basert på URL-hash
  var entry = initialHistoryEntry(pageFromHash(), activeSakId, activeMedlesingId, location.hash.replace('#', '').trim());
  activePage = entry.page;
  history.replaceState(Object.assign({}, entry.state, { idx: navDepth() }), '', entry.url);
  // Bygg tidslinje-widgets (må skje før render() så #home-timeline finnes i DOM)
  buildTimelineWidget(document.getElementById('home-tl-host'), {
    tlId:           'home-timeline',
    scrollId:       'home-tl-scroll',
    configKey:      'home-timeline',
    syncKeys:       ['cases-timeline'],
    legendBufferId: 'home-legend-buffer',
  });
  buildTimelineWidget(document.getElementById('cases-tl-host'), {
    tlId:           'cases-timeline',
    scrollId:       'cases-tl-scroll',
    configKey:      'home-timeline',
    syncKeys:       ['cases-timeline'],
    legendBufferId: 'cases-legend-buffer',
  });
  render();

  // ── Tidslinje-drag: per-sak-buffer via drag eller Alt + piltast ────────
  // Gjelder tidslinjen på Hjem og på sakslistene; forhåndsvisningen i
  // sak-dialogen er bare til å se på. Pekerhendelser, så det virker med mus,
  // penn og berøring. Utregningen (timelineDragBuffer, timelineBarStart,
  // tlDueOffset) er den samme som tegner bjelkene, så bjelken lander der den
  // ble sluppet. En brikke over bjelken viser hva draget gjør med bufferen.
  (function() {
    var dragging = null;
    var DRAG_TIMELINES = '#home-timeline, #cases-timeline';

    // Datoen fristen havner på med en gitt buffer.
    function effDueWithBuffer(dueDate, buffer) {
      var d = new Date(dueDate + 'T00:00:00');
      d.setDate(d.getDate() - buffer);
      return isoLocalDate(d);
    }

    function ensureMarker(track, cls, caseId, bar) {
      var el = track.querySelector('.' + cls + '[data-id="' + caseId + '"]');
      if (el) return el;
      var barTop = parseInt(bar.style.top, 10) || 4;
      var barH   = parseInt(bar.style.height, 10) || 40;
      el = document.createElement('div');
      el.className = cls;
      el.dataset.id = caseId;
      el.dataset.row = bar.dataset.row;
      if (cls === 'tl-actual-line') {
        el.style.top = (barTop + Math.round(barH / 2)) + 'px';
      } else {
        el.style.top    = (barTop + 3) + 'px';
        el.style.height = (barH - 6) + 'px';
      }
      el.style.display = 'none';
      track.appendChild(el);
      return el;
    }

    // Brikken står i tidslinjens ramme (ikke i sporet, som klipper alt over
    // seg), ved sporet som popupen (timelinePopupPosition), så den ikke dekker
    // andre bjelker. Pilen peker på bjelken.
    function showChip(d) {
      var host = d.bar.closest('.home-timeline-wrap');
      if (!host) return;
      if (!d.chip) {
        d.chip = document.createElement('div');
        d.chip.className = 'tl-drag-chip';
        d.chip.setAttribute('aria-hidden', 'true');
        host.appendChild(d.chip);
      }
      var eff = effDueWithBuffer(d.cas.dueDate, d.newBuffer);
      var t = timelineDragChip(d.origBuffer, d.newBuffer, typeBufferFor(d.cas), formatDate(eff), formatDate(d.cas.dueDate), d.blocked);
      d.chip.classList.toggle('is-warn', t.warn);
      d.chip.innerHTML = '<b>' + (t.warn ? '⚠ ' : '') + esc(t.head) + '</b><small>' + esc(t.sub) + '</small>';
      var b = d.bar.getBoundingClientRect(), h = host.getBoundingClientRect();
      var tr = d.bar.closest('.tl-track').getBoundingClientRect();
      var cr = d.chip.getBoundingClientRect();
      var pos = timelinePopupPosition(b.left + b.width / 2, tr.top, tr.bottom, cr.width, cr.height,
        document.documentElement.clientWidth, document.documentElement.clientHeight);
      d.chip.style.left = (pos.left - h.left) + 'px';
      d.chip.style.top  = (pos.top - h.top) + 'px';
      d.chip.style.setProperty('--tl-popup-arrow-x', pos.arrowX + 'px');
      d.chip.classList.toggle('is-below', pos.below);
    }

    // Lagrer en ny buffer (lik standarden for typen → ingen egen buffer) og
    // tegner siden på nytt, så frister, sortering og belegg følger med.
    function saveBuffer(cas, newBuffer) {
      var finalBuffer = newBuffer === typeBufferFor(cas) ? null : newBuffer;
      dispatch('CASE_FIELD_UPDATE', { id: cas.id, patch: { caseBuffer: finalBuffer } });
      render();
    }

    document.addEventListener('pointerdown', function(e) {
      if (e.button !== 0) return;
      var bar = e.target.closest('.tl-bar.draggable');
      if (!bar) return;
      var track = bar.closest('.tl-track');
      if (!track || !track._tl || !track.closest(DRAG_TIMELINES)) return;
      var cas = cases.find(function(c) { return c.id === bar.dataset.id; });
      if (!cas) return;
      e.preventDefault();
      var g = track._tl;
      dragging = {
        bar: bar, cas: cas, g: g, startX: e.clientX,
        tlId: track.parentElement.id,
        pxPerDay: track.offsetWidth / (g.past + g.horizon),
        origBuffer: bufferDaysFor(cas),
        minBuffer: minBufferFor(cas),
        newBuffer: null,
        blocked: false,
        tag: track.querySelector('.tl-postpone-tag[data-id="' + CSS.escape(cas.id) + '"]'),
        actualEnd: tlDueOffset(cas.dueDate, g.now),
        line: ensureMarker(track, 'tl-actual-line', cas.id, bar),
        mark: ensureMarker(track, 'tl-actual-mark', cas.id, bar),
        chip: null,
        hasMoved: false
      };
      dragging.mark.style.left = 'calc(' + g.pct(dragging.actualEnd) + ' - 1px)';
    });

    document.addEventListener('pointermove', function(e) {
      if (!dragging) return;
      var d = dragging;
      var dx = e.clientX - d.startX;
      if (!d.hasMoved && Math.abs(dx) <= 3) return;
      if (!d.hasMoved) {
        d.hasMoved = true;
        d.bar.classList.add('dragging');
        // Under drag sender ikke nettleseren mousemove (pointerdown er
        // preventDefault-et), så popupen skjules her; brikken tar over.
        var pop = document.querySelector('.tl-popup');
        if (pop) pop.dispatchEvent(new Event('tl-popup-hide'));
      }
      var newBuffer = timelineDragBuffer(d.origBuffer, dx, d.pxPerDay, TYPE_BUFFER_MAX, d.minBuffer);
      d.newBuffer = newBuffer;
      // Dratt mot fristen på en sak som ikke kan utsettes
      d.blocked = newBuffer <= 0 && d.minBuffer === 0 &&
                  timelineDragBuffer(d.origBuffer, dx, d.pxPerDay, TYPE_BUFFER_MAX, -Infinity) < 0;
      d.bar.classList.toggle('at-limit', newBuffer <= d.minBuffer || newBuffer >= TYPE_BUFFER_MAX);

      var eff    = effDueWithBuffer(d.cas.dueDate, newBuffer);
      var effEnd = tlDueOffset(eff, d.g.now);
      var start  = Math.max(-d.g.past, timelineBarStart(d.cas, eff, d.g.now));
      d.bar.style.left  = d.g.pct(start);
      d.bar.style.width = d.g.pctW(effEnd - start);
      if (d.tag) d.tag.style.display = 'none'; // merket følger ikke med; brikken tar over

      var late = newBuffer < 0;
      if (late) {
        setPostponedPart(d.bar, start, effEnd, d.actualEnd);
        var part = d.bar.querySelector('.tl-bar-postponed');
        if (part) part.classList.add('is-live');
      } else {
        setPostponedPart(d.bar, start, start, d.actualEnd); // fjerner skraveringen
      }
      d.mark.style.display = newBuffer !== 0 ? '' : 'none';
      var lineFrom = late ? d.actualEnd : effEnd;
      var lineTo   = late ? start : d.actualEnd;
      d.line.style.display = newBuffer !== 0 && lineTo > lineFrom ? '' : 'none';
      if (lineTo > lineFrom) {
        d.line.style.left  = d.g.pct(lineFrom);
        d.line.style.width = d.g.pctW(lineTo - lineFrom);
      }
      showChip(d);
    });

    function finish(cancelled) {
      var d = dragging;
      dragging = null;
      d.bar.classList.remove('at-limit', 'dragging');
      if (d.chip) d.chip.remove();
      if (!d.hasMoved) {
        if (cancelled) return;
        // Ren klikk uten drag — naviger til sakssiden direkte her, før noen
        // re-render kan fjerne bjelken fra DOM.
        closeAllBackdrops();
        navigateTo('sak/' + d.cas.id);
        return;
      }
      if (!cancelled && d.newBuffer !== null && d.newBuffer !== d.origBuffer) saveBuffer(d.cas, d.newBuffer);
      else renderTimeline({ target: d.tlId });
    }

    document.addEventListener('pointerup', function() { if (dragging) finish(false); });
    document.addEventListener('pointercancel', function() { if (dragging) finish(true); });

    // Tastatur: Alt + ← / → på en bjelke i fokus endrer bufferen med én dag.
    // Fokus settes tilbake på den nye bjelken etter at sporet er tegnet på nytt.
    document.addEventListener('keydown', function(e) {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      var bar = e.target.closest && e.target.closest('.tl-bar.draggable');
      if (!bar || !bar.closest(DRAG_TIMELINES)) return;
      var cas = cases.find(function(c) { return c.id === bar.dataset.id; });
      if (!cas) return;
      var orig = bufferDaysFor(cas);
      var next = timelineKeyBuffer(orig, e.key, TYPE_BUFFER_MAX, minBufferFor(cas));
      if (next === null) return;
      e.preventDefault();
      if (next === orig) return;
      var tlId = bar.closest(DRAG_TIMELINES).id;
      saveBuffer(cas, next);
      var again = document.querySelector('#' + tlId + ' .tl-bar[data-id="' + CSS.escape(cas.id) + '"]');
      // Popupen over bjelken i fokus viser de nye datoene
      if (again) again.focus();
    });
  })();
  var _resizeTimer;
  window.addEventListener('resize', function() {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(function() {
      ['home-timeline', 'cases-timeline', 'modal-timeline'].forEach(function(id) {
        var tlDiv = document.getElementById(id);
        if (!tlDiv) return;
        var track = tlDiv.querySelector('.tl-track');
        if (!track) return;
        var scrollEl = tlDiv.closest('.tl-scroll-wrap');
        if (!scrollEl || !scrollEl.clientWidth) return;
        var cfg = _tlConfig[id] || _tlConfig['home-timeline'];
        _applyTimelineScroll(scrollEl, track, cfg.horizon || 90);
      });
    }, 150);
  });

  // Om-panel
  document.getElementById('btn-about-open').addEventListener('click', function() {
    var fact = FUN_FACTS[Math.floor(Math.random() * FUN_FACTS.length)];
    document.getElementById('about-fact').textContent = fact;
    openBackdrop('about-backdrop');
  });
  document.getElementById('btn-about-close').addEventListener('click', function() {
    closeBackdrop('about-backdrop');
  });
  document.getElementById('about-backdrop').addEventListener('click', function(e) {
    if (e.target === this) closeBackdrop('about-backdrop');
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

