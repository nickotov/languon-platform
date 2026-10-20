# Improvement: Knowledge workspace detail design brief

Status: Complete
Created: 2026-10-20
Updated: 2026-10-20

## Routing decision

- Outcome: a copyable, source-grounded Magic Patterns prompt for a better-looking Knowledge note editing page.
- This is a documentation-only design improvement to an existing experience. It adds no runtime behavior, public contract, persistence, security policy, dependency, migration or new journey. The user did not request implementation or a feature lifecycle.
- Escalate if work changes runtime implementation or product semantics.

## Scope and constraints

- Source: feature 047, accepted ADR-0042, current Knowledge workspace user flow, Knowledge detail/form/editor/conflict/share components, reused tutor, and runtime visual tokens.
- In scope: one canonical prompt under `docs/design-prompt`, a versioned feature-owned `DESIGN.md`, immutable prompt snapshots, and prompt index link.
- Out of scope: editing the live app or generating a Magic Patterns design.
- Preserve unsaved working recovery, explicit Save, saved-only sharing, private chat, references, proposal review, version conflict resolution and responsive tutor behavior.
- Rollback: remove the new prompt, its snapshots, handoff and index row; no runtime migration needed.

## Acceptance criteria

- AC-1 — The portable prompt describes the document editor and its chat touchpoints, the real page logic and material states, and desktop/mobile placement without assuming the design provider knows the app.
- AC-2 — The canonical prompt is discoverable, copyable and linked to frozen versioned handoffs with source provenance and a blank generated-design URL.

## Plan and evidence

- [x] Wrote the [source-grounded prompt](../../docs/design-prompt/knowledge-workspace-detail.md) with visual direction, page logic, interaction states, responsive behavior and explicit capability boundaries.
- [x] Created the [versioned handoff](../features/047-knowledge-workspace/DESIGN.md), exact [v001](../features/047-knowledge-workspace/designs/knowledge-workspace-detail/v001.prompt.md) and [v002](../features/047-knowledge-workspace/designs/knowledge-workspace-detail/v002.prompt.md) snapshots, and [prompt index entry](../../docs/design-prompt/README.md).
- [x] Verified Markdown formatting, links, snapshot identity and focused Git diff.

Runtime/browser checks are not required for this documentation-only request; source inspection establishes behavior, not rendered design fidelity. No user-flow guide changes are needed because no product behavior changes.

## Outcome

The copyable Magic Patterns prompt is ready at v002. The user clarified that Magic Patterns has no prior page context and that the main design target is the document editor. v002 is self-contained, uses “design” framing, and treats the right dock/mobile bottom sheet as supporting chat placement. The v001 snapshot remains unchanged. v002 snapshot and canonical prompt SHA-256: `3a13d27ca709b55812d041c4038918a7574319a8dd04604285ef54e23afd4aa1`. The generated-design URL remains blank in the handoff, and no implementation version has been selected.

Verification: `pnpm exec prettier --write` on changed Markdown, `cmp` for canonical/snapshot byte identity, SHA-256 check, local Markdown link check, and `git diff --check` passed. No app code was changed for this brief. The pre-existing docked tutor width work remains untouched.

## Review and remaining risks

Independent review was not triggered for a documentation-only brief. No runtime change. Generated design has not been returned or approved; later implementation needs source-to-runtime fidelity review.
