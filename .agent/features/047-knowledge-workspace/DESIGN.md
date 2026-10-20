# Design handoff: Knowledge workspace document editor

Owning work: [Feature 047](FEATURE.md)

Implementation plan: [Feature 047 execution plan](EXEC_PLAN.md)

Related work: [Knowledge workspace detail design brief](../../improvements/knowledge-workspace-detail-design-brief.md)

Canonical prompt: [Knowledge workspace detail](../../../docs/design-prompt/knowledge-workspace-detail.md)

Revision rules: [Versioned design handoff](../../DESIGN_HANDOFF.md)

## knowledge-workspace-detail

- Latest candidate: v004
- Implementation target: v004 — user explicitly requested the updated design on 2026-10-20
- Last implemented: v004 — verified 2026-10-20

### v001 — 2026-10-20

- Status: Awaiting design
- Scope: Knowledge note editing page with docked/detached tutor, responsive bottom sheet, private recovery, explicit Save, proposal review, conflicts, history and saved-only sharing.
- Changes from prior revision: Initial handoff.
- Prompt snapshot: [v001 exact prompt](designs/knowledge-workspace-detail/v001.prompt.md)
- Prompt SHA-256: `acf61d56930b636ceb3e139950b66552def1d6476f955a597ade4e575eddc412`
- Snapshot link base: `docs/design-prompt/`
- Source revision / working-tree changes: `d44ebca3e26f38f775f0a7df04004653a99bd6fd`; the docked tutor 50% width control is present as uncommitted working-tree changes in the companion layout, tutor header, tests and user-flow guide. The prompt and this handoff are documentation additions.
- Generated design URL: **PASTE GENERATED DESIGN URL HERE**
- Design identity: Pending — provider revision or retained export/captures + date/hash.
- Design-system reference: Runtime color tokens in [`globals.css`](../../../apps/web/src/app/globals.css), existing shared UI primitives and Knowledge components; no external design-system source was supplied.
- Approval / implementation authorization: None.
- Delivery record / fidelity inventory: None.
- Verification / implementation commit: None.
- Open issues: No rendered-page capture or generated design was available when this prompt was written; visual fidelity has not been assessed.

### v002 — 2026-10-20

- Status: Awaiting design
- Scope: Document editor as the primary design surface; supporting tutor placement on the right on desktop and in a bottom sheet on mobile; document-to-chat selection and proposal interactions.
- Changes from prior revision: Reframed the prompt as a self-contained design request for a provider with no knowledge of the app. Narrowed the detailed design scope to the editor and its chat touchpoints, while retaining existing document behavior and responsive placement.
- Prompt snapshot: [v002 exact prompt](designs/knowledge-workspace-detail/v002.prompt.md)
- Prompt SHA-256: `3a13d27ca709b55812d041c4038918a7574319a8dd04604285ef54e23afd4aa1`
- Snapshot link base: `docs/design-prompt/`
- Source revision / working-tree changes: `d44ebca3e26f38f775f0a7df04004653a99bd6fd`; uncommitted docked tutor width changes remain in the working tree. This revision changes only the design prompt and handoff documentation.
- Generated design URL: **PASTE GENERATED DESIGN URL HERE**
- Design identity: Pending — provider revision or retained export/captures + date/hash.
- Design-system reference: Runtime color tokens in [`globals.css`](../../../apps/web/src/app/globals.css), existing shared UI primitives and Knowledge components; no external design-system source was supplied.
- Approval / implementation authorization: None.
- Delivery record / fidelity inventory: None.
- Verification / implementation commit: None.
- Open issues: No rendered-page capture or generated design was available when this prompt was revised; visual fidelity has not been assessed.

### v003 — 2026-10-20

