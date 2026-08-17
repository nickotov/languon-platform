# Correction: Mastra primitive registration guidance

Status: Complete
Created: 2026-08-17
Updated: 2026-08-17

## Routing decision

- Intended outcome: developers and coding agents automatically register new
  backend Mastra primitives in the canonical composition and verify them in the
  isolated Studio playground without needing a reminder.
- Why this is a correction: it documents and enforces the already established
  canonical registry and playground workflow; it adds no runtime capability,
  public contract, persistence, security boundary, or dependency.
- Feature-flow triggers checked: every correction condition in root `AGENTS.md`
  remains true.
- Escalation rule: switch to feature development before continuing if the work
  changes runtime registration, production authentication, persistence, or the
  generated server boundary.

## Context and scope

- Current behavior: developer documentation names the canonical composition,
  but does not provide a complete registration checklist, and backend agent
  instructions do not make registration plus Studio verification an automatic
  completion requirement.
- Expected behavior: backend sessions that add or materially change a Mastra
  agent, tool, workflow, processor, or scorer read an explicit always-loaded
  rule and follow one authoritative developer checklist.
- In scope: `apps/backend/AGENTS.md`, `docs/development.md`, and documentation
  validation.
- Out of scope: changing the registry implementation, adding primitives, or
  designing a production agent endpoint.
- Relevant ADRs or constraints: existing backend DDD direction and the canonical
  Mastra composition remain authoritative; no ADR is required for documentation
  of established behavior.
- Related user-flow guides: the existing Mastra harness guide remains accurate;
  no command or observable journey changes.

## Plan

- [x] Add a concise, reliably triggered backend agent rule with checkable
      completion criteria.
- [x] Add the authoritative human-facing registration and real-user wiring
      checklist to developer documentation.
- [x] Validate documentation, instruction authority, and final diff.

## Verification

| Check                    | Result                                      |
| ------------------------ | ------------------------------------------- |
| Tests                    | Not required; documentation-only correction |
| Lint/typecheck/build     | Changed Markdown passed Prettier            |
| Runtime/browser/database | Not required                                |
| Documentation/user-flow  | All user-flow guide checks passed           |

## Outcome and evidence

- Changes made: added an always-loaded backend instruction triggered whenever a
  session adds or materially changes a Mastra primitive. It requires canonical
  registration, exact development-policy wiring, synthetic playground data,
  focused tests, and real Studio/API discovery plus deterministic execution.
- Commands and results: changed Markdown passed targeted Prettier validation;
  `pnpm docs:user-flows:check` passed all guide and mapping checks;
  `git diff --check` passed.
- Documentation: `docs/development.md#registering-mastra-primitives` is the
  authoritative human checklist. It covers module placement, canonical maps,
  tool attachment, development gating, exact-route server policy, real-user
  authentication context, tests, and Studio verification. The existing Mastra
  user-flow guide required no edit because commands and observable behavior did
  not change.
- Review: the positive trigger “add or materially change a Mastra primitive”
  causes the checklist and Studio completion gate to apply; unrelated backend
  work does not. The closest backend `AGENTS.md` is automatically loaded for
  affected files, points to one authoritative checklist, and defers execution-
  boundary classification/security review to root instructions rather than
  redefining them.

## Remaining risks

- None known.
