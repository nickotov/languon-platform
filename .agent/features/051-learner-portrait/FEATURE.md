# Learner portrait and AI interview

Status: Complete — original delivery and user-reported interview UI/credit follow-up verified and independently reviewed (2026-10-21)
Authorized: 2026-10-20, user “Implement the plan”; prompt destination confirmed as docs/design-prompt once logic is done.

## Problem and desired behavior

Deliver the learner-owned approved portrait and standalone guided interview described by LP-01–LP-30 in [the design decisions](../../../docs/learner-portrait-design.md). Backend logic is implemented, verified and independently reviewed; the detailed Magic Patterns brief is saved. The user supplied and explicitly selected Magic Patterns v001 on 2026-10-21; its captured source determines the UI.

## Acceptance criteria

| ID | Observable result |
| --- | --- |
| POR-01 | Dashboard/settings offer the optional guided interview and manual creation on desktop and mobile-sized web layouts. |
| POR-02 | Questions provide options, custom answers, skip/pause/early review; partial information remains useful and unknown information is not invented. |
| POR-03 | Confirmed editable items and their readable summary agree; manual Save needs no AI call, and an empty portrait cannot be saved. |
| POR-04 | Interview output is a draft; only explicit approval replaces the approved portrait, independently of use enablement. |
| POR-05 | Global off and per-chat exclusion prevent new portrait supply; original manual settings persist and older history is not represented as forgotten. |
| POR-06 | Existing-chat adoption preserves settings; new-chat inheritance and manual override labels follow LP-22/29, with independent chat mode. |
| POR-07 | Approved changes affect the next message; in-flight work retains its initial context and charging policy. |
| POR-08 | One unfinished interview resumes across devices; stale proposals cannot overwrite newer approvals without conflict review. |
| POR-09 | Approval/discard removes interview state; 14-day inactivity expiry preserves the approved portrait; confirmed deletion cannot be undone by pending work. |
| POR-10 | The interviewer cannot inspect other chats/activity, infer diagnoses, publish changes, or silently enable use; off-topic requests offer the bounded Knowledge redirect. |
| POR-11 | Custom answers allow 200 characters; interviewer chat allows 1,000; chat-derived answer summaries allow 200 and remain reviewable. Ordinary-chat limits are unchanged. |
| POR-12 | The server-only flag enables interview-only zero user charge while preserving provider accounting and execution limits; flag-off behavior follows existing rules. |
| POR-13 | Failures preserve editable unfinished work until its expiry; paid/free notices match the operation policy and manual actions never invoke AI. |
| POR-14 | Known/studied/explanation languages remain distinct; proficiency is self-described, age use is limited, and future recipient context is not confused with the requesting account. |
| POR-15 | Selected-language rows follow the user's retained screenshot: language left, labeled description select middle, learning checkbox aligned with the select; narrow layouts remain usable without overflow. |
| POR-16 | Both interview language questions initially show Russian, English, French, Spanish, German, Serbian and Polish in that order; Show more exposes the expanded portrait language choices including Turkish/Hungarian, preserving custom/adaptive choices and selected details. |
| POR-17 | Short interview requests use a conservative request-specific pinned input hold, rather than the full model input capacity. A sufficient20,000-credit grant admits and funds the representative first response; genuine insufficiency, concurrent allocation, immutable pricing, bypass, actual settlement and older in-flight policy remain correct. |

## Scope and constraints

Backend: shared Zod contracts; focused learner-portraits DDD module; private persistence, approvals, bounded drafts, standalone resumable interview, scoped accounting, chat preference/context integration, account erasure. Frontend: home entry card, profile management, interview/manual/review pages, chat controls, current app primitives/CSS Modules/tokens, all four interface locales.

No ordinary-chat input limit change, diagnosis inference, automatic publication/use enablement, history scraping, native mobile, course generation, teacher profiles, credit-pack entitlement, or deployment. Provider usage accounting and operational limits remain active in free interview mode. No paid-model test calls.

Accepted ADR-0044 records the user-approved plan; preserve ADR-0022/0026/0037 invariants. Treat model output and portrait text as bounded untrusted data. Meaningful user edits/submissions refresh the fourteen-day unfinished-interview expiry; passive reads and background calls do not. No revision-history UI in v1; version counters enforce optimistic concurrency.

## User-flow documentation

docs/user-flows/learner-portrait.md maps authenticated API and real browser journeys through the reviewed disposable runner. Related shell, locale, authentication, profile and contextual-assistant mappings are synchronized. Keep execution and final source identity in EVIDENCE.md.

## Supplied-design coverage

