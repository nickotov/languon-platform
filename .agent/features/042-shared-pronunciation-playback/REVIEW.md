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
