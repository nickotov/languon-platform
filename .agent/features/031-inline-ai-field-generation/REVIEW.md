# Review: Inline AI Field Generation and Source Normalization

Reviewed: 2026-09-27
Reviewer: Independent reviewer, tester, and security reviewer
Verdict: Approved

## Review boundary

- Mode: initial completion review followed by focused remediation review.
- Trigger: feature-level public contract, migration, durable worker, model I/O,
  Add/Edit UI, and mapped browser journey changes.
- Reviewed state: complete working tree relative to base
  `12dba8e2768954c8438c5475b8c64b2f4a1cdc6a`, including untracked migration,
  UI, and feature artifacts. Remediation was re-reviewed after all fixes.
- Scope: AC-1–AC-11; v1/v2 rollout and drain; create/update admission and
  acceptance; provider data boundary; field replacement state; job cleanup;
  source-basis integrity; tests, guide, rollout, and browser evidence.
- Inputs: FEATURE, EXEC_PLAN, EVIDENCE, affected source/tests, accepted ADRs,
  dictionary-platform guide, disposable database evidence, mapped Playwright,
  and managed browser observations.
- Separate tester assessed cross-application evidence. Separate security reviewer
  assessed authorization, SQL/transactions, model input/output, secrets,
  redaction, and provenance.

## Findings and resolution

### R-1 — Older accepted option did not restore the input

- Severity: Medium.
- Location: `AuthoringField` and `useCardAuthoring` field review state.
- Impact: accepting an older retained suggestion left the latest suggestion as a
  replacement review, violating AC-2.
- Resolution: existing field choices are marked reviewed at acceptance; accepting
  any current/previous option restores its populated input, unselected choices
  remain compact history, and a later newly generated ID becomes reviewable.
- Evidence: web component regression plus final mapped and managed-browser flows.
- Disposition: Fixed and remediation-reviewed.

### R-2 — Save/Cancel race during generation enqueue

- Severity: Medium.
- Location: authoring submit guard, form actions, and editor sheet dismissal.
- Impact: Save or Cancel before the enqueue response could leave an orphan job or
  advance versions while provider work continued.
- Resolution: submit, Save, Cancel, and sheet dismissal now block during any AI
  mutation, including the pre-job-ID enqueue interval.
- Evidence: pending-enqueue component regression and final web suite.
- Disposition: Fixed and remediation-reviewed.

### R-3 — Mixed-rollout metrics omitted v1 card-authoring work

- Severity: Medium.
- Location: Drizzle generation-store operational measurement.
- Impact: operators could retire v1 while legacy queued work remained hidden.
- Resolution: card-authoring queue depth sums v1 and v2; oldest age takes the
  maximum across both formats.
- Evidence: backend typecheck/test/build and rollout suite.
- Disposition: Fixed and remediation-reviewed.

### R-4 — Normalized Source unchanged result was invisible

- Severity: Medium.
- Location: Source field unchanged-state derivation.
- Impact: a repeated Source request could finish without the explicit AC-3
  unchanged feedback because the stored proposal retained the original raw Source.
- Resolution: the state recognizes the selected retained normalized Source basis.
- Evidence: component regression and final mapped Playwright assertion.
- Disposition: Fixed and remediation-reviewed.

### R-5 — Legacy Example Translation drain compatibility

- Severity: Medium.
- Location: minimized provider dependency context.
- Impact: an intermediate remediation required Example context for a valid queued
  v1 ExampleTranslation-only job whose legacy draft Example could be null.
- Resolution: the dependency is optional for legacy work; v2 request validation
  still requires and supplies the bounded Example.
- Evidence: v1 domain regression and backend suite.
- Disposition: Fixed and remediation-reviewed.

### R-6 — Generated Next.js environment artifact

- Severity: Low.
- Location: `apps/web/next-env.d.ts` and isolated build directories.
- Impact: environment-sensitive generated noise would have entered the feature.
- Resolution: the tracked file was restored to `main`; `.next-browser-inline-ai`
  and `.next-e2e` task output were removed after final verification.
- Disposition: Fixed and remediation-reviewed.

### SEC-1 — Field action disclosed unrelated draft content

- Severity: Medium.
- Location: provider DTO construction and card-authoring prompt.
- Impact: Source-only or Translation-only actions serialized unrelated unsaved
  fields to the configured external model provider.
- Resolution: provider input contains only Source, effective settings, requested
  field contexts, and the bounded current Example only for field-local Example
  Translation. The full draft is absent. Prompt, deterministic adapter, and tests
  use the narrowed DTO; v1 drain remains compatible.
- Disposition: Fixed. Final security verdict approved with no open material
  findings.

## Tester assessment

- No material verification defect remains.
- Final suites: backend 608 passed/166 skipped, web 228 passed, contracts 56
  passed, prompts 5 passed; affected lint/typecheck/builds passed.
- Disposable DB regression passed 4/4. Exact final mapped Playwright passed 7
  with one optional document-service skip. Guide/mapping and rollout checks pass.
- Low optional coverage note: v2 create acceptance is proven by mapped real-stack
  E2E rather than a second isolated persistence test; v2 update and cumulative
  successors are directly covered by disposable PostgreSQL integration.

## Completion audit

- AC-1–AC-11 reconcile with implementation and E-1–E-7.
- Correctness, test, security, transaction, migration, mixed-rollout, and browser
  risks were independently assessed and remediated.
- Guide and stable E2E mappings are current.
- No secrets, debug output, conflicts, generated build output, or accidental
  scope remain. `git diff --check main` passes.
- Documented baseline limitations and live-provider linguistic quality remain
  outside this feature's claims.

## Final verdict

Approved after remediation. No open material correctness, verification, or
security finding remains. The feature is ready for the required local squash
merge into `main`.
