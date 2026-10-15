# Texts final independent security review

Date: 2026-10-16
Mode: Expanded completion review of frontend trust boundaries and backend UI delta; reuse exact unchanged backend approvals.
Final verdict: Approved for reviewed security boundaries after bounded SEC-UI-01/02 remediation. See closure entries and exact hashes below. Final full-feature browser/author checks remain tracked by root.

## Boundary and evidence

Base `664198fee9eb1a0492134c43de9a9d04835568af`; reviewed HEAD `168d3bdd1fef07d5b077f984168162f7c21d96f1` plus tracked/untracked current source. Read repository/web instructions, review/search/testing skills, FEATURE/EVIDENCE/REVIEW, prior security and web API reports; source reads cover owner/public workspace, capability sharing/login continuation, selection/collection, plain-text rendering, modal/portal composition, backend metadata/idempotent creation/atomic public copy and guarded real-app fixtures. Static independent review; author test evidence assessed, no paid/network model calls or destructive execution.

85 of 95 backend-verified manifest entries remain byte-identical and retain prior approval. Changed backend content-store/port/service/routes, contracts and supporting tests/runners were reviewed as delta. Frontend source was reviewed directly; this report does not infer approval from HEAD alone. Key inspected hashes are below, captured before remediation.

## SEC-UI-01 — High — Private workspace cache crosses account boundary

- Location: `apps/web/src/fsd/pages/texts/hooks/use-text-workspace-data.ts:12` and `:35`; `apps/web/src/fsd/pages/texts/hooks/use-text-workspace.ts:56` and `:60`.
- Problem: Owner queries use `['texts-workspace-folder', folderId]` and `['text', textId]`; adoption writes the same ownerless key and unconditionally adopts cached remote data. The AuthProvider QueryClient remains alive across account changes. Workspace identity only includes folder/text IDs.
- Scenario: A opens a private text, signs out, B signs in in the same SPA, then B revisits A's workspace URL. The retained cached folder/text is returned synchronously and adopted into B's local workspace. A subsequent404 cannot undo the adopted document. A direct authenticated actor switch also retains existing local editor state.
- Impact: Disclosure of private text/title/folder data across browser account sessions. Backend tenant checks do not prevent disclosure from client cache.
- Fix: Scope all private workspace query keys and writes by actor; gate adoption/current asynchronous work to that actor; remount/reset workspace local state on actor changes. Include job data and late save/adopt paths in this boundary.
- Required closure evidence: Same QueryClient A→B regression proves no A cached content renders under B, plus delayed A fetch/save result cannot populate B state/cache.
- Disposition: Open; root assigned remediation.

## SEC-UI-02 — Medium — Public reader retains previous actor's private collection state

- Location: `apps/web/src/fsd/features/text-reading/hooks/use-collect.ts:25`, `:39`, `:78–100`; `apps/web/src/fsd/features/text-reading/ui/text-reading/text-reading.tsx:22`; `apps/web/src/fsd/features/text-reading/hooks/use-collection-jobs.ts:31`.
- Problem: ReadingSurface identity omits actor. Private dictionary choices and job tasks survive actor changes. Dictionary loading only checks AbortSignal, while cleanup depends on shareKey/requestWithSession; the auth request function is stable across account changes.
- Scenario: A opens collection from a public reader and loads dictionaries (or has an A response pending). Switch to authenticated B while reader stays mounted. A dictionary names remain, or delayed A data populates the picker under B. Anonymous transitions abort a pending load but do not clear already loaded state.
- Impact: Previous user's private dictionary names and collection/destination state disclose to the next account; polling may continue with the changed identity. Server ownership checks still protect foreign dictionary contents/writes.
- Fix: Key/reset collection state by actor/session, abort work and guard late callbacks/pagination/results against identity changes. Clear dictionaries, tasks, marks, operations and selection. Apply matching actor fences/remount to public copy dialogs and late success callbacks.
- Required closure evidence: Actor switch with existing and delayed dictionary results, late job result, and copy completion cannot render previous actor private state or continue operation with a new actor.
- Disposition: Open; root notified promptly.

## Other conclusions

No additional material security finding confirmed. Capabilities remain fragment-only in UI/login links and header-only for API requests; random ephemeral query identities omit secrets and shared queries have zero GC lifetime. Share issuance completion checks current owner; transient map clears on owner change. Public routes set no-referrer/noindex metadata, preview links use no-referrer. React text nodes render source/model/dictionary text without raw HTML. Selection offsets/context/direction are validated server-side and UI uses actual selected sentence offsets. Native dialog/portal adaptations introduce no HTML execution or external navigation boundary.

