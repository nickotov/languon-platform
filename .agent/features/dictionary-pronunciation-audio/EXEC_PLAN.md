# ExecPlan: Dictionary pronunciation audio

Feature: [FEATURE.md](./FEATURE.md)
Last updated: 2026-09-21
Status: Planning complete; awaiting user review, not implementation

## Goal and specification

Deliver reusable speech for four saved dictionary fields. FEATURE.md owns scope
and AC text. The user explicitly requested a plan and architect review before
later implementation. Do not start delivery from this document without approval.
Branch: `feature/dictionary-pronunciation-audio`, created from `main`. Preserve
the unrelated pre-existing `.codex/agents/architect.toml` modification.

## Existing architecture

- `packages/contracts/src/dictionaries/models.ts`: six plain-text card values,
  effective field enablement and example language roles; no audio contract.
- `apps/backend/src/modules/dictionaries`: domain/settings, application services
  and ports, Drizzle persistence, HTTP interfaces and provider infrastructure.
- `dictionary-worker-composition.ts` plus root
  `apps/backend/src/infrastructure/worker/dictionary-worker-command.ts` host
  durable jobs. Existing generation executors return card proposals/token usage;
  speech needs its own queue/service, not proposal acceptance/discard semantics.
- `apps/backend/src/modules/users/application/account-purge-service.ts` and
  `infrastructure/persistence/drizzle/drizzle-account-purge-store.ts` enumerate
  jobs/documents explicitly. Extend them for audio; cascades do not erase S3.
- Web `dictionary-card-list` is composed by `dictionary-editor`; use an audio
  feature with dictionary entity API and existing shared UI/tokens. Preserve FSD
  direction and public exports; do not import one feature's internals into another.
- `apps/mobile/src/screens/home-screen.tsx` is the only native screen. No native
  dictionary/auth journey exists; v1 is web with portable contracts.
- ADRs 0002, 0009, 0011, 0012, 0016 and 0019 govern persistence, release,
  ownership, workers, real-browser evidence and erasure. ADR-0020 is Proposed.

## Design and interfaces

### Ownership and application ports

Dictionary application operations `requestFieldAudio`, `readFieldAudioStatus`,
and `readFieldAudioBytes` hide authorization, language, cache and provider state.
Audio is derived content and does not mutate cards/revisions/authorship.

`SpeechSynthesisProvider` validates configured capabilities, submits, and polls.
Submission returns ready output or a pending opaque task reference; failures
distinguish definitely-not-submitted from unknown outcome. Adapters hide provider
HTTP/voice IDs/result fetching. Store task handles and scheduled poll times in
PostgreSQL; do not hold a connection or worker lease while sleeping for a task.
Known work retains its original provider configuration identifier across default
switches; retain those credentials/configuration until jobs drain, never store
secrets in job rows. Kie and deterministic fixture are initial implementations.

`AudioObjectStorage` provides bounded put/read/delete/integrity operations on
opaque server-generated keys. Implement dev PostgreSQL bytea and private S3.
Store backend/namespace identity plus exact version when applicable. Reuse AWS
SDK infrastructure, not the document quarantine contract/credentials. Purge must
dispatch typed audio/document storage references rather than assume every key
belongs to document storage.

The existing worker process hosts a narrow dictionary application coordinator
that fairly schedules proposal and audio workers under separate capacities.
Root runtime still owns timers/signals only. No generic job framework, additional
process topology, Mastra tool, or synchronous provider call from HTTP is needed.

### Proposed HTTP contract

Finalize Zod schemas/OpenAPI in M1; these paths are proposals, not existing APIs.

| Operation        | Proposed route / behavior                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Request or reuse | `POST /dictionaries/:dictionaryId/cards/:cardId/audio`; four-value field enum, expected card/settings versions; 200 ready or 202 pending         |
| Status           | `GET /dictionaries/:dictionaryId/cards/:cardId/audio/:field`; no paid work on GET                                                                |
| Bytes            | `GET /dictionaries/:dictionaryId/cards/:cardId/audio/:field/content?assetId=...`; reauthorize, check current binding/content, then bounded bytes |

Expose capability states through the existing dictionary capability surface,
distinguishing playback from new generation. Use owner auth/Origin/CSRF patterns,
non-enumerating not-found, stale-version conflict, bounded retry information and
sanitized failure categories. No client-provided text/language/model/voice/key/URL.

Web must fetch bytes through existing bearer-auth transport then create/revoke
a Blob URL for the audio element. Direct `<audio src=backend>` cannot supply
current bearer headers. Send private/no-store, ensure CSP permits `media-src blob:`,
bound downloads and revoke on replacement/unmount/logout. No persistent browser
cache/offline guarantee. Full short-clip download in v1 avoids Range complexity.
Async autoplay rejection becomes Ready with a fresh Play action. Stop/new selection
invalidates a client request token so late results cannot play old clips.

