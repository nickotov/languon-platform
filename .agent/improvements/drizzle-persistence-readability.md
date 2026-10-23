# Improvement: Drizzle persistence readability

Status: Complete
Created: 2026-10-23
Updated: 2026-10-23

## Routing decision

- Outcome: readable, cohesive persistence implementations with enforceable size
  and spacing limits and matching agent instructions.
- Improvement: internal extraction and development tooling; existing product
  capabilities, APIs, database schema, authorization and billing semantics remain
  unchanged. The user approved the proposed cleanup and guardrails.
- No feature lifecycle or Git mutation is authorized by this improvement.
- Escalate before any behavior, schema, security-policy or transaction-semantic change.

## Context and scope

- Audit: 22 files exceed 500 physical lines in module Drizzle directories,
  including a declarative schema and a test. Twenty implementation stores are
  candidates for cohesive extraction; the generation store reaches 5,873 lines.
- Scope: handwritten backend module Drizzle implementation files, their internal
  operation modules, ESLint configuration/tests, and backend agent instructions.
- Exclude declarative `schema.ts` and test files from implementation-size limits.
  Generated migration snapshots are not implementation source.
- Preserve public store interfaces, transaction ownership, SQL ordering, locks,
  authorization, idempotency, cancellation and accounting behavior.
- Use typed internal contexts and cohesive operations; no numbered fragments,
  inheritance chains, generic helper dumps, or speculative runtime abstractions.
- Relevant constraints: backend DDD; ADR-0011/0012 dictionary persistence and
  workers; ADR-0045 bounded accounting; affected modules' accepted ADRs.
- User-flow behavior and commands do not change. Existing facade source paths
  remain valid; no new executable journey or browser rendering is introduced.
- Rollback: revert this improvement's extraction, tooling and instructions
  together; no migration or data rollback is involved.

## Acceptance criteria

- AC-1: scoped handwritten implementation files contain at most 500 nonblank,
  noncomment lines, except a specifically justified temporary numeric baseline.
- AC-2: cohesive operations and logical stages have readable separation;
  automated spacing checks and Prettier agree.
- AC-3: persistence contracts, queries, transaction boundaries and security and
  financial invariants retain existing behavior.
- AC-4: backend AGENTS.md gives precise, actionable constraints linked to the
  enforced lint policy; tests prove size/spacing checks reject regressions and
  allow legitimate short/declarative cases.

## Plan

- [x] Extract dictionary persistence operations and shared typed support.
- [x] Extract conversation, learning and remaining module operations.
- [x] Add lint policy, focused tooling tests and backend agent constraints.
- [x] Format source and run affected static and real PostgreSQL checks.
- [x] Independently review extraction and sensitive persistence invariants.
- [x] Inspect final diff, record evidence and close.

## Verification

| Check                                                   | Result                                                                                        |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Readability lint policy regression tests                | Passed 8/8; frontend boundary tests 9/9                                                       |
| Scoped ESLint and Prettier                              | Passed for 235 module Drizzle TypeScript files, affected tooling and six corrected test files |
| Backend typecheck/build                                 | Passed final typecheck and ESM/DTS build                                                      |
| Backend unit and disposable PostgreSQL repository tests | Passed 974 unit tests; 390 repository cases verified across initial run and focused reruns    |
| Independent completion/security review                  | Both approved; remediation findings resolved                                                  |
| Browser                                                 | Not applicable: no user-visible behavior or rendering changes                                 |
| Guides                                                  | Passed 16 validators and all 28 mapped guides; existing source mappings remain valid          |

## Outcome and evidence

- Base: `37db193edc56aeaa5cb38b9a5d842a3f4308ae9f`, clean worktree at start.
- Parallel ownership: dictionary generation; dictionary aggregate/documents;
  conversation/learning; remaining modules; dictionary selection/deletion.
  Root owns lint policy, agent instructions, integration and verification.
- The user authorized a local commit after verified completion. No schema
  migration, application configuration change or development-data reset was
  performed.

### Integrated implementation snapshot

