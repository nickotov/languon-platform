# Review: Development cleanup and architecture diagrams

Reviewed: 2026-10-19
Reviewer: independent completion reviewer
Verdict: Pass after bounded remediation; no open material findings

## Review boundary

- Mode: initial completion review followed by bounded remediation review.
- Initial state: base `007b9eb05cc264244560af23903218b4c0fdfe09`
  plus the complete scoped working-tree patch, including untracked files. The
  initial 219-path executable/config/test/document capture was
  `evidence/tested-files.sha256`, SHA-256
  `f027151099db3bfdcfc9da417b160ff977b93b661fedddc61305f5b2d0531e38`.
- Intermediate state: security remediation SEC-045-1 produced the 219-path
  manifest SHA-256
  `a7003ea1997f89ef39a3b505170500d153865c43040d299eb8cfd6c4c1d7b1e6`.
- Final reviewed state: the same base plus the complete current tracked and
  untracked patch, captured as 222 executable/config/test/document entries in
  `evidence/tested-files.sha256`, SHA-256
  `24b81cf9c7db55b35198d10d290b31198e22757d8cea56d107f80af115f8478e`.
  Independent comparison passed for all 182 present-file hashes and 40 deletion
  markers. Active evidence/review records and images are intentionally outside
  that non-self-referential manifest but were read as review inputs.
- Scope and invariants: FEATURE.md AC-1 through AC-6; both repository skills;
  retired text/provider, owner-scoped audio, health, source/deploy/UI shim and
  schema-v1 paths; current shared speech, purge and ledger preservation;
  migration 0074; release metadata; nine source-backed diagrams; read-only
  viewer and guide mappings; shared-menu focus behavior.
- Inputs: root and affected app/package instructions, the code-review and
  efficient-code-search skills, FEATURE.md, EXEC_PLAN.md, EVIDENCE.md,
  CLEANUP.md, COMPATIBILITY-AUDIT.md, AUDIO-PERSISTENCE.md, HEALTH-CLEANUP.md,
  DIAGRAMS.md, SKILLS.md, TEST-REVIEW.md, SECURITY-REVIEW.md, applicable source
  and tests, and accepted ADR-0038, ADR-0039, ADR-0040 plus related active ADRs.
- Separate tester review was warranted for the new viewer harness and is complete
  in TEST-REVIEW.md. The material trust/data surfaces required a security review;
  its final bounded comparison covers the same 222-entry state and passes with
  SEC-045-1 fixed.
- No expanded review was required. Both remediation batches removed obsolete
  exposure and unreachable compatibility behavior without broadening active
  runtime, persistence, deployment-execution or viewer contracts.

## Findings

### R-1 — Retired pronunciation-audio contract remained live — Fixed

- Severity: Medium.
- Location in the initial reviewed state:
  `docs/user-flows/release-deployment-platform.md:157-163`, `.env.example:7-9`
  and `.env.example:169-172`,
  `apps/backend/src/modules/speech/infrastructure/audio/dictionary-audio-adapters.ts:17-20`,
  `apps/backend/src/modules/speech/infrastructure/audio/dictionary-audio-adapters.ts:33-35`,
  `apps/backend/src/modules/speech/infrastructure/audio/dictionary-audio-adapters.ts:75-84`,
  and
  `apps/backend/src/modules/speech/infrastructure/audio/dictionary-audio-environment.ts:90-93`.
- Problem and failure/reproduction scenario: the current release guide told an
  operator to pass `--pronunciation-audio`, while
  `scripts/release-manifest.mjs:71-74` deterministically rejects that retired
  argument. The root environment example still advertised four retired
  dictionary-audio flags/version lists which deployed configuration rejects.
  The current shared-speech adapter/environment also retained an unused `purge`
  role and fake resolver branch after account purge stopped consuming any audio
  adapter. Caller tracing found only current `api` and `worker` roles.
- User/system impact and acceptance/risk affected: following the current operator
  guide failed before producing a manifest, local configuration advertised
  ignored or rejected settings, and the audited runtime still contained an
  obsolete executable role. That left AC-2 cleanup and AC-6 guide traceability
  incomplete and obscured the ADR-0040 retained-recording boundary.
- Suggested fix: remove the four retired example settings and the unused purge
  role/branch; document `--shared-speech`, `--model-pricing` and
  `sharedSpeech.speechBudget`; synchronize the guide marker and focused tests.
  Preserve current API/worker storage identities, retained provider/storage
  rotation and account-purge detachment of shared-speech ownership/accounting.
