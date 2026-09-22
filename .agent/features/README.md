# Feature workspaces

Create a numbered workspace with `pnpm feature:new -- <slug> "<title>"`.
The command assigns `<NNN>-<slug>` (minimum three digits), starting at 001 and
using the highest existing counter plus one. Supply the logical slug without a
prefix. Each workspace contains FEATURE.md, EXEC_PLAN.md, EVIDENCE.md and REVIEW.md;
optional DESIGN.md records generated-design revisions.

Numbers are stable creation sequence, not completion rank. Never renumber on
completion, reuse removed counters, or delete the highest numbered workspace to
recycle its number. Keep feature branches (`feature/<slug>`), guide `feature` /
`related_features`, E2E IDs and product slugs unnumbered. Discover a workspace by
its `-<slug>` suffix; folder paths and guide source_paths use the full number.

The creator serializes local allocation with `.create-feature.lock`. If interrupted,
confirm no creator is running before removing a stale lock. Parallel checkouts
can allocate the same counter: resolve that collision before merging by assigning
one newly created workspace the next unused counter and updating its references.
Do not renumber established workspaces.

Feature artifacts are living engineering state. Commit them with implementation.
Keep credentials, production data and unbounded logs out. Corrections belong in
`.agent/corrections/<slug>.md` and improvements in `.agent/improvements/<slug>.md`
under root routing; this numbering does not change authorization or Git policy.

## Historical path mapping

Existing workspaces were numbered on 2026-09-22 by the first Git commit containing
FEATURE.md, in repository history order. Each has a distinct first commit.
The old slug also resolves historical links in immutable prompt snapshots:
replace `.agent/features/<old-slug>/` with the mapped folder below. Do not rewrite
snapshots or their hashes to repair a historical link.

| Former folder / logical slug          | Current workspace                                                                             | First commit |
| ------------------------------------- | --------------------------------------------------------------------------------------------- | ------------ |
| `user-authentication`                 | [001-user-authentication](001-user-authentication/FEATURE.md)                                 | `9ef67e8`    |
| `user-flow-testing-guides`            | [002-user-flow-testing-guides](002-user-flow-testing-guides/FEATURE.md)                       | `3f273b1`    |
| `user-flow-e2e-automation`            | [003-user-flow-e2e-automation](003-user-flow-e2e-automation/FEATURE.md)                       | `7998afe`    |
| `web-dev-port-3333`                   | [004-web-dev-port-3333](004-web-dev-port-3333/FEATURE.md)                                     | `e867abc`    |
| `agent-browser-verification`          | [005-agent-browser-verification](005-agent-browser-verification/FEATURE.md)                   | `3653c77`    |
| `project-prettier-standard`           | [006-project-prettier-standard](006-project-prettier-standard/FEATURE.md)                     | `6831a3b`    |
| `frontend-development-standards`      | [007-frontend-development-standards](007-frontend-development-standards/FEATURE.md)           | `b056bc6`    |
| `web-i18n-support`                    | [008-web-i18n-support](008-web-i18n-support/FEATURE.md)                                       | `874027c`    |
| `local-agent-skills`                  | [009-local-agent-skills](009-local-agent-skills/FEATURE.md)                                   | `8fedf03`    |
| `design-system-blueprint`             | [010-design-system-blueprint](010-design-system-blueprint/FEATURE.md)                         | `740b0c2`    |
| `mastra-agent-development-harness`    | [011-mastra-agent-development-harness](011-mastra-agent-development-harness/FEATURE.md)       | `329ce60`    |
| `mastra-deepseek-model`               | [012-mastra-deepseek-model](012-mastra-deepseek-model/FEATURE.md)                             | `f942603`    |
| `web-ui-kit`                          | [013-web-ui-kit](013-web-ui-kit/FEATURE.md)                                                   | `448a421`    |
| `overlay-feedback-primitives`         | [014-overlay-feedback-primitives](014-overlay-feedback-primitives/FEATURE.md)                 | `d84f7bb`    |
| `release-deployment-platform`         | [015-release-deployment-platform](015-release-deployment-platform/FEATURE.md)                 | `2f586d3`    |
| `admin-user-management`               | [016-admin-user-management](016-admin-user-management/FEATURE.md)                             | `190e9ae`    |
| `web-dev-panel`                       | [017-web-dev-panel](017-web-dev-panel/FEATURE.md)                                             | `c4848ab`    |
| `web-dev-panel-custom-sections`       | [018-web-dev-panel-custom-sections](018-web-dev-panel-custom-sections/FEATURE.md)             | `0c86ba8`    |
| `ui-ux-composition-skill`             | [019-ui-ux-composition-skill](019-ui-ux-composition-skill/FEATURE.md)                         | `15ffc96`    |
| `improvement-workflow-figma-make`     | [020-improvement-workflow-figma-make](020-improvement-workflow-figma-make/FEATURE.md)         | `e9dfb42`    |
| `dictionary-platform`                 | [021-dictionary-platform](021-dictionary-platform/FEATURE.md)                                 | `0c6202d`    |
| `inline-ai-card-authoring`            | [022-inline-ai-card-authoring](022-inline-ai-card-authoring/FEATURE.md)                       | `3aa37d7`    |
| `magic-patterns-ui-kit-auth-redesign` | [023-magic-patterns-ui-kit-auth-redesign](023-magic-patterns-ui-kit-auth-redesign/FEATURE.md) | `51ed25a`    |
| `magic-patterns-ui-kit-auth-fidelity` | [024-magic-patterns-ui-kit-auth-fidelity](024-magic-patterns-ui-kit-auth-fidelity/FEATURE.md) | `a381705`    |
| `magic-profile-page`                  | [025-magic-profile-page](025-magic-profile-page/FEATURE.md)                                   | `a4ac7d9`    |
| `profile-account-controls`            | [026-profile-account-controls](026-profile-account-controls/FEATURE.md)                       | `60d5aca`    |
| `dictionary-pronunciation-audio`      | [027-dictionary-pronunciation-audio](027-dictionary-pronunciation-audio/FEATURE.md)           | `2f8f6d2`    |
