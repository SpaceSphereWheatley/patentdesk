// ── Kravkobling (claim mapping) ─────────────────────
// Valgfritt claim.mapping i pt_sak_{id}: { round, origin, change, p13, basis }.
// round er n for runden R(n) koblingen gjelder; origin er kravnumrene i R(n)
// kravet kom fra ([] = nytt krav). Koblingen teller bare så lenge round er
// den runden saken nå svarer på — ved neste svar slutter den å gjelde uten at
// noe slettes. Alle funksjonene er rene — se test/claimMapping.test.js.
var CLAIM_MAPPING_BASIS_MAX = 200;
var CLAIM_MAPPING_MAX_NUM = 999;

function normalizeClaimMapping(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  var round = raw.round;
  if (typeof round !== 'number' || !Number.isInteger(round) || round < 1) return null;
  if (!Array.isArray(raw.origin)) return null;
  var origin = [];
  raw.origin.forEach(function(k) {
    if (typeof k === 'number' && Number.isInteger(k) && k >= 1 && k <= CLAIM_MAPPING_MAX_NUM &&
        origin.indexOf(k) === -1) origin.push(k);
  });
  origin.sort(function(a, b) { return a - b; });
  var change = raw.change === 'uendret' || raw.change === 'endret' || raw.change === 'ny' ? raw.change : null;
  var basis = typeof raw.basis === 'string'
    ? sanitizeText(raw.basis).trim().slice(0, CLAIM_MAPPING_BASIS_MAX) : '';
  return { round: round, origin: origin, change: change, p13: roundTriState(raw.p13), basis: basis };
}

// Endringen som faktisk gjelder: nytt krav er alltid «ny», sammenslåtte krav
// er alltid endret, og ett opphav er endret med mindre «uendret» er valgt.
function claimMappingChange(origin, change) {
  if (!origin.length) return 'ny';
  if (origin.length > 1) return 'endret';
  return change === 'uendret' ? 'uendret' : 'endret';
}

// Runden kravene kobles mot: siste synlige runde, bare i Viderebehandling og
// bare når søkeren har svart med endrede krav.
function mappingRound(c, rounds) {
  if (!c || c.status !== 'viderebehandling' || c.type === 'oppdrag') return null;
  var latest = null;
  visibleRounds(c, rounds).forEach(function(r) { if (!latest || r.n > latest.n) latest = r; });
  if (!latest || !latest.response || !Array.isArray(latest.response.changes)) return null;
  return latest.response.changes.indexOf('claims') !== -1 ? latest : null;
}

// Teksten i opphavsfeltet: «1+4», «2-3», «ny» eller tomt (fjerner koblingen).
// prevCount er antall krav i R(n); roundN brukes bare i feilteksten.
function parseOrigin(text, prevCount, roundN) {
  var s = (typeof text === 'string' ? text : '').trim();
  if (!s) return null;
  if (s.length > 200) return { error: 'For lang tekst' };
  if (/^ny$/i.test(s)) return [];
  var bad = { error: 'Skriv kravnumre, f.eks. 1+4 eller 2-3, eller «ny»' };
  var tokens = s.replace(/\s*[-–]\s*/g, '-').split(/[+,\s]+/).filter(function(t) { return t !== ''; });
  if (!tokens.length) return bad;
  var max = typeof prevCount === 'number' && prevCount > 0 ? prevCount : 0;
  var where = roundN ? ' i brev ' + roundN : '';
  var out = [];
  for (var i = 0; i < tokens.length; i++) {
    var m = /^(\d+)(?:-(\d+))?$/.exec(tokens[i]);
    if (!m) return bad;
    var a = parseInt(m[1], 10), b = m[2] !== undefined ? parseInt(m[2], 10) : a;
    if (a > b) return { error: 'Ugyldig område ' + a + '-' + b };
    if (a < 1) return { error: 'Krav ' + a + ' finnes ikke' + where };
    if (b > max) return { error: 'Krav ' + (a > max ? a : b) + ' finnes ikke' + where };
    for (var k = a; k <= b; k++) if (out.indexOf(k) === -1) out.push(k);
  }
  return out.sort(function(x, y) { return x - y; });
}

// Koblingen slik den gjelder i runden round, eller null (ingen, ugyldig,
// gammel runde eller opphav utenfor rundens krav).
function claimMapping(claim, round) {
  if (!claim || !round || typeof round !== 'object') return null;
  var m = normalizeClaimMapping(claim.mapping);
  if (!m || m.round !== round.n) return null;
  var count = Array.isArray(round.claims) ? round.claims.length : 0;
  if (m.origin.some(function(k) { return k > count; })) return null;
  m.change = claimMappingChange(m.origin, m.change);
  return m;
}

var CLAIM_VERDICT_KEYS = ['novelty', 'inventive', 'formal', 'noveltyDoc', 'inventiveDocs'];

function claimVerdictsEqual(a, b) {
  return CLAIM_VERDICT_KEYS.every(function(k) { return JSON.stringify(a[k]) === JSON.stringify(b[k]); });
}

// Verdiene krav k hadde i runden: effektive ja/nei (arv og nyhetslåsen tatt
// med), lagret formell, og bare mothold som fortsatt finnes og ikke er trukket.
function roundClaimVerdicts(round, k, docs) {
  var list = Array.isArray(round && round.claims) ? round.claims : [];
  var src = list.find(function(x) { return x && x.num === k; });
  if (!src) return { novelty: null, inventive: null, formal: null, noveltyDoc: null, inventiveDocs: [] };
  var live = function(id) {
    return (docs || []).some(function(d) { return d && d.id === id && !d.withdrawn; });
  };
  var novelty = roundTriState(effectiveClaimValue(list, src, 'novelty'));
  var inventive = novelty === false ? false : roundTriState(effectiveClaimValue(list, src, 'inventive'));
  var invDocs = [];
  (Array.isArray(src.inventiveDocs) ? src.inventiveDocs : []).forEach(function(id) {
    if (live(id) && invDocs.indexOf(id) === -1) invDocs.push(id);
  });
  return {
    novelty: novelty, inventive: inventive, formal: roundTriState(src.formal),
    noveltyDoc: src.noveltyDoc && live(src.noveltyDoc) ? src.noveltyDoc : null,
    inventiveDocs: invDocs
  };
}

