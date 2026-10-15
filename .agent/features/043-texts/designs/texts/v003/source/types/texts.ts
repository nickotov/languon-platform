export type LanguageCode = 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt'

export type TextStatus = 'draft' | 'translated' | 'edited'

export interface Folder {
  id: string
  name: string
  description: string
  archived: boolean
  updatedAt: string
  shareToken: string | null
}

export interface SentencePair {
  id: string
  /** One source sentence, exactly as written. */
  source: string
  /** Translation block; may contain more than one sentence. */
  target: string
  /** Whitespace that followed the source sentence (spaces, line breaks). */
  trailing: string
  /** Sticky: true once either side was manually changed after AI translation. */
  edited: boolean
}

export interface TextDoc {
  id: string
  folderId: string
  title: string
  sourceLang: LanguageCode
  targetLang: LanguageCode
  status: TextStatus
  draftSource: string
  pairs: SentencePair[]
  archived: boolean
  updatedAt: string
  version: number
  shareToken: string | null
}

export type CardField = 'definition' | 'example'

export interface Dictionary {
  id: string
  name: string
  sourceLang: LanguageCode
  targetLang: LanguageCode
  hiddenFields: CardField[]
}

export interface Card {
  id: string
  dictionaryId: string
  term: string
  translation: string
  definition: string
  example: string
  exampleTranslation: string
  context: string
  createdAt: string
  fromText?: boolean
}

export type Side = 'source' | 'target'

export interface SelectionRect {
  top: number
  left: number
  width: number
  height: number
}

export interface SelectionInfo {
  kind: 'valid' | 'cross' | 'long'
  text: string
  rect: SelectionRect
  pairId?: string
  side?: Side
  sentenceIndex?: number
  start?: number
  end?: number
  sentence?: string
}

export interface TextMark {
  pairId: string
  side: Side
  sentenceIndex: number
  start: number
  end: number
  state: 'selected' | 'adding'
}

export type ShareResolution =
  | { kind: 'text'; text: TextDoc; external: boolean }
  | { kind: 'folder'; folder: Folder; texts: TextDoc[]; totalTranslated: number; external: boolean }
  | { kind: 'unavailable' }
