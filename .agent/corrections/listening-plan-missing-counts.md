# Listening plan with omitted exercise counts

Status: Complete

The latest clarification reply and its retry on the affected note failed with generation_scope_change after successful planner calls. Neither created a run. The retained plan requests a two-speaker French recording of up to 60 seconds from the editor plus L01 and L04 based on that recording, with no exercise counts. The named-activity allocator requests clarification for this shape. Falling through to the direct-authoring recording guard converted an incomplete plan into a failed turn.

Correct normalization of named activities where one item per uncounted selection fits the request. Preserve explicit limits and clarify incompatible counts or sources before the direct-recording safety gate. Show generation-specific guidance for failed turns independently of conversation transport errors. Keep existing speech authorization and charging gates intact.

Verification: focused real planner/SDK fixtures, allocation and presentation tests, explicit no-direct-speech regression, web notice tests and Russian browser render, affected typechecks/lint and guide checks. Use deterministic responses and confirm the stored plan shape without resubmitting learner content. Estimated checks take several minutes.

The exact retained plan was reloaded read-only, including its original source reference, into the corrected preparation and plan-building functions. Result: one source-backed audio task and one dependent exercise task with L01 × 1 and L04 × 1. No call was made to a provider and the original turn was left untouched.

92 focused backend cases passed, including the captured planning shape and an incompatible activity that safely asks for clarification. The registered Chromium listening journey generated the recording and exercise, played the audio, verified a duration of at most 60 seconds and inserted both into a note. All five companion API cases passed against disposable services with synthetic providers. All 20 chat notice tests passed and the Russian error presentation was verified in a browser. Backend and web typechecks, focused lint, guide and mapping validation and diff checks passed. The local knowledge-action runtime doctor reported ready. A live paid dialogue was not generated during verification.
