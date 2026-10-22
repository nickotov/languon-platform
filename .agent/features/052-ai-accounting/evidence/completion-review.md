# Independent completion review — initial

## Review boundary and method

- **Mode:** initial completion review.
- **Reviewed boundary:** the complete Feature 052 change from base `main` commit `d441863` through the tracked and untracked files frozen in `evidence/review-manifest.json` (364 files; manifest SHA-256 `d5074324d542e88e57b0386689be37910bc9b6ffe4c407cb717126d32332968d`). Mutable evidence files were read at their latest state.
- **Sources of truth:** `FEATURE.md`, `EXEC_PLAN.md`, `EVIDENCE.md`, `REVIEW.md`, `evidence/author-preflight.md`, approved `docs/ai-credit-accounting-design.md`, accepted ADR-0045, applicable `AGENTS.md` files, implementation, contracts, tests, and recorded verification artifacts.
- **Execution:** source and evidence review only. I did not run tests, builds, databases, browsers, or load fixtures. I assessed existing evidence rather than treating author summaries as proof.
- **Boundary note:** the capacity/conversation performance sources and the performance fixture changed after the frozen manifest and the accepted failed run. Those changes are remediation candidates outside this initial boundary and require a remediation review plus a new source-stable run; they do not invalidate the initial finding below.

## Findings

### ACC-COMP-001 — High — admission architecture fails the approved latency and availability target

**Location:** `apps/backend/src/infrastructure/text-ai/text-ai-capacity.ts:8,29-38`; `apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-operator-budget-participant.ts:47-58`; `.agent/features/052-ai-accounting/evidence/accounting-load-final-9-running.json`.

The frozen implementation acquires a single transaction-scoped advisory lock for text-AI capacity and a second global operator-budget lock. Both remain held while the admission transaction performs capacity, wallet, policy, action, attempt, and job work. Unrelated accounts therefore serialize on global locks instead of admitting concurrently.

The approved source-stable final fixture (`fc246920-9c3e-4d55-b96e-ee8909c8e055`) demonstrates the defect: with 100 streams, nine running streams, 10 admissions/second, and one million historical ledger rows, loaded admission p95 was **1056.446 ms** against the required **<=100 ms**. Its small-history baseline p95 was **3828.373 ms**, with only 99/100 successful admissions and one `capacity_unavailable` response. Lock diagnostics identify the frozen global capacity lock (signed PostgreSQL advisory-lock representation of `4312189072`) and the global operator lock.

**Impact:** AC5/AC9 are not met. A concurrent workload can turn unrelated learner admissions into a long lock queue and produce availability failures even before provider execution starts.

**Suggested fix:** replace full-transaction global admission fences with atomic counters or narrowly scoped row/partition locks and short critical sections. Preserve global and per-owner cost/token caps without holding one global lock through all admission queries and inserts. Apply the same rule to the operator daily budget reservation.

**Needed proof:** rerun the exact approved Hono/Redis/SSE fixture against the remediated source hashes with 100 streams, 10 admissions/second, and one million ledger rows. Require all admissions to succeed, p95 <=100 ms, bounded lock waits, source stability during the run, and query plans proving that admission does not scan historical ledgers.

### ACC-COMP-002 — High — paid legacy actions and paid interviews silently reduce output without the required learner quote

**Location:** `apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting.ts:118-190,199-246`; `apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/drizzle-action-accounting-participant.ts:107-121,230-282`; `apps/backend/src/modules/learner-portraits/infrastructure/interview-accounting.ts:136-169,251-307`.

Legacy text actions reserve the lesser of the configured action budget and current balance, then `admitAttempt` calculates and returns whatever output limit that smaller hold can fund. The provider is dispatched with that reduced limit. Paid interviews follow the same reserve-and-clamp path after a generic billing notice. Neither flow returns a budget quote or waits for explicit confirmation of a reduced allowance. The contextual conversation path has a quote/confirmation state, which shows that the required behavior is not shared by the other paid action families.

**Failing scenario:** a learner's maximum or concurrently reduced balance funds the input plus only about 20 output tokens. A dictionary, sentence, text-processing, or future paid interview request proceeds with the small output cap. The learner never sees “Your available credits limit this response to approximately 20 output tokens” and cannot choose Send or Top up. A concurrent debit can similarly reduce the allowance after the learner initiated the request.

**Impact:** AC2 and the approved consent flow are violated. The system can charge for an output materially smaller than the learner authorized and cannot prove consent to the final allowance.

