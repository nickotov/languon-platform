---
type: operations
title: Repeatable local testing setup
source_paths:
    - scripts/dev-doctor.mjs
    - scripts/dev-readiness
    - scripts/dev-configure.mjs
    - scripts/dev-setup
    - scripts/dev-all.mjs
---

# Repeatable local testing setup

Use this workflow when a feature is implemented but local model, accounting or
worker settings are missing. It preserves accounts/content and does not generate
AI output. [Critical workflows](./critical-workflows.md) verify actual execution.

## Inspect first

Build dependencies through the usual `pnpm dev:all` startup. Startup runs a
nonblocking configuration doctor after migrations and a bounded runtime check
when app processes launch. Missing AI setup does not prevent opening admin.

```sh
pnpm dev:doctor
pnpm dev:doctor -- --capability texts --learner-email learner@example.test
pnpm dev:doctor -- --env-file /path/to/local-test.env --phase configuration
```

The env file is authoritative for standalone checks. The doctor reads local
PostgreSQL in a read-only transaction, checks migration history, admin-owned routing for each flow and approved fallback,
required worker formats, effective customer/provider prices and operator limits.
Runtime checks include fresh worker evidence. Explicit capability selection also
checks its enable flag; disabled optional capabilities are omitted by default.
Dictionary readiness includes document-file ingestion only when document storage,
the document runtime, or an explicit API/worker format allowlist configures it.
Do not add `document-terms` formats merely to satisfy readiness when the document
pipeline is intentionally unavailable: those formats require private storage and
the document processing dependencies before a worker can start.
The optional learner check uses exact balance and saved action budget.

A ready report does not prove Redis connectivity, provider connectivity, available
daily quota or a successful generation. No paid request is made. Run the selected
critical journey after prerequisites are ready.

## Configure through admin or the reviewed CLI

1. Choose a profile below. `deepseek-local-testing` uses conservative estimates
   for manual real-provider testing. `deterministic-demo` is for an isolated test
   runtime with `APP_ENV=test` and `DICTIONARY_AI_PROVIDER_FIXTURE_MODE=deterministic`.
   The CLI does not switch server adapters or set credentials.
2. Sign in to admin recently. **Accounting** owns application/operator budgets
   and provider USD prices. **AI routing** owns the default, per-flow overrides,
   enabled routes and customer tariffs. Paid flows require a per-flow tariff;
   free interviews do not require one. All routes still require provider prices
   and operator limits. The CLI only publishes the reviewed accounting/provider
   price sample; it never changes routes, invents gateway prices, publishes
   customer tariffs, or runs billable probes.
3. Use the backend origin (default port 4000), not the web proxy. Preview using a recent admin token supplied in `LANGUON_DEV_ADMIN_TOKEN` through
   the environment, never as a command argument or in captured output:

    ```sh
    pnpm dev:configure -- --profile deepseek-local-testing --origin http://localhost:4000 --admin-origin http://localhost:3001
    ```

4. Apply only to a verified local development/test target with an explicit env
   file and exact database name:

    ```sh
    pnpm dev:configure -- --profile deepseek-local-testing --origin http://localhost:4000 --admin-origin http://localhost:3001 --env-file .env.local --confirm-database YOUR_LOCAL_DATABASE_NAME --apply
    ```

    The command checks local environment/database identity, server release and
    administrator/configuration identity against read-only database queries before
    and after writes. A localhost tunnel alone is not evidence of a local target.
    The env file must describe the actual running backend. Conflicts or
    expired recent sign-in stop application; the command never retries financial
    mutations automatically. A failed partial application is recoverable by a new
    preview; existing matching revisions are retained.

5. Optionally supply `--learner-id` for an active non-owner `.test` account. This
   grants 100 test credits once, using a recorded reason and optimistic version.
   It refuses unlimited accounts and active reservations. Later top-ups are
   explicit admin actions; repeated setup does not refill consumed credits.
6. Rerun preview: settings should already match. Run the doctor and the intended
   [critical workflow](./critical-workflows.md). Do not infer success from setup alone.

## Activate a real provider route

For a field-by-field admin walkthrough, concrete provider prices, test credit
tariffs and routing examples, use the
[admin routing cookbook](admin-text-ai-routing-cookbook.md).

### Environment settings

For `pnpm dev:all`, update the ignored repository-root `.env.local`. Keep the
existing EvoLink key and use a regular OpenRouter inference key, not a management
key. The placeholders below are examples, not usable credentials:

