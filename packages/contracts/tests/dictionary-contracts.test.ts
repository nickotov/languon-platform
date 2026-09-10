import { LANGUAGE_CATALOG, LANGUAGE_CATALOG_VERSION } from '@languon/languages';
import { describe, expect, it } from 'vitest';

import {
    AcceptDictionaryGenerationJobRequestSchema,
    AcceptDictionaryPastedTermsGenerationJobRequestSchema,
    AcceptDictionaryDocumentTermsGenerationJobRequestSchema,
    CompleteDictionaryDocumentUploadRequestSchema,
    CreateDictionaryDocumentUploadRequestSchema,
    DictionaryDocumentUploadCapabilitySchema,
    CreateDictionaryCardRequestSchema,
    CreateDictionaryRequestSchema,
    DictionaryCardEffectiveSettingsSchema,
    DictionaryEndpointInventory,
    DictionaryEndpointSchemas,
    DictionaryErrorCodeSchema,
    DictionaryGenerationJobSchema,
    DictionaryGenerationJobResponseSchema,
    DictionaryGenerationProposalSchema,
    DictionaryPastedTermsGenerationProposalSchema,
    DictionaryIdempotencyHeadersSchema,
    DictionarySettingsValuesSchema,
    LanguagesResponseSchema,
    EnqueueDictionaryCardGenerationRequestSchema,
    EnqueueDictionaryPastedTermsGenerationRequestSchema,
    ListDictionariesQuerySchema,
    ListDictionaryCardsQuerySchema,
    ListSharedDictionaryQuerySchema,
    ReorderDictionaryCardsRequestSchema,
    RetryDictionaryPastedTermsGenerationRequestSchema,
    RetryDictionaryDocumentTermsGenerationRequestSchema,
    UpdateDictionaryCardRequestSchema,
    UpdateDictionaryRequestSchema,
} from '../src/dictionaries';

const CARD_ID_1 = '11111111-1111-4111-8111-111111111111';
const CARD_ID_2 = '22222222-2222-4222-8222-222222222222';

