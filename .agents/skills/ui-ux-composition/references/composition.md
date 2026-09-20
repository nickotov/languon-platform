# Composition and redesign decisions

Use when the request leaves structure open or explicitly asks to redesign it.
For faithful implementation, preserve the supplied structure unless a scoped
contract/accessibility correction requires a recorded deviation.

Choose the experience first: focused form, settings, detail, collection,
comparison, sequential flow, contextual task, or destructive confirmation.
Then choose page/inline/dialog/sheet/popover, groups and reading order, primary
action placement, content width, disclosure, and responsive transformation.
Do not compensate for an unsuitable structure with spacing.

## Controls and layout

- Match controls to data: short input, prose editor, independent checkbox,
  mutually exclusive radio/segment, or searchable long-choice combobox. Keep
  programmatic labels; placeholders alone are insufficient.
- Prefer readable columns for prose; add columns when comparison/scanning gains
  justify them and each control retains useful width. Do not force all forms
  into one column or spread controls just because desktop space is available.
- Use cards for independently meaningful regions, actions or states. Use
  existing composition components instead of adding wrappers by default.
- Keep essential content visible; disclose optional complexity. Tabs represent
  peer sections; steps represent genuinely sequential work.
- Use popovers for short anchored choices, dialogs for focused contextual tasks,
  sheets for suitable short touch tasks, and routes for deep/linkable/long work.
  Do not turn full settings into a dialog or avoid navigation with overlays.
- Distinguish primary, secondary and destructive actions. Place submission near
  task completion and keep errors visible/reachable. Duplicate primary actions
  only when the long workflow justifies it.

## Responsive and platform decisions

Start with the smallest supported viewport. Switch before labels wrap badly,
controls lose useful width, or actions become unreachable. Use project targets;
when none exist, representative widths are 320–375 px narrow mobile, 390–430 px
ordinary mobile, around 768 px intermediate, and 1280–1440 px desktop. Choose
only widths exposing distinct risks.

Preserve information and task order across transformations. For mobile/native,
consider safe areas, keyboard avoidance, reachable actions and touch targets.
For web/desktop, consider focus order, keyboard navigation and hover-independent
operation. Choose a mobile sheet versus dialog from task length, keyboard use,
navigation depth and available space rather than a universal device rule.

Record only material composition decisions in the active work record, including
reused primitives, required states and chosen viewport coverage. Avoid decorative
density, hiding frequent controls for cleanliness, or removing small-screen
capabilities without an authorized product reason.
