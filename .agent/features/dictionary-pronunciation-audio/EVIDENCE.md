# Verification evidence: Dictionary pronunciation audio

Updated: 2026-09-21
Status: Planning evidence only; runtime implementation not started

## Acceptance coverage

| Acceptance ID | Planned proof                                                        | Current result  |
| ------------- | -------------------------------------------------------------------- | --------------- |
| AC-1          | Field/language unit tests and four-field browser journey             | Not implemented |
| AC-2          | Component race/error tests and actual browser playback/accessibility | Not implemented |
| AC-3          | Real PostgreSQL concurrent requests, edits and provider-switch tests | Not implemented |
| AC-4          | bytea/S3 conformance plus dedicated Selectel bucket                  | Not implemented |
| AC-5          | Kie HTTP fixture contract and live model capability matrix           | Not implemented |
| AC-6          | Restart, lease, known-task resume and unknown-submit fault injection | Not implemented |
| AC-7          | Owner/ID/content/archive/deletion authorization integration          | Not implemented |
| AC-8          | Budget races, timeout limits and outage/cached-read tests            | Not implemented |
| AC-9          | Late-write/orphan/all-version purge and restore rehearsal            | Not implemented |
| AC-10         | Deterministic decodable fixture through actual worker/API/browser    | Not implemented |
| AC-11         | Additive migration, compatibility metadata, rollback-floor tests     | Not implemented |
| AC-12         | Guides/mapped E2E, browser, tester/security/completion review        | Not implemented |

## Check records

### P-1 — Read-only architecture discovery

- Reviewed contracts, dictionary worker composition/entry point, account purge
  enumeration and storage port, mobile file inventory, ADR index/0011/0012/0019
  and historical 0018, plus feature/test workflow instructions.
- `git status --short` showed unrelated `.codex/agents/architect.toml` modified
  before planning. Preserved unchanged. Branch created from main for this plan.
- Architect agent independently inspected source and returned bounded design
  findings. See REVIEW.md. No runtime or pronunciation quality proved.

### P-2 — Existing guide mapping inspection

- Commands: `pnpm user-flow:e2e -- inspect dictionary-platform` and
  `pnpm user-flow:e2e -- inspect profile-account-controls`.
- Both succeeded, status synchronized. Revisions respectively
  `sha256:e88d848310a72c33` and `sha256:ef6ecfea3957024d`.
- Proves existing mappings can be resolved, not that journeys were executed.
  No guide/test marker or runtime file changed in this planning turn.

### P-3 — Planning artifact checks

- `pnpm exec prettier --check .agent/features/dictionary-pronunciation-audio/*.md docs/adr/0020-dictionary-pronunciation-audio.md` passed.
- Read-only Node local Markdown-link existence check passed for all five new
  documents. `git diff --check` passed; ADR index diff is one added Proposed row.
- Scope: these four feature documents, proposed ADR-0020 and ADR index entry.
- No unit/integration/build/browser suites required for this documentation-only
  planning change. Their implementation requirements remain in EXEC_PLAN.md.

## User-flow evidence

Proposed new audio guide/scenarios are described in EXEC_PLAN.md. Existing guides
are unchanged; new runtime behavior must not be claimed current before delivery.
No paid provider, cloud-storage, browser or native-device test was executed.

## Remaining gaps and risks

All runtime evidence, live provider evaluation, production storage conformance,
approval/configuration, implementation, and completion/security review remain.
Design review and fixtures cannot establish pronunciation correctness or actual
provider latency/cost. See [REVIEW.md](./REVIEW.md).
