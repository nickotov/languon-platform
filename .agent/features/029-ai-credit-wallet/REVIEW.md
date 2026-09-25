# Review: Per-user AI Credit Wallet

Reviewed: 2026-09-25
Reviewers: Independent completion reviewer and independent security reviewer
Verdict: Approved; no unresolved material findings

## Review boundary

- Completion review covered AC-1 through AC-11 and the full feature diff.
- Security review covered privileged credit mutation, tenant isolation, SQL ledger
  invariants, worker privileges, provider usage and budget settlement, deletion,
  and secret/prompt isolation.
- Separate tester evidence covered PostgreSQL concurrency, restricted-role behavior,
  and the mapped admin-to-worker browser journey.

## Findings

- **F029-CR-01 — Resolved (High):** retries now read the attempt-one reservation
  policy; bidirectional limited/unlimited policy-change coverage passes.
- **F029-CR-02 — Resolved (High):** column-scoped dictionary-worker grants and
  deployment assertions now cover the removal-ledger reads required by `loadLots`.
- **F029-CR-03 — Resolved (High):** retry credit exhaustion records conservative
  actuals and settles the provider reservation before terminalizing.
- **F029-CR-04 — Resolved (Medium):** contracts, persistence, HTTP mapping, and
  localized learner recovery preserve `ai_credits_exhausted`.
- **F029-CR-05 — Resolved (Medium):** route changes clear admin wallet data and
  mutation state; coverage verifies stale controls and balances disappear.
- **F029-CR-06 / SEC-029-03 — Resolved (High/Medium):** migration 0032 enforces
  owner/job consistency, immutable ledger rows, aggregate balances, exact allocation
  and charge totals, pinned policy and attempt bounds, dispatch/release state, and
  the limited/unlimited settlement truth table. Restricted-role negative cases cover
  forged settlement, zero-charge estimated settlement, and unsupported retries.
- **F029-CR-07 — Resolved (Medium):** unlimited missing-usage settlement now records
  `unmetered` in both generation stores, with real-store integration coverage.
- **F029-CR-08 — Resolved (Medium):** generation, import, and document OpenAPI
  inventories now publish HTTP 402, with focused contract coverage.
- **Test isolation — Resolved (Medium):** the mapped E2E no longer assumes provider
  revision 1 and passes both retained-history and clean final-migration runs.

## Completion audit

- [x] AC-1 through AC-10 have implementation and direct evidence.
- [x] Unit, contract, HTTP, disposable database, mapped E2E, browser, migration,
      deployment, lint, typecheck, and production build checks pass.
- [x] The diff contains no credentials, raw prompts, provider responses, generated
      browser evidence, debugging statements, or unrelated formatter changes.
- [x] Migrations remain classified expand-compatible and enforcement defaults off.
- [x] Separate database/E2E tester evidence is recorded in `EVIDENCE.md`.
- [x] Independent completion review approved the final remediation.
- [x] Security re-review passed with no unresolved material findings.

## Residual rollout assumptions

Production role grants must pass the checked-in deployment preflight. Paid-provider
behavior and enabling `DICTIONARY_AI_CREDIT_ENFORCEMENT_ENABLED` remain explicit
operator rollout checks; neither is required for the disabled-by-default feature
implementation.
