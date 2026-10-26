---
type: design
title: Admin-owned text AI routing and verified model routes
status: accepted
date: 2026-10-25
source_paths:
    - apps/backend/src/modules/text-ai
    - apps/backend/src/modules/ai-credits
    - apps/admin/src/pages/ai-settings
    - apps/web/src/fsd/features/text-ai-preferences
---

# Admin-owned text AI routing and verified model routes

This consolidates the user's twenty confirmed interview decisions. The user
confirmed shared understanding and authorized implementation on 2026-10-25 in
[Feature054](../.agent/features/054-admin-text-ai-routing/FEATURE.md). Paid
evaluation, configuration publication and deployment need their own authority.

## Outcome and scope

Administrators control which reviewed model routes serve each AI flow. Learners
use AI without selecting or seeing a model. A retired or unavailable route is
excluded with actionable operator diagnostics; approved compatible alternatives
can recover work inside its original authorization.

Include all existing text AI work: dictionary card/batch generation, sentence
generation/checking, text detection/translation, contextual chats and portrait
interviews, including supporting AI calls already needed by those flows. Inventory
actual operation formats during implementation so no supporting call bypasses
routing or accounting. Keep domain-owned jobs, prompts, validation and publication.

Speech routing, OCR, embeddings, document ingestion, new tutor/course flows,
scheduled paid probes, arbitrary admin model URLs, Kafka, Bifrost and service
extraction are outside this delivery. Later flows register their requirements and
inherit a compatible default rather than requiring new selection logic.

## Routes and configuration

Keep provider adapters, fixed endpoints, credential references, model identifiers,
supported request features and flow compatibility code-reviewed. Admin may test,
enable and assign reviewed routes; onboarding a new route requires deployment.
Credentials remain server secrets, validated through unified environment handling.

Initial new pool:

| Gateway    | Exact model ID                 | Initial role                       |
| ---------- | ------------------------------ | ---------------------------------- |
| EvoLink    | `gpt-6-luna`                   | Routine text candidate             |
| OpenRouter | `openai/gpt-6-luna`            | Independently checked Luna route   |
| OpenRouter | `qwen/qwen3.5-flash-02-23`     | Low-cost structured task candidate |
| OpenRouter | `google/gemini-3.1-flash-lite` | Alternative routine text candidate |

Retain working direct DeepSeek as a configurable option. Keep retired Kie Gemini
disabled; do not imply that retaining its historical identity makes it executable.
DeepSeek V4.1 through a gateway remains research, not an additional launch route.
The [survey](surveys/text-ai-provider-routing.md) records prices and evidence.
No default/fallback order is automatically published from these proposed roles.

Admin defines one application default policy and optional overrides for individual
flows. Each policy has a primary route and an ordered approved fallback list.
Only enabled routes supporting the complete flow contract are selectable. Validate
default inheritance against each registered flow, including structured responses,
streaming and any required tools. New unsupported flows fail configuration checks
rather than silently using an incompatible default.

Gateway upstream choices must satisfy approved routes, data handling and required
parameters. Disable or constrain gateway/SDK retries and fallbacks so they do not
bypass Languon's attempt, privacy or expense authorization. A route lacking the
required controls stays inactive; do not silently relax constraints to activate it.

## Admin checks and health

Offer Quick response and Test selected flow. Both use synthetic input through the
production adapter/execution composition. The flow check validates the real
application-owned output contract; a successful greeting cannot establish it.
Display pass/fail, flow, checked time, total elapsed time, token measurement,
calculated/estimated/unknown provider expense, and safe failure details. For
streaming checks also capture time to first visible output when available.

Default limits are configurable: USD 0.01 per probe, USD 0.10 per UTC day across
all administrators, one concurrent probe per provider and ten-second route
cooldown. Show maximum cost before execution. Probe reservations are atomic,
audited operator spending, require reviewed prices, and never create a learner
hold or charge. Unknown usage/cost remains unknown rather than becoming zero.
Provider minimum charges, cache categories and context tiers count in bounds.

Require a matching successful flow check from the past 24 hours when enabling or
changing a route. Tie evidence to provider/model route, adapter revision,
credentials revision, processing constraints and flow-contract version. Credential
revision metadata contains no key material. A changed credential/contract is not
validated by old evidence. Merely aging on an unchanged active route causes a
stale warning, not an outage. No paid health check runs on learner submission.

Keep configured state, check evidence and observed runtime health distinct. Record
sanitized failures such as retired model, authentication, upstream credits,
rate limit, timeout, invalid output and unavailable provider. Interpret provider
error envelopes even when HTTP status is 200. Never expose raw provider payloads,
headers, prompts or credentials in diagnostics.

Confirmed retirement, credential and schema-compatibility exclusions require a
successful manual recheck. Transient server/rate failures use bounded circuit
cooldown and controlled recovery. A timeout alone does not permanently disable a
route. Exclusion scope follows evidence: provider credentials can affect multiple
routes; one flow schema failure need not disable unrelated contracts.

Emergency Disable blocks all new dispatches, including queued actions. Running
requests finish unless explicitly stopped. Queued work may use only a compatible
fallback already authorized in its pinned policy and remaining limits; otherwise
fail without learner charge. No automatic rewrite to today's default occurs.

## Admission, fallback and accounting

Resolve the effective policy server-side. At admission pin the routing revision,
approved candidates and execution details, flow credit tariff, charging policy,
candidate provider-price revisions and bounded budget. Idempotent replay returns
the original action. Recheck current exclusions at dispatch without adding newly
configured candidates to already-admitted work.

Keep the existing aggregate output-token ceiling, affordable allowance and
operator-cost controls. Do not reserve the learner's entire balance or multiply
the allowance by the number of candidates. Candidate bounds must fit remaining
authorization before dispatch; an expensive fallback cannot silently reduce a
confirmed allowance or demand another charge. When no candidate fits, stop.

