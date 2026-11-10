// ════════════════════════════════════════════════════════════════════════════
// SEKSJON 4 · APPSTATE
// Sentralt in-memory state-objekt + dispatch()
// All levende applikasjonstilstand lever her
// ════════════════════════════════════════════════════════════════════════════

// ── Tilstand ───────────────────────────────────────
var activePage = 'hjem';
var sortCol    = 'daysUntil';
var sortDir    = 1;
var tagFilter  = '';

// ── AppState ───────────────────────────────────────
// Sentralt state-objekt. Løse variabler over vil gradvis konsolideres hit.
var AppState = {
  get cases()          { return cases; },
  set cases(v)         { cases = v; },
  get stats()          { return stats; },
  get vacations()      { return vacations; },
  get activePage()     { return activePage; },
  set activePage(v)    { activePage = v; },
  get activeSakId()    { return activeSakId; },
  set activeSakId(v)   { activeSakId = v; },
  get medlesing()       { return medlesing; },
  set medlesing(v)      { medlesing = v; },
  get activeMedlesingId(){ return activeMedlesingId; },
  set activeMedlesingId(v){ activeMedlesingId = v; },
  get undoSnapshot()   { return undoSnapshot; },
  set undoSnapshot(v)  { undoSnapshot = v; },
  get settings() {
    return {
      goal:     productionGoal,
      belegg:   beleggHorizon,
      buffer:   typeBuffers,
      docRoot:  loadDocRoot()
    };
  },
  ui: {
    get drawerCollapsed() { return loadDrawerCollapsed(); },
    get tagFilter()       { return tagFilter; },
    set tagFilter(v)      { tagFilter = v; }
  }
};

// ── dispatch() ─────────────────────────────────────
// Alle handlinger går via dispatch() — wrapperen (se sikkerhetskopi-seksjonen)
// stempler lagringstidspunktet og planlegger sikkerhetskopi og skriving av
// arbeidsfilen etter hver handling.
function dispatch(action, payload) {
  if (undoInvalidatedBy(undoSnapshot, action, payload)) dropUndo();
  _dispatch(action, payload);
  _wfStampSaved();
  scheduleAutoBackup();
  scheduleWorkFileWrite();
  noteSaved();
}

