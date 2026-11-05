// ── Saksdetaljer: hjelpere ─────────────────────────

// Kanonisk uttrykk for domenereglene per krav; brukes ikke av UI-koden,
// men holdes i live som kjørbar dokumentasjon via test/claimRules.test.js
// eslint-disable-next-line no-unused-vars
function claimResultLabel(c) {
  if (c.novelty === null || c.inventive === null) return null; // ikke vurdert
  var issues = [];
  if (c.novelty   === false) issues.push('Mangler nyhet');
  if (c.inventive === false) issues.push('Mangler oppfinnelseshøyde');
  if (c.formal    === true)  issues.push('Formelle feil');
  if (!issues.length) return 'patenterbar';
  return issues.join(', ');
}

// eslint-disable-next-line no-unused-vars
function claimResultClass(c) {
  if (c.novelty === null || c.inventive === null) return 'claim-unassessed';
  var issues = [];
  if (c.novelty   === false) issues.push(1);
  if (c.inventive === false) issues.push(1);
  if (c.formal    === true)  issues.push(1);
  return issues.length ? 'claim-rejected' : 'claim-ok';
}

function triToggle(current) {
  // null → true → false → null
  if (current === null)  return true;
  if (current === true)  return false;
  return null;
}

function triToggleFormal(current) {
  // null → true → false → null  (true = har formelle feil)
  if (current === null)  return true;
  if (current === true)  return false;
  return null;
}

// ── Kravs-cascade: arv nyhet/OH fra overordnet krav ──
// Returnerer true hvis alle forfedre (transitivt) har field === true, ellers null.
function getClaimCascadeValue(claims, claimNum, field) {
  var claim = claims.find(function(c) { return c.num === claimNum; });
  if (!claim || !claim.dep) return null;
  var parent = claims.find(function(c) { return c.num === claim.dep; });
  if (!parent) return null;
  // Effektiv verdi på forelder (lagret eller arvet)
  var parentVal = parent[field] !== null ? parent[field] : getClaimCascadeValue(claims, parent.num, field);
  if (parentVal !== true) return null;
  // For OH: nyhet må også være effektivt true
  if (field === 'inventive') {
    var parentNovelty = parent.novelty !== null ? parent.novelty : getClaimCascadeValue(claims, parent.num, 'novelty');
    if (parentNovelty !== true) return null;
  }
  return true;
}

// Effektiv verdi for et krav (lagret verdi prioriteres, ellers cascade).
// Et krav uten nyhet er alltid låst til ingen oppfinnelseshøyde — regelen
// bor her, så ingen kaller trenger å lappe rundt inkonsistent lagret data.
function effectiveClaimValue(claims, claim, field) {
  if (field === 'inventive' && effectiveClaimValue(claims, claim, 'novelty') === false) return false;
  if (claim[field] !== null) return claim[field];
  return getClaimCascadeValue(claims, claim.num, field);
}

// ── Mothold (prior art) og granskingsrapport ────────
// Et mothold er { id:'D1', ref, title, p, e, background }. Per krav peker
// noveltyDoc på det ene motholdet som tar nyheten, og inventiveDocs på det
// ene eller de to som til sammen tar oppfinnelseshøyden.
var MAX_INVENTIVE_DOCS = 2;

// Motholdene som kan velges for nyhet eller oppfinnelseshøyde. Bakgrunns-
// mothold er aldri X/Y. E-dokumenter (eldre søknader) teller bare for nyhet,
// jf. patentloven § 2 tredje ledd — aldri mot oppfinnelseshøyden.
function claimDocSelectable(docs, field) {
  return (docs || []).filter(function(d) {
    return !d.background && !d.withdrawn && !(field === 'inventive' && d.e);
  });
}

// Teksten i angre-toasten når et mothold slettes før første brev: hvilke
// mothold som får nytt nummer. docsBefore er listen før slettingen.
function docRemoveToast(docsBefore, idx) {
  var docs = docsBefore || [];
  var removed = docs[idx] ? docs[idx].id : 'D' + (idx + 1);
  var renamed = [];
  for (var j = idx + 1; j < docs.length; j++) renamed.push(docs[j].id + ' heter nå D' + j);
  return removed + ' fjernet' + (renamed.length ? ' – ' + renamed.join(', ') : '');
}

function nextDocId(docs) { return 'D' + ((docs || []).length + 1); }

