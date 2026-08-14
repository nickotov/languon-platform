# Project Prettier Standard

Status: Complete
Owner: Engineering agents
Created: 2026-08-14

## Problem

The repository already installs and runs Prettier, but its configuration uses
two-space indentation and double-quoted JavaScript/TypeScript strings. That does
not match the requested project style, and generated Next.js declaration files
can create format churn if the quote rule changes.

## Desired behavior

The project-pinned Prettier formats supported source and documentation with four
spaces, semicolons, and single quotes where the language/parser supports them.
Next.js-generated `next-env.d.ts` files are excluded. `pnpm format` produces a
stable tree and `pnpm format:check` plus repository validation pass.

## Acceptance criteria

- [x] AC-1 — Root Prettier configuration enforces four-space indentation,
      semicolons, and single quotes for JavaScript/TypeScript and JSX.
- [x] AC-2 — Generated/cache/dependency artifacts, including Next.js
      `next-env.d.ts`, remain outside formatting ownership.
- [x] AC-3 — `pnpm format` reformats the checked-in repository consistently and
      a second format pass is idempotent.
- [x] AC-4 — Formatting, user-flow validation, lint, typecheck, tests, and build
      pass without semantic product changes.

## Scope

### In scope

- Update the existing root Prettier/editor configuration and ignore file.
- Reformat all Prettier-owned checked-in files.
- Verify the complete repository after the mechanical rewrite.

### Out of scope

- Replacing Prettier, adding a second formatter, or changing ESLint rules.
- Product behavior, contracts, persistence, dependencies, or runtime topology.
- Editing generated output or the user's existing `next-env.d.ts` changes.

## Constraints and risks

- JSON syntax always requires double quotes; “mostly single quotes” applies
  where Prettier and the language support the choice.
- A repository-wide mechanical diff can hide accidental semantic edits; review
  and full validation are required.
- Formatting user-flow guides may change their revision hash even when behavior
  is unchanged; traceability must be revalidated and remediated if necessary.

## User-flow documentation

- Required: No. This is a source-formatting standard and adds no executable
  product or developer journey.
- Guide: Not applicable.
- Related guides: `docs/user-flows/user-authentication.md` may be mechanically
  reformatted; its behavior and commands must remain unchanged.
- E2E synchronization: Revalidate guide mappings. Run mapped E2E only if the
  formatter changes test-relevant guide content or revision markers.

## Open decisions

- None. The user specified the formatting outcomes.
