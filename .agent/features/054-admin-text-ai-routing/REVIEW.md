# Review: Admin-owned text AI routing

Verdict: Approved; aggregate critical, static and standard build verification passed

Independent correctness review captured tracked and untracked implementation from base61a4616. Preliminary reviewed state: `7c78552cf10932b076d59fcd32e63b725279a1ff3bd2dac1f618204abe2711fb`. Security review runs separately. Final frozen source reviewed: `a4f87cf80ef35067ba709d5423ec1347c73f2edf4070bdc6bfd45a823b6f4792` (changed apps/packages/scripts/.env.example paths sorted with content). Security review fingerprint: `254a6cdc7b6486fab9ef2a414ac44b277e75fa90`. Later performance optimizations received bounded correctness and security re-review; final security delta fingerprint is `d91015210422f1b62bd24ac78d0a6411861ad328`.

## Correctness findings

- CR-054-01 High: queued primary disable did not choose pinned available fallback. Fixed claim selection and actual receipt projection.
- CR-054-02 Medium: adapter/request-policy/semantic-validator revisions absent from evidence fingerprint. Added explicit code-owned revisions and invalidation regressions.
- CR-054-03 Medium: pre-answer supporting-call rejection did not trigger fallback. Fixed; actual Mastra regression covers observation rejection.
- CR-054-04 High: SQL could choose inline candidate different from constructed provider. Inline attempts now bind exact candidate0/1 and fail closed if excluded; queued claims project actual receipt.
- CR-054-05 Medium: fallback readiness did not include current worker observations. One bounded query now filters every candidate before choosing.
- CR-054-06 Medium: support-call ceiling blocked fallback after reflection failure. Two supports per route/four total within five total calls and original token/cost budget. Real Mastra reflection-failure regression passes.
- CR-054-07 Medium: invalid structured probe lost measured usage. SDK step callback captures bounded usage before validation failure; absent usage remains unknown.
- CR-054-08 High: queue persistence dropped trusted safe-retry disposition. Four family guards remediated; Actual SDK → worker → PostgreSQL → pinned fallback proof passed (2 sentence cases); text-selection unknown-expense fallback passed (1 case).
- CR-054-09 Medium: completed invalid interview output could not fallback safely. Resolved with buffered semantic validation, unsuccessful first-attempt settlement and trusted completion witness; 71 tests cover valid fallback and negative paths.
- CR-054-10 Medium: rotated credential/adapter/flow contract cannot automatically use pinned fallback. Justified fail-closed operational limitation recorded in EVIDENCE.md; no HTTP or learner charge, explicit new action required after admin recheck.

## Security remediation

Provider minimum cost floor, learner model-name redaction, portrait provider/fallback disclosure, learner-induced output/400 health suppression, worker health recorder authority, cancellation health suppression and text-selection emergency-disable race were found and remediated. Independent security review reports no unresolved material findings. Residual SDK egress relies on reviewed fixed provider origins. Performance admission target passed84.319ms p95 under the unchanged100ms target. Independent final review reports no remaining material correctness/performance findings, with final aggregate critical and standard declaration-build checks subsequently passing. Type-only build-boundary annotations and test-fixture corrections do not alter runtime behavior; emitted ESM comparison passed for all26 files.

## Final build-boundary review

Independent review accepted the explicit6144MiB compiler heap ceiling scoped to tsup only; declarations, entrypoints and tests remain enabled, runtime commands are unchanged. The standard backend build passed including DTS124.501sec. Three type-only boundaries retain overloads and fully typed inserts; all26 emitted JavaScript hashes are identical. Worker declaration is11.50KB. README records required builder headroom; smaller builders must be provisioned accordingly. No baseline OOM claim is made.

## Staged scope review

Independent review audited all305 staged paths and edge-path diffs after automatic commit review requested scope evidence. No unrelated or accidental changes were found. Required generated snapshots and retained raw benchmark evidence account for76.4% of added lines; remaining scope implements or verifies Feature054. Narrow worker grants, build-only compiler budget, shared minimum-price protection, revised test command and historical BL-005 synchronization are justified. No secrets/dependencies/build output/normal data are staged. Normal commit retry is supported; no approval bypass or altered commit mechanism.