// Når et brev er sendt, er D-numrene låst: de står i brevet søkeren har
// fått. «Fjern» merker da motholdet «Ikke lenger relevant» i stedet for å
// slette og renummerere.
function docRemoveWithdraws(c) {
  return lettersSent(c && c.history) > 0;
}

// Merker motholdet på idx som ikke lenger relevant. Nummeret beholdes, men
// kravsreferansene til det fjernes. Returnerer nye { docs, claims }.
function withdrawDocAt(docs, claims, idx) {
  docs = docs || []; claims = claims || [];
  if (idx < 0 || idx >= docs.length) return { docs: docs, claims: claims };
  var id = docs[idx].id;
  return {
    docs: docs.map(function(d, i) { return i === idx ? Object.assign({}, d, { withdrawn: true }) : d; }),
    claims: claims.map(function(c) {
      return Object.assign({}, c, {
        noveltyDoc: c.noveltyDoc === id ? null : c.noveltyDoc,
        inventiveDocs: (c.inventiveDocs || []).filter(function(x) { return x !== id; })
      });
    })
  };
}

// Gjør motholdet vanlig igjen. Kravsreferansene kommer ikke tilbake.
function restoreDocAt(docs, idx) {
  return (docs || []).map(function(d, i) { return i === idx ? Object.assign({}, d, { withdrawn: false }) : d; });
}

// Publikasjonsnummeret slik Espacenet vil ha det: «WO 2020/123456 A1» blir
// «WO2020123456A1». Mellomrom, skråstrek og tusenskilletegn fjernes.
function normalizePubNumber(ref) {
  return String(ref || '').replace(/[\s/.,-]+/g, '').toUpperCase();
}

// Lenke til et pn=-søk i Espacenet, eller null når feltet er tomt. Bare en
// lenke — appen gjør selv ingen nettverkskall.
function espacenetUrl(ref) {
  var pn = normalizePubNumber(ref);
  return pn ? 'https://worldwide.espacenet.com/patent/search?q=pn%3D' + encodeURIComponent(pn) : null;
}

// ── EPO OPS: rene hjelpere ──────────────────────────
// Referansen i OPS sitt epodoc-format, med kind-koden for seg:
// «WO 2016/169730 A1» → { epodoc: 'WO2016169730', kind: 'A1' }. null når
// referansen ikke ser ut som et publikasjonsnummer.
function opsPubNumber(ref) {
  var m = /^([A-Z]{2})(\d+)([A-Z]\d?)?$/.exec(normalizePubNumber(ref));
  if (!m) return null;
  var cc = m[1], num = m[2];
  // WO 2020/12345: løpenummeret etter et firesifret år har seks sifre i OPS
  if (cc === 'WO' && /^(19|20)\d\d/.test(num) && num.length > 4 && num.length < 10) {
    num = num.slice(0, 4) + num.slice(4).padStart(6, '0');
  }
  // US 2008/0264140: OPS dropper nullen foran løpenummeret
  if (cc === 'US' && num.length === 11 && num.charAt(4) === '0') {
    num = num.slice(0, 4) + num.slice(5);
  }
  return { epodoc: cc + num, kind: m[3] || '' };
}

// OPS-dato «20161027» → «2016-10-27»; alt annet → ''.
function opsDate(s) {
  return /^\d{8}$/.test(s || '') ? s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8) : '';
}

// OPS-JSON gir et enkelt objekt når det er ett element, og en liste ellers.
function opsAsArray(x) { return x == null ? [] : (Array.isArray(x) ? x : [x]); }

// Datoen i en { document-id: [...] }-blokk, uansett hvilken id-type som har den.
function opsDocIdDate(ref) {
  var ids = opsAsArray(ref && ref['document-id']);
  for (var i = 0; i < ids.length; i++) {
    var d = opsDate(ids[i] && ids[i].date && ids[i].date.$);
    if (d) return d;
  }
  return '';
}

// Tittelen fra invention-title: engelsk når den finnes, ellers den første.
// Teksten beholdes slik OPS leverer den, bare med mellomrommene ryddet.
function opsTitle(bib) {
  var titles = opsAsArray(bib && bib['invention-title']);
  var t = titles.filter(function(x) { return x && x['@lang'] === 'en'; })[0] || titles[0];
  return String((t && t.$) || '').replace(/\s+/g, ' ').trim();
}