- The 212 changed implementation/tooling/instruction files, excluding this
  mutable record, hash to
  `aca48e6072d0bb1fae0ec82673a8cc3f563a219af6661c8940075c7f375e05aa`.
  Reproduce by sorting unique `git ls-files --modified --others
--exclude-standard -z` paths, excluding this record, then SHA-256 hashing each
  path, NUL, its bytes, NUL in that order.
- Public store facades preserve their constructors and interfaces. Internal
  transaction-aware operations group admission, execution, proposal publication,
  cleanup, imports/export, sharing, and financial settlement by responsibility.
- No numeric baseline or inline rule-disabling exception is required. ESLint
  enforces 500 implementation lines, method separation and selected statement
  padding after Prettier's compatibility config. Schema and test files are
  excluded only from this targeted policy.
- Structural source audits matched 397 original method/operation bodies and 19
  generation top-level implementations after normalizing dependency receivers
  and inlining the extracted semantic-stage helpers. Independent completion and
  security reviewers reran these audits and inspected sensitive paths against
  HEAD; no material implementation findings remain.
- `pnpm --filter @languon/backend exec vitest run tests/unit/modules
tests/unit/infrastructure`: passed 127 files / 974 tests, with no database or
  external provider calls.
- `pnpm test:persistence-readability`: passed 8/8, including boundary size,
  excluded comments/blank lines, nested extracted modules, method/statement
  padding, compact related declarations and whitespace-only autofix.
- `pnpm test:frontend-architecture`: passed 9/9, confirming the ESLint config
  addition does not change frontend boundary enforcement.
- `pnpm docs:user-flows:check`: passed 16 validator tests and all 28 mapped
  guides. Existing module/facade paths remain valid and behavior is unchanged;
  no user-flow guide or E2E marker edits are necessary.
- Disposable database: task-owned `languon-readability-test-postgres`, loopback
  port 55482, database `languon_auth_readability_test`, PostgreSQL 17. The normal
  development database and existing test containers are untouched.

### Database verification and fixture remediation

- Initial command: `pnpm --filter @languon/backend exec vitest run` with the
  following exact 23-file selection and `--hookTimeout 120000 --testTimeout 30000`.
  Environment: `ALLOW_DISPOSABLE_DATABASE_TESTS=true`,
  `AUTH_TEST_DATABASE_CONFIRM=languon_auth_readability_test`, and
  `AUTH_TEST_DATABASE_URL` identifying the task-owned loopback database above.

```text
tests/integration/modules/dictionaries/infrastructure/drizzle-dictionary-repository.test.ts
tests/integration/modules/dictionaries/infrastructure/dictionary-document-store.test.ts
tests/integration/modules/dictionaries/infrastructure/dictionary-batch-generation-store.test.ts
tests/integration/modules/dictionaries/infrastructure/dictionary-card-authoring-generation-store.test.ts
tests/integration/modules/conversations/conversation-store.test.ts
tests/integration/modules/conversations/conversation-accounting.test.ts
tests/integration/modules/conversations/conversation-action-accounting.test.ts
tests/integration/modules/conversations/conversation-lifecycle-capacity.test.ts
tests/integration/modules/learning/infrastructure/drizzle-learning-store.test.ts
tests/integration/modules/learning/infrastructure/drizzle-sentence-stores.test.ts
tests/integration/modules/learning/sentence-library-preparation.integration.test.ts
tests/integration/modules/learning/sentence-library-safety.integration.test.ts
tests/integration/modules/learning/learning-lifecycle.test.ts
tests/integration/modules/authentication/infrastructure/drizzle-authentication-repository.test.ts
tests/integration/database/administration-store.test.ts
tests/integration/database/ai-credit-participant.test.ts
tests/integration/database/ai-accounting.test.ts
tests/integration/modules/texts/infrastructure/text-content-store.test.ts
tests/integration/modules/texts/texts-job-store.test.ts
tests/integration/modules/texts/text-selection.test.ts
tests/integration/modules/learner-portraits/portrait-persistence.test.ts
tests/integration/modules/users/infrastructure/drizzle-account-purge-store.test.ts
src/modules/knowledge/infrastructure/persistence/drizzle/knowledge-store.test.ts
```

