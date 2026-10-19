# Security review: Development cleanup and architecture diagrams

Reviewed: 2026-10-19  
Reviewer: independent security reviewer  
Mode: Final, after bounded remediation review  
Verdict: Pass — no open material security findings

## Review boundary

- Base: `007b9eb05cc264244560af23903218b4c0fdfe09` plus the captured
  working-tree manifests in `evidence/tested-files.sha256`.
- Initial manifest SHA-256:
  `f027151099db3bfdcfc9da417b160ff977b93b661fedddc61305f5b2d0531e38`.
  The finding below was raised against that state.
- Intermediate manifest SHA-256 after security remediation:
  `a7003ea1997f89ef39a3b505170500d153865c43040d299eb8cfd6c4c1d7b1e6`.
- Final manifest SHA-256 after completion remediation:
  `24b81cf9c7db55b35198d10d290b31198e22757d8cea56d107f80af115f8478e`.
  All 222 entries (182 present-file hashes and 40 deletion markers) were
  independently compared with the final files; no hash, deletion, or
  missing-file mismatch was found.
- Requirements and decisions: FEATURE.md AC-1–AC-6, EXEC_PLAN.md, EVIDENCE.md,
  CLEANUP.md, AUDIO-PERSISTENCE.md, ADR-0038, ADR-0039 and ADR-0040.
- Inspected trust/data surfaces: cleanup and diagram skill authority; viewer
  catalog parsing, canonical-path confinement, HTTP authority, local assets,
  Mermaid rendering and browser insertion; retired text-model selection and
  endpoint configuration; Mastra development harness defaults/policy; migration
  0074; shared-speech identities, retained storage, billing and account purge;
  database roles; shared-speech release budget metadata; schema-v1 and retired
  CLI/deployer paths. Scoped `rg`/diff caller tracing was used because no healthy
  semantic index was available.
- Reused verification: V1 and V5–V10, C8 and C13–C18, AUDIO-PERSISTENCE.md role
  and disposable-database results, and TEST-REVIEW.md. No real database mutation,
  remote object-store action, provider call, or paid request was run in this
  independent review.

## Findings

### SEC-045-1 — Medium — retired speech-purge credentials remained in the account-purge worker — Fixed

- **Classification:** Exploitable least-privilege defect. Exploitation requires
  access to the account-purge process/container environment, but the exposed
  credential has destructive authority outside the worker's current duties.
- **Location in the initial reviewed state:**
  `infra/deploy/compose/apps.compose.yaml:200-207` injected
  `ACCOUNT_PURGE_AUDIO_RETAINED_S3_CONFIGURATIONS`, the shared speech storage
  location, and `ACCOUNT_PURGE_AUDIO_STORAGE_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY`
  into `account-purge-worker`. `infra/deploy/lib/config.mjs:240-259` required
  a separate purge credential whenever speech uses S3. The stage/production
  examples retained the secrets at lines 28–33, and
  `infra/deploy/tests/production-security.test.mjs:246-255` plus
  `infra/deploy/tests/config.test.mjs:186-217` positively enforced this obsolete
  authority.
- **Problem and failure scenario:** The feature removes the pronunciation object
  cleanup adapter from `account-purge-command.ts`; `loadAccountPurgeEnvironment`
  parses only document-purge storage, and current account purge deliberately
  retains successful shared recordings. Therefore the speech purge variables are
  unused by legitimate runtime code while remaining readable from the process
  environment. A code-execution, diagnostic-dump, or container-inspection
  compromise of this worker can recover a credential documented as having speech
  object version-list/delete authority and delete retained shared recordings.
- **Impact:** Unnecessary secret exposure expands an account-purge worker compromise
  from its current database/document scope to globally retained speech object
  storage. Deletion can make shared pronunciation unavailable or irrecoverable and
  breaks ADR-0040's retained-storage boundary. This also conflicts with AC-2's
  retirement of old executable purge participants.
- **Reproduction:** Configure a deployment with `DICTIONARY_AUDIO_STORAGE=s3`.
  `assertDeployConfig` rejects it unless the account-purge audio credential is
  supplied; `Deployment` then passes that value through Compose to the
  account-purge container. Source tracing shows no current consumer after the
  removed adapter, while the production-security test requires the retained
  mapping to be present.
- **Concrete remediation:** Remove every `ACCOUNT_PURGE_AUDIO_*` variable and
  speech S3 location from the account-purge service environment; remove the purge
  credential requirement from `assertDeployConfig`, deployment examples and
  current operations docs; change security tests to assert those names are absent
  from the purge service. Revoke any provisioned obsolete purge keys. If orphan
  cleanup is still operationally required, implement it as an explicit bounded
  operator procedure with short-lived credentials rather than ambient authority in
  the continuously running account-purge worker.
- **Acceptance/risk affected:** AC-2, AC-6; ADR-0040 storage/purge boundary and
  least privilege.
