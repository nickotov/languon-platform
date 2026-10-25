---
feature: ai-accounting
title: AI accounting and action budgets
status: current
last_verified: 2026-10-22
surfaces:
    - browser
    - admin
    - api
source_paths:
    - .agent/features/052-ai-accounting/**
    - apps/backend/src/modules/ai-credits/**
    - apps/backend/src/modules/conversations/**
    - apps/backend/src/modules/text-ai/**
    - apps/backend/src/modules/learner-portraits/**
    - apps/backend/tests/support/contextual-assistant-*.ts
    - apps/backend/tests/support/legacy-action-fixture.ts
    - apps/backend/tests/support/ai-accounting-fixture.ts
    - apps/admin/src/pages/accounting/**
    - apps/admin/src/shared/api/admin-api.ts
    - apps/web/src/fsd/entities/ai-action/**
    - apps/web/src/fsd/features/sentence-training/**
    - apps/web/src/fsd/features/text-reading/**
    - apps/web/src/fsd/widgets/dictionary-editor/**
    - apps/web/src/fsd/pages/texts/**
    - apps/web/src/fsd/pages/learner-portrait/**
    - apps/web/src/fsd/features/text-ai-preferences/**
    - apps/web/src/fsd/widgets/contextual-assistant/**
    - packages/contracts/src/ai-action.ts
    - packages/contracts/src/ai-accounting.ts
    - packages/contracts/src/ai-capability-policy.ts
    - packages/contracts/src/contextual-assistant.ts
    - packages/contracts/src/text-ai/**
    - scripts/run-ai-accounting-e2e.mjs
e2e_command: ai-accounting
e2e_tests:
    - apps/web/tests/e2e/ai-accounting.journeys.spec.ts
    - apps/web/tests/e2e/ai-legacy-budgets.journeys.spec.ts
    - apps/web/tests/e2e/learner-portrait.journeys.spec.ts
    - apps/admin/tests/e2e/admin-user-management.journeys.spec.ts
e2e_scenarios:
    - learner-budget-persists-exactly
    - quoted-send-and-explicit-continuation
    - legacy-dictionary-quote-and-billing
    - legacy-text-quote-and-billing
    - legacy-sentence-quote-and-billing
    - preparation-one-budget-explicit-continue
    - paid-interview-quote-and-billing
    - admin-budget-and-manual-payment
related_features:
    - ai-credit-wallet
    - user-ai-model-preferences-backend
    - contextual-language-assistant-and-knowledge
    - learner-portrait
    - admin-user-management
---

# AI accounting and action budgets

## What this verifies

Learners save an exact maximum credits per action in Settings AI preferences.
Passive balances, budgets and spending details stay in Settings; action panels,
composers, model pickers and completed answers omit these summaries. An affordable output allowance that
needs confirmation cannot start generation until explicit Send. A limited
response requires explicit Continue and a new action budget. Execution status,
errors, insufficient-credit guidance and paid-action consent remain visible.
Canonical API turns retain exact held/charged/released/Free billing and explicit
estimated or unknown measurement. USD prices, expenses and financial records
belong to administration.

An administrator publishes immutable action/provider limits and records an
external payment. Recording is bookkeeping for money already received; it does
not perform checkout or transfer money. Purchased credits are issued once.

The mapped learner and owner browser journeys use real local applications and
disposable PostgreSQL/Redis with deterministic paid-provider boundaries. Consult
feature 052 evidence for the exact executed scenarios, source revisions and
screenshots. Economic fixture values are synthetic and never production recommendations.

## Start the development environment

Use Node 24, pnpm and Docker PostgreSQL/Redis per the root README. Build shared
workspaces with the repository build commands before running these journeys.
The combined registered runner starts the real application harnesses in sequence
and preserves/restores `apps/web/next-env.d.ts`. It does not start or remove
containers. All targets must be exclusive disposable test services.

The learner harness requires PostgreSQL loopback port 55444, database
`languon_auth_assistant_web_test`, Redis loopback port 56444/database 1, backend
4006 and web 3336. Set `ALLOW_DISPOSABLE_DATABASE_TESTS=true`,
`ALLOW_DISPOSABLE_REDIS_TESTS=true`, `AUTH_TEST_DATABASE_URL`,
`AUTH_TEST_DATABASE_CONFIRM=languon_auth_assistant_web_test`,
`AUTH_TEST_REDIS_URL` and `AUTH_TEST_REDIS_CONFIRM=127.0.0.1:56444/1` (or
`localhost:56444/1` matching the Redis URL host). Confirm there is no valuable
data before authorizing the infrastructure. The fixture appends migrations and
seeds synthetic reviewed customer/provider rates and operator limits; only the
external paid model boundary is deterministic. Normal API, authentication,
PostgreSQL, Redis, durable worker and UI remain real.

The admin harness separately requires `ADMIN_E2E_DATABASE_URL` naming an exclusive
loopback database matching `admin.*e2e.*test` or `e2e.*admin.*test`, on an explicit
non-default PostgreSQL port, and `ADMIN_E2E_REDIS_URL` on a separate disposable
loopback service. Set `ADMIN_E2E_ADMIN_ORIGIN=http://localhost:3015`,
`ADMIN_E2E_BACKEND_ORIGIN=http://localhost:4015` and
`ADMIN_E2E_WEB_ORIGIN=http://localhost:3345` for the dedicated accounting run.
These avoid the ordinary development ports; all must be free. Do not reuse the learner database.
The existing administration configuration validates these targets, migrates and
starts real Hono/Vite/Next processes. It provisions synthetic `example.test`
accounts through normal authentication and the reviewed local membership CLI.
Do not run other schema-reset suites against either target concurrently.

After provisioning and confirming both environments:

```sh
node scripts/run-ai-accounting-e2e.mjs
pnpm user-flow:e2e -- check ai-accounting
pnpm docs:user-flows:check
```

No paid credentials are required or accepted as fixture inputs. Do not use
production accounts, cash transactions, shared databases or real provider calls.

## Browser verification

1. Sign up with a synthetic account and verify with local code `0000`. Open
   Profile → Account → AI settings. Set **Maximum credits per action** to
   `20.125`, save and reload. The input remains exact; compact display is
   `20.13`, and its disclosure reveals `20.125`. Repeat at 390px and check
   the label, control and disclosure remain readable.
2. For the paid quote fixture, save `60.125` credits/action (the conservative
   serialized text-context bound is larger than the profile-only display example).
   Create an owned text and open the language tutor. Its composer omits the
   passive maximum summary. An expensive model never silently raises it.
   In the deterministic fixture, ask `Explain bank — output limit fixture`.
   The real backend returns `409 action_confirmation_required`. The dialog
   shows exact/compact maximum, approximate output-token allowance and expiry.
3. Before confirmation, inspect canonical detail: no turn has been admitted.
   The unsent question remains intact. **Keep editing** cancels; **Top up**
   opens the existing credits page in another tab, preserving the composer.
   **Send** explicitly authorizes the displayed offer. The retry retains the
   original request ID, content and context and adds only `confirmedQuoteId`.
   A newer reduced offer requires another explicit confirmation.
4. The deterministic provider finishes with its real `length` finish reason.
   The completed response shows **Response limit reached** and **Continue**.
   No automatic action starts. Canonical API detail reports Charged with a
   positive exact settled amount. The answer has no Charged trigger or Usage
   popover; the response and explicit Continue remain available.
5. Select **Continue**. This starts a new request ID with the saved maximum and
   no `retryOf`; it can require another budget confirmation. Keep editing to
   decline that offer and verify no second turn was admitted. Capture console,
   failed-request and screenshot evidence for the actual states inspected.

## Paid dictionary, text, sentence and interview verification

The registered runner additionally uses the guarded public web configuration with
`AUTH_E2E_TEXT_SERVICES=true` for deterministic text/dictionary jobs, then
`AUTH_E2E_SENTENCE_SERVICES=true` for the sentence fixture worker. Finally it runs
the existing portrait scenario with `LEARNER_PORTRAIT_TEST_PAID=true` on API 4007
and web 3337. These flags select synthetic provider adapters, never paid calls.
Each harness stops before the next starts. Do not run them concurrently against
the same database or mutate fixture funding while another action is active.

1. Save an explicit `100` maximum. The guarded fixture CLI sets a finite synthetic
   customer balance of `40` credits for dictionary generation. Open a saved card's
   **Rewrite full card with AI** review. It has no passive maximum summary.
   Generate returns a real allowance quote. Top up preserves the review in another
   tab. Before Send, reduce the synthetic balance to `39` using the reviewed fixture.
   The first Send receives a new offer and requires another Send; neither request
   changes the original content, expected version or idempotency key.
2. Complete the dictionary review and reload. The proposal remains available;
   no passive billing disclosure or Usage unknown label appears. Canonical
   accounting retains released zero/unknown usage for this deterministic fixture.
   A successful execution never implies a charge without defensible measurement.
3. For text translation and sentence generation, seed `20` customer credits under
   the matching capability. Their real actions require Send on the reduced offer.
   Text source and original operation ID stay unchanged; its known usage charges
   `0.004` in canonical accounting. Translation and collection panels omit passive
   budget and billing details. Sentence generation freezes its next-operation ID
   and completes the exercise without a passive maximum or spending disclosure. Stored reference review still creates no paid action.
4. The paid portrait scenario first acknowledges the policy change, then separately
   confirms the actual output allowance. Lowering its balance to `19` before Send
   requires a fresh offer and another Send. The same original interview request is
   retained, with no repeated notice. Completed proposals remain reviewable
   without passive billing disclosure; paid and Free accounting policies remain
   unchanged in canonical projections.
5. Preparation uses three synthetic manual entries whose source contains
   `[budget-output-limit]`, with saved maximum and finite wallet both `400`.
   Start authorizes one parent budget without a passive maximum summary. The guarded
   provider adapter consumes 8192 + 1808 output tokens across two children, then
   pauses with zero remaining output in canonical API detail and shows
   **Continue with a new budget**. No
   automatic command or new budget appears. Replenish the synthetic wallet to `400`
   only after the parent has settled (the guarded fixture refuses active holds).
   Explicit Continue creates one new
   parent budget and finishes the remaining entry. Existing examples are retained.
   Review-only preparation has no paid maximum or new-budget authorization.

## Admin verification

1. Sign in as a synthetic owner and open **AI accounting**. Publish default
   `20.125` credits/action and synthetic provider limits `1` USD/action,
   `10` USD/account/UTC day, `100` USD/all accounts/UTC day with a reason.
   Reload and verify the exact default remains. These are test values only.
2. Choose **Record manual transaction** → Customer payment. Enter a synthetic
   existing customer UUID, external reference, `2.125` USD, `0.025` USD fees
   and `3.125` purchased credits, with a reason. Save once. The dialog closes;
   one row shows the reference and exact amount. Reload: one row remains.
   This records an already-received external payment and grants credits; it
   cannot charge a payment method. Review settings at desktop and 390px.
3. Reports distinguish cash payments/refunds from usage expenses and purchased
   from granted credits. Deposits fund providers; they are not generation
   expense. Missing trustworthy costs remain unknown. Reports can prepare
   asynchronously and refresh within 60 seconds; do not equate unknown with zero.

## API verification

1. `GET`/`PUT /users/me/ai-model-preference` returns/saves
   `maxCreditsPerAction` as a decimal string with at most three places, under
   the same optimistic version as model choice. Null means uncalibrated.
2. `POST /conversations/:id/turns` returns a bounded offer in
   `error.details.quote` when confirmation is required. Retry the exact same
   request with its `confirmedQuoteId`. Replaying an admitted request cannot
   create another action/charge. `GET /conversations/:id` exposes actual optional
   `billing` and `outputLimitReached`, never provider secrets or USD prices.
3. Owner-only `/admin/ai/accounting-settings` and
   `/admin/ai/accounting/records` require authenticated administrative authority.
   Payment/refund/provider deposit/balance/bill records use exact decimal amounts,
   idempotency keys and reasons. A refund cannot silently revoke held/consumed
   credits. Lower-layer real database/HTTP tests cover those concurrency and
   authorization invariants; the browser payment scenario covers composition.

## E2E coverage

- `learner-budget-persists-exactly`: real profile save/reload, exact API value,
  compact/exact disclosure and narrow rendering.
- `quoted-send-and-explicit-continuation`: real quote admission boundary, no turn
  before consent, same frozen request on confirmation, canonical charged detail,
  provider length limit and explicit new action without automatic continuation.
- `legacy-dictionary-quote-and-billing`: changed balance requires another explicit
  Send with the same frozen body/key; completed review survives reload without
  passive billing disclosure.
- `legacy-text-quote-and-billing`: unsent source and operation ID survive actual
  allowance confirmation, then translated content renders without passive billing.
  Save/share and signed-in selection collection omit the passive maximum.
- `legacy-sentence-quote-and-billing`: the frozen operation requires Send and
  successful generation renders an exercise without passive billing details.
- `preparation-one-budget-explicit-continue`: a shared 10,000-token output limit pauses
  automatic children and only explicit Continue admits another parent budget.
- `paid-interview-quote-and-billing`: policy acknowledgment, actual allowance
  consent and changed-balance reoffer stay separate from proposal review; no passive billing appears.
- `admin-budget-and-manual-payment`: real owner settings publication/reload and
  one persisted external payment record with exact USD/credit inputs.

Exact arithmetic, lost-confirmation races, further reductions, failed-action
release, provider reconciliation, refunds, burst limits, quota/operator-budget
races and unauthorized access have focused unit/HTTP/real PostgreSQL/Redis
coverage. The browser tests do not emulate financial actions through DOM mocks.

## Expected failure and edge cases

- Uncalibrated customer/provider/operator limits fail closed for new work. Null
  is not unlimited. Admitted actions keep their pinned rates and authorization.
- Concurrent spending or an expired/stale quote can return a fresh offer; each
  reduction needs explicit consent. Failure leaves the editable draft intact.
- Technical/invalid failures release customer holds. Stops use defensible usage
  when available; estimates are labeled. Unknown cannot become a surprise debit.
- Interview actions are Free under the default admin policy, limited to 30
  admitted actions/account/UTC day and one active action. Failures count;
  same-key replays do not count again. See [Learner portrait](./learner-portrait.md).
- Disconnecting only unsubscribes. Reconnect replays durable data; Stop is the
  explicit cancellation action. No retries/Continue are triggered by rendering.

## Automated regression checks

Run the registered combined journey after migrations and fixture target checks.
Focused web regression includes `tutor-budget-confirmation.test.tsx`,
`action-budget.test.ts`, `action-consent.test.tsx`,
`sentence-training-api.test.ts` and `text-ai-preferences.test.tsx`; real backend accounting tests cover money and
concurrency. Record actual commands/results in feature 052 evidence.

## Troubleshooting

For `model_unavailable`, verify deterministic fixture rate/operator seeds and
current capability observation; never add paid credentials. For missing quote
details, rebuild contracts and restart the fixture. For report preparation,
check the report worker and period; do not substitute zeros. A migration error
must be resolved on the confirmed disposable target before rerunning. Never
reset another agent's database to make a browser test pass.

## Cleanup

Allow harnesses to stop their child processes, close clients and remove their
own Redis namespace. Retain synthetic PostgreSQL rows for diagnosis. Stop only
containers created and owned for this run after all dependent suites finish.
Never flush shared Redis, truncate a development database or delete historical
financial records as cleanup.
