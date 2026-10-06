# Improvement: Sentence practice reliability

Status: Complete
Created: 2026-10-05
Updated: 2026-10-05

## Routing and scope

Restore correctness of the existing sentence-practice journey: requested language, bounded retry/recovery, finite selected-word rounds and saved-content reuse. Focused improvement spans the established client controller and learning store/provider boundaries; no new endpoint, contract shape, persistent concept/schema, dependency, auth policy or rollout. Existing user authorization covers fixing this learning feature. Preserve all unrelated local-default, dialog and prompt patches; no commit/merge authorized.

Review revealed a transport-bound inconsistency: the prior 10,000-word scope could exceed its 1,000-visit/32 KB request limits. The user explicitly chose smaller batches. Current implementation uses at most 100 eligible words and 100 visited IDs per round, retaining the 32,000-byte HTTP bound. Dictionary scope chooses the first 100 eligible words in stable dictionary order; manual selection supports another batch. Setup discloses this rule, caps selection and allows replacing chosen words. Lifetime progress still covers the entire dictionary. This explicit user choice supersedes the interim 10,000-ID/1 MB remediation; no new request fields, stored batch/pagination concept or billing/auth/rate-policy change is introduced.

## Findings and hypotheses

- Confirmed: 8/11 local exercises labelled Russian→French contain Latin but no Cyrillic source text. No sentence or personal content was retrieved. Generation structural validation does not enforce the expected writing script.
- Confirmed: four local generation jobs failed `invalid_model_output`; worker treats invalid output as terminal before the existing max-attempt limit.
- Confirmed: Saved first filters out all personally checked/revealed exercises, so a later session generates despite reusable saved content.
- Confirmed: client stops only at 1,000 visited exercises, not coverage of selected words.
- Additional hypothesis: transport/poll errors pause without bounded automatic recovery; replay must retain the original operation ID and never blindly admit a second paid job.

## Decisions and acceptance

- AC-1: preserve requested direction on generation/selection, reject clear script reversal for distinguishable scripts, exclude corrupt legacy exercises from current selection without deleting personal history. Same-script language identity cannot be proven by a script check; retain strong prompt guidance.
- AC-2: retry transient request/poll failures using idempotent recovery and existing job identity; retry invalid generation under the existing attempt/budget cap. Keep permanent errors deliberate and cancellation/lost authority fenced.
- AC-3: explicitly clarified by the user: finish as soon as all words in the selected batch have appeared, including skipped sentences. Use batches of up to 100 eligible words. Keep the final sentence available to read/answer, mark the round complete and make its next action open results without generating again.
- AC-4: explicitly clarified by the user: Saved first reuses valid existing sentences even when previously completed; New examples deliberately bypasses saved content. Selected-word coverage remains session-local; personal lifetime statistics remain separate.

## Plan and verification

- [x] Add minimized domain/worker/controller/query regressions and fix root causes.
- [x] Verify store changes against owned disposable PostgreSQL/Redis; no schema migration.
- [x] Synchronize mapped user-flow guides/tests; run deterministic real-browser rounds including re-entry without paid generation.
- [x] Run affected lint/typecheck/tests/build, independent completion review and proportional security review of SQL/model-output changes, remediate and record final evidence.

Use diagnosing-bugs, improvement-development, testing, frontend-development, browser-verification, db-verification and user-flow-e2e. Existing typed-work, shared accounting, authority and model preference ADRs remain constraints. No paid model calls or modification of actual user data. Rollback is reverting this focused code/query patch; no migration. Keep history and existing financial records intact.

## Evidence, risks and review

