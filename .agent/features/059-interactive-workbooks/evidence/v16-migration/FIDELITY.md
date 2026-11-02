# v16 custom-block fidelity observations

Selected target: v003 / Magic Patterns v16, artifact
`fb2e85d3-cf96-4a3f-b0e3-841f9057a4f8`. The retained154-file source and its
manifest are authoritative design input. Reference screenshots and their hashes
are in `../../designs/interactive-knowledge-sheet-and-chat/v003/reference-captures/`.

The provider was inspected in its existing authenticated private Chrome preview,
without publishing or editing the design. Reference captures use the existing
browser's80% zoom. Runtime uses English synthetic material at1440×1000 and
390×844, with light/dark observations. Content and raw screenshot dimensions differ;
comparisons concern component hierarchy, source CSS geometry, control density,
tokens and responsive behavior, rather than identical example wording/pixels.

## Observation matrix

Runtime base: registered `interactive-workbooks` journeys. Final affected flow in
`a4685c8e-11b3-4774-9c3b-576c3cd263be` passes all3 journeys with no skips/retries,
including post-REV05 source and exact desktop/mobile geometry assertions. Ninth
report `9d9ee58a-d43b-48b6-bb93-f20dc7a0593f` also passes3/3 and supplies unchanged
bilingual/video/editor observations. Earlier captures remain historical.

| Inventory | Reference / runtime observation                                                                                                                                           | Disposition                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| MP-01–03  | Compact title/icon/type/count row, visible selected ring, native family menu, real drag/reorder/undo and writable gaps; desktop and mobile menu captures                  | Verified interactions and final captures                                                                    |
| MP-04–05  | Vocabulary side editor and mobile bottom sheet; manual forms, dirty discard and local Apply vs explicit Save; actual video description dialog added to final journey      | Verified, including actual video dialog and fixed desktop/mobile review geometry                            |
| MP-06     | Atomic vocabulary suggestion, current/proposed content, Accept/Dismiss; text translation and dirty cancellation in side editor                                            | Real admitted field actions verified; failure/stale/late result also covered by focused component/SDK tests |
| MP-07–10  | Six family gallery references; compact vocabulary chat card, full vocabulary/audio review, sheet/learner variants and folds; typed updates preserve target identity       | Verified representative family/context combinations and final short review                                  |
| MP-11     | Real generated audio preview, word playback, strict authenticated WAV readback, shared compact/review media URL and decoded1s native audio                                | Verified with deterministic external speech provider through real jobs/storage; no paid service claim       |
| MP-12     | Grammar rule view and manual authoring, optional pattern/examples/mistakes covered by reusable renderer/form tests                                                        | Representative grammar author/runtime view verified; no claim of every optional-section cross-product       |
| MP-13     | Original/Bilingual, prepared languages, independent private translation and saved Text copying; mobile label fragmentation found in eighth screenshot                     | Verified; corrected narrow label/select wrapping observed in actual390px capture                            |
| MP-14–15  | Neutral audio/video presentation, unprepared audio, transcript disclosure, grounded passage/replay and safe supported video source                                        | Verified actual media/hint journey and video editor                                                         |
| MP-16–17  | Folded set, individual questions, prepared correctness, private AI feedback, answer/hint/retry and persisted history; initial progress hydration preserves unsent answers | Verified; real later material revision still resets, while cosmetic/media URL changes preserve input        |
| MP-18–19  | Menu-based dictionary/Text independent copies, copy preview, saved-only publication, private reader state and workbook revocation                                         | Verified by real UI/DB-backed journeys; broader parent feature remains open                                 |
| MP-20     | CSS Modules, runtime tokens and shared primitives; source family tints, desktop/mobile and dark captures                                                                  | Verified styling guard, light/dark and final mobile/short-review observations                               |
| MP-21     | Prototype future/demo controls excluded; pronunciation, difficulty, automatic remote-video understanding, courses and group context deferred                              | Preserved accepted scope                                                                                    |

## Mechanism adaptations and limitations

- Existing chat/editor shell, routing, TipTap, shared Dialog/Menu, authentication,
  independent exercise identities and requester-paid execution remain production
  contracts. Prototype state switches, mock timers and fake AI results do not ship.
- Real player controls and source-bound speech replace prototype playback.
  Exercise hints retain reusable independent source playback so copied/standalone
  exercises can replay their authorized passage without an authoring surface.
- Language settings and an optional existing dictionary definition use quiet
  disclosures. This preserves existing content fields without filling the editor
  with prototype-extraneous controls.
- Runtime review panels use explicit viewport height: desktop12px insets, mobile
  initial82dvh and expanded8px top. The provider's mobile code uses a maximum82%
  height; explicit height follows accepted MP-04 and the author-sheet contract,
  ensuring short audio proposals retain the intended bottom-sheet treatment.
- Prepared answers/translations remain inspectable in review. Author Apply only
  changes the recovery draft; Save publishes. One concise footer notice replaces
  duplicated introductory copy.
- Successful uploaded-audio transcription is not verified or enabled. The real
  unavailable service/UI path and manual transcript authoring are tested; an
  approved compatible provider/model remains the parent F059 blocker.

## Final rendered evidence

Source reference gallery and `proposal-review-desktop.png` are compared with final
`interactive-workbooks-artifacts/` under the a468 run. Relevant capture names:

- First journey: `editor-inline-block-settings`, `editor-block-settings-mobile`,
  `editor-populated-desktop[-dark]`, `audio-transcription-unavailable-manual-fields`,
  `video-side-editor`, `video-transcript-grounded-hint`,
  `workbook-practice-desktop` and `workbook-practice-mobile`.
- Third journey: `atomic-vocabulary-side-editor`, `atomic-vocabulary-bottom-sheet`,
  `chat-target-update-review`, `prepared-audio-chat-review`,
  `prepared-audio-chat-review-mobile[-expanded]` and
  `inline-exercise-feedback-desktop/mobile`.

The fixed narrow language label remains on one readable line, with the selector
wrapping below where needed. Short review fills desktop viewport minus24px;
mobile starts at82dvh and expands to8px top. The publication notice owns a full
mobile row above the three actions. No clipped/vertical notice remains.

Independent reviewer viewed both final mobile review captures and closed REV05.
The role/content/geometry changes and terminal14/812 critical results are accepted.
Independent completion review approves the scoped v16 milestone; static, build and
documentation gates pass. This record does not mark the parent F059 complete.