// Søkere og oppfinnere på et mothold er fri tekst: fra OPS, fra en importert
// fil eller skrevet selv. Kontrolltegn fjernes, mellomrom ryddes, og feltet
// kuttes så en fil ikke kan fylle opp lagringen. Alt som ikke er tekst blir ''.
var PARTY_MAX_LEN = 300;
function capPartyText(s) {
  if (typeof s !== 'string') return '';
  return sanitizeText(s).replace(/\s+/g, ' ').trim().slice(0, PARTY_MAX_LEN);
}

// Søkerne ('applicant') eller oppfinnerne ('inventor') fra bibliografien,
// i OPS sin rekkefølge, adskilt med «; ». Navnene tas slik de ble innlevert
// (original); finnes ikke det formatet, brukes epodoc («ACME AS [NO]»).
function opsParties(bib, kind) {
  var group = bib && bib.parties && bib.parties[kind + 's'];
  var all = opsAsArray(group && group[kind]).filter(function(x) { return x && typeof x === 'object'; });
  var original = all.filter(function(x) { return x['@data-format'] === 'original'; });
  var epodoc   = all.filter(function(x) { return x['@data-format'] === 'epodoc'; });
  var pick = original.length ? original : epodoc.length ? epodoc : all;
  var seen = {}, names = [];
  pick.slice().sort(function(a, b) {
    return (parseInt(a['@sequence'], 10) || 0) - (parseInt(b['@sequence'], 10) || 0);
  }).forEach(function(x) {
    var n = x[kind + '-name'] && x[kind + '-name'].name;
    var name = String((n && n.$) || '').replace(/\s+/g, ' ').replace(/^[\s,;]+|[\s,;]+$/g, '');
    if (name && !seen[name]) { seen[name] = true; names.push(name); }
  });
  return capPartyText(names.join('; '));
}

// Publiseringsdato, motholdets egen dato (tidligste prioritet, ellers
// inngivelsesdatoen) og tittel fra et published-data/biblio-svar. Har nummeret flere
// publiseringer (A1, B1 …), velges den med samme kind-kode, ellers den
// tidligste. null når svaret ikke har noen brukbar publisering.
function parseOpsBiblio(json, kind) {
  var root = json && json['ops:world-patent-data'];
  var docs = opsAsArray(root && root['exchange-documents'] && root['exchange-documents']['exchange-document'])
    .map(function(x) {
      var bib = (x && x['bibliographic-data']) || {};
      var prios = opsAsArray(bib['priority-claims'] && bib['priority-claims']['priority-claim'])
        .map(opsDocIdDate).filter(Boolean).sort();
      return { kind: (x && x['@kind']) || '',
               pubDate: opsDocIdDate(bib['publication-reference']),
               effDate: prios[0] || opsDocIdDate(bib['application-reference']),
               title: opsTitle(bib),
               applicants: opsParties(bib, 'applicant'),
               inventors: opsParties(bib, 'inventor') };
    })
    .filter(function(x) { return x.pubDate; })
    .sort(function(a, b) { return a.pubDate < b.pubDate ? -1 : a.pubDate > b.pubDate ? 1 : 0; });
  if (!docs.length) return null;
  return docs.filter(function(x) { return kind && x.kind === kind; })[0] || docs[0];
}

// Hva OPS skal fylle inn: bare tomme felt. Der feltet alt har en annen dato,
// røres det ikke, men forskjellen meldes i conflicts. En annen tittel, søker
// eller oppfinner meldes ikke — den kan godt være en du har skrevet selv.
function opsFillPlan(doc, dates) {
  var patch = {}, conflicts = [];
  ['pubDate', 'effDate', 'title', 'applicants', 'inventors'].forEach(function(f) {
    var ops = dates[f] || '', mine = (doc && doc[f]) || '';
    if (!ops) return;
    if (!mine) patch[f] = ops;
    else if (mine !== ops && (f === 'pubDate' || f === 'effDate')) conflicts.push({ field: f, mine: mine, ops: ops });
  });
  return { patch: patch, conflicts: conflicts };
}

// Feltene under motholdets nummer, i den rekkefølgen de vises.
var MH_DETAIL_FIELDS = ['pubDate', 'effDate', 'applicants', 'inventors', 'title'];

function docHasDetails(d) {
  return !!d && MH_DETAIL_FIELDS.some(function(f) { return !!d[f]; });
}