**Suggested fix:** introduce one shared customer-funded admission quote contract for conversation, all legacy text action families, and paid interviews. If the full configured allowance cannot be held, persist the quoted allowance, return it without dispatching, and require explicit confirmation. Revalidate balance atomically at confirmation; if it changed, return an updated quote rather than silently narrowing an already confirmed allowance. Keep the interview billing-policy notice separate from allowance consent.

**Needed proof:** API/transaction tests and browser evidence for a representative dictionary, sentence, text-processing, and paid-interview action covering insufficient balance, exact confirmation, Top up, and concurrent spending. Assert that no action/attempt/provider dispatch exists before confirmation and that the dispatched cap equals the confirmed cap.

### ACC-COMP-003 — High — the application default action budget is not copied on first generation admission

**Location:** `apps/backend/src/modules/text-ai/infrastructure/persistence/drizzle/drizzle-text-ai-preference-store.ts:36-78`; `apps/backend/src/modules/ai-credits/infrastructure/persistence/drizzle/legacy-action-accounting.ts:72-77`; `apps/backend/src/modules/learner-portraits/infrastructure/interview-accounting.ts:146-152`; the frozen conversation admission's direct preference-table read.

The preference store copies `defaultMaxCreditsPerAction` only when its settings `read()` path runs. Generation admission paths instead read `text_ai_preferences` directly and fall back to the current application setting without persisting it. A learner who never opens AI settings can therefore use one admin default for the first action and a different, later default for a subsequent action.

**Failing scenario:** a new learner sends a generation request while the application default is 5 credits. No learner preference row is created. An admin later changes the default to 20. The learner's next request is admitted with a 20-credit maximum even though no learner setting was copied or edited.

**Impact:** the approved “application default copied into learner AI settings” invariant is absent, and a later admin change can silently raise an individual's spending authorization. Pinning the value per action does not repair the missing persistent learner choice for subsequent actions.

**Suggested fix:** centralize a transactional `get-or-create learner action budget` operation and use it from settings reads and every admission path. On first use, copy the then-current application default exactly once under an owner/row lock. Later admin default changes must affect only learners who have not yet received a copied value; an explicit learner edit must win.

**Needed proof:** database/integration tests showing that a fresh learner's first admission creates the preference, an admin default change does not alter that learner's maximum, concurrent first admissions converge on one copied version, and an explicit learner update remains authoritative.

### ACC-COMP-004 — High — text generation and speech generation omit the required Redis burst admission guard

**Location:** `apps/backend/src/modules/texts/application/texts-job-service.ts:7-42`; `apps/backend/src/modules/texts/infrastructure/texts-ai-composition.ts:14-54`; `apps/backend/src/modules/speech/interface/http/speech.routes.ts:59-63,194-250`; `apps/backend/src/modules/speech/application/speech-service.ts:49-72`; `apps/backend/src/modules/speech/infrastructure/composition.ts`.

The text job service authenticates and immediately enters the enqueue/store path. Its dependency graph has no rate limiter. Speech `prepare` and `confirm` likewise authenticate and call the service without a rate-limit dependency or pre-admission consume step. PostgreSQL capacity and operator-cost limits occur later and do not replace the accepted Redis burst control that must run after authentication and before expensive database/model work.

**Impact:** AC8 and ADR-0045's abuse-control order are not met for existing text and speech generation entry points. One authenticated account can create avoidable authorization, database, queue, and admission load; a Redis outage cannot fail these paths closed before expensive work.

**Suggested fix:** inject the shared Redis-backed rate limiter into both compositions. Consume an authenticated, capability-specific limit before resolver/database/generation admission work, with explicit fail-closed behavior. Define idempotency handling so replaying an already accepted request does not create duplicate generation or charges while new abusive submissions remain limited.

**Needed proof:** HTTP/integration tests for text enqueue and speech prepare/confirm showing burst rejection before store/database/provider calls, Redis-outage failure before work, isolation between accounts/scopes, and safe idempotent replay. Add a bounded abuse/load result demonstrating that PostgreSQL admission is protected.

### ACC-COMP-005 — Medium — dictionary, sentence, and text job contracts cannot expose the approved learner billing outcome

**Location:** `packages/contracts/src/texts/index.ts:361-406`; `packages/contracts/src/learning/sentences.ts:332-384`; dictionary generation job schemas under `packages/contracts/src/dictionaries/generation.ts`; corresponding job stores and web job-result UI.

