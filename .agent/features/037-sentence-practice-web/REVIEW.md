# Web design integration review

Status: Complete — independent completion and security review passed
Updated: 2026-10-05

## Author preflight

ImplementedAC1–7 and source inventories. Unit/static/build/newcritical browser checks pass; evidence in EVIDENCE.md. Realbrowser screenshot exposed nativefullscreen layering bug; ownmodal ordering and foregroundhit test remediated it, retaining state/focus. No paid AI or production enablement.

## Independent completion review

Completed by `/root/sentence_web_completion_review`, including initial review and bounded remediation audit.

## Independent security review

Completed by `/root/sentence_web_security_review`, including access-loss remediation and the outer-preview boundary clarification.

## Known adaptations

Publiccatalog supplies rates/capabilities but not provider marketing/savedtime; no fakecreditbalance. Sharedruntime Dialog/tokens retained, source modal hierarchy controls preserved. Browsers without Navigation API use an early root traversal dispatcher and indexed restoration; the real immediate Back/Keep/Discard/Forward journey passes. Source exports available but provider renderedreference inaccessible: runtime assessed against source, not pixel-identical screenshot claim.

## Initial independent review — 2026-10-05

Completion reviewer assessed entire feature tracked/untracked diff from89094248 and pinned UI inventories; security reviewer independently assessed authorization, transport, personal cache, modeltext and test infrastructure.

| ID         | Severity | Finding                                                               | Remediation / status                                                                                                                                                         |
| ---------- | -------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F037-R1    | High     | Anonymous share sign-in drops fragment capability                     | Widget preserves validated key in login fragment; actual browser sign-in journey added, execution pending.                                                                   |
| F037-R2    | Medium   | Failed checks incorrectly acknowledge draft and bypass leave guard    | Controller acknowledges onlycompleted stored attempt; UI compares acknowledgedAnswer, pending/uncertain guard retained; unit/browser verification pending.                   |
| F037-R3    | Medium   | Initial entry failure Retry with nullcursor isno-op                   | Setup action refreshes initialpage; focusedUI regression pending.                                                                                                            |
| F037-R4    | Medium   | Over-limit draft silently truncated, no counter/error                 | Exactinput retained, codepointcounter/error and paidcheck disabled; controller tests passed, newUI/browser proof pending.                                                    |
| F037-R5    | Medium   | Repeated Cancel remains enabled aftercancellationRequested            | Disabled/loading Stopping UI, browser slowjob test pending.                                                                                                                  |
| F037-R6    | Medium   | Unknown progress renderedaszero                                       | Progressloading/error/free retry; lastvalid counts retained, never inventzeros; controller tests passed, UI regression pending.                                              |
| F037-R7    | Medium   | NonNavigationAPI Back loses dirtypreference                           | Minimal numeric existinghistoryposition tracking + capture/restoration/replay; no entries/personaldata added; sixnavigation unit tests pass, realbrowser fallback pending.   |
| F037-R8    | Medium   | Compact dialog start isnotactualdialog; history/summary centered      | Hide compactdialog start; actualmobile bottomsheetvariants andwidth/bottom override acrosscompactbreakpoint; browser proof pending.                                          |
| F037-R9    | Medium   | Header missingmode/explanationlanguage                                | Localized metadata +direction added; browser/source proof pending.                                                                                                           |
| SEC-037-01 | Medium   | Session accessloss leaves siblinghistory/setup private cache readable | Render-synchronous shared accessgate, persistentblockedstate, allstoreinvalidate/reset andoverlaysclose; cross-cache actualrevocation withblockedrefresh regression pending. |

Additionalrequired AC7 proof: RTL/nonLatin, 200%zoom equivalent/reducedmotion andcompactsummary/history addedto browser test plan. FourLTR interface locales meaninterfaceRTL locale isnot supported; actualdictionaryRTL contents arein scope. Existing profileE2E assumesbaseline headerlink@handle althoughmain alreadyuses Accountmenu button; mechanically actualmenu assertion being repaired withoutshell changes. Combinedsignup browser suites exceededintentional5/hour clientlimit; isolated runsusefresh RedislogicalDBs.

Allmaterial findings mustreceive independently verified remediation beforecompletion. Initial review isnot a pass.

## Security remediation review — 2026-10-05

Independent reviewer `/root/sentence_web_security_review` resolved SEC-037-01.
The render-synchronous widget gate removes protected overlays as soon as any
controller reports access loss. Persistent target-scoped denial closes all
surfaces, resets the session, and invalidates both history stores and setup.
Invalidation clears cached data and fences already-running requests.

The reviewer independently ran all 49 web test files: 416 tests passed. The
expanded browser scenario asserts cached source, draft, reference and history
are absent after authoritative share revocation, with subsequent refetches
blocked. Its final fresh-infrastructure run remains pending. No unresolved
security finding remains within this remediation boundary.