### Typed persistence and identity

| Proposed table              | Responsibility                                                                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `dictionary_audio_bindings` | Card + field + resolved text/language fingerprint → selected asset/current job                                                     |
| `dictionary_audio_assets`   | Owner/card/field, immutable rendition fingerprint, storage identity/version, checksum/MIME/length, lifecycle and access timestamps |
| `dictionary_audio_jobs`     | Bounded text/profile snapshot, state, upstream handle, next poll, lease/fence, attempt, reserved cost, expiry and safe error       |
| `dictionary_audio_blobs`    | Development-only bytea; excluded from ordinary card/job reads                                                                      |

Resolve the valid logical binding BEFORE consulting the current provider.
Existing ready audio remains usable if that provider is disabled/replaced. For
new/missing content choose current profile and rendition identity including
provider/model/voice/settings version. Use keyed text/language fingerprints,
unique constraints and short transactions to deduplicate same-card-field
requests. Cross-card/owner deduplication is deferred. Independent forks copy text,
not source-owner audio bindings. Editing or effective language changes invalidate
the binding, and current-content checks prevent stale job completion from playing.

### Durable lifecycle and budgets

`queued → submitting → waiting_provider → storing → ready`; terminal alternatives
are `failed`, `cancelled`, and `submission_unknown`. Every write checks leases and
fencing. Commit submission intent before calling provider; persist handle promptly.
Crash after upstream acceptance but before handle persistence cannot guarantee
exactly-once billing without provider idempotency/correlation lookup. Unknown
submission is held for reconciliation, conservatively retaining possible charge;
ordinary Retry does not silently resubmit it. Document operator reconciliation
and explicit subsequent retry policy; no automatic provider fallback.

Known task polls/downloads/storage retry with original handle and bounded backoff;
storage failure never automatically resynthesizes. Validate returned HTTPS URLs,
configured hosts, DNS/IPs and every redirect; reject private-network targets.
Bound downloads/time, validate audio content/type and supported format. No user
SSML, raw prompts in logs or arbitrary execution. MP3 is the proposed playback
format; verify model output and decoder compatibility before selecting it.

Reserve per-owner/global cost and concurrency atomically. Snapshot rate/model
configuration; production refuses generation without explicit conservative spend
ceilings and rate mapping (credits or money). Proposed initial configurable caps:
2,000 Unicode code points, 5 MiB/120 seconds per clip, 10 queued + 2 active jobs
per owner, 4 global active jobs, 3 transient retries and 120-second job deadline.
Provider calls also enforce its native input units/limits. Timeout may stop local
waiting without stopping upstream cost; reconcile known tasks for output cleanup.
The 120-second deadline is a user-facing wait limit, not proof of upstream
termination. Track provider settlement and cleanup separately from visible
failed/cancelled state. Retain task handles/object inventory after that deadline;
repeat Play cannot submit new work for the same binding while its upstream task
is pending or unknown. Release the local worker lease/execution slot between
polls, but retain conservative spend and upstream-capacity reservation until
settlement or a documented operator reconciliation horizon. Late success may
populate a still-current authorized cache but never restart playback automatically.
For deletion, deny publication and stop local writers/downloads; purge need not
wait indefinitely for an unavailable upstream provider once local objects and
writer quiescence are proved. External retention follows the separately approved
provider policy; it is not claimed erased by our local purge.
Metrics: cache hits, queue age, time to ready, unknown submissions, cost, stored
bytes and cleanup lag, with no content-bearing dimensions.

### Cleanup and deletion

Proposed defaults: evict after 30 days without access; remove superseded/unreferenced
assets within 24 hours; promptly redact terminal text snapshots within 24 hours.
Missing/evicted bytes reset a binding to missing for later on-demand regeneration.

Persist an object intent before upload and use unique attempt keys. Successful
upload + failed SQL publication must remain discoverable. Fencing prevents stale
publication but cannot stop late S3 writes: bounded request lifetimes, writer
quiescence and reconciliation are required before cleanup finalization. Delete
all physical versions when versioning is enabled, not just current delete markers.

Deletion immediately blocks admission/reads/publication. Extend existing purge
inspect/finalize guards, cancellation, typed storage dispatch, bytea cleanup and
FK order. Verify absent external bytes before discarding their inventory. Cleanup
works with generation disabled/provider down. ADR-0019 restore replay remains the
gate before traffic or resumed jobs. Provider retention is a separate activation
condition; deleting Selectel bytes does not erase the provider's own retention.