The accounting layer settles these actions, but their learner-facing job schemas expose only execution state, failure, result, and timestamps. They do not expose held credits, final charged credits, Free/No charge, measured-versus-estimated status, or an exact settled amount. Billing fields exist on newer contextual-assistant and speech contracts, so the omission is specific to these migrated action families rather than a global presentation decision.

**Failing scenario:** a sentence, dictionary, or text job completes and changes the wallet. The returned job cannot render `Completed · 2.145 credits`; a technical failure cannot render `Failed · No charge`; an operator-funded action cannot render `Completed · Free`. The learner must infer the charge from the balance delta and has no exact per-action audit detail.

**Impact:** AC6 and the approved learner transparency requirements are incomplete across the existing generation inventory. Backend settlement alone does not satisfy the required held/charged/result states.

**Suggested fix:** add a shared learner-safe billing projection to these job DTOs and persistence reads, then render it with execution status on their result surfaces. Keep provider USD cost and admin-only details out of learner contracts. Preserve exact decimal amounts in detail and the compact `<0.01 credits` display rule.

**Needed proof:** contract/store tests and browser evidence for representative dictionary, sentence, and text jobs in held/running, charged completed, technical failure/no charge, stopped/partial where supported, and operator-funded Free states. Verify exact detail values against the ledger and no USD disclosure.

### ACC-COMP-006 — High — one sentence-preparation command can create an unbounded sequence of independently funded learner actions

**Location:** `apps/backend/src/modules/learning/infrastructure/persistence/drizzle/drizzle-sentence-preparation-store.ts:250-398,758-840,859-875,1014-1050`; `apps/backend/src/modules/learning/infrastructure/persistence/drizzle/sentence-preparation-schema.ts:27-65,104-126`; `apps/backend/src/modules/learning/infrastructure/persistence/drizzle/drizzle-sentence-practice-store.ts:392-458,512-568,601-668`.

`Start preparation` creates a background preparation and partitions every eligible dictionary entry, but the parent record contains no pinned customer tariff, learner budget, total token allowance, hold, or accounting action. Each time the coordinator needs more generated content, it calls `admitGeneration` with a new random operation ID. That creates a new sentence job, calls `prepareLegacyAction`, and reserves a fresh independent action budget. After the child completes, the coordinator clears `activeJobId` and automatically repeats for the next uncovered entries. A single learner click can therefore authorize many child holds and charges, each with another default 10,000-output-token/action allowance, until the dictionary is covered or the wallet is exhausted.

**Failing scenario:** a learner with a large dictionary selects “prepare all” and clicks Start once. The coordinator can produce dozens or hundreds of child sentence-generation actions in the background. Every child is admitted against a fresh maximum, so aggregate spending can exceed the maximum the learner intended for the one preparation command by an arbitrary factor. The UI does not present or confirm a total preparation budget before this sequence begins.

**Impact:** AC2 and the approved bounded-total-budget rule are violated. This is an unintended repeat-spend path: the application converts one learner authorization into multiple independently chargeable actions without a parent cap. Pausing only after credits are exhausted does not bound the authorized cost.

**Suggested fix:** model preparation as one explicit parent learner action with a pinned tariff/policy and total credit, token, provider-cost, and retry allowance. Child generation jobs must consume stages/attempts from that parent authorization rather than calling `prepareLegacyAction` for a new budget. If full preparation legitimately exceeds the normal per-action default, quote the estimated scope and require an explicit larger preparation budget before dispatch. Resume may spend only the remaining approved parent budget; increasing it requires another explicit confirmation.

**Needed proof:** an integration test with multiple preparation batches proving that all child calls share one parent authorization, cumulative output/charge cannot exceed the confirmed total, retries consume the same execution allowance, stop/resume preserves the remainder, insufficient remaining budget pauses before creating another child, and idempotent ticks cannot duplicate a child or charge. Browser evidence must show the total maximum before Start and require confirmation for a larger budget.

## Verdict and verification gaps

The feature is **not ready for completion** in this initial boundary. Five high-severity correctness/acceptance findings and one medium-severity product-contract gap remain. The approved performance acceptance run failed materially. Backend build refresh, architecture-diagram browser evidence, a fresh-database cutover, and the final AC9 result were also pending at review time. Post-manifest performance edits must be reviewed as remediation and supported by a new source-stable final artifact before ACC-COMP-001 can be closed.
