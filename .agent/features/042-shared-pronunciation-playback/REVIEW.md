# Review: Shared pronunciation playback and model pricing

Updated: 2026-10-14. Author preflight, independent completion/security review, runtime verification and guide traceability complete.

## Scope and reviewers

Source visibility/authentication, provider/private storage, accounting/tariffs, worker/migration/release fencing, web/admin playback/removal, retention and least privilege. Separate tester assessed the concurrency harness and added five real-database source authorization cases plus HTTP tests. Read-only security reviewer completed initial and final remediation inspection; no open material security finding.

## Security findings and repairs

| ID/severity | Problem and location                                         | Repair/proof                                                                                                                                                  |
| ----------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-1 High    | Shared bearer keys persisted in speech sources               | Trusted resolver stores keyed digest; DB rejects/scrubs raw keys; shared prepare/status/bytes/revocation PG proof E-2.                                        |
| S-2 High    | Wrong production job table in grants                         | Correct speech_jobs; exact script SET ROLE probes E-6.                                                                                                        |
| S-3 Medium  | Admin deletion missing mandatory Origin                      | Enforce expected Origin before mutation; HTTP guard tests.                                                                                                    |
| S-4 Medium  | Incomplete runtime/version/rotation wiring                   | API/worker/price admission gates, production retained-key validation, two-phase rotation; E-1/6. Mixed-key and retained-key deletion-race PG tests pass, E-2. |
| S-5 High    | Temporary failed/unknown text retained indefinitely          | Immediate definite-failure scrub,24h unknown plaintext scrub retaining opaque tombstone, durable cyclic cleanup; E-2.                                         |
| S-6 Medium  | Storage outage delayed admin text erasure                    | Transactional immediate scrub; retry object cleanup; E-2.                                                                                                     |
| S-7 Medium  | Caller clock could permit late charge                        | DB-authored deadlines/publication and SQL settlement/lease guards; E-2.                                                                                       |
| S-8 Medium  | Worker could mutate ready/immutable data                     | Column grants plus DB identity/version fences; E-6.                                                                                                           |
| S-10 Medium | Retained-key bind could race admin impact-confirmed deletion | Lock recording before binding/admissible-state check; concurrent real-PG race passes, E-2.                                                                    |
| S-9 Medium  | Price worker trigger also blocked cancellation               | Fence acquisition only; compatible store markers; account regressions25 passed E-2.                                                                           |

Final read-only security review confirms S-1 through S-10 fixed and no open Critical/High/Medium exploitable defect. Reviewer checked final code, test assertions, role/MinIO evidence and retention/rotation boundaries.

## Independent completion findings

Reviewer speech_completion_review assessed the complete cross-application diff after author source preflight. Batched findings:

- **R-1 Medium:** dictionary-field sources lacked the dictionary/settings revision, allowing stale example roles/languages to resolve different text. Public expectedDictionaryVersion and exact visible-card expectedSettingsVersion fence dictionary and independently loaded owner-card settings revisions; shared public snapshots are atomic. Actual owner/shared resolver-to-service-to-HTTP PostgreSQL regression rejects settings-role/enable changes with409 before admission. Remediated; reviewer confirms code correct, affected checks passed.
- **R-2 Medium:** Unicode vertical separators collapsed into spaces. Normalize CRLF/CR/NEL/LS/PS/vertical-tab/form-feed to LF first; preserve repeated breaks, then normalize horizontal whitespace. Six policy tests prove newline equivalence and separation from spaces. Normalization revision stays1 because shared speech is unactivated and only disposable data exists; legacy identity verification remains separate. Remediated; reviewer confirms code correct, affected checks passed.
- **R-3 Medium:** legacy uncertain tasks with identical canonical text could merge or disappear behind ready cache entries. Fail-closed preflight and transactional identity guards reject distinct uncertain tasks/profiles and ready collisions. All eight migration PG cases pass; operator reconciliation precedes cutover. Reviewer confirms code correct.
- **R-4 Low:** normal source disappearance/visibility races produced500. Resolver now throws typed404/403/409 speech errors; actual resolver/service/route PG tests verify archived-card404 and hidden-reference403, with no admission. Remediated; reviewer confirms code correct, affected checks passed.

### Final uncertain-task identity repair

