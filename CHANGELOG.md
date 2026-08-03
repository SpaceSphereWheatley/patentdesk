# Endringslogg

Alle vesentlige endringer i PatentDesk dokumenteres i denne filen.

Formatet er basert på [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
og prosjektet følger [Semantisk Versjonering](https://semver.org/lang/no/).

## [Unreleased]
### Added
- Tidslinjen har et nytt filter der du fritt kan krysse av hvilke sakstyper
  (Ny, Fristarkiv, Viderebehandling, Oppdrag) som skal vises, i stedet for å
  være låst til «Ny». Saksliste-tidslinjen forhåndskrysser av sakstypen som
  svarer til siden du står på, men valget kan overstyres fritt. Hver sakstype
  har nå også en egen farge på tidslinje-bjelken, som gjenbruker de samme
  fargene som status-pillene ellers i appen.
- Tidslinjen kan nå scrolles opptil 6 måneder tilbake i tid, mot bare 14
  dager før. Saker som er mer enn et par uker over frist vises nå som
  vanlige bjelker man kan scrolle til og klikke på, i stedet for å bare bli
  telt i «forfalt»-indikatoren i venstre kant (den brukes fortsatt for saker
  som er mer enn 6 måneder over frist).

### Changed
- Expanded the automated test suite (date/holiday/workday logic, vacation
  overlap, import validation and case migration, status encode/decode, file
  and slug helpers) and broadened CI to run tests across Node 18/20/22 with a
  separate lint job and a function-coverage report.
- Added a systematic design-token layer (spacing, type, radius, shadow and
  motion scales, plus design-system-convention color aliases) to `:root`,
  and pointed every `border-radius`, `box-shadow`, `font-size`,
  `font-weight`, `line-height`, `letter-spacing`, `padding`/`margin`/`gap`,
  and transition/animation duration that already exactly matched one of
  those tokens — including three extended motion tokens
  (`--dur-instant`/`--dur-slower`/`--dur-slowest`) added to cover durations
  the original three-step scale didn't — at the new variable instead of its
  literal value (roughly 700 declarations across the stylesheet). Purely
  internal — no visual output changes, verified by `npm run lint` and
  `npm test` (66/66) after each step; this is prep work from the new
  PatentDesk Design System project (see its `readme.md`) for a later,
  separately-reviewed pass on the values that don't already land on the
  scale.

### Fixed
- Tidslinjens rad-tildeling for overlappende saker var begrenset til to
  rader; en tredje sak som overlappet i tid ble tegnet oppå en annen bjelke
  uten noe tegn på at den var skjult. Tidslinjen bruker nå like mange rader
  som faktisk trengs, og vokser i høyden ved behov.
- Rad-tildelingen behandlet saker i lagringsrekkefølge i stedet for
  kronologisk rekkefølge, som kunne gi unødvendige eller feil
  rad-plasseringer for overlappende saker.
- Helligdager fra i fjor manglet på tidslinjen når man scrollet tilbake over
  et årsskifte, fordi helligdags-oppslaget aldri hentet forrige års
  helligdager og filtrerte bort alt før i dag.
- Zoom-nivået («3 mnd» / «6 mnd» / «1 år») ble kunstig komprimert av
  fortidsvinduet i beregningen av piksler per dag, slik at f.eks. «3 mnd»
  viste mindre enn tre måneder i praksis. Fortiden legges nå til ved samme
  tetthet i stedet for å dele på samme plassbudsjett som horisonten.

## [4.16.0] - 2026-06-29
### Added
- Hovering over a vacation in the timeline now shows its title, dates and
  duration in days, matching the existing tooltip for case deadlines.
- Vacations in Settings can now be edited in place (title and dates), instead
  of having to delete and re-create them.

### Fixed
- Vacation bars in the timeline rendered far wider than their actual date
  range, because the bar's width reused the formula meant for absolute
  positioning instead of the one for a duration. The bar now stops at the
  correct end date.

## [4.15.0] - 2026-06-22
### Added
- «Åpne alle PDF-er»-knapp ved siden av «Kopier mappe-sti» i dokument-
  nedtrekket. Åpner alle PDF-dokumentene i listen som bakgrunnsfaner.

### Changed
- Dokumentikonene i sak-nedtrekket viser nå filtype: PDF-er har sitt vanlige
  dokumentikon, mens andre filtyper (Word, Excel, PowerPoint, bilder, arkiver,
  tekstfiler m.m.) får et eget ikon som skiller dem fra PDF-er.

## [4.14.0] - 2026-06-22
### Added
- «Kopier mappe-sti»-knapp nederst i dokument-nedtrekket som kopierer banen til
  selve sakmappen til utklippstavlen.

### Changed
- Dokumentene i sak-nedtrekket er nå ekte lenker i stedet for knapper.
  Venstreklikk åpner filen i ny fane som før, men midtklikk (og Ctrl+klikk)
  åpner nå filen i en bakgrunnsfane via nettleserens egen håndtering.

## [4.13.0]
### Added
- Import: ny «Slå sammen»-modus ved siden av «Erstatt alt». Flett beholder
  nåværende saker, oppdaterer dem som har samme id fra filen og legger til de
  nye (med detaljdata). Modalen viser hvor mange som oppdateres og hvor mange
  som er nye. «Erstatt alt» er fortsatt forvalg og uendret. Gjelder både
  filimport og gjenoppretting fra automatisk sikkerhetskopi.
- Søke-/filterlinjen som før bare fantes på «Alle saker» vises nå på alle
  sakslister (Ny, Viderebehandling, Fristarkiv, Oppdrag). Samme oppførsel —
  matcher saksnummer, tittel, stikkord og notater — og nullstilles ved
  sidebytte.
- Tastatursnarveier: «?» åpner en snarveisoversikt; «N» ny sak; «1»–«5»
  navigerer mellom sidene. Snarveiene er inaktive mens man skriver i et felt
  eller har en dialog åpen. Ctrl+K (søk) og Esc (lukk) virker som før.

### Changed
- Ytelse: backupEnabled() caches i minnet i stedet for å lese localStorage i
  hver auto-backup-syklus; bufferen invalideres når bryteren endres.

## [4.12.1]
### Changed
- Schema-migrasjoner er nå et sekvensielt register (SCHEMA_MIGRATIONS[n] løfter
  fra versjon n til n+1). Hvert steg lagrer versjonen umiddelbart, så delvis
  framgang bevares; ved feil stopper kjeden og prøves på nytt ved neste
  oppstart. Nye versjonsløft slottes inn uten å røre eksisterende steg.
- IndexedDB-åpning (både CPC-databasen og sikkerhetskopiene) tåler nå at
  indexedDB.open kaster synkront (privat modus / blokkert lagring) — feilen
  rutes til callbacken i stedet for å krasje oppstarten. Objektlagre opprettes
  idempotent, og databasene har eksplisitte versjonskonstanter.

### Added
- Flerfane-vakt: dersom saksdata endres i en annen åpen fane, varsles brukeren
  (én gang) om å laste siden på nytt for å unngå at denne fanens lagring
  overskriver den andre fanens endringer.

### Security
- Angre-toasten bygges nå med textContent i stedet for innerHTML, så et
  saksnummer som inneholder HTML ikke lenger kan injiseres i DOM-en.

## [4.12.0]
### Added
- Nytt fristvarsel-banner øverst på hjemskjermen: viser antall forfalte saker
  og frister som forfaller innen 7 dager, med de inntil 5 mest presserende
  sakene som klikkbare rader (forfalte først). Rød venstrekant ved forfalte,
  gull ved kun kommende. «Lukk» skjuler banneret resten av dagen
  (pt_digest_hidden). Teller aktive saker, oppdrag og fristarkiv med
  forfallsdato.
- Nytt globalt søk: Ctrl+K (eller Cmd+K) åpner et søkefelt som søker i
  saksnummer, tittel, stikkord og notater på tvers av alle arbeidsflyt-statuser.
  Beste treff først (saksnummer-prefiks > saksnummer > tittel > stikkord >
  notater), maks 10 treff. Piltaster velger, Enter åpner saken, Esc lukker.
- claimResultLabel/claimResultClass (fjernet som død kode i 4.10.2) er
  gjeninnført: de uttrykker domenereglene per krav og holdes i live som kjørbar
  dokumentasjon via test/claimRules.test.js.

### Changed
- Banneret og søket er tastatur- og skjermleservennlige (role, aria-label,
  fokusmarkering) i tråd med tilgjengelighetsarbeidet i 4.10.4.

## [4.11.0]
### Changed
- Oppdrag er nå en ren sakstype: type-feltet alene avgjør om en sak er et
  oppdrag.
- Datamigrasjon: eksisterende oppdrag med status='oppdrag' normaliseres til
  status='ny' ved oppstart.
- Detaljvisning: statusknapper for oppdrag viser «Aktiv» og «Avsluttet» (ikke
  «Oppdrag»).
- Kortvisning: oppdrag viser «Aktiv» eller «Avsluttet» basert på faktisk status.

### Removed
- 'oppdrag' som statusverdi (erstattet av type-feltet).

## [4.10.4]
### Added
- Alle modaler har nå tilgjengelig navn (aria-labelledby koblet til
  modaltittelen; veiviseren bruker aria-label), så skjermlesere annonserer
  hvilken dialog som åpnes.
- Klikkbare statskort på hjemskjermen (Nye saker, Oppdrag, Fristarkiv) kan nå
  nås og aktiveres med tastatur (role="button", tabindex, Enter/mellomrom) og
  har synlig fokusmarkering.
- aria-label på ikon-knapper (⋯-menyer, ✕-slett, ✏-rediger).

### Changed
- Etiketter på sakssiden (Antall krav, Stikkord, Notater, Interne notater) er nå
  koblet til feltene sine med for-attributt.
- «Tilbakestill sjekkliste» bruker nå appens egen bekreftelses-modal i stedet
  for nettleserens window.confirm.

### Fixed
- closeAllBackdrops lukker nå også sikkerhetskopi-modalen, som manglet i listen.

## [4.10.3]
### Changed
- CPC-autofullfør: nøklene normaliseres (whitespace/store bokstaver) én gang ved
  lasting i stedet for per nøkkel per tastetrykk — merkbart raskere søk i
  databasen med 253 000+ symboler.
- Navigasjonsfanene grupperer nå sakene per side i én gjennomgang i stedet for å
  filtrere hele saklisten én gang per fane.
- Hjemskjermens statskort teller alle kategorier i én gjennomgang i stedet for
  fem separate filter-pass over saklisten.
- Desc-migreringen av pt_sak_* kjøres nå bare én gang (flagg pt_desc_stripped) i
  stedet for å iterere alle nøkler ved hver oppstart.

## [4.10.2]
### Fixed
- Sletting av en sak fjerner nå også sakens detaljdata (pt_sak_*) fra
  localStorage; tidligere ble de liggende igjen for alltid og spiste
  lagringsplass. Angre-knappen gjenoppretter både saken og detaljdataene.
- Ved oppstart ryddes foreldreløse pt_sak_*-nøkler fra tidligere slettinger bort
  (kun når saklisten finnes og kan leses trygt).
- Korrupte saksdetaljer overskrives ikke lenger stille av tomme standarddata:
  råteksten bevares under pt_korrupt_<id> og brukeren varsles med toast.

### Changed
- Feilet datamigrering varsles nå med toast, og schema-versjonen settes ikke før
  migreringen lykkes (prøves på nytt neste oppstart).
- Alle lagringsfunksjoner (sjekkliste, ferier, mål, belegg, dokumentrot,
  brukernavn m.fl.) varsler nå brukeren ved lagringsfeil, med egen melding når
  lagringsplassen er full (felles hjelper lsSetSafe).
- Feilet automatisk sikkerhetskopi (IndexedDB) varsles nå med toast én gang per
  feilperiode, med oppfordring om manuell eksport.
- Lint-oppsettet sjekker nå faktisk JavaScript-koden i fila (eslint-plugin-html),
  ikke bare HTML-strukturen.

### Removed
- Død kode avdekket av linteren (gammel bulk-implementasjon, ubrukte
  hjelpefunksjoner og variabler).

## [4.10.1]
### Fixed
- Klikk på en søknad-bjelke på hjemskjermens tidslinje åpner nå sakssiden
  (navigering skjer ved museopp før evt. re-render, så bjelken ikke forsvinner
  fra DOM før klikk-eventet rekker å fyres).

### Changed
- Hover-info i tidslinjen viser nå saksfristen i tillegg til saksnummer, tittel
  og dager til frist.

### Removed
- Dødt tidslinje-materiale: ubrukte config-nøkler ('home-tl-30', 'bulk-timeline'),
  tilhørende grener i renderTimeline og drag-handler, ubrukt funksjon
  _activeBulkRows() og ubrukt CSS-variabel --tl-track-bg.

## [4.10.0]
### Added
- Saker som er over frist forsvinner ikke lenger fra tidslinjen. Forfalte saker
  (innenfor 14-dagersvinduet) vises nå med rød farge på bar/prikk; saker som er
  mer enn 14 dager over frist festes som en rød «‹N forfalt»-markør ved venstre
  kant, med saksnummer og antall dager forfalt ved hover. Ny «Forfalt»-oppføring
  i tegnforklaringen.
- Nytt statskort på hjemskjermen: «Dager til fridag», som viser antall dager til
  neste ferie eller offentlige fridag, med navn og dato.

### Changed
- Julaften (24. des) og nyttårsaften (31. des) er lagt til som fridager, i
  tillegg til de 12 offisielle røde dagene (inkl. påske og jul).
- Statskortene er nå i rekkefølgen Nye saker, Oppdrag, Fristarkiv, Forfalt,
  Dager til fridag.

## [4.9.5]
### Fixed
- Hover-popupen som følger musen lå over sak-bjelken og fanget opp klikket, så
  navigasjon til sakssiden aldri ble utløst. Popupen er nå satt til
  pointer-events: none, så klikk går gjennom til bjelken.

## [4.9.4]
### Fixed
- Klikk på en sak-bjelke i tidslinjen åpner nå sakssiden, men kun hvis man ikke
  har dratt bjelken (drag for å justere bufferdager fungerer som før).
- Bjelken hoppet ett hakk til venstre når man slapp museknappen etter en drag.
  Forhåndsvisningen under drag brukte en annen (midnatt-basert) regnemåte enn
  selve tidslinje-rendringen (kl. 16:00 som fristtidspunkt); nå er de samkjørt.

## [4.9.3]
### Fixed
- Hover-popup på tidslinjebjelker og klikk-navigasjon til saksside virket ikke
  lenger fordi handlerne ble bundet til tidslinje-elementer før disse ble bygget
  i DOM. Nå brukes event-delegering på document, slik at hover og klikk fungerer
  igjen på alle tidslinjer.

## [4.9.2]
### Changed
- Dagens sikkerhetskopifil i valgt mappe overskrives nå ved hver auto-backup
  (tidligere ble den kun skrevet ved dagens første endring og var deretter
  frosset). Fortsatt én datert fil per dag.
- «Sist skrevet»-statusen i Innstillinger viser nå dato og klokkeslett.

## [4.9.1]
### Fixed
- Ikonene for opp-/nedlasting i Innstillinger var usynlige — manglende
  SVG-symboler #ti-upload og #ti-download lagt til i spriten.

### Changed
- Domeneregel håndheves nå også ved lagring: saveSakData normaliserer krav uten
  nyhet til oppfinnelseshøyde = nei, så ugyldig tilstand aldri kan persisteres
  (uansett om den kommer via import e.l.).
- CLAUDE.md: konkret versjonstall fjernet — versjon grep'es alltid fra
  APP_VERSION i filen.

## [4.9.0]
### Added
- Automatisk sikkerhetskopi: øyeblikksbilde av alle data tas noen sekunder etter
  hver endring (debounced); de 20 siste beholdes i IndexedDB og kan gjenopprettes
  via Innstillinger → Sikkerhetskopiering → «Vis kopier» (gjenbruker
  import-bekreftelsen).
- Mappe-sikkerhetskopi (Chrome/Edge): velg en mappe, så skrives én datert fil
  (patentdesk-backup-ÅÅÅÅ-MM-DD.json) per dag automatisk. Skjules i nettlesere
  uten File System Access API.
- Av/på-bryter for automatisk kopi; «Siste kopi»-status i innstillinger.
- Ventende kopi tas umiddelbart når fanen skjules/lukkes.

### Security
- Chart.js v4.4.1 er nå innebygd i filen (tidligere lastet fra cdnjs-CDN uten
  SRI) — fjerner MITM-risiko og gjør appen 100 % frakoblet.
- XSS-hull tettet i stikkord-autofullfør (3 steder) — lagrede stikkord og søkeord
  escapes nå før innsetting i HTML (highlightMatch).

## [4.8.5]
### Added
- Fristarkiv og kommende viderebehandlinger vises nå som prikker øverst i
  tidslinjen (top:2px, ingen overlapp med barer); hover-popup og klikk-navigasjon
  støttes.

### Changed
- Seksjonen under sakslisten heter nå «Viderebehandlinger over frist» og viser
  kun forfalte viderebehandlinger.
- Lavpri-seksjonen vises alltid med maks 3 plasser, uavhengig av antall
  høypri-saker.

### Fixed
- Prikker posisjonert inni track (top:2px) for å unngå clipping fra
  scroll-wrapper.

## [4.8.4]
### Changed
- Hjemsidens saksliste er delt i to seksjoner — førstesøknader (ny) og oppdrag
  øverst, forfalte viderebehandlinger i egen seksjon under (maks 8 i øvre, maks 3
  i nedre).

## [4.8.3]
### Changed
- Forfallsdato og per-sak-buffer er nå skrivebeskyttet på sakssiden og redigeres
  utelukkende via ⋯ → Rediger sak-modalen.
- Antall krav er tilbake som redigerbart inputfelt på sakssiden.

### Added
- Buffer-felt lagt til i modalen (vises kun for søknadstypen). CASE_EDIT-handleren
  lagrer nå caseBuffer fra modalen.

### Fixed
- Lagring fra modal mens man er på sakssiden navigerer nå ikke bort fra
  sakssiden.

## [4.8.2]
### Changed
- Sakssiden: bibliografiske felt (saksnummer, tittel, innleveringsdato, antall
  krav, varighet) vises nå som skrivebeskyttet tekst — endres via «Rediger sak» i
  ny ⋯-meny øverst til høyre.

### Added
- Sakssiden: ny ⋯-knapp i topbaren med Rediger sak, Kopier mappe-sti og Slett sak
  (med bekreftelse).
- Hjemmesiden: ny ⋯-knapp på hver rad i «Kommende frister»-listen med Rediger sak
  og Slett sak.

## [4.8.1]
### Changed
- Slo sammen duplisert CSS for knappevarianter (.btn-primary/.btn-secondary/
  .btn-danger) og stikkord-elementer (.tag-chip/.tag-cloud-item) til delte
  basisregler — ingen visuell endring.
- Utvidet seksjonsoversikten øverst i <style> til å dekke hele filen (CSS,
  HTML-markup og alle JS-seksjonene), ikke bare CSS-delen.

### Fixed
- Bug der den udefinerte variabelen --bg2 gjorde at modal-type-knapper,
  oppdrag-varighetsmerker, bulk-fane og modus-piller fikk gjennomsiktig bakgrunn
  i stedet for den tiltenkte lyse gråfargen (--bg2 er nå et alias for
  --surface2).

### Removed
- Foreldreløs box-shadow-deklarasjon utenfor .card-regelen og en duplisert/
  motstridende .sak-tri-locked-regel (begge ugyldig/dødt CSS).
- Duplisert oppføring i closeAllBackdrops()-listen.

## [4.8.0]
### Added
- «Dokumenter»-menyen på sakssiden er ikke lenger en fast liste. Du kan nå legge
  til, slette og endre navn på filer per sak.

### Changed
- Søknadssaker beholder de fem standardfilene (Claims.pdf, Description.pdf,
  Abstract.pdf, Figures.pdf, Application.pdf) som utgangspunkt, mens
  oppdragssaker starter med en tom liste.
- Nye filer følger samme stimønster som de øvrige
  (<dokumentrot>\<saksnummer>\<filnavn>) og ligger dermed i saksmappen.
- Filnavn uten filtype antas å være PDF når lenken åpnes/kopieres, og
  «.pdf»-endelsen vises ikke i listen.

### Removed
- Det strenge formatkravet til oppdragsnummer (tidligere 8 siffer + «P»). Du kan
  nå kalle oppdrag hva du vil.

## [4.7.2]
### Fixed
- «Slett alt»-funksjonen manglet flere lagrede nøkler (pt_drawer_collapsed,
  pt_cpc_welcomed) og slettet ikke selve CPC-databasen i IndexedDB. Alt dette
  fjernes nå, og CPC-tilstanden (minne, banner, status) nullstilles fullstendig
  via ny _cpcResetState().

## [4.7.1]
### Added
- Feltet for saksmappe-rot (i Innstillinger og i onboarding-veiviseren) viser nå
  en live forhåndsvisning av den fullstendige filbanen («Eksempel:
  C:\...\NO20240001\Claims.pdf»), samt en oversikt over hvilke filer hver
  sak-mappe bør inneholde (Claims.pdf, Application.pdf, Figures.pdf,
  Description.pdf, Abstract.pdf).

### Changed
- Banen normaliseres ved lagring (fjerner etterslengende skråstreker og
  konverterer «/» til «\»).

## [4.7.0]
### Added
- Ny 3-stegs onboarding-veiviser vises ved første gangs bruk: navn, mappe for
  saksdokumenter og innlasting av CPC-database. Erstatter den tidligere
  frittstående CPC-velkomstmodalen (samme innlastingslogikk gjenbrukes i siste
  steg). Fremgangen lagres som «pt_onboarding_completed» / «pt_user_name», og
  nullstilles av «Slett all data».

## [4.6.0]
### Added
- CPC-database-raden i Innstillinger godtar nå dra-og-slipp av cpc_v2.json som et
  raskere alternativ til «Velg fil»-dialogen. Samme last/lagre-logikk som før —
  kun innlastingsveien er ny.

## [4.5.0]
### Added
- Dokument-dropdown på sakssiden har nå en egen «åpne»-knapp per fil (klikk på
  filnavnet) som åpner filen direkte via file:///, i tillegg til den eksisterende
  kopier-sti-knappen (📋-ikon).

## [4.4.4]
### Fixed
- renderSak nullstiller sak-num-claims og sak-filing-date eksplisitt ved lasting
  av oppdrag.
- renderSak nullstiller sak-duration ved lasting av søknad.
- Type-guards i change-lyttere for sak-num-claims, sak-filing-date og sak-duration
  hindrer kryss-sak-skriving.

## [4.4.3]
### Added
- «Om appen»-knapp i ny Om-seksjon åpner modal direkte.

### Changed
- Ny CSS: .s-btn, .s-inp, .s-sel med felles 32px høyde erstatter
  .btn-setting-action i innstillingene.
- Seksjoner omdøpt: Arbeidsoppsett → Produksjon, Data → Sikkerhetskopiering; ny
  Om-seksjon.
- Fristbuffer-label oppdatert til «global» med «Kan overstyres per sak» i
  subtekst.
- Eksporter: slått sammen til én rad med to knapper.
- Ferieliste: kollapsbar med statusfarger (ferdig / pågår / kommende) og «Legg
  til»-knapp inline.

### Removed
- pt_theme fjernet fra deleteAllData().
- Konami-kode (23 linjer JS + CSS + div).

## [4.4.2]
### Changed
- Tittel får min-width: 60px — forsvinner aldri helt.
- Notater krymper med flex-shrink, skjules under 800px.
- Status-pill skjules under 700px.
- Handlingsknapp skjules under 600px; meny-knappen (⋯) alltid synlig som
  erstatning.
- Meny-knapp synlig ved :focus-within (touch-støtte).

## [4.4.1]
### Added
- Ny kompakt 30-dagers tidslinje ved siden av 120-dagers.
- Prognoselinje lagt til eksisterende Chart.js-graf basert på effektive
  forfallsdatoer.
- ti-flag-ikon for Oppdrag-siden.

### Changed
- Ny lys farge-palett (#f5f6f8 base).
- SVG Tabler-ikoner erstatter emoji i navigasjonen.
- Nav-stil A: subtilt aktiv-tilstand med lys grå bakgrunn.
- Hjemside: statistikkort viser kun Nye saker, Oppdrag, Fristarkiv og Forfalt.

### Removed
- Mørk modus (ingen dark/light-referanser i koden).
- Viderebehandling-statistikkort.

## [4.3.0]
### Added
- Drag-interaksjon på hjemtidslinjen for å sette per-sak fristbuffer (kun fra
  hjemskjermen).

### Changed
- Belegg endret fra union-modell til summeringsmodell (tillater >100 % og viser
  reell overbelastning).
- effDueFor() prioriterer c.caseBuffer over global fristBuffer når det er satt.
- hasBuffer-sjekker bruker effDue !== c.dueDate i stedet for fristBuffer > 0.
- renderHjem() kalles etter drag (oppdaterer alle kort).
- at-limit rød kant vises kun under aktiv dragging.

### Fixed
- _dragJustEnded-flagg hindrer utilsiktet saksnavigasjon etter drag.

## [4.2.8]
### Changed
- renderTimeline() endret fra targetId-signatur til opts-basert API.
- _tlConfig-tabell erstatter seks løse variabler.
- buildTimelineWidget() factory-funksjon eliminerer ~200 linjer duplisert HTML og
  JS.
- renderCardList og renderOversiktCards slått sammen til renderCaseList(sorted,
  opts, listEl, emptyEl).

### Removed
- Mørk modus og kompakt modus.

### Fixed
- Tidslinje-feil: widget-initialisering, cases-timeline manglende fra _tlConfig,
  modal zoom gjenoppbygger track, _applyTimelineScroll hardkodet FULL=365,
  clientWidth=0 ved oppstart via requestAnimationFrame.

## [4.2.0] – [4.2.7]
### Changed
- Chart.js-farger fra CSS-tokens.
- Responsiv kortliste med shrink/skjul per breakpoint.
- Sakskort-meny alltid synlig på touch via :hover-fix.

## [4.1.8]
### Changed
- periodOverlapsVacation(c) sjekker om noen del av arbeidsperioden overlapper
  ferie (ikke bare fristen).
- Bruker effDueFor(c) konsekvent for begge sakstyper.

### Fixed
- UTC-offset-feil (toISOString → setDate/getDate).

## [4.1.5]
### Added
- Inline SVG favicon via data-URI i <head>.
- Dobbel-offset sekskant i gull (#b08040) og blå (#2563eb).
- .logo-mark i navigasjonsdrawer bruker samme SVG.

## [4.1.3]
### Changed
- Bulk-modal slått inn i hoved-modal som andre fane.
- Arbeidsplan-tidslinje øverst i modalen (begge faner).
- Split-knapp erstattet med enkelt «Legg til sak»-knapp.
- Status-valg via radioknapper med fargede pill-etiketter.
- Notater og stikkord bak «Avansert»-veksler.
- Bulk-fane: kun Excel lim-inn (manuell rad fjernet), auto-deteksjon av kolonner
  som standard.

### Added
- Oppdrag-saksnummerformat valideres (8 siffer + P).

### Removed
- «Avsluttet» fjernet fra registreringsmodalen.

## [4.1.1]
### Changed
- «I dag»-linjen plasseres ut fra new Date() (nøyaktig klokkeslett), ikke midnatt
  — beveger seg gjennom dagen.
- Forfallsdatoer tolkes som kl. 16:00.
- Uketicks forankret til faktiske mandager.

### Added
- pctDay() innført for grid-elementer.
- Ukenummer vises også når månedsskifte faller på mandag.

## [4.0.0]
### Added
- Historikk-modal med statusbytter og fristendringer.
- Oppdrag-sakstype med egen flyt og tidslinje-visning.
- Konfigurerbar sjekkliste-mal i Innstillinger.
- Cascade-regel for kravsvurdering (nyhet + OH arves transitivt nedover
  avhengighetskjeden).
- Focus trap i alle 14 modaler (WCAG 2.1.2).
- aria-live toast-annonsering for skjermlesere.
- Dyp import-validering med per-case-filtrering.
- Duplikat saksnummer-advarsel (case-insensitivt).

### Changed
- Seksjonsstruktur S1–S7 med klare laggrenser.
- Alle tilstandsendringer via dispatch() / reducer.
- AppState-objekt — ingen løse globaler.
- Komplett CSS-token-system (ingen hardkodede hex).
- Chart-farger fra CSS-tokens.

## [3.16.3]
### Fixed
- migrateCases bevarer type og duration (oppdrag mister ikke sakstype ved
  reload).
- updateCaseField bruker riktig label for oppdrag.
- buildByMonth dobbelteller ikke oppdrag i statistikk.
- Tidslinje-popup bruker ikke buffer-justert dato for oppdrag.
- sortedForPage sorterer oppdrag uten buffer.

### Added
- P-suffix-validering.

## [3.16.0]
### Added
- Oppdrag-sakstype med totrinnflyt (Ny → Avsluttet).
- Saksnummer-format: 8 siffer + «P».
- Forenklet saksside uten kravtre og sjekkliste.
- Oppdrag vises i kortlisten med særegen fargesetting.
- Tidslinje-integrering med lilla felt-farge.
- Statistikk-tabell med to nye kolonner for oppdrag.

### Changed
- effDueFor(c) hjelper erstatter gjentatte ternary.
- Eksport statusMap inkluderer oppdrag.
- Sticky progress-bar skjules for oppdrag-sakssider.

## [3.12.4]
### Fixed
- Horisontale skillelinjer mellom uselvstendige krav fjernet (border-top på
  .kt-group-children fjernet).

### Changed
- Navigasjonsikoner oppdatert: Nye saker 📄 → 📥, Viderebehandling 🔄 → ↩️,
  Fristarkiv 📁 → ⏳.

## [3.12.3]
### Changed
- Ytre wrapper-boks rundt hele treet.
- Rekursiv rendering med stigende innrykk for >2 nivåer.
- Krav-nummer vises i stedet for «Krav X»-etiketter.

## [3.12.2]
### Added
- Boks per selvstendig krav-gruppe (kt- CSS-prefix).
- Fargekodet venstrekant basert på kravstatus (grønn/rød/gul/grå).
- Kollapsbare grupper med persistent kollapstilstand.

## [3.12.1]
### Added
- cpc_v2.json-format: {t, l} per kode (253 422 symboler), med format-validering
  ved innlasting.
- «Last inn på nytt»-knapp i CPC-banner og CPC-database-seksjon i Innstillinger.
- Hierarki-tooltip med foreldrekoder og dybdepunkter (●), 600ms
  hover-forsinkelse.

### Changed
- Kun {code, inUse} lagres — desc slås opp live fra _cpcDb. Eksisterende desc-felt
  migreres ut av localStorage.
- Sjekkliste-redigerer flyttet til modal.
- Tema-veksler-knapp viser hva den bytter til (ikke gjeldende).

## [3.11.5]
### Added
- Ny standard sjekkliste: Forberedelse (8), Gransking (17), Rapport (9).
- Sjekkliste-redigerer i Innstillinger med pt_checklist_tpl.

### Changed
- getChecklistTemplate() erstatter direkte CHECKLIST_TEMPLATE-referanser.

## [3.11.4]
### Fixed
- Krav uten nyhet telles korrekt som ferdigvurderte for OH.
- inventiveTotal tilsvarer alltid fullt antall krav.

## [3.11.3]
### Added
- Selvstendig krav med nyhet=ja og OH=ja sender verdiene transitivt til alle
  avhengige krav.

### Changed
- Cascade-verdier kan overstyres manuelt per krav.

## [3.11.2]
### Added
- Tidslinje («Arbeidsplan») lagt til Nye saker-siden.
- Bulk-modal manuell-fane: «Legg til rad» og fane-bytte kaller renderTimeline.

### Changed
- _renderBulkTimeline() slått inn i renderTimeline(targetId).
- Tidslinje-SVG bruker width="100%".
- Bulk-modal-tidslinje horisontal scrollbar.

## [3.11.0] – [3.11.1]
### Fixed
- Modaler flyttet fra etter </html> til korrekt i <body>.
- var-omfangskonflikt i klikkhåndterer.
- workDaysUntil logikkfeil for helgefrister.
- Inkonsekvent regex i _normDate.
- tagFilter-tilstandslekkasje mellom sidenavigasjon.

### Security
- Manglende sanitering på interne notater.
- Stinormalisering i buildCasePath.

### Changed
- 67 inline CSS-stiler erstattet med 40+ navngitte klasser.
- getNorwegianHolidays memoized.

### Removed
- Duplikat CHANGELOG-innslag.
- Dead code i initCpcLoadButton.

## [3.10.7]
### Added
- Kollapsbar navigasjonsdrawer (‹/›, pt_drawer_collapsed).
- Tidslinje kopiert til Nye saker-siden.
- Split «Legg til sak»-knapp med dropdown for bulk-import.
- Bulk-modal med to faner: lim inn fra Excel / manuell, med live
  tidslinjeforhåndsvisning.

### Fixed
- Kritisk: addEventListener på bulk-modal-elementer som ikke fantes i DOM ennå
  (TypeError stoppet all JS).
- sanitizeText() hindrer JSON.parse-krasj fra uescapede linjeskift i notes-felt.

## [3.10.3]
### Added
- CPC-autofullfør via lokal cpc.json, migrert til IndexedDB.
- Stikkord-pill-redigerer med hover-slett og autofullfør.
- CPC-database-onboarding-modal for nye brukere.
- Kopieringsknapper for CPC-klasser (grovklasser / alle).

### Changed
- Statistikkside redesignet: årsvelger i header, Chart.js med fylt areal, mållinje
  og trendlinje.
- Hendelseslogg på statistikksiden bruker kortlistestil.
- «Alle saker»-siden bruker kortlistestil med søk.
- Kravs avhengighets-dropdown erstattet med tallinndata med auto-kopi.

## [3.9.0]
### Added
- Drawer kollapser til ikon-bredde (48px) via ‹/›.
- Tooltips ved hover i kollapset tilstand.
- Tilstand lagret i pt_drawer_collapsed.

## [3.8.0]
### Changed
- JSON-eksport inkluderer pt_sak_*, ferier, produksjonsmål, belegg-horisont og
  doc-rot.
- «Slett alt»-håndterer rydder disse nøklene.

## [3.7.0]
### Added
- Visuelt kravtre til høyre for vurderingstabellen.
- Innrykk-basert hierarki (ingen grenlinjer).
- Valgfrie fritekst-etiketter per krav (synlige som chips).
- «Avh. av»-kolonne i tabellen definerer hierarki.
- Selvstendig krav utledes fra dep === null; Krav 1 er alltid selvstendig som
  standard.

## [3.6.0]
### Changed
- Nye saker, Fristarkiv og Viderebehandling bruker kortlistestil i stedet for
  tabeller.
- Primærhandlingsknapp alltid synlig på kort.
- Rediger/slett/historikk i hover-avslørt ⋯-meny.

## [3.5.0]
### Added
- Saker klikkbare fra alle steder inkl. hjemside.
- Alle saksdetaljer redigerbare fra sakssiden.
- Status-valg via pill-knapper.

### Changed
- To-store-arkitektur formalisert: cases[] for liste; pt_sak_{id} for detaljer.

## [3.4.0] – [3.4.3]
### Added
- Sirkulær belegg-måler (56px) på hjemside.
- Konfigurerbar horisont (30/60/90 dager) i Innstillinger.
- Fargekodet grønn/gul/rød (<60% / 60–80% / >80%).
- Trendpil for neste periode.
- «Nybehandlinger i år»-kort med viderebehandlinger i subtekst.

### Fixed
- «Behandlet i år» dobbeltelling (bruker stats.log).

## [3.3.10]
### Added
- «Patenterbar»-raden viser union av patenterbare og
  patenterbare-med-formelle-feil krav.

## [3.3.9]
### Changed
- Full-bredde topplinje på selvstendige krav.
- Krav 1 alltid selvstendig (toggle deaktivert).

## [3.3.8]
### Changed
- Gull venstrelinje på selvstendige krav (toggle via klikk).

## [3.3.0] – [3.3.7]
### Added
- «Neste forfall»: kalender- og arbeidsdager side om side.
- Norske helligdager (getNorwegianHolidays, easterSunday).
- Årlig produksjonsmål med stipplet mållinje i graf.
- Prognoselabel «Anslag: XX» med fargestatus (grønn/gul/rød).

### Changed
- workDaysUntil() ekskluderer helger, helligdager og ferier.
- CHANGELOG konvertert fra .md til .txt.

### Removed
- Viderebehandling-kort/-kolonne på statistikksiden.

## [3.2.13] – [3.2.19]
### Added
- Sticky-bar med tokolonne-grid: Nyhet | OH | Resultat.
- updateStickySummary() via IntersectionObserver.
- Kravtabell-kolonneoverskrifter viser per-kolonne fremdrift.
- Grønt «✓ Ferdig»-merke når kolonne er ferdigvurdert.

## [3.2.0] – [3.2.12]
### Added
- Hash-ruting #sak/{saksnummer}.
- Sjekkliste i tre faser (Forberedelse / Gransking / Uttalelse) i
  trekolonne-grid.
- CPC-klasse-behandler med autofullfør.
- Kravvurderingstabell: ✓/✗/— for nyhet, OH, formelle feil.
- Resultatsummeringsgrid med kravområder.
- Alle data lagres i pt_sak_{id} per sak.
- Domeneregler: ingen nyhet ⟹ ingen OH; krav patenterbar bare med nyhet + OH
  bekreftet.

## [3.1.3]
### Changed
- appendHistory(c, status) hjelper erstatter duplisert mønster.
- normaliseTags() konsekvent i btn-tag-confirm.
- nextDue omdøpt fra upcoming (variabeloverskygning).

## [3.1.0] – [3.1.2]
### Added
- _dp singleton datepicker med norske dag-/månedsnavn.

### Fixed
- IIFE flyttet til linje 27 for å unngå «kalt før definert».
- CSS-bugfixer: --bg2 → --surface2, --vacation-color lagt til i light-blokk,
  .dp-wrap flex-fix.

## [3.0.0]
### Added
- Ferieperioder lagret i pt_vacations.
- Grønne ferie-blokker i tidslinje med hover-popup.
- ⛱-badge på frister som faller i ferie.

## [2.9.0]
### Added
- «Neste forfall»-kort klikkbart: kopierer mappesti.
- «Forfalt»-kort: rød kant, 🔴-ikon, rød bakgrunn når det finnes forfalte saker.

### Changed
- Inter-font gjennomgående.
- Fristarkiv vises etter Viderebehandling i alle visninger.
- «Neste forfall» viser kun kommende (ikke forfalt).

## [2.5.0] – [2.8.1]
### Added
- Sticky-bar første implementasjon (IntersectionObserver).
- ss-patent / ss-patent-formal / ss-group-sep CSS-klasser.

### Changed
- Diverse justering av kortlayout, farger og typografi.

## [2.3.0]
### Added
- Dashboard med statuskort og nøkkeltall.
- SVG-tidslinje (enkelt-rad Gantt over 365 dager).
- Statistikk med kumulativ linjegraf og trendprojeksjon.
- Stikkord-filtrering og autofullfør.
- JSON/CSV eksport/import.
- Angre for flytt og sletting.
- Hash-ruting.
- Lys/mørk modus.
- Konami-kode-påskeegg.

## [1.0.0] – [1.4.0]
### Added
- Grunnleggende saksflyt: Ny → Fristarkiv ↔ Viderebehandling → Avsluttet.
- Statistikkside med månedstabell og aktivitetsgraf.
- Navigasjonsdrawer erstatter horisontal toppmeny.
- Eksport til CSV (UTF-8 BOM) og JSON.
- Auto-lagring til localStorage.
- Stikkord-autocomplete.
- Stikkord-oversikt i statistikk.
- Versjonsnummer i drawer-logo.