```dotenv
EVOLINK_API_KEY=your_existing_evolink_key
OPENROUTER_API_KEY=your_regular_openrouter_inference_key

AI_ADMIN_PROBE_MAX_COST_MICROS=10000
AI_ADMIN_PROBE_DAILY_MAX_COST_MICROS=100000
AI_ADMIN_PROBE_COOLDOWN_SECONDS=10
AI_ADMIN_PROBE_EVIDENCE_HOURS=24
AI_ADMIN_PROBE_TIMEOUT_MS=30000
```

The five probe settings are optional and show the implemented fallback values:
USD 0.01 per check, USD 0.10 total per UTC day, a 10-second cooldown, a 24-hour
activation evidence window and a 30-second check timeout. Omitted settings log
fallback warnings; invalid values fail validation. These limits govern admin
checks, not ordinary learner generation timeouts or learner credit budgets.

Restart the API and workers after credential changes. Restarting `pnpm dev:all`
also applies checked-in database migrations before starting application processes;
it does not publish provider prices, flow tariffs or routing. Models, prices,
default/override/fallback choices and activation belong in admin. Credentials
alone do not activate a route, and there is no environment bypass for EvoLink's
learner-processing eligibility gate. See [.env.example](../../.env.example) for
the complete sanitized environment reference.

### Admin activation

1. Set its credential in the ignored backend/worker environment. Reviewed gateway
   routes use `EVOLINK_API_KEY` or `OPENROUTER_API_KEY`; the doctor reports only
   presence, never values. Restart backend and workers after changes.
2. In **Accounting → Provider prices**, publish the chosen provider/model's
   reviewed current USD input/output rates, applicable cache rates and any
   per-request USD minimum with a
   source and effective date. Existing DeepSeek samples are not gateway prices.
   No EvoLink/OpenRouter production rate is supplied by the setup profiles.
   EvoLink checks require an explicit reviewed per-request minimum. This floor
   applies to operator cost only; it does not create a minimum learner charge.
3. In **AI routing**, choose the default and optional flow overrides/fallbacks.
   Enter approved customer input/output credits per million tokens for each paid
   flow. These are independent of provider USD costs. Review operator probe caps
   before running any checks: checks spend operator funds and need explicit
   authorization when operated by an agent.
4. Use **Quick response** for basic connectivity, then **Test selected flow** for
   every route/flow to be activated. A quick response is insufficient to activate
   structured work. Successful matching checks are required within 24 hours when
   publishing a route. Credentials, schema or adapter changes invalidate checks.
5. Publish explicitly. EvoLink remains unavailable for learner dispatch until its
   processing/privacy controls are reviewed; possessing its key or passing a
   synthetic probe does not approve processing learner content. Retired Kie
   Gemini 2.5 Pro cannot be activated.
6. Run `pnpm dev:doctor -- --capability texts` (substitute the intended capability),
   then the registered deterministic critical flows. The doctor inspects primary
   and fallback prerequisites and never performs a live probe. An unchanged
   active route with aged evidence reports a warning in its successful check:
   dispatch remains allowed, but publication needs fresh evidence. Hard failures
   block readiness until rechecked; transient failures use bounded recovery.

Learners cannot select models. Existing model preferences are ignored for new
work; language, tone, explanation preferences and saved action budgets remain.
The application default action budget does not raise existing learners' budgets.
Edit a synthetic learner's maximum explicitly when necessary.

The backend/worker environment must enable the intended capability. In particular,
`TEXTS_AI_ENABLED=true` requires worker formats `text-detection:v2` and
`text-translation:v3` for folderless work, alongside supported older formats.
Configure the provider credential in the ignored environment, and advertise it
only when actually present. Never paste credentials into this guide or evidence.

### Knowledge block AI actions

Field checks/translations and inline exercise AI evaluation reuse the existing
Texts execution route and configured models. They require `TEXTS_AI_ENABLED=true`.
In production, both `DICTIONARY_JOB_API_ENQUEUED_FORMATS` and
`DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS` must include
`text-translation:v4` for these source-bound actions. This separate admission gate
does not disable ordinary Texts translation when v4 is absent. Existing knowledge
jobs can still be read or cancelled while new admissions are disabled.

If API acceptable/readable/cancellable/discardable format lists are explicitly
configured, include v4 in those lists too: enqueued formats must remain a subset
of every API capability. Empty lists use the current supported defaults. Restart
the API and workers after changing format allowlists.

