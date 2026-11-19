---
type: diagram
title: AI job lifecycle and accounting
summary: Atomic bounded action admission separates learner charges, provider expenses and operator limits.
source_paths:
    - docs/adr/0062-single-submission-lesson-recovery.md
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/generation-lesson-envelope.ts
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/generation-run-attempts.ts
    - apps/backend/src/modules/conversations/application/generation-admission-outcome.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/generation-admission-input.ts
    - apps/backend/src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-admission-participant.ts
    - apps/backend/src/modules/text-ai/application/text-ai-provider-catalog.ts
    - apps/backend/src/modules/ai-credits/application/ai-credit-participant.ts
    - apps/backend/src/infrastructure/worker/dictionary-worker-runtime.ts
    - apps/backend/src/infrastructure/worker/dictionary-worker-command.ts
    - apps/backend/src/modules/dictionaries/application/dictionary-generation-service.ts
    - apps/backend/src/modules/learning/application/sentence-worker-service.ts
    - docs/adr/0012-dictionary-worker-and-document-ingestion.md
    - docs/adr/0022-ai-credit-ledger-and-generation-settlement.md
    - docs/adr/0026-shared-text-ai-selection-and-user-preferences.md
    - docs/adr/0027-typed-sentence-work-and-shared-ai-accounting.md
    - docs/adr/0036-task-specific-text-translation-capacity.md
    - docs/adr/0037-independent-knowledge-and-agent-proposals.md
    - docs/adr/0038-preproduction-text-model-retirement.md
    - apps/backend/src/infrastructure/worker/dictionary-worker-environment.ts
    - docs/adr/0040-preproduction-owner-scoped-audio-retirement.md
    - docs/adr/0045-action-accounting-and-provider-expenses.md
    - apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant.ts
    - apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting.ts
    - apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-operator-budget-participant.ts
    - apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-capability-policy-participant.ts
    - apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant.ts
    - apps/backend/src/infrastructure/text-ai/text-ai-capacity.ts
    - apps/backend/src/modules/conversations/infrastructure/conversation-accounting.ts
    - apps/backend/src/modules/conversations/infrastructure/conversation-action-accounting.ts
    - apps/backend/src/modules/learner-portraits/infrastructure/interview-accounting.ts
    - apps/backend/src/modules/ai-credits/infrastructure/accounting-report-worker.ts
    - apps/backend/src/modules/dictionaries/infrastructure/dictionary-composition.ts
    - apps/backend/src/modules/ai-credits/infrastructure/action-allowance-consent.ts
    - apps/backend/src/modules/text-ai/infrastructure/persistence/drizzle/action-budget-default.ts
    - apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/worker-financial-authority.sql
    - apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-provider-expense-guards.sql
    - apps/backend/src/modules/learning/infrastructure/persistence/drizzle/drizzle-sentence-preparation-store.ts
    - apps/backend/src/modules/knowledge/application/transcription-job-service.ts
    - apps/backend/src/modules/knowledge/application/private-translation-service.ts
    - apps/backend/src/modules/knowledge/infrastructure/transcription-worker-readiness.ts
    - docs/adr/0050-interactive-workbook-content-and-learning-boundaries.md
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/conversation-admission-snapshot.ts
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/conversation-dictionary-material.ts
    - apps/backend/src/modules/texts/infrastructure/persistence/drizzle/texts-job-lifecycle.ts
    - apps/backend/src/modules/texts/infrastructure/persistence/drizzle/texts-job-transaction.ts
    - apps/backend/src/modules/knowledge/infrastructure/persistence/drizzle/transcription-context.ts
    - docs/adr/0049-native-provider-pricing-and-accounting.md
    - docs/adr/0051-duration-based-transcription-accounting.md
    - docs/adr/0058-named-activity-content-and-source-provenance.md
    - packages/contracts/src/workbook-learning.ts
    - apps/backend/src/modules/knowledge/infrastructure/ai/exercise-evaluation-provider.ts
    - apps/backend/src/modules/knowledge/infrastructure/persistence/drizzle/exercise-evaluation-source.ts
    - apps/backend/src/modules/knowledge/infrastructure/persistence/drizzle/exercise-evaluation-source.sql
    - docs/adr/0060-composable-generation-runs.md
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/generation-run-worker.ts
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/generation-run-completion.ts
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/generation-run-admission.ts
    - apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/staged-action-accounting.sql
    - docs/adr/0061-bounded-automatic-lesson-continuation.md
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/generation-run-authorization.ts
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/generation-run-automation.ts
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/generation-run-stop.ts
    - apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/conversation-worker-claim.ts
    - apps/backend/drizzle/0178_automatic_lesson_ready_index.sql
    - apps/backend/src/modules/conversations/infrastructure/conversation-worker-composition.ts
    - apps/backend/src/modules/conversations/infrastructure/ai/learning-content-authoring.ts
