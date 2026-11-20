'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadFunctions } = require('./extractFunctions');

const MD_FNS = ['mdToHtml', 'mdInline', 'mdSafeUrl', '_mdBlocks', '_mdSplitRow', '_mdListItem',
  'mdDocumentHtml', 'mdTabHtml', 'mdReadProblem', 'esc'];
const {
  mdToHtml, mdInline, mdSafeUrl, mdDocumentHtml, mdTabHtml, mdReadProblem
} = loadFunctions(MD_FNS, { vars: ['MD_MAX_BYTES', 'MD_MAX_DEPTH', 'MD_DOC_CSS'] });

// Hele utdataen kan bare inneholde tagger renderen selv lager.
const ALLOWED_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'strong', 'em', 'del', 'code', 'pre',
  'ul', 'ol', 'li', 'blockquote', 'hr', 'br', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'div', 'span'];
function tagsIn(html) {
  return (html.match(/<\/?([a-zA-Z0-9]+)/g) || []).map((t) => t.replace(/[</]/g, '').toLowerCase());
}
function onlyOwnTags(html) {
  tagsIn(html).forEach((t) => assert.ok(ALLOWED_TAGS.includes(t), 'unexpected tag <' + t + '> in ' + html));
}

// ── AC 1: elementer ─────────────────────────────────

test('mdToHtml: headings # to ######, closing hashes dropped, ####### is text', () => {
  assert.strictEqual(mdToHtml('# Tittel'), '<h1>Tittel</h1>');
  assert.strictEqual(mdToHtml('### Del ###'), '<h3>Del</h3>');
  assert.strictEqual(mdToHtml('###### Seks'), '<h6>Seks</h6>');
  assert.strictEqual(mdToHtml('####### Sju'), '<p>####### Sju</p>');
  assert.strictEqual(mdToHtml('#Ingen'), '<p>#Ingen</p>');
});

test('mdToHtml: setext headings (=== and ---)', () => {
  assert.strictEqual(mdToHtml('Tittel\n==='), '<h1>Tittel</h1>');
  assert.strictEqual(mdToHtml('Under\n---'), '<h2>Under</h2>');
});

test('mdToHtml: paragraphs split on blank lines, lines inside joined', () => {
  assert.strictEqual(mdToHtml('a\nb\n\nc'), '<p>a\nb</p><p>c</p>');
});

test('mdToHtml: hard line break from two trailing spaces or a backslash', () => {
  assert.strictEqual(mdToHtml('a  \nb'), '<p>a<br>\nb</p>');
  assert.strictEqual(mdToHtml('a\\\nb'), '<p>a<br>\nb</p>');
});

test('mdInline: bold, italic, bold+italic, strikethrough, code', () => {
  assert.strictEqual(mdInline('**fet** og __fet__'), '<strong>fet</strong> og <strong>fet</strong>');
  assert.strictEqual(mdInline('*kursiv* og _kursiv_'), '<em>kursiv</em> og <em>kursiv</em>');
  assert.strictEqual(mdInline('***begge***'), '<strong><em>begge</em></strong>');
  assert.strictEqual(mdInline('~~borte~~'), '<del>borte</del>');
  assert.strictEqual(mdInline('`a < b`'), '<code>a &lt; b</code>');
  assert.strictEqual(mdInline('``kode med ` inni``'), '<code>kode med ` inni</code>');
});

test('mdInline: formatting is not applied inside code, or inside words with _', () => {
  assert.strictEqual(mdInline('`**ikke fet**`'), '<code>**ikke fet**</code>');
  assert.strictEqual(mdInline('snake_case_navn'), 'snake_case_navn');
  assert.strictEqual(mdInline('2 * 3 * 4'), '2 * 3 * 4');
});

test('mdInline: backslash escapes keep the character literal', () => {
  assert.strictEqual(mdInline('\\*ikke kursiv\\*'), '*ikke kursiv*');
  assert.strictEqual(mdInline('\\# \\[x\\]'), '# [x]');
});

