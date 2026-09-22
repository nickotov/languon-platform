# Improvement: Numbered feature folders

Status: Complete
Created: 2026-09-22
Updated: 2026-09-22

## Routing and scope

Developer tooling improvement: numeric prefixes for durable feature workspaces,
existing-folder migration and reference maintenance. No application capability,
public contract, database, security policy or deployment change. Preserve logical
feature slugs, branches, user-flow IDs and prior uncommitted work. No new CLI
command; existing feature:new assigns the prefix. Root feature authorization
continues to govern application work.

## Acceptance criteria

- AC-1 — Existing 27 folders sort by their first committed appearance; migration
  records exact mapping. Future folders get max(existing counter)+1, minimum
  three digits, without renumbering existing work.
- AC-2 — Duplicate slugs and concurrent allocation cannot overwrite work.
- AC-3 — Active references and tooling resolve numbered folders; immutable prompt
  snapshots remain byte-identical with an explicit historical-path lookup.

## Plan and verification

- [x] Migrate folders/links and document stable numbering semantics.
- [x] Test creator in disposable directories: allocation, gaps, duplicate slug,
      invalid input, missing template and concurrent/locked creation.
- [x] Run formatting, documentation/traceability checks and scoped review.

Use Node unit/integration checks for filesystem behavior. No app runtime or
browser/database changes; existing journey runtime evidence remains valid.
Guide source paths change, not user behavior; inspect traceability revisions.
Rollback: reverse the README mapping and restore creator/routing changes;
never discard user work or alter frozen design snapshot bytes.

## Evidence and remaining risks

User confirmed stable creation sequence after the clarification. Author preflight:

- Node `v24.8.0`; `node --test scripts/create-feature.test.mjs`: 5/5 passed.
  Tests are included in the existing root `pnpm test` entry.
- Scoped ESLint passed. Its first run identified a missing caught-error cause;
  added the cause and reran lint plus all five tests successfully.
- `pnpm docs:user-flows:check`: 16 validator tests and all 11 guides passed.
- `pnpm user-flow:e2e -- check`: all 11 guide mappings passed. Audio and release
  inspect commands confirm synchronized revisions; source-path-only guide changes
  leave executable scenario revisions intact. No live journeys need rerunning.
- Python migration audit: all 27 folders have four required artifacts, no old
  folders remain, and all previously tracked feature files match their original
  bytes after deterministic reference replacements. 84 migrated Markdown links
  resolve. The untracked dictionary handoff and user-supplied URL were preserved.
- Frozen prompt SHA-256 remains
  `d74b124690f56af82d4e3f1a0c7e948b7e07e599774b139e06844dfcf39b4245`.
  Canonical prompt receives mechanical link repairs only; rules explain why this
  does not create a different generated-design candidate.
- Affected Prettier and `git diff --check` passed. Cached/offline skill validator
  passed for feature-development. No production/runtime changes require browser,
  database or security review. Existing staged user work remains in the index;
  no commit, branch switch or push occurred.
- Independent initial review by `/root/feature_numbering_review` completed with
  no material findings; base `2f8f6d2` plus current uncommitted improvement. Reviewer
  independently verified first-commit ordering, all 108 tracked feature artifacts
  (103 unchanged; five with path repairs), snapshot hash, user URL, allocation
  and cleanup paths. Accepted residual risks: separate-checkout collisions require
  pre-merge resolution; stale lock removal requires confirming no creator is active. Core tooling/routing fingerprint (sorted path + NUL + bytes + NUL
  for creator, its test, package.json, feature README and feature skill):
  `1934e5c7fad0b61dcd448f04facd3927da4ad268ea652b46261dc2fb85fa522c`.

Numbers are stable creation sequence, not a promise of completion order
when features overlap. Git history provides one distinct first commit per existing
feature; no timestamp tie-break assumptions required. No commits authorized.
