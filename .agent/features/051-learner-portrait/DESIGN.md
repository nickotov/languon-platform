# Design handoff: Learner portrait and AI interview

Owning work: [FEATURE.md](FEATURE.md)

Implementation plan: [EXEC_PLAN.md](EXEC_PLAN.md)

Canonical prompt: [Learner portrait](../../../docs/design-prompt/learner-portrait.md)

Revision rules: [Versioned design handoff](../../DESIGN_HANDOFF.md)

## learner-portrait

- Latest candidate: v001
- Implementation target: v001 — explicitly selected by user on 2026-10-21
- Last implemented: v001 — verified 2026-10-21

### v001 — 2026-10-20

- Status: Implemented
- Scope: Dashboard/profile entry states; optional introduction; guided interview; manual editing; draft review; saved portrait; per-chat preferences; expiry/conflict/deletion/failure states; desktop/mobile/light/dark.
- Changes from prior revision: Initial brief published after backend logic verification, as the user requested.
- Prompt snapshot: [v001.prompt.md](designs/learner-portrait/v001.prompt.md)
- Prompt SHA-256: `e2b5e5f2e6ccda9e53e016b08843692e443d3ed46f183e7c372f0c485da7bd4e`
- Snapshot link base: `docs/design-prompt`
- Source revision / working-tree changes: `5efaafe` plus the feature051 backend checkpoint; runtime/test identity in [source manifest](evidence/backend-source-sha256.json).
- Generated design URL: https://www.magicpatterns.com/c/wfhhgj71csfpmjd8jyunam
- Design identity: artifact `80c0d47f-8bcc-4c85-8f90-4c6557e9811b`; all82 files retained in [source](designs/learner-portrait/v001/source), with [capture/hash manifest](designs/learner-portrait/v001/source-manifest.json).
- Design-system reference: Existing web runtime tokens/shared UI; source-derived values embedded in portable prompt. Production integration follows ADR-0029.
- Approval / implementation authorization: User authorized the feature plan on 2026-10-20 and explicitly selected this design on 2026-10-21: “use it, do not reinvent.”
- Delivery record / fidelity inventory: [FEATURE.md](FEATURE.md); source inventory maps LP-UI-01–12 to management/editor/interview/chat rows.
- Verification / implementation commit: Current UI/runtime/fidelity records E7–E12 in [EVIDENCE.md](EVIDENCE.md); exact [final source manifest](evidence/final-source-sha256.json). Final implementation code commit: d823163 (UI checkpoint7f0fbbe plus owner-state remediation); independent completion/security reviews pass.
- Open issues: None blocking. The source mobile PNG compositor limitation is explicitly supplemented by actual rendered DOM measurements and clean local evidence. Other residual limitations are in EVIDENCE.md.

Decision history:

- 2026-10-20 — Saved full brief after backend logic checks passed. Created exact immutable v001 snapshot. Awaiting generated design; no UI implementation implied.

- 2026-10-21 — User returned and explicitly selected the linked design. Captured complete provider source before implementation; targetv001 fixed to the recorded artifact. The original blank URL is filled once; no prompt/snapshot content changed.

- 2026-10-21 — v001 implementation/fidelity verified against the pinned export and actual rendered source/runtime. Final completion and security reviews pass; no material omission or unapproved design change remains. Last implemented now points to v001; exact runtime identity is the221path final manifest at code commitd823163.

- 2026-10-21 — Completed v001 delivered in the single local feature squash on main. Runtime identity remains unchanged from the verified221path manifest; no design revision or new approval is implied.
