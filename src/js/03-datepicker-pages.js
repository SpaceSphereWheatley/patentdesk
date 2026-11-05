// ── Dato-hjelper: auto-formatering ────────────────
function autoFormatDateInput(el) {
  el.addEventListener('input', function() {
    var raw = this.value.replace(/[^\d]/g, ''), out = '';
    if (raw.length > 0) out += raw.slice(0, 4);
    if (raw.length > 4) out += '.' + raw.slice(4, 6);
    if (raw.length > 6) out += '.' + raw.slice(6, 8);
    this.value = out;
  });
}

// ── DatePicker ─────────────────────────────────────
var _dp = (function() {
  var NB_DAYS   = ['Man','Tir','Ons','Tor','Fre','Lør','Søn'];
  var NB_MONTHS = ['Januar','Februar','Mars','April','Mai','Juni',
                   'Juli','August','September','Oktober','November','Desember'];

  var popup    = null;
  var targetEl = null;
  var viewYear = 0, viewMonth = 0;

  function build() {
    popup = document.createElement('div');
    popup.className = 'dp-popup';
    popup.setAttribute('aria-label', 'Kalender');
    popup.innerHTML =
      '<div class="dp-header">' +
        '<button type="button" class="dp-nav dp-prev" title="Forrige måned">&#8249;</button>' +
        '<span class="dp-heading"></span>' +
        '<button type="button" class="dp-nav dp-next" title="Neste måned">&#8250;</button>' +
      '</div>' +
      '<div class="dp-weekdays">' +
        NB_DAYS.map(function(d){ return '<span>' + d + '</span>'; }).join('') +
      '</div>' +
      '<div class="dp-grid"></div>';
    document.body.appendChild(popup);

    popup.querySelector('.dp-prev').addEventListener('click', function(e) {
      e.stopPropagation();
      viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      renderGrid();
    });
    popup.querySelector('.dp-next').addEventListener('click', function(e) {
      e.stopPropagation();
      viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      renderGrid();
    });
    popup.querySelector('.dp-grid').addEventListener('click', function(e) {
      var btn = e.target.closest('.dp-day:not(.dp-day-empty)');
      if (!btn || !targetEl) return;
      var day = parseInt(btn.dataset.day, 10);
      targetEl.value = viewYear + '.' +
        String(viewMonth + 1).padStart(2,'0') + '.' +
        String(day).padStart(2,'0');
      targetEl.dispatchEvent(new Event('input',  { bubbles: true }));
      targetEl.dispatchEvent(new Event('change', { bubbles: true }));
      close();
    });
    document.addEventListener('mousedown', function(e) {
      if (popup && popup.style.display !== 'none' &&
          !popup.contains(e.target) && e.target !== targetEl &&
          !e.target.classList.contains('dp-trigger')) {
        close();
      }
    });
  }

  function renderGrid() {
    popup.querySelector('.dp-heading').textContent = NB_MONTHS[viewMonth] + ' ' + viewYear;
    var selDate = targetEl ? parseDate(targetEl.value) : '';
    var sY = 0, sM = -1, sD = 0;
    if (selDate) { var sp = selDate.split('-'); sY = +sp[0]; sM = +sp[1]-1; sD = +sp[2]; }
    var today = new Date(); today.setHours(0,0,0,0);
    var tY = today.getFullYear(), tM = today.getMonth(), tD = today.getDate();
    var firstDow    = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
    var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    var cells = '';
    for (var i = 0; i < firstDow; i++)
      cells += '<button type="button" class="dp-day dp-day-empty" tabindex="-1"></button>';
    for (var d = 1; d <= daysInMonth; d++) {
      var isSel   = (d === sD && viewMonth === sM && viewYear === sY);
      var isToday = (d === tD && viewMonth === tM && viewYear === tY);
      cells += '<button type="button" class="dp-day' +
        (isSel ? ' dp-day-sel' : '') + (isToday ? ' dp-day-today' : '') +
        '" data-day="' + d + '">' + d + '</button>';
    }
    popup.querySelector('.dp-grid').innerHTML = cells;
  }

  function positionPopup(inputEl) {
    var rect  = inputEl.getBoundingClientRect();
    var scrollY = window.scrollY || document.documentElement.scrollTop;
    popup.style.display = 'block';
    popup.style.top  = (rect.bottom + scrollY + 4) + 'px';
    popup.style.left = rect.left + 'px';
    var pw = popup.offsetWidth, ww = window.innerWidth;
    if (rect.left + pw > ww - 8)
      popup.style.left = Math.max(4, ww - pw - 8) + 'px';
  }

  function open(inputEl) {
    if (!popup) build();
    targetEl = inputEl;
    var cur = parseDate(inputEl.value);
    if (cur) { var p = cur.split('-'); viewYear = +p[0]; viewMonth = +p[1]-1; }
    else { var n = new Date(); viewYear = n.getFullYear(); viewMonth = n.getMonth(); }
    renderGrid();
    positionPopup(inputEl);
  }

  function close() {
    if (popup) popup.style.display = 'none';
    targetEl = null;
  }

  function initDatePicker(el) {
    if (!el || el.dataset.dpInit) return;
    el.dataset.dpInit = '1';
    autoFormatDateInput(el);

    var wrap = el.parentNode;
    if (!wrap.classList.contains('dp-wrap')) {
      var w = document.createElement('div');
      w.className = 'dp-wrap';
      el.parentNode.insertBefore(w, el);
      w.appendChild(el);
      wrap = w;
    }
    var triggerBtn = document.createElement('button');
    triggerBtn.type = 'button';
    triggerBtn.className = 'dp-trigger';
    triggerBtn.title = 'Velg dato';
    triggerBtn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><rect x="1" y="2" width="14" height="13" rx="2"/><line x1="5" y1="1" x2="5" y2="4"/><line x1="11" y1="1" x2="11" y2="4"/><line x1="1" y1="6" x2="15" y2="6"/></svg>';
    wrap.appendChild(triggerBtn);

    triggerBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (popup && popup.style.display !== 'none' && targetEl === el) { close(); return; }
      open(el);
    });
    el.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && popup && popup.style.display !== 'none') { close(); e.stopPropagation(); }
    });
  }

  return { init: initDatePicker, close: close };
})();

