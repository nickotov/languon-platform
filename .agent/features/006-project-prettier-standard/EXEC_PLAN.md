# ExecPlan: Project Prettier Standard

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-08-14

## Goal

Adopt and apply one stable repository-wide Prettier style: four spaces,
semicolons, and single quotes where supported.

## Specification

- In scope: See `FEATURE.md`.
- Out of scope: See `FEATURE.md`.

## Existing architecture

- Prettier 3.9.6 is already a pinned root dev dependency.
- Root scripts already expose `pnpm format` and `pnpm format:check`; `pnpm check`
  begins with the format gate.
- `.prettierrc.json` currently sets semicolons and trailing commas but retains
  double quotes and the default two-space indentation.
- `.prettierignore` excludes dependencies, build/cache output, lockfile, Expo
  state, and generated Drizzle metadata, but not Next.js `next-env.d.ts`.
- No ADR governs formatting. The requested reversible tooling convention is
  fully expressed by the checked-in formatter config and does not need an ADR.

## Acceptance criteria

- [x] AC-1 — Requested style is configured.
- [x] AC-2 — Generated files are excluded.
- [x] AC-3 — Repository is formatted and idempotent.
- [x] AC-4 — Full validation passes with no semantic change.

## Test strategy

- Unit: Not required — no executable logic is introduced.
- Integration: Not required — no boundary changes.
- Contract: Not required — no contract changes.
- E2E: Conditional — only if user-flow revision/behavior changes.
- Browser/device: Not required — formatting must not alter rendering or behavior.
- Database migration: Not required — no persistence changes.
- User-flow guide: Not required; mechanically inspect any guide diff.
- User-flow E2E: Run inspect/check for `user-authentication`; execute mapped E2E
  only if guide/test-relevant content changes.

## Milestones

- [x] M1 — Exploration and design
    - Objective: Confirm current formatter/tooling and generated-file boundaries.
    - Components: Root configuration, ignore rules, scripts, repository guidance.
    - Acceptance criteria: AC-1 and AC-2 design established.
    - Required tests: Configuration/source inspection.
    - Evidence: Prettier is already installed; config/ignore gaps identified.
- [x] M2 — Configuration and repository format
    - Objective: Apply requested config and format all owned files.
    - Components: `.prettierrc.json`, `.prettierignore`, `.editorconfig`,
      repository files.
    - Acceptance criteria: AC-1 through AC-3.
    - Required tests: Two formatter passes and guide-diff inspection.
    - Evidence: Root config and ignore rules updated; 229 files formatted;
      `pnpm format:check` and `git diff --check` pass.
- [x] M3 — Full validation and review
    - Objective: Prove the mechanical rewrite is safe and independently reviewed.
    - Components: Complete diff and feature artifacts.
    - Acceptance criteria: AC-4.
    - Required tests: `pnpm check`, guide traceability, independent review.
    - Evidence: `pnpm check`, guide validation, and E2E mapping checks pass;
      independent review found no material issues.

## Progress

- 2026-08-14 — Classified as a feature, created the feature branch/artifacts,
  inspected current Prettier ownership, and defined generated-file safeguards.
  Next: configure and run Prettier.
- 2026-08-14 — Applied the requested style across all Prettier-owned files. The
  first sandboxed write could not update read-only skill files, so the same
  repository formatter command was rerun with approved write access.
- 2026-08-14 — Fixed the user-flow frontmatter parser to accept Prettier's
  four-space list indentation while retaining compatibility with existing
  two-space input; added a regression test and revalidated guide mappings.
- 2026-08-14 — `pnpm check` passed after one lint-only test-regex correction.
  Restored the user's pre-existing generated `next-env.d.ts` changes after the
  Next production build rewrote them, and aligned `.editorconfig` with the
  four-space standard. Next: independent review and delivery.
- 2026-08-14 — Independent review compared the complete rewrite with a fresh
  formatting baseline and found no material issues. Feature is complete and
  ready for squash delivery.

## Decisions

- D-1 — Single-quote coverage.
    - Context: Prettier's `singleQuote` does not affect JSX attributes.
    - Choice and rationale: Enable both `singleQuote` and `jsxSingleQuote` so
      single quotes are used wherever Prettier supports the choice; JSON remains
      double-quoted by language requirement.
    - Alternatives rejected: `singleQuote` alone, which would leave widespread
      JSX double quotes contrary to the requested style.
    - ADR impact: Not ADR-worthy; reversible formatter configuration.
- D-2 — Generated declarations.
    - Context: Next.js regenerates `next-env.d.ts` with its own quote style.
    - Choice and rationale: Ignore `apps/*/next-env.d.ts` to avoid perpetual churn
      and preserve the user's existing generated changes.
    - Alternatives rejected: Formatting/committing generated declarations, which
      Next development immediately rewrites.
    - ADR impact: Not ADR-worthy.

## Discoveries

- The request does not require adding a dependency because Prettier 3.9.6 is
  already installed and pinned at the root.
- The custom user-flow frontmatter parser originally recognized exactly two
  spaces before list items. Prettier correctly emits four spaces under the new
  project standard, so the parser now accepts list indentation of two or more
  spaces and has focused regression coverage.

## Validation

| Check              | Status         | Evidence                    |
| ------------------ | -------------- | --------------------------- |
| Unit               | Passed         | 16 guide/parser tests       |
| Integration        | Not applicable | No boundary changes         |
| Contract           | Not applicable | No contracts                |
| E2E                | Not run        | No test-relevant change     |
| Browser/device     | Not applicable | Mechanical formatting only  |
| Typecheck          | Passed         | `pnpm check`                |
| Lint               | Passed         | `pnpm check`                |
| Build              | Passed         | 7/7 workspace builds        |
| Database migration | Not applicable | No persistence changes      |
| User-flow guide    | Passed         | Behavior/commands unchanged |
| User-flow E2E      | Passed         | Inspect/check synchronized  |
| Independent review | Passed         | No material findings        |
| Security review    | Not applicable | No security surface         |

## Remaining work

- Squash-deliver the complete feature to main while excluding the user's two
  unrelated generated declaration changes.
