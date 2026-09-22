# Improvement: Versioned design handoff

Status: Complete
Created: 2026-09-22
Updated: 2026-09-22

## Routing decision

Focused agent workflow enhancement; user requested automatic handoff creation and
versioning, not a new application feature/full lifecycle. No public contract,
persisted application data, security policy, production dependency or deployment
changes. Root routing/authorization stays authoritative. Escalate if scope crosses
those boundaries. No ADR-worthy product architecture change.

## Context and scope

Add automatic handoff creation within requested saved design briefs, a reusable
template, immutable prompt snapshots and separate candidate/target/implemented
pointers. Seed dictionary cards from the audio-inclusive prompt; link contributing
features without reopening completed implementation. No external design calls,
application edits or automatic approval/implementation. Preserve the preexisting
staged prompt correction and its record. Rollback: remove new handoff routing and
restore prior skill text; retain historical snapshots if already used.

## Acceptance criteria

- AC-1 — Saved briefs automatically create discoverable handoffs; read-only or
  response-only requests do not write files and backend-only completion does not trigger generation.
- AC-2 — Changed prompts/designs, including same-URL updates, preserve prior
  versions, evidence and approvals without silently changing the implementation target.
- AC-3 — Dictionary v001 links source features/plans and an exact frozen prompt,
  with obvious URL and design identity slots; no design approval is invented.

## Plan

- [x] Read current workflow, design-brief, fidelity and source records.
- [x] Add central rules, template and minimal routing/documentation pointers.
- [x] Seed dictionary handoff and snapshot.
- [x] Validate packaging, links, snapshot hash, formatting and instruction behavior.
- [x] Record review/evidence and final diff.

## Verification

AC-1/2/3 passed scoped author review and an independent read-only decision probe
(`/root/design_handoff_probe`, fresh context, five synthetic requests). The probe
correctly planned automatic saved-brief artifacts, response-only non-writes, no
unrequested backend-only brief, preservation of v001 while the same URL becomes
v002, and authorized-but-source-inaccessible implementation without false fidelity.
It identified snapshot-boundary and ID/access-recording ambiguities; the central
rules now explicitly include all canonical metadata, map checklist/inventory IDs
and record source access separately from status. Standalone brief routing continues
to follow root classification; this task has this improvement record.

The probe used shared-checkout read-only isolation, not a separate filesystem;
no expected-answer rubric was supplied. These are workflow decisions, not proof of
runtime correctness, actual design quality or token savings. No before/after
comparative trial was run.

Commands and results (base `2f8f6d2` plus this documentation patch):

- `uv run --offline --with pyyaml python /Users/nickkotov/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/design-brief` — passed.
- Same command for `.agents/skills/ui-ux-composition` — passed.
- Plain `python3` validator initially failed because PyYAML was absent; cached uv
  environment provided it without adding a repository dependency.
- Python relative-link check: 62 links passed across rules, handoff, prompt/index
  and both affected skill references. Historical snapshot links use the explicitly
  recorded canonical base directory. Snapshot bytes equal the canonical prompt;
  recorded SHA-256 verified: `d74b124690f56af82d4e3f1a0c7e948b7e07e599774b139e06844dfcf39b4245`.
- Affected Prettier checks and `git diff --check` passed.
- Author preflight inspected the scoped diff, authority, positive/negative triggers
  and completion conditions. The independent probe supplies proportional workflow
  review; no runtime security review was triggered.
- User added a generated-design URL during this task. Preserved it, marked v001
  Ready for review and recorded that remote source remains uninspected. The
  original staged audio-prompt correction remains staged and unmodified in index.
- No application changes, external requests, commits, branch changes or design
  implementation occurred. Completed feature status remains unchanged.

No runtime/browser,
database or user-flow behavior changes; those checks do not apply. No new CLI
command or executable journey. No comparative efficiency claim.

## Remaining risks

Magic Patterns may mutate editor content at the same URL; retained artifacts or
provider revisions are needed to identify old content. No external design is
available yet. The handoff automates agent artifacts, not remote generation or polling.