function savedLabelText(d) {
  return 'Lagret ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

// Alt lagres stille og umiddelbart. Indikatoren er der bare for å bekrefte at
// det faktisk skjedde — uten å be om oppmerksomhet. Den toner ut igjen: blir
// den stående, viser den etter hvert et klokkeslett som ikke lenger sier noe
// om det du nettopp gjorde.
var SAVED_VISIBLE_MS = 4000;
var _savedHideTimer = null;
function noteSaved() {
  var el = document.getElementById('sak-saved');
  if (!el || activePage !== 'sak') return;
  el.textContent = savedLabelText(new Date());
  el.classList.add('is-on');
  clearTimeout(_savedHideTimer);
  _savedHideTimer = setTimeout(function() { el.classList.remove('is-on'); }, SAVED_VISIBLE_MS);
}

function _dispatch(action, payload) {
  switch (action) {

    case 'CASE_STATUS_CHANGE': {
      var id        = payload.id;
      var toStatus  = payload.toStatus;
      var logType   = payload.logType || null;
      var newDueDate = payload.newDueDate || null;
      var theCase   = cases.find(function(c) { return c.id === id; });
      if (!theCase) break;
      var fromStatus = theCase.status;
      // Oppdater state. Stikkord fra avslutningsdialogen følger med i samme
      // endring, så «Angre» tar dem også.
      var patch = statusChangePatch(toStatus, payload.outcome, newDueDate);
      if (typeof payload.tags === 'string') patch.tags = payload.tags;
      patch.history = appendHistory(theCase, fromStatus, toStatus);
      // «Svar mottatt»: mottaksdato og hva som kom inn følger overgangen
      var respExtra = sanitizeResponseExtra(payload.historyExtra);
      if (respExtra) {
        var last = patch.history.length - 1;
        patch.history[last] = Object.assign({}, patch.history[last], respExtra);
      }
      AppState.undoSnapshot = undoPatchSnapshot(theCase, patch, { activeCase: activeCase, medlLog: medlLog });
      AppState.cases = cases.map(function(c) {
        return c.id === id ? Object.assign({}, c, patch) : c;
      });
      // Persister
      saveCases();
      // Rundeøyeblikksbilder i saksdetaljene (eneste krok); «Angre» tar dem tilbake
      var roundsBefore = applyRoundsTransition(theCase, fromStatus, toStatus, patch, respExtra);
      if (roundsBefore) {
        AppState.undoSnapshot.roundsBefore = roundsBefore;
        AppState.undoSnapshot.roundsCaseId = id;
      }
      if (logType) AppState.undoSnapshot.logIds.push(logEvent(logType, theCase.caseNumber, theCase.title));
      // Render
      render();
      if (activeSakId === id) renderSak(id);
      showUndoToast('Sak ' + AppState.undoSnapshot.label + ' flyttet');
      break;
    }

    case 'MEDL_SEND': {
      var mc = cases.find(function(c) { return c.id === payload.id; });
      if (!canSendToMedleser(mc) || !payload.reader) break;
      medlLog = sendToMedleser(medlLog, mc, payload.reader, payload.sent, uid());
      saveMedlLog(medlLog);
      render();
      break;
    }

    case 'MEDL_SET': {
      // Fra «Rediger sak». Et nytt navn skrevet inn der legges også på lista.
      var sc = cases.find(function(c) { return c.id === payload.id; });
      if (!sc || sc.type === 'oppdrag') break;
      var reader = sanitizeText(payload.reader || '').trim();
      if (reader && payload.addToList) {
        medleserList = addMedleser(medleserList, reader);
        saveMedleserList(medleserList);
      }
      var nextLog = setCaseMedlesing(medlLog, sc, reader, payload.date, uid());
      if (nextLog !== medlLog) { medlLog = nextLog; saveMedlLog(medlLog); }
      render();
      break;
    }

    case 'MEDL_RETURN': {
      medlLog = returnFromMedleser(medlLog, payload.id, todayStr());
      saveMedlLog(medlLog);
      render();
      break;
    }

    case 'MEDLESER_ADD': {
      medleserList = addMedleser(medleserList, sanitizeText(payload.name));
      saveMedleserList(medleserList);
      render();
      break;
    }

    case 'MEDLESER_TOGGLE': {
      medleserList = medleserList.map(function(m, i) { return i === payload.idx ? { name: m.name, active: !m.active } : m; });
      saveMedleserList(medleserList);
      render();
      break;
    }

    case 'MEDLESER_DELETE': {
      // Statistikken ligger i loggen og blir stående.
      medleserList = medleserList.filter(function(m, i) { return i !== payload.idx; });
      saveMedleserList(medleserList);
      render();
      break;
    }

    case 'ACTIVE_CASE_TOGGLE': {
      var target = cases.find(function(c) { return c.id === payload.id; });
      if (!canBeActiveCase(target)) break;
      activeCase = toggleActiveCase(activeCase, payload.id, new Date().toISOString());
      saveActiveCase(activeCase);
      render();
      break;
    }

    case 'CASE_UNASSIGNED_SET': {
      var target = cases.find(function(c) { return c.id === payload.id; });
      if (!canBeUnassigned(target)) break;
      var uPatch = unassignedPatch(target, !!payload.value, new Date().toISOString());
      AppState.cases = cases.map(function(c) {
        return c.id === payload.id ? Object.assign({}, c, uPatch) : c;
      });
      saveCases();
      render();
      showToast(payload.value ? 'Sak ' + target.caseNumber + ' markert som ikke fordelt' : '✓ Sak ' + target.caseNumber + ' er fordelt til deg');
      break;
    }

    case 'NAV_GO': {
      navigateTo(payload.page, payload.addToHistory !== false);
      break;
    }

    case 'CASE_CREATE': {
      var p = payload;
      var newCase = {
        id: uid(), caseNumber: sanitizeText(p.caseNumber), dueDate: p.dueDate,
        status: p.status, title: sanitizeText(p.title),
        notes: sanitizeText(p.notes || ''), tags: normaliseTags(p.tags || ''),
        type: p.type || 'sak', createdAt: new Date().toISOString(),
        history: [{ type: 'status', date: new Date().toISOString(), from: null, to: p.status }]
      };
      if (p.duration) newCase.duration = p.duration;
      if (p.caseBuffer != null && p.type !== 'oppdrag') newCase.caseBuffer = p.caseBuffer;
      if (p.unassigned) Object.assign(newCase, unassignedPatch(newCase, true, newCase.createdAt));
      AppState.cases = cases.concat([newCase]);
      saveCases();
      if (p.filingDate || p.priorityDate) {
        var newData = defaultSakData(0);
        newData.filingDate = p.filingDate || '';
        newData.priorityDate = p.priorityDate || '';
        saveSakData(newCase.id, newData);
      }
      render();
      break;
    }

    case 'CASE_EDIT': {
      var p = payload;
      AppState.cases = cases.map(function(c) {
        if (c.id !== p.id) return c;
        var patch = { caseNumber: sanitizeText(p.caseNumber), dueDate: p.dueDate, title: sanitizeText(p.title),
                      notes: sanitizeText(p.notes || ''), tags: normaliseTags(p.tags || ''),
                      type: p.type || c.type, caseBuffer: p.caseBuffer != null ? p.caseBuffer : null };
        if (p.type === 'oppdrag') { patch.status = p.status || 'ny'; patch.duration = p.duration; patch.caseBuffer = null; }
        else                      { patch.status = p.status;  delete patch.duration; }
        patch.outcome = normaliseOutcome(patch.status, c.outcome);
        Object.assign(patch, unassignedPatch(Object.assign({}, c, patch), !!p.unassigned, new Date().toISOString()));
        // Record frist change in history if dueDate changed
        var histPatch = {};
        if (p.dueDate !== c.dueDate) {
          histPatch.history = appendHistory(c, null, null, 'frist', c.dueDate, p.dueDate);
        }
        return Object.assign({}, c, patch, histPatch);
      });
      saveCases();
      // Innleverings- og prioritetsdatoen ligger i saksdetaljene (pt_sak_*),
      // ikke i cases[]
      if (p.type !== 'oppdrag' && typeof p.filingDate === 'string') {
        var editData = loadSakData(p.id) || defaultSakData(0);
        var priorityDate = typeof p.priorityDate === 'string' ? p.priorityDate : (editData.priorityDate || '');
        if ((editData.filingDate || '') !== p.filingDate || (editData.priorityDate || '') !== priorityDate) {
          editData.filingDate = p.filingDate;
          editData.priorityDate = priorityDate;
          saveSakData(p.id, editData);
        }
      }
      render();
      break;
    }

    case 'CASE_DELETE': {
      var theCase = cases.find(function(c) { return c.id === payload.id; });
      var rawSak = null;
      try { rawSak = localStorage.getItem(sakKey(payload.id)); } catch(e) {}
      if (!theCase) break;
      AppState.undoSnapshot = {
        mode: 'reinsert', caseId: payload.id, index: cases.indexOf(theCase),
        before: Object.assign({}, theCase), logIds: [],
        label: theCase.caseNumber,
        sakId: payload.id,
        sakData: rawSak,
        activeCase: activeCase,
        medlLog: medlLog
      };
      AppState.cases = cases.filter(function(c) { return c.id !== payload.id; });
      try { localStorage.removeItem(sakKey(payload.id)); } catch(e) {}
      saveCases();
      render();
      showUndoToast('Sak ' + AppState.undoSnapshot.label + ' slettet');
      break;
    }

    case 'CASE_UNDO': {
      if (!undoSnapshot) break;
      // Bare det handlingen endret tas tilbake — endringer på andre saker
      // mens «Angre» sto framme, blir stående.
      cases  = casesAfterUndo(cases, undoSnapshot);
      stats  = Object.assign({}, stats, { log: statsLogAfterUndo(stats.log, undoSnapshot.logIds) });
      // Gjenopprett saksdetaljer som ble fjernet ved sletting
      if (undoSnapshot.sakId && undoSnapshot.sakData != null) {
        lsSetSafe(sakKey(undoSnapshot.sakId), undoSnapshot.sakData);
      }
      // Fjernede krav settes tilbake; resten av saksdetaljene blir som de er
      if (undoSnapshot.mode === 'docs') {
        var dsData = loadSakData(undoSnapshot.caseId);
        if (dsData) {
          dsData.docs = undoSnapshot.before.docs;
          dsData.claims = undoSnapshot.before.claims;
          saveSakData(undoSnapshot.caseId, dsData);
        }
      }
      if (undoSnapshot.mode === 'claims') {
        var ccData = loadSakData(undoSnapshot.caseId);
        if (ccData) {
          ccData.numClaims = undoSnapshot.before.numClaims;
          ccData.claims = undoSnapshot.before.claims;
          saveSakData(undoSnapshot.caseId, ccData);
        }
      }
      // Statusendring: bare rundene settes tilbake, resten av saksdetaljene står
      if (undoSnapshot.roundsCaseId) {
        var rdData = loadSakData(undoSnapshot.roundsCaseId);
        if (rdData) {
          rdData.rounds = roundsAfterUndo(roundsOf(rdData), undoSnapshot);
          saveSakData(undoSnapshot.roundsCaseId, rdData);
        }
      }
      activeCase = activeCaseAfterUndo(undoSnapshot, activeCase);
      saveActiveCase(activeCase);
      medlLog = medlLogAfterUndo(undoSnapshot.medlLog, medlLog);
      saveMedlLog(medlLog);
      AppState.undoSnapshot = null;
      saveCases(); saveStats();
      render();
      showToast('✓ Handling angret');
      break;
    }

    case 'CASE_COMPLETE': {
      // Håndteres av runStatusTransition; rutes hit som CASE_STATUS_CHANGE
      dispatch('CASE_STATUS_CHANGE', payload);
      break;
    }

    case 'CASE_COMPLETE_OPPDRAG': {
      var id = payload.id;
      var theCase = cases.find(function(c) { return c.id === id; });
      if (!theCase) break;
      var opPatch = { status: 'avsluttet', history: appendHistory(theCase, theCase.status, 'avsluttet') };
      AppState.undoSnapshot = undoPatchSnapshot(theCase, opPatch, { activeCase: activeCase, medlLog: medlLog });
      AppState.cases = cases.map(function(c) {
        return c.id === id ? Object.assign({}, c, opPatch) : c;
      });
      saveCases();
      AppState.undoSnapshot.logIds.push(logEvent('oppdrag', theCase.caseNumber, theCase.title));
      render();
      showUndoToast('Oppdrag ' + theCase.caseNumber + ' avsluttet');
      break;
    }

    case 'CASE_FIELD_UPDATE': {
      var id = payload.id; var patch = payload.patch;
      var histPatch = {};
      if (patch.dueDate !== undefined) {
        var prev = (cases.find(function(c) { return c.id === id; }) || {}).dueDate;
        if (prev !== patch.dueDate) {
          histPatch = { history: appendHistory(cases.find(function(c){ return c.id===id; }) || {}, null, null, 'frist', prev, patch.dueDate) };
        }
      }
      AppState.cases = cases.map(function(c) {
        return c.id === id ? Object.assign({}, c, patch, histPatch) : c;
      });
      saveCases();
      break;
    }

    case 'SAK_DURATION_CHANGE': {
      AppState.cases = cases.map(function(c) {
        return c.id === payload.id ? Object.assign({}, c, { duration: payload.value }) : c;
      });
      saveCases();
      break;
    }

    case 'SAK_CLAIM_COUNT_CHANGE': {
      var id = payload.id;
      var data = loadSakData(id) || defaultSakData(0);
      // Fjernes krav med innhold, kan det angres: kravene som var, tas vare på.
      if (payload.undoable) {
        var ccCase = cases.find(function(c) { return c.id === id; });
        AppState.undoSnapshot = {
          mode: 'claims', caseId: id, logIds: [], label: ccCase ? ccCase.caseNumber : '',
          before: { numClaims: data.numClaims, claims: JSON.parse(JSON.stringify(data.claims || [])) },
          activeCase: activeCase, medlLog: medlLog
        };
      }
      data.numClaims = payload.count;
      ensureClaims(data);
      saveSakData(id, data);
      renderSakAssessment(data);
      // «→ nå krav / → strøket» i innvendingene følger kravlista
      var ccResCase = cases.find(function(c) { return c.id === id; });
      if (ccResCase && activeSakId === id) renderSakResponse(ccResCase, data);
      if (payload.undoable) showUndoToast(payload.toast || 'Krav fjernet');
      break;
    }

    case 'CLAIM_MAPPING_CHANGE': {
      // Kravkobling på ett krav. Tømmes eller overskrives en vurdering, kan
      // det angres; kravlista som var, tas vare på (som ved færre krav).
      var cmCase = cases.find(function(c) { return c.id === payload.id; });
      var cmData = loadSakData(payload.id);
      if (!cmCase || !cmData || !Array.isArray(cmData.claims)) break;
      var cmRound = mappingRound(cmCase, roundsOf(cmData));
      if (!cmRound) break;
      var cmIdx = cmData.claims.findIndex(function(c) { return c && c.num === payload.claimNum; });
      if (cmIdx === -1) break;
      var cmOld = cmData.claims[cmIdx];
      var cmRes = applyClaimChange(cmOld, payload.mapping, cmRound, cmData.docs || []);
      if (cmRes.lost) {
        AppState.undoSnapshot = {
          mode: 'claims', caseId: payload.id, logIds: [], label: cmCase.caseNumber || '',
          before: { numClaims: cmData.numClaims, claims: JSON.parse(JSON.stringify(cmData.claims)) },
          activeCase: activeCase, medlLog: medlLog
        };
      }
      cmData.claims = cmData.claims.slice();
      cmData.claims[cmIdx] = cmRes.claim;
      saveSakData(payload.id, cmData);
      if (activeSakId === payload.id) {
        if (!claimVerdictsEqual(cmOld, cmRes.claim)) renderSakAssessment(cmData);
        else if (!payload.quiet) renderClaimRows(cmData, [payload.claimNum]);
        renderSakResponse(cmCase, cmData);
      }
      if (cmRes.lost) showUndoToast('Krav ' + payload.claimNum + ': vurderingen er endret');
      break;
    }

    case 'OBJECTION_STATE_SET': {
      // Vurdering av én (gruppert) innvending i runden saken er i nå
      var osCase = cases.find(function(c) { return c.id === payload.id; });
      if (!osCase || osCase.type === 'oppdrag' || osCase.status !== 'viderebehandling') break;
      if (payload.round !== examinationRound(osCase) || OBJECTION_STATES.indexOf(payload.state) === -1) break;
      var osData = loadSakData(payload.id);
      if (!osData) break;
      osData.objectionStates = objectionStatesAfterSet(objectionStatesOf(osData), payload.round, payload.objIds, payload.state);
      if (!Object.keys(osData.objectionStates).length) delete osData.objectionStates;
      saveSakData(payload.id, osData);
      if (activeSakId === payload.id) renderSakResponse(osCase, osData);
      break;
    }

    case 'OBJECTION_ADD': {
      // Egen innvending: reist i runde k («Ny i denne runden») eller i brev L
      var oaCase = cases.find(function(c) { return c.id === payload.id; });
      if (!oaCase || oaCase.type === 'oppdrag' || oaCase.status !== 'viderebehandling') break;
      var oaData = loadSakData(payload.id);
      if (!oaData) break;
      var oaRound = objectionRound(oaCase, roundsOf(oaData));
      if (!oaRound) break;
      var oaList = objectionsOf(oaData);
      if (oaList.length >= OBJECTION_MAX_MANUAL) { showToast('✗ Maks ' + OBJECTION_MAX_MANUAL + ' egne innvendinger', true); break; }
      var oaObj = makeManualObjection(payload.text, payload.isNew ? examinationRound(oaCase) : oaRound.n,
        oaList.map(function(o) { return o && o.id; }), Date.now(), Math.random);
      if (!oaObj) break;
      oaData.objections = oaList.concat([oaObj]);
      saveSakData(payload.id, oaData);
      if (activeSakId === payload.id) renderSakResponse(oaCase, oaData, { closeForm: true });
      break;
    }

    case 'OBJECTION_DELETE': {
      var odCase = cases.find(function(c) { return c.id === payload.id; });
      if (!odCase || odCase.type === 'oppdrag' || odCase.status !== 'viderebehandling') break;
      var odData = loadSakData(payload.id);
      if (!odData) break;
      var odOut = objectionsAfterDelete(odData, payload.objId);
      if (!odOut.objections.length) delete odOut.objections;
      if (!Object.keys(odOut.objectionStates).length) delete odOut.objectionStates;
      saveSakData(payload.id, odOut);
      if (activeSakId === payload.id) renderSakResponse(odCase, odOut);
      break;
    }

    case 'ROUND_BACKFILL': {
      // «Lagre nåværende vurdering som runde N»: bare når saken er forbi et
      // brev og ikke har noen runder som kan vises
      var bfCase = cases.find(function(c) { return c.id === payload.id; });
      if (!bfCase) break;
      var bfData = loadSakData(payload.id) || defaultSakData(0);
      if (!canBackfillRound(bfCase, visibleRounds(bfCase, roundsOf(bfData)))) break;
      var bfView = ensureClaims(Object.assign({}, bfData, { claims: Array.isArray(bfData.claims) ? bfData.claims.slice() : [] }));
      bfData.rounds = [backfillRound(bfCase, bfView)];
      saveSakData(payload.id, bfData);
      if (activeSakId === payload.id) renderSak(payload.id);
      showToast('✓ Vurderingen er lagret som runde ' + bfData.rounds[0].n);
      break;
    }

    case 'SAK_FILING_DATE_CHANGE': {
      var data = loadSakData(payload.id) || defaultSakData(0);
      data.filingDate = payload.date;
      saveSakData(payload.id, data);
      break;
    }

    case 'CLAIM_TOGGLE': {
      var id = payload.id; var claimNum = payload.claimNum; var field = payload.field;
      var data = loadSakData(id) || defaultSakData(0);
      var claim = data.claims.find(function(c) { return c.num === claimNum; });
      if (!claim) break;
      if (field === 'formal') {
        claim.formal = triToggleFormal(claim.formal);
      } else {
        var isCascade = claim[field] === null && getClaimCascadeValue(data.claims, claimNum, field) === true;
        claim[field] = isCascade ? false : triToggle(claim[field]);
        if (field === 'novelty' && claim.novelty === false) claim.inventive = false;
        if (field === 'novelty' && claim.novelty !== false) claim.inventive = null;
      }
      saveSakData(id, data);
      renderSakAssessmentRows(data, claimsAffectedBy(data.claims, claimNum));
      break;
    }

    case 'DOC_ADD': {
      var data = loadSakData(payload.id) || defaultSakData(0);
      ensureSakDocs(data);
      data.docs.push({ id: nextDocId(data.docs), ref: '', pubDate: '', effDate: '', p: false, e: false, background: false });
      saveSakData(payload.id, data);
      renderSakDocs(data);
      break;
    }

    case 'DOC_REMOVE': {
      _mhEditing = {}; // radene kan få nye plasser
      var data = loadSakData(payload.id) || defaultSakData(0);
      ensureSakDocs(data);
      var doc = data.docs[payload.idx];
      if (!doc) break;
      var drCase = cases.find(function(c) { return c.id === payload.id; });
      // Etter første brev er D-numrene låst — merk i stedet for å slette
      var withdraw = docRemoveWithdraws(drCase);
      var docsBefore = data.docs.slice();
      if (!withdraw) {
        AppState.undoSnapshot = {
          mode: 'docs', caseId: payload.id, logIds: [], label: drCase ? drCase.caseNumber : '',
          before: { docs: JSON.parse(JSON.stringify(data.docs)), claims: JSON.parse(JSON.stringify(data.claims || [])) },
          activeCase: activeCase, medlLog: medlLog
        };
      }
      var next = withdraw ? withdrawDocAt(data.docs, data.claims, payload.idx)
                          : removeDocAt(data.docs, data.claims, payload.idx);
      data.docs = next.docs;
      data.claims = next.claims;
      saveSakData(payload.id, data);
      renderSakDocs(data);
      renderSakClaimsTable(data);
      if (withdraw) {
        showToast(doc.id + ' merket ikke lenger relevant');
      } else {
        showUndoToast(docRemoveToast(docsBefore, payload.idx));
      }
      break;
    }

    case 'DOC_RESTORE': {
      var data = loadSakData(payload.id) || defaultSakData(0);
      ensureSakDocs(data);
      if (!data.docs[payload.idx]) break;
      data.docs = restoreDocAt(data.docs, payload.idx);
      saveSakData(payload.id, data);
      renderSakDocs(data);
      renderSakClaimsTable(data);
      break;
    }

    case 'DOC_FIELD_CHANGE': {
      var data = loadSakData(payload.id) || defaultSakData(0);
      ensureSakDocs(data);
      var doc = data.docs[payload.idx];
      if (!doc) break;
      var isDate = payload.field === 'pubDate' || payload.field === 'effDate';
      var isParty = payload.field === 'applicants' || payload.field === 'inventors';
      var isCpc   = payload.field === 'cpc';
      var isText = payload.field === 'ref' || payload.field === 'title' || isParty || isCpc;
      doc[payload.field] = isCpc                   ? capCpcText(payload.value)
                         : isParty                 ? capPartyText(payload.value)
                         : isText                  ? sanitizeText(payload.value)
                         : isDate                  ? String(payload.value || '')
                         : !!payload.value;
      // Bakgrunnsmothold kan ikke være X eller Y, og E-dokumenter ikke Y/X for
      // oppfinnelseshøyde — rydd bort kravsreferansene
      if ((payload.field === 'background' || payload.field === 'e') && doc[payload.field]) ensureSakDocs(data);
      saveSakData(payload.id, data);
      // Referansen skrives i feltet som allerede står i DOM-en; å tegne lista
      // på nytt midt i redigeringen ville flyttet markøren.
      if (isDate) {
        refreshMhFlags(data);
      } else if (payload.field === 'ref') {
        refreshMhCited(data);
      } else if (!isText) {
        renderSakDocs(data);
        renderSakClaimsTable(data);
      }
      break;
    }

    case 'CLAIM_DOC_TOGGLE': {
      var data = loadSakData(payload.id) || defaultSakData(0);
      ensureSakDocs(data);
      var claim = data.claims.find(function(c) { return c.num === payload.claimNum; });
      if (!claim) break;
      toggleClaimDoc(claim, payload.field, payload.docId, data.docs);
      // Nyhet tar nøyaktig ett mothold, så velgeren lukkes etter valget
      if (payload.field === 'novelty') _sakOpenDocPop = null;
      saveSakData(payload.id, data);
      renderSakAssessmentRows(data, claimsAffectedBy(data.claims, payload.claimNum));
      break;
    }

    case 'CLAIM_DOC_COPY': {
      var data = loadSakData(payload.id) || defaultSakData(0);
      ensureSakDocs(data);
      var claim = data.claims.find(function(c) { return c.num === payload.claimNum; });
      if (!claim) break;
      if (!canCopyClaimDocs(data.claims, claim, payload.field)) break;
      if (!copyClaimDocsFromAbove(data.claims, payload.claimNum, payload.field, data.docs)) break;
      // Kopien er et ferdig valg — velgeren lukkes for begge felt, så det
      // ikke trengs et ekstra klikk for å komme videre.
      _sakOpenDocPop = null;
      saveSakData(payload.id, data);
      renderSakAssessmentRows(data, claimsAffectedBy(data.claims, payload.claimNum));
      break;
    }

    case 'CLAIM_NOTE_CHANGE': {
      var data = loadSakData(payload.id) || defaultSakData(0);
      var claim = data.claims.find(function(c) { return c.num === payload.claimNum; });
      if (claim) { claim.notes = sanitizeText(payload.note); saveSakData(payload.id, data); }
      break;
    }

    case 'CLAIM_SET': {
      var data = loadSakData(payload.id) || defaultSakData(0);
      var claim = data.claims.find(function(c) { return c.num === payload.claimNum; });
      if (!claim) break;
      // Oppfinnelseshøyde er låst når kravet mangler nyhet — samme regel som
      // knappen håndhever.
      if (payload.field === 'inventive' &&
          effectiveClaimValue(data.claims, claim, 'novelty') === false) break;
      claim[payload.field] = payload.value;
      if (payload.field === 'novelty') {
        claim.inventive = payload.value === false ? false : null;
      }
      saveSakData(payload.id, data);
      renderSakAssessmentRows(data, claimsAffectedBy(data.claims, payload.claimNum));
      break;
    }

    case 'CLAIM_DEP_CHANGE': {
      var data = loadSakData(payload.id) || defaultSakData(0);
      if (!isValidDep(payload.claimNum, payload.dep)) break;
      if (!applyDepChange(data.claims, payload.claimNum, payload.dep).length) break;
      saveSakData(payload.id, data);
      // Avhengigheten styrer cascaden, som styrer de effektive verdiene — altså
      // sammendraget, rapporten og fremdriften, ikke bare tabellraden.
      renderSakAssessment(data);
      break;
    }

    case 'CLAIM_DEP_RESET':
    case 'CLAIM_DEP_TOGGLE': {
      var data = loadSakData(payload.id) || defaultSakData(0);
      var fn = action === 'CLAIM_DEP_RESET' ? resetDep : toggleDepIndependent;
      if (!fn(data.claims, payload.claimNum).length) break;
      saveSakData(payload.id, data);
      renderSakAssessment(data);
      break;
    }

    case 'CLAIM_LABEL_CHANGE': {
      var data = loadSakData(payload.id) || defaultSakData(0);
      var claim = data.claims.find(function(c) { return c.num === payload.claimNum; });
      if (!claim) break;
      claim.label = sanitizeText(payload.label);
      saveSakData(payload.id, data);
      renderClaimRows(data, [payload.claimNum]);
      break;
    }

    case 'CHECKLIST_TOGGLE': {
      var data = loadSakData(payload.id) || defaultSakData(0);
      data.checklist[payload.itemId] = payload.checked ? true : null;
      saveSakData(payload.id, data);
      updateSakProgress(data);
      break;
    }

    case 'CPC_ADD': {
      var data = loadSakData(payload.id) || defaultSakData(0);
      if (!data.classes) data.classes = [];
      if (!data.classes.some(function(c) { return c.code === payload.code; })) {
        data.classes.push({ code: payload.code, inUse: false });
      }
      saveSakData(payload.id, data);
      renderSakClasses(data);
      break;
    }

    case 'CPC_REMOVE': {
      var data = loadSakData(payload.id) || defaultSakData(0);
      data.classes.splice(payload.idx, 1);
      saveSakData(payload.id, data);
      renderSakClasses(data);
      break;
    }

    case 'CPC_INUSE_TOGGLE': {
      var data = loadSakData(payload.id) || defaultSakData(0);
      if (data.classes[payload.idx]) data.classes[payload.idx].inUse = payload.checked;
      saveSakData(payload.id, data);
      renderSakClasses(data);
      break;
    }

    case 'VACATION_ADD': {
      var addClash = vacationClashText(vacationClashes(vacations, payload.from, payload.to));
      vacations.push({ from: payload.from, to: payload.to, label: payload.label });
      saveVacations();
      renderVacationList();
      showToast((addClash ? '⚠ ' : '✓ ') + 'Ferieperiode lagt til' + addClash);
      break;
    }

    case 'VACATION_EDIT': {
      if (vacations[payload.idx]) {
        var editClash = vacationClashText(vacationClashes(vacations, payload.from, payload.to, payload.idx));
        vacations[payload.idx] = { from: payload.from, to: payload.to, label: payload.label };
        saveVacations();
        renderVacationList();
        showToast((editClash ? '⚠ ' : '✓ ') + 'Ferieperiode oppdatert' + editClash);
      }
      break;
    }

    case 'VACATION_DELETE': {
      vacations.splice(payload.idx, 1);
      saveVacations();
      renderVacationList();
      showToast('✓ Ferieperiode fjernet');
      break;
    }

    case 'FILE_ADD': {
      var fData = loadSakData(payload.id) || defaultSakData(0);
      var fCas  = cases.find(function(c) { return c.id === payload.id; });
      ensureSakFiles(fData, fCas);
      fData.files.push({ name: sanitizeText(payload.name) });
      saveSakData(payload.id, fData);
      renderSakFileList(fData);
      if (typeof renderDocPanes === 'function') renderDocPanes();
      showToast('✓ Fil lagt til');
      break;
    }

    case 'FILE_RENAME': {
      var fData = loadSakData(payload.id) || defaultSakData(0);
      var fCas  = cases.find(function(c) { return c.id === payload.id; });
      ensureSakFiles(fData, fCas);
      if (fData.files[payload.idx]) fData.files[payload.idx] = applyFileEdit(fData.files[payload.idx], payload.name, payload.label);
      saveSakData(payload.id, fData);
      renderSakFileList(fData);
      if (typeof renderDocPanes === 'function') renderDocPanes();
      showToast('✓ Navn endret');
      break;
    }

    case 'FILE_DELETE': {
      var fData = loadSakData(payload.id) || defaultSakData(0);
      var fCas  = cases.find(function(c) { return c.id === payload.id; });
      ensureSakFiles(fData, fCas);
      fData.files.splice(payload.idx, 1);
      saveSakData(payload.id, fData);
      renderSakFileList(fData);
      if (typeof renderDocPanes === 'function') renderDocPanes();
      showToast('✓ Fil slettet');
      break;
    }

    case 'SAK_NOTES_CHANGE': {
      var nData = loadSakData(payload.id) || defaultSakData(0);
      nData.sakNotes = sanitizeText(payload.notes || '');
      saveSakData(payload.id, nData);
      break;
    }

    case 'STATS_LOG_DATE_EDIT': {
      var logEntry = stats.log[payload.idx];
      if (!logEntry) break;
      stats.log[payload.idx] = Object.assign({}, logEntry, { date: replaceDatePart(logEntry.date, payload.date) });
      saveStats();
      renderStats();
      break;
    }

    case 'CHECKLIST_TEMPLATE_RESET': {
      resetChecklistTemplate();
      renderCle();
      _cleUpdateSummary();
      showToast('✓ Sjekkliste tilbakestilt til standard');
      break;
    }

    case 'STATS_RESET': {
      stats = { log: [] };
      saveStats();
      var leg = document.querySelector('.chart-legend'); if (leg) leg.remove();
      closeBackdrop('reset-backdrop');
      renderStats();
      break;
    }

    case 'SETTINGS_GOAL_CHANGE': {
      var val = payload.value;
      productionGoal = isNaN(val) || val < 0 ? 0 : val;
      saveGoal(productionGoal);
      showToast('✓ Produksjonsmål lagret');
      if (activePage === 'statistikk') renderStats();
      break;
    }

    case 'SETTINGS_UNASSIGNED_REMINDER_CHANGE': {
      unassignedReminder = normalizeUnassignedReminder(payload.value);
      saveUnassignedReminder(unassignedReminder);
      var remInp = document.getElementById('input-unassigned-reminder');
      if (remInp) remInp.value = String(unassignedReminder);
      showToast(unassignedReminder ? '✓ Påminnelse etter ' + unassignedReminder + ' dager' : '✓ Påminnelse slått av');
      break;
    }

    case 'SETTINGS_BELEGG_CHANGE': {
      var val = payload.value;
      if ([30, 60, 90].indexOf(val) !== -1) {
        beleggHorizon = val;
        saveBeleggHorizon(val);
        showToast('✓ Belegg-horisont lagret');
        if (activePage === 'hjem') renderBeleggCard();
      }
      break;
    }

    case 'SETTINGS_TYPE_BUFFER_CHANGE': {
      // value null = tilbake til standard for den typen
      if (!(payload.key in TYPE_BUFFER_DEFAULTS)) break;
      var nextBuf = Object.assign({}, typeBuffers);
      nextBuf[payload.key] = payload.value == null ? TYPE_BUFFER_DEFAULTS[payload.key] : payload.value;
      typeBuffers = normalizeTypeBuffers(nextBuf);
      saveTypeBuffers(typeBuffers);
      showToast('✓ Standard buffer lagret');
      render();
      break;
    }

    case 'SETTINGS_WORK_WINDOW_CHANGE': {
      // value null = tilbake til standard for den typen; key null = alle typer,
      // og da tilbakestilles også bufferne
      var next = Object.assign({}, workWindows);
      if (payload.key == null) {
        next = Object.assign({}, WORK_WINDOW_DEFAULTS);
        typeBuffers = normalizeTypeBuffers(TYPE_BUFFER_DEFAULTS);
        saveTypeBuffers(typeBuffers);
      } else if (payload.key in WORK_WINDOW_DEFAULTS) {
        next[payload.key] = payload.value == null ? WORK_WINDOW_DEFAULTS[payload.key] : payload.value;
      }
      workWindows = normalizeWorkWindows(next);
      saveWorkWindows(workWindows);
      showToast(payload.key == null ? '✓ Standardverdier tilbakestilt' : '✓ Standard varighet lagret');
      render();
      break;
    }

    case 'SETTINGS_DEADLINE_CHANGE': {
      // value null = tilbake til standard; key null = alle tilbake til standard
      var nextDl = Object.assign({}, deadlines);
      if (payload.key == null) nextDl = Object.assign({}, DEADLINE_DEFAULTS);
      else if (payload.key in DEADLINE_DEFAULTS) {
        nextDl[payload.key] = payload.value == null ? DEADLINE_DEFAULTS[payload.key] : payload.value;
      }
      deadlines = normalizeDeadlines(nextDl);
      saveDeadlines(deadlines);
      showToast(payload.key == null ? '✓ Fristene tilbakestilt' : '✓ Frist lagret');
      break;
    }

    case 'RESPONSE_CHECK_TOGGLE': {
      var rc = cases.find(function(c) { return c.id === payload.id; });
      if (!rc) break;
      var rData = loadSakData(payload.id) || defaultSakData(0);
      toggleResponseCheck(rData, examinationRound(rc), payload.item);
      saveSakData(payload.id, rData);
      renderSakResponse(rc, rData);
      updateSakProgress(rData);
      break;
    }

    case 'HOME_DEADLINE_FILTER_SET': {
      homeDeadlineFilter = normalizeHomeDeadlineFilter(payload.filter);
      saveHomeDeadlineFilter(homeDeadlineFilter);
      if (activePage === 'hjem') renderHomeDeadlines();
      break;
    }

    case 'SETTINGS_CASE_SOURCE_CHANGE': {
      saveCaseSource(payload.value);
      renderCaseSourceLinks();
      showToast(payload.value.url ? '✓ Lenke til nye saker lagret' : '✓ Lenke til nye saker fjernet');
      break;
    }

    case 'DOC_LAYOUT_SET': {
      docLayout = normalizeDocLayout(payload.layout);
      saveDocLayout(docLayout);
      break;
    }

    case 'SETTINGS_DOC_ROOT_CHANGE': {
      saveDocRoot(payload.value);
      showToast('✓ Saksmappe-rot lagret');
      break;
    }

    case 'CHECKLIST_TEMPLATE_SAVE': {
      saveChecklistTemplate(payload.template);
      var st = document.getElementById('cle-status');
      if (st) { st.textContent = 'Lagret ✓'; setTimeout(function() { st.textContent = ''; }, 2500); }
      _cleUpdateSummary();
      showToast('✓ Sjekkliste-mal lagret');
      closeBackdrop('cle-backdrop');
      break;
    }

    case 'MEDLESING_CREATE': {
      var rec = {
        id: uid(),
        caseNumber: sanitizeText(payload.caseNumber),
        saksbehandler: sanitizeText(payload.saksbehandler),
        type: payload.type === 'medium_stor' ? 'medium_stor' : 'normal',
        date: payload.date || todayStr(),
        checklist: {},
        notat: '',
        completed: false
      };
      AppState.medlesing = medlesing.concat([rec]);
      saveMedlesing(medlesing);
      navigateTo('medlesing/' + rec.id);
      break;
    }

    case 'MEDLESING_COMPLETE_TOGGLE': {
      var rec = medlesing.find(function(m) { return m.id === payload.id; });
      if (!rec) break;
      rec.completed = !rec.completed;
      saveMedlesing(medlesing);
      renderMedlesingDetail(payload.id);
      break;
    }

    case 'MEDLESING_ITEM_TOGGLE': {
      var rec = medlesing.find(function(m) { return m.id === payload.id; });
      if (!rec) break;
      rec.checklist[payload.itemId] = payload.checked ? true : false;
      saveMedlesing(medlesing);
      renderMedlesingDetail(payload.id);
      break;
    }

    case 'MEDLESING_TYPE_CHANGE': {
      var rec = medlesing.find(function(m) { return m.id === payload.id; });
      if (!rec) break;
      rec.type = payload.type === 'medium_stor' ? 'medium_stor' : 'normal';
      saveMedlesing(medlesing);
      renderMedlesingDetail(payload.id);
      break;
    }

    case 'MEDLESING_NOTAT_CHANGE': {
      var rec = medlesing.find(function(m) { return m.id === payload.id; });
      if (!rec) break;
      rec.notat = sanitizeText(payload.notat || '');
      saveMedlesing(medlesing);
      break;
    }

    case 'MEDLESING_DELETE': {
      AppState.medlesing = medlesing.filter(function(m) { return m.id !== payload.id; });
      saveMedlesing(medlesing);
      navigateTo('medlesing');
      showToast('✓ Medlesing slettet');
      break;
    }

    case 'TAG_FILTER_SET': {
      AppState.ui.tagFilter = payload.tag;
      var inp = document.getElementById('tag-filter-input');
      if (inp) inp.value = payload.tag;
      var clearBtn = document.getElementById('btn-filter-clear');
      if (clearBtn) clearBtn.style.display = payload.tag ? 'flex' : 'none';
      render();
      break;
    }

    case 'DATA_IMPORT': {
      var d = payload.data;
      var mergeMode = payload.mode === 'merge';
      if (mergeMode) {
        // Flett saker på id: eksisterende oppdateres, nye legges til. Øvrige data
        // (stats, ferier, mål, dokumentrot, navn, sjekkliste-mal, fristbuffer,
        // medlesinger) røres ikke — kun saker og deres detaljer.
        var idx = {};
        cases.forEach(function(c, i) { idx[c.id] = i; });
        var merged = cases.slice();
        d.cases.forEach(function(ic) {
          if (idx[ic.id] !== undefined) merged[idx[ic.id]] = ic;
          else merged.push(ic);
        });
        cases = merged;
        saveCases();
        var sdWrite = importSakDetailsToWrite(d.sakDetails, d.cases, 'merge');
        Object.keys(sdWrite).forEach(function(id) { saveSakData(id, sdWrite[id]); });
      } else {
        cases = d.cases;
        if (d.stats) stats = d.stats;
        saveCases(); saveStats();
        var sdAll = importSakDetailsToWrite(d.sakDetails, d.cases, 'replace');
        Object.keys(sdAll).forEach(function(id) { saveSakData(id, sdAll[id]); });
        if (Array.isArray(d.vacations)) { vacations = d.vacations; saveVacations(); }
        if (d.docRoot) {
          saveDocRoot(d.docRoot);
          var inp = document.getElementById('input-doc-root');
          if (inp) inp.value = d.docRoot;
        }
        var s = readImportSettings(d);
        if ('goal' in s) { productionGoal = s.goal; saveGoal(productionGoal); }
        if ('beleggHorizon' in s) { beleggHorizon = s.beleggHorizon; saveBeleggHorizon(beleggHorizon); }
        if ('userName' in s) {
          saveUserName(s.userName);
          // Med navnet tilbake er det ingen grunn til å vise velkomstdialogen igjen
          // (den kan allerede være åpnet ved oppstart, før arbeidsfilen er lest)
          if (s.userName) {
            try { localStorage.setItem(ONBOARDING_KEY, '1'); } catch(e) {}
            var ob = document.getElementById('onboarding-backdrop');
            if (ob && ob.classList.contains('open')) { closeBackdrop('onboarding-backdrop'); _cpcShowNotice(); }
          }
        }
        if ('checklistTemplate' in s) {
          if (s.checklistTemplate) saveChecklistTemplate(s.checklistTemplate);
          else resetChecklistTemplate();
          _cleUpdateSummary();
        }
        if ('typeBuffers' in s) { typeBuffers = s.typeBuffers; saveTypeBuffers(typeBuffers); }
        if ('workWindows' in s) { workWindows = s.workWindows; saveWorkWindows(workWindows); }
        if ('deadlines' in s) { deadlines = s.deadlines; saveDeadlines(deadlines); }
        if ('medlesing' in s) { medlesing = s.medlesing; saveMedlesing(medlesing); }
        if ('homeDeadlineFilter' in s) { homeDeadlineFilter = s.homeDeadlineFilter; saveHomeDeadlineFilter(homeDeadlineFilter); }
        if ('docLayout' in s) { docLayout = s.docLayout; saveDocLayout(docLayout); if (typeof renderDocPanes === 'function') renderDocPanes(); }
        if ('activeCase' in s) { activeCase = s.activeCase; saveActiveCase(activeCase); }
        if ('unassignedReminder' in s) { unassignedReminder = s.unassignedReminder; saveUnassignedReminder(unassignedReminder); }
        if ('medlesere' in s) { medleserList = s.medlesere; saveMedleserList(medleserList); }
        if ('medlLog' in s) { medlLog = s.medlLog; saveMedlLog(medlLog); }
        if ('caseSource' in s) { saveCaseSource(s.caseSource); renderCaseSourceLinks(); _caseSourceFillInputs(); }
      }
      closeBackdrop('import-backdrop');
      var leg = document.querySelector('.chart-legend'); if (leg) leg.remove();
      navigateTo(payload.page || 'ny');
      showToast(payload.toast || (mergeMode ? '✓ Saker slått sammen' : '✓ Saker lastet inn'));
      break;
    }

    case 'HIST_DATE_EDIT': {
      var cId = payload.caseId, hIdx = payload.histIdx, newIso = payload.newDate;
      var origDate = payload.originalDate; // ISO string of the old date
      var theCase  = cases.find(function(c) { return c.id === cId; });
      var h        = theCase && theCase.history ? theCase.history[hIdx] : null;
      AppState.cases = cases.map(function(c) {
        if (c.id !== cId) return c;
        var hist = (c.history || []).slice();
        if (!hist[hIdx]) return c;
        hist[hIdx] = Object.assign({}, hist[hIdx], { date: newIso });
        return Object.assign({}, c, { history: hist });
      });
      saveCases();
      // Oppdater stats.log via originalDate + caseNumber + type
      if (h && theCase) {
        var targetLogType = historyLogType(h, theCase.type === 'oppdrag');
        if (targetLogType) {
          var cn = theCase.caseNumber;
          var best = null, bestDiff = Infinity;
          stats.log.forEach(function(entry, i) {
            if (entry.caseNumber !== cn || entry.type !== targetLogType) return;
            var diff = Math.abs(new Date(entry.date) - new Date(origDate));
            if (diff < bestDiff) { bestDiff = diff; best = i; }
          });
          if (best !== null) {
            stats.log[best] = Object.assign({}, stats.log[best], { date: newIso });
            saveStats();
          }
        }
      }
      break;
    }

    case 'DATA_DELETE_ALL': {
      deleteAllData();
      // Minnet nullstilles også — ellers ble det skrevet rett tilbake til
      // arbeidsfilen og sikkerhetskopien ved neste lagring.
      cases = []; stats = { log: [] };
      vacations = []; productionGoal = 0; beleggHorizon = 60;
      unassignedReminder = UNASSIGNED_REMINDER_DEFAULT;
      medlesing = []; activeMedlesingId = null;
      medlLog = []; medleserList = [];
      activeCase = null;
      typeBuffers = normalizeTypeBuffers(null);
      workWindows = normalizeWorkWindows(null);
      deadlines = normalizeDeadlines(null);
      homeDeadlineFilter = defaultHomeDeadlineFilter();
      docLayout = defaultDocLayout();
      if (typeof dpReset === 'function') dpReset();
      undoSnapshot = null; // en åpen «Angre» skal ikke kunne hente sakene tilbake
      closeBackdrop('delete-all-backdrop-2');
      var leg = document.querySelector('.chart-legend'); if (leg) leg.remove();
      navigateTo('hjem');
      showToast('✓ All data er slettet');
      break;
    }

    default:
      console.warn('PatentDesk dispatch: ukjent handling «' + action + '»');
  }
}

// ── Filtrering og sortering ────────────────────────
function casesForPage(page) {
  if (PAGES[page] && PAGES[page].showAll) return cases;
  if (page === 'oppdrag') return cases.filter(function(c) { return c.type === 'oppdrag' && c.status !== 'avsluttet'; });
  return cases.filter(function(c) { return (c.status || 'ny') === page && c.type !== 'oppdrag'; });
}

// ── Alle saker: sortering på kolonneoverskriftene ──
// Sorteringen huskes mellom besøk (pt_alle_sort).
var ALL_SORT_KEYS = ['frist', 'cn', 'tittel', 'status'];
var ALL_SORT_STORE_KEY = 'pt_alle_sort';

// Ren funksjon — se test/allCasesSort.test.js.
function normalizeAllSort(v) {
  var key = (v && ALL_SORT_KEYS.indexOf(v.key) !== -1) ? v.key : null;
  if (!key) return { key: 'frist', dir: 'asc' };
  return { key: key, dir: v.dir === 'desc' ? 'desc' : 'asc' };
}

// Samme kolonne snur retningen; en ny kolonne starter stigende.
// Ren funksjon — se test/allCasesSort.test.js.
function nextAllSort(cur, key) {
  var c = normalizeAllSort(cur);
  if (c.key === key) return { key: key, dir: c.dir === 'asc' ? 'desc' : 'asc' };
  return normalizeAllSort({ key: key, dir: 'asc' });
}

// Rekkefølgen i saksflyten: aktive oppdrag, Ny, Viderebehandling, Fristarkiv, Avsluttet.
// Ren funksjon — se test/allCasesSort.test.js.
function allCasesStatusRank(c) {
  if (c.status === 'avsluttet') return 4;
  if (c.type === 'oppdrag') return 0;
  return { ny: 1, viderebehandling: 2, fristarkiv: 3 }[c.status || 'ny'] || 1;
}

// Sorterer en kopi av lista. dueOf gir fristen merket viser (deadlineFor i
// appen); på frist står avsluttede saker alltid sist, sist avsluttet først.
// Saksnummer avgjør når alt annet er likt. Ren funksjon — se test/allCasesSort.test.js.
function sortAllCases(list, sort, dueOf) {
  var srt = normalizeAllSort(sort);
  var sgn = srt.dir === 'desc' ? -1 : 1;
  var due = dueOf || function(c) { return c.dueDate || ''; };
  function str(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function byCn(a, b) { return String(a.caseNumber || '').localeCompare(String(b.caseNumber || ''), 'nb', { numeric: true }); }
  return list.slice().sort(function(a, b) {
    var r = 0;
    if (srt.key === 'frist') {
      var ca = a.status === 'avsluttet', cb = b.status === 'avsluttet';
      if (ca !== cb) return ca ? 1 : -1;
      r = ca ? str(closedDate(b) || '', closedDate(a) || '') : sgn * str(due(a) || '', due(b) || '');
    } else if (srt.key === 'cn') {
      r = sgn * byCn(a, b);
    } else if (srt.key === 'tittel') {
      r = sgn * String(a.title || '').localeCompare(String(b.title || ''), 'nb', { sensitivity: 'base' });
    } else {
      r = sgn * (allCasesStatusRank(a) - allCasesStatusRank(b));
      if (!r) r = str(due(a) || '', due(b) || '');
    }
    return r || byCn(a, b);
  });
}

// Dager siden saken ble avsluttet, eller null. Ren funksjon — se test/allCasesSort.test.js.
function closedDaysAgo(c, todayIso) {
  if (!c || c.status !== 'avsluttet') return null;
  var d = closedDate(c);
  if (!d) return null;
  return Math.round((new Date(todayIso + 'T00:00:00') - new Date(String(d).slice(0, 10) + 'T00:00:00')) / 86400000);
}

function loadAllSort() {
  var raw = _lsGet(ALL_SORT_STORE_KEY), v = null;
  try { v = raw ? JSON.parse(raw) : null; } catch (e) { v = null; }
  return normalizeAllSort(v);
}

function renderAllSortHead(show) {
  var head = document.getElementById('case-list-head');
  if (!head) return;
  head.hidden = !show;
  if (!show) return;
  var cur = loadAllSort();
  var cols = [['frist', 'Frist'], ['cn', 'Saksnr'], ['tittel', 'Tittel'], ['status', 'Status']];
  head.innerHTML = '<span class="clh-label">Sorter:</span>' + cols.map(function(col) {
    var on = cur.key === col[0];
    var dirTxt = cur.dir === 'asc' ? 'stigende' : 'synkende';
    return '<button type="button" class="clh clh-' + col[0] + (on ? ' is-on' : '') + '" data-sort="' + col[0] + '"' +
      ' aria-pressed="' + (on ? 'true' : 'false') + '"' +
      ' title="Sorter på ' + col[1].toLowerCase() + (on ? ' (nå ' + dirTxt + ')' : '') + '">' + col[1] +
      (on ? '<span class="clh-arrow" aria-hidden="true">' + (cur.dir === 'asc' ? '\u25B2' : '\u25BC') + '</span>' : '') +
      '</button>';
  }).join('') + '<span class="clh-menu" aria-hidden="true"></span>';
}

function sortedForPage(page) {
  var ORDER = { ny:0, viderebehandling:1, fristarkiv:2, avsluttet:3 };
  var isOversikt = !!(PAGES[page] && PAGES[page].showAll);
  if (isOversikt) return sortAllCases(casesForPage(page), loadAllSort(), deadlineFor);
  return casesForPage(page).slice().sort(function(a, b) {
    var va, vb;
    if (sortCol === 'daysUntil') {
      va = daysUntil(deadlineFor(a));
      vb = daysUntil(deadlineFor(b));
    }
    else if (sortCol === 'dueDate')  { va = a.dueDate; vb = b.dueDate; }
    else if (sortCol === 'status')   { va = ORDER[a.status] || 0; vb = ORDER[b.status] || 0; }
    else { va = (a[sortCol] || '').toLowerCase(); vb = (b[sortCol] || '').toLowerCase(); }
    return va < vb ? -sortDir : va > vb ? sortDir : 0;
  });
}

