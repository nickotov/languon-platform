# Tutor and learning-tool playground

Status: Complete
Created: 2026-11-12
Owner: Engineering

## Goal and authorization

User explicitly requested saving/committing the exercise plan, then implementing BL-014 and documenting startup and tool/agent testing. Stop after playground handoff for user inspection; exercise implementation remains deferred. Research/plan committed as f8e6a5a2.

## Acceptance criteria

- AC-1 — Existing `pnpm dev:mastra` starts isolated Studio and retains verification primitives while exposing canonical tutor workflow and four generation tools.
- AC-2 — Workflow uses the production resolver/authoring/runner and real persisted synthetic session/proposal paths. Repeated turns, fresh sessions and restart readback work without invented worker leases.
- AC-3 — Standalone tools use production factories with fresh operation state and expose exact validated proposal content through authorized readback.
- AC-4 — Synthetic scenarios cover owned empty source, vocabulary follow-up, grammar revision, missing language, ambiguity and read-only material; fixture/session selectors never grant arbitrary identity/source authority.
- AC-5 — Preserve loopback Host/Origin, exact execution route/body schemas, model/prompt/tool/proxy restrictions, cancellation, concurrency and bounded calls/output/deadlines. All writes use dedicated playground storage.
- AC-6 — Default mode is deterministic and needs no model credentials. Explicit server-configured live mode permits intentional manual developer tests with a fixed model and bounded execution; automated verification never invokes paid providers.
- AC-7 — Local bounded diagnostics expose synthetic model inputs, selected tasks, validated results and proposal readback, without credentials or global raw prompt logging.
- AC-8 — Real Studio browser, disposable PostgreSQL persistence, focused policy/composition tests and affected static checks pass; independent completion/security and tester assessment approve final evidence.
- AC-9 — Current documentation explains startup/shutdown, scenarios, independent tools, multi-turn tutor workflow, deterministic versus live results, failures, persistence/reset and limitations. BL-014/index reflect actual verified delivery.

## Scope and constraints

Extend existing harness and application tables; no separate app UI, new provider, SDK upgrade, exercise format or production route. Native Studio tutor agent chat is deferred: use `run-tutor-turn` workflow because direct base-agent streaming bypasses product orchestration. Production wallet settlement is not proven by synthetic playground execution. Canonical publication remains review-only; app Insert/Save proof remains separate. Follow accepted ADR-0050/0052/0055 and current host/storage policies.

## Documentation and verification

Update `docs/user-flows/mastra-agent-development-harness.md` and its existing mapped disposable E2E journey, plus a concise developer usage guide. No app design change: third-party Studio rendering verified through browser. Source-review includes new model-tool trust boundary and synthetic-data isolation. No unresolved product decisions.
