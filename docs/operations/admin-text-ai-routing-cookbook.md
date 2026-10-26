---
type: operations
title: Configure text AI routes in admin with concrete local-testing examples
created: 2026-10-26
updated: 2026-10-26
source_paths:
    - apps/admin/src/pages/ai-settings
    - apps/admin/src/pages/accounting
    - apps/backend/src/config/text-ai-probe-environment.ts
    - apps/backend/src/modules/text-ai
    - packages/contracts/src/text-ai-routing.ts
---

# Configure text AI routes in admin

This is a manual setup recipe for the current web app, using the admin panel at
`http://localhost:3001`. Start with **Example A: OpenRouter Luna for every flow**.
Once that works, optionally add the per-flow alternatives in Example B.

The values below are for bounded local testing. Provider price observations were
checked on **2026-10-26**; review them again before production publication. Credit
tariffs are an explicitly proposed test price list, not provider prices or an
approved commercial margin. This document does not itself publish settings,
authorize an agent to run paid checks, or certify any model's language quality.

## 1. Know which settings belong where

| Setting                                     | Admin location                                          | Unit                                                 | Purpose                              |
| ------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------ |
| Provider rates                              | AI accounting → Provider USD cost rates                 | USD per million tokens                               | Calculate/reserve operator expense   |
| Customer tariffs                            | AI settings → Text AI routes → Routing and flow tariffs | Credits per million tokens, separately for each flow | Determine learner charges            |
| Action/operator limits                      | AI accounting → AI action and provider expense limits   | Credits or USD, as labeled                           | Bound each action and daily exposure |
| Free or paid capability                     | AI accounting → Capability charging policies            | Funding policy                                       | Decide who funds the work            |
| Default, overrides and fallbacks            | AI settings → Text AI routes                            | Reviewed provider/model routes                       | Choose execution routes              |
| Provider credentials and admin-check limits | Ignored repository-root `.env.local`                    | Secrets and explicitly named units                   | Configure server processes           |

The **Historical text tariff — read-only** rows are not where you price new text
work. Use the per-flow fields under **Routing and flow tariffs**. Selecting a
model or funding the provider account does not create missing prices or tariffs.

A route includes both provider and model. For example:

| Route identity                            | Provider field in provider-price form | Model field in provider-price form |
| ----------------------------------------- | ------------------------------------- | ---------------------------------- |
| `openrouter/openai/gpt-6-luna`            | `openrouter`                          | `openai/gpt-6-luna`                |
| `openrouter/qwen/qwen3.5-flash-02-23`     | `openrouter`                          | `qwen/qwen3.5-flash-02-23`         |
| `openrouter/google/gemini-3.1-flash-lite` | `openrouter`                          | `google/gemini-3.1-flash-lite`     |
| `deepseek/deepseek-flash`                 | `deepseek`                            | `deepseek-flash`                   |
| `evolink/gpt-6-luna`                      | `evolink`                             | `gpt-6-luna`                       |

Do not put the full route identity into the Model field: OpenRouter Luna's model
is `openai/gpt-6-luna`, not `openrouter/openai/gpt-6-luna`.

## 2. Prepare credentials and restart

Use a **regular inference API key** for `OPENROUTER_API_KEY`. A management key
can authenticate to account-management APIs while generation fails with 401.
The key previously tested for this project was management-only.

