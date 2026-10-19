# Improvement: Contextual tutor widget entry and presentation

Status: Complete
Created: 2026-10-19
Updated: 2026-10-19

## Routing decision

Focused enhancement to the existing contextual Tutor UI. It changes the entry
point, panel default geometry and disclosure presentation within an established
chat journey. No new endpoint, persistence, permission, production dependency,
model behavior or external design version. User-directed changes to the selected
Magic Patterns implementation supersede that reference where they differ.

## Context and acceptance

The selected v001 design and [completed implementation record](./contextual-assistant-widget-design.md)
provide the current behavior. The new request requires:

1. Header controls align vertically; shared menu trigger size and SVG are centered.
2. Composer preference row keeps horizontal scrolling while hiding its scrollbar.
3. Tutor opens at the full available height by default.
4. Tutor panel has a visible, restrained shadow.
5. Clicking the usage/credits disclosure in an answer opens its content in a
   popover above the trigger, with keyboard dismissal and retained real usage.
6. A folded Tutor pill is visible by default at the lower right of the source
   content area; the separate “Ask about this” launch button is removed.
7. Opening the Tutor from the pill animates; reduced-motion preference is honored.

The initial pill is a dormant launcher. Conversation list/detail/SSE transport
starts on first open, then the panel remains mounted when folded. This preserves
ordinary source-page loading cost and the existing chat continuity contract.

Apply to signed-in owned/shared dictionary, text and Knowledge pages. Existing
authorization, conversation lifecycle, page selection, note editing and mobile
sheet behavior remain governed by feature044. Source snapshots under the design
handoff are immutable; these are user-directed implementation adjustments.

## Plan

- [x] Implement launcher, shell layout, alignment, scrolling and animation.
- [x] Implement usage popover and focused component coverage.
- [x] Update mapped user-flow guide/E2E where changed.
- [x] Run affected static, browser and mapped checks; inspect final diff.
- [x] Record independent review decision and close.

## Verification

Focused menu and usage disclosure tests pass (10 tests across 2 files). Web
typecheck, full ESLint, styling guard, changed-code formatting and production
build pass. Guide revision `sha256:000df4294d8e574b` and mapped test changes
are synchronized; `pnpm docs:user-flows:check` and the selected
`pnpm user-flow:e2e -- check` pass.

Author preflight found the initial always-mounted panel would query and connect
to the chat transport while folded. Independent review confirmed the cost and
found first-open keyboard focus loss after introducing a dormant launcher.
Both issues are fixed: the pill mounts without conversation hooks and the new
panel receives focus once on first open. The final deterministic mapped run
`AUTH_E2E_RUN_ID=tutor-polish-keyboard-reviewed` passed 2 API and 3 real
Chromium browser journeys in 44.5 seconds against task-owned disposable
PostgreSQL/Redis and local backend/web. It proved zero conversation requests
before initial keyboard activation, list after activation, focus inside the
panel, full-height desktop/mobile, source interaction and retained fold state,
usage popover, animation and reduced-motion suppression. No paid model calls.
The browser tests also inspect unexpected page/console/network errors. The
[21 durable screenshots](./contextual-tutor-widget-polish-evidence/) include
initial pill at 1440/390, full desktop/mobile, menu, note editor and usage.

Independent incremental review against the preceding v001 implementation:
Pass, no open material findings. TP-1 (eager chat list/detail/SSE on browsing)
and TP-2 (lost focus on first keyboard open) were remediated and re-reviewed.
The final 14-path [tested-file manifest](./contextual-tutor-widget-polish-evidence/tested-files.sha256)
has SHA-256 `88806efe2cc20f2040b65535de40e8b72cb126d38ba75269bfa5ccf45ed48de2`.
The generated `apps/web/next-env.d.ts` was restored to exact pre-work HEAD
bytes after build. Final diff whitespace and Git status were inspected; no
commit, merge or push was performed. Task-owned containers/test servers were
removed; ordinary development services remain intact.

The web checks use Chromium viewports and pointer gestures. Physical touch and
an operating-system virtual keyboard were not tested for this polish.

## Rollback

Revert this improvement's scoped web and guide/test edits; no data migration.
