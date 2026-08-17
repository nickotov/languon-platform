# Web UI Kit

Status: Complete
Owner: Codex
Created: 2026-08-17

## Problem

The web app has ad-hoc global styles and repeated native controls, while the
approved design contract has no runtime implementation, visual catalogue, or
enforced source-of-truth workflow.

## Desired behavior

The public web app uses an accessible, localized, light/dark/system themed UI
kit. Every documented primitive has a CSS-Module implementation and Storybook
story, while the existing home, authentication, security, language, and theme
controls use matching primitives.

## Acceptance criteria

- [x] AC-1 — Implement semantic global tokens and an SSR-safe persisted
      light/dark/system preference using the approved design values.
- [x] AC-2 — Implement every core web primitive in `shared/ui` with TSX, CSS
      Modules, typed public exports, accessible native-first behavior, and stories.
- [x] AC-3 — Configure Storybook and verify the full component catalogue builds.
- [x] AC-4 — Migrate all current web UI away from ad-hoc global control styles
      without changing authentication, route, or localization behavior.
- [x] AC-5 — Synchronize `design/`, architecture/agent documentation, Pencil
      board, user-flow E2E coverage, and durable evidence.

## Scope

### In scope

- `apps/web` only: tokens, fonts, themes, shared UI, Storybook, and page migration.
- A new `web-ui-kit` browser journey for preference persistence.
- ADR-0008, architecture and agent-facing design-source instructions.

### Out of scope

- Admin and React Native runtime implementations.
- Product-specific course, tutor, chat, navigation, and gamification patterns.
- Authentication, API, database, or authorization changes.

## Constraints and risks

- `design/DESIGN_SYSTEM.md` and `design/main.pen` are the visual contract;
  runtime code follows them and does not become a competing source of truth.
- The existing `main.pen` is an empty frame despite historical evidence; rebuild
  it and record the discrepancy in this feature rather than altering closed history.
- The theme cookie is non-sensitive, allowlisted, `Path=/`, and `SameSite=Lax`.

## User-flow documentation

- Required: Yes — `docs/user-flows/web-ui-kit.md`.
- Related guides: `user-authentication` and `web-i18n-support`; their existing
  behavior remains stable and their mapped journeys will be re-run.
- E2E synchronization: `theme-preference-persistence` in
  `apps/web/tests/e2e/ui-kit.journeys.spec.ts` using `web-playwright`.

## Open decisions

- Resolved: full documented inventory, persisted Light/Dark/System preference,
  and a rebuilt synchronized Pencil board were approved by the user.