// Ny kobling på ett krav. Til endret/ny fra ingen/uendret tømmes vurderingen;
// til uendret (eller nytt opphav mens uendret) kopieres R(n)-vurderingen; ellers
// står den. lost: noe som var satt, ble tømt eller overskrevet.
function applyClaimChange(claim, next, round, docs) {
  var out = Object.assign({}, claim);
  out.inventiveDocs = Array.isArray(claim.inventiveDocs) ? claim.inventiveDocs.slice() : [];
  var nm = normalizeClaimMapping(next);
  if (!nm) {
    delete out.mapping;
    return { claim: out, lost: false };
  }
  var prev = claimMapping(claim, round);
  var prevChange = prev ? prev.change : null;
  nm.change = claimMappingChange(nm.origin, nm.change);
  out.mapping = nm;
  var verdicts = null;
  if (nm.change === 'uendret') {
    if (prevChange !== 'uendret' || prev.origin[0] !== nm.origin[0]) {
      verdicts = roundClaimVerdicts(round, nm.origin[0], docs);
    }
  } else if (prevChange === null || prevChange === 'uendret') {
    verdicts = { novelty: null, inventive: null, formal: null, noveltyDoc: null, inventiveDocs: [] };
  }
  var lost = false;
  if (verdicts) {
    CLAIM_VERDICT_KEYS.forEach(function(k) {
      var was = claim[k];
      var set = Array.isArray(was) ? was.length > 0 : (was !== null && was !== undefined);
      if (set && JSON.stringify(was) !== JSON.stringify(verdicts[k])) lost = true;
      out[k] = verdicts[k];
    });
  }
  return { claim: out, lost: lost };
}

// Det examiner ser om opphavet: «R1 N✓ O✓ D1» for ett krav, «R1: 1 … · 4 …»
// for flere. Tom for nye krav.
function claimPrevVerdictText(m, round, docs) {
  if (!m || !m.origin.length) return '';
  var list = Array.isArray(round.claims) ? round.claims : [];
  var part = function(k) {
    var src = list.find(function(x) { return x && x.num === k; });
    if (!src) return '– –';
    var novelty = effectiveClaimValue(list, src, 'novelty');
    var inventive = novelty === false ? false : effectiveClaimValue(list, src, 'inventive');
    var ids = [];
    [src.noveltyDoc].concat(Array.isArray(src.inventiveDocs) ? src.inventiveDocs : []).forEach(function(id) {
      if (isRoundDocId(id) && ids.indexOf(id) === -1) ids.push(id);
    });
    var docTxt = ids.map(function(id) {
      var d = (docs || []).find(function(x) { return x && x.id === id; });
      return id + (!d || d.withdrawn ? ' (trukket)' : '');
    }).join('+');
    return roundMark(novelty, 'N') + ' ' + roundMark(inventive, 'O') + (docTxt ? ' ' + docTxt : '');
  };
  if (m.origin.length === 1) return 'R' + round.n + ' ' + part(m.origin[0]);
  return 'R' + round.n + ': ' + m.origin.map(function(k) { return k + ' ' + part(k); }).join(' · ');
}

function claimOriginLabel(m) {
  if (!m) return '← ?';
  if (!m.origin.length) return 'Ny';
  return '←' + m.origin.join('+');
}

function claimOriginHint(claim, round, docs) {
  var m = claimMapping(claim, round);
  if (!m) return '← ?';
  if (!m.origin.length) return 'Ny';
  return claimOriginLabel(m) + ' ' + (m.change === 'uendret' ? 'Uendret' : 'Endret') + ' · ' +
    claimPrevVerdictText(m, round, docs);
}

// Kravene i R(n) som ingen gyldig kobling bruker — strøket av søkeren.
function deletedClaims(round, claims) {
  var used = {};
  (Array.isArray(claims) ? claims : []).forEach(function(c) {
    var m = claimMapping(c, round);
    if (m) m.origin.forEach(function(k) { used[k] = true; });
  });
  var nums = (round && Array.isArray(round.claims) ? round.claims : []).map(function(c) { return c && c.num; })
    .filter(function(k) { return typeof k === 'number' && !used[k]; });
  return nums.sort(function(a, b) { return a - b; });
}

// ── Innvendinger (objections) ───────────────────────
// Avledes fra den frosne runden L (brevet søkeren har svart på) og lagres
// aldri i runden. I pt_sak_{id} ligger bare egne innvendinger
// (objections: [{ id, text, raisedIn }]) og vurderingen per runde
// (objectionStates: { "<k>": { "<id>": resolved|maintained|dropped } };
// åpen = ingen nøkkel). Rene funksjoner — se test/objections.test.js.
var OBJECTION_STATES = ['open', 'resolved', 'maintained', 'dropped'];
var OBJECTION_TEXT_MAX = 200;
var OBJECTION_MAX_MANUAL = 100;
var OBJECTION_MAX_IDS_PER_ROUND = 1000;
var OBJECTION_DERIVED_ID_RE = /^r\d{1,3}-k\d{1,3}-(nyhet|oh|formelt)$/;
var OBJECTION_MANUAL_ID_RE = /^m[a-z0-9]{4,24}$/;
var OBJECTION_ROUND_KEY_RE = /^[1-9]\d{0,2}$/;

