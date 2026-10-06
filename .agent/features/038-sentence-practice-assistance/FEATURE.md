# Sentence practice vocabulary assistance and completion

Status: In progress
Owner: Root
Created: 2026-10-05

## Problem and authorization

The user explicitly authorized this feature extension on 2026-10-05. Existing hints cover only dictionary targets. Free reference reveal does not compare answers. Completion leaves the exercise visible and puts statistics in a separate dialog. All three product clarification answers are confirmed.

## Acceptance criteria

- AC-1 — Newly generated exercises provide bounded target-language lexical hints for useful additional nouns, adjectives, verbs, adverbs and contextual phrases. Idioms, phrasal verbs and inseparable phrases are whole hintable units. Simple grammatical helpers need not be hinted. Dictionary targets remain distinct and preserve assessment and coverage identity.
- AC-2 — Additional hints are generated alongside the sentence/reference, validated against exact source reconstruction and grapheme boundaries, saved and reused without another AI call. Existing saved exercises remain usable with their existing hints; no automatic paid enrichment or destructive regeneration.
- AC-3 — A separate free comparison uses the saved reference with zero credits or unavailable AI. Ignore case, whitespace, punctuation and typographic apostrophe differences; preserve accents, word order and meaningful characters. Report a normalized match or a difference with the warning that another translation may be valid. Preserve the exact draft. No AI score, semantic correctness claim or quality rating; manual/reference-assisted counts remain separate.
- AC-4 — After checking, revealing or skipping the final sentence, replace practice with session statistics and Repeat these exact examples / Generate new examples. Exact replay preserves the sentence sequence without generating or silently selecting other saved content. Fresh mode uses existing bounded admission, billing and recovery. The final sentence must remain answerable before that action.
- AC-5 — Preserve existing owner/shared authority, current versions, reference privacy, erasure, AI checking, disclosure metadata, saved-first behavior, idempotency and finite batches. Helper vocabulary never creates dictionary targets or mastery claims.
- AC-6 — After backend verification, save a detailed versioned design prompt to docs without concrete API paths, covering all hint, comparison, replay, completion, loading/error/empty/access-loss/zero-credit states. The backend-first handoff is preserved; the returned v8 source is selected and integrated with the adaptation inventory below.
- AC-7 — Relevant contract/domain/provider tests, real disposable database/cache evidence, affected static/build checks, mapped guides/E2E and independent completion/security review establish delivery. Real browser proof is required for subsequent UI implementation.

## Scope and constraints

Extension of features036/037 and BL-004. No Jev integration, model replacement, automatic paid legacy enrichment, dictionary creation from helper vocabulary, credit/rate policy change or production rollout. Preserve all pre-existing uncommitted maintenance work outside this feature's commit/merge boundary.

Public exercise JSON may support additive fields without a relational migration; verify actual schema and older-worker compatibility before finalizing. No logging raw prompts, answers or model output; no paid providers in tests.

## User-flow documentation

Update existing docs/user-flows/sentence-practice-backend.md and sentence-practice-web.md for delivered behavior. Mapped tests: apps/backend/tests/integration/modules/learning/sentence-practice.journeys.test.ts and apps/web/tests/e2e/sentence-practice.journeys.spec.ts. Inspect stable scenario mappings before changing guide revisions. No separate journey guide is needed for extensions to the existing practice journey.

## Product decisions

2026-10-05: explicit feature authorization; conservative comparison; completion after final check/reference/skip. Exact replay and explicit new generation required. Backend-first design checkpoint remains active.

## Agent registration boundary

Sentence generation and checking remain intentionally excluded from Mastra Studio
composition. They execute only through the learning worker/provider after live
dictionary authorization, fenced job admission, pinned model/credit budget and
lease ownership. Studio lacks that authenticated learner/dictionary/job context;
registering these production agents there would bypass the execution boundary.
This checkpoint provides deterministic provider/domain/disposable journey tests,
not a safe synthetic Studio harness. No Studio registration or new manual model
execution journey is intended. This exclusion satisfies the backend agent-change
checklist and must be revisited if a dedicated synthetic Studio harness is scoped.

## Selected design inventory

Selected source: Magic Patterns v8 artifact recorded in DESIGN.md; retained source is untrusted design input only. Existing runtime tokens, shared controls, contracts, server authority and localization replace prototype-only mechanics. Prior designs remain preserved. Browser comparisons and final disposition are recorded in EVIDENCE.md; no pixel-fidelity claim without external rendered reference.

