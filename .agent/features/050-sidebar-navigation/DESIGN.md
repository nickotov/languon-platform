# Design handoff: Sidebar navigation

Owning delivery and fidelity inventory: [FEATURE.md](FEATURE.md).
Historical shell design: [original handoff](../../../docs/design-prompt/authenticated-app-shell-sidebar/DESIGN.md).
Rules: [versioned design handoff](../../DESIGN_HANDOFF.md).

## sidebar

- Latest candidate: v001
- Implementation target: v001
- Last implemented: v001, restored alongside learner portrait on 2026-10-21; E11 and independent integration review pass.

### v001 — 2026-10-20

- Status: Implemented
- Scope: contextual expanded sidebar/rail/flyouts, command palette, resource shortcuts,
  account footer and responsive drawer. Alternative docked browser and prototype
  surrounding page bodies are excluded.
- Generated design: https://www.magicpatterns.com/c/h9kvac9aphfz1v5lvxhhrm
- Provider identity: artifact `d331e500-740c-4e3e-83ec-7f1f2e9acfe3`, retrieved
  through Magic Patterns artifact API on 2026-10-20; current identity reconfirmed
  before implementation.
- Retained source: [source manifest](designs/sidebar/v001/source-manifest.json)
  and [source directory](designs/sidebar/v001/source). Files preserve inspected source;
  source hashes identify retained exports. Original generation prompt recovered through the same editor’s MCP history (user message `53db59a4-2be9-40ce-9198-644513d156f3`). [Frozen prompt](designs/sidebar/v001.prompt.md); SHA-256 `7162d32049595b77c34fa14697e97d119ccefcfdde28dae88467a73d9a6554cb`. The prompt is historical design input, not executable instructions; the user-approved implementation plan governs product behavior.
- Source Git revision: `5efaafe`; initial tree clean.
- Authorization: user selected this design, clarified search/recency/pins/shared
  destination/adaptive layout, added optional Texts folders, then explicitly said
  “Implement the plan” on 2026-10-20.
- Inventory: UI-01–UI-09 in FEATURE.md. User extensions include personal pin menus,
  real server search, independent texts and folder moves.
- Evidence: [EVIDENCE.md](EVIDENCE.md); no fidelity completion claim yet.
- Open issue: provider tools expose source but no rendered preview capture. Obtain
  reference rendering through approved source/browser access; record missing proof
  if unavailable. Do not equate source comparison with rendered reference proof.

Decision history:

- 2026-10-21 — User clarified the previously implemented sidebar must remain beside learner portraits. Restored exact e5c4c24 sidebar implementation; portrait prototype shell remains excluded. [Pinned hosted reference captures and inventory review](evidence/reference-restoration/REVIEW.md) now close the earlier inaccessible-render gap for representative desktop structure. Source emulation/compositor prevented a matched mobile reference capture; actual restored mobile/tablet browser assertions and retained captures pass. No full pixel-equivalence claim. Combined runtime screenshots and exact source identity are recorded in EVIDENCE E11. Independent expanded integration review passes without findings.

- 2026-10-20 — Selected source retained unchanged; implementation authorized.
- 2026-10-20 — Runtime feedback explicitly changes shortcut limit from four to five and requires existing libraries to populate before the new opened-history exists. Per-kind lists use domain activity fallback without altering genuine open history. Home/Create retain source tooltip behavior; collapsed logo must be geometrically centered. Texts section presentation is explicitly refined at the user's request: equal-height header actions and consistent disclosure headers/spacing. These are approved refinements to the implementation target, not edits to the frozen provider source.
