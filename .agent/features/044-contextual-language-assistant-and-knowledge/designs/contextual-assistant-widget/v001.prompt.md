---
type: design-prompt
title: Contextual language tutor floating widget
status: current
created: 2026-10-19
feature: 044-contextual-language-assistant-and-knowledge
source_paths:
    - apps/web/src/fsd/widgets/contextual-assistant
    - apps/web/src/fsd/widgets/app-shell
    - apps/web/src/app/globals.css
    - packages/contracts/src/contextual-assistant.ts
---

# Contextual language tutor widget — design prompt v001

Copy the entire code block below into Magic Patterns using its copy button.
Repository references and review notes are outside the portable prompt.

[Versioned design handoff](../../.agent/features/044-contextual-language-assistant-and-knowledge/DESIGN.md)
· [Existing feature requirements](../../.agent/features/044-contextual-language-assistant-and-knowledge/FEATURE.md)
· [Current user flow](../user-flows/contextual-language-assistant-and-knowledge.md)

This is a design request, not an implemented redesign. It proposes a floating
non-modal desktop widget, mobile bottom sheet, state-preserving folding and
improved streaming presentation over the existing contextual assistant. Current
source inspection establishes controls and styling, not rendered design fidelity.
Feature 044 remains complete; no implementation target has been selected.

## Copyable Magic Patterns prompt