// ── Side-konfigurasjon ─────────────────────────────
var PAGES = {
  ny: {
    title:       'Nye saker',
    countsAs:    'ny'
  },
  fristarkiv: {
    title:       'Fristarkiv',
    countsAs:    null
  },
  viderebehandling: {
    title:       'Viderebehandling',
    countsAs:    null
  },
  avsluttet: {
    title:       'Alle saker',
    countsAs:    null,
    showAll:     true
  },
  oppdrag: {
    title:       'Oppdrag',
    countsAs:    null
  }
};

// ── Statuskonfigurasjon ────────────────────────────
var STATUS_CONFIG = {
  ny:              { int:0, label:'Ny',               pill:'s-ny',              histLabel:'Ny sak',           histIcon:'📄' },
  viderebehandling:{ int:1, label:'Viderebehandling', pill:'s-viderebehandling',histLabel:'Viderebehandling', histIcon:'🔄' },
  fristarkiv:      { int:2, label:'Fristarkiv',       pill:'s-fristarkiv',      histLabel:'Fristarkiv',       histIcon:'📁' },
  avsluttet:       { int:3, label:'Avsluttet',        pill:'s-avsluttet',       histLabel:'Avsluttet',        histIcon:'✅' }
};
var INT_TO_STATUS = { 0:'ny', 1:'viderebehandling', 2:'fristarkiv', 3:'avsluttet' };

var LOG_LABELS = { ny:'Nybehandling', videre:'Viderebehandling', avsluttet:'Avsluttet', oppdrag:'Oppdrag utført' };
var LOG_CLS    = { ny:'log-ny', videre:'log-videre', avsluttet:'log-avsluttet', oppdrag:'log-oppdrag' };

// ── Måneder ────────────────────────────────────────
var MONTHS = [
  {name:'Januar',    label:'jan'}, {name:'Februar',   label:'feb'},
  {name:'Mars',      label:'mar'}, {name:'April',     label:'apr'},
  {name:'Mai',       label:'mai'}, {name:'Juni',      label:'jun'},
  {name:'Juli',      label:'jul'}, {name:'August',    label:'aug'},
  {name:'September', label:'sep'}, {name:'Oktober',   label:'okt'},
  {name:'November',  label:'nov'}, {name:'Desember',  label:'des'}
];
var statYear = new Date().getFullYear();

function monthsForYear(year) {
  return MONTHS.map(function(_, i) { return year + '-' + String(i + 1).padStart(2, '0'); });
}

