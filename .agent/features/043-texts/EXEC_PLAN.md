# ExecPlan: Texts

## Goal and specification

Implement AC-01–AC-09 in [FEATURE.md](FEATURE.md), then await the user’s Magic Patterns
design before AC-10. User explicitly authorized this backend-first checkpoint.
Use feature/texts; no merge to main until the entire feature is verified.

## Existing architecture

DDD typed backend modules, shared Zod contracts, Drizzle PostgreSQL durable jobs,
shared text-ai model selection/capacity, ai-credits transaction participants,
dictionary card settings/revisions and capability shares. ADR-0011/0012/0022/0026/
0027/0032/0033 constrain persistence, trust, rollout and accounting. Source selection
context is not the existing 1,000-character persistent semantic hint.

## Milestones

- [x] M1: Contracts, text domain/content/persistence and generated migrations (AC-01–03/06).
- [x] M2: Durable detection/translation and vocabulary work with shared AI/credits (AC-02–07).
- [x] M3: Composition, worker/permissions/purge/rollout, API journeys and author checks (AC-07–08).
- [x] M4: Independent correctness/security review and concurrency verification; remediation (AC-08).
- [x] M5: Verified backend prompt/checklist/versioned handoff; await returned design (AC-09).
- [ ] M6: Selected-design frontend, browser fidelity/E2E and final review/integration (AC-10).

## Test strategy

Contract/domain units, real disposable PostgreSQL/Redis repositories, HTTP journeys,
worker fencing/recovery/idempotency/credit settlement, sharing and lifecycle races,
migration fresh+existing upgrade, affected lint/typecheck/build and traceability.
No paid providers. No new user-visible UI in backend phase, so browser proof follows
returned-design implementation. Separate tester warranted for new concurrency and
multi-module atomic creation/accounting; security review for sharing, SQL and AI.

## User-flow documentation

Create docs/user-flows/texts.md with stable API/system scenarios and exact registered
command/test mapping. Implementation API path and scenario identities will be recorded
once contracts settle. Future browser scenarios added with returned design.

## Progress

2026-10-15: Clean main inspected; feature workspace and branch created. Authoritative
specification recorded. Beginning parallel nonoverlapping backend implementation.

## Decisions

D1: Backend completion is an explicit checkpoint, not whole-feature completion.
D2: New typed texts module owns text content/work; dictionaries own collected cards.
D3: New selection context is temporary job data; no persistent excerpt on card.
D4: New dictionaries are committed with their first generated card atomically.

## Validation and remaining work

[EVIDENCE.md](EVIDENCE.md) and [REVIEW.md](REVIEW.md) own proof and findings.
M1–M5 complete: backend implemented, deterministic/full-app/database checks passed,
independent correctness/security findings remediated and closed. Versioned
[design prompt/handoff](DESIGN.md) saved after backend approval. Awaiting returned
Magic Patterns design; M6 intentionally deferred by the user's explicit workflow.
Overall feature is not complete and must not be merged yet.

2026-10-15: Workers switched to GPT-6.1 Sol at user request. Disposable role,
concurrency, lifecycle and API journey evidence collected; see EVIDENCE.md.

2026-10-15 checkpoint: CR-01 ADR numbering, CR-02/03 cross-route middleware and
SEC-TEXTS-01 unauthorized version projection fixed and independently closed.
Final suites: backend946 units; remediation35; content11; AI8; selection10;
shared capacity11; credits24; purge11; migrations2; composed real API journeys5.
Static/build/guide evidence in EVIDENCE.md. Backend manifest frozen. No frontend
files, production migration, deployment or paid AI call. Local checkpoint commit
preserves the branch for M6; no merge/push/branch deletion at this phase.

Final handoff checks: affected backend/contracts/prompts lint, backend and shared/
web/admin typechecks, backend ESM/DTS build, changed-file Prettier check,
`git diff --check`, flow mapping and exact v002 canonical/snapshot comparison all
passed. All95 backend-manifest files still match their verified hashes. Removed
only the two labelled disposable Texts test containers after verification; existing
development infrastructure unchanged. Latest design candidate v002 explicitly
filters dictionaries by selection language direction; v001 history preserved.
