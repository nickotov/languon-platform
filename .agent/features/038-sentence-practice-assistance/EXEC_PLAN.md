# ExecPlan: Sentence practice vocabulary assistance and completion

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-10-05

## Goal and specification

Deliver AC-1–AC-7 in FEATURE.md on feature/sentence-practice-assistance, created from main. Preserve prior dirty maintenance patches and exclude them from feature commits. Backend first, documented design handoff, then frontend from returned design.

## Existing architecture

Learning domain sentence-types/content validates generated drafts. Provider projects entry IDs to local aliases. Worker validates before fenced publication. Drizzle saves public segments/hints in exercise JSON and private reference separately. Practice store validates disclosures and selects current authorized saved content. Public contracts cap dictionary targets at three. SentenceWithHints currently reads only segment.target.hintId. Coverage is counted on presentation; the current component shows a completion banner plus a nested summary dialog.

Read accepted ADR0019/0021/0022/0023/0024/0026 and schema/capability guards before choosing the compatible hint representation. Keep helper associations independent of entry identity, preserving format, selection and credit revisions.

## Milestones

- [x] M1 — Compatible representation and regressions (AC-1/2/5).
    - Inspect exercise JSON, worker capabilities, version/erasure participants and analogous schemas.
    - Freeze bounded extra hint associations, whole-phrase grouping, deterministic IDs and exact reconstruction. Keep legacy saved content valid; decide whether a new generation format is necessary to fence older workers.
    - Add failing contract/domain/provider cases: content words, whole idiom, repeated occurrence, revealing/invalid hint, grapheme boundary, unknown alias and legacy content.
- [x] M2 — Backend generation/save/reuse and free comparison seam (AC-1/2/3/5).
    - Update generator prompt and provider schema together. Preserve dictionary target aliases; helpers carry no entry UUID and cannot affect coverage/scoring.
    - Keep reference private until explicit free action. Prefer existing authorized manual-reference endpoint plus pure client comparison over a new endpoint or persisted score.
    - Specify and test Unicode normalization, accents, apostrophes, punctuation, whitespace, non-Latin scripts and word order. Avoid punctuation handling that accidentally merges separate words.
    - Real disposable database/cache proof of saved round-trip/reuse, current-version/access checks, free zero-credit reference action and erasure; no actual user-data writes.
- [x] M3 — Backend preflight and design handoff (AC-6/7).
    - Focused backend/contracts/prompts tests, lint/typecheck/build and mapped backend journey; bounded independent backend review before calling backend ready.
    - Update canonical detailed human plan and BL-004 links with document metadata.
    - Save a detailed portable prompt to docs, frozen revision and DESIGN.md, linked in both directions and index. Cover helper versus required hints, conservative free comparison/disclaimer, replacement results, exact/fresh replay, responsive/dialog/fullscreen, keyboard/accessibility and every recovery state without concrete API paths.
    - Await returned design per existing instruction; feature is not Complete at this checkpoint.
- [ ] M4 — Frontend integration from selected design (AC-1/3/4/5).
    - Accessible whole-phrase/content-word hints, monotonic disclosure and required-target distinction.
    - Free compare button using existing authorized reveal, exact draft preservation, localized result and no-credit/AI-unavailable behavior.
    - Separate coverage exhaustion from completion after final successful check/reference/skip. Results replace exercise in current surface.
    - Keep exact session example sequence for replay; reset session counts/drafts/disclosures while retaining personal history. Fresh examples explicitly select fresh mode. Guard pending/stale responses across reset, cancel and access loss.
- [ ] M5 — Full evidence, review and scoped delivery (AC-7).
    - Update mapped guides/tests. Real Chromium journeys for phrase hints, free compare, final-action results and exact/fresh replay with deterministic providers and disposable data.
    - Affected tests/static/build and independent completion/security review; separate tester if unresolved concurrency or substantial new harness warrants it.
    - Remediate, inspect final diff and record evidence. Isolate feature changes from prior maintenance before authorized local commits/squash; never incidentally merge unrelated dirty work.

## Test and review strategy

Contract/domain/provider units prove bounds, legacy compatibility and hint association. Disposable PostgreSQL/Redis proves persistence, private reference access, version/erasure fences and no new financial admission for free actions. Extend existing backend/web journeys rather than adding a parallel harness. Browser evidence is deferred until UI delivery, not waived. Independent security review covers untrusted model output/schema evolution/reference privacy and existing authority. No paid calls or production/user-data mutations.

## User-flow traceability

Inspect sentence-practice-backend and sentence-practice-web with pnpm user-flow:e2e -- inspect before revisions. Mapped source tests listed in FEATURE.md; use existing reviewed disposable backend and Playwright runners. Preserve stable scenario IDs and update hashes only for delivered behavior.

## Current progress

2026-10-05: all product answers confirmed; feature branch and four artifacts created. Inspected generator/domain/contracts, JSON persistence seam, hint renderer and completion component. No implementation yet.

Immediate next action: read full relevant ADRs and schema/capabilities; freeze M1 representation and regression tests.

