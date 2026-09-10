import {
    AcceptDictionaryGenerationJobRequestSchema,
    AcceptDictionaryGenerationJobResponseSchema,
    EnqueueDictionaryCardAuthoringGenerationRequestSchema,
    EnqueueDictionaryCardAuthoringGenerationResponseSchema,
    CancelDictionaryGenerationJobRequestSchema,
    CancelDictionaryGenerationJobResponseSchema,
    CompleteDictionaryDocumentUploadRequestSchema,
    CompleteDictionaryDocumentUploadResponseSchema,
    CreateDictionaryCardRequestSchema,
    CreateDictionaryDocumentUploadRequestSchema,
    CreateDictionaryDocumentUploadResponseSchema,
    CreateDictionaryRequestSchema,
    DictionaryCardLifecycleMutationRequestSchema,
    DictionaryCardResponseSchema,
    DictionaryErrorResponseSchema,
    DictionaryLifecycleMutationRequestSchema,
    DictionaryGenerationJobIdParamsSchema,
    DictionaryGenerationJobResponseSchema,
    DictionaryDocumentUploadIdParamsSchema,
    DictionaryResponseSchema,
    DictionaryShareKeyHeadersSchema,
    DiscardDictionaryGenerationJobRequestSchema,
    DiscardDictionaryGenerationJobResponseSchema,
    EnqueueDictionaryCardGenerationRequestSchema,
    EnqueueDictionaryCardGenerationResponseSchema,
    EnqueueDictionaryPastedTermsGenerationRequestSchema,
    EnqueueDictionaryPastedTermsGenerationResponseSchema,
    ExportDictionaryQuerySchema,
    ExportDictionaryResponseHeadersSchema,
    ForkSharedDictionaryRequestSchema,
    ForkSharedDictionaryResponseSchema,
    ImportDictionaryRequestSchema,
    ImportDictionaryResponseSchema,
    LanguagesResponseSchema,
    ListDictionariesResponseSchema,
    ListDictionaryCardsResponseSchema,
    ListSharedDictionaryQuerySchema,
    ReorderDictionaryCardsRequestSchema,
    ReorderDictionaryCardsResponseSchema,
    ReadLatestDictionaryCardGenerationResponseSchema,
    ReadDictionaryGenerationCapabilitiesResponseSchema,
    PreviewDictionaryImportRequestSchema,
    PreviewDictionaryImportResponseSchema,
    RegenerateDictionaryGenerationJobRequestSchema,
    RegenerateDictionaryGenerationJobResponseSchema,
    RegenerateDictionaryCardAuthoringGenerationRequestSchema,
    RegenerateDictionaryCardAuthoringGenerationResponseSchema,
    RotateDictionaryShareKeyRequestSchema,
    RotateDictionaryShareKeyResponseSchema,
    RetryDictionaryDocumentTermsGenerationRequestSchema,
    RetryDictionaryDocumentTermsGenerationResponseSchema,
    RetryDictionaryImportPairsGenerationRequestSchema,
    RetryDictionaryImportPairsGenerationResponseSchema,
    RetryDictionaryPastedTermsGenerationRequestSchema,
    RetryDictionaryPastedTermsGenerationResponseSchema,
    SharedDictionaryResponseSchema,
    SharedDictionaryParamsSchema,
    UpdateDictionaryCardRequestSchema,
    UpdateDictionaryRequestSchema,
    type CreateDictionaryCardRequest,
    type CreateDictionaryRequest,
    type AcceptDictionaryGenerationJobRequest,
    type CancelDictionaryGenerationJobRequest,
    type CompleteDictionaryDocumentUploadRequest,
    type DictionaryCardLifecycleMutationRequest,
    type CreateDictionaryDocumentUploadRequest,
    type CreateDictionaryDocumentUploadResponse,
    type DictionaryErrorResponse,
    type DictionaryLifecycle,
    type DictionaryLifecycleMutationRequest,
    type DiscardDictionaryGenerationJobRequest,
    type EnqueueDictionaryCardGenerationRequest,
    type EnqueueDictionaryCardAuthoringGenerationRequest,
    type EnqueueDictionaryPastedTermsGenerationRequest,
    type DictionaryExportFormat,
    type ForkSharedDictionaryRequest,
    type ImportDictionaryRequest,
    type PreviewDictionaryImportRequest,
    type ListDictionariesQuery,
    type ListDictionaryCardsQuery,
    type ListSharedDictionaryQuery,
    type ReorderDictionaryCardsRequest,
    type RegenerateDictionaryGenerationJobRequest,
    type RegenerateDictionaryCardAuthoringGenerationRequest,
    type RotateDictionaryShareKeyRequest,
    type RetryDictionaryDocumentTermsGenerationRequest,
    type RetryDictionaryImportPairsGenerationRequest,
    type RetryDictionaryPastedTermsGenerationRequest,
    type UpdateDictionaryCardRequest,
    type UpdateDictionaryRequest,
} from '@languon/contracts';

