# Design handoff: Sentence practice, AI checks and free reference review

Owning work: [FEATURE.md](./FEATURE.md).

Implementation plan: [canonical plan](../../../docs/sentence-practice-implementation-plan.md).

Related work: features035/036 and backlog004/005; backend and selected frontend implementation complete.

Canonical prompt: [sentence-practice.md](../../../docs/design-prompt/sentence-practice.md).

Revision rules: [DESIGN_HANDOFF.md](../../DESIGN_HANDOFF.md).

## sentence-practice

- Latest candidate: v001
- Implementation target: v001 — user requested implementation 2026-10-04
- Last implemented: v001 — feature 037, verified 2026-10-05

### v001 — 2026-10-04

- Status: Implemented
- Scope: Sentence practice, AI checks and free reference review; full portable state inventory, responsive/dark/RTL/accessibility.
- Changes from prior revision: Initial handoff after verified backend completion.
- Prompt snapshot: [v001.prompt.md](./designs/sentence-practice/v001.prompt.md).
- Prompt SHA-256: `15369d538a7967aa5e93351d94f833c7cde4ef902bd6086fb61907d06a2654ba`
- Backend contract fingerprint: `bf172b6c527a218ee5897cf7cf1765e9b27eb9ee0046ac7f69ad6de93c4a1b23`
- Snapshot link base: `docs/design-prompt/`; links retained from canonical document.
- Source revision / working-tree changes: local backend035 committed on main as
  `bcfda16`; backend036 approved source manifest `280dfbd2ad30a03d368342f73db483ef02183fc4cd510dc7dc847759f27f3e56`,
  additive migrations through0051. Final local squash delivery is recorded in Git.
- Generated design URL: [Magic Patterns provider v6](https://www.magicpatterns.com/c/syycdjxpposwrfn72sbix4)
- Design identity: provider artifact `40e0c753-773a-4449-8639-dc86e928fdac` (v6),
  read and rechecked 2026-10-04, generation inactive. Partial retained export:
  [v001/source](./designs/sentence-practice/v001/source/) (27 files).
- Retained-source SHA-256: `0339b370735bccfaa6b3b289afc87417d8216289759e0a69accf9eb1f90b76d3`.
  Digest input: files sorted by relative POSIX path, each UTF8 path + NUL +
  retained file bytes + NUL. This identifies retained analysis material, not a
  complete runnable export or rendered screenshots.
- Design-system reference: runtime `apps/web/src/app/globals.css`, shared primitives,
  current profile and flashcard practice surfaces; no external fidelity claim.
- Approval / implementation authorization: On 2026-10-04 the user supplied
  the design for bounded analysis, then explicitly requested implementation of
  the selected v001/provider-v6 target. No separate approval gate was added.
- Delivery record / source-derived inventory:
  [FEATURE.md](./FEATURE.md#returned-design-scope-and-source-inventory--2026-10-04).
  Backend evidence/review remains in this workspace; frontend delivery and
  resolved findings belong to [037 evidence](../037-sentence-practice-web/EVIDENCE.md)
  and [037 review](../037-sentence-practice-web/REVIEW.md).
- Verification / implementation commit: frozen prompt/source identities match;
  source-to-runtime inventory and actual-app evidence are verified in feature 037.
  Local implementation commit: `02ed13d5f792e2aa63500b7d9995af81955eaf8c`. Required delivery is a local
  one-commit squash merge into main; no push or branch deletion.
- Open issues: No implementation-blocking issue. External reference rendering
  was unavailable, so evidence does not claim pixel equivalence. Honest viewport
  simulations and the pre-existing unrelated profile defect are documented in
  frontend evidence. Backend contracts remain authoritative.

Decision history:

- 2026-10-04 — User returned provider v6 for bounded UI analysis. Pinned artifact,
  retained selected source/context, mapped brief IDs to source UI and recorded
  exclusions/adaptations. Candidate Ready for review, backend Complete unchanged;
  Last implemented remains None. No external editor mutation or frontend code.

- 2026-10-04 — Backend verified and reviewed; immutable v001 saved, awaiting design.
  No external design generation, publishing or frontend implementation performed.

- 2026-10-04 — User explicitly requested implementation to finish the feature.
  Selected v001/provider v6; active delivery [feature037](../037-sentence-practice-web/FEATURE.md).
  Earlier analysis-only decision is historical; Last implemented remains None until verified.

- 2026-10-05 — Selected v001/provider-v6 design implemented by
  [feature 037](../037-sentence-practice-web/FEATURE.md). Source-derived inventory,
  runtime captures, six real-app journeys, static/build checks and independent
  remediation reviews are complete. See [frontend evidence](../037-sentence-practice-web/EVIDENCE.md)
  and [review](../037-sentence-practice-web/REVIEW.md). No pixel-equivalence claim
  to an unavailable external rendered reference. Last implemented is v001;
  source artifact, retained digest and frozen prompt hash remain unchanged.
- 2026-10-05 — Mechanical backlog completion path mapping:
  `docs/backlog/004-ai-sentence-translation-practice.md` →
  `docs/backlog/004-ai-sentence-translation-practice-done.md`;
  `docs/backlog/005-user-selectable-ai-models.md` →
  `docs/backlog/005-user-selectable-ai-models-done.md`.
  Historical frozen snapshots keep original paths and hashes; current canonical
  links are repaired without a new prompt/design revision.

- 2026-10-05 — Verified implementation committed locally as `02ed13d5f792e2aa63500b7d9995af81955eaf8c` on
  `feature/sentence-practice-web`; source and prompt identities remain unchanged.