source_fingerprint: sha256:3e6ca61260f287e11f6594793f43139fe4500cd7c602e5ec1a3e5ceb8c4c230a
reviewed: 2026-11-19
---

# AI job lifecycle and accounting

Atomic bounded action admission separates learner charges, provider expenses and operator limits.

```mermaid
flowchart TB
    Client["Learner command + operation key"] --> Auth["Authenticate, validate source access
and Redis burst limit"]
    Auth --> Replay{"Same-key replay?"}
    Replay -->|Identical| Existing["Return durable action; no new hold or dispatch"]
    Replay -->|Conflict| Reject["Reject admission"]
    Replay -->|New| Pin["Transaction pins model, customer tariff,
capability policy and reviewed provider USD rate"]
    Pin --> Gates["Compact wallet and capacity projections
profile credit ceiling + operator USD limits"]
    Gates -->|Cannot fund input and any output| Reject
    Gates -->|Affordable reduced paid output| Quote["Expiring allowance quote; no hold
learner confirms Send or tops up"] --> Gates
    Gates -->|Admitted| Hold["Atomic bounded credit hold when customer funded
operator action + account/day + global/day allowance"]
    Hold --> Queue[("PostgreSQL typed jobs and accounting action")]
    Queue --> Worker["Existing bounded worker slot
claim supported job with lease and write fence"]
    Worker --> Attempt["Authorize call before dispatch
10,000 total action output tokens; bounded retries"]
    Attempt --> Checked["Checked SQL authorization
live typed lease + pinned execution + current limits"]
    Checked --> Provider["Trusted task-specific adapter
no blind retry of ambiguous upstream work"]
    Provider --> Usage["Settle authoritative attempt observations
derive immutable provider expense from pinned provenance"]
    Usage --> Valid{"Usable validated outcome?"}
    Valid -->|Success| Publish["Persist domain result / permitted publication
structured-call receipt acceptance and private checkpoint
share the current lease/revision transaction"]
    Valid -->|Technical or invalid result| Failure["Failed: release customer hold
Languon retains provider expense"]
    Stop["Explicit Stop"] --> Partial["Stopped: charge eligible partial usage"]
    Publish --> Settle["Sum eligible customer usage; round to 0.001 credit
cumulatively across customer-funded run stages
release unused hold"]
    Partial --> Settle
    Failure --> Poll
    Settle --> Poll["Durable outcome + billing state
reconnect replays without another generation or charge"]
    Poll -->|"Successful lesson stage with new checkpoints"| Auto["Server-owned next stage
settled liability + remaining original customer/provider ceilings
same fingerprint; at most 8 stages / 15 minutes"] --> Auth
    Auto -->|"Authority exhausted, changed, expired or stopped"| Paused["Paused; explicit Retry / Resume
fresh bounded quote/admission"] --> Auth
    Hold -.-> Free["Free interviews: no customer hold
30 admissions/account/UTC day; one active
operator limits still apply"]
    Usage -.-> Report["Background reports: provider USD expenses,
purchase revenue, grants and unknown costs separately"]
    Queue -.-> SourceFence["Knowledge source adapters: live saved-source/share/fence checks"]
    SourceFence --> Worker
```

Typed feature modules retain source authorization, job ownership and result publication.
The queue is PostgreSQL; Redis handles admission burst controls, not financial authority.
Accounting joins the same transaction rather than calling another service. The existing
root worker rotates dictionary/shared speech, conversation, sentence, texts and selection
work within bounded slots. No Kafka, billing microservice or AI gateway is implemented.

New selected text work pins immutable customer tariffs independently from provider USD
rates and capability funding policies. Credit amounts use integer milli-credits internally.
Interview operator funding and unlimited accounts create no customer hold but cannot
bypass reviewed prices, execution limits or shared operator dollar budgets. Admission
reads compact wallet/grant and capacity projections rather than rebuilding ledger history.
The application action default is copied atomically on first admission or profile read,
without overwriting a learner-selected budget. A reduced paid-action allowance needs
confirmation; concurrent balance changes require review
again rather than silently shrinking a previously confirmed output allowance.

