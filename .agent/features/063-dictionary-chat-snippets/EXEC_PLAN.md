# ExecPlan: Dictionary chat snippets

## Goal/specification

Implement [FEATURE.md](FEATURE.md); [EVIDENCE.md](EVIDENCE.md) records checks, [REVIEW.md](REVIEW.md) review. Scope/decisions are confirmed by user; no additional product interview or paid call needed.

## Existing architecture and chosen seam

Conversation source resolver captures authorized material; dictionary owner metadata/effective settings must be explicitly included for authoring, not inferred from visible cards. Existing tutor uses native Mastra tools with accounted model gate and lease-fenced callbacks. Knowledge proposals are not dictionary-card payloads. Add typed snippet tools/persistence/readback beside that pattern; keep dictionary mutations in dictionary infrastructure/application, retaining owner-before-resource lock ordering.

Use current shared contracts for full card values/settings; one new focused contract module. Tool generation returns full values through existing accounted chat model/native tools (no unaccounted secondary model or new provider). Durable validated snippet records belong to the conversation; exact readback supports follow-ups. Separate list/apply endpoints avoid changing every ConversationDetail fixture. Apply takes proposalID, selected indices, mode, operationID and ordinary current target versions; payload values/provenance are server-resolved. All modes use one atomic canonical dictionary write, new cards are AI-generated, old Replace cards archived. Idempotency stores operation result independently of mutable selection UI; repeat operation mismatch rejects, later unique operation allowed.

## Decisions

D1: Extend approved UI patterns; no external design or new design approval.
D2: Server-bound dictionary context, owner-only capability, generation metadata distinct from current write authority. ADR0057 accepted within user's confirmed feature scope; partial ADR0011 exception only for chat snippets.
D3: No per-card consumed lifecycle/editable draft; retained immutable snippets reusable, each user operation has its own idempotency key.
D4: One compiler/build owner (root); no worker full builds/typechecks or shared resets. Only owned disposable test infrastructure, shared setup scheduled explicitly. No actual learner data cleared or paid generation.
D5: New feature is stacked over current prerequisites; no destructive checkout/worktree/dependency reinstall and no unrelated main merge.

## Consequential early proof

Before widening UI: persisted snippet -> dictionary-owned transaction -> exact ordered complete values, settings changed after generation accepted under current rules, Replace archives/progress retained, capacity rollback and idempotency replay are proven with real PG. Prove native chat tool produces a durable snippet via actual accounted model/SDK (only externalHTTP fake), instead of a mock generator/reply-only success. Confirm actual worker role and use established fence/permissions, never broad table grants.

## Test strategy and cost

Development (exact files to exist): new contracts/domain tests; backend dictionary snippet store/HTTP integration suite on owned PG; tutor tools tests; affected contextual runner/context budget cases; UI component tests. Commands: pnpm --filter @languon/contracts test -- <snippet-file>; pnpm --filter @languon/backend exec vitest run <new-snippet-store/production-file>; pnpm --filter @languon/web exec vitest run <snippet-component-file>. Select explicit files, no assumed pnpm forwarding. Unit estimate <30s; cold PG 1–3min once, test bodies measured separately. Root establishes complete synthetic env then one early path; reset only test-owned data and avoid migrations percase when real isolation permits.

Final retained paths: new snippet real DB/HTTP/security cases; affected default conversation production worker SDK cases (Free/Paid, no-charge failure, cancellation/source fence); one critical real dictionary-chat snippet browser journey including reload/selected prepend+append/duplicates/replace archive. Relevant unaffected conversation and canonical dictionary regressions only. No full shared pricing/account-erasure/speech/text/sentence aggregate: those adapters/policies aren't changed. Add/register new browser entry using existing reviewed infrastructure; exact plan before execution. Browser estimate2–4min after fixture preflight; focused DB/SDK2–5min; source/security review bounded after author preflight. Reassess at10minutes/recurring setup failure before another broad run.

Static: scoped lint/Prettier/readability; root runs shared contracts build once, backend+web types once after code stabilizes; backend runtime9entry packaging without unused declarations, affected web production build only if selected risk needs bundler proof (otherwise types+actual Next runtime). No claim partial command is full build. Doctor baseline/final read-only, live provider proof separate/no paidcalls.

## Guides and Mastra discovery

Update dictionary-platform and contextual-language-assistant-and-knowledge guides with stable new scenario(s), preserve old markers and run mapping checks. Tool canonical registry/Studio policy follows backend AGENTS; operation-bound real owner/source/lease excludes generic Studio execution unless existing synthetic safe factory supplies same constraints. Record exact exclusion if appropriate; do not widen generic proxy authority. Current architecture docs/ADR metadata updated without rewriting accepted bodies.

## Milestones

