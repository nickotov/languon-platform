# Improvement: Dependent card field regeneration

Status: Complete
Created: 2026-09-28
Updated: 2026-09-28

## Routing decision

- Intended outcome: Keep AI-generated card fields coherent when Translation or
  Context example is regenerated.
- Why this is an improvement rather than a correction: This is a focused
  enhancement of the existing inline field-generation journey across its domain
  rule and visible progress state; it adds no new journey or capability.
- Explicit-feature check: the user did not request a feature or full feature lifecycle.
- Feature boundaries checked: no new public contract, persistence, security/auth
  policy, production dependency, deployment, migration, or ADR-worthy architecture
  decision is required.
- Escalation rule: stop, mark this record `Escalated`, and request explicit feature
  authorization before crossing any feature boundary.

## Context and scope

- Current behavior: Every per-field AI action requests only that field, so a new
  Translation can leave Definition, Context example, and Example translation based
  on the previous meaning, and a new Context example can leave its translation stale.
- Expected behavior: In `card-authoring:v2`, Translation regeneration requests all
  enabled non-Source fields in one coherent provider call. Context example
  regeneration also requests Example translation when that field is enabled.
- In scope: v2 field resolution, provider input, form progress presentation,
  regression tests, and the mapped dictionary-platform user-flow guide.
- Out of scope: automatic paid generation while typing, v1 drain semantics,
  persistence or API shape changes, and Source regeneration behavior.
- Likely files/surfaces: dictionary card-authoring domain logic, inline authoring UI,
  backend/web tests, and `docs/user-flows/dictionary-platform.md`.
- Relevant ADRs or constraints: ADR-0016 requires real-browser verification for the
  user-visible progress behavior; v1 jobs remain drainable with their original scope.
- Related user-flow guides: `dictionary-platform`.
- Rollback/removal path: Revert the v2 dependency expansion and matching progress
  helper; no data rollback is required.

## Acceptance criteria

- AC-1 — Regenerating Translation in v2 regenerates Translation and every enabled
  non-Source field, while Source remains unchanged.
- AC-2 — Regenerating Context example in v2 regenerates Example translation when it
  is enabled, and excludes it when disabled.
- AC-3 — The form replaces every affected input with generation progress and then
  presents the returned field reviews through the existing accept/reject flow.
- AC-4 — Other per-field actions and legacy v1 field-local jobs retain their current
  behavior.

## Plan

Follow `.agent/DELIVERY.md`.

- [x] Implement the focused improvement.
- [x] Add or update the smallest reliable regression coverage when useful.
- [x] Run targeted validation.
- [x] Update affected documentation and mapped E2E traceability.
- [x] Verify the visible behavior in a real browser.
- [x] Inspect the final diff and record results below.

## Verification

| Check                    | Result                                                                                                                                                                                       |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests                    | Pass — backend domain 11/11; web authoring 50/50; broader backend 608 passed and web 229 passed before the final UI-only compatibility remediation; mapped Playwright 1/1 on the final patch |
| Lint/typecheck/build     | Pass — backend and web lint/typecheck; backend and final web production builds                                                                                                               |
| Runtime/browser/database | Pass — managed Chromium at 1280×720 and 320×900 against disposable PostgreSQL/Redis and deterministic AI; database schema unchanged                                                          |
| Documentation/user-flow  | Pass — dictionary-platform guide, revision marker, guide validation, and mapped traceability check                                                                                           |

## Outcome and evidence

- Changes made: v2 Translation field actions now request every enabled non-Source
  field in one provider call; v2 Context example actions also request Example
  translation when enabled. The form applies the same dependency graph to its
  progress replacements. Legacy v1 actions remain field-local.
- Commands and results:
    - `pnpm exec vitest run tests/unit/modules/dictionaries/domain/card-authoring.test.ts`
      in `apps/backend` — pass, 11/11.
    - `pnpm exec vitest run tests/dictionary-card-authoring.test.tsx` in
      `apps/web` — pass, 50/50 on the final patch.
    - `pnpm --filter @languon/backend typecheck`, `lint`, and `build` — pass.
    - `pnpm --filter @languon/web typecheck`, `lint`, and final `build` — pass.
    - Focused mapped Playwright journey for replacement inline AI field reviews —
      pass, 1/1 in Chromium on the final patch using
      task-owned disposable PostgreSQL/Redis and the deterministic provider; the
      containers were removed afterward.
    - `pnpm docs:user-flows:check` and
      `pnpm user-flow:e2e -- check dictionary-platform` — pass.
    - `pnpm browser:check` — pass, 9 wrapper tests and the real headless launch.
      Managed-browser session
      `languon-dependent-fields-410fcbc03997bc0c124811fce9b725b1` observed
      Translation progress replacing Translation, Definition, Context example,
      and Example translation while Source remained editable; Context example
      progress then replaced only Example and Example translation. Both review
      groups appeared after deterministic completion. The controls remained
      accessible at 320×900. Page errors were empty, console output contained only
      development/HMR messages, and generation requests returned 202 followed by
      successful job reads. The session and disposable services were closed. This
      browser run preceded the v1-only compatibility gate; its v2 branch was
      unchanged, the final rendered regression covers both formats, and final
      Playwright reconfirmed v2 behavior.
    - `git diff --check` — pass.
- Documentation: updated the inline authoring section of
  `docs/user-flows/dictionary-platform.md`, its mapped journey, and revision
  marker.
- Review: independent initial review found one medium v1 progress mismatch and a
  rendered-progress evidence gap. Remediation passed `ai.format` into the helper,
  gated dependency expansion to v2, and added a rendered v1/v2 regression.
  Independent remediation review approved the final patch with no remaining
  material findings.

## Remaining risks

- No known material risks. Manual typing does not trigger paid generation; these
  dependency rules apply when the user explicitly invokes the field AI action.
