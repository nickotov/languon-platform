# Improvement: Enforceable code readability standards

Status: Complete
Created: 2026-10-31
Updated: 2026-11-01

## Scope and classification

BL-012, authorized by “agree with suggestion, let's start”. Improvement:
established-behavior internal refactoring and tooling/instructions, with no new
capability, contract, dependency, persistence, security or architecture. Initial
tree clean at 96e832f. Current branch; no automatic commit.

Scope: shared readability guide, concise instruction pointers, mechanical lint,
delivery/review checks and representative tutor-runner/frontend-renderer refactors.
Create BL-018 for broad mechanical normalization and BL-019 for systematic clarity
review/refactoring and final regressions; they remain subsequent deliveries.

## Acceptance and plan

- AC-1: One guide with backend/React examples covers logical grouping, naming,
  predicates, cohesive helpers and invariant comments without arbitrary splitting.
- AC-2: Strict lint checks braces and statement spacing in enrolled examples,
  with diagnostic/autofix/Prettier tests. Preserve persistence-specific rules.
  BL-018 expands enrollment after mechanical normalization.
- AC-3: Runner preserves resolution, exact memory/SDK settings, observation order,
  cancellation/accounting/errors. Renderer preserves grouping/order/keys/props
  and interactions without visual changes.
- AC-4: Author/review pointers, bounded fresh-agent instruction probe and
  independent source/evidence review pass with no material unresolved findings.
- AC-5: Backlog split, statuses, local links and evidence reflect actual completion.

## Verification strategy

Selected before root implementation (worker source refactors bounded above):

- `node --test scripts/eslint-readability.test.mjs scripts/eslint-persistence-readability.test.mjs`:
  configuration, safe fixes, compatibility (~10s estimate).
- Backend worker runs `pnpm --filter @languon/backend exec vitest run src/modules/conversations/infrastructure/ai/contextual-tutor-runner.test.ts`
  and backend typecheck: existing real pinned-SDK limits/memory/error coverage.
- Frontend worker selects existing proposal/audio/learning-block tests; root runs
  web typecheck. Invariant is exact rendering, not a new visible behavior.
- `pnpm lint`, affected Prettier, skill quick_validate.py (~2–4m estimate).
- No full suites/builds in this bounded stage; full regressions are explicit
  requirements of BL-018/019. No DB/browser proof is substituted: no persistence
  or user-visible behavior changes. Broaden if equivalence review finds otherwise.
- AI matrix: extract model resolution/memory construction without changing
  prompt/schema/provider/SDK settings/admission/worker behavior; retain whole
  pinned-SDK regressions. Check local doctor availability and report readiness
  separately; no paid calls or local-service reconfiguration.

## Ownership, review and rollback

Root owns rules/docs/integration; workers own runner and renderer, respectively.
Independent review is warranted by AI lifecycle equivalence and staged policy.
No new tool/permission/data boundary triggers security review. Fresh probe receives
only the guide plus synthetic code, no expected answer. Rollback restores example
implementations and removes shared lint enrollment/pointers, retaining existing
persistence policy and separately created follow-up tasks.

## Evidence and remaining work

- AC-1/2: Shared guide, root pointer, delivery/review checks and frontend skill
  pointer implemented. Strict enrollment is deliberately staged and documented;
  root lint currently remains green without rewriting untouched source.
- `node --test scripts/eslint-readability.test.mjs scripts/eslint-persistence-readability.test.mjs`:
  16/16 pass in 1.04s. Covers backend/frontend enrollment, loops/branches,
  persistence limits, safe dangling-else/loop/return autofix, idempotency and
  Prettier compatibility. Root `pnpm test` now includes the shared check through
  `test:readability`, retaining the legacy persistence command.
- Frontend worker: `pnpm --filter @languon/web exec vitest run tests/knowledge-block-proposals.test.tsx tests/knowledge-proposal-audio.test.tsx tests/learning-blocks.test.tsx`:
  3 files/51 tests pass (3.72s), scoped lint passes. Root web typecheck passes.
