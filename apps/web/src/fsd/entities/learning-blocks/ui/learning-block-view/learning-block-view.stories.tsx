import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { LearningBlockLabels } from '../../types';
import { LearningBlockView } from './learning-block-view';

const labels: LearningBlockLabels = {
    kinds: {
        video: 'Video',
        audio: 'Listening',
        vocabulary: 'Vocabulary',
        'bilingual-text': 'Reading',
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
    mediaUnavailable: 'Audio is unavailable',
    openVideoSource: 'Open video source',
    rule: 'Rule',
    pattern: 'Formation',
    examples: 'Examples',
    commonMistakes: 'Common mistakes',
    incorrect: 'Incorrect',
    correct: 'Correct',
};
const id = '11111111-1111-4111-8111-111111111111';
const meta = {
    component: LearningBlockView,
    title: 'Learning/Reusable blocks',
    args: { labels },
} satisfies Meta<typeof LearningBlockView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Grammar: Story = {
    args: {
        block: {
            id,
            type: 'grammar',
            language: 'en',
            title: 'Past simple',
            rule: 'Use the past simple for a completed action.',
            pattern: 'Subject + past tense verb',
            examples: [
                {
                    text: 'I visited Rome last year.',
                    translation: 'Visité Roma el año pasado.',
                },
            ],
            commonMistakes: [
                {
                    incorrect: 'She did went.',
                    correct: 'She did go.',
                    explanation: 'Use the base form after did.',
                },
            ],
        },
    },
};
export const FreeTextExercise: Story = {
    args: {
        block: {
            id,
            type: 'exercise',
            format: 'free-text',
            question: 'Describe something you did yesterday.',
            referenceAnswer: 'I visited a friend.',
            explanation: 'Visited describes a completed action in the past.',
        },
    },
};
export const MissingAudio: Story = {
    args: {
        block: {
            id,
            type: 'audio',
            assetId: id,
            transcript: {
                language: 'en',
                segments: [{ id, text: 'The train leaves at ten.' }],
            },
        },
    },
};
