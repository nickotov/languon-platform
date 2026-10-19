# Design handoff: Contextual language tutor widget

Owning work: [Feature 044](./FEATURE.md)

Implementation plan: [Completed original implementation](./EXEC_PLAN.md)

Related delivery: [Supplied tutor widget improvement](../../improvements/contextual-assistant-widget-design.md).

Canonical prompt: [Copyable widget prompt](../../../docs/design-prompt/contextual-assistant-widget.md)

Revision rules: [Versioned design handoff](../../DESIGN_HANDOFF.md)

## contextual-assistant-widget

- Latest candidate: v001
- Implementation target: v001 — user explicitly requested faithful implementation on 2026-10-19
- Last implemented: v001 — verified 2026-10-19; original feature remains complete

### v001 — 2026-10-19

- Status: Implemented
- Scope: Floating desktop tutor widget, sidebar-aware docking, preserved folded state, mobile bottom sheet, streaming, source context, preferences, history and Knowledge drafts.
- Changes from prior revision: Initial handoff; saves the prompt supplied in conversation.
- Prompt snapshot: [v001.prompt.md](./designs/contextual-assistant-widget/v001.prompt.md)
- Prompt SHA-256: `43a5f32570484ea1261b9cd8d44a6ee0b0be3a0691dc7d94d841adb219b3e147`
- Snapshot link base: `docs/design-prompt/`
- Source revision / working-tree changes: `88e21eddc9b62255896514d029b1c4fec0557cb9`; clean before this documentation-only prompt/index/handoff change.
- Generated design URL: https://www.magicpatterns.com/c/3pqoonbgxacst6w72rhiqb
- Design identity: Provider v5 “Reduce Button Vertical Padding”, artifact `dc75f1a9-eb2b-4b7b-84d4-4edf56ab4932`; retained 58-file source and SHA-256 manifest in `designs/contextual-assistant-widget/v001/` on 2026-10-19.
- Design-system reference: Supplied Languon design system `ds-079806f1-e593-4a64-8818-e922e2f7314d`; current inherited primitive source and render qualification retained in [reference capture metadata](./designs/contextual-assistant-widget/v001/reference/captures.json). Runtime semantic tokens and shared components remain authoritative integration boundaries.
- Approval / implementation authorization: User supplied the design and explicitly requested strict implementation on 2026-10-19.
- Delivery record / fidelity inventory: [Active improvement and returned-design inventory W01–W10](../../improvements/contextual-assistant-widget-design.md); original [prompt correction](../../corrections/save-contextual-assistant-widget-prompt.md).
- Verification / implementation commit: See active improvement for focused tests, mapped real-browser journeys and source/runtime comparison; no commit made for this improvement.
- Open issues: No open implementation findings. Current inherited design-system rendering is available; its historical provider-v5 inheritance cannot be proven. Real source-scoped history, usage and structured editor contracts are preserved; documented reconciliations live in the improvement record.

Decision history:

- 2026-10-19 — Saved the requested copyable prompt and initial immutable revision. Awaiting generated design. Original feature status unchanged; no design approval or implementation implied.

- 2026-10-19 — User selected returned v001 design for strict implementation. [Active improvement and fidelity inventory](../../improvements/contextual-assistant-widget-design.md). Original feature completion remains historical.

- 2026-10-19 — Implemented selected v001/provider v5. Source/runtime comparisons,43 focused tests,2 API/3 browser journeys, production build and independent review passed; details and qualified fidelity limits in the [completed improvement](../../improvements/contextual-assistant-widget-design.md). No commit made.

- 2026-10-19 — User-directed [Tutor widget polish](../../improvements/contextual-tutor-widget-polish.md) adjusted the implemented v001 entry point, default height, menu alignment, shadow, usage disclosure and opening animation. The frozen source and prompt remain unchanged; the selected design revision is still v001. The incremental record distinguishes these later requested runtime changes from source fidelity.
