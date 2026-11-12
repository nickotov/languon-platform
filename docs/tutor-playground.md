---
type: reference
title: Running the tutor and learning-tool playground
source_paths:
    - apps/backend/src/mastra/**
    - apps/backend/src/modules/development-harness/**
    - scripts/dev-mastra.mjs
---

# Running the tutor and learning-tool playground

Use Mastra Studio to test the tutor's complete request pipeline and the four
learning-content tools with isolated synthetic material. Tutor sessions and
generated proposals persist in the dedicated playground database. The normal
Languon application does not need to be running.

## Start and stop

Use Node.js 24, the repository's pnpm version, installed dependencies, and Docker.
Create `.env.local` from `.env.example` only if it does not already exist. Keep
the existing `MASTRA_PLAYGROUND_DATABASE_URL` and
`MASTRA_PLAYGROUND_ADMIN_DATABASE_URL` settings pointed at the documented
loopback playground database, separately from `DATABASE_URL`.

Run from the repository root:

```sh
pnpm dev:mastra
```

Open [Studio](http://127.0.0.1:4111). Startup builds dependencies, starts local
PostgreSQL, applies migrations, provisions the synthetic principal, and starts
Studio and prompt watching. It does not start Hono, web, admin, mobile, or Redis.
Stop with `Ctrl+C`. Restarting preserves playground sessions and proposals.

## Deterministic and live execution

The default is `MASTRA_TUTOR_MODE=deterministic`. It needs no provider credentials
and makes no external model calls. Its documented English fixture commands
exercise real routing, validation, source resolution, worker leases, and proposal
persistence with synthetic provider responses. Its translations and explanations
are intentionally synthetic; use it to inspect the execution flow, not language
quality or general instruction-following ability.

For intentional manual tests with a real model, the **isolated playground
database** must first have a reviewed conversation route, provider prices,
capability policy, and applicable action/operator budgets. These are application
configuration records; enabling live mode or supplying a provider key does not
create them. The playground never copies configuration from the ordinary
application database. Missing configuration fails closed before provider dispatch.

After that configuration is present, set `.env.local` before startup:

```dotenv
MASTRA_TUTOR_MODE=live
```

Supply the selected route's development credential through its supported
variable: `DEEPSEEK_API_KEY`, `KIE_API_KEY`, `EVOLINK_API_KEY`, or
`OPENROUTER_API_KEY`. Restart the harness. Tutor live execution uses real
conversation admission, the admitted route snapshot, and provider-expense
settlement in the playground database. Requests cannot override models, prompts,
or tools, and `MASTRA_MODEL_ID` does not select the tutor model. The configured
route's authorization, prices, budgets, and funding policy remain authoritative;
real provider calls cost money. Deterministic mode uses synthetic accounting and
does not establish live financial proof.

The [admin routing cookbook](operations/admin-text-ai-routing-cookbook.md)
describes the route, price, and funding records. Its ordinary application setup
targets must not be reused unchanged: administration for this mode must be
explicitly bound to the isolated playground database. There is no automatic
live-route provisioning during `pnpm dev:mastra` startup.

An operator with administration explicitly connected to that database must review:

| Control                                                   | Required playground configuration                                                                                                                                                                                             |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AI settings → Text AI routes**                          | Enable an eligible reviewed provider/model route and select it for `conversation`, including any approved fallbacks and processing controls.                                                                                  |
| **AI accounting → Provider USD cost rates**               | Publish effective rates for every selected route using current verified provider prices.                                                                                                                                      |
| **AI accounting → AI action and provider expense limits** | Set bounded per-action and daily operator exposure and the default action credit limit.                                                                                                                                       |
| **AI accounting → Capability charging policies**          | Choose the intended funding policy for `conversation`.                                                                                                                                                                        |
| **Text AI routes → Routing and flow tariffs**             | For customer-funded conversation work, publish its required credit tariffs.                                                                                                                                                   |
| **Synthetic learner AI settings / wallet**                | Set the playground principal's saved per-action limit and, for customer-funded work, grant a finite test balance through the existing reviewed controls. A new default action limit does not overwrite a saved learner limit. |
| **Provider credentials**                                  | Configure the selected route's supported development key and restart the harness.                                                                                                                                             |

The starter playground is ready for deterministic testing, not automatically
ready for live generation. This feature does not bootstrap an administrator or
launch an admin service for the isolated database. Until an operator supplies
that isolated configuration, leave tutor mode deterministic; do not point the
playground at the application database or copy its users/configuration to make
live requests pass.

The separate **development verification agent** uses `MASTRA_MODEL_ID` and
retains its existing DeepSeek fallback behavior. It requires `DEEPSEEK_API_KEY` for live agent chat,
plus the selected primary provider's key if different. Its configuration is
described in the [harness guide](user-flows/mastra-agent-development-harness.md).
Automated checks never invoke paid providers. Agent-initiated paid verification
continues to follow the repository's standing AI smoke policy; manually enabling
live mode does not expand that allowance.

## Run the complete tutor

In **Workflows**, select **run-tutor-turn**. Use an empty request context or a
matching `tutor-*` preset. The older `synthetic-principal` presets belong to the
verification primitives and are not valid tutor context.

Start a new session with:

```json
{
    "scenarioId": "empty-owned",
    "message": "Generate 3 English vocabulary words with Spanish translations."
}
```

Inspect `status`, `response`, `proposals`, and `diagnostics` in the workflow
result. Keep the returned `sessionId`. To continue, rerun the workflow with the
same scenario and that actual UUID:

```json
{
    "scenarioId": "empty-owned",
    "sessionId": "<sessionId from the first result>",
    "message": "Generate 3 exercises from the vocabulary proposal."
}
```

Omit `sessionId` to start fresh. A session belongs to its original scenario;
changing the scenario while retaining a session ID is rejected. One tutor/tool
operation runs at a time. Cancelling a run propagates to the operation.

The full tutor runs through this workflow because native Studio agent chat
does not include Languon's surrounding request planning and publication logic.
The workflow exercises that production runner and the persisted application
path. The **Agents** page's verification agent is a separate connectivity and
principal check, not the complete learning tutor.

## Test individual tools

In **Tools**, select a generator. Use empty request context for a fresh
`empty-owned` session, or set context to an existing session:

```json
{
    "scenarioId": "empty-owned",
    "sessionId": "<sessionId from a prior result>"
}
```

Studio's generated form may show an optional source union as a required
**Kind** selector. For the current synthetic note, choose **editor** if that
selector appears, then fill the ordinary instruction/language/count fields.
This is a Studio form behavior; `source` remains optional in the tool API.

Enter one of these inputs:

| Tool                      | Example input                                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generate_vocabulary`     | `{"instruction":"Create vocabulary for these words.","language":"en","translationLanguage":"es","words":["river","bridge","garden"],"count":3}`                       |
| `generate_grammar`        | `{"instruction":"Explain the present simple.","language":"en"}`                                                                                                       |
| `generate_bilingual_text` | `{"instruction":"Translate this passage.","language":"en","translationLanguage":"es","sourceText":"A river runs beside the garden."}`                                 |
| `generate_exercises`      | `{"instruction":"Practise these words.","language":"en","words":["river","bridge","garden"],"count":3,"formats":["multiple-choice","fill-in-the-blank","free-text"]}` |

Generators return the synthetic session/turn details and their result. A ready
result contains a compact proposal receipt; `proposals` contains the validated
blocks. Missing required material returns `needs-clarification`; unsupported
formats return `unsupported`. Neither outcome is successful generation.

For an exact stored readback, select **read-playground-proposal** and enter:

```json
{
    "sessionId": "<sessionId from generation>",
    "proposalId": "<proposal ID from the receipt or proposals list>"
}
```

Readback returns only a proposal belonging to the selected synthetic session.
It does not accept arbitrary application users or notes. Generated proposals
remain review material; Studio does not insert them into a real user's editor
or publish a note. Application Review/Insert/Save must be verified in the app.

## Scenarios and inspection

| Scenario               | Starting material or purpose                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `empty-owned`          | Owned synthetic note for a new generation session.                                                         |
| `vocabulary-follow-up` | Note seeded with English/Spanish vocabulary.                                                               |
| `grammar-revision`     | Note seeded with a grammar block.                                                                          |
| `missing-language`     | Source without a studied language; try “Generate vocabulary without a language” to exercise clarification. |
| `ambiguous`            | Unspecified request exploration; use live mode to evaluate natural-language ambiguity handling.            |
| `read-only`            | Saved material that allows explanation but rejects author proposals.                                       |

Diagnostics distinguish execution mode and synthetic accounting. Inspect admitted
and settled calls and bounded model input/output where available. Diagnostics
are local per-run inspection, not a persistent production trace archive.

For the deterministic missing-language example, answer the clarification in the
same session. General grammar revision quality, ambiguity resolution, and novel
multi-component instructions require live testing; the deterministic fixture is
not an independent language model.

## Troubleshooting and reset

- **Studio cannot connect:** open the canonical `127.0.0.1:4111` address. Restart the harness and use **Reset Studio Configuration** if an old browser connection is cached.
- **Invalid tutor request context:** use an empty context or a `tutor-*` preset, not `synthetic-principal`.
- **Unavailable session/proposal:** use the returned IDs from the same scenario/session; a full playground reset removes them.
- **Another operation is running:** wait for completion or cancel it before submitting another tool/workflow run.
- **Missing live route, price, capability, or funding:** configure those records through administration explicitly bound to the isolated playground database. Changing `MASTRA_MODEL_ID` does not configure tutor routing. Use deterministic mode until the live prerequisites are ready.
- **No provider key in live mode:** supply the admitted route's provider development credential and restart, or return to deterministic mode.
- **Synthetic answer to an arbitrary request:** deterministic mode supports fixture behavior; switch deliberately to live mode to test model quality.

For a fresh conversation, omit `sessionId`. To discard the entire positively
identified playground, stop the harness and set confirmation to the exact
validated target database name before running:

```sh
MASTRA_PLAYGROUND_RESET_CONFIRM=languon_mastra_playground pnpm mastra:playground:reset
```

If your configured playground has a different permitted suffix, use that exact
database name. Reset refuses a missing or mismatched confirmation and unsafe
targets. It recreates synthetic fixtures and removes playground sessions and
proposals. See the [verified harness flow](user-flows/mastra-agent-development-harness.md)
for full setup, isolation, and verification details.