## Decisions and remaining work

All milestones remain open. Product choices are resolved. Backend-first design checkpoint applies. Pre-existing maintenance evidence establishes a baseline, not proof of this extension.

[Evidence](./EVIDENCE.md) · [Review](./REVIEW.md)

2026-10-05 backend progress: M1 contract/domain/provider and format representation implemented with regression proof. M2 persisted v2 helpers and legacy compatibility pass real disposable integration. M2 final static preflight and M3 independent review pending. Free comparison and exact replay require no new backend endpoint; client behavior awaits design.

2026-10-05 backend preflight: M2 verified with 22 real disposable store/role/HTTP tests, contract/domain/provider coverage and affected static/build checks. Existing free reference is the backend seam for later conservative client comparison. M3 bounded compatibility/security review running; detailed prompt drafted but not issued/frozen as ready yet. Admission defaults to v1; explicit v2 activation requires compatible UI and release worker allowlist.

Backend agent checklist: generation/check remain intentionally worker-only and excluded from Mastra Studio; FEATURE.md records the required durable reason. Studio does not own authenticated job admission, pinned learner budgets or leases. Deterministic provider/domain/journey proof is the safe test seam for this checkpoint.

2026-10-05 checkpoint: independent backend/security review approved after 038-R1 aggregate-disclosure and 038-R2 Studio-exclusion remediation. Final22 disposable tests, affected static/build and traceability pass. Canonical detailed prompt frozen as v001 with DESIGN.md; awaiting returned Magic Patterns design. M4/M5 and overall feature remain pending. No user database/configuration mutation or v2 activation.

Cleanup: only owned feature038 PostgreSQL/Redis containers removed; no owned ports55479/56429 listeners/processes remain. User dev services preserved. Current next action is receive/preserve the generated design for v001, then implement M4 and verify M5. No commit, merge, push, user database/config mutation or v2 activation.

2026-10-05 returned design: selected Magic Patterns v8 as038v001, retained33sourcefiles and source digest in DESIGN.md. M4 integration underway: contextual hints/free comparison/replacement results/inline history and settings; controller53test proof. Exact replay requires additive optional review-only prepare-list/next-ID fields on existing routes to prevent silent substitution and preflight every example; no new route, generation or paid reservation. Backend23real DB/HTTP +8contractcases pass. M5 isolated browser and documentation synchronization underway. Earlier “no implementation/all milestones open/awaiting design” entries above are historical checkpoint observations, superseded by this progress.

## Updated practice UI delivery, 2026-10-06

Selected v8 design source is retained as Feature038 v001. Practice hints, free comparison, replacement results, exact/fresh replay, inline preferences/history, and viewport/keyboard handling are implemented. Author static/build and 73 focused regression checks pass; independent source review resolved C1–C5. Backend exact-replay proof remains 23 real disposable DB/HTTP cases plus eight contract cases. Earlier 5/7 and 6/7 browser runs are diagnostic only; their passing scenario captures have explicit partial-run manifests. The final centralized pre/post-Start retry harness retains production quotas and fake AI providers.

Remaining delivery work: final seven-scenario browser proof/captures, synchronized human/user-flow records, independent final verdict, owned fixture cleanup, and explicit Git scope authority for dependent pre-existing maintenance. Do not mark complete or stage the whole working tree while this authority gap remains.

Final consolidated proof (2026-10-06): seven browser journeys passed in 2.5m; 72 captures and a tested-source/SHA manifest retained. Focused regressions73, exact replay real DB/HTTP23 +contract8, affected static/build checks and traceability pass. Owned fixtures removed and canonical Next declarations restored. M4 implementation and runtime verification are complete. M5 remains open only for final review/document synchronization and the user Git-scope decision; feature is not marked Complete or merged.

Independent final product/security review approved AC-1–AC-7 / SPH-01–SPH-20 with no open implementation finding. C6 (Medium delivery/DoD) remains: explicit Git authority for the documented prerequisite-maintenance boundary. Human plan and web guide now record final proof; comment-only guide marker synchronization follows without rerunning unchanged runtime behavior. Remaining work is solely C6 and the required scoped local Git completion.

## Authorized combined commit — 2026-10-06

The user requested “commit” after completion of the check-validation improvement.
This authorizes a combined local commit of sentence-practice assistance and its
interleaved local-default, idiomatic-generation, learning-dialog, reliability and
check-validation maintenance, including tests, migrations, design snapshots and
verification evidence. The exact staged manifest is inspected before committing.
038-C6's commit-scope authority gap is resolved by this explicit request. No push
or branch deletion is requested; integration into main is not performed by this
commit-only action and remains separate from product verification.

Staged boundary: 350 files, including immutable generated design source and
screenshot evidence. The ordinary staged whitespace check reports only extra
EOF blank lines in the preserved Magic Patterns source snapshot; these are kept
unchanged for handoff fidelity. The check passes with only blank-at-EOF warnings
disabled. No private environment file, dependency cache or test-result directory
is included. Production code and verification evidence are unchanged by staging.
