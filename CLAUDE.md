# PatentDesk — Claude Instructions

## Project overview

PatentDesk is a self-contained, offline patent case management application.
It is a **single HTML file** with all CSS and JavaScript embedded — no build
step, no dependencies, no server. The file is opened directly in a browser.
All data is stored locally via **localStorage** (case list, settings) and
**IndexedDB** (CPC classification database).

Version: always grep `APP_VERSION` from the file to confirm; never rely on
memory or prior context.

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
- Version string: `APP_VERSION` (SemVer, e.g. `v4.4.4`)
- Schema version: `SCHEMA_VERSION` (integer, currently `4`)
- Versioning follows **Semantic Versioning**: bump patch for fixes, minor for
  meaningful features, major for breaking changes. Do not bump mid-session —
  only at the end of a batch of related changes.

### Changelog
`CHANGELOG.md` follows the **Keep a Changelog 1.1.0** conventions
(https://keepachangelog.com/en/1.1.0/):
- Newest version first; there is an entry for every released version.
- Each entry is headed by the version and, when known, its release date in ISO
  form, e.g. `## [4.14.0] - 2026-06-22`. Historical entries with unknown dates
  omit the date.
- Group changes under the standard headings, omitting any that are empty:
  **Added, Changed, Deprecated, Removed, Fixed, Security**.
- Keep an `## [Unreleased]` section at the top for work that has landed but
  not yet been released.
- Entries are written for humans — describe the change and its effect, not the
  raw diff or commit log.

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
- One `CHANGELOG.md` entry per version bump.
- Do not introduce new external libraries or CDN links.
- The file is 8 000+ lines; this is acceptable given the offline constraint.

### Download link after each push
After committing and pushing a change to `PatentDesk.html`, always include a
direct GitHub link to the file on the working branch:

```
https://github.com/SpaceSphereWheatley/patentdesk/blob/<branch-name>/PatentDesk.html
```

Provide this link as part of the summary for that change — don't wait to be
asked.

---

## Files

| File | Purpose |
|---|---|
| `PatentDesk.html` | The entire application |
| `CHANGELOG.md` | Version history (Keep a Changelog 1.1.0 format) |
| `CLAUDE.md` | These instructions |
| `cpc_v2.json` | CPC classification data (external, loaded into IndexedDB) |
