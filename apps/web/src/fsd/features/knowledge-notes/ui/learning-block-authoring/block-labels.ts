import type { LearningBlockLabels } from '@/fsd/entities/learning-blocks';

/** Embedders can supply localized labels without coupling reusable blocks to routes. */
export const defaultBlockLabels: LearningBlockLabels = {
    kinds: {
        video: 'Video',
        vocabulary: 'Vocabulary',
        'bilingual-text': 'Bilingual text',
        audio: 'Audio',
        grammar: 'Grammar',
        exercise: 'Exercise',
    },
    showAnswer: 'Show answer',
    hideAnswer: 'Hide answer',
    retry: 'Try again',
    answer: 'Your answer',
    checkWithAi: 'Check with AI',
    hint: 'Hint',
    showTranscript: 'Show transcript',
    hideTranscript: 'Hide transcript',
    replay: 'Replay passage',
    original: 'Original',
    bilingual: 'Bilingual',
    translationLanguage: 'Translation language',
    mediaUnavailable: 'Media is unavailable',
    openVideoSource: 'Open video source',
    rule: 'Rule',
    pattern: 'Formation / pattern',
    examples: 'Examples',
    commonMistakes: 'Common mistakes',
    incorrect: 'Incorrect',
    correct: 'Correct',
};

export type BlockAuthoringLabels = {
    add: string;
    edit: string;
    duplicate: string;
    remove: string;
    up: string;
    down: string;
    preview: string;
    cancel: string;
    apply: string;
    addRow: string;
    removeRow: string;
    error: string;
    audioPending: string;
    copy: string;
    field(label: string): string;
    view: LearningBlockLabels;
};
export const defaultAuthoringLabels: BlockAuthoringLabels = {
    add: 'Add block',
    edit: 'Edit',
    duplicate: 'Duplicate',
    remove: 'Delete',
    up: 'Move up',
    down: 'Move down',
    preview: 'Learner preview',
    cancel: 'Cancel',
    apply: 'Apply block',
    addRow: 'Add row',
    removeRow: 'Remove row',
    error: 'Check the required fields, languages and answer settings.',
    audioPending: 'Upload or generate audio before inserting an audio block.',
    copy: 'Copy block',
    field: (label) => label,
    view: defaultBlockLabels,
};
