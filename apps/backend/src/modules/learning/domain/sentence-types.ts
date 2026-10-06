import type {
    SentenceDirection,
    SentenceExercise,
    SentenceFeedback,
} from '@languon/contracts';
export interface SentenceEntry {
    entryId: string;
    learningVersion: number;
    sourceText: string;
    targetText: string;
}
export interface SentenceCandidate extends SentenceEntry {
    exposureCount: number;
    sortKey: bigint;
}
export interface SentenceGenerationInput {
    schemaVersion: 1;
    generationPolicyVersion: 1 | 2;
    dictionaryId: string;
    direction: SentenceDirection;
    sourceLanguage: SentenceExercise['sourceLanguage'];
    targetLanguage: SentenceExercise['targetLanguage'];
    priorityEntryId: string;
    candidates: readonly SentenceEntry[];
}
export interface SentenceCheckInput {
    schemaVersion: 1;
    exerciseId: string;
    sourceText: string;
    referenceTranslation: string;
    sourceLanguage: SentenceExercise['sourceLanguage'];
    targetLanguage: SentenceExercise['targetLanguage'];
    targets: readonly SentenceEntry[];
    answer: string;
    explanationLanguage: SentenceExercise['sourceLanguage'];
    revealedHintIds: readonly string[];
}
export interface SentenceGenerationDraft {
    sourceText: string;
    referenceTranslation: string;
    segments: Array<{
        text: string;
        entryId: string | null;
        contextualHint?:
            | {
                  normalizedHint: string;
                  hintForm: 'lemma' | 'infinitive' | 'phrase';
              }
            | null
            | undefined;
    }>;
    targets: Array<{
        entryId: string;
        normalizedHint: string;
        hintForm: 'lemma' | 'infinitive' | 'phrase';
    }>;
}
export interface SentenceCheckDraft {
    proposedPercentage: number;
    meaning: SentenceFeedback['meaning'];
    grammar: SentenceFeedback['grammar'];
    targets: SentenceFeedback['targets'];
    issues: Omit<SentenceFeedback['issues'][number], 'id'>[];
    improvedTranslation: string;
    explanation: string;
}
export interface SentenceGeneratedContent {
    sourceText: string;
    referenceTranslation: string;
    segments: SentenceExercise['segments'];
    hints: SentenceExercise['hints'];
    targets: readonly SentenceEntry[];
}