// Erstatt alt: brukes når nummeret er endret til et annet dokument og du har
// sagt ja til å bytte. Det OPS ikke har, tømmes — det hørte til det gamle.
function opsReplacePlan(dates) {
  var patch = {};
  MH_DETAIL_FIELDS.forEach(function(f) { patch[f] = (dates && dates[f]) || ''; });
  return { patch: patch, conflicts: [] };
}

// Hva som skal skje når et nytt publikasjonsnummer er ført inn (Enter, Tab,
// klikk utenfor): 'fill' slår opp og fyller tomme felt, 'ask' spør før
// opplysningene for det gamle nummeret byttes ut, 'none' gjør ingenting.
// doc er motholdet slik det var før nummeret ble endret.
function opsAutoAction(prevRef, newRef, doc, hasCreds) {
  if (!hasCreds) return 'none';
  var np = opsPubNumber(newRef);
  if (!np) return 'none';
  if (normalizePubNumber(prevRef) === normalizePubNumber(newRef)) return 'none';
  if (!docHasDetails(doc)) return 'fill';
  var pp = opsPubNumber(prevRef);
  if (pp && (pp.epodoc !== np.epodoc || pp.kind !== np.kind)) return 'ask';
  return MH_DETAIL_FIELDS.some(function(f) { return !doc[f]; }) ? 'fill' : 'none';
}

function opsErrorMessage(kind) {
  switch (kind) {
    case 'nocreds':  return 'Legg inn OPS-nøklene under Innstillinger → Saksbehandling først.';
    case 'badref':   return 'Referansen ser ikke ut som et publikasjonsnummer, f.eks. WO 2020/123456 A1.';
    case 'auth':     return 'OPS avviste nøklene. Sjekk consumer key og secret i Innstillinger.';
    case 'notfound': return 'OPS fant ikke dokumentet. Sjekk publikasjonsnummeret.';
    case 'quota':    return 'OPS avviste forespørselen (kvote eller fair use). Prøv igjen senere.';
    case 'network':  return 'Fikk ikke kontakt med OPS. Sjekk nettforbindelsen.';
    case 'parse':    return 'OPS svarte, men svaret manglet publiseringsdato.';
    default:         return 'Noe gikk galt i oppslaget mot OPS.';
  }
}

// Forslag til P- og E-flagg ut fra datoene — bare forslag, flaggene settes
// aldri av seg selv. app = { filingDate, priorityDate }; motholdet har
// pubDate (publisert) og effDate (eget prioritets- eller inngivelsesdato).
// Alle datoer er ISO-strenger, så de sammenlignes som tekst.
//   P: publisert på/etter søknadens prioritet, men før inngivelsen. Uten
//      prioritet finnes ikke et slikt mellomrom.
//   E: eldre dato enn søknadens referansedato (prioritet, ellers inngivelse),
//      og publisert på/etter inngivelsesdagen.
function suggestDocFlags(doc, app) {
  doc = doc || {}; app = app || {};
  var filing = app.filingDate || '', priority = app.priorityDate || '';
  var pub = doc.pubDate || '', eff = doc.effDate || '';
  var refDate = priority || filing;
  var p = !!(pub && priority && filing && pub >= priority && pub < filing);
  var e = !!(pub && eff && filing && eff < refDate && pub >= filing);
  return {
    p: p, e: e,
    pReason: p ? 'Publisert ' + toDisplay(pub) + ', mellom prioritet og inngivelse' : '',
    eReason: e ? 'Eldre dato (' + toDisplay(eff) + '), publisert ' + toDisplay(pub) + ' — på eller etter inngivelsesdagen' : ''
  };
}

// Prioritetsdatoen kan ikke ligge etter innleveringsdatoen. Tom streng = ok.
function applicationDatesError(filingDate, priorityDate) {
  if (filingDate && priorityDate && priorityDate > filingDate) {
    return 'Prioritetsdato kan ikke være etter innleveringsdato.';
  }
  return '';
}

