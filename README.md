# PatentDesk

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