Use `pnpm dev:doctor -- --capability knowledge-actions` to check this capability's
API/worker format intersection and existing text-translation routing/funding. No
new API key, provider, model selection or production activation is implied. Review
[ADR-0052](../adr/0052-source-bound-knowledge-ai-actions.md) for source/credit
boundaries. The interactive-workbooks critical flow provides deterministic local
browser coverage; tests must not call paid providers.

## Multilingual reference evaluation

The versioned synthetic corpus is
[`multilingual-v1.json`](../../scripts/dev-readiness/fixtures/multilingual-v1.json).
It includes Russian, English, French, Spanish, German, Serbian, Polish, Turkish,
Hungarian, Chinese, Japanese and Korean. Each case contains a correct sentence,
a deliberately incorrect sentence with its correction/reason, acceptable English
translation meanings and a short explanation rubric. Add new languages as new
versioned cases rather than silently changing an existing evaluation baseline.

`node --test scripts/dev-readiness/multilingual-fixtures.test.mjs` validates the
reference structure and coverage offline. It makes no provider calls and proves
no model's linguistic quality. References are engineering-authored examples,
not native-speaker certification. Any separately authorized live evaluation
must retain route/adapter, corpus version, usage, expense and human-reviewed
semantic results. Do not grade translation variants by exact string equality or
report an unevaluated route/language as passing. Probe connectivity and structured
schema checks also do not establish multilingual quality.

## Reviewed profile values

The following tables are rendered from `scripts/dev-setup/profiles.mjs`.
`pnpm check:setup-docs` checks drift; regenerate with
`pnpm dev:configure -- --render-docs` when intentionally changing a profile.

### deepseek-local-testing

Conservative local testing estimates; review current provider rates before real usage.

**Accounting** (API: `/admin/ai/accounting-settings`)

| Field                           | Value |
| ------------------------------- | ----- |
| defaultMaxCreditsPerAction      | 10    |
| maxProviderCostUsdPerAction     | 0.10  |
| maxProviderCostUsdPerAccountDay | 1     |
| maxProviderCostUsdPerDay        | 5     |

**Accounting → provider prices** (API: `/admin/ai/accounting/provider-prices`)

| Field                         | Value                                              |
| ----------------------------- | -------------------------------------------------- |
| providerId                    | deepseek                                           |
| modelId                       | deepseek-flash                                     |
| meter                         | text-tokens                                        |
| inputUsdPerMillionTokens      | 0.30                                               |
| outputUsdPerMillionTokens     | 1.20                                               |
| cacheReadUsdPerMillionTokens  | 0.006                                              |
| cacheWriteUsdPerMillionTokens | Leave empty                                        |
| usdPer1000Characters          | Leave empty                                        |
| sourceReference               | deepseek-flash-peak-testing                        |
| sourceUrl                     | https://api-docs.deepseek.com/quick_start/pricing/ |

### deterministic-demo

Synthetic economics for the disposable deterministic test runtime only.

**Accounting** (API: `/admin/ai/accounting-settings`)

| Field                           | Value |
| ------------------------------- | ----- |
| defaultMaxCreditsPerAction      | 10    |
| maxProviderCostUsdPerAction     | 0.10  |
| maxProviderCostUsdPerAccountDay | 1     |
| maxProviderCostUsdPerDay        | 5     |

**Accounting → provider prices** (API: `/admin/ai/accounting/provider-prices`)

| Field                         | Value                        |
| ----------------------------- | ---------------------------- |
| providerId                    | deepseek                     |
| modelId                       | deepseek-flash               |
| meter                         | text-tokens                  |
| inputUsdPerMillionTokens      | 0.30                         |
| outputUsdPerMillionTokens     | 1.20                         |
| cacheReadUsdPerMillionTokens  | 0.006                        |
| cacheWriteUsdPerMillionTokens | Leave empty                  |
| usdPer1000Characters          | Leave empty                  |
| sourceReference               | synthetic-deterministic-demo |
| sourceUrl                     | Leave empty                  |

### OpenRouter authorization troubleshooting

`OPENROUTER_API_KEY` must contain a regular generation API key. A management
key can authenticate for administration while completion requests return401;
account credit balance does not change that restriction. Replace it in the
ignored server environment, restart the affected API/worker processes, and run
fresh matching flow checks before activation. Never paste credentials into
reports or a learner chat. See OpenRouter's
[management-key documentation](https://openrouter.ai/blog/tutorials/team-spend-controls-setup/)
and [current-key endpoint](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key).
