import { describe, expect, it } from 'vitest';
import {
    SentenceLibraryQuerySchema,
    SentenceLibraryItemSchema,
    AdminSentenceLibraryItemSchema,
    SentenceLibraryMutationRequestSchema,
    SentenceLibrarySnapshotRequestSchema,
    SentencePreparationStartRequestSchema,
    SentencePreparationSchema,
    SentencePreparationBatchesQuerySchema,
    SentencePreparationBatchesResponseSchema,
    SentencePrepareRequestSchema,
    SentenceNextRequestSchema,
    AdminSentenceLibraryMutationRequestSchema,
    AdminSentenceLibraryQuerySchema,
    AdminSentenceDictionaryQuerySchema,
    AdminSentenceDictionaryResponseSchema,
} from '../src';

const id = '00000000-0000-4000-8000-000000000001';
const otherId = '00000000-0000-4000-8000-000000000002';
const selected = {
    type: 'selected',
    items: [{ exerciseId: id, expectedVersion: 0 }],
};
const setup = {
    direction: 'target-to-source',
    mode: 'saved-first',
    scope: { type: 'all' },
};

describe('sentence library boundaries', () => {
    it('keeps creator archive metadata out of public library items', () => {
        const item = {
            exerciseId: id,
            dictionaryId: id,
            direction: 'source-to-target',
            sourceLanguage: 'en',
            targetLanguage: 'fr',
            sourceText: 'A book.',
            createdAt: '2026-10-06T00:00:00.000Z',
            personalArchivedAt: null,
            globalArchivedAt: null,
            contentState: 'current',
            version: 0,
            sharing: 'shared',
        };
        expect(SentenceLibraryItemSchema.safeParse(item).success).toBe(true);
        expect(
            SentenceLibraryItemSchema.safeParse({ ...item, creatorId: id })
                .success,
        ).toBe(false);
        expect(
            SentenceLibraryItemSchema.safeParse({
                ...item,
                creatorArchived: true,
            }).success,
        ).toBe(false);
        expect(
            AdminSentenceLibraryItemSchema.safeParse({
                ...item,
                creatorArchived: true,
                creatorId: id,
            }).success,
        ).toBe(true);
    });

    it('keeps creator identity filters and properties admin-only', () => {
        expect(
            SentenceLibraryQuerySchema.safeParse({ creatorId: id }).success,
        ).toBe(false);
        expect(
            AdminSentenceLibraryQuerySchema.safeParse({ creatorId: id })
                .success,
        ).toBe(true);
    });
    it('bounds dictionary discovery and exposes no account-private fields', () => {
        expect(AdminSentenceDictionaryQuerySchema.parse({}).limit).toBe(25);
        expect(
            AdminSentenceDictionaryQuerySchema.safeParse({ limit: 101 })
                .success,
        ).toBe(false);
        const response = {
            items: [
                {
                    dictionaryId: id,
                    title: 'My French words',
                    sourceLanguage: 'ru',
                    targetLanguage: 'fr',
                    generatedCount: 3,
                    availableCount: 5,
                },
            ],
            nextCursor: null,
        };
        expect(
            AdminSentenceDictionaryResponseSchema.safeParse(response).success,
        ).toBe(true);
        expect(
            AdminSentenceDictionaryResponseSchema.safeParse({
                ...response,
                items: [{ ...response.items[0], generatedCount: -1 }],
            }).success,
        ).toBe(false);
        expect(
            AdminSentenceDictionaryResponseSchema.safeParse({
                ...response,
                items: [
                    {
                        ...response.items[0],
                        ownerEmail: 'private@example.test',
                    },
                ],
            }).success,
        ).toBe(false);
    });

    it('defaults to personal active examples and safely parses archive filters', () => {
        expect(SentenceLibraryQuerySchema.parse({})).toEqual({
            personalArchive: 'active',
            globalArchive: 'active',
            contentState: 'all',
            limit: 25,
        });
        expect(
            AdminSentenceLibraryQuerySchema.parse({ creatorArchived: 'false' })
                .creatorArchived,
        ).toBe(false);
        expect(AdminSentenceLibraryQuerySchema.parse({}).globalArchive).toBe(
            'all',
        );
        expect(
            SentenceLibraryQuerySchema.safeParse({ creatorArchived: 'false' })
                .success,
        ).toBe(false);
        expect(
            AdminSentenceLibraryQuerySchema.safeParse({
                creatorArchived: 'yes',
            }).success,
        ).toBe(false);
        expect(
            SentenceLibraryQuerySchema.safeParse({ limit: 101 }).success,
        ).toBe(false);
    });
    it('requires bounded unique versioned selection and an idempotent mutation', () => {
        const mutation = {
            operationId: id,
            operation: 'archive',
            selection: selected,
        };
        expect(
            SentenceLibraryMutationRequestSchema.safeParse(mutation).success,
        ).toBe(true);
        for (const selection of [
            { type: 'selected', items: [] },
            { type: 'selected', items: [...selected.items, ...selected.items] },
            {
                type: 'selected',
                items: [{ exerciseId: id, expectedVersion: -1 }],
            },
            {
                type: 'selected',
                items: Array.from({ length: 101 }, (_, index) => ({
                    exerciseId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
                    expectedVersion: 0,
                })),
            },
            { type: 'all-matching', snapshotToken: '' },
            {
                type: 'all-matching',
                snapshotToken: 'opaque-token',
                items: selected.items,
            },
        ]) {
            expect(
                SentenceLibraryMutationRequestSchema.safeParse({
                    ...mutation,
                    selection,
                }).success,
            ).toBe(false);
        }
        expect(
            SentenceLibraryMutationRequestSchema.safeParse({
                ...mutation,
                operation: 'delete',
            }).success,
        ).toBe(false);
        expect(
            SentenceLibraryMutationRequestSchema.safeParse({
                ...mutation,
                referenceTranslation: 'untrusted',
            }).success,
        ).toBe(false);
    });
    it('all-matching confirmation has filters but cannot smuggle a pagination cursor', () => {
        expect(
            SentenceLibrarySnapshotRequestSchema.safeParse({
                operation: 'restore',
                query: { personalArchive: 'archived' },
            }).success,
        ).toBe(true);
        expect(
            SentenceLibrarySnapshotRequestSchema.safeParse({
                operation: 'archive',
                query: { cursor: 'first-page' },
            }).success,
        ).toBe(false);
    });
    it('restricts destructive operations to admin contracts and requires a bounded reason', () => {
        const mutation = {
            operationId: id,
            operation: 'delete',
            selection: selected,
            reason: 'Remove archived test content',
            confirmation: 'delete-archived-examples',
        };
        expect(
            AdminSentenceLibraryMutationRequestSchema.safeParse(mutation)
                .success,
        ).toBe(true);
        expect(
            AdminSentenceLibraryMutationRequestSchema.safeParse({
                ...mutation,
                confirmation: undefined,
            }).success,
        ).toBe(false);
        expect(
            AdminSentenceLibraryMutationRequestSchema.safeParse({
                ...mutation,
                operation: 'archive',
                confirmation: undefined,
            }).success,
        ).toBe(true);
        expect(
            AdminSentenceLibraryMutationRequestSchema.safeParse({
                ...mutation,
                reason: '  ',
            }).success,
        ).toBe(false);
        expect(
            AdminSentenceLibraryMutationRequestSchema.safeParse({
                ...mutation,
                reason: 'x'.repeat(501),
            }).success,
        ).toBe(false);
        expect(
            AdminSentenceLibraryQuerySchema.parse({ relation: 'generated' })
                .relation,
        ).toBe('generated');
    });
});