Restricted workers dispatch and settle through checked SQL entry points, rather than
choosing arbitrary financial mutations. Dispatch requires the current typed job lease
or worker fence; provider expense identity/rates derive from pinned execution and
terminal observations. Report invalidation is internal to those checked operations.

Every attempt consumes operational allowance; failed attempts do not increase customer
charges. Unknown expense remains unknown. Supporting conversation memory calls are
operator-funded. Successful results remain chargeable; explicit Stop charges eligible
partial usage. Technical failures release the learner hold even if partial text remains.
[Speech](speech-and-pricing.md) has its own indivisible generation and billing deadline.
[Conversations](conversations-and-knowledge.md) persist batched output independently of
browser subscriptions. Sentence preparation uses one explicit parent authorization:
children share its hold, pins, 10,000 output tokens and five-call allowance rather than
receiving fresh budgets automatically. Exhaustion requires explicit Continue with new
authorization. Reporting and bounded cleanup run in background connections.

Knowledge transcription is a native-duration action, not a token action. Its
admission pins source bytes/duration, customer tariff, native provider pricing and
code-owned processing approval; dispatch additionally requires a live worker
observation and fenced lease. Receipt-bound terminal settlement records provider
duration when supplied, otherwise unknown expense, and never lets cancelled output
publish. Private Knowledge translations reuse the Texts action/job authority with
actor-owned overlays; note sentence generation/checking reuses the Learning engine.
Both source adapters recheck live saved-source/share authority and delete or fence
their private work on source removal. These are present implementation paths, while
external-provider activation remains separately gated.

Disabling dictionary credit enforcement now disables new generation admission; it is
not an unaccounted execution route. Read, Accept, cancellation and worker drain remain
available. Deterministic fixtures also use accounted admission. Retained historical
null-snapshot handling is not a current public admission path. Retired model snapshots
fail closed rather than being rewritten. Earlier ADR failure-charge rules are superseded by ADR-0045 for
new action accounting; the fresh-development-ledger cutover does not reinterpret old
whole-credit rows in place. These relationships are source evidence, not a measured
performance or production activation claim.

## Named exercise checks within existing execution

Ordinary prepared checking makes no provider call; unknown hybrid/rubric responses
remain unchecked. Explicit Check with AI uses the existing source-bound Texts job
lane and actor-private attempt, with current source/share/revision/epoch and settled
worker publication fences. A successful job may produce a partially-correct or
unable-to-assess learning result; neither counts as correct progress. The shared
catalog and host-grounded authoring path add no provider or independent allowance.
Conversation planning/authoring are recorded under the existing answer accounting
category. See the [named-exercise view](named-exercises.md).

## Composable generation stages

Generation runs reuse conversation actions and worker leases. Each successful
stage must checkpoint validated progress; its artifacts may be inspected through
an owner-only read projection but are not partial published proposals. Exact structured-call acceptance commits with the checkpoint
or authorized proposal/state publication under the same lease fence. A wholly or
partly invalid structured call is ineligible in full, while its provider expense
remains recorded. Final aggregate validation and successful turn completion expose
one complete mixed content proposal.

Accounting owns a locked settlement series per run. Customer-funded successful
stages and chargeable Stop contribute exact usage at their own pinned tariffs;
cumulative rounding avoids charging each stage's fraction independently. Free or
operator-funded work and technical failures do not enter that customer accumulator.
Technical failure releases the current hold, without undoing earlier charges.
Validated artifacts from failed actions may be reused without retrospective billing;
new calls reading them incur ordinary input usage. Revision-planning replies retain
normal chat pricing; applying a reviewed revision is free and dispatches nothing.
See [ADR-0060](../adr/0060-composable-generation-runs.md).

Under [ADR-0061](../adr/0061-bounded-automatic-lesson-continuation.md), successful
settled stages may chain automatically through the existing worker claim path.
The original configured credit ceiling and reviewed configured provider-cost
ceiling bound the entire authorization. Provider authority is captured before the
narrower predicted stage envelope; it is not reset or multiplied at each action.
At most eight stages run before the earlier of the root action deadline or
15 minutes after authority creation. Automatic
admission checks the pinned funding/route/tariff/provider-price fingerprint and
clamps each new stage to remaining cumulative ceilings. Pending or unknown
liabilities cannot fund another stage; wallet balance alone cannot extend authority.
Terminal failures, Stop, source/plan/access/configuration changes and expiry halt the chain.
Explicit Retry/Resume creates fresh bounded authority. Per-stage call/output and
deadline limits, invalid-call ineligibility, cumulative rounding and Stop charges
are unchanged. Read-only prepared preview neither dispatches nor settles work. Compact
output-limit repair stays inside the same action allowance and validation-receipt
rules; unknown diagnostic categories do not create a new retry or charging path.
The production provider boundary preserves routing classification before mapping
transport or rate limiting to safe conversation diagnostics. After a saved checkpoint or a settled exercise rejection, a stage may yield
under its original authorization. The next worker claims the remaining exercise
strategy using the persisted attempt history. Rejected calls consume the provider
expense allowance.

