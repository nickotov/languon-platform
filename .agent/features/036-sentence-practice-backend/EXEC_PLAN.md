# ExecPlan: Sentence translation practice backend

Status: Complete
Updated: 2026-10-04

## Objective

Implement and verify backend sentence practice from the approved
[human implementation plan](../../../docs/sentence-practice-implementation-plan.md),
then save both requested design prompts and stop for returned designs. See FEATURE.
This plan is durable execution state; root integrates all worker boundaries.

## Progress

- [x] M0 — Verify035 prerequisite, squash-merge asbcfda16; branch036 from main.
- [x] M1 — Freeze strict public contracts, domain invariants and application ports.
- [x] M2 — Implement typed persistence, personal/shared selection, replay receipts,
      exposure/coverage, AI attempts, private manual reviews and fenced job lifecycle; freeze new schema.
- [x] M3 — Implement practice/auth service, generation/check AI adapters/prompts,
      bounded worker orchestration and owner/shared HTTP routes.
- [x] M4 — Integrate shared exact-capability model selection, combined capacity,
      closed-kind credit settlement/deferred guards, bounded worker slots and all
      dictionary/account erasure participants. Generate reviewed additive migrations.
- [x] M5 — Execute deterministic unit/contract/API+worker and disposable real
      PostgreSQL/Redis races/guards/deletion proofs; verify old flashcard/provider/credit
      behavior and relevant static/build/guide checks.
- [x] M6 — Author preflight, independent completion/security reviews and separate
      tester evidence; remediate material findings and rerun affected checks.
- [x] M7 — Freeze verified backend contracts and TWO versioned detailed portable
      design prompts with design handoff records; links in docs/backlog. No API paths
      inside portable blocks. Stop frontend work for returned designs.
- [x] M8 — Final scope/evidence/backlog synchronization and local squash handoff.

## Work ownership and coordination

Root owns shared text-AI admission/readiness, root composition/flags/worker command,
all generated migration metadata, schema aggregate, deletion/purge wiring, ADR/
documentation/evidence and final integration. Root retains product decisions.

Contracts/domain worker owns only new sentence contract/domain/port files and
focused tests. Freeze these interfaces before persistence/application workers use
them. Existing flashcard response remains strict and unchanged; sentence
capabilities are isolated.

Persistence worker owns new sentence schema/practice store/worker store/deletion
participant and focused DB tests. Application/AI/HTTP worker owns only new sentence
services/providers/prompts/routes and focused tests. Credit worker owns closed-kind
credit participant/schema/guard drafts and tests; root generates migration files
before authored SQL guard insertion. Capacity worker owns shared infrastructure
capacity participant and dictionary store integration, with global race tests.
Do not reset the shared disposable fixture concurrently; use separate databases
or explicitly hand off ownership. Workers preserve others' files.

## Frozen implementation decisions

- Narrow Next receipt: saved/existing job/empty replay after live authorization;
  normalized payload fingerprint, cross-kind operation conflict, erasure invalidates
  references. Saved selection/exposure and explicit stored-reference reveal are free; new
  generation/AI check uses credits. Reveal is an idempotent private manual review
  and completes Saved first without a score or extra exposure.
- Persistent coverage includes learner/dictionary/direction/entry/current learning
  version. Unique exposure gate increments all targets atomically. Coverage never
  depends on a surviving exercise foreign key; source deletion removes deleted
  entry coverage while surviving entry aggregates remain.
- Keep existing UNIQUE(job_id,attempt) for reservations; add closed job kind with
  dictionary default and kind-qualified lookup. Cross-kind collisions fail closed.
- Typed learning jobs, not dictionary jobs or a universal queue. Shared capacity
  lock AND typed combined counts/usage, no extra allowance or process concurrency.
  Older workers/admissions must not bypass combined limits during overlapping work.
- New sentence capability evidence uses noncolliding namespace so old035 publishers
  cannot refresh learning/settlement capability. Exact registered formats and
  immutable requested-format snapshots are required for both Auto and explicit.
- No raw share keys in persistence, only server-derived verified provenance. Every
  read/replay/dispatch/publication reauthorizes; unauthorized callers cannot see
  private answers, generation input, model snapshots or job results.
- Lock capacity before sorted users/dictionary/learner/job/credit resources. Existing
  purge request-before-user lifecycle is preserved; no external calls under locks.
- Internal sentence primitives intentionally remain outside unrestricted Mastra
  Studio execution until a reviewed credit/private-context developer execution
  policy exists; production canonical composition still registers and uses them.

## Verification strategy

