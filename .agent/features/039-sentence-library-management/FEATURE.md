# Saved sentence management and full-dictionary preparation

Status: Complete
Owner: Engineering
Created: 2026-10-06

## Problem and authority

User approved the conversational plan and explicitly requested implementation.
Sentence practice lacks a saved-content management surface and durable full-dictionary
preparation. Deliver backend first, then two saved design prompts; defer new UI until
returned Magic Patterns designs. Baseline main is the locally squash-integrated
completed sentence work (previous source63971c7). No push or branch deletion.

## Acceptance criteria

- AC-1: Live-authorized owner/shared learner library lists current/archived/outdated examples and explicitly expands reference/mappings/hints without exposure, review, score or credit changes.
- AC-2: Per-user selected/all-matching archive/restore is reversible, atomic, versioned and idempotent; other learners are unaffected. Global archive is independent. Archived content is excluded from future selection/replay/check/reveal while history is retained. Outdated restoration is not practice eligibility.
- AC-3: Admin active membership/recent authentication/reason/audit authorize per-user available+generated inspection, personal/global archive/restore and creator-archived filter. No content, hint, answer or score editing.
- AC-4: Admin selected/all-matching creator-archived-only permanent deletion validates immutable confirmation snapshots, rejects busy unsettled work, erases whole affected content/history/job payloads, preserves numerical accounting and replay-safe content-free receipts.
- AC-5: Optional full-dictionary background preparation snapshots eligible versions, partitions<=100 with intended practice scope first, reuses saved-first, adds fresh new-only examples, and performs no paid review-only work.
- AC-6: Durable preparation uses existing generation/credit/provider/worker capacity, admits one child at a time, supports reconnect/stop/settlement/resume/partial practice, and pauses safely on credits/capacity/model/provider/stale/access failures. Publication does not count as practice exposure.
- AC-7: Prepared partition manifests feed bounded practice through preparedBatchId without regeneration, respect current versions/visibility/access, freeze partial ready coverage and preserve ordinary/exact-replay semantics. Whole dictionary preparation does not increase100-word round limit.
- AC-8: Additive migration, restricted-worker compatibility/grants, account/dictionary/entry erasure participants and old-worker fencing are verified with disposable data and deterministic providers; relevant contracts/unit/integration/API/static/build checks and independent/security reviews pass.
- AC-9: Detailed implementation plan/backlog/guide links and two versioned no-API-path design prompts cover every supported state. Stop at awaiting-design checkpoint; overall feature is not Complete there.

## Constraints and exclusions

ADR0010/0019/0022/0023/0024/0026/0027 remain authoritative. No new worker process,
AI provider, credit pricing/grants, admin role, production dependency, deployment
strategy, mobile UI or editing capability. Existing references stay private in
ordinary exercise/job responses. Permanent deletion is synchronous when safe,
with retryable busy rather than a new pending-deletion executor.

## User-flow documentation

Backend executable coverage extends the existing sentence-practice-backend guide
and composed authenticated journey rather than duplicating its startup command.
The new stable scenario is `manage-saved-library-and-partial-preparation`.
Administrative mutation/auth/erasure proof uses focused real database tests.
Existing web/admin guides link this backend-only checkpoint; their new browser
journeys will be added when the selected designs are integrated. No new frontend
controls or browser verification are claimed at this stage.

## Open decisions

None. User choices are frozen in the linked implementation plan.

## Frontend delivery resumed — 2026-10-07

The user returned the updated Magic Patterns design and explicitly requested
faithful integration of its `/sentences` surfaces. They authorized local,
responsive admin composition using existing admin conventions. This resumes
AC-9 after the backend checkpoint and includes the new browser journeys;
external admin design delivery is no longer a prerequisite.

### Source-derived fidelity inventory

The retained source is linked in DESIGN.md. Each item needs real runtime proof.

| ID       | Source requirement                                                                                            | Implementation owner          | Proof required                         |
| -------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------- |
| LIB-01   | Breadcrumb, outlined header card, dictionary language pair, practice and prepare actions                      | Web library page              | Desktop/mobile screenshots             |
| LIB-02   | Direction/personal/currentness filters, collapsed advanced global visibility, mobile filter sheet             | Library filters               | Filter journey and narrow screenshot   |
| LIB-03   | Compact selectable sentence rows, source text, direction/status badges, preview/archive actions, mobile menu  | Library rows                  | Selection and responsive evidence      |
| LIB-04   | Sticky selection toolbar, select all matching, frozen-count archive/restore confirmation and failure states   | Library selection             | Mutation/conflict browser journey      |
| LIB-05   | Loading/error/empty/no-match/pagination states                                                                | Library state components      | Rendered states and retry              |
| LIB-06   | Desktop preview drawer/mobile full-height view, collapsed reference, grouped hints, availability explanations | Library detail                | Preview without practice side effects  |
| PREP-01  | Preparation OFF by default; round/dictionary scope tiles, credit and reuse notes                              | Sentence setup                | Setup screenshot/default assertion     |
| PREP-02  | Preparation chip, background-safe sheet, progress, reason-specific notices, ready rounds, stop/resume         | Sentence preparation          | Durable background and restart journey |
| PREP-03  | Start a ready/partial partition without implicit generation; loading/stale/access states                      | Prepared practice integration | Real API/browser journey               |
| ADMIN-01 | Responsive per-user library discovery, filters, list/detail and reasoned personal/global mutations            | Admin local composition       | Desktop/mobile browser evidence        |
| ADMIN-02 | Creator-archived deletion guard, explicit confirmation, recent-auth/conflict/busy errors                      | Admin local composition       | Guard/error and mutation proof         |

Contract adaptation: the library API exposes a cursor, not a total count. Show
the loaded count and continuation honestly; all-matching confirmation uses the
authoritative frozen snapshot count. Public creator identities are unavailable
by design; show private/shared ownership context without inventing attribution.
Prototype scenario controls, fake timers and mock records are excluded from
production. Runtime session/access validation replaces their simulated states.

Additional safe adaptation: the source success notification offers immediate
Undo, but mutation receipts return a count without the exact resulting versions
or affected identities for all-matching actions. The implementation instead
offers the removed-examples view, where restoring uses current versions and a
fresh confirmation. It does not overwrite intervening visibility changes.

## Whole-feature completion — 2026-10-07

AC-1–AC-9 are complete, including the returned learner source and locally composed
responsive admin UI. Final web 9/9, admin 9/9 and existing owner flashcard 1/1
browser journeys pass; static, unit, builds and guide checks pass. Independent
completion/security review approves the final candidate with the documented
SEC05 low residual retained. See EVIDENCE and REVIEW. No production deployment,
manual content editing, push or branch deletion is included.
