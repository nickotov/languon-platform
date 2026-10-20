# Execution plan: Persistent tutor modes

## Goal

Deliver the authorized modes in the real private tutor preference pipeline.

## Specification

[FEATURE.md](FEATURE.md), MODE-1–MODE-4. v9 visual work is independently inventoried in the linked improvement; user chose full snapshots and Chat60%.

## Existing architecture

`ChatPreferencesSchema` in packages/contracts; conversation/default JSONB preferences and turn snapshots in conversations Drizzle store; contextual tutor infrastructure builds preferences instructions for the existing Mastra agent; frontend updates/preferences/defaults already use authenticated conversation API. ADR-0029/0042 and contextual assistant ADRs constrain implementation.

## Test strategy

Focused contract and agent instruction tests; disposable real PostgreSQL/Redis repository/HTTP journeys for defaults, turn snapshot and owner isolation; real mapped browser settings/reopen/new-chat evidence. Web/backend/contracts lint/typecheck/build as affected. No paid models. No new migration expected; JSON read/write normalization needs db-verification. Independent completion review plus bounded prompt trust/security review because agent instruction handling changes.

## User-flow documentation

Update existing `contextual-language-assistant-and-knowledge` and `knowledge-workspace` source/related-feature mapping; retain stable scenario IDs and registered deterministic `test:e2e:contextual-assistant` command. Existing spec/tests live apps/web/tests/e2e/{contextual-assistant,knowledge-workspace}.journeys.spec.ts and backend contextual-assistant.journeys.test.ts. Inspect mapping/check affected revisions before execution.

## Milestones

- [x] M1 — MODE-1/2 validated preferences, persistence/defaults and explicit mode instructions; focused checks.
- [x] M2 — MODE-3 real localized settings control and recovery/errors; focused tests.
- [x] M3 — MODE-4 guide mapping, disposable integration/browser verification and source/runtime evidence.
- [x] M4 — Author preflight, independent review/security review, remediation, final build and local feature integration.

## Progress

2026-10-20 — User explicitly authorized persistent modes after choosing full-document context. Created feature branch/artifacts while preserving all prior uncommitted work. Current action: implement preference/agent path independently of ongoing v9 keyboard/fidelity remediation.

## Decisions and risks

No new strategic architecture decision: extend the existing typed preference and instruction seams. No new tools, model dependencies or data ownership. Git boundary requires explicit inspection because prerequisite UI changes predate this branch. Repository state remains authoritative.

2026-10-20 — MODE-1/2 contracts/backend/persistence verified (124 contract,39 SDK/worker,17 policy,2 isolated database tests; builds/typecheck/lint pass). MODE-3 native localized settings, actual defaults, pending focus and scoped retry guards verified. MODE-4 browser checks cover all10 mapped journeys across final valid scoped runs; forced settings503 retries preserve method/payload and never submit another tutor turn. Production web build passed. Current action: retain final visual artifacts, close independent completion verdict and perform required local squash integration.

### Final Git scope inspection

All changed files are inside the reviewed Knowledge/tutor frontend, mode contracts/backend/tests, mapped guides, versioned design source/evidence and their active delivery records. There are no changed paths outside that scope. The prerequisite v003 design/resize/brief work predates this feature branch but shares the same component files and supplied-design lineage; it remains intact and is included with the cohesive workspace/mode delivery so the committed implementation is self-contained. No environment, dependency/lockfile, unrelated application or production infrastructure change exists. Feature branch was created from main; retain it after local squash merge, with no push/deletion. Final source identity is recorded in EVIDENCE.md/verified-source-sha256.json.

2026-10-20 — Final Git preflight found provider snapshot EOF whitespace. Preserved frozen source bytes and added narrowly scoped `.gitattributes` whitespace exemptions for retained v003/v004 source/reference inputs, matching their formatter exclusions; runtime/test code keeps normal whitespace checking. Staged/working diff checks pass without rewriting source provenance.

2026-10-20 — Complete. Durable source/runtime artifacts and final expanded/security verdicts pass. Created feature implementation commit `13b6206`; local main squash integration has no conflicts and only final documentation status differs from that verified tree. All102 runtime/test hashes remain identical, so unchanged checks remain valid; no conflict-resolution rerun is needed. No required work remains after final local commit.