Admission projects the next unsaved unit and its dependencies. The model gate
exposes remaining stage time. The worker can yield after saving the initial plan
or a validated checkpoint before the next unit starts. Provider fallback uses
the same deadline and cannot replay a run after a durable callback begins.
Pre-dispatch contention persists a bounded retry schedule under existing
authority. Unknown provider outcomes stop automatic advancement.

The model gate records the normalized terminal reason against each settled
structured call. A measured invalid exercise can receive a targeted repair and a distinct final fallback.
A filtered response stops before repair. A missing settlement cannot authorize
a paid retry. Failure summaries retain allowlisted phases and finish reasons.

Conversation admission evaluates the bounded stage demand before issuing or
confirming a quote. Immediately before dispatch, the worker checks the affordable
call reservation against active and settled usage under the shared capacity lock.
Concurrent workers cannot both consume the last available allowance. Provider
capacity, operator funding and busy submission slots have separate outcomes.

## Sources

- [Structured-call receipt and settlement-series authority](../../apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/staged-action-accounting.sql).
- [Atomic run completion](../../apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/generation-run-completion.ts).

- [apps/backend/src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-admission-participant.ts](../../apps/backend/src/modules/text-ai/infrastructure/persistence/drizzle/text-ai-admission-participant.ts)
- [apps/backend/src/modules/text-ai/application/text-ai-provider-catalog.ts](../../apps/backend/src/modules/text-ai/application/text-ai-provider-catalog.ts)
- [apps/backend/src/modules/ai-credits/application/ai-credit-participant.ts](../../apps/backend/src/modules/ai-credits/application/ai-credit-participant.ts)
- [apps/backend/src/infrastructure/worker/dictionary-worker-runtime.ts](../../apps/backend/src/infrastructure/worker/dictionary-worker-runtime.ts)
- [apps/backend/src/infrastructure/worker/dictionary-worker-command.ts](../../apps/backend/src/infrastructure/worker/dictionary-worker-command.ts)
- [apps/backend/src/modules/dictionaries/application/dictionary-generation-service.ts](../../apps/backend/src/modules/dictionaries/application/dictionary-generation-service.ts)
- [apps/backend/src/modules/learning/application/sentence-worker-service.ts](../../apps/backend/src/modules/learning/application/sentence-worker-service.ts)
- [docs/adr/0012-dictionary-worker-and-document-ingestion.md](../../docs/adr/0012-dictionary-worker-and-document-ingestion.md)
- [docs/adr/0022-ai-credit-ledger-and-generation-settlement.md](../../docs/adr/0022-ai-credit-ledger-and-generation-settlement.md)
- [docs/adr/0026-shared-text-ai-selection-and-user-preferences.md](../../docs/adr/0026-shared-text-ai-selection-and-user-preferences.md)
- [docs/adr/0027-typed-sentence-work-and-shared-ai-accounting.md](../../docs/adr/0027-typed-sentence-work-and-shared-ai-accounting.md)
- [docs/adr/0036-task-specific-text-translation-capacity.md](../../docs/adr/0036-task-specific-text-translation-capacity.md)
- [docs/adr/0037-independent-knowledge-and-agent-proposals.md](../../docs/adr/0037-independent-knowledge-and-agent-proposals.md)
- [docs/adr/0038-preproduction-text-model-retirement.md](../../docs/adr/0038-preproduction-text-model-retirement.md)
- [apps/backend/src/infrastructure/worker/dictionary-worker-environment.ts](../../apps/backend/src/infrastructure/worker/dictionary-worker-environment.ts)
- [docs/adr/0040-preproduction-owner-scoped-audio-retirement.md](../../docs/adr/0040-preproduction-owner-scoped-audio-retirement.md)

- [docs/adr/0045-action-accounting-and-provider-expenses.md](../adr/0045-action-accounting-and-provider-expenses.md)

