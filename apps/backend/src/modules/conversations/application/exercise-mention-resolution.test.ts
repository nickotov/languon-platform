import { describe, expect, it } from 'vitest';
import type { ConversationPromptMention } from '@languon/contracts';
import { applyExerciseMentionChoices } from './exercise-mention-resolution';
import type { TutorRequestResolution } from './tutor-request-contract';
import { TutorRequestResolutionSchema } from './tutor-request-contract';

const mentions: ConversationPromptMention[] = [
    {
        kind: 'exercise',
        activityId: 'V02',
        catalogVersion: 1,
        start: 0,
        end: 2,
    },
    {
        kind: 'exercise',
        activityId: 'V03',
        catalogVersion: 1,
        start: 3,
        end: 5,
    },
];
const generate: TutorRequestResolution = {
    kind: 'generate',
    replyLanguage: 'en',
    brief: {
        tasks: [
            {
                id: 'exercises',
                kind: 'exercises',
                instruction: 'Generate the selected types',
            },
        ],
    },
};

describe('catalog mention resolution', () => {
    it('does not convert an explanatory question into generation', () => {
        const answer: TutorRequestResolution = {
            kind: 'answer',
            purpose: 'learning-explanation',
            documentUse: false,
        };

        expect(applyExerciseMentionChoices(mentions, answer, false)).toEqual(
            answer,
        );
    });

    it('defaults to one per type with shared source and preserves first mention order', () => {
        const result = applyExerciseMentionChoices(mentions, generate, true);
        expect(result.kind).toBe('generate');
        if (result.kind === 'generate') {
            expect(result.brief.tasks[0]).toMatchObject({
                count: 2,
                activities: [
                    { activityId: 'V02', count: 1 },
                    { activityId: 'V03', count: 1 },
                ],
            });
        }
    });

    it('clarifies absent sources and insufficient counts', () => {
        expect(
            applyExerciseMentionChoices(mentions, generate, false).kind,
        ).toBe('clarify');

        expect(
            applyExerciseMentionChoices(
                mentions,
                {
                    ...generate,
                    brief: {
                        tasks: [{ ...generate.brief.tasks[0]!, count: 1 }],
                    },
                },
                true,
            ).kind,
        ).toBe('clarify');
    });

    it('preserves explicit unequal per-type quantities and rejects conflicting advanced automatic mode', () => {
        const request = {
            mode: 'selected' as const,
            count: 5,
            language: 'en',
            explanationLanguage: 'en',
            difficulty: 'beginner' as const,
            activities: [
                { activityId: 'V02' as const, count: 4 },
                { activityId: 'V03' as const, count: 1 },
            ],
        };
        const planned: TutorRequestResolution = {
            ...generate,
            brief: {
                tasks: [
                    {
                        ...generate.brief.tasks[0]!,
                        count: 5,
                        activities: request.activities,
                    },
                ],
            },
        };
        const resolved = applyExerciseMentionChoices(mentions, planned, true);
        if (resolved.kind !== 'generate') {
            throw new Error('Expected generation');
        }

        expect(resolved.brief.tasks[0]!.activities).toEqual(request.activities);
        expect(
            applyExerciseMentionChoices(mentions, planned, true, request),
        ).toEqual(planned);

        expect(
            applyExerciseMentionChoices(mentions, planned, true, {
                ...request,
                mode: 'automatic',
                activities: undefined,
            }).kind,
        ).toBe('clarify');
    });

    it('pins identities in pending clarification briefs without starting generation', () => {
        const clarification: TutorRequestResolution = {
            kind: 'clarify',
            replyLanguage: 'en',
            question: 'Which source should I use?',
            brief: {
                tasks: [
                    {
                        id: 'pending',
                        kind: 'exercises',
                        instruction: 'Generate exercises',
                    },
                ],
            },
        };
        const result = applyExerciseMentionChoices(
            mentions,
            clarification,
            false,
        );

        expect(result.kind).toBe('clarify');
        if (result.kind !== 'clarify') {
            throw new Error('Expected clarification');
        }

        expect(result.question).toBe(clarification.question);
        expect(result.brief.tasks[0]).toMatchObject({
            count: 2,
            activities: [
                { activityId: 'V02', count: 1 },
                { activityId: 'V03', count: 1 },
            ],
        });
    });

    it('clarifies duplicate or missing planner activity allocations without losing selected identities', () => {
        for (const activities of [
            [
                { activityId: 'V02', count: 1 },
                { activityId: 'V02', count: 1 },
            ],
            [{ activityId: 'V02', count: 2 }],
        ]) {
            const planned = TutorRequestResolutionSchema.parse({
                ...generate,
                brief: {
                    tasks: [
                        { ...generate.brief.tasks[0]!, count: 2, activities },
                    ],
                },
            });
            const resolved = applyExerciseMentionChoices(
                mentions,
                planned,
                true,
            );

            expect(resolved.kind).toBe('clarify');
            if (resolved.kind !== 'clarify') {
                throw new Error('Expected clarification');
            }

            expect(resolved.brief.tasks[0]).toMatchObject({
                count: 2,
                activities: [
                    { activityId: 'V02', count: 1 },
                    { activityId: 'V03', count: 1 },
                ],
            });
        }
    });
});
