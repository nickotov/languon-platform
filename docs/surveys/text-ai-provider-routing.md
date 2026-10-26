---
type: survey
title: Text AI providers, model checks and flow routing
research_date: 2026-10-25
source_paths:
    - apps/backend/src/modules/text-ai
    - apps/admin/src/pages/ai-settings
    - apps/web/src/fsd/features/text-ai-preferences
---

# Text AI providers, model checks and flow routing

The twenty interview decisions and consolidated design are confirmed. Feature 054
is implementing them after the prior Kie diagnostics were committed separately.
The learner also authorized bounded synthetic requests to real providers for verification.

See the [consolidated design](../text-ai-routing-design.md) and
[accepted ADR-0046](../adr/0046-admin-owned-text-ai-routing.md).

## Confirmed requirements

- Add OpenRouter and EvoLink alongside existing providers.
- Include a global default and optional per-flow overrides in the first release.
  New flows inherit the default, subject to compatibility.
- Permit administrator-approved ordered fallbacks within existing action limits;
  never retry an ambiguous upstream execution blindly.
- Hide model names and remove learner selection throughout learner interfaces.
  Backend selection must also cease honoring learner model choices. Preserve
  learner controls for tone, explanation style and spending limits.
- Require a successful flow-compatible check before activation. Show check age;
  clear retirement/authentication failures exclude affected routes. A timeout
  alone must not permanently disable a model.
- Routine candidates should provisionally cost at most USD 1 input and USD 3
  output per million tokens. More expensive difficult-task routes need separate
  approval. Provider expense remains independent from learner tariffs.
- Keep a code-reviewed catalog; administrators test, enable and assign supported
  entries. New model entries require compatibility review and deployment.
- Publish stable learner tariffs per AI flow, independent of backend models;
  pin the tariff at admission. Fallbacks cannot raise the authorized charge.
- Provide manual Quick response and Test selected flow checks with synthetic data,
  bounded operator spending, validity, elapsed time, usage/cost and safe errors.
  Combine these with observed runtime health; scheduled paid probes are deferred.
- Constrain gateways to approved upstream routes and required request parameters.
  Apply no-training/data-collection restrictions where supported; never silently
  relax privacy or schema requirements to obtain a fallback.
- Initial quality acceptance covers Russian, English, French, Spanish, German,
  Serbian, Polish, Turkish, Hungarian, Chinese, Japanese and Korean. Expand this
  set later; model support claims must distinguish tested from untested languages.
- Emergency Disable blocks new dispatches, including queued work. A queued action
  can use only a fallback in its pinned policy and budget, otherwise it fails
  without learner charge. Running calls finish unless explicitly stopped.
- EvoLink is explicitly confirmed as the second new gateway alongside OpenRouter.
- Cover all existing text AI flows: dictionary card/batch work, sentence
  generation/checking, text detection/translation, contextual chats and portrait
  interviews. Speech, OCR and embeddings remain outside this release.
- Admin probe defaults: USD 0.01 per probe, USD 0.10 per UTC day across all
  administrators, one concurrent probe per provider, ten-second route cooldown.
  Limits are configurable. Display the maximum before execution; never debit
  learners and reject probes whose bounded cost cannot fit.
- Activation or route changes require a successful matching check within 24 hours.
  Evidence matches route, adapter, credentials revision and flow-contract version.
  Unchanged active routes becoming stale show a warning; age alone does not stop
  them. Learner submission does not trigger a paid check.
- Preserve at most two attempts total per action: original plus one safe retry or
  fallback. All attempts share the original token, time and operator-cost limits.
- Never automatically replace a stream after learner-visible text. A technical
  failure is uncharged and offers explicit Retry as a new action. Before visible
  output, fallback still requires conclusive rejection/completion of the prior
  attempt; disconnected or ambiguous work is not blindly resubmitted.
- Initial new routes: Luna through EvoLink and OpenRouter, Qwen3.5 Flash and Gemini
  3.1 Flash Lite through OpenRouter. Retain working direct DeepSeek as an option;
  keep retired Kie Gemini disabled. Admin selects defaults/fallbacks only after
  route checks and approved processing requirements pass.
- Hard retirement, credential and schema failures require a successful manual
  recheck to clear exclusion. Transient server/rate failures use bounded circuit
  cooldown and controlled recovery. Time alone never clears retirement.
- Maintain versioned synthetic language cases with reviewed expected outcomes;
  separately authorize live quality/latency evaluation. Quick response proves
  responsiveness, not language quality.
- Paid flow activation requires explicit publication of a flow tariff. Preserve
  Free policies, balances, admitted work and historical charges; do not invent
  initial customer rates or reset financial data.

## Existing application constraints

The reviewed catalog currently contains DeepSeek Flash and Kie Gemini 2.5 Pro.
Worker reachability observations do not prove successful completions. Admission
already pins model, provider, pricing and execution limits. Work formats provide
an existing compatibility boundary but not configurable per-flow routing.

