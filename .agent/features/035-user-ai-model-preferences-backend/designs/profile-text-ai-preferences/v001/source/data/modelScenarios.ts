import type { ModelScenario, SaveOutcome } from '../types/modelPreference'

export interface GalleryFrameSpec {
  viewport: 'desktop' | 'mobile'
  dark?: boolean
  /** What the frame renders. Defaults to the AI model card. */
  content?: 'card' | 'page' | 'leave' | 'session'
}

export interface GalleryItem {
  number: number
  title: string
  note: string
  group: string
  scenario: ModelScenario
  frames: GalleryFrameSpec[]
  /** Holds seeded loading/saving states still so they can be inspected. */
  frozen?: boolean
}

export const galleryGroups = [
  'Baseline',
  'Loading and availability',
  'Editing and saving',
  'Credits and running work',
  'Page-level states',
]

export const galleryItems: GalleryItem[] = [
  {
    number: 1,
    title: 'Auto saved, no draft changes',
    note: 'Default preference. Auto shows the model it currently resolves to as secondary context. Save and Cancel are disabled.',
    group: 'Baseline',
    scenario: 'auto-saved',
    frames: [{ viewport: 'desktop' }],
  },
  {
    number: 2,
    title: 'Explicit model saved',
    note: 'Gemini 2.5 Flash is the saved choice; the Auto option still states what Auto would use.',
    group: 'Baseline',
    scenario: 'explicit-saved',
    frames: [{ viewport: 'desktop' }],
  },
  {
    number: 3,
    title: 'Mobile tabs and picker',
    note: 'Tab strip scrolls inside its own row; long model and provider names wrap without shrinking the radio.',
    group: 'Baseline',
    scenario: 'one-unavailable',
    frames: [{ viewport: 'mobile', content: 'page' }],
  },
  {
    number: 4,
    title: 'Dark theme',
    note: 'Selected and unavailable options keep readable contrast; state is carried by badges and icons, not color alone.',
    group: 'Baseline',
    scenario: 'one-unavailable',
    frames: [{ viewport: 'desktop', dark: true }, { viewport: 'mobile', dark: true }],
  },
  {
    number: 5,
    title: 'Initial loading',
    note: 'Preference and catalog load with stable card geometry and a descriptive busy label. Other profile sections stay usable.',
    group: 'Loading and availability',
    scenario: 'loading',
    frames: [{ viewport: 'desktop' }, { viewport: 'mobile' }],
    frozen: true,
  },
  {
    number: 6,
    title: 'Preference loaded, catalog loading',
    note: 'The saved choice and Auto are usable immediately; model cards are placeholders.',
    group: 'Loading and availability',
    scenario: 'catalog-loading',
    frames: [{ viewport: 'desktop' }],
    frozen: true,
  },
  {
    number: 7,
    title: 'Catalog failed to load',
    note: 'Retry is offered; the saved explicit choice stays visible with “Availability unknown”.',
    group: 'Loading and availability',
    scenario: 'catalog-error',
    frames: [{ viewport: 'mobile' }, { viewport: 'desktop' }],
  },
  {
    number: 8,
    title: 'No models available',
    note: 'Auto remains the saved identity, but the card says plainly that requests can’t run right now.',
    group: 'Loading and availability',
    scenario: 'no-models',
    frames: [{ viewport: 'mobile' }],
  },
  {
    number: 9,
    title: 'One unavailable model',
    note: 'The unavailable option stays visible and disabled, with its reason in text.',
    group: 'Loading and availability',
    scenario: 'one-unavailable',
    frames: [{ viewport: 'desktop' }],
  },
  {
    number: 10,
    title: 'Saved model no longer available',
    note: 'The saved selection keeps its identity at the top of the list. It is not swapped for Auto.',
    group: 'Loading and availability',
    scenario: 'saved-unavailable',
    frames: [{ viewport: 'desktop' }, { viewport: 'mobile' }],
  },
  {
    number: 11,
    title: 'Unsaved draft',
    note: 'Saved and draft values are shown side by side; Save preference and Cancel changes are enabled.',
    group: 'Editing and saving',
    scenario: 'draft',
    frames: [{ viewport: 'desktop' }],
  },
  {
    number: 12,
    title: 'Saving',
    note: 'Inline progress; options and Save are locked to prevent duplicate submission while keeping the choice visible.',
    group: 'Editing and saving',
    scenario: 'saving',
    frames: [{ viewport: 'desktop' }],
    frozen: true,
  },
  {
    number: 13,
    title: 'Saved confirmation',
    note: 'The summary updates and a quiet inline confirmation is announced politely.',
    group: 'Editing and saving',
    scenario: 'saved-confirmation',
    frames: [{ viewport: 'desktop' }],
  },
  {
    number: 14,
    title: 'Save failed (network)',
    note: 'The draft is kept and Retry save is offered. Focus moves to the error without jumping the page.',
    group: 'Editing and saving',
    scenario: 'save-network-error',
    frames: [{ viewport: 'mobile' }],
  },
  {
    number: 15,
    title: 'Save rejected — availability changed',
    note: 'The list refreshes and the rejected model is marked unavailable; the rest of the profile is untouched.',
    group: 'Editing and saving',
    scenario: 'save-rejected',
    frames: [{ viewport: 'desktop' }],
  },
  {
    number: 16,
    title: 'Changed on another device',
    note: 'The latest saved value and the local draft are compared. Use latest, or deliberately save your choice instead.',
    group: 'Editing and saving',
    scenario: 'conflict',
    frames: [{ viewport: 'desktop' }, { viewport: 'mobile' }],
  },
  {
    number: 17,
    title: 'Zero credits',
    note: 'The preference stays editable. Copy explains free stored practice and reference answers.',
    group: 'Credits and running work',
    scenario: 'zero-credits',
    frames: [{ viewport: 'desktop' }],
  },
  {
    number: 18,
    title: 'AI task in progress',
    note: 'A small non-blocking note: the change applies to future requests only.',
    group: 'Credits and running work',
    scenario: 'task-in-progress',
    frames: [{ viewport: 'desktop' }],
  },
  {
    number: 19,
    title: 'Leaving with an unsaved choice',
    note: 'Small confirmation with Keep editing (default) and Discard changes. Opening the live dialog restores focus on close.',
    group: 'Page-level states',
    scenario: 'unsaved-navigation',
    frames: [{ viewport: 'desktop', content: 'leave' }],
  },
  {
    number: 20,
    title: 'Session expired',
    note: 'All protected profile data is removed from view until the user signs in again.',
    group: 'Page-level states',
    scenario: 'session-expired',
    frames: [
      { viewport: 'desktop', content: 'session' },
      { viewport: 'mobile', content: 'session' },
    ],
  },
  {
    number: 21,
    title: 'Offline with a local draft',
    note: 'The draft lives only in this page’s memory. Copy avoids implying autosave or persistence after reload.',
    group: 'Page-level states',
    scenario: 'offline',
    frames: [{ viewport: 'mobile' }],
  },
]