describe('dictionary HTTP contracts', () => {
    it('serves the exact versioned language package catalog', () => {
        expect(
            LanguagesResponseSchema.parse({
                catalogVersion: LANGUAGE_CATALOG_VERSION,
                languages: LANGUAGE_CATALOG,
            }),
        ).toEqual({
            catalogVersion: 1,
            languages: LANGUAGE_CATALOG,
        });
        expect(() =>
            LanguagesResponseSchema.parse({
                catalogVersion: 2,
                languages: LANGUAGE_CATALOG,
            }),
        ).toThrow();
        expect(() =>
            LanguagesResponseSchema.parse({
                catalogVersion: 1,
                languages: LANGUAGE_CATALOG.map((language) => ({
                    ...language,
                    tag: 'en',
                })),
            }),
        ).toThrow();
    });

    it('requires a canonical distinct language pair and rejects unknown input', () => {
        expect(
            CreateDictionaryRequestSchema.parse({
                name: '  Spanish basics  ',
                sourceLanguage: 'en',
                targetLanguage: 'es',
            }),
        ).toMatchObject({
            name: 'Spanish basics',
            description: null,
        });
        expect(() =>
            CreateDictionaryRequestSchema.parse({
                name: 'Invalid pair',
                sourceLanguage: 'en',
                targetLanguage: 'en',
            }),
        ).toThrow();
        expect(() =>
            CreateDictionaryRequestSchema.parse({
                name: 'Non-canonical',
                sourceLanguage: 'en',
                targetLanguage: 'ZH-hans',
            }),
        ).toThrow();
        expect(() =>
            CreateDictionaryRequestSchema.parse({
                name: 'Unknown field',
                sourceLanguage: 'en',
                targetLanguage: 'es',
                ownerId: CARD_ID_1,
            }),
        ).toThrow();
    });

    it('enforces bounded settings dependencies and effective language roles', () => {
        const defaults = {
            transcriptionEnabled: false,
            transcriptionNotation: 'ipa',
            transcriptionCustomLabel: null,
            definitionEnabled: false,
            definitionLanguage: 'target',
            exampleEnabled: true,
            exampleLanguage: 'source',
            exampleTranslationEnabled: true,
        } as const;

        expect(DictionarySettingsValuesSchema.parse(defaults)).toEqual(
            defaults,
        );
        expect(
            DictionarySettingsValuesSchema.parse({
                ...defaults,
                exampleEnabled: false,
            }),
        ).toEqual({ ...defaults, exampleEnabled: false });
        expect(() =>
            CreateDictionaryRequestSchema.parse({
                name: 'Invalid initial dependency',
                sourceLanguage: 'en',
                targetLanguage: 'es',
                settings: { ...defaults, exampleEnabled: false },
            }),
        ).toThrow();
        expect(() =>
            DictionarySettingsValuesSchema.parse({
                ...defaults,
                transcriptionEnabled: true,
                transcriptionNotation: 'custom',
            }),
        ).toThrow();

        expect(
            DictionaryCardEffectiveSettingsSchema.parse({
                ...defaults,
                exampleTranslationLanguage: 'target',
            }),
        ).toBeDefined();
        expect(() =>
            DictionaryCardEffectiveSettingsSchema.parse({
                ...defaults,
                exampleTranslationLanguage: 'source',
            }),
        ).toThrow();
    });

    it('defaults card inactive values and raw overrides without losing shape', () => {
        expect(
            CreateDictionaryCardRequestSchema.parse({
                expectedDictionaryVersion: 4,
                expectedSettingsVersion: 2,
                values: {
                    source: 'bank',
                    translation: 'banco',
                },
            }),
        ).toEqual({
            expectedDictionaryVersion: 4,
            expectedSettingsVersion: 2,
            values: {
                source: 'bank',
                translation: 'banco',
                transcription: null,
                definition: null,
                example: null,
                exampleTranslation: null,
            },
            overrides: {
                transcriptionEnabled: null,
                transcriptionNotation: null,
                transcriptionCustomLabel: null,
                definitionEnabled: null,
                definitionLanguage: null,
                exampleEnabled: null,
                exampleLanguage: null,
                exampleTranslationEnabled: null,
            },
        });
    });

    it('requires optimistic versions and non-empty strict mutation patches', () => {
        expect(
            UpdateDictionaryRequestSchema.parse({
                expectedDictionaryVersion: 3,
                expectedSettingsVersion: 2,
                settings: { definitionEnabled: true },
            }),
        ).toBeDefined();
        expect(() =>
            UpdateDictionaryRequestSchema.parse({
                expectedDictionaryVersion: 3,
                settings: { definitionEnabled: true },
            }),
        ).toThrow();
        expect(() =>
            UpdateDictionaryRequestSchema.parse({
                expectedDictionaryVersion: 3,
            }),
        ).toThrow();
        expect(() =>
            UpdateDictionaryCardRequestSchema.parse({
                expectedDictionaryVersion: 3,
                expectedSettingsVersion: 2,
                expectedCardVersion: 5,
                values: {},
            }),
        ).toThrow();
    });

    it('bounds cursor pagination, search, and ordered-window requests', () => {
        expect(ListDictionariesQuerySchema.parse({})).toEqual({
            limit: 25,
            lifecycle: 'active',
        });
        expect(ListDictionaryCardsQuerySchema.parse({ limit: '100' })).toEqual({
            limit: 100,
            lifecycle: 'active',
        });
        expect(() =>
            ListDictionaryCardsQuerySchema.parse({ limit: 101 }),
        ).toThrow();
        expect(() =>
            ListDictionaryCardsQuerySchema.parse({ search: 'x'.repeat(201) }),
        ).toThrow();
        expect(ListSharedDictionaryQuerySchema.parse({})).toEqual({
            limit: 25,
        });
        expect(() =>
            ListSharedDictionaryQuerySchema.parse({ limit: 26 }),
        ).toThrow();

        expect(
            ReorderDictionaryCardsRequestSchema.parse({
                expectedDictionaryVersion: 8,
                orderedCardIds: [CARD_ID_2, CARD_ID_1],
            }),
        ).toBeDefined();
        expect(() =>
            ReorderDictionaryCardsRequestSchema.parse({
                expectedDictionaryVersion: 8,
                orderedCardIds: [CARD_ID_1, CARD_ID_1],
            }),
        ).toThrow();
    });

    it('keeps capability and idempotency material on dedicated headers', () => {
        expect(
            DictionaryIdempotencyHeadersSchema.parse({
                authorization: 'Bearer header.payload.signature',
                'content-type': 'application/json',
                'idempotency-key': 'client-request-0001',
            }),
        ).toMatchObject({ 'idempotency-key': 'client-request-0001' });
        expect(() =>
            DictionaryEndpointSchemas.readSharedDictionary.headers.parse({
                'x-languon-share-key': 'short',
            }),
        ).toThrow();
        expect(
            DictionaryEndpointSchemas.forkSharedDictionary.headers.parse({
                'x-languon-share-key': 'a'.repeat(43),
                'idempotency-key': 'client-request-0002',
            }),
        ).toBeDefined();
    });

    it('publishes only through explicit share-key rotation', () => {
        expect(() =>
            CreateDictionaryRequestSchema.parse({
                name: 'Cannot publish during create',
                sourceLanguage: 'en',
                targetLanguage: 'es',
                visibility: 'unlisted',
            }),
        ).toThrow();
        expect(() =>
            UpdateDictionaryRequestSchema.parse({
                expectedDictionaryVersion: 1,
                visibility: 'unlisted',
            }),
        ).toThrow();
        expect(
            UpdateDictionaryRequestSchema.parse({
                expectedDictionaryVersion: 1,
                visibility: 'private',
            }),
        ).toBeDefined();
        expect(DictionaryEndpointSchemas.createDictionary.response).toBe(
            DictionaryEndpointSchemas.readDictionary.response,
        );
        expect(DictionaryEndpointSchemas.updateDictionary.response).toBe(
            DictionaryEndpointSchemas.readDictionary.response,
        );
        expect(
            DictionaryEndpointSchemas.rotateDictionaryShareKey.response,
        ).not.toBe(DictionaryEndpointSchemas.readDictionary.response);
    });

    it('publishes the complete stable M1 endpoint and error inventories', () => {
        expect(DictionaryEndpointInventory).toEqual(
            [
                ['listLanguages', 'GET', '/languages', 'public'],
                [
                    'readDictionaryGenerationCapabilities',
                    'GET',
                    '/dictionary-generation-capabilities',
                    'owner',
                ],
                ['listDictionaries', 'GET', '/dictionaries', 'owner'],
                ['createDictionary', 'POST', '/dictionaries', 'owner'],
                [
                    'readDictionary',
                    'GET',
                    '/dictionaries/:dictionaryId',
                    'owner',
                ],
                [
                    'updateDictionary',
                    'PATCH',
                    '/dictionaries/:dictionaryId',
                    'owner',
                ],
                [
                    'archiveDictionary',
                    'POST',
                    '/dictionaries/:dictionaryId/archive',
                    'owner',
                ],
                [
                    'restoreDictionary',
                    'POST',
                    '/dictionaries/:dictionaryId/restore',
                    'owner',
                ],
                [
                    'previewDictionaryImport',
                    'POST',
                    '/dictionary-imports/preview',
                    'owner',
                ],
                ['importDictionary', 'POST', '/dictionary-imports', 'owner'],
                [
                    'exportDictionary',
                    'GET',
                    '/dictionaries/:dictionaryId/export',
                    'owner',
                ],
                [
                    'listDictionaryCards',
                    'GET',
                    '/dictionaries/:dictionaryId/cards',
                    'owner',
                ],
                [
                    'createDictionaryCard',
                    'POST',
                    '/dictionaries/:dictionaryId/cards',
                    'owner',
                ],
                [
                    'readDictionaryCard',
                    'GET',
                    '/dictionaries/:dictionaryId/cards/:cardId',
                    'owner',
                ],
                [
                    'updateDictionaryCard',
                    'PATCH',
                    '/dictionaries/:dictionaryId/cards/:cardId',
                    'owner',
                ],
                [
                    'archiveDictionaryCard',
                    'POST',
                    '/dictionaries/:dictionaryId/cards/:cardId/archive',
                    'owner',
                ],
                [
                    'restoreDictionaryCard',
                    'POST',
                    '/dictionaries/:dictionaryId/cards/:cardId/restore',
                    'owner',
                ],
                [
                    'reorderDictionaryCards',
                    'POST',
                    '/dictionaries/:dictionaryId/cards/reorder',
                    'owner',
                ],
                [
                    'rotateDictionaryShareKey',
                    'POST',
                    '/dictionaries/:dictionaryId/share-key/rotate',
                    'owner',
                ],
                [
                    'readSharedDictionary',
                    'GET',
                    '/shared/dictionaries/:shareId',
                    'capability',
                ],
                [
                    'forkSharedDictionary',
                    'POST',
                    '/shared/dictionaries/:shareId/fork',
                    'owner+capability',
                ],
                [
                    'enqueueDictionaryCardGeneration',
                    'POST',
                    '/dictionaries/:dictionaryId/cards/:cardId/generations',
                    'owner',
                ],
                [
                    'enqueueDictionaryCardAuthoringGeneration',
                    'POST',
                    '/dictionaries/:dictionaryId/card-authoring-generations',
                    'owner',
                ],
                [
                    'enqueueDictionaryPastedTermsGeneration',
                    'POST',
                    '/dictionaries/:dictionaryId/batch-generations',
                    'owner',
                ],
                [
                    'retryDictionaryPastedTermsGeneration',
                    'POST',
                    '/dictionary-generation-jobs/:jobId/retry-pasted-terms',
                    'owner',
                ],
                [
                    'retryDictionaryImportPairsGeneration',
                    'POST',
                    '/dictionary-generation-jobs/:jobId/retry-import-pairs',
                    'owner',
                ],
                [
                    'retryDictionaryDocumentTermsGeneration',
                    'POST',
                    '/dictionary-generation-jobs/:jobId/retry-document-terms',
                    'owner',
                ],
                [
                    'createDictionaryDocumentUpload',
                    'POST',
                    '/dictionaries/:dictionaryId/document-uploads',
                    'owner',
                ],
                [
                    'completeDictionaryDocumentUpload',
                    'POST',
                    '/dictionary-document-uploads/:uploadId/complete',
                    'owner',
                ],
                [
                    'readLatestDictionaryCardGeneration',
                    'GET',
                    '/dictionaries/:dictionaryId/cards/:cardId/generations/latest',
                    'owner',
                ],
                [
                    'readDictionaryGenerationJob',
                    'GET',
                    '/dictionary-generation-jobs/:jobId',
                    'owner',
                ],
                [
                    'cancelDictionaryGenerationJob',
                    'POST',
                    '/dictionary-generation-jobs/:jobId/cancel',
                    'owner',
                ],
                [
                    'discardDictionaryGenerationJob',
                    'POST',
                    '/dictionary-generation-jobs/:jobId/discard',
                    'owner',
                ],
                [
                    'acceptDictionaryGenerationJob',
                    'POST',
                    '/dictionary-generation-jobs/:jobId/accept',
                    'owner',
                ],
                [
                    'regenerateDictionaryGenerationJob',
                    'POST',
                    '/dictionary-generation-jobs/:jobId/regenerate',
                    'owner',
                ],
                [
                    'regenerateDictionaryCardAuthoringGeneration',
                    'POST',
                    '/dictionary-generation-jobs/:jobId/regenerate-card-authoring',
                    'owner',
                ],
            ].map(([name, method, path, access]) => ({
                name,
                method,
                path,
                access,
            })),
        );
        expect(DictionaryEndpointInventory).toHaveLength(
            Object.keys(DictionaryEndpointSchemas).length,
        );
        expect(DictionaryErrorCodeSchema.options).toContain(
            'shared_dictionary_not_found',
        );
        expect(DictionaryErrorCodeSchema.options).toContain('version_conflict');
        expect(DictionaryErrorCodeSchema.options).toContain(
            'owner_capacity_exceeded',
        );
        expect(DictionaryErrorCodeSchema.options).not.toContain(
            'share_key_invalid',
        );
    });

    it('bounds single-card generation input and keeps authorship server-owned', () => {
        expect(
            EnqueueDictionaryCardGenerationRequestSchema.parse({
                expectedDictionaryVersion: 4,
                expectedSettingsVersion: 3,
                expectedCardVersion: 2,
            }),
        ).toEqual({
            expectedDictionaryVersion: 4,
            expectedSettingsVersion: 3,
            expectedCardVersion: 2,
            instruction: null,
        });
        expect(() =>
            EnqueueDictionaryCardGenerationRequestSchema.parse({
                expectedDictionaryVersion: 4,
                expectedSettingsVersion: 3,
                expectedCardVersion: 2,
                instruction: 'x'.repeat(1_001),
            }),
        ).toThrow();
        expect(() =>
            AcceptDictionaryGenerationJobRequestSchema.parse({
                candidate: generationCandidate,
                authorship: 'ai-generated',
            }),
        ).toThrow();
    });

    it('validates bounded field-associated feedback and unique alternatives', () => {
        expect(
            DictionaryGenerationProposalSchema.parse({
                candidate: generationCandidate,
                fieldFeedback: [
                    {
                        field: 'translation',
                        reason: 'Corrected the article.',
                        alternatives: ['el banco', 'la banca'],
                    },
                ],
                warnings: ['Review the regional meaning.'],
            }),
        ).toBeDefined();
        expect(() =>
            DictionaryGenerationProposalSchema.parse({
                candidate: generationCandidate,
                fieldFeedback: [
                    {
                        field: 'translation',
                        reason: 'One',
                        alternatives: ['a', 'b', 'c', 'd'],
                    },
                ],
            }),
        ).toThrow();
        expect(() =>
            DictionaryGenerationProposalSchema.parse({
                candidate: generationCandidate,
                fieldFeedback: [
                    {
                        field: 'definition',
                        reason: 'One',
                        alternatives: [],
                    },
                    {
                        field: 'definition',
                        reason: 'Two',
                        alternatives: [],
                    },
                ],
            }),
        ).toThrow();
    });

    it('enforces review payload presence and terminal content redaction', () => {
        const queued = generationJob({
            state: 'queued',
            progress: { stage: 'queued', percent: 0 },
        });
        expect(DictionaryGenerationJobSchema.parse(queued)).toBeDefined();
        expect(() =>
            DictionaryGenerationJobSchema.parse({
                ...queued,
                state: 'review',
                progress: { stage: 'review_ready', percent: 100 },
                expiresAt: '2026-08-28T12:00:00.000Z',
            }),
        ).toThrow();
        expect(
            DictionaryGenerationJobSchema.parse({
                ...queued,
                state: 'cancelled',
                progress: { stage: 'terminal', percent: 0 },
                originalSnapshot: null,
                completedAt: '2026-08-21T12:01:00.000Z',
            }),
        ).toBeDefined();
        expect(() =>
            DictionaryGenerationJobSchema.parse({
                ...queued,
                state: 'cancelled',
                progress: { stage: 'terminal', percent: 0 },
                completedAt: '2026-08-21T12:01:00.000Z',
            }),
        ).toThrow();
    });

    it('bounds pasted-term enqueue input while leaving line splitting server-owned', () => {
        expect(
            EnqueueDictionaryPastedTermsGenerationRequestSchema.parse({
                expectedDictionaryVersion: 4,
                expectedSettingsVersion: 3,
                text: 'bank\nriver bank',
                context: 'Ecology and geography',
            }),
        ).toEqual({
            expectedDictionaryVersion: 4,
            expectedSettingsVersion: 3,
            text: 'bank\nriver bank',
            context: 'Ecology and geography',
        });
        expect(() =>
            EnqueueDictionaryPastedTermsGenerationRequestSchema.parse({
                expectedDictionaryVersion: 4,
                expectedSettingsVersion: 3,
                text: 'x'.repeat(20_201),
            }),
        ).toThrow();
        expect(
            EnqueueDictionaryPastedTermsGenerationRequestSchema.parse({
                expectedDictionaryVersion: 4,
                expectedSettingsVersion: 3,
                text: Array.from({ length: 100 }, () => 'x'.repeat(200)).join(
                    '\r\n',
                ),
            }).text,
        ).toHaveLength(20_198);
        expect(() =>
            EnqueueDictionaryPastedTermsGenerationRequestSchema.parse({
                expectedDictionaryVersion: 4,
                expectedSettingsVersion: 3,
                text: 'bank\u0000river',
            }),
        ).toThrow();
        expect(() =>
            EnqueueDictionaryPastedTermsGenerationRequestSchema.parse({
                expectedDictionaryVersion: 4,
                expectedSettingsVersion: 3,
                text: 'bank\triver',
            }),
        ).toThrow();
        expect(() =>
            EnqueueDictionaryPastedTermsGenerationRequestSchema.parse({
                expectedDictionaryVersion: 4,
                expectedSettingsVersion: 3,
                text: 'bank\u0085river',
            }),
        ).toThrow();
        expect(
            EnqueueDictionaryPastedTermsGenerationRequestSchema.parse({
                expectedDictionaryVersion: 4,
                expectedSettingsVersion: 3,
                text: 'bank\r\nriver',
            }).text,
        ).toBe('bank\r\nriver');
    });

    it('validates row-indexed pasted-term proposals and atomic edited selections', () => {
        const proposal = pastedTermsProposal();

        expect(
            DictionaryPastedTermsGenerationProposalSchema.parse(proposal),
        ).toEqual(proposal);
        expect(() =>
            DictionaryPastedTermsGenerationProposalSchema.parse({
                ...proposal,
                failures: [
                    {
                        rowIndex: 0,
                        input: 'bank',
                        code: 'generation_failed',
                        message: 'Could not generate this row.',
                        retryable: true,
                    },
                ],
            }),
        ).toThrow();

        expect(
            AcceptDictionaryPastedTermsGenerationJobRequestSchema.parse({
                format: 'pasted-terms:v1',
                selected: [
                    {
                        rowIndex: 0,
                        candidate: generationCandidate,
                    },
                ],
            }),
        ).toBeDefined();
        expect(() =>
            AcceptDictionaryGenerationJobRequestSchema.parse({
                format: 'pasted-terms:v1',
                selected: [
                    {
                        rowIndex: 0,
                        candidate: generationCandidate,
                    },
                    {
                        rowIndex: 0,
                        candidate: generationCandidate,
                    },
                ],
            }),
        ).toThrow();
    });

    it('discriminates pasted-term jobs and accepts a bounded multi-card outcome', () => {
        const job = pastedTermsJob({
            state: 'accepted',
            progress: { stage: 'terminal', percent: 100 },
            proposal: null,
            outcome: {
                cards: [
                    { rowIndex: 0, cardId: CARD_ID_1, cardVersion: 1 },
                    { rowIndex: 2, cardId: CARD_ID_2, cardVersion: 1 },
                ],
                dictionaryVersion: 6,
                warnings: [],
            },
            completedAt: '2026-08-21T12:01:00.000Z',
            expiresAt: null,
        });

        expect(DictionaryGenerationJobResponseSchema.parse({ job })).toEqual({
            job,
        });
        expect(
            DictionaryGenerationJobResponseSchema.parse({
                job: generationJob({}),
            }),
        ).toBeDefined();
    });

    it('requires unique bounded row indexes for pasted-term retries', () => {
        expect(
            RetryDictionaryPastedTermsGenerationRequestSchema.parse({
                expectedDictionaryVersion: 4,
                expectedSettingsVersion: 2,
                rowIndexes: [3, 1],
            }),
        ).toMatchObject({ rowIndexes: [3, 1] });
        expect(() =>
            RetryDictionaryPastedTermsGenerationRequestSchema.parse({
                expectedDictionaryVersion: 4,
                expectedSettingsVersion: 2,
                rowIndexes: [1, 1],
            }),
        ).toThrow();
    });

    it('bounds private document upload creation and signed headers', () => {
        expect(
            RetryDictionaryDocumentTermsGenerationRequestSchema.parse({
                expectedDictionaryVersion: 4,
                expectedSettingsVersion: 2,
                rowIndexes: [3, 1],
            }),
        ).toMatchObject({ rowIndexes: [3, 1] });
        expect(CompleteDictionaryDocumentUploadRequestSchema.parse({})).toEqual(
            {},
        );
        expect(
            CompleteDictionaryDocumentUploadRequestSchema.parse({
                versionId: 'immutable-version-7',
            }),
        ).toEqual({ versionId: 'immutable-version-7' });
        expect(
            CreateDictionaryDocumentUploadRequestSchema.parse({
                expectedDictionaryVersion: 4,
                expectedSettingsVersion: 2,
                instruction: null,
                mediaType: 'application/pdf',
                sizeBytes: 20 * 1_024 * 1_024,
                sha256: 'a'.repeat(64),
            }),
        ).toBeDefined();
        expect(() =>
            CreateDictionaryDocumentUploadRequestSchema.parse({
                expectedDictionaryVersion: 4,
                expectedSettingsVersion: 2,
                mediaType: 'application/zip',
                sizeBytes: 1,
                sha256: 'A'.repeat(64),
            }),
        ).toThrow();
        expect(() =>
            CreateDictionaryDocumentUploadRequestSchema.parse({
                expectedDictionaryVersion: 4,
                expectedSettingsVersion: 2,
                mediaType: 'text/plain',
                sizeBytes: 20 * 1_024 * 1_024 + 1,
                sha256: 'a'.repeat(64),
            }),
        ).toThrow();

        const capability = {
            id: CARD_ID_1,
            method: 'PUT',
            url: 'https://storage.invalid/upload',
            expiresAt: '2026-08-26T12:10:00.000Z',
            requiredHeaders: {
                'content-type': 'application/pdf',
                'x-amz-checksum-sha256': 'abc',
            },
        };
        expect(
            DictionaryDocumentUploadCapabilitySchema.parse(capability),
        ).toEqual(capability);
        expect(() =>
            DictionaryDocumentUploadCapabilitySchema.parse({
                ...capability,
                requiredHeaders: { 'X-Bad-Header': 'safe' },
            }),
        ).toThrow();
        expect(() =>
            DictionaryDocumentUploadCapabilitySchema.parse({
                ...capability,
                requiredHeaders: { 'content-type': 'safe\r\ninjected: yes' },
            }),
        ).toThrow();
        expect(
            CompleteDictionaryDocumentUploadRequestSchema.parse({
                versionId: 'opaque-version-1',
            }),
        ).toEqual({ versionId: 'opaque-version-1' });
    });

    it('discriminates awaiting-upload document jobs and document acceptance', () => {
        const job = {
            ...pastedTermsJob({}),
            kind: 'document-terms',
            format: 'document-terms:v1',
            state: 'awaiting-upload',
            progress: { stage: 'awaiting_upload', percent: 0 },
            proposal: null,
            expiresAt: null,
        };
        expect(DictionaryGenerationJobSchema.parse(job)).toEqual(job);
        expect(
            AcceptDictionaryDocumentTermsGenerationJobRequestSchema.parse({
                format: 'document-terms:v1',
                selected: [{ rowIndex: 0, candidate: generationCandidate }],
            }),
        ).toBeDefined();
        expect(() =>
            DictionaryGenerationJobSchema.parse({
                ...job,
                progress: { stage: 'queued', percent: 0 },
            }),
        ).toThrow();
    });
});

