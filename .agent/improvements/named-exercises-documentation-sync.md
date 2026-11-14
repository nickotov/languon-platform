# Improvement: Named exercise documentation and architecture atlas synchronization

Status: Complete
Created: 2026-11-14
Updated: 2026-11-14

## Routing decision

Documentation maintenance across the current architecture overview, feature-related
references and nine existing source-backed diagrams plus a focused named-exercise view. This is an improvement because it
reconciles several established documentation surfaces without changing product
behavior, public contracts, persistence, authority, dependencies or deployment.
The user asked whether all docs, especially those previewed by
scripts/architecture-viewer/server.mjs, are current and asked to continue.

## Scope and acceptance

- AC-1: Current feature references and architecture overview accurately describe
  the implemented 19 named activities, source grounding, checking and Studio tools;
  historical specifications/evidence and accepted ADR bodies retain their meaning.
- AC-2: Audit all nine existing atlas views and add one focused named-exercise view, reconcile material changed/omitted relationships
  from implementation and accepted decisions, then update source inputs/fingerprints.
  Fresh hashes alone do not imply completeness or runtime activation.
- AC-3: Valid Mermaid, diagram tests, real desktop/narrow rendered evidence and
  relevant user-flow traceability pass. Report the bounded audit scope honestly.

No runtime/viewer implementation change is planned. Current branch main; preserve
unrelated work. The earlier user instruction to commit each stage is reused for this feature-related
documentation follow-up. No push, branch deletion or application/data mutation is included. Rollback is reverting
the scoped Markdown/metadata changes; no data or configuration changes occur.

## Discovery

Baseline fa7a22eb, clean working tree. Viewer loads only docs/diagrams/*.md
(excluding README), not every docs/ document. Nine valid entries; seven stale
inputs (all except authentication and texts-and-vocabulary). The catalog README
claims a November 1 review while individual views were updated later. Feature067
completion docs/guides were updated, but docs/architecture.md retains old body
version/prose-writer text and lacks named semantics/checking/provenance details.

Root owns conversations/Knowledge view and integration. Read-only source audits
cover the other eight views in two bounded parallel tasks. Final edits/stamping
remain root-owned; no automatic stamp before actual source reconciliation.

## Verification strategy (before edits)

- Inspect exact recorded source changes since the last diagram edit plus new
  relevant modules; compare accepted ADR0058/0055/0039 and current contracts/code.
- pnpm diagrams:check, then -- --stamp only after reviewed corrections (seconds).
- pnpm test:diagrams: catalog/server guards, no implementation edits (seconds).
- pnpm test:e2e:diagrams: existing real-server two-scenario desktop/narrow suite
  (tens of seconds); separate safe-browser screenshots for changed labels/layout
  if maintained E2E leaves presentation gaps. No app/DB/provider needed.
- pnpm docs:user-flows:check and mapping check for
  development-cleanup-and-architecture-diagrams; preserve scenario/revision markers
  unless guide test-relevant behavior changes. Scoped formatting/diff checks.
- Independent bounded doc review if material semantic rewrites warrant it; no
  database/security/full application regression for a docs-only patch.

## Plan

- [x] Review all nine views and current feature-related docs.
- [x] Reconcile actual content and exact source inventories.
- [x] Stamp reviewed inputs and pass focused checks/rendered verification.
- [x] Record review decision, scope limits and final diff.

## Evidence and remaining risks

This audit does not assert every historical document is a current spec,
nor prove live provider quality or production activation.

### Reconciliation findings

All nine original views were read by root or bounded read-only source auditors.
Authentication and Texts were fresh and unchanged. Speech and Dictionary drift
was accepted-ADR relationship metadata only. Development drift was a tooling
command addition with no topology change. AI accounting still uses the existing
answer category for planning/authoring; named evaluation reuses Texts jobs.
System/module/Knowledge views omitted the current named contract boundary.

Corrected docs/architecture.md's planned-vs-implemented document adapter text,
dictionary-only root-worker description and retired version-1 prose-writer claim.
Production OCR remains explicitly unavailable in the actual composition; the
correction does not promote deterministic OCR into a live provider claim. Added
a focused tenth named-exercise flow rather than enlarging the already dense
Knowledge graph. Existing flows cross-link it and track exact new source files.
The user-flow guide and maintained browser assertions now expect ten entries,
keeping the two existing scenario IDs and updating the computed revision marker.

## Final outcome and verification

All three acceptance criteria pass. Added the focused Named text exercises view
and reconciled system/module/Knowledge/accounting notes and current architecture
prose. The atlas index and guide now describe ten views. Historical accepted ADR
bodies, surveys and feature checkpoints remain historical evidence.

- `pnpm diagrams:check -- --stamp` followed actual review of every original view
  and the new view, including the recorded changed-input matrix. The subsequent
  ordinary `pnpm diagrams:check` reports all ten Current with valid Mermaid.
- `pnpm test:diagrams`:4/4 pass with loopback permission. The first sandboxed HTTP
  test failed only on listen EPERM; it was rerun unchanged with permission.
- `pnpm test:e2e:diagrams`:2/2 pass in5.2s, real local server/Chromium, desktop1440
  and narrow390. Covers all ten views, sources, selection, zoom/Fit, keyboard,
  no page overflow, stale inputs and real render/load recovery. Browser assertions
  reject unexpected console/network failures and external requests.
- `pnpm docs:user-flows:check`:35guides/mappings pass. Specific atlas mapping
  passes with stable scenario IDs and computed revision sha256:33be549d7f1e925a.
- Scoped Prettier, ESLint of the maintained test and git diff checks pass.
- Independent atlas_general_audit reviewed five original views; atlas_flows_audit
  reviewed the other three plus architecture prose and then the final diff.
  Final review approved with no material source/document mismatch.

Additional safe-browser observation: task session
languon-named-exercise-atlas-7c3d0cedb94710b8efb89acacbc43927 on own loopback4402.
Named view selection and freshness are visible; desktop1440x1000 and narrow390x844
overviews render without label overlap/errors. This tall flow uses the viewer's
existing zoom/scroll affordances for detail, not readable full-flow text at Fit.
Console/errors are empty. Maintained E2E supplies the complete network assertions.
Screenshots: /Users/nickkotov/.agent-browser/tmp/screenshots/screenshot-1794666588850.png
(desktop), screenshot-1794666604826.png (narrow Fit), screenshot-1794666689870.png
(narrow zoom). The browser and own4402server were closed after inspection; existing
user viewers/processes were not adopted or stopped. No database/provider was used.

No broad product test/build rerun is justified: runtime implementation and product
contracts are unchanged. Audit scope is current feature/architecture documentation
and the complete viewer catalog, not an assertion that every historical plan is
current. Remaining operational/provider limitations of Feature067 are unchanged.