- Root `pnpm lint` passes. Final affected Prettier check and diff hygiene pass;
  independent source review confirms equivalence as recorded below.
- Both changed skills pass installed system `quick_validate.py`. System Python
  initially lacked PyYAML; offline uv resolution also failed. Validation succeeded
  without installation/network using `PYTHONPATH=/private/tmp/languon-skill-uv-cache/archive-v0/ElB_CfCNseJwadfx`
  with the existing cached PyYAML and script
  `/Users/nickkotov/.codex/skills/.system/skill-creator/scripts/quick_validate.py`.
- Readiness: `node scripts/dev-doctor.mjs --capability conversation --json` exits
  1 with sanitized environment-inspection failure. No valid pre-change baseline
  was captured before worker extraction; no readiness improvement/live-provider
  proof is claimed. No settings, user services or paid providers were changed.

### Fresh instruction exercise

Agent `readability_probe` received only this guide and synthetic code with model
resolution, a memory-options payload, validation and publishing; no implementation
or expected answer. It returned named `isModelAdapter`/`resolvedModel`, reason
comment, braces and logical grouping while preserving config values and errors.
Its explicit observation was: “Preserve the conditional await: adapters reach
validation and publish without an added asynchronous boundary.” This identified
a timing refinement needed in the runner extraction; backend worker corrected
it before final review. Final exact runner suite passes 26/26 in 3.96s; scoped
strict lint/Prettier pass. Source SHA-256:
`7a0541228ef96af27cf5d2c7272c9bd12f572f6ba41a2011d32672e6b9b20f57`. No unnecessary helper was introduced for the small
synthetic payload. This is one shared-filesystem read-only exercise, not a
controlled comparative benchmark, runtime test or proof of future agent quality.

### Final outcome — 2026-11-01

AC-1–5 implemented. Final runner preserves conditional await; 26/26 SDK tests
pass in3.96s and backend typecheck passes. Web typecheck and51 existing frontend
tests pass. `pnpm test:readability`16/16 passes after extracting shared spacing
rules for persistence reuse; final root `pnpm lint` passes. All19 affected files
pass Prettier, diff hygiene and127 local links/meta/dependency checks before
terminal bookkeeping (rechecked afterward). No source tests were weakened.

Independent reviewer `readability_review` confirmed model resolution/guard,
setup/wrap ordering, exact memory settings, streaming, errors and cancellation,
and frontend grouping/order/keys/props equivalence. REV-READ-01 (Low), a blank
line splitting the backlog table, was fixed and reviewer confirmed closure.
No additional material source findings. Final evidence review includes terminal
bookkeeping; no runtime edits follow the final source checks.

REV-READ-02 (Low), a stale earlier “review pending” checkpoint contradicting the
final outcome, is corrected. Final bookkeeping checks pass for all 19 affected
files, 127 local links, all 19 index rows and task lifecycle metadata. Source/config
aggregate SHA-256: `f4919ab62b0cdacfb18e4f0ad957bf3a8409e39aefefe6b355b0a4f8d6d727fb`.

Independent final evidence verdict: **Approved**, 2026-11-01, reviewer
`readability_review`, base 96e832f plus the complete tracked/untracked patch.
Both findings closed; no unresolved material findings or required scoped checks.

BL-012 is Done with this evidence record and terminal filename/index synchronized.
BL-018/019 remain pending separate deliveries. Root test command retains existing
persistence coverage and adds the shared lint regressions; README owns its command.
No user-flow behavior, commands or mappings changed, so no guide/E2E updates or
runtime browser/DB runs are required for this source-equivalent stage. Full builds/
suites are explicitly left to broad-cleanup follow-ups, not claimed as passed.

No known implementation risk remains within this bounded stage. Local doctor
readiness remains unverified due environment inspection failure; no model/provider
configuration or execution policy changed, and deterministic SDK proof is reported
separately from absent live proof. No commits, migrations or service changes.
