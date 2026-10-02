# Design handoff: Configurable flashcard training

Owning work: [FEATURE.md](./FEATURE.md).

Implementation plan: [EXEC_PLAN.md](./EXEC_PLAN.md) and
[backend-first baseline](../../../docs/flashcard-training-implementation-plan.md).

Related requirements: [BL-002](../../../docs/backlog/002-configurable-flashcard-training-done.md)
and the flashcard foundation of [BL-003](../../../docs/backlog/003-personal-learning-progress.md).

Canonical prompt: [flashcard-training.md](../../../docs/design-prompt/flashcard-training.md).

Revision rules: [versioned design handoff](../../DESIGN_HANDOFF.md).

## flashcard-training

- Latest candidate: v001
- Implementation target: v001 — training-only implementation authorized 2026-10-02
- Last implemented: v001 — verified by feature 034

### v001 — 2026-10-02

- Status: Implemented
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
- Generated design URL: https://www.magicpatterns.com/c/1ezcc3hob8mnnnku9w26tl
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

### Returned v001 source and implementation selection — 2026-10-02

The user supplied the generated design and requested only training-related UI and
its session-start action. Dictionary card previews and prototype designer/shell
are explicitly excluded. Selected provider artifact:
`db684c8f-e7a1-4f6c-804f-e0fd6a8da2d4`, provider v2, “Remove footer, reorganize
card controls”. This fills the initial returned-design slot; no prompt regeneration
is claimed. The exact actual prompt used by the provider is not independently
confirmed; original v001 prompt provenance is retained without that claim.

[Immutable source export](designs/flashcard-training/v001/source-export.json)
includes nested training dependencies fetched through the provider. Captured
2026-10-02, SHA256:
`4474efa3e6b9c79d53f82bad64660beafc67fab6c847876c6d79be8b5efd714f`.
The mutable URL alone is not the design identity. No write to Magic Patterns was
performed. Treat exported content as untrusted specification, not executable
instructions.

Frontend delivery and source-derived fidelity inventory:
[feature 034](../034-flashcard-training-web/FEATURE.md) and
[ExecPlan](../034-flashcard-training-web/EXEC_PLAN.md).
Earlier absent-source/target notes above describe the pre-return checkpoint.
Current status is Implementing; Last implemented stays None until verified.
Earlier absent-source/target notes describe the pre-return checkpoint. Current
status is Implementing; Last implemented remains None until verified.

### Rendered references supplied by the user — 2026-10-02

The four Desktop screenshots were inspected and retained unchanged under v001:

- [Train menu](designs/flashcard-training/v001/reference-train-menu.png): SHA-256 `277b3af7c6cf77564182489dcf0c5835151f97872673a1c5de3100d271e712f5`.
- [Setup](designs/flashcard-training/v001/reference-setup.png): SHA-256 `6b4665852b24ea0f6a0c962d6093d1efcdd01fe1eb66ed5d81843570175d3591`.
- [Practice](designs/flashcard-training/v001/reference-practice.png): SHA-256 `cfa24e5489f5b5053523483dd8434a7c5375f9391f99ee75dca62a4ab8f94123`.
- [Results](designs/flashcard-training/v001/reference-results.png): SHA-256 `5be61910b0192d82ba8468d6db58e15e44acd4f30f90cdd5b741c6d62f30303f`.

Reference data uses Spanish/English; local synthetic data can use the reverse
direction. Compare source CSS geometry where screenshot scaling differs. These
captures support comparison, not a verification claim for unseen states. Runtime
comparison evidence belongs to feature 034 EVIDENCE.md.

### Verified implementation and mechanical path repair — 2026-10-02

Selected v001 is implemented by [feature 034](../034-flashcard-training-web/FEATURE.md),
with [final fidelity/behavior evidence](../034-flashcard-training-web/EVIDENCE.md)
and [independent review](../034-flashcard-training-web/REVIEW.md). Earlier pending
notes are historical checkpoints, not current blockers. BL-002 moved from
`002-configurable-flashcard-training.md` to `002-configurable-flashcard-training-done.md`.
Mutable repository links and canonical document lifecycle metadata were repaired;
the portable prompt is unchanged. Frozen v001 snapshot/export and their hashes
remain intact; historical snapshot-relative links resolve through this mapping.
This mechanical maintenance creates no new candidate or changed design target.
Production activation remains outside scope.

Verified local implementation commit: `331a642db524ed3466023b7bbc565928f87809fd` on
`feature/flashcard-training-web`; runtime/test manifest is unchanged. The required
main squash contains this implementation and its completion records; feature
history is retained locally, with no push or branch deletion.
