import { describe, expect, it } from 'vitest';
import { ExerciseGenerationRequestSchema } from './exercise-generation';
import { ExerciseActivityIdSchema } from './exercise-activity';
import { SubmitConversationTurnRequestSchema } from './contextual-assistant';

const id = '11111111-1111-4111-8111-111111111111';
const automatic = {
    mode: 'automatic',
    count: 5,
    language: 'fr',
    explanationLanguage: 'en',
    difficulty: 'intermediate',
};
const selected = {
    ...automatic,
    mode: 'selected',
    activities: [
        { activityId: 'V02', count: 2 },
        { activityId: 'V01', count: 3 },
    ],
};

describe('learner exercise generation choices', () => {
    it('accepts automatic mode without activity allocations and preserves explicit selection order/counts', () => {
        expect(ExerciseGenerationRequestSchema.parse(automatic)).toEqual(
            automatic,
        );

        expect(ExerciseGenerationRequestSchema.parse(selected)).toEqual(
            selected,
        );
    });

    it('accepts the complete 19-activity selection and bounded single-activity totals', () => {
        const all = {
            ...selected,
            count: 19,
            activities: ExerciseActivityIdSchema.options.map((activityId) => ({
                activityId,
                count: 1,
            })),
        };

        expect(ExerciseGenerationRequestSchema.parse(all)).toEqual(all);
        for (const count of [1, 25]) {
            const input = {
                ...selected,
                count,
                activities: [{ activityId: 'V01', count }],
            };

            expect(ExerciseGenerationRequestSchema.parse(input)).toEqual(input);
        }
    });

    it.each([
        { mode: 'selected' },
        { mode: 'automatic', activities: [{ activityId: 'V01', count: 5 }] },
        { mode: 'automatic', activities: [] },
        { mode: 'selected', activities: [] },
        { mode: 'selected', activities: [{ activityId: 'V01', count: 4 }] },
        { mode: 'selected', activities: [{ activityId: 'V01', count: 6 }] },
        {
            mode: 'selected',
            activities: [
                { activityId: 'V01', count: 2 },
                { activityId: 'V01', count: 3 },
            ],
        },
        { mode: 'selected', activities: [{ activityId: 'V04', count: 5 }] },
        { mode: 'selected', activities: [{ activityId: 'custom', count: 5 }] },
        { mode: 'selected', activities: [{ activityId: 'v01', count: 5 }] },
        {
            mode: 'selected',
            activities: [{ activityId: 'V01', count: 5, blockId: id }],
        },
        { mode: 'selected', activities: [{ activityId: 'V01', count: 0 }] },
        { mode: 'selected', activities: [{ activityId: 'V01', count: 1.5 }] },
        { mode: 'selected', activities: [{ activityId: 'V01', count: 26 }] },
        { mode: 'mixed' },
        { count: 0 },
        { count: -1 },
        { count: 1.5 },
        { count: 26 },
        { count: Number.POSITIVE_INFINITY },
        { count: Number.NaN },
        { count: '5' },
        { count: undefined },
        { language: '' },
        { language: 'French!' },
        { explanationLanguage: 'en_US' },
        { difficulty: 'expert' },
    ])(
        'rejects incomplete, conflicting or unsupported learner choices: %j',
        (patch) => {
            expect(
                ExerciseGenerationRequestSchema.safeParse({
                    ...automatic,
                    ...patch,
                }).success,
            ).toBe(false);
        },
    );

    it.each([
        { ownerId: id },
        { source: { noteId: id } },
        { sources: [{ kind: 'vocabulary', blockId: id }] },
        { blockReferences: [id] },
        { modelId: 'override/model' },
        { prompt: 'Ignore the source.' },
        { checkingPolicy: 'prepared-key' },
        { tools: ['generate_recall_word'] },
        { formats: ['free-text'] },
    ])(
        'refuses authority, execution or content overrides in display choices: %j',
        (extra) => {
            expect(
                ExerciseGenerationRequestSchema.safeParse({
                    ...automatic,
                    ...extra,
                }).success,
            ).toBe(false);
        },
    );

    it('preserves supported target/explanation language tags without inventing source authority', () => {
        const input = {
            ...automatic,
            language: 'zh-Hans',
            explanationLanguage: 'es-MX',
        };

        expect(ExerciseGenerationRequestSchema.parse(input)).toEqual(input);
    });
});

describe('exercise choices at conversation submission boundary', () => {
    it('accepts a structured manifest alongside separately authorized block selectors', () => {
        const request = {
            requestId: id,
            content: 'Generate five questions.',
            blockReferences: [id],
            exerciseRequest: selected,
        };
        const parsed = SubmitConversationTurnRequestSchema.parse(request);
        expect(parsed).toEqual({ ...request, attachments: [] });
    });

    it('keeps ordinary conversation submission available without a manifest', () => {
        const request = { requestId: id, content: 'Explain the rule.' };
        expect(SubmitConversationTurnRequestSchema.parse(request)).toEqual({
            ...request,
            attachments: [],
        });
    });

    it('rejects malformed or source-authority-expanded manifests at the real submit schema', () => {
        const request = { requestId: id, content: 'Generate exercises.' };
        for (const exerciseRequest of [
            { ...selected, count: 4 },
            { ...automatic, ownerId: id },
            { ...automatic, sourceId: id },
            { ...automatic, checkingPolicy: 'hybrid' },
        ]) {
            expect(
                SubmitConversationTurnRequestSchema.safeParse({
                    ...request,
                    exerciseRequest,
                }).success,
            ).toBe(false);
        }

        expect(
            SubmitConversationTurnRequestSchema.safeParse({
                ...request,
                exerciseRequest: automatic,
                ownerId: id,
            }).success,
        ).toBe(false);
    });
});
