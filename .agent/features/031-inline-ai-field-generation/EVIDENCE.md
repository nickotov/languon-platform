# Verification evidence: Inline AI Field Generation and Source Normalization

Updated: 2026-09-27

## Acceptance coverage

| Acceptance ID | Implementation and proof                                                                           | Result / limitation |
| ------------- | -------------------------------------------------------------------------------------------------- | ------------------- |
| AC-1          | Shared Add/Edit `DictionaryCardForm`, field actions, v2 initial field scope; E-3, E-4, E-5         | Pass                |
| AC-2          | Replacement field states, retained draft, accept/reject, previous options; E-3–E-5                 | Pass                |
| AC-3          | Strict Source result contract and deterministic/provider validation; E-1, E-2, E-4                 | Pass                |
| AC-4          | Source-basis identities and dependent acceptance checks; E-1–E-4                                   | Pass                |
| AC-5          | Per-field scope, Example prerequisite, manual Source invalidation; E-1, E-3, E-4                   | Pass                |
| AC-6          | Bulk actions, cancellation, cumulative successors, six-choice bounds; E-1–E-4                      | Pass                |
| AC-7          | `card-authoring:v2`, create/update targets, v1 drain, migration and rollout; E-1, E-2, E-6         | Pass                |
| AC-8          | Atomic create/update acceptance, versions, ownership, provenance, manual fallback; E-1–E-4         | Pass                |
| AC-9          | Saved-card inline edit plus distinct **Rewrite full card with AI** action; E-3–E-5                 | Pass                |
| AC-10         | Four locales, semantic controls/status, narrow and 200% checks, cleanup; E-3–E-5                   | Pass                |
| AC-11         | Guide, mapped E2E, database, browser, rollout, correctness and security inputs; E-1–E-7 and REVIEW | Pass                |

## Check records

### E-1 — Contracts, domain, provider, worker, and service behavior

- Layer and behavior proved: strict v1/v2 schemas, Source outcomes, bounded
  histories, Source-basis validation, provider output validation, worker format
  dispatch, admission, acceptance, and deterministic normalization.
- Commands/results:
    - `pnpm --filter @languon/contracts test` — 56 passed.
    - `pnpm --filter @languon/contracts typecheck && pnpm --filter @languon/contracts build` — passed.
    - `pnpm --filter @languon/backend test` — 608 passed, 166 intentionally skipped integration tests.
    - `pnpm --filter @languon/backend lint && pnpm --filter @languon/backend typecheck && pnpm --filter @languon/backend build` — passed after final remediation.
    - `pnpm --filter @languon/prompts test && pnpm --filter @languon/prompts build` — 5 passed; build passed.
- Tested state: feature branch working tree including migration and untracked
  feature files, after the final successor and bulk-accept remediations.
- Limitation: paid/nondeterministic model calls were deliberately excluded;
  provider adapters were exercised with strict deterministic fixtures.

### E-2 — Disposable PostgreSQL migration and persistence

- Layer and behavior proved: migration 0034 applies; v2 create/update target
  constraint; ownership/version locks; cumulative Source→Translation→Translation
  successors; atomic saved-card update; terminal redaction/provenance; v1
  compatibility.
- Command: guarded `vitest run --fileParallelism=false` for
  `dictionary-card-authoring-generation-store.test.ts` with
  `ALLOW_DISPOSABLE_DATABASE_TESTS=true` and a dedicated loopback PostgreSQL 16
  database on port 55442.
- Result: 4/4 passed after adding the regression for a second Translation
  successor based on an accepted normalized Source. `pnpm db:check` also passed.
- Cleanup: dedicated test database and the task-owned PostgreSQL container were
  removed.
- Limitation: the general `migrations.test.ts` baseline still hard-codes the old
  19-migration/table inventory and reports 3/5 failures against the repository's
  current 35 migrations. The feature-specific fresh migration and constraint
  verification passed.

### E-3 — Web component, API, accessibility, and production build

- Layer and behavior proved: replacement inputs, prior-draft restoration,
  latest-option bulk acceptance, Source invalidation, per-field actions, saved
  card edit orchestration, localization, semantic Field action composition, and
  API formats.
- Commands/results:
    - `pnpm --filter @languon/web test` — 228/228 passed.
    - `pnpm --filter @languon/web lint` — passed.
    - `pnpm --filter @languon/web typecheck` — passed.
    - `pnpm --filter @languon/web build` — production build passed.