## Remediation checkpoint — 2026-10-05

Completion review finds R1–R6, R8 and R9 sound in source. Five focused component
regressions pass for exact over-limit Unicode input, failed-admission leave
confirmation, unknown progress/free retry, accepted cancellation, and initial
entry-page retry. R7 remains open: the real browser fallback Back journey still
leaves the profile when Navigation API is disabled. Final AC7 browser evidence
and the overall completion verdict are pending.

## Final independent remediation verdict — 2026-10-05

All F037-R1–R9 and SEC-037-01 are resolved. The completion reviewer accepted
R1–R6/R8/R9 and protected-store clearing in source and focused tests. For R7,
closure probes established that Next's earlier Window listener removed the late
page listener before it could run. An early root layout dispatcher now delegates
to subscribed dirty-page guards. All diagnostic probes were removed. The unchanged
immediate Back browser case passes Keep editing, repeated Back/Discard, Forward,
and unchanged history length.

Final evidence: 49 web test files/417 tests, lint/typecheck/backend checks and
production build pass; all six feature browser journeys pass in 35.1 seconds.
All 23 captures are retained and inspected as described in EVIDENCE. Independent
review accepted the half-CSS-viewport layout-pressure proxy, with actual browser
zoom/DPR and native keyboard claims explicitly excluded. All mandatory source
inventory rows are accounted for with contract adaptations recorded.

No unresolved high or material medium/security finding remains. The pre-existing
profile deletion-receipt failure is independently confirmed at base main and is
outside the explicitly excluded shell/account-management scope. The already
loaded outer shared dictionary preview remains an existing boundary, while all
sentence-practice protected state is erased after denial. Neither exception is
reported as a passing assertion or erased from evidence.

Routine handoff hygiene is complete: proof caches/owned test services removed,
generated type references restored with the owning generator, current guides,
backlog and design pointers synchronized. Final local commit references are
recorded in the design handoffs after author preflight.

## Finding locations and impacts

| Finding             | Location                                                         | Original impact                                                     | Final disposition                                                                        |
| ------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| R1 (High)           | dictionary-training widget, signInHref                           | Shared sign-in could not resume without its capability              | Fragment retained; real anonymous continuation passes                                    |
| R2 (Medium)         | sentence-session acknowledgment and practice-session close guard | Failed admission could discard an unsent answer without warning     | Only stored completed attempts acknowledge; component/browser regressions pass           |
| R3 (Medium)         | sentence-setup manual-entry error action                         | Initial-page retry made no request                                  | Refresh action retries the first page; component regression passes                       |
| R4 (Medium)         | sentence-session setDraft and practice-session textarea          | Over-limit Unicode input was lost silently                          | Exact input/counter/error retained; no paid check admitted                               |
| R5 (Medium)         | practice-session active job controls                             | Accepted cancellation still appeared repeatable                     | Disabled Stopping state; real delayed-job regression passes                              |
| R6 (Medium)         | sentence-session progress fetch and practice header              | Unavailable progress appeared as real zero totals                   | Explicit loading/error/last-known totals and free retry                                  |
| R7 (Medium)         | profile navigation hook and shared history-position helper       | Browser Back discarded the unsaved choice                           | Early root dispatcher; unchanged immediate Back/Keep/Discard/Forward passes              |
| R8 (Medium)         | sentence setup/history/summary compact dialogs                   | Mobile presentation choices and sheets did not match their behavior | Honest compact start and bottom sheets; browser captures pass                            |
| R9 (Medium)         | practice-session header                                          | Learner could not see active mode/feedback language                 | Localized direction/mode/language metadata rendered                                      |
| SEC-037-01 (Medium) | dictionary-training gate; sentence-history/setup invalidation    | Cached protected practice could reappear after known access denial  | Same-render gate, persistent denial and epoch fencing; independent security audit passes |

The final affected formatter check passes. Full-root formatting retains 43
untouched baseline warnings, documented alongside the unrelated profile baseline
exception. No formatting-only issue is treated as a correctness review finding.

The final staged artifact check identified only original extra EOF blank lines in
immutable provider exports. Preserving their hashes takes precedence over
normalizing source evidence. Authored whitespace checks pass; the full staged
check passes with only blank-at-EOF warnings disabled per command. This is a
provenance exception, not an implementation correctness finding.

## Final reviewer boundary

Verdict: PASS. Reviewer `/root/sentence_web_completion_review` recorded base
`89094248ad4b693627fd4c56545a36410d640039`, reviewed tracked patch SHA-256
`b9bf8bd91e71c71cabb4443bb46b43393f1b7070e6f9c455969445f218557430`, and
untracked manifest SHA-256
`76fce384dc7eb28bac711ecee0510851d17d0bac9110f9542cfcf637f7e61753`.
These identify the reviewed precommit boundary, before this audit entry and the
recording of immutable-export whitespace notes. No product changes followed.