describe('sentence preparation boundaries', () => {
    it('pages prepared partitions with bounded offset and page size', () => {
        expect(SentencePreparationBatchesQuerySchema.parse({})).toEqual({
            offset: 0,
            limit: 10,
        });
        expect(
            SentencePreparationBatchesQuerySchema.parse({
                offset: '20',
                limit: '25',
            }),
        ).toEqual({ offset: 20, limit: 25 });
        for (const input of [
            { offset: -1 },
            { offset: 1_000_001 },
            { limit: 26 },
            { limit: 0 },
        ]) {
            expect(
                SentencePreparationBatchesQuerySchema.safeParse(input).success,
            ).toBe(false);
        }
        expect(
            SentencePreparationBatchesResponseSchema.safeParse({
                items: [],
                nextOffset: null,
            }).success,
        ).toBe(true);
        expect(
            SentencePreparationBatchesResponseSchema.safeParse({
                items: [],
                nextOffset: -1,
            }).success,
        ).toBe(false);
    });
    it('starts full-dictionary preparation with a bounded initial practice scope', () => {
        const request = {
            operationId: id,
            direction: 'target-to-source',
            mode: 'new-only',
            initialRoundScope: { type: 'manual', entryIds: [id] },
        };
        expect(
            SentencePreparationStartRequestSchema.safeParse(request).success,
        ).toBe(true);
        expect(
            SentencePreparationStartRequestSchema.safeParse({
                ...request,
                initialRoundScope: { type: 'manual', entryIds: [id, id] },
            }).success,
        ).toBe(false);
        expect(
            SentencePreparationStartRequestSchema.safeParse({
                ...request,
                exerciseIds: [id],
            }).success,
        ).toBe(false);
    });
    it('accepts additive prepared partition references without changing ordinary setup', () => {
        expect(SentencePrepareRequestSchema.safeParse(setup).success).toBe(
            true,
        );
        expect(
            SentencePrepareRequestSchema.safeParse({
                ...setup,
                preparedBatchId: id,
            }).success,
        ).toBe(true);
        expect(
            SentenceNextRequestSchema.safeParse({
                ...setup,
                preparedBatchId: id,
                operationId: id,
                sessionId: id,
                visitedExerciseIds: [],
            }).success,
        ).toBe(true);
    });
    it('bounds the exposed initial batch and rejects impossible coverage', () => {
        const aggregate = {
            id,
            dictionaryId: id,
            direction: 'source-to-target',
            mode: 'saved-first',
            state: 'paused',
            pauseReason: 'credits',
            eligibleCount: 200,
            preparedCount: 1,
            reusedExerciseCount: 1,
            generatedExerciseCount: 0,
            batchCount: 2,
            initialBatch: {
                id,
                entryIds: [id],
                preparedEntryIds: [id],
                exerciseIds: [otherId],
                state: 'ready',
            },
            activeJobId: null,
            createdAt: '2026-10-06T00:00:00.000Z',
            updatedAt: '2026-10-06T00:00:00.000Z',
        };
        expect(SentencePreparationSchema.safeParse(aggregate).success).toBe(
            true,
        );
        expect(
            SentencePreparationSchema.safeParse({
                ...aggregate,
                preparedCount: 201,
            }).success,
        ).toBe(false);
        expect(
            SentencePreparationSchema.safeParse({
                ...aggregate,
                initialBatch: {
                    ...aggregate.initialBatch,
                    preparedEntryIds: [otherId],
                },
            }).success,
        ).toBe(false);
        expect(
            SentencePreparationSchema.safeParse({ ...aggregate, batches: [] })
                .success,
        ).toBe(false);
    });
});
