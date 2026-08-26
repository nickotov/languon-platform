import { describe, expect, it, vi } from 'vitest';

import { DictionaryService } from '../../../../../src/modules/dictionaries/application/dictionary-service';
import {
    DictionaryGenerationNotAvailableError,
    DictionaryRateLimitError,
    InvalidDictionaryRequestError,
    SharedDictionaryNotFoundError,
} from '../../../../../src/modules/dictionaries/application/dictionary-errors';

const signal = new AbortController().signal;
const requestContext = { clientAddress: '192.0.2.10', signal };

describe('DictionaryService', () => {
    it('requires a verified active principal and applies the owner limiter before storage', async () => {
        const authenticate = vi
            .fn()
            .mockResolvedValue({ sessionId: 'session', userId: 'owner' });
        const consume = vi.fn().mockResolvedValue({ allowed: true });
        const listDictionaries = vi
            .fn()
            .mockResolvedValue({ data: [], nextCursor: null });
        const service = new DictionaryService({
            authentication: { authenticate },
            clock: { now: () => new Date('2026-08-21T00:00:00.000Z') },
            cryptography: {} as never,
            rateLimiter: { consume },
            store: { listDictionaries } as never,
        });

        await service.listDictionaries(
            'access.token.value',
            { lifecycle: 'active', limit: 25 },
            requestContext,
        );

        expect(authenticate).toHaveBeenCalledWith('access.token.value');
        expect(consume).toHaveBeenCalledWith({
            key: 'owner',
            scope: 'owner',
            signal,
        });
        expect(listDictionaries).toHaveBeenCalledWith(
            expect.objectContaining({ ownerId: 'owner' }),
        );
    });

    it('stops owner work at the bounded limiter and preserves retry metadata', async () => {
        const service = new DictionaryService({
            authentication: {
                authenticate: vi.fn().mockResolvedValue({
                    sessionId: 'session',
                    userId: 'owner',
                }),
            },
            clock: { now: () => new Date() },
            cryptography: {} as never,
            rateLimiter: {
                consume: vi.fn().mockResolvedValue({
                    allowed: false,
                    retryAfterSeconds: 17,
                }),
            },
            store: { listDictionaries: vi.fn() } as never,
        });
        await expect(
            service.listDictionaries(
                'access.token.value',
                { lifecycle: 'active', limit: 25 },
                requestContext,
            ),
        ).rejects.toMatchObject({ retryAfterSeconds: 17 });
        await expect(
            service.listDictionaries(
                'access.token.value',
                { lifecycle: 'active', limit: 25 },
                requestContext,
            ),
        ).rejects.toBeInstanceOf(DictionaryRateLimitError);
    });

    it('rate-limits import previews by owner and globally and caps active work', async () => {
        let release!: () => void;
        const blocked = new Promise<void>((resolve) => {
            release = resolve;
        });
        const consume = vi.fn().mockResolvedValue({ allowed: true });
        const authorizeDictionaryImportTarget = vi
            .fn()
            .mockImplementation(() => blocked);
        const service = new DictionaryService({
            authentication: {
                authenticate: vi.fn().mockResolvedValue({
                    sessionId: 'session',
                    userId: 'owner',
                }),
            },
            clock: { now: () => new Date() },
            cryptography: {} as never,
            rateLimiter: { consume },
            store: {
                authorizeDictionaryImportTarget,
                previewDictionaryImport: vi.fn().mockResolvedValue({
                    remainingRows: 10,
                    warnings: [],
                }),
            } as never,
        });
        const request = {
            content: 'bank\tbanco',
            options: {
                delimiter: 'tab' as const,
                hasHeader: false,
                sourceColumnIndex: 0,
                targetColumnIndex: 1,
            },
            target: {
                description: null,
                kind: 'new' as const,
                name: 'Imported',
                sourceLanguage: 'en' as const,
                targetLanguage: 'es' as const,
            },
        };
        const pending = Array.from({ length: 4 }, () =>
            service.previewDictionaryImport(
                'access.token.value',
                request,
                requestContext,
            ),
        );
        await vi.waitFor(() =>
            expect(authorizeDictionaryImportTarget).toHaveBeenCalledTimes(4),
        );

        await expect(
            service.previewDictionaryImport(
                'access.token.value',
                request,
                requestContext,
            ),
        ).rejects.toMatchObject({ retryAfterSeconds: 1 });
        expect(consume).toHaveBeenCalledWith({
            key: 'owner',
            scope: 'import-preview-owner',
            signal,
        });
        expect(consume).toHaveBeenCalledWith({
            key: 'global',
            scope: 'import-preview-global',
            signal,
        });

        release();
        await Promise.all(pending);
    });

    it('uses one non-enumerating shared-not-found result for missing and wrong keys', async () => {
        const verifyShare = vi.fn().mockReturnValue(false);
        const service = new DictionaryService({
            authentication: {} as never,
            clock: { now: () => new Date() },
            cryptography: {
                fingerprint: vi.fn().mockReturnValue('share-rate-key'),
                verifyShare,
            } as never,
            rateLimiter: {
                consume: vi.fn().mockResolvedValue({ allowed: true }),
            },
            store: {
                findSharedCandidate: vi.fn().mockResolvedValue(null),
            } as never,
        });
        await expect(
            service.readShared(
                'opaque-share-id-1234',
                'wrong-key',
                { limit: 25 },
                requestContext,
            ),
        ).rejects.toBeInstanceOf(SharedDictionaryNotFoundError);
        expect(verifyShare).toHaveBeenCalledWith('wrong-key', null);
    });

    it('charges random public locators from one client to the same bounded subject', async () => {
        const consume = vi.fn().mockResolvedValue({ allowed: true });
        const service = new DictionaryService({
            authentication: {} as never,
            clock: { now: () => new Date() },
            cryptography: {
                fingerprint: vi.fn().mockReturnValue('share-rate-key'),
                verifyShare: vi.fn().mockReturnValue(false),
            } as never,
            rateLimiter: { consume },
            store: {
                findSharedCandidate: vi.fn().mockResolvedValue(null),
            } as never,
        });
        await expect(
            service.readShared(
                'random-share-id-one',
                'wrong-key',
                { limit: 25 },
                requestContext,
            ),
        ).rejects.toBeInstanceOf(SharedDictionaryNotFoundError);
        await expect(
            service.readShared(
                'random-share-id-two',
                'wrong-key',
                { limit: 25 },
                requestContext,
            ),
        ).rejects.toBeInstanceOf(SharedDictionaryNotFoundError);
        expect(consume).toHaveBeenNthCalledWith(1, {
            key: '192.0.2.10',
            scope: 'public',
            signal,
        });
        expect(consume).toHaveBeenNthCalledWith(2, {
            key: 'share-rate-key',
            scope: 'shared-read',
            signal,
        });
        expect(consume).toHaveBeenNthCalledWith(3, {
            key: '192.0.2.10',
            scope: 'public',
            signal,
        });
        expect(consume).toHaveBeenNthCalledWith(4, {
            key: 'share-rate-key',
            scope: 'shared-read',
            signal,
        });
    });

    it('honors an already-aborted request before authentication or storage', async () => {
        const controller = new AbortController();
        controller.abort(new Error('cancelled'));
        const authenticate = vi.fn();
        const service = new DictionaryService({
            authentication: { authenticate },
            clock: { now: () => new Date() },
            cryptography: {} as never,
            rateLimiter: {} as never,
            store: {} as never,
        });
        await expect(
            service.listDictionaries(
                'access.token.value',
                { lifecycle: 'active', limit: 25 },
                { clientAddress: '192.0.2.10', signal: controller.signal },
            ),
        ).rejects.toThrow('cancelled');
        expect(authenticate).not.toHaveBeenCalled();
    });

    it('reparses deterministic imports and commits every valid row in source order', async () => {
        const authorizeDictionaryImportTarget = vi.fn();
        const importDictionary = vi.fn().mockResolvedValue({
            cards: [],
            dictionary: {},
            mode: 'deterministic',
            warnings: [],
        });
        const service = new DictionaryService({
            authentication: {
                authenticate: vi.fn().mockResolvedValue({
                    sessionId: 'session',
                    userId: 'owner',
                }),
            },
            clock: { now: () => new Date('2026-08-26T00:00:00.000Z') },
            cryptography: {
                fingerprint: vi
                    .fn()
                    .mockReturnValue(`hmac-sha256:v1:${'A'.repeat(43)}`),
            } as never,
            rateLimiter: {
                consume: vi.fn().mockResolvedValue({ allowed: true }),
            },
            store: {
                authorizeDictionaryImportTarget,
                importDictionary,
            } as never,
        });
        const request = {
            content: 'bank\tbanco\nmissing-column',
            enrichment: { mode: 'none' as const },
            options: {
                delimiter: 'tab' as const,
                hasHeader: false,
                sourceColumnIndex: 0,
                targetColumnIndex: 1,
            },
            target: {
                description: null,
                kind: 'new' as const,
                name: 'Imported',
                sourceLanguage: 'en' as const,
                targetLanguage: 'es' as const,
            },
        };

        await service.importDictionary(
            'access.token.value',
            'import-idempotency-key',
            request,
            requestContext,
        );

        expect(importDictionary).toHaveBeenCalledWith(
            expect.objectContaining({
                idempotencyKey: 'import-idempotency-key',
                ownerId: 'owner',
                rows: [{ rowIndex: 0, source: 'bank', translation: 'banco' }],
                target: request.target,
            }),
        );
        expect(authorizeDictionaryImportTarget).toHaveBeenCalledWith(
            expect.objectContaining({ requireExpectedVersions: false }),
        );
    });

    it('rejects AI selections that do not resolve to a valid reparsed row', async () => {
        const enqueueImportPairs = vi.fn();
        const service = new DictionaryService({
            authentication: {
                authenticate: vi.fn().mockResolvedValue({
                    sessionId: 'session',
                    userId: 'owner',
                }),
            },
            clock: { now: () => new Date('2026-08-26T00:00:00.000Z') },
            cryptography: {
                fingerprint: vi
                    .fn()
                    .mockReturnValue(`hmac-sha256:v1:${'A'.repeat(43)}`),
            } as never,
            generationStore: { enqueueImportPairs },
            rateLimiter: {
                consume: vi.fn().mockResolvedValue({ allowed: true }),
            },
            store: { authorizeDictionaryImportTarget: vi.fn() } as never,
        });

        await expect(
            service.importDictionary(
                'access.token.value',
                'import-ai-idempotency-key',
                {
                    content: 'bank\tbanco',
                    enrichment: {
                        instruction: null,
                        mode: 'ai',
                        selectedRowIndexes: [1],
                    },
                    options: {
                        delimiter: 'tab',
                        hasHeader: false,
                        sourceColumnIndex: 0,
                        targetColumnIndex: 1,
                    },
                    target: {
                        description: null,
                        kind: 'new',
                        name: 'Imported',
                        sourceLanguage: 'en',
                        targetLanguage: 'es',
                    },
                },
                requestContext,
            ),
        ).rejects.toBeInstanceOf(InvalidDictionaryRequestError);
        expect(enqueueImportPairs).not.toHaveBeenCalled();
    });

    it('reports AI import as generation-unavailable when the format is not composed', async () => {
        const service = new DictionaryService({
            authentication: {
                authenticate: vi.fn().mockResolvedValue({
                    sessionId: 'session',
                    userId: 'owner',
                }),
            },
            clock: { now: () => new Date('2026-08-26T00:00:00.000Z') },
            cryptography: {} as never,
            rateLimiter: {
                consume: vi.fn().mockResolvedValue({ allowed: true }),
            },
            store: { authorizeDictionaryImportTarget: vi.fn() } as never,
        });

        await expect(
            service.importDictionary(
                'access.token.value',
                'import-ai-unavailable-key',
                {
                    content: 'bank\tbanco',
                    enrichment: {
                        instruction: null,
                        mode: 'ai',
                        selectedRowIndexes: [0],
                    },
                    options: {
                        delimiter: 'tab',
                        hasHeader: false,
                        sourceColumnIndex: 0,
                        targetColumnIndex: 1,
                    },
                    target: {
                        description: null,
                        kind: 'new',
                        name: 'Imported',
                        sourceLanguage: 'en',
                        targetLanguage: 'es',
                    },
                },
                requestContext,
            ),
        ).rejects.toBeInstanceOf(DictionaryGenerationNotAvailableError);
    });

    it('streams a bounded full export with metadata even when there are no cards', async () => {
        const timeout = vi.spyOn(AbortSignal, 'timeout');
        const service = new DictionaryService({
            authentication: {
                authenticate: vi.fn().mockResolvedValue({
                    sessionId: 'session',
                    userId: 'owner',
                }),
            },
            clock: { now: () => new Date('2026-08-26T00:00:00.000Z') },
            cryptography: {} as never,
            rateLimiter: {
                consume: vi.fn().mockResolvedValue({ allowed: true }),
            },
            store: {
                streamDictionaryExport: async ({
                    onMetadata,
                }: {
                    onMetadata(metadata: unknown): Promise<void>;
                }) => {
                    await onMetadata({
                        dictionary: {
                            description: 'Empty export',
                            name: 'Starter',
                            settings: {
                                definitionEnabled: false,
                                definitionLanguage: 'source',
                                exampleEnabled: true,
                                exampleLanguage: 'source',
                                exampleTranslationEnabled: true,
                                transcriptionCustomLabel: null,
                                transcriptionEnabled: false,
                                transcriptionNotation: 'ipa',
                            },
                            sourceLanguage: 'en',
                            targetLanguage: 'es',
                        },
                        format: 'languon-csv:v1',
                    });
                },
            } as never,
        });

        const exported = await service.exportDictionary(
            'access.token.value',
            '7ceab60b-7416-4296-91e4-0e4a1cd35dd2',
            'languon-csv:v1',
            requestContext,
        );
        const content = await new Response(exported.body).text();

        expect(content).toContain('record_type,languon_format_version');
        expect(content).toContain('dictionary,languon-csv:v1');
        expect(exported.headers['content-disposition']).toContain(
            'dictionary-7ceab60b-7416-4296-91e4-0e4a1cd35dd2.csv',
        );
        expect(timeout).toHaveBeenCalledWith(15 * 60_000);
        timeout.mockRestore();
    });
});
