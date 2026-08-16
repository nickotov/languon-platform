# ExecPlan: Languon design system blueprint

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-08-16

## Goal

Give future Languon visual design and frontend work one verified, prompt-ready
design-system blueprint for an accessible adult learner/tutor experience on web
and native mobile.

## Specification

- In scope: See `FEATURE.md`.
- Out of scope: See `FEATURE.md`.

## Existing architecture

- `apps/web` currently carries warm cream/forest ad hoc global CSS; `apps/mobile`
  repeats those raw values in a screen stylesheet; admin has an unrelated dark shell.
- No shared UI primitives, stories, theme contract, or design token package exists.
- `design/main.pen` is user-owned and contains one blank 800x600 frame; it must not
  be changed by this documentation feature.
- ADR-0005 requires web/admin primitives under app-local `shared/ui`, colocated
  stories, and accessible native elements before custom interaction machinery.
- Root instructions prohibit application-source imports across `apps/*`; a future
  runtime token-sharing decision is outside this blueprint.
- No user-flow guide maps `design/` or this feature slug.

## Acceptance criteria

- [x] AC-1 — Research, principles, and direction are documented.
- [x] AC-2 — Exact foundations and verified contrast pairs are documented.
- [x] AC-3 — Core component requirements and state matrices are documented.
- [x] AC-4 — Cross-platform accessibility requirements are documented.
- [x] AC-5 — Generation and future implementation guidance are documented.
- [x] AC-6 — Repository documentation is aligned without runtime changes.
- [x] AC-7 — Targeted validation and independent review are complete.

## Test strategy

- Unit: Not required — no executable logic changes. Contrast calculations use a
  deterministic read-only Node command and are recorded as evidence.
- Integration: Not required — no service or application integration changes.
- Contract: Not required — no runtime API, schema, event, or package export changes.
- E2E: Not required — no executable journey changes.
- Browser/device: Not required — no rendered UI changes; the document specifies the
  browser/device matrix required when primitives are later implemented.
- Database migration: Not required — no persistence changes.
- User-flow guide: Not required — documentation-only design capability has no
  executable journey and changes no existing guide behavior or source mapping.
- User-flow E2E: Not required for the same reason.
- Security review: Not required — no authentication, data, rendering, external URL
  execution, model tool, secret, or trust-boundary behavior changes.
- Static and manual: Required — focused Prettier, repository documentation checks,
  source-link reachability, contrast matrix, diff inspection, tester, and reviewer.

## Milestones

- [x] M1 — Establish specification and foundations
    - Objective: Record scope, decisions, research, visual identity, and exact tokens.
    - Components: Feature artifacts and `design/DESIGN_SYSTEM.md` foundations.
    - Acceptance criteria: AC-1, AC-2, AC-4.
    - Required tests: Contrast matrix and source-link verification.
    - Evidence: Blueprint sections 1–8 and 11; 62 contrast assertions pass and
      all 12 external reference links return HTTP 200.
- [x] M2 — Complete component and handoff blueprint
    - Objective: Specify component families, state/behavior contracts, future
      validation, and the visual-generation prompt; document `design/` in README.
    - Components: `design/DESIGN_SYSTEM.md`, `README.md`.
    - Acceptance criteria: AC-3, AC-5, AC-6.
    - Required tests: Focused formatting, content audit, and diff inspection.
    - Evidence: Blueprint sections 9–15, README structure entry, focused and full
      Prettier checks, lint, user-flow documentation check, and clean diff check.
- [x] M3 — Validate, independently review, and finish
    - Objective: Run proportional checks, independent tester/reviewer passes,
      remediate findings, and synchronize durable evidence.
    - Components: All feature files and final diff.
    - Acceptance criteria: AC-7 and final audit of AC-1 through AC-6.
    - Required tests: Static checks, tester pass, reviewer pass, final Git audit.
    - Evidence: Formatting, lint, user-flow documentation, link, contrast, hash,
      and diff checks pass. Independent tester and reviewer findings were
      remediated and their final passes found no unresolved material issues.

## Progress

- 2026-08-16 — Created the feature branch and durable workspace after repository,
  ADR, application style, project-description, and user-flow exploration.
- 2026-08-16 — Locked product decisions: public web/mobile, adults 18–45, warm
  editorial, fresh ink-violet/coral palette, Literata plus Manrope, calm motion,
  system theme with override, English Markdown, and unchanged `.pen` canvas.
- 2026-08-16 — Completed M1/M2: authored the initial 719-line blueprint, verified 36
  contrast pairs and 12 source links, documented `design/`, and passed format,
  lint, user-flow documentation, and diff checks.
- 2026-08-16 — Completed M3: remediated tester and reviewer findings with exact
  state mappings, stronger surface boundaries, language metadata, persistent
  actionable notifications, reusable empty/error states, and precise reflow
  wording. The final 787-line blueprint has 62 verified contrast pairs.

## Decisions

- D1 — Documentation-first design contract
    - Context: The user needs requirements that can generate design later, not live UI.
    - Choice and rationale: Produce one Markdown source of truth and preserve the
      empty `.pen` board for the later visual phase.
    - Alternatives rejected: `.pen`-only content is harder to diff and review;
      implementing components would exceed the approved scope.
    - ADR impact: Not ADR-worthy; future runtime sharing may require a separate ADR.
- D2 — Fresh adult editorial identity
    - Context: Existing forest values are placeholders and the user approved a reset.
    - Choice and rationale: Ink-violet provides distinctive primary/AI emphasis,
      coral adds human warmth, and green is reserved for semantic success.
    - Alternatives rejected: Evolving forest, green/violet dual branding, playful
      education, and cool AI-minimal directions.
    - ADR impact: Product/design decision, not an architecture decision.
- D3 — Cross-platform semantics, platform-native behavior
    - Context: Web and React Native cannot safely share application source or every
      interaction primitive.
    - Choice and rationale: Share names and intent in the blueprint while requiring
      native semantics and platform-specific hit-size/overlay behavior.
    - Alternatives rejected: One cross-app component implementation or web behavior
      copied into native mobile.
    - ADR impact: Consistent with accepted ADR-0005; no new ADR.

## Discoveries

- The intended top-level `design/` directory already exists only as untracked user
  work, containing `main.pen`; adding a tracked Markdown source also requires a
  repository-structure entry in `README.md`.
- Current web/mobile colors match one another but have no dark theme, semantic tiers,
  or reusable primitive layer; admin is currently dark-only and outside approved scope.
- Official 2025–2026 platform direction favors more expressive type, shape, and
  motion while Apple explicitly recommends sparse glass effects and testing reduced
  transparency/motion. The blueprint adopts the durable parts and constrains effects.

## Validation

| Check              | Status         | Evidence                              |
| ------------------ | -------------- | ------------------------------------- |
| Unit               | Not applicable | Documentation-only feature            |
| Integration        | Not applicable | No service changes                    |
| Contract           | Not applicable | No runtime public interfaces          |
| E2E                | Not applicable | No executable journey                 |
| Browser/device     | Not applicable | No rendered UI                        |
| Typecheck          | Not applicable | No TypeScript changes                 |
| Lint               | Passed         | `pnpm lint`                           |
| Build              | Not applicable | No build inputs changed               |
| Database migration | Not applicable | No persistence changes                |
| User-flow guide    | Not applicable | No executable behavior/source mapping |
| User-flow E2E      | Not applicable | No affected guide                     |
| Independent tester | Passed         | Initial finding fixed; final re-check |
| Independent review | Passed         | All four findings fixed and rechecked |
| Security review    | Not applicable | No security-sensitive behavior        |

## Remaining work

- None.