function isPlainObj(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function objectionsOf(data) {
  return data && Array.isArray(data.objections) ? data.objections : [];
}

function objectionStatesOf(data) {
  return data && isPlainObj(data.objectionStates) ? data.objectionStates : {};
}

function isObjectionId(id) {
  return typeof id === 'string' && (OBJECTION_DERIVED_ID_RE.test(id) || OBJECTION_MANUAL_ID_RE.test(id));
}

// Runden innvendingene kommer fra: den med n lik antall sendte brev.
function objectionRound(c, rounds) {
  if (!c || c.type === 'oppdrag') return null;
  var sent = lettersSent(c.history);
  return visibleRounds(c, rounds).find(function(r) { return r.n === sent; }) || null;
}

function objectionHasKind(claim, kind) {
  if (!claim) return false;
  if (kind === 'nyhet') return claim.novelty === false;
  if (kind === 'oh') return claim.novelty !== false && claim.inventive === false;
  return claim.formal === true;
}

// Innvendingene i en frossen runde, med gamle (frosne) kravnumre.
function deriveObjections(round, rounds) {
  if (!round || typeof round !== 'object' || !Array.isArray(round.claims)) return [];
  var list = Array.isArray(rounds) ? rounds : [];
  var firstRaised = function(claim, kind) {
    var first = round.n, cur = claim, curN = round.n;
    for (;;) {
      var prev = list.find(function(r) { return r && r.n === curN - 1; });
      if (!prev || !Array.isArray(prev.claims)) break;
      var m = claimMapping(cur, prev), num;
      if (m) {
        if (m.change !== 'uendret' || m.origin.length !== 1) break;
        num = m.origin[0];
      } else {
        num = cur.num;
      }
      var pc = prev.claims.find(function(x) { return x && x.num === num; });
      if (!objectionHasKind(pc, kind)) break;
      first = prev.n; cur = pc; curN = prev.n;
    }
    return first;
  };
  var out = [];
  round.claims.forEach(function(c) {
    if (!c || !isPositiveInt(c.num)) return;
    var add = function(kind, docs) {
      out.push({ id: 'r' + round.n + '-k' + c.num + '-' + kind, round: round.n, claim: c.num, kind: kind,
                 docs: docs, firstRaised: firstRaised(c, kind) });
    };
    if (c.novelty === false) {
      add('nyhet', isRoundDocId(c.noveltyDoc) ? [c.noveltyDoc] : []);
    } else if (c.inventive === false) {
      var docs = [];
      (Array.isArray(c.inventiveDocs) ? c.inventiveDocs : []).forEach(function(id) {
        if (isRoundDocId(id) && docs.indexOf(id) === -1) docs.push(id);
      });
      add('oh', docs);
    }
    if (c.formal === true) add('formelt', []);
  });
  return out;
}

function cleanObjectionText(text) {
  return sanitizeText(typeof text === 'string' ? text : '').trim();
}

function normalizeObjections(raw) {
  if (!Array.isArray(raw)) return [];
  var out = [], seen = {};
  raw.forEach(function(o) {
    if (out.length >= OBJECTION_MAX_MANUAL || !isPlainObj(o)) return;
    if (typeof o.id !== 'string' || !OBJECTION_MANUAL_ID_RE.test(o.id) || seen[o.id]) return;
    var text = cleanObjectionText(o.text).slice(0, OBJECTION_TEXT_MAX).trim();
    if (!text || !isPositiveInt(o.raisedIn) || o.raisedIn > 999) return;
    seen[o.id] = true;
    out.push({ id: o.id, text: text, raisedIn: o.raisedIn });
  });
  return out;
}

function normalizeObjectionStates(raw, objections) {
  var out = {};
  if (!isPlainObj(raw)) return out;
  var manual = {};
  (Array.isArray(objections) ? objections : []).forEach(function(o) { if (o && typeof o.id === 'string') manual[o.id] = true; });
  Object.keys(raw).forEach(function(k) {
    if (!OBJECTION_ROUND_KEY_RE.test(k) || !isPlainObj(raw[k])) return;
    var r = {}, n = 0;
    Object.keys(raw[k]).forEach(function(id) {
      if (n >= OBJECTION_MAX_IDS_PER_ROUND) return;
      var s = raw[k][id];
      if (s !== 'resolved' && s !== 'maintained' && s !== 'dropped') return;
      if (!OBJECTION_DERIVED_ID_RE.test(id) && !(OBJECTION_MANUAL_ID_RE.test(id) && manual[id] === true)) return;
      r[id] = s; n++;
    });
    if (n) out[k] = r;
  });
  return out;
}

function copyObjectionStates(states) {
  var out = {};
  if (!isPlainObj(states)) return out;
  Object.keys(states).forEach(function(k) {
    if (k !== '__proto__' && isPlainObj(states[k])) out[k] = Object.assign({}, states[k]);
  });
  return out;
}

// Ny vurdering for ids i runde k ('open' fjerner nøkkelen).
function objectionStatesAfterSet(states, k, ids, state) {
  var out = copyObjectionStates(states);
  if (OBJECTION_STATES.indexOf(state) === -1 || !isPositiveInt(k)) return out;
  var key = String(k);
  var r = out[key] || {};
  (Array.isArray(ids) ? ids : []).forEach(function(id) {
    if (!isObjectionId(id)) return;
    if (state === 'open') delete r[id]; else r[id] = state;
  });
  if (Object.keys(r).length) out[key] = r; else delete out[key];
  return out;
}

// Ny egen innvending, eller null ved ugyldig tekst/runde.
function makeManualObjection(text, raisedIn, existingIds, now, rand) {
  var t = cleanObjectionText(text);
  if (!t || t.length > OBJECTION_TEXT_MAX || !isPositiveInt(raisedIn)) return null;
  var abc = '0123456789abcdefghijklmnopqrstuvwxyz';
  var base = 'm' + Math.max(0, Math.floor(Number(now) || 0)).toString(36);
  for (var i = 0; i < 4; i++) {
    var r = Number(rand());
    base += abc.charAt(Math.min(35, Math.max(0, Math.floor((isFinite(r) ? r : 0) * 36))));
  }
  var taken = Array.isArray(existingIds) ? existingIds : [];
  var id = base, n = 0;
  while (taken.indexOf(id) !== -1) { n++; id = base + n.toString(36); }
  return { id: id, text: t, raisedIn: raisedIn };
}

function objectionsAfterDelete(data, objId) {
  var out = Object.assign({}, data);
  out.objections = objectionsOf(data).filter(function(o) { return !o || o.id !== objId; });
  var states = copyObjectionStates(objectionStatesOf(data));
  Object.keys(states).forEach(function(k) {
    delete states[k][objId];
    if (!Object.keys(states[k]).length) delete states[k];
  });
  out.objectionStates = states;
  return out;
}

// Egne innvendinger som vises i runde k. Løst/frafalt i en tidligere runde
// skjuler dem; reist i runde k er de nye og har ingen vurdering.
function manualObjectionsShown(objections, states, k) {
  var st = isPlainObj(states) ? states : {};
  return (Array.isArray(objections) ? objections : []).filter(function(o) {
    if (!o || !isPositiveInt(o.raisedIn) || o.raisedIn > k) return false;
    for (var j = o.raisedIn; j < k; j++) {
      var s = isPlainObj(st[j]) ? st[j][o.id] : null;
      if (s === 'resolved' || s === 'dropped') return false;
    }
    return true;
  }).map(function(o) {
    return Object.assign({}, o, { manual: true, isNew: o.raisedIn === k });
  });
}

function mappingComplete(round, claims) {
  if (!round || !Array.isArray(claims) || !claims.length) return false;
  return claims.every(function(c) { return !!claimMapping(c, round); });
}

// Hvor et gammelt krav er nå: { now: [nye nr], struck } eller null når
// kravene ikke er endret eller ingen krav er koblet.
function objectionTargets(oldNum, round, claims) {
  if (!round || !round.response || !Array.isArray(round.response.changes) ||
      round.response.changes.indexOf('claims') === -1) return null;
  var list = Array.isArray(claims) ? claims : [];
  var any = false, now = [];
  list.forEach(function(c) {
    var m = claimMapping(c, round);
    if (!m) return;
    any = true;
    if (m.origin.indexOf(oldNum) !== -1 && now.indexOf(c.num) === -1) now.push(c.num);
  });
  if (!any) return null;
  now.sort(function(a, b) { return a - b; });
  var struck = mappingComplete(round, list) && deletedClaims(round, list).indexOf(oldNum) !== -1;
  return { now: now, struck: struck };
}

function objectionStateIn(roundStates, id) {
  var s = isPlainObj(roundStates) ? roundStates[id] : null;
  return s === 'resolved' || s === 'maintained' || s === 'dropped' ? s : 'open';
}

// Innvendingene som vises i runde k, hver med sin vurdering.
function shownObjections(c, data) {
  if (!c || c.type === 'oppdrag' || c.status !== 'viderebehandling') return [];
  var rounds = roundsOf(data);
  var L = objectionRound(c, rounds);
  if (!L) return [];
  var k = examinationRound(c);
  var all = objectionStatesOf(data);
  var st = isPlainObj(all[k]) ? all[k] : {};
  var derived = deriveObjections(L, visibleRounds(c, rounds)).map(function(o) {
    return Object.assign({}, o, { state: objectionStateIn(st, o.id) });
  });
  var manual = manualObjectionsShown(objectionsOf(data), all, k).map(function(o) {
    return Object.assign({}, o, { state: o.isNew ? 'open' : objectionStateIn(st, o.id) });
  });
  return derived.concat(manual);
}

// Rader: samme grunn, mothold, første brev og vurdering slås sammen.
function groupObjections(list) {
  var groups = [], byKey = {};
  (Array.isArray(list) ? list : []).forEach(function(o) {
    if (!o) return;
    if (o.manual) {
      groups.push({ manual: true, ids: [o.id], text: o.text, isNew: !!o.isNew, state: o.state || 'open',
                    raisedIn: o.raisedIn, claims: [], docs: [] });
      return;
    }
    var docs = o.docs.slice().sort(function(a, b) { return parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10); });
    var key = [o.kind, docs.join('+'), o.firstRaised, o.state || 'open'].join('|');
    var g = byKey[key];
    if (!g) {
      g = byKey[key] = { manual: false, ids: [], kind: o.kind, docs: docs, firstRaised: o.firstRaised,
                         state: o.state || 'open', claims: [] };
      groups.push(g);
    }
    g.ids.push(o.id);
    if (g.claims.indexOf(o.claim) === -1) g.claims.push(o.claim);
  });
  return groups;
}

