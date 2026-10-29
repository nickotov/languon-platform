import type { ReactNode } from 'react';
import type { LearningBlock, LearningTranscript } from '@languon/contracts';

export interface LearningBlockLabels {
    kinds: Record<LearningBlock['type'], string>;
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
    actions?: ReactNode;
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
    feedback?: string | undefined;
    error?: string | undefined;
}
