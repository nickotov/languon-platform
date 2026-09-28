# Correction: Save authenticated app-shell sidebar design prompt

Status: Complete
Created: 2026-09-28
Updated: 2026-09-28

## Routing decision

- Intended outcome: preserve the supplied Magic Patterns prompt in the
  repository's design-prompt catalog with versioned provenance.
- Why this is a correction: this is a bounded documentation-only addition that
  changes no product behavior, contract, dependency, data, security, or runtime.
- Feature-flow triggers checked: every correction condition in root `AGENTS.md`
  remains true.
- Escalation rule: continue as an improvement if its conditions hold; otherwise
  obtain feature authorization before expanded implementation.

## Context and scope

- Current behavior: the prompt exists only in conversation context.
- Expected behavior: contributors can discover, copy, and version the prompt
  from `docs/design-prompt`.
- In scope: canonical prompt, prompt index entry, v001 snapshot, and design
  handoff metadata.
- Out of scope: Magic Patterns generation and runtime implementation.
- Likely files/surfaces: `docs/design-prompt/**` and this correction record.
- Relevant constraints: `.agent/DESIGN_HANDOFF.md`.
- Related user-flow guides: none; no observable product behavior changes.

## Acceptance criteria

- AC-1 — The supplied prompt is available as a copyable document from the design
  prompt index.
- AC-2 — A v001 immutable snapshot and handoff record preserve provenance and a
  generated-design URL slot.

## Plan

- [x] Add the canonical prompt document.
- [x] Add the index entry, snapshot, and handoff.
- [x] Run targeted documentation validation.
- [x] Inspect the final diff and record results below.

## Verification

| Check                    | Result                                                     |
| ------------------------ | ---------------------------------------------------------- |
| Tests                    | Not required — documentation only                          |
| Lint/typecheck/build     | Not required — no runtime source changed                   |
| Runtime/browser/database | Not required — no application UI changed                   |
| Documentation/user-flow  | Pass — catalog, handoff, formatting, and snapshot verified |

## Outcome and evidence

- Changes made: added the canonical authenticated app-shell/sidebar prompt, a
  discoverable prompt-index entry, the v001 design handoff, and an exact frozen
  prompt snapshot.
- Commands and results:
    - `pnpm exec prettier --check` against all five touched Markdown files — pass
      after formatting the correction record and prompt index.
    - `git diff --check` — pass.
    - SHA-256 comparison between the canonical prompt and v001 snapshot — pass;
      both are `796c4438fe9bb61a875af40fd6940dcf8c390526dc9fbf238b9b5e78d93f4174`.
    - Required-file and relative-link target inspection — pass.
- Documentation: no user-flow guide changes are applicable.
- Review: author preflight is sufficient for this low-risk documentation-only correction.

## Remaining risks

- None known.
