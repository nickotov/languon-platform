# Screen Review Checklist

Run this after rendering. Record concrete failures, not generic approval.

## Blockers

- Can the primary task be completed?
- Can overlays, menus, and focused states be exited?
- Are primary actions reachable with the mobile keyboard open?
- Is essential content available at every supported viewport?
- Can destructive or irreversible actions occur accidentally?
- Do errors prevent silent data loss?

## Hierarchy and structure

- Is the purpose and primary action understandable within a few seconds?
- Does each section represent one coherent task or information group?
- Is required content visible and optional complexity appropriately disclosed?
- Are cards, overlays, tabs, steps, and routes used for the correct interaction
  model?
- Does the visual order match the task order?

## Components and forms

- Does every important field match its data type and expected length?
- Are label, control, help, and error semantically and visually connected?
- Are primary, secondary, and destructive actions distinguishable?
- Are validation errors visible, actionable, and stable?
- Are long text and translated labels handled without breaking layout?

## Rhythm and density

- Is edge padding free of doubled space or compensating first-child offsets?
- Does sibling rhythm visibly match the project's established spacing scale?
- Are repeated patterns spaced consistently?
- Is content width intentional?
- Is density appropriate for the task rather than merely compact?
- Are related items closer than unrelated sections?

## Responsive behavior

- Does layout switch before controls become cramped?
- Is task and information order preserved across breakpoints?
- Are safe areas, sticky regions, keyboard behavior, and scrolling correct?
- Does desktop space improve scanning without separating related controls?
- Are touch targets and desktop focus targets usable?

## States

- Loading
- Empty
- Error
- Validation
- Disabled
- Long content
- Overflow
- Destructive confirmation
- Slow or partial data
- Permission-restricted state

Verify only states relevant to the feature.

## Accessibility

- Correct landmarks and heading order
- Programmatic labels and descriptions
- Logical focus order
- Visible focus
- Accessible overlay names
- Focus trapping and restoration
- Escape and close behavior
- Non-color status and error indicators
- Sufficient contrast
- Reduced-motion behavior where animation is meaningful
