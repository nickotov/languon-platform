# Languon design system blueprint

Status: Reference guidance implemented by the public-web UI kit
Version: 0.4
Updated: 2026-08-25
Platforms: Public web and native mobile
Primary audience: Adult learners and tutors, approximately 18–45

## 1. Purpose

This document records Languon's visual direction, cross-platform design
semantics, accessible component requirements, and starter values. It guides the
public web implementation, but runtime tokens, shared component contracts,
stories, and verified platform behavior are authoritative when they differ.

The desired experience is modern, warm, editorial, calm, and quietly
intelligent. It should make serious language learning feel inviting without
looking childish, game-heavy, corporate, or like a generic AI dashboard.

### Product promise expressed through design

- **Human before artificial.** AI helps the learner, but language, culture, and
  conversation are the visual center.
- **Clarity builds confidence.** State, next actions, mistakes, and recovery are
  always understandable.
- **Progress without pressure.** Feedback is encouraging and specific; it does
  not use shame, artificial urgency, or excessive celebration.
- **Content has room to breathe.** Learning text and conversation take priority
  over chrome, decoration, and dense dashboards.
- **Accessible is the default.** Accessibility is a design input, not a final
  audit or a special theme.

## 2. Scope and boundaries

This first system covers shared foundations and primitives for the learner and
tutor experiences in the public Next.js web app and Expo/React Native mobile
app. The two clients share semantic intent, names, color relationships, and
content guidance, while interaction details remain native to each platform.

This version does not yet define:

- a logo, custom wordmark, mascot, or illustration library;
- complete navigation, onboarding, AI chat, course, lesson, workbook, canvas,
  tutor-management, or gamification patterns;
- React Native components or a cross-application runtime package;
- runtime behavior in a visual source; Figma Make is preferred when MCP-accessible
  and `main.pen` remains a legacy design-time token and reusable-symbol library,
  neither a substitute for accessible web or native primitives.

Those additions should extend these foundations rather than silently changing
their semantic meaning.

### Public web implementation

The public Next.js app implements this contract locally:

- semantic variables and theme mappings — `apps/web/src/app/globals.css`;
- SSR theme resolution — `apps/web/src/fsd/shared/theme`;
- accessible primitives — `apps/web/src/fsd/shared/ui`;
- component and state catalogue — `apps/web/.storybook` plus colocated stories.

Runtime semantic tokens, shared UI contracts, Storybook stories, and verified
application behavior are the implementation authority. This document, Figma
Make, and `design/main.pen` are optional design references. A delivery may
implement or revise a screen without first creating or approving a visual
artifact; it updates design references only when they are explicitly in scope.

## 3. Research and design position

### Current signals worth adopting

Modern platform systems are moving from anonymous minimalism toward more
recognizable type, shape, color, and motion. Material 3 Expressive emphasizes
responsive components, stronger typography, personalization, and natural
motion. Languon should adopt the added personality, but use it to communicate
learning state rather than decorate every interaction.

Apple's current material guidance separates controls and navigation from
content using an adaptive translucent layer. It also explicitly recommends
sparing use, native controls, and testing reduced transparency and motion.
Languon may use subtle translucency for a top bar, bottom navigation, or a
floating control group, but never as the only boundary behind text, form fields,
dialogs, or learning content.

Rounder controls, layered surfaces, responsive type, and gentle spring feedback
are current signals that can age well when their purpose is clear. Constant
shape morphing, low-contrast glass, large ambient gradients, and animation on
every state change are trends, not foundations.

### Language-learning references