// «2–5, 7»
function numRangesText(nums) {
  var s = nums.slice().sort(function(a, b) { return a - b; }).filter(function(n, i, a) { return i === 0 || a[i - 1] !== n; });
  var parts = [];
  for (var i = 0; i < s.length; i++) {
    var j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    parts.push(j > i ? s[i] + '–' + s[j] : String(s[i]));
    i = j;
  }
  return parts.join(', ');
}

var OBJECTION_KIND_LABEL = { nyhet: 'Mangler nyhet', oh: 'Mangler OH', formelt: 'Formelle feil' };

// Radteksten i tre deler: { head: «Brev 1 · krav 2–5», ground, map }.
function objectionRowParts(group, L, targets) {
  if (group.manual) return { head: '', ground: group.text, map: '' };
  var ground = OBJECTION_KIND_LABEL[group.kind] + (group.docs.length ? ' (' + group.docs.join('+') + ')' : '');
  if (group.firstRaised < L) ground += ' (først i brev ' + group.firstRaised + ')';
  var t = targets || {}, now = [], struck = [];
  group.claims.forEach(function(n) {
    var x = t[n];
    if (!x) return;
    (x.now || []).forEach(function(k) { if (now.indexOf(k) === -1) now.push(k); });
    if (x.struck) struck.push(n);
  });
  var map = '';
  if (struck.length && struck.length === group.claims.length) map = ' → strøket';
  else if (now.length || struck.length) {
    var bits = [];
    if (now.length) bits.push('nå krav ' + numRangesText(now));
    if (struck.length) bits.push(numRangesText(struck) + ' strøket');
    map = ' → ' + bits.join(' · ');
  }
  return { head: 'Brev ' + L + ' · krav ' + numRangesText(group.claims), ground: ground, map: map };
}

