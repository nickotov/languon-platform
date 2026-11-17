# Composable resumable lesson generation

Status: Complete
Created: 2026-11-16

## Authority

User approved the decision-complete plan and explicitly requested implementation. This document overrides earlier exploratory subagent suggestions. In particular: Stop KEEPS existing eligible-partial-usage charging; plans ARE revisionable with reuse; canonical proposals evolve rather than adding a parallel family. No paid model calls or user data deletion authorized by this feature.

## Acceptance criteria

- AC-1: Reusable validated-plan entry point needs no transcript. Plans have <=8 stable logical tasks (prose, vocabulary, grammar, bilingual text, exercises), typed authorized sources/dependencies, separate output order, <=25 custom blocks. Reject cycles/missing/incompatible dependencies. Source/requirements are explicit.
- AC-2: Clarification retains confirmed fields and stable task identity; content language does not silently change chat language. Up-to counts become exact counts within bounds. Clear requests auto-start. Planning/clarification replies retain ordinary chat pricing.
- AC-3: One canonical persisted content proposal contains ordered safe prose/custom-block fragment. Migrate existing blocks without losing IDs/receipts. Mixed insertion only; preserve narrowly scoped single-block replacement/copy/revision and prose-only onDraft authority. Preserve note title. Entire serialized proposal including frozen dependencies <=100000 characters, existing full document limits apply.
- AC-4: Generated prose has truthful immutable artifact provenance; exact source projections feed dependent tasks. Published/copied frozen evidence never grants private artifact read authority.
- AC-5: Durable runs/revisions/artifacts use existing turns/workers/leases. One active action/run and conversation restrictions. Sequential dependency scheduling, conservative homogeneous batching, exact task result validation/checkpoints. <=5 calls and10000 output tokens/action, existing deadlines, at most one safe automatic recovery dispatch. Never retry ambiguous transport or salvage truncated JSON. Typed safe failure reasons; terminal truncation flag accurate after recovery.
- AC-6: Explicit Continue uses idempotency, expected revision, fresh quote/admission; no dispatch on reconnect or Apply revision. Successful content stage makes validated progress; allowance pause is action succeeded/run paused. Final aggregate validation/proposal/run completion fenced transactionally; only final successful turn exposes complete proposal. Failed-turn artifacts reusable only if validated/checkpointed, never rebilled.
- AC-7: Successful stages charge eligible validated calls; technical failure releases current hold; earlier charges remain. STOP KEEPS EXISTING ELIGIBLE PARTIAL USAGE CHARGING. Invalid or partially invalid structured calls ineligible in full; retain provider expense. Accounting-owned cumulative exact rounding across customer-funded stages and chargeable Stop, excluding free/operator amounts. No quote changes silently accepted.
- AC-8: User may revise paused unfinished runs. Review kept/changed/added/removed tasks; Apply plan advances revision atomically but stays paused. Reuse matching requirement/source/dependency/validation fingerprints; invalidate changed descendants, retain content on order-only changes. Active work requires explicit Stop first. Completed proposals immutable/new request for changes.
- AC-9: Source changes offer keep snapshot vs refresh revision; current access checked either way. Disconnect does not cancel. Discard/deletion/revocation fence late writes, settle liabilities and clean private content, preserve accounting evidence without source text.
- AC-10: Approved existing UI patterns: one compact run card, progress, collapsed plan/billing, quoted Continue, Stop, revision review, source-change choices, one complete mixed preview/Insert/Save. No partial insert, hidden internal tokens/DAG, modal autofocus on completion, or new title operation. Desktop/mobile light/dark EN/RU verified with stories and rendered critique.
- AC-11: Incident FR/RU reading+3 reading exercises+COD/COI/passive grammar+4 grammar exercises and French-only prose mixed lesson proven through production worker/SDK fake HTTP, disposable DB, browser. Independently reviewed including security and specialist tester. Current guides/ADRs/diagrams/mappings, scoped checks and clean local integration.

## Scope and invariants

User selected durable recovery, per-completed-stage charges, explicit Continue, current Stop policy, immediate clear-request start, revise-and-reuse, source keep/refresh choice, existing chat billing for planning. No provider change, increased per-action allowance, workflow framework, automatic web retrieval or paid smoke. Existing historical failures do not become resumable runs. Ordinary prose UI remains narrow. No claimed server-insertion Undo feature; preserve existing local prose undo.

## User-flow and design sources

Update knowledge-workspace, interactive-workbooks and contextual-language-assistant-and-knowledge guides. Extend existing proposal card/dialog/sheet, safe KnowledgeDocumentView, action confirmation and composer styles. Run UI states: running/stopping/paused (budget,failure,stopped,source change)/reconnecting/completed/inserted. Revision review Apply plan/Keep current plan, then separate quoted Continue.
