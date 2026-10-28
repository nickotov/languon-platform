# ExecPlan: Automatic provider model price actualization

Status: Complete
Feature: [FEATURE.md](FEATURE.md)
Last updated: 2026-10-28

## Goal and authorization

The user authorized feature delivery on 2026-10-28 and explicitly requested
future model/provider extensibility. Implement AC-1 through AC-6. Branch
`feature/model-price-actualization` started from clean `main` at 625d5a6.

## Architecture and decisions

- ai-credits owns the provider-price source port and reviewed infrastructure
  adapters. Existing text/speech catalogs and configured credentials own target
  discovery. No duplicated pricing model list or arbitrary caller URLs.
- OpenRouter metadata is initially supported when uniform, exact and representable.
  Other providers and incompatible conditional/meter prices explicitly preserve
  existing records. See ADR-0048 and EVIDENCE source findings.
- `actualize_model_prices` prepares existing per-model price-write previews;
  `admin_apply` retains immutable revisions, expected versions, expiry, audit and
  replay. New issuance snapshots gain the new action; old tokens do not.
- Discovery uses bounded 50-target continuation pages, with totalModels/nextOffset;
  explicit selections remain capped 50. Apply previews before continuing and keep
  the code-owned catalog stable across pages. Restart at 0 after configuration changes.
- No recurring scheduler, customer-tariff change, migration, route activation,
  production deployment, paid model calls or dev price publication.

## Milestones and results

- [x] M1 — Official source research and extensible adapter contracts (AC-1/2).
- [x] M2 — Catalog composition, MCP price previews and bounded continuation (AC-1–5).
- [x] M3 — Scoped units, real HTTP/disposable DB journey, docs and required critical/static checks (AC-6).
- [x] M4 — Author preflight, independent completion/security reviews and remediation.

## Progress and findings

2026-10-28: Implemented source registry and strict exact-unit OpenRouter adapter,
production catalog composition, MCP method and immutable issuance action. Added
unit, source, target-discovery and real HTTP/DB tests and the current system guide.

Security review SEC-057-1 found recognized additive charges were ignored. Require
absent/null/exact zero and added catalog/endpoint/text/speech regressions. Focused
security review passed.

Initial completion review CR-057-1 found default discovery failed above 50 models.
Added bounded continuation and unit 101-model plus real HTTP 51-model coverage.
Focused completion and pagination security reviews passed.

The first focused HTTP run found the test client assumed JSON instead of MCP's
SSE envelope. Reused established SSE/JSON parsing and reran successfully; runtime
code was unchanged by that repair.

## Verification and evidence validity

Final code/test/registry hash:
`d55c8317377f2a5837ac61115a824a021bb44cdcccc3a3560dfcb17e426c1acf`.

Focused 96 tests, HTTP/DB 4 cases, backend typecheck/build, affected ESLint/Prettier,
docs16 validator tests / 31 guides and current traceability pass. Original full
critical gate 13/13 groups passed. After pagination, retained11 unchanged groups
and reran affected backend 424 tests plus MCP 2 journeys; both pass without skips.
See [EVIDENCE.md](EVIDENCE.md) and [REVIEW.md](REVIEW.md).

No new harness, worker, concurrency primitive or complex cross-application
implementation: independent reviewer accepted existing infrastructure and test
adequacy without a separate tester. No application UI changes; retained real MCP
browser evidence covers issuance/discovery/revocation. No matching backlog task.

## Delivery, rollback and remaining work

Follow required local feature commit and squash merge into main; retain the
feature branch and do not push. Final runtime/test tree remains identical to the
verified hash; no conflict resolution changes are expected.

Rollback removes tool/source composition and issuance action while preserving
published immutable price history. Correct an unwanted rate with a new explicit
revision rather than deleting history. Existing MCP listeners need restart and a
replacement pricing-write token before discovering the new method; no credentials
are issued/revoked automatically.

No implementation, verification or review work remains. Documented unsupported
pricing semantics and stable-catalog pagination assumptions remain limitations.
