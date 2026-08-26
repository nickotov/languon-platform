import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    dictionaryApi,
    DictionaryApiError,
    resolveDictionaryApiUrl,
} from '@/fsd/entities/dictionary';

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
        status,
    });
}

describe('dictionary API', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    it('uses no-store authenticated owner requests and validates responses', async () => {
        vi.mocked(fetch).mockResolvedValue(
            jsonResponse({ data: [], nextCursor: null }),
        );

        await expect(
            dictionaryApi.listDictionaries('owner-token', {
                lifecycle: 'active',
                limit: 25,
            }),
        ).resolves.toEqual({ data: [], nextCursor: null });

        const [url, init] = vi.mocked(fetch).mock.calls[0]!;
        expect(String(url)).toContain(
            '/dictionaries?lifecycle=active&limit=25',
        );
        expect(init?.cache).toBe('no-store');
        expect(new Headers(init?.headers).get('authorization')).toBe(
            'Bearer owner-token',
        );
    });

    it('keeps the fragment key out of the HTTP URL and forwards it only by header', async () => {
        const shareKey = 's'.repeat(43);
        vi.mocked(fetch).mockResolvedValue(
            jsonResponse(
                {
                    error: {
                        code: 'shared_dictionary_not_found',
                        correlationId: 'test',
                        message: 'Unavailable',
                    },
                },
                404,
            ),
        );

        await expect(
            dictionaryApi.readSharedDictionary('share-locator-1234', shareKey),
        ).rejects.toBeInstanceOf(DictionaryApiError);

        const [url, init] = vi.mocked(fetch).mock.calls[0]!;
        expect(String(url)).toBe(
            'http://localhost:4000/shared/dictionaries/share-locator-1234?limit=25',
        );
        expect(String(url)).not.toContain(shareKey);
        expect(new Headers(init?.headers).get('x-languon-share-key')).toBe(
            shareKey,
        );
        expect(new Headers(init?.headers).get('authorization')).toBeNull();
    });

    it('rejects schema-invalid successful payloads', async () => {
        vi.mocked(fetch).mockResolvedValue(jsonResponse({ data: 'unsafe' }));
        await expect(
            dictionaryApi.listDictionaries('token'),
        ).rejects.toMatchObject({
            status: 502,
            detail: { code: 'service_unavailable' },
        });
    });

    it('uses typed generation capability, discovery, and enqueue boundaries', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(
                jsonResponse({
                    documentOcr: { available: false },
                    documentTermsGeneration: { available: true },
                    importPairsGeneration: { available: true },
                    pastedTermsGeneration: { available: true },
                    singleCardGeneration: { available: true },
                }),
            )
            .mockResolvedValueOnce(jsonResponse({ job: null }))
            .mockResolvedValueOnce(jsonResponse({ job: null }))
            .mockResolvedValueOnce(jsonResponse({ job: null }))
            .mockResolvedValueOnce(jsonResponse({ job: null }));

        await expect(
            dictionaryApi.readGenerationCapabilities('owner-token'),
        ).resolves.toEqual({
            documentOcr: { available: false },
            documentTermsGeneration: { available: true },
            importPairsGeneration: { available: true },
            pastedTermsGeneration: { available: true },
            singleCardGeneration: { available: true },
        });
        await expect(
            dictionaryApi.readLatestCardGeneration(
                'owner-token',
                '10000000-0000-4000-8000-000000000001',
                '20000000-0000-4000-8000-000000000001',
            ),
        ).resolves.toEqual({ job: null });
        await expect(
            dictionaryApi.enqueueCardGeneration(
                'owner-token',
                '10000000-0000-4000-8000-000000000001',
                '20000000-0000-4000-8000-000000000001',
                {
                    expectedCardVersion: 4,
                    expectedDictionaryVersion: 3,
                    expectedSettingsVersion: 2,
                    instruction: '  keep the art context  ',
                },
                'generation-idempotency-key',
            ),
        ).rejects.toMatchObject({ status: 502 });

        expect(
            String(vi.mocked(fetch).mock.calls[0]?.[0]).endsWith(
                '/dictionary-generation-capabilities',
            ),
        ).toBe(true);
        expect(
            String(vi.mocked(fetch).mock.calls[1]?.[0]).endsWith(
                '/dictionaries/10000000-0000-4000-8000-000000000001/cards/20000000-0000-4000-8000-000000000001/generations/latest',
            ),
        ).toBe(true);
        const [enqueueUrl, enqueueInit] = vi.mocked(fetch).mock.calls[2]!;
        expect(
            String(enqueueUrl).endsWith(
                '/dictionaries/10000000-0000-4000-8000-000000000001/cards/20000000-0000-4000-8000-000000000001/generations',
            ),
        ).toBe(true);
        expect(new Headers(enqueueInit?.headers).get('idempotency-key')).toBe(
            'generation-idempotency-key',
        );
        expect(JSON.parse(String(enqueueInit?.body))).toEqual(
            expect.objectContaining({ instruction: 'keep the art context' }),
        );

        await expect(
            dictionaryApi.enqueuePastedTermsGeneration(
                'owner-token',
                '10000000-0000-4000-8000-000000000001',
                {
                    context: '  legal vocabulary  ',
                    expectedDictionaryVersion: 3,
                    expectedSettingsVersion: 2,
                    text: '  term one\nterm two  ',
                },
                'batch-idempotency-key',
            ),
        ).rejects.toMatchObject({ status: 502 });
        const [batchUrl, batchInit] = vi.mocked(fetch).mock.calls[3]!;
        expect(String(batchUrl)).toContain(
            '/dictionaries/10000000-0000-4000-8000-000000000001/batch-generations',
        );
        expect(new Headers(batchInit?.headers).get('idempotency-key')).toBe(
            'batch-idempotency-key',
        );
        expect(JSON.parse(String(batchInit?.body))).toEqual(
            expect.objectContaining({
                context: 'legal vocabulary',
                text: 'term one\nterm two',
            }),
        );

        await expect(
            dictionaryApi.retryPastedTermsGeneration(
                'owner-token',
                '30000000-0000-4000-8000-000000000001',
                {
                    expectedDictionaryVersion: 3,
                    expectedSettingsVersion: 2,
                    rowIndexes: [4, 1],
                },
                'batch-retry-key',
            ),
        ).rejects.toMatchObject({ status: 502 });
        const [retryUrl, retryInit] = vi.mocked(fetch).mock.calls[4]!;
        expect(String(retryUrl)).toContain(
            '/dictionary-generation-jobs/30000000-0000-4000-8000-000000000001/retry-pasted-terms',
        );
        expect(new Headers(retryInit?.headers).get('idempotency-key')).toBe(
            'batch-retry-key',
        );
        expect(JSON.parse(String(retryInit?.body))).toMatchObject({
            rowIndexes: [4, 1],
        });
    });

    it('puts document bytes only to the signed URL with the exact required headers', async () => {
        vi.mocked(fetch).mockResolvedValue(
            new Response(null, {
                headers: { 'x-amz-version-id': 'version-7' },
                status: 200,
            }),
        );
        const file = new Blob(['explicit terms']);

        await expect(
            dictionaryApi.uploadDocument(
                {
                    expiresAt: '2026-08-26T12:00:00.000Z',
                    id: '30000000-0000-4000-8000-000000000001',
                    method: 'PUT',
                    requiredHeaders: {
                        'x-amz-checksum-sha256': 'signed-checksum',
                        'x-product-upload': 'dictionary-document',
                    },
                    url: 'https://private-storage.example.test/signed-upload',
                },
                file,
            ),
        ).resolves.toEqual({ versionId: 'version-7' });

        const [url, init] = vi.mocked(fetch).mock.calls[0]!;
        expect(url).toBe('https://private-storage.example.test/signed-upload');
        expect(init?.method).toBe('PUT');
        expect(init?.body).toBeInstanceOf(ArrayBuffer);
        expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe(
            'explicit terms',
        );
        expect(init?.headers).toEqual({
            'x-amz-checksum-sha256': 'signed-checksum',
            'x-product-upload': 'dictionary-document',
        });
        expect(new Headers(init?.headers).get('authorization')).toBeNull();
    });

    it('uses authoritative import bodies, import retry, and validated raw export headers', async () => {
        vi.mocked(fetch)
            .mockResolvedValueOnce(jsonResponse({ invalid: true }))
            .mockResolvedValueOnce(jsonResponse({ invalid: true }))
            .mockResolvedValueOnce(jsonResponse({ invalid: true }))
            .mockResolvedValueOnce(
                new Response('source\ttranslation\n', {
                    headers: {
                        'cache-control': 'private, no-store',
                        'content-disposition':
                            'attachment; filename="dictionary-quizlet.txt"',
                        'content-type': 'text/plain; charset=utf-8',
                        'referrer-policy': 'no-referrer',
                        'x-content-type-options': 'nosniff',
                    },
                }),
            );
        const request = {
            content: 'source\ttranslation',
            options: {
                delimiter: 'tab' as const,
                hasHeader: false,
                sourceColumnIndex: 0,
                targetColumnIndex: 1,
            },
            target: {
                description: null,
                kind: 'new' as const,
                name: 'Imported terms',
                sourceLanguage: 'en' as const,
                targetLanguage: 'es' as const,
            },
        };

        await expect(
            dictionaryApi.previewImport('owner-token', request),
        ).rejects.toMatchObject({ status: 502 });
        await expect(
            dictionaryApi.importDictionary(
                'owner-token',
                { ...request, enrichment: { mode: 'none' } },
                'import-idempotency-key',
            ),
        ).rejects.toMatchObject({ status: 502 });
        await expect(
            dictionaryApi.retryImportPairsGeneration(
                'owner-token',
                '30000000-0000-4000-8000-000000000001',
                {
                    expectedDictionaryVersion: 1,
                    expectedSettingsVersion: 1,
                    rowIndexes: [0],
                },
                'import-retry-key',
            ),
        ).rejects.toMatchObject({ status: 502 });
        const exported = await dictionaryApi.exportDictionary(
            'owner-token',
            '10000000-0000-4000-8000-000000000001',
            'quizlet-text',
        );

        expect(exported.filename).toBe('dictionary-quizlet.txt');
        expect(await exported.response.text()).toBe('source\ttranslation\n');
        expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain(
            '/dictionary-imports/preview',
        );
        expect(String(vi.mocked(fetch).mock.calls[1]?.[0])).toContain(
            '/dictionary-imports',
        );
        expect(
            new Headers(vi.mocked(fetch).mock.calls[1]?.[1]?.headers).get(
                'idempotency-key',
            ),
        ).toBe('import-idempotency-key');
        expect(String(vi.mocked(fetch).mock.calls[2]?.[0])).toContain(
            '/retry-import-pairs',
        );
        expect(String(vi.mocked(fetch).mock.calls[3]?.[0])).toContain(
            '/export?format=quizlet-text',
        );
    });

    it('cancels a successful export stream with invalid headers', async () => {
        const cancel = vi.fn();
        vi.mocked(fetch).mockResolvedValueOnce(
            new Response(
                new ReadableStream({
                    cancel,
                    start(controller) {
                        controller.enqueue(new TextEncoder().encode('data'));
                    },
                }),
                { headers: { 'content-type': 'text/csv; charset=utf-8' } },
            ),
        );

        await expect(
            dictionaryApi.exportDictionary(
                'owner-token',
                '10000000-0000-4000-8000-000000000001',
                'quizlet-csv',
            ),
        ).rejects.toMatchObject({
            detail: { correlationId: 'invalid-export-headers' },
        });
        expect(cancel).toHaveBeenCalledWith('invalid_export_headers');
    });

    it('lets authenticated completion reconcile an ambiguously committed upload', async () => {
        vi.mocked(fetch)
            .mockRejectedValueOnce(new TypeError('response lost'))
            .mockResolvedValueOnce(jsonResponse({ job: null }, 502));
        const upload = {
            expiresAt: '2026-08-26T12:00:00.000Z',
            id: '30000000-0000-4000-8000-000000000001',
            method: 'PUT' as const,
            requiredHeaders: {
                'content-type': 'text/plain',
                'if-none-match': '*',
            },
            url: 'https://private-storage.example.test/signed-upload',
        };

        const completion = await dictionaryApi.uploadDocument(
            upload,
            new Blob(['explicit terms']),
        );
        expect(completion).toEqual({});
        await expect(
            dictionaryApi.completeDocumentUpload(
                'owner-token',
                upload.id,
                completion,
            ),
        ).rejects.toMatchObject({ status: 502 });
        expect(
            JSON.parse(String(vi.mocked(fetch).mock.calls[1]![1]?.body)),
        ).toEqual({});
    });

    it('authorizes document upload with a payload-bound idempotency key', async () => {
        vi.mocked(fetch).mockResolvedValue(jsonResponse({ job: null }));

        await expect(
            dictionaryApi.createDocumentUpload(
                'owner-token',
                '10000000-0000-4000-8000-000000000001',
                {
                    expectedDictionaryVersion: 3,
                    expectedSettingsVersion: 2,
                    instruction: '  legal context  ',
                    mediaType: 'text/plain',
                    sha256: 'a'.repeat(64),
                    sizeBytes: 42,
                },
                'document-upload-idempotency-key',
            ),
        ).rejects.toMatchObject({ status: 502 });

        const [url, init] = vi.mocked(fetch).mock.calls[0]!;
        expect(String(url)).toContain(
            '/dictionaries/10000000-0000-4000-8000-000000000001/document-uploads',
        );
        expect(new Headers(init?.headers).get('idempotency-key')).toBe(
            'document-upload-idempotency-key',
        );
        expect(JSON.parse(String(init?.body))).toEqual({
            expectedDictionaryVersion: 3,
            expectedSettingsVersion: 2,
            instruction: 'legal context',
            mediaType: 'text/plain',
            sha256: 'a'.repeat(64),
            sizeBytes: 42,
        });
    });

    it('retries selected document failures through the dedicated successor endpoint', async () => {
        vi.mocked(fetch).mockResolvedValue(jsonResponse({ job: null }));

        await expect(
            dictionaryApi.retryDocumentTermsGeneration(
                'owner-token',
                '30000000-0000-4000-8000-000000000001',
                {
                    expectedDictionaryVersion: 3,
                    expectedSettingsVersion: 2,
                    rowIndexes: [4, 1],
                },
                'document-retry-key',
            ),
        ).rejects.toMatchObject({ status: 502 });
        const [url, init] = vi.mocked(fetch).mock.calls[0]!;
        expect(String(url)).toContain(
            '/dictionary-generation-jobs/30000000-0000-4000-8000-000000000001/retry-document-terms',
        );
        expect(new Headers(init?.headers).get('idempotency-key')).toBe(
            'document-retry-key',
        );
        expect(JSON.parse(String(init?.body))).toMatchObject({
            rowIndexes: [4, 1],
        });
    });

    it('resolves the production proxy and trims configured URLs', () => {
        expect(resolveDictionaryApiUrl('production', undefined)).toBe('/api');
        expect(
            resolveDictionaryApiUrl('development', 'https://api.test/'),
        ).toBe('https://api.test');
    });
});
