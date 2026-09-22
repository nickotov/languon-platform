# Correction: Dictionary design prompt audio coverage

Status: Complete
Created: 2026-09-21
Updated: 2026-09-21

## Routing decision

Documentation correction describing an existing capability. All correction
conditions hold: no runtime, contract, data, security, dependency, deployment or
product-decision changes. Escalate if implementation or a new capability is needed.

## Context and scope

The prompt excluded the completed pronunciation feature. Update that prompt and
its source checklist using ADR-0020, feature records, current web controls and the
pronunciation user-flow guide. No executable guide or application changes, remote
design work or new product behavior are in scope.

## Acceptance criteria

- AC-1 — Portable prompt includes four saved-field playback controls, states,
  language/visibility rules, speed, capability limits and exclusions.
- AC-2 — Source links, coverage IDs and limitations reflect implemented audio
  without claiming live provider readiness or new runtime verification.

## Plan

- [x] Inspect prompt, audio control/controller, guide and ADR.
- [x] Update prompt and source checklist.
- [x] Validate links, formatting and final diff; record evidence.

## Verification and outcome

AC-1/AC-2 passed source comparison at base `2f8f6d2`. Python local-link
and UI-ID checks passed; Prettier formatting and `git diff --check` passed
for this documentation patch. The prompt now includes UI-11, source references,
state deliverables and explicit deployment/fixture limits. Author diff review
found no unrelated changes. Runtime tests, browser/database checks and independent
review are not required for this documentation-only correction: no product surface
or executable guide changed. Existing feature evidence is provenance only.

## Remaining risks

The external design-system reference and live provider activation remain existing
limitations. This update does not resolve or obscure them.
