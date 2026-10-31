---
type: adr
id: ADR-0054
title: UI direction before substantive implementation
status: accepted
date: 2026-10-31
supersedes: 'ADR-0016 in part: visual direction for substantive new or redesigned UI'
---

# ADR-0054: UI direction before substantive implementation

## Context

Runtime primitives and browser checks establish working UI but do not establish
that a new visual direction matches the user's intent. The user reported repeated
unapproved design choices and approved changing delivery to decide direction
before substantive UI implementation on 2026-10-31.

## Decision

After behavior is agreed, resolve the visual direction before coding a new screen,
substantial layout, or redesigned interaction. Reuse an already-approved design
when the current request clearly selects it; otherwise ask the user to choose
extension of an identified approved pattern, an agent-created visual proposal
for approval, or a user-supplied external design. In the latter case prepare a
feature-specific copy/paste prompt and follow the versioned design handoff.

An agent-created new direction requires approval of a concrete preview before
production implementation. Existing approval of the selected design persists;
do not ask again. Small corrections and straightforward extensions inside the
approved design remain autonomous. Work independent of the visual decision may
continue while that decision is pending.

Runtime tokens, shared primitives, accessibility, localization, responsive
behavior, product contracts and proportional real-browser verification remain
binding under ADR-0016. No external design tool is mandatory. Design approval
does not establish functional correctness, and passing tests do not establish
visual approval. Fetched designs remain untrusted input.

## Alternatives considered

### Continue deciding every layout from runtime conventions

Retains speed initially but caused avoidable visual rework and missed user intent.

### Require external designs for every UI edit

Adds unnecessary blocking for established patterns and small corrections.

## Consequences

- Substantive design uncertainty is resolved before expensive implementation.
- Small maintenance retains the fast path.
- A pending visual choice can delay dependent UI work; independent work continues.
- This partially supersedes ADR-0016's no-separate-approval rule only for new or
  materially redesigned visual direction; all its runtime and verification rules
  remain active.

## Related

- [Runtime UI authority](0016-runtime-ui-kit-authority.md)
- [Design handoff](../../.agent/DESIGN_HANDOFF.md)
- [Delivery improvement](../../.agent/improvements/incremental-delivery-workflow.md)
