# E-WEB052 — learner and owner real-browser accounting journeys

Date: 2026-10-22. Base: d441863f55a8a53e9d712bf98f6805049a45ff4b plus captured working-tree hashes in `source.sha256`. No paid provider was called. This is proportional browser/accounting composition evidence, not full Feature052 completion or performance evidence.

## Final command and environment

Registered command: `node scripts/run-ai-accounting-e2e.mjs` (`ai-accounting`).

- Learner: confirmed exclusive PostgreSQL127.0.0.1:55444/database `languon_auth_assistant_web_test`; Redis127.0.0.1:56444/1, both `ALLOW_DISPOSABLE_*` gates true and exact target confirmations. Real deterministic fixture API4006, Next3336.
- Owner: separate PostgreSQL127.0.0.1:55445/database `languon_admin_e2e_test`; Redis127.0.0.1:56445/2. `ADMIN_E2E_ADMIN_ORIGIN=http://localhost:3015`, backend4015 and web3345. Existing development4000 was preserved.
- Containers created for this task: `languon-accounting052-learner-postgres`, `languon-accounting052-learner-redis`, `languon-accounting052-admin-postgres`, `languon-accounting052-admin-redis`. Synthetic local credentials only. Existing containers untouched.
- Both databases contain98 applied migrations, final timestamp1792687563355 corresponding to0097_accounting_speech_provider_costs. No schema reset was executed. Project migrations append normally.
- Browser: project Playwright Chromium/Desktop Chrome, default light theme. Learner1440×1000 and390×844; owner1280×720 and390×844. No UI/API/database mocks; only external paid model uses the deterministic provider boundary.

## Results

Final sequential run passed: learner2 tests/20.6s, owner1 test/22.2s.

- `learner-budget-persists-exactly`: exact20.125 saved under preference version, returned by API, retained after reload; compact20.13, expanded exact20.125; readable narrow form.
- `quoted-send-and-explicit-continuation`: synthetic60.125 budget funds conservative serialized context but requires reduced output allowance. Real409 quote appears before any canonical turn. Explicit Send preserves original request/content and adds confirmedQuoteId. Real provider length reason exposes response limit. Usage popover shows Completed separately from Charged and its exact backend amount. Continue is a new request with no retryOf; declining its quote leaves one admitted turn.
- `admin-budget-and-manual-payment`: owner publishes exact20.125 and provider limit1/10/100 USD, reloads; records external payment2.125 USD with0.025 fees and3.125 purchased credits. Actual response amounts asserted. One matching reference row persists after reload. Asynchronous Current report appears within60s.

Page exceptions and unexpected console/request errors fail the tests. Only normal initial auth refresh401, explicit quote409 and the documented cold report preparation503 are allowed. Report success is required, so transient503 allowance does not conceal a broken worker. The backend separately logged a sanitized maintenance-deferred warning; root owns diagnosis of that maintenance path. It did not prevent the report worker or any mapped scenario from succeeding.

## Observed remediation

Initial real execution exposed test refresh-token tracking and missing portrait routes in the dedicated fixture; both were corrected using real session updates and real portrait module/routes. A20.125 action budget was smaller than conservative paid input bound, so quote fixture uses60.125 while profile precision example remains20.125.

The owner scenario exposed duplicate Ant Design form IDs: modal Reason label targeted the settings form instead of its own textarea. Unique form names fixed the actual accessible-label association. Screenshot review also found decimal USD strings wrapping across lines; owned report CSS now preserves numeric strings on one line. Both fixes are included in the final passing run.

Quote copy now attributes reduced output to credit/execution limits rather than incorrectly claiming an exhausted balance. Its focused regression4/4 passed. Focused owner accounting/settings12/12 passed; final affected ESLint and whitespace checks passed. Root owns final compilation and independent review.

## Artifacts and cleanup

Inspected final screenshots retained beside this file:

- `budget-profile-narrow.png`
- `quote-confirmation-wide.png`
- `accounting-record-wide.png`
- `accounting-settings-narrow.png`

Only synthetic data is present. Authentication-bearing traces remain in ignored application test output; they are not copied into durable evidence. Runners stopped their own application processes and restored Next type-generation bytes. Owned test containers are retained for root's remaining integration checks; stop/remove only these named resources when no longer needed.

Existing related guide revisions were actualized; this three-scenario run does not claim execution of every older dictionary/sentence/text/portrait mapped journey. Those need their own existing valid evidence or a proportional rerun after relevant changes.