Use deterministic providers/prompt fallbacks. Required real DB cases: optimistic
Next/check replay and exposure races; current-version pool retirement; A+B history
and A coverage preservation; unused candidate erasure; live share/archive/version
revocation across dispatch/publication; stale fencing and cancellation; recovery/
retry credit release/charge; typed first-policy and allocation guards; cross-kind
collision; combined queue/running/provider limits; incapable old-worker overlap;
foreign learner purge and restrictive role grants. Fixtures use owned disposable
PostgreSQL/Redis only. Execute existing flashcard backend and provider/credit browser
journeys proportionally and record exact commands/targets/revisions.

## Decisions, discoveries and outcomes

- 2026-10-04 — Model preference backend035 completed and squash-merged locally as
  bcfda16. Both independent reviews passed following capability-rollback and circuit
  isolation remediation. Current036 branch starts from that verified tree.
- 2026-10-04 — Contracts/domain worker started. Architect is supplying exact frozen
  signatures and checking old-worker combined-capacity rollout semantics.

## Remaining work

Contracts, domain, services, typed persistence, root worker/runtime and lifecycle
integration are implemented. Real DB role/purge and composed API/worker proofs
pass through0051. Shared circuit final proof and provider-minimization remediation
are in progress; final review and design prompts follow.
No new frontend implementation is authorized before returned designs. No paid
provider calls, push or branch deletion are requested.

## Approved free reference adjustment

- 2026-10-04 — User added a free Show reference answer alternative while AI checking
  remains default, and confirmed successful reveal completes Saved first as manual
  review, separately from AI scores. Canonical plan and FEATURE AC-4a/4b updated.
- Extend contracts/ports with explicit reveal and manual-review history/progress;
  persist personally owned replay-safe review events; add live/version guard and
  deletion/purge cleanup. Normal exercise/job DTOs retain a protected reference.
- Do not gate reveal on current model, readiness or wallet; no provider/job/reserve
  call. A zero-credit user can use existing saved content, not generate free content.
- Required evidence: zero credits+unavailable model reveal succeeds, denied/revoked/
  stale source fails without disclosure, retry creates one review/no reservation,
  same exercise remains uncompleted for another learner, manual completion alters
  Saved first only for its learner, AI ratings unchanged, coverage unchanged,
  deletion/account purge erase reference/review data, existing AI default preserved.
- Both design prompts must describe the free comparison UI, no-credit recovery,
  explicit reveal/privacy, ungraded manual reviews and separate summary/history.
- User-requested Jev research verified from official TypeSafe overview, Choice and
  model-limitations documentation; links and evaluation requirements saved in the
  canonical plan. Structured decisions/probabilities could support later assessment,
  but do not replace reference generation or explanations. Integration remains
  outside active scope; no live call, dependency, pricing or score conversion added.

- 2026-10-04 — Added ADR-0027 for typed work/shared accounting and private manual
  review boundaries. Generated0051 and reviewed migration SHA-256
  e7f4247d871c8ecf90e4fe29599e626e2b933e94643975671439082c999f899b.

## Deployment and rollback notes

Apply reviewed additive migrations0045–0051 before the revised product/worker and
purge role grants. Deploy capable workers with actual exact-format, combined-capacity
and credit-settlement observations before enabling new sentence admission. Leave
`LEARNING_SENTENCES_ENABLED=false` until intentional enablement; frontend remains
awaiting a returned design. No production deployment or enablement was performed.

Rollback disables new sentence admission first and retains a capable worker drain
for already admitted jobs, cancellation and credit settlement. Do not roll workers
back while active or recently settled learning usage overlaps: old claims/capacity
increments fail closed, and old publishers cannot refresh new learning capability.
Keep additive tables/guards and historical numerical accounting; do not destructively
reverse content migrations. Re-enable only with matching fresh capability proof.

## Final checkpoint — 2026-10-04

Backend implemented and verified; security findings and all three completion-review
findings remediated with affected checks and independent follow-up approval.
Final reviewed89-file source digest:
`280dfbd2ad30a03d368342f73db483ef02183fc4cd510dc7dc847759f27f3e56`.
Two copyable versionedv001 prompts, immutable snapshots and source contract hashes
are delivered. See [DESIGN.md](./DESIGN.md). BL-003/004/005 remain in-progress for
broader/deferred UI. Selected design target=None. Stop frontend code generation
until user returns designs/source; do not invent a target from a mutable URL.

Local feature commit and squash delivery follow the required feature workflow;
no branch push/deletion or production enablement/deployment is authorized/performed.
