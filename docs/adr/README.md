---
type: index
title: Architecture Decision Records
---

# Architecture Decision Records

Architecture Decision Records (ADRs) preserve the reasoning behind durable
technical choices. Architecture documentation describes the system's current
shape; ADRs explain why important choices were made and which alternatives were
rejected.

Agents and developers must follow the ADR policy in the root
[`AGENTS.md`](../../AGENTS.md). In particular, accepted ADRs are architectural
constraints, while feature-local decisions belong in the feature's
`EXEC_PLAN.md`.

## Index

| ADR                                                                       | Decision                                              | Status                 |
| ------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------- |
| [ADR-0001](./0001-user-authentication-and-session-strategy.md)            | User authentication and session strategy              | Accepted               |
| [ADR-0002](./0002-drizzle-schema-and-migration-strategy.md)               | Drizzle schema and migration strategy                 | Accepted               |
| [ADR-0003](./0003-user-flow-e2e-traceability.md)                          | User-flow E2E traceability                            | Superseded by ADR-0004 |
| [ADR-0004](./0004-user-flow-e2e-traceability-hardening.md)                | User-flow E2E traceability hardening                  | Accepted               |
| [ADR-0005](./0005-frontend-component-and-fsd-standards.md)                | Frontend component and FSD standards                  | Accepted               |
| [ADR-0006](./0006-web-internationalization-strategy.md)                   | Web internationalization strategy                     | Superseded by ADR-0007 |
| [ADR-0007](./0007-web-request-locale-strategy.md)                         | Web request locale strategy                           | Accepted               |
| [ADR-0008](./0008-web-ui-kit-and-design-source-authority.md)              | Web UI kit and design-source authority                | Superseded by ADR-0016 |
| [ADR-0009](./0009-release-and-deployment-platform.md)                     | Release and deployment platform                       | Accepted               |
| [ADR-0010](./0010-admin-application-and-authorization.md)                 | Admin application and authorization                   | Accepted               |
| [ADR-0011](./0011-dictionary-persistence-and-composition.md)              | Dictionary persistence and composition                | Accepted               |
| [ADR-0012](./0012-dictionary-worker-and-document-ingestion.md)            | Dictionary worker and document ingestion              | Accepted               |
| [ADR-0013](./0013-local-web-dev-command-panel.md)                         | Local web dev command panel                           | Superseded by ADR-0014 |
| [ADR-0014](./0014-web-dev-panel-local-quick-access-sections.md)           | Web dev panel local quick-access sections             | Accepted               |
| [ADR-0015](./0015-figma-make-design-trial.md)                             | Figma Make visual-design trial                        | Superseded by ADR-0016 |
| [ADR-0016](./0016-runtime-ui-kit-authority.md)                            | Runtime UI kit authority                              | Accepted               |
| [ADR-0017](./0017-magic-patterns-tailwind-ui-contract.md)                 | Magic Patterns Tailwind UI contract                   | Accepted               |
| [ADR-0018](./0018-account-deletion-and-restore-boundary.md)               | Account deletion and restore boundary                 | Superseded by ADR-0019 |
| [ADR-0019](./0019-account-deletion-journal-commit-and-replay.md)          | Deletion journal commit and replay safety             | Accepted               |
| [ADR-0020](./0020-dictionary-pronunciation-audio.md)                      | Dictionary pronunciation audio                        | Accepted               |
| [ADR-0021](./0021-dictionary-ai-provider-routing.md)                      | Dictionary AI provider routing                        | Accepted               |
| [ADR-0022](./0022-ai-credit-ledger-and-generation-settlement.md)          | AI credit ledger and generation settlement            | Accepted               |
| [ADR-0023](./0023-archived-dictionary-content-deletion.md)                | Archived dictionary content deletion                  | Accepted               |
| [ADR-0024](./0024-flashcard-learning-state-and-revisions.md)              | Flashcard learning state and revisions                | Accepted               |
| [ADR-0025](./0025-flashcard-capability-enabled-by-default.md)             | Flashcard capability enabled by default               | Accepted               |
| [ADR-0026](./0026-shared-text-ai-selection-and-user-preferences.md)       | Shared text AI and user model preferences             | Accepted               |
| [ADR-0027](./0027-typed-sentence-work-and-shared-ai-accounting.md)        | Typed sentence work and shared AI accounting          | Accepted               |
| [ADR-0028](./0028-sentence-library-visibility-and-preparation.md)         | Sentence library visibility and durable preparation   | Accepted               |
| [ADR-0029](./0029-web-css-modules-and-geometry-tokens.md)                 | Web CSS Modules and geometry tokens                   | Accepted               |
| [ADR-0030](./0030-global-web-shell-and-preference-placement.md)           | Global web shell and preference placement             | Accepted               |
| [ADR-0031](./0031-shared-pronunciation-and-retained-recordings.md)        | Shared pronunciation and retained recordings          | Accepted               |
| [ADR-0032](./0032-model-price-revisions-and-speech-settlement.md)         | Model price revisions and speech settlement           | Accepted               |
| [ADR-0033](./0033-additive-enum-migration-commit-boundaries.md)           | Additive enum migration commit boundaries             | Accepted               |
| [ADR-0034](./0034-speech-model-adapter-registration.md)                   | Speech model adapter registration                     | Accepted               |
| [ADR-0035](./0035-texts-and-contextual-vocabulary-publication.md)         | Texts ownership and contextual vocabulary publication | Accepted               |
| [ADR-0036](./0036-task-specific-text-translation-capacity.md)             | Task-specific immutable translation capacity          | Accepted               |
| [ADR-0037](./0037-independent-knowledge-and-agent-proposals.md)           | Independent knowledge and agent proposals             | Accepted               |
| [ADR-0038](./0038-preproduction-text-model-retirement.md)                 | Preproduction text model retirement                   | Accepted               |
| [ADR-0039](./0039-source-backed-local-diagram-atlas.md)                   | Source-backed local diagram atlas                     | Accepted               |
| [ADR-0040](./0040-preproduction-owner-scoped-audio-retirement.md)         | Preproduction owner-scoped pronunciation retirement   | Accepted               |
| [ADR-0041](./0041-durable-tutor-streaming-presentation.md)                | Durable tutor streaming presentation                  | Accepted               |
| [ADR-0042](./0042-knowledge-workspace-document-and-context-boundaries.md) | Knowledge workspace document and context boundaries   | Accepted               |
| [ADR-0043](./0043-sidebar-navigation-and-optional-text-folders.md)        | Synced resource navigation and optional Texts folders | Accepted               |
| [ADR-0044](./0044-learner-portrait-approval-and-use-boundaries.md)        | Learner portrait approval and use boundaries          | Accepted               |