Selected source: https://www.magicpatterns.com/c/wfhhgj71csfpmjd8jyunam, artifact80c0d47f-8bcc-4c85-8f90-4c6557e9811b. All82 files retained under designs/learner-portrait/v001/source with capture/hash manifest. Rendered comparisons remain required before fidelity completion. Canonical prompt is saved at docs/design-prompt/learner-portrait.md, with DESIGN.md and an exact v001 snapshot owned by this feature. The user's latest instruction requires prompt publication after backend logic is verified.

## Delivery boundary

Branch feature/learner-portrait created from main 5efaafe. Prior committed sidebar work remains on feature/sidebar-navigation, and the discovery stash is retained as a recovery copy. Number 050 is already allocated there; 051 deliberately avoids collision. No unrelated sidebar commits are included. Current UI implementation may need later integration with that branch but backend work is independent. Do not mark feature Complete or squash-merge an incomplete UI delivery.


## Selected-source fidelity inventory

Source root: `designs/learner-portrait/v001/source`; immutable identity in DESIGN.md. This inventory was derived from source inspection before each worker's implementation. Rows map the original LP-UI-01–12 brief. Required unless an authoritative adaptation is recorded below; runtime evidence/dispositions in EVIDENCE.md.

| IDs | Required source content and geometry | Local owner | Verification |
| --- | --- | --- | --- |
| MGMT01 / LP-UI-02 | Intro max672px,16/24px gutters,24/40px vertical,back/eyebrow/title,optional/update copy,free/paid and14day rows,disclosure,Start/Manual/Back,existing Resume/Review/Discard | pages/learner-portrait intro | Desktop+narrow intro/cost/resume |
| MGMT02 / LP-UI-01/06 | Overview max896px,24px gaps,status/saved-first enable action,empty/pending/approved states,Use switch,summary/details/date,edit/interview/delete | overview + portrait-entry | Empty/saved-off/in-use/update/reload |
| MGMT03 / LP-UI-04 | Manual max1152px,2:1 grid at1024px,sticky summary and narrow bottom save bar,live summary/diff,empty/invalid/unchanged/error | manual + portrait-editor | Partial/manual/noAI/200limit/mobile |
| MGMT04 / LP-UI-05/09 | Review samegrid,proposals Add/Ignore/Edit,latest-versus-draft perfield conflict choices,reconcile,save/continue/deeper/discard,no draft/resource failure | review + conflict/dialogs | Proposal/conflict/retry/approval |
| MGMT05 / LP-UI-02/10 | Native expandable shield disclosure,8data-use bullets,radius16,border | data-use-details | Expanded/keyboard |
| MGMT06 / LP-UI-10 | Small delete dialog,cancel/confirm/pending/retry,ordinary-history warning | delete-dialog | Cancel/confirm/fencing |
| MGMT07 / LP-UI-06/07 | Use control,disabled notice,fresh-chat action | portrait-use | Globaloff/historywarning |
| MGMT08 / LP-UI-01 | Single home card + settings entry,44px Sparkles icon,empty/pending/savedoff/inuse/update states,realexpiry | portrait-entry + Home/Profile | Entrypoints desktop/narrow |
| EDIT01 / LP-UI-04 | Six bordered radius16 editor sections,16/24px responsive padding,counts | portrait-editor | Wide/narrow/locales |
| EDIT02 / LP-UI-04 | Language cards,selflevel,Learning now,200character clarification,suggested/custom language add/remove | languages-editor | Unknown/selfreported/independence |
| EDIT03 / LP-UI-04 | Explanation-language chips,Helpful/Sometimes/Avoid radios,optional In your words | explanation editor | Threechoices/200/roundtrip |
| EDIT04 / LP-UI-04 | Goals/accommodations/interests multiselect and removable custom chips | list editor | Partial/skip/custom |
| EDIT05 / LP-UI-04 | Independent tone,length,wording,approach radios + no preference | style editor | Independent overrides |
| EDIT06 / LP-UI-04 | Optional broadage radios + life-context disclaimer | age editor | Optional/unknown |
| EDIT07 / LP-UI-04/06 | Live deterministic summary card,empty/sparse guidance,summarylanguage | summary panel | Manual update/noAI |
| EDIT08 / LP-UI-06 | Responsive confirmed definition list + editable/removable confirmednotes | details/notes editor | Notes/200/remove |
| EDIT09 / LP-UI-05 | Added/changed/removed diff + approved-active notice | update diff | Review conflicts |
| INT01 / LP-UI-03 | Sticky header/back,title,topicdots/list,locale,preview/pause/review counts | interview header | Desktop/narrow/keyboard |
| INT02 / LP-UI-03 | max3xl transcript within max6xl,update notice/previousapproved | interview layout | New/returning/resume |
| INT03 / LP-UI-03 | One adaptive question,help,structured languagelevel/learning,mixedlanguage/style fields,multi/single options | question fields | Answer/skip/partial/custom |
| INT04 / LP-UI-03/08 | Custom200counter,Continue/Skip;sticky chat1000composer/send/cost | question/composer | Graphemes/clarify/charging |
| INT05 / LP-UI-03 | Update-topic choice,optionaldeeper,reviewearly/complete | question/deeper | Returning/optional |
| INT06 / LP-UI-03/05 | User/interviewer transcript,proposal Add/Ignore/Edit,sourcequote onlywhenreal,redirect Knowledge/continue/pause | transcript/proposal | Review before approval |
| INT07 / LP-UI-08 | Generating/stop/retry/offline/credits/context/expired states,pinnedpricingnotice/free-to-paid ack | interview workflow | Reconnect/stop/failure |
| INT08 / LP-UI-03 | Desktop320/384px draftpreview,summary/count/review/expiry,narrow bottomsheet | draft preview | Responsive/open dialog |
| CHAT01 / LP-UI-07 | Mode remains independent,existing real model/default controls retained | composer preferences | Mode/default regression |
| CHAT02 / LP-UI-07 | Portrait section,switch disabled byglobaloff,no portrait/create/globaloff/settings notices | portrait chat settings | No silentenable |
| CHAT03 / LP-UI-07 | Legacy preservation + explicit Use portrait preferences adoption | portrait chat settings | Existing versus new |
| CHAT04 / LP-UI-07 | Exclusion alert,retained-history warning,atomic freshexcludedchat | chat settings + panel hook | Nextmessage/fresh |
| CHAT05 / LP-UI-07 | Five independent selects,From portrait/Manual badges,Use portrait value resets | preference fields | Perfield/manualfallback |
| CHAT06 / LP-UI-07 | Nextmessage/inflight and explicitrequest precedence copy | settings | Effective context |
| ALL / LP-UI-11/12 | Fourlocales,light/dark,desktop/mobile,44pxtargets,keyboard/focus/reducedmotion;real loading/error retry | All surfaces | Representative real-browser combinations |

