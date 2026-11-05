# Improvement: Backend readability refactoring process and first batch

Status: Complete (first batch and repeatable process)
Created: 2026-11-04
Updated: 2026-11-04

## Routing and outcome

The user requested starting a refactoring process for oversized backend files,
explicitly identifying contextual-tutor-runner.ts. This is an improvement:
internal clarity and development tooling only, preserving behavior, public
contracts, persistence, authorization, provider configuration and budgets.
No feature/full-lifecycle request, new product journey, dependency or architecture
replacement. Stop and escalate if a necessary change crosses those boundaries.

Work on current main without automatic commit, merge, push or branch deletion.
Initial tree clean at 0bc905fb. Historical BL-018/019 readability records are
context, not reopened or represented as fresh body reviews.

## Scope and acceptance

- AC-1: Reproducible advisory inventory of all oversized handwritten backend
  runtime TypeScript, including long functions. Separate declarative candidates;
  metadata and size are triage, not proof of bad code or completed review.
- AC-2: First batch makes the tutor runner's execution sequence legible by
  separating cohesive runtime configuration, proposal lifecycle and streaming.
  Preserve public exports and exact observer/routing/stream/error/abort order.
- AC-3: Review the adjacent large memory adapter and extract coherent message or
  observation responsibilities where useful. Keep SDK inheritance unchanged and
  avoid arbitrary chunks, dummy forwarding modules or size-driven compression.
- AC-4: Prove behavioral preservation through existing real-SDK tests, selected
  registered conversation execution tests, types/build and mechanical checks.
- AC-5: Keep a ranked next-batch queue with risks and required verification.
  Complete means this first batch and repeatable process, not all large files fixed.

Out of scope: global hard line limits, CI policy changes, mechanical whole-repo
formatting, public/schema/SQL/model changes, unrelated services and frontend UI.
Rollback: revert only this improvement's helper extraction/tool/docs changes;
original module export paths remain compatible. Remove the audit command/tool
without runtime effect if unwanted.

## Discovery and design

Baseline: 49 runtime source files exceed 500 physical lines; largest include
speech store (2150), authentication service (1597), dictionary generation worker
(1126), conversation accounting (939). Schema/catalog/config files appear too
and require a different disposition. The example runner is 576 physical lines;
conversation memory adapter is 645; request execution is 487.

`pnpm exec prettier --check apps/backend/src` passes. Formatting complaints are
therefore primarily structural/readability issues, not indentation/wrapping
failures. Do not manufacture a formatting diff to address a different problem.

Read root/backend AGENTS, docs/code-readability, historical readability records,
feature060 governing artifacts and applicable ADR-0041/0050/0052. DDD direction
and SDK infrastructure placement remain binding.

Compared local-only helpers against coherent private modules: local-only helpers
leave model/memory configuration, security-sensitive claim state and streaming
mixed in the coordinator. Select private modules for those established
responsibilities while retaining the coordinator's visible ordering/try boundary.
For memory, prefer composition/protocol extraction to a new inheritance chain;
keep SDK adaptation explicit. Physical sizes are signals, not targets.

## Verification strategy before implementation

- Development: existing contextual-tutor-runner and tutor-request-execution SDK
  tests; adapter regressions through those and production composition. Estimate
  1 minute; deterministic provider, no paid credentials needed.
- Tool: fixture-based node tests for full inventory, AST function names/lines,
  stable ordering, declarative hints/exclusions and invalid arguments; real repo
  text/JSON scan. Estimate seconds, no services.
- Final: scoped Prettier/ESLint, backend typecheck/build, readability rule tests;
  estimate 1–3 minutes. Root serializes cleans/builds/heavy gates.
- Registered `pnpm test:e2e:critical -- --flow ai-conversation` after source
  stabilization/review: actual SDK, memory, normal/reduced admission, cancellation,
  owner isolation, proposal state and settlement over owned disposable PG/Redis.
  Estimate 1–3 minutes. No SQL migration or persistence policy changes.
