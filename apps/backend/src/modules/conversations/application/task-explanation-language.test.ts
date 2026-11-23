import { describe, expect, it } from 'vitest';
import { resolveTaskExplanationLanguages } from './task-explanation-language';
import type { LearningContentBrief } from './learning-content-contract';

const brief: LearningContentBrief = {
    tasks: [
        {
            id: 'grammar',
            kind: 'grammar',
            language: 'fr',
            explanationLanguage: 'en',
            instruction: 'Explain COD and COI.',
        },
    ],
};

describe('task explanation language policy', () => {
    it('defaults French content explanations to French independently of English chat or model guesses', () => {
        expect(
            resolveTaskExplanationLanguages(brief, {
                learnerMessages: [
                    'Use only French for the text and exercises.',
                ],
            }),
        ).toEqual({
            brief: {
                tasks: [{ ...brief.tasks[0], explanationLanguage: 'fr' }],
            },
            overrides: [],
        });
    });

    it('preserves a different explicit explanation language only with exact learner evidence', () => {
        const choice = {
            taskId: 'grammar',
            language: 'en',
            evidence: 'explain the grammar in English',
        };

        expect(
            resolveTaskExplanationLanguages(brief, {
                learnerMessages: [
                    'Use French, but explain the grammar in English.',
                ],
                overrides: [choice],
            }),
        ).toMatchObject({
            brief: { tasks: [{ explanationLanguage: 'en' }] },
            overrides: [
                { taskId: 'grammar', language: 'en', studiedLanguage: 'fr' },
            ],
        });

        expect(
            resolveTaskExplanationLanguages(brief, {
                learnerMessages: ['Use only French.'],
                overrides: [choice],
            }).brief.tasks[0]?.explanationLanguage,
        ).toBe('fr');
    });

    it('retains verified pending choices but invalidates them on content-language changes or explicit reset', () => {
        const retained = [
            { taskId: 'grammar', language: 'en', studiedLanguage: 'fr' },
        ];

        expect(
            resolveTaskExplanationLanguages(brief, {
                learnerMessages: ['Up to four exercises.'],
                retained,
            }).brief.tasks[0]?.explanationLanguage,
        ).toBe('en');

        expect(
            resolveTaskExplanationLanguages(
                { tasks: [{ ...brief.tasks[0]!, language: 'es' }] },
                { learnerMessages: [], retained },
            ).brief.tasks[0]?.explanationLanguage,
        ).toBe('es');

        expect(
            resolveTaskExplanationLanguages(brief, {
                learnerMessages: ['Explain everything in French.'],
                retained,
                overrides: [
                    {
                        taskId: 'grammar',
                        language: 'fr',
                        evidence: 'Explain everything in French',
                    },
                ],
            }).overrides,
        ).toEqual([]);
    });

    it('retains an explicit explanation choice while clarification is still missing the studied language', () => {
        const pending = resolveTaskExplanationLanguages(
            {
                tasks: [
                    {
                        id: 'grammar',
                        kind: 'grammar',
                        instruction: 'Prepare grammar.',
                    },
                ],
            },
            {
                learnerMessages: ['Explain the rule in English.'],
                overrides: [
                    {
                        taskId: 'grammar',
                        language: 'en',
                        evidence: 'Explain the rule in English',
                    },
                ],
            },
        );

        expect(pending.overrides).toEqual([
            { taskId: 'grammar', language: 'en', studiedLanguage: '*' },
        ]);

        expect(
            resolveTaskExplanationLanguages(brief, {
                learnerMessages: ['Study French.'],
                retained: pending.overrides,
            }).brief.tasks[0]?.explanationLanguage,
        ).toBe('en');
    });
});
