# Evidence: Optional AI diagnostics

Status: Pending

## Baseline

Read-only `pnpm dev:doctor -- --capability conversation` on original checkout/development DB: blocked solely by mismatched flow fingerprint; migrations, credentials, pricing, tariff, budgets and worker pass. No generation or configuration mutation.

## Acceptance-to-proof mapping

AC1–4: pending focused real DB/publication/admission/worker/SDK regressions and shared-consumer gates.
AC2,5: pending doctor tests, admin component/browser journey and guide validation.
AC6: pending source/security review, final gates and tested-state manifest.

## Limitations

No paid provider execution is claimed. Worktree is isolated from the unmerged original feature.

## Focused preflight (in progress)

- `node --test scripts/dev-readiness/*.test.mjs scripts/ai-smoke/*.test.mjs`:48/48 passed, no skips (6.19s final focused run). Informational flow-check status cannot block readiness across all capability/phase/history cases; missing actual credentials still block. Report `/private/tmp/languon-optional-doctor-tests.log`.
- Admin routing/state focused tests:16/16 passed. Admin typecheck, lint and production build passed (existing bundle-size warning). Initial missing browser-auth dist repaired by building the existing package.
- Docs validator16/16 passed and33guides synchronized; all three affected guide mappings pass. Skill validator10/10 and27skills pass; setup docs checker passes. External skill quick_validate requires unavailable PyYAML; metadata unchanged and repository validator is valid available packaging proof.
- Initial focused backend real-DB selection44/45 passed. All new policy/cooldown regressions pass; tariff-only MCP mutation exposed overly broad publication config validation. Source corrected to validate credentials/prices for newly assigned/enabled routes, preserving existing tariff-only authority. Focused rerun pending. Report `/private/tmp/languon-optional-policy-focused.json` retains original failure.
- Initial backend typecheck exposed three old test constructor/error-code references; repairs pending. No runtime compiler error reported.
- Initial critical registry tests exposed new suite count mismatch and sandbox loopback denial. Count updated and rerun with local-binding permission pending. Exact incident title synchronization awaits production-test JSON report.

## Selected final gates

`pnpm test:e2e:critical -- --flow ai-shared-invariants --flow ai-conversation --flow ai-dictionary --flow ai-text --flow ai-sentence --flow admin-text-ai-routing --flow setup-to-generation --flow ai-provider-management`.

Shared group includes mapped user-ai-model-preferences-backend journey; ai-provider-management browser entry uses its mapped existing test. These selections cover all shared text routing consumers without unrelated speech/mobile/full-app regression. Source/security review and targeted remediation precede execution.

### Focused remediation

Backend publication/MCP rerun:17/17 passed, zero skips (30.33s), `/private/tmp/languon-optional-policy-remediation.json`. Remaining28initial tests cover unchanged probe/runtime/pre-fence/conflict surfaces and remain valid. Source lint/format and migration classifier pass. Root owns one final backend typecheck/build to avoid duplicate compiler contention.

Critical registry safety tests23/23 passed with explicit loopback-bind permission. Added existing provider-management browser journey as a selectable critical entry, and existing user-preferences mapped backend journey to shared invariants; no new test harness. A single owned production execution regression run now covers11cases, including one deliberate real61-second cooldown.

Skill packaging validator limitation resolved: installed PyYAML only into `/private/tmp/languon-skill-validation` (no repo/system dependency change), then ran system skill-creator `quick_validate.py` on both changed skill folders with temporary PYTHONPATH. Both passed. `pnpm check:setup-docs` passed again.

Initial production execution run10/11passed. The new recovery assertion exposed health-event fixture state retained across synthetic cases, since that append-only table lacks the user FK used for other fixture cleanup. Explicit disposable-only beforeEach TRUNCATE now includes health events; production append-only guards remain intact. Single recovery case rerun underway; final registered stage reruns all11. One test-only TypeScript transaction mismatch was identified and is being corrected through a real transaction, not a cast.

