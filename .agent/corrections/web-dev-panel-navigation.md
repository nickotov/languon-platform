# Correction: Web dev panel section navigation

Status: Complete
Created: 2026-08-22
Updated: 2026-08-22

## Routing decision

- Intended outcome: make the existing command catalog easier to scan with a
  section sidebar, collapsed category panels, and unmistakable unavailable
  command explanations.
- Why this is a correction: this is one bounded presentation/interaction update
  to the established panel; it changes no command execution, HTTP contract,
  persistence, dependency, trust boundary, or executable journey.
- Feature-flow triggers checked: every correction condition in root `AGENTS.md`
  remains true, including its behavior, contract, data, security, dependency,
  deployment, product-decision, coordination, and verification conditions.
- Escalation rule: switch to feature development before continuing if the work
  changes command safety semantics, server APIs, or introduces a dependency.

## Context and scope

- Current behavior: categories form a long flat page, headings have no index,
  all categories are expanded, and unavailable reasons are visually subtle.
- Expected behavior: a sidebar links to every category; category panels are
  collapsed initially and can be opened independently; unavailable cards show a
  labeled reason associated with disabled controls; successful starts clear
  stale selections and rejected batches show an in-viewport explanation.
- In scope: native HTML/CSS/JS, selection/error feedback correction,
  fixture-backed Playwright coverage, existing user-flow/design sources, and
  `$web-dev-panel` maintenance instructions.
- Out of scope: catalog safety decisions, command lifecycle/server behavior,
  dependencies, arbitrary command input, or new command sources.
- Likely files/surfaces: `web-dev-panel/public/**`, panel E2E fixture/tests,
  `docs/user-flows/web-dev-panel.md`, `design/**`, and
  `.agents/skills/web-dev-panel/SKILL.md`.
- Relevant ADRs or constraints: ADR-0013; native browser primitives, server-owned
  process truth, text-only rendering, and the existing design-system contract.
- Related user-flow guide: `docs/user-flows/web-dev-panel.md`; its browser
  verification and mapped Playwright revision require synchronization.

## Plan

- [x] Implement the bounded change.
- [x] Add or update the smallest reliable regression coverage.
- [x] Run targeted validation and real-browser verification.
- [x] Update design, user-flow, and skill instructions.
- [x] Inspect the final diff and record results below.

## Verification

| Check                    | Result                                              |
| ------------------------ | --------------------------------------------------- |
| Tests                    | Pass: Node 21/21; Playwright 2/2                    |
| Lint/typecheck/build     | Pass: panel lint and repository format check        |
| Runtime/browser/database | Pass: real browser desktop/390px; database N/A      |
| Documentation/user-flow  | Pass: guide, mapping, catalog, and skill validators |

## Outcome and evidence

- Changes made: added a category sidebar, native collapsed disclosure panels,
  prominent disabled explanations associated with disabled controls, accepted-
  start selection clearing, and visible complete mutation-error feedback.
- Selection/error cause: `dev` is an aggregate command that conflicts with its
  constituent `dev:backend`; a stale checked `dev` entry was still included in
  Run selected even when the user intended to start `dev:web`. Accepted starts
  now clear tab-local selection, and snapshots remove entries made ineligible by
  an active command. Rejected batches render the server message and every issue
  in a fixed in-viewport alert.
- Automated commands and results:
    - `pnpm test:web-dev-panel` — 21/21 passed with loopback permission. The first
      sandboxed attempt failed only because the sandbox denied `127.0.0.1` listen.
    - `pnpm test:e2e:web-dev-panel` — 2/2 passed with loopback permission. The
      first sandboxed attempt failed only because the sandbox denied the fixture
      server listen.
    - panel lint, `pnpm format:check`, `pnpm web-dev-panel:check`,
      `pnpm agent-skills:check`, `pnpm docs:user-flows:check`, and
      `pnpm user-flow:e2e -- check web-dev-panel` — passed.
- Runtime/browser: project-pinned agent-browser verified collapsed initial
  state, section-link expansion, unavailable reason and disabled control,
  complete conflict alert, accepted-start selection clearing, and desktop plus
  390px layout. Console/errors were empty; the deliberate conflict was the only
  409, and the accepted start returned 202.
- Documentation: updated the panel README, design-system contract, user-flow
  guide/revision (`sha256:0aa71d57e6bffc79`), and explicit `$web-dev-panel`
  maintenance workflow. The repository skill validator passed; the generic
  `skill-creator` validator could not start because host Python lacks PyYAML, so
  no dependency was installed for this correction.
- Design: the saved `design/main.pen` panel story contains the section index,
  collapsed rows, opened Agent workflow example, and labeled unavailable
  explanation; its visual/layout check passed and the Git worktree contains the
  persisted design update.
- Review: focused self-review found no changed server contract, execution
  semantics, or security boundary; no independent review was required for this
  bounded correction.

## Remaining risks

- None known. Windows process-tree supervision remains the pre-existing,
  documented platform limitation and is outside this presentation correction.