// Hele radteksten som én streng (testene; visningen bruker delene).
/* exported objectionRowText */
function objectionRowText(group, L, targets) {
  var p = objectionRowParts(group, L, targets);
  return group.manual ? p.ground : p.head + ' · ' + p.ground + p.map;
}

// «x / y vurdert» i rader; nye egne innvendinger telles ikke.
function objectionProgress(groups) {
  var x = 0, y = 0;
  (Array.isArray(groups) ? groups : []).forEach(function(g) {
    if (!g || (g.manual && g.isNew)) return;
    y++;
    if (g.state !== 'open') x++;
  });
  return { x: x, y: y };
}

var OBJECTION_WARN_LABEL = { nyhet: 'mangler nyhet', oh: 'mangler oppfinnelseshøyde', formelt: 'formelle feil' };

// Merknader under «Avslag» i Avgjør: er søker hørt om det avslaget bygger
// på? Tom liste = ingen merknader. Hindrer aldri avslaget.
function refusalWarnings(c, data, rounds) {
  if (!c || c.type === 'oppdrag' || c.status !== 'viderebehandling') return [];
  var L = objectionRound(c, rounds);
  if (!L) return ['Ingen lagret runde – kan ikke kontrollere at søker er hørt'];
  var vr = visibleRounds(c, rounds);
  var k = examinationRound(c);
  var all = objectionStatesOf(data);
  var st = isPlainObj(all[k]) ? all[k] : {};
  var derived = deriveObjections(L, vr);
  var claims = (data && Array.isArray(data.claims) ? data.claims : []).filter(function(x) { return x && typeof x === 'object'; });
  var docs = data && Array.isArray(data.docs) ? data.docs : [];
  var live = function(id) { return docs.some(function(d) { return d && d.id === id && !d.withdrawn; }); };
  var raised = function(oldNum, kind) {
    return derived.find(function(o) {
      var s = objectionStateIn(st, o.id);
      return o.claim === oldNum && o.kind === kind && (s === 'open' || s === 'maintained');
    }) || null;
  };
  var out = [];
  var changed = !!(L.response && Array.isArray(L.response.changes) && L.response.changes.indexOf('claims') !== -1);
  var complete = changed && mappingComplete(L, claims);
  if (changed && !complete) {
    out.push('Kravene er endret i svaret – søker har ikke uttalt seg om kravene slik de nå lyder');
  } else {
    claims.forEach(function(cl) {
      var ground = cl.novelty === false ? 'nyhet' : cl.inventive === false ? 'oh' : null;
      var kinds = (ground ? [ground] : []).concat(cl.formal === true ? ['formelt'] : []);
      if (!kinds.length) return;
      var oldNum = cl.num;
      if (complete) {
        var m = claimMapping(cl, L);
        if (m.change === 'endret') { out.push('Krav ' + cl.num + ' er endret – søker har ikke uttalt seg om kravet slik det nå lyder'); return; }
        if (m.change === 'ny') { out.push('Krav ' + cl.num + ' er nytt – søker har ikke uttalt seg om kravet'); return; }
        oldNum = m.origin[0];
      }
      kinds.forEach(function(kind) {
        var obj = raised(oldNum, kind);
        if (!obj) { out.push('Krav ' + cl.num + ': ' + OBJECTION_WARN_LABEL[kind] + ' er ikke reist i brev ' + L.n); return; }
        if (kind === 'formelt') return;
        var ids = kind === 'nyhet' ? [cl.noveltyDoc] : (Array.isArray(cl.inventiveDocs) ? cl.inventiveDocs : []);
        var seen = [];
        ids.forEach(function(id) {
          if (!isRoundDocId(id) || seen.indexOf(id) !== -1 || !live(id)) return;
          seen.push(id);
          if (obj.docs.indexOf(id) !== -1) return;
          out.push('Krav ' + cl.num + ': ' + id + ' ble ikke anført i brev ' + L.n +
            (docFirstRound(vr, id) === k ? ' (nytt i runde ' + k + ')' : ''));
        });
      });
    });
  }
  var manual = manualObjectionsShown(objectionsOf(data), all, k);
  manual.forEach(function(o) { if (o.isNew) out.push('Ny innvending: ' + o.text); });
  var groups = groupObjections(shownObjections(c, Object.assign({}, data, { rounds: rounds })));
  var open = groups.filter(function(g) { return !(g.manual && g.isNew) && g.state === 'open'; }).length;
  if (open) out.push(open + (open === 1 ? ' innvending er' : ' innvendinger er') + ' ikke vurdert');
  var ground = claims.some(function(cl) { return cl.novelty === false || cl.inventive === false || cl.formal === true; }) ||
    manual.some(function(o) { return o.raisedIn < k && objectionStateIn(st, o.id) === 'maintained'; });
  if (!ground) out.push('Ingen gjenstående innvendinger – avslag mangler grunnlag');
  return out;
}

function normalizeRoundClaims(list) {
  if (!Array.isArray(list)) return [];
  var out = [];
  list.forEach(function(c, i) { var n = normalizeClaim(c, i); if (n) out.push(n); });
  return out;
}

// Ny runde n: dyp kopi av kravene og de motholdene som ikke er trukket.
function makeRoundSnapshot(n, sakData, letterDate, deadline) {
  var docs = (sakData && Array.isArray(sakData.docs)) ? sakData.docs : [];
  var docIds = [];
  docs.forEach(function(d) {
    if (d && !d.withdrawn && isRoundDocId(d.id) && docIds.indexOf(d.id) === -1) docIds.push(d.id);
  });
  return {
    n: n,
    letter: { date: roundIsoDate(letterDate), deadline: roundIsoDate(deadline) },
    response: null,
    claims: normalizeRoundClaims(sakData && sakData.claims),
    docIds: docIds
  };
}

function roundsOf(data) {
  return (data && Array.isArray(data.rounds)) ? data.rounds : [];
}

function roundsSortedCopy(list) {
  return list.slice().sort(function(a, b) { return a.n - b.n; });
}

