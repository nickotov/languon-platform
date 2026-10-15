export type LibraryState = 'populated' | 'loading' | 'empty' | 'error'
export type TranslateOutcome =
  | 'success'
  | 'failure'
  | 'model-capacity'
  | 'no-credits'
  | 'ai-unavailable'
  | 'preview-expires'
export type DetectOutcome = 'confident' | 'low-confidence' | 'failure'
export type CollectOutcome =
  | 'success'
  | 'network-uncertain'
  | 'no-credits'
  | 'ai-unavailable'
  | 'dictionary-changed'
  | 'source-unavailable'
export type SaveOutcome = 'success' | 'conflict' | 'failure'

export interface DemoSettings {
  libraryState: LibraryState
  translateOutcome: TranslateOutcome
  detectOutcome: DetectOutcome
  collectOutcome: CollectOutcome
  saveOutcome: SaveOutcome
  visitorSignedIn: boolean
}
