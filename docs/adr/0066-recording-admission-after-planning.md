---
type: adr
id: ADR-0066
title: Authorize requested recordings against the saved lesson plan
status: accepted
date: 2026-11-24
supersedes: None
---

# Authorize requested recordings against the saved lesson plan

## Context

The Knowledge composer admits a message before the planner can distinguish an explanation, reuse of an existing recording, and a request for new speech. A composer switch caused otherwise executable requests to stop after planning.

## Decision

Store the validated recording task and its source on the generation run. The actor-capable backend admits recording work within a bounded allowance after planning. A previously accepted applicable lesson quote can cover speech only within its remaining ceiling and lifetime. Conditional consent carries zero dispatchable speech budget until transferred to the eligible run. Return an actual expiring quote on the paused run when additional consent is necessary. Confirming uses the run revision, quote ID and request receipt. Stop, expiry, ownership and branch checks continue to apply.

Use the shared lesson card for amount, confirmation, progress and failure. Clients can reconnect to the run through existing snapshots and events. Worker and provider calls require the resulting scoped authority.

## Alternatives considered

A composer toggle requires users to predict which tools the planner will need. Inferring consent from a keyword would conflate a request to explain or reuse audio with a request to synthesize it. A browser-driven queue would stall unattended work when the tab closes.

## Consequences

A planning action can settle before speech starts. The API must maintain paused recording work and publish updates for connected clients. The original user message, selected source and completed artifacts stay available across this boundary. Audio synthesis, validation and partial settlement continue to follow [ADR-0065](./0065-generated-listening-sets.md).
