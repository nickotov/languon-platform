# Learner web implementation and focused checks

Updated: 2026-10-22. Working-tree implementation; no commits made.

Implemented profile AI maximum-credit draft/save through existing versioned preference API, nullable uncalibrated budget handling, exact 0.001 validation using the shared contract, compact credit presentation with expandable exact values, and actor-scoped composer budget disclosure in both assistant layouts. Same-version conflict comparison shows both saved and draft budgets. Selecting a model does not raise the saved maximum.

Real optional `turn.billing` drives held/charged/released/free status and exact amounts separately from execution state. Estimated and unknown measurement remain explicit. Unknown never renders as zero. Legacy turns continue to show their existing usage with exact credit detail. Live assistant turns can disclose a held budget. Reconnect notice is tied to the existing transport reconnect flag and explains server-owned continuation and explicit Stop. Free interview notice follows backend `creditsBypass` and documents 30 admitted actions/account/UTC day including failures, one at a time.

Reused runtime Input, Popover, Button and existing semantic-token CSS. Extracted cohesive budget field, summary, turn usage and response actions to keep touched component/hook files below 250 lines. No sidebar redesign or generated design fidelity claim.

Checks:

- `pnpm --filter @languon/web exec vitest run tests/action-budget.test.ts tests/text-ai-preferences.test.tsx tests/text-ai-preferences-api.test.ts tests/text-ai-preferences-navigation.test.tsx`: 21 tests passed before final summary/billing additions.
- `pnpm --filter @languon/web exec vitest run tests/text-ai-preferences.test.tsx tests/conversation-durable-transport.test.ts`: 17 passed; reconnect transport behavior retained.
- `pnpm --filter @languon/web exec vitest run tests/tutor-usage-popover.test.tsx tests/tutor-conversation-composer.test.tsx tests/text-ai-preferences.test.tsx tests/action-budget.test.ts`: 14 passed with real billing-schema fields. Includes exact .001 charge, released technical failure, unknown measurement, profile precision/save/cancel and composer exact disclosure/account switch.
- Final `pnpm --filter @languon/web exec vitest run tests/tutor-usage-popover.test.tsx tests/tutor-published-knowledge.test.tsx tests/tutor-response-modes.test.tsx`: 15 passed after response-actions extraction.
- Web lint passed, then focused ESLint passed again on all affected files including final billing/response-actions components.
- Web typecheck passed before final billing extraction. Root must rebuild final contracts and rerun final affected typecheck.
- `git diff --check -- apps/web`: passed.

Missing evidence: real running application/browser integration. `curl --max-time 5 ... http://127.0.0.1:3333/en/profile` returned connection failure/HTTP000; root coordinates app fixtures and runtime. No rendered/browser verification claimed. Root owns guide traceability, complete evidence integration and final checks. No output-limit or affordability confirmation UI was fabricated without a backend data/confirmation contract.

## Follow-up: real quote and output-limit controls

Implemented after backend quote/output-limit contracts landed. Extracted admission mutation into `use-conversation-admission`: exact same frozen requestId/content/attachments/context across explicit quote retries, duplicate confirmation guard, fresh reduced quote requires another confirmation, and workspace accepted callbacks survive the confirmation round trip. Existing draft is retained on failure/cancellation and edits made while pending are not cleared. Top up opens the real existing profile credits page in a new tab to preserve the original composer.

`ActionBudgetConfirmation` uses existing Dialog/Button/ButtonLink, validated backend allowance/maximum/expiry, expandable exact amount, and explicit Send/Top up/Keep editing. No admission or regeneration occurs solely by showing the dialog. Real backend `turn.outputLimitReached` displays a response-limit notice; explicit Continue submits a new action with saved budget and no retryOf. No automatic continuation.

Follow-up focused lint passed. Focused suites (budget confirmation, preference retry, composer, workspace auto-send, usage) initially 15/16 passed; the added real API boundary test correctly exposed stale compiled contracts stripping `details.quote`. Source schema is correct; root notified to rebuild contracts before rerun. Root owns final types/runtime evidence. Existing larger orchestration files (`use-assistant-panel`, `assistant-panel`) remain established composition boundaries; change is bounded callback/modal wiring. Admission extraction reduces `use-conversation` from its former large body to 266 lines without broad unrelated changes.

Final quote follow-up rerun after compiled contracts refreshed: `pnpm --filter @languon/web exec vitest run tests/tutor-budget-confirmation.test.tsx tests/tutor-preference-retry.test.tsx tests/tutor-conversation-composer.test.tsx tests/workspace-tutor-auto-send.test.tsx tests/tutor-usage-popover.test.tsx tests/conversation-durable-transport.test.ts` — six files, 26 tests passed. Real API error-boundary quote preservation, frozen retries/new quote, duplicate confirm prevention and accepted callback continuity pass. Previous stale-artifact failure resolved by rebuilding contracts. Final affected ESLint and whitespace checks passed; final compilation/browser remains root integration responsibility.

## Guide and repeatable browser coverage authoring

Added draft `docs/user-flows/ai-accounting.md`, registered `ai-accounting` command, sequential `scripts/run-ai-accounting-e2e.mjs`, learner budget/quote/limit Playwright scenarios and an admin settings/manual-payment scenario within the existing real owner fixture. The learner fixture reuses synthetic reviewed rates/operator limits via `seedLegacyActionFixture` and the deterministic external provider reports `length` for the named output-limit input. No application module was mocked or edited for these tests. Existing source-chat browser helper explicitly clicks actual quote consent when required. Existing backend preference journey asserts exact20.125 save/reload. Portrait browser journey observes actual Free/quota copy; guides now identify defaultFree/adminpolicy rather than a production bypass environment flag.

- New learner Playwright `--list`: two tests discovered; new admin `--list --grep 'owner manages AI accounting'`: one discovered. Listing starts no servers or migrations.
- `pnpm docs:user-flows:check`: all16 validator tests and28 guide mappings passed.
- Mapping checks for ai-accounting, learner-portrait, contextual-language-assistant-and-knowledge and user-ai-model-preferences-backend updated to current source-reviewed revisions.
- Focused ESLint on authored tests/fixture/runner passed; `node --check scripts/run-ai-accounting-e2e.mjs` passed.
- Runtime pending root migration integration and exclusive execution window. Docker inspection (read-only escalation) shows none of the required learner55444/56444 or proposed admin55445/56445 targets currently running. Preserved existing dev, portrait and sidebar containers. No schema reset or E2E runtime started.

The new guide stays draft and uses epoch last_verified as an explicit never-executed sentinel until real mapped execution is recorded. Existing guides retain previous verification dates. Root owns final source/financial-policy review and final checks.