- [Duolingo](https://design.duolingo.com/) demonstrates immediate feedback,
  recognizable personality, and motivation. Borrow feedback clarity, not its
  childlike proportions, mascot dependence, or reward intensity.
- [Babbel](https://www.babbel.com/) demonstrates adult credibility and practical
  learning language. Borrow content confidence, not a marketing-site aesthetic.
- [Busuu](https://www.busuu.com/) demonstrates structured progress and social
  learning. Borrow visible progress and community trust, not dense home-screen
  competition.

The result should feel less playful than Duolingo, warmer and more distinctive
than a utilitarian course platform, and calmer than a typical AI product.

### Adopt, constrain, avoid

| Signal           | Adopt                                                     | Constraint                                     | Avoid                                               |
| ---------------- | --------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------- |
| Expressive type  | Editorial display type for major moments                  | UI and long controls remain highly legible     | Decorative type in forms or small text              |
| Color            | Violet identity with warm coral highlights                | Semantic states keep their own hues            | Using color as the only meaning                     |
| Gradients        | Low-opacity violet-to-coral aura for rare hero/AI moments | Never reduce text or control contrast          | Persistent neon backgrounds or text gradients       |
| Rounded geometry | Related radii and concentric nested shapes                | Radius reflects component scale                | Making every element a pill                         |
| Motion           | Spatial continuity and immediate feedback                 | Calm durations and reduced mode                | Decorative loops, parallax, or blocked interaction  |
| Glass/material   | Optional navigation/control layer                         | Opaque fallback and contrast under all content | Glass fields, dialog bodies, or stacked blur layers |
| Personalization  | Light/dark/system and future extensible tokens            | One stable brand palette in version 1          | User-selected accents before full state testing     |
| AI styling       | Clear provenance, status text, and restrained aura        | AI state is named in text and semantics        | Sparkle icon or purple gradient as the only AI cue  |

Primary references:

- [Material 3 Expressive](https://m3.material.io/blog/building-with-m3-expressive)
- [Google's Material 3 Expressive overview](https://blog.google/products-and-platforms/platforms/android/material-3-expressive-android-wearos-launch/)
- [Apple: Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)
- [Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/)
- [WAI-ARIA Authoring Practices patterns](https://www.w3.org/WAI/ARIA/apg/patterns/)
- [Android touch-target guidance](https://support.google.com/accessibility/android/answer/7101858)
- [React Native accessibility](https://reactnative.dev/docs/accessibility)

## 4. Token model

Use three tiers so a future palette adjustment does not force component-level
rewrites:

1. **Reference tokens** are raw palette and measurement values, such as
   `ref.color.violet.700` and `ref.space.4`.
2. **System tokens** assign purpose, such as `sys.color.action.primary` and
   `sys.space.control.inline`.
3. **Component tokens** exist only for a justified exception, such as
   `cmp.toast.max-width`. Components should otherwise consume system tokens.

Token names express meaning, not appearance. Do not name a semantic token
`purple`, `white`, `desktop`, or `large-screen`. A dark theme changes values,
not token names.

Web code maps system tokens to CSS custom properties. Future mobile
code should map the same semantics to a typed theme object. This document does
not choose a package or permit application-source imports across `apps/*`.

### CSS custom-property handoff

The following are the approved web names. They are the handoff contract for
app-local theme files, not a shared runtime package or a license to add raw values
to components. Values are defined on the document theme root and components
consume `var(--sys-...)` through semantic styles.

| CSS custom property                  | System token / value               | Use                                      |
| ------------------------------------ | ---------------------------------- | ---------------------------------------- |
| `--sys-color-background-canvas`      | `sys.color.background.canvas`      | Page/app background                      |
| `--sys-color-surface-default`        | `sys.color.surface.default`        | Controls, cards, dialogs                 |
| `--sys-color-surface-subtle`         | `sys.color.surface.subtle`         | Grouped content and quiet containers     |
| `--sys-color-text-primary`           | `sys.color.text.primary`           | Main text                                |
| `--sys-color-text-secondary`         | `sys.color.text.secondary`         | Supporting text                          |
| `--sys-color-border-control`         | `sys.color.border.control`         | Default meaningful control boundary      |
| `--sys-color-action-primary`         | `sys.color.action.primary`         | Primary actions and active state         |
| `--sys-color-action-primary-hover`   | `sys.color.action.primary-hover`   | Pointer hover                            |
| `--sys-color-action-primary-pressed` | `sys.color.action.primary-pressed` | Press/touch feedback                     |
| `--sys-color-focus`                  | `sys.color.focus`                  | Focus ring                               |
| `--sys-color-danger`                 | `sys.color.danger`                 | Error text/icon and destructive action   |
| `--sys-color-disabled-surface`       | `sys.color.disabled.surface`       | Disabled control background              |
| `--sys-color-disabled-content`       | `sys.color.disabled.content`       | Disabled text/icon                       |
| `--sys-space-1` / `2` / `4` / `6`    | `4px` / `8px` / `16px` / `24px`    | Fine gap / compact / default / section   |
| `--sys-size-control-sm`              | `40px`                             | Pointer-rich web control only            |
| `--sys-size-control-md`              | `48px`                             | Default cross-platform control target    |
| `--sys-size-control-lg`              | `56px`                             | High-emphasis mobile action              |
| `--sys-radius-sm` / `md` / `lg`      | `10px` / `14px` / `20px`           | Controls / cards / panels                |
| `--sys-font-display` / `ui`          | `Literata` / `Manrope`             | Editorial display / interface and body   |
| `--sys-motion-fast` / `standard`     | `120ms` / `180ms`                  | Press/hover / small reveal and selection |
| `--sys-ease-standard`                | `cubic-bezier(0.2, 0.8, 0.2, 1)`   | Entry and spatial change                 |

For example, the app-local Button uses
`background: var(--sys-color-action-primary)`,
`min-height: var(--sys-size-control-md)`, and
`transition-duration: var(--sys-motion-fast)`. Its hover, pressed, focus, and
disabled rules must resolve through the corresponding semantic variables rather
than a computed or arbitrary color.

## 5. Color

### Reference palette

Reference scales are inputs, not approved foreground/background combinations.
Use semantic tokens for interface design and recheck any new composition.

| Step | Warm neutral | Violet    | Coral     |
| ---: | ------------ | --------- | --------- |
|    0 | `#FFFFFF`    | —         | —         |
|   50 | `#FBF8F6`    | `#F4F1FF` | `#FFF0EA` |
|  100 | `#F5F0F4`    | `#ECE7FF` | `#FFE1D6` |
|  200 | `#DED5DF`    | `#DCD2FF` | `#FFC6B5` |
|  300 | `#C4B8C7`    | `#C9B9FF` | `#F7A180` |
|  400 | `#AFA2B3`    | `#BBA6FF` | `#ED7B5A` |
|  500 | `#8B7F90`    | `#9A7FF4` | `#D95F42` |
|  600 | `#746879`    | `#765AE3` | `#B7472F` |
|  700 | `#5F5564`    | `#5C3CCB` | `#8F3525` |
|  800 | `#453A4A`    | `#4E30B6` | `#6C2A20` |
|  900 | `#2B2430`    | `#3E268F` | `#4A1D18` |
|  950 | `#17131B`    | `#23144E` | `#35120B` |

Green is not a brand color. It is reserved for success and correct learning
feedback. Coral is a brand accent, not an error color. This separation prevents
identity and status from becoming ambiguous.

### Semantic themes

| Token                                   | Light                 | Dark               | Intended use                          |
| --------------------------------------- | --------------------- | ------------------ | ------------------------------------- |
| `sys.color.background.canvas`           | `#FBF8F6`             | `#17131B`          | App background                        |
| `sys.color.surface.default`             | `#FFFFFF`             | `#211C26`          | Cards and controls                    |
| `sys.color.surface.subtle`              | `#F5F0F4`             | `#2B2430`          | Grouped content                       |
| `sys.color.surface.raised`              | `#FFFFFF`             | `#352C3A`          | Floating overlays                     |
| `sys.color.text.primary`                | `#211C26`             | `#FBF8FC`          | Main text                             |
| `sys.color.text.secondary`              | `#5F5564`             | `#D1C7D4`          | Supporting text                       |
| `sys.color.text.tertiary`               | `#746879`             | `#AFA2B3`          | Metadata; never disabled-only meaning |
| `sys.color.border.subtle`               | `#DED5DF`             | `#453A4A`          | Decorative separation only            |
| `sys.color.border.control`              | `#8B7F90`             | `#776A7D`          | Meaningful control boundary           |
| `sys.color.border.control-strong`       | `#746879`             | `#93869A`          | Boundary on grouped/raised surfaces   |
| `sys.color.action.primary`              | `#5C3CCB`             | `#BBA6FF`          | Primary action and active state       |
| `sys.color.action.primary-hover`        | `#4E30B6`             | `#CDBEFF`          | Pointer hover                         |
| `sys.color.action.primary-pressed`      | `#3E268F`             | `#9A7FF4`          | Pressed state                         |
| `sys.color.action.on-primary`           | `#FFFFFF`             | `#23144E`          | Content on primary                    |
| `sys.color.action.primary-soft`         | `#ECE7FF`             | `#382C68`          | Selected container                    |
| `sys.color.action.on-primary-soft`      | `#3E268F`             | `#E9E1FF`          | Content on selected container         |
| `sys.color.action.primary-soft-pressed` | `#DCD2FF`             | `#4A3A80`          | Pressed quiet/secondary container     |
| `sys.color.accent.default`              | `#B7472F`             | `#F7A180`          | Warm editorial accent                 |
| `sys.color.accent.soft`                 | `#FFF0EA`             | `#522D27`          | Accent container                      |
| `sys.color.accent.on-soft`              | `#8F3525`             | `#F7A180`          | Content on accent container           |
| `sys.color.focus`                       | `#6E4FE2`             | `#D9CEFF`          | Keyboard focus ring                   |
| `sys.color.success`                     | `#16715B`             | `#63D6B0`          | Success/correct state                 |
| `sys.color.success-soft`                | `#E6F5EF`             | `#163C33`          | Success container                     |
| `sys.color.warning`                     | `#7A4B00`             | `#F5C66F`          | Warning state                         |
| `sys.color.warning-soft`                | `#FFF1CF`             | `#493714`          | Warning container                     |
| `sys.color.danger`                      | `#B32646`             | `#FF93A9`          | Error/destructive state               |
| `sys.color.danger-hover`                | `#961A37`             | `#FFADBD`          | Destructive-action hover              |
| `sys.color.danger-pressed`              | `#76122B`             | `#F47791`          | Destructive-action pressed            |
| `sys.color.on-danger`                   | `#FFFFFF`             | `#35121E`          | Content on filled destructive action  |
| `sys.color.danger-soft`                 | `#FFE9EE`             | `#512230`          | Error container                       |
| `sys.color.info`                        | `#1E62B0`             | `#8EC5FF`          | Informational state                   |
| `sys.color.info-soft`                   | `#EAF3FF`             | `#183653`          | Information container                 |
| `sys.color.disabled.surface`            | `#ECE7EC`             | `#352C3A`          | Disabled control surface              |
| `sys.color.disabled.content`            | `#5F5564`             | `#AFA2B3`          | Disabled content                      |
| `sys.color.disabled.border`             | `#C4B8C7`             | `#776A7D`          | Disabled-state boundary only          |
| `sys.color.overlay.scrim`               | `rgb(23 19 27 / 56%)` | `rgb(0 0 0 / 68%)` | Modal scrim                           |

### Verified contrast pairs

Ratios below use the WCAG relative-luminance algorithm. They validate only the
listed pair, not arbitrary combinations of the same colors.

| Pair                                    | Light ratio | Dark ratio | Requirement        |
| --------------------------------------- | ----------: | ---------: | ------------------ |
| Primary text on canvas                  |     15.78:1 |    17.40:1 | Body text          |
| Secondary text on canvas                |      6.69:1 |    11.20:1 | Body text          |
| Tertiary text on canvas                 |      4.97:1 |     7.54:1 | Small text minimum |
| On-primary content on primary           |      7.09:1 |     7.81:1 | Button text/icons  |
| Primary/link color on canvas            |      6.70:1 |     8.74:1 | Link/action text   |
| Accent color on canvas                  |      5.02:1 |     9.05:1 | Accent text        |
| Control border on surface               |      3.79:1 |     3.29:1 | Non-text boundary  |
| Strong border on grouped/raised surface |      4.66:1 |     3.89:1 | Non-text boundary  |
| Focus color on canvas                   |      5.12:1 |    12.42:1 | Focus indication   |
| Success color on canvas                 |      5.60:1 |    10.28:1 | Status text/icon   |
| Warning color on canvas                 |      7.01:1 |    11.52:1 | Status text/icon   |
| Danger color on canvas                  |      6.05:1 |     8.73:1 | Status text/icon   |
| Information color on canvas             |      5.79:1 |    10.11:1 | Status text/icon   |

Soft status containers pair their corresponding status foregrounds at 5.26:1
or higher. Component designers must not place tertiary text, a subtle border, or
coral accent on an unverified surface.

### Theme rules

- Default to the operating-system preference. Offer Light, Dark, and System.
- Persist an explicit choice and apply it before first paint to avoid a flash of
  the wrong theme.
- Declare native color-scheme behavior so built-in fields, menus, keyboards, and
  scrollbars agree with the selected theme.
- Dark theme is designed independently; it is not a mechanical inversion.
- Provide increased-contrast mappings where a platform exposes that preference.
- Support forced colors on the web. Do not remove system focus or control colors
  unless an equally perceivable replacement is proven.
- Use an opaque surface when transparency is reduced or when background content
  makes an overlaid control fail contrast.
- Never encode correct/incorrect, active/inactive, speaker/listener, or AI/human
  solely through hue.

## 6. Typography

### Families

- **Display and learning editorial:**
  [Literata Variable](https://fonts.google.com/specimen/Literata), weights 500–700.
  Use for hero titles, lesson titles, quotations, cultural notes, and selected
  long-form reading content.
- **Interface and general body:**
  [Manrope Variable](https://fonts.google.com/specimen/Manrope), weights 400–700.
  Use for navigation, forms, buttons, metadata, body copy, and dense product UI.
- **Fallback:** platform sans/serif followed by an appropriate Noto family for
  scripts not covered by the primary fonts.

Both primary families must be self-hosted when implemented, subset without
removing required characters, and tested with English, Spanish, French, and
Russian. Future learning languages may require a script-specific family; do not
force Latin metrics onto Arabic, Hebrew, CJK, Devanagari, or other scripts.

### Type roles

| Role       | Family   | Size/line height | Weight | Notes                                 |
| ---------- | -------- | ---------------- | -----: | ------------------------------------- |
| Display XL | Literata | `64/68`          |    600 | Desktop hero only; fluid down to 40   |
| Display L  | Literata | `48/52`          |    600 | Marketing or major learning milestone |
| Display M  | Literata | `40/44`          |    600 | Compact hero                          |
| Heading 1  | Literata | `32/40`          |    600 | Page title                            |
| Heading 2  | Literata | `24/32`          |    600 | Section title                         |
| Heading 3  | Manrope  | `20/28`          |    650 | Component/group title                 |
| Body large | Manrope  | `18/28`          |    400 | Intro and important learning prose    |
| Body       | Manrope  | `16/24`          |    400 | Default UI and reading minimum        |
| Body small | Manrope  | `14/20`          |    400 | Supporting copy and metadata          |
| Label      | Manrope  | `14/20`          |    650 | Controls and field labels             |
| Caption    | Manrope  | `12/16`          |    550 | Nonessential metadata only            |

- Use `clamp()` for large web display roles; body and controls must remain stable
  under browser and operating-system text scaling.
- Never render essential information below 14px. Inputs remain at least 16px on
  mobile web to avoid focus zoom.
- Keep prose between 45 and 75 characters per line; target approximately 65.
- Do not justify body text. Preserve user text-spacing overrides.
- Avoid all caps except very short eyebrow labels. Never use all caps for
  instructions, errors, tabs, or long translated labels.
- Let translated labels wrap. Truncation is acceptable only when the full value
  has another accessible presentation.
- Use tabular numerals for timers, scores, and aligned numeric progress.

## 7. Space, layout, shape, elevation, and iconography

### Space

Use a 4px base. Approved reference values are `0, 4, 8, 12, 16, 20, 24, 32,
40, 48, 64, 80, 96`. Prefer 8px increments for layout and 4px increments for
fine internal alignment. Do not introduce one-off values when an adjacent token
expresses the intended rhythm.

### Responsive layout

| Range    | Width        | Grid and gutter         |
| -------- | ------------ | ----------------------- |
| Compact  | `0–599px`    | 4 columns, 16px gutter  |
| Medium   | `600–1023px` | 8 columns, 24px gutter  |
| Expanded | `≥1024px`    | 12 columns, 32px gutter |

- Maximum product-content width: 1200px.
- Maximum continuous reading width: 720px.
- Breakpoints are guidance; components reflow when their own content no longer
  fits, not only at a global device width.
- Use logical start/end spacing. Prepare mirroring for future RTL layouts.
- Respect mobile safe areas, software keyboards, orientation, and dynamic window
  sizes. Bottom actions must remain visible without covering focused fields.
- At a 320 CSS px content viewport—for example, a 1280 CSS px viewport at 400%
  browser zoom—content reflows without two-dimensional scrolling except for
  intrinsically two-dimensional content such as a canvas.

### Control and target sizes

| Size   | Visual height | Use                                     |
| ------ | ------------: | --------------------------------------- |
| Small  |          40px | Pointer/keyboard-rich web contexts only |
| Medium |          48px | Default control and field               |
| Large  |          56px | Primary mobile or high-emphasis action  |

Every web and iOS interactive target is at least 44×44; Android targets are at
least 48×48dp. A 16px or 24px icon may sit inside that larger target. Keep 8dp
between adjacent mobile targets where practical and never allow enlarged hit
areas to overlap.

### Radius

| Token         |  Value | Typical use                              |
| ------------- | -----: | ---------------------------------------- |
| `radius.xs`   |    6px | Small tags, focus-adjacent details       |
| `radius.sm`   |   10px | Inputs and compact controls              |
| `radius.md`   |   14px | Buttons and cards                        |
| `radius.lg`   |   20px | Panels and dialogs                       |
| `radius.xl`   |   28px | Bottom sheets and large feature surfaces |
| `radius.full` | 9999px | Avatars, status dots, true pills         |

Nested rounded shapes should appear optically concentric: an inner radius is
approximately the outer radius minus the shared inset. Do not use full pills as
the default for every button, input, tab, and card.

### Elevation

| Level | Light-theme shadow                | Use                        |
| ----- | --------------------------------- | -------------------------- |
| 0     | none                              | Canvas and inline surfaces |
| 1     | `0 1px 2px rgb(23 19 27 / 8%)`    | Card lift                  |
| 2     | `0 8px 24px rgb(23 19 27 / 10%)`  | Popover and toast          |
| 3     | `0 20px 48px rgb(23 19 27 / 14%)` | Dialog and sheet           |

Dark themes depend more on surface value and control borders than shadows.
Elevation never replaces a necessary 3:1 boundary.

### Icons and imagery

- Use a consistent rounded, 2px-stroke, 24px-grid icon language. Lucide naming
  and geometry are the default reference for future implementation.
- Standard sizes are 16, 20, 24, and 32. Do not scale a stroke icon nonuniformly.
- Decorative icons are hidden from assistive technology. Icon-only actions have
  a localized accessible name and, when unfamiliar, a visible text alternative.
- Country flags do not represent languages. Use language names or recognized
  language/script codes.
- Illustrations should feel editorial and culturally specific without relying on
  stereotypes. People, places, and scripts require accurate representation.

## 8. Motion and feedback

Motion explains cause, spatial relationship, progress, or completion. It is not
ambient decoration.

| Token             | Duration | Typical use                                 |
| ----------------- | -------: | ------------------------------------------- |
| `motion.fast`     |    120ms | Press, hover, icon state, exit              |
| `motion.standard` |    180ms | Small reveal, selection, tooltip            |
| `motion.slow`     |    280ms | Dialog, sheet, meaningful layout transition |

- Standard easing: `cubic-bezier(0.2, 0.8, 0.2, 1)` for entry and spatial change;
  use a quicker ease-in for exit.
- Native springs may provide direct-manipulation feedback, but must settle
  quickly without overshoot that obscures content.
- Do not delay data or block an action to let an animation finish.
- Correct-answer feedback may combine a small color/shape change, icon, text,
  and optional haptic. Incorrect feedback never shakes a whole screen.
- Respect reduced motion: remove parallax, continuous movement, large transforms,
  auto-scrolling, and decorative morphs; use instant changes or a short opacity
  transition no longer than 100ms.
- Respect reduced transparency by replacing blur/translucency with an opaque
  semantic surface.

## 9. Component specification template

Every generated or implemented component must document:

1. purpose and when not to use it;
2. semantic/native element or platform primitive;
3. anatomy and required content;
4. variants and sizes;
5. default, hover, pressed, focus-visible, selected, loading, read-only,
   disabled, success, warning, and error states as applicable;
6. keyboard, pointer, touch, screen-reader, dismissal, and focus behavior;
7. light, dark, increased-contrast, reduced-motion, and reduced-transparency
   behavior;
8. compact/medium/expanded reflow and long localized text;
9. content guidance and prohibited uses;
10. future story and test cases.

Disabled controls are unavailable and removed from sequential focus when native
behavior requires it. Read-only fields remain perceivable and focusable when
their value may need to be read or copied. Loading controls preserve their
width, communicate busy state, and prevent duplicate submission.

### Component state color mappings

Values are `foreground / background / border`. A transparent background resolves
to the verified containing canvas or default surface. Use the strong control
border whenever a control sits on a grouped, subtle, or raised surface. Disabled
controls are exempt from WCAG contrast requirements, but their unavailable state
must be explained by context or text rather than faint styling alone.

| State                           | Light mapping                         | Dark mapping                          |
| ------------------------------- | ------------------------------------- | ------------------------------------- |
| Primary default                 | `#FFFFFF / #5C3CCB / #5C3CCB`         | `#23144E / #BBA6FF / #BBA6FF`         |
| Primary hover                   | `#FFFFFF / #4E30B6 / #4E30B6`         | `#23144E / #CDBEFF / #CDBEFF`         |
| Primary pressed                 | `#FFFFFF / #3E268F / #3E268F`         | `#23144E / #9A7FF4 / #9A7FF4`         |
| Secondary default               | `#5C3CCB / #FFFFFF / #5C3CCB`         | `#BBA6FF / #211C26 / #BBA6FF`         |
| Secondary/quiet hover           | `#3E268F / #ECE7FF / #4E30B6`         | `#E9E1FF / #382C68 / #CDBEFF`         |
| Secondary/quiet pressed         | `#3E268F / #DCD2FF / #3E268F`         | `#E9E1FF / #4A3A80 / #BBA6FF`         |
| Quiet default                   | `#5C3CCB / transparent / transparent` | `#BBA6FF / transparent / transparent` |
| Destructive default             | `#FFFFFF / #B32646 / #B32646`         | `#35121E / #FF93A9 / #FF93A9`         |
| Destructive hover               | `#FFFFFF / #961A37 / #961A37`         | `#35121E / #FFADBD / #FFADBD`         |
| Destructive pressed             | `#FFFFFF / #76122B / #76122B`         | `#35121E / #F47791 / #F47791`         |
| Field default                   | `#211C26 / #FFFFFF / #8B7F90`         | `#FBF8FC / #211C26 / #776A7D`         |
| Field on grouped/raised surface | `#211C26 / #FFFFFF / #746879`         | `#FBF8FC / #211C26 / #93869A`         |
| Field focus                     | `#211C26 / #FFFFFF / #6E4FE2`         | `#FBF8FC / #211C26 / #D9CEFF`         |
| Field error                     | `#211C26 / #FFFFFF / #B32646`         | `#FBF8FC / #211C26 / #FF93A9`         |
| Field success                   | `#211C26 / #FFFFFF / #16715B`         | `#FBF8FC / #211C26 / #63D6B0`         |
| Read-only field                 | `#211C26 / #F5F0F4 / #746879`         | `#FBF8FC / #2B2430 / #93869A`         |
| Disabled control                | `#5F5564 / #ECE7EC / #C4B8C7`         | `#AFA2B3 / #352C3A / #776A7D`         |

Verified state pairs meet 4.5:1 for text and 3:1 for meaningful borders. The
lowest new meaningful pair is the dark strong border on a raised surface at
3.89:1. New normal-text state pairs are at least 5.24:1. Disabled borders are
deliberately excluded from this claim and cannot carry required information.

## 10. Core components

### Text, heading, link, icon, card, divider, badge, and chip

- Preserve semantic heading order; visual size does not choose heading level.
- Links are underlined in body copy and remain distinguishable without color.
  Focus, visited, and external behavior must be intentional.
- Cards group related content but are not automatically interactive. When an
  entire card is actionable, expose one clear accessible target and keep nested
  actions independent.
- Dividers are decorative unless they separate named regions; subtle borders do
  not carry meaning.
- Badges communicate status or count. Chips represent a removable value, filter,
  or choice. Do not use the names interchangeably.
- Status badges combine label, icon/shape when useful, and semantic color.

### Button and icon button

Variants:

- **Primary:** one main action per local decision area.
- **Secondary:** alternative action with visible border or soft surface.
- **Quiet:** low-emphasis toolbar or supporting action.
- **Destructive:** dangerous action, using danger semantics and explicit copy.
- **Text/link action:** navigation or low-emphasis inline action; do not style a
  state-changing action as a link without clear behavior.
- **Icon button:** familiar compact action with accessible name and optional
  tooltip on pointer/keyboard platforms.

Sizes are 40, 48, and 56, with horizontal padding 16, 20, and 24 respectively;
icon gap is 8. A loading button retains its label or provides an equally specific
busy label. Destructive irreversible actions require confirmation at the pattern
level. Disabled styling must not be the only explanation for unavailability.

### Input and field

An input is a field system, not only a rectangle. Anatomy is visible label,
required/optional indication when needed, control, optional prefix/suffix,
helper text, error text, and optional count. Placeholder text is an example, not
a label.

- Default height is 48; large is 56. Use 16px input text.
- Support text, email, password, URL, telephone, number, search, and one-time-code
  purposes with correct keyboard and autocomplete metadata.
- Show error next to the field, connect it programmatically, and describe how to
  fix it. Preserve user-entered values after validation failure.
- Do not validate on every keystroke unless immediate feedback genuinely helps.
  Validate on blur or submit and move focus only when the user's action warrants it.
- Password reveal is a named button, preserves focus and caret, and communicates
  its state. OTP supports paste and password-manager/OS autofill.
- Prefixes and suffixes cannot obscure value or error text at 200% text size.

### Textarea

- Uses the field anatomy above, 16px text, 128px minimum height, and vertical
  resizing on web unless layout safety prohibits it.
- The label states the expected content. Helper text may explain format; a count
  appears only when a real limit exists.
- Preserve line breaks and pasted content. Do not auto-grow beyond the viewport
  without leaving a usable scroll/focus strategy.

### Checkbox, radio group, and switch

- **Checkbox:** zero or more independent selections. Support unchecked, checked,
  and indeterminate when a real parent/child selection relationship exists.
- **Radio group:** exactly one choice from a visible set. Arrow keys move within
  the group; a legend or group label describes the question.
- **Switch:** an immediate on/off setting. The visible label does not change when
  state changes; state is conveyed separately. Do not use a switch for a choice
  that still requires a Save/Submit action.
- Labels activate the control. Visual marks are backed by native semantics and
  stay visible in forced/increased contrast.
- The control glyph may be 20–24, but its complete target follows platform minima.

### Select and combobox

- Use a native select/picker for a short, static, single-choice list.
- Use a custom combobox only for searchable, async, creatable, or sufficiently
  long data. Do not replace a native select for visual consistency alone.
- The collapsed control uses the field anatomy. The popup has a clear selected
  item, keyboard navigation, typeahead/search as appropriate, and a recoverable
  empty/error/loading state.
- Follow the WAI-ARIA combobox pattern on web; mobile uses the platform picker or
  an accessible modal/sheet pattern. Do not trap typed text without a way to
  clear it.

### Tabs and tab panels

- Tabs switch peer sections in the same context; they are not page navigation.
- Use automatic activation only when the panel appears without noticeable delay.
  Otherwise arrow keys move focus and Enter/Space activates.
- Support Left/Right or Up/Down according to orientation plus Home and End.
- The active tab has text/shape indication beyond color. Each tab names and owns
  one panel; inactive panels do not expose hidden interactive content.
- On compact screens, tabs may scroll horizontally with visible overflow cues.
  Do not silently convert many tabs into a tiny wrapping row.

### Tooltip, popover, and menu

- A tooltip provides supplemental, noninteractive text. Essential instructions
  remain visible elsewhere.
- Tooltip content may be structured React content for emphasis, icons, or
  multi-line layout, but it remains noninteractive: no links, buttons, fields, or
  required action may be placed inside it.
- Pointer tooltips appear after about 500ms; keyboard focus reveals immediately.
  They stay open while pointer/focus is over trigger or tooltip, dismiss with
  Escape, and do not obscure the trigger. On web they render in the top layer and
  offset, flip, then shift inside a 16px viewport boundary as space changes.
- Do not depend on hover on touch devices. Use visible helper text or a named
  disclosure/popover for mobile explanations.
- A popover may contain interactive content and receives an accessible name and
  deliberate focus/dismissal behavior. On web, use the native Popover API for
  top-layer stacking, light dismissal, and Escape behavior. Anchor positioning
  must auto-update while open and apply offset, flip, and shift collision handling
  with at least 16px viewport padding; parent overflow must never clip the panel.
- A menu contains actions, not arbitrary form layout. Arrow-key behavior follows
  the platform/WAI-ARIA menu pattern.

### Dialog and alert dialog

- Prefer the native `<dialog>` lifecycle on web and native modal primitives on
  mobile. Provide a labelled title and optional description.
- Widths: small 400, medium 560, large 720; maximum width is viewport minus 32.
  Height never hides the close/action area; internal content scrolls when needed.
- Move focus to the safest useful element, contain focus while modal, close with
  Escape/back unless a truly blocking operation makes that unsafe, and restore
  focus to the invoker or the next logical target.
- Button order follows platform convention. Destructive confirmation names the
  consequence and makes the safe action easy to find.
- An alert dialog is reserved for a short urgent decision, not ordinary forms or
  informational announcements.

### Bottom sheet

- Use on compact/mobile layouts for contextual actions, selection, or a focused
  short task. Prefer a dialog or page when the task is long or keyboard-heavy.
- Radius is 28 at the exposed top corners. Maximum height is 90% of the safe
  viewport; content and actions remain usable with the software keyboard open.
- A modal sheet follows modal focus and screen-reader rules. A nonmodal sheet is
  explicitly described and leaves underlying interaction genuinely usable.
- Dragging may resize/dismiss, but an explicit close action and non-drag
  alternative are mandatory. Announce snap-state changes only when useful.
- The scrim and raised surface create separation without relying on blur.

### Toast and inline alert

- Toasts confirm a result or report a nonblocking status. They never carry the
  only copy of an error, validation result, or required next step.
- Use one polite live region for ordinary status and assertive announcements only
  when immediate interruption is necessary.
- Informational/success toasts remain for at least 6 seconds and pause on
  hover/focus. A toast with an action or important error persists until dismissed,
  or the same message and action remains available in persistent nearby UI. Do
  not make touch, switch, voice-control, or slow-reading users race a timer.
- Maximum three visible toasts; queue additional items. Recommended maximum width
  is 400 on web and viewport minus 32 on compact screens.
- Web applications render exactly one ToastHost near the application root. Toast
  producers dispatch ephemeral notifications through the shared client store and
  never require a context provider. The store exposes show, dismiss, and clear;
  the host alone owns queue rendering and the single localized live region.
- Inline alerts sit near the affected content and support info, success, warning,
  and danger. Each uses text plus icon/shape, not color alone.

### Spinner, progress, and skeleton

- Spinner: unknown short wait. It has a status label when the wait is not already
  named by the busy control or region.
- Progress: known completion. Expose current value, min/max, and a useful text
  description. Do not show fake precision.
- Skeleton: preserves expected layout during a short content load. It is hidden
  from assistive technology while the containing region reports busy.
- Reduced motion removes shimmer and uses a static placeholder.
- After roughly 10 seconds, replace indefinite feedback with useful explanatory
  copy, cancellation, retry, or recovery when the operation permits it.

### Empty, loading, and error states

- An empty state explains what is absent, why when useful, and the most relevant
  next action. Distinguish a first-use empty collection from filtered-no-results
  and permissions-based absence; do not present all three as “Nothing here.”
- A loading state preserves stable layout, names the busy region, and does not
  replace already usable content unnecessarily. Choose spinner, progress, or
  skeleton according to whether duration and layout are known.
- A region or page error identifies the failed content, uses calm specific copy,
  and offers retry, alternate navigation, offline guidance, or support only when
  those actions can help. Preserve user input and previously loaded content.
- Loading-to-content and retry transitions do not steal focus. When a user
  explicitly activates Retry, announce the result and move focus only if the
  previous target disappears or a blocking error summary requires attention.
- Empty and error illustrations are optional and decorative; the heading, body,
  and action remain sufficient without them. All variants support long localized
  copy, both themes, compact layouts, reduced motion, and offline/error semantics.

## 11. Accessibility contract

The implementation target is WCAG 2.2 Level AA for web plus native iOS and
Android accessibility conventions. The system aims beyond minimum conformance
where doing so improves normal use.

### Perceivable

- Normal text is at least 4.5:1; large text is at least 3:1; meaningful control
  boundaries, state marks, icons, and focus indicators are at least 3:1 against
  adjacent colors.
- Status is never color-only. Pair hue with text, icon, position, or shape.
- Support 200% text resizing and 400% zoom/reflow without clipped controls or
  lost content. Native text scaling remains enabled.
- Content images have useful alternatives; decorative images/icons are ignored.
- Audio/video learning content requires captions, transcripts, and appropriate
  controls when those media patterns are introduced.

### Operable

- Every action is keyboard operable with a logical order and no trap outside an
  intentional modal. Keyboard and pointer outcomes match.
- Use a 3px focus ring with 2px offset. It is never clipped, obscured by sticky
  UI, or removed because a mouse style looks cleaner.
- Targets follow the 44px/44pt and 48dp system minima documented above.
- Any drag interaction has a tap/keyboard alternative. Device motion is never
  the only input.
- Tooltips, popovers, notifications, and time-limited content meet dismissal,
  hover/focus persistence, pause, and timing requirements.

### Understandable

- Visible labels and accessible names agree. Instructions precede the action
  they qualify when practical.
- Validation identifies the field, problem, and correction. Destructive or
  high-impact actions support review, confirmation, or undo as appropriate.
- Navigation, help placement, control names, and icon meaning remain consistent.
- Avoid idioms, jokes, or unexplained technical language in essential UI; the
  product teaches languages and must not create accidental comprehension tests.

### Robust

- Prefer semantic HTML and native controls. Use ARIA only to fill a semantic gap,
  following the corresponding WAI-ARIA Authoring Practices pattern.
- Names, roles, values, descriptions, live state, expanded state, selection, and
  errors are programmatically available.
- Set the correct document/interface language. Mark phrases and passages whose
  language differs from the surrounding UI so assistive technology can switch
  pronunciation: use HTML `lang` on web and the corresponding accessibility-language
  API on native platforms. Include mixed-language examples in stories and tests.
- Test with keyboard, browser accessibility tree, VoiceOver, TalkBack, zoom,
  text scaling, forced/increased contrast, reduced motion, reduced transparency,
  and both themes when components are implemented.

## 12. Content and product voice

- Tone is direct, warm, respectful, and specific.
- Buttons begin with an action verb when space permits: “Start lesson,” “Save
  word,” “Try again.” Avoid vague “OK” or “Yes” when the action can be named.
- Errors explain what happened and what the user can do, without blame.
- AI output is identified when provenance matters. Loading language describes
  the actual stage only when known; do not imply that a model is “thinking.”
- Correct-answer feedback describes the success. Incorrect-answer feedback
  teaches or offers another attempt rather than punishing.
- Labels accommodate translation expansion of at least 30% in Latin/Cyrillic
  layouts. Avoid embedding English words inside images.

## 13. Implementation and synchronization guidance

For the current and future platform implementations:

1. Keep semantic tokens and theme selection below visual primitives.
2. Build and extend app-local shared primitives under `src/fsd/shared/ui` for web
   in accordance with ADR-0005 and ADR-0016; use semantic HTML, CSS Modules, and
   colocated stories.
3. Build native mobile equivalents from React Native/platform primitives, not
   DOM behavior copied into mobile.
4. Cover every material visual, interaction, disabled, error, loading, theme,
   accessibility, responsive, and mixed-language state in stories or native equivalents.
5. Migrate pages incrementally; do not combine token adoption with
   unrelated product redesign.
6. Verify in real browsers/devices and with assistive settings. Automated
   accessibility checks supplement, but do not replace, keyboard and screen-reader
   review.

The web API is app-local and exported from `apps/web/src/fsd/shared/ui/index.ts`.
Do not import it across applications or create a competing token source. Any
delivery that changes runtime token values or component semantics updates
stories, affected runtime code, and acceptance evidence together; update this
document or a visual artifact when the change also revises that guidance. New dependencies or
cross-application ownership remain feature-sized architecture decisions.

### Dictionary authoring and generation patterns

The public-web dictionary experience extends the shared primitives without
changing their token or interaction semantics. The existing `Dictionary / …`
screens in `design/main.pen` are optional composition references for library,
authoring, sharing, AI review, batch, document, and transfer work. Runtime
components and stories arrive with their implementation milestones; visual
artifacts neither gate delivery nor imply that future behavior is available.

Card creation and editing are focused contextual tasks: use a desktop dialog and
a mobile bottom sheet, with required bilingual fields first and optional fields
scrolling within the overlay. Collection cards expose their status and learning
content directly; Edit, Regenerate with AI, and Archive live in a labelled
three-dot popover rather than repeated card-level action rows.

Document generation is a staged journey, never a mixed dashboard: select Upload
file or Paste text, submit to durable scanning, extraction, and AI processing,
then show one editable final card-proposal review only after processing and
original-byte cleanup complete. Row failures appear in that same review; there
is no separate extracted-term editing stage. Cancelled, failed, and no-terms
outcomes preserve a clear return path and never present partial output as a
completed result.

#### Information hierarchy

- The dictionary library prioritizes name, language direction, active-card
  count, visibility, last update, and the create action. First-use empty,
  filtered-no-results, loading, offline, and retry states remain distinct.
- The editor keeps dictionary identity/settings separate from the ordered card
  collection. Explicit Save and Cancel actions, dirty state, optimistic
  conflicts, archive/restore, and sharing consequences are named in persistent
  UI rather than communicated only by a toast.
- Source and target selectors show language names and canonical tags without
  flags. The source/target direction stays visible near card fields, and the
  pair-lock explanation appears when cards prevent a language change.
- Optional-field settings use labelled checkboxes within an explicit-save form,
  not immediate switches. Definition/example language roles and transcription
  notation appear only when applicable. Disabling a field explains that stored
  values are preserved but inactive.
- Card rows show the source phrase, translation, active optional content,
  authorship text, and order. Card-level actions use an adjacent labelled
  overflow popover. Editing opens a desktop dialog and a mobile bottom sheet
  rather than compressing multilingual fields into a dense row.

#### Card editor

- Source and translation are always visible, required fields. Transcription,
  definition, context example, and paired example translation appear according
  to the effective dictionary settings plus card overrides.
- Advanced settings use a named disclosure. Every optional field offers
  **Inherit**, **Enabled**, and **Disabled** where an override is permitted;
  applicable language roles use **Source language** and **Target language**.
  The UI never exposes nullable database terminology.
- The example and its translation are a semantic pair. The translation control
  cannot be enabled without the example and uses the opposite language role.
- Inactive preserved values remain available in an explained read-only preview
  before re-enabling; disabling never visually implies that content was deleted.
- Each source, translation, definition, example, and transcription passage has
  its resolved BCP 47 `lang` metadata. Labels remain in the interface locale.

#### AI proposal and batch review

- New-card AI authoring stays inside the Add Card dialog/sheet. Once Source is
  valid, **Generate with AI** proposes Translation and enabled optional values
  directly below their inputs. Each plain-text choice keeps explicit **Accept**,
  **Discard**, and **Regenerate field** actions; accepting fills only that input,
  discarding never erases draft text, and field or whole-set regeneration appends
  bounded choices without silently removing earlier alternatives. Manual editing
  remains available throughout progress, and a Source change visibly stales the
  old choices before any further acceptance.
- AI work is review-first. The source card and editable proposed card are shown
  side by side at expanded widths and in a clearly ordered original/proposal
  stack on compact screens. Diff styling combines labels and changed-field
  markers with color; unchanged and unavailable fields remain distinguishable.
- Provenance is written as **Human**, **AI-generated**, or **Human + AI** and is
  not represented by a sparkle, gradient, or violet color alone. Warnings,
  reasons, and alternatives are explicit text associated with their field.
- Persistent progress names only known stages, exposes cancellation, survives
  navigation/reload, and changes to actionable retry or recovery after a
  meaningful wait. Do not describe a provider as “thinking.”
- Accepting a proposal replaces the candidate atomically after review. Discard,
  regenerate, edit, conflict recovery, and accept are separate named actions;
  the primary action never hides a stale-version warning.
- Batch, document, and import candidates use a review table at expanded widths
  and stacked candidate cards at compact widths. Selection, row errors,
  duplicate warnings, source order, capacity, and atomic commit outcome remain
  perceivable without horizontal page scrolling or color-only state.
- Document upload shows accepted types and limits before selection, never
  presents scanning as a guarantee of safety, and distinguishes upload,
  scanning, extraction, OCR, proposal, cleanup, cancelled, and failed states
  only when the backend actually knows them.

#### Responsive and accessibility states

- At 320px, the editor becomes one content column with source before target,
  actions in document order, and no sticky region covering focused fields or
  software keyboards. Reordering always has keyboard/tap alternatives to drag.
- At 200% text, language labels, authorship, warnings, card actions, and counts
  wrap without truncating essential information. A 10,000-card collection uses
  pagination/incremental loading rather than rendering every card at once.
- Loading, empty, error, offline, conflict, archived, private, and unlisted
  states have text headings and recovery actions. Anonymous public pages expose
  no owner-private metadata and keep the fork action separate from sign-in.
- Public capability pages show dictionary identity, language direction, cards,
  no-index state, and independent-copy consequences without owner-private data.
  Signed-out fork returns to the same fragment capability after sign-in. Missing,
  private, rotated, revoked, and archived links share one calm unavailable state
  so presentation does not become an enumeration oracle.
- Live regions announce explicit save, retry, proposal completion, cancellation,
  and bulk commit outcomes without reading the entire multilingual card again.
  Focus moves only for a blocking validation summary, dialog lifecycle, or when
  the previous target disappears.

### Administration application variant

The administration application is a dense operational surface built with
Refine and Ant Design. It uses the same semantic color, typography, spacing,
focus, motion, and content contracts as the public product, but it does not
reuse the public web component implementations. Ant Design theme tokens map to
the semantic values in this document; product meaning must never depend on an
Ant Design default color alone.

- The desktop shell uses a persistent 240px navigation rail, a compact header,
  and a content region no wider than 1440px. At narrow widths navigation becomes
  a dismissible drawer and tables preserve access to every action without
  horizontal page overflow.
- Dashboard summaries use compact cards with a visible label, current value,
  and optional supporting description. Decorative charts are not a substitute
  for exact values.
- User tables expose search, status filtering, pagination, loading, empty,
  retry, and offline states. Row actions have accessible names and remain
  keyboard reachable. Email values may wrap; identifiers use copyable text and
  are never the only human-readable label.
- Status is communicated by text and shape in addition to color. `active` uses
  success semantics, `pending` uses warning semantics, and `disabled` uses
  danger semantics.
- User details group identity, account state, authentication metadata, and safe
  operational metadata into titled cards. Password hashes, tokens, passkey
  credential material, recovery codes, and secret values are never rendered.
- Disable and restore actions open a clearly titled confirmation dialog. The
  reason field is required, displays its 5–500 character constraint, and the
  destructive action is visually distinct. Recent-authentication, version
  conflict, and permission failures preserve the entered reason but never
  replay the mutation automatically.
- Audit rows show action, outcome, actor, target, reason, occurrence time, and
  correlation reference. Dense rows retain a minimum 40px interactive target.
- Light, dark, and system themes are first-class. Loading, empty, denied,
  offline, conflict, retry, and unexpected-error states must be represented in
  stories or journey fixtures for each surface where they can occur.
- English is the initial locale, but every visible label is supplied through
  the admin i18n provider. Tables and dialogs allow translated labels to wrap.

The `Admin operations` board in `design/main.pen` is an optional reference for
the shell, summary cards, user table/status treatment, detail grouping, audit
table, and confirmation dialog. Runtime changes update affected components,
stories, and browser evidence; the board changes only when explicitly in scope.

### Developer tooling variant

The local web dev command panel is a plain HTML/CSS/JavaScript operational tool,
not a product application or a consumer of the public web component package. It
uses native controls while preserving this system's semantic color, typography,
spacing, focus, state, and responsive intent.

- The page prioritizes command identity, safety status, lifecycle state, and
  logs over decorative product content. Every command card keeps title,
  description, exact displayed source, status text, controls, and latest-run log
  visually connected.
- A sticky section index lists every command category with a count. Each
  category is a native disclosure panel that starts collapsed; following a
  section link opens its target while expansion remains local to the tab.
- Quick-access sections form a distinct, primary group above catalog categories
  in both the sidebar and content. Each has visible Start all, Stop all, and
  Remove actions while its command grid is collapsible. Empty sections remain
  legible and manageable.
- Every command card is a disclosure collapsed by default. The collapsed row
  always exposes title, description, and a text status; expanding reveals the
  source, unavailable reason, actions, quick-access memberships, agent metadata,
  and latest-run log. Duplicate cards use the same status and log source while
  keeping expansion local to their placement and tab.
- Checkbox selection is tab-local presentation. Running/disabled state is
  visually distinct and communicated with text in addition to color. Every
  unavailable command uses a bordered “Why unavailable” callout associated with
  its disabled controls; the reason is never hidden behind hover.
- Primary Run selected and individual Start actions use the normal action
  hierarchy. Stop is a visible danger-outline action; Stop All requires a named
  native confirmation dialog.
- Log regions use a legible monospace face, preserve whitespace, scroll within
  the card, and keep sufficient contrast in both themes. Raw terminal color is
  stripped, so ANSI output never becomes a visual-state dependency.
- At compact widths, toolbar actions stack, command cards become one column, and
  no page-level horizontal scroll is introduced. Native targets remain at least
  40px for the pointer-rich developer context.
- Connection, running, stopping, success, failure, cancellation, drift, and
  disabled states require text labels. Motion is limited to quick control and
  connection feedback and respects reduced-motion preference.
- Successful starts clear tab-local checkbox selections. Mutation failures use
  an in-viewport alert containing the complete safe server explanation, so a
  conflict cannot be missed while the user is scrolled within a section.
- The quick-access manager separates section creation from portable JSON. The
  JSON editor uses a monospaced multiline control with explicit Copy JSON and
  Import and replace actions. Import failures retain the prior layout and use
  the same in-viewport alert; confirmation dialogs protect section removal and
  section-scoped Stop all.

The `Developer Tooling / Web Dev Command Panel` screen in `design/main.pen` is
an optional reference for this variant. Runtime changes to navigation,
disclosures, command cards, feedback, status, logs, confirmations, or compact
layout are verified in the running panel and update design artifacts only when
explicitly in scope.

## 14. Visual-generation brief

Use the following prompt as the starting point for a design-system board. Keep
this document alongside the generated result and reject any generated value that
contradicts the source tokens or accessibility contract.

```text
Create a high-fidelity design-system foundation board for “Languon,” an AI-first
language-learning platform for adult learners and tutors aged roughly 18–45.

Personality: warm editorial, calm, culturally curious, credible, modern, quietly
intelligent, encouraging. Avoid childish gamification, generic SaaS dashboards,
neon AI visuals, excessive pills, glassmorphism, low contrast, and decoration that
competes with learning content.

Typography: Literata Variable for display titles and selected learning/editorial
content; Manrope Variable for interface and body. Show multilingual samples in
English, Spanish, French, and Russian. Use the exact type roles in the blueprint.

Light theme: canvas #FBF8F6, surface #FFFFFF, primary text #211C26,
secondary text #5F5564, primary violet #5C3CCB, coral accent #B7472F,
success #16715B, warning #7A4B00, danger #B32646, info #1E62B0.

Dark theme: canvas #17131B, surface #211C26, raised surface #352C3A,
primary text #FBF8FC, secondary text #D1C7D4, primary violet #BBA6FF,
coral accent #F7A180, success #63D6B0, warning #F5C66F,
danger #FF93A9, info #8EC5FF.

Use a 4px spacing base, radii 6/10/14/20/28, medium controls at 48px,
large controls at 56px, and 44px web/iOS or 48dp Android minimum targets.
Use rounded 2px-stroke icons on a 24px grid. Use restrained shadows and opaque
surfaces; optional translucency is limited to navigation with an opaque fallback.

Board sections:
1. Product principles, brand adjectives, typography, iconography, spacing,
   responsive grid, radius, elevation, and calm motion.
2. Complete semantic color swatches for light and dark themes, including soft
   state containers, borders, focus, and verified foreground pairings.
3. Buttons and icon buttons in all variants, sizes, and default/hover/pressed/
   focus/loading/disabled states.
4. Inputs, password, search, OTP, textarea, native select, searchable combobox,
   checkbox, radio group, and switch with labels, helper, error, success,
   read-only, disabled, and long localized content.
5. Tabs/tab panels, tooltip, popover/menu, dialog, alert dialog, mobile bottom
   sheet, toast, inline alert, spinner, determinate progress, skeleton, empty
   collection, failed region/retry, cards, badges, chips, links, and dividers.
6. Desktop and mobile examples at 320px reflow/text scaling, dark theme, reduced
   motion, increased contrast, and visible keyboard focus.
7. Dictionary authoring and AI review examples using explicit save, inherited
   optional fields, mixed-language metadata, persistent progress, conflict and
   compact stacked review states.

Every state must preserve the blueprint's contrast, target size, visible labels,
keyboard focus, non-color cues, and platform-native behavior. Show components as
a coherent library, not as a finished marketing page or product dashboard.
```

## 15. Acceptance checklist for generated design

- [ ] Both themes use semantic mappings rather than arbitrary recoloring.
- [ ] All intended foreground/background and control boundaries are contrast-checked.
- [ ] Typography uses the approved families, roles, readable measures, and current locales.
- [ ] Spacing, target sizes, radii, icons, elevation, and motion match the foundations.
- [ ] Components show all material states, not only pristine defaults.
- [ ] Keyboard focus is visible and distinct from selection.
- [ ] Labels, errors, helper text, status, and loading behavior are explicit.
- [ ] Document and passage language metadata is specified for mixed-language content.
- [ ] Actionable/important notifications persist or remain available in persistent UI.
- [ ] Dialog, sheet, tooltip, combobox, tabs, and toast behavior can satisfy their
      native/WAI-ARIA interaction pattern.
- [ ] Compact layouts handle software keyboards, safe areas, long translation,
      200% text, and 320px reflow.
- [ ] Reduced motion/transparency and increased/forced contrast have defined outcomes.
- [ ] AI, success, warning, error, and human content are not distinguished by color alone.
- [ ] Dictionary fields expose resolved language metadata, inheritance, inactive
      value preservation, explicit save/conflict, and compact review behavior.
- [ ] The result feels adult, warm, and editorial without copying a reference product.
