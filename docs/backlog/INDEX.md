---
type: index
title: Backlog task index
---

# Backlog task index

Read this file to select a task, then its frontmatter. Before planning or
implementation, read the selected task in full and the relevant shared context
in [README.md](README.md). Statuses mirror authoritative task frontmatter;
numbers are stable IDs, not delivery priority.

Preparation for BL-005, BL-004 and the sentence portion of BL-003 is recorded in
the [backend-first implementation plan](../sentence-practice-implementation-plan.md).
Implementation was authorized on 2026-10-04. Features 035 and 036 own the
verified, independently reviewed backends. Separate [profile model](../design-prompt/profile-text-ai-preferences.md)
and [sentence practice](../design-prompt/sentence-practice.md) prompts produced the
selected v001 designs, now implemented and verified in
[feature 037](../../.agent/features/037-sentence-practice-web/FEATURE.md).
BL-004 and BL-005 are Done. BL-003 retains its broader unfinished scope.

| ID     | Task                                                                                                     | Status      |
| ------ | -------------------------------------------------------------------------------------------------------- | ----------- |
| BL-001 | [Streamlined dictionary editing](001-streamlined-dictionary-editing-done.md)                             | done        |
| BL-002 | [Configurable flashcard training](002-configurable-flashcard-training-done.md)                           | done        |
| BL-003 | [Personal learning progress](003-personal-learning-progress.md)                                          | in-progress |
| BL-004 | [AI sentence translation practice](004-ai-sentence-translation-practice-done.md)                         | done        |
| BL-005 | [User-selectable AI models](005-user-selectable-ai-models-done.md)                                       | done        |
| BL-006 | [Grammar conversations and learning documents](006-grammar-conversations-and-learning-documents.md)      | in-progress |
| BL-007 | [Manual exercise creation and editing](007-manual-exercise-creation-and-editing.md)                      | in-progress |
| BL-008 | [Increased sentence difficulty](008-increased-sentence-difficulty.md)                                    | pending     |
| BL-009 | [Practice plans for weak areas](009-practice-plans-for-weak-areas.md)                                    | pending     |
| BL-010 | [Saved sentence management and full-dictionary preparation](010-sentence-library-management-done.md)     | done        |
| BL-011 | [Dictionary batch call accounting](011-dictionary-batch-call-accounting.md)                              | pending     |
| BL-012 | [Enforceable code readability standards](012-code-readability-standards-done.md)                         | done        |
| BL-013 | [Dedicated learning-content generation tools](013-dedicated-learning-content-tools.md)                   | in-progress |
| BL-014 | [Tutor and learning-tool playground](014-tutor-playground.md)                                            | pending     |
| BL-015 | [Reliable tutor intent, clarification and generation outcomes](015-reliable-tutor-generation-routing.md) | in-progress |
| BL-016 | [Interactive chat artifacts and exact follow-up references](016-interactive-chat-artifacts.md)           | in-progress |
| BL-017 | [Versioned Langfuse prompt resolution](017-versioned-langfuse-prompts.md)                                | pending     |
| BL-018 | [Codebase-wide mechanical formatting and lint normalization](018-codebase-mechanical-formatting-done.md) | done        |
| BL-019 | [Codebase-wide readability review and refactoring](019-codebase-readability-refactoring-done.md)         | done        |

The 2026-10-31 tutor/readability discussion is split into BL-012–BL-017.
Suggested delivery order is **012 → 013 → 014 → 015 → 016 → 017**. Hard
dependencies are recorded in task frontmatter; this suggested order is not a
schedule. BL-012 is independently deliverable, BL-015 does not require the
playground, and BL-017 can be prepared independently. The user subsequently
authorized starting BL-012 and the staged readability cleanup: **012 → 018 → 019**.
On 2026-11-04, the user authorized [feature 060](../../.agent/features/060-intent-aware-learning-content/FEATURE.md)
for BL-013, BL-015 and the exact same-chat Knowledge-proposal follow-up slice of
BL-016. These entries are in progress; this allocation is not completion evidence.
The runnable BL-014 Playground, broader BL-016 artifact lifecycle and BL-017 remain
outside this delivery.

On 2026-11-06, the user authorized
[feature 061](../../.agent/features/061-reliable-learning-content-pipeline/FEATURE.md)
to complete BL-013 and the relevant BL-015 behavior as one delivery: canonical
tool/publication contracts, phase-correct context budgets, compact historical
tool context and targeted chat refreshes. It builds on feature 060. Implementation
and selected verification pass. BL-013/015 remain in progress for
S3 operational security closure: provider-key rotation/revocation or explicit user
acceptance of the residual risk. On 2026-11-11 the user committed to updating the
key and explicitly authorized main integration while that operation is pending;
BL-013/015 remain in progress until the key disposition is confirmed. The root pre-release policy
permits direct current-contract updates rather than compatibility bridges for
unreleased versions. The runnable BL-014 Playground remains separate.

[Feature 059](../../.agent/features/059-interactive-workbooks/FEATURE.md) is in
progress for interactive knowledge workbooks, the associated BL-003 progress
slice, BL-006 interactive documents/exercises, and BL-007 initial manual exercise
authoring. This allocation is not completion evidence; broader remaining scope
is retained in each task.

The [v16 migration evidence](../../.agent/features/059-interactive-workbooks/EVIDENCE.md)
records the verified custom-block/editor/chat slice and its full critical gate.
BL-003, BL-006 and BL-007 retain their broader in-progress scope; this milestone
does not activate unapproved transcription providers or complete guided lessons.