const generationCandidate = {
    values: {
        source: 'bank',
        translation: 'el banco',
        transcription: null,
        definition: null,
        example: 'I went to the bank.',
        exampleTranslation: 'Fui al banco.',
    },
    overrides: {
        transcriptionEnabled: null,
        transcriptionNotation: null,
        transcriptionCustomLabel: null,
        definitionEnabled: null,
        definitionLanguage: null,
        exampleEnabled: null,
        exampleLanguage: null,
        exampleTranslationEnabled: null,
    },
} as const;

function generationJob(overrides: Record<string, unknown>) {
    return {
        id: '33333333-3333-4333-8333-333333333333',
        kind: 'single-card',
        format: 'single-card:v1',
        state: 'queued',
        dictionaryId: '44444444-4444-4444-8444-444444444444',
        cardId: CARD_ID_1,
        expectedDictionaryVersion: 4,
        expectedSettingsVersion: 3,
        expectedCardVersion: 2,
        sourceLanguage: 'en',
        targetLanguage: 'es',
        progress: { stage: 'queued', percent: 0 },
        cancellationRequested: false,
        originalSnapshot: {
            ...generationCandidate,
            effectiveSettings: {
                transcriptionEnabled: false,
                transcriptionNotation: 'ipa',
                transcriptionCustomLabel: null,
                definitionEnabled: false,
                definitionLanguage: 'target',
                exampleEnabled: true,
                exampleLanguage: 'source',
                exampleTranslationEnabled: true,
                exampleTranslationLanguage: 'target',
            },
            authorship: 'human',
        },
        proposal: null,
        failure: null,
        outcome: null,
        createdAt: '2026-08-21T12:00:00.000Z',
        updatedAt: '2026-08-21T12:00:00.000Z',
        completedAt: null,
        expiresAt: null,
        ...overrides,
    };
}

