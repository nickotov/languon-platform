import { describe, expect, it, vi } from 'vitest';

import { DictionaryGenerationService } from '../../../../../src/modules/dictionaries/application/dictionary-generation-service';
import { isDictionaryGenerationFailureRetryable } from '../../../../../src/modules/dictionaries/application/dictionary-errors';
import {
    dictionaryGenerationFormat,
    dictionaryImportPairsGenerationFormat,
    dictionaryPastedTermsGenerationFormat,
} from '../../../../../src/modules/dictionaries/domain/generation';

const requestContext = {
    clientAddress: '127.0.0.1',
    signal: new AbortController().signal,
};

describe('DictionaryGenerationService batch dispatch', () => {
    it('classifies only transient provider and OCR failures as publicly retryable', () => {
        for (const code of [
            'provider_unavailable',
            'provider_timeout',
            'provider_rate_limited',
            'ocr_failed',
        ] as const)
            expect(isDictionaryGenerationFailureRetryable(code)).toBe(true);
        for (const code of [
            'malware_detected',
            'invalid_document',
            'too_many_terms',
            'no_terms_found',
            'extraction_failed',
            'unsupported_document',
            'invalid_model_output',
            'retry_exhausted',
            'internal_error',
            'scan_failed',
            'cleanup_failed',
        ] as const)
            expect(isDictionaryGenerationFailureRetryable(code)).toBe(false);
    });

    it('retries selected document proposal failures as a pasted successor', async () => {
        const enqueueDocumentFailureRetry = vi.fn(async () => ({
            id: 'successor-id',
        }));
        const read = vi.fn(async () => ({
            dictionaryId: 'dictionary-id',
            format: 'document-terms:v1' as const,
            kind: 'document-terms' as const,
        }));
        const service = new DictionaryGenerationService({
            authentication: {
                authenticate: async () => ({
                    sessionId: 'session-id',
                    userId: 'owner-id',
                }),
            },
            capabilities: {
                acceptableFormats: [],
                cancellableFormats: [],
                discardableFormats: [],
                enqueuedFormats: [dictionaryPastedTermsGenerationFormat],
                readableFormats: ['document-terms:v1'],
            },
            clock: { now: () => new Date('2026-08-25T12:00:00.000Z') },
            cryptography: {
                fingerprint: (value: unknown) => JSON.stringify(value),
            } as never,
            rateLimiter: { consume: async () => ({ allowed: true }) },
            store: { enqueueDocumentFailureRetry, read } as never,
        });

        await service.retryDocumentTerms(
            'token',
            'retry-key',
            'document-job-id',
            {
                expectedDictionaryVersion: 4,
                expectedSettingsVersion: 2,
                rowIndexes: [8, 2],
            },
            requestContext,
        );

        expect(enqueueDocumentFailureRetry).toHaveBeenCalledWith(
            expect.objectContaining({
                dictionaryId: 'dictionary-id',
                predecessorJobId: 'document-job-id',
                rowIndexes: [2, 8],
            }),
        );
    });

    it('retries persisted failure rows through a server-owned predecessor', async () => {
        const enqueuePastedTerms = vi.fn(async () => ({ id: 'successor-id' }));
        const read = vi.fn(async () => ({
            dictionaryId: 'dictionary-id',
            format: dictionaryPastedTermsGenerationFormat,
            kind: 'pasted-terms' as const,
        }));
        const service = new DictionaryGenerationService({
            authentication: {
                authenticate: async () => ({
                    sessionId: 'session-id',
                    userId: 'owner-id',
                }),
            },
            capabilities: {
                acceptableFormats: [dictionaryPastedTermsGenerationFormat],
                cancellableFormats: [dictionaryPastedTermsGenerationFormat],
                discardableFormats: [dictionaryPastedTermsGenerationFormat],
                enqueuedFormats: [dictionaryPastedTermsGenerationFormat],
                readableFormats: [dictionaryPastedTermsGenerationFormat],
            },
            clock: { now: () => new Date('2026-08-25T12:00:00.000Z') },
            cryptography: {
                fingerprint: (value: unknown) => JSON.stringify(value),
            } as never,
            rateLimiter: { consume: async () => ({ allowed: true }) },
            store: { enqueuePastedTerms, read } as never,
        });

        await service.retryPastedTerms(
            'token',
            'retry-key',
            'prior-job-id',
            {
                expectedDictionaryVersion: 4,
                expectedSettingsVersion: 2,
                rowIndexes: [3, 1],
            },
            requestContext,
        );

        expect(enqueuePastedTerms).toHaveBeenCalledWith(
            expect.objectContaining({
                dictionaryId: 'dictionary-id',
                idempotencyKey: 'retry-key',
                retry: { jobId: 'prior-job-id', rowIndexes: [1, 3] },
            }),
        );
    });

    it('retries import-pairs failures without downgrading trusted pairs to pasted text', async () => {
        const enqueueImportPairsRetry = vi.fn(async () => ({
            id: 'successor-id',
        }));
        const read = vi.fn(async () => ({
            dictionaryId: 'dictionary-id',
            format: dictionaryImportPairsGenerationFormat,
            kind: 'import-pairs' as const,
        }));
        const service = new DictionaryGenerationService({
            authentication: {
                authenticate: async () => ({
                    sessionId: 'session-id',
                    userId: 'owner-id',
                }),
            },
            capabilities: {
                acceptableFormats: [dictionaryImportPairsGenerationFormat],
                cancellableFormats: [dictionaryImportPairsGenerationFormat],
                discardableFormats: [dictionaryImportPairsGenerationFormat],
                enqueuedFormats: [dictionaryImportPairsGenerationFormat],
                readableFormats: [dictionaryImportPairsGenerationFormat],
            },
            clock: { now: () => new Date('2026-08-26T12:00:00.000Z') },
            cryptography: {
                fingerprint: (value: unknown) => JSON.stringify(value),
            } as never,
            rateLimiter: { consume: async () => ({ allowed: true }) },
            store: { enqueueImportPairsRetry, read } as never,
        });

        await service.retryImportPairs(
            'token',
            'import-retry-key',
            'import-job-id',
            {
                expectedDictionaryVersion: 4,
                expectedSettingsVersion: 2,
                rowIndexes: [9, 3],
            },
            requestContext,
        );

        expect(enqueueImportPairsRetry).toHaveBeenCalledWith(
            expect.objectContaining({
                predecessorJobId: 'import-job-id',
                rowIndexes: [3, 9],
            }),
        );
    });

    it('reports pasted-term capability and enqueues a dictionary-scoped job', async () => {
        const enqueuePastedTerms = vi.fn(async () => ({ id: 'job-id' }));
        const service = new DictionaryGenerationService({
            authentication: {
                authenticate: async () => ({
                    sessionId: 'session-id',
                    userId: 'owner-id',
                }),
            },
            capabilities: {
                acceptableFormats: [dictionaryPastedTermsGenerationFormat],
                cancellableFormats: [dictionaryPastedTermsGenerationFormat],
                discardableFormats: [dictionaryPastedTermsGenerationFormat],
                enqueuedFormats: [dictionaryPastedTermsGenerationFormat],
                readableFormats: [dictionaryPastedTermsGenerationFormat],
            },
            clock: { now: () => new Date('2026-08-25T12:00:00.000Z') },
            cryptography: {
                fingerprint: (value: unknown) => JSON.stringify(value),
            } as never,
            rateLimiter: { consume: async () => ({ allowed: true }) },
            store: { enqueuePastedTerms } as never,
        });

        await expect(
            service.capabilities('token', requestContext),
        ).resolves.toEqual({
            documentOcr: { available: false },
            documentTermsGeneration: { available: false },
            importPairsGeneration: { available: false },
            pastedTermsGeneration: { available: true },
            singleCardGeneration: { available: false },
        });
        await service.enqueuePastedTerms(
            'token',
            'batch-idempotency-key',
            'dictionary-id',
            {
                context: 'Art vocabulary',
                expectedDictionaryVersion: 3,
                expectedSettingsVersion: 2,
                text: 'canvas\npaint',
            },
            requestContext,
        );
        expect(enqueuePastedTerms).toHaveBeenCalledWith(
            expect.objectContaining({
                dictionaryId: 'dictionary-id',
                expectedDictionaryVersion: 3,
                expectedSettingsVersion: 2,
                idempotencyKey: 'batch-idempotency-key',
                ownerId: 'owner-id',
                sharedContext: 'Art vocabulary',
                text: 'canvas\npaint',
            }),
        );
    });

    it('normalizes pasted-term selection order before fingerprinting and dispatch', async () => {
        const selected: Array<{ candidate: never; rowIndex: number }> = [];
        const acceptBatch = vi.fn(async (input) => {
            selected.push(...input.selected);
            return { job: {}, outcome: {} };
        });
        const candidate = {
            overrides: {
                definitionEnabled: null,
                definitionLanguage: null,
                exampleEnabled: null,
                exampleLanguage: null,
                exampleTranslationEnabled: null,
                transcriptionCustomLabel: null,
                transcriptionEnabled: null,
                transcriptionNotation: null,
            },
            values: {
                definition: null,
                example: null,
                exampleTranslation: null,
                source: 'canvas',
                transcription: null,
                translation: 'toile',
            },
        };
        const service = new DictionaryGenerationService({
            authentication: {
                authenticate: async () => ({
                    sessionId: 'session-id',
                    userId: 'owner-id',
                }),
            },
            capabilities: {
                acceptableFormats: [dictionaryPastedTermsGenerationFormat],
                cancellableFormats: [],
                discardableFormats: [],
                enqueuedFormats: [],
                readableFormats: [dictionaryPastedTermsGenerationFormat],
            },
            clock: { now: () => new Date('2026-08-25T12:00:00.000Z') },
            cryptography: {
                fingerprint: (value: unknown) => JSON.stringify(value),
            } as never,
            rateLimiter: { consume: async () => ({ allowed: true }) },
            store: {
                acceptBatch,
                read: async () => ({
                    format: dictionaryPastedTermsGenerationFormat,
                    kind: 'pasted-terms',
                }),
            } as never,
        });

        await service.accept(
            'token',
            'job-id',
            {
                format: dictionaryPastedTermsGenerationFormat,
                selected: [
                    { candidate, rowIndex: 8 },
                    { candidate, rowIndex: 2 },
                ],
            },
            requestContext,
        );
        expect(selected.map((row) => row.rowIndex)).toEqual([2, 8]);
        expect(acceptBatch).toHaveBeenCalledWith(
            expect.objectContaining({
                acceptanceFingerprint: JSON.stringify({
                    format: dictionaryPastedTermsGenerationFormat,
                    selected: [
                        { candidate, rowIndex: 2 },
                        { candidate, rowIndex: 8 },
                    ],
                }),
            }),
        );
    });

    it('keeps regeneration restricted to single-card jobs', async () => {
        expect(dictionaryGenerationFormat).toBe('single-card:v1');
    });
});