// Normaliserer data.docs[] og kravenes dokumentfelt. Id-ene er posisjonelle
// (D1, D2, …), og referanser til ukjente eller bakgrunnsmothold ryddes bort.
function ensureSakDocs(data) {
  if (!Array.isArray(data.docs)) data.docs = [];
  data.docs = data.docs.map(function(d, i) {
    d = d || {};
    return { id: 'D' + (i + 1), ref: d.ref || '',
             pubDate: d.pubDate || '', effDate: d.effDate || '', title: d.title || '',
             applicants: capPartyText(d.applicants), inventors: capPartyText(d.inventors),
             p: !!d.p, e: !!d.e, background: !!d.background, withdrawn: !!d.withdrawn };
  });
  var forNovelty = {}, forInventive = {};
  claimDocSelectable(data.docs, 'novelty').forEach(function(d) { forNovelty[d.id] = true; });
  claimDocSelectable(data.docs, 'inventive').forEach(function(d) { forInventive[d.id] = true; });
  (data.claims || []).forEach(function(c) {
    if (!forNovelty[c.noveltyDoc]) c.noveltyDoc = null;
    var seen = {};
    c.inventiveDocs = (Array.isArray(c.inventiveDocs) ? c.inventiveDocs : []).filter(function(x) {
      if (!forInventive[x] || seen[x]) return false;
      seen[x] = true;
      return true;
    }).slice(0, MAX_INVENTIVE_DOCS);
  });
  return data;
}

// Fjerner motholdet på idx, renummererer resten og flytter kravsreferansene
// med. Rører ikke inn-arrayene — returnerer nye { docs, claims }.
function removeDocAt(docs, claims, idx) {
  docs = docs || []; claims = claims || [];
  if (idx < 0 || idx >= docs.length) return { docs: docs, claims: claims };
  var removedId = docs[idx].id;
  var remap = {};
  var nextDocs = docs.filter(function(d, i) { return i !== idx; }).map(function(d, i) {
    remap[d.id] = 'D' + (i + 1);
    return Object.assign({}, d, { id: 'D' + (i + 1) });
  });
  var nextClaims = claims.map(function(c) {
    return Object.assign({}, c, {
      noveltyDoc: (c.noveltyDoc && c.noveltyDoc !== removedId) ? remap[c.noveltyDoc] : null,
      inventiveDocs: (c.inventiveDocs || [])
        .filter(function(x) { return x !== removedId; })
        .map(function(x) { return remap[x]; })
        .filter(Boolean)
    });
  });
  return { docs: nextDocs, claims: nextClaims };
}

// Velger/fravelger et mothold på et krav. Nyhet tar nøyaktig ett; klikk på
// et annet erstatter, klikk på samme fjerner. Oppfinnelseshøyde tar inntil
// MAX_INVENTIVE_DOCS — valg utover grensen ignoreres.
function toggleClaimDoc(claim, field, docId, docs) {
  if (docs) {
    // Samme regel som velgerne (claimDocSelectable). Et valg som allerede
    // står på kravet kan likevel fjernes.
    var current = field === 'novelty' ? claim.noveltyDoc === docId
                : (Array.isArray(claim.inventiveDocs) && claim.inventiveDocs.indexOf(docId) !== -1);
    var ok = claimDocSelectable(docs, field).some(function(d) { return d.id === docId; });
    if (!ok && !current) return claim;
  }
  if (field === 'novelty') {
    claim.noveltyDoc = (claim.noveltyDoc === docId) ? null : docId;
    return claim;
  }
  if (!Array.isArray(claim.inventiveDocs)) claim.inventiveDocs = [];
  var i = claim.inventiveDocs.indexOf(docId);
  if (i !== -1) claim.inventiveDocs.splice(i, 1);
  else if (claim.inventiveDocs.length < MAX_INVENTIVE_DOCS) claim.inventiveDocs.push(docId);
  return claim;
}

// Kategorien ett mothold får for ett krav: X, Y, A — eller null når kravet
// ikke er ferdig vurdert og derfor holdes utenfor rapporten.
function claimDocCategory(claims, claim, doc) {
  var effNovelty   = effectiveClaimValue(claims, claim, 'novelty');
  var effInventive = effectiveClaimValue(claims, claim, 'inventive');
  if (doc.withdrawn) return null;
  if (effNovelty === null || effInventive === null) return null;
  if (doc.background) return 'A';
  // Krav uten nyhet: bare nyhetsmotholdet er relevant. Oppfinnelseshøyden er
  // låst av for slike krav og arver nyhetsmotholdet, så øvrige mothold — og
  // en eventuell gammel OH-referanse — er bare bakgrunn for dette kravet.
  if (effNovelty === false) return claim.noveltyDoc === doc.id ? 'X' : 'A';
  // Motsatt: et krav som har fått nyhet/OH tilbake beholder det lagrede
  // motholdet, men det skal ikke telle før vurderingen igjen er ✗.
  if (effInventive !== false) return 'A';
  // E-dokumenter kan ikke brukes mot oppfinnelseshøyden (§ 2 tredje ledd).
  if (doc.e) return 'A';
  var inv = claim.inventiveDocs || [];
  if (inv.indexOf(doc.id) === -1) return 'A';
  return inv.length > 1 ? 'Y' : 'X';
}