test('mdInline: links [text](url), with title, <url> and bare https urls', () => {
  const a = (href, text) => '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + text + '</a>';
  assert.strictEqual(mdInline('[EPO](https://epo.org)'), a('https://epo.org', 'EPO'));
  assert.strictEqual(mdInline('[EPO](https://epo.org "Tittel")'), a('https://epo.org', 'EPO'));
  assert.strictEqual(mdInline('[**fet** lenke](https://x.no)'), a('https://x.no', '<strong>fet</strong> lenke'));
  assert.strictEqual(mdInline('<https://x.no/a?b=1&c=2>'), a('https://x.no/a?b=1&amp;c=2', 'https://x.no/a?b=1&amp;c=2'));
  assert.strictEqual(mdInline('Se https://x.no/side.'), 'Se ' + a('https://x.no/side', 'https://x.no/side') + '.');
  assert.strictEqual(mdInline('[post](mailto:a@b.no)'), a('mailto:a@b.no', 'post'));
});

test('mdInline: images show as text, never as <img>', () => {
  assert.strictEqual(mdInline('![Fig. 1](fig1.png)'), '<span class="md-img">[bilde: Fig. 1]</span>');
});

test('mdToHtml: fenced code blocks (``` and ~~~), content escaped and kept as is', () => {
  assert.strictEqual(mdToHtml('```js\nif (a < b) **x**\n```'), '<pre><code>if (a &lt; b) **x**</code></pre>');
  assert.strictEqual(mdToHtml('~~~\n# ikke overskrift\n~~~'), '<pre><code># ikke overskrift</code></pre>');
  assert.strictEqual(mdToHtml('```\nuavsluttet'), '<pre><code>uavsluttet</code></pre>');
});

test('mdToHtml: indented code block', () => {
  assert.strictEqual(mdToHtml('    kode\n    mer'), '<pre><code>kode\nmer</code></pre>');
});

test('mdToHtml: horizontal rules', () => {
  ['---', '***', '___', '- - -', '* * *'].forEach((r) => assert.strictEqual(mdToHtml('a\n\n' + r), '<p>a</p><hr>', r));
});

test('mdToHtml: bullet list, items with inline formatting', () => {
  assert.strictEqual(mdToHtml('- en\n- **to**\n* tre'), '<ul><li>en</li><li><strong>to</strong></li></ul><ul><li>tre</li></ul>');
  assert.strictEqual(mdToHtml('+ a\n+ b'), '<ul><li>a</li><li>b</li></ul>');
});

test('mdToHtml: numbered list keeps its start number', () => {
  assert.strictEqual(mdToHtml('1. en\n2. to'), '<ol><li>en</li><li>to</li></ol>');
  assert.strictEqual(mdToHtml('3) tre\n4) fire'), '<ol start="3"><li>tre</li><li>fire</li></ol>');
});

test('mdToHtml: nested lists by indentation', () => {
  assert.strictEqual(mdToHtml('- a\n  - a1\n  - a2\n- b'),
    '<ul><li>a<ul><li>a1</li><li>a2</li></ul></li><li>b</li></ul>');
  assert.strictEqual(mdToHtml('1. a\n   - x\n2. b'),
    '<ol><li>a<ul><li>x</li></ul></li><li>b</li></ol>');
});

test('mdToHtml: a list item continues on an indented or lazy line', () => {
  assert.strictEqual(mdToHtml('- a\n  fortsatt\n- b'), '<ul><li>a\nfortsatt</li><li>b</li></ul>');
  assert.strictEqual(mdToHtml('- a\nlat\n- b'), '<ul><li>a\nlat</li><li>b</li></ul>');
});

test('mdToHtml: loose list (blank line between items) keeps paragraphs', () => {
  assert.strictEqual(mdToHtml('- a\n\n  mer\n- b'), '<ul><li><p>a</p><p>mer</p></li><li>b</li></ul>');
});

test('mdToHtml: task list items', () => {
  assert.strictEqual(mdToHtml('- [ ] åpen\n- [x] ferdig\n- [X] også'),
    '<ul><li class="md-task"><span class="md-box">☐</span> åpen</li>' +
    '<li class="md-task"><span class="md-box">☑</span> ferdig</li>' +
    '<li class="md-task"><span class="md-box">☑</span> også</li></ul>');
});

test('mdToHtml: block quotes, nested and with lists inside', () => {
  assert.strictEqual(mdToHtml('> sitat\n> videre'), '<blockquote><p>sitat\nvidere</p></blockquote>');
  assert.strictEqual(mdToHtml('> a\n>> b'), '<blockquote><p>a</p><blockquote><p>b</p></blockquote></blockquote>');
  assert.strictEqual(mdToHtml('> - x'), '<blockquote><ul><li>x</li></ul></blockquote>');
});

