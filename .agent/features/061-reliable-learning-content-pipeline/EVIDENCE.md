# Evidence: Reliable learning-content tools and context pipeline

Status: Implementation verified; main integration authorized; user key rotation pending

Baseline: main at `89ff4193`, plus the feature 061 work in progress. Feature 060's
reviewed 251-case artifact is historical evidence of that delivery, not proof of
this feature's changed 64K and memory lifecycle. No paid provider dispatch has
been performed for this feature.

## Acceptance evidence map

| Acceptance | Final implementation evidence and retained limitation                                                                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-1       | Root/package pre-release direct-contract instructions and scoped static checks pass.                                                                                                                                                                                     |
| AC-2       | Registry, four dedicated tools and shared atomic publication pass the final registered native selection.                                                                                                                                                                 |
| AC-3       | Phase envelopes, exact nested serialization, pre-admission rejection and rich-draft follow-up pass native/browser checks.                                                                                                                                                |
| AC-4       | Prepared-memory, canonical persistence guards, S3 safe metadata allowlisting/merge and sentinel persistence regressions pass. Local unsafe configuration was scrubbed.                                                                                                   |
| AC-5       | Historical receipts and exact authorized source behavior pass the final registered native selection and source/security review.                                                                                                                                          |
| AC-6       | Canonical version 2 bodies and current revision/copy/prose behavior pass native/browser checks.                                                                                                                                                                          |
| AC-7       | Browser assertions prove one POST, one proposal GET, no detail/workspace GET during the measured follow-up send.                                                                                                                                                         |
| AC-8       | Selected real-browser journeys and final post-S3 registered native selection pass without skips/retries.                                                                                                                                                                 |
| AC-9       | Guides/mappings, affected static/build checks and independent source/data/native evidence review pass. S3 operational High closure still requires provider-key rotation/revocation or explicit user acceptance. Readiness and unavailable live proof are separate below. |

The final [source identity manifest](evidence/source-state.json) records the exact
handoff source state. Root owns manifest generation. No completion or main merge
is approved while the operational S3 disposition is outstanding.

## Authorized local development cleanup

The user explicitly authorized retiring obsolete local user content. The target
was verified as the loopback database `languon_ai_accounting_dev_20261023`:
five obsolete notes, four branches, five revisions, zero drafts and zero active
turns. Each note was deleted through the normal `DrizzleKnowledgeStore.delete`
lifecycle using its owner and version, including `conversationDeletionBusy`
checks before and inside deletion, source-content erasure, related sentence and
translation job handling, and deletion receipts.

Five obsolete notes were deleted; one current note remained, and the obsolete
note count was zero. Post-cleanup checks found zero old active turns, zero old
active holds, zero unsettled provider-call records, and zero obsolete Knowledge
branches, revisions or drafts. Accounting records and unrelated configuration
were preserved. No direct ledger deletion or global database/cache reset occurred.
No raw learner content or credentials were logged. An initial module-resolution
failure occurred before any database operation; dependency resolution was then
corrected before the deletion ran.

## Browser execution

Real Playwright Chromium used an isolated assistant stack: PostgreSQL port 55488,
Redis port 56488/database 1, web port 3336 and backend port 4006. Deterministic
external HTTP model transport exercised the actual production 64,000-token
composition. This is application/browser proof, not live-provider intent proof.
There were no unexpected console/page errors or 5xx responses; the oversized
reference rejection deliberately returned HTTP 400.

| Run                                    | Result and scope                                                                                                                                                                                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `228254b0-d0b3-4d7d-9ff2-fb748705e0eb` | Four selected flows passed in 161.79 seconds. Mixed/prose cases are retained evidence and were unaffected by subsequent targeted repairs.                                                                                                                                             |
| `20c6482f-b566-48b6-9c01-1f14e10d9ffb` | Final rich 50-entry Review/Apply/Save/reload → 10-entry journey passed: 12.4-second test, 27.957 seconds total. During the measured follow-up send: exactly one POST and one proposal GET, zero conversation-detail GETs and zero workspace GETs. Initial 50 entries remained intact. |
| `4939146f-3470-42c2-9e3f-673ea542ada4` | Final revision/copy desktop/mobile and reference-context cases passed: 30.5- and 16.2-second tests, 74.448 seconds total. Reference rejection retained composer/copies; removing copies/focus permitted success.                                                                      |

Artifacts remain under `test-results/critical-flows/<run-id>/`. Screenshots at
1440×1000 and 390×844 were inspected. The approved minimal footer notice
`min-width` repair resolves existing vertical wrapping. Owned containers were
cleaned and tracked `next-env` output was restored. Subsequent guide revision
marker updates acknowledge reviewed behavior and do not alter those test bodies.

## Final registered native gate

Run `31c235ac-356b-45ff-9992-77d9e965f3dd` passed 308/308 tests across 24 files with
zero skips or retries: 84.60 seconds test time, 91.115 seconds total. This is the
post-S3 registered result. The store suite has 55 tests, including two S1 and one
S3 regression; all eight required memory cases are present. Critical registry
tests pass 23/23, with 85 suites retained in the current inventory.

