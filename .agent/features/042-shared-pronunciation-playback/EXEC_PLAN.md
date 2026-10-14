# ExecPlan: Shared pronunciation playback and model pricing

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-10-14
Branch: feature/shared-pronunciation-controls-repair

## Goal and specification

Deliver the approved shared pronunciation and administrative pricing feature. FEATURE.md owns AC text. Use .agent/DELIVERY.md and .agent/PLANS.md.

## Existing architecture

Feature 027 provides dictionary-owned private audio, Kie/fixture ports, worker leases and S3/bytea storage. Features 036–039 own sentence visibility/history/library; 033–034 own flashcards. ai-credits uses transaction participants and typed guarded reservations; text-ai owns model selection. ADR-0020/0022/0023/0026/0027/0028 govern impacted behavior. Successful global recording retention and speech success-only billing require successors.

## Test and review strategy

Unit normalization/pricing/state tests; disposable PostgreSQL admission/ledger/race/migration tests; actual MinIO adapter conformance; web/admin E2E and real browser desktop/narrow proof. Independent completion and security reviews required. Separate bounded tester reviews the accounting/concurrency harness. No native tests or paid provider calls; record live production activation separately.

## Milestones

- [x] M1 — Specification/contracts/ADRs (AC-1–12).
- [x] M2 — Shared speech persistence/provider/worker and MinIO (AC-2/3/5/6/10).
- [x] M3 — Immutable model pricing and speech credit accounting (AC-3/4/8).
- [x] M4 — Authorized sources and web learning playback (AC-1/5/9).
- [x] M5 — Admin recordings/pricing and configuration skill (AC-7/8/11).
- [x] M6 — Migration/rollout, evidence, independent review/remediation (AC-10/11/12).

## Current progress

- 2026-10-13 — Inspected clean main at35534de; created feature branch. User authorized implementation of the approved plan.
- 2026-10-14 — All scoped backend/web/admin/storage/pricing/migration/configuration work complete. Author static/build/runtime checks and guide traceability pass; EVIDENCE.md records exact results and the isolated web timeout recovery.
- Independent completion and security reviewers report no open material findings after R-1–R-5 and S-1–S-10 remediation. Reviewed patch boundary/digest is recorded in REVIEW.md.
- Disposable PostgreSQL/Redis containers and volumes removed; browser test ports closed. Existing development PostgreSQL/Redis preserved. Final diff is focused and generated next-env restored.

## Decisions

- D-1 — Global canonical text/recordings independent of account; retain indefinitely, admin-only physical erasure.
- D-2 — Source authorization stays in owning domain; typed saved references, no arbitrary text endpoint.
- D-3 — Speech-only success billing: reserve exact quote, close at 10-minute deadline, never charge after release; known task recovery 24h and no blind ambiguous retry.
- D-4 — Pricing schema version and immutable tariff revision are distinct; Auto/explicit/display use one rate source.
- D-5 — Ready recording lookup precedes new configured profile; provider changes affect misses only.
- D-6 — Current app languages only; local fixture+MinIO; no paid/live activation in this implementation unless explicitly authorized later.

## Validation

[EVIDENCE.md](./EVIDENCE.md) owns checks/proof. [REVIEW.md](./REVIEW.md) owns review/remediation.

## Upgrade repair (2026-10-14)

The existing development database rejected migration 0057 with PostgreSQL 55P04:
new enum labels were referenced by CHECK constraints before their transaction
committed. Earlier full-history fresh-install evidence did not cover this upgrade.
Reactivated the already authorized feature scope, preserving canonical migration
SQL, metadata, hashes, and all user data.

The reserved-session runner precommits only complete additive statements for
existing types under the existing advisory lock after validating history. Only
those statements are rewritten idempotently during Drizzle execution. Duplicate
pending bare additions and incompatible ordering are rejected. Fully simulated
order is checked before and after precommit, including partial failed-run residue.
Ordinary DDL and migration history remain transactional. ADR-0033 documents the
narrow exception and unused-label residue on failure.

## Remaining work

No implementation or verification work remains. Upgrade repair passed all 16
real PostgreSQL cases, five database unit tests, affected static/build checks,
documentation checks, independent completion review, and security review.
The actual local migration and final idempotent retry completed successfully.
The feature-owned disposable PostgreSQL container and temporary volume were removed;
ordinary development PostgreSQL and Redis remain intact. Required local squash
handoff follows. Live provider/Selectel activation remains the documented release gate.

## Playback controls repair (2026-10-14)

Reactivated authorized feature for reported controls and fixture tone issues. Scope:
icon-only shared speech controls using shared Tooltip and accessible labels/live
status; source/translation-only dictionary rendering in owner/shared views; scoped
fixture versus pronunciation canonical identities with legacy aliases and provider
class checks on ready/in-flight lookup. No migration, deletion, new provider or
language capability. Preserve paid confirmation and sentence/flashcard visibility.

Frontend worker owns UI and browser regressions. Separate bounded test worker
verifies cache isolation/cross-class jobs against disposable PostgreSQL. Root owns
backend selection, docs/guide revisions, integration and final independent reviews.
Use actual Playwright journeys for browser verification. Production/user data and
paid providers are excluded from deterministic checks.

At discovery, local env selected fixture with no Kie key, mapping or hosts. The
user supplied the key in ignored `.env.local` and requested a suitable voice setup.
Local config now selects Kie Turbo/Bella for 16 existing curated languages, new
configuration/settings identities, exact trusted hosts, and conservative budgets
of 100/1000 Kie credits per owner/global day. No secret is tracked or printed.

Backend verification: 30 real PostgreSQL cases and seven unit cases passed. Web:
567 full-suite tests earlier; final 19 focused tests, six real Chromium journeys,
typecheck, lint, styles contract and build passed. Generated next-env restored;
final typecheck and guide traceability checks passed. Disposable infra removed.

The first manual live check accepted a Kie task for the public word `alarmer`.
The temporary probe incorrectly used `kind` instead of the provider port's `state`
and lost task identity before audio retrieval. This was a diagnostic-script defect,
not the application adapter. No user wallet reservation or application job was
created. A corrected second paid sample was rejected by automatic approval review
because the first task may already have incurred a charge; no workaround/retry was
executed. The user subsequently explicitly approved one additional tracked sample. Its
saved task ID was polled without another submission; Kie returned terminal error
500, “Internal Error, Please try again later.” No result URL or audio was produced.
No further paid call was attempted. Successful live audio/listening and result-host
verification remain externally blocked; production activation remains gated.

No implementation or deterministic verification work remains. Independent
completion/security reviews have no open material findings. Local feature squash
handoff follows. Restart API and dictionary worker together to load prepared local
configuration; successful Kie generation still depends on provider availability.
