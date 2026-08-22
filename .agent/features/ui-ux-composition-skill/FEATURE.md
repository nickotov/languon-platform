# UI/UX composition skill

Status: Complete
Owner: Engineering
Created: 2026-08-22

## Problem

Agents can reproduce provided markup or add controls without first establishing
the screen's task, hierarchy, interaction model, responsive behavior, or design-
system fit. The result can be mechanically dense, visually inconsistent, or
usable only at one viewport even when the underlying feature is correct.

## Desired behavior

Add an implicitly invoked `$ui-ux-composition` repository skill that guides
composition, implementation, and review of product screens. It must reuse the
project's established UI kit and tokens, define a concise screen contract before
layout work, select appropriate disclosure/container patterns, render and verify
relevant states and viewports, and classify visual findings by severity. A
separate concise checklist is loaded only for rendered review.

## Acceptance criteria

- [x] AC-1 — `.agents/skills/ui-ux-composition/` contains a valid `SKILL.md`,
      matching implicit-invocation UI metadata, and only the required checklist
      reference.
- [x] AC-2 — The skill distinguishes Compose, Implement, and Review modes; Review
      is read-only unless the user also asks for fixes.
- [x] AC-3 — The required workflow covers project/design-system inspection,
      screen contract, experience/container selection, material composition plan,
      token/primitives-based implementation, content-fit responsiveness, and
      rendered interaction QA.
- [x] AC-4 — Component, layout, disclosure, overlay, action, accessibility, and
      anti-mechanical-design rules preserve established product semantics and
      visual identity without inventing unrelated behavior.
- [x] AC-5 — `references/review-checklist.md` is a pure post-render verification
      surface organized by blockers, structure, components, rhythm, responsive
      behavior, states, and accessibility without duplicating workflow prose.
- [x] AC-6 — The skill respects Languon's repository authority and routes real-
      browser and automated verification to existing skills rather than replacing
      them.
- [x] AC-7 — Repository skill validation, formatting, realistic forward tests,
      and independent review pass with no material trigger, authority, scope, or
      completion ambiguity; the skill-creator validator is attempted and any
      environment limitation is recorded accurately.

## Scope

### In scope

- The `ui-ux-composition` skill package, Codex UI metadata, and one checklist
  reference.
- Languon-specific authority and verification routing needed to integrate the
  provided workflow safely.
- Package validation, positive/negative trigger evaluation, and forward testing.

### Out of scope

- Redesigning the web dev panel or any product screen in this feature.
- New design tokens, UI primitives, runtime dependencies, routes, or product
  behavior.
- Replacing `frontend-development`, `browser-verification`, `testing`, feature/
  correction routing, or the design source-of-truth policy.

## Constraints and risks

- The frontmatter description is the invocation contract and must stay broad
  enough for weak composition work without swallowing backend-only or style-only
  tasks.
- Review mode must not authorize file mutation.
- Rendered QA is evidence, not a substitute for automated tests or Languon's
  project-pinned browser workflow.
- The checklist must remain one reference hop from `SKILL.md` and contain only
  execution-time verification criteria.

## User-flow documentation

- Not applicable. This changes agent instructions only and adds no executable
  browser, API, mobile, admin, CLI, or system user journey.
- Related guides: none.
- User-flow E2E: not applicable for the same reason.

## Open decisions

- None. The user supplied the skill contract and checklist organization; normal
  repository metadata and authority integration follow existing conventions.