After this execution, two TypeScript non-null assertions were added only to the
S1 test. TypeScript transpilation proved the emitted JavaScript identical, so no
behavioral rerun was needed. Source identity is captured in the linked manifest.

The exact Russian vocabulary→exercise two-turn regression and 17-case opt-in
evaluation set are present; request execution has 29 tests. Deterministic cases
prove execution behavior, not a live intent-quality score.

## Static, contract, documentation and readiness evidence

- Final post-S3 backend build passed: ESM 259 ms and DTS 192.531 seconds.
  Backend typecheck passed (root session 16545).
- Web production build/typecheck remain valid: compile 21.3 seconds, types 9.8
  seconds and 23 static pages. No subsequent web source changes invalidate them.
- All changed-source ESLint and Prettier checks pass; `git diff --check` passes.
- Canonical contracts: 235 tests passed and package build passed.
- Documentation checks passed for 33 guides and all three affected mappings.
  Scoped documentation formatting and local-link checks passed.
- The architecture diagram is current and rendered under
  `test-results/feature061-diagram/`. Three unrelated atlas views remain stale;
  this bounded limitation does not imply those views were verified here.
- Baseline and final `knowledge-actions` capability doctor: `ready=true`.
  The fresh worker doctor passes. Conversation readiness is false only because
  its flow fingerprint changed. Configuration readiness is not provider proof.
- Smoke preflight stopped before paid dispatch. No MCP listener on port 3002 or
  MCP token was available for the alternate path. No paid/provider call ran.

## S3 credential-persistence remediation and operational remainder

Security review identified one local observation record containing one nested
configuration with a credential-bearing key. A boolean-only comparison confirmed
that the persisted credential matched the configured OpenRouter provider key.
The target was verified as loopback and had zero active actions and turns.
No credential value is reproduced here; no exfiltration evidence was found.

The source now persists a strict safe metadata allowlist and safely merges only
allowed fields; sentinel unit/database tests pass. The old idle dictionary worker
(parent PID 14198) stopped gracefully with TERM, and the same
`pnpm dev:dictionary-worker` command restarted it (new parent PID 57982). A single
configuration compare-and-swap scrubbed one verified record. Remaining unsafe
configuration count: zero. Observations and all nonconfiguration fields were
preserved. No ledger, unrelated configuration, routing or configured credential
was changed. This is separate from the obsolete Knowledge-content cleanup above.

Independent completion and security review approve source, local cleanup and the
post-S3 native evidence. Full security Definition of Done remains unmet until the
provider key is rotated/revoked or the user explicitly accepts the residual risk.
That external operational disposition is still pending. Keep the feature and
BL-013/015 in progress; a local implementation commit does not authorize a main
merge or completion claim.

## Superseded native/build evidence

Pre-S3 run `91b9b0e5-9f74-4afa-848f-a76194da7e75` passed 297 tests across 23 files
with zero skips/retries (55.77 seconds test time, 59.955 seconds total). It is
superseded for persistence proof by the final post-S3 run. Earlier prefix
`8f583007` had 297 raw tests pass but failed its registered gate because four
mandatory titles were outdated; the stronger inventory was aligned before the
registered pass. Raw test success did not make that earlier gate pass.

Earlier backend ESM/DTS builds passed with DTS durations 162.217, 175.370 and
167.786 seconds (the latter ESM 301 ms). The final post-S3 build above supersedes
those artifacts as final-source evidence. Raw historical reports remain unchanged.

## Diagnostic native runs — not final approval

| Run                                    | Diagnostic result                                                                                                                                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `49c64cd5-925b-44d2-b83c-dd0eab1d2a59` | 250 passed and 11 failed out of 261 tests across 20 files, 45.96 seconds. Exposed retired fixture contracts, version 1 expectations and unprepared new production cases.                                                                    |
| `ed7c6b16-d97a-41ee-8fc9-bde732c4ab48` | 279 passed and eight failed out of 287 tests across 22 files. Current store and the new prepared-memory path passed; remaining failures identified revision metadata, financial/readiness/preferences/outcome and 50-entry fixture updates. |

The raw run reports remain unchanged. The additional
`/tmp/feature061-focused.json` report is diagnostic: 27 passed and eight failed
out of 35 tests in three files. It is not a completion gate. The latest observer
fixture issue was traced to synthetic repetitive output and an invalid closing
tag rejected by the SDK. That fixture was repaired before the registered pass above; do not infer a
production-memory runtime bug from the earlier fixture failure.

## Remaining closure

The technical source, local cleanup and selected execution evidence are approved.
The source-state manifest supplies final identity. Resolve S3's operational
provider-key rotation/revocation or explicit user risk acceptance before strict
completion or main merge. Preserve the distinction between configuration
readiness, deterministic implementation proof and unavailable live-provider proof.
No acceptance waiver or full-security completion is claimed.

## Integration disposition — 2026-11-11

User explicitly authorized merging the preserved061/062/063 stack after the key
incident was explained and committed to updating the key. This supersedes earlier
no-main restrictions, without claiming rotation or production qualification is
done. See [feature063 integration decision](../063-dictionary-chat-snippets/EXEC_PLAN.md#integration-disposition--2026-11-11).
Existing approved runtime evidence is unchanged; no deployment/push/deletion.