Final author verification: 110 backend learning/config unit tests, 425 web tests, 74 contract tests and the focused 26-test controller suite pass. Final backend/web/contracts typechecks, scoped backend/contracts/test ESLint, full web lint, formatting and production builds for backend, contracts and web pass. The composed PostgreSQL/Redis backend scenario passed against owned disposable ports 55469/56419, covering saved completed reuse without jobs/reservations, finite five-word rounds, explicit fresh rounds, wrong-script retries with accounted provider attempts, preservation/exclusion of malformed historical rows, existing sharing/privacy/free reference review, typed unavailable-model admission without jobs, 17 SQL/domain Unicode parity cases and 100-word batches from a 1,006-entry dictionary. Manual scope and visited history accept 100 IDs and reject 101 without paid admissions. Lifetime progress remains 1,006 entries; manual selection outside the default first 100 works. Contract boundary, controller completion at word 100, and manual selection/replacement UI regressions are verified.

Seven real Chromium journeys pass, including Russian→French finite rounds, reuse and explicit fresh generation. After the user chose smaller batches, the finite round journey reran with current setup guidance; the owner/zero-credit-reader journey reran after the final copy correction. Eight screenshots under [evidence](evidence/sentence-practice-reliability/) show setup batch guidance and first/saved/fresh completed rounds and results. Root visually inspected the saved-round screenshot; the browser worker inspected both setup captures. The browser used owned localhost 3359/4059 applications with disposable database/Redis and deterministic providers. Real rate limits were honored with the normal retry countdown, never disabled. No paid model calls or user-database writes were performed.

Guide revisions are synchronized: backend `sha256:867da3e5ddf0ff72`, web `sha256:b1fdfac7b35d2cce`. Documentation validation (16 tests/19 guides) and both traceability checks pass. Canonical plan and BL-004 link this refinement; BL-004/BL-005 remain Done and BL-003 remains In progress. Owned test applications stopped normally; disposable containers and custom Next build outputs were removed and Next declarations restored through its generator.

Independent initial review and bounded remediation review by `/root/sentence_web_completion_review` pass, including security review. All REL-R1/R2/R3 and the unsupported tag-scope documentation finding are resolved. Final superseding reviewed manifest: `bcfc442ae3a311274a61ed8c81acfef43607511e93abf95d3787bd72e23cb13a`, base `e8886612981bcc9e4bd3cd4e73a35e2c4ccd435a`. Review includes final reliability production/tests/docs and eight screenshots, excluding concurrent completed local-default, dialog and idiomatic-prompt changes. Final diff and formatting checks pass; no commit, merge or push was performed.

Review remediation:

- REL-R1 (Medium): coarse SQL script blocks counted digits/marks and omitted extended letters. Replaced them with lazy cached character classes derived from the exact runtime letter/script predicates, using PostgreSQL C collation. The 17 real SQL/domain parity cases cover digits, marks, extended letters and symbol-only text.
- REL-R2 (Medium): large dictionary selections could exceed visited/request capacity. The user chose smaller batches, superseding the interim transport expansion. Current stable batches, manual scope and visited history are capped at 100; the original 32,000-byte body bound is restored. Dictionary capacity/lifetime progress and authority/budget/rate rules remain unchanged. Contract, controller, selection UI, real database batch boundaries and Chromium setup/round regressions pass.
- REL-R3 (Medium): a nine-script whitelist failed open for other distinct scripts. Profiles now derive from validated maximized locale script codes with explicit Japanese/Korean composite handling. Thai/Armenian SQL parity and Thai/Armenian/Georgian/Bengali/Amharic domain regressions pass.

No separate test harness or unresolved infrastructure/concurrency work was introduced; the independent completion reviewer also evaluates existing automated evidence. Security review covers SQL parameters, visited-ID authority, Unicode regex construction, restored bounded body capacity and 100-word selection and paid retry accounting.

No claim of semantic language identification for same-script pairs; the existing prompt remains necessary. Names and borrowing are covered by regression tests. Existing attempt and budget caps remain active; legitimate retries can consume credits for work performed. No actual user records were modified or deleted, and no paid provider was called for verification.

Letterless text has no script to identify. Dictionary scope follows existing live-card semantics: edits/reordering during practice can change its recomputed first-100 batch; current version/authority checks still apply. A manual selection fixes the chosen entry set. No stored batch snapshot, automatic next-batch navigation or new persistence was introduced.
