# Frontend Development Standards

Status: Complete
Owner: Engineering agents
Created: 2026-08-14

## Problem

Languon documents its pages-first Feature-Sliced Design direction but does not
define a complete component/logic convention or automatically reject invalid
frontend imports. Agents can place hooks, helpers, state, API access, components,
and design-system primitives inconsistently, and aliased imports can invert or
couple FSD layers without a lint failure.

## Desired behavior

A project-local frontend skill gives agents concise, actionable rules for web and
admin work. Durable architecture documentation records those rules, and ESLint
rejects upward dependencies, sibling-slice and cross-application imports, and
files outside supported frontend source locations while understanding TypeScript
aliases.

## Acceptance criteria

- [x] AC-1 — A discoverable `$frontend-development` skill defines component
      folders, CSS Modules, hooks/lib/types/model/api placement, private
      subcomponents, public slice APIs, native primitives, design-system stories,
      and proportional verification.
- [x] AC-2 — The skill defines an explicit state-communication decision order
      that avoids unrelated prop drilling and requires typed event infrastructure
      under `shared/lib` when events are justified.
- [x] AC-3 — Root ESLint configuration enforces the pages-first FSD dependency
      direction for both web applications, including `@/*` aliases and sibling
      slices, without breaking valid existing imports.
- [x] AC-4 — Focused automated tests prove allowed downward/app imports,
      rejected upward/sibling/cross-application imports, and rejection of
      unsupported FSD layers and unclassified source folders.
- [x] AC-5 — Accepted architecture documentation and closest frontend agent
      instructions point future work to the standard; format, docs, lint,
      typecheck, tests, build, skill validation, and independent review pass.

## Scope

### In scope

- Add the project-local frontend development skill and UI metadata.
- Add stable ESLint import-boundary and TypeScript alias resolver dependencies.
- Configure and regression-test web/admin FSD boundaries.
- Record the durable convention in architecture documentation and an ADR.
- Connect web/admin agent instructions to the skill.

### Out of scope

- Restructuring existing components to the new folder convention.
- Creating an unused event bus, shared UI primitive, Storybook installation, or
  component generator before a product feature requires it.
- Changing product behavior, visual design, API contracts, or mobile structure.
- Enforcing subjective component anatomy through a custom lint plugin.
- Enforcing internal segment names such as `api`, `hooks`, or `ui` through a
  custom lint plugin; the skill and review workflow govern that convention.

## Constraints and risks

- Current valid application imports must continue to lint.
- Workspace package imports such as `@languon/contracts` are outside FSD layer
  classification and remain governed by package boundaries.
- The lint policy must classify aliases correctly; unresolved aliases would
  create a false sense of enforcement.
- Existing user changes in `apps/admin/next-env.d.ts` and
  `apps/web/next-env.d.ts` remain unrelated and outside feature commits.

## User-flow documentation

- Required: No. This feature changes engineering guidance and static validation,
  not an executable browser, API, admin, mobile, CLI, or system journey.
- Guide: Not applicable.
- Related guides: `docs/user-flows/user-authentication.md` maps `package.json` and
  web source paths; its documented product behavior and commands are unchanged.
- E2E synchronization: Inspect and check the existing authentication mapping.
  Do not rerun behavioral E2E unless test-relevant guide content changes.

## Open decisions

- None. The user supplied the frontend conventions; implementation details use
  established repository architecture and stable tooling.
