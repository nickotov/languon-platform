# User AI model preferences backend

Status: Complete
Owner: Root implementation agent
Created: 2026-10-04

## Problem and authorized outcome

BL-004 sentence practice needs learner-owned model selection, but existing text
routing is dictionary-owned and uses one platform default. On 2026-10-04 the user
requested implementation of the agreed [backend-first plan](../../../docs/sentence-practice-implementation-plan.md).
This feature owns the BL-005 backend prerequisite. Its profile UI and design brief
are deferred until both planned backends are verified.

## Acceptance criteria

- AC-1 — Authenticated users read Auto by default and persist Auto/curated explicit
  preference with optimistic concurrency; inactive users and foreign identity
  writes are rejected.
- AC-2 — Return sanitized model labels, enabled choices, capability, availability
  and relative current credit rates without credentials, endpoints or internals;
  preserve unavailable stored choices rather than silently rewriting them.
- AC-3 — Every existing dictionary text admission resolves the learner preference
  and pins immutable execution/budget/pricing. Changes affect only new jobs;
  same-key replay and provider retry preserve admitted configuration.
- AC-4 — Auto uses the configured default; unavailable/disabled/incompatible
  selections fail without fallback or new billing/allowance policy.
- AC-5 — Establish shared text-AI ports/infrastructure suitable for later learning
  capabilities, preserving DDD, current admin authorization/auditing, historical
  execution and mixed-worker compatibility.
- AC-6 — Verify contracts, HTTP, disposable persistence/migrations, selection races,
  current dictionary/provider/credit regressions and user-flow traceability;
  complete independent correctness/test and security review.

## Scope and constraints

Backend/contracts/migrations, existing dictionary routing and related docs only.
No frontend implementation, new provider, TTS/OCR settings, paid calls, grants,
production activation or speculative grammar capabilities. Do not generate design
prompts until the sentence backend is also ready. Existing prices and enforcement
flags remain unchanged. Preserve prior planning documents and unrelated user work.

## User-flow documentation

Create docs/user-flows/user-ai-model-preferences-backend.md for authenticated API
read/update and deterministic routed dictionary execution. Related guides:
ai-provider-management, ai-credit-wallet, dictionary-platform,
magic-profile-page, profile-account-controls. Existing profile UI journeys remain
unchanged; backend behavior has its own critical mapped test, not fabricated UI proof.

## Open decisions

None requiring product input. Local implementation choices follow the approved
plan and accepted ADRs. ADR-0021 ownership must be superseded narrowly before the
shared configuration seam is finalized.

## Completion

Backend scope complete after initial review remediation and scoped correctness/
security passes. All criteria and required relevant checks are verified in EVIDENCE.
Profile UI and the versioned Magic Patterns prompt remain deferred: the prompt is
created only after the sentence backend is also verified, then frontend delivery
waits for the returned design. BL-005 remains in progress for that remaining scope.
