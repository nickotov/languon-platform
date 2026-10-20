# Improvement: Docked tutor half-width option

Status: Complete
Created: 2026-10-20
Updated: 2026-10-20

## Routing decision

- Intended outcome: let a learner set an attached desktop tutor to half of the available workspace width from its existing header menu.
- This is a focused existing-contract layout enhancement across the shared slot and tutor menu, broader than a one-surface correction.
- The user did not request the feature lifecycle. No endpoint, persistence, security policy, dependency, deployment, migration, or new journey is needed.
- If discovery crosses a feature boundary, preserve this record and request explicit authorization.

## Context and scope

- Current behavior: the attached slot is `min(400px, 38%)` plus its existing margins; detached tutor has independent fixed/reading widths.
- Expected behavior: an attached desktop menu checkbox gives the source and tutor equal visible widths within the available workspace, allowing for existing margins, and toggling it restores the current width. Detached and mobile geometry remain independent. The choice lasts while the layout is mounted.
- In scope: shared companion slot/context, tutor menu copy and controls, component story, and existing mapped browser journey/guide.
- Out of scope: user preference persistence, resize dragging, backend or model changes.
- Likely files: `companion-layout`, `tutor-header`, `shell-copy`, contextual assistant E2E and guide.
- Constraints: ADR-0016 browser evidence; ADR-0029 CSS Modules/tokens; existing right-side slot and detached semantics.
- Guide: `docs/user-flows/contextual-language-assistant-and-knowledge.md`.
- Rollback: remove the menu toggle and the half-width slot variant.

## Acceptance criteria

- AC-1 — On desktop while attached, the tutor settings menu offers a checked 50% width option. Selecting it gives source and tutor equal visible widths within the available companion layout; selecting it again restores the default width.
- AC-2 — Detaching keeps detached sizing/placement, reattaching restores the selected attached width, and mobile sheet layout is unchanged.

## Plan

- [x] Implement the focused improvement.
- [x] Extend the existing rendered story and mapped browser journey with meaningful width/state assertions.
- [x] Run affected checks and synchronize the guide.
- [x] Inspect the final diff, record evidence and close.

## Verification

| Check                              | Result                                                    |
| ---------------------------------- | --------------------------------------------------------- |
| Mapped browser E2E                 | Guarded backend 4/4; Playwright 10/10, exit 0             |
| Web tests / lint / typecheck/build | Vitest 761/761; root lint, web typecheck and build passed |
| Guide and mapping checks           | Both checks passed; guide last verified 2026-10-20        |
| Final diff                         | Focused and clean; independent remediation review passed  |

## Outcome and evidence

- Changes made: the shared CompanionLayout holds a local half-width choice and applies a CSS slot width that accounts for its existing side margins, so source and tutor have equal visible widths. The attached desktop tutor menu exposes a checked localized toggle. Detached geometry and mobile sheet styling are unaffected; reattaching keeps the selected split.
- Browser: the mapped `source-chat-save-knowledge` Playwright journey on Desktop Chrome at 1440×1000 compared visible source and tutor widths within 3px and checked layout fit, menu state, detach/reattach split retention and restoration of the original width within 2px. The final guarded post-remediation run exited 0: backend 4/4 and Playwright 10/10. Screenshot: `apps/web/.next/playwright/contextual-assistant-results/assistant-mvg9mda6/contextual-assistant.journ-1ab0e-e-note-and-revision-history/tutor-attached-half-width-desktop.png` (ignored test artifact). Visual inspection showed equal visible panes with unobscured controls. The journey asserts no browser console errors or unexpected 5xx responses; the suite also covered mobile and Knowledge workspace regressions.
- Commands: `pnpm --filter @languon/web typecheck`, `pnpm lint`, `pnpm --filter @languon/web test` (761/761), `pnpm --filter @languon/web build`, `pnpm docs:user-flows:check`, `pnpm user-flow:e2e -- check contextual-language-assistant-and-knowledge`, `pnpm diagrams:check`, and guarded `pnpm test:e2e:contextual-assistant` with the guide's confirmed disposable PostgreSQL/Redis environment all passed. An initial guarded attempt was blocked by sandbox loopback `EPERM`; the authorized rerun exited 0. The E2E wrapper restored `next-env.d.ts`; the subsequent build generated it again and it was restored to tracked source.
- Documentation: updated the existing contextual-assistant guide and both declared test-file revision markers to `sha256:5abc3a32cd783f72` without adding a journey.
- Review: bounded independent shared-UI review found the initial margin calculation made the tutor narrower than the source (R-1, medium). CSS and browser assertion were remediated; final independent remediation verdict **Pass**, with no unresolved material findings. The reviewer checked detached/mobile geometry, accessibility, localization and FSD/ADR-0029 compliance. Final web build passed and generated `next-env.d.ts` was restored.

## Remaining risks

- None known.
