import type { Block } from './tutor';

export type ChatMode = 'closed' | 'docked' | 'half' | 'floating';
export type RecoveryState = 'recovering' | 'recovered' | 'local' | 'error';
export type DocView = 'editor' | 'conflict' | 'knowledge';
export type DocViewport = 'desktop' | 'narrow' | 'mobile';

export interface SavedVersion {
  title: string;
  html: string;
  savedAt: number;
}

export interface Revision {
  id: string;
  label: string;
  title: string;
  html: string;
  at: number;
  device: string;
  kind: 'saved' | 'kept';
}

export interface DocMeta {
  summary: string;
  categories: string[];
  studiedLanguage: string;
  explanationLanguage: string;
}

export interface ConflictVersion {
  device: string;
  at: number;
  title: string;
  html: string;
}

export interface PassageAttachment {
  text: string;
  blockLabel: string;
}

export interface Reference {
  id: string;
  title: string;
  excerpt: string;
  text: string;
}

export interface Suggestion {
  label: string;
  /** Used for Insert/Append as whole paragraphs. */
  blockHtml: string;
  /** Used for Replace and mid-paragraph inserts. */
  inlineHtml: string;
  inlineText: string;
}

export interface DocChatMessage {
  id: string;
  role: 'user' | 'tutor';
  text: string;
  passage?: PassageAttachment;
  references?: Reference[];
  blocks?: Block[];
  revealed?: number;
  status?: 'reading' | 'streaming' | 'done';
  suggestion?: Suggestion;
  /** Id of the remembered editor target (cursor/selection) for this exchange. */
  targetId?: string;
}

export interface DocFlags {
  saveFails: boolean;
  historyFails: boolean;
  recoveryMode: 'online' | 'offline' | 'error';
  lowLimits: boolean;
}

export interface DocScenario {
  id: string;
  label: string;
  group: string;
  viewport?: DocViewport;
  dark?: boolean;
}

