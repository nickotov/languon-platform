# Design handoff: Profile AI model preferences

Owning work: [FEATURE.md](./FEATURE.md).

Implementation plan: [canonical plan](../../../docs/sentence-practice-implementation-plan.md).

Related work: features035/036 and backlog004/005; backend complete, frontend awaits design.

Canonical prompt: [profile-text-ai-preferences.md](../../../docs/design-prompt/profile-text-ai-preferences.md).

Revision rules: [DESIGN_HANDOFF.md](../../DESIGN_HANDOFF.md).

## profile-text-ai-preferences

- Latest candidate: v001
- Implementation target: None — awaiting returned design
- Last implemented: None

### v001 — 2026-10-04

- Status: Awaiting design
- Scope: Profile AI model preferences; full portable state inventory, responsive/dark/RTL/accessibility.
- Changes from prior revision: Initial handoff after verified backend completion.
- Prompt snapshot: [v001.prompt.md](./designs/profile-text-ai-preferences/v001.prompt.md).
- Prompt SHA-256: `fead9eccb536905a10261c64ec0676f401a0e5c890b2b476621b0ede33bba403`
- Backend contract fingerprint: `ee98b0a598f680c0efc2176909a046963022ec97b89962438d488338deff87d9`
- Snapshot link base: `docs/design-prompt/`; links retained from canonical document.
- Source revision / working-tree changes: local backend035 committed on main as
  `bcfda16`; backend036 approved source manifest `280dfbd2ad30a03d368342f73db483ef02183fc4cd510dc7dc847759f27f3e56`,
  additive migrations through0051. Final local squash delivery is recorded in Git.
- Generated design URL: **PASTE GENERATED DESIGN URL HERE**
- Design identity: Pending — retain provider revision or export/captures + date/hash.
- Design-system reference: runtime `apps/web/src/app/globals.css`, shared primitives,
  current profile and flashcard practice surfaces; no external fidelity claim.
- Approval / implementation authorization: Backend and prompt delivery authorized;
  frontend integration awaits user-provided design and explicit selected revision.
- Delivery record / fidelity inventory: [EVIDENCE.md](./EVIDENCE.md),
  [REVIEW.md](./REVIEW.md); future frontend requirement-to-reference/runtime inventory
  is not created yet.
- Verification / implementation commit: snapshot/hash equality verified at handoff;
  no frontend implementation or browser fidelity evidence exists yet.
- Open issues: generated design/source identity absent; no implementation target;
  native gesture, accessibility and browser fidelity checks remain required when
  implementing the returned design. Existing backend contracts remain authoritative.

Decision history:

- 2026-10-04 — Backend verified and reviewed; immutable v001 saved, awaiting design.
  No external design generation, publishing or frontend implementation performed.
