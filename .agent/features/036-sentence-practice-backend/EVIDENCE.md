# Evidence — Sentence practice backend

Status: Complete — backend and design-prompt scope verified.

## Returned design analysis evidence — 2026-10-04

- Read-only Magic Patterns access identified editor syycdjxpposwrfn72sbix4,
  provider v6 artifact40e0c753-773a-4449-8639-dc86e928fdac. Rechecked active artifact
  after reads; unchanged, generation inactive. Partial retained source/context
  (27 nonempty files) and digest are linked in [DESIGN.md](./DESIGN.md).
- Source-derived SP-UI-01–17 inventory maps SP-01–11 and all25 requested state
  groups in [FEATURE.md](./FEATURE.md#returned-design-scope-and-source-inventory--2026-10-04).
  Compared sentence public contracts, accepted ADRs0016/0017/0027, existing
  Train menu, runtime primitives/tokens and approved fullscreen convention.
- Frozen v001 prompt remains unchanged:
  15369d538a7967aa5e93351d94f833c7cde4ef902bd6086fb61907d06a2654ba.
- Reference rendered retrieval was unavailable due response decoding failure;
  source inspection establishes scope only. No browser fidelity comparison or
  new runtime UI evidence is claimed. Retained export is partial; prototype
  fixture/hooks/utilities are contextual design material, not production code.
- Documentation/link/hash/diff checks recorded at handoff. No frontend/API/schema
  changes, paid AI, prototype execution, external writes or production enablement.
  Backend Complete and its earlier review/evidence remain unchanged. BL-004 and
  the broader BL-003 scope remain in-progress pending frontend/product work.

## Owned infrastructure

All real database evidence uses the owned PostgreSQL17 container
`languon-feature035-postgres` on loopback55435, user `languon_test`, isolated
`languon_auth_sentence_*_test` databases. Redis7 uses owned container
`languon-feature035-redis`, loopback56335/database13 for the sentence journey.
Development5432/6379 and shared infrastructure remain untouched. Tests opt in by
exact confirmed database/Redis targets and use fake actors/deterministic providers.
No paid or nondeterministic model call was made.

Migrations0045–0051 are additive expansion plus authored closed-kind settlement,
shared-capacity, immutable execution/identity and deletion guards. `pnpm db:check`
passes; `readMigrationClassification()` returns `expand`. Reviewed digest:
`e7f4247d871c8ecf90e4fe29599e626e2b933e94643975671439082c999f899b`.

## Automated checks completed

- Backend default suite: **100 files / 723 tests pass**, 32 integration files /
  259 tests explicitly skipped without disposable environment opt-ins (independent final security run,21:27UTC).
  An earlier run found five obsolete admission mocks; those were fixed to include
  shared-capacity lookup, with real learning capability and old-worker rejection
  cases added. The final run passes, rather than treating skips as DB evidence.
- Contracts suite passes, including six new strict sentence privacy/validation cases.
  Nine new domain tests cover target selection, hints, exact grapheme spans and caps.
- Sentence application/HTTP initial15 and free-reference13 focused cases pass.
- Shared admission10 cases pass, including exact learning settlement/capacity
  capability and selection-only worker rejection during learning overlap.
- Shared observation publication4 tests pass: isolated exact namespaces/formats,
  no legacy refresh and learning capability only when executable.
- Root runtime/command15 tests pass, including five bounded-slot fairness/fallback/
  concurrency/shutdown cases and deterministic no-paid sentence fixture policy.
- Safe sentence E2E runner2 guard tests pass.
- Backend lint/typecheck/build pass at their recorded waves; source follow-ups
  require final affected checks below. Contracts/prompts checks pass in the final integration wave.

## Real PostgreSQL evidence completed

- Sentence store **13 tests pass** through0051, rerun after final metadata
  projections: Next/replay, unique exposure, saved completion, reader privacy,
  share revocation, copied-unused candidate whole-content erasure, surviving-entry
  coverage, stale lease fencing, immutable/capable claims, known usage retry and
  cancellation retention; free zero-credit review/replay/history/completion,
  assisted-at-admission semantics, free/paid concurrency and actorforeign cleanup.
- Typed credit integration **24 tests pass**: closed-kind ownership and settlement,
  allocations/attempt ceilings, retry/cancellation, deferred terminal checks and
  active-reservation deletion protection.
- Shared capacity/compatibility **30 real tests pass** (8 new +22 existing), plus
  24 targeted unit cases: combined allowance, provider usage/archive, old-worker
  rejection and safe drain behavior.
- Restricted worker proof **1 test passes** through0051 with real limited wallet:
  generation and checking claim/dispatch/publish settle two positive numerical
  charges; shared archive CRUD works; SQL42501 denies userstatus/cardtext writes
  and userhandle/private dictionary context reads. Existing flashcard persistence
  **17 tests pass** after shared metadata projection changes.
- Lifecycle/purge **13 tests pass** (4 new +9 existing) on independent owned DB:
  entry copied candidate erasure, live archive denial/restore/permanent dictionary
  removal, actorforeign plus reader-owned cancellation/quiescence, restricted
  metadata-only purge, no private input/answer/feedback reads, foreign independent
  content and numerical reader accounting retained. Model preference regression
  **10 tests pass** with exact shared-capacity namespace.

## Composed authenticated journey

`pnpm test:e2e:sentence-practice-backend` passes one mapped scenario using real
Hono authentication/routes, PostgreSQL, Redis and counting deterministic worker
provider. It proves paid generation/checking, Next idempotency, exact public
reference redaction and personally private shared reference replay. Free reveal
with zero credits AND unavailable selected model changes neither sentence job
count nor credit reservation count nor provider call count. One personal review
changes Saved-first/manual progress, with zero AI checks and unique exposure;
owner manual history remains empty. Lower-layer evidence above covers additional
snapshot/privacy/revocation/assistance/concurrency/deletion behavior.

Guide validation and mapping pass at recorded wave. Root later added truthful
coverage boundaries and deterministic command-fixture limitation; final marker
synchronization and guide checks remain required.

## Final boundaries

All required backend evidence, review/remediation and versioned design handoff checks
are complete as recorded below. Production activation and paid live-provider wire/
retention were not exercised. Frontend integration/fidelity awaits user designs;
these boundaries are not claimed as completed backend work.

## Final integration wave

- Shared circuit13 realPG tests pass21:22UTC after source-authoritative schema/key
  correction and independent security remediation. Provider/model/format isolation,
  operational failure threshold, cooldown, successful reset, admission without
  reservation during open circuit and no circuit increment for invalid output,
  cancellation, stale authority or undispatched failure are verified.
- Provider/worker10 focused cases pass after bounded external DTO/alias remediation;
  captured messages omit persistent dictionary/exercise/entry/version identity,
  unknown aliases fail closed, and outputs map back before domain validation.
- Final backend lint/typecheck/build pass; contracts/prompts lint/typecheck/build pass.
- Final composed mapped journey passes1 test in3.25s using the safe runner and
  exact owned PostgreSQL/Redis opt-ins.
- Existing provider and credit wallet Chromium regressions each pass1 journey on
  stable source and owned fixtures. Provider fixture now establishes DeepSeek
  baseline on every run and funds full model retry reservations; retained Kie
  state no longer invalidates the initial-revision assertion. A concurrent admin
  typecheck raced contract clean-build output; rerun after the build is required.
- Independent security review approves after two medium remediations, with no
  unresolved material findings. No paid provider-wire/retention claim is made.

## Completion-review remediation evidence

- Final sentence store/boundary suite **17 realPG tests pass** through0051,
  including actual pinned Kie dictionary vsDeepSeek sentence budget cohorts,
  combined queued+running limits globally/personally, provider quota and agedqueue
  pressure. Rejection leaves jobs/receipts/reservations/wallets unchanged.
- Final service/HTTP **15 tests pass**: distinct503capacity_unavailable+RetryAfter
  forNext/check, actual missing-content404 retained, canonical pluralchecks route
  and unreleased singular route rejection. Contracts **9 files /73 tests pass**.
- Final composed mapped journey passes1 test after guide revision
  `sha256:e8f1292e67d5caea` (4.55s command /2.39s test); guide checks pass.
- Affected backend build/lint/typecheck pass after remediation; store scopedlint
  and globaltypecheck pass. Earlier evidence remains valid for unchanged paths;
  browser regressions need no repeat for these sentence-only corrections.
- Completion reviewer approves after focused re-review; independent security
  approval is recorded in REVIEW.md. All material findings are resolved.
- Two detailed copyable design prompts saved only after approved backend readiness.
  Immutablev001 snapshots match canonical bytes and SHA-256; backend contract
  fingerprints and implementation-target=None are recorded in respective DESIGN.md.

## Design handoff verification

Canonical/snapshot bytes and SHA-256 match for both briefs. Portable blocks contain
no concrete API paths; profile brief1225 words covers MP-01–MP-06, sentence brief2711
words covers SP-01–SP-11 and25 state groups. Canonical links resolve and the reviewed
89-file executable-source manifest remains unchanged. Snapshot links retain the
recorded canonical base. No implementation target or external design was fabricated.
Final guide/mapping checks pass18 guides; frontend generation remains paused at
this user-requested design-return checkpoint.

## Frontend continuation verified — 2026-10-05

Selected v001 integration is complete in [feature 037](../037-sentence-practice-web/FEATURE.md).
Its [evidence](../037-sentence-practice-web/EVIDENCE.md) and
[review](../037-sentence-practice-web/REVIEW.md) supersede earlier frontend-pending
notes without changing this backend's completed status or historic backend proof.