- **R-5 Medium (fixed and confirmed):** active shared and legacy jobs are separate namespaces. Matching internal job UUIDs did not prove matching provider task IDs because one collision branch skipped comparison for equal IDs. Require provider task equivalence regardless of internal UUID, preserve strict profile/state and null-uncertainty checks, and add a pre-seeded equal-UUID/different-task PG regression. All eight migration PG cases pass; final typecheck/lint pass. Post-insert fallback also checks profile/task equivalence.
- Recurring-findings diagnosis: the migration mixed internal row identity, idempotent replay, and upstream task identity. The next repair audits every preflight and transactional branch against one provider-task/profile identity invariant rather than adding another isolated exception. This is a bounded migration correction; no new schema or trust boundary is introduced. Final review is focused on the repaired invariants and evidence.

## Accepted residual

Authenticated users can infer whether exact normalized text/language already has ready or in-flight audio by submitting identical content they can access and observing free/immediate reuse versus a miss. This is inherent in approved global cross-user reuse, including private text; FEATURE.md explicitly records it. Original source, owner, payer, canonical key and object URL are never revealed. Accepted ADR-0031 stays immutable and links the specification. Successful text may itself contain personal information and remains retained after content/account deletion as approved.

## Final verdict

**Complete — no open material findings.** Independent reviewer speech_completion_review performed initial full-scope review and focused remediation review of R-1–R-5 and pricing compatibility. Security reviewer independently confirmed S-1–S-10 repairs and no open Critical/High/Medium security defect. Separate tester assessed concurrency/source-authority coverage.

Reviewed base:35534de273975275c8403f0a52ae556bb2c87872. Captured tracked plus97 untracked files: SHA-256 f4d0263ecc401b7b077c1505c5ba232766e29d0ea3a106be0fab60dae74d846a (322302 tracked-diff bytes). Final documentation-only status/cleanup edits are outside that capture; implementation unchanged. Whitespace clean, no conflicts, generated next-env unchanged.

Evidence accepted:856 backend unit tests and final lint/typecheck/ESM+DTS build;88 real-PG cases including migration8/source7/concurrency/accounting/purge; real MinIO and exact production-role proof; all563 web cases have passing executions (latest full562/563 timeout, unchanged file isolated4/4), final build then typecheck/lint; admin43;14 unique actual browser journeys; docs16/21 mappings, deployment78/rotation15 and styling/FSD checks. See EVIDENCE.md for limitations and exact chronology.

Live Kie/Selectel connectivity, voices/language quality, commercial terms/pricing/caching and production IAM remain activation gates. Accepted retention/cache-membership and complete retained-key assumptions remain explicit. New direct migration/E2E scripts stay unreviewed/disabled in the dev-panel catalog alongside baseline drift; no full pnpm check success is claimed. These do not block local feature completion.

## Migration repair review (2026-10-14)

Reactivated authorized feature repair on `feature/shared-pronunciation-migration-repair`,
base `b7b5cb636ae2b91eb126d45bb3e6fbd8cf0c3d16`. Author preflight and independent
completion/security reviews passed; no open material findings. The read-only
completion reviewer captured the implementation/test patch SHA-256
`fa9ec386a6d7b1a985d23679df1bc787d4bbde66030e571ee33a61e7e879c1df`.
Subsequent status/evidence/verdict edits only; no source or test changes.

- MR-1 Medium: document the enum precommit exception to migration atomicity.
  Resolved by accepted ADR-0033 and development/ADR relationship links.
- MR-2 Medium: reject duplicate bare additions to an existing enum before any
  mutation. Explicitly authored IF NOT EXISTS repeats preserve their intent.
  Resolved by decoded-label/OID duplicate preflight and real PostgreSQL regression.
- MR-3 Medium: prevent changed pending SQL from certifying wrong enum order,
  including shared BEFORE/AFTER anchors and partial failed-run residue.
  Resolved by full per-type replay, compatible initial projection, and exact final
  catalog comparison before Drizzle/history execution. Full/partial retry proofs pass.
- Two initial security findings, order drift and overly broad statement rewriting,
  are resolved. Only exact precommitted additions are rewritten; fresh duplicate
  additions retain PostgreSQL rollback/errors. An intermediate parser capture-index
  regression was caught by unit/review checks and fixed before final verification.

Separate bounded test worker reproduced the original 55P04 and verified the final
16-case PostgreSQL suite; package unit/static/build and backend static/build checks
passed. Actual local development migration and final idempotent retry succeeded
without reset or private-data inspection. Final focused security reviewer reports
no open critical/high/medium findings. No production or paid provider was used.
Residual: a failed ordinary migration can leave unused additive enum labels;
ordinary schema/data/history roll back. ADR-0033 documents the explicit tradeoff.