Learner selection exists in persisted preferences and API endpoints, as well as
settings/chat selectors. Removing UI alone would leave that authority intact.
[ADR-0026](../adr/0026-shared-text-ai-selection-and-user-preferences.md) and
[ADR-0037](../adr/0037-independent-knowledge-and-agent-proposals.md) define current
selection behavior; changes need an explicit superseding decision. Keep reviewed
endpoints/credentials and adapter compatibility from
[ADR-0021](../adr/0021-dictionary-ai-provider-routing.md), and preserve financial
and bounded retry guarantees from
[ADR-0045](../adr/0045-action-accounting-and-provider-expenses.md).

## Preliminary model shortlist

Published prices are observations, not live availability or quality measurements.
All figures below are USD per million text tokens, before platform funding fees,
taxes, caching, long-context tiers or separately billed tools.

| Candidate through OpenRouter                          | Input | Output | Proposed evaluation role                                                |
| ----------------------------------------------------- | ----: | -----: | ----------------------------------------------------------------------- |
| Qwen3.5 Flash, `qwen/qwen3.5-flash-02-23`             | 0.065 |   0.26 | Low-cost extraction, card fields and sentence tasks                     |
| Gemini 3.1 Flash Lite, `google/gemini-3.1-flash-lite` |  0.25 |   1.50 | Routine explanations and structured language tasks                      |
| DeepSeek V4.1 Flash, `deepseek/deepseek-v4.1-flash`   |  0.02 |   1.00 | Alternative general text route; measure latency with reasoning disabled |

Sources: [Qwen endpoint catalog](https://openrouter.ai/api/v1/models/qwen/qwen3.5-flash-02-23/endpoints),
[Gemini endpoint catalog](https://openrouter.ai/api/v1/models/google/gemini-3.1-flash-lite/endpoints),
[OpenRouter model catalog](https://openrouter.ai/api/v1/models).
Gemini figures use standard global endpoints, excluding cheaper Flex tiers.
Catalogs advertise structured-output support; actual application schemas still
need verification. These roles are proposals, not measured quality rankings.

### GPT-6 Luna

Add GPT-6 Luna to the evaluation shortlist in response to the user's request.
Official OpenAI documentation lists `gpt-6-luna` at USD 0.10 input and 0.50 output
per million standard short-context text tokens, with streaming and structured
outputs. It fits the agreed routine ceiling. Start evaluation with reasoning
disabled for routine work; measure quality before using it for sentence grading.
Chat Completions function calling requires reasoning effort `none`; Responses
supports the broader tool interface. These are adapter compatibility constraints,
not reasons to add tools to existing flows.
Source: [official OpenAI model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna).

OpenRouter publishes `openai/gpt-6-luna` and endpoint metadata. EvoLink's model page
also confirms the exact ID `gpt-6-luna`, Chat Completions/Responses and structured
outputs, with short-context input USD 0.092, output USD 0.45, cache read USD 0.0089
and cache write USD 0.114 per million tokens. It documents long-context pricing
and a minimum charge of 0.01 EvoLink credits per request; provider credits are not
Languon learner credits. Account-specific rates and processing constraints need
verification before activation. Each gateway route requires its own successful
admin probe and application-schema checks.
Sources: [OpenRouter Luna endpoints](https://openrouter.ai/api/v1/models/openai/gpt-6-luna/endpoints),
[EvoLink Luna route](https://evolink.ai/gpt-6-luna).

Correction to the earlier research: EvoLink Luna is now documented as Available.
Earlier search results included an older Coming soon entry, which must not be
used as current availability evidence. No live call has been made.

OpenRouter can route between upstream providers. It supports parameter filtering
and provider data-collection restrictions; use explicit routing constraints rather
than assuming every endpoint preserves the same contract. See
[provider routing documentation](https://github.com/OpenRouterTeam/docs/blob/main/guides/routing/provider-selection.mdx)
and [structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs).

EvoLink documents multiple text families and OpenAI-compatible protocols. Its
changelog says legacy DeepSeek aliases now redirect to V4.1 Flash, with thinking
enabled by default unless disabled. That can change latency and token consumption;
avoid treating an alias as an immutable model identity. Exact EvoLink routes,
prices and schema behavior remain to be verified before recommendation. Sources:
[documentation index](https://evolink.ai/docs/llms.txt),
[model catalog](https://evolink.ai/models),
[changelog](https://evolink.ai/changelog).

## Activation prerequisites, not unresolved product choices

Account access, credentials, current provider prices, upstream privacy controls,
route-contract checks and live quality evidence must be verified before enabling
new routes. Actual learner tariff values require explicit admin publication.
The live evaluation budget requires separate authorization; no benchmark has run.

Implementation must pin the approved fallback policy and candidate pricing at
admission, preserve exact accounting and prevent gateway retries from multiplying
the two-attempt ceiling. Provider minimum charges and long-context rates belong
in operator cost bounds; token rates alone may underestimate expense. If a gateway
cannot enforce the approved upstream/attempt/privacy contract, that route cannot
be activated under a claim that those constraints are enforced.

## Validation proposal

Keep deterministic SDK/HTTP contract tests and production worker composition tests
in the offline critical gate. Admin probes use synthetic content, bounded output,
recorded operator expense and no customer charge. Separate a basic response check
from real flow-schema validation and multilingual quality evaluation. No paid
checks or benchmarks were run for this survey.