- [apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant.ts](../../apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant.ts)

- [apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting.ts](../../apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting.ts)

- [apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-operator-budget-participant.ts](../../apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-operator-budget-participant.ts)

- [apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-capability-policy-participant.ts](../../apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-capability-policy-participant.ts)

- [apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant.ts](../../apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-ai-credit-participant.ts)

- [apps/backend/src/infrastructure/text-ai/text-ai-capacity.ts](../../apps/backend/src/infrastructure/text-ai/text-ai-capacity.ts)

- [apps/backend/src/modules/conversations/infrastructure/conversation-accounting.ts](../../apps/backend/src/modules/conversations/infrastructure/conversation-accounting.ts)

- [apps/backend/src/modules/conversations/infrastructure/conversation-action-accounting.ts](../../apps/backend/src/modules/conversations/infrastructure/conversation-action-accounting.ts)

- [apps/backend/src/modules/learner-portraits/infrastructure/interview-accounting.ts](../../apps/backend/src/modules/learner-portraits/infrastructure/interview-accounting.ts)

- [apps/backend/src/modules/ai-credits/infrastructure/accounting-report-worker.ts](../../apps/backend/src/modules/ai-credits/infrastructure/accounting-report-worker.ts)

- [apps/backend/src/modules/dictionaries/infrastructure/dictionary-composition.ts](../../apps/backend/src/modules/dictionaries/infrastructure/dictionary-composition.ts)

- [apps/backend/src/modules/ai-credits/infrastructure/action-allowance-consent.ts](../../apps/backend/src/modules/ai-credits/infrastructure/action-allowance-consent.ts)

- [apps/backend/src/modules/text-ai/infrastructure/persistence/drizzle/action-budget-default.ts](../../apps/backend/src/modules/text-ai/infrastructure/persistence/drizzle/action-budget-default.ts)

- [apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/worker-financial-authority.sql](../../apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/worker-financial-authority.sql)

- [apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-provider-expense-guards.sql](../../apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/accounting-provider-expense-guards.sql)

- [apps/backend/src/modules/learning/infrastructure/persistence/drizzle/drizzle-sentence-preparation-store.ts](../../apps/backend/src/modules/learning/infrastructure/persistence/drizzle/drizzle-sentence-preparation-store.ts)
- [apps/backend/src/modules/knowledge/application/transcription-job-service.ts](../../apps/backend/src/modules/knowledge/application/transcription-job-service.ts)
- [apps/backend/src/modules/knowledge/application/private-translation-service.ts](../../apps/backend/src/modules/knowledge/application/private-translation-service.ts)
- [apps/backend/src/modules/knowledge/infrastructure/transcription-worker-readiness.ts](../../apps/backend/src/modules/knowledge/infrastructure/transcription-worker-readiness.ts)
- [docs/adr/0050-interactive-workbook-content-and-learning-boundaries.md](../adr/0050-interactive-workbook-content-and-learning-boundaries.md)
- [apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/conversation-admission-snapshot.ts](../../apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/conversation-admission-snapshot.ts)
- [apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/conversation-dictionary-material.ts](../../apps/backend/src/modules/conversations/infrastructure/persistence/drizzle/conversation-dictionary-material.ts)
- [apps/backend/src/modules/texts/infrastructure/persistence/drizzle/texts-job-lifecycle.ts](../../apps/backend/src/modules/texts/infrastructure/persistence/drizzle/texts-job-lifecycle.ts)
- [apps/backend/src/modules/texts/infrastructure/persistence/drizzle/texts-job-transaction.ts](../../apps/backend/src/modules/texts/infrastructure/persistence/drizzle/texts-job-transaction.ts)
- [apps/backend/src/modules/knowledge/infrastructure/persistence/drizzle/transcription-context.ts](../../apps/backend/src/modules/knowledge/infrastructure/persistence/drizzle/transcription-context.ts)
- [docs/adr/0049-native-provider-pricing-and-accounting.md](../../docs/adr/0049-native-provider-pricing-and-accounting.md)
- [docs/adr/0051-duration-based-transcription-accounting.md](../../docs/adr/0051-duration-based-transcription-accounting.md)
- [generation-admission-input.ts](../../apps/backend/src/modules/conversations/infrastructure/ai/generation-admission-input.ts).
- [generation-admission-outcome.ts](../../apps/backend/src/modules/conversations/application/generation-admission-outcome.ts).
