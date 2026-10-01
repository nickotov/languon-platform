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
- In scope: backlog, README discovery link, and this improvement record.
- Out of scope: application implementation, technical design, new ADRs, executable
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

## Plan

- [x] Inspect instructions, relevant completed work, guides, and accepted ADRs.
- [x] Save the backlog and README discovery link.
- [x] Verify task/decision coverage, relative links, and Markdown formatting.
- [x] Review the final scoped diff and record completion evidence.

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

- Backlog requirements are intentionally high level; each delivery must resolve
  its recorded open decisions and recheck the repository baseline.