// Rundene etter en statusovergang. ctx: { from, to, isOppdrag, lettersAfter,
// sakData, today, deadline, response } (response = sanitizeResponseExtra(...)).
function roundsAfterTransition(rounds, ctx) {
  if (!ctx || ctx.isOppdrag) return [];
  var after = ctx.lettersAfter || 0;
  var list = (Array.isArray(rounds) ? rounds : []).filter(function(r) {
    return r && typeof r === 'object' && typeof r.n === 'number' && r.n <= after;
  }).map(function(r) { return JSON.parse(JSON.stringify(r)); });
  var from = ctx.from, to = ctx.to;
  if (to === 'fristarkiv' && (from === 'ny' || from === 'viderebehandling')) {
    if (after >= 1) {
      list = list.filter(function(r) { return r.n !== after; });
      list.push(makeRoundSnapshot(after, ctx.sakData, ctx.today, ctx.deadline));
      list = roundsSortedCopy(list);
    }
  } else if (from === 'fristarkiv' && to === 'viderebehandling' && list.length) {
    var resp = ctx.response || {};
    list[list.length - 1].response = {
      date: roundIsoDate(resp.received) || roundIsoDate(ctx.today),
      changes: Array.isArray(resp.changes) ? resp.changes.filter(function(x) {
        return x === 'claims' || x === 'description';
      }) : []
    };
  }
  return list;
}

// Lagrede/importerte runder: alt som ikke har riktig form forkastes eller
// nulles, ukjente nøkler tas ikke med, sortert på n med én runde per n.
function normalizeRounds(raw) {
  if (!Array.isArray(raw)) return [];
  var out = [], seen = {};
  raw.forEach(function(r) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return;
    if (typeof r.n !== 'number' || !Number.isInteger(r.n) || r.n < 1 || seen[r.n]) return;
    seen[r.n] = true;
    var letter = (r.letter && typeof r.letter === 'object' && !Array.isArray(r.letter)) ? r.letter : {};
    var resp = (r.response && typeof r.response === 'object' && !Array.isArray(r.response)) ? r.response : null;
    var docIds = [];
    (Array.isArray(r.docIds) ? r.docIds : []).forEach(function(id) {
      if (isRoundDocId(id) && docIds.indexOf(id) === -1) docIds.push(id);
    });
    var round = {
      n: r.n,
      letter: { date: roundIsoDate(letter.date), deadline: roundIsoDate(letter.deadline) },
      response: resp ? {
        date: roundIsoDate(resp.date),
        changes: Array.isArray(resp.changes) ? resp.changes.filter(function(x) {
          return x === 'claims' || x === 'description';
        }) : []
      } : null,
      claims: normalizeRoundClaims(r.claims),
      docIds: docIds
    };
    if (r.backfilled === true) round.backfilled = true;
    out.push(round);
  });
  return roundsSortedCopy(out);
}

// Saksdetaljer fra en importfil (fil, sikkerhetskopi, arbeidsfil): rundene
// normaliseres, resten er som før.
function isPositiveInt(v) {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1;
}

// Kravnummer som verdi i en attributtselektor. Et gyldig nummer brukes som det
// er; alt annet (data lagret før importen ble strammet inn) escapes.
function claimSelVal(v) {
  if (isPositiveInt(v)) return String(v);
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(String(v)) : '';
}

function normalizeImportSakDetails(sd) {
  if (!sd || typeof sd !== 'object' || Array.isArray(sd)) return sd;
  var out = {};
  Object.keys(sd).forEach(function(k) { if (k !== '__proto__') out[k] = sd[k]; });
  out.rounds = normalizeRounds(sd.rounds);
  // Nåværende krav: bare kravkoblingen normaliseres (eller fjernes); resten
  // av hvert krav er som i filen.
  if (Array.isArray(sd.claims)) {
    out.claims = sd.claims.map(function(c, i) {
      if (!c || typeof c !== 'object' || Array.isArray(c)) return c;
      var copy = {};
      Object.keys(c).forEach(function(k) { if (k !== '__proto__') copy[k] = c[k]; });
      // num og dep havner i markup og oppslag, så de må være positive heltall
      copy.num = isPositiveInt(c.num) ? c.num : (i + 1);
      copy.dep = isPositiveInt(c.dep) ? c.dep : null;
      if (Object.prototype.hasOwnProperty.call(c, 'mapping')) {
        var m = normalizeClaimMapping(c.mapping);
        if (m) copy.mapping = m; else delete copy.mapping;
      }
      return copy;
    });
  }
  // Mothold: søker, oppfinner og CPC er fri tekst fra filen — kuttes og gjøres til
  // tekst her, så de aldri lagres i en form appen selv ikke ville skrevet.
  if (Array.isArray(sd.docs)) {
    out.docs = sd.docs.map(function(d) {
      if (!d || typeof d !== 'object' || Array.isArray(d)) return d;
      var copy = {};
      Object.keys(d).forEach(function(k) { if (k !== '__proto__') copy[k] = d[k]; });
      ['applicants', 'inventors'].forEach(function(f) {
        if (Object.prototype.hasOwnProperty.call(d, f)) copy[f] = capPartyText(d[f]);
      });
      if (Object.prototype.hasOwnProperty.call(d, 'cpc')) copy.cpc = capCpcText(d.cpc);
      return copy;
    });
  }
  // Saksdokumenter: visningsnavnet normaliseres, filnavnet er som i filen.
  if (Array.isArray(sd.files)) out.files = normalizeImportFiles(sd.files);
  // Innvendinger: bare når filen har dem; vurderingene mot de normaliserte
  // egne innvendingene.
  var hasObj = Object.prototype.hasOwnProperty.call(sd, 'objections');
  var objs = normalizeObjections(sd.objections);
  if (hasObj) out.objections = objs; else delete out.objections;
  if (Object.prototype.hasOwnProperty.call(sd, 'objectionStates')) {
    out.objectionStates = normalizeObjectionStates(sd.objectionStates, objs);
  } else {
    delete out.objectionStates;
  }
  return out;
}

