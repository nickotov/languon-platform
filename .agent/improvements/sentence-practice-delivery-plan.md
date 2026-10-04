# Improvement: Save the backend-first model and sentence practice plan

Status: Complete
Created: 2026-10-04
Updated: 2026-10-04

## Routing decision

Documentation-only improvement: save the agreed feature planning baseline,
add the requested backend/design/frontend checkpoints and link related backlog
documents. This change implements no capability, contract, persistence,
security policy, migration or production configuration. Previously authorized
features remain unstarted pending the user's further clarifications.

## Context and scope

Canonical document: [implementation plan](../../docs/sentence-practice-implementation-plan.md).
Related work: BL-005 first, BL-004 second and the sentence portion of BL-003.
Follow the existing flashcard backend-first handoff precedent. Generate neither
design prompts nor feature workspaces now: prompts require verified backends,
and the user asked to clarify before implementation.

## Acceptance criteria

- AC-1 — Save the detailed product/backend/frontend baseline as a draft.
- AC-2 — Require both verified backends before two detailed saved Magic Patterns
  prompts, without concrete API paths in their copyable blocks; cover UI states
  and versioned provenance, then wait for returned designs.
- AC-3 — Link affected backlog tasks/index without changing completion status or
  claiming implementation evidence.
- AC-4 — Honor the user's clarification checkpoint; no application changes,
  branch creation, commits, prompt generation or external writes.

## Plan

- [x] Inspect existing planning, metadata and design-handoff conventions.
- [x] Save the revised plan and backlog/design-index links.
- [x] Validate formatting, local links, metadata and status consistency.
- [x] Inspect the final diff and record evidence.

## Verification

The uncommitted seven-document patch was checked on the existing `main` branch
on 2026-10-04. Scoped Prettier verification and `git diff --check` pass after
formatting the new plan. A Python standard-library check validated 40 relative
Markdown links, required metadata, draft/empty-evidence plan status, unchanged
backlog statuses and the explicit BL-004 → BL-005 dependency. The final diff is
documentation-only; no application, feature workspace or generated prompt files
were added, and no commit was made.

Runtime, browser, database, unit tests, lint/typecheck/build and user-flow
execution are not applicable: no executable behavior or guide commands change.
Independent review is not required for this bounded documentation save; future
implementation reviews remain required. Author preflight confirms planning is
not reported as feature completion or backend evidence.

## Clarification update on 2026-10-04

The user's follow-up questions clarified cross-session behavior and requested
fresh generation and flashcard-like display modes. The draft now distinguishes
saved-unchecked reuse from Review saved, prioritizes uncovered vocabulary for
subsequent generation, retains every successful generation and offers New
sentences on every session without clearing coverage/history. Fullscreen Start,
viewport fallback and bidirectional Dialog switching preserve answer, hints,
feedback, polling and statistics without additional AI calls. The future design
inventory and verification scenarios include these requirements. Application
implementation remains unstarted pending the user's clarification checkpoint.

The plan and this record were rechecked with scoped Prettier and
`git diff --check`; relative links and existing backlog statuses remain unchanged.

## Remaining risks and next action

The user resumed feature implementation on 2026-10-04. Delivery is now owned by
[feature 035](../features/035-user-ai-model-preferences-backend/FEATURE.md),
not this completed documentation-only record. Future technical choices must
be checked against current source and accepted ADRs before implementation.
Rollback: remove the plan, its related links and this documentation record.