test('mdToHtml: pipe table with alignment and inline formatting', () => {
  const html = mdToHtml('| Krav | D1 | Merknad |\n|:-----|:--:|------:|\n| 1 | **X** | a \\| b |\n| 2 | Y |');
  assert.strictEqual(html,
    '<div class="md-table"><table><thead><tr><th class="md-al-l">Krav</th><th class="md-al-c">D1</th><th class="md-al-r">Merknad</th></tr></thead>' +
    '<tbody><tr><td class="md-al-l">1</td><td class="md-al-c"><strong>X</strong></td><td class="md-al-r">a | b</td></tr>' +
    '<tr><td class="md-al-l">2</td><td class="md-al-c">Y</td><td class="md-al-r"></td></tr></tbody></table></div>');
});

test('mdToHtml: table without outer pipes, ends at a blank line', () => {
  assert.strictEqual(mdToHtml('a | b\n--- | ---\n1 | 2\n\netter'),
    '<div class="md-table"><table><thead><tr><th>a</th><th>b</th></tr></thead>' +
    '<tbody><tr><td>1</td><td>2</td></tr></tbody></table></div><p>etter</p>');
});

test('mdToHtml: a header/delimiter count mismatch is not a table', () => {
  assert.strictEqual(mdToHtml('a | b\n---'), '<h2>a | b</h2>');
});

test('mdToHtml: CRLF line endings, a BOM and tabs are handled', () => {
  assert.strictEqual(mdToHtml('\uFEFF# T\r\n\r\n- a\r\n\t- b'), '<h1>T</h1><ul><li>a<ul><li>b</li></ul></li></ul>');
  assert.strictEqual(mdToHtml('a\rb'), '<p>a\nb</p>');
});

test('mdToHtml: empty, blank and non-string input give an empty result', () => {
  assert.strictEqual(mdToHtml(''), '');
  assert.strictEqual(mdToHtml('\n\n   \n'), '');
  assert.strictEqual(mdToHtml(null), '');
  assert.strictEqual(mdToHtml(undefined), '');
});

test('mdToHtml: Norwegian characters pass through unchanged', () => {
  assert.strictEqual(mdToHtml('## Oppfinnelseshøyde – æøå ÆØÅ'), '<h2>Oppfinnelseshøyde – æøå ÆØÅ</h2>');
});

test('mdToHtml: a realistic examination note uses only its own tags', () => {
  const md = '# Notater NO20240001\n\n## Krav 1\n\n- D1 viser **trekk 1a–1c**\n- [ ] sjekk D2\n\n' +
    '> Søker hevder *noe annet*.\n\n| Krav | D1 |\n|---|---|\n| 1 | X |\n\n```\nkrav 1: …\n```\n\n---\nSe [EPO](https://epo.org).';
  onlyOwnTags(mdToHtml(md));
});

// ── AC 2: ingenting fra filen blir HTML ──────────────

test('mdToHtml: raw HTML in the file is shown as text', () => {
  const cases = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<div onclick="x()">klikk</div>',
    '<iframe src="https://evil"></iframe>',
    '<style>body{display:none}</style>',
    '<!-- kommentar -->',
    '<a href="javascript:alert(1)">x</a>'
  ];
  cases.forEach((c) => {
    const html = mdToHtml(c);
    onlyOwnTags(html);
    assert.doesNotMatch(html, /<(script|img|div onclick|iframe|style|!--)/i, c);
    assert.ok(html.includes('&lt;'), 'escaped: ' + c);
  });
});

test('mdInline: javascript:, data:, vbscript: and relative links are not clickable', () => {
  ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'data:text/html,<b>x</b>',
    'vbscript:x', 'file:///C:/x', 'notater.md', '#seksjon', '//evil.example'].forEach((u) => {
    const html = mdInline('[lenke](' + u + ')');
    assert.doesNotMatch(html, /<a /, u);
    onlyOwnTags(html);
  });
});

