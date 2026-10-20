import type { Block } from './tutor';

export type LayoutMode = 'focus' | 'split' | 'chat';
export type Direction = 'minimal' | 'ai-native' | 'editorial';
export type RecoveryState = 'recovering' | 'recovered' | 'local' | 'error';
export type DocView = 'editor' | 'conflict' | 'knowledge';
export type DocViewport = 'desktop' | 'narrow' | 'tablet' | 'mobile';
export type MobileTab = 'doc' | 'tutor';
export type SelectionAction = 'ask' | 'explain' | 'correct' | 'translate' | 'simplify' | 'rephrase' | 'examples';
export type StarterKind = 'write' | 'outline' | 'lesson' | 'language';
export type ReplyStatus = 'reading' | 'preparing' | 'streaming' | 'done' | 'stopped' | 'failed';

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
  /** 'replace' suggestions are reviewed inline, on the remembered selection. */
  kind?: 'replace';
  /** The passage the replacement was made for. */
  original?: string;
}

export interface DocChatMessage {
  id: string;
  role: 'user' | 'tutor';
  text: string;
  passage?: PassageAttachment;
  references?: Reference[];
  blocks?: Block[];
  revealed?: number;
  status?: ReplyStatus;
  suggestion?: Suggestion;
  action?: SelectionAction;
  /** Prototype only: the reply is interrupted part-way. */
  willFail?: boolean;
  /** Characters of document context the tutor read for this reply. */
  contextChars?: number;
  /** Id of the remembered editor target (cursor/selection) for this exchange. */
  targetId?: string;
}

export interface ChatPrefs {
  mode: 'auto' | 'explain' | 'correct' | 'practice';
  tone: 'neutral' | 'conversational' | 'academic';
  level: 'auto' | 'beginner' | 'detailed';
  context: 'document' | 'selection';
  model: 'flash' | 'pro';
}

export interface DocFlags {
  saveFails: boolean;
  historyFails: boolean;
  recoveryMode: 'online' | 'offline' | 'error';
  lowLimits: boolean;
  failNextReply: boolean;
}

export interface DocScenario {
  id: string;
  label: string;
  group: string;
  viewport?: DocViewport;
  dark?: boolean;
}