```text
Design an interactive, polished AI language-tutor widget for Languon, a language-learning web application.

The main task is reading a text or browsing dictionary cards while discussing them with a tutor. Learners must be able to scroll, select, copy, and interact with the source page while chat is open.

Build a realistic interactive prototype with desktop and mobile layouts, working local state, and simulated streaming. Use fictional learning content. Focus on the widget and its interactions, with enough of the surrounding app to demonstrate how it behaves.

VISUAL DIRECTION

Match a calm, modern learning application:
- Light canvas #F8F9FB, white surfaces, subtle background #F1F3F6.
- Primary text #1B1E24, secondary text #5B6472, borders #E4E7EC.
- Indigo accent #4F46E5, pale indigo #EEF2FF.
- Dark mode: canvas #121417, surfaces #1B1E24, elevated surfaces #23262D, accent #818CF8.
- Clear sans-serif typography, restrained icons, generous reading line-height, subtle borders and shadows.
- Rounded corners around 16–20px for the widget.
- Use color sparingly for actions and meaningful status.
- Avoid decorative gradients, oversized AI branding, constantly pulsing effects, and dense dashboards.

Show a realistic text page titled “Un café à Paris”, containing French paragraphs and an available English translation. Include a dictionary example with cards such as “pourtant”, “cependant”, and “quand même”.

DESKTOP: FLOATING WIDGET

The widget is a non-modal floating surface:
- Default position: upper-right of the available content viewport.
- Allow docking upper-left or upper-right through a simple accessible control.
- Optional header dragging may snap between those positions; dragging must not be the only way to move it.
- Respect the application sidebar: approximately 240px expanded or 72px collapsed. The left docking position starts after the sidebar.
- Maintain roughly 20–24px viewport gutters and account for any visible page header.
- Start around 400–440px wide, with a viewport-constrained height around 600px.
- Offer a wider reading size when space allows.
- Keep the source page’s layout stable when opening or folding chat.
- No backdrop, page dimming, background scroll lock, or focus trap.
- Only the widget itself intercepts pointer events. The surrounding page remains fully usable.
- Keep the header and composer visible; the conversation scrolls independently.

The header contains:
- A small tutor icon and “Language tutor”.
- A compact source label, such as “Un café à Paris”.
- Conversation history, new conversation, docking, and minimize controls, grouped sensibly.
- Put infrequent and destructive actions in a clearly labeled overflow menu.

FOLDING AND CONTINUITY

Minimize into a compact pill in the same docked corner:
- Tutor icon, concise label, expand control.
- Status states: idle, responding, new answer ready, interrupted.
- A restrained unread indicator for an answer completed while folded.
- No automatic reopening or attention-grabbing animation.

Folding preserves:
- Conversation and incoming response.
- Unsent question and attached material.
- Scroll position.
- Preferences.
- Knowledge-note draft and any unsaved edits.

Folding never stops generation or asks the learner to discard work.
Reopening returns to the same state and reconnects to the ongoing response.
Only the explicit Stop action cancels generation.

Keep the source identity visible. When the learner moves to a different source, never silently treat an old conversation as belonging to the new page.

MOBILE: BOTTOM SHEET

Transform the same experience into a bottom sheet:
- A small bottom launcher when collapsed.
- A comfortable partial-height reading state.
- A near-full-height state for longer answers and keyboard input.
- Visible drag handle plus accessible expand/collapse buttons.
- Rounded upper corners, safe-area padding, and a composer that stays above the keyboard.
- At partial height, the visible source page remains interactive.
- Provide an obvious “Select from page” action that folds the sheet, lets the learner select text, and returns with a quoted attachment.
- Folding or swiping down preserves all state and keeps generation running.
- Prevent sheet dragging from interfering with scrolling messages or selecting text.
- Ensure controls and popovers work at 320px and 390px widths.

CONVERSATION PRESENTATION

Make explanations pleasant to read:
- Compact user bubbles with subtle background.
- Assistant answers as clean formatted prose with minimal surrounding chrome.
- Support short headings, paragraphs, lists, emphasis, translations, examples, and small comparison tables.
- Give examples and their translations a clear visual relationship.
- Long tables scroll within their own area.
- Text remains selectable and copyable, including while an answer streams.
- Support mixed scripts and right-to-left learning material.

Completed answers offer quiet actions:
- Copy.
- “Create Knowledge note”.
- Expandable usage details.

Keep the active model discoverable, such as “DeepSeek Flash”.
Show credit usage compactly; disclose token counts and estimated/reported usage only when requested.

STREAMING QUALITY — A PRIMARY DESIGN REQUIREMENT

Demonstrate the streaming interaction, not just a loading spinner:
- Show a small “Preparing an answer…” state before the first text arrives.
- Replace it with text as the answer begins.
- Reveal short chunks smoothly without restarting or fading the entire message.
- Keep previously rendered text stable.
- Avoid flickering Markdown, raw formatting markers, layout jumps, and repeated message re-entry animations.
- Maintain a stable composer and widget frame.
- Auto-follow only while the learner is already near the bottom.
- If they scroll upward or select text, preserve their position and show “Jump to latest”.
- Never force-scroll the source page.
- Do not announce every streamed token to screen readers.
- Respect reduced-motion preferences.
- Avoid fake progress percentages or simulated private reasoning.

Display real task activity in plain language:
- “Looking through this dictionary…”
- “Reading relevant passages…”
- “Preparing a Knowledge draft…”

Collapse finished activity into a small disclosure such as “Used 3 dictionary cards”. Opening it shows the actual material used. These are learning materials, not verified external citations.

While generating, show Stop clearly. Let the learner compose their next question, but prevent a second submission until the current response finishes.

Reconnection should be quiet and preserve the partial answer.
A failed or stopped response keeps its visible text, is labeled incomplete, and offers an explicit Retry action. Retrying must not appear automatic.

COMPOSER AND CONTEXT

Use an auto-growing multiline composer with:
- A friendly placeholder: “Ask about a word, phrase, or grammar…”
- Add context button with a discoverable “/” shortcut.
- Send / Stop action.
- Three compact preference controls beside or directly beneath the input.

Attachments appear as compact removable chips or quote previews above the input. Expand a chip to inspect its content without filling the conversation with large cards.

Context interactions:
- Selecting source text exposes “Ask tutor”, while preserving normal Copy.
- Attaching a selection focuses the question; it does not automatically send.
- “/” or Add context opens a searchable picker for the current source.
- Support several dictionary cards for comparisons.
- Expanded word-card previews include source, translation, definition, transcription, and examples when present.
- Allow pasting copied material from another source.
- Clearly distinguish attached copies from the primary source context.
- Show loading, empty search, attachment-limit, and oversized-content states.

The tutor already has access to the current source:
- Dictionary name and description, with relevant cards retrieved as needed.
- Saved text and its available translation, with relevant passages retrieved for long texts.
- A saved Knowledge note when opened through “Ask about this”.

Show a compact source/context indicator, not a large permanent explanatory banner.
If unsaved source edits exist, offer “Use current draft”; saved content is the default.
Draft-based turns have a small “Draft content” label.
When saved source content changes, show a quiet divider before the next turn: “Source updated”. Earlier explanations remain unchanged.

PREFERENCES

Keep these three choices quickly reachable through compact labeled popovers:
- Reply language: Automatic or a chosen language.
- Tone: Neutral, Conversational, Academic.
- Explanation level: Automatic, Beginner-friendly, Detailed/technical.

Automatic reply language follows the learner’s question, rather than the language of quoted study material.
Detailed permits depth without forcing long answers.

Preferences apply to the current conversation.
Include “Use as my defaults” as a secondary explicit action with lightweight confirmation.

HISTORY AND EMPTY STATE

Reopen the most recent conversation for the source.
Provide a compact history view and New conversation.
Switching conversations preserves their separate identities and content.
Deleting a conversation requires confirmation and explains that saved Knowledge notes remain.

The empty state should be concise and source-specific:
- “Why is the subjunctive used here?”
- “Compare these two expressions.”
- “Explain the tone of this passage.”

Suggestions populate the composer for review rather than silently sending a request.

KNOWLEDGE DRAFTS

“Create Knowledge note” generates an editable draft; it does not immediately save a note.

Show a compact draft card in the conversation:
- Clear “Draft” label.
- Title, short summary, category chips.
- “Review and save” primary action.
- Secondary discard action.
- Lightweight draft-saving status.

Review opens an editor within the widget’s expanded area or a dedicated editor state with a clear Back to chat action. On mobile, use the expanded sheet. Preserve the conversation and editor state when folded.

Editable fields:
- Title.
- Short summary.
- Formatted explanation with examples.
- Language being studied.
- Explanation language.
- Multiple categories from:
  Grammar
  Vocabulary & meaning
  Usage & register
  Pronunciation
  Etymology
  Culture
  Learning tips

Make explicit Save the only action that publishes into Knowledge.
Explain subtly that AI draft creation uses credits; manually editing and saving the prepared draft does not.

For discussion of an existing note:
- “Update this note” and “Save as a new note”.
- An update produces a draft requiring explicit Save.
- If the saved note changed meanwhile, retain the draft and offer Compare with latest or Save as new.
- Never silently overwrite newer edits.

After saving, show a restrained success state with “Open in Knowledge”.
Saved notes are independent learning material, without mandatory links back to the originating dictionary or text. Do not label AI explanations verified.

ERRORS AND ACCESSIBILITY

Include realistic states for:
- Reconnecting.
- Incomplete answer with Retry.
- Insufficient credits.
- Selected model unavailable.
- Source no longer accessible.
- Draft save failure with edits preserved.
- Note version conflict.

Errors should explain the next useful action without replacing the whole conversation.

Use visible keyboard focus, accessible names for icon buttons, at least 44px mobile touch targets, sufficient contrast, and predictable focus restoration.
Escape closes an open popover first; folding chat returns focus to its launcher.
Desktop chat must not trap focus away from the source page.

PROTOTYPE DELIVERABLE

Create one coherent interactive design, with:
1. Desktop text page and expanded upper-right widget.
2. Upper-left docking with expanded and collapsed sidebar.
3. Folded widget while responding, then answer-ready state.
4. Text selection → quoted attachment → question.
5. Smooth simulated streaming with scroll-up and Jump to latest behavior.
6. Dictionary comparison with multiple attached cards and material-used disclosure.
7. Preference popovers and conversation history.
8. Knowledge draft review, explicit save, and conflict state.
9. Mobile collapsed, partial, expanded, and keyboard-open sheet states.
10. Representative error and dark-mode states.

Use a small separate prototype-demo control to switch scenarios. Keep those controls outside the product UI.

Prioritize readable explanations, uninterrupted access to the source, state preservation, and a calm streaming experience.
```