Owner metadata queries constrain owner/resource; public projection independently selects visible saved translations and omits owner-only metadata. Added SQL uses bound values, advisory locking serializes owner/key replays, fingerprints distinguish operation payloads, and new-folder copy/text insertion/idempotency stay within one transaction. Disposable runners require explicit local test targets/ports/Redis DB confirmation; fixture model/email behavior is deterministic, uses synthetic credentials and is outside production composition.

No separate public-copy cross-tenant write defect asserted: destination queries already include user ID and foreign selected folder IDs remain server-denied. Late copy callbacks should still be fenced as part of actor-state remediation. Author browser proof remains author evidence, not an independently repeated browser run; stricter multi-paragraph rerun was pending at the initial review capture.

## Captured inspected identities

```text
8d632d3b823f24b5c9b5f9607258af21ed06260fa26ec132b6125bbe897775f5  apps/web/src/fsd/pages/texts/hooks/use-text-workspace-data.ts
7f13456e1b99b13edc4bf11ac7d98e4ac4a49d73158aa8fb9a84762f74123319  apps/web/src/fsd/pages/texts/hooks/use-text-workspace.ts
09d43dbd7ae824fa8f6d1e6abd64800007c7324551df26bfb4bde3ff1957e401  apps/web/src/fsd/features/auth/model/auth-provider.tsx
c44182a94d8c4baa0b3276d80db568c1cfd892e6665dbd66024482d4683ab896  apps/web/src/fsd/features/text-reading/hooks/use-collect.ts
8ef0cdbd3f847fba54a63c0b4ee13d4158a06a83eb78dfbad92dcd66517b515b  apps/web/src/fsd/features/text-reading/hooks/use-collection-jobs.ts
bb37ff1cc90c934f7b7a4189247c7ec180a9822a08c83f83bb372f7f3a53a7c7  apps/web/src/fsd/features/text-reading/ui/text-reading/text-reading.tsx
af143ef4d10052d0bdfcb6f714121bb125d9b4c523ab2a7fb287f82f923f538f  apps/web/src/fsd/pages/texts/hooks/use-shared-text.ts
4c679806fe019330d2c76a240135d7df5665befd05db94c923a31c05dd417839  apps/web/src/fsd/pages/texts/hooks/use-shared-text-copy.ts
a141020d6a0040668ef7efa779e6d0ab823c432d12c57e2a4496860d53858367  apps/web/src/fsd/features/text-management/hooks/use-text-share.ts
076e611ab12285b77165e6fdccb9ea8973170bd3401283f1a93b8e728f9f3769  apps/backend/src/modules/texts/infrastructure/persistence/drizzle/drizzle-text-content-store.ts
e0d55bf005dd674684dbb3d36bda168c833bc9f9ab0167afb4b17ee5a4dfca59  apps/backend/src/modules/texts/interface/http/text-content.routes.ts
e7c2de6a4838e8042e90d6e4d76c325b4d26654748a24393ce200be75c2ea269  packages/contracts/src/texts/index.ts
c9f71eef7bc9f6dc2cf569441ece8515bef3920af267d51eebd2dc16f6dbc137  scripts/run-texts-all-e2e.mjs
10b3f89b6e87269b6c93c09dcb287060724a40001d2926c862f0a2bbf80c7818  scripts/run-texts-web-e2e.mjs
b124c9fc93d2aeb6f9ecd71bd0d64fe7f5f6d427e509822cde7906441a622510  apps/backend/tests/support/texts-web-server.ts
```

## Bounded remediation review — SEC-UI-02

SEC-UI-02 is closed. Reader identity now requires `collectionActorKey`; the public caller supplies status/user/session identity and remounts collection state immediately on change. Dictionary loads, enqueue/poll and cancellation use abort controls retired on remount; late mocked responses cannot update the next actor's instance. Public copy resets/remounts on actor changes, synchronously increments an authority epoch via session subscription, aborts current requests and asserts authority both inside delayed authentication callbacks and after responses before destination lookup/cache invalidation/success callbacks. No new material finding confirmed.

Independently executed targeted collect/view/copy13 tests and actor isolation3 tests:16/16 passed. Reviewed actor tests use a shared QueryClient and intentionally stable session request wrapper; cover loaded A dictionaries, delayed A list, aborted job completion/marks/toast. Copy regressions cover late A result and an authentication callback delayed until replacement actor. No browser rerun was duplicated for this bounded security repair. SEC-UI-01 remains open pending workspace freeze and review.

Remediation captured identities:

```text
c70cea731bdb011d1b62e70f2b2ce68beeff2a8e8fc23828ac224bdbce97b4eb  apps/web/src/fsd/features/text-reading/types.ts
bb37ff1cc90c934f7b7a4189247c7ec180a9822a08c83f83bb372f7f3a53a7c7  apps/web/src/fsd/features/text-reading/ui/text-reading/text-reading.tsx
c44182a94d8c4baa0b3276d80db568c1cfd892e6665dbd66024482d4683ab896  apps/web/src/fsd/features/text-reading/hooks/use-collect.ts
425bc97da83ec9548da3ad1e7c4a1ef7f435c811321fbc18d43bab4c95aa4d24  apps/web/src/fsd/features/text-reading/hooks/use-collection-jobs.ts
f5d105dae230daeab249b7561af6265bfb3038eb177402b9cff66e49427744e0  apps/web/src/fsd/pages/texts/ui/public-page/shared-texts-page.tsx
6dd5cf2bbe17b37ff2ef1073bb0e3942ac9b8b88370c9dd3948877e33bfdb6b5  apps/web/src/fsd/pages/texts/hooks/use-shared-text-copy.ts
6e3cd50061cff630feaf1b8441f122dcb2f5198b21eea0b5ab95785864b43f6d  apps/web/tests/texts-reading-actor.test.tsx
4d05cd358b52ad6ea8b0b76f25fda3d656e2bba26fa4f0b077858182e6d05776  apps/web/tests/texts-public-copy.test.tsx
```

## Bounded remediation review — SEC-UI-01

SEC-UI-01 is closed. Workspace folder, text and generation-job queries now include actor identity; document adoption writes only the same actor key. Workspace component identity includes actor, discarding the prior actor's draft/editor/job state. Scoped request authority checks both mounting and the live session owner before invoking authenticated API callbacks and after responses, rejecting delayed old-account results and retries that would use a replacement actor's token. Save adoption and generation continuation use the same authority. Browser account identity changes reset the workspace before B can consume A's cached document; backend404 remains authoritative. No new material finding confirmed.

Independently executed workspace account/job/controls tests:6/6 passed. Read new same-QueryClient A→B pending/404 regression and late-response/retry guard assertions. Root confirmed workspace production source frozen, with the captured identities below. Combined bounded independent remediation tests22/22 passed. Both security findings are resolved; no remaining material security blocker in the reviewed scope. Subsequent visual whitespace-only changes require their own fidelity/selection verification and do not inherit a claim of source identity from these hashes.

```text
7d25f221906a135095a6fcf8837a18c97fcb485407a000b4a4ec4d2568392cd1  apps/web/src/fsd/pages/texts/hooks/use-text-workspace-session.ts
8d632d3b823f24b5c9b5f9607258af21ed06260fa26ec132b6125bbe897775f5  apps/web/src/fsd/pages/texts/hooks/use-text-workspace-data.ts
402e236b2936d33f7c84e59f01c8a96aa0323ea9da61d3750f348266eb217091  apps/web/src/fsd/pages/texts/hooks/use-text-workspace.ts
4ce8b54adbdc8b0d6c5bd6530e52e707026f3d3a3264df7f398040ef827fc8b9  apps/web/src/fsd/pages/texts/hooks/use-text-workspace-save.ts
53a48ae126ea24e779eed8dc77ee702ab1dc7c0cc623bcab6cada60c378d4c83  apps/web/src/fsd/pages/texts/hooks/use-text-workspace-job.ts
63cbb34fe50003c08167869d03a4866928592335e370544531cb122defcdb29b  apps/web/src/fsd/pages/texts/ui/workspace-page/workspace-page.tsx
788dd61b622e66fe046348aa1618a1aac8b20624bfc1f0a39b264d5ef0c1fa6c  apps/web/tests/texts-workspace-account.test.tsx
```

## Bounded final context delta

Approved: `resolveTextSelection` filters whitespace-only Intl.Segmenter units from both current-pair sentences and neighboring-pair sentence lookup. Filtering preserves each nonblank segment's original index and exact segment text, so UTF-16 selection boundaries, surrogate checks, selected phrase limits, single-sentence containment and returned sentence-relative offsets retain their existing validation. It changes only context neighbor choice; no authentication, source authority, persistence boundary or untrusted executable content is introduced. Existing source/translation direction reversal remains intact. Reviewed three new domain cases covering source and translation paragraph neighbors plus an edited multi-sentence pair with original-offset slicing. Root's red-before/green-after execution and final browser rerun are recorded separately; no expensive runtime was duplicated by this bounded security review. No new material finding, final security approval retained.

```text
2c115ee1e75dedffdd2dfe76620a5c95081274d03a7e300a577e8c0aec229a7d  apps/backend/src/modules/texts/domain/text.ts
7bbaab22bc569382fdb1f4d58e94ab1813c86793cf386cf8590a34e560bd5397  apps/backend/tests/unit/modules/texts/domain/text.test.ts
```