| [ADR-0045](./0045-action-accounting-and-provider-expenses.md) | Bounded action accounting and independent provider expenses | Accepted |
| [ADR-0046](./0046-admin-owned-text-ai-routing.md) | Admin-owned text AI routing and verified model routes | Accepted |
| [ADR-0047](./0047-delegated-local-admin-mcp.md) | Delegated local administration through defined MCP operations | Accepted |
| [ADR-0048](./0048-official-provider-price-actualization.md) | Official provider price actualization through reviewed adapters | Accepted |
| [ADR-0049](./0049-native-provider-pricing-and-accounting.md) | Native provider pricing and authoritative usage accounting | Accepted |

| [ADR-0050](./0050-interactive-workbook-content-and-learning-boundaries.md) | Interactive workbook content and learning boundaries | Accepted |

| [ADR-0051](./0051-duration-based-transcription-accounting.md) | Duration-based transcription authority and accounting | Accepted |
| [ADR-0052](./0052-source-bound-knowledge-ai-actions.md) | Source-bound knowledge AI authoring and evaluation | Accepted |

Add each new ADR here. Scan this index and search the directory for relevant
keywords instead of reading every record by default.

Each record's YAML frontmatter is authoritative for its metadata; this index
mirrors lifecycle status for readers. Inspect candidate metadata first, then
read relevant decisions and their superseded records in full before making an
architectural choice. Metadata is not a substitute for decision scope or rationale.
See [documentation metadata](../document-metadata.md#specialized-schemas).

## Naming

Copy [`template.md`](./template.md) to the next unused number:

```text
NNNN-kebab-case-decision-title.md
```

Start with `0001` and never reuse a number, including one belonging to a rejected
or superseded decision.

## Statuses

- `Proposed` — under consideration and not yet binding.
- `Accepted` — the active architectural decision.
- `Rejected` — considered but not selected.
- `Deprecated` — still present but discouraged or awaiting retirement.
- `Superseded by ADR-NNNN` — replaced by a newer ADR.

Frontmatter uses lowercase `proposed`, `accepted`, `rejected`, `deprecated`
or `superseded`; full replacement is recorded in `superseded_by`. Preserve
partial supersession scope in descriptive relationship fields without changing
an otherwise accepted record to superseded. Move metadata only; keep original
decision dates and accepted decision/rationale text unchanged.

## Lifecycle

1. Record feature-local choices in `EXEC_PLAN.md`.
2. Create an ADR when a choice establishes a constraint future features must
   respect.
3. Add the ADR to the index and link related plans and documentation.
4. Do not rewrite an accepted record's decision or rationale. Create a new ADR
   to replace it and mark the old one superseded.
5. Keep current architecture documentation aligned with accepted decisions.

Fixes limited to typos, formatting, and broken links do not require a new ADR.