## Design review checklist

Stable IDs apply to this brief; map them to the returned design's inventory.

- W01 — Non-modal desktop widget, both upper corners, sidebar offsets and independent scrolling.
- W02 — Folded states preserve messages, composer, attachments, scroll, preferences and editor drafts.
- W03 — Mobile partial/expanded bottom sheet, keyboard and safe areas; source selection remains usable.
- W04 — Stable streaming, respectful scroll following, Stop, reconnect and explicit Retry.
- W05 — Readable formatted answers, copy, usage disclosure and actual material-used previews.
- W06 — Source context, multiple copied attachments, slash picker, selection and saved/draft provenance.
- W07 — Three response preferences and explicit future defaults; active model remains discoverable.
- W08 — Source-specific history, new conversation, deletion confirmation and empty states.
- W09 — Knowledge draft review/edit/save, independent notes, revision conflict and preserved edits.
- W10 — Errors, keyboard navigation, accessible controls, RTL, dark mode and narrow layouts.

## Source and limitations

Source revision: `88e21eddc9b62255896514d029b1c4fec0557cb9`; working tree clean
before this documentation change. The portable block preserves the prompt
provided in the conversation. Its prototype scenarios are requested design
behavior, not claims about current runtime support. The existing implementation
uses a modal side panel; floating docking, folding and mobile sheet interactions
require later authorized implementation and verification. No external design has
been generated or reviewed. The handoff records the immutable prompt snapshot
and leaves the generated-design URL available for the returned result.
