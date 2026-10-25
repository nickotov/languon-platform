---
feature: learner-portrait
title: Learner portrait and AI interview
status: current
last_verified: 2026-10-21
surfaces:
    - api
    - browser
    - system
source_paths:
    - apps/backend/src/modules/learner-portraits/**
    - apps/backend/src/modules/conversations/**
    - apps/backend/src/modules/ai-credits/**
    - apps/backend/src/modules/text-ai/**
    - apps/backend/src/modules/users/infrastructure/persistence/drizzle/**
    - apps/backend/src/config/environment.ts
    - apps/backend/src/infrastructure/worker/**
    - apps/backend/drizzle/**
    - apps/web/src/app/portrait/**
    - apps/web/src/fsd/entities/learner-portrait/**
    - apps/web/src/fsd/features/portrait-editor/**
    - apps/web/src/fsd/features/portrait-entry/**
    - apps/web/src/fsd/features/conversation-preferences/**
    - apps/web/src/fsd/pages/home/**
    - apps/web/src/fsd/pages/profile/**
    - apps/web/src/fsd/pages/learner-portrait/**
    - apps/web/src/fsd/widgets/app-shell/**
    - apps/web/src/fsd/widgets/contextual-assistant/**
    - packages/contracts/src/learner-portrait.ts
    - packages/contracts/src/portrait-interview.ts
    - packages/prompts/src/local/learner-interviewer.ts
e2e_command: learner-portrait
e2e_tests:
    - apps/backend/tests/integration/modules/learner-portraits/learner-portrait.journeys.test.ts
    - apps/web/tests/e2e/learner-portrait.journeys.spec.ts
e2e_scenarios:
    - approved-private-portrait-and-interview-accounting
    - manual-approval-global-off-and-delete-warning
    - resumable-interview-proposal-and-explicit-approval
    - composer-stop-cancels-active-interview
    - invalid-model-output-preserves-interview
    - affordable-response-and-visible-insufficiency
related_features:
    - ai-accounting
    - contextual-language-assistant-and-knowledge
    - ai-credit-wallet
    - profile-account-controls
---

# Learner portrait and AI interview

## What this verifies

An authenticated learner can save a bounded draft from confirmed portrait items,
explicitly approve it, and separately decide whether future chats may use it.
The guided interview is a standalone, resumable operation; it never reads other
chats, publishes a portrait, or enables use. New interview actions use the admin
capability policy: Free by default, with provider expense borne by Languon.
Free actions create no customer hold or charge. The backend admits at most 30
actions per account per UTC day and one queued/running action at a time;
failures count, and replaying the same key does not count again. Provider-cost,
execution and burst limits still apply. Already-admitted operations retain
their pinned policy when administrators change settings.

The serialized input/schema bound and a 10,000-total-output-token action limit
bound execution. An explicitly configured paid interview policy additionally
requires the saved customer budget and affordable input plus at least one output
token; there is no configured minimum useful response fee or token floor.
Exact credits are settled once per action. Technical/invalid failures release
the customer hold; provider expense remains independently accounted.

The web journey uses the actual authenticated application, portrait routes,
conversation preferences, PostgreSQL and Redis. It runs against a dedicated
test-only provider adapter, so no paid provider is called.

## Start the development environment

Use the reviewed root commands in `README.md` for normal local development.
For the mapped automation, use synthetic accounts with a dedicated disposable
loopback PostgreSQL target named `languon_auth_portrait_*_test` on a non-default
port and a dedicated non-default Redis port/database 1–15. Set the four
`ALLOW_DISPOSABLE_*`/`AUTH_TEST_*` confirmation variables accepted by the
repository test harness. The runner refuses missing, ordinary, shared, default
PostgreSQL, or default Redis targets and resets only the confirmed test schema.

The test seeds a current DeepSeek Flash configuration and a separate worker
observation advertising `portrait-interview:v1`. It uses a deterministic
in-process accounting dispatch and never sends a provider request or requires a
credential. Do not log bearer tokens, prompt content, portrait text, or database
credentials.

## API verification

1. `GET /learner-portrait` returns only the caller's state. `PATCH
/learner-portrait/draft` requires the current state and approved versions,
   derives a summary from confirmed bounded items, and rejects an empty approval
   or reusable diagnostic labels. `POST /learner-portrait/approve` removes the
   interview transcript/draft but leaves global use off. `PATCH
/learner-portrait/use` is the separate global choice.
2. `POST /learner-portrait/interview` creates or resumes the sole unfinished
   interview for the caller. `POST /learner-portrait/interview/responses` uses
   an idempotency key and the latest portrait version/generation. Custom answers
   are at most 200 user-visible characters; chat clarification is at most 1,000.
   `GET` and `POST .../stop` for an operation are owner-only.
3. Default Free admission requires the dedicated capability observation,
   configured provider/operator limits and remaining 30/day, one-active quota.
   It does not require a customer balance or paid notice. Tests may explicitly
   publish a paid capability policy; those new admissions require the current
   credit acknowledgment and exact affordable customer budget. Changing policy
   never retroactively charges an already-admitted Free operation.
4. A stale draft/interview version returns `409`; an expired inactive interview
   is removed after fourteen days while an approved portrait survives. Discard
   or confirmed deletion removes the working interview/draft and fences pending
   output from recreating it. Existing ordinary chat history is not deleted.

## System verification

Portrait context is resolved only when an ordinary conversation turn is
admitted. Global use off or the per-chat exclusion omits it; explicit per-chat
settings win over inherited portrait preference fields. New chats can explicitly
inherit portrait preferences, while existing conversations retain their manual
settings until adoption. An already admitted turn retains its own context and
charging policy.

Account deletion participates in portrait cancellation, provider settlement, and
erasure. It must not leave active reservations or allow a pending result to
recreate the user's portrait data.

## Browser verification

The responsive browser journey starts from an authenticated synthetic learner;
it does not mock portrait API responses or browser routes. A manual partial
portrait is saved and approved while global use remains off, then persists over
reload. Explicit global disable wins over a per-chat control, and the mobile
delete confirmation explains that ordinary chat history remains. Two tabs that
save different manual edits must show the latest and local values, require an
explicit reconciliation choice, and save the chosen result.

The interview journey starts and reloads a resumable interview. Both language
questions initially offer Russian, English, French, Spanish, German, Serbian and
Polish; Show more reveals the expanded portrait choices, including Turkish and
Hungarian. Existing custom/adaptive choices and selected language details remain.
Selected-language rows align language name, labeled description and learning
checkbox on desktop and remain usable in a narrow browser. The journey submits a
French/Russian clarification to a deterministic queued worker, reviews its
proposal, adds it to the draft, and saves it through the same separate approval
flow. The resulting portrait is still off until the learner explicitly enables
it. The composer labels default operations Free and explains the 30/action UTC-day
quota and one-active rule. An explicitly paid capability-policy fixture may
exercise the credit-policy notice and then a separate allowance confirmation.
A reduced output requires explicit Send, retaining the original answer/version/
request identity; further reduction returns a new offer requiring another Send.
Top up preserves the answer in another tab. Actual completed, failed or stopped
operation status and errors remain visible without passive billing details.
Canonical API billing retains exact held/charged amounts or Free; unknown
measurement is not a zero cost. This does not represent the default policy or
a production environment bypass flag.

The dedicated [AI accounting guide](./ai-accounting.md) covers paid conversation
allowance confirmation, canonical API billing and explicit new-budget Continue.
Paid interview policy fixtures remain distinct from default Free interviews.

While a response is running, the composer replaces Send with its sole Stop
button. Stop works with an empty or oversized unsent message, does not submit
that message, and retains its text. Cancellation leaves the interview resumable.
If the model returns invalid structured output, the interview shows a specific
recoverable error and retains the answer and editable draft. Reloading does not
automatically retry or incur another provider call.

## E2E coverage

| Scenario                                             | Observable proof                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `approved-private-portrait-and-interview-accounting` | Real authentication, HTTP routes, PostgreSQL state and Redis rate limiting prove owner isolation, draft approval without automatic use, paid provider-accounting settlement, and a zero-charge bypass dispatch that still records provider usage. Additional funded-account regressions verify a bounded first response with20,000credits, genuine insufficiency and settlement/release. The same fixture uses the deployment account-purge role to settle an expired active paid call and allocation, archive only numerical provider usage, erase portrait content, and deny reads of private operation/session/portrait payload columns. |
| `manual-approval-global-off-and-delete-warning`      | Desktop and mobile browser evidence proves partial manual approval remains separately disabled after reload; a real two-tab version conflict preserves local edits until the learner chooses a latest or draft value and saves again; global off disables the per-chat control; and the delete confirmation retains the history warning.                                                                                                                                                                                                                                                                                                    |
| `resumable-interview-proposal-and-explicit-approval` | A real browser reload resumes an interview; default and expanded language choices, retained level/learning selections and responsive row alignment are verified; a deterministic provider-bound worker completes the queued French/Russian response, produces a reviewable proposal, and requires the learner to save it before any portrait exists. Free and paid fixture policies preserve the notice and separate activation choices. The Free browser scenario starts with zero learner credits.                                                                                                                                        |
| `composer-stop-cancels-active-interview`             | Desktop Continue and mobile chat requests use the composer Stop control while the real queued operation runs. Empty and oversized unsent input cannot disable Stop; keyboard input cannot submit a second response. Cancellation retains unsent text and the resumable interview.                                                                                                                                                                                                                                                                                                                                                           |
| `invalid-model-output-preserves-interview`           | A deterministic invalid nested model response produces the specific recoverable failure through the real worker and HTTP polling. The submitted answer survives reload, with no automatic resubmission. Backend tests independently verify one provider call and retained accounting.                                                                                                                                                                                                                                                                                                                                                       |
| `affordable-response-and-visible-insufficiency`      | Paid browser learners with15,608credits complete successive real worker responses; a zero-credit learner sees billing409→confirmation→credits400, with the modal closed, error focused and visible, answer retained and explicit credit/manual-edit actions. Real PostgreSQL tests independently prove cumulative prior charges, exact affordable maximality, immutable output limits, insufficient funds and settlement.                                                                                                                                                                                                                   |

Repository, contract, and worker tests cover Unicode boundaries, diagnosis-label
exclusion, conflict/expiry/delete races, recovery of interrupted calls, operation
idempotency matrices, and ordinary conversation preference resolution. The
mapped HTTP journey deliberately uses deterministic dispatch to avoid paid model
traffic; it does not establish generated wording quality or browser behavior.

## Expected failure and edge cases

- Missing authentication, an invalid origin, malformed data, unacknowledged paid
  notice, unavailable model/capacity, insufficient credits, stale versions, and
  another user's interview operation fail without exposing portrait data.
- Approval and direct manual saving do not make a portrait active. Global off
  wins over a per-chat setting. Disabling use stops future injection only; older
  chat messages can still contain earlier information.
- Default Free interview policy is administered through capability settings.
  It has no learner bypass control or customer hold/charge. Thirty admitted
  actions/account/UTC day includes failures; one active action is allowed.
  Idempotent replay consumes neither another quota slot nor another charge.
- Model failure preserves editable unfinished work until expiry. An unrelated
  interview request receives the bounded `/knowledge` redirect; it cannot become
  new portrait data without explicit review.
- Invalid structured model output returns `invalid_model_output`. The interviewer
  requests and validates its complete output contract in the original provider
  call; it performs no automatic paid repair or fallback call. A learner may
  explicitly retry or edit the portrait manually.
- Admission errors after credit confirmation close the notice and focus the
  persistent error; question scrolling must not move away from it. No error
  automatically retries a paid request or clears the learner's answer.

## Automated regression checks

Run the reviewed registered command only after confirming the disposable targets:

```sh
pnpm test:e2e:learner-portrait
pnpm user-flow:e2e -- check learner-portrait
pnpm docs:user-flows:check
```

The exact test environment, migration revision, command result, and remaining
browser-design gap belong in feature051 evidence. Do not substitute a normal
development database or a paid model call for this deterministic journey.

## Troubleshooting

If the test is skipped, verify the disposable PostgreSQL and Redis gates rather
than relaxing them. A `model_unavailable` response normally means the dedicated
portrait-interview capability observation is absent, expired, or does not match
the configured model. A paid `credits_exhausted` response needs a synthetic
grant and explicit paid capability policy in the disposable fixture. Policy
changes affect only newly admitted interview operations. A `409` requires reloading the current portrait state and
reviewing changes; never replay with a different body under the same operation
key.

## Cleanup

The test closes its authentication composition and removes only its random Redis
namespace. It leaves synthetic database rows for diagnosis. The reset at test
start is destructive only to the caller-confirmed disposable schema. Stop only
containers started for this verification; do not reset regular development,
shared, staging, or production infrastructure.