export const scenarioOptions: { value: ModelScenario; label: string }[] = [
  { value: 'auto-saved', label: '1 · Auto saved' },
  { value: 'explicit-saved', label: '2 · Explicit model saved' },
  { value: 'loading', label: '5 · Initial loading' },
  { value: 'catalog-loading', label: '6 · Catalog loading' },
  { value: 'catalog-error', label: '7 · Catalog failed' },
  { value: 'no-models', label: '8 · No models available' },
  { value: 'one-unavailable', label: '9 · One model unavailable' },
  { value: 'saved-unavailable', label: '10 · Saved model unavailable' },
  { value: 'draft', label: '11 · Unsaved draft' },
  { value: 'saving', label: '12 · Saving' },
  { value: 'saved-confirmation', label: '13 · Saved confirmation' },
  { value: 'save-network-error', label: '14 · Save failed (network)' },
  { value: 'save-rejected', label: '15 · Save rejected' },
  { value: 'conflict', label: '16 · Changed elsewhere' },
  { value: 'zero-credits', label: '17 · Zero credits' },
  { value: 'task-in-progress', label: '18 · Task in progress' },
  { value: 'unsaved-navigation', label: '19 · Leave with unsaved change' },
  { value: 'session-expired', label: '20 · Session expired' },
  { value: 'offline', label: '21 · Offline with draft' },
]

export const saveOutcomeOptions: { value: SaveOutcome; label: string }[] = [
  { value: 'success', label: 'Next save succeeds' },
  { value: 'network-error', label: 'Next save: network failure' },
  { value: 'rejected-unavailable', label: 'Next save: model became unavailable' },
  { value: 'conflict', label: 'Next save: changed on another device' },
]

