# ExecPlan: Mastra DeepSeek Model

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-08-16

## Goal

Deliver a locally verified Mastra development harness that defaults and falls
back to DeepSeek Chat, permits a configured alternate primary model, requires
an available DeepSeek fallback credential for live execution, and retains all
existing deterministic and security behavior.

## Specification

- In scope: See `FEATURE.md`.
- Out of scope: See `FEATURE.md`.

## Existing architecture

- `loadPlaygroundEnvironment` validates the `provider/model` syntax and
  exposes credential availability to the canonical Mastra composition.
- The development-harness primitive owns the model credential tripwire and
  pins the model plus the existing three-step default.
- The generated server policy independently rejects caller model, instruction,
  provider, tool, and generic proxy overrides; those controls must remain
  unchanged.
- `.env.example` and `turbo.json` define the sanitized variable and command
  propagation contract. `docs/development.md` and the current Mastra user-flow
  guide document the operator behavior.
- The pinned Mastra provider registry defines direct provider `deepseek`,
  model `deepseek-chat`, `DEEPSEEK_API_KEY`, and API origin
  `https://api.deepseek.com`; no package addition is required.
- The ADR index contains no accepted decision constraining development-harness
  model providers. This bounded provider substitution is not a durable
  production architecture choice and does not require an ADR.

## Acceptance criteria

- [x] AC-1 — DeepSeek Chat is the validated default, valid alternate
      `provider/model` IDs pass, and malformed IDs fail.
- [x] AC-2 — Only `DEEPSEEK_API_KEY` enables the live agent; no-key behavior is
      sanitized and deterministic.
- [x] AC-3 — Canonical composition orders an alternate primary before a fixed
      DeepSeek fallback, avoids a duplicate fallback for the default, and does
      not weaken server policy or agent limits.
- [x] AC-4 — Environment and operator documentation consistently describe
      DeepSeek.
- [x] AC-5 — Automated, mapped E2E, guide, full-repository, API, and browser
      evidence passes without a paid call.

## Test strategy

- Unit: Required — cover model validation/default, alternate-provider model
  acceptance, credential normalization, alternate-key-only isolation, ordered
  fallback composition, agent defaults, and tripwire metadata.
- Integration: Required — run backend tests so canonical composition and
  generated-server policy remain compatible.
- Contract: Required — verify the real no-key generated API exposes the pinned
  DeepSeek agent and returns the DeepSeek credential error without an external
  model request.
- E2E: Required — rerun the existing disposable PostgreSQL harness journey
  after updating its DeepSeek fixture.
- Browser/device: Required — Mastra Studio is the user-visible surface; verify
  discovery/model display and no-key feedback through the pinned browser
  wrapper.
- Database migration: Not required — schemas and persistence behavior are
  unchanged.
- User-flow guide: Required — update
  `docs/user-flows/mastra-agent-development-harness.md`.
- User-flow E2E: Required — scenario
  `playground-provision-run-persist-reset`, file
  `apps/backend/tests/e2e/mastra-development-harness.journey.test.ts`, command
  `node scripts/run-mastra-playground-e2e.mjs`; changing a current guide
  requires synchronized revision evidence.

## Milestones

- [x] M1 — Exploration and design
    - Objective: establish the pinned DeepSeek provider contract and all
      affected configuration, code, tests, and documentation.
    - Components: provider registry, environment parser, composition,
      primitive, env/Turbo configuration, tests, guide, and feature artifacts.
    - Acceptance criteria: AC-1 through AC-5 planned with no unresolved product
      decision.
    - Required tests: focused unit/integration, mapped E2E, guide checks,
      real-server API/browser, full checks, independent review/security.
    - Evidence: Mastra registry and repository references inspected; current
      guide mapping reports synchronized before edits.
- [x] M2 — Implementation and targeted verification
    - Objective: replace the OpenAI-only contract with a configurable primary
      plus DeepSeek default/fallback while preserving the existing harness
      boundary.
    - Components: environment parser, Mastra options/primitive, env/Turbo,
      unit and mapped E2E fixtures, docs/guide.
    - Acceptance criteria: AC-1 through AC-4.
    - Required tests: focused backend tests, script tests, guide sync.
    - Evidence: environment and primitive focused suites pass (39 tests),
      backend typecheck passes, orchestration script tests pass, guide checks
      pass, and the mapped disposable PostgreSQL journey passes.
- [x] M3 — Full validation and review
    - Objective: establish production-quality handoff evidence and integrate
      the completed feature.
    - Components: disposable E2E, Studio/API smoke, full check, independent
      tester/reviewer/security passes, final artifacts and Git audit.
    - Acceptance criteria: AC-1 through AC-5.
    - Required tests: mapped E2E, browser/API, `pnpm check`, independent passes.
    - Evidence: focused 50/50 tests, mapped disposable E2E 1/1, synchronized
      guide checks, generated Studio/API policy checks, prior browser smoke,
      final `pnpm check`, tester pass, reviewer pass, and security pass.

