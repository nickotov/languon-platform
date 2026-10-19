---
type: adr
id: ADR-0041
title: 'Durable tutor streaming presentation'
status: accepted
date: 2026-10-19
supersedes: 'None'
---

# ADR-0041: Durable tutor streaming presentation

## Context

The tutor already uses Mastra in a durable worker and AI SDK UI in the browser
under ADR-0037. One-second SSE polling and whole-message UI replacement made
responses appear in bursts. Empty assistant placeholders hid activity before the
first text. The user explicitly authorized streaming integration and Streamdown.

## Decision

Preserve the canonical admission, persisted events, replay cursor, authorization,
credit settlement and explicit Stop semantics of ADR-0037. Incremental AI SDK UI
message/text/tool lifecycle parts are projections of validated public durable
events. Whole-history reconciliation remains for snapshots/corrections/history;
ordinary appends deliver only suffixes. SDK subscription status is not the turn
execution state. Never forward private Mastra tool arguments or memory to a browser.

Use bounded active polling at125ms and idle polling at1000ms. Drain full replay
pages without an artificial delay only when the cursor advances; every poll and
frame still respects authorization, lease capacity, request abort and expiry.
No pubsub service or schema is added. Active cost is bounded at8 polls per second
per subscriber, up to64 polls per second for an owner using all8 stream leases.
This seam has no separate global stream cap. It is an explicit responsiveness/
query-cost tradeoff, not evidence of production concurrency capacity.

Use pinned Streamdown2.7.1 for chat Markdown with application-owned CSS Modules
and semantic renderers. Disable raw HTML parsing, images, optional execution
plugins and built-in interactive controls. Keep the existing element/URL policy;
animation spans are renderer-generated only. Do not enable Tailwind or depend on
package utility classes for typography. No external assets are fetched.

Show localized queue/work/tool/writing activity independently of empty text.
Working is a generic activity label, never a disclosure of private reasoning.
Smooth new text at grapheme boundaries with a short180ms maximum reveal window;
completed/replaced text, hidden documents and reduced motion flush immediately.
Historical messages do not replay a typing animation. Respect deliberate scroll
position and text selection while the transcript grows.

## Alternatives considered

### Forward Mastra through a direct chat endpoint

Official converters support AI SDK streams, but directly exposing the worker
stream bypasses durable replay and carries internal tools/memory that are not
public UI events. Retain Mastra's existing real streaming execution and project
its committed public state instead.

### Change only Markdown animation

A renderer cannot fix server delivery cadence or an empty waiting-state bug.
Delivery, SDK projection and presentation need separate verification.

### Add notification infrastructure immediately

Pubsub could reduce polling overhead, but introduces lifecycle and infrastructure
choices beyond the focused outcome. Current stream capacity and adaptive bounds
permit an incremental improvement. Revisit with measured concurrent-load evidence.

## Consequences

- Progressive output and visible activity preserve durable recovery and accounting.
- Streamdown handles incomplete Markdown without introducing a second CSS system.
- Active subscriptions perform more authorized reads; capacity and query cost
  need monitoring before any production activation.
- Future Streamdown upgrades must retain restrictive rendering and URL tests.
- Fixture timing/browser proof does not establish real-provider latency or
  production concurrency capacity. No production deployment is implied.

## Related

- [ADR-0037](0037-independent-knowledge-and-agent-proposals.md)
- [ADR-0029](0029-web-css-modules-and-geometry-tokens.md)
- [Feature046](../../.agent/features/046-smooth-tutor-streaming/FEATURE.md)
- [ExecPlan](../../.agent/features/046-smooth-tutor-streaming/EXEC_PLAN.md)
