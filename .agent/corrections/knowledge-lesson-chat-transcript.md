# Knowledge lesson chat transcript

Status: Complete

## Scope and acceptance

Restore the established Knowledge chat behavior on the current branch. Sending one lesson request shows the learner's own message and the final response. Automatic or manual generation-stage commands update the lesson card without creating dialogue or implying consent. Preserve ordinary chat answers, learner-authored revisions, genuine confirmation requirements, usage accounting and run recovery. User text must have visible native selection in both themes. Remove the repeated draft-source caption beneath messages.

## Investigation and plan

Read-only inspection of the reported note counted one direct learner message, two internal continuation inputs, two checkpoint answers and one published result. The generation worker uses conversation turns for execution and accounting. Detail, replay and history were treating every turn as dialogue. Selection foreground/background styling also left the native highlight indistinguishable from the user bubble.

Apply the same transcript rule to canonical reads, streaming and subsequent model context. Check the real stored lesson read-only, run a disposable PostgreSQL regression, then exercise a deterministic multi-stage lesson in Chromium, including native text selection. Verify the published result survives refresh and the lesson card keeps reporting progress. Update the two affected user guides and check their mappings.

## Verification

The final read-only projection of the reported local note returned one user row and one assistant row. No stored conversation was modified. Four disposable PostgreSQL tests passed, including exact-copy-text provenance, typed revisions, confirmed admission, replay, future model history and final publication. The real Chromium lesson journey passed with four HTTP prerequisites. It checked exactly one learner prompt during generation, one published answer on completion, no repeated caption, and a visible native mouse selection in light and dark themes. Six focused web suites passed 48 tests. Both app typechecks, the 36-guide check, affected mappings and architecture viewer freshness checks passed. The mapped E2E file has pre-existing spacing lint findings outside the modified section. No migration or environment change is required.

The backend production build, including declaration generation, passed. Independent review found no material regression in transcript filtering, authorization, or streaming.