- Status: Implemented
- Scope: Exact document editor presentation, workspace layout and reused tutor refinements from the returned design.
- Changes from prior revision: User returned an updated generated design and selected it for implementation. The actual generation prompt and subsequent provider edits are unknown; v001/v002 are retained prompt history, not proof of the exact prompt used for this artifact.
- Prompt snapshot / SHA-256: Unknown for this generated revision; related brief [v002](designs/knowledge-workspace-detail/v002.prompt.md) remains unchanged.
- Source revision / working-tree changes: `d44ebca3e26f38f775f0a7df04004653a99bd6fd` plus the pre-existing docked tutor half-width work and design-brief additions. Runtime integration is tracked in the delivery record.
- Generated design URL: https://www.magicpatterns.com/c/3pqoonbgxacst6w72rhiqb
- Design identity: Provider v8 “Fix ProseMirror Plugin Instance Duplication”, artifact `4daa1a0f-1e36-43a3-9dc1-a170e44cd749`; retained [source](designs/knowledge-workspace-detail/v003/source/) and [reference evidence](designs/knowledge-workspace-detail/v003/reference/).
- Design-system reference: Runtime semantic tokens and shared primitives; twelve provider-empty primitives use the retained current design-system artifact for reference rendering only, qualified in captures.json.
- Approval / implementation authorization: User supplied this URL and explicitly requested adopting editor, layout and chat changes faithfully on 2026-10-20.
- Delivery record / fidelity inventory: [Knowledge workspace design integration, UI-01–UI-08](../../improvements/knowledge-workspace-design-integration.md).
- Verification / implementation commit: Scoped checks, source/runtime evidence, mapped browser remediations, independent review and final optimized build pass; see delivery record. No commit requested.
- Open issues: No known material implementation findings. The provider browser URL was sign-in gated; controlled source rendering used the qualified inherited primitive artifact. Historical primitive inheritance remains unproven, as recorded in the reference evidence.

Decision history:

- 2026-10-20 — Created from feature 047, ADR-0042, the Knowledge workspace user flow and current implementation; awaiting generated design. No design approval or implementation implied.
- 2026-10-20 — User clarified that Magic Patterns has no existing-page context and should design mainly the document editor. Saved v002 without changing the implementation target or v001 snapshot.

- 2026-10-20 — User selected returned provider v8 as v003 for exact document implementation and related layout/chat updates. v001/v002 prompt history remains immutable.

- 2026-10-20 — Implemented selected v003/provider v8 with source/runtime comparisons, focused tests, scoped real browser journeys, independent review and final production build. No commit made.

- 2026-10-20 — User requested a draggable Knowledge/tutor boundary (maximum 50%) and aligned attached headers. Tracked separately in [pane resize improvement](../../improvements/knowledge-workspace-pane-resize.md); retained v003 reference artifacts and prior implementation evidence remain historical snapshots.

### v004 — 2026-10-20

- Status: Implemented
- Scope: Updated AI-Native document workspace, in-canvas title/properties, topbar/layout/tabs, selection tools, inline review and reused tutor.
- Changes from prior revision: User explicitly selected the updated design at the same URL. Default source direction `ai-native` is the implementation target; prototype alternative directions are demos.
- Actual generation prompt / hash: Unknown; v001/v002 snapshots remain historical.
- Source revision: `d44ebca3e26f38f775f0a7df04004653a99bd6fd` plus retained uncommitted v003 integration and pane resize work.
- Generated design URL: https://www.magicpatterns.com/c/3pqoonbgxacst6w72rhiqb
- Design identity: Provider v9 “Build Approved Knowledge Editor Plan”, artifact `8e368152-98f3-4835-a922-79272a54cc7a`; [retained source](designs/knowledge-workspace-detail/v004/source/).
- Authorization: User asked to implement the updated supplied design faithfully on 2026-10-20. No external design write requested.
- Delivery record / inventory: [Knowledge workspace v9 design](../../improvements/knowledge-workspace-v9-design.md), V9-01–V9-10.
- Verification: Current source/reference/runtime comparisons, all10 mapped browser journeys across valid scoped runs, static/unit/disposable DB checks, independent completion/security review and final production build pass. Durable reference/runtime manifests retain qualifications; see active delivery record. Earlier v003 evidence remains historical.
- Resolved decisions: User explicitly preserved full-document context and selected source Chat layout up to60%. User also authorized persistent modes as Feature048. No material unresolved implementation finding remains; inherited primitive identity and platform coverage qualifications are retained in the delivery record.

- 2026-10-20 — Selected updated provider v9 as v004. Prior v003 remains the last verified implementation until v004 evidence completes.

- 2026-10-20 — Implemented and verified selected v004/provider v9 with retained source/runtime comparisons,10 valid browser scenarios, independent review and the explicitly authorized persistent-mode feature. Local feature integration records code and design evidence together.

- 2026-10-20 — Feature implementation commit `13b6206` records v004 and persistent modes with preserved design prerequisites; locally squash-integrated into main without runtime changes or conflicts.