- Disposition: Fixed. The final `.env.example` contains only the current speech
  flags and no old audio lifecycle/version flags. The adapter and environment
  accept only `api`/`worker`; a bounded caller search finds no purge role. The
  release guide now describes the implemented shared-speech inputs, budgets,
  scoped storage credentials and retained-recording semantics, and explicitly
  states that `--pronunciation-audio` is rejected.
- Resolution evidence: EVIDENCE.md V12 records 47 focused adapter/storage tests,
  backend typecheck, scoped ESLint, 24 guide/16 validator checks, synchronized
  release guide mapping and nine current diagram fingerprints. Independent
  review reran `pnpm docs:user-flows:check`, inspected the synchronized
  `sha256:dc9ae5c3247210aa` release mapping, traced all affected callers, verified
  the final manifest and found no remaining live occurrence outside deliberate
  rejection/security assertions.

## Completion audit

- AC-1 and AC-3 are satisfied by the discoverable, validator-backed cleanup and
  architecture-diagram skills. Their authority, workflow handoff and safe
  maintenance boundaries agree with repository policy.
- AC-2 is satisfied within the declared audited scope after SEC-045-1 and R-1.
  DeepSeek Chat, arbitrary provider configuration, owner-scoped dictionary audio,
  legacy migration/CLI/client/schema, health aliases and proven source/deploy/UI
  shims are retired. Current DeepSeek Flash, Kie and shared-speech behavior remain.
- Current speech/purge/accounting invariants were inspected in source and against
  AUDIO-PERSISTENCE.md. Migration 0074 refuses nonempty legacy inventories before
  dropping owner-scoped tables; successful shared recordings and blob bytes remain
  after account purge while actor bindings, quotes and payer/reservation links are
  removed and reserved holds are released. Disposable migration, SQL-role, purge,
  race and ledger evidence is valid for the reviewed inputs.
- Retired and malformed model/release inputs fail closed in admission, CLI and
  deployer tests. Current shared-speech budget, pricing, overlap and rollback-floor
  contracts retain focused regression coverage.
- AC-4 is satisfied for the specified nine views. Diagram source inventories,
  accepted-ADR reconciliation, actual/planned/discrepancy labeling and current
  fingerprints were sampled against implementation; no material truth mismatch
  was found.
- AC-5 is satisfied. The viewer is loopback-only and read-only, confines catalog
  sources by canonical path and size, serves fixed local assets, rejects write and
  invalid authority/origin requests, and has valid unit plus mapped Chromium proof.
  The independent tester closed both real-catalog and source-drift scenarios.
- The menu correction restores the persistent trigger before invoking a selected
  action. Focused component coverage and the mapped sentence-dialog browser
  assertion establish the menu-to-native-dialog return-focus behavior.
- Applicable guides and mappings are current. No unexplained secret, conflict,
  debug/generated artifact or unrelated implementation scope was found in the
  reviewed patch. The separate security review passes the final state.

## Remediation and final verdict

- SEC-045-1 removed unused speech object-storage credentials and configuration
  from the continuously running account-purge worker, its examples and enforcing
  tests. The final security review independently confirmed least-privilege
  restoration and no reopened issue.
- R-1 removed the remaining retired examples/runtime role and corrected the
  release guide. Active speech, database, deployment execution and viewer inputs
  were unchanged, so their prior evidence remains valid; focused checks cover the
  changed adapter, environment and guide surfaces.
- Final verdict: Pass. No critical, high, medium or material security finding
  remains open.

Residual risks and verification limits:

- Migration 0074 and role behavior were proven on disposable infrastructure;
  the ordinary development database was intentionally not migrated and no
  production deployment, remote object store or paid provider was exercised.
- The sanitized local rekey/readiness-cleanup report and postconditions were
  reviewed, but this read-only review did not mutate or independently replay the
  ordinary local database operation.
- No healthy semantic index was available. Review used bounded `rg`, diff and
  direct caller tracing, so the hashes and source inventories do not prove
  repository-wide absence of every stale concept or a future omitted diagram
  source.
- Browser evidence was reused after confirming that final remediation did not
  change viewer/rendering/menu inputs. The viewer is local developer tooling and
  does not provide operating-system-user isolation.
