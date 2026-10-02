# Improvement: Numbered backlog task files and automatic lifecycle updates

Status: Complete
Created: 2026-10-02
Updated: 2026-10-02

## Routing decision

Documentation/workflow improvement, not product implementation. Split the existing
backlog and add a bounded delivery bookkeeping rule. No new application capability,
contract, persistence, permission, dependency, billing or deployment change. Root
classification, feature authorization, verification and Git policies remain binding.

## Scope and acceptance

- AC-1 — `docs/backlog/README.md` indexes nine numbered task files, preserving
  stable BL IDs, original task coverage, requirements, open decisions, dependencies,
  terminology and shared constraints from `docs/backlog.md`.
- AC-2 — Completed files use `-done.md`, title/Status Done and implementation
  evidence links; skipped files use `-skipped.md`, title/Status Skipped and a
  recorded reason/decision. Pending tasks are not arbitrarily skipped or renumbered.
- AC-3 — Root instructions discover the shared delivery rule: automatically update
  the task file, index and links after verified completion/authorized skipping,
  without implying commits, pushes or new product authority.
- AC-4 — Active references resolve to the new paths; removed monolith's content is
  preserved and changes pass formatting/link/status/content checks.

## Plan and verification

- [x] Split content mechanically, rebase links and create shared index.
- [x] Update active pointers and one authoritative delivery rule with root routing.
- [x] Validate content conservation, links, IDs, statuses, evidence and formatting.
- [x] Review positive/negative instruction cases; record outcomes and close.

Documentation only: no browser, app tests, database or build required. No skill
folders changed, so skill packaging validation is not applicable. Inspect instruction
triggers for complete, partial, blocked, skipped and unrelated work; optional full
workflow-evaluation pilot/token comparison is not run or claimed. Independent
read-only review is proportional because durable automatic completion behavior
changes; no security review or separate tester needed.

## Evidence and remaining risks

Base `3716d7f`, initially clean tree. No automatic commit/push. Recover the removed
monolith from Git if necessary; this migration does not discard its content.

- AC-1/2: nine files numbered001–009 and stable BL IDs. BL-001 becomes Done with
  three existing Complete implementation records. Eight future tasks remain Backlog;
  no task arbitrarily skipped. Shared terms/coverage/constraints/dependencies live
  in `docs/backlog/README.md`; task links rebased one directory deeper.
- AC-3: `AGENTS.md` discovers the rule; `.agent/DELIVERY.md` owns automatic
  status/title/filename/evidence/index/link synchronization. Explicit skipping only;
  partial/blocked/failed/deferred work is not terminal. Reactivation preserves
  history. Existing feature authorization, verification and commit/push rules apply.
- AC-4: main README and original task1 plan target the new files; historical
  backlog delivery record gets a migration note without rewriting historical
  commands/evidence. Old file replaced, content recoverable in Git.
- Read-only Node assertions compare all nine task bodies to
  `git show HEAD:docs/backlog.md` after normalizing Markdown links, headings,
  whitespace and new metadata/evidence. PASS: all product requirements/open
  decisions/dependencies conserved exactly, nine IDs/filename/title/Status/index
  agree, three evidence documents are Complete, all100 relative links resolve,
  synchronization anchor exists and old monolith is absent. No app services run.
- Additional assertions preserve shared product terms, the original task coverage
  table and shared constraints/dependency prose (including all linked ADRs).
  Documentation/instruction snapshot SHA-256, sorted path plus content for
  AGENTS, DELIVERY, root README, task1 plan, historical migration note and all
  backlog files (excluding this self-updating record):
  `21bd3fd638f840f9d0aa87f341bac2bfdcc1a59e4add4f21ab4963fda815083d`.
  Root instruction diff SHA-256:
  `0065db113cc5ec6f5a5f4e244a4c66134f943bbc6d3bfdeeeceb6aa826f45ff4`.
- `pnpm exec prettier --check AGENTS.md .agent/DELIVERY.md README.md docs/backlog
.agent/improvements/backlog-task-files.md .agent/improvements/product-feature-backlog.md
docs/inline-ai-auto-accept-plan.md`: pass. `git diff --check`: pass.
- `pnpm user-flow:e2e -- check dictionary-platform`: pass, same revision/mapping;
  no executable guide behavior changed, so mapped runtime tests not rerun.
- Author preflight and independent read-only review complete: reviewer
  `backlog_docs_review` found no material findings across the 17-file boundary
  from base `3716d7f`, including untracked backlog files and this record. Reviewer
  independently confirmed conservation, 100 links, lifecycle consistency,
  formatting, diff hygiene and unchanged user-flow mapping. Reviewed boundary
  manifest SHA-256:
  `47b8ac74850e1195601d6a790d792f54b059f5d8aed399939f99df3a8b53ec2e`.
- Read-only hypothetical instruction cases agree: partial BL-004 remains In
  progress without a terminal suffix; database-blocked BL-003 remains Blocked,
  not Skipped; explicit user skipping BL-008 produces Skipped with reason;
  fully verified BL-005 produces Done with evidence and updated links but no
  automatic commit; an unrelated typo causes no backlog lifecycle changes.
  These cases were interpreted, not executed. Full isolated old/new workflow
  pilot or actual auto-delivery run not performed; no token-efficiency or
  runtime-agent execution claim.

## Remaining risks

No unresolved review findings. Documentation/instruction changes only; automatic
bookkeeping relies on agents following the root rule, not a new watcher/service.