test('mdInline: attribute breakout through a url or link text is escaped', () => {
  const html = mdInline('[x](https://a.no/"onmouseover="alert(1))');
  assert.doesNotMatch(html, /"onmouseover/);
  onlyOwnTags(html);
  const t = mdInline('[<b onclick=1>](https://a.no)');
  assert.ok(t.includes('&lt;b onclick=1&gt;'));
  onlyOwnTags(t);
});

test('mdInline: HTML in code spans, table cells, headings and image alt text is escaped', () => {
  onlyOwnTags(mdInline('`<script>`'));
  onlyOwnTags(mdToHtml('| <b>a</b> |\n|---|\n| <i>x</i> |'));
  onlyOwnTags(mdToHtml('# <script>x</script>'));
  onlyOwnTags(mdInline('![<img src=x onerror=1>](a.png)'));
});

test('mdToHtml: placeholder-like control characters in the file cannot inject held HTML', () => {
  const html = mdToHtml('`<b>` \u00000\u0000 \u0000\u0000');
  onlyOwnTags(html);
  assert.strictEqual((html.match(/<code>/g) || []).length, 1);
});

test('mdToHtml: very deep nesting stays bounded and well-formed', () => {
  const deep = '>'.repeat(200) + ' x';
  const html = mdToHtml(deep);
  onlyOwnTags(html);
  assert.ok((html.match(/<blockquote>/g) || []).length <= 20);
  assert.strictEqual((html.match(/<blockquote>/g) || []).length, (html.match(/<\/blockquote>/g) || []).length);
});

test('mdToHtml: a pathological file renders in reasonable time', () => {
  const t0 = Date.now();
  mdToHtml('*a _b `c [d ~~e '.repeat(20000));
  mdToHtml('- x\n'.repeat(5000) + '> y\n'.repeat(5000));
  assert.ok(Date.now() - t0 < 3000, 'took ' + (Date.now() - t0) + ' ms');
});

test('mdSafeUrl: only http, https and mailto pass', () => {
  assert.strictEqual(mdSafeUrl('https://a.no'), 'https://a.no');
  assert.strictEqual(mdSafeUrl('HTTP://a.no'), 'HTTP://a.no');
  assert.strictEqual(mdSafeUrl('mailto:a@b.no'), 'mailto:a@b.no');
  ['', 'javascript:x', 'data:x', 'ftp://a', 'a.md', 'https://', 'https://a b', null, 42].forEach((u) => {
    assert.strictEqual(mdSafeUrl(u), null, String(u));
  });
});

// ── Dokumentet rundt: sandkasse og CSP ───────────────

test('mdDocumentHtml: a full document with a strict CSP, escaped title and links in new tabs', () => {
  const doc = mdDocumentHtml('<Notater>', '<p>x</p>');
  assert.match(doc, /^<!DOCTYPE html>/);
  assert.match(doc, /Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"/);
  assert.match(doc, /<title>&lt;Notater&gt;<\/title>/);
  assert.match(doc, /<base target="_blank">/);
  assert.ok(doc.includes('<article class="md"><p>x</p></article>'));
  assert.doesNotMatch(doc, /<script/i);
});

test('mdTabHtml: the new tab holds the document in a sandboxed iframe without scripts', () => {
  const inner = mdDocumentHtml('A & "B"', '<p>x</p>');
  const tab = mdTabHtml('A & "B"', inner);
  assert.match(tab, /Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; frame-src 'self'"/);
  assert.match(tab, /<title>A &amp; &quot;B&quot;<\/title>/);
  const m = /<iframe sandbox="([^"]*)" srcdoc="([^"]*)"/.exec(tab);
  assert.ok(m, 'sandboxed iframe with srcdoc');
  assert.strictEqual(m[1], 'allow-popups allow-popups-to-escape-sandbox');
  assert.doesNotMatch(m[1], /allow-scripts|allow-same-origin/);
  assert.doesNotMatch(m[2], /[<>"]/, 'srcdoc is attribute-escaped');
  assert.doesNotMatch(tab, /<script/i);
});

// ── AC 6: feilmeldinger ──────────────────────────────

test('mdReadProblem: http errors, no contact and too large files give a message; ok gives null', () => {
  assert.strictEqual(mdReadProblem(200, 10), null);
  assert.strictEqual(mdReadProblem(404, 0), 'Kunne ikke lese filen (404).');
  assert.strictEqual(mdReadProblem(403, 0), 'Kunne ikke lese filen (403).');
  assert.strictEqual(mdReadProblem(0, 0), 'Kunne ikke lese filen (ingen kontakt med serveren).');
  assert.strictEqual(mdReadProblem(200, 2 * 1024 * 1024), null);
  assert.strictEqual(mdReadProblem(200, 2 * 1024 * 1024 + 1), 'Filen er for stor til å vises.');
});
