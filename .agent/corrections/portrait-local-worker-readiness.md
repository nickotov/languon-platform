# Correction: Local portrait interview worker readiness

Status: Complete — live worker and actual admission verified
Created: 2026-10-21

## Routing and scope

Bounded local configuration correction for the already authorized interview feature. No model-selection, charging, billing acknowledgement, API, persistence, sidebar or production policy change. Preserve all current worker task formats and enable the existing portrait-interview:v1 executor in ignored .env.local. Root cause is an older explicit local worker allowlist, which overrides feature defaults. Main5bb2e56 has no missing interview implementation.

## Evidence and acceptance

- User's selected model is DeepSeek Flash. Current global configuration enables it. Live available worker observations advertise conversation:v1 but not portrait-interview:v1; local DICTIONARY_JOB_WORKER_PROCESSABLE_FORMATS omits the latter. Admission correctly rejects unsupported live execution, but generic model guidance wrongly suggests switching away from an already supported selection.
- 409 billing_notice_required is the existing paid-consent handshake before first paid admission. Credits do not replace consent. With creditsBypass=false, retaining this check follows LP16/27. Both reported rejections occur inside rolled-back admission before a provider call/credit hold; do not bypass consent or alter billing to make the request succeed.
- AC1: worker publishes fresh available portrait-interview:v1 execution capability for DeepSeek Flash after restart.
- AC2: existing shared model-selection admission resolves portrait-interview:v1 against actual local catalog/readiness metadata without enqueueing any work or invoking a model.
- AC3: all existing formats and sidebar/portrait data remain intact; app/backend health and normal startup pass.

## Plan and verification

Back up ignored environment configuration privately; append only the missing worker format; restart the local development runner after checking process ownership. Check actual live observation and execute a read-only admission probe. No tests may call paid providers or inspect user interview content. Existing guide already documents missing/expired capability as the model_unavailable cause, so no guide behavior/command change is needed. No application source change means lint/build/browser UI verification is not necessary. Keep misleading generic UI guidance as an explicitly separate source issue unless a focused wording repair is undertaken.

## Outcome

Appended portrait-interview:v1 to ignored .env.local's worker allowlist; all13prior formats preserved and every other environment value unchanged. Original file retained as ignored .env.local.before-portrait-worker-readiness-20261021 with mode0600. Restarted the dev:all process previously started by this agent; normal migrations/applications/worker startup pass, backend readiness and web return HTTP200.

Actual loopback development DB capability query now shows a live available DeepSeek Flash portrait-interview-execution observation advertising portrait-interview:v1. Executed the existing DrizzleTextAiAdmissionParticipant.resolve with the real default availability policy/catalog/pricing and a fresh synthetic owner identifier inside a transaction explicitly rolled back with a sentinel. Result: selected deepseek-flash and portrait-interview:v1 successfully. Zero operations queued, provider calls, or credit reservations; no user content or preferences were read. The prior missing-observation failure is resolved. No application source, migrations, ledger, balance or charging-policy changes.

Independent review is not required for this one-value reversible local config correction; no novel authorization/SQL/security behavior. Existing guard, pricing and billing consent remain unchanged. No new tests added for ignored configuration; live capability and rolled-back actual admission probe directly establish the fix. Existing learner-portrait guide already documents this failure and executor requirement. No automatic commit made.

## Remaining limits

No paid completion was sent as verification; learner can retry the retained answer using DeepSeek Flash. The generic model_unavailable message still conflates a missing worker capability with a model problem; its suggested model switch is misleading for this environment. Wording is not modified in this local-only repair. If the environment is restored from the old backup or a custom worker allowlist omits the interview format again, the same readiness guard will correctly reject it. Paid consent still appears before the first charged operation and after a free-to-paid policy change; balance alone does not imply consent.
