# Texts capacity security review

Date: 2026-10-16
Mode: Initial, bounded independent security review of AC-11/M7 follow-up.
Base: `15eaeb9`, branch `feature/texts-capacity`, tracked and untracked capacity changes.

## Findings and verdict

No material security findings in the reviewed implementation. Capacity code is approved from a security perspective. Final feature completion still requires the author's pending final verification and concrete local activation review/evidence; this is not evidence that local activation has occurred.

Reviewed source includes shared model catalog/profile/resolver/admission, Texts provider and worker dispatch, enqueue/claim/replay/accounting paths, migration0068, public error addition, and associated snapshot/provider-wire/real-database test changes. Applied root/backend/package instructions, code-review, efficient-code-search and testing guidance; read ADR-0026, ADR-0035 and ADR-0036. Scoped text search and direct surrounding-source inspection supplied symbol/caller coverage; no semantic tooling was required for the bounded changes. Existing ownership/sharing/purge safeguards were traced as unchanged invariants rather than repeating the previous feature's full security review.

## Security assessment

- Billing/reservation: new128000-input/32768-output per-call caps fit unchanged262144/40960 aggregate token reservations. Flash aggregate worst priced cost is385024micros, below400000; actual per-call maximum is226304micros. Admission derives effective credit maximum from the immutable effective price and aggregate envelope. Unknown dispatched usage retains conservative maximum settlement, and invalid/truncated output carries valid usage into failure settlement. Higher output caps do not create a second reservation or bypass credits.
- Trust: resolver accepts exact reviewed limits for the exact Flash/v2 profile and retains base caps for dictionary and legacy work. Credentials and endpoint come from the curated server catalog, never model metadata or public request fields. No caller-controlled endpoint, tool executor, or alternate credential reference is introduced.
- Immutable jobs/replays: authorization and same-key replay precede mutable model selection. Existing immutable database guards include format, execution snapshot, tariff and reserved limits. New admissions use v2; queued v1 jobs preserve identity. SQL claim filters exclude v2 for v1-only workers. Retry, cancellation/fencing and terminal settlement paths are unchanged.
- Provider privacy/output: toolChoice:none, one step, no SDK retries, hidden tracing input/output and no-op agent logging remain. Wire fixture checks exact fixed URL, Flash model, max_tokens32768, reasoning_effort:none and absence of tools. Local Zod and domain alignment validation remain authoritative; finishReason:length cannot publish a partial proposal.
- Migration:0068 only replaces the kind/format CHECK to permit translation v1/v2; detection remains v1. It does not rewrite source content, retention, historical snapshots, credits, job status or permissions. Fresh/upgrade and claim/replay regression tests cover the material expansion.

## Local operator activation boundary

The root's stated plan is consistent with the explicit user choice and established local operator authority: apply the non-destructive expansion, drain/stop old workers, start compatible workers, create a new immutable global Flash configuration revision, retain Kie and historical revisions/queued jobs/prices, increment version, and audit the operator change. This is a local database operator operation, not a session/admin authentication bypass.

The concrete prepared transaction is not yet reviewed. Before execution, verify that it locks and checks the current configuration/version, retains its actual custom rates and ownership metadata, changes only the intended default/enabled model set, and restricts any explicit legacy-preference migration to the authorized configuration owner. Do not rewrite other learners' preferences: ADR-0026 requires preserving disabled explicit choices. Audit source metadata must describe the actual local operator action and must not falsely imply a verified remote admin session. Preserve rollback to the prior configuration via another revision; drain v2 before worker rollback.

## Evidence and limits

Reused author-reported deterministic evidence: provider9, shared18, readiness9, realPG12, contracts100, API5 and browser3 passing. Source inspection confirms material regression assertions rather than relying only on counts. No duplicate tests, services, paid provider calls or production writes were run during this review. Final build/lint/types/full backend results were pending at assignment; their completion remains the root's responsibility.

Review identity (SHA256):

- `git diff --binary 15eaeb9 -- apps/backend/src packages/contracts/src .env.example apps/backend/drizzle/meta/_journal.json`: `7a211fb79fe64f8a66c3ead3f6e1e86617d26c2eb7accb5a7763aaa839e6b7bd`
- `apps/backend/drizzle/0068_bent_mentallo.sql`: `48e89ed45abac107cf009550048f7352bfb0367bd496848633e143901f08ef2a`
- `apps/backend/tests/unit/modules/texts/texts-provider-wire.test.ts`: `05a198a106ab547a1a03f1c82d624fd9ba727342ce99962457c0fcae04a9f9de`
- `apps/backend/tests/unit/modules/text-ai/infrastructure/text-ai-execution-profile.test.ts`: `2ec8770ee2d951ce83c51d5f3cac688b9f2b471f52d769c7c96f5a177908b2d9`

Residual operational limitations: conservative byte preflight is not a promise all20000-code-point texts fit; output expansion can still fail safely and consume credits. Legacy queued model availability remains an external provider condition; the patch intentionally does not silently redirect those jobs.

## Concrete activation script follow-up

Reviewed `/tmp/languon-texts-capacity-activate.mjs` read-only; SHA256 `d6406ce6bcce7a0337b2d4471000a568d9eb55b219f422c80058ef77458b430d`. No material security findings; approved for the authorized local application after migration and compatible worker startup. The implementation satisfies the preceding conditions: fixed workspace and loopback/development guards; shared active-owner advisory transaction lock; configuration and owner-preference row locks; sole active admin matching existing revision owner; guarded version increment; new immutable revision and truthful operator audit; fresh Flash/v2 execution-capacity-settlement readiness; preserved aggregate/custom rates; and owner-only explicit legacy-preference update. Any failed assertion rolls back the transaction. No modification of queued jobs, historical revisions, prices, other preferences or application authentication is present. Execution and subsequent state verification remain the root's responsibility.

## Bounded timeout remediation review

Reviewed the sole subsequent production delta in `dictionary-worker-command.ts`: Texts composition timeout increases from20000ms to180000ms, with dictionary/sentence behavior unchanged. No material security finding. The deadline remains finite, heartbeat10000ms renews the30000ms lease, cancellation/abort/fencing remains intact, and maxAttempts3, concurrency limits, token/cost/credit envelopes and settlement remain unchanged. Longer wall time consumes a bounded existing slot without expanding billing authority. SHA256 of reviewed file: `01224748cd445598fffbd9a2124b49e57af8cbaa3db0bd5809f15b1cc27237b1`. Approved; focused worker verification was still running at review assignment.

Root reports successful authorized local activation using the reviewed script after0068 and compatible-worker readiness, with immutable revision/audit and preserved historical state; health/capabilities200 and full backend956/contracts100/PG12/API5/browser3/types/build/lint green. These are author evidence, not an independent execution by this reviewer.

## Final closure

Root reports focused worker verification2files/13tests passed, final180s worker restarted and local health/auth200. Activation source is retained as non-executable evidence at `evidence/capacity-local-activation.mjs.txt`, with the previously reviewed `d6406ce6bcce7a0337b2d4471000a568d9eb55b219f422c80058ef77458b430d` identity. Owner preference remained Auto; no preference mutation occurred. Documentation now explicitly requires upgrading all shared AI workers before the global Flash default and draining all Flash work, including dictionary/learning jobs, before rollback to a pre-Flash release. This closes the shared-model rollout clarification; no further production-code delta was submitted. Security verdict remains approved with no material findings.
