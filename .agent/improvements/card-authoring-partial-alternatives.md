# Improvement: Card authoring partial alternatives

Status: Complete
Created: 2026-09-30
Updated: 2026-09-30

## Routing decision

- Intended outcome: generating all fields for a saved card returns every useful
  novel AI suggestion even when some requested fields are unchanged.
- Why this is an improvement rather than a correction: it makes the established
  regeneration journey tolerant of valid partial model output across the prompt,
  provider boundary, and review UX without adding a new capability.
- Explicit-feature check: the user did not request a feature or full feature
  lifecycle.
- Feature boundaries checked: no new public contract, persistence, security
  policy, dependency, deployment, migration, or ADR-worthy decision.
- Escalation rule: stop, mark this record `Escalated`, and request explicit
  feature authorization before crossing any feature boundary.

## Context and scope

- Current behavior: the provider validator requires every requested non-Source
  field to be present and different from both the current value and all earlier
  suggestions. One repeated stable value, commonly transcription, rejects the
  whole otherwise useful response as `invalid_model_output` and the web renders
  the generic generation failure.
- Expected behavior: missing or repeated non-Source values mean “no new
  suggestion for this field”; novel suggestions from the same response remain
  reviewable. A Source suggestion equal to the current Source is normalized to
  `unchanged`. Context continues to reach the provider and can produce new
  alternatives without requiring a manual field edit first.
- In scope: provider-delta normalization, prompt guidance, focused domain/adapter
  tests, existing user-flow documentation, and the saved-card browser journey.
- Out of scope: automatic semantic-quality scoring, additional provider calls,
  schema/migration changes, or accepting unrequested fields.
- Likely files/surfaces: card-authoring domain validation, local prompt and tests,
  backend generator tests, dictionary-platform guide/E2E.
- Relevant ADRs or constraints: preserve bounded structured output, untrusted
  model validation, review-before-save, credit settlement, and format v3.
- Related user-flow guides: `docs/user-flows/dictionary-platform.md`.
- Rollback/removal path: revert tolerant normalization and prompt guidance; no
  stored-data cleanup is required.

## Acceptance criteria

- AC-1 — A missing requested non-Source field does not invalidate novel fields
  returned in the same generation.
- AC-2 — A non-Source value equal to the current value or an earlier suggestion
  is omitted from review without invalidating other novel suggestions.
- AC-3 — A suggested Source equal to the current Source is treated as unchanged;
  unrequested fields and incoherent historical Source alternatives remain
  rejected.
- AC-4 — Saved-card Generate all works without a manual field edit and respects
  the effective card/dictionary context.
- AC-5 — Existing bounds, field uniqueness, review-only behavior, and provider
  usage validation remain intact.

## Plan

Follow `.agent/DELIVERY.md`.

- [x] Add regression coverage for partial, repeated, and missing output.
- [x] Normalize valid partial provider output and update prompt guidance.
- [x] Run backend, prompt, static, guide, and proportional browser checks.
- [x] Inspect the final diff and record review/evidence.

## Verification

| Check                    | Result                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------- |
| Tests                    | Pass: backend 87 files / 615 tests; prompts 5/5; focused backend 2 files / 25 tests    |
| Lint/typecheck/build     | Pass: backend lint/typecheck/build; prompts lint/typecheck/build; web lint/typecheck   |
| Runtime/browser/database | Pass: focused Chromium E2E and isolated agent-browser journey with disposable services |
| Documentation/user-flow  | Pass: guide validation and `dictionary-platform` revision check                        |

## Outcome and evidence

- Changes made: provider-delta validation now preserves novel requested fields
  while filtering non-Source values equal to the current value or an excluded
  earlier suggestion. Requested fields may be omitted when no new value exists.
  A Source suggestion equal to the current Source becomes `unchanged`, while an
  unrequested field or historical Source alternative remains invalid. The local
  prompt tells the model to omit fields with no meaningful alternative instead
  of repeating a value or failing the response.
- Root cause: the former all-or-nothing validator required one distinct value for
  every requested field. A stable field such as transcription could repeat its
  current value and convert an otherwise useful generation into
  `invalid_model_output`, producing the generic web error. Changing context did
  not help when another requested stable field repeated.
- Commands and results:
    - Regression-first generator tests failed on missing, repeated-current, and
      repeated-Source output before normalization, then passed 7/7.
    - Focused final backend tests passed 2 files / 25 tests; prompt tests passed
      1 file / 5 tests.
    - Full backend suite passed 87 files / 615 tests with 21 files / 173 tests
      skipped; backend lint, typecheck, and build passed.
    - Prompt lint, typecheck, and build passed; web lint and typecheck passed.
    - Focused Playwright Chromium scenario
      `saved-card-inline-ai-authoring-preserves-advanced-rewrite` passed against
      disposable PostgreSQL (`languon_partial_authoring_e2e`) and Redis: a saved
      populated card added context, made no field edit, selected **Generate all**,
      and reached review.
    - Project-pinned agent-browser session
      `languon-card-authoring-partial-096b42f00513194dcc17ef16d6ddcc1f`
      verified the same existing card at the desktop viewport: without changing
      any field, **Generate all** produced review actions for Translation,
      Definition, Context example, and Example translation. The enqueue returned
      202 and the job read returned 200. No runtime browser errors appeared; two
      observed 401 refresh requests occurred before synthetic sign-in and were
      expected. The browser, local processes, and disposable containers were
      closed/stopped afterward.
    - `pnpm docs:user-flows:check`,
      `pnpm user-flow:e2e -- check dictionary-platform`, Prettier, and
      `git diff --check` passed.
    - Tested state is base commit `42f9850` plus the current patch. Key final
      hashes: domain validator
      `1b5cbc089f039630d2872edeb1d28396f6913de57613f6ef7faaadb200c2ae9e`,
      adapter tests
      `62d464292cd1b29a6c1efc7ed186cbff4e0aa82f48aaa2f4e2d2bdb2a554d99c`,
      worker tests
      `181051be0e3f0ba4d967a9ec6c1d712db78d237a102834cf903c76e1740c3a68`,
      and prompt
      `ce4298943257e8be70157ddc170eaa4bb0da596e36e3cf4e2cf5a3ace99fe492`.
- Documentation: updated the inline-authoring flow and mapped saved-card scenario
  to state that no manual field edit is required and one unchanged field does not
  discard novel suggestions.
- Review: scoped review of the complete diff found no material findings. Output
  remains schema-bounded and requested-field-only; field uniqueness, usage
  limits, historical Source exclusion, review-before-save, and tenant/job
  boundaries are unchanged. No database, security-policy, or public-contract
  change was introduced.

## Remaining risks

- A model can still return no novel values at all. That now completes safely as
  an unchanged/empty review rather than a provider failure, and the learner can
  refine context and retry; the system cannot guarantee semantic novelty from a
  nondeterministic provider.
- No paid live-provider call was made. Deterministic boundary tests prove
  normalization and browser tests prove the end-to-end saved-card journey, but
  not the quality of a particular production model response.