- Regression proof: component test now accepts an older Translation option and
  proves **Accept all** replaces it with the newest visible suggestion.

### E-4 — Mapped real-stack Playwright journeys

- Environment: task-owned loopback PostgreSQL and Redis; real Next.js, Hono API,
  deterministic dictionary worker; no paid model calls.
- Command: `pnpm --filter @languon/web exec playwright test tests/e2e/dictionary-platform.journeys.spec.ts`
  with sanitized `AUTH_E2E_*` loopback variables.
- Result: 7 passed, 1 document-service scenario intentionally skipped because
  optional document services were disabled.
- Feature scenarios:
    - `inline-ai-card-authoring-preserves-field-choices` passed Source reject and
      accept, the explicit Source-unchanged state, Source-based Translation
      successors, accepting an older option back into the editable input, previous
      options, regenerate/accept all, 320 px plus 200% layout, save, and provenance.
        - `saved-card-inline-ai-authoring-preserves-advanced-rewrite` passed inline
          reject/accept/update and retained the advanced rewrite action.
- Cleanup: Playwright servers stopped automatically; disposable containers were
  removed after interactive verification.

### E-5 — Managed real-browser verification

- Tool: project-pinned `agent-browser` 0.33.0 through `pnpm browser`; Chrome for
  Testing 152.0.7977.42. `pnpm browser:check` passed 9 wrapper tests and the live
  launch diagnostic.
- Session: task-scoped random handle `languon-iai-…`, closed successfully.
- Environment: local deterministic API/worker/web with synthetic E2E account and
  disposable data.
- Initial desktop and 320×900 observations: every rendered field had a labelled
  AI action; Source review replaced its textbox; Reject restored the exact
  `teh atelier browser` draft; a fresh request normalized it to
  `the atelier browser`; Accept restored that editable textbox; Translation-only
  generation replaced only Translation and displayed
  `the atelier browser (es)` with Accept/Reject/Try another; bulk actions and
  field order remained reachable at the narrow viewport.
- Final remediation session on the final patch generated two Translation
  alternatives for `review focus`, opened Previous options with the keyboard,
  accepted the older `review focus (es)` choice, and observed its editable input
  restored while the newer choice remained available through history and
  **Accept all** remained enabled.
- Accessibility/operations: semantic dialog, region, group, label and button
  names were present; keyboard Tab was accepted; page `errors` was empty; console
  contained only React dev/HMR messages; network stayed on localhost with 2xx
  feature requests. The pre-login `/auth/refresh` 401 was expected.
- The mapped Playwright journey separately verified 200% text and absence of
  horizontal overflow.

### E-6 — Rollout, guide, and infrastructure compatibility

- `pnpm docs:user-flows:check` — 14 guides and mappings valid.
- `pnpm user-flow:e2e -- check dictionary-platform` — mapping valid.
- `node --test infra/deploy/tests/manifest.test.mjs infra/deploy/tests/dictionary-worker-overlap.journey.test.mjs`
  — 25 passed, 1 intentionally skipped database-grant preflight.
- Proved expand/activate propagation of v2 while v1 remains readable and
  terminally actionable. README and `.env.example` document both formats.

### E-7 — Final scope and static hygiene

- `git diff --check` — passed after final changes.
- Final affected backend/web lint, typecheck, tests, builds, DB check, guide
  checks, infra checks, disposable DB integration, mapped E2E, and managed
  browser verification all passed.
- A repository-wide `pnpm typecheck` attempt is not claimed: it encounters an
  unrelated pre-existing missing `handle` fixture in
  `packages/browser-auth/tests/refresh-coordinator.test.ts`. All affected package
  typechecks passed.
- Generated browser/build output was removed and `apps/web/next-env.d.ts` was
  restored to its checked-in form before review.

## User-flow evidence

- Updated guide: `docs/user-flows/dictionary-platform.md`.
- Mapped tests: `apps/web/tests/e2e/dictionary-platform.journeys.spec.ts`.
- Scenario/revision markers, guide registry, and mapped command validation pass
  under E-4 and E-6.

## Review link

Findings, resolutions, and verdict: [REVIEW.md](./REVIEW.md).

## Remaining gaps and risks

- Live-provider linguistic quality depends on the configured model. The strict
  structured contract, bounds, Source basis, retry behavior, and deterministic
  fallback are verified; no claim is made about every language's lemma/article
  quality from a paid provider.
- The two unrelated baseline limitations in E-2 and E-7 remain outside this
  feature boundary.
