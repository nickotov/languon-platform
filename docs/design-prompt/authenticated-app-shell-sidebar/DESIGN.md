# Design handoff: Authenticated app shell and navigation sidebar

Owning work: [prompt documentation correction](../../../.agent/corrections/authenticated-app-shell-sidebar-prompt.md)

Implementation plan: [authenticated app-shell improvement](../../../.agent/improvements/authenticated-app-shell-magic-design.md)

Related features/plans: Dictionary platform and profile account controls are
referenced by the canonical prompt; implementation is authorized through the
linked improvement without changing their product contracts.

Canonical prompt: [authenticated app shell and sidebar](../authenticated-app-shell-sidebar.md)

Revision rules: [versioned design handoff rules](../../../.agent/DESIGN_HANDOFF.md)

## authenticated-app-shell-sidebar

- Latest candidate: v001
- Implementation target: v001
- Last implemented: v001

### v001 — 2026-09-28

- Status: Implemented
- Scope: Responsive authenticated application shell; expanded and collapsed
  desktop sidebar; account menu; mobile top bar and drawer; dictionary-list
  loading, empty, error, selected, long-name, and populated states; light and
  dark themes around existing dictionary and profile page bodies.
- Changes from prior revision: Initial handoff
- Prompt snapshot: [v001 prompt](./designs/authenticated-app-shell-sidebar/v001.prompt.md)
- Prompt SHA-256: `796c4438fe9bb61a875af40fd6940dcf8c390526dc9fbf238b9b5e78d93f4174`
- Snapshot link base: `docs/design-prompt`
- Source revision / working-tree changes: `b636752`; documentation-only working
  tree additions for the canonical prompt, v001 snapshot, handoff, index, and
  correction record.
- Generated design URL: https://www.magicpatterns.com/c/wrzxpfxkdo2dh12pny9hpg
- Design identity: Active artifact
  `79d453fa-96ca-42a5-9597-e4a49fc67962`, inspected 2026-09-28 through the
  Magic Patterns artifact API; all listed source files were inventoried before
  implementation.
- Design-system reference: Existing Languon runtime token values are embedded in
  the prompt; runtime authority remains ADR-0016 and ADR-0017.
- Approval / implementation authorization: User selected v001 and requested
  implementation on 2026-09-28.
- Delivery record / fidelity inventory: [authenticated app-shell improvement](../../../.agent/improvements/authenticated-app-shell-magic-design.md)
- Verification / implementation commit: Implemented in the current uncommitted
  working tree based on `b636752`; verification is recorded in the linked
  improvement record.
- Open issues: No material fidelity gaps. The generated prototype's mock data,
  simplified create dialog, and route simulation were intentionally replaced by
  Languon's real API, session, locale, theme, and page contracts.

Decision history:

- 2026-09-28 — Created; awaiting generated design. No design approval or
  implementation implied.
- 2026-09-28 — Filled the initial v001 design URL, recorded artifact identity,
  and selected it as the implementation target at the user's request.
- 2026-09-28 — Implemented v001 across authenticated dictionary and profile
  routes and verified desktop, rail, account-menu, detail, profile, dark-theme,
  and 320 px drawer states against the real local application.
