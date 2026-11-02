export type SourceKind = 'text' | 'dictionary' | 'note';

export interface SourceInfo {
  id: string;
  kind: SourceKind;
  title: string;
  kindLabel: string;
  access: string;
}

export interface Passage {
  id: string;
  index: number;
  fr: string;
  en: string;
}

export interface DictionaryCard {
  id: string;
  word: string;
  transcription: string;
  partOfSpeech: string;
  translation: string;
  definition: string;
  register: string;
  examples: { source: string; translation: string }[];
}

export type Block =
  | { type: 'h'; text: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | {
      type: 'example';
      source: string;
      translation?: string;
      lang?: string;
      dir?: 'ltr' | 'rtl';
    }
  | { type: 'table'; head: string[]; rows: string[][] };

export type AttachmentKind = 'quote' | 'card' | 'passage' | 'pasted';

export interface Attachment {
  id: string;
  kind: AttachmentKind;
  label: string;
  text: string;
  origin: string;
  external: boolean;
  card?: DictionaryCard;
  translation?: string;
  dir?: 'ltr' | 'rtl';
  truncated?: boolean;
  originalLength?: number;
}

export interface Material {
  id: string;
  kind: 'card' | 'passage' | 'note';
  title: string;
  excerpt: string;
}

export interface Activity {
  running: string;
  done: string;
}

export interface Usage {
  credits: number;
  inputTokens: number;
  outputTokens: number;
}

export type AssistantStatus =
  | 'preparing'
  | 'working'
  | 'streaming'
  | 'reconnecting'
  | 'done'
  | 'stopped'
  | 'failed';

export interface DraftOrigin {
  responseKey: string;
  mode: 'new' | 'update';
  targetNoteId?: string;
}

export interface AssistantMsg {
  id: string;
  role: 'assistant';
  kind: 'answer' | 'draft';
  responseKey: string;
  blocks: Block[];
  total: number;
  revealed: number;
  status: AssistantStatus;
  activities: Activity[];
  activityIndex: number;
  materials: Material[];
  materialsLabel: string;
  usage: Usage;
  model: string;
  nextAt: number;
  failAt?: number;
  reconnectAt?: number;
  reconnected?: boolean;
  failReason?: 'stopped' | 'connection';
  userMsgId: string;
  draftOf?: DraftOrigin;
}

export interface UserMsg {
  id: string;
  role: 'user';
  text: string;
  attachments: Attachment[];
  draftContent: boolean;
}

export interface DividerMsg {
  id: string;
  role: 'divider';
  label: string;
}

export interface DraftMsg {
  id: string;
  role: 'draft';
  draftId: string;
}

export type Message = AssistantMsg | UserMsg | DividerMsg | DraftMsg;

export type ReplyLanguage =
  | 'Automatic'
  | 'English'
  | 'French'
  | 'Spanish'
  | 'German'
  | 'Arabic';
export type Tone = 'Neutral' | 'Conversational' | 'Academic';
export type Level = 'Automatic' | 'Beginner-friendly' | 'Detailed';

export interface Prefs {
  replyLanguage: ReplyLanguage;
  tone: Tone;
  level: Level;
}

export interface ComposerState {
  text: string;
  attachments: Attachment[];
  useDraftSource: boolean;
}

export interface Conversation {
  id: string;
  sourceId: string;
  title: string;
  messages: Message[];
  prefs: Prefs;
  updatedAt: number;
  composer: ComposerState;
  mismatchDismissed: boolean;
}

export type NoteCategory =
  | 'Grammar'
  | 'Vocabulary & meaning'
  | 'Usage & register'
  | 'Pronunciation'
  | 'Etymology'
  | 'Culture'
  | 'Learning tips';

export interface KnowledgeNote {
  id: string;
  title: string;
  summary: string;
  body: string;
  studiedLanguage: string;
  explanationLanguage: string;
  categories: NoteCategory[];
  updatedAt: number;
  lastEdit?: string;
}

export type DraftStatus = 'editing' | 'saving' | 'saved' | 'failed' | 'discarded';

export interface KnowledgeDraft {
  id: string;
  conversationId: string;
  mode: 'new' | 'update';
  targetNoteId?: string;
  title: string;
  summary: string;
  body: string;
  studiedLanguage: string;
  explanationLanguage: string;
  categories: NoteCategory[];
  status: DraftStatus;
  savedNoteId?: string;
  localSavedAt: number;
  conflict: boolean;
  creditsUsed: number;
}

export type WidgetView = 'chat' | 'history' | 'editor';
export type AlertKind = 'credits' | 'model';

export interface TutorFlags {
  failNextSave: boolean;
  failNextStream: boolean;
  reconnectNextStream: boolean;
  noteConflict: boolean;
  inaccessibleSources: string[];
}

export interface TutorState {
  conversations: Conversation[];
  activeId: string;
  drafts: Record<string, KnowledgeDraft>;
  notes: Record<string, KnowledgeNote>;
  streaming: { conversationId: string; messageId: string } | null;
  folded: boolean;
  unread: boolean;
  interrupted: boolean;
  view: WidgetView;
  editorDraftId: string | null;
  credits: number;
  model: string;
  unavailableModels: string[];
  alert: AlertKind | null;
  defaults: Prefs;
  pendingSourceUpdates: string[];
  flags: TutorFlags;
  scrollToken: number;
}