- Initial result: 382/390 passed, with eight fixture failures in six files. A
  separate tester used a scratch snapshot of original `37db193` against the
  separate `languon_auth_readability_baseline_test` database to establish baseline
  failures and validate repairs. None required runtime or SQL-guard changes.
- Corrected fixtures preserve all original assertions: clear projection tables
  alongside source TRUNCATE; refresh document/text worker clocks; use a live
  purge clock while retaining historical learning timestamps; prove retry
  backoff before simulating its expiry in stored due state; claim through the
  real worker API instead of forging an invalid running row. The legacy
  cancellation timestamp uses PostgreSQL `now()` to follow DB-default creation.
  The legacy insert remains unmarked, preserving overlap admission denials.
- Focused rerun used the same command/environment and six selections:
  `conversation-lifecycle-capacity.test.ts`,
  `drizzle-account-purge-store.test.ts`, `dictionary-document-store.test.ts`,
  `texts-job-store.test.ts`, `administration-store.test.ts`, and
  `learning-lifecycle.test.ts`, at their full paths above. Result: 64/65 passed;
  the only remaining failure was the stale legacy cancellation timestamp.
- After that final timestamp correction, the same command selecting only
  `conversation-lifecycle-capacity.test.ts` passed 8/8. The other five files'
  57 passing tests remain valid because their source, dependencies and fixtures
  did not change. Thus all 65 affected cases pass in their final state, plus the
  unchanged 325 cases from the initial 17 passing files. The full 23-file suite
  was not redundantly rerun after fixture-only corrections.
- Final static commands: `pnpm --filter @languon/backend typecheck`,
  `pnpm --filter @languon/backend build`, scoped `pnpm exec eslint`, scoped
  `pnpm exec prettier --check`, and `git diff --check` passed. The final
  typecheck includes all corrected test fixtures. Build and unit evidence is
  reused after fixture-only edits because runtime source is identical.
- Task-owned verification container and volumes were removed after both main
  and baseline suites finished. No other container or database was stopped or
  changed.

### Final review and acceptance

- Completion reviewer verified unchanged export names, retained signatures and
  241 facade argument-order mappings; no runtime import cycles; coherent
  operation boundaries; all 20 oversized stores satisfy the size rule. Fifty
  additional changed TypeScript implementations are structurally identical
  formatting changes. No material implementation findings.
- Remediation review approved the six fixture repairs. Its initial suggested
  legacy-marker change was rejected and retracted because it would bypass the
  intended overlap guard; only the timestamp was corrected. All assertions were
  retained, with additional due/fence assertions in admin and purge cases.
- Security review independently traced authentication, tenant access, sharing,
  parameterized SQL, financial locks/settlement, worker fencing and purge. Final
  verdict: no material security findings.
- Final 218-file implementation/tooling/instruction/test snapshot, excluding
  this mutable record, hashes to
  `58301e1720cfb882d05af7c2c749f819fc7de1dbb5621f63e6240591745119fc`,
  using the path/NUL/content/NUL procedure above. Only the six documented
  test fixtures differ from the initial 212-file snapshot; runtime unit/build
  evidence remains valid.
- AC-1: all scoped implementations pass size lint, without baseline exceptions.
  AC-2: spacing lint and Prettier pass. AC-3: structural comparisons, repository
  tests and independent security/completion reviews verify preserved behavior.
  AC-4: backend instructions, normal lint enforcement, eight policy tests and
  the root test command establish the ongoing guardrail.

## Remaining risks

- No known unresolved regression from this improvement. Equivalence to the
  baseline does not establish that the baseline contains no latent defects.
- No live HTTP/browser, object-storage or external-provider run was required:
  the change preserves existing behavior and touches no rendering or external
  provider implementation. Database execution and sensitive guards were tested
  through real repositories and independently reviewed.
