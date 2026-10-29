# Design handoff: Interactive knowledge sheets and AI chat

Owning work: [F059 specification](FEATURE.md)

Implementation plan: [F059 ExecPlan](EXEC_PLAN.md)

Brief preparation: [Documentation correction](../../corrections/interactive-workbook-design-brief.md)

Related features/plans:

- [Knowledge workspace](../047-knowledge-workspace/FEATURE.md) and [plan](../047-knowledge-workspace/EXEC_PLAN.md).
- [Contextual language assistant](../044-contextual-language-assistant-and-knowledge/FEATURE.md) and [plan](../044-contextual-language-assistant-and-knowledge/EXEC_PLAN.md).
- [Texts](../043-texts/FEATURE.md) and [plan](../043-texts/EXEC_PLAN.md).

Canonical prompt: [Interactive knowledge sheets and AI chat](../../../docs/design-prompt/interactive-knowledge-sheet-and-chat.md)

Revision rules: [Versioned design handoff](../../DESIGN_HANDOFF.md)

## interactive-knowledge-sheet-and-chat

- Latest candidate: v003
- Implementation target: None — no generated design or design implementation requested
- Last implemented: None

### v001 — 2026-10-29

- Status: Awaiting design
- Scope: Knowledge sheet + contextual AI chat; six reusable block families across compact chat, expanded review, authoring and learner practice; workbook navigation, sharing/copy/library dialogs; responsive, private-progress, approval, recovery and capability states. Stable brief IDs KS-01–KS-21.
- Changes from prior revision: Initial handoff for the authorized interactive-block extension; older 044/047 prompt snapshots and selected implementation pointers are unchanged.
- Prompt snapshot: [Exact v001 canonical snapshot](designs/interactive-knowledge-sheet-and-chat/v001.prompt.md)
- Prompt SHA-256: `53b106a65be48220cd93f48e0a2673bded117537354527d21bf1eb3cbcfe6153`
- Snapshot link base: `docs/design-prompt/` (canonical prompt directory; resolve snapshot relative links from this directory)
- Source revision / working-tree changes: `def891808c6995efb0d5aac107422419f4eef184`; initial working tree clean. This documentation change adds the canonical brief, this handoff, its snapshot, a correction record and a prompt-index entry. Application code is unchanged.
- Generated design URL: **PASTE GENERATED DESIGN URL HERE**
- Design identity: Pending — retain provider revision or export/captures with date and hashes when returned
- Design-system reference: [Runtime tokens](../../../apps/web/src/app/globals.css), existing Menu/Popover and learning-block components; [prior workspace handoff](../047-knowledge-workspace/DESIGN.md). No new external design-system URL supplied; this does not block using the brief.
- Approval / implementation authorization: User requested a saved copyable design prompt on 2026-10-29. No external generation, design selection or implementation authorization is inferred.
- Delivery record / fidelity inventory: Brief preparation record linked above; no implementation inventory yet. Create one for the selected returned design if implementation is requested.
- Verification / implementation commit: Documentation checks only; no generated design, implementation or fidelity claim
- Open issues: F059 remains in progress; transcription activation/provider approval and feature-wide delivery remain pending. The brief requires conditional availability and explicitly defers courses, group-wide AI context, grammar-library saving and teacher features.

Decision history:

- 2026-10-29 — Created v001 for the requested design-agent handoff. Canonical prompt is copy-ready; awaiting returned design. No generated-design URL or implementation target invented.

### v002 — 2026-10-29

- Status: Awaiting design
- Scope: Same KS-01–KS-21 workspace/chat/component/state scope as v001
- Changes from prior revision: Clarify historical chat provenance, no autoplay in previews and separation of prototype-only state/role controls from product UI; canonical title updated to v002.
- Prompt snapshot: [Exact v002 canonical snapshot](designs/interactive-knowledge-sheet-and-chat/v002.prompt.md)
- Prompt SHA-256: `a8a30b08652b6889ade786b69d370ceeb40a1ba48764c427d26e5f4aa1c92f4f`
- Snapshot link base: `docs/design-prompt/`
- Source revision / working-tree changes: `def891808c6995efb0d5aac107422419f4eef184`; documentation-only brief/handoff/snapshot/index/correction changes.
- Generated design URL: **PASTE GENERATED DESIGN URL HERE (v002)**
- Design identity: Pending — retain provider revision or export/captures with date and hashes
- Design-system reference: Same runtime and prior-handoff references as v001; no new external reference required
- Approval / implementation authorization: None — brief preparation only
- Delivery record / fidelity inventory: [Brief preparation record](../../corrections/interactive-workbook-design-brief.md); no implementation inventory
- Verification / implementation commit: Documentation checks only
- Open issues: Same capability activation and F059 completion limitations as v001

Decision history:

- 2026-10-29 — Refined the initial brief before delivery. v001 is superseded as the latest candidate; its exact snapshot/hash are retained. Use v002 for new generation. Neither implementation pointer changed.

### v003 — 2026-10-29

- Status: Awaiting design
- Scope: Additive extension of the existing chat/editor design; preserve KS-01–KS-21 identities and add KS-22 atomic AI editing and KS-23 future capability concepts.
- Changes from prior revision: Preserve the established workspace design. Specify explicit word/snippet playback in chat and sheet, desktop side-dialog and mobile bottom-sheet editing for all custom blocks, per-field AI checking/translation with preview and stale-target protection, and collapsed/expanded exercises with inline answers/hints/feedback. Separate future pronunciation assessment, transcript-plus-description comprehension and question difficulty from available product behavior.
- Prompt snapshot: [Exact v003 canonical snapshot](designs/interactive-knowledge-sheet-and-chat/v003.prompt.md)
- Prompt SHA-256: `78a48680147fe9aedefccd02ffdee5b8cac93b2de89473d555f9676b324b6435`
- Snapshot link base: `docs/design-prompt/`
- Source revision / working-tree changes: `def891808c6995efb0d5aac107422419f4eef184`; documentation-only brief/handoff/snapshot/index/correction changes. Application code unchanged.
- Generated design URL: **PASTE GENERATED DESIGN URL HERE (v003)**
- Design identity: Pending — retain provider revision or export/captures with date and hashes
- Design-system reference: User’s existing AI-chat/editor design is the required baseline; no new external design URL was supplied. Do not claim fidelity to unseen material. Runtime/prior-handoff references remain contextual.
- Approval / implementation authorization: User requested revisions to the design brief; no application implementation or external design generation inferred
- Delivery record / fidelity inventory: [Brief preparation record](../../corrections/interactive-workbook-design-brief.md); no implementation inventory
- Verification / implementation commit: Documentation checks only; no runtime or implementation claim
- Open issues: Existing external design reference not attached in this request; new atomic editor flows may exceed current runtime and are design requirements only. Pronunciation assessment, richer comprehension and difficulty are future concepts. F059 activation/completion limitations remain.

Decision history:

- 2026-10-29 — User clarified existing chat/editor design must be extended, not redesigned, and specified block playback, atomic AI editing, side/bottom editing overlays, inline exercises and future assessment direction. v003 supersedes v002 as the latest candidate; older snapshots and both implementation pointers remain unchanged.
