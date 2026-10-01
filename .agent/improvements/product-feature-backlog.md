# Improvement: Product feature backlog documentation

Status: Complete
Created: 2026-10-01
Updated: 2026-10-01

## Routing decision

- Intended outcome: save the clarified future product backlog for task-by-task delivery.
- Why this is an improvement rather than a correction: consolidate eleven rough
  descriptions, fifteen confirmed product decisions, terminology, and relevant
  repository findings into one maintained product document.
- Explicit-feature check: the user requested backlog documentation, not implementation
  of the described capabilities or the full feature lifecycle.
- Feature boundaries checked: documentation only; no runtime capability, public
  contract, persistence, security policy, dependency, migration, or deployment changes.
- Escalation rule: product implementation requires a separate scoped request and
  classification under root AGENTS.md; this record authorizes only documentation.

## Context and scope

- Current behaviour: the approved backlog and clarifications exist in conversation only.
- Expected behaviour: `docs/backlog.md` preserves confirmed requirements, baseline
  facts with source links, per-task unresolved decisions, and dependencies.
- In scope: backlog, README discovery link, the agreed task 1 implementation plan,
  and this improvement record. The follow-up saves a technical plan without
  implementing it.
- Out of scope: application implementation, new ADRs, executable
  journey documentation, branches, commits, and model/service calls.
- Relevant constraints: distinguish local form versions from persisted card revisions;
  immediate generation saving from draft auto-application; reusable exercises from
  personal state; owner content from shared-reader progress and generation.
- Related user-flow guides: dictionary-platform, ai-provider-management, and
  ai-credit-wallet are referenced as current context. Their behaviour and commands
  are unchanged, so guide/E2E marker updates are not applicable.
- Rollback/removal path: remove the new backlog and its README link; no data or
  application rollback is required.

## Acceptance criteria

- AC-1 — All eleven original tasks and fifteen confirmed answers are represented
  under stable BL-001–BL-009 IDs, with initial status Backlog.
- AC-2 — Crucial baseline findings have repository source links, and open product
  or technical decisions are deferred explicitly rather than invented.
- AC-3 — README links to the backlog; relative links, formatting, and diff hygiene pass.
- AC-4 — The task 1 follow-up preserves agreed behaviour, repository constraints,
  implementation sequence, recovery semantics, and verification requirements;
  the backlog links it and all product entries remain unimplemented.

## Plan

- [x] Inspect instructions, relevant completed work, guides, and accepted ADRs.
- [x] Save the backlog and README discovery link.
- [x] Verify task/decision coverage, relative links, and Markdown formatting.
- [x] Review the final scoped diff and record completion evidence.
- [x] Save and verify the detailed task 1 plan and synchronize resolved backlog decisions.

## Verification

| Check                                           | Result                                                        |
| ----------------------------------------------- | ------------------------------------------------------------- |
| Task/decision coverage                          | Pass — 11 original tasks, 9 entries, and 15 confirmed answers |
| Markdown formatting and local links             | Pass — scoped Prettier check and 18 existing local targets    |
| Diff hygiene                                    | Pass — scoped author review and git diff --check              |
| Runtime tests/lint/types/build/browser/database | Not applicable — documentation only                           |
| User-flow traceability                          | Not applicable — executable behaviour and guides unchanged    |

## Outcome and evidence

- Changes made: nine stable backlog entries, original-task mapping, product terms,
  confirmed decisions, per-task preparation questions and acceptance scenarios,
  source-linked constraints, dependencies, and README discovery.
- Commands and results on 2026-10-01, against the final documentation-only patch
  in the local workspace:
    - `pnpm exec prettier --check docs/backlog.md README.md
.agent/improvements/product-feature-backlog.md` — pass.
    - One-off Node assertions — pass: nine unique entry headings, all eleven
      original-task rows, ten initial Backlog status markers including the document,
      README discovery link, and all eighteen local link targets exist.
    - Author coverage review — all fifteen confirmed answers preserved, including
      immediate saving versus explicit Create, examples-only sides, shared-reader
      personal progress/generation, private grammar, editable private copies,
      renewed practice after content changes, and the platform-default Auto model.
    - `git diff --check` — pass. Final patch contains only README, backlog, and
      this record; no runtime or executable guide changes.
- Review: author preflight complete. Independent/security review is not triggered:
  this patch records future requirements without changing runtime or trusted
  workflow policy. The domain-modeling skill informed the local product-term
  definitions and the separation of exercises, attempts, and personal progress.

## Remaining risks

### Detailed task 1 plan follow-up — 2026-10-01

- Saved `docs/inline-ai-auto-accept-plan.md` and linked it from BL-001. Preserved
  full-form automatic saving, explicit new-entry Create, session-local preview
  history and explicit restoration, the Source-only first-generation exception,
  paused editing, whole-form-only history, and inline-only scope.
- Recorded existing implementation seams, proposal/provenance constraints,
  retry/readback/conflict handling, session guards, bounded history cleanup,
  implementation steps, and future automated/browser/E2E verification.
- AC-4 author preflight: pass. Task 1 and responsive task 2 remain unimplemented;
  no runtime, user-flow guide, API, schema, or trusted workflow changes.
- Scoped Prettier check: pass for the plan, backlog, and this record.
- One-off Node assertions: pass — 24 local link targets exist, nine backlog
  entries and ten Backlog markers remain, and the new plan is marked Planned.
- `git diff --check`: pass. Independent/security review and runtime verification
  are not triggered for this prose-only follow-up. No commit was requested for
  this follow-up; the earlier backlog commit is separate.

### Outstanding delivery risks

- Backlog requirements are intentionally high level; each delivery must resolve
  its recorded open decisions and recheck the repository baseline.
- The detailed plan's proposed implementation and verification have not been
  executed; its technical baseline must be rechecked when delivery starts.
