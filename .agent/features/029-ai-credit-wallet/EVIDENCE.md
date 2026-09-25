# Verification evidence: Per-user AI Credit Wallet

Updated: 2026-09-25

## Acceptance coverage

| Acceptance ID | Implementation                                                                                                                        | Evidence IDs                  | Result / limitation |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------- |
| AC-1, AC-3    | Credit domain, account/grant/reservation/allocation/history tables, expiry ordering, idempotent sources, database constraints         | DB-1, UNIT-1, MIG-1           | Passed              |
| AC-2          | Owner-only wallet read/mutation contracts, recent-auth and lifecycle checks, optimistic versioning, atomic audit, admin UI            | DB-2, API-1, ADMIN-1          | Passed              |
| AC-4          | Catalog-owned immutable DeepSeek/Kie rates pinned to provider revisions and jobs                                                      | UNIT-2, E2E-1, ADMIN-1        | Passed              |
| AC-5–AC-8     | Atomic admission/retry reservation, dispatch fence, settlement/release, unlimited accounting, operational controls, worker capability | UNIT-3, DB-1, E2E-1, DEPLOY-1 | Passed              |
| AC-9          | Responsive admin wallet/history/dialog states, read-only rates, localized learner exhaustion error                                    | ADMIN-1, WEB-1, BROWSER-1     | Passed              |
| AC-10         | Purge participation, legacy compatibility, inactive rollout and role grants                                                           | DB-1, MIG-1, DEPLOY-1, DOC-1  | Passed              |
| AC-11         | Required automated, database, browser, mapped journey, review, and static evidence                                                    | CHECK-1 through BROWSER-1     | Passed              |

## Check records

- **UNIT-1** — AI-credit domain unit suite: 9 passed.
- **UNIT-2** — Contracts: 53 passed; admin provider-pricing component coverage passed.
- **UNIT-3** — Final backend suite: 86 files passed, 21 skipped; 596 tests passed,
  158 environment-gated tests skipped. Focused HTTP/OpenAPI and credit-domain
  coverage passed 27/27.
- **DB-1** — `ai-credit-participant.test.ts` on dedicated disposable loopback
  PostgreSQL: 8/8 passed, including concurrent reserve/remove, pinned retry policy,
  worker capability, immutable ledger rows, deferred allocation/lifecycle totals,
  settlement truth-table guards, and restricted-role forged-settlement/retry
  rejection. Card-authoring persistence passed 3/3, including unlimited unmetered
  settlement and retry credit exhaustion/provider-budget settlement. Account purge
  passed 8/8.
- **DB-2** — `administration-store.test.ts` on the same resettable database: 20/20
  passed, including wallet mutation and audit behavior.
- **API-1** — Administration service/route tests passed inside the backend suite;
  admin API client coverage passed inside ADMIN-1.
- **ADMIN-1** — Admin: 4 files and 20 tests passed; typecheck, lint, and production
  Vite build passed.
- **WEB-1** — Web: 27 files and 209 tests passed; typecheck, lint, and production
  Next.js build passed. Learner exhaustion copy is covered in all four catalogs.
- **CHECK-1** — Contracts test/typecheck/lint/build passed; backend
  test/typecheck/lint/build passed; changed files pass Prettier; `git diff --check`
  passed. The repository-wide Prettier check still reports the pre-existing clean
  file `account-deletion-recovery-store.test.ts`; it is outside this feature and was
  not rewritten. Root lint passes. Root typecheck reaches an unrelated pre-existing
  `packages/browser-auth/tests/refresh-coordinator.test.ts` fixture missing `handle`;
  every affected workspace typecheck passes independently.
- **MIG-1** — `pnpm db:check` passed; migration classification is `expand`; reviewed
  migration hash through 0032 matches deployment metadata. Migration 0032 adds
  database-enforced immutability, ownership, allocation-total, settlement-semantic,
  pinned-policy, and retry-lifecycle guards.
- **DEPLOY-1** — Release/deployment suite: 105 passed, 5 environment-gated skipped;
  web-dev-panel catalog check reports 60 reviewed commands. The complete panel suite
  passed 52/52 after the new command was enabled.
- **DOC-1** — All 13 user-flow guides and mappings validate; both the wallet and
  provider-management guide-specific checks pass.
- **E2E-1** — `pnpm test:e2e:ai-credit-wallet` passed 1/1 against dedicated
  disposable PostgreSQL/Redis with deterministic generation and the final clean
  migration history. A state-dependent configuration-version assertion was also
  verified against retained provider revisions earlier in delivery.
- **BROWSER-1** — Pinned browser verification passed on the running admin/backend:
  desktop and 390×844 wallet history, mutation dialog, dark theme, provider pricing,
  signed settlement amounts, measurement/source/reason columns, and successful API
  requests were observed. No page errors occurred; console output contained only
  Vite/React development notices. The browser harness diagnostic passed 10 checks.

## User-flow evidence

Current guide: `docs/user-flows/ai-credit-wallet.md`, scenario
`ai-credit-wallet/admin-grants-and-generation-consumes-ai-credits`, revision
`9cf122911016613c`. The mapped reviewed command is enabled in the web dev panel.

## Review link

Findings, resolutions, and verdict: [REVIEW.md](./REVIEW.md).

## Remaining gaps and risks

Independent completion and security reviews passed after remediation. Enforcement
remains off by default; paid-provider smoke testing, production role preflight, and
production activation are explicit later operator actions rather than implementation
gaps.
