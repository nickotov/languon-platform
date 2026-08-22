# Web Dev Panel Custom Sections

Status: Complete
Owner: Engineering
Created: 2026-08-22

## Problem

The reviewed command catalog is easier to scan by category, but developers still
need to repeatedly find the same commands and reconstruct common local working
sets. Command cards also expose their full source, actions, metadata, and log at
all times, which makes section contents dense. There is no safe portable format
for sharing a quick-access layout with another developer.

## Desired behavior

Every command representation starts as a compact disclosure showing title,
description, and current status. A developer can create named quick-access
sections, place the same reviewed command ID in any number of them, remove a
section, start or stop that section as one deliberate action, and still see one
server-authoritative run and log wherever the command appears. Quick-access
configuration is a bounded, versioned JSON presentation preference stored in
localStorage. It can be copied and atomically imported by a colleague; invalid
or unreproducible configuration produces a visible alert and does not replace
the current layout or execute anything.

## Acceptance criteria

- [x] AC-1 — Every catalog and quick-access command card is collapsed on first
      load. Its summary always exposes title, description, and text status;
      expanding exposes source, unavailable reason, controls, agent metadata,
      and latest log. Server snapshots preserve tab-local disclosure state.
- [x] AC-2 — A developer can create a nonblank, uniquely named custom section,
      add or remove each reviewed command in any number of sections, and delete
      a section without affecting catalog entries, other memberships, or a
      running process. Membership is unique within one section.
- [x] AC-3 — Custom sections render before and visually separate from catalog
      categories in both main content and sidebar. Sidebar links open and scroll
      to their matching section. Section and card disclosures remain tab-local.
- [x] AC-4 — A named, versioned, closed JSON document persists custom-section IDs,
      names, insertion order, and command IDs in localStorage only. It never
      stores executable text, argv, revisions, runs, logs, credentials, or
      checkbox selection, and restores after page and panel-server restart.
- [x] AC-5 — Export presents the exact current JSON and supports copy. Import
      replaces the layout only after strict bounded schema validation and a full
      reproducibility check. Malformed/unsupported JSON, duplicate sections or
      memberships, and command IDs absent from the current catalog produce an
      in-viewport alert, retain the current layout, and start no command.
      Existing-but-disabled commands reproduce with their normal explanation.
- [x] AC-6 — Same-origin tabs synchronize valid custom-section changes through
      browser storage events. Process lifecycle and logs remain exclusively
      server/SSE-authoritative; separate profiles or colleagues reproduce a
      layout only through explicit JSON import.
- [x] AC-7 — Start all submits every member as one existing atomic start batch
      using current source revisions. A missing, disabled, active, stale,
      non-batch-eligible, or conflicting member prevents partial startup and
      shows the full reason.
      Empty sections cannot start.
- [x] AC-8 — Stop all asks for confirmation and atomically validates the current
      run IDs of every active section member before requesting their stops. It
      never stops nonmembers; stale/unresolvable selections fail visibly rather
      than partially stopping a newer run. Empty/inactive sections cannot stop.
- [x] AC-9 — Native Node/HTML/CSS/JavaScript implementation, design sources,
      accepted architecture record, panel README, `$web-dev-panel` skill,
      user-flow guide, unit/integration/Playwright coverage, real-browser
      evidence, independent review, and security review agree with the delivered
      behavior.

## Scope

### In scope

- Dependency-free browser modules for a versioned custom-section model,
  localStorage adapter, strict JSON import/export, storage-event synchronization,
  and text-only rendering.
- Collapsible command cards and duplicate command representations that resolve
  one catalog/run snapshot by stable command ID.
- Custom-section create/delete/membership controls and Start all/Stop all.
- A fixed, closed server endpoint for atomic section-member stops using stable
  command and run IDs; existing checked batch-start behavior remains unchanged.
- Design, ADR, docs, skill, user-flow, regression tests, browser verification,
  and independent review.

### Out of scope

- Defining or editing commands, argv, working directories, catalog safety, or
  permissions from the browser or imported JSON.
- Server/cloud/team persistence, share links, automatic cross-profile/device
  synchronization, persisted run history/logs, or monitoring external processes.
- Renaming/reordering custom sections or commands, drag-and-drop, category
  editing, or arbitrary command search/filter capability.
- Product web/admin/mobile runtime changes, dependencies, database/cache schema,
  or production deployment behavior.

## Constraints and risks

- ADR-0013 remains authoritative for reviewed command IDs, source drift,
  server-owned process/log state, session/origin controls, bounded text-only logs,
  and the no-shell execution boundary. Custom JSON is presentation data only.
- Imported JSON is untrusted. Validation must use a closed versioned shape,
  bounded byte/count/string limits, exact current command IDs, unique section
  identities/names/memberships, and all-or-nothing replacement.
- A command duplicated across sections must never become a second process or log
  owner. Every control resolves the latest server snapshot and current run ID.
- Browser storage may be disabled, corrupted, or quota-limited. The catalog must
  remain usable and a persistent in-page alert must explain the preference error.
- Existing disabled command IDs may be saved/imported for discovery, but make a
  section Start all invalid rather than silently causing a partial environment.

## User-flow documentation

- Guide: update `docs/user-flows/web-dev-panel.md`; this is the existing browser,
  CLI, and system journey rather than a separate panel.
- Related guides: none.
- E2E synchronization: update
  `web-dev-panel/test/e2e/panel.spec.mjs` with stable scenario
  `portable-custom-command-sections`, and expand existing lifecycle coverage for
  collapsed card summaries and section bulk control. Keep the guide revision
  marker current and execute registered command `web-dev-panel-playwright`.

## Open decisions

- None. Safe minimal assumptions are all-or-nothing import replacement,
  case-insensitive unique names, stable insertion order without reordering, and
  atomic Start all/Stop all rather than partial command subsets.
