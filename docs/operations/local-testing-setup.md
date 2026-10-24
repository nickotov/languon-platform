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
PostgreSQL in a read-only transaction, checks migration history, model selection,
required worker formats, effective customer/provider prices and operator limits.
Runtime checks include fresh worker evidence. Explicit capability selection also
checks its enable flag; disabled optional capabilities are omitted by default.
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
   and provider USD prices. **AI settings** owns enabled/default model and customer
   credit tariffs. Both prices are required, even for an operator-funded interview.
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

In the admin UI, choose **DeepSeek Flash** as default and enable it. Publish the
values below, set provider effective date to the publication time, and enter a
reason identifying the selected local profile. Existing learner action budgets
are not raised when the application default changes; edit the synthetic learner's
AI settings explicitly if its saved budget needs to differ.

The backend/worker environment must enable the intended capability. In particular,
`TEXTS_AI_ENABLED=true` requires worker formats `text-detection:v2` and
`text-translation:v3` for folderless work, alongside supported older formats.
Configure the provider credential in the ignored environment, and advertise it
only when actually present. Never paste credentials into this guide or evidence.

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

**AI settings → customer tariffs** (API: `/admin/ai/model-prices`)

| Field                              | Value          |
| ---------------------------------- | -------------- |
| providerId                         | deepseek       |
| modelId                            | deepseek-flash |
| meter                              | text-tokens    |
| creditsPer1000Characters           | Leave empty    |
| minimumCredits                     | Leave empty    |
| inputCreditsPerMillionTokens       | 100            |
| outputCreditsPerMillionTokens      | 300            |
| cachedInputCreditsPerMillionTokens | 100            |
| provisional                        | true           |

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

**AI settings → customer tariffs** (API: `/admin/ai/model-prices`)

| Field                              | Value          |
| ---------------------------------- | -------------- |
| providerId                         | deepseek       |
| modelId                            | deepseek-flash |
| meter                              | text-tokens    |
| creditsPer1000Characters           | Leave empty    |
| minimumCredits                     | Leave empty    |
| inputCreditsPerMillionTokens       | 100            |
| outputCreditsPerMillionTokens      | 300            |
| cachedInputCreditsPerMillionTokens | 100            |
| provisional                        | true           |

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
