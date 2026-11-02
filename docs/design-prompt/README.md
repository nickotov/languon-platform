---
type: index
title: Design prompts
---

# Design prompts

Copyable Magic Patterns prompts and source-grounded UI checklists. Each document
keeps implementation and ADR links outside its
portable prompt, records source state and limitations, and preserves stable UI
requirement IDs for design review and later frontend verification.

| Prompt                                                                      | Scope                                                                                                        | Status                                               |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| [Authenticated app shell and sidebar](./authenticated-app-shell-sidebar.md) | Reusable authenticated navigation across dictionaries and profile, including desktop rail and mobile drawer  | Implemented selected v001                            |
| [Dictionary and AI cards](./dictionary-ai-cards.md)                         | Dictionary library/settings, manual cards, inline AI authoring, saved-card AI review and pronunciation audio | Draft: supply Magic Patterns design-system reference |
| [Flashcard training](./flashcard-training.md)                               | Configurable cards, fullscreen/dialog practice, personal learning progress and retry/undo states             | Implemented selected v001; training-only feature 034 |

| [Profile AI model preferences](./profile-text-ai-preferences.md) | Personal Auto/explicit model selection, availability, credits context and conflict recovery | v001 returned provider v6; scoped analysis saved in 035 handoff; backend complete |
| [Sentence practice](./sentence-practice.md) | Fullscreen/dialog translation practice, hints, AI feedback, free reference review and all recovery states | v001 returned provider v6; scoped analysis saved in 036 handoff; backend complete |
| [Sentence practice assistance](./sentence-practice-assistance.md) | Contextual whole-phrase hints, free reference comparison, replacement results and exact/fresh replay | v001 backend checkpoint verified; awaiting returned design ([handoff](../../.agent/features/038-sentence-practice-assistance/DESIGN.md)) |

| [Sentence library and preparation](./sentence-library-and-preparation.md) | Dictionary preview, personal archive/restore, optional background preparation and ready rounds | v001 backend verified; awaiting generated design ([handoff](../../.agent/features/039-sentence-library-management/DESIGN.md)) |
| [Admin sentence management](./admin-sentence-library-management.md) | Per-user discovery, preview, personal/global archive and guarded permanent deletion | v001 backend verified; awaiting generated design ([handoff](../../.agent/features/039-sentence-library-management/DESIGN.md)) |

| [Contextual language tutor widget](./contextual-assistant-widget.md) | Floating desktop chat, mobile bottom sheet, folding, streaming, context and Knowledge drafts | Implemented selected v001 / provider v5 ([handoff](../../.agent/features/044-contextual-language-assistant-and-knowledge/DESIGN.md)) |
| [Knowledge workspace document editor](./knowledge-workspace-detail.md) | Document editor and its chat touchpoints, with desktop right dock and mobile bottom sheet | Implemented selected v003 / provider v8 ([handoff](../../.agent/features/047-knowledge-workspace/DESIGN.md)) |
| [Interactive knowledge sheets and AI chat](./interactive-knowledge-sheet-and-chat.md) | Extend existing chat/editor: block previews/playback, side-sheet editing, atomic AI actions and inline practice | Implementing v003 / provider v16 ([handoff](../../.agent/features/059-interactive-workbooks/DESIGN.md)) |

Every saved brief also has a [versioned handoff](../../.agent/DESIGN_HANDOFF.md)
with a frozen prompt, generated-design URL slot, approval history and selected
implementation version. Start with the [dictionary card handoff](../../.agent/features/027-dictionary-pronunciation-audio/DESIGN.md).
Paste the URL into v001; later prompt/design changes append v002 and subsequent
versions. A mutable URL alone is not a preserved historical design.

Request generation or updates using the [prompt cookbook](../agentic-prompts.md).
The skill defaults to this directory; explicit response-only requests or custom
paths take precedence. A prompt does not establish backend deployment readiness,
design fidelity, or frontend completion. Feature specifications and accepted
ADRs remain authoritative.

## Planned backend-first briefs

The [model and sentence practice implementation plan](../sentence-practice-implementation-plan.md)
now provides two separate detailed prompts after both backends were implemented,
verified and independently reviewed: [profile AI model preferences](./profile-text-ai-preferences.md)
and [sentence practice](./sentence-practice.md). These
prompts are not generated yet. Each will cover loading, empty, error, recovery,
interaction and accessibility states, omit concrete API paths from its copyable
block, and receive a versioned feature-owned handoff. Frontend implementation
waits for the user's returned Magic Patterns designs.

The sentence prompt must cover default AI checking and the explicit free reference
comparison alternative, including zero-credit/model-unavailable use of saved
exercises, manual completion without grade, separate AI/manual summaries/history,
reference assistance, loading/retry/revoked/stale/deleted states, and preserved
answer draft across dialog/fullscreen switches. Never promise free new generation.

The two selected v001 designs were implemented and verified on 2026-10-05 in
[feature 037](../../.agent/features/037-sentence-practice-web/FEATURE.md).
The handoffs retain unchanged frozen prompt/source identities and record final
implementation proof and mechanical backlog-path mappings.

| [Texts](./texts.md) | Folders, whole-text AI translation, aligned reading/editing, contextual vocabulary, sharing and independent copies | v002 backend verified; awaiting generated design ([handoff](../../.agent/features/043-texts/DESIGN.md)) |

| [Learner portrait and AI interview](./learner-portrait.md) | Dashboard/settings entry, guided interview, manual portrait, review/use controls and recovery | Selected Magic Patterns v001 implemented and verified ([handoff](../../.agent/features/051-learner-portrait/DESIGN.md)) |
