# Improvement: Documentation frontmatter and targeted discovery

Status: Complete
Created: 2026-10-02
Updated: 2026-10-02

## Routing and scope

Documentation/workflow improvement; no product, architecture, API, persistence,
security, dependency or runtime change. Preserve the previous uncommitted backlog
split. Add a compact index, migrate nine backlog headers and 23 ADR headers plus
template, and establish gradual metadata authoring/discovery rules for docs.
Existing guide schemas and mandatory full-context reads remain authoritative.
Other historical docs are not bulk migrated. No commit requested.

## Acceptance and plan

- AC-1: nine tasks have factual YAML frontmatter, authoritative statuses/evidence,
  stable filenames and a compact INDEX; requirements are preserved.
- AC-2: all ADRs/template carry metadata without changes to decisions, rationale,
  original dates, status or partial/full supersession meaning.
- AC-3: root routing points to one metadata policy; discovery is lightweight but
  implementation/review still reads applicable full documents and instructions.
- AC-4: status, link, metadata, formatting and guide compatibility checks pass;
  independent instruction review records findings and limitations.

- [x] Implement migration, policy, discovery and lifecycle references.
- [x] Validate preservation and metadata/index/link agreement.
- [x] Independent read-only review and final checks.

## Evidence and risks

Base HEAD `3716d7f`; previous backlog split is uncommitted and preserved.
Documentation only; no app/browser/database/build checks apply. No skill folder
change. Rollback this improvement's metadata and pointers without discarding the
prior split. No unresolved review findings; no measured token savings, isolated
workflow comparison or actual automatic delivery run claimed.

- Read-only Node assertions: PASS for nine task IDs/frontmatter/status/index/
  filename/headings, original task references and explicit dependencies; three
  actual Complete evidence records; 23 ADR dates/statuses/supersession fields;
  30 exact section hashes (23 ADRs and seven sectioned tasks) unchanged from the
  pre-migration snapshot, plus retained later-task requirements; template metadata.
  All 219 local Markdown links and their referenced anchors resolve across
  backlog, ADRs, metadata policy, root instructions and DELIVERY.
- `pnpm docs:user-flows:check`: 16 tests pass; 14 guides and E2E mappings validate.
  No user-flow metadata or behavioral revisions changed. No runtime test rerun.
- `git diff --check`: pass. Formatter parses YAML for migrated documents.
- Author preflight: policy distinguishes metadata discovery from full requirement/
  accepted-ADR/instruction reading, preserves strict guide schema, and grants no
  extra implementation, Git or document-command authority. Independent review
  complete. No permanent parser, generated manifest or new dependency added.
- User clarification: metadata is not read automatically by file tools. Root
  and policy explicitly require initial candidate reads bounded to frontmatter,
  with relevance fallback when metadata is absent or insufficient; selected
  applicable documents still require full reads before acting.
- The documented `awk` command was executed and asserted equal to the selected
  task's leading frontmatter block, with no requirements body emitted: PASS.
  Final documentation/instruction snapshot SHA-256 (sorted paths plus NUL,
  contents plus NUL for AGENTS, DELIVERY, root README, metadata policy and all
  backlog/ADR files; excludes this self-updating record):
  `0e45ea8dec7a4c3be77c83db8c3b5a51355a2d1a58771f050b0c9d0a0d6f5e2f`.
  Subsequent instruction clarification does not affect the unchanged migrated
  task/ADR metadata or user-flow schema checks; those results remain valid.
- Independent reviewer `metadata_review`: no material findings, initial read-only
  boundary at base `3716d7f` plus the current scoped files, including untracked
  backlog/policy/record files. Independently recomputed the same snapshot hash,
  checked nine task and 23 ADR metadata records, confirmed every ADR decision
  body against HEAD and material backlog requirement lines in order, inspected
  shared constraints, and ran diff hygiene. Reused same-state formatting/link/
  guide evidence; user-flow files/tooling unchanged.
- Read-only decision cases confirmed: selection reads index/frontmatter without
  inventing priority; body-only persistence constraints still bind; partial ADR
  supersession requires both full records and preserves other accepted scope;
  user-flow updates retain strict schema and verification obligations; legacy
  typo fixes do not mandate migration; Done/Skipped updates remain evidence- and
  authority-gated and grant no commit permission. These are interpreted cases,
  not runtime deliveries or an isolated comparative workflow pilot.