type ResponseSchema<T> = { parse(value: unknown): T };

export type RequestWithSession = <T>(
    operation: (accessToken: string) => Promise<T>,
) => Promise<T>;

export class DictionaryApiError extends Error {
    public override readonly name = 'DictionaryApiError';

    public constructor(
        public readonly status: number,
        public readonly detail: DictionaryErrorResponse['error'],
    ) {
        super(detail.message);
    }
}

export class DictionaryDocumentUploadError extends Error {
    public override readonly name = 'DictionaryDocumentUploadError';
}

export function resolveDictionaryApiUrl(
    nodeEnvironment: string | undefined,
    configuredUrl: string | undefined,
): string {
    return (
        configuredUrl ??
        (nodeEnvironment === 'production' ? '/api' : 'http://localhost:4000')
    ).replace(/\/$/, '');
}

const apiUrl = resolveDictionaryApiUrl(
    process.env.NODE_ENV,
    process.env.NEXT_PUBLIC_API_URL,
);

function queryString(values: Record<string, number | string | undefined>) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
        if (value !== undefined && value !== '') query.set(key, String(value));
    }
    const serialized = query.toString();
    return serialized ? `?${serialized}` : '';
}

async function request<TBody, TResponse>(
    path: string,
    options: {
        accessToken?: string | undefined;
        body?: TBody | undefined;
        bodySchema?: { parse(value: unknown): TBody } | undefined;
        headers?: Record<string, string> | undefined;
        method?: 'GET' | 'PATCH' | 'POST' | undefined;
        responseSchema: ResponseSchema<TResponse>;
        signal?: AbortSignal | undefined;
    },
): Promise<TResponse> {
    const body = options.bodySchema?.parse(options.body);
    let response: Response;
    try {
        response = await fetch(`${apiUrl}${path}`, {
            cache: 'no-store',
            credentials: 'include',
            headers: {
                Accept: 'application/json',
                ...(body === undefined
                    ? {}
                    : { 'Content-Type': 'application/json' }),
                ...(options.accessToken
                    ? { Authorization: `Bearer ${options.accessToken}` }
                    : {}),
                ...options.headers,
            },
            method: options.method ?? 'GET',
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
            ...(options.signal ? { signal: options.signal } : {}),
        });
    } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') {
            throw cause;
        }
        throw new DictionaryApiError(0, {
            code: 'service_unavailable',
            correlationId: 'client-network-error',
            message: 'Dictionaries are temporarily unavailable.',
        });
    }

    const payload = await readJson(response);
    if (!response.ok) {
        const error = DictionaryErrorResponseSchema.safeParse(payload);
        throw new DictionaryApiError(
            response.status,
            error.success
                ? error.data.error
                : {
                      code: 'service_unavailable',
                      correlationId:
                          response.headers.get('x-correlation-id') ??
                          'invalid-api-response',
                      message: 'Dictionaries are temporarily unavailable.',
                  },
        );
    }

    try {
        return options.responseSchema.parse(payload);
    } catch {
        throw new DictionaryApiError(502, {
            code: 'service_unavailable',
            correlationId: 'invalid-api-response',
            message: 'The dictionary service returned an invalid response.',
        });
    }
}

async function readJson(response: Response): Promise<unknown> {
    if (
        !(response.headers.get('content-type') ?? '').includes(
            'application/json',
        )
    ) {
        return undefined;
    }
    try {
        return await response.json();
    } catch {
        return undefined;
    }
}

function ownerRequest<TBody, TResponse>(
    accessToken: string,
    path: string,
    options: Omit<
        Parameters<typeof request<TBody, TResponse>>[1],
        'accessToken'
    >,
) {
    return request(path, { ...options, accessToken });
}

