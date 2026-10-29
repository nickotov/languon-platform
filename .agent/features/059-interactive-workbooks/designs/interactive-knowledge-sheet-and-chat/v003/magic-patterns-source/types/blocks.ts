export type BlockType = 'vocabulary' | 'exercises' | 'grammar' | 'bilingual' | 'audio' | 'video';

/** Where a block is rendered. Same data and hierarchy in every context. */
export type BlockVariant = 'compact' | 'review' | 'author' | 'learner';

/** Who is looking at the sheet. Readers never see authoring chrome. */
export type ViewerRole = 'author' | 'reader' | 'anonymous';

export interface VocabEntry {
  id: string;
  term: string;
  translation: string;
  ipa?: string;
  definition?: string;
  example?: string;
  exampleTranslation?: string;
}

export interface VocabularyBlock {
  id: string;
  type: 'vocabulary';
  title: string;
  entries: VocabEntry[];
}

export type ExerciseKind = 'choice' | 'blank' | 'free';

/** The passage an exercise is grounded in (text or transcript), with optional media timing. */
export interface Grounding {
  passage: string;
  /** Seconds into the recording; omitted when timing isn't available. */
  start?: number;
}

export interface ExerciseItem {
  id: string;
  kind: ExerciseKind;
  prompt: string;
  choices?: string[];
  answer: string;
  alternatives?: string[];
  explanation: string;
  hint?: string;
  grounding?: Grounding;
  /** Bumped when the material (prompt, answer, choices) changes. Attempts keep their version. */
  version: number;
}

export interface ExercisesBlock {
  id: string;
  type: 'exercises';
  title: string;
  items: ExerciseItem[];
}

export interface GrammarExample {
  id: string;
  source: string;
  translation: string;
}

export interface GrammarMistake {
  id: string;
  wrong: string;
  right: string;
  reason: string;
}

export interface GrammarBlock {
  id: string;
  type: 'grammar';
  title: string;
  rule: string;
  pattern: string;
  examples: GrammarExample[];
  mistakes: GrammarMistake[];
}

export type TranslationLang = 'ru' | 'en' | 'de' | 'es';

export interface BilingualSegment {
  id: string;
  source: string;
  /** Author-prepared translations per language. */
  translations: Partial<Record<TranslationLang, string>>;
}

export interface BilingualBlock {
  id: string;
  type: 'bilingual';
  title: string;
  segments: BilingualSegment[];
  /** Languages the author prepared; shared with every reader. */
  prepared: TranslationLang[];
}

export interface TranscriptLine {
  id: string;
  text: string;
  /** Seconds; absent when the transcript has no timing. */
  start?: number;
}

export interface AudioBlock {
  id: string;
  type: 'audio';
  title: string;
  /** null = no recording prepared yet. */
  media: { kind: 'upload' | 'generated'; name: string; duration: number } | null;
  transcript: TranscriptLine[];
  questions: ExerciseItem[];
}

export type VideoProvider = 'youtube' | 'file' | 'link';

export interface VideoBlock {
  id: string;
  type: 'video';
  title: string;
  url: string;
  description: string;
  /** Author-supplied; never fetched automatically from the video. */
  transcript: string;
  /** Prototype: simulate a removed/unavailable video. */
  unavailable?: boolean;
}

export type SheetBlock = VocabularyBlock | ExercisesBlock | GrammarBlock | BilingualBlock | AudioBlock | VideoBlock;

export type SheetNode =
  | { kind: 'prose'; id: 'prose' }
  | { kind: 'block'; id: string; block: SheetBlock }
  /** A writable line that always follows a block, so text can be added between blocks and at the end. */
  | { kind: 'text'; id: string; html: string };

export interface BlockProposalData {
  label: string;
  blocks: SheetBlock[];
  /** Proposal updates an existing block instead of adding a new one. */
  updatesBlockId?: string;
  /** Snapshot of the updated block when the proposal was prepared; used to detect staleness. */
  basedOnKey?: string;
}

export type ProposalStatus = 'ready' | 'applying' | 'applied' | 'stale' | 'failed';

export type ExerciseResult = 'correct' | 'alternative' | 'revise' | 'unavailable';

export interface ExerciseAttempt {
  answer: string;
  version: number;
  submitted: boolean;
  checking?: boolean;
  result?: ExerciseResult;
  feedback?: string;
  revealed?: boolean;
  hintUsed?: boolean;
}

export type PlaybackStatus = 'preparing' | 'playing' | 'unavailable';