## Progress

- 2026-08-16 — Classified as a feature because it changes an external model
  provider, credential boundary, and executable development journey; created
  `feature/mastra-deepseek-model` from `main`.
- 2026-08-16 — Inspected repository instructions, feature/testing/user-flow/
  browser/review skills, prior harness artifacts, current guide mapping,
  provider-sensitive source/tests/docs, ADR index, and the pinned Mastra
  provider registry. Next: implement M2.
- 2026-08-16 — Implemented configurable primary model syntax, DeepSeek Chat
  default/fallback composition, DeepSeek fallback credential gating, sanitized
  configuration, tests, and documentation. Focused tests, backend typecheck,
  script tests, guide validation, and mapped disposable E2E pass.
- 2026-08-16 — Real generated server/API/Studio verification passed in default
  DeepSeek and alternate OpenAI-primary modes. DeepSeek metadata and no-key
  tripwire were correct; Studio showed each active primary, telemetry remained
  disabled, and browser sessions closed. Next: full validation and independent
  review.
- 2026-08-17 — Remediated independent findings around processor replacement,
  Studio retry settings, route authority, valid model aliases, provider endpoint
  redirection, and prompt-bearing failure logs. Final generated-server checks,
  50 focused tests, mapped E2E, guide checks, full `pnpm check`, tester,
  reviewer, and security review all pass.

## Decisions

- D-1 — Direct DeepSeek Chat model
    - Context: the user requested DeepSeek as default and fallback, alternate
      primary model selection, and the harness agent exercises a tool through
      ordinary chat generation.
    - Choice and rationale: default and fall back to
      `deepseek/deepseek-chat`; accept one trusted-environment
      `provider/model` primary and use Mastra's ordered native fallback list
      only when it differs from DeepSeek.
    - Alternatives rejected: `deepseek-reasoner` changes the agent execution
      profile; caller-controlled selection violates the existing generated
      server boundary; duplicating DeepSeek in a two-entry list adds pointless
      paid retries.
    - ADR impact: Not ADR-worthy; this is a development-only provider
      substitution behind the existing Mastra boundary.
- D-2 — Provider-specific credential gate
    - Context: the DeepSeek fallback must actually be available even when an
      alternate provider is primary.
    - Choice and rationale: always require `DEEPSEEK_API_KEY` for live agent
      execution and pass it only into the non-serialized, pinned DeepSeek model
      config. Mastra reads the selected primary provider's standard key
      directly when an alternate is configured. The process refuses provider
      URL overrides and harness logging is disabled so provider failures cannot
      serialize prompts or credentials.
    - Alternatives rejected: generic any-key detection, silently disabling the
      fallback, and maintaining a duplicate provider-to-key registry.
    - ADR impact: Not ADR-worthy; it preserves the established no-fallback
      security rule.

## Discoveries

- Official web search was attempted three times but the browsing service
  returned a decoding error. The installed, pinned Mastra registry is the
  runtime source of truth and explicitly identifies the DeepSeek provider,
  supported `deepseek-chat` model, credential variable, and API URL.
- The current guide already owns the full Studio/API/CLI/system journey, so a
  separate DeepSeek guide would fragment one workflow.
- Generated Studio injects `modelSettings: { maxRetries: 2 }`; the HTTP boundary
  accepts that exact envelope for compatibility, strips it before dispatch,
  and preserves the harness's zero-retry model policy.

## Validation

| Check              | Status         | Evidence                                                |
| ------------------ | -------------- | ------------------------------------------------------- |
| Unit               | Passed         | Focused provider/policy suites: 50/50.                  |
| Integration        | Passed         | Generated server and orchestration checks.              |
| Contract           | Passed         | Studio envelope 200; policy overrides 403.              |
| E2E                | Passed         | Disposable PostgreSQL journey: 1/1.                     |
| Browser/device     | Passed         | Default DeepSeek and alternate-primary Studio smoke.    |
| Typecheck          | Passed         | Final `pnpm check`: 10/10 tasks.                        |
| Lint               | Passed         | Final repository ESLint.                                |
| Build              | Passed         | Final `pnpm check`: 7/7 tasks.                          |
| Database migration | Not applicable | No schema or migration changed.                         |
| User-flow guide    | Passed         | 3 guides/mappings; revision synchronized.               |
| User-flow E2E      | Passed         | `mastra-agent-development-harness` mapping and 1/1 run. |
| Independent review | Passed         | Tester and reviewer found no remaining material gap.    |
| Security review    | Passed         | No remaining material security findings.                |

## Remaining work

- None.
