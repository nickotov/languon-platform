/** Sentinel used for the Auto preference. Any other value is a catalog model id. */
export const AUTO_CHOICE = 'auto'

export interface ModelIdentity {
  id: string
  name: string
  provider: string
}

/** Which text tasks the catalog says a model supports, when that info is supplied. */
export interface ModelTaskSupport {
  dictionary: boolean
  sentences: boolean
  translationCheck: boolean
}

export interface ModelOption extends ModelIdentity {
  description: string
  tasks?: ModelTaskSupport
  available: boolean
  /** Human-readable reason, shown whenever `available` is false. */
  unavailableReason?: string
}

export interface SavedPreference {
  /** `AUTO_CHOICE` or a model id. */
  choice: string
  /** Identity of an explicit choice, kept even if it leaves the catalog. */
  savedModel: ModelIdentity | null
  updatedAt: string
  /** True when the latest value was written from another tab or device. */
  updatedElsewhere?: boolean
}

export type LoadStatus = 'loading' | 'ready' | 'error'

export type PreferenceSaveStatus =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'network_error'
  | 'rejected'
  | 'conflict'

export interface ModelPreferenceState {
  prefStatus: LoadStatus
  catalogStatus: LoadStatus
  catalog: ModelOption[]
  saved: SavedPreference | null
  /** What Auto currently resolves to, when the product supplies it. */
  autoDefault: ModelIdentity | null
  /** Local, in-memory draft. Never persisted by itself. */
  draft: string | null
  saveStatus: PreferenceSaveStatus
  /** Saved value the user started from before a concurrent change. */
  conflictBase: string | null
  /** Model rejected at save time because it became unavailable. */
  rejectedModel: ModelIdentity | null
  online: boolean
}

export type SaveOutcome =
  | 'success'
  | 'network-error'
  | 'rejected-unavailable'
  | 'conflict'

export type ModelScenario =
  | 'auto-saved'
  | 'explicit-saved'
  | 'loading'
  | 'catalog-loading'
  | 'catalog-error'
  | 'no-models'
  | 'one-unavailable'
  | 'saved-unavailable'
  | 'draft'
  | 'saving'
  | 'saved-confirmation'
  | 'save-network-error'
  | 'save-rejected'
  | 'conflict'
  | 'zero-credits'
  | 'task-in-progress'
  | 'unsaved-navigation'
  | 'session-expired'
  | 'offline'

