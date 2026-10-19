# ExecPlan: Development cleanup and architecture diagrams

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-10-19

## Goal and specification

See FEATURE.md AC-1–AC-6. Work on feature/development-cleanup-and-architecture-diagrams
from main007b9eb. Preserve preceding checkpoint. User authorization includes
continuing requested delivery and necessary local feature commits/squash merge.

## Existing architecture

Modular Hono backend, Next.js web, Vite/Refine admin, scaffold mobile, shared
contracts/database/prompts packages. Dictionary worker hosts durable AI work;
PostgreSQL/Redis own persistence/cache. docs/architecture.md mixes actual and
planned behavior. DeepSeek Chat remains in code-owned catalogs and playground;
Flash is current chat/translation model. ADR0021/0026/0036 retain historical
snapshot rules. Existing native Node command panel has a separate control/session
boundary under ADR0014, so use an independent read-only viewer.

## Test and review strategy

Unit/HTTP integration checks for viewer catalog, path/Host/Origin restrictions,
freshness, failure states and no execution surface. Maintained Playwright journey
for rendered diagram navigation, search, zoom/source, narrow viewport, keyboard,
console/network checks. Scoped catalog/harness/affected backend tests and typecheck;
disposable PostgreSQL for any retirement migration. No paid generation.
Skills: metadata validation and independent realistic decision probes.
Independent completion review required after author preflight; separate security
review required for local HTTP/assets/rendering and persisted model retirement.
Separate tester assesses the new viewer verification harness and evidence.

## User-flow documentation

Create canonical viewer guide and register its reviewed command/test mapping.
Cleanup owner inspects affected model/harness guides and runs scoped mappings.
Required guide validation and changed mapped journeys before completion.

## Milestones

- [x] M1 — Create reusable skills and run evidenced cleanup (AC-1/AC-2/AC-3).
- [x] M2 — Source-backed diagrams and minimal local viewer (AC-4/AC-5).
- [x] M3 — Focused tests, real browser/disposable DB, guide evidence (AC-6).
- [x] M4 — Author preflight, independent/security/test review, remediation,
      final feature commit and local squash merge (AC-1–AC-6).

## Current progress

2026-10-19: implementation and all scoped verification complete. Independent
completion, security and tester reviews closed after R-1/SEC-045-1 remediation.
Final222-path manifest verified. Final local feature commit/squash merge closes
delivery; no push or branch deletion.

## Decisions and discoveries

D1 — Separate read-only loopback server avoids expanding command panel execution
trust. Native Node mirrors existing local tooling; browser rendering dependencies
are development-only and served locally. No production deployment change.
D3 — ADR0039 records source-backed frontmatter/fingerprints and the read-only
loopback viewer boundary. It follows existing native tooling without a deployment
commitment. UI uses the existing panel palette/system font and native controls;
no product-app imports or framework added.
D4 — Retire deployment manifest schema v1 normalization because no deployed
release consumes it and the canonical creator already emits v2. Positive test
floors now use explicit empty v2 capability envelopes; reject v1, preserving
current future-rollout safety. This one-off retirement needs no new permanent
architecture rule.
D2 — Historical records remain evidence. Current code/docs/configuration must
stop advertising removed models, while ledger/identity semantics remain sound.

## Validation links

[EVIDENCE.md](./EVIDENCE.md) owns results; [REVIEW.md](./REVIEW.md) owns findings.

## Remaining work

None in the implemented scope. Guarded migration0074 is delivered and tested;
ordinary developer schema application uses the explicit normal migration command.

## Rollback/removal

Revert the feature commit to restore source behavior. Viewer removal requires
removing its root commands/dev dependencies, scripts and guide registration; it
owns no database state. Migration0074 intentionally refuses nonempty legacy
inventory; restore a disposable/local backup to recover already-dropped legacy
tables instead of inventing lost task state. Historical accounting and shared
speech objects were preserved. Local targeted key/readiness maintenance is
documented in CLEANUP.md and EVIDENCE.md and does not reset developer data.