function idempotencyHeaders(idempotencyKey: string) {
    return { 'Idempotency-Key': idempotencyKey };
}

async function invalidExportResponse(response: Response): Promise<never> {
    await response.body
        ?.cancel('invalid_export_headers')
        .catch(() => undefined);
    throw new DictionaryApiError(502, {
        code: 'service_unavailable',
        correlationId: 'invalid-export-headers',
        message: 'The dictionary service returned an invalid response.',
    });
}

async function ownerStreamRequest(
    accessToken: string,
    path: string,
    signal?: AbortSignal,
): Promise<{ filename: string; response: Response }> {
    let response: Response;
    try {
        response = await fetch(`${apiUrl}${path}`, {
            cache: 'no-store',
            credentials: 'include',
            headers: {
                Accept: 'text/csv, text/plain',
                Authorization: `Bearer ${accessToken}`,
            },
            ...(signal ? { signal } : {}),
        });
    } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError')
            throw cause;
        throw new DictionaryApiError(0, {
            code: 'service_unavailable',
            correlationId: 'client-network-error',
            message: 'Dictionaries are temporarily unavailable.',
        });
    }
    if (!response.ok) {
        const payload = await readJson(response);
        const parsed = DictionaryErrorResponseSchema.safeParse(payload);
        throw new DictionaryApiError(
            response.status,
            parsed.success
                ? parsed.data.error
                : {
                      code: 'service_unavailable',
                      correlationId:
                          response.headers.get('x-correlation-id') ??
                          'invalid-api-response',
                      message: 'Dictionaries are temporarily unavailable.',
                  },
        );
    }
    const parsedHeaders = ExportDictionaryResponseHeadersSchema.safeParse({
        'cache-control': response.headers.get('cache-control'),
        'content-disposition': response.headers.get('content-disposition'),
        'content-type': response.headers.get('content-type'),
        'referrer-policy': response.headers.get('referrer-policy'),
        'x-content-type-options': response.headers.get(
            'x-content-type-options',
        ),
    });
    if (!parsedHeaders.success) return invalidExportResponse(response);
    const headers = parsedHeaders.data;
    const filename = /^attachment; filename="([A-Za-z0-9._-]+)"$/u.exec(
        headers['content-disposition'],
    )?.[1];
    if (!filename) return invalidExportResponse(response);
    return { filename, response };
}

function validatedShareCapability(shareId: string, shareKey: string) {
    const validatedHeaders = DictionaryShareKeyHeadersSchema.parse({
        'x-languon-share-key': shareKey,
    });
    return {
        headers: {
            'X-Languon-Share-Key': validatedHeaders['x-languon-share-key'],
        },
        shareId: SharedDictionaryParamsSchema.parse({ shareId }).shareId,
    };
}

