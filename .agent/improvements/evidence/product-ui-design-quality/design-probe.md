# Fresh-context design probe — ui_design_brief

Date: 2026-11-11. Read-only shared-checkout probe using the new skill/role and raw user request/source/screenshot, without research conclusions or evaluator rubric. No application execution. This is decision evidence, not a comparative quality/efficiency benchmark. Full returned response follows.

Approved direction: extend the existing snippet surface and shared controls. Treat this as a compact dictionary result inside its assistant message.

- **User task:** scan proposed French/Russian cards, inspect detail when useful, select cards, then append/prepend or explicitly confirm replacement.
- **Outer hierarchy:** one bordered artifact with a disclosure button containing the generated title, total card count, and chevron. Wrap long titles naturally. Keep its closed state to this summary; opening reveals the review help, selection toolbar, actions, and entries.
- **Entry hierarchy:** replace each fully expanded padded card with a compact row: independent selection checkbox, source phrase as primary text, translation as secondary text, and disclosure affordance. Keep source and translation visible when the entry is closed. Open detail shows the enabled transcription, definition, example, and example translation using the existing labeled field presentation. Where no optional fields exist, an entry needs no empty disclosure.
- **Selection and disclosure:** selecting never expands an entry; expanding never selects it. Use sibling controls, without nesting a checkbox inside a disclosure button. Preserve ordinal context in accessible labels without repeating “Select card 1: Bonjour” as the main visible heading.
- **Actions:** keep Select all, selected count, and the existing append/prepend/replace buttons above the list. For a long result, repeat the action group below the list alongside a collapse-result control. Preserve replacement confirmation, retry semantics, and existing danger styling.
- **Density:** use separators and the existing surface for compact entries; avoid another padded border around every field. Keep current type roles and token-based spacing. Allow natural chat scrolling; add no inner scrolling panel or sticky toolbar.
- **Lifecycle:** history starts closed. A result published during the current open chat session opens its outer artifact once, with individual entries initially closed. Refetch, reconnect, application invalidation, or a rerender must preserve the user’s current disclosure choices. Closing and reopening chat starts compact again. Disclosure is local presentation state; keep it out of persisted snippet contracts.
- **Recovery:** collapsing must preserve selection and an in-flight operation. Pending status and an actionable error/retry remain perceivable outside the hidden result body. Disclosure can remain available while application disables selection and write controls. Do not move focus automatically when a result arrives; announce a short completion summary rather than the whole list.
- **Responsive intent:** retain the same reading order in the narrow assistant panel and on mobile. Stack source/translation within the row and wrap action buttons. Use minimum touch targets, visible focus, and no truncation that removes the only readable translation.

Use the existing `Button`, `Checkbox`, `Dialog`, `InlineAlert`, and Lucide icon vocabulary. Reuse `--background-surface`, `--background-subtle`, `--border-default`, `--text-primary`, `--text-secondary`, focus tokens, and canonical space/radius tokens from `globals.css`. The inspected `VocabularyTermCard` provides a relevant source/translation hierarchy; knowledge authoring’s native disclosure patterns provide an existing interaction reference. Keep feature-specific presentation in `dictionary-chat-snippets`, without promoting it to shared merely for Storybook.

Smallest useful story boundaries:

1. **Actual snippet-entry view:** compact, expanded with every enabled field, unchecked/disabled, and long localized content.
2. **Actual snippet-artifact view:** closed, open with ordinary cards, realistic50-card French/Russian result, mixed selection, pending, and error/retry. Split application orchestration from this view so stories use typed fake props and controlled callbacks.
3. If implementation introduces a reusable shared disclosure primitive, give that primitive colocated keyboard/expanded/long-label stories too. A whole-chat story is unnecessary. Existing chat-item or editor leaves changed within this work should likewise receive isolated stories.

Evidence plan:

- Focused component coverage for independent selection/disclosure, preserving selection after collapse, one-time opening after publication, compact history on reopen, and no reopening after reconciliation.
- Render isolated stories with **1, roughly10, and50 cards**, including all six fields and long French/Russian text; use global theme and viewport controls.
- In the real application, inspect a narrow **360–390px assistant content width** and a desktop **1440×900 viewport**, checking the actual panel width. Exercise completion, individual expansion, mixed selection, collapse/reopen, retry, and replacement cancellation; confirm keyboard access, no horizontal overflow, reachable actions, and hidden controls absent from tab order.
- Request the bounded rendered critique after those artifacts exist. Record console/network observations separately from visual findings.

Observed evidence is limited to the supplied screenshot and source inspection. The screenshot shows a single expanded entry consuming most of the visible chat, with repeated source identity and substantial field spacing. No services, browser checks, or runtime verification were run; the proposed composition still needs rendered evidence.
