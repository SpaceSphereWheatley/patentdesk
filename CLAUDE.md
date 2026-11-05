# PatentDesk — Claude Instructions

## Project overview

PatentDesk is a self-contained, offline patent case management application.
It ships as a **single HTML file** with all CSS and JavaScript embedded — no
dependencies, no server. The file is opened directly in a browser. The source
lives in `src/` and is joined into `PatentDesk.html` by `npm run build`.
All data is stored locally via **localStorage** (case list, settings) and
**IndexedDB** (CPC classification database).

Version: always grep `APP_VERSION` (in `src/js/01-config-templates.js`) to
confirm; never rely on memory or prior context.

---

## Architecture

### Single-file constraint
The delivered app is **one HTML file — intentional and non-negotiable**. No
imports, modules, external dependencies or CDN links; the owner downloads
`PatentDesk.html` from GitHub and opens it, and never runs a build.

### Source layout and build
- **Edit `src/`, never `PatentDesk.html`.** `PatentDesk.html` is generated
  but committed, so it stays downloadable.
- `src/index.html` — the page markup. Each line
  `<!-- @include css/xx.css -->` is replaced by that file, byte for byte.
- `src/css/`, `src/js/` — CSS and JS split by area, numbered in build order.
  All JS still runs as one `<script>` with shared globals, so a file split
  changes nothing at runtime. `src/vendor/` — embedded Chart.js; don't edit.
- `npm run build` writes `PatentDesk.html`. Run it after every change to
  `src/` and commit both. `npm test` fails if they're out of sync.
- A new source file must be added as an include line in `src/index.html`
  (the build refuses unincluded files).

### Data stores
- `cases[]` in localStorage — case list, used for filtering, stats, and the
  sidebar. Keyed `pt_cases`.
- `pt_sak_{id}` in localStorage — full per-case detail data, including
  `rounds[]` (frozen per-office-action snapshots of claim assessment and
  citations, plus claim mappings and objections).
- IndexedDB — CPC classification database (`cpc_v2.json`, 253 K+ symbols).
  Only `{code, inUse}` is persisted per case; descriptions are looked up live
  from `_cpcDb` and never stored.

These two stores have distinct responsibilities. Do not conflate them.

### CSS conventions
- Component-scoped prefixes: `kt-` for the claims tree, etc.
- No utility frameworks. All styles are hand-written in the `<style>` block.

### Versioning
- Version string: `APP_VERSION` (SemVer, e.g. `v4.4.4`)
- Schema version: `SCHEMA_VERSION` (integer, currently `8`)
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

## Response style

- Answer first, then only the detail needed to act on it.
- Short bullets over paragraphs. No restating the question, no recap of what
  the owner said, no closing summary of what was just shown.
- End-of-task summaries: 5 lines or fewer, plus the download link (below).
- Explain alternatives, reasoning or background only when asked, or when the
  owner must make a decision.
- Disagree plainly when something looks wrong; don't pad with praise.

---

## Workflow

The main session does the work. The **owner** (the user) has the final say;
⏸ marks a real stop where you wait for the owner's answer. Pick a tier and
state it; the owner can override.

- **Fix** — a bug or small logic change, no UI or stored-data change.
  Write a failing test → fix in `src/` → `npm run build` → `npm test` +
  `npm run lint`. No agents.
- **Feature** — new or changed behaviour, possibly UI.
  1. Write a short spec: problem, scope (in/out), numbered testable
     acceptance criteria (cover each workflow state, Oppdrag, overdue,
     weekends/holidays/vacation, empty data), UI impact, open questions.
     Push back if the request conflicts with a domain rule or an earlier
     decision in `CHANGELOG.md`, bundles separate features, or could be
     solved smaller. ⏸ owner approves.
  2. If UI changes: a mockup (small standalone HTML in the scratchpad using
     the app's colours and CSS prefixes, or an ASCII sketch for small
     changes). ⏸ owner approves.
  3. Tests from the acceptance criteria first, then the code.
  4. `reviewer` agent (see below). ⏸ owner approves.
- **Structural** — new stored data, `SCHEMA_VERSION` bump, import/export
  format, or a change across many functions. As Feature, with a design
  section in the spec: stored data shape, migration (old data must load
  without loss), functions to add/change, risks. The reviewer runs on
  **opus**.

### Reviewer agent
`.claude/agents/reviewer.md` is the only agent. It gives an independent
review of Feature and Structural changes (correctness, tests, security, UX in
one pass).
- Give it the approved spec and the branch — never your own reasoning or a
  summary of the implementation.
- It runs on sonnet by default. Pass `model: opus` for Structural changes and
  for changes that touch rendering of user/pasted/imported text
  (`innerHTML`, attributes), import/export/paste parsing, localStorage or
  IndexedDB writes or migrations, or anything adding network access or
  dynamic code.
- On CHANGES REQUIRED: fix, then re-review. After two rounds without PASS,
  stop and bring it to the owner. If you disagree with a finding, give the
  owner both positions.
- Never weaken, skip or delete a test to get green.

### Release
Once per batch of related changes, after the owner approves: choose the
SemVer bump, update `APP_VERSION`, and move `[Unreleased]` items into a
dated `CHANGELOG.md` entry. If stored data changed, confirm `SCHEMA_VERSION`
was bumped and this file states the current value.

---

## Working conventions

### Finding your way in the file
Never read `PatentDesk.html` broadly (~1.2 MB); work in `src/`. Run
`npm run codemap -- <word>` to list matching functions with their source
file and line number (no argument prints the full map), then read only those
ranges. Test errors and lint report lines in the built `PatentDesk.html`;
find the function there and look it up in the map.

### Change discipline
- List planned changes before implementing.
- One `CHANGELOG.md` entry per version bump.
- Do not introduce new external libraries or CDN links.
- Escape user-provided text rendered via `innerHTML` with `esc`.
- Hand-written CSS with component prefixes; logic in small pure functions.

### Test first
Every new change — bug fix, new logic, refactor of a pure function — must
come with a test before the implementation. Add or update a test in
`test/*.test.js` using the `loadFunctions` harness
(`test/extractFunctions.js`) that exercises the new/changed behavior; stub
dates and `isNonWorkday` so tests don't drift with the calendar. Run
`npm test` before considering the change done. UI-only/render code with no
extractable pure logic is exempt, but extract pure logic into its own
function where possible so it can be tested this way.

### Download link after each push
After committing and pushing a change to the app (`src/`), always include a
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
| `PatentDesk.html` | The entire application — built from `src/`, committed, never edited by hand |
| `src/` | Source: `index.html` (markup + include lines), `css/`, `js/`, `vendor/` |
| `scripts/build.js` | Joins `src/` into `PatentDesk.html` (`npm run build`) |
| `CHANGELOG.md` | Version history (Keep a Changelog 1.1.0 format) |
| `CLAUDE.md` | These instructions |
| `.claude/agents/reviewer.md` | Independent reviewer agent (see Workflow) |
| `scripts/codemap.js` | Function/section map of `src/` (`npm run codemap`) |
| `test/*.test.js` | Unit tests (`npm test`) |
| `test/e2e/*.e2e.js` | Browser layout tests, not in `npm test`; run `node --test test/e2e/*.e2e.js` (skipped if Playwright is missing) |
| `cpc_v2.json` | CPC classification data (external, loaded into IndexedDB) |
