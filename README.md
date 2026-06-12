# PatentDesk

Offlinebasert saksbehandlingsverktøy for patentgranskere. Enkeltfil med
HTML/CSS/JS — ingen byggprosess, ingen avhengigheter, ingen server.

## Kom i gang

1. Last ned [`PatentDesk.html`](PatentDesk.html)
2. Åpne filen i en nettleser (Chrome eller Edge anbefales — mappesikkerhetskopi
   krever File System Access API)
3. Det er alt. Alt kjører lokalt; ingenting forlater maskinen din.

Valgfritt: last inn `cpc_v2.json` (CPC-klassifikasjonsdatabase med 253 000+
symboler) via banneret i appen eller via Innstillinger for å aktivere
autofullføring av klassifikasjon. Den lagres i nettleserens IndexedDB.

## Hvordan data lagres

All data lever i nettleseren, begrenset til filens opprinnelse:

| Lager | Innhold |
|---|---|
| `localStorage` (`pt_cases`) | Sakliste — statuser, frister, etiketter |
| `localStorage` (`pt_sak_<id>`) | Per-sak-detaljer — krav, CPC-klasser, sjekkliste |
| `localStorage` (diverse `pt_*` nøkler) | Innstillinger: mål, ferieavsnitt, dokumentrot, osv. |
| IndexedDB `PatentDeskCPC` | CPC-klassifikasjonsdatabase (valgfritt) |
| IndexedDB `patentdesk_backups` | Automatiske øyeblikksbilder (20 nyeste) |

**Viktig:** Hvis du sletter nettstedsdata i nettleseren, slettes alt. Bruk
Innstillinger → Sikkerhetskopi for å eksportere et JSON-øyeblikksbilde jevnlig,
eller aktiver den automatiske mappesikkerhetsopien (Chrome/Edge) som skriver
én datert fil per dag til en mappe du velger. CPC-databasen er ikke inkludert
i sikkerhetskopier — last inn `cpc_v2.json` på nytt etter å ha gjenopprettet
på en ny maskin.

## Arbeidsflyt

Saker beveger seg gjennom: `Ny → Fristarkiv ↔ Viderebehandling → Avsluttet`,
pluss et eget `Oppdrag`-spor. Krav vurderes per-krav for nyhet og
oppfinnelseshøyde; et krav uten nyhet kan aldri ha oppfinnelseshøyde, og
vurderingene kaskaderer fra uavhengige krav til deres avhengige.

## Utvikling

Enkeltfildesignet er intensjonalt: ikke del opp filen eller legg til
kjøringstidsavhengigheter. Se [`CLAUDE.md`](CLAUDE.md) for konvensjoner og
[`CHANGELOG.txt`](CHANGELOG.txt) for versjonshistorikk.

```bash
npm ci        # kun utviklingsverktøy (ESLint)
npm run lint  # linter både innebygd JS og HTML-struktur
```

---

# PatentDesk (English)

Offline patent case management tool for patent examiners. Single-file
HTML/CSS/JS — no build step, no dependencies, no server.

## Getting started

1. Download [`PatentDesk.html`](PatentDesk.html)
2. Open it in a browser (Chrome or Edge recommended — folder backup
   requires the File System Access API)
3. That's it. Everything runs locally; nothing leaves your machine.

Optional: load `cpc_v2.json` (CPC classification database, 253 000+
symbols) via the in-app banner or Settings to enable classification
autocomplete. It is stored in the browser's IndexedDB.

## How data is stored

All data lives in the browser, scoped to the file's origin:

| Store | Contents |
|---|---|
| `localStorage` (`pt_cases`) | Case list — statuses, deadlines, tags |
| `localStorage` (`pt_sak_<id>`) | Per-case details — claims, CPC classes, checklist |
| `localStorage` (misc `pt_*` keys) | Settings: goals, vacations, document root, etc. |
| IndexedDB `PatentDeskCPC` | CPC classification database (optional) |
| IndexedDB `patentdesk_backups` | Automatic snapshots (20 most recent) |

**Important:** clearing browser site data deletes everything. Use
Settings → Backup to export a JSON snapshot regularly, or enable the
automatic folder backup (Chrome/Edge) which writes one dated file per
day to a folder you choose. The CPC database is not included in
backups — re-load `cpc_v2.json` after restoring on a new machine.

## Workflow

Cases move through: `Ny → Fristarkiv ↔ Viderebehandling → Avsluttet`,
plus a separate `Oppdrag` track. Claims are assessed per-claim for
novelty (nyhet) and inventive step (oppfinnelseshøyde); a claim without
novelty can never have inventive step, and assessments cascade from
independent claims to their dependents.

## Development

The single-file design is intentional: do not split the file or add
runtime dependencies. See [`CLAUDE.md`](CLAUDE.md) for conventions and
[`CHANGELOG.txt`](CHANGELOG.txt) for version history.

```bash
npm ci        # dev tooling only (ESLint)
npm run lint  # lints both the embedded JS and the HTML structure
```
