# Design handoff: Configurable flashcard training

Owning work: [FEATURE.md](./FEATURE.md).

Implementation plan: [EXEC_PLAN.md](./EXEC_PLAN.md) and
[backend-first baseline](../../../docs/flashcard-training-implementation-plan.md).

Related requirements: [BL-002](../../../docs/backlog/002-configurable-flashcard-training.md)
and the flashcard foundation of [BL-003](../../../docs/backlog/003-personal-learning-progress.md).

Canonical prompt: [flashcard-training.md](../../../docs/design-prompt/flashcard-training.md).

Revision rules: [versioned design handoff](../../DESIGN_HANDOFF.md).

## flashcard-training

- Latest candidate: v001
- Implementation target: None — frontend deliberately deferred until returned design
- Last implemented: None

### v001 — 2026-10-02

- Status: Awaiting design
- Scope: owner/shared Train entry; configurable setup and manual subset; browser
  fullscreen/dialog cards; rating acknowledgment/retry/Undo; round/session/saved
  progress; results/retry rounds; live content/access and error states; light/dark,
  mobile/tablet/desktop, RTL, keyboard and reduced-motion requirements FC-01–FC-09.
- Changes from prior revision: Initial actual-contract/source-grounded handoff.
- Prompt snapshot: [v001.prompt.md](./designs/flashcard-training/v001.prompt.md).
- Prompt SHA-256: `b191553a0de0042cea86525a608c4e04529973742937d7b7d304855ba85e3c0c`.
- Canonical path / snapshot link base: `docs/design-prompt/flashcard-training.md` /
  `docs/design-prompt/`. Resolve snapshot-relative links from that canonical
  directory, not the immutable snapshot's location.
- Source revision: `b7f4fe7a2212df6982a05a1bcbed8408d3cacd04`.
- Relevant working-tree changes: feature033 learning module/routes/persistence;
  `packages/contracts/src/learning/index.ts`; dictionary learning revisions and
  transactional access participant; account purge integration; migrations0037/0038/0039/0040;
  backend composition/environment feature flag and associated tests. No frontend
  implementation changes. See feature evidence for tested patch details; this
  prompt source reference does not assert completed review or deployed readiness.
- Generated design URL: **PASTE GENERATED DESIGN URL HERE**
- Design identity: Pending — preserve provider revision or retained export/captures
  with date/hash when the user returns a design; a mutable editor URL alone is not
  historical identity.
- Design-system reference: actual `apps/web/src/app/globals.css` semantic tokens,
  shared Button/Menu/Dialog contracts/styles, dictionary editor Add card/summary
  and shared-reader source; ADR-0016 and ADR-0017. No external reference required
  to create this source-based prompt; no external visual fidelity claimed.
- Approval / implementation authorization: None for a returned design. User
  authorized backend delivery plus prompt then stop; no frontend work authorized
  by this handoff and no Magic Patterns write was performed.
- Delivery record / fidelity inventory: [FEATURE.md](./FEATURE.md),
  [EXEC_PLAN.md](./EXEC_PLAN.md), [EVIDENCE.md](./EVIDENCE.md). Future source-derived
  frontend fidelity inventory must map FC-01–FC-09 explicitly without reusing IDs
  for different requirements; none exists yet.
- Verification / implementation commit: exact snapshot equality/hash verified;
  frontend runtime and implementation commit not applicable yet. Backend
  verification/review status remains owned by EVIDENCE.md and REVIEW.md.
- Open issues: returned design/source identity absent; no approved implementation
  target; frontend browser/gesture/accessibility evidence deferred, not waived;
  future generated design must preserve real API/auth/product contracts rather
  than ship its mock adapter.

Decision history:

- 2026-10-02 — Created from implemented stable backend contracts and existing web
  source; immutable v001 saved. Awaiting generated design. No frontend approval,
  external design generation or rendered comparison implied. Stop at this
  handoff until the user supplies the design and applicable next instruction.