function buildSearchReport(claims, docs) {
  claims = claims || [];
  return (docs || []).map(function(doc) {
    var row = { docId: doc.id, X: [], Y: [], A: [] };
    claims.forEach(function(c) {
      var cat = claimDocCategory(claims, c, doc);
      if (cat) row[cat].push(c.num);
    });
    return row;
  });
}

// P (mellomliggende) og E (eldre søknad, publisert senere) prefikser
// kategorien slik den skrives i granskingsrapporten: «P,X».
function docCategoryLabel(doc, cat) {
  return (doc.p ? 'P,' : '') + (doc.e ? 'E,' : '') + cat;
}

// ── Mothold sitert i andre saker ─────────────────────
// Nøkkelen et mothold sammenlignes på: landkode og nummer i OPS-form, uten
// kind-kode, så «WO 2020/123456 A1» og «WO2020123456A3» er samme dokument.
// null når referansen ikke ser ut som et publikasjonsnummer.
function docMatchKey(ref) {
  var pn = opsPubNumber(typeof ref === 'string' ? ref : '');
  return pn ? pn.epodoc : null;
}

// Alle motholdene i alle saker, etter nøkkel. detailsFn(id) gir saks-
// detaljene (pt_sak_*); hver sak leses én gang. Hver oppføring har det som
// trengs for å vise linjen: saken, D-nummeret og kategoriene der.
// Ren funksjon — se test/citedElsewhere.test.js.
function buildCitationIndex(list, detailsFn) {
  var index = {};
  (list || []).forEach(function(c) {
    if (!c || !c.id) return;
    var d = detailsFn(c.id);
    var docs = d && Array.isArray(d.docs) ? d.docs : [];
    if (!docs.length) return;
    var claims = Array.isArray(d.claims) ? d.claims.filter(function(x) { return x && typeof x === 'object'; }) : [];
    var rows = null;
    docs.forEach(function(doc, i) {
      if (!doc || typeof doc !== 'object') return;
      var key = docMatchKey(doc.ref);
      if (!key) return;
      var list2 = index[key] || (index[key] = []);
      // Samme nummer to ganger i samme sak (A1 og B1) gir én linje: den
      // første som er i bruk, og bare en «ikke lenger relevant» hvis alle er det.
      var prev = -1;
      list2.forEach(function(e, k) { if (e.caseId === c.id) prev = k; });
      if (prev > -1 && (!list2[prev].withdrawn || doc.withdrawn)) return;
      if (!rows) {
        try { rows = buildSearchReport(claims, docs.map(function(x, j) {
          return x && typeof x === 'object' ? x : { id: 'D' + (j + 1) };
        })); }
        catch (e) { rows = []; }
      }
      var row = rows[i] || { X: [], Y: [], A: [] };
      var id = typeof doc.id === 'string' && /^D\d+$/.test(doc.id) ? doc.id : 'D' + (i + 1);
      var entry = {
        caseId: c.id, caseNumber: String(c.caseNumber || ''), title: String(c.title || ''),
        status: String(c.status || ''), type: String(c.type || ''),
        docId: id, withdrawn: !!doc.withdrawn,
        cats: ['X', 'Y', 'A'].filter(function(cat) { return row[cat] && row[cat].length; })
          .map(function(cat) { return docCategoryLabel(doc, cat); })
      };
      if (prev > -1) list2[prev] = entry; else list2.push(entry);
    });
  });
  return index;
}

// De andre sakene som har samme dokument, sortert på saksnummer.
function citedElsewhere(index, ref, selfId) {
  var key = docMatchKey(ref);
  if (!key || !index || !index[key]) return [];
  return index[key].filter(function(e) { return e.caseId !== selfId; })
    .sort(function(a, b) { return a.caseNumber < b.caseNumber ? -1 : a.caseNumber > b.caseNumber ? 1 : 0; });
}

function triLabel(val, inverted) {
  if (val === null)  return '<span class="tri-null">—</span>';
  if (!inverted) return val ? '<span class="tri-ok">✓</span>' : '<span class="tri-no">✗</span>';
  return val ? '<span class="tri-no">✗</span>' : '<span class="tri-ok">✓</span>';
}

