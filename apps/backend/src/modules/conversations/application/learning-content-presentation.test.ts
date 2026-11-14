import { describe, expect, it } from 'vitest';
import { ChatPreferencesSchema } from '@languon/contracts';
import { SUPPORTED_LANGUAGE_TAGS } from '@languon/languages';
import type { LearningContentBrief } from './learning-content-contract';
import {
    learningContentPresentation,
    learningContentReplyLanguageSchema,
    normalizeLearningContentDefaults,
} from './learning-content-presentation';

const preferences = ChatPreferencesSchema.parse({});
const exercises = (): LearningContentBrief => ({
    tasks: [
        {
            id: 'practice',
            kind: 'exercises',
            instruction: 'Practise everyday English.',
            language: 'en',
        },
    ],
});

describe('host learning content presentation', () => {
    it('exposes the same supported reply languages as the localized product copy', () => {
        for (const language of SUPPORTED_LANGUAGE_TAGS) {
            expect(
                learningContentReplyLanguageSchema.safeParse(language).success,
            ).toBe(true);
        }

        expect(learningContentReplyLanguageSchema.safeParse('xx').success).toBe(
            false,
        );
    });

    it.each([
        ['single-block-task', 'separate task', 'отдельную задачу'],
        ['exercise-format-only', 'only to exercises', 'только для упражнений'],
        [
            'unsupported-exercise-format',
            'multiple choice, gap fill or free text',
            'выбор ответа, заполнение пропусков или свободный ответ',
        ],
        ['block-limit', 'no more than 25 blocks', 'не более 25 блоков'],
        [
            'word-count-conflict',
            'change the list or count',
            'изменить список либо количество',
        ],
    ] as const)(
        'gives actionable localized guidance for %s',
        (limitationCode, english, russian) => {
            const base = {
                status: 'unsupported' as const,
                limitationCode,
                brief: exercises(),
                message: '',
            };

            expect(
                learningContentPresentation({
                    ...base,
                    preferences: { ...preferences, replyLanguage: 'en' },
                }),
            ).toContain(english);

            expect(
                learningContentPresentation({
                    ...base,
                    preferences: { ...preferences, replyLanguage: 'ru' },
                }),
            ).toContain(russian);
        },
    );

    it('materializes omitted exercise count without inventing activity or format constraints', () => {
        const original = exercises();
        const result = normalizeLearningContentDefaults(original);

        expect(result.brief.tasks[0]).toMatchObject({
            count: 5,
        });

        expect(original.tasks[0]?.count).toBeUndefined();
        expect(original.tasks[0]?.formats).toBeUndefined();
        expect(result.appliedDefaults).toEqual([
            {
                taskId: 'practice',
                kind: 'exercises',
                count: 5,
            },
        ]);
    });

    it('discloses omitted defaults in review-oriented English without internal counts', () => {
        const normalized = normalizeLearningContentDefaults(exercises());
        const text = learningContentPresentation({
            status: 'ready',
            brief: normalized.brief,
            preferences,
            message: 'Make exercises.',
            appliedDefaults: normalized.appliedDefaults,
        });

        expect(text).toContain('ready to review');
        expect(text).toContain('Apply');
        expect(text).toContain('Save');
        expect(text).toContain('Defaults used: Exercises: 5');
        expect(text).not.toContain('Exercise formats');
        expect(text).not.toContain('component(s)');
        expect(text).not.toContain('interactive block(s)');
        expect(text).not.toContain('practice:');
    });

    it('honors explicit Russian reply preferences over an English question', () => {
        const text = learningContentPresentation({
            status: 'ready',
            brief: exercises(),
            preferences: { ...preferences, replyLanguage: 'ru' },
            message: 'Make exercises.',
            replyLanguage: 'en',
        });

        expect(text).toContain('Учебный материал готов к проверке');
        expect(text).toContain('Упражнения: 5');
        expect(text).not.toContain('Форматы упражнений');

        expect(text).not.toContain('Defaults');
        expect(text).not.toContain('component');
    });

    it('uses the resolved substantive language for automatic replies', () => {
        const text = learningContentPresentation({
            status: 'ready',
            brief: exercises(),
            preferences,
            message: 'да',
            replyLanguage: 'ru',
        });

        expect(text).toContain('Учебный материал');
        expect(text).not.toContain('Your learning');
    });

    it('does not label explicit count and formats as defaults', () => {
        const brief = exercises();
        brief.tasks[0]!.count = 7;
        brief.tasks[0]!.formats = ['free-text'];
        const result = normalizeLearningContentDefaults(brief);

        expect(result.brief.tasks[0]).toMatchObject({
            count: 7,
            formats: ['free-text'],
        });

        expect(result.appliedDefaults).toEqual([]);
        expect(
            learningContentPresentation({
                status: 'ready',
                brief,
                preferences,
                message: 'Make seven free-text exercises.',
            }),
        ).not.toContain('Defaults');
    });

    it('discloses only the omitted setting when another setting is explicit', () => {
        const brief = exercises();
        brief.tasks[0]!.formats = ['free-text'];
        const normalized = normalizeLearningContentDefaults(brief);
        const text = learningContentPresentation({
            status: 'ready',
            brief: normalized.brief,
            preferences,
            message: 'Make free-text exercises.',
            appliedDefaults: normalized.appliedDefaults,
        });

        expect(normalized.brief.tasks[0]?.count).toBe(5);
        expect(text).toContain('Exercises: 5');
        expect(text).not.toContain('Exercise formats');
        expect(text).not.toContain('multiple choice');
    });

    it('keeps automatic format eligibility unconstrained even for one question', () => {
        const brief = exercises();
        brief.tasks[0]!.count = 1;
        const normalized = normalizeLearningContentDefaults(brief);

        expect(normalized.brief.tasks[0]?.formats).toBeUndefined();
        const text = learningContentPresentation({
            status: 'ready',
            brief: normalized.brief,
            appliedDefaults: normalized.appliedDefaults,
            preferences,
            message: 'Make one exercise.',
        });

        expect(text).not.toContain('Exercise formats');
        expect(text).not.toContain('gap fill');
        expect(text).not.toContain('Exercises: 5');
    });

    it('preserves explicitly requested per-activity totals without relabeling them as defaults', () => {
        const brief = exercises();
        brief.tasks[0]!.activities = [
            { activityId: 'V01', count: 2 },
            { activityId: 'V03', count: 1 },
        ];

        const normalized = normalizeLearningContentDefaults(brief);
        expect(normalized.brief.tasks[0]?.count).toBe(3);
        expect(normalized.brief.tasks[0]?.formats).toBeUndefined();
        expect(normalized.appliedDefaults).toEqual([]);
    });

    it('discloses vocabulary count ten only when neither a count nor words were supplied', () => {
        const brief: LearningContentBrief = {
            tasks: [
                {
                    id: 'words',
                    kind: 'vocabulary',
                    instruction: 'Words about travel.',
                    language: 'en',
                    translationLanguage: 'ru',
                },
            ],
        };
        const normalized = normalizeLearningContentDefaults(brief);

        expect(normalized.brief.tasks[0]?.count).toBe(10);
        expect(
            learningContentPresentation({
                status: 'ready',
                brief,
                preferences,
                message: 'Make vocabulary.',
            }),
        ).toContain('Vocabulary entries: 10');

        brief.tasks[0]!.words = ['apple', 'pear'];
        const supplied = normalizeLearningContentDefaults(brief);
        expect(supplied.brief.tasks[0]?.count).toBe(2);
        expect(supplied.appliedDefaults).toEqual([]);
        expect(
            learningContentPresentation({
                status: 'ready',
                brief,
                preferences,
                message: 'Use apple and pear.',
            }),
        ).not.toContain('Defaults');
    });

    it.each([
        ['en', 'This combination is not supported'],
        ['ru', 'Такое сочетание пока не поддерживается'],
    ] as const)(
        'localizes unsupported guidance in %s',
        (replyLanguage, expected) => {
            const text = learningContentPresentation({
                status: 'unsupported',
                brief: exercises(),
                preferences: { ...preferences, replyLanguage },
                message: 'Make a crossword.',
            });

            expect(text).toContain(expected);
            expect(text).toContain('25');
            expect(text).not.toContain('component(s)');
        },
    );

    it('has product copy for every supported explicit reply language', () => {
        const english = learningContentPresentation({
            status: 'ready',
            brief: exercises(),
            preferences: { ...preferences, replyLanguage: 'en' },
            message: '',
        });

        for (const replyLanguage of SUPPORTED_LANGUAGE_TAGS) {
            const text = learningContentPresentation({
                status: 'ready',
                brief: exercises(),
                preferences: { ...preferences, replyLanguage },
                message: '',
            });

            expect(text.length).toBeGreaterThan(30);
            if (replyLanguage !== 'en') {
                expect(text).not.toBe(english);
            }
        }
    });
});
