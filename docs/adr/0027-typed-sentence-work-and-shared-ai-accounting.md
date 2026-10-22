---
type: adr
id: ADR-0027
title: Typed sentence work and shared AI accounting
status: accepted
date: 2026-10-04
superseded_in_part_by: 'ADR-0031 retained successful speech derivatives; ADR-0032 closed credit kind extended with speech; ADR-0045 action accounting, exact fractional units, provider expenses and capability funding policies'
supersedes: 'None; extends ADR-0022 and ADR-0026 to authorized learning work'
---

# ADR-0027: Typed sentence work and shared AI accounting

## Context

Authorized sentence practice adds generation and answer checking to dictionary AI
work. Both consume the same learner credits, provider budgets and bounded worker
slots. Sentence content, personally owned results, reference answers and live
shared-dictionary access have different retention and authorization rules from
editable dictionary proposals. A universal job registry would erase useful domain
boundaries; separate independent limits would multiply allowance.

## Decision

Learning owns typed generation/check jobs, exercises, attempts, manual reviews,
replay receipts and content-free exposure/coverage. Shared text-AI infrastructure
owns curated selection, trusted adapters and exact capability evidence. Credits
accept a closed job-kind set: dictionary generation, sentence generation and
sentence checking. Reservations retain existing job/attempt uniqueness and pin
pricing at admission. Identity guards reject collisions across active typed jobs,
retained reservations and numerical usage archives.

All text work uses one transaction-scoped capacity lock, combined queue/running
counts and combined current or archived provider usage. Root worker composition
executes dictionary and sentence services sequentially within the existing bounded
slots; it does not add a second allowance or worker pool. Observation namespaces
separate legacy selected execution, shared-capacity support and learning execution
with typed settlement. Immutable job guards require the corresponding transaction
capabilities. Older workers may drain old work but cannot claim learning work or
increase dictionary capacity during incompatible active/recent learning overlap.
The API admission flag defaults off; capable workers drain admitted work even when
new admission is disabled.

Exercise references are generated once and stored privately. Ordinary public
exercise/job projections omit them. Explicit live-authorized current-version reveal
is a free, replay-safe personal manual review: no model resolution, job, provider,
wallet reservation or AI grade. Manual review and successful AI check independently
complete personal Saved first, while their statistics and histories remain
separate. Reference assistance is captured at check admission without score penalty.

Source provenance covers every copied candidate, including unselected candidates.
Permanent erasure first quiesces unsettled jobs, then removes whole derived
content, attempts, reviews and copied job input. Content-free surviving-entry
coverage and settled numerical accounting remain independently valid. Account
purge follows established actor-accounting deletion policy, and removes the actor's
foreign personal work plus other learners' content derived from owned dictionaries.
Purge cancellation requests set flags without settling foreign credit resources
under owner locks; workers settle/drain before deletion. Restricted purge roles read
only lifecycle/numerical metadata, never reference answers or copied input.

This is a necessary extension of the accepted module, credit and worker boundaries
for the explicitly authorized feature. It introduces no provider, price, grant,
framework or deployment strategy change. Jev assessment remains future research.

## Alternatives considered

### Reuse dictionary proposal jobs and results

This couples learning state and private answers to dictionary authoring, weakens
live reader authorization and makes candidate erasure ambiguous.

### Universal task executor and job table

A generic prompt/tool endpoint expands the trust surface and loses typed validation
and domain retention. Shared infrastructure participants provide the needed reuse.

### Independent sentence capacity and credit pools

This multiplies allowance and permits combined running/provider limits to be
exceeded. Numerical unions and typed ledger dispatch preserve the existing policy.

### Grade a revealed reference by exact string equality

One valid reference does not enumerate all valid translations. Manual comparison
is deliberately ungraded; default AI checking evaluates meaning, grammar and
required dictionary vocabulary under server-enforced score caps.

## Consequences

### Positive

- Typed task ownership and private learning data remain explicit.
- Existing credits, provider limits and process concurrency apply to all text work.
- Free stored-reference review remains available when paid AI is unavailable.
- Deletion removes copied content while valid numerical accounting survives.

### Negative

- Combined-capacity SQL and closed-kind settlement need integration proofs.
- Capability namespaces and immutable snapshots require careful rolling compatibility.
- Candidate provenance intentionally erases more derived content than selected targets alone.

### Risks / limitations

- Schema expansion alone does not make workers capable; admission must fail closed.
- Production role grants must be applied after schema expansion and tested directly.
- Private primitives remain outside unrestricted Studio until a reviewed developer
  execution policy accounts for private context and credits.
- Backend readiness does not imply the deferred design/frontend is implemented.

## Related

- [ADR-0012](0012-dictionary-worker-and-document-ingestion.md)
- [ADR-0022](0022-ai-credit-ledger-and-generation-settlement.md)
- [ADR-0024](0024-flashcard-learning-state-and-revisions.md)
- [ADR-0026](0026-shared-text-ai-selection-and-user-preferences.md)
- [Architecture](../architecture.md)
- [Feature 036](../../.agent/features/036-sentence-practice-backend/FEATURE.md)
- [Implementation plan](../sentence-practice-implementation-plan.md)