- **Disposition:** Fixed. `infra/deploy/compose/apps.compose.yaml:190-211` now
  gives the account-purge worker only its database and current document-storage
  deletion settings. `infra/deploy/lib/config.mjs:240-257` requires distinct
  speech API/worker credentials and no purge speech credential. The stage and
  production examples state that account purge receives no audio credential;
  the current operations guide records the same retained-recording boundary.
  `infra/deploy/tests/production-security.test.mjs:229-256` asserts that neither
  `ACCOUNT_PURGE_AUDIO_*` nor any `DICTIONARY_AUDIO_*` setting enters the purge
  service, while `infra/deploy/tests/config.test.mjs:186-215` preserves separate
  API/worker storage identities. The current document deletion credentials remain
  required and injected. An independent focused rerun passed all 18 tests in
  `config.test.mjs` and `production-security.test.mjs`. The author-reported final
  deployment/release suite passed 82 tests with 6 unrelated guarded-infrastructure
  skips and no failures; scoped ESLint and `git diff --check` also passed.

## Verified controls and defense-in-depth disposition

No additional material defect was found in the reviewed paths.

- The viewer binds to `127.0.0.1`, allowlists fixed routes/assets, rejects writes,
  foreign Host/Origin and cross-site requests, canonicalizes source and diagram
  paths, rejects symlink escapes, bounds files/catalogs, uses strict CSP and
  Mermaid mode, rejects directives/HTML/links/external resources, and inserts
  metadata/notes/source paths as text. The explicit stamping path is CLI-only.
- Retired text-AI snapshots fail closed at admission, while current worker
  execution resolves model identifiers only through the curated catalog and uses
  the catalog's endpoint/credential. Legacy arbitrary URL/key settings are
  rejected. Historical identities and accounting revisions are not rewritten.
- Migration 0074 takes an exclusive lock and refuses any nonempty old
  asset/binding/job inventory before dropping the retired tables. The current
  speech blob table, recording bytes, billing records and shared associations are
  outside that drop. The reviewed SQL uses parameterized Drizzle/sql-template
  values rather than concatenated request input.
- Scoped HMAC identities include recording class and retain key-rotation secrets.
  Current speech authorization/accounting tests cover source isolation, hold
  settlement, replay and account-association removal. The worker/purge role scripts
  remove old table rights and retain negative checks around recording deletion,
  quote text and tariff publication.
- The new skills preserve repository authority, require explicit delivery/data
  authorization, local/disposable target verification, exact preflight counts and
  bounded transactions. Neither skill treats documentation text as executable
  authority or grants a blanket reset.

No separate defense-in-depth recommendation is recorded: the one unnecessary
credential was a concrete runtime authority defect and was removed rather than
accepted as optional hardening.

## Final-state confirmation after completion remediation

The completion-review delta does not reopen SEC-045-1 or introduce a new material
security finding.

- `.env.example` no longer advertises the two retired dictionary-audio enablement
  flags or the two retired audio lifecycle-version settings. Deployed configuration
  still rejects all four names in `infra/deploy/lib/config.mjs:108-119`, so a stale
  operator value fails closed instead of selecting a hidden compatibility path.
- `dictionary-audio-environment.ts:10-12,90-118` now reads only the current
  `SPEECH_PLAYBACK_ENABLED` and `SPEECH_GENERATION_ENABLED` controls, and its role
  is limited to `api | worker`. `dictionary-audio-adapters.ts:17-42,75-92` likewise
  removes the unused purge overload and branch. Complete caller tracing found only
  explicit API and worker composition. The API environment continues to discard
  provider API keys and retained provider configurations; only the worker role can
  instantiate the paid provider and retained polling adapters. This narrows the
  callable surface without granting a new credential, storage, or deletion right.
- The shared-pronunciation and release-deployment guides now name the implemented
  `--shared-speech` and `--model-pricing` inputs, including
  `sharedSpeech.speechBudget`; they also state that retired
  `--pronunciation-audio` is rejected. This matches the release CLI parser and
  avoids instructing operators to use a retired compatibility namespace.
- An independent rerun of the focused adapter/storage files passed all 47 tests.
  The author also recorded backend typecheck, scoped ESLint, 24 guide and 16 guide
  validator checks, release mapping, and the refreshed 9-of-9 diagram fingerprint
  result. The final manifest above independently matches every recorded file and
  deletion marker, and `git diff --check` passes.

## Residual risks and unverified assumptions

- The application is represented as preproduction with no deployed production
  data. No production rollout, live S3 policy, remote provider, or backup/restore
  rehearsal was independently exercised. No provisioned obsolete purge key was
  available for this review to verify revocation; the final deployment paths no
  longer require or inject one.
- The exact local rekey and six-row readiness cleanup cannot be independently
  replayed from repository state: their temporary scripts were deleted and this
  review was forbidden from mutating the database. The sanitized report, disposable
  proof and postconditions were inspected, but the reported ordinary local database
  state remains an external assertion.
- Successful speech recording text/bytes are intentionally retained globally after
  account purge under ADR-0031/ADR-0040; privacy depends on deleting actor bindings,
  quotes and payer/reservation links and on enforcing source authorization. This is
  an accepted product/data-retention policy, not a newly identified defect.
- The viewer is not an operating-system-user isolation boundary. Its catalog can
  disclose whatever authors place in `docs/diagrams`; current reviewed diagrams and
  changed-source scan showed no committed credentials or user data, but the server
  cannot prove that future diagram prose is secret-free.
- Hash equality covers the recorded 222 paths and does not prove repository-wide
  absence of stale code, newly introduced unlisted consumers, dependency
  vulnerabilities, or omitted architectural inputs.