export const dictionaryApi = {
    listLanguages: (signal?: AbortSignal) =>
        request('/languages', {
            responseSchema: LanguagesResponseSchema,
            signal,
        }),
    readGenerationCapabilities: (accessToken: string, signal?: AbortSignal) =>
        ownerRequest(accessToken, '/dictionary-generation-capabilities', {
            responseSchema: ReadDictionaryGenerationCapabilitiesResponseSchema,
            signal,
        }),
    listDictionaries: (
        accessToken: string,
        query: Partial<ListDictionariesQuery> = {},
        signal?: AbortSignal,
    ) =>
        ownerRequest(accessToken, `/dictionaries${queryString(query)}`, {
            responseSchema: ListDictionariesResponseSchema,
            signal,
        }),
    createDictionary: (
        accessToken: string,
        body: CreateDictionaryRequest,
        idempotencyKey: string,
        signal?: AbortSignal,
    ) =>
        ownerRequest(accessToken, '/dictionaries', {
            body,
            bodySchema: CreateDictionaryRequestSchema,
            headers: idempotencyHeaders(idempotencyKey),
            method: 'POST',
            responseSchema: DictionaryResponseSchema,
            signal,
        }),
    readDictionary: (
        accessToken: string,
        dictionaryId: string,
        signal?: AbortSignal,
    ) =>
        ownerRequest(accessToken, `/dictionaries/${dictionaryId}`, {
            responseSchema: DictionaryResponseSchema,
            signal,
        }),
    updateDictionary: (
        accessToken: string,
        dictionaryId: string,
        body: UpdateDictionaryRequest,
        signal?: AbortSignal,
    ) =>
        ownerRequest(accessToken, `/dictionaries/${dictionaryId}`, {
            body,
            bodySchema: UpdateDictionaryRequestSchema,
            method: 'PATCH',
            responseSchema: DictionaryResponseSchema,
            signal,
        }),
    setDictionaryLifecycle: (
        accessToken: string,
        dictionaryId: string,
        lifecycle: DictionaryLifecycle,
        body: DictionaryLifecycleMutationRequest,
        signal?: AbortSignal,
    ) =>
        ownerRequest(
            accessToken,
            `/dictionaries/${dictionaryId}/${lifecycle === 'archived' ? 'archive' : 'restore'}`,
            {
                body,
                bodySchema: DictionaryLifecycleMutationRequestSchema,
                method: 'POST',
                responseSchema: DictionaryResponseSchema,
                signal,
            },
        ),
    previewImport: (
        accessToken: string,
        body: PreviewDictionaryImportRequest,
        signal?: AbortSignal,
    ) =>
        ownerRequest(accessToken, '/dictionary-imports/preview', {
            body,
            bodySchema: PreviewDictionaryImportRequestSchema,
            method: 'POST',
            responseSchema: PreviewDictionaryImportResponseSchema,
            signal,
        }),
    importDictionary: (
        accessToken: string,
        body: ImportDictionaryRequest,
        idempotencyKey: string,
        signal?: AbortSignal,
    ) =>
        ownerRequest(accessToken, '/dictionary-imports', {
            body,
            bodySchema: ImportDictionaryRequestSchema,
            headers: idempotencyHeaders(idempotencyKey),
            method: 'POST',
            responseSchema: ImportDictionaryResponseSchema,
            signal,
        }),
    exportDictionary: (
        accessToken: string,
        dictionaryId: string,
        format: DictionaryExportFormat,
        signal?: AbortSignal,
    ) => {
        const query = ExportDictionaryQuerySchema.parse({ format });
        return ownerStreamRequest(
            accessToken,
            `/dictionaries/${dictionaryId}/export${queryString(query)}`,
            signal,
        );
    },
    listCards: (
        accessToken: string,
        dictionaryId: string,
        query: Partial<ListDictionaryCardsQuery> = {},
        signal?: AbortSignal,
    ) =>
        ownerRequest(
            accessToken,
            `/dictionaries/${dictionaryId}/cards${queryString(query)}`,
            { responseSchema: ListDictionaryCardsResponseSchema, signal },
        ),
    readCard: (
        accessToken: string,
        dictionaryId: string,
        cardId: string,
        signal?: AbortSignal,
    ) =>
        ownerRequest(
            accessToken,
            `/dictionaries/${dictionaryId}/cards/${cardId}`,
            { responseSchema: DictionaryCardResponseSchema, signal },
        ),
    createCard: (
        accessToken: string,
        dictionaryId: string,
        body: CreateDictionaryCardRequest,
        signal?: AbortSignal,
    ) =>
        ownerRequest(accessToken, `/dictionaries/${dictionaryId}/cards`, {
            body,
            bodySchema: CreateDictionaryCardRequestSchema,
            method: 'POST',
            responseSchema: DictionaryCardResponseSchema,
            signal,
        }),
    updateCard: (
        accessToken: string,
        dictionaryId: string,
        cardId: string,
        body: UpdateDictionaryCardRequest,
        signal?: AbortSignal,
    ) =>
        ownerRequest(
            accessToken,
            `/dictionaries/${dictionaryId}/cards/${cardId}`,
            {
                body,
                bodySchema: UpdateDictionaryCardRequestSchema,
                method: 'PATCH',
                responseSchema: DictionaryCardResponseSchema,
                signal,
            },
        ),
    setCardLifecycle: (
        accessToken: string,
        dictionaryId: string,
        cardId: string,
        lifecycle: DictionaryLifecycle,
        body: DictionaryCardLifecycleMutationRequest,
        signal?: AbortSignal,
    ) =>
        ownerRequest(
            accessToken,
            `/dictionaries/${dictionaryId}/cards/${cardId}/${lifecycle === 'archived' ? 'archive' : 'restore'}`,
            {
                body,
                bodySchema: DictionaryCardLifecycleMutationRequestSchema,
                method: 'POST',
                responseSchema: DictionaryCardResponseSchema,
                signal,
            },
        ),
    reorderCards: (
        accessToken: string,
        dictionaryId: string,
        body: ReorderDictionaryCardsRequest,
        signal?: AbortSignal,
    ) =>
        ownerRequest(
            accessToken,
            `/dictionaries/${dictionaryId}/cards/reorder`,
            {
                body,
                bodySchema: ReorderDictionaryCardsRequestSchema,
                method: 'POST',
                responseSchema: ReorderDictionaryCardsResponseSchema,
                signal,
            },
        ),
    rotateShareKey: (
        accessToken: string,
        dictionaryId: string,
        body: RotateDictionaryShareKeyRequest,
        signal?: AbortSignal,
    ) =>
        ownerRequest(
            accessToken,
            `/dictionaries/${dictionaryId}/share-key/rotate`,
            {
                body,
                bodySchema: RotateDictionaryShareKeyRequestSchema,
                method: 'POST',
                responseSchema: RotateDictionaryShareKeyResponseSchema,
                signal,
            },
        ),
    readSharedDictionary: (
        shareId: string,
        shareKey: string,
        query: Partial<ListSharedDictionaryQuery> = {},
        signal?: AbortSignal,
    ) => {
        const capability = validatedShareCapability(shareId, shareKey);
        const validatedQuery =
            ListSharedDictionaryQuerySchema.partial().parse(query);
        return request(
            `/shared/dictionaries/${capability.shareId}${queryString(validatedQuery)}`,
            {
                headers: capability.headers,
                responseSchema: SharedDictionaryResponseSchema,
                signal,
            },
        );
    },
    forkSharedDictionary: (
        accessToken: string,
        shareId: string,
        shareKey: string,
        body: ForkSharedDictionaryRequest,
        idempotencyKey: string,
        signal?: AbortSignal,
    ) => {
        const capability = validatedShareCapability(shareId, shareKey);
        return ownerRequest(
            accessToken,
            `/shared/dictionaries/${capability.shareId}/fork`,
            {
                body,
                bodySchema: ForkSharedDictionaryRequestSchema,
                headers: {
                    ...capability.headers,
                    ...idempotencyHeaders(idempotencyKey),
                },
                method: 'POST',
                responseSchema: ForkSharedDictionaryResponseSchema,
                signal,
            },
        );
    },
    enqueueCardGeneration: (
        accessToken: string,
        dictionaryId: string,
        cardId: string,
        body: EnqueueDictionaryCardGenerationRequest,
        idempotencyKey: string,
        signal?: AbortSignal,
    ) =>
        ownerRequest(
            accessToken,
            `/dictionaries/${dictionaryId}/cards/${cardId}/generations`,
            {
                body,
                bodySchema: EnqueueDictionaryCardGenerationRequestSchema,
                headers: idempotencyHeaders(idempotencyKey),
                method: 'POST',
                responseSchema: EnqueueDictionaryCardGenerationResponseSchema,
                signal,
            },
        ),
    enqueueCardAuthoringGeneration: (
        accessToken: string,
        dictionaryId: string,
        body: EnqueueDictionaryCardAuthoringGenerationRequest,
        idempotencyKey: string,
        signal?: AbortSignal,
    ) =>
        ownerRequest(
            accessToken,
            `/dictionaries/${dictionaryId}/card-authoring-generations`,
            {
                body,
                bodySchema:
                    EnqueueDictionaryCardAuthoringGenerationRequestSchema,
                headers: idempotencyHeaders(idempotencyKey),
                method: 'POST',
                responseSchema:
                    EnqueueDictionaryCardAuthoringGenerationResponseSchema,
                signal,
            },
        ),
    enqueuePastedTermsGeneration: (
        accessToken: string,
        dictionaryId: string,
        body: EnqueueDictionaryPastedTermsGenerationRequest,
        idempotencyKey: string,
        signal?: AbortSignal,
    ) =>
        ownerRequest(
            accessToken,
            `/dictionaries/${dictionaryId}/batch-generations`,
            {
                body,
                bodySchema: EnqueueDictionaryPastedTermsGenerationRequestSchema,
                headers: idempotencyHeaders(idempotencyKey),
                method: 'POST',
                responseSchema:
                    EnqueueDictionaryPastedTermsGenerationResponseSchema,
                signal,
            },
        ),
    retryPastedTermsGeneration: (
        accessToken: string,
        jobId: string,
        body: RetryDictionaryPastedTermsGenerationRequest,
        idempotencyKey: string,
        signal?: AbortSignal,
    ) => {
        const parsed = DictionaryGenerationJobIdParamsSchema.parse({ jobId });
        return ownerRequest(
            accessToken,
            `/dictionary-generation-jobs/${parsed.jobId}/retry-pasted-terms`,
            {
                body,
                bodySchema: RetryDictionaryPastedTermsGenerationRequestSchema,
                headers: idempotencyHeaders(idempotencyKey),
                method: 'POST',
                responseSchema:
                    RetryDictionaryPastedTermsGenerationResponseSchema,
                signal,
            },
        );
    },
    retryDocumentTermsGeneration: (
        accessToken: string,
        jobId: string,
        body: RetryDictionaryDocumentTermsGenerationRequest,
        idempotencyKey: string,
        signal?: AbortSignal,
    ) => {
        const parsed = DictionaryGenerationJobIdParamsSchema.parse({ jobId });
        return ownerRequest(
            accessToken,
            `/dictionary-generation-jobs/${parsed.jobId}/retry-document-terms`,
            {
                body,
                bodySchema: RetryDictionaryDocumentTermsGenerationRequestSchema,
                headers: idempotencyHeaders(idempotencyKey),
                method: 'POST',
                responseSchema:
                    RetryDictionaryDocumentTermsGenerationResponseSchema,
                signal,
            },
        );
    },
    retryImportPairsGeneration: (
        accessToken: string,
        jobId: string,
        body: RetryDictionaryImportPairsGenerationRequest,
        idempotencyKey: string,
        signal?: AbortSignal,
    ) => {
        const parsed = DictionaryGenerationJobIdParamsSchema.parse({ jobId });
        return ownerRequest(
            accessToken,
            `/dictionary-generation-jobs/${parsed.jobId}/retry-import-pairs`,
            {
                body,
                bodySchema: RetryDictionaryImportPairsGenerationRequestSchema,
                headers: idempotencyHeaders(idempotencyKey),
                method: 'POST',
                responseSchema:
                    RetryDictionaryImportPairsGenerationResponseSchema,
                signal,
            },
        );
    },
    regenerateCardAuthoringGeneration: (
        accessToken: string,
        jobId: string,
        body: RegenerateDictionaryCardAuthoringGenerationRequest,
        idempotencyKey: string,
        signal?: AbortSignal,
    ) => {
        const parsed = DictionaryGenerationJobIdParamsSchema.parse({ jobId });
        return ownerRequest(
            accessToken,
            `/dictionary-generation-jobs/${parsed.jobId}/regenerate-card-authoring`,
            {
                body,
                bodySchema:
                    RegenerateDictionaryCardAuthoringGenerationRequestSchema,
                headers: idempotencyHeaders(idempotencyKey),
                method: 'POST',
                responseSchema:
                    RegenerateDictionaryCardAuthoringGenerationResponseSchema,
                signal,
            },
        );
    },
    createDocumentUpload: (
        accessToken: string,
        dictionaryId: string,
        body: CreateDictionaryDocumentUploadRequest,
        idempotencyKey: string,
        signal?: AbortSignal,
    ) =>
        ownerRequest(
            accessToken,
            `/dictionaries/${dictionaryId}/document-uploads`,
            {
                body,
                bodySchema: CreateDictionaryDocumentUploadRequestSchema,
                headers: idempotencyHeaders(idempotencyKey),
                method: 'POST',
                responseSchema: CreateDictionaryDocumentUploadResponseSchema,
                signal,
            },
        ),
    uploadDocument: async (
        upload: CreateDictionaryDocumentUploadResponse['upload'],
        file: Blob,
        signal?: AbortSignal,
    ) => {
        let response: Response;
        try {
            const bytes = await file.arrayBuffer();
            response = await fetch(upload.url, {
                body: bytes,
                headers: upload.requiredHeaders,
                method: upload.method,
                ...(signal ? { signal } : {}),
            });
        } catch (cause) {
            if (cause instanceof DOMException && cause.name === 'AbortError') {
                throw cause;
            }
            // The create-only PUT may have committed even when its response was
            // lost or hidden by CORS. Let the owner-authenticated completion
            // endpoint reconcile the sole exact immutable version.
            return {};
        }
        if (!response.ok && response.status !== 412) {
            throw new DictionaryDocumentUploadError(
                'The document upload could not be completed.',
            );
        }
        const versionId = response.headers.get('x-amz-version-id')?.trim();
        return versionId ? { versionId } : {};
    },
    completeDocumentUpload: (
        accessToken: string,
        uploadId: string,
        body: CompleteDictionaryDocumentUploadRequest,
        signal?: AbortSignal,
    ) => {
        const parsed = DictionaryDocumentUploadIdParamsSchema.parse({
            uploadId,
        });
        return ownerRequest(
            accessToken,
            `/dictionary-document-uploads/${parsed.uploadId}/complete`,
            {
                body,
                bodySchema: CompleteDictionaryDocumentUploadRequestSchema,
                method: 'POST',
                responseSchema: CompleteDictionaryDocumentUploadResponseSchema,
                signal,
            },
        );
    },
    readLatestCardGeneration: (
        accessToken: string,
        dictionaryId: string,
        cardId: string,
        signal?: AbortSignal,
    ) =>
        ownerRequest(
            accessToken,
            `/dictionaries/${dictionaryId}/cards/${cardId}/generations/latest`,
            {
                responseSchema:
                    ReadLatestDictionaryCardGenerationResponseSchema,
                signal,
            },
        ),
    readGenerationJob: (
        accessToken: string,
        jobId: string,
        signal?: AbortSignal,
    ) => {
        const parsed = DictionaryGenerationJobIdParamsSchema.parse({ jobId });
        return ownerRequest(
            accessToken,
            `/dictionary-generation-jobs/${parsed.jobId}`,
            { responseSchema: DictionaryGenerationJobResponseSchema, signal },
        );
    },
    cancelGenerationJob: (
        accessToken: string,
        jobId: string,
        body: CancelDictionaryGenerationJobRequest = {},
        signal?: AbortSignal,
    ) =>
        generationJobAction(
            accessToken,
            jobId,
            'cancel',
            body,
            CancelDictionaryGenerationJobRequestSchema,
            CancelDictionaryGenerationJobResponseSchema,
            signal,
        ),
    discardGenerationJob: (
        accessToken: string,
        jobId: string,
        body: DiscardDictionaryGenerationJobRequest = {},
        signal?: AbortSignal,
    ) =>
        generationJobAction(
            accessToken,
            jobId,
            'discard',
            body,
            DiscardDictionaryGenerationJobRequestSchema,
            DiscardDictionaryGenerationJobResponseSchema,
            signal,
        ),
    acceptGenerationJob: (
        accessToken: string,
        jobId: string,
        body: AcceptDictionaryGenerationJobRequest,
        signal?: AbortSignal,
    ) =>
        generationJobAction(
            accessToken,
            jobId,
            'accept',
            body,
            AcceptDictionaryGenerationJobRequestSchema,
            AcceptDictionaryGenerationJobResponseSchema,
            signal,
        ),
    regenerateGenerationJob: (
        accessToken: string,
        jobId: string,
        body: RegenerateDictionaryGenerationJobRequest,
        idempotencyKey: string,
        signal?: AbortSignal,
    ) => {
        const parsed = DictionaryGenerationJobIdParamsSchema.parse({ jobId });
        return ownerRequest(
            accessToken,
            `/dictionary-generation-jobs/${parsed.jobId}/regenerate`,
            {
                body,
                bodySchema: RegenerateDictionaryGenerationJobRequestSchema,
                headers: idempotencyHeaders(idempotencyKey),
                method: 'POST',
                responseSchema: RegenerateDictionaryGenerationJobResponseSchema,
                signal,
            },
        );
    },
};

function generationJobAction<TBody, TResponse>(
    accessToken: string,
    jobId: string,
    action: 'accept' | 'cancel' | 'discard',
    body: TBody,
    bodySchema: { parse(value: unknown): TBody },
    responseSchema: ResponseSchema<TResponse>,
    signal?: AbortSignal,
) {
    const parsed = DictionaryGenerationJobIdParamsSchema.parse({ jobId });
    return ownerRequest(
        accessToken,
        `/dictionary-generation-jobs/${parsed.jobId}/${action}`,
        {
            body,
            bodySchema,
            method: 'POST',
            responseSchema,
            signal,
        },
    );
}

export type DictionaryApi = typeof dictionaryApi;
