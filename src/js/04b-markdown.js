// ── Markdown-leser ─────────────────────────────────
// .md-filer i saksmappen vises formatert i dokumentpanelene og i en ny fane
// (bare via den lokale serveren). mdToHtml er en ren funksjon som bare lager
// sine egne tagger: all tekst fra filen escapes, rå HTML vises som tekst,
// og bare http-, https- og mailto-lenker blir klikkbare. Bilder vises som
// tekst. Resultatet vises dessuten i en iframe med sandbox (uten skript) og
// en streng CSP. Rene funksjoner — se test/markdown.test.js.
var MD_MAX_BYTES = 2 * 1024 * 1024;
var MD_MAX_DEPTH = 20;
var MD_DOC_CSS = 'body{margin:0;padding:16px 22px;font:14px/1.6 Inter,system-ui,"Segoe UI",sans-serif;color:#111827;background:#fff;overflow-wrap:anywhere}' +
  'h1,h2,h3,h4,h5,h6{margin:1.2em 0 .5em;line-height:1.25}h1,h2{border-bottom:1px solid #e5e7eb;padding-bottom:.3em}' +
  'h1{font-size:1.55rem}h2{font-size:1.25rem}h3{font-size:1.1rem}h4,h5,h6{font-size:1rem}.md>:first-child{margin-top:0}' +
  'p,ul,ol,pre,blockquote{margin:.6em 0}li>ul,li>ol{margin:.2em 0}a{color:#2563eb}' +
  'code{font:13px Consolas,Menlo,monospace;background:#f3f4f6;padding:.1em .35em;border-radius:4px}' +
  'pre{background:#f9fafb;border:1px solid #e5e7eb;padding:10px 12px;border-radius:6px;overflow-x:auto}pre code{background:none;padding:0;white-space:pre}' +
  'blockquote{padding:0 1em;border-left:4px solid #d1d5db;color:#687080}' +
  '.md-table{overflow-x:auto;margin:1em 0}table{border-collapse:collapse}th,td{border:1px solid #d1d5db;padding:5px 10px;vertical-align:top;overflow-wrap:normal}th{background:#f9fafb;text-align:left}' +
  '.md-al-l{text-align:left}.md-al-c{text-align:center}.md-al-r{text-align:right}' +
  'hr{border:0;border-top:1px solid #d1d5db;margin:1.5em 0}li.md-task{list-style:none}.md-box{display:inline-block;width:1.2em;margin-left:-1.2em}' +
  '.md-img,.md-problem{color:#687080;font-style:italic}';

