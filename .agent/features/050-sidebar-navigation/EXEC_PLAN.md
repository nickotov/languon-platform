# ExecPlan: Sidebar navigation

Updated: 2026-10-20

## Goal and specification

Deliver [FEATURE.md](FEATURE.md) AC-01–09 from base5efaafe. Current source artifact retained under designs/sidebar/v001. User authorized complete plan including independent texts and synced navigation.

## Existing architecture

Web app-shell widget; dictionaries-only navigation feature; Texts folder-dependent domain/contracts/jobs/fullscreen native dialog. Backend DDD, web FSD/CSS Modules/tokens; ADR0005/0016/0029/0030/0035/0042 apply. Root owns shell frontend, integration, migration generation, ADR/handoff and final evidence. Workers have bounded exclusive surfaces.

## Test strategy

Affected web/backend/contracts unit+contract/static/build; disposable PostgreSQL migration fresh/upgrade and repository/concurrency; deterministic existing Texts E2E+new navigation journey; source-grounded real-browser comparison. Independent completion/security review required. Separate tester for new move/job/share concurrency and cross-app journey scope. No paid AI calls.

## User-flow documentation

Update texts, global-app-shell and affected shell/profile guides, add sidebar-navigation guide. Preserve markers. Inspect mapped scenarios with pnpm user-flow:e2e -- inspect. Use existing safe disposable Texts web harness; all guides must pass mapping and exact affected journeys.

## Milestones

- [x] M1 AC05–06: nullable text membership/moves/jobs/backend contracts and focused verification.
- [x] M2 AC02–03: navigation metadata/search APIs and isolation tests.
- [x] M3 AC01–04,07–08: source sidebar + flexible Texts UI/editor.
- [x] M4 AC09: migrations/static/build/integration/browser/user-flows.
- [x] M5 AC09: independent reviews/remediation/final local squash integration.

## Progress

2026-10-20: implementation and five user-reported corrections are complete. Final web suite874 tests, backend unit sweep972 tests, contracts126 tests, real database checks, lint/types/builds and the affected browser journeys pass. Independent security review passed; completion review is reconciling the last browser proof and source-render limitation.

## Decisions

D1: contextual-sidebar default only; source alternative docked browser excluded.
D2: optional folder membership is user-authorized; no artificial default folder.
D3: recency is successful opened resource, synced account metadata; device geometry preferences local.
D4: real existing knowledge draft creation and full dictionary dialog replace mock create.
D5: canonical text URL independent of membership, legacy links redirect after auth at destination.
D6: share inheritance requires explicit confirmation and commit-time revalidation. Direct shares preserved by move.
D7: own-domain narrow resource read ports compose navigation; no frontend unbounded library loading.

## Discoveries

Need nullable-folder semantics through worker admission/publication/selection/copies and existing text resolver. Migration generation centralized after both backend schemas stabilize.

## Validation

[EVIDENCE.md](EVIDENCE.md) owns final commands, source fingerprints and runtime proof. [REVIEW.md](REVIEW.md) owns independent review findings and verdicts.

## Remaining work

Current outcome, 2026-10-21: restoration implementation, source identity, combined browser/DB checks and independent expanded review pass with no findings (E11/REVIEW.md). Hosted reference is now accessible and captured, resolving historical GAP-01; final reference provenance is retained under evidence/reference-restoration. No product work remains. Complete local squash integration of the verified tree; preserve original branches/stash and backups, no push/deploy/deletion. Historical pending notes below describe the earlier checkpoint, superseded by this verified outcome.

2026-10-21 — User clarified that excluding this sidebar from portrait delivery was an error: preserve the previously implemented sidebar, and exclude only the sidebar from the portrait prototype. Restore saved e5c4c24 implementation on feature/sidebar-portrait-restoration from main a574884. Resolve additive conflicts; retain canonical portrait0000–0079 history; generate sidebar schema as forward0080. Verify both features, restore saved navigation metadata, and independently review integration. Original sidebar branch/stash and original database remain intact. No sidebar redesign. Prior source/fidelity proof remains historical; combined runtime evidence is required.

Independent correctness and security reviews passed with no product defects. All runtime checks including editor+tutor auto-collapse/explicit expansion pass. Actual hosted-reference visual comparison remains unavailable because GUI browser capture requires macOS Accessibility permission. Keep the feature in progress and do not claim complete rendered-reference fidelity or squash integration while required proof remains missing.

2026-10-20: M1–M3 implemented. DB/unit-focused checks passing; finalbrowser renewal and independentreviews next. Root found and fixed accountpurge tombstone metadata cleanup and minimum role privileges. A real reference render remains inaccessible (MCPsource available, GUIAccessibility blocked), recorded EVIDENCE; do not claim renderedfidelitycomplete.

2026-10-20 user correction: section shortcuts show five resources. Preserve pin/current behavior and genuine opened order, then fill from existing owned active resources by domain updated time (knowledge uses latest note/preferred-branch update). Preserve null lastOpenedAt and do not write metadata for fallback reads. Global palette recents remain genuine successful opens. No contract/schema migration.

## User-reported remediation — 2026-10-20 20:50

User supplied a runtime screenshot and requested five corrections: populate each kind with five recent items even for existing libraries without navigation metadata; center the collapsed logo; restore source-style Home/Create rail tooltips; equalize Texts header button heights; improve Texts section headers and spacing. These refine the authorized feature. Global palette recents continue to mean actual opens. Per-kind fallback uses current owned active domain activity timestamps, never fabricated lastOpened metadata. Texts composition uses existing Button primitives (44px primary New text, secondary New folder), accessible native details with consistent 44px disclosure bars, and one content gap.

Verification: focused Texts3 suites11tests and shell6 suites41tests pass; fullweb124 files874tests passes. Browser userfix10 passes3/3 with strict unexpected HTTP/console/request checks, logo geometry and real tooltips, five-item population without metadata fabrication, equal44px header actions and native section keyboard controls. Source snapshots remain frozen; Texts section redesign is explicitly user requested. See EVIDENCE E08.

Final hygiene: generated next-env restored to tracked baseline; post-cleanup web typecheck passed. Four task-owned PostgreSQL/Redis containers stopped, shared development infrastructure untouched. Hosted-reference GAP-01 remains the sole open proof item.

## Texts page presentation correction — after commit888d15d

User requests consistent header button heights again, a redesigned section layout,
and archived empty-state spacing. Classified as a bounded correction of one
existing screen; preserve Active/Archived and native disclosures, real data/actions,
shared tokens and CSS Modules. Reuse this active record under DELIVERY rather
than creating a second record for the same outcome. No API, persistence, security,
dependency or new-journey change.

Plan: make both header actions explicitly44px and labeled (remove responsive
icon-only wrapper asymmetry); replace gray boxed disclosure bars with simple
heading/divider composition; own empty-state icon/copy/action spacing locally
instead of nesting a separately padded shared EmptyState. Verify existing library
unit tests, affected lint/types/style and one existing real-browser journey with
Active/Archived desktop+phone captures. No additional security/completion review
needed for this page-local presentation-only delta; inspect the final diff and
record runtime evidence. No automatic commit/merge authorized by this correction.

Texts presentation correction complete: all3requested outcomes implemented and
real-browser verified on Active/Archived desktop/phone states (E10). Focused11tests,
page lint/types/style/format and guide mapping pass. No additional commit made.
