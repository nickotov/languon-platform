# ExecPlan: Learner portrait and AI interview

Feature: [FEATURE.md](FEATURE.md)
Last updated: 2026-10-21

Integration correction, 2026-10-21: user requires previously implemented feature050 sidebar retained alongside portrait051. The earlier decision to isolate portrait on main omitted that expected working UI. Restoration proceeds under feature050 on feature/sidebar-portrait-restoration; preserve portrait screens, profile entry and focused interview route. Excluding the portrait prototype sidebar remains correct; excluding the user's already built sidebar was not.

Verified correction: saved sidebar restored, both feature compositions retained, real combined portrait journeys backend2/browser2 and sidebar/Text/auth browser4/4 pass. Main portrait-owned core files remain unchanged. Feature050 E11/source manifest and independent expanded review bind the integrated source. Canonical portrait migration history0000–0079 is preserved and sidebar0080 follows it. Local development startup and HTTP health pass with restored sidebar metadata; original branches/stash/database/backups remain intact.

## Goal and specification

Implement backend logic, verify it, then publish the detailed Magic Patterns prompt for the user. After the selected generated design returns, deliver and verify UI. FEATURE.md owns POR-01–POR-14; design LP-01–LP-30 owns confirmed decisions.

## Existing architecture

Conversations are source-bound, durable admitted operations with PostgreSQL leases/replay and scoped memory. New interview lifecycle must remain separate. Mastra and provider SDKs stay behind infrastructure. Shared text-AI selection, immutable pricing, reservations and provider budgets remain authoritative. Account deletion retains user tombstones and needs explicit erasure participation. Existing chats store preference values without field-origin provenance.

## Test and review strategy

Domain/contracts and state-policy tests; real disposable PostgreSQL/Redis repository/accounting/HTTP checks; deterministic model fixtures; integration with ordinary conversation admission and purge. Affected contracts/prompts/backend lint/typecheck/build. Full UI/browser/fidelity checks follow returned design, not mocks. Independent completion and security reviews required for personal data, SQL, model execution and billing boundary. Separate tester required for independent concurrency/accounting/recovery verification.

## Milestones

- [x] M1 — Domain/contracts/persistence, approvals, expiry, conflicts and deletion. POR-02/03/04/08/09/10/11/14; unit and disposable DB tests.
- [x] M2 — Durable standalone interview and scoped accounting. POR-02/07/10/11/12/13; deterministic agent, HTTP/worker/recovery/accounting tests.
- [x] M3 — Ordinary chat context/preferences and account purge integration. POR-05/06/07/09/14; admission/absence/override/purge integration tests.
- [x] M4 — Backend preflight, independent/security/test review and remediation; verified backend checkpoint. Publish canonical prompt and frozen v001 after logic verification.
- [x] M5 — Selected v001 received and inventoried; UI implementation and verification. POR-01–POR-14, browser/E2E/fidelity/affected static checks.
- [x] M6 — Feature completion review, remediation, final evidence and required local squash integration.

## Current progress

2026-10-20 — User authorized implementation and requested prompt in docs/design-prompt after logic is done. Dedicated branch created from main, recovery copy of discovery retained. Backend implementation started.
Backend slices are composed, tested and independently reviewed. Current next action: preserve the local checkpoint, then receive the selected Magic Patterns design for M5.

## Decisions and discoveries

D1 — Backend-first delivery; UI requires external generated design, per explicit user plan. No prototype UI substituted.
D2 — Reserve allocated number 050 from prior sidebar branch; helper allocated 051. New branch starts main; preserve earlier branch and stash.
D3 — One approved portrait, one draft and one unfinished interview; optimistic version counters, no separately retained revision history.
D4 — User-approved flag is server-only and interview-scoped. Zero monetary/credit liability retains bookkeeping and provider budgets; never change account-wide entitlement.

## Validation links

[EVIDENCE.md](EVIDENCE.md) and [REVIEW.md](REVIEW.md) own results and findings.

## Remaining work

None in the authorized implementation scope. All acceptance, reference/runtime comparisons, required tests/builds and independent/security reviews pass. Delivery is complete; retain the feature branch and recovery stash. Required local squash integration into main is complete, with no conflicts, push or branch deletion.


2026-10-20 — Backend logic implemented and verified: E1–E5 pass; complete typecheck/lint/migration checks pass. Security findings S1–S3 remediated and re-reviewed; no material security findings remain. Published requested canonical prompt docs/design-prompt/learner-portrait.md only after logic verification, with exact v001 snapshot and DESIGN.md. Current action: independent backend functional review and final remediated build/source comparison. UI awaits returned generated design.

D5 — V1 interviewer/summary locales are existing en/ru/fr/es; explanation languages remain independent. Resource limits safely reject excess JSON/context without truncation. Public resource_limit response directs review/shortening/new interview; no new paid fallback.

