---
type: index
title: Architecture diagrams
summary: Source-backed views of implemented behavior, with explicit scope and freshness evidence.
---

# Architecture diagrams

Open the local viewer with `pnpm diagrams`; validate the maintained catalog with
`pnpm diagrams:check`. These diagrams describe repository implementation as reviewed
on 2026-10-19. They do not assert that optional providers, flags or deployment hosts
are active. Start with the system view and follow a narrower flow.

| View                                                                    | Question                                                                                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [System context](system-context.md)                                     | Applications, durable state and external services in the implemented development system.                                              |
| [Module and layer boundaries](module-boundaries.md)                     | Composition roots connect typed business modules and app-local frontend layers.                                                       |
| [Authentication and session refresh](authentication.md)                 | Password/passkey login creates a durable session and browser refresh rotates an opaque credential.                                    |
| [AI job lifecycle and accounting](ai-job-lifecycle.md)                  | Managed admission pins model and price; dictionary fixture mode and bounded execution have explicit branches.                         |
| [Dictionaries and learning](dictionaries-and-learning.md)               | Authored vocabulary, review-first AI generation and personal practice use distinct ownership and revision rules.                      |
| [Texts and contextual vocabulary](texts-and-vocabulary.md)              | Translation becomes saved aligned text only on Save; selected-phrase Add authorizes atomic dictionary publication.                    |
| [Conversations and Knowledge workspace](conversations-and-knowledge.md) | Source chat and note workspaces share durable tutor turns; working drafts, publication and unlisted sharing have separate boundaries. |
| [Speech reuse, generation and pricing](speech-and-pricing.md)           | Saved-source authorization precedes shared recording reuse or confirmed generation with success-only settlement.                      |
| [Development and deployment tooling](development-and-deployment.md)     | Local process topology and implemented release mechanics are distinct from an actually deployed environment.                          |

## Maintained format

Each view is one `type: diagram` Markdown document with a title, summary, exactly
one Mermaid fence, explanatory notes and source links. Frontmatter is the single
catalog; there is no duplicate manifest. `source_paths` names exact repository
files actually used for the view, including applicable accepted ADR/current docs.
`reviewed` records the source-review date, not production verification.

`source_fingerprint` is `sha256:` followed by SHA256 of the UTF-8 concatenation
of sorted source paths. Each entry is the path, a NUL byte, SHA256 of that file's
exact bytes, then a newline. The check reports changed, missing or invalid sources.
A fresh fingerprint proves recorded inputs have not changed; it cannot discover
an omitted edge or a newly added module. Use `$architecture-diagrams` to trace
changes, reconcile diagrams and only then stamp with
`pnpm diagrams:check -- --stamp`.

## Reconciliation and limits

- `docs/architecture.md` still marks document storage/scanning/parser execution as
  planned in its opening paragraphs; composition already contains gated real
  adapters. The system/development views distinguish existence from activation.
- ADR-0035's context and older backend-first guides describe an earlier Texts UI
  phase; current Next route/workspace code provides that UI.
- ADR histories record earlier models and rollout floors. The current catalog and
  [ADR-0038](../adr/0038-preproduction-text-model-retirement.md) define what remains executable; historical prose alone
  does not prove a retired route is active.
- [ADR-0040](../adr/0040-preproduction-owner-scoped-audio-retirement.md) retires the former dictionary audio
  protocol/worker/client and guarded empty assets/jobs/bindings inventory. Current
  shared speech, retained recordings, ledger and speech-owned byte storage remain.
  `DICTIONARY_AUDIO_*` provider/storage configuration names still serve live code.
- Backend operational endpoints are `/livez` and `/readyz`. The diagram atlas has
  its own independent local `/health` route and read-only authority under
  [ADR-0039](../adr/0039-source-backed-local-diagram-atlas.md).
- Mobile is a static Expo home screen. Future courses and adaptive-tutor product
  journeys are not represented as implemented.
- No production deployment is asserted. Release topology is code/design evidence.
- These views are maintained source analyses. Automated checks and browser rendering
  establish freshness and presentation, not exhaustive runtime conformance.
