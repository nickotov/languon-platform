# Backend quality audit follow-up

Status: Escalated

The improvement implementation and its focused verification are finished. The full audit remains open at the feature boundary and the transcription financial gate is red.

## Scope and acceptance

Implement the existing-contract product, persistence, type safety and development workflow improvements from the [audit](../../docs/backend-quality-audit.md). Preserve authorization, transaction scope, public response shapes and current speech wire codes. Feature-sized changes to security policy, migrations, dependencies, public contracts and worker settlement require separate feature authority under the root instructions.

## Verification plan

- Exercise workbook list batching against disposable PostgreSQL and verify ordered content and constant statement count.
- Exercise valid Unicode flashcard continuation and dictionary cursor range checks through the existing query and HTTP contracts.
- Run speech worker and route regressions for required dispatch and existing error behavior. Typecheck the backend and run the affected route suites for narrow auth dependencies.
- Exercise backend ESLint layer rules on allowed and denied imports, verify existing module lint, validate changed workflow packages and instructions.
- Estimate several minutes for static and focused unit checks and longer for Docker-backed proof. Record any missing evidence explicitly. Roll back individual changes by responsibility, keeping unrelated workspace work intact.

## Completed implementation and evidence

- P1. Fresh PostgreSQL 17 workbook suite passed all eight cases. The owner-scoped list used two SELECTs with no workbooks and four at 1, 100 and 500. The test checks membership order, share flags and owner isolation.
- L3. Conversation reference lookup now includes owned active folderless texts under existing chat authority. The new database visibility regression and existing reference submission case passed with a freshly migrated PostgreSQL fixture. The existing Knowledge workspace guide already documents owned-text selection.
- L5/L7. Owner and shared dictionary cursors now reject out-of-range sort keys before SQL. Flashcard continuations bind searches with a fixed-length fingerprint. Real PostgreSQL/Redis regressions and three mapped HTTP journeys passed. Existing flashcard pages opened before deployment require a fresh first page. Both affected guide mappings and the guide index check passed.
- D1/D5. Moved distinct refresh-entity assertions to the production store and removed the unused class. All 17 authentication repository tests passed on a fresh PostgreSQL 17 instance. Narrowed two HTTP route dependency types, removed double casts and added an expired-session mutation assertion. Both route suites passed (16 tests).
- D2/D4. Made dispatch authorization a required worker operation and replaced HTTP codes in domain/worker decisions with typed failure categories. The two HTTP handlers use one exhaustive status mapping. Static checks and focused tests cover denial before submission, HTTP 403 and 404 with the preserved public code, stored failure replay and retryable conditions.
- D3. Extracted speech deletion operations while preserving the facade and transaction ownership. The existing speech store still combines admission, dispatch and settlement. Apply the exact 2,012-line ESLint allowance to this file only as a ratchet for subsequent cohesive extractions. New persistence implementations are covered by the normal 500-line rule.
- P3. The accounting report scheduler drains serial claims with count and monotonic-time budgets. Five scheduler tests verify eight ranges over two simulated minutes, the bounds, errors and stop. Existing lease and query limits continue to govern individual claims.
- S3 (observability). Authentication event write failures produce a rate-limited count without event payloads. Ten auth-service tests passed including committed login/logout outcomes when recording fails. Deployed retention ownership and any necessary data deletion remain open.
- Agent tooling. Added architecture lint coverage with 14 positive/negative cases and checked 253 production files. Validated 27 skill packages and their 10 validator tests, two changed skill packages, TOML and formatting. Two fresh agents completed the workbook audit and remediation controls, distinguishing measured vs inferred evidence and scoping review to the appropriate snapshot. Context7 was pinned to the locally installed 4.8.0. A cached stdio initialization and tools/list returned both expected tools. Cold installs and transitive reproducibility remain unverified.
- L6. One configured deadline now bounds HTTP drain, stopping background work and closing resources. Repeated SIGTERM during stalled cleanup exits at the first deadline. Twelve selected tests passed, including child-process termination. Independent review confirmed the signal-listener repair. The deployment runbook documents the same existing grace budget.
- P2. Heartbeat checks source eligibility through a boolean projection of the existing fenced SQL authority. Dispatch still reads audio. A restricted-role PostgreSQL test verified valid, invalid-token and cancelled leases. This reduces bytes transferred to Node; database-side bytea work and production contention were not measured.
- P4. Bounded claim pages can rotate locally blocked work behind other due jobs without consuming attempts. The global capacity check, fencing, and accounting stay inside the existing transaction. Independent review confirmed the final ordering and guard behavior.

## Outstanding decisions and risk

- S1 (authentication concurrency), L1/L2 (publication, financial settlement and migration), S2 (production dependencies), L4 (public pagination) and the deletion side of S3 cross the improvement boundary. The user has been asked for explicit feature-flow authorization. Confirm ownership of any deployed retention job before proposing deletion. Snapshot P1 continues to retain the existing list cap.
- The report materialization query remains a profiling candidate. No production latency or heap savings are claimed. D3 has further admission/settlement decomposition opportunities.
- The speech regression gate surfaced six transcription settlement failures with the database reason “Expense has no typed feature provenance”. The same failure set appeared before the heartbeat change and on an independent freshly migrated instance. No assertions were weakened. Closure requires tracing the financial provenance through settlement and retaining real database evidence.
- Settlement failure diagnosis. Migration 0173 replaced the attempt guard and unconditionally calls the text-provider expense identity for updates to settled attempts. Migration 0125 had an audio-duration branch for the transcription expense identity. A forward repair must retain the later generation invariants as well as both meter paths. See [0173](../../apps/backend/drizzle/0173_composable-generation-authority.sql#L605) and [0125](../../apps/backend/drizzle/0125_knowledge_transcription_authority.sql#L1028).

## Final checks and review

- Registered speech execution on the combined patch: 208 passed, six failed, zero pending out of 214. Run ID `80ccbc95-f67e-4005-9c7b-d50f66532c8f`. Before the added heartbeat case the same six failed (207/213, run `81047896-3122-4a3a-a432-cc159ba3e290`). Dedicated real speech and restricted-role suites passed 35/35 and the final inventory selection passed both tests.
- The DDD and readability fixture suites passed. Changed source passed scoped ESLint, Prettier and diff checks; backend TypeScript typechecking passed. Independent source review covered SQL scopes/locking, dispatch, replay/public error distinctions, shutdown signal reentry, locally deferred queue ordering, logs and cursor identity. The repeated-SIGTERM review finding was fixed and retested in a child process.
- The registered Texts run on an earlier queue fixture had 33 passes and three failures. The revised fixture and both dictionary publication cases passed together in a fresh isolated run. The complete final selection is recorded below.
- Final Texts execution selection: both registered files, 36 tests passed, zero failed or skipped on fresh PostgreSQL 17 with no retries. Local readiness passed. The earlier wrapper result remains recorded separately.
- Backend production build, including declaration emission, passed. No production data, deployment, Git commit or push was involved.