function roundMark(v, letter) {
  return v === true ? letter + '✓' : v === false ? letter + '✗' : '–';
}

// Én linje per frosset krav i rundeskuffen, regnet ut fra runden alene.
function roundDrawerLines(round) {
  if (!round || typeof round !== 'object') return [];
  return normalizeRoundClaims(round.claims).map(function(c) {
    var docs = [];
    [c.noveltyDoc].concat(c.inventiveDocs).forEach(function(id) {
      if (id && docs.indexOf(id) === -1) docs.push(id);
    });
    return { num: c.num, novelty: roundMark(c.novelty, 'N'), inventive: roundMark(c.inventive, 'O'),
             docs: docs, label: c.label };
  });
}

// Runden et mothold først var med i. Står det ikke i noen runde, er det nytt
// i runden saken er i nå (høyeste n + 1). Ingen runder: null (ingen merking).
function docFirstRound(rounds, docId) {
  if (!Array.isArray(rounds) || !rounds.length) return null;
  var max = 0, first = null;
  rounds.forEach(function(r) {
    if (!r || typeof r.n !== 'number') return;
    if (r.n > max) max = r.n;
    if (Array.isArray(r.docIds) && r.docIds.indexOf(docId) !== -1 && (first === null || r.n < first)) first = r.n;
  });
  if (!max) return null;
  return first !== null ? first : max + 1;
}

// Rundene som kan vises: aldri flere enn brevene som faktisk er sendt.
function visibleRounds(c, rounds) {
  if (!c || c.type === 'oppdrag') return [];
  var sent = lettersSent(c.history);
  return (Array.isArray(rounds) ? rounds : []).filter(function(r) {
    return r && typeof r.n === 'number' && r.n <= sent;
  });
}

function canBackfillRound(c, rounds) {
  if (!c || c.type === 'oppdrag') return false;
  return lettersSent(c.history) >= 1 && !(Array.isArray(rounds) && rounds.length);
}

// «Lagre nåværende vurdering som runde N»: dagens vurdering, merket som lagret
// i ettertid. Brev- og svardato hentes fra historikken.
function backfillRound(c, sakData) {
  var info = responseRoundInfo(c);
  var deadline = c && c.status === 'fristarkiv' ? c.dueDate : null;
  var snap = makeRoundSnapshot(lettersSent(c && c.history), sakData, info.letter, deadline);
  if (info.received) {
    snap.response = { date: roundIsoDate(info.received), changes: Array.isArray(info.changes) ? info.changes.filter(function(x) {
      return x === 'claims' || x === 'description';
    }) : [] };
  }
  snap.backfilled = true;
  return snap;
}

// «Angre» på en statusendring: rundene slik de var før.
function roundsAfterUndo(current, snap) {
  if (snap && Array.isArray(snap.roundsBefore)) return JSON.parse(JSON.stringify(snap.roundsBefore));
  return Array.isArray(current) ? current : [];
}

// Egen frist for å behandle svaret: antall måneder fra mottaksdatoen.
function responseDueDate(received, months) {
  return addMonthsClamped(new Date(received + 'T00:00:00'), months);
}

// Fasekollaps: i Viderebehandling huskes valget for seg, og Saken og Gransking
// starter lukket — da er det svaret og vurderingen som er arbeidet. I andre
// statuser er nøkkelen bare fasenavnet, som før.
function phaseCollapseKey(phase, status) {
  return status === 'viderebehandling' ? 'videre:' + phase : phase;
}
function isPhaseCollapsed(state, phase, status) {
  var key = phaseCollapseKey(phase, status);
  if (state && Object.prototype.hasOwnProperty.call(state, key)) return !!state[key];
  return status === 'viderebehandling' && (phase === 'saken' || phase === 'gransking');
}

// Sjekklisten for søkerens svar. Avkrysningene lagres per runde i
// saksdetaljene (responseChecks), så den starter tom i hver ny runde.
var RESPONSE_CHECKLIST = [
  { id: 'read',     label: 'Svaret er lest' },
  { id: 'basis',    label: 'Endringene har grunnlag i søknaden (§ 13)' },
  { id: 'reassess', label: 'Kravene er vurdert på nytt' },
  { id: 'search',   label: 'Behov for tilleggsgransking vurdert' }
];
function responseChecked(data, round) {
  var all = data && data.responseChecks;
  var list = all && typeof all === 'object' && Array.isArray(all[round]) ? all[round] : [];
  // Bare kjente punkter, hvert én gang — uansett hva som er lagret/importert
  var out = [];
  list.forEach(function(id) {
    if (typeof id !== 'string' || out.indexOf(id) !== -1) return;
    if (RESPONSE_CHECKLIST.some(function(i) { return i.id === id; })) out.push(id);
  });
  return out;
}
// Fremdriftslinjen øverst og i sticky-baren: hovedsjekklisten, eller i
// Viderebehandling sjekklisten for svaret i runden saken er i.
function sakChecklistProgress(c, data, template) {
  if (c && c.type !== 'oppdrag' && c.status === 'viderebehandling') {
    var round = examinationRound(c);
    return { label: 'Svar – runde ' + round, done: responseChecked(data, round).length, total: RESPONSE_CHECKLIST.length };
  }
  var items = [];
  (template || []).forEach(function(p) { p.items.forEach(function(i) { items.push(i); }); });
  var cl = (data && data.checklist) || {};
  return { label: 'Sjekkliste', total: items.length,
           done: items.filter(function(i) { return cl[i.id] !== null && cl[i.id] !== undefined; }).length };
}

function toggleResponseCheck(data, round, id) {
  if (!RESPONSE_CHECKLIST.some(function(i) { return i.id === id; })) return data;
  if (!data.responseChecks || typeof data.responseChecks !== 'object') data.responseChecks = {};
  var list = responseChecked(data, round);
  var i = list.indexOf(id);
  if (i === -1) list.push(id); else list.splice(i, 1);
  data.responseChecks[round] = list;
  return data;
}