| Requirement | Retained source                                | Production mapping / adaptation                                                                                                                                             |
| ----------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SPH-01      | PracticeSurface, PracticeShell, SessionResults | One current practice surface; results replace body/footer after final action.                                                                                               |
| SPH-02      | PracticeSetup, SetupScope, SetupMode           | Existing bounded100 setup and saved-first/review/new choices preserved.                                                                                                     |
| SPH-03      | HintedSentence, HintLegend                     | Required solid/bold and support dashed triggers, non-color labels and counts.                                                                                               |
| SPH-04      | HintedSentence                                 | One phrase span; independent repeated triggers share disclosure ID. Real displayed hover disclosures are recorded.                                                          |
| SPH-05      | PracticeGallery, GroupHints                    | Coherent fake fixtures belong maintained tests; prototype sentences do not become product data.                                                                             |
| SPH-06      | DraftField, AiResultPanel                      | Exact draft and submitted feedback, existing paid AI default; normalized strings never replace user draft.                                                                  |
| SPH-07      | ReferenceCompare, referenceCompare             | Free match/different/reference-only panel, original answer/reference, ignored-difference details and disclaimer. Conservatively retain symbols/accents/order.               |
| SPH-08      | PracticeActions, GroupFree                     | Explicit authorized reference retrieval; manual counted once separately; no automatic free fallback.                                                                        |
| SPH-09      | usePracticeRound, GroupResults                 | Coverage appearance is separate from final successful check/reveal/skip. Failed work keeps final exercise active.                                                           |
| SPH-10      | SessionResults                                 | Presented/unique covered/AI/manual/skips, AI-only rating breakdown, last details and round example list; no mastery claim.                                                  |
| SPH-11      | GroupReplay, usePracticeRound                  | Existing review-only requests with bounded exact IDs; whole-list live preflight and per-item validation, original order/no substitution/no generation.                      |
| SPH-12      | GroupReplay, PracticeSurface                   | Explicit fresh mode with frozen selected vocabulary; prior completed snapshot survives admission/error/cancel until first accepted fresh exercise.                          |
| SPH-13      | JobStatus, PracticeNotice, usePracticeJob      | Existing durable operation IDs, polling/countdown/cancel/unknown recovery retained; results show queued/running fresh job.                                                  |
| SPH-14      | PracticeNotice, GroupWork                      | Existing typed actionable notices and explicit free controls; no invented scores or implicit generation.                                                                    |
| SPH-15      | HistoryView, GroupReplay                       | Inline personal history/back, current server permissions/version validation; protected content erased on access/stale failure.                                              |
| SPH-16      | PracticeShell, GroupLayout                     | Existing shared viewport dialog100dvh/100dvw and fullscreen continuity, sticky reachable header/footer.                                                                     |
| SPH-17      | AiSettingsView, LeaveGuard                     | Inline current preferences and history with Back; existing unsaved work guard retained.                                                                                     |
| SPH-18      | All product components, GroupLayout            | Runtime shared controls/tokens, localized RU/FR/ES, keyboard hint close/focus, results heading focus, source lang/RTL and dark tokens.                                      |
| SPH-19      | PracticeGallery, practiceStates                | Gallery is design-review material; corresponding supported states tested/rendered via maintained journeys, not a new production route.                                      |
| SPH-20      | App, types/practice                            | Exclude review controls and unsupported richer fake helper metadata; public contracts carry lexical hint/kind only. No invented semantic notes or alternate-answer grading. |

Material source adaptations: exact-replay failure uses the existing uniform typed stale/access notice, rather than invented per-example deletion/revocation reasons or positions from fixtures; current API deliberately does not disclose those details. Return-to-dictionary uses the persistent Close practice control and existing unsaved/pending-work guard. Settings/history use the same practice dialog with Back. Numeric punctuation and symbols remain meaningful under conservative free comparison. Existing model revisions and v1 saved exercises are not silently mutated or regenerated; v2 generation remains explicitly configured with a compatible active revision. These adaptations preserve security and product contracts rather than reproducing prototype assumptions.

## Current delivery state — 2026-10-06

Approved updated v8 practice UI is implemented and verified: AC-1–AC-7 and SPH-01–SPH-20 pass independent product/security review, 73 focused checks and seven mapped real-browser journeys. Human plan and applicable user-flow guides are synchronized. Owned verification infrastructure has been removed. Status remains in progress for C6 only: obtain explicit authority for the combined prerequisite-maintenance Git boundary (or a separately established baseline), then perform the required scoped local feature commit/squash merge. No commit/merge, user env change or active model-revision rewrite has been performed.
