export type LangCode = 'en' | 'ru' | 'fr' | 'es';

export type Level =
  | 'starting'
  | 'basic'
  | 'intermediate'
  | 'advanced'
  | 'fluent'
  | 'native'
  | 'unsure';

export type Mixing = 'helpful' | 'sometimes' | 'avoid';
export type Tone = 'friendly' | 'balanced' | 'formal';
export type Length = 'concise' | 'detailed';
export type Wording = 'simple' | 'balanced' | 'academic';
export type Order = 'examples' | 'theory' | 'balance';
export type AgeRange = 'under18' | '18-34' | '35-54' | '55plus' | 'prefer-not';

export type TopicId =
  | 'languages'
  | 'explanation'
  | 'goals'
  | 'style'
  | 'needs'
  | 'interests'
  | 'age';

export interface LanguageEntry {
  id: string;
  name: string;
  level: Level | null;
  learning: boolean;
  note: string;
}

export interface ConfirmedNote {
  id: string;
  topic: TopicId;
  text: string;
}

export interface PortraitItems {
  languages: LanguageEntry[];
  explanationLanguages: string[];
  mixing: Mixing | null;
  mixingNote: string;
  goals: string[];
  customGoals: string[];
  tone: Tone | null;
  length: Length | null;
  wording: Wording | null;
  order: Order | null;
  needs: string[];
  customNeeds: string[];
  interests: string[];
  ageRange: AgeRange | null;
  notes: ConfirmedNote[];
}

export interface SavedPortrait {
  items: PortraitItems;
  summaryLanguage: LangCode;
  updatedAt: string;
  updatedOn: string;
  useEnabled: boolean;
}

export interface Proposal {
  id: string;
  topic: TopicId;
  text: string;
  sourceQuote: string;
  shortened: boolean;
}

export type MessageKind =
  | 'question'
  | 'answer'
  | 'chat'
  | 'reply'
  | 'redirect'
  | 'proposal'
  | 'error'
  | 'stopped'
  | 'notice';

export type ErrorKind =
  | 'unavailable'
  | 'offline'
  | 'interrupted'
  | 'context'
  | 'credits';

export interface InterviewMessage {
  id: string;
  role: 'interviewer' | 'user' | 'system';
  kind: MessageKind;
  text: string;
  time: string;
  status?: 'sending' | 'sent' | 'error';
  proposalId?: string;
  errorKind?: ErrorKind;
  costTag?: string;
  resolved?: boolean;
}

export interface ConflictItem {
  id: string;
  field: string;
  saved: string;
  savedOn: string;
  proposed: string;
  choice: 'saved' | 'draft' | null;
  apply: (items: PortraitItems) => PortraitItems;
}

export type InterviewPhase = 'update-pick' | 'questions' | 'deeper-offer' | 'done';

export interface Interview {
  mode: 'new' | 'update';
  language: LangCode;
  phase: InterviewPhase;
  topic: TopicId;
  topicStatus: Partial<Record<TopicId, 'answered' | 'skipped'>>;
  messages: InterviewMessage[];
  draft: PortraitItems;
  proposals: Proposal[];
  startedAt: string;
  lastActivityAt: string;
  conflict: ConflictItem[] | null;
  contextUsed: number;
}

export type CostMode = 'free' | 'paid';
export type AiStatus = 'ok' | 'unavailable' | 'offline' | 'interrupted' | 'context';
export type LoadState = 'ready' | 'loading' | 'error';

export type ChatField = 'explanationLanguage' | 'tone' | 'length' | 'wording' | 'order';
export type ChatMode = 'auto' | 'explain' | 'correct' | 'practice';

export interface ChatState {
  isNew: boolean;
  adoptedPortrait: boolean;
  excludePortrait: boolean;
  overrides: Partial<Record<ChatField, string>>;
  mode: ChatMode;
  fresh: boolean;
}

