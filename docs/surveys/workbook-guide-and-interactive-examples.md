---
type: survey
title: Workbook guide and interactive example approaches
research_date: 2026-11-14
source_paths:
    - apps/web/src/fsd/entities/learning-blocks
    - apps/web/src/fsd/widgets/app-shell
    - packages/contracts/src/exercise-activity-catalog.ts
---

# Workbook guide and interactive examples

## Recommendation

Use native app pages, existing exercise renderers and typed local fixtures. The
current component supports local prepared checks without persistence callbacks.
The sidebar currently hides navigation for guests, so public guide navigation must
be a static item outside authenticated resource navigation. There is no generic
safe prompt-prefill interface: copy recipes and link to Knowledge in v1.

| Approach                             | Fit and tradeoff                                                                                                                        |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Native pages and existing components | Recommended: product fidelity, canonical checking, localization and no new dependencies; nineteen fixtures need editorial review.       |
| MDX with interactive islands         | Useful for a larger editorial publication; unnecessary build/authoring machinery for two pages now.                                     |
| Embedded Storybook/playground        | Developer reference rather than a learner guide; adds isolation/style/navigation costs and does not teach the actual workspace journey. |

## Primary-source research

[Diátaxis](https://diataxis.fr/) distinguishes learning tutorials from task-oriented
how-to guides. Apply that distinction as playable examples plus separate recipes,
rather than mixing catalog reference, onboarding and long explanation together.

[React Learn](https://react.dev/learn) interleaves explanation with runnable examples.
Reuse the interaction pattern while keeping Languon's actual renderers, not a code
editor intended for developers. [MDN Playground](https://developer.mozilla.org/en-US/play)
is another runnable-example precedent, not a required integration.

[Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/)
supports showing one exercise at a time with deeper checking explanations on demand.
[WCAG status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
inform accessible copy/check outcomes without moving focus.

[Next server/client boundaries](https://nextjs.org/docs/app/getting-started/server-and-client-components)
fit server-rendered reading content plus local interactive islands.
[Next MDX support](https://nextjs.org/docs/app/guides/mdx) remains a future authoring
option. Existing cookie-based localization means the plan does not promise forced
static generation or introduce caching policy.

## Evidence limits and decisions

This is primary-documentation and source review, not a measured usability study.
Research access used system HTTPS after the web tool returned HTTP405. No private
content was uploaded. User confirmed public access, Workbook guide naming, all19
activities, clearly illustrative preset feedback and copy-only real-work handoff.
English A2 example material with four UI locales is the chosen v1 default. Browser
and independent content/design review must establish implementation quality.
