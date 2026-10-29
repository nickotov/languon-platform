import type { ReactNode } from 'react';
import type { LearningBlock, LearningTranscript } from '@languon/contracts';

export interface LearningBlockLabels {
    kinds: Record<LearningBlock['type'], string>;
    exerciseKinds?: Record<
        'multiple-choice' | 'fill-in-the-blank' | 'free-text',
        string
    >;
    showAnswer: string;
    hideAnswer: string;
    retry: string;
    answer: string;
    checkWithAi: string;
    hint: string;
    showTranscript: string;
    hideTranscript: string;
    replay: string;
    original: string;
    bilingual: string;
    translationLanguage: string;
    mediaUnavailable: string;
    openVideoSource: string;
    rule: string;
    pattern: string;
    examples: string;
    commonMistakes: string;
    incorrect: string;
    correct: string;
    play?: string;
    stop?: string;
    expand?: string;
    collapse?: string;
    check?: string;
    noRecording?: string;
    preparedTranslations?: string;
    notAnswered?: string;
    expandAll?: string;
    collapseAll?: string;
    attempted?: string;
    videoDescription?: string;
    videoNotWatched?: string;
    missingTranscript?: string;
}

export type LearningBlockVariant = 'compact' | 'review' | 'author' | 'learner';

export interface LearningPlaybackRequest {
    id: string;
    blockId: string;
    text: string;
    language: string;
}

/** The host owns speech authorization, preparation, credits and a shared player. */
export interface LearningBlockPlayback {
    activeId?: string | undefined;
    status?: 'preparing' | 'playing' | 'unavailable' | undefined;
    onPlay: (request: LearningPlaybackRequest) => void;
    onStop?: (() => void) | undefined;
    onMediaStart?:
        ((media: { id: string; pause: () => void }) => void) | undefined;
}

/** Read-only personal translations. They never become authored block translations. */
export interface LearningPrivateStudy {
    targets: { language: string; label: string }[];
    overlays: Extract<
        LearningBlock,
        { type: 'bilingual-text' }
    >['translations'];
    state: 'idle' | 'loading' | 'generating' | 'failed' | 'unavailable';
    pendingLanguage?: string | undefined;
    languageNames?: Record<string, string> | undefined;
    canCancel?: boolean | undefined;
    labels: {
        title: string;
        notice: string;
        loading: string;
        generating: string;
        generate: string;
        retry: string;
        cancel: string;
        error: string;
        unavailable: string;
        remove: string;
    };
    onSelectLanguage: (language: string) => void;
    onViewChange?: ((language: string | undefined) => void) | undefined;
    onGenerate: () => void;
    onRetry: () => void;
    onCancel: () => void;
}

export type VideoReplaySource = Extract<
    LearningBlock,
    { type: 'video' }
>['source'];

export type LearningAnswer = string | Record<string, string>;
export type LearningInteraction =
    | { kind: 'answer'; answer: LearningAnswer }
    | { kind: 'answer-revealed' }
    | { kind: 'hint-used' }
    | { kind: 'transcript-revealed' }
    | { kind: 'retry' };

/** Parent features own authorization, durable state and AI execution. */
export interface LearningBlockViewProps {
    block: LearningBlock;
    variant?: LearningBlockVariant | undefined;
    scope?: string | undefined;
    hideHeading?: boolean | undefined;
    preserveFrame?: boolean | undefined;
    frameFamily?: LearningBlock['type'] | undefined;
    headingTitle?: string | undefined;
    headingMetadata?: string | undefined;
    accented?: boolean | undefined;
    expandAll?: { open: boolean; at: number } | undefined;
    exerciseIndex?: number | undefined;
    exerciseRevision?: string | undefined;
    onExpansionChange?: ((open: boolean) => void) | undefined;
    onAttemptedChange?:
        ((blockId: string, attempted: boolean) => void) | undefined;
    playback?: LearningBlockPlayback | undefined;
    actions?: ReactNode;
    headingLeading?: ReactNode;
    headingActions?: ReactNode;
    contentLeading?: ReactNode;
    content?: ReactNode;
    labels: LearningBlockLabels;
    audioUrl?: string | undefined;
    hintTranscript?: LearningTranscript | undefined;
    hintVideoSource?: VideoReplaySource | undefined;
    onInteraction?:
        ((blockId: string, event: LearningInteraction) => void) | undefined;
    onEvaluate?:
        ((blockId: string, answer: LearningAnswer) => void) | undefined;
    onSubmitAttempt?:
        ((blockId: string, answer: LearningAnswer) => void) | undefined;
    submitAttemptLabel?: string | undefined;
    /** Hosts can wait for private persistence before enabling disclosures. */
    interactionsDisabled?: boolean | undefined;
    attemptPending?: boolean | undefined;
    evaluationPending?: boolean | undefined;
    evaluationUnavailableReason?: string | undefined;
    learnerState?:
        | {
              answer?: LearningAnswer | undefined;
              attempted: boolean;
              revealed: boolean;
              hintUsed: boolean;
              correct?: boolean | undefined;
              validAlternative?: boolean | undefined;
          }
        | undefined;
    feedback?: string | undefined;
    feedbackKind?: 'prepared' | 'ai' | undefined;
    error?: string | undefined;
}
