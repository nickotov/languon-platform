# Feature: Persistent tutor modes

Status: Complete
Authorized: 2026-10-20 (explicit user answer “Add persistent tutor modes as a feature”)

## Outcome and scope

The v9 tutor settings expose Auto, Explain, Correct and Practice modes. The selected mode persists with each private conversation, is captured for each turn and influences the existing language tutor while retaining its language-learning limits, uncertainty behavior and full-document snapshots. Saving as defaults affects new conversations; existing conversations retain their mode. Mode changes never silently edit documents.

The separately tracked supplied-design integration is a prerequisite: [v9 design record](../../improvements/knowledge-workspace-v9-design.md), inventory V9-01–V9-10 and handoff v004. Its historical v003/resize work remains preserved. This feature does not authorize unrelated changes, external search, selection-only context, uploads or model/tool expansion.

## Acceptance

- MODE-1: Validated preferences accept exactly `auto`, `explain`, `correct`, `practice`; default Auto. Private conversation updates, per-turn snapshots and saved user defaults persist the selected mode through existing ownership checks.
- MODE-2: The existing tutor receives explicit mode guidance: Auto follows the question, Explain teaches meaning/usage/grammar, Correct supplies language corrections with reasoning, Practice supports learner exercises without completing unrelated work. Existing prompt/trust/model limits remain enforced.
- MODE-3: v9 settings expose an accessible localized mode group with real persistence/loading/failure behavior. Reopening keeps the conversation mode; saved defaults initialize new conversations, independently of existing chats.
- MODE-4: Deterministic contract/unit/disposable persistence/browser checks prove validation, owner isolation, defaults, turn snapshot and agent guidance; no paid model calls. Required review and real browser evidence pass.

## Product and data constraints

Use existing preference JSON storage/API, no new endpoint or table. Zod defaults normalize missing mode at the existing preference read boundary; this is the schema's default behavior, not retired compatibility infrastructure. Persisted turn preferences are immutable snapshots. Existing authentication/authorization, full-context budgeting/compaction, explicit proposal acceptance, publication and sharing privacy remain unchanged. No web research or expanded tools.

## Delivery and Git boundary

Branch `feature/persistent-tutor-modes`, created from `main` at `d44ebca3e26f38f775f0a7df04004653a99bd6fd`. The working tree already contained authorized workspace/design work; preserve it. Before commits, inspect and document exactly which current design prerequisites are included, excluding unrelated work. The feature's required local commits/squash merge follow root policy; no push or branch deletion.

## Completion

MODE-1–MODE-4 and prerequisite v004 design delivery are verified. Independent completion and security reviews pass; all material findings resolved. Implementation feature commit `13b6206` is locally squash-integrated into main with final record updates, retaining identical tested runtime/test hashes. Feature branch is retained; no push or branch deletion.
