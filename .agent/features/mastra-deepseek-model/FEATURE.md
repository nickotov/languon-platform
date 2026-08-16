# Mastra DeepSeek Model

Status: Complete
Owner: Codex
Created: 2026-08-16

## Problem

The Mastra development harness is pinned to an OpenAI model and treats
`OPENAI_API_KEY` as the only credential that enables live agent execution. The
requested development provider is DeepSeek, so the current defaults,
validation, runtime gate, examples, and operator guide point at the wrong paid
service.

## Desired behavior

The development harness defaults to Mastra's direct
`deepseek/deepseek-chat` model and uses it as the fixed fallback when a
different valid `provider/model` primary is selected through
`MASTRA_MODEL_ID`. Live agent invocation requires `DEEPSEEK_API_KEY` so the
declared fallback is usable; an alternate primary also uses its normal
provider-specific credential. Deterministic tool, workflow, scorer,
playground, and Studio behavior remains available without any model
credential, and callers cannot select or override models over HTTP.

## Acceptance criteria

- [x] AC-1 — The harness defaults to `deepseek/deepseek-chat`, accepts a
      syntactically valid Mastra `provider/model` primary, and rejects malformed
      model identifiers before server startup.
- [x] AC-2 — Live agent execution is gated by `DEEPSEEK_API_KEY`; a missing or
      blank DeepSeek key returns the sanitized deterministic tripwire, and an
      alternate-provider key alone cannot satisfy the fallback invariant.
- [x] AC-3 — With the default model, the agent uses DeepSeek once; with a
      different configured primary, Mastra receives an ordered primary then
      DeepSeek fallback list with bounded retries, while the existing
      caller-override, cost, timeout, concurrency, loopback, and telemetry
      controls remain intact.
- [x] AC-4 — Sanitized local configuration and developer/user-flow
      documentation describe DeepSeek and no longer instruct harness users to
      configure OpenAI.
- [x] AC-5 — Focused tests, the mapped disposable-database journey, guide
      traceability, full repository checks, and a real Studio/API smoke verify
      the changed behavior without making a paid model request.

## Scope

### In scope

- Generic `provider/model` primary validation, DeepSeek default selection, and
  fixed DeepSeek fallback composition.
- DeepSeek credential detection and missing-key diagnostics.
- Environment examples, Turborepo propagation, tests, development docs, and
  the existing Mastra harness user-flow guide.
- Deterministic and no-credential real-server verification.

### Out of scope

- A production AI-provider strategy or changes to product AI features.
- Provider fallback, multi-provider routing, key acquisition, billing, or
  credential storage.
- A paid DeepSeek response assertion when no development credential is
  available.
- Changing the deterministic harness primitives, persistence model, public
  backend API, or playground lifecycle.

## Constraints and risks

- Use Mastra's pinned direct fallback-provider contract: model ID
  `deepseek/deepseek-chat`, credential `DEEPSEEK_API_KEY`, and no new runtime
  dependency.
- Never log or persist credentials. An alternate primary uses Mastra's normal
  provider-specific environment variable, while an ambient alternate-provider
  key alone cannot bypass the DeepSeek fallback credential guard. The fixed
  fallback carries the key only inside Mastra's non-serialized model config,
  pins the DeepSeek HTTPS origin, and provider error payload logging is
  disabled.
- Preserve the local-only and generated-server policy boundary. Live model
  calls remain opt-in and paid/nondeterministic tests remain prohibited.
- The provider change is limited to the development harness and has no data
  migration or production rollout.

## User-flow documentation

- Required: yes; this changes the model and credential shown and exercised by
  the existing browser/API/CLI/system harness journey.
- Guide: update `docs/user-flows/mastra-agent-development-harness.md`; a second
  guide would duplicate the same executable journey.
- Related guides: `mastra-agent-development-harness`.
- E2E synchronization: preserve scenario
  `playground-provision-run-persist-reset` in
  `apps/backend/tests/e2e/mastra-development-harness.journey.test.ts`, update
  its model fixture and revision marker, and run it against disposable
  PostgreSQL.

## Open decisions

- None. The user selected DeepSeek as both default and fallback while requiring
  alternate primary models; `deepseek-chat` is the smallest compatible
  fallback for the tool-driven agent, while `deepseek-reasoner` would
  intentionally change the execution profile.