- Independent source review is required because closures, async boundaries and
  model lifecycle move. Review cancellation, claim rollback, ownership scoping,
  observable output and unchanged SDK config. Separate security review only if
  evidence shows material security effects; pure equivalent relocation alone
  does not change policy. No separate tester/harness rewrite needed.
- No visible change: browser/layout/device gates not required; existing guides
  use module globs and retain source mapping. Check affected mappings/docs;
  no observable user-flow or scenario/revision changes expected.
- Baseline/final read-only capability doctor; readiness is separate from current
  provider proof. No paid checks or user-owned worker restarts. The predecessor
  live-proof gap and exhausted task allowance are not bypassed.

## Plan and progress

- [x] Audit all runtime candidates and document the first queue.
- [x] Add advisory audit command and meaningful fixture coverage.
- [x] Refactor runner and memory responsibilities without behavior changes.
- [x] Focused preflight, independent review and remediation.
- [x] Selected final gates, source/evidence comparison and complete record.

Workers have disjoint ownership: audit tool/README/development command docs;
runner and contextual-tutor helpers; memory adapter and conversation-memory
helpers. Root owns integration, this record, final verification and queue.

## Next batches

Provisional priorities below require body review before implementation; they are
not reviewed/approved dispositions of those files. Use the audit JSON for the
complete current candidate list, including function-only candidates.

1. Speech store: separate existing operation families with current transaction
   and asset lifetime invariants; disposable speech repository/critical tests.
2. Authentication service: separate coherent authentication use cases, preserving
   token/session/verification behavior; security review and authentication gates.
3. Dictionary generation worker/domain authoring: separate lifecycle and content
   decisions, preserving deadlines, cancellation and settlement; dictionary AI gates.
4. Conversation/interview accounting: isolate established admission/receipt and
   settlement responsibilities without changing financial authority; financial
   real-DB/production-composition proof.
5. HTTP route collections and process startup: group existing endpoint families
   and configuration phases; OpenAPI/route/boot contract coverage.
6. Declarative schemas, catalogs and environment definitions: review domain
   grouping and genuine cognitive cost; do not split solely for size.

Each follow-up is one bounded improvement with exact scope, source review and
proportional verification. Do not refactor all modules in one unreviewable diff.

## Evidence and review

- FMT-BASE: backend source Prettier check passes before edits.
- SDK preflight: runner/request 45 tests and memory/runner 30 tests pass; shared26runner
  cases overlap and are not double-counted as independent coverage.
- Registered final gate: `pnpm test:e2e:critical -- --flow ai-conversation` passes
  **222 tests in13 files, zero skips**,61.85s native suite/69.81s runner. Evidence:
  `test-results/critical-flows/11f9d4b8-69cd-41c1-9606-9a65d5b170e5/`.
  Real SDK, normal/reduced admission, memory fallback/cancellation, owner fencing,
  actual disposable database and settlement compose together; only external
  provider HTTP is deterministic. Owned PG/Redis cleanup completed by runner.
- `pnpm test:readability`:25 tests pass (18 existing mechanical rules plus7 new audit
  fixtures), zero skips; includes AST/exclusion/complete JSON/invalid flag checks.
- Backend typecheck and production build pass. Final DTS build183.16 seconds; new modules
  and public compatibility exports compile into the actual backend entries.
- Scoped ESLint and Prettier pass for all modified/new source/tool/docs files;
  `git diff --check` passes. Whole backend source formatting was already clean;
  no unrelated formatter sweep was applied.
- `pnpm docs:user-flows:check` validates33 guides; all three affected source mappings
  pass. No guide behavior or test-relevant revision changes; no visible UI change,
  hence no new browser/device run required by ADR-0016.
