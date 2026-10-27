# PatentDesk

Offlinebasert saksbehandlingsverktøy for patentgranskere. Enkeltfil med
HTML/CSS/JS — ingen byggprosess, ingen avhengigheter, ingen server.

## Kom i gang

1. [📥 Last ned PatentDesk.html](https://raw.githubusercontent.com/SpaceSphereWheatley/patentdesk/main/PatentDesk.html)
2. Åpne filen i en nettleser (Chrome eller Edge anbefales — datamappen
   krever File System Access API)
3. Det er alt. Alt kjører lokalt; ingenting forlater maskinen din.

Valgfritt: last inn `cpc_v2.json` (CPC-klassifikasjonsdatabase med 253 000+
symboler) via banneret i appen eller via Innstillinger for å aktivere
autofullføring av klassifikasjon. Den lagres i nettleserens IndexedDB.

### Snarvei med eget ikon (Windows)

Legg `PatentDesk.ico` og `Lag-PatentDesk-snarvei.ps1` i samme mappe som
`PatentDesk.html`, åpne PowerShell i mappen og kjør:

```powershell
powershell -ExecutionPolicy Bypass -File .\Lag-PatentDesk-snarvei.ps1
```

Du får en snarvei på skrivebordet og i Start-menyen som åpner PatentDesk i
eget Edge-vindu med PatentDesk-ikonet. Ingen administratorrettigheter trengs.

## Hvordan data lagres

All data lever i nettleseren, begrenset til filens opprinnelse:

| Lager | Innhold |
|---|---|
| `localStorage` (`pt_cases`) | Sakliste — statuser, frister, etiketter |
| `localStorage` (`pt_sak_<id>`) | Per-sak-detaljer — krav, CPC-klasser, sjekkliste |
| `localStorage` (diverse `pt_*` nøkler) | Innstillinger: mål, ferieavsnitt, dokumentrot, osv. |
| IndexedDB `PatentDeskCPC` | CPC-klassifikasjonsdatabase (valgfritt) |
| IndexedDB `patentdesk_backups` | Automatiske øyeblikksbilder (20 nyeste) |
| Datamappe: `patentdesk-data.json` | Arbeidsfil — speiler dataene etter hver endring, leses ved oppstart (Chrome/Edge) |
| Datamappe: `backup/patentdesk-backup-ÅÅÅÅ-MM-DD.json` | Én fast kopi per dag (30 nyeste) |

**Viktig:** Hvis du sletter nettstedsdata i nettleseren, slettes alt som bare
ligger der. Velg en datamappe under Innstillinger → Sikkerhetskopiering
(Chrome/Edge): da skrives dataene også til en arbeidsfil du kontrollerer, og
PatentDesk henter dem inn igjen automatisk hvis nettleseren er tømt. Uten
datamappe bør du eksportere et JSON-øyeblikksbilde jevnlig. CPC-databasen er
ikke inkludert — last inn `cpc_v2.json` på nytt etter å ha gjenopprettet på en
ny maskin.

## Arbeidsflyt

Saker beveger seg gjennom: `Ny → Fristarkiv ↔ Viderebehandling → Avsluttet`,
pluss et eget `Oppdrag`-spor. Krav vurderes per-krav for nyhet og
oppfinnelseshøyde; et krav uten nyhet kan aldri ha oppfinnelseshøyde, og
vurderingene kaskaderer fra uavhengige krav til deres avhengige.

## Utvikling

Enkeltfildesignet er intensjonalt: ikke del opp filen eller legg til
kjøringstidsavhengigheter. Se [`CLAUDE.md`](CLAUDE.md) for konvensjoner og
[`CHANGELOG.md`](CHANGELOG.md) for versjonshistorikk.

```bash
npm ci        # kun utviklingsverktøy (ESLint)
npm run lint  # linter både innebygd JS og HTML-struktur
```

---

# PatentDesk (English)

Offline patent case management tool for patent examiners. Single-file
HTML/CSS/JS — no build step, no dependencies, no server.

## Getting started

1. [📥 Download PatentDesk.html](https://raw.githubusercontent.com/SpaceSphereWheatley/patentdesk/main/PatentDesk.html)
2. Open it in a browser (Chrome or Edge recommended — the data folder
   requires the File System Access API)
3. That's it. Everything runs locally; nothing leaves your machine.

Optional: load `cpc_v2.json` (CPC classification database, 253 000+
symbols) via the in-app banner or Settings to enable classification
autocomplete. It is stored in the browser's IndexedDB.

### Shortcut with its own icon (Windows)

Put `PatentDesk.ico` and `Lag-PatentDesk-snarvei.ps1` in the same folder as
`PatentDesk.html`, open PowerShell in that folder and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\Lag-PatentDesk-snarvei.ps1
```

This creates a Desktop and Start-menu shortcut that opens PatentDesk in its
own Edge window with the PatentDesk icon. No admin rights required.

## How data is stored

All data lives in the browser, scoped to the file's origin:

| Store | Contents |
|---|---|
| `localStorage` (`pt_cases`) | Case list — statuses, deadlines, tags |
| `localStorage` (`pt_sak_<id>`) | Per-case details — claims, CPC classes, checklist |
| `localStorage` (misc `pt_*` keys) | Settings: goals, vacations, document root, etc. |
| IndexedDB `PatentDeskCPC` | CPC classification database (optional) |
| IndexedDB `patentdesk_backups` | Automatic snapshots (20 most recent) |
| Data folder: `patentdesk-data.json` | Work file — mirrors the data after every change, read at startup (Chrome/Edge) |
| Data folder: `backup/patentdesk-backup-YYYY-MM-DD.json` | One fixed copy per day (30 most recent) |

**Important:** clearing browser site data deletes everything that only
lives there. Choose a data folder under Settings → Backup (Chrome/Edge):
the data is then also written to a work file you control, and PatentDesk
loads it back automatically if the browser has been wiped. Without a data
folder, export a JSON snapshot regularly. The CPC database is not
included — re-load `cpc_v2.json` after restoring on a new machine.

## Workflow

Cases move through: `Ny → Fristarkiv ↔ Viderebehandling → Avsluttet`,
plus a separate `Oppdrag` track. Claims are assessed per-claim for
novelty (nyhet) and inventive step (oppfinnelseshøyde); a claim without
novelty can never have inventive step, and assessments cascade from
independent claims to their dependents.

## Development

The single-file design is intentional: do not split the file or add
runtime dependencies. See [`CLAUDE.md`](CLAUDE.md) for conventions and
[`CHANGELOG.md`](CHANGELOG.md) for version history.

```bash
npm ci        # dev tooling only (ESLint)
npm run lint  # lints both the embedded JS and the HTML structure
```
