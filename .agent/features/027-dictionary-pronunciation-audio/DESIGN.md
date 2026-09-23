# Design handoff: Dictionary and AI cards

Owning feature: [Dictionary pronunciation audio](FEATURE.md)

Implementation plan: [Audio implementation plan](EXEC_PLAN.md)

Related features/plans:

- [Dictionary platform](../021-dictionary-platform/FEATURE.md) / [plan](../021-dictionary-platform/EXEC_PLAN.md)
- [Inline AI authoring](../022-inline-ai-card-authoring/FEATURE.md) / [plan](../022-inline-ai-card-authoring/EXEC_PLAN.md)

Canonical prompt: [Dictionary and AI cards](../../../docs/design-prompt/dictionary-ai-cards.md)

Revision rules: [Versioned handoff](../../DESIGN_HANDOFF.md)

## dictionary-ai-cards

- Latest candidate: v001
- Implementation target: v001
- Last implemented: v001 — verified local implementation, 2026-09-23

### v001 — 2026-09-22

- Status: Implemented
- Scope: Owner dictionary library/settings, manual cards, inline AI authoring,
  saved-card review and four-field pronunciation playback; responsive/state
  coverage UI-01 through UI-11 in the prompt.
- Changes from prior revision: Initial versioned handoff for the existing prompt,
  including the completed audio capability. Earlier prompt edits have no archived
  generated-design identity and are not reconstructed as approved revisions.
- Prompt snapshot: [v001](designs/dictionary-ai-cards/v001.prompt.md)
- Prompt SHA-256: d74b124690f56af82d4e3f1a0c7e948b7e07e599774b139e06844dfcf39b4245
- Snapshot link base: repository `docs/design-prompt/` (snapshot preserves exact original links)
- Source revision / working-tree changes: `2f8f6d2`; audio prompt correction was
  already staged; this workflow update adds the handoff backlink. No application changes.
- Generated design URL: https://www.magicpatterns.com/c/syycdjxpposwrfn72sbix4
- Design identity: artifact `b7f13de7-72b5-4c6f-bd22-a08c83e1ceb4`; [captured source manifest](designs/dictionary-ai-cards/v001/source-manifest.json), 2026-09-23
- Design-system reference: Existing ADR-0017 runtime kit; captured artifact includes
  prototype primitives/tokens. No separate system URL was supplied.
- Approval / implementation authorization: User requested implementation of this
  handoff on 2026-09-23; v001 is the sole candidate.
- Delivery record / fidelity inventory: [Dictionary design v001 improvement](../../improvements/dictionary-design-v001.md)
- Verification / implementation commit: [Design verification and review](../../improvements/dictionary-design-v001.md); changes are uncommitted.
  [Existing audio evidence](EVIDENCE.md) remains the underlying feature provenance.
- Open issues: Generated source captured and inspected. No hosted reference
  screenshot or separate design-system URL was supplied; existing ADR-0017
  primitives/tokens govern integration.
  Live Kie/Selectel activation remains gated as described in the prompt.

Decision history:

- 2026-09-22 — Created at the user's request; awaiting generated design. Existing
  feature completion remains unchanged. No generated design is approved or implemented.

- 2026-09-22 — User supplied a Magic Patterns URL during handoff setup. Ready for
  review; remote content remains uninspected and no implementation is authorized.

- 2026-09-22 — Feature folder renamed with stable prefix `027`. Prompt snapshot
  and SHA-256 remain unchanged; its historical links resolve through the
  [feature path mapping](../README.md#historical-path-mapping).

- 2026-09-23 — User authorized v001 implementation. Captured the active artifact;
  design integration in progress, prior decisions retained.

- 2026-09-23 — Implemented and verified v001 from its captured source. Independent
  review passed after discard-confirmation, cleanup and terminal-feedback fixes.
  Existing reorder and audio-speed controls retained under the feature contract;
  comparison is source-based rather than a hosted screenshot pixel comparison.

- 2026-09-23 — User explicitly selected “Follow design: hide both controls.” This
  supersedes the earlier keep-controls decision: card reorder actions and the
  audio speed selector are now hidden. v001 design/source identity is unchanged;
  this resolves its pending implementation choice, not a new design revision.

## v001 implementation repair — 2026-09-23

User-reported fidelity/readability defects are tracked in
[the repair record](../../improvements/dictionary-design-v001-repair.md).
This remains the same v001 target: no new generated design version. The user
explicitly chose to hide whole-dictionary-file import as well as reorder/speed.
Workspace word-pair import remains. The original implementation's source-only
fidelity conclusion is superseded by this repair and its reference/runtime
captures. Missing primitive sources were recovered from the matching current
Languon design system as a documented inference; original frozen files stay
unchanged. The reconstructed reference is not the unavailable hosted rendering.