Allow an original attempt and at most one safe automatic retry/fallback, sharing
the original token, time and operator-cost allowances. Necessary multi-call flow
processing still shares one action budget; it does not receive fresh limits per
call or fallback. Every supporting/failed call consumes operational allowances.
The implementation must distinguish necessary calls from retry attempts rather
than breaking multi-call flows with a two-provider-call ceiling.

Retry/fallback requires conclusive completion or rejection of the previous
attempt and no conflicting publication. An ambiguous upstream submission,
disconnect or cancellation signal alone is insufficient evidence. Do not route
around learner insufficiency, abuse limits, policy refusals or input validation.
Technical failures do not add learner charges; provider expense remains recorded.

After learner-visible streamed output, never switch automatically. Mark a
technical failure uncharged and offer explicit Retry as a new action. Preserve
input/partial content and durable reconnect semantics. Leaving a page does not
cancel generation. Explicit Stop retains eligible partial-usage charging under
the existing policy. Supporting tool calls and mutations must preserve their
existing idempotency and publication safeguards across attempts.

Publish credit tariffs by AI flow, independent of backend route expense. Preserve
exact arithmetic, one settlement and existing measurement/rounding rules. Missing
flow tariffs prevent paid activation with a clear setup diagnostic. Free portrait
interviews, other Free policies and existing exemptions remain in effect. No
invented tariffs, surprise additional learner charge or history rewrite.

## Learner experience

Remove model names and selectors from settings, chat controls, errors and other
learner-facing model metadata. Backend authorization must no longer honor saved
explicit preferences or accept new learner model selection. Existing conversations
use effective admin policy for new actions; historical admitted work keeps its
original execution identity internally. Preserve model/provider visibility for
authorized admins and expense reporting.

Retain learner tone, language, explanation style, portrait, chat mode, manual
overrides and action spending limits. Keep available balance in Settings Credits;
do not restore distracting credit panels in learning surfaces. Failure messages
offer actions learners can perform, such as Retry or Top up, rather than choosing
a model. Do not conceal the applicable privacy/data-use disclosures.

## Delivery sequence

1. Inventory flow formats, supporting calls, existing public model surfaces,
   configuration prerequisites and critical-flow coverage. Establish the explicit
   feature plan and superseding ADR; preserve prior uncommitted diagnostic work.
2. Add reviewed gateway adapters and model routes with deterministic real-SDK HTTP
   fixtures for structured output, streaming, errors, deadlines and token usage.
3. Implement versioned admin routing and checks, atomic probe limits, exclusions,
   and audit evidence. Reuse existing module/persistence seams and environment
   exports; do not introduce a separate routing service.
4. Implement pinned candidate authorization and safe fallback across text flows,
   with independent flow tariffs, immutable provider expenses and exact settlement.
5. Remove learner selection authority and presentation, preserving all other
   preferences and existing-chat behavior. Update user-flow guides and tests.
6. Deliver reviewed setup documentation and local-test profiles/doctor checks for
   credentials, rates, tariffs, routing, workers and check evidence. Admin publishes
   calibrated tariffs/prices and activates only verified routes.
7. Run affected checks, full critical gate and independent correctness/security
   review. Perform authorized synthetic live route/quality evaluation separately;
   record actual evidence before claiming a route or language quality verified.

Deploy expanded worker/schema support before publishing new routing. Drain old
admitted actions on compatible code; preserve balances, purchase lots, financial
history and old snapshots. Rollback disables new routing admissions, drains
supported work and retains immutable evidence. Do not revive a retired provider
or reset data to make rollback appear successful.

## Acceptance and verification

- Every existing text flow resolves an effective compatible admin policy; no
  learner request or saved preference can override it.
- Quick response differs from flow-contract validation, and stale/changed evidence
  cannot be misrepresented as a fresh pass. Disabled/retired routes cannot dispatch.
- Tests cover HTTP 200 error envelopes, malformed output, missing usage, auth,
  upstream balance, 429/5xx, timeout, unknown execution and stream interruption
  through production SDK/worker composition with offline HTTP fixtures.
- Disposable database tests prove concurrent probe caps, policy versioning,
  disable-versus-dispatch races, one automatic reattempt, pinned budgets/prices,
  no duplicate result/charge, technical-failure release and Free operator expense.
- Playwright journeys cover admin checks/routing/setup errors and learner card,
  sentence, text, chat and portrait behavior. Verify hidden model information,
  preserved preferences, actionable errors, Stop and reconnect without duplicate
  generation. Required real browser evidence complements repeatable tests.
- No provider check or ledger scan runs on every learner request. Reuse bounded
  versioned configuration reads and existing compact financial/capacity state.
  Measure shared admission against the existing 100 ms p95 benchmark; never infer
  performance from caching alone. Keep provider-generation latency separate.
- Versioned synthetic cases cover Russian, English, French, Spanish, German,
  Serbian, Polish, Turkish, Hungarian, Chinese, Japanese and Korean. Reviewed
  acceptable outcomes distinguish valid alternatives from objective errors.
  Record schema validity, linguistic defects, latency and expense per route/flow;
  no quality badge follows merely from HTTP success or model self-grading.
- Live evaluations require separate bounded cost authorization. Normal automated
  tests remain deterministic and do not call paid providers. Untested routes or
  languages are labeled accordingly; later additions extend the same fixtures.

## Remaining activation inputs

The product decisions are settled. Credentials, account access/geography,
upstream processing controls, actual tariff values and live evaluation evidence
are implementation/activation prerequisites, not facts established by this plan.
Stay fail-closed where a required prerequisite is missing and report it explicitly.