// Hvilken runde saken er i. Ny er alltid runde 1; i Fristarkiv er det runden
// til brevet som nettopp gikk ut; i Viderebehandling er det neste brev som
// skal skrives. Mangler historikken (import, eldre data), brukes laveste
// runde som er mulig for statusen.
// Ren funksjon — se test/caseTrack.test.js.
function examinationRound(c) {
  var sent   = lettersSent(c && c.history);
  var status = (c && c.status) || 'ny';
  if (status === 'fristarkiv')       return Math.max(sent, 1);
  if (status === 'viderebehandling') return Math.max(sent + 1, 2);
  if (status === 'avsluttet')        return sent;
  return 1;
}

// De fire stegene for en sak som [{ label, state }]. state er én av done,
// active, videre (Viderebehandling, runde 2), future, wait (søkerens tur),
// caution (runde 3+), granted, refused, closed. Oppdrag har ingen saksflyt og gir null.
// Ren funksjon — se test/caseTrack.test.js.
function caseTrack(c) {
  if (!c || c.type === 'oppdrag') return null;
  var status = c.status || 'ny';
  var round  = examinationRound(c);
  var slots  = [{ label: 'Formalia', state: 'done' }];

  slots.push(status === 'ny' ? { label: 'Ny', state: 'active' } : { label: '1. brev', state: 'done' });

  if (status === 'ny') {
    slots.push({ label: 'Svar', state: 'future' });
  } else if (status === 'fristarkiv') {
    slots.push({ label: 'Fristarkiv' + (round >= 2 ? ' · ' + round : ''), state: 'wait' });
  } else if (status === 'viderebehandling') {
    // Egen tilstand (og farge) for Viderebehandling, så steget ikke forveksles
    // med det aktive «1. brev» på en ny sak. Fra 3. runde vises rundenummeret,
    // med forkortet tekst så nummeret ikke kuttes av i pilen.
    slots.push(round >= 3
      ? { label: 'Viderebeh. · ' + round, state: 'caution' }
      : { label: 'Viderebehandling', state: 'videre' });
  } else {
    var hist = Array.isArray(c.history) ? c.history.filter(function(h) { return h && h.type === 'status'; }) : [];
    var last = hist[hist.length - 1];
    var direct = last && last.to === 'avsluttet' && last.from === 'ny';
    slots.push(direct ? { label: 'Ingen runde', state: 'done' } : { label: 'Behandlet', state: 'done' });
  }

  if (status === 'avsluttet') {
    var o = Object.prototype.hasOwnProperty.call(OUTCOMES, c.outcome) ? OUTCOMES[c.outcome] : null;
    slots.push(o ? { label: o.label, state: o.state } : { label: 'Avsluttet', state: 'done' });
  } else {
    slots.push({ label: 'Avgjørelse', state: 'future' });
  }
  return slots;
}

// Et gyldig utfall, eller null. Bare avsluttede saker har utfall; et utfall
// som henger igjen på en gjenåpnet sak, eller en ukjent verdi fra import,
// forkastes.
// Ren funksjon — se test/importValidation.test.js.
function normaliseOutcome(status, outcome) {
  if (status !== 'avsluttet') return null;
  return Object.prototype.hasOwnProperty.call(OUTCOMES, outcome) ? outcome : null;
}

// Tidspunktet saken sist ble avsluttet, eller null.
// Ren funksjon — se test/caseTrack.test.js.
function closedDate(c) {
  var hist = (c && Array.isArray(c.history)) ? c.history : [];
  for (var i = hist.length - 1; i >= 0; i--) {
    var h = hist[i];
    if (h && h.type === 'status' && h.to === 'avsluttet') return h.date || null;
  }
  return null;
}

// Tellingene bak saksflyten på forsiden: hvor mange saker som står på hvert
// steg, og hvilke avgjørelser som er tatt i kalenderåret `year`. Oppdrag holdes
// utenfor. fristarkivSoon er svarfrister innen 30 dager fra `todayIso`.
// Ren funksjon — se test/caseTrack.test.js.
function pipelineCounts(list, year, todayIso) {
  var p = { ny: 0, nyUnassigned: 0, fristarkiv: 0, fristarkivSoon: 0, videre: 0, videreLate: 0,
            decided: { meddelt: 0, avslatt: 0, henlagt: 0, total: 0 } };
  var today = Date.UTC(+todayIso.slice(0, 4), +todayIso.slice(5, 7) - 1, +todayIso.slice(8, 10));
  (list || []).forEach(function(c) {
    if (!c || c.type === 'oppdrag') return;
    var status = c.status || 'ny';
    if (status === 'ny') { if (isUnassigned(c)) p.nyUnassigned++; else p.ny++; }
    else if (status === 'fristarkiv') {
      p.fristarkiv++;
      if (c.dueDate) {
        var d = c.dueDate;
        var days = (Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) - today) / 86400000;
        if (days >= 0 && days <= 30) p.fristarkivSoon++;
      }
    } else if (status === 'viderebehandling') {
      p.videre++;
      if (examinationRound(c) >= 3) p.videreLate++;
    } else if (status === 'avsluttet' && Object.prototype.hasOwnProperty.call(p.decided, c.outcome) && c.outcome !== 'total') {
      var when = closedDate(c);
      if (when && new Date(when).getFullYear() === year) {
        p.decided[c.outcome]++;
        p.decided.total++;
      }
    }
  });
  return p;
}

// Handlingen bak «⋯ → neste steg» i sakslista. Samme valg som de gamle
// radknappene hadde på hver statusside, nå avledet av statusen så de også
// virker i «Alle saker».
// Ren funksjon — se test/caseTrack.test.js.
function rowAction(status, isOppdrag) {
  if (status === 'avsluttet') return null;
  if (isOppdrag) return { type: 'complete-oppdrag', label: 'Merk som utført' };
  if (status === 'fristarkiv')       return { type: 'response', label: 'Svar mottatt …' };
  if (status === 'viderebehandling') return { type: 'choice-videre', label: 'Avgjør …' };
  return { type: 'confirm', label: 'Brev sendt' };
}

