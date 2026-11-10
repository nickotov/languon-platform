# Optional AI diagnostics independent of routing and generation

Status: In progress
Created: 2026-11-10

## Authorization and goal

The user explicitly approved implementing the proposed removal of verification-history gates after reporting conversation 503 following prompt changes. This is feature-sized admission/publication/failure-policy work. Applies equally in development and production.

## Acceptance criteria

- AC-1: Supported, enabled, correctly configured routes can be published/switched and used without any successful diagnostic, including no history, changed fingerprints and failed historical diagnostics.
- AC-2: Quick-response and selected-flow checks remain explicit, bounded, audited operator-funded diagnostics; neither success nor failure affects route eligibility or runtime circuit state.
- AC-3: Genuine runtime failures use bounded automatic recovery, never permanent exclusion awaiting a manual check. Preserve safe retry/attempt limits, cancellation, immutable admitted routes/prices, accounting and output validation.
- AC-4: Credentials, adapter/capability support, processing/privacy restrictions, enable/disable, compatible workers, prices, customer tariffs and budgets remain authoritative prerequisites.
- AC-5: Doctor reports diagnostic history informationally; missing/changed/failed evidence alone never fails readiness. Admin copy and current guides describe optional diagnostics truthfully.
- AC-6: Disposable DB, deterministic production worker/SDK execution, affected admin browser journey, static checks, independent completion/security review and current ADR/docs demonstrate the change.

## Scope and exclusions

No new provider/model, arbitrary endpoint, paid automation, tariff/budget changes, learner data deletion or unrelated feature changes. Retain diagnostic/accounting history. Existing check controls/patterns are extended with accurate labels and guidance; no visual redesign.

## Delivery

Feature worktree is based on main 89ff4193, preserving unmerged feature061 in the original checkout. Reserve workspace062 to avoid collision with061. After verified squash delivery to main, integrate this isolated commit back into the original feature checkout without merging its unrelated work into main.
