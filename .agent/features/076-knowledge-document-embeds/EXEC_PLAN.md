# Knowledge document embeds execution plan

## Goal and specification

Deliver [AC-1 through AC-5](FEATURE.md) on feature/knowledge-document-embeds. The user approved the editor, inline previews, dialogs and external fallback.

## Architecture and decisions

- D1. Extend the canonical saved document contract with two top-level URL atoms. Keep model-authored prose separate. Verify offsets, publication of an embed-only note and copy/recovery.
- D2. Extend the existing searchable insert picker and shared native dialog. Separate editor insertion from the common reader/editor preview component. Confirm zoom sizing, aspect fit, dismissal and focus at desktop and mobile widths.
- D3. The existing CSP permits YouTube frames. Isolate scriptless website content inside a static app-owned wrapper with its own CSP. Deliver the source via a fragment and limit nested navigation to its origin. See ADR-0067.

## Checks and milestones

- [x] M1 AC-2/3/5. Build and typecheck contracts, exercise knowledge document validation, backend domain/position tests and isolated PostgreSQL save/share/copy. Expected 1–5 minutes with local dependencies and Docker.
- [x] M2 AC-1/2/3/4/5. Focused editor and renderer Vitest, workspace typecheck, lint/styles and web/Storybook builds. Expected 2–8 minutes. Include separate wrapper header/hash verification. No paid provider checks.
- [x] M3 AC-1 through AC-5. Guide metadata/mapping, critical Playwright flow via disposable services, pinned browser verification and designer critique. Expected 3–10 minutes. Dedicated journey tester covers the cross-layer persistence, headers and reader behavior.
- [x] M4. Independent staged source/security review, resolve findings, approve final evidence, local squash merge.

## Progress

2026-11-26 — All milestones verified. Independent review approved after the three R-1 interaction regressions passed. Production build, full-stack browser, database round-trip, scoped static checks, security and visual reviews are recorded in EVIDENCE and REVIEW.

[Evidence](EVIDENCE.md) · [Review](REVIEW.md)
