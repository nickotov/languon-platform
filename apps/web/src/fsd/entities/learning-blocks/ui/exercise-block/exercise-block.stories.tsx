import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type {
    ExerciseLearningBlock,
    WorkbookAttemptEvaluation,
} from '@languon/contracts';
import type { LearningBlockLabels } from '../../types';
import { ExerciseBlock } from './exercise-block';

const id = '11111111-1111-4111-8111-111111111111';
const sourceId = '22222222-2222-4222-8222-222222222222';
const labels: LearningBlockLabels = {
    kinds: {
        exercise: 'Exercise',
        vocabulary: 'Vocabulary',
        grammar: 'Grammar',
        'bilingual-text': 'Text',
        audio: 'Audio',
        video: 'Video',
    },
    showAnswer: 'Show answer',
    hideAnswer: 'Hide answer',
    retry: 'Try again',
    answer: 'Your answer',
    check: 'Check',
    checkWithAi: 'Check with AI',
    hint: 'Hint',
    showTranscript: 'Show transcript',
    hideTranscript: 'Hide transcript',
    replay: 'Replay',
    original: 'Original',
    bilingual: 'Bilingual',
    translationLanguage: 'Translation language',
    mediaUnavailable: 'Media unavailable',
    openVideoSource: 'Open video',
    rule: 'Rule',
    pattern: 'Pattern',
    examples: 'Examples',
    commonMistakes: 'Common mistakes',
    correct: 'Correct',
    incorrect: 'Incorrect',
};
const block: ExerciseLearningBlock = {
    id,
    type: 'exercise',
    format: 'free-text',
    question: 'What word means use something temporarily and give it back?',
    referenceAnswer: 'borrow',
    acceptedAnswers: ['borrow'],
    explanation:
        'Borrow refers to temporary use, with an intention to return the item.',
    semantics: {
        activity: { id: 'V01', version: 1 },
        objective: 'Recall the selected verb.',
        language: 'en',
        explanationLanguage: 'en',
        format: 'free-text',
        checking: {
            policy: 'hybrid',
            key: { kind: 'text', acceptedAnswers: ['borrow'] },
            rubric: {
                criteria: [
                    {
                        dimension: 'task-completion',
                        requirement: 'Supply a word.',
                    },
                    {
                        dimension: 'meaning',
                        requirement: 'Preserve the selected sense.',
                    },
                    {
                        dimension: 'target-use',
                        requirement: 'Recall the selected verb.',
                    },
                ],
            },
        },
        sources: [
            {
                kind: 'vocabulary',
                origin: { kind: 'block', blockId: sourceId },
                entries: [
                    {
                        entryId: sourceId,
                        term: 'borrow',
                        sense: 'Use temporarily and return.',
                    },
                ],
            },
        ],
    },
};
const partial: WorkbookAttemptEvaluation = {
    status: 'partially-correct',
    method: 'ai',
    feedback: 'You communicated the meaning, but did not use the target word.',
    criteria: [
        {
            dimension: 'task-completion',
            status: 'partially-met',
            feedback: 'The task requests one selected word.',
        },
        {
            dimension: 'meaning',
            status: 'met',
            feedback: 'The meaning is clear.',
        },
        {
            dimension: 'target-use',
            status: 'not-met',
            feedback: 'Use borrow rather than take.',
        },
    ],
    corrections: ['Use the verb borrow.'],
    suggestedAnswer: 'borrow',
};
const meta = {
    title: 'Learning/Named exercises',
    component: ExerciseBlock,
    args: { block, labels },
} satisfies Meta<typeof ExerciseBlock>;

export default meta;
type Story = StoryObj<typeof meta>;
export const PreparedRecall: Story = {};
export const HybridUnrecognized: Story = {
    args: {
        learnerState: {
            attempted: true,
            revealed: false,
            hintUsed: false,
            answer: 'take on loan',
        },
        feedback: 'Unchecked. Check with AI to evaluate another answer.',
    },
};
export const PartialFeedback: Story = {
    args: {
        learnerState: {
            attempted: true,
            revealed: false,
            hintUsed: false,
            answer: 'take',
        },
        evaluation: partial,
        feedback: 'Partially correct',
        feedbackKind: 'ai',
    },
};
export const UnableToAssess: Story = {
    args: {
        learnerState: {
            attempted: true,
            revealed: false,
            hintUsed: false,
            answer: 'A different response.',
        },
        evaluation: {
            status: 'unable-to-assess',
            method: 'ai',
            feedback: 'The supplied material does not resolve this answer.',
        },
        feedback: 'Unable to assess',
        feedbackKind: 'ai',
    },
};
export const EvaluationUnavailable: Story = {
    args: {
        learnerState: {
            attempted: true,
            revealed: false,
            hintUsed: false,
            answer: 'take on loan',
        },
        error: 'AI feedback is unavailable. Your answer is kept.',
        evaluationUnavailableReason: 'Sign in to request AI feedback.',
    },
};

export const JapaneseClassificationRussianUi: Story = {
    args: {
        labels: {
            ...labels,
            locale: 'ru',
            answer: 'Ваш ответ',
            check: 'Проверить',
            showAnswer: 'Показать ответ',
            retry: 'Попробовать ещё',
            correct: 'Верно',
            incorrect: 'Неверно',
        },
        block: {
            id,
            type: 'exercise',
            format: 'multiple-choice',
            question: 'ミラは電車で大阪に行きました。',
            choices: [
                { id, text: 'True' },
                { id: sourceId, text: 'False' },
                {
                    id: '33333333-3333-4333-8333-333333333333',
                    text: 'Not stated',
                },
            ],
            correctChoiceId: id,
            referenceAnswer: 'True',
            explanation: 'Утверждение совпадает с исходным текстом.',
            semantics: {
                activity: { id: 'R03', version: 1 },
                objective: 'Определить соответствие исходному тексту.',
                language: 'ja',
                explanationLanguage: 'ru',
                format: 'multiple-choice',
                checking: {
                    policy: 'prepared-key',
                    key: {
                        kind: 'choice',
                        correctChoiceId: id,
                        classification: {
                            roles: [
                                { choiceId: id, role: 'true' },
                                { choiceId: sourceId, role: 'false' },
                                {
                                    choiceId:
                                        '33333333-3333-4333-8333-333333333333',
                                    role: 'not-stated',
                                },
                            ],
                        },
                        explanations: [
                            {
                                choiceId: id,
                                explanation: 'Поезд и город прямо указаны.',
                            },
                            {
                                choiceId: sourceId,
                                explanation: 'Противоречия нет.',
                            },
                            {
                                choiceId:
                                    '33333333-3333-4333-8333-333333333333',
                                explanation: 'В тексте есть ответ.',
                            },
                        ],
                    },
                },
                sources: [
                    {
                        kind: 'text',
                        origin: {
                            kind: 'block',
                            blockId: '44444444-4444-4444-8444-444444444444',
                        },
                        passages: [
                            {
                                segmentId:
                                    '55555555-5555-4555-8555-555555555555',
                                text: 'ミラは朝、電車で大阪に行きました。',
                            },
                        ],
                    },
                ],
            },
        },
    },
};