## Playback controls repair review (2026-10-14)

Author preflight and independent completion/security reviews passed on
`feature/shared-pronunciation-controls-repair`, base `1976e30`. Completion review
captured tracked patch SHA-256
`73391e0f9b4a1d2a34e98914a916833fd0bbc09e9fbd0ca9644b806af3aec3b2`
and new speech-control unit SHA-256
`4fddf465c7eaba157dcea7899e6334080dacb2803f31b3c990dc70f26d2873e1`.
Subsequent changes are final state/evidence/verdict documentation only.

- CR-1 Low: guide still claimed all four card fields played. Fixed description
  while preserving stable scenario ID; source/translation-only assertions and
  final guide revision are synchronized. No open material implementation findings.
- Controls use shared Tooltip and icon-only Button contracts with accessible
  labels, hidden live announcements, spinner, stop and retry behavior. Owner and
  authenticated shared reader examples remain text without audio controls.
- New fixture/live identity domains, retained-secret legacy aliases and immutable
  recording-profile filters correctly separate ready and active caches. Live
  providers still share pronunciation identity; source authorization and billing
  remain unchanged. Reviewer verified 30 real PostgreSQL cases/seven policy units,
  six real Chromium journeys and web/backend static/unit/build evidence in E-8.
- Security review reports no open Critical/High/Medium finding. SQL remains
  parameterized; untrusted text stays React-rendered. Ignored credentials are not
  in diff. Existing exact-host/public-DNS-pinned/HTTPS/bounded MP3 download guard
  remains intact. Pause/restart instructions address older/newer writer overlap.

Manual live probe disclosure: the first public `alarmer` task was accepted, but a
probe-only response-discriminant bug lost its identity before download. Automatic
approval review rejected another paid submission until the user explicitly granted
one further sample. The approved tracked task failed upstream with Kie error 500;
no result URL/audio and no further paid submission. The correctly typed app maps
this to `SpeechTaskFailedError`, releases/fails work and never replays a fixture
as pronunciation. Review update found no new defect. Successful live synthesis,
pronunciation quality and result-host exercise remain external activation gates;
production Selectel/IAM and commercial/retention gates are unchanged.

## Provider failure and API-prefix repair review (2026-10-14)

Initial independent completion and security review from base `b9de213`, followed
by focused remediation of FPR-1. Final source/test boundary captured tracked binary
diff SHA-256 `4d2b60b30c61455d7843e3338ba61e7443fd5ec196052bb6b359091dc56c3ed5`
plus new API resolver/proxy/client tests. Later edits only finalize durable records.
No open material implementation or Critical/High/Medium security findings.

- FPR-1 Medium: Docker development and authentication guide still supplied the
  old direct backend browser URL. Fixed Compose `/api` plus exact trusted internal
  `http://backend:4000`, tightly scoped proxy validation/tests, guide settings and
  auth revision marker. Effective Compose metadata and final guide checks passed.
- Root cause verified without paid generation: existing task was accepted then
  failed upstream with Kie500. Its request/voice/language match the official
  contract. Failed inventory cleanup had erased safe error/billing response;
  PostgreSQL regressions reproduced that exact result then passed after repair.
- Actor/request scope, fresh source authorization, joining billing privacy, failed
  reservation release/text scrub and unknown-submission fences remain intact.
  Typed/validated provider codes map to bounded internal reasons. Raw failure
  messages, prompts, task/result identifiers and URLs never enter learner status.
- All web clients share same-origin `/api`; production NGINX strategy/internal
  backend paths unchanged. Proxy origins are trusted operator configuration,
  development-only and restricted to loopback or exact Compose backend4000.
  Credential/path/query/hash/other-host rejection, cookies/Origin/auth/private
  bytes and bounded downloads remain covered. Node config check runs in normal
  web unit script. Independent reviewers verified web576+Node and accepted backend
  74/74, auth/speech Chromium and affected static/build/documentation evidence.

Additional CSV exploration stopped at an unchanged unrelated import-dialog narrow
layout assertion before export; no success claim or assertion weakening. Review
accepted this as nonblocking for actual auth7/speech4 proxy/body/binary evidence.
Live Kie success/quality/result-host exercise remains an external gate; no new
paid request was made. Explicit API URL overrides remain trusted deployment config,
and speech_jobs.error is DB text with fixed safe repository writers. Existing
shared exact-text cache-membership inference/production activation gates unchanged.