- Both read-only capability doctor snapshots report ready=true for knowledge-actions;
  the sandbox-only baseline attempt was retried with approved local inspection.
  Configuration, routes, schema, credentials and budgets unchanged. No paid/live
  provider checks or user-owned service restarts. Prior feature 060 live-proof gap
  remains explicitly unresolved; this refactor makes no new provider-quality claim.
- Initial independent source review: no material findings in complete14-file
  boundary at base 0bc905fb (including generated full queue), reviewed snapshot
  de5d25428d7479eb5a05c7ffb83e1efa740e6a3db7bd9b19ce9160fb4c70bfdd.
  Reviewer independently regenerated byte-identical inventory. Final independent evidence approval received after checking the archived
  runner reports, unchanged source hashes and reconciled record.

## Remaining risks

Closure lifetime, observer ordering, abort mapping and public exports were
source-reviewed and regression-tested; no material unresolved finding remains. The inventory is advisory and does not make
unread candidates into verified source reviews. Other oversized files remain.

### First-batch implementation checkpoint

- Runner: 576 → 269 physical lines; coherent configuration 152, proposal lifecycle 120
  and SDK stream 88 modules. Original conditional model-resolution await retained,
  including no extra yield for preconstructed adapters. Public exports preserved.
- Memory: 645 → 396 lines; message history/projection 244 and scoped observational
  records 77 modules. Existing SDK inheritance unchanged. Author compared 32 method
  bodies token-for-token with original except moved receivers/formatting; focused
  memory+SDK30 tests pass, runner+request 45 tests pass.
- Audit: `pnpm audit:backend-readability`, full `--json` queue, seven fixture tests
  enrolled in `pnpm test:readability` (25 total pass). Current 823runtimeTS/TSXfiles;
  220candidates including long-function-only signals;47 files exceed500 lines.
  [Full generated queue](./evidence/backend-readability/inventory.json).
- Function-only flags can remain in cohesive orchestration/SDK operations; no claim
  that every signal is a defect or that all candidates have been body-reviewed.
  Other languages and large test suites require separate follow-up assessment.
- Baseline backend typecheck passes. Elevated read-only doctor reports ready=true
  for knowledge-actions; sandbox-only attempt could not inspect local services.
  This is configuration readiness only, not Redis/circuit/provider execution proof.

Source review and all selected final gates pass. No paid calls, service restart,
API/schema/SQL/model configuration change, commit, merge, push or branch deletion
performed. Changes remain on current main for user review. Final independent evidence approval is recorded below.

## Reproducible queue and rollback

The generated full inventory contains every candidate, not just the text top 20:
823 handwritten runtime TypeScript/TSX files scanned;220 signals across 214 implementation
and 6 declarative-hint candidates;47 runtime files still exceed500 physical lines.
Inventory SHA256: `ced8fdf23a535dd6111c43a8181fefd97f57007f104afc818a5e897bf609f836`.
Re-run `pnpm --silent audit:backend-readability --json` after each bounded batch;
do not hand-edit the generated snapshot. Comments/nonblank/physical/function
spans are labelled as such; none is an automatic acceptance/architecture verdict.

Keep follow-ups bounded by responsibility and risk as listed above. Discard only
this improvement's source/tool/docs/record changes to roll back; no database or
configuration rollback is required. Do not discard unrelated work if later added.

## Retrospective

Pending user acceptance; does not delay technical handoff.

## Final independent evidence approval

2026-11-04: reviewer approves the first batch and repeatable process with no
material findings. Initial full 14-file source review plus bounded final evidence
review confirms registered 222/222 in 13 files, zero failed/pending/skipped/todo,
actual owned-infrastructure cleanup, backend build/types and all selected
mechanical/docs checks. Source/helper hashes remain unchanged, generated queue
is stable, and no unreviewed candidate is represented as reviewed or fixed.
Remaining queue and pre-existing provider-proof gap are disclosed; neither
blocks this improvement. No commit, merge, push, branch deletion or paid call.
