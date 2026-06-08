# PatentDesk — Claude Instructions

## Project overview

PatentDesk is a self-contained, offline patent case management application.
It is a **single HTML file** with all CSS and JavaScript embedded — no build
step, no dependencies, no server. The file is opened directly in a browser.
All data is stored locally via **localStorage** (case list, settings) and
**IndexedDB** (CPC classification database).

Current version: `v4.4.4` — always grep `APP_VERSION` from the file to
confirm; never rely on memory or prior context.

---

## Architecture

### Single-file constraint
The single-file design is **intentional and non-negotiable**. Do not split
the file, introduce imports, or add any external dependencies.

### Data stores
- `cases[]` in localStorage — case list, used for filtering, stats, and the
  sidebar. Keyed `pt_cases`.
- `pt_sak_{id}` in localStorage — full per-case detail data.
- IndexedDB — CPC classification database (`cpc_v2.json`, 253 K+ symbols).
  Only `{code, inUse}` is persisted per case; descriptions are looked up live
  from `_cpcDb` and never stored.

These two stores have distinct responsibilities. Do not conflate them.

### CSS conventions
- Component-scoped prefixes: `kt-` for the claims tree, etc.
- No utility frameworks. All styles are hand-written in the `<style>` block.

### Versioning
- Version string: `APP_VERSION` (semver, e.g. `v4.4.4`)
- Schema version: `SCHEMA_VERSION` (integer, currently `4`)
- Changelog: `CHANGELOG.txt` (plain text, newest first, not Markdown)
- Bump patch for fixes, minor for meaningful features. Do not bump
  mid-session — only at the end of a batch of related changes.

---

## Domain rules

- Workflow states: `Ny → Fristarkiv ↔ Viderebehandling → Avsluttet`
- Claims (krav): independent (selvstendige) and dependent (uselvstendige)
- Novelty (nyhet) and inventive step (oppfinnelseshøyde) are per-claim
  properties. A claim without novelty is automatically locked to no inventive
  step — this is a hard domain rule encoded in the logic.
- Cascade: novelty/inventive step on an independent claim propagates to its
  dependents, but each dependent's value can be overridden manually.

---

## Working conventions

### Before any UI change
Always present a **visual mockup** and wait for approval before reading or
editing the file. For logic-only changes with no visual component, skip the
mockup and proceed directly.

### When the file is uploaded
Treat the uploaded file as ground truth. Previously delivered changes may not
be present in a re-uploaded file — re-apply as needed. Always grep
`APP_VERSION` before starting work.

### Change discipline
- List planned changes before implementing.
- One `CHANGELOG.txt` entry per version bump.
- Do not introduce new external libraries or CDN links.
- The file is 8 000+ lines; this is acceptable given the offline constraint.

### Download link after each push
After committing and pushing a change to `PatentDesk.html`, always include a
direct, version-pinned download link for the changed file using the commit
SHA:

```
https://raw.githubusercontent.com/SpaceSphereWheatley/patentdesk/<commit-sha>/PatentDesk.html
```

Provide this link as part of the summary for that change — don't wait to be
asked.

---

## Files

| File | Purpose |
|---|---|
| `PatentDesk.html` | The entire application |
| `CHANGELOG.txt` | Version history (plain text) |
| `CLAUDE.md` | These instructions |
| `cpc_v2.json` | CPC classification data (external, loaded into IndexedDB) |
