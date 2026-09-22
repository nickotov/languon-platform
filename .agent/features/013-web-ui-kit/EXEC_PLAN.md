# ExecPlan: Web UI Kit

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-08-17

## Goal

Deliver the approved web UI kit and migrate the current public web surface to it.

## Specification

- In scope: See `FEATURE.md`.
- Out of scope: See `FEATURE.md`.

## Existing architecture

- ADR-0005 requires app-local `shared/ui`, CSS Modules, stories, and native-first semantics.
- ADR-0007 supplies the typed four-language catalog and cookie preference pattern.
- Current UI is implemented through `apps/web/src/app/globals.css` and ad-hoc class names.
- `design/DESIGN_SYSTEM.md` specifies tokens and 26 Pencil symbols; `main.pen` is currently blank.

## Acceptance criteria

- [x] AC-1 — Tokens and persisted themes match the design contract.
- [x] AC-2 — Shared UI inventory is accessible, typed, story-covered, and localized by caller-provided content.
- [x] AC-3 — Current pages use the kit while preserving existing journeys.
- [x] AC-4 — Storybook, design sources, ADRs, agent guidance, and user-flow traceability are current.

## Test strategy

- Unit: Required — theme resolution, field association, native states, and UI behavior.
- Integration/contract: Not applicable — no API or persistence contract changes.
- E2E: Required — theme persistence plus existing authentication/i18n journeys.
- Browser/device: Required — desktop and 320px visual/keyboard evidence.
- Database migration: Not applicable.
- User-flow guide: Required — `docs/user-flows/web-ui-kit.md`.
- User-flow E2E: Required — `theme-preference-persistence` in the new Playwright file.

## Milestones

- [x] M1 — Foundation and catalog
    - Objective: tokens, themes, fonts, Storybook, and shared primitives.
    - Acceptance criteria: AC-1, AC-2.
- [x] M2 — Application migration and traceability
    - Objective: replace current styling, add preference journey and design/docs updates.
    - Acceptance criteria: AC-3, AC-4.
- [x] M3 — Full validation and review
    - Objective: tests, browser evidence, independent review, and remediation.
    - Acceptance criteria: AC-1 through AC-4.

## Progress

- 2026-08-17 — Created feature branch/workspace and reconfirmed architecture,
  design contract, guides, and user-approved scope. Next: foundation implementation.
- 2026-08-17 — Implemented semantic tokens, self-hosted fonts, SSR theme
  persistence, the complete shared primitive catalog, and Storybook.
- 2026-08-17 — Migrated the current web pages and controls, rebuilt the Pencil
  board, and synchronized ADR, architecture, agent, and user-flow documentation.
- 2026-08-17 — Passed unit, E2E, browser, static, catalog, and production-build
  checks; resolved all independent review findings. Feature complete.

## Decisions

- D1 — Design source authority: `design/` remains authoritative; CSS and stories are implementations. ADR-0008.
- D2 — Theme transport: a non-sensitive cookie is SSR-resolved, matching the existing locale pattern. ADR-0008.
- D3 — Native controls remain default; Radix is permitted only for advanced interaction contracts. ADR-0008.

## Discoveries

- The blank `main.pen` contradicts completed historical evidence; replacement is an explicit feature deliverable.
- Advanced native-first primitives needed explicit keyboard/focus and lifecycle
  contracts; focused tests now cover combobox, menu, popover, dialog, tooltip,
  tabs, Field, checkbox, Button, and toast behavior.
- The aggregate format command also inspects an unrelated pre-existing correction
  document. Feature-owned files pass formatting independently; that user-owned
  file was preserved.

## Validation

| Check              | Status         | Evidence                                                          |
| ------------------ | -------------- | ----------------------------------------------------------------- |
| Unit               | Passed         | Web 55/55; full repository tests passed                           |
| Integration        | Passed         | Existing auth integration suites passed                           |
| Contract           | Passed         | Existing contracts suites passed                                  |
| E2E                | Passed         | Playwright 6/6 with disposable PostgreSQL and Redis               |
| Browser/device     | Passed         | Desktop Chromium E2E and managed 320×800 dark/reload verification |
| Typecheck          | Passed         | Web and full repository typecheck                                 |
| Lint               | Passed         | Web and full repository lint                                      |
| Build              | Passed         | Web production, Storybook, and full repository build              |
| Database migration | Not applicable |                                                                   |
| User-flow guide    | Passed         | Four guides and mappings validated                                |
| User-flow E2E      | Passed         | `theme-preference-persistence` synchronized and executed          |
| Independent review | Approved       | No critical, high, or material medium findings remain             |
| Security review    | Not applicable | No security policy or sensitive-data boundary changed             |

## Remaining work

- None.
