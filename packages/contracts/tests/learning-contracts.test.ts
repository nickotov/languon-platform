import { describe, expect, it } from 'vitest';
import {
    FlashcardAttemptRequestSchema,
    FlashcardConfigurationSchema,
    FlashcardItemsRequestSchema,
    FlashcardPreferencesPutRequestSchema,
    FlashcardPrepareRequestSchema,
    LearningEntriesQuerySchema,
} from '../src/learning';

const id = '00000000-0000-4000-8000-000000000001';
const configuration = { front: ['targetExample'], back: ['sourceExample'] };
describe('flashcard boundary contracts', () => {
    it('requires nonempty unique known fields and strict objects', () => {
        expect(
            FlashcardConfigurationSchema.safeParse(configuration).success,
        ).toBe(true);
        for (const front of [
            [],
            ['source', 'source'],
            ['translationContext'],
        ]) {
            expect(
                FlashcardConfigurationSchema.safeParse({
                    ...configuration,
                    front,
                }).success,
            ).toBe(false);
        }
        expect(
            FlashcardConfigurationSchema.safeParse({
                ...configuration,
                userId: id,
            }).success,
        ).toBe(false);
    });
    it('permits first preference creation with expectedVersion zero', () => {
        expect(
            FlashcardPreferencesPutRequestSchema.parse({
                configuration,
                shuffle: true,
                expectedVersion: 0,
            }).expectedVersion,
        ).toBe(0);
        expect(
            FlashcardPreferencesPutRequestSchema.safeParse({
                configuration,
                shuffle: true,
                expectedVersion: -1,
            }).success,
        ).toBe(false);
    });
    it('bounds batches and manual selections without allowing duplicate identities', () => {
        expect(
            FlashcardItemsRequestSchema.safeParse({
                configuration,
                entryIds: [id],
            }).success,
        ).toBe(true);
        expect(
            FlashcardItemsRequestSchema.safeParse({
                configuration,
                entryIds: [id, id],
            }).success,
        ).toBe(false);
        expect(
            FlashcardItemsRequestSchema.safeParse({
                configuration,
                entryIds: Array.from(
                    { length: 26 },
                    (_, i) =>
                        `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
                ),
            }).success,
        ).toBe(false);
        expect(
            FlashcardPrepareRequestSchema.safeParse({
                configuration,
                scope: { type: 'manual', entryIds: [] },
            }).success,
        ).toBe(false);
        expect(
            FlashcardPrepareRequestSchema.safeParse({
                configuration,
                scope: { type: 'all', entryIds: [id] },
            }).success,
        ).toBe(false);
    });
    it('rejects caller-controlled learner identity and invalid ratings', () => {
        const body = {
            operationId: id,
            sessionId: id,
            entryId: id,
            expectedLearningVersion: 1,
            round: 1,
            rating: 'known',
            configuration,
        };
        expect(FlashcardAttemptRequestSchema.safeParse(body).success).toBe(
            true,
        );
        expect(
            FlashcardAttemptRequestSchema.safeParse({ ...body, userId: id })
                .success,
        ).toBe(false);
        expect(
            FlashcardAttemptRequestSchema.safeParse({
                ...body,
                rating: 'accuracy',
            }).success,
        ).toBe(false);
    });
    it('defaults entry page sizes and rejects oversized reads', () => {
        expect(LearningEntriesQuerySchema.parse({}).limit).toBe(25);
        expect(
            LearningEntriesQuerySchema.safeParse({ limit: '26' }).success,
        ).toBe(false);
    });
});