### Configuration and release

Storage (`postgres`/`s3`), provider (`fixture`/`kie`/future adapter) and playback/
generation gates are independent. Dev defaults to fixture/postgres with honest
fixture labeling. Live dev mode is deliberate configuration, never the CI default.
Production rejects fixture/bytea. Configure Selectel endpoint, region, bucket,
path-style behavior and isolated credentials only in infrastructure.

Add optional pronunciation-audio release metadata (absent means disabled) with
worker/read/enqueue/web versions and speech budgets. Existing dictionaryJobs
proposal/token metadata must not be repurposed. R1 adds dormant schema/API/audio
and purge support; R2 activates only after candidate AND rollback floor support
audio inventory/jobs, including purge workers. Verify worker-role grants and
fair scheduling. Rollback disables generation/UI as needed, retains cleanup and
compatible cached reads; never drop populated tables/buckets as rollback.

## Test and review strategy

- Unit: language/visibility, fingerprints/binding reuse, profile selection,
  budgets, state machine, expiry and client selection cancellation.
- Disposable PostgreSQL: bytea round trip, uniqueness races, leases/fencing,
  submission ambiguity, crash recovery, admission races, edit/archive/deletion
  races, failed-publication/late-upload cleanup, purge FK order, forward migration
  and safe rollback. Inspect db-verification guards before executing commands.
  Include user-visible timeout followed by late success and repeated Play to
  prove retained task identity, no duplicate charge and no surprise playback.
- Provider conformance: local HTTP fixtures for pending/success, malformed output,
  throttling, unknown submit, URL/redirect SSRF, expiry/download failure. Future
  adapters use the same contract; tests never call paid/nondeterministic TTS.
- Storage conformance: PostgreSQL and disposable S3; dedicated Selectel test
  bucket checks put/read/checksum/delete/all-version removal and IAM before
  activation. Local storage parity does not prove Selectel compatibility.
- Web component/contracts: state transitions, decoder/playback errors, retry
  without regeneration, optional fields, language direction, stale responses.
- E2E: actual fixture bytes through real API/worker/PostgreSQL, media decoding and
  playback events plus repeat-play cache behavior. Real browser observation on
  desktop/mobile viewport, keyboard, 200% text, CSP and audible fixture; live
  pronunciation listening is separate paid smoke only when explicitly authorized.
- Affected contracts/backend/web lint/typecheck/build and deployment scripts;
  no native build/device evidence required because no native implementation.
- Independent completion and security reviews required after author preflight.
  Separate tester required for bounded submission/storage/purge fault-injection
  adequacy; reuse valid evidence. Architect review here is design evidence only.

## User-flow documentation and commands

During implementation create `docs/user-flows/dictionary-pronunciation-audio.md`
and `apps/web/tests/e2e/dictionary-pronunciation-audio.journeys.spec.ts`, mapped to
reviewed command ID `web-playwright`, with stable scenarios:

- `owner-plays-four-card-fields`
- `repeat-play-reuses-audio-and-edits-refresh`
- `audio-failure-retry-and-selection-cancellation`
- `archived-or-removed-owner-cannot-play-audio`

Existing dictionary-platform mapping inspected 2026-09-21: all seven scenarios
in `apps/web/tests/e2e/dictionary-platform.journeys.spec.ts` remain:
`owner-creates-edits-and-restores-dictionary`,
`anonymous-reader-forks-unlisted-dictionary`,
`card-ai-proposal-survives-review-and-conflict`,
`inline-ai-card-authoring-preserves-field-choices`,
`batch-generation-review-commits-selected-cards`,
`document-generation-cleans-original-and-commits-final-review`,
`quizlet-import-and-export-round-trip`.

Profile-account-controls maps `profile-handle-security-and-removal` to
`apps/web/tests/e2e/profile.journeys.spec.ts`; augment deletion fixtures with audio
and retain the ID. Physical purge/restore stays lower-layer integration. Update
guide revisions/test markers through user-flow-e2e when behavior changes. Inspect
release-deployment-platform mapping before updating rollout journeys.

Planned root commands; proposed new test paths do not exist yet. Inspect runner
forwarding and disposable environment before running them:

```sh
pnpm --filter @languon/contracts test
pnpm --filter @languon/backend test -- tests/integration/modules/dictionaries
pnpm --filter @languon/web test -- tests/dictionary-audio.test.tsx
pnpm --filter @languon/web test:e2e -- tests/e2e/dictionary-pronunciation-audio.journeys.spec.ts
pnpm --filter @languon/web test:e2e -- tests/e2e/dictionary-platform.journeys.spec.ts
pnpm --filter @languon/web test:e2e -- tests/e2e/profile.journeys.spec.ts
pnpm docs:user-flows:check
pnpm user-flow:e2e -- check dictionary-pronunciation-audio
pnpm user-flow:e2e -- check dictionary-platform
pnpm user-flow:e2e -- check profile-account-controls
pnpm test:release-deployment
```

Use testing, db-verification, user-flow-e2e, frontend-development,
ui-ux-composition, browser-verification and code-review at applicable delivery
stages. Keep guides unchanged during planning rather than claim future behavior.

## Milestones

All implementation milestones await approval and their required proof.

- [ ] M1 — Approve specification/ADR, pin contracts and capabilities.
    - Components: contracts, dictionary domain, config, ADR-0020.
    - AC-1/3/5/7/8. Checks: Zod/domain tests; chosen model-language matrix and
      accepted deployment/data-processing/cost configuration.
- [ ] M2 — Persist bindings/assets/jobs and implement both storage adapters.
    - Components: dictionary schema/migrations/repositories, bytea/S3 adapters.
    - AC-3/4/6/9. Checks: disposable DB migration, concurrency, integrity,
      orphan inventory and common storage conformance.
- [ ] M3 — Implement Kie/fixture adapters and audio worker coordination.
    - Components: provider ports/adapters, audio worker, existing runtime.
    - AC-5/6/8/10. Checks: HTTP fixtures, unknown submission/restart, original
      provider draining, admission budgets/fencing, shared-worker fairness.
- [ ] M4 — Integrate authorized API, purge and release compatibility.
    - Components: routes/OpenAPI, users purge, configuration/manifest/IAM.
    - AC-7/8/9/11. Checks: cross-owner/content/edit/delete races, all-version
      deletion/late writes, purge-aware rollback floor and restore rehearsal.
- [ ] M5 — Deliver owner web playback and documented journeys.
    - Components: dictionary entity API, audio feature, editor/list composition,
      locales, guides and mapped tests.
    - AC-1/2/3/10/12. Checks: components, genuine browser playback, responsive/
      accessibility/CSP and all affected mapped E2E regressions.
- [ ] M6 — Production adapter evidence, preflight and independent reviews.
    - All ACs. Live synthetic Kie quality/latency/cost and Selectel checks or
      explicit activation blocker; tester/security/completion review, remediation,
      updated evidence. Only after approved implementation and full completion
      follow required local feature commit/squash-merge policy; no implicit push.

Every milestone links proof via EVIDENCE.md; no checkbox completes before its
checks pass. REVIEW.md owns review and remediation.

## Current progress

- 2026-09-21 — User authorized planning only and an architect agent. Read workflow,
  target seams, ADRs and guide mappings. Created feature branch/artifacts.
- 2026-09-21 — Architect findings incorporated: dedicated audio domain/queue,
  binding-first cache lookup, unknown-submit barrier, bearer-aware playback,
  typed purge inventory, separate release metadata and honest native scope.
- Immediate next action: user review. No implementation, paid calls or deployment.

## Decisions and discoveries

- D-1 — Dictionary-owned subsystem beats a generic media service: authorization,
  language and lifecycle remain local, with smaller caller burden. Native-only
  TTS is simpler but cannot provide controlled cross-platform recordings. ADR-0020.
- D-2 — Independent provider/storage ports represent actual alternatives requested
  by the user; bytea implements the storage contract, not the entire S3 protocol.
- D-3 — Separate queue/state avoids coupling audio to AI proposal approval and
  token accounting. Reuse process/coordinator rather than proposal executors.
- D-4 — Logical bindings and immutable rendition profiles resolve the conflict
  between provider-aware cache keys and preserving existing audio on provider switch.
- D-5 — Same-field deduplication only; cross-card sharing adds reference-counted
  erasure complexity without a current acceptance requirement.
- D-6 — Durable polling initially; webhooks add public exposure/trust and local
  development requirements. Add only with measured need and authenticated handling.
- D-7 — Unknown submission is not retryable by default; exactly-once upstream
  billing cannot be inferred from our SQL leases. No silent expensive fallback.
- D-8 — Native app is static; owner web scope is an explicit review choice.

## Validation links and remaining work

[EVIDENCE.md](./EVIDENCE.md) records planning checks and all missing runtime proof.
[REVIEW.md](./REVIEW.md) records architect findings and review limits.
Outstanding: user approval, model/voice coverage and budgets, credentials,
Selectel verification, all six implementation milestones and completion/security
reviews. Planning completion is not feature completion or deployment readiness.