Production cooldown recovery focused rerun passed1/1 with10unselected (not a full-suite pass):62.56s body,68.42s total, `/private/tmp/optional-diagnostics-production-recovery-final.json`. The first401 settles without learner charge; immediate new action is rejected before providerHTTP; after the real61-second wait a new conversation on the same route completes through actual worker/SDK and settles measured expense and bounded positive customer charge, without diagnostics. Reusing the failed conversation initially hit its unchanged reduced60-credit input ceiling because failed history grows input; recovery fixture now uses a fresh conversation, preserving the same user/route/note/budget rather than raising limits. Final registered stage reruns all11cases with no skips.

## Final gate attempts

- Static backend typecheck and production build passed after test transaction repair; reports `/private/tmp/languon-optional-backend-typecheck.log` and `/private/tmp/languon-optional-backend-build.log`.
- Initial selected8-flow run `5e86e58c-7d5f-446d-83f6-8b4fa7445020` failed before generation in first setup-to-generation journey: fixture worker set Mastra mode without a modelID, relying on absent ignored developer environment. Explicitly pinned the same synthetic Deepseek model already expected by that helper. Only fixture setup changed; lint/format passed, admin typecheck and focused review pending. Other7flows never ran; no pass claimed. Failed native trace/report retained under test-results/critical-flows.

## Existing production-release limitation

The main manifest was already stale at0116 before this feature. Read-only audit of49migration files0117–0165 found142function declarations,5top-level data changes and no table/column drops. Migration0138:71–76 disables the old transcription signature;0144:4–6 moves private result receipts then clears parent results;0146:117–127 backfills provenance and171clears terminal parent input/source. The deploy engine applies migrations at `infra/deploy/lib/deployment.mjs:841` while the active slot is stopped only at896; `migrate` does not enforce metadata's stop-old assumption. Database recovery guidance requires compatibility with both slots.

Keep the marker/hash current through0165 and classify accumulated history as `contract`, with an explicit rationale that production blue/green deployment is blocked. `node scripts/migration-classification.mjs` intentionally rejects contract migrations; report `/private/tmp/languon-optional-release-classification.log`. This is an explicit production-release limitation, not a passing release check or stale/falsely approved metadata. A separately reviewed maintenance/staged expand-contract plan and populated-data compatibility/rollback proof are required before production release. No deployment engine or historical migration was changed; no production deployment or human production approval is claimed.

New0165 only replaces a same-signature function, with no DML/reset. Its local fresh-forward and policy behavior proof remain valid; local development activation is in scope. Technical implementation completion does not imply production-release readiness.

- Second8-flow attempt `85ab93c2-3736-4b20-acff-cf539bc0944f` failed in the same first fixture before routing/DB composition: missing complete five-field provider-budget policy (ZodError hidden by existing sanitized worker wrapper). Pure production-loader repro identified exact cause. Both affected admin worker helpers now explicitly supply the existing bounded liveProviderBudget constants plus curated model; no ignored-env dependency, production validation change or assertion weakening. Pure-loader, lint/typecheck/format pass; independent focused source remediation approved both helpers.
- Seven-flow attempt `ba1981c2-591e-4aff-93fb-9f64e9b84190`: admin-text-ai-routing passed2/2 with no skips (91.4s test process), desktop/narrow screenshots and console/network assertions. Provider-management then failed on the independently identified sibling fixture's missing model/budget before it received the fix; remaining five backend stages never ran. Keep the valid unchanged admin-routing evidence; rerun only repaired browser journeys and unexecuted backend groups.
- Backend five-group final run `31ddc3c0-2580-498a-aa9c-69ef59979be6` underway. Logs `/private/tmp/languon-optional-final-backend-critical.log`. Repaired setup/provider browser selections will run after its exclusive critical-run lock releases.
- Migration-classification unit tests2/2passed. Actual release classifier intentionally rejects the current contract classification, preserving the documented production-release blocker; it is not represented as a passing deployment gate.

- Backend run31ddc3c0: ai-conversation254/254passed16files, no skips, including all11production cases. ai-dictionary35/38passed;3gateway identity guard tests failed only because updated error wording omitted the established substring `identity has changed`. Restored that substring while retaining no-manual-check recovery guidance. Identity comparison/no-HTTP rejection unchanged; focused gateway9/9passed. Independent reviewer approved this text remediation and reuse of unaffected conversation evidence. Remaining dictionary/text/sentence/shared groups run separately to avoid repeating valid evidence.
