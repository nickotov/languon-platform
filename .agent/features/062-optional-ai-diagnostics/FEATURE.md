# Optional AI diagnostics independent of routing and generation

Status: Implementation verified; main integration authorized; production/declaration qualification pending
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

## Local delivery and remaining qualification

Implementation is integrated into the user's existing checkout; local migration0165 is applied and full doctor passes108prerequisites with11informational diagnostics. No paid verification/generation was run. Runtime/SQL, actual SDK/worker and real-browser evidence is complete, with explicit case-level reuse after fixture-only remediations. Main and unrelated feature061work remain preserved.

Strict feature/release completion and main squash remain withheld: accumulated production migrations are classified contract and the current blue/green deployer cannot safely apply them; the original standard backend build's declaration phase was stopped after12+minutes. Full typecheck, actual runtime bundling and migration packaging pass. These limitations do not block the requested local behavior and are not represented as passing production/declaration gates.

## Integration disposition — 2026-11-11

After the local credential-persistence incident and remaining risk were explained,
the user stated: “ok, i'll update key, can finish feature and merge to main”.
This explicitly authorizes local main integration of the preserved061/062/063
stack while the user performs key rotation. It does not assert that rotation has
already occurred or that the credential incident is operationally closed.
Source/data remediation and approved evidence remain unchanged. Earlier no-main
restrictions in this record are historical and superseded by this user decision.
No deployment, push or branch deletion is authorized. Production contract-migration
qualification and the incomplete standard declaration-build evidence remain
outstanding; deployment remains fail-closed. No runtime or test source changes
are needed for this records-only closure, and valid selected evidence is reused.