function pastedTermsProposal() {
    return {
        candidates: [
            {
                rowIndex: 0,
                input: 'bank',
                candidate: generationCandidate,
                fieldFeedback: [],
            },
        ],
        failures: [
            {
                rowIndex: 1,
                input: 'river bank',
                code: 'generation_failed',
                message: 'Could not generate this row.',
                retryable: true,
            },
        ],
        warnings: [
            {
                rowIndex: 0,
                code: 'duplicate_source',
                message: 'A matching source already exists.',
                duplicateCardId: CARD_ID_2,
            },
        ],
    } as const;
}

function pastedTermsJob(overrides: Record<string, unknown>) {
    return {
        id: '55555555-5555-4555-8555-555555555555',
        kind: 'pasted-terms',
        format: 'pasted-terms:v1',
        state: 'review',
        dictionaryId: '44444444-4444-4444-8444-444444444444',
        expectedDictionaryVersion: 4,
        expectedSettingsVersion: 3,
        sourceLanguage: 'en',
        targetLanguage: 'es',
        progress: { stage: 'review_ready', percent: 100 },
        cancellationRequested: false,
        proposal: pastedTermsProposal(),
        failure: null,
        outcome: null,
        createdAt: '2026-08-21T12:00:00.000Z',
        updatedAt: '2026-08-21T12:00:00.000Z',
        completedAt: null,
        expiresAt: '2026-08-28T12:00:00.000Z',
        ...overrides,
    };
}
