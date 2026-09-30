# Correction: Managed AI format expansion compatibility

Status: Complete
Created: 2026-09-30
Updated: 2026-09-30

## Routing decision

- Intended outcome: code-owned additive dictionary AI format support becomes
  usable without requiring an owner to resave otherwise unchanged AI settings.
- Why this is a correction: it repairs the established immutable-revision and
  expand/activate compatibility contract without changing public APIs,
  persistence, product capability, authorization, dependencies, or deployment
  topology.
- Feature-flow triggers checked: every correction condition in root `AGENTS.md`
  remains true, including its behavior, contract, data, security, dependency,
  deployment, product-decision, coordination, and verification conditions.
- Escalation rule: continue as an improvement if its conditions hold; otherwise
  obtain feature authorization before expanded implementation. Mark this record
  `Escalated`, preserve discoveries, and link its successor.

## Context and scope

- Current behavior: a managed-routing revision saved before
  `card-authoring:v3` pins the earlier supported-format list. The worker compares
  that list for exact equality with the current code-owned model catalog, rejects
  the revision before provider dispatch, retries, and exposes
  `provider_unavailable`. Owners must resave unchanged settings after an
  additive format release.
- Expected behavior: an older immutable revision remains executable when all of
  its pinned formats remain supported and the current catalog only adds formats.
  A revision that names a format the current model no longer supports remains
  rejected without provider fallback.
- In scope: managed dictionary text provider revision compatibility and focused
  regression coverage for additive and subtractive format changes.
- Out of scope: changing provider/model identity, adapter revisions, credentials,
  pinned budgets or limits, retry policy, failure copy, schemas, or existing
  terminal jobs.
- Likely files/surfaces: dictionary text provider router and its unit tests.
- Relevant ADRs or constraints: ADR-0021 immutable provider routing and draining
  admitted work; ADR-0012 expand/activate format compatibility.
- Related user-flow guides: `docs/user-flows/ai-provider-management.md`; no
  commands or user journey change is expected, but its immutable-revision
  behavior remains authoritative.

## Acceptance criteria

- AC-1 — A pinned revision whose supported formats are a subset of the current
  model catalog resolves successfully, including after a new format is added.
- AC-2 — A pinned revision that claims any format absent from the current model
  catalog remains unsupported and cannot fall back to another provider.
- AC-3 — Provider/model identity, adapter revision, credential reference,
  enabled-model membership, limits, pricing, and copied job-budget validation
  retain their existing fail-closed behavior.

## Plan

Follow `.agent/DELIVERY.md`.

- [x] Add a failing focused regression for additive format expansion and a
      subtractive fail-closed case.
- [x] Implement the bounded compatibility correction.
- [x] Run targeted tests and affected backend static checks.
- [x] Confirm documentation and user-flow traceability remain accurate.
- [x] Inspect the final diff and record results below.

## Verification

| Check                    | Result                                          |
| ------------------------ | ----------------------------------------------- |
| Tests                    | Pass: backend 615 passed, 173 skipped           |
| Lint/typecheck/build     | Pass: backend lint, typecheck, and build        |
| Runtime/browser/database | Pass: focused deterministic Chromium journey    |
| Documentation/user-flow  | Pass: README, guide checks, and mapped revision |

## Outcome and evidence

- Changes made: managed provider routing now treats an immutable revision's
  supported-format list as requirements that must remain a subset of the
  current code-owned model catalog. Additive formats therefore work without an
  unchanged admin resave; a revision requiring any removed or unknown format
  still fails closed. Provider/model identity, adapter, credential, enabled
  model, caps, pricing, and copied job-budget checks are unchanged.
- Commands and results:
    - Regression-first focused test initially failed at
      `validateExecutionSnapshot` with the reported unsupported-snapshot path;
      after the correction, the same command passed 5/5 tests.
    - `pnpm --filter @languon/backend test` — pass, 87 files / 615 tests; 21
      files / 173 tests skipped by existing conditions.
    - `pnpm --filter @languon/backend lint`, `typecheck`, and `build` — pass.
    - Focused mapped Chromium journey
      `dictionary-platform/inline-ai-card-authoring-preserves-field-choices` —
      pass, 1 test in 22.5 seconds against dedicated disposable loopback
      PostgreSQL/Redis with deterministic generation; containers removed after
      the run. This verifies the visible context-aware v3 authoring path without
      calling a paid model. The unit regression covers the distinct stale managed
      revision seam.
    - Prettier check, `pnpm docs:user-flows:check`,
      `pnpm user-flow:e2e -- check ai-provider-management`, and
      `git diff --check` — pass.
    - Tested source hashes: router
      `5405d89b8e9c0421896856ad772734fec1f404653371fba56f10fec1f48da443`;
      router test
      `e9e26c62f16d30d4a375b6ab0b2353ed032398e5aeab1e8e608a48c4cdf1455d`;
      README
      `8735c4969a6e27432b350bdcb2d4b478f8802466015f96c5c919bff474174bdf`,
      based on `c703268`.
- Documentation: README now states that additive job-format releases do not
  require resaving a managed provider revision and that removal remains a
  drain-and-retire operation. Existing user-flow behavior and markers remain
  synchronized; no guide prose change was needed.
- Review: initial full scoped review of the correction record, README, router,
  tests, ADR-0012, ADR-0021, and admission/worker callers found no material
  findings. The subset direction preserves rollback safety: an older snapshot
  works on a newer catalog, while a newer snapshot remains unsupported by an
  older catalog. Existing fail-closed checks and provider fallback behavior are
  unchanged.

## Remaining risks

- The already terminal failed job cannot be revived; the user must start a new
  generation request after the worker reloads this correction.
- No live DeepSeek/Kie request was made during verification, so vendor uptime
  and response quality remain outside this deterministic correction evidence.