2026-10-20 — Final author preflight identified a production-only purge-role integration gap: new table privileges were absent, and expired-operation recovery selected unnecessary private columns. Remediation narrows recovery reads and grants only lifecycle/numerical/scrub permissions; explicit restricted-role database proof and focused security re-review required before closing backend checkpoint. This invalidates the initial backend-source manifest/build for those paths; update after remediation.

2026-10-21 — Continued after transient agent-service errors; durable work preserved. Security role delta and paid restricted-role settlement pass. Initial functional review identified F2 cross-device question/proposal/live-operation recovery and F3 stale items on resume; fixes and focused evidence in progress. F4 affected-guide mappings fixed and validated. Requested-locale and expiry-tombstone concerns withdrawn after full source/spec inspection. Web consumer typecheck/build added for shared contract compatibility.

2026-10-21 — M4 closed: F2/F3 resume fixes pass21 real PostgreSQL tests; final53 focused tests, contracts132, backend full lint/typecheck/build, web consumer build/typecheck and guide checks pass. Independent remediation review and security delta pass with no material findings; author/reviewer confirm82-file manifest. Canonical prompt and immutablev001 match. Preserve a local backend checkpoint; next action is the external design handoff. Do not merge incomplete UI feature into main.


2026-10-21 — User supplied Magic Patterns URL wfhhgj71csfpmjd8jyunam and explicitly requested faithful implementation. Selected v001 artifact80c0d47f-8bcc-4c85-8f90-4c6557e9811b captured82sourcefiles/manifest; no external design edits. UI workers implemented editor,management,interview,chat settings and shared realAPI/cache; root added thinroutes,home/profile entries and read-only status discovery. Preserved every sourcecontrol through additive mixed-frequency/notes and independent chat-field contracts; no DBschema change. Detailed source inventory in FEATURE.md. Final interview polish, real browser/E2E/fidelity, builds and independent review remain. Metadata persistence22tests pass; focused backend82tests pass. Previous backend source manifest remains historical checkpoint, not current UI evidence. Mac desktop reference capture currently denied Accessibility; raw source accessible and preserved, actual rendered reference proof pending.

2026-10-21 — Rendered external reference now accessible through the pinned artifact preview; desktop and mobile source captures retained. Security review of the UI/additive backend delta closed UI-S1 account-switch dispatch/receipt races and UI-S2 privacy/deletion disclosure boundaries. Focused remediation52tests pass; full web129files/947tests and contracts138tests pass. Manual real-app browser journey passes; interview test fixture model-policy setup and actionable model-error recovery are being corrected. Final source identity/fidelity/builds/completion review remain.

2026-10-21 — Author supplied-design review compared actual source/runtime at1440x900 and390x844. Corrected interviewer palette/geometry, removed invented composer purpose selector and duplicated preview framing, restored all editor hints/placeholders/group legends, manual spacing and primary disabled Save appearance. Exact source textarea intrinsic rows/padding/lineheight measured. Real final browser journeys pass backend2/browser2 including two-tab conflict, with clean console/pageerror/5xx evidence. Author spotted overly verbose full-detail conflict choices despite passing interactions; compact per-field values and misleading generic conflict-error suppression are now fixed, focused tests pass and final browser recapture is running. Full builds/lint pass; final conflict typecheck and independent completion review remain.

2026-10-21 — M5 author preflight complete: final compact conflict/editor/interview UI passes46focusedtests, all4locale conflict regressions, and registered backend2/browser2journeys with actual two-tab reconciliation. Source reference sheet compositor limitation is resolved through actual renderedDOM geometry plus cleanlocalverification, without a false fullpixelclaim. Final219path runtime/test source manifest captured (generated next-env excluded/restored); independent completion review and final production build/generated-file restoration proceed before M6 integration.

2026-10-21 — Final web build and sequential post-build typecheck pass. Generated Next type entry restored exactly; all219manifesthashes match. Required independent completion review is active over dc02e53→currentUI/backenddelta, including wholeacceptance/fidelity/evidence. M6 remains inprogress; no final integration claimed.

2026-10-21 — Independent full-feature review confirms sourceidentity/fidelity/otheracceptance but requests one medium remediation UI-C1: owner-pinned network/cache are safe, yet local management/entry pending/error state can survive an account switch. Bounded owner/request-state fix and deferred-promise regressions are active. Require focused remediation review; M6 remains inprogress, no main integration.

2026-10-21 — UI-C1 independently closed with no new material findings. Reviewer confirms all221sourcehashes match d823163, old owner work cannot alter current mutation status/cache, and final completion verdict is Pass. Finalwebbuild/postbuildtsc,22focused regressions and current backend2/browser2journeys pass; fullweb955baseline and unchanged backend/contract/DB evidence remain valid. All milestones are complete; final completion records and local squash integration retain the exact verified source.

2026-10-21 — Local squash integration into main completed. Integrated feature tree and all221runtime/test hashes match the verified state; no conflict or implementation change invalidated evidence. Final integration bookkeeping is included in the single main squash commit. Working tree is clean after recording this note.
