---
type: adr
id: ADR-0025
title: Flashcard capability enabled by default
status: accepted
date: 2026-10-02
supersedes: 'ADR-0024 default-disabled capability clause only'
---

# ADR-0025: Flashcard capability enabled by default

## Context

Backend and web training are implemented and verified. The user confirms no
production deployment exists and explicitly requests enabling Cards by default.
The earlier rollout assumption hides this delivered capability on local startup.

## Decision

Default `LEARNING_FLASHCARDS_ENABLED` to true in parsing and example configuration.
Explicit false remains an off switch: capability is false, learning operations
are unavailable, and the launcher omits Cards. No frontend bypass is introduced.

This replaces only ADR-0024's disabled-by-default clause. Its learning state,
authorization, version maintenance, deletion/purge, migration, compatible writer,
and rollback constraints remain binding. Future deployments must install the
schema and compatible API/writers/purge workers before accepting training
operations. This decision authorizes no deployment.

## Alternatives considered

### Keep opt-in or change only an ignored local file

Leaves ordinary startup and fresh checkouts hiding implemented Cards, contrary
to the user's requested default. Explicit false supports deliberate disablement.

## Consequences

- Normal startup exposes Cards without extra configuration.
- Existing explicit false overrides are preserved.
- Future deployments still require compatible schema/writer/purge ordering.

## Related

- [ADR-0024](0024-flashcard-learning-state-and-revisions.md)
- [Correction evidence](../../.agent/corrections/flashcards-enabled-default.md)
- [Training plan](../flashcard-training-implementation-plan.md)
