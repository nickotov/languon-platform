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
            rule: 'Use the **past simple** for a completed action.\n\n- **Completed time:** yesterday, last week.\n- **Sequence:** one finished action after another.',
            pattern:
                '**Affirmative**\n\n`Subject + past tense verb`\n\n**Negative**\n\n`Subject + did not + base verb`',
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

const vocabulary = {
    id,
    type: 'vocabulary' as const,
    language: 'fr',
    translationLanguage: 'ru',
    title: 'Le ménage',
    entries: [
        {
            id: '22222222-2222-4222-8222-222222222222',
            term: 'travail',
            translation: 'работа',
            pronunciation: '[tʁa.vaj]',
            example: 'Je vais au travail.',
            exampleTranslation: 'Я иду на работу.',
        },
        {
            id: '33333333-3333-4333-8333-333333333333',
            term: 'joie',
            translation: 'радость',
            pronunciation: '[ʒwa]',
        },
        {
            id: '44444444-4444-4444-8444-444444444444',
            term: 'ménage',
            translation: 'уборка',
            pronunciation: '[me.naʒ]',
        },
    ],
};
export const VocabularyCompact: Story = {
    args: { block: vocabulary, variant: 'compact', hideHeading: true },
};
export const VocabularyReview: Story = {
    args: { block: vocabulary, variant: 'review' },
};
export const VocabularyStudy: Story = {
    args: { block: vocabulary, variant: 'learner' },
};
export const BilingualStudy: Story = {
    args: {
        variant: 'learner',
        block: {
            id,
            type: 'bilingual-text',
            title: 'Le samedi à la maison',
            language: 'fr',
            segments: [
                { id, text: 'Le samedi, toute la famille fait le ménage.' },
            ],
            translations: [
                {
                    language: 'ru',
                    segments: [
                        {
                            sourceSegmentId: id,
                            text: 'В субботу вся семья делает уборку.',
                        },
                    ],
                },
            ],
        },
    },
};
export const VideoPreview: Story = {
    args: {
        block: {
            id,
            type: 'video',
            title: 'Un clip en français',
            source: { kind: 'youtube', videoId: 'abcdefghijk' },
            description:
                'Author-provided context. No automatic video understanding.',
        },
        variant: 'compact',
    },
};
export const UnpreparedAudio: Story = {
    args: {
        block: { id, type: 'audio', title: 'Dialogue à préparer' },
        labels: { ...labels, noRecording: 'No recording prepared yet' },
        variant: 'author',
    },
};