// Adressen hvis den er http(s) med vert eller mailto, ellers null.
function mdSafeUrl(url) {
  if (typeof url !== 'string') return null;
  var u = url.trim();
  if (!u || /[\s\u0000-\u001f\u007f]/.test(u)) return null;
  if (/^https?:\/\/[^\/?#]/i.test(u) || /^mailto:[^\/]/i.test(u)) return u;
  return null;
}

// Innholdet i én blokk (avsnitt, overskrift, tabellcelle) som HTML. Deler som
// er ferdige (kode, lenker, escapede tegn) legges til side som plassholdere
// (\u0000n\u0000) så resten av formateringen ikke rører dem.
function mdInline(text) {
  var store = [];
  function hold(html) { store.push(html); return '\u0000' + (store.length - 1) + '\u0000'; }
  function link(href, inner) { return '<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + inner + '</a>'; }
  function fmt(e) {
    e = e.replace(/\*\*\*(?=[^\s*])((?:[^*]|\*(?!\*)){0,2000}?[^\s*])\*\*\*/g, '<strong><em>$1</em></strong>');
    e = e.replace(/\*\*(?=[^\s*])((?:[^*]|\*(?!\*)){0,2000}?\S)\*\*/g, '<strong>$1</strong>');
    e = e.replace(/(^|[^\w])__(?=[^\s_])((?:[^_]|_(?!_)){0,2000}?\S)__(?!\w)/g, '$1<strong>$2</strong>');
    e = e.replace(/\*(?=[^\s*])([^*]*?[^\s*])\*/g, '<em>$1</em>');
    e = e.replace(/(^|[^\w])_(?=[^\s_])([^_]*?[^\s_])_(?!\w)/g, '$1<em>$2</em>');
    e = e.replace(/~~(?=[^\s~])([^~]*?[^\s~])~~/g, '<del>$1</del>');
    return e;
  }
  function restore(e) {
    return e.replace(/\u0000(\d+)\u0000/g, function(m, i) { return restore(store[Number(i)]); });
  }
  var s = String(text == null ? '' : text).replace(/\u0000/g, '');
  s = s.replace(/(?: {2,}|\\)\n/g, function() { return hold('<br>') + '\n'; });
  s = s.replace(/\\([!-\/:-@\[-`|~])/g, function(m, ch) { return hold(esc(ch)); });
  s = s.replace(/(`+)([^`]|[^`][\s\S]{0,5000}?[^`])\1(?!`)/g, function(m, f, c) {
    return hold('<code>' + esc(c.replace(/\n/g, ' ').replace(/^ (.*\S.*) $/, '$1')) + '</code>');
  });
  s = s.replace(/<((?:https?|mailto):[^\s<>]*)>/gi, function(m, u) {
    var safe = mdSafeUrl(u);
    return safe ? hold(link(safe, esc(safe))) : m;
  });
  s = s.replace(/!\[([^\]\n]{0,1000})\]\([^)\n]{0,2000}\)/g, function(m, alt) {
    return hold('<span class="md-img">[bilde: ' + esc(alt) + ']</span>');
  });
  s = s.replace(/\[([^\]]{0,1000})\]\(\s*<?([^\s<>()]{0,2000})>?(?:\s+(?:"[^"\n]{0,500}"|'[^'\n]{0,500}'))?\s*\)/g, function(m, t, u) {
    var safe = mdSafeUrl(u);
    return safe ? hold(link(safe, fmt(esc(t)))) : t;
  });
  s = s.replace(/\bhttps?:\/\/[^\s<>"\u0000]*[^\s<>"'.,:;!?)\]*_~\u0000]/gi, function(u) {
    var safe = mdSafeUrl(u);
    return safe ? hold(link(safe, esc(safe))) : u;
  });
  return restore(fmt(esc(s)));
}

// Cellene i én tabellrad. \| blir stående, så mdInline gjør det til |.
function _mdSplitRow(line) {
  var s = line.trim();
  if (s.charAt(0) === '|') s = s.slice(1);
  if (s.slice(-1) === '|' && s.slice(-2) !== '\\|') s = s.slice(0, -1);
  var cells = [], cur = '';
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i);
    if (ch === '\\' && i + 1 < s.length) { cur += ch + s.charAt(i + 1); i++; continue; }
    if (ch === '|') { cells.push(cur.trim()); cur = ''; } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

// Ett listepunkt fra lines[start] (som er et punkt, m = treffet). Gir linjene
// i punktet (uten innrykk) og hvor neste linje etter punktet er.
function _mdListItem(lines, start, m, isStart) {
  var indent = m[1].length, marker = m[2];
  var sp = m[3] ? m[3].length : 1;
  if (sp > 4 || !m[4]) sp = 1;
  var contentIndent = indent + marker.length + sp;
  var body = [m[4] || ''];
  var j = start + 1;
  var reItem = /^( {0,3})([-*+]|\d{1,9}[.)])(?:([ ]+)(.*))?$/;
  while (j < lines.length) {
    var l = lines[j];
    var lead = l.length - l.replace(/^ +/, '').length;
    if (!l.trim()) {
      var k = j + 1;
      while (k < lines.length && !lines[k].trim()) k++;
      if (k >= lines.length) break;
      var kLead = lines[k].length - lines[k].replace(/^ +/, '').length;
      if (kLead < contentIndent) break;
      for (; j < k; j++) body.push('');
      continue;
    }
    if (lead >= contentIndent) { body.push(l.slice(contentIndent)); j++; continue; }
    if (reItem.test(l)) break;
    if (body[body.length - 1].trim() && !isStart(l)) { body.push(l.replace(/^ +/, '')); j++; continue; }
    break;
  }
  return { body: body, next: j };
}

// Blokkene i lines som HTML. tight = avsnitt uten <p> (i et listepunkt uten
// tomme linjer). Dypere enn MD_MAX_DEPTH blir resten vanlig tekst.
function _mdBlocks(lines, depth, tight) {
  var reFence = /^ {0,3}(`{3,}|~{3,})(.*)$/;
  var reHead = /^ {0,3}(#{1,6})(?:[ ]+(.*?))?[ ]*$/;
  var reHr = /^ {0,3}([-*_])(?:[ ]*\1){2,}[ ]*$/;
  var reQuote = /^ {0,3}> ?(.*)$/;
  var reItem = /^( {0,3})([-*+]|\d{1,9}[.)])(?:([ ]+)(.*))?$/;
  var reDelim = /^ {0,3}\|?[ ]*:?-+:?[ ]*(?:\|[ ]*:?-+:?[ ]*)*\|?[ ]*$/;
  function isItemStart(l) {
    var m = reItem.exec(l);
    return !!m && !!(m[4] && m[4].trim()) && (!/\d/.test(m[2]) || parseInt(m[2], 10) === 1);
  }
  function isStart(l) {
    return reFence.test(l) || reHead.test(l) || reHr.test(l) || reQuote.test(l) || isItemStart(l);
  }
  var out = '', para = [], i = 0, n = lines.length;
  function flush() {
    if (!para.length) return;
    var html = mdInline(para.join('\n').replace(/\s+$/, ''));
    out += tight ? html : '<p>' + html + '</p>';
    para = [];
  }
  if (depth >= MD_MAX_DEPTH) {
    para = lines.filter(function(l) { return l.trim(); }).map(function(l) { return l.trim(); });
    flush();
    return out;
  }
  while (i < n) {
    var line = lines[i], m;
    if (!line.trim()) { flush(); i++; continue; }
    if (para.length && /^ {0,3}=+[ ]*$/.test(line)) { out += '<h1>' + mdInline(para.join('\n').trim()) + '</h1>'; para = []; i++; continue; }
    if (para.length && /^ {0,3}-+[ ]*$/.test(line)) { out += '<h2>' + mdInline(para.join('\n').trim()) + '</h2>'; para = []; i++; continue; }
    if (para.length && !isStart(line)) { para.push(line.replace(/^ +/, '')); i++; continue; }
    if ((m = reFence.exec(line)) && !(m[1].charAt(0) === '`' && m[2].indexOf('`') !== -1)) {
      flush();
      var fence = m[1], code = [];
      i++;
      while (i < n) {
        var c = /^ {0,3}(`{3,}|~{3,})[ ]*$/.exec(lines[i]);
        if (c && c[1].charAt(0) === fence.charAt(0) && c[1].length >= fence.length) { i++; break; }
        code.push(lines[i]);
        i++;
      }
      out += '<pre><code>' + esc(code.join('\n')) + '</code></pre>';
      continue;
    }
    if ((m = reHead.exec(line))) {
      flush();
      var ht = (m[2] || '').replace(/(^|[ ]+)#+[ ]*$/, '');
      out += '<h' + m[1].length + '>' + mdInline(ht.trim()) + '</h' + m[1].length + '>';
      i++;
      continue;
    }
    if (reHr.test(line)) { flush(); out += '<hr>'; i++; continue; }
    if (reQuote.test(line)) {
      flush();
      var q = [];
      while (i < n) {
        var qm = reQuote.exec(lines[i]);
        if (qm) q.push(qm[1]);
        else if (lines[i].trim() && q.length && q[q.length - 1].trim() && !isStart(lines[i])) q.push(lines[i]);
        else break;
        i++;
      }
      out += '<blockquote>' + _mdBlocks(q, depth + 1, false) + '</blockquote>';
      continue;
    }
    if ((m = reItem.exec(line))) {
      flush();
      var ordered = /\d/.test(m[2]);
      var kind = ordered ? m[2].slice(-1) : m[2];
      var tag = ordered ? 'ol' : 'ul';
      var startN = ordered ? parseInt(m[2], 10) : 1;
      var items = '';
      while (i < n && m) {
        var it = _mdListItem(lines, i, m, isStart);
        var body = it.body, cls = '', box = '';
        var task = /^\[([ xX])\][ ]+/.exec(body[0]);
        if (task) {
          body[0] = body[0].slice(task[0].length);
          cls = ' class="md-task"';
          box = '<span class="md-box">' + (task[1] === ' ' ? '☐' : '☑') + '</span> ';
        }
        var loose = body.some(function(b) { return !b.trim(); });
        items += '<li' + cls + '>' + box + _mdBlocks(body, depth + 1, !loose) + '</li>';
        i = it.next;
        var k2 = i;
        while (k2 < n && !lines[k2].trim()) k2++;
        var nm = k2 < n ? reItem.exec(lines[k2]) : null;
        if (nm && (/\d/.test(nm[2]) ? nm[2].slice(-1) : nm[2]) === kind && !reHr.test(lines[k2])) { i = k2; m = nm; } else m = null;
      }
      out += '<' + tag + (startN !== 1 ? ' start="' + startN + '"' : '') + '>' + items + '</' + tag + '>';
      continue;
    }
    if (line.indexOf('|') !== -1 && i + 1 < n && reDelim.test(lines[i + 1])) {
      var head = _mdSplitRow(line), delim = _mdSplitRow(lines[i + 1]);
      if (head.length === delim.length) {
        flush();
        var al = delim.map(function(d) {
          var l2 = d.charAt(0) === ':', r2 = d.slice(-1) === ':';
          return l2 && r2 ? ' class="md-al-c"' : (l2 ? ' class="md-al-l"' : (r2 ? ' class="md-al-r"' : ''));
        });
        var row = function(cells, t) {
          return '<tr>' + al.map(function(a, ci) { return '<' + t + a + '>' + mdInline(cells[ci] || '') + '</' + t + '>'; }).join('') + '</tr>';
        };
        var tbl = '<thead>' + row(head, 'th') + '</thead>', rows = '';
        i += 2;
        while (i < n && lines[i].trim() && lines[i].indexOf('|') !== -1 && !isStart(lines[i])) { rows += row(_mdSplitRow(lines[i]), 'td'); i++; }
        out += '<div class="md-table"><table>' + tbl + (rows ? '<tbody>' + rows + '</tbody>' : '') + '</table></div>';
        continue;
      }
    }
    if (!para.length && /^ {4}/.test(line)) {
      var ind = [];
      while (i < n && (/^ {4}/.test(lines[i]) || !lines[i].trim())) { ind.push(lines[i].slice(4)); i++; }
      while (ind.length && !ind[ind.length - 1].trim()) ind.pop();
      out += '<pre><code>' + esc(ind.join('\n')) + '</code></pre>';
      continue;
    }
    para.push(line.replace(/^ +/, ''));
    i++;
  }
  flush();
  return out;
}

function mdToHtml(src) {
  if (typeof src !== 'string') return '';
  var s = src.replace(/^\uFEFF/, '').replace(/\u0000/g, '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
  return _mdBlocks(s.split('\n'), 0, false);
}

// Hele dokumentet som vises i panelet (srcdoc i en iframe med sandbox).
function mdDocumentHtml(title, bodyHtml) {
  return '<!DOCTYPE html><html lang="no"><head><meta charset="utf-8">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">' +
    '<base target="_blank"><title>' + esc(title) + '</title><style>' + MD_DOC_CSS + '</style></head>' +
    '<body><article class="md">' + bodyHtml + '</article></body></html>';
}

// Den nye fanen fra fillisten: dokumentet ligger i en iframe med sandbox, så
// det heller ikke der kan kjøre noe med appens opphav.
function mdTabHtml(title, docHtml) {
  return '<!DOCTYPE html><html lang="no"><head><meta charset="utf-8">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; frame-src \'self\'">' +
    '<title>' + esc(title) + '</title><style>html,body{margin:0;height:100%}iframe{display:block;width:100%;height:100%;border:0}</style></head>' +
    '<body><iframe sandbox="allow-popups allow-popups-to-escape-sandbox" srcdoc="' + esc(docHtml) + '"></iframe></body></html>';
}

// Meldingen når filen ikke kan vises (status 0 = ingen kontakt), ellers null.
function mdReadProblem(status, size) {
  if (!status) return 'Kunne ikke lese filen (ingen kontakt med serveren).';
  if (status < 200 || status >= 300) return 'Kunne ikke lese filen (' + status + ').';
  if (size > MD_MAX_BYTES) return 'Filen er for stor til å vises.';
  return null;
}

// Henter filen fra den lokale serveren og gir hele dokumentet som skal vises.
function mdLoadDocument(url, title) {
  var show = function(body) { return mdDocumentHtml(title, body); };
  var problem = function(msg) { return show('<p class="md-problem">' + esc(msg) + '</p>'); };
  return fetch(url, { cache: 'no-store' }).then(function(res) {
    if (!res.ok) return problem(mdReadProblem(res.status, 0));
    return res.blob().then(function(b) {
      var p = mdReadProblem(res.status, b.size);
      if (p) return problem(p);
      return b.text().then(function(t) { return show(mdToHtml(t)); });
    });
  }).catch(function() { return problem(mdReadProblem(0, 0)); });
}

// Fillisten: viser filen formatert i fanen w (åpnet i selve klikket, så
// nettleseren ikke stopper den som en popup).
function mdOpenInTab(w, url, title) {
  try { w.opener = null; w.document.title = title; w.document.body.textContent = 'Laster …'; } catch (e) { /* fanen er lukket */ }
  mdLoadDocument(url, title).then(function(doc) {
    var blob = new Blob([mdTabHtml(title, doc)], { type: 'text/html' });
    try { w.location.replace(URL.createObjectURL(blob)); } catch (e) { /* fanen er lukket */ }
  });
}
