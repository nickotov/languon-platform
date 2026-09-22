# ExecPlan: Faithful Magic Patterns UI kit and auth implementation

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-09-14

## Goal

Replace the approximate web UI kit/auth styling with a faithful runtime implementation of the supplied current Magic Patterns sources, verified against real Languon behavior.

## Specification

- In scope: See `FEATURE.md`.
- Out of scope: See `FEATURE.md`.

## Existing architecture

`apps/web` is Next.js 16/App Router with pages-first FSD, app-local primitives, CSS Modules, Storybook, request-locale i18n, theme cookies, and real capability-driven auth. ADR-0005 and ADR-0016 remain binding. The Magic design defines 141 design-system files and 40 auth files, exact CSS variables, Tailwind v3 utilities, Inter, and Lucide. ADR-0017 records the runtime mapping. The prototype's React Router, mock auth, simulated failures, OAuth providers, roles, consent, and remembered-session UI do not map to current product contracts.

## Acceptance criteria

- [x] AC-1 — Exact token contract and dark mappings are present.
- [x] AC-2 — Tailwind/Inter/Lucide configuration matches the design source.
- [x] AC-3 — All auth routes share the faithful responsive shell/card composition.
- [x] AC-4 — Auth primitives and states match the supplied component language.
- [x] AC-5 — Existing real auth behavior and accessibility remain correct.
- [x] AC-6 — Required verification and review are complete.

## Test strategy

- Unit/component: required — auth forms, i18n, and shared UI regression suite.
- Integration/contract: existing auth frontend contract tests required; no backend contract changes.
- E2E: required — existing mapped auth journeys because all critical auth screens change visually.
- Browser/device: required — 375x812 and 1440x1000, light/dark, login/signup/recovery/verification, focus and error/loading states.
- Database migration: not required — no persistence changes.
- User-flow guide: required — update `docs/user-flows/user-authentication.md` source mapping.
- User-flow E2E: required — `signup-verification-refresh-logout`, `password-reset-session-revocation`, and `passkey-lifecycle` in `apps/web/tests/e2e/auth.journeys.spec.ts`.

## Milestones

- [x] M1 — Exploration and design
    - Objective: retrieve and inventory the complete current Magic design-system/auth sources and reconcile them with runtime contracts.
    - Components: 141 design-system files, 40 auth files, web architecture, auth routes/forms, shared UI, i18n, ADRs.
    - Acceptance criteria: source/token/component inventory and explicit mock/unsupported-behavior boundary.
    - Required tests: none (read-only discovery).
    - Evidence: sources materialized under task-local `/tmp/languon-magic-ds` and `/tmp/languon-magic-auth`; ADR-0017.
- [x] M2 — Implementation and targeted verification
    - Objective: implement the exact token/Tailwind contract, shared auth primitives, and responsive auth composition.
    - Components: globals, Tailwind/PostCSS, shared UI, auth feature, locale messages, workspace dependencies.
    - Acceptance criteria: AC-1 through AC-5.
    - Required tests: web typecheck, unit/component tests, lint, build.
    - Evidence: 142 tests, typecheck, lint, format, Tailwind compile, Storybook catalog build, and canonical production webpack build pass; see `EVIDENCE.md`.
- [x] M3 — Full validation and review
    - Objective: verify real rendering and journeys, remediate review findings, and squash-merge to main.
    - Components: browser evidence, user-flow traceability/E2E, final diff and review artifacts.
    - Acceptance criteria: AC-6 and all earlier criteria audited.
    - Required tests: mapped E2E, browser verification, docs checks, independent reviewer/tester.
    - Evidence: mapped auth E2E 3/3 and UI-kit E2E 1/1, final 375/1440 light/dark browser screenshots with no errors, user-flow checks, independent approval after remediation, and security review; see `EVIDENCE.md` and `REVIEW.md`.

## Progress

- 2026-09-14 — Retrieved and inventoried the complete current Magic sources; confirmed previous implementation drifted from exact variables and auth composition.
- 2026-09-14 — Added Tailwind v3/PostCSS, Inter, Lucide, exact Magic variables, compatibility aliases, auth-shell composition, and matching shared-control treatments; the initial 134-test suite passed before expanded catalog coverage was added.
- 2026-09-14 — Completed light/dark responsive browser QA and all three mapped real-stack auth journeys; independent review/test/security audits followed.
- 2026-09-14 — Wired every real auth action to the supplied loading treatment, added deferred-request regression coverage, restored generated Next type references, and selected Next's stable webpack builder after its default Turbopack production build repeatedly stalled.
- 2026-09-14 — Independent review identified that the initial auth-only primitive subset did not satisfy the requested ready-design catalog. Scope was corrected to port the complete user-facing Magic component catalog and restore system-theme/contrast behavior before handoff.
- 2026-09-14 — Ported and publicly exported the full user-facing catalog, compiled every story, corrected the AuthCard sibling footer hierarchy, and passed the mapped UI-kit journey after restoring accessible target sizing.
- 2026-09-14 — Remediated final review findings in compound Popover behavior, complete public barrel contracts, dialog elevation, and recovery/reset/verification footer hierarchy; integrated suite passes 142 tests.

## Decisions

- D-1 — Direct Magic token contract. Context: approximate `--sys-*` translation produced unacceptable drift. Choice: preserve the supplied variable names/values and map Tailwind directly to them, with aliases only for existing consumers. Alternative rejected: another hand-translated theme. ADR impact: Accepted ADR-0017.
- D-2 — Real behavior over prototype mocks. Choice: preserve actual capability gating, passkeys, i18n, password policy, and routes while omitting unsupported OAuth/roles/consent/remember controls. Alternative rejected: nonfunctional or misleading controls. ADR impact: feature-local product integration boundary, also documented by ADR-0017.

## Discoveries

- Magic's auth artifact uses additional unsupported capabilities and mock state; visual fidelity can be exact for structure/tokens/components without copying false product behavior.
- The existing global header owns theme/language selection; the auth shell therefore reuses it instead of duplicating a second theme control.
- The Next 16 default Turbopack production builder repeatedly stalled while webpack completed the same optimized build successfully; the canonical web build script now selects webpack explicitly.

## Validation

| Check              | Status         | Evidence                                  |
| ------------------ | -------------- | ----------------------------------------- |
| Unit               | Pass           | 142 tests                                 |
| Integration        | Pass           | Auth API/form suite                       |
| Contract           | Pass           | Existing auth API/form contract tests     |
| E2E                | Pass           | 3 auth + 1 UI-kit mapped journeys         |
| Browser/device     | Pass           | 320/375/1440, light/dark and auth states  |
| Typecheck          | Pass           | Web workspace                             |
| Lint               | Pass           | Web workspace                             |
| Build              | Pass           | Next webpack production build             |
| Database migration | Not applicable |                                           |
| User-flow guide    | Pass           | 8 guides validated                        |
| User-flow E2E      | Pass           | user-authentication mapping and scenarios |
| Independent review | Pass           | Approved after two remediation rounds     |
| Security review    | Pass           | No material findings                      |

## Remaining work

- None.
