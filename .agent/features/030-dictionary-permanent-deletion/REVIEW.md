# Review: Dictionary Permanent Deletion

Reviewed: 2026-09-26
Reviewers: independent completion reviewer and security reviewer
Verdict: Approved

## Review boundary

- Base: `main` at `ff3d1b0c602e561e62c5234e6477b0ca48f5f54c`.
- Initial completion review covered the full Feature 030 specification, ADR-0023, tracked patch and untracked files, backend transaction paths, frontend state/cache behavior, migration and tests.
- Final bounded completion re-review covered the remediated tracked patch (reviewer SHA-256 `1019d3ba4087b092e2968bc7172c237b32ba90d91c7c74078e68a342a62d2878`) and untracked manifest/content (SHA-256 `3bb5e303bb8f3ab49c9f09882c56e1cb6862e7d09ba68819ce3fb758403eb7f7`), followed by the final test-only evidence expansion.
- Security review covered authorization, recent authentication, tenant isolation, advisory/row locking, retained content, document/audio object safety, provider/credit accounting, SQL and destructive-operation behavior.
- Separate tester created and remediated the mapped Playwright journeys. Evidence IDs E-1 through E-7 were inputs to the final verdict.

## Completion-review findings

### R-1 — Retained generation jobs became unreadable

- Severity: High.
- Location: deletion-store retained-job scrubbing and generation-store job mapping.
- Problem: storing `inputPayload = {}` failed the job input schema during later reads/replays.
- Disposition: Fixed. Retained related jobs now store SQL `NULL`; disposable PostgreSQL reads the retained job through `DrizzleDictionaryGenerationStore`.
- Evidence: E-3.

### R-2 — Deletion and generation acceptance had opposite lock order

- Severity: High.
- Location: deletion store versus generation admission/acceptance transactions.
- Problem: dictionary-before-job locking could deadlock with admission/job-before-dictionary locking.
- Disposition: Fixed. Deletion takes generation admission, then owner, then target rows. The final barrier test holds admission, starts deletion, independently locks owner and dictionary rows, then releases admission and observes completion.
- Evidence: E-3.

### R-3 — Deleted dictionary detail caches remained fresh

- Severity: Medium.
- Location: dictionary-library deletion success handling.
- Problem: only the library list was invalidated, so cached former detail/card/job content could render without a server read.
- Disposition: Fixed. Selected deletion removes exact affected dictionary cache families; all-archived clears all affected detail/card/generation families. Prepopulated-cache tests preserve unrelated selected-delete caches.
- Evidence: E-4.

### R-4 — Empty archive views exposed destructive controls

- Severity: Medium.
- Location: archived dictionary/card bulk toolbars.
- Problem: delete-all stayed enabled at zero and `every([])` made an empty card selection appear checked.
- Disposition: Fixed. Both toolbars require nonempty eligible rows and empty-state tests verify the controls are absent.
- Evidence: E-4.

### R-5 — Destructive transaction evidence overclaimed coverage

- Severity: High initially, reduced to two Medium evidence gaps after first remediation.
- Location: disposable repository tests, stale-conflict E2E and EVIDENCE.md.
- Problem: initial tests did not directly prove busy rollback, cleanup fencing, usage/credit retention, fork/share behavior, lock ordering or fresh server state after stale conflict.
- Disposition: Fixed. The 35-test disposable deletion/account-purge selection now directly covers admission-before-row locking, generation/document/audio busy rollback, provider-usage transfer and effective budget retention, credit preservation, audio cleanup handoff, fork/share behavior, mixed-target atomicity and readable redaction. The E2E verifies stale-conflict state from a fresh page.
- Evidence: E-3 and E-5.

## Security-review findings

### S-1 — Permanent deletion lacked recent authentication

- Severity: Medium.
- Problem: a stolen two-day access token could invoke irreversible deletion while browser confirmations are bypassable.
- Disposition: Fixed. Both delete commands require the authenticated session to be recent and fail closed if the capability is absent. Production composition wires the existing authentication service, transport maps stable HTTP 403 `recent_authentication_required`, and the web shows established sign-in-again copy.
- Evidence: E-1, E-2 and E-4.

### S-2 — Deletion could hold the global pronunciation lock

- Severity: Medium.
- Problem: invalid selected deletion on a large archive could delay unrelated tenants' TTS admission and cleanup.
- Disposition: Fixed. Deletion no longer takes the audio global/owner advisory lock, selected SQL is restricted to requested IDs, receipt cleanup is scoped to the current owner/kind/key, and the global provider archive cleanup was removed from this path. A PostgreSQL barrier proves the global audio lock does not block deletion.
- Evidence: E-3.

## Completion audit

- AC-1 through AC-14 are mapped to implementation and valid evidence in `EVIDENCE.md`.
- Contracts, migration, application, persistence, web, E2E, real-browser, docs and build checks pass.
- Independent completion and security re-reviews report no remaining material findings.
- User-flow guides and revision markers are synchronized.
- Final diff checks and focused formatting pass; no secret, conflict, generated runtime output or unrelated refactor is included.

## Final verdict and residual boundaries

Approved with no material findings.

Residual boundaries:

- Physical audio-object deletion is asynchronous and depends on the existing retrying cleanup worker.
- Provider retention, database backups and copies already delivered to clients remain outside synchronous deletion.
- The safe browser wrapper does not expose a stable browser-zoom control; the dialog passed at the required equivalent 320 CSS-pixel viewport with its full box and actions contained.
- Large valid all-archived deletion temporarily holds generation admission for atomic provider-budget accounting; selected adversarial requests are bounded and indexed.