- [x] M1 — Contracts, trusted source context, durable snippet/apply transaction and focused PG proof (AC1–8).
- [x] M2 — Accounted tutor tools/exact readback, canonical linguistic policy and production SDK proof (AC1–3,9–10).
- [x] M3 — Read-only selectable chat UI/apply/refetch/notifications and focused component/runtime proof (AC3–8,11).
- [x] M4 — Author preflight, current guides and initial independent source/security review/remediation (AC12).
- [x] M5 — Selected final runtime/types/DB/browser gates, evidence approval, local integration/readiness (AC12).

## Progress and next action

2026-11-11: Implemented owner-only durable snippets, independently counted/validated authoring, exact retained source reads, atomic canonical insertion and read-only selectable UI. Dedicated brief-to-author stage uses the admitted model gate; full generated values never become model write authority. New cards preserve canonical linguistic policy and trusted AI authorship.

Initial independent review identified four Medium findings (count enforcement, full100-card readback,409 recovery and global mutation permit). Focused remediation approved all four. Security remediation moved semantic enabled-field validation inside the fatal authoring boundary; its new actual-SDK regression passes. See REVIEW.md.

Final selected evidence is green:56 backend focused tests,10 web components,5 real PG cases,5 default-worker/SDK cases,1 critical browser journey, backend/web source types, scoped lint/format,9 ESM runtime bundles/migration packaging, and current guide checks. Browser evidence includes keyboard/narrow layout, reload, old settings, duplicate notice and archival Replace. Only external model HTTP is fake. No paid/live calls.

Local development migration0166/0167 was applied to the verified loopback development DB without deleting content; affected conversation doctor passes. New tooling fixtures use owned disposable infrastructure. Final source/evidence manifest is retained under evidence/.

Final completion and security evidence approvals returned2026-11-11 with no remaining feature findings. Owned PG cleanup completed after exact ID/label/tmpfs checks. Next: local feature commit. Main merge/release remains withheld for inherited feature061/062 qualification; this is not an unresolved snippet implementation finding. No broader regressions or deployment are selected.

## Verification cost and retrospective

Exact results/commands and fixture rework are in EVIDENCE.md. Each final store suite took6.70s, SDK suite28.08s; critical browser setup5.60s, execution81.82s and cleanup3.07s. Early fixture failures caused repeated browser setup; the final fixture now proves canonical disabled learning/sentence capabilities before startup, preventing false404 noise. No product deadlines or legitimate assertions were weakened. Full workspace suites were not required by the changed paths. Source types plus executable/asset packaging were selected explicitly; unused backend declaration generation was not selected or represented as a complete standard build.

Post-acceptance retrospective remains pending the user's acceptance; it does not delay local technical handoff.

## User acceptance and integration request (2026-11-11)

User accepted the implemented feature and its UI follow-ups, and explicitly
requested committing current work, finishing the feature and merging to main.
The snippet implementation, design/disclosure improvements and dialog/action
polish have final independent approvals; the latter is recorded in
../../improvements/web-dialog-and-button-polish.md. No runtime changes are made
for this Git-only closure, so existing valid final evidence is reused.

Main's ancestor89ff4193 still excludes the preserved061/062 prerequisites.
Current records retain061 S3 provider-key rotation/revocation or explicit informed
risk acceptance as an operational High remainder. No evidence of its disposition
has been found; a generic merge instruction is not a claim that a key was rotated.
Feature062's deployment contract-migration gate remains intentionally fail-closed;
this merge request does not authorize production deployment or redesigning rollout.
Commit accepted work now; resolve the security disposition before the main squash.
Do not delete/push branches. No conflict resolution or test rerun is needed until
Git reveals a real merge conflict or implementation change.

Acceptance retrospective: core implementation/local runtime proof was complete
before UI follow-ups. The avoidable UI rework was overly expanded generated cards
and long action labels. Approved compact/disclosure patterns, isolated stories,
brief motion and concise action rules now guide future changes. Exact timing was
not instrumented; measured tests and setup costs remain in EVIDENCE and follow-up
records. Production-provider connectivity and deployment remain separate claims.

## Integration disposition — 2026-11-11

After the local credential-persistence incident and remaining risk were explained,
the user stated: “ok, i'll update key, can finish feature and merge to main”.
This explicitly authorizes local main integration of the preserved061/062/063
stack while the user performs key rotation. It does not assert that rotation has
already occurred or that the credential incident is operationally closed.
Source/data remediation and approved evidence remain unchanged. Earlier no-main
restrictions in this record are historical and superseded by this user decision.
No deployment, push or branch deletion is authorized. Production contract-migration
qualification and the incomplete standard declaration-build evidence remain
outstanding; deployment remains fail-closed. No runtime or test source changes
are needed for this records-only closure, and valid selected evidence is reused.

Final Git delivery: record-only closure commit on feature/dictionary-chat-snippets,
then squash into main as one commit. Main is an ancestor, so no conflict-resolution
source changes are expected. Verify final main tree matches the accepted feature
tree, check the working tree and retain the feature branches. Git history records
the resulting commit IDs. Feature063 is Complete; inherited operational/release
items stay explicitly open in their owning records.