Keep your real keys in `.env.local`, never in this document or admin text fields.
The [environment setup instructions](local-testing-setup.md#environment-settings)
list credentials and the five optional admin-check variables.

Restart `pnpm dev:all` after replacing a key. It runs migrations before starting
API/workers. Wait for both processes to become ready. Changing a key invalidates
matching check fingerprints, so perform fresh checks afterward.

Default check limits are USD 0.01 per request and USD 0.10 per UTC day across
admins. The initial single-route recipe needs 13 checks: one quick and 12 flow
checks. Actual expense is usually below the reservation, but 13 checks could cost
up to USD 0.13, so the daily gate can stop setup. If you explicitly want a larger
setup allowance, temporarily set `AI_ADMIN_PROBE_DAILY_MAX_COST_MICROS=500000`
(USD 0.50/day), restart, and restore `100000` afterward. Leave
`AI_ADMIN_PROBE_MAX_COST_MICROS=10000` (USD 0.01/check). Every click still needs
its own displayed expense approval; this is not an instruction to retry failures.

Sign in as an active **owner**. Sensitive publications require a recent sign-in
within five minutes. If prompted, sign in again and review the current form;
do not repeatedly submit an expired or stale revision.

## 3. Set action and operator limits

Open **AI accounting → AI action and provider expense limits** and enter:

| Field                                                    |                       Local-testing value |
| -------------------------------------------------------- | ----------------------------------------: |
| Default maximum credits per action                       |                                      `10` |
| Maximum provider expense per action (USD)                |                                    `0.10` |
| Maximum provider expense per account per UTC day (USD)   |                                       `1` |
| Maximum provider expense per UTC day, all accounts (USD) |                                       `5` |
| Reason for change                                        | `Configure bounded local text AI testing` |

Click **Publish action budget revision**. These operator limits also apply to
free work. They are not a provider deposit and do not guarantee that all current
quota is available. The default 10-credit budget does not overwrite an existing
learner's saved budget; set that learner's AI-settings maximum to 10 separately.

Under **Capability charging policies**, use this explicit local setup:

| Capability              | Funding                 |
| ----------------------- | ----------------------- |
| `dictionary-generation` | Paid (customer credits) |
| `sentence-generation`   | Paid (customer credits) |
| `text-translation`      | Paid (customer credits) |
| `conversation`          | Paid (customer credits) |
| `portrait-interview`    | Free (operator funded)  |

Both sentence generation/checking use the `sentence-generation` capability;
text detection/translation/selection use `text-translation`. Routing and tariffs
still distinguish their individual flows. Keep speech policies unchanged.

## 4. Publish provider USD rates

Open **AI accounting → Provider USD cost rates → Add provider cost rate**.
Create Luna first. Add Qwen/Gemini only if using Example B.

All token rates below are **USD per one million tokens**. The minimum is USD
per individual provider request. “Blank” means leave the optional field empty.

| Form field                         | OpenRouter Luna                                | OpenRouter Qwen                                | OpenRouter Gemini                                |
| ---------------------------------- | ---------------------------------------------- | ---------------------------------------------- | ------------------------------------------------ |
| Provider                           | `openrouter`                                   | `openrouter`                                   | `openrouter`                                     |
| Model                              | `openai/gpt-6-luna`                            | `qwen/qwen3.5-flash-02-23`                     | `google/gemini-3.1-flash-lite`                   |
| Meter                              | Text tokens (`text-tokens`)                    | Text tokens                                    | Text tokens                                      |
| USD per million input tokens       | `0.10`                                         | `0.065`                                        | `0.25`                                           |
| USD per million output tokens      | `0.50`                                         | `0.26`                                         | `1.50`                                           |
| USD per million cache read tokens  | `0.01`                                         | Blank                                          | `0.025`                                          |
| USD per million cache write tokens | `0.125`                                        | Blank                                          | `0.083334`                                       |
| Minimum USD per request            | Blank                                          | Blank                                          | Blank                                            |
| Price source reference             | `openrouter-luna-standard-2026-10-26`          | `openrouter-qwen-2026-10-26`                   | `openrouter-gemini-standard-2026-10-26`          |
| Reason for change                  | `Reviewed OpenRouter Luna local testing rates` | `Reviewed OpenRouter Qwen local testing rates` | `Reviewed OpenRouter Gemini local testing rates` |

Use the prefilled **current UTC time** in **Effective at (ISO 8601 UTC)**.
For format reference, `2026-10-26T12:00:00.000Z` is valid, but do not blindly use
an old/future example timestamp. A future-effective rate does not fund work now.
If the same provider/model/meter already exists, use **Edit** to publish a new
revision instead of trying to create a duplicate.

Use the matching HTTPS **Price source URL**:

- Luna: <https://openrouter.ai/api/v1/models/openai/gpt-6-luna/endpoints>
- Qwen: <https://openrouter.ai/api/v1/models/qwen/qwen3.5-flash-02-23/endpoints>
- Gemini: <https://openrouter.ai/api/v1/models/google/gemini-3.1-flash-lite/endpoints>

Click **Publish provider cost revision** for each record. These values reflect
published standard short-context endpoints, not an assertion that every endpoint
has the same rate. Luna has cheaper Flex and more expensive priority/tier options;
Gemini also has Flex/region alternatives. The app passes published input/output
rates as OpenRouter price ceilings, which can exclude more expensive endpoints.
Eligible cheaper endpoints can still be used. Strict processing/parameter rules
can further reduce availability. Do not raise prices merely to make a check pass
without reviewing the resulting cost authorization.

The app's reviewed per-call input ceiling is 64,000 tokens, below Luna's 272,000
long-context threshold. Gemini's published cache-write rate repeats beyond six
decimal places; `0.083334` rounds it upward to the admin form's supported precision.
Calculated expense is based on your pinned published rates; provider-bill
reconciliation remains separate. Sources above were checked on 2026-10-26.

## 5. Example A — Luna as the only route

This is the simplest starting configuration. It does not claim that the current
OpenRouter account/model has already passed live checks: run them with your
replacement inference key first.

### Run the checks before publication

Open **AI settings → Text AI routes**. Inspect Luna's row:

- **Credential** must show **Configured**. **Configuration** can still say
  Disabled before you publish the enabled route list.
- **Processing eligibility** must allow this route.
- **Observed worker readiness** must show compatible worker observations.
- **Flow check evidence** is a separate state; key presence and a healthy worker
  do not replace an actual successful check. The row summarizes recent evidence;
  it does not prove that all 12 flow checks have passed.

In **Synthetic provider checks**:

1. Set **Provider / model route** to **openrouter · Luna via OpenRouter**.
2. Set **Check type** to **Quick response**.
3. Tick **I approve this operator expense up to the displayed maximum.**
4. Click **Run check** once. Inspect success, latency, token measurement and USD
   expense. Stop and troubleshoot a failure before attempting other checks.
5. Change **Check type** to **Test selected flow**. Select each of the 12 flows
   below, reapprove expense, and run once per flow. Wait for the displayed route
   cooldown between requests; default 10 seconds. Approval resets after each
   request or option change.

A quick check alone does not permit activation. Every route used for a flow,
including fallbacks, needs its own matching successful flow check. New publication
requires fresh evidence within 24 hours by default.

### Fill routing and credit tariffs

In **Routing and flow tariffs**, set:

| Field                                    | Value                                                    |
| ---------------------------------------- | -------------------------------------------------------- |
| Enabled routes                           | Only **openrouter · Luna via OpenRouter**                |
| Primary route (global/default)           | **openrouter · Luna via OpenRouter**                     |
| Ordered fallback routes (global/default) | Empty                                                    |
| Reason for change                        | `Use verified OpenRouter Luna for local text AI testing` |

Expand **all 12** entries under **Per-flow overrides and credit tariffs**.
For each entry, leave its per-flow Primary route empty and fallback list empty:
that means inherit the global route. Enter the following tariffs in every paid
flow; the fields are not automatically copied between flows:

If the capability is already **Free (operator funded)**, its tariff fields may
remain blank. You can publish Free routing without filling the table below;
provider USD prices, operator limits and successful checks are still required.
Do not switch an existing Free policy to Paid just to follow this example.

| AI flow / check name  | What it covers                             | Input credits / 1M | Output credits / 1M | Cached input credits / 1M |
| --------------------- | ------------------------------------------ | -----------------: | ------------------: | ------------------------: |
| `single-card`         | Single dictionary-card generation          |              `100` |               `500` |                     `100` |
| `card-authoring`      | Editor-card AI authoring                   |              `100` |               `500` |                     `100` |
| `pasted-terms`        | Terms pasted for dictionary generation     |              `100` |               `500` |                     `100` |
| `import-pairs`        | Importing/generating dictionary pairs      |              `100` |               `500` |                     `100` |
| `document-terms`      | Existing document-term extraction flow     |              `100` |               `500` |                     `100` |
| `sentence-generation` | Create practice sentences                  |              `100` |               `500` |                     `100` |
| `sentence-check`      | Check learner sentence answers             |              `100` |               `500` |                     `100` |
| `text-detection`      | Detect text language/structure             |              `100` |               `500` |                     `100` |
| `text-translation`    | Translate text                             |              `100` |               `500` |                     `100` |
| `text-selection-card` | Create a card from selected text           |              `100` |               `500` |                     `100` |
| `conversation`        | Dictionary, text and Knowledge tutor chats |              `100` |               `500` |                     `100` |
| `portrait-interview`  | Interview and portrait work                |    No fields; Free |     No fields; Free |           No fields; Free |

Use the exact field labels **Input credits per million tokens**, **Output credits
per million tokens** and **Cached input credits per million tokens (optional)**.
The cached value 100 intentionally gives no test discount; blank would fall back
to the regular input rate. None of these values should be entered into USD fields.

Click **Publish routing**. Expect a new version. Reload and confirm the saved
route, enabled list, tariffs and empty overrides. If publication fails, read the
error: the draft does not become active merely because the form contains values.

### Understand this price example

For a successful action with 2,000 ordinary input and 1,000 output tokens, no
supporting calls or cache categories:

- Learner charge: `2000 / 1000000 × 100 + 1000 / 1000000 × 500 = 0.700 credits`.
- Calculated standard Luna expense:
  `2000 / 1000000 × $0.10 + 1000 / 1000000 × $0.50 = $0.000700`.

These are different units. This does not establish a dollar value for a credit,
a purchase price or a profit margin. Those depend on actual credit purchases,
fees and provider invoices; a granted test balance is not revenue. Supporting
calls/eligible retries change actual usage, and settlement rounds the cumulative
eligible customer amount upward to 0.001 credit once per action.

With this tariff, 10,000 output tokens cost 5 credits before input/supporting work;
a 10-credit action budget is a cap, not a fixed charge or guaranteed output size.

## 6. Example B — cheap Qwen flows and a Gemini fallback

Keep Luna as the global primary with **no global fallback**. This avoids requiring
additional fallback checks for all 12 flows immediately.

Publish the Qwen and Gemini provider prices from section 4. Run Quick response
once for each newly added route. Then complete this matrix of flow checks:

| Selected route                       | Test selected flow values                                                |
| ------------------------------------ | ------------------------------------------------------------------------ |
| Qwen3.5 Flash via OpenRouter         | `single-card`, `card-authoring`, `sentence-generation`, `sentence-check` |
| Gemini 3.1 Flash Lite via OpenRouter | `conversation`                                                           |

Only proceed if each relevant check succeeds with compatible worker readiness.
The recommendation is a local routing hypothesis, not a verified model-quality
ranking. If an endpoint fails strict structured-output or processing requirements,
leave that override unconfigured and keep the already verified Luna route.

Add Luna, Qwen and Gemini to **Enabled routes**. Expand and edit only:

| Flow                  | Per-flow Primary route       | Per-flow Ordered fallback routes     |
| --------------------- | ---------------------------- | ------------------------------------ |
| `single-card`         | Qwen3.5 Flash via OpenRouter | Luna via OpenRouter                  |
| `card-authoring`      | Qwen3.5 Flash via OpenRouter | Luna via OpenRouter                  |
| `sentence-generation` | Qwen3.5 Flash via OpenRouter | Luna via OpenRouter                  |
| `sentence-check`      | Qwen3.5 Flash via OpenRouter | Luna via OpenRouter                  |
| `conversation`        | Luna via OpenRouter          | Gemini 3.1 Flash Lite via OpenRouter |
| All other flows       | Empty: inherit global Luna   | Empty                                |

Keep the section 5 credit tariffs unchanged. A route switch does not change the
learner's flow price list. Set Reason to `Add verified Qwen task overrides and
Gemini conversation fallback` and click **Publish routing**.

An override replaces the whole primary/fallback policy; it does not append to the
global fallback list. To configure a per-flow fallback, set that flow's Primary
route too. A fallback-only draft with no per-flow primary is not retained.

Select fallbacks in the desired order; the UI uses selection order. Never repeat
the primary as its own fallback. Although the form permits up to four fallback
candidates, an action can make at most **one safe automatic reattempt**, within
its original token and financial limits. Ambiguous upstream execution or visible
streamed output prevents automatic retry. Switching OpenRouter models also does
not provide independence from an OpenRouter account-wide outage or exhausted
OpenRouter balance.

## 7. Other providers: what can be configured today

### Direct DeepSeek fallback

If you want provider independence, direct **deepseek · DeepSeek Flash** can be a
fallback instead. It needs `DEEPSEEK_API_KEY`, its own current provider price,
worker readiness and a successful check for every flow where you add it. Do not
use OpenRouter prices for the direct provider.

The existing [DeepSeek testing profile](local-testing-setup.md#reviewed-profile-values)
contains conservative local estimates: input USD 0.30/1M, output USD1.20/1M,
cache-read USD 0.006/1M, cache-write blank. These are profile estimates, not a newly
verified provider quote. Review direct-provider pricing before publishing them
for real usage. Leaving DeepSeek out of Enabled routes is valid if it is unused.

### EvoLink: synthetic checks only for now

**evolink · Luna via EvoLink** may be checked synthetically but cannot be enabled
for learner content in this release. Both the form and server enforce the
processing-review gate. There is no admin checkbox or environment flag to remove
it. Passing a quick/flow check does not grant learner-processing approval.

The [EvoLink model page](https://evolink.ai/gpt-6-luna) currently advertises
short-context input USD 0.092/1M, output USD 0.450/1M, cache-read USD 0.0089/1M and
cache-write USD 0.114/1M. It also specifies a 0.01 **EvoLink-credit** request minimum;
these are not Languon credits. Account pricing/conversion must be reviewed.

For a **conservative synthetic-check estimate only**, use these candidate
values after reviewing your account rates and conversion:

| Field                                    | Example value                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| Provider / Model / Meter                 | `evolink` / `gpt-6-luna` / Text tokens                                    |
| Input / Output USD per million           | `0.10` / `0.50`                                                           |
| Cache read / Cache write USD per million | `0.01` / `0.125`                                                          |
| Minimum USD per request                  | `0.000150`                                                                |
| Price source reference                   | `evolink-luna-conservative-synthetic-testing`                             |
| Source URL                               | `https://evolink.ai/gpt-6-luna`                                           |
| Reason                                   | `Reviewed conservative synthetic check estimate; learner routing blocked` |

The USD 0.000150 floor assumes USD 0.015 per EvoLink credit; replace it with your
actual reviewed conversion if different. Earlier synthetic verification used this
USD minimum; that does not verify the candidate token rates above. Do not describe that assumption as a
published universal USD minimum or exact invoiced cost. The app requires an
explicit EvoLink minimum before checks. Two earlier synthetic EvoLink checks
passed; that is not proof of every flow/language or approval to enable it.

Retired **Kie Gemini 2.5 Pro** must remain disabled; do not add it as a fallback.

## 8. Verify from a learner account

Use a synthetic ordinary learner such as `learner@example.test`, not an unlimited
account, if you want to exercise credit reservations/settlement. Through the
existing user-credit controls, grant 100 test credits with an audit reason; do not
record that grant as a purchase. In the learner's AI settings, set maximum credits
per action to 10. Ensure the relevant feature is enabled in the existing environment
and that its worker supports the required formats; routing does not enable a
feature flag or install an OCR/document pipeline.

Check these actual app actions after publication:

1. Create a dictionary card from a short French phrase, review and save it.
2. Generate a practice sentence, submit an answer and check it.
3. Create/translate a short text and save it.
4. Send one Knowledge/dictionary/text chat message, leave and reconnect; it must
   resume the same work rather than create another generation/charge.
5. Start the portrait interview: it should say Free and create no learner hold,
   while operator expense is still recorded.

Use **Settings → Credits** for the learner's available balance. Inspect admin
accounting records for held/settled credits and provider USD expense; model names
and dollar costs are not shown to learners. A successful settings publication or
Quick response alone does not prove these application flows work.

## 9. Troubleshooting and safe recovery

| Symptom                                           | Check / next action                                                                                                                                                                                                                                             |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route option disabled                             | Check configured credential, retired state and processing eligibility. EvoLink learner activation is intentionally blocked.                                                                                                                                     |
| Quick check 401 / authorization failure           | Replace management/invalid key with the correct inference key, restart API/workers, rerun fresh checks.                                                                                                                                                         |
| Quick passed but publication fails                | Check every inherited/overridden/fallback flow, its worker readiness, effective provider prices and required paid-flow tariff.                                                                                                                                  |
| “No eligible provider” / unavailable endpoint     | Strict request, processing or pinned price ceilings may exclude endpoints. Inspect safe diagnostics and reviewed provider endpoint metadata; do not assume more wallet credit fixes it.                                                                         |
| Check says budget insufficient                    | Verify current provider rates/minimum and the explicit probe maximum. Review cost before raising a limit.                                                                                                                                                       |
| Daily check allowance exhausted                   | Stop. Wait for next UTC day or explicitly approve/configure a larger operator allowance; unknown attempts may still occupy their maximum.                                                                                                                       |
| Check timeout / execution unknown                 | Do not immediately retry or confirm recovery. First establish at the provider that upstream work has stopped. Then use Reason for recovery, the attestation checkbox and Confirm provider recovery. Recovery does not erase unknown expense or rerun the check. |
| Generation unavailable despite learner credits    | Provider price, tariff, route evidence, worker or operator budget can still be missing/exhausted. Free work still needs operator limits.                                                                                                                        |
| Learner credits exhausted / tiny output allowance | Inspect exact balance and that learner's saved maximum, not just the application default. Review tariffs; top up explicitly when needed.                                                                                                                        |
| Recent authentication required                    | Sign in again, reload/review the current revision and submit explicitly.                                                                                                                                                                                        |
| Revision conflict                                 | Reload latest settings, reconcile your intended edits and publish again; do not force-overwrite.                                                                                                                                                                |
| Key/adapter/prompt/schema changed                 | Existing evidence may no longer match. Recheck before activation. Previously admitted configuration-mismatch work fails closed; start an explicit new action after remediation.                                                                                 |

For an urgent route problem, use **Emergency disable**, enter a reason and confirm.
This blocks future dispatch including queued work; it does not stop a provider
request already underway. Restore through reviewed checks and a new explicit
routing publication. Never reset accounts, ledger history or migrations to fix a
route.

The [configuration doctor](local-testing-setup.md#inspect-first) is read-only and
can check prerequisites without spending provider funds. The deterministic
[critical workflows](critical-workflows.md) test application regressions; their
success does not certify live provider availability or price accuracy.
