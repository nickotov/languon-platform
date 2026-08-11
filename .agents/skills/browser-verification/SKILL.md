---
name: browser-verification
description: Verify Languon web or admin behavior in a real browser, including critical journeys, responsive layouts, loading/error states, accessibility basics, console errors, and failed network requests. Use for user-visible Next.js changes, E2E acceptance evidence, or regression reproduction in the running application. Do not use as a substitute for automated tests or for native-only mobile verification.
---

# Browser verification

## Prepare

Read the feature acceptance criteria and identify the smallest set of journeys,
roles, data states, and viewports needed. Start the relevant infrastructure and
application with documented commands. Use deterministic non-production test data
and never enter real credentials or personal data.

## Verify

Use the available browser automation or computer-use capability to exercise the
running app as a user:

1. Verify the primary happy path from a clean starting state.
2. Verify applicable loading, empty, validation, permission, failure, retry, and
   persistence behavior.
3. Check keyboard navigation, focus visibility, labels, headings, and obvious
   contrast issues.
4. Check affected narrow and wide viewports.
5. Inspect console errors and failed or unexpected network requests.
6. Refresh or revisit when persistence is part of the acceptance criteria.

Capture screenshots or recordings only when they add useful review evidence.
Do not claim a journey passed from source inspection alone.

## Report

Record environment, browser, viewport, exact scenario, observed result,
console/network state, and artifact paths in `EVIDENCE.md`. For failures, include
reproduction steps and the narrowest supporting evidence. If browser tooling or
the required environment is unavailable, complete all safe automated checks and
record the exact unresolved gap instead of silently downgrading verification.
