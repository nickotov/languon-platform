# Correction: Save contextual assistant widget design prompt

Status: Complete
Created: 2026-10-19
Updated: 2026-10-19

## Routing decision

Documentation-only correction: move the already supplied design prompt into the
requested repository directory with a copyable block and required provenance.
No runtime behavior, contract, schema, security, dependency or deployment changes.
Future widget implementation remains outside this request.

## Context and scope

The prompt previously existed only in conversation. Save it under
`docs/design-prompt`, index it and preserve a feature-owned v001 handoff/snapshot.
Follow documentation metadata and versioned design handoff rules. Keep feature
044 completion status unchanged. User-flow guides need no changes because no
application behavior or startup command changed.

## Acceptance criteria

- AC-1 — Entire portable prompt is available in one fenced text block at the requested path.
- AC-2 — Index and bidirectional handoff links resolve; immutable snapshot matches canonical bytes and recorded SHA-256.

## Plan

- [x] Save portable prompt with metadata, source limitations and W01–W10 checklist.
- [x] Add index entry, handoff and immutable v001 snapshot.
- [x] Check copyable block, links, snapshot/hash and focused diff.

## Verification and outcome

Python structural checks validate one text block, all ten checklist IDs, relative
links (snapshots use canonical base), snapshot byte equality and SHA-256.
`git diff --check` passes. Author review confirms documentation-only scope.
No product UI changed: runtime/browser/database, lint/typecheck/build and user-flow
E2E checks are not applicable. Independent review is not required for this bounded
copy/provenance change. No commit or external design generation performed.

## Remaining risks

Generated design, fidelity review and runtime redesign remain future work; no
claim of implemented widget behavior is made.
