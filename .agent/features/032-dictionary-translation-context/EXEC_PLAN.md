# ExecPlan: Dictionary Translation Context

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-09-29

Follow `.agent/PLANS.md` and `.agent/DELIVERY.md`. This file owns current
execution state, not duplicate acceptance text or check results.

## Goal and specification

- Deliver AC-1–AC-9 from `FEATURE.md` on
  `feature/dictionary-translation-context`.
- Preserve current no-context behavior, private sharing contracts, and retained
  legacy jobs/revisions while adding context-aware formats.

## Existing architecture

- `@languon/contracts` owns strict dictionary/card/job wire schemas. Dictionary
  current state is typed PostgreSQL under ADR-0011; card revisions are immutable
  schema-versioned JSON snapshots.
- Inline Add/Edit shares `DictionaryCardForm` and local whole-form versions.
  Advanced rewrite, pasted terms, document generation, and import enrichment use
  separate durable job formats under ADR-0012.
- Dictionary settings already update details and settings through one optimistic
  request. Existing Switch, Field, Textarea, CSS modules, and localized messages
  are the UI composition sources.

## Test and review strategy

- Unit/contract: normalization, precedence, strict owner/public schemas, job
  formats, prompts/providers, redaction, and frontend draft/version behavior.
- Integration/database: generated forward migration against disposable
  PostgreSQL; CRUD, conflicts, revisions/authorship, generation snapshots,
  retries, acceptance, privacy, and legacy compatibility.
- UI/E2E/browser: focused web tests, mapped dictionary-platform Playwright, and
  real-browser desktop plus 320 px/200% keyboard checks.
- Static/build: affected package lint, typecheck, build, final repository check,
  guide mapping, and migration consistency.
- Independent completion review: required after author preflight.
- Separate tester: required for the cross-application durable AI journey and
  migration/E2E evidence adequacy.
- Security review: required for private user data in model inputs, SQL, public
  sharing omission, redaction, and prompt-injection handling.
- Early specialist review: only for a named consequential uncertainty.

## Milestones

- [x] M1 — Typed context model and persistence
    - Objective/components: contracts, resolver, migration, repository mapping,
      CRUD, revision v2, privacy boundaries.
    - Acceptance IDs: AC-1, AC-2, AC-6, AC-7.
    - Required checks: contracts/domain, disposable database repository tests.
- [x] M2 — Context-aware generation formats
    - Objective/components: v3/v2 formats, enqueue snapshots, worker/provider,
      prompts, retry/redaction, rollout compatibility.
    - Acceptance IDs: AC-3–AC-8.
    - Required checks: backend unit/integration, deterministic provider and
      compatibility tests.
- [x] M3 — Dictionary and card authoring UX
    - Objective/components: settings textarea, card disclosure/override, draft
      versions, stale choices, localization, responsive accessibility.
    - Acceptance IDs: AC-1–AC-4, AC-9.
    - Required checks: focused web tests, typecheck/build, browser evidence.
- [x] M4 — Guide, full verification, and author preflight
    - Objective/components: user-flow/E2E synchronization, final acceptance and
      diff audit, database/browser evidence.
    - Acceptance IDs: AC-1–AC-9.
- [x] M5 — Independent review, remediation, and completion
    - Objective/components: tester, correctness and security review, focused
      remediation, final evidence, required local squash merge.

Use more milestones only for independently verifiable behavior slices.

## Current progress

- 2026-09-28 — Feature authorized; product choices and architecture discovery
  completed, feature records created, implementation started.
- 2026-09-29 — M1–M3 implemented. Contract/unit/workspace checks, disposable
  PostgreSQL integration, mapped Playwright, and real-browser desktop/mobile
  verification passed. M4 author preflight reconciled AC-1–AC-9; the guarded
  document Playwright scenario remains skipped without MinIO, with its changed
  persistence path covered by disposable database tests.
- 2026-09-29 — Independent tester, correctness, and security reviews completed.
  Four material correctness/compatibility findings and the positive-path
  evidence gap were repaired together; focused and broad affected checks passed,
  and remediation review approved the final state.
- 2026-09-29 — Required local feature commit and squash merge to `main`
  completed as one focused commit. The feature branch is retained locally and
  nothing was pushed.
- Immediate next action: none.

## Decisions and discoveries

- D-1 — Canonical term is **translation context**: optional plain text describing
  intended sense/domain/register. It is first-class dictionary/card content, not
  a display setting or generic model instruction. No ADR is required.
- D-2 — Effective context is card override, else dictionary, else null. Clearing
  a card override resumes live inheritance; there is no context-suppression state.
- D-3 — Context is owner-only generation metadata. Public reads, forks, and
  exports omit it even though this intentionally loses guidance in a fork.
- D-4 — Persistent context and transient request guidance are separate model
  fields. Persistent context controls meaning; transient guidance may refine it
  and is never saved onto accepted cards.
- D-5 — New durable input shapes receive new job formats; old formats drain under
  ADR-0012. Revision snapshots write v2 and continue parsing v1.
- D-6 — UI limits context by Unicode code points. The native textarea permits
  up to 2,000 UTF-16 units so 1,000 astral code points remain enterable; client
  validation and contracts enforce the 1,000-code-point limit.

## Validation links

- Acceptance-to-proof mapping and checks: [EVIDENCE.md](./EVIDENCE.md).
- Review boundary, findings, and verdict: [REVIEW.md](./REVIEW.md).

## Remaining work

- None. Implementation, verification, independent review, and local integration
  are complete.
