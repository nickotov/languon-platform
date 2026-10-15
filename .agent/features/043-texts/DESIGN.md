# Design handoff: Texts

Owning [feature](FEATURE.md), [execution plan](EXEC_PLAN.md),
[evidence](EVIDENCE.md) and [handoff rules](../../DESIGN_HANDOFF.md).

Backend checkpoint verified and independently reviewed on 2026-10-15.
Frontend deliberately waits for the user's returned Magic Patterns design.

## texts

- Latest candidate: v002.
- Implementation target: none — awaiting returned design and selection.
- Last implemented: none.

### v001 — 2026-10-15

- Status: Superseded candidate — see v002.
- Scope: responsive web Texts folders, whole-text translation, aligned reading,
  explicit editing, contextual vocabulary collection, unlisted sharing/copy,
  lifecycle and complete recovery states. No frontend implementation yet.
- Canonical document: [texts.md](../../../docs/design-prompt/texts.md).
- Immutable complete canonical snapshot: [v001.prompt.md](designs/texts/v001.prompt.md).
- Canonical and snapshot SHA-256: `50810eeaf0b32c285637c154671726e1c4a2dfa4677e15c4db2d01ab89f76896`.
- Snapshot includes full metadata, portable prompt, checklist TXT-01–TXT-28,
  source grounding and limitations; copy only its Portable Magic Patterns prompt
  section when generating. The canonical document links back to this handoff.
- Source state: verified working tree on `feature/texts`, baseline
  `664198fee9eb1a0492134c43de9a9d04835568af`.
- Backend source manifest: [backend-verified.sha256](backend-verified.sha256).
- Manifest SHA-256: `afa35be15d878b4bd4c617159ef9b45807ff1fee6a7522fb55189da54faa2e0c`.
- Backend evidence: [EVIDENCE.md](EVIDENCE.md); independent correctness and
  security findings resolved in [REVIEW.md](REVIEW.md).
- Design reference: existing Languon Magic Patterns project/runtime shell;
  no new visual reference URL supplied. Existing runtime tokens/primitives and
  dictionary screens were inspected for source grounding.
- Generated-design URL: not yet provided.
- Provider revision/artifact/export/source/captures: not yet provided.
- Browser/design fidelity: not assessed; no Texts UI exists yet.
- Decision: preserve this candidate; implementation target remains none until
  the user returns/selects a design. A prompt update becomes v002; do not overwrite
  this snapshot. Attach returned exports/source/captures to this candidate using
  versioned handoff rules before frontend work.

### v002 — 2026-10-15

- Status: Awaiting generated design.
- Scope: same complete Texts scope as v001; final contract check explicitly limits
  existing dictionary choices to the selected occurrence's language direction.
- Reason: make the server-enforced matching-language rule visible in the picker
  rather than leaving an incompatible choice to fail during collection.
- Canonical document: [texts.md](../../../docs/design-prompt/texts.md).
- Immutable complete canonical snapshot: [v002.prompt.md](designs/texts/v002.prompt.md).
- Canonical and snapshot SHA-256: `093fe7e224bde2764dd26f786a297c465b9259e746343677524f96f121325c64`.
- Backend/source state and verified manifest: unchanged from v001 above.
- Generated-design URL, provider revision/export/source/captures: not yet provided.
- Implementation target: none. Last implemented: none.
- Decision: v002 is the latest candidate to send to Magic Patterns. Preserve v001
  history. Wait for returned design; no frontend implementation or fidelity claim.
