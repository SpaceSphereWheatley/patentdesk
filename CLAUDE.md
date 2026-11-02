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
- Schema version: `SCHEMA_VERSION` (integer, currently `7`)
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
- **Whose deadline is it.** The meaning of `dueDate` depends on the status, and
  this drives most workload logic:
  - `Ny` — the examiner's own deadline to examine the application. Real work,
    modelled as a working window of 10 **workdays** (`WORK_WINDOW_DEFAULTS`,
    user-adjustable) ending on the due date. Weekends, public holidays and
    vacation do not count, so the window stretches back past them
    (`workWindowStart`) — work due right after a vacation lands before it.
    The window represents time remaining, so it shrinks as the deadline
    approaches; once a case is overdue it costs a flat
    `OVERDUE_PENALTY_WORKDAYS` in belegg instead, so missing a deadline can
    never make the occupancy figure look better.
  - `Fristarkiv` — the office action has **already been sent out**. The due date
    is the **applicant's** deadline to answer, not the examiner's. It costs the
    examiner no work: no work window, no occupancy (belegg), no vacation
    conflict, and no due-date buffer. Treat a Fristarkiv date as a milestone
    marking when the case may come back, not as a block of work.
  - `Viderebehandling` — the applicant has answered and the examiner must
    process the response. Real work again. Its deadline is softer, so it can
    be **postponed** past the due date (a negative buffer, `canPostpone`).
    The deadline does not move: the case is overdue from the real `dueDate`
    (`deadlineFor`). The bar and the belegg follow the plan (`effDueFor`)
    like any other case, so postponing costs nothing extra; the overdue
    penalty applies only once the planned date has passed.
  - `Avsluttet` — done; excluded from all workload logic.
- Oppdrag are separate from this: they carry an explicit `duration` (in
  workdays) and always use their actual `dueDate` (never buffered).
- Claims (krav): independent (selvstendige) and dependent (uselvstendige)
- Novelty (nyhet) and inventive step (oppfinnelseshøyde) are per-claim
  properties. A claim without novelty is automatically locked to no inventive
  step — this is a hard domain rule encoded in the logic.
- Cascade: novelty/inventive step on an independent claim propagates to its
  dependents, but each dependent's value can be overridden manually.

---

## Agent team workflow

Development is done by a team of subagents defined in `.claude/agents/`. The
main session is the **orchestrator**: it routes work between agents, passes
each one only the inputs listed below, and brings decisions to the owner. The
**owner** (the user) is project manager and has the final say.

| Agent | Role | Writes | Model |
|---|---|---|---|
| `spec` | Intent → requirements + acceptance criteria; pushes back on scope | nothing (reports) | opus |
| `architect` | Structural decisions before code: data, migrations, function boundaries | nothing (reports) | opus |
| `qa` | Writes tests from the spec **before** building; reviews the diff after | `test/` only | opus |
| `builder` | Implements until QA's tests pass | `PatentDesk.html` | opus |
| `ux-critic` | Mockups before UI changes; reviews built screens | scratchpad mockups | sonnet |
| `security` | Reviews XSS, imports/exports, storage, confidential data | nothing (reports) | opus |
| `docs` | Version bump, CHANGELOG, README/CLAUDE.md sync at release | docs + `APP_VERSION` | sonnet |

### Tiers
The orchestrator picks a tier (spec confirms it for Feature/Structural); the
owner can override.

- **Fix** — a bug or small logic change, no UI or stored-data change.
  `qa` (test reproducing the bug) → `builder` → `qa` (review).
- **Feature** — new or changed behaviour, possibly UI.
  `spec` → ⏸ owner approves spec → `ux-critic` mockup (if UI) → ⏸ owner
  approves mockup → `qa` (tests) → `builder` → `qa` review + `ux-critic`
  review (if UI) + `security` (if triggered) → ⏸ owner approves.
- **Structural** — new stored data, `SCHEMA_VERSION` bump, import/export
  format, or a change across many functions.
  As Feature, with `architect` after the spec is approved (⏸ owner approves
  the design), and `security` always reviews.

`docs` runs once per release, after the owner approves, not per change.

### Security triggers
Call `security` whenever a change touches: rendering of user-entered,
pasted or imported text (`innerHTML`, attributes); import, export or paste
parsing; localStorage/IndexedDB writes or migrations; or anything that adds
network access or dynamic code.

### Rules for the orchestrator
- **Independence.** `qa`, `ux-critic` and `security` get the spec, the
  acceptance criteria and the diff — never the builder's reasoning or
  summary. The builder never edits tests; if a test looks wrong, it goes
  back to `qa` and the owner.
- **Loop limit.** If `qa` returns CHANGES REQUIRED, send the findings to
  `builder` and re-review. After two rounds without PASS, stop and bring it
  to the owner.
- **Disagreements** between agents (e.g. spec vs. UX, QA vs. builder) go to
  the owner with both positions, not resolved silently.
- **Owner gates** (⏸) are real stops: wait for the owner's answer.
- Keep handoffs short: each agent gets the minimum context it needs.

## Working conventions

### Before any UI change
Always present a **visual mockup** (produced by `ux-critic`) and wait for
approval before editing the file. For logic-only changes with no visual
component, skip the mockup and proceed directly.

### When the file is uploaded
Treat the uploaded file as ground truth. Previously delivered changes may not
be present in a re-uploaded file — re-apply as needed. Always grep
`APP_VERSION` before starting work.

### Change discipline
- List planned changes before implementing.
- One `CHANGELOG.md` entry per version bump.
- Do not introduce new external libraries or CDN links.
- The file is 8 000+ lines; this is acceptable given the offline constraint.

### Test first
Every new change — bug fix, new logic, refactor of a pure function — must
come with a test before the implementation. The `qa` agent writes these
tests from the spec; the builder does not. Add or update a
test in `test/*.test.js` using the `loadFunctions` harness
(`test/extractFunctions.js`) that exercises the new/changed behavior, and run
`npm test` before considering the change done. UI-only/render code with no
extractable pure logic is exempt, but extract pure logic into its own
function where possible so it can be tested this way.

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
| `.claude/agents/*.md` | Agent team definitions (see Agent team workflow) |
| `cpc_v2.json` | CPC classification data (external, loaded into IndexedDB) |