### Authoritative source adaptations

- Preserve the existing Languon shell/profile account controls; prototype shell, sampleidentity/credits/library, ScenarioPanel and fakeengine are reference scaffolding, not shipped product behavior. Home retains the supplied dated greeting/card layout with real identity and localized neutral greeting.
- All five designed chat fields are implemented through additive optional JSON preferences; legacy explanationLevel stays fallback-only. Automatic is an additional compatibility state representing unspecified legacy values, rather than falsely showing Concise.
- The selected source's mixed-frequency/mixingnote/confirmednotes are implemented as bounded optional confirmed fields with diagnostic safeguards and deterministic summaries. No freeform preferences are silently dropped.
- Prototype expiry tombstones cannot imply retained erased content: active metadata includes actual futureexpiry; missing/expired interviews show honest unavailable guidance without inventing an erased timestamp (LP-13/ADR-0044).
- Start fresh interview keeps its control but explicitly confirms discard of transcript/draft before restarting from approved data, matching LP-10. Cancellation preserves work. Partialfailure honestly states completed discard.
- Skip may generate the next AI reply under the existing paid policy (LP-16/27); manual review/edit/save remain free. Resumed in-flight work uses a neutral original-pricing notice when its safe DTO lacks a pricing badge, avoiding a false currentflag claim.
- Prototype source quotes appear only from an established real user submission; no fabricated quote/proposal fact. Structured proposedItems stay separate from confirmed data until explicit review.
- Knowledge navigation uses the supported /knowledge library and New note guidance; no fabricated ?new action or automatic document creation (LP-07).
- Actual contracts retain bounded list capacities and language codes, with localized/custom name-to-code input, not an invented assessment or arbitrary freeform language identifiers.

- The existing Response settings popover hosts the designed chat-settings hierarchy; actual model/default controls remain present. Prototype navigation/dialog scaffolding is not copied into the real Knowledge workspace. Its five fields, origin/reset controls, independent mode and privacy actions remain intact.
- Interviewer/user primitive exports are empty in the provider source; rendered reference DOM supplies their appearance. Owned interview-only messages preserve the measured teal palette/geometry without changing other chats. Historical timestamps are omitted because the real interview DTO has none; browser time is not fabricated.
- Runtime model/credit recovery links open an announced new tab to preserve rejected unsent text, with noopener/noreferrer. No personal browser archive is added. Privacy disclosure adds accurate provider/backup boundaries required by ADR-0044.

Final disposition: POR-01–POR-14 and all required source inventory rows are implemented and verified. Independent completion and security reviews pass after UI-C1/UI-S1/UI-S2 remediation. Current proof, source identity and residual limitations are recorded in EVIDENCE.md and REVIEW.md.
